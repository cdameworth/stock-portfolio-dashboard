'use strict';

const { Pool } = require('pg');
const {
  tracePortfolioOperation,
  traceFinancialCalculation,
  traceDbOperation,
  addSpanAttributes,
  recordSpanEvent
} = require('../otel-helpers');
const { businessMetrics } = require('../business-metrics');

class PortfolioService {
  constructor({ dbConfig } = {}) {
    this.inMemory = { portfolios: {} }; // { userId: [{ id, name, description, symbols, createdAt }] }
    this.pool = dbConfig ? new Pool({
      host: dbConfig.host,
      port: Number(dbConfig.port || 5432),
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: 5,
      idleTimeoutMillis: 30000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    }) : null;
    this.ready = false;
  }

  async init() {
    if (!this.pool || this.ready) return;
    try {
      console.log('Portfolio service initializing database connection...');
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS portfolios (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          symbols TEXT[] DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

      // Also create positions table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS portfolio_positions (
          id SERIAL PRIMARY KEY,
          portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          shares DECIMAL NOT NULL,
          purchase_price DECIMAL NOT NULL,
          purchase_date TIMESTAMPTZ DEFAULT now(),
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

      console.log('Portfolio service database initialization successful');
      this.ready = true;
    } catch (error) {
      console.error('Portfolio service database initialization failed:', error.message);
      console.log('Portfolio service falling back to in-memory storage for user', this.currentUserId || 'unknown');
      // fallback to in-memory if DB init fails
      await this.close();
      this.pool = null;
    }
  }

  async getUserPortfolios(userId) {
    return tracePortfolioOperation('get_user_portfolios', 'all', { userId }, async () => {
      await this.init();

      if (!this.pool) {
        console.log(`Portfolio service using in-memory storage for user ${userId}`);
        addSpanAttributes({ 'storage.type': 'in_memory' });
        return this.inMemory.portfolios[userId] || [];
      }

      return traceDbOperation('select', 'portfolios', async () => {
        const { rows } = await this.pool.query(
          'SELECT id, user_id, name, description, symbols, created_at FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC',
          [userId]
        );

        addSpanAttributes({
          'storage.type': 'database',
          'portfolio.count': rows.length,
          'db.rows_affected': rows.length
        });

        return rows;
      });
    });
  }

  async createPortfolio(userId, { name, description, symbols = [] }) {
    return tracePortfolioOperation('create_portfolio', 'new', { userId, symbolCount: symbols.length }, async () => {
      await this.init();

      if (!this.pool) {
        addSpanAttributes({ 'storage.type': 'in_memory' });
        const list = this.inMemory.portfolios[userId] || [];
        const item = {
          id: String(Date.now()),
          user_id: userId,
          name,
          description,
          symbols,
          created_at: new Date().toISOString()
        };
        this.inMemory.portfolios[userId] = [item, ...list];
        recordSpanEvent('portfolio.created', {
          'portfolio.name': name,
          'portfolio.symbol_count': symbols.length
        });
        return item;
      }

      return traceDbOperation('insert', 'portfolios', async () => {
        const { rows } = await this.pool.query(
          'INSERT INTO portfolios (user_id, name, description, symbols) VALUES ($1, $2, $3, $4) RETURNING id, user_id, name, description, symbols, created_at',
          [userId, name, description, symbols]
        );

        const portfolio = rows[0];
        addSpanAttributes({
          'storage.type': 'database',
          'portfolio.name': name,
          'portfolio.symbol_count': symbols.length,
          'portfolio.id': portfolio.id
        });

        recordSpanEvent('portfolio.created', {
          'portfolio.id': portfolio.id,
          'portfolio.name': name
        });

        return portfolio;
      });
    });
  }

  async updatePortfolio(userId, portfolioId, { name, description, symbols = [] }) {
    await this.init();
    if (!this.pool) {
      const list = this.inMemory.portfolios[userId] || [];
      const index = list.findIndex(p => String(p.id) === String(portfolioId));
      if (index === -1) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }
      list[index] = { ...list[index], name, description, symbols };
      return list[index];
    }
    const { rows } = await this.pool.query(
      'UPDATE portfolios SET name = $1, description = $2, symbols = $3 WHERE user_id = $4 AND id = $5 RETURNING id, user_id, name, description, symbols, created_at',
      [name, description, symbols, userId, portfolioId]
    );
    if (rows.length === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }
    return rows[0];
  }

