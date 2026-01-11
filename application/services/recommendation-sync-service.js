'use strict';

const winston = require('winston');
const DatabaseService = require('./database-service');
const StockService = require('./stock-service');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'recommendation-sync' },
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Service to sync recommendations from API to database
 */
class RecommendationSyncService {
  constructor(options = {}) {
    this.databaseService = options.databaseService || new DatabaseService();
    this.stockService = options.stockService || new StockService({
      apiUrl: process.env.STOCK_ANALYTICS_API_URL
    });
    
    this.syncInterval = options.syncInterval || 1800000; // 30 minutes (optimized frequency)
    this.isRunning = false;
    this.syncTimer = null;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      await this.databaseService.connect();
      logger.info('Recommendation sync service initialized');
    } catch (error) {
      logger.error('Failed to initialize sync service:', error);
      throw error;
    }
  }

  /**
   * Start periodic syncing
   */
  startSync() {
    if (this.isRunning) {
      logger.warn('Sync already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting recommendation sync every ${this.syncInterval / 1000} seconds`);
    
    // Run initial sync
    this.performSync();
    
    // Schedule periodic syncs
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.syncInterval);
  }

  /**
   * Stop periodic syncing
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.isRunning = false;
    logger.info('Recommendation sync stopped');
  }

  /**
   * Perform a single sync operation
   */
  async performSync() {
    try {
      logger.info('Starting recommendation sync...');

      // Fetch latest recommendations from API
      const apiResponse = await this.stockService.getRecommendations({ 
        limit: 25 // Reduced from 100 for better performance
      });

      if (!apiResponse.recommendations || apiResponse.recommendations.length === 0) {
        logger.info('No recommendations received from API');
        return;
      }

      logger.info(`Fetched ${apiResponse.recommendations.length} recommendations from API`);

      // Process each recommendation and enrich with timing data
      const enrichedRecommendations = apiResponse.recommendations.map(rec => {
        return this.enrichRecommendation(rec);
      });

      // Save to database
      const savedRecommendations = await this.databaseService.saveRecommendations(enrichedRecommendations);
      
      logger.info(`Successfully synced ${savedRecommendations.length} recommendations to database`);
      
      // Track outcomes for existing recommendations
      await this.trackExistingOutcomes();

    } catch (error) {
      logger.error('Error during recommendation sync:', error);
    }
  }

  /**
   * Enrich recommendation with estimated hit time and other metadata
   */
  enrichRecommendation(recommendation) {
    const enriched = { ...recommendation };

    // Parse estimated hit time from API response or calculate it
    if (recommendation.estimated_hit_days) {
      enriched.estimated_hit_days = parseInt(recommendation.estimated_hit_days);
    } else if (recommendation.estimated_hit_time) {
      // If API provides estimated_hit_time, parse it
      enriched.estimated_hit_days = this.parseEstimatedHitTime(recommendation.estimated_hit_time);
    } else {
      // Calculate based on price target and market conditions
      enriched.estimated_hit_days = this.calculateEstimatedHitDays(recommendation);
    }

    // Add source information
    enriched.source = recommendation.source || 'stock-analytics-api';
    enriched.metadata = {
      ...recommendation.metadata,
      sync_timestamp: new Date().toISOString(),
      api_version: recommendation.model_version || 'unknown'
    };

    return enriched;
  }

  /**
   * Parse estimated hit time from various formats
   */
  parseEstimatedHitTime(hitTime) {
    if (typeof hitTime === 'number') {
      return hitTime;
    }

    if (typeof hitTime === 'string') {
      // Handle formats like "30 days", "2 weeks", "1 month"
      const match = hitTime.match(/(\\d+)\\s*(day|week|month)s?/i);
      if (match) {
        const number = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        switch (unit) {
          case 'day': return number;
          case 'week': return number * 7;
          case 'month': return number * 30;
          default: return number;
        }
      }
    }

    // Default fallback
    return 30;
  }

  /**
   * Calculate estimated hit days based on recommendation data
   */
  calculateEstimatedHitDays(recommendation) {
    const priceChangePercent = Math.abs(
      ((recommendation.target_price - recommendation.current_price) / recommendation.current_price) * 100
    );

    // Base calculation on market volatility and price change size
    let baseDays;
    
    if (priceChangePercent < 3) {
      baseDays = 5 + Math.floor(Math.random() * 10); // 1-2 weeks for small moves
    } else if (priceChangePercent < 8) {
      baseDays = 14 + Math.floor(Math.random() * 14); // 2-4 weeks for medium moves  
    } else if (priceChangePercent < 15) {
      baseDays = 30 + Math.floor(Math.random() * 30); // 1-2 months for larger moves
    } else {
      baseDays = 60 + Math.floor(Math.random() * 60); // 2-4 months for very large moves
    }

    // Adjust based on confidence and risk level
    const confidenceMultiplier = recommendation.confidence > 0.8 ? 0.8 : 1.2;
    const riskMultiplier = {
      'LOW': 1.3,    // Conservative stocks move slower
      'MEDIUM': 1.0,
      'HIGH': 0.7    // Volatile stocks can move faster
    }[recommendation.risk_level] || 1.0;

    return Math.floor(baseDays * confidenceMultiplier * riskMultiplier);
  }

  /**
   * Track outcomes for existing recommendations
   */
  async trackExistingOutcomes() {
    try {
      // Get recommendations from last 90 days that don't have outcomes yet
      const recommendations = await this.databaseService.getRecommendations({
        since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        limit: 100
      });

      if (recommendations.length === 0) {
        return;
      }

      logger.info(`Tracking outcomes for ${recommendations.length} recommendations`);

      // Get current prices for all symbols
      const symbols = [...new Set(recommendations.map(r => r.symbol))];
      let trackedCount = 0;

      for (const symbol of symbols) {
        try {
          // Get current price from Yahoo Finance (we'll use the existing AI performance service)
          const yahooFinance = require('yahoo-finance2').default;
          const quote = await yahooFinance.quote(symbol);
          const currentPrice = quote.regularMarketPrice || quote.price;

          if (currentPrice) {
            // Track outcomes for all recommendations of this symbol
            const symbolRecs = recommendations.filter(r => r.symbol === symbol);
            for (const rec of symbolRecs) {
              await this.databaseService.trackOutcome(rec.recommendation_id, currentPrice);
              trackedCount++;
            }
          }

          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.warn(`Failed to track outcome for ${symbol}:`, error.message);
        }
      }

      logger.info(`Successfully tracked outcomes for ${trackedCount} recommendations`);
    } catch (error) {
      logger.error('Error tracking existing outcomes:', error);
    }
  }

  /**
   * Get recommendations with database enrichments
   */
  async getEnrichedRecommendations(filters = {}) {
    try {
      return await this.databaseService.getRecommendations(filters);
    } catch (error) {
      logger.error('Error getting enriched recommendations:', error);
      // Fallback to API if database fails
      const apiResponse = await this.stockService.getRecommendations(filters);
      return apiResponse.recommendations || [];
    }
  }

  /**
   * Get performance metrics from database
   */
  async getPerformanceMetrics(period = '1M') {
    try {
      // Calculate fresh metrics
      await this.databaseService.calculatePerformanceMetrics(period);
      
      // Get hit time accuracy
      const hitAccuracy = await this.databaseService.getHitTimeAccuracy({
        since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      return {
        period,
        hit_time_accuracy: hitAccuracy.average_accuracy || 0,
        average_days_off: hitAccuracy.average_days_off || 0,
        early_hits: hitAccuracy.early_hits || 0,
        late_hits: hitAccuracy.late_hits || 0,
        perfect_hits: hitAccuracy.perfect_hits || 0
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      return { error: 'Database metrics unavailable', period };
    }
  }

  /**
   * Cleanup old data
   */
  async cleanup() {
    try {
      // This could be expanded to clean up old outcomes, expired recommendations, etc.
      logger.info('Cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    this.stopSync();
    await this.databaseService.disconnect();
    logger.info('Recommendation sync service shutdown complete');
  }
}

module.exports = RecommendationSyncService;