/**
 * Improved Database Service
 * Extends BaseService for standardized error handling and logging
 * Provides database operations for recommendations and performance tracking
 */

'use strict';

const BaseService = require('./base-service');

class ImprovedDatabaseService extends BaseService {
  constructor(config = {}) {
    super('database-service', { dbConfig: config });
    
    // Input validation schemas
    this.schemas = {
      saveRecommendation: {
        recommendation_id: { required: true, type: 'string' },
        symbol: { required: true, type: 'string' },
        recommendation_type: { 
          required: true, 
          type: 'string',
          validate: (type) => ['BUY', 'SELL', 'HOLD'].includes(type)
        },
        current_price: { required: true, type: 'number' },
        target_price: { required: true, type: 'number' }
      },
      getRecommendations: {
        limit: { 
          required: false, 
          type: 'number',
          validate: (limit) => limit > 0 && limit <= 1000
        },
        symbol: { required: false, type: 'string' },
        type: { 
          required: false, 
          type: 'string',
          validate: (type) => ['BUY', 'SELL', 'HOLD'].includes(type)
        }
      }
    };
  }

  /**
   * Initialize database connection and create tables
   */
  async connect() {
    return this.executeOperation(async () => {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Create tables if they don't exist
      await this.createTables();

      return { connected: true, timestamp: new Date().toISOString() };
    }, 'connect');
  }

  /**
   * Create database tables if they don't exist
   */
  async createTables() {
    const tables = [
      {
        name: 'recommendations',
        query: `
          CREATE TABLE IF NOT EXISTS recommendations (
            id SERIAL PRIMARY KEY,
            recommendation_id VARCHAR(255) UNIQUE NOT NULL,
            symbol VARCHAR(10) NOT NULL,
            company_name VARCHAR(255),
            recommendation_type VARCHAR(10) NOT NULL CHECK (recommendation_type IN ('BUY', 'SELL', 'HOLD')),
            prediction_score DECIMAL(5,4),
            confidence DECIMAL(5,4),
            current_price DECIMAL(10,2) NOT NULL,
            target_price DECIMAL(10,2) NOT NULL,
            stop_loss_price DECIMAL(10,2),
            risk_level VARCHAR(10) DEFAULT 'MEDIUM' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
            rationale TEXT,
            estimated_hit_days INTEGER,
            estimated_hit_date DATE,
            source VARCHAR(50) DEFAULT 'stock-analytics-api',
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
          )
        `
      },
      {
        name: 'recommendation_outcomes',
        query: `
          CREATE TABLE IF NOT EXISTS recommendation_outcomes (
            id SERIAL PRIMARY KEY,
            recommendation_id VARCHAR(255) NOT NULL,
            outcome_date DATE NOT NULL,
            actual_price DECIMAL(10,2) NOT NULL,
            hit_target BOOLEAN DEFAULT FALSE,
            days_to_outcome INTEGER,
            gain_loss_percent DECIMAL(8,4),
            created_at TIMESTAMPTZ DEFAULT now(),
            FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id)
          )
        `
      },
      {
        name: 'performance_metrics',
        query: `
          CREATE TABLE IF NOT EXISTS performance_metrics (
            id SERIAL PRIMARY KEY,
            period VARCHAR(10) NOT NULL,
            metric_date DATE NOT NULL,
            total_recommendations INTEGER DEFAULT 0,
            successful_recommendations INTEGER DEFAULT 0,
            failed_recommendations INTEGER DEFAULT 0,
            success_rate DECIMAL(5,2) DEFAULT 0,
            average_gain DECIMAL(8,4) DEFAULT 0,
            average_days_to_hit INTEGER DEFAULT 0,
            high_confidence_accuracy DECIMAL(5,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(period, metric_date)
          )
        `
      },
      {
        name: 'hit_time_accuracy',
        query: `
          CREATE TABLE IF NOT EXISTS hit_time_accuracy (
            id SERIAL PRIMARY KEY,
            recommendation_id VARCHAR(255) NOT NULL,
            estimated_days INTEGER NOT NULL,
            actual_days INTEGER NOT NULL,
            days_difference INTEGER NOT NULL,
            accuracy_score DECIMAL(5,4) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id)
          )
        `
      }
    ];

    for (const table of tables) {
      try {
        await this.executeQuery(table.query, [], `create_table_${table.name}`);
        this.logger.info(`✓ Table ${table.name} ready`);
      } catch (error) {
        this.logger.error(`Failed to create table ${table.name}:`, error);
        throw error;
      }
    }
  }