  async deletePortfolio(userId, portfolioId) {
    await this.init();
    if (!this.pool) {
      const list = this.inMemory.portfolios[userId] || [];
      const index = list.findIndex(p => String(p.id) === String(portfolioId));
      if (index === -1) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }
      this.inMemory.portfolios[userId] = list.filter((_, i) => i !== index);
      return true;
    }
    const { rowCount } = await this.pool.query(
      'DELETE FROM portfolios WHERE user_id = $1 AND id = $2',
      [userId, portfolioId]
    );
    if (rowCount === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }
    return true;
  }

  async getPortfolioAnalysis(userId, portfolioId) {
    return traceFinancialCalculation('portfolio_analysis', {
      'portfolio.id': portfolioId,
      'portfolio.user_id': userId,
      'calculation.complexity': 'basic'
    }, async () => {
      recordSpanEvent('analysis.started', { portfolioId });

      // Get portfolio data
      const portfolios = await this.getUserPortfolios(userId);
      const p = portfolios.find(x => String(x.id) === String(portfolioId));

      if (!p) {
        recordSpanEvent('analysis.error', { reason: 'portfolio_not_found' });
        throw new Error(`Portfolio ${portfolioId} not found`);
      }

      const symbols = p.symbols || [];
      addSpanAttributes({
        'portfolio.symbols': symbols.join(','),
        'portfolio.position_count': symbols.length,
        'portfolio.name': p.name
      });

      // Perform financial calculations
      const metrics = {
        total_positions: symbols.length,
        estimated_value: symbols.length * 100, // demo calculation
        risk_score: 0.5
      };

      recordSpanEvent('analysis.completed', {
        'metrics.total_positions': metrics.total_positions,
        'metrics.estimated_value': metrics.estimated_value,
        'metrics.risk_score': metrics.risk_score
      });

      addSpanAttributes({
        'financial.estimated_value': metrics.estimated_value,
        'financial.risk_score': metrics.risk_score
      });

      return {
        portfolio_id: String(p.id),
        symbols: symbols,
        metrics: metrics,
        generated_at: new Date().toISOString()
      };
    });
  }

  async addPosition(userId, portfolioId, { symbol, shares }) {
    await this.init();

    if (!symbol || !shares) {
      throw new Error('Symbol and shares are required');
    }

    // Handle special case for 'default' portfolio
    if (portfolioId === 'default') {
      // Try to find an existing portfolio or create one
      const portfolios = await this.getUserPortfolios(userId);
      if (portfolios.length === 0) {
        // Create a default portfolio
        await this.createPortfolio(userId, { name: 'Main Portfolio', description: 'Default portfolio', symbols: [] });
        const newPortfolios = await this.getUserPortfolios(userId);
        portfolioId = newPortfolios[0].id;
      } else {
        portfolioId = portfolios[0].id;
      }
    }

    if (!this.pool) {
      // In-memory storage
      const list = this.inMemory.portfolios[userId] || [];
      const portfolio = list.find(p => String(p.id) === String(portfolioId));
      if (!portfolio) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }
      
      // Add symbol to the portfolio's symbols array if not already present
      if (!portfolio.symbols.includes(symbol)) {
        portfolio.symbols.push(symbol);
      }
      
      return {
        symbol,
        shares,
        portfolioId: String(portfolioId)
      };
    }

    // Check if portfolio exists and belongs to user
    const { rows: portfolios } = await this.pool.query(
      'SELECT id, symbols FROM portfolios WHERE user_id = $1 AND id = $2',
      [userId, portfolioId]
    );
    
    if (portfolios.length === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }
    
    const portfolio = portfolios[0];
    const currentSymbols = portfolio.symbols || [];
    
    // Add symbol if not already present
    if (!currentSymbols.includes(symbol)) {
      const updatedSymbols = [...currentSymbols, symbol];
      await this.pool.query(
        'UPDATE portfolios SET symbols = $1 WHERE id = $2',
        [updatedSymbols, portfolioId]
      );
    }
    
    // Track business metrics for portfolio transaction
    businessMetrics.trackPortfolioMetrics(portfolioId, {
      value: 0, // Would be calculated based on current prices
      positions: (portfolio.symbols || []).length + 1,
      dailyChange: 0,
      dailyChangePercent: 0,
      transactions: 1,
      transactionType: 'position_add'
    });

    return {
      symbol,
      shares,
      portfolioId: String(portfolioId)
    };
  }

  async getPortfolioPositions(userId, portfolioId) {
    await this.init();

    // Handle special case for 'default' portfolio
    if (portfolioId === 'default') {
      // Try to find an existing portfolio or create one
      const portfolios = await this.getUserPortfolios(userId);
      if (portfolios.length === 0) {
        // Create a default portfolio
        await this.createPortfolio(userId, { name: 'Main Portfolio', description: 'Default portfolio', symbols: [] });
        const newPortfolios = await this.getUserPortfolios(userId);
        portfolioId = newPortfolios[0].id;
      } else {
        portfolioId = portfolios[0].id;
      }
    }

    let portfolio;
    let symbols = [];

    if (!this.pool) {
      // In-memory storage fallback
      console.log(`Portfolio service using in-memory storage for user ${userId}, portfolioId ${portfolioId}`);
      const list = this.inMemory.portfolios[userId] || [];
      console.log(`In-memory portfolios for user ${userId}:`, list.map(p => ({id: p.id, name: p.name})));
      portfolio = list.find(p => String(p.id) === String(portfolioId));
      if (!portfolio) {
        // Try to fallback to a default portfolio behavior for better user experience
        console.log(`Portfolio ${portfolioId} not found in memory, creating empty response`);
        return []; // Return empty positions instead of throwing error
      }
      symbols = portfolio.symbols || [];
    } else {
      // Database storage
      try {
        const result = await this.pool.query(
          'SELECT id, symbols FROM portfolios WHERE user_id = $1 AND id = $2',
          [userId, portfolioId]
        );
        const portfolios = result.rows;

        if (portfolios.length === 0) {
          console.log(`Portfolio ${portfolioId} not found in database for user ${userId}`);
          // Return empty positions instead of throwing error for better UX
          return [];
        }
        portfolio = portfolios[0];
        symbols = portfolio.symbols || [];
      } catch (dbError) {
        console.error(`Database error in getPortfolioPositions:`, dbError.message);
        // Fallback to empty positions instead of crashing
        return [];
      }
    }

    if (symbols.length === 0) {
      return [];
    }

    // Get real-time stock prices for all symbols
    const stockService = require('./stock-service');
    const positions = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          // Get current stock price
          const stockData = await stockService.getRealTimePrice(symbol);
          const currentPrice = stockData.price || 0;

          // Use fixed shares for now - in a real app this would be stored per position
          const shares = 100;
          const marketValue = currentPrice * shares;

          // Calculate mock purchase price and gains (would be stored in real app)
          const purchasePrice = currentPrice * (0.9 + Math.random() * 0.2); // +/- 10% from current
          const totalGainLoss = (currentPrice - purchasePrice) * shares;
          const dailyChange = currentPrice * (Math.random() * 0.06 - 0.03); // +/- 3% daily change

          return {
            id: symbol,
            symbol: symbol,
            companyName: `${symbol} Corporation`, // Would fetch from company data API
            shares: shares,
            currentPrice: currentPrice,
            marketValue: marketValue,
            dailyChange: dailyChange,
            totalGainLoss: totalGainLoss,
            purchasePrice: purchasePrice,
            updated: stockData.updated || false,
            source: stockData.source || 'unknown'
          };
        } catch (error) {
          console.error(`Failed to get price for ${symbol}:`, error.message);
          // Return fallback data for this position
          return {
            id: symbol,
            symbol: symbol,
            companyName: `${symbol} Corporation`,
            shares: 100,
            currentPrice: 0,
            marketValue: 0,
            dailyChange: 0,
            totalGainLoss: 0,
            purchasePrice: 0,
            updated: false,
            source: 'error'
          };
        }
      })
    );

    return positions;
  }

  async removePosition(userId, portfolioId, symbol) {
    await this.init();

    // Handle special case for 'default' portfolio
    if (portfolioId === 'default') {
      const portfolios = await this.getUserPortfolios(userId);
      if (portfolios.length > 0) {
        portfolioId = portfolios[0].id;
      }
    }

    if (!this.pool) {
      // In-memory storage
      const list = this.inMemory.portfolios[userId] || [];
      const portfolio = list.find(p => String(p.id) === String(portfolioId));
      if (!portfolio) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }

      // Remove symbol from the portfolio's symbols array
      portfolio.symbols = portfolio.symbols.filter(s => s !== symbol);

      return {
        symbol,
        portfolioId: String(portfolioId),
        removed: true
      };
    }

    // Database storage
    const { rows: portfolios } = await this.pool.query(
      'SELECT id, symbols FROM portfolios WHERE user_id = $1 AND id = $2',
      [userId, portfolioId]
    );

    if (portfolios.length === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const portfolio = portfolios[0];
    const currentSymbols = portfolio.symbols || [];

    // Remove symbol if present
    const updatedSymbols = currentSymbols.filter(s => s !== symbol);

    await this.pool.query(
      'UPDATE portfolios SET symbols = $1 WHERE id = $2',
      [updatedSymbols, portfolioId]
    );

    return {
      symbol,
      portfolioId: String(portfolioId),
      removed: true
    };
  }

  async updatePosition(userId, portfolioId, symbol, { shares }) {
    await this.init();

    // Handle special case for 'default' portfolio
    if (portfolioId === 'default') {
      const portfolios = await this.getUserPortfolios(userId);
      if (portfolios.length > 0) {
        portfolioId = portfolios[0].id;
      }
    }

    // For now, we'll just validate the position exists since we don't store shares
    // In a real app, this would update the shares in a positions table
    if (!this.pool) {
      // In-memory storage
      const list = this.inMemory.portfolios[userId] || [];
      const portfolio = list.find(p => String(p.id) === String(portfolioId));
      if (!portfolio) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }

      if (!portfolio.symbols.includes(symbol)) {
        throw new Error(`Position ${symbol} not found in portfolio`);
      }

      return {
        symbol,
        shares,
        portfolioId: String(portfolioId),
        updated: true
      };
    }

    // Database storage
    const { rows: portfolios } = await this.pool.query(
      'SELECT id, symbols FROM portfolios WHERE user_id = $1 AND id = $2',
      [userId, portfolioId]
    );

    if (portfolios.length === 0) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const portfolio = portfolios[0];
    const currentSymbols = portfolio.symbols || [];

    if (!currentSymbols.includes(symbol)) {
      throw new Error(`Position ${symbol} not found in portfolio`);
    }

    // Note: In a real app with a positions table, we'd update shares here
    // For now, just return success since shares are hardcoded

    return {
      symbol,
      shares,
      portfolioId: String(portfolioId),
      updated: true
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }
}

module.exports = PortfolioService;