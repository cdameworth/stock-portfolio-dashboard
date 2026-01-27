'use strict';

const { Pool } = require('pg');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'database-service' },
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Database Service for recommendation tracking and performance metrics
 */
class DatabaseService {
  constructor(config = {}) {
    // Database configuration from environment or config
    this.poolConfig = {
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME || 'stock_portfolio',
      user: config.user || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD || 'postgres',
      max: 10, // Reduced pool size for t3.small
      min: 2,  // Keep minimum connections warm
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

    this.pool = null;
  }

  /**
   * Initialize database connection pool
   */
  async connect() {
    try {
      this.pool = new Pool(this.poolConfig);
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      logger.info('Database connection established successfully');
      return true;
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection closed');
    }
  }

  /**
   * Save a new recommendation to the database
   */
  async saveRecommendation(recommendation) {
    const client = await this.pool.connect();
    
    try {
      // Calculate estimated hit date based on estimated_hit_days
      const estimatedHitDays = recommendation.estimated_hit_days || this.calculateEstimatedHitDays(recommendation);
      const estimatedHitDate = new Date();
      estimatedHitDate.setDate(estimatedHitDate.getDate() + estimatedHitDays);

      const query = `
        INSERT INTO recommendations (
          recommendation_id, symbol, company_name, recommendation_type,
          prediction_score, confidence, current_price, target_price,
          stop_loss_price, risk_level, rationale, estimated_hit_days,
          estimated_hit_date, source, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (symbol)
        DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP,
          recommendation_id = EXCLUDED.recommendation_id,
          recommendation_type = EXCLUDED.recommendation_type,
          prediction_score = EXCLUDED.prediction_score,
          confidence = EXCLUDED.confidence,
          current_price = EXCLUDED.current_price,
          target_price = EXCLUDED.target_price,
          stop_loss_price = EXCLUDED.stop_loss_price,
          risk_level = EXCLUDED.risk_level,
          rationale = EXCLUDED.rationale,
          estimated_hit_days = EXCLUDED.estimated_hit_days,
          estimated_hit_date = EXCLUDED.estimated_hit_date,
          metadata = EXCLUDED.metadata
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
        recommendation.stop_loss_price || recommendation.current_price * 0.95, // Default 5% stop loss
        recommendation.risk_level || 'MEDIUM',
        recommendation.rationale || null,
        estimatedHitDays,
        estimatedHitDate,
        recommendation.source || 'stock-analytics-api',
        JSON.stringify(recommendation.metadata || {})
      ];

      const result = await client.query(query, values);
      logger.info(`Saved recommendation for ${recommendation.symbol}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving recommendation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate estimated days to hit target based on price change and volatility
   */
  calculateEstimatedHitDays(recommendation) {
    const priceChangePercent = Math.abs(
      ((recommendation.target_price - recommendation.current_price) / recommendation.current_price) * 100
    );

    // Base calculation on typical market movement speeds
    let baseDays;
    if (priceChangePercent < 5) {
      baseDays = 7 + Math.floor(Math.random() * 7); // 1-2 weeks for small moves
    } else if (priceChangePercent < 10) {
      baseDays = 21 + Math.floor(Math.random() * 14); // 3-5 weeks for medium moves
    } else if (priceChangePercent < 20) {
      baseDays = 45 + Math.floor(Math.random() * 30); // 1.5-2.5 months for large moves
    } else {
      baseDays = 90 + Math.floor(Math.random() * 60); // 3-5 months for very large moves
    }

    // Adjust based on risk level
    const riskMultiplier = {
      'LOW': 1.2,    // Low risk stocks move slower
      'MEDIUM': 1.0,  // Normal speed
      'HIGH': 0.8     // High risk stocks can move faster
    };

    const multiplier = riskMultiplier[recommendation.risk_level] || 1.0;
    return Math.floor(baseDays * multiplier);
  }

  /**
   * Batch save multiple recommendations
   */
  async saveRecommendations(recommendations) {
    const results = [];
    for (const recommendation of recommendations) {
      try {
        const result = await this.saveRecommendation(recommendation);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to save recommendation ${recommendation.recommendation_id}:`, error);
      }
    }
    return results;
  }

  /**
   * Get recommendations with optional filters
   */
  async getRecommendations(filters = {}) {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          r.*,
          CASE 
            WHEN r.estimated_hit_date <= CURRENT_DATE THEN 'OVERDUE'
            WHEN r.estimated_hit_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
            ELSE 'ON_TRACK'
          END as hit_status,
          CASE
            WHEN r.estimated_hit_date IS NOT NULL THEN EXTRACT(DAY FROM (r.estimated_hit_date::timestamp - CURRENT_DATE::timestamp))
            ELSE NULL
          END as days_until_hit
        FROM recommendations r
        WHERE 1=1
      `;
      
      const values = [];
      let paramCount = 0;

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

      const result = await client.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Track recommendation outcome (daily check)
   */
  async trackOutcome(recommendationId, currentPrice) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get the original recommendation
      const recQuery = 'SELECT * FROM recommendations WHERE recommendation_id = $1';
      const recResult = await client.query(recQuery, [recommendationId]);
      
      if (recResult.rows.length === 0) {
        throw new Error(`Recommendation ${recommendationId} not found`);
      }

      const recommendation = recResult.rows[0];
      const priceChangePercent = ((currentPrice - recommendation.current_price) / recommendation.current_price) * 100;
      const daysSince = Math.floor((Date.now() - new Date(recommendation.created_at)) / (1000 * 60 * 60 * 24));
      
      // Determine if target was achieved or stop loss triggered
      const targetAchieved = 
        (recommendation.recommendation_type === 'BUY' && currentPrice >= recommendation.target_price) ||
        (recommendation.recommendation_type === 'SELL' && currentPrice <= recommendation.target_price);
      
      const stopLossTriggered = recommendation.stop_loss_price && 
        (recommendation.recommendation_type === 'BUY' && currentPrice <= recommendation.stop_loss_price);

      // Determine outcome status
      let outcomeStatus = 'PENDING';
      if (targetAchieved) {
        outcomeStatus = 'SUCCESS';
      } else if (stopLossTriggered) {
        outcomeStatus = 'FAILED';
      } else if (daysSince > (recommendation.estimated_hit_days * 1.5)) {
        outcomeStatus = 'EXPIRED';
      } else if (Math.abs(priceChangePercent) > Math.abs(recommendation.target_price - recommendation.current_price) / recommendation.current_price * 50) {
        outcomeStatus = 'PARTIAL';
      }

      // Insert or update outcome
      const outcomeQuery = `
        INSERT INTO recommendation_outcomes (
          recommendation_id, symbol, check_date, check_price,
          price_change_percent, target_achieved, stop_loss_triggered,
          days_since_recommendation, outcome_status
        ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (recommendation_id, check_date)
        DO UPDATE SET
          check_price = EXCLUDED.check_price,
          price_change_percent = EXCLUDED.price_change_percent,
          target_achieved = EXCLUDED.target_achieved,
          stop_loss_triggered = EXCLUDED.stop_loss_triggered,
          outcome_status = EXCLUDED.outcome_status
        RETURNING *
      `;

      const outcomeValues = [
        recommendationId,
        recommendation.symbol,
        currentPrice,
        priceChangePercent,
        targetAchieved,
        stopLossTriggered,
        daysSince,
        outcomeStatus
      ];

      const outcomeResult = await client.query(outcomeQuery, outcomeValues);

      // If target achieved, track hit time accuracy
      if (targetAchieved && !recommendation.actual_hit_date) {
        const accuracyQuery = `
          INSERT INTO hit_time_accuracy (
            recommendation_id, estimated_hit_date, actual_hit_date,
            days_difference, accuracy_score
          ) VALUES ($1, $2, CURRENT_DATE, $3, $4)
          ON CONFLICT DO NOTHING
        `;

        const daysDifference = recommendation.estimated_hit_days - daysSince;
        const accuracyScore = Math.max(0, 100 - Math.abs(daysDifference) * 2); // Lose 2% per day off

        await client.query(accuracyQuery, [
          recommendationId,
          recommendation.estimated_hit_date,
          daysDifference,
          accuracyScore
        ]);
      }

      await client.query('COMMIT');
      logger.info(`Tracked outcome for ${recommendation.symbol}: ${outcomeStatus}`);
      return outcomeResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error tracking outcome:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate and store performance metrics for a period
   */
  async calculatePerformanceMetrics(period = '1M') {
    const client = await this.pool.connect();
    
    try {
      // Define period in days
      const periodDays = {
        '1D': 1,
        '1W': 7,
        '1M': 30,
        '3M': 90,
        '6M': 180,
        '1Y': 365
      }[period] || 30;

      const query = `
        WITH period_outcomes AS (
          SELECT 
            ro.*,
            r.confidence,
            r.recommendation_type
          FROM recommendation_outcomes ro
          JOIN recommendations r ON r.recommendation_id = ro.recommendation_id
          WHERE ro.check_date >= CURRENT_DATE - INTERVAL '${periodDays} days'
        ),
        metrics AS (
          SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN outcome_status = 'SUCCESS' THEN 1 END) as successful,
            COUNT(CASE WHEN outcome_status = 'FAILED' THEN 1 END) as failed,
            AVG(CASE WHEN outcome_status = 'SUCCESS' THEN price_change_percent END) as avg_gain,
            AVG(days_since_recommendation) as avg_days_to_hit,
            COUNT(CASE WHEN confidence > 0.8 THEN 1 END) as high_confidence_count,
            COUNT(CASE WHEN confidence > 0.8 AND outcome_status = 'SUCCESS' THEN 1 END) as high_confidence_success
          FROM period_outcomes
        )
        INSERT INTO performance_metrics (
          period, metric_date, total_recommendations, successful_recommendations,
          failed_recommendations, success_rate, average_gain, average_days_to_hit,
          high_confidence_accuracy
        )
        SELECT
          $1,
          CURRENT_DATE,
          total,
          successful,
          failed,
          CASE WHEN total > 0 THEN (successful::DECIMAL / total * 100) ELSE 0 END,
          COALESCE(avg_gain, 0),
          COALESCE(avg_days_to_hit, 0),
          CASE WHEN high_confidence_count > 0 
            THEN (high_confidence_success::DECIMAL / high_confidence_count * 100) 
            ELSE 0 END
        FROM metrics
        ON CONFLICT (period, metric_date)
        DO UPDATE SET
          total_recommendations = EXCLUDED.total_recommendations,
          successful_recommendations = EXCLUDED.successful_recommendations,
          failed_recommendations = EXCLUDED.failed_recommendations,
          success_rate = EXCLUDED.success_rate,
          average_gain = EXCLUDED.average_gain,
          average_days_to_hit = EXCLUDED.average_days_to_hit,
          high_confidence_accuracy = EXCLUDED.high_confidence_accuracy
        RETURNING *
      `;

      const result = await client.query(query, [period]);
      logger.info(`Calculated performance metrics for period ${period}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error calculating performance metrics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get hit time accuracy statistics
   */
  async getHitTimeAccuracy(filters = {}) {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          AVG(accuracy_score) as average_accuracy,
          AVG(ABS(days_difference)) as average_days_off,
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN days_difference > 0 THEN 1 END) as early_hits,
          COUNT(CASE WHEN days_difference < 0 THEN 1 END) as late_hits,
          COUNT(CASE WHEN days_difference = 0 THEN 1 END) as perfect_hits
        FROM hit_time_accuracy
        WHERE 1=1
      `;

      const values = [];
      let paramCount = 0;

      if (filters.since) {
        paramCount++;
        query += ` AND created_at >= $${paramCount}`;
        values.push(filters.since);
      }

      const result = await client.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting hit time accuracy:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = DatabaseService;