  /**
   * Save a new recommendation to the database
   */
  async saveRecommendation(recommendation) {
    return this.executeOperation(async () => {
      // Validate input
      this.validateInput(recommendation, this.schemas.saveRecommendation, 'saveRecommendation');

      // Calculate estimated hit date
      const estimatedHitDays = this.calculateEstimatedHitDays(recommendation);
      const estimatedHitDate = new Date();
      estimatedHitDate.setDate(estimatedHitDate.getDate() + estimatedHitDays);

      const query = `
        INSERT INTO recommendations (
          recommendation_id, symbol, company_name, recommendation_type,
          prediction_score, confidence, current_price, target_price,
          stop_loss_price, risk_level, rationale, estimated_hit_days,
          estimated_hit_date, source, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (recommendation_id) 
        DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP,
          target_price = EXCLUDED.target_price,
          confidence = EXCLUDED.confidence
        RETURNING *
      `;

      const values = [
        recommendation.recommendation_id,
        recommendation.symbol,
        recommendation.company_name || null,
        recommendation.recommendation_type,
        recommendation.prediction_score || null,
        recommendation.confidence || null,
        recommendation.current_price,
        recommendation.target_price,
        recommendation.stop_loss_price || recommendation.current_price * 0.95,
        recommendation.risk_level || 'MEDIUM',
        recommendation.rationale || null,
        estimatedHitDays,
        estimatedHitDate.toISOString().split('T')[0],
        recommendation.source || 'stock-analytics-api',
        JSON.stringify(recommendation.metadata || {})
      ];

      const result = await this.executeQuery(query, values, 'saveRecommendation');
      return result.rows[0];
    }, 'saveRecommendation', { symbol: recommendation.symbol });
  }

  /**
   * Calculate estimated hit days based on recommendation type and risk level
   */
  calculateEstimatedHitDays(recommendation) {
    const baseEstimates = {
      'BUY': 30,   // 30 days for buy recommendations
      'SELL': 14,  // 14 days for sell recommendations  
      'HOLD': 60   // 60 days for hold recommendations
    };

    const riskMultiplier = {
      'LOW': 1.5,    // Conservative estimates take longer
      'MEDIUM': 1.0, // Base estimate
      'HIGH': 0.7    // Aggressive estimates happen faster
    };

    const baseDays = baseEstimates[recommendation.recommendation_type] || 30;
    const multiplier = riskMultiplier[recommendation.risk_level] || 1.0;
    
    return Math.floor(baseDays * multiplier);
  }

  /**
   * Batch save multiple recommendations
   */
  async saveRecommendations(recommendations) {
    return this.executeOperation(async () => {
      const results = [];
      const errors = [];

      for (const recommendation of recommendations) {
        try {
          const result = await this.saveRecommendation(recommendation);
          if (result.success) {
            results.push(result.data);
          } else {
            errors.push({ recommendation: recommendation.recommendation_id, error: result.error });
          }
        } catch (error) {
          errors.push({ recommendation: recommendation.recommendation_id, error: error.message });
        }
      }

      return {
        saved: results,
        errors: errors,
        total: recommendations.length,
        successful: results.length,
        failed: errors.length
      };
    }, 'saveRecommendations', { count: recommendations.length });
  }

