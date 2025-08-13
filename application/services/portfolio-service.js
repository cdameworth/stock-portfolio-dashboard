'use strict';

const { Pool } = require('pg');

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
      idleTimeoutMillis: 30000
    }) : null;
    this.ready = false;
  }

  async init() {
    if (!this.pool || this.ready) return;
    try {
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
      this.ready = true;
    } catch {
      // fallback to in-memory if DB init fails
      await this.close();
      this.pool = null;
    }
  }

  async getUserPortfolios(userId) {
    await this.init();
    if (!this.pool) {
      return this.inMemory.portfolios[userId] || [];
    }
    const { rows } = await this.pool.query(
      'SELECT id, user_id, name, description, symbols, created_at FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  async createPortfolio(userId, { name, description, symbols = [] }) {
    await this.init();
    if (!this.pool) {
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
      return item;
    }
    const { rows } = await this.pool.query(
      'INSERT INTO portfolios (user_id, name, description, symbols) VALUES ($1, $2, $3, $4) RETURNING id, user_id, name, description, symbols, created_at',
      [userId, name, description, symbols]
    );
    return rows[0];
  }

  async getPortfolioAnalysis(userId, portfolioId) {
    // Minimal placeholder analysis
    const portfolios = await this.getUserPortfolios(userId);
    const p = portfolios.find(x => String(x.id) === String(portfolioId));
    if (!p) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }
    return {
      portfolio_id: String(p.id),
      symbols: p.symbols || [],
      metrics: {
        total_positions: (p.symbols || []).length,
        estimated_value: (p.symbols || []).length * 100, // demo
        risk_score: 0.5
      },
      generated_at: new Date().toISOString()
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }
}

module.exports = PortfolioService;