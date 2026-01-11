/**
 * Improved Stock Service
 * Extends BaseService for standardized error handling, caching, and logging
 */

'use strict';

const axios = require('axios');
const NodeCache = require('node-cache');
const BaseService = require('./base-service');

class ImprovedStockService extends BaseService {
  constructor(options = {}) {
    super('stock-service', options);
    
    this.apiUrl = options.apiUrl || process.env.STOCK_ANALYTICS_API_URL;
    this.apiKey = options.apiKey || process.env.STOCK_API_KEY || 't8RkVcn41a6vhFAIhfHBf6AoxvtqVDPg6Q9rN5S6';
    
    // Multi-layer caching strategy
    this.caches = {
      recommendations: new NodeCache({ stdTTL: 300 }), // 5 minutes
      prices: new NodeCache({ stdTTL: 60 }), // 1 minute
      analytics: new NodeCache({ stdTTL: 900 }), // 15 minutes
      marketData: new NodeCache({ stdTTL: 180 }) // 3 minutes
    };
    
    // Rate limiting
    this.rateLimiter = {
      requests: 0,
      resetTime: Date.now() + 60000, // Reset every minute
      maxRequests: 100
    };

    // Input validation schemas
    this.schemas = {
      getRecommendations: {
        limit: { 
          required: false, 
          type: 'number',
          validate: (limit) => limit > 0 && limit <= 100
        },
        symbols: {
          required: false,
          validate: (symbols) => Array.isArray(symbols) && symbols.length <= 50
        }
      },
      getStockPrice: {
        symbol: { 
          required: true, 
          type: 'string',
          validate: (symbol) => /^[A-Z]{1,5}$/.test(symbol)
        }
      }
    };
  }

  /**
   * Check rate limiting
   */
  checkRateLimit() {
    const now = Date.now();
    
    if (now > this.rateLimiter.resetTime) {
      this.rateLimiter.requests = 0;
      this.rateLimiter.resetTime = now + 60000;
    }
    
    if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    this.rateLimiter.requests++;
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  async makeApiRequest(url, options = {}) {
    return this.retryOperation(async () => {
      this.checkRateLimit();
      
      const config = {
        timeout: 10000,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'StockPortfolio/1.0'
        },
        ...options
      };
      
      this.logger.debug('Making API request', { url, method: config.method || 'GET' });
      
      const response = await axios(url, config);
      
      if (response.status !== 200) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      return response.data;
    }, 3, 1000);
  }

  /**
   * Get stock recommendations with caching and validation
   */
  async getRecommendations(options = {}) {
    return this.executeOperation(async () => {
      // Validate input
      this.validateInput(options, this.schemas.getRecommendations, 'getRecommendations');
      
      const { limit = 10, symbols = null, forceRefresh = false } = options;
      const cacheKey = this.generateCacheKey('recommendations', limit, symbols?.join(',') || 'all');
      
      // Check cache first
      if (!forceRefresh) {
        const cached = this.caches.recommendations.get(cacheKey);
        if (cached) {
          this.logger.debug('Returning cached recommendations', { cacheKey });
          return cached;
        }
      }
      
      // Build API URL
      let url = `${this.apiUrl}/recommendations?limit=${limit}`;
      if (symbols && symbols.length > 0) {
        url += `&symbols=${symbols.join(',')}`;
      }
      
      try {
        const data = await this.makeApiRequest(url);
        
        // Validate response structure
        if (!data || !Array.isArray(data.recommendations)) {
          throw new Error('Invalid API response structure');
        }
        
        // Process and enrich recommendations
        const processedData = this.processRecommendations(data);
        
        // Cache the result
        this.caches.recommendations.set(cacheKey, processedData);
        
        return processedData;
      } catch (error) {
        this.logger.warn('API request failed, using fallback', { error: error.message });
        return this.getFallbackRecommendations(options);
      }
    }, 'getRecommendations', { limit, symbolCount: symbols?.length || 0 });
  }

  /**
   * Process and validate recommendations data
   */
  processRecommendations(data) {
    const processed = {
      recommendations: [],
      metadata: {
        total: data.recommendations?.length || 0,
        timestamp: new Date().toISOString(),
        source: 'api'
      }
    };
    
    if (data.recommendations) {
      processed.recommendations = data.recommendations.map(rec => ({
        recommendation_id: rec.recommendation_id || `rec_${Date.now()}_${Math.random()}`,
        symbol: rec.symbol?.toUpperCase(),
        recommendation_type: rec.recommendation_type || 'HOLD',
        prediction_score: Math.max(0, Math.min(1, rec.prediction_score || 0.5)),
        confidence: Math.max(0, Math.min(1, rec.confidence || 0.5)),
        current_price: rec.current_price || 0,
        target_price: rec.target_price || rec.current_price || 0,
        risk_level: rec.risk_level || 'MEDIUM',
        rationale: rec.rationale || 'No rationale provided',
        timestamp: rec.timestamp || new Date().toISOString(),
        metadata: {
          ...rec.metadata,
          processed: true,
          processedAt: new Date().toISOString()
        }
      })).filter(rec => rec.symbol && rec.symbol.length > 0);
    }
    
    return processed;
  }