  /**
   * Get recommendations with optional filters
   */
  async getRecommendations(filters = {}) {
    return this.executeOperation(async () => {
      // Validate input
      this.validateInput(filters, this.schemas.getRecommendations, 'getRecommendations');

      let query = `
        SELECT 
          r.*,
          CASE 
            WHEN r.estimated_hit_date <= CURRENT_DATE THEN 'OVERDUE'
            WHEN r.estimated_hit_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
            ELSE 'ON_TRACK'
          END as hit_status,
          CASE
            WHEN r.estimated_hit_date IS NOT NULL THEN EXTRACT(DAY FROM (r.estimated_hit_date - CURRENT_DATE))
            ELSE NULL
          END as days_until_hit
        FROM recommendations r
        WHERE 1=1
      `;
      
      const values = [];
      let paramCount = 0;

      // Apply filters
      if (filters.symbol) {
        paramCount++;
        query += ` AND r.symbol = $${paramCount}`;
        values.push(filters.symbol);
      }

      if (filters.type) {
        paramCount++;
        query += ` AND r.recommendation_type = $${paramCount}`;
        values.push(filters.type);
      }

      if (filters.since) {
        paramCount++;
        query += ` AND r.created_at >= $${paramCount}`;
        values.push(filters.since);
      }

      if (filters.risk_level) {
        paramCount++;
        query += ` AND r.risk_level = $${paramCount}`;
        values.push(filters.risk_level);
      }

      query += ` ORDER BY r.created_at DESC`;

      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(filters.limit);
      }

      const result = await this.executeQuery(query, values, 'getRecommendations');
      return result.rows;
    }, 'getRecommendations', filters);
  }

  /**
   * Track recommendation outcome
   */
  async trackOutcome(recommendationId, currentPrice) {
    return this.executeOperation(async () => {
      // Get the original recommendation
      const recQuery = 'SELECT * FROM recommendations WHERE recommendation_id = $1';
      const recResult = await this.executeQuery(recQuery, [recommendationId], 'getRecommendation');
      
      if (recResult.rows.length === 0) {
        throw new Error(`Recommendation ${recommendationId} not found`);
      }

      const recommendation = recResult.rows[0];
      const targetPrice = parseFloat(recommendation.target_price);
      const originalPrice = parseFloat(recommendation.current_price);
      
      // Calculate outcome
      const hitTarget = this.checkTargetHit(recommendation.recommendation_type, currentPrice, targetPrice);
      const daysToOutcome = Math.floor((new Date() - new Date(recommendation.created_at)) / (1000 * 60 * 60 * 24));
      const gainLossPercent = ((currentPrice - originalPrice) / originalPrice) * 100;

      // Save outcome
      const outcomeQuery = `
        INSERT INTO recommendation_outcomes 
        (recommendation_id, outcome_date, actual_price, hit_target, days_to_outcome, gain_loss_percent)
        VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
        ON CONFLICT (recommendation_id, outcome_date) 
        DO UPDATE SET
          actual_price = EXCLUDED.actual_price,
          hit_target = EXCLUDED.hit_target,
          days_to_outcome = EXCLUDED.days_to_outcome,
          gain_loss_percent = EXCLUDED.gain_loss_percent
        RETURNING *
      `;

      const outcomeResult = await this.executeQuery(
        outcomeQuery, 
        [recommendationId, currentPrice, hitTarget, daysToOutcome, gainLossPercent],
        'trackOutcome'
      );

      return {
        recommendation_id: recommendationId,
        outcome: outcomeResult.rows[0],
        hit_target: hitTarget,
        gain_loss_percent: gainLossPercent
      };
    }, 'trackOutcome', { recommendationId });
  }

  /**
   * Check if target was hit based on recommendation type
   */
  checkTargetHit(recommendationType, currentPrice, targetPrice) {
    switch (recommendationType) {
      case 'BUY':
        return currentPrice >= targetPrice;
      case 'SELL':
        return currentPrice <= targetPrice;
      case 'HOLD':
        // For HOLD, consider target hit if within 5% of target
        const tolerance = targetPrice * 0.05;
        return Math.abs(currentPrice - targetPrice) <= tolerance;
      default:
        return false;
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    return this.executeOperation(async () => {
      await this.cleanup();
      return { disconnected: true, timestamp: new Date().toISOString() };
    }, 'disconnect');
  }

  /**
   * Enhanced health check including table verification
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    try {
      // Check if tables exist
      const tableCheck = await this.executeQuery(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
        [],
        'healthCheck'
      );
      
      baseHealth.checks.tables = {
        count: tableCheck.rows.length,
        tables: tableCheck.rows.map(row => row.table_name)
      };
    } catch (error) {
      baseHealth.checks.tables = 'unhealthy';
      baseHealth.status = 'degraded';
      this.logger.error('Table health check failed', error);
    }
    
    return baseHealth;
  }
}

module.exports = ImprovedDatabaseService;