  /**
   * Get current stock price with caching
   */
  async getStockPrice(symbol) {
    return this.executeOperation(async () => {
      // Validate input
      this.validateInput({ symbol }, this.schemas.getStockPrice, 'getStockPrice');
      
      const normalizedSymbol = symbol.toUpperCase().trim();
      const cacheKey = this.generateCacheKey('price', normalizedSymbol);
      
      // Check cache first
      const cached = this.caches.prices.get(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached price', { symbol: normalizedSymbol });
        return cached;
      }
      
      try {
        const url = `${this.apiUrl}/price/${normalizedSymbol}`;
        const data = await this.makeApiRequest(url);
        
        const priceData = {
          symbol: normalizedSymbol,
          price: data.price || 0,
          change: data.change || 0,
          changePercent: data.changePercent || 0,
          timestamp: new Date().toISOString(),
          source: 'api'
        };
        
        // Cache the result
        this.caches.prices.set(cacheKey, priceData);
        
        return priceData;
      } catch (error) {
        this.logger.warn('Price API request failed, using fallback', { 
          symbol: normalizedSymbol, 
          error: error.message 
        });
        return this.getFallbackPrice(normalizedSymbol);
      }
    }, 'getStockPrice', { symbol: symbol?.toUpperCase() });
  }

  /**
   * Get market analytics with caching
   */
  async getDashboardAnalytics() {
    return this.executeOperation(async () => {
      const cacheKey = this.generateCacheKey('analytics', 'dashboard');
      
      // Check cache first
      const cached = this.caches.analytics.get(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached analytics');
        return cached;
      }
      
      try {
        const url = `${this.apiUrl}/analytics/dashboard`;
        const data = await this.makeApiRequest(url);
        
        // Cache the result
        this.caches.analytics.set(cacheKey, data);
        
        return data;
      } catch (error) {
        this.logger.warn('Analytics API request failed, using fallback', { error: error.message });
        return this.getFallbackAnalytics();
      }
    }, 'getDashboardAnalytics');
  }

  /**
   * Fallback recommendations when API is unavailable
   */
  getFallbackRecommendations(options = {}) {
    const { limit = 10 } = options;
    const fallbackSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];
    
    const recommendations = fallbackSymbols.slice(0, limit).map((symbol, index) => ({
      recommendation_id: `fallback_${symbol}_${Date.now()}`,
      symbol,
      recommendation_type: ['BUY', 'HOLD', 'SELL'][index % 3],
      prediction_score: 0.5 + (Math.random() * 0.3),
      confidence: 0.4 + (Math.random() * 0.3),
      current_price: 100 + Math.random() * 200,
      target_price: 120 + Math.random() * 180,
      risk_level: ['LOW', 'MEDIUM', 'HIGH'][index % 3],
      rationale: 'Fallback recommendation - API unavailable',
      timestamp: new Date().toISOString(),
      metadata: {
        fallback: true,
        reason: 'API_UNAVAILABLE'
      }
    }));
    
    return {
      recommendations,
      metadata: {
        total: recommendations.length,
        timestamp: new Date().toISOString(),
        source: 'fallback'
      }
    };
  }

  /**
   * Fallback price data
   */
  getFallbackPrice(symbol) {
    return {
      symbol,
      price: 100 + Math.random() * 200,
      change: (Math.random() - 0.5) * 10,
      changePercent: (Math.random() - 0.5) * 5,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }

  /**
   * Fallback analytics data
   */
  getFallbackAnalytics() {
    return {
      executive_summary: {
        total_predictions: 25,
        success_rate: 0.68,
        avg_gain: 0.12,
        market_sentiment: 'BULLISH'
      },
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    Object.values(this.caches).forEach(cache => cache.flushAll());
    this.logger.info('All caches cleared');
  }

  /**
   * Enhanced health check
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    try {
      // Test API connectivity
      await this.makeApiRequest(`${this.apiUrl}/health`);
      baseHealth.checks.apiConnectivity = 'healthy';
    } catch (error) {
      baseHealth.checks.apiConnectivity = 'unhealthy';
      baseHealth.status = 'degraded';
      this.logger.error('API connectivity health check failed', error);
    }
    
    // Cache statistics
    baseHealth.checks.cacheStats = {
      recommendations: this.caches.recommendations.getStats(),
      prices: this.caches.prices.getStats(),
      analytics: this.caches.analytics.getStats()
    };
    
    return baseHealth;
  }
}

module.exports = ImprovedStockService;
