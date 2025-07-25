/**
 * Stock Service - Interface to Stock Analytics API
 */

const axios = require('axios');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'stock-service' },
  transports: [
    new winston.transports.Console()
  ]
});

class StockService {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || process.env.STOCK_ANALYTICS_API_URL;
    this.redisClient = options.redisClient;
    this.timeout = options.timeout || 30000;
    
    // Configure axios instance
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'StockPortfolioDashboard/1.0'
      }
    });
    
    // Add request/response interceptors for logging and metrics
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug(`Making request to ${config.url}`, { 
          method: config.method,
          url: config.url,
          params: config.params
        });
        return config;
      },
      (error) => {
        logger.error('Request error:', error);
        return Promise.reject(error);
      }
    );
    
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug(`Received response from ${response.config.url}`, {
          status: response.status,
          duration: response.headers['x-response-time']
        });
        return response;
      },
      (error) => {
        logger.error('Response error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Get stock recommendations from the analytics API
   */
  async getRecommendations(options = {}) {
    try {
      const {
        type,
        risk,
        limit = 10,
        min_confidence = 0
      } = options;
      
      // Check cache first
      const cacheKey = `recommendations:${type || 'all'}:${risk || 'all'}:${limit}:${min_confidence}`;
      const cachedData = await this.getFromCache(cacheKey);
      
      if (cachedData) {
        logger.info('Returning cached recommendations');
        return JSON.parse(cachedData);
      }
      
      // Build query parameters
      const params = {
        limit: limit
      };
      
      if (type) params.type = type;
      if (risk) params.risk = risk;
      if (min_confidence > 0) params.min_confidence = min_confidence;
      
      // Make API request
      const response = await this.httpClient.get('/recommendations', { params });
      
      const data = {
        ...response.data,
        source: 'stock-analytics-api',
        cached: false,
        retrieved_at: new Date().toISOString()
      };
      
      // Cache the response
      await this.cacheData(cacheKey, JSON.stringify(data), 300); // 5 minutes
      
      logger.info(`Retrieved ${data.recommendations?.length || 0} recommendations from API`);
      return data;
      
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      
      // Return fallback data if API is unavailable
      return this.getFallbackRecommendations(options);
    }
  }
  
  /**
   * Get recommendation for a specific stock symbol
   */
  async getRecommendationBySymbol(symbol, options = {}) {
    try {
      const { include_history = false } = options;
      
      // Check cache first
      const cacheKey = `recommendation:${symbol}:${include_history}`;
      const cachedData = await this.getFromCache(cacheKey);
      
      if (cachedData) {
        logger.info(`Returning cached recommendation for ${symbol}`);
        return JSON.parse(cachedData);
      }
      
      // Build query parameters
      const params = {};
      if (include_history) params.include_history = 'true';
      
      // Make API request
      const response = await this.httpClient.get(`/recommendations/${symbol.toUpperCase()}`, { params });
      
      const data = {
        ...response.data,
        source: 'stock-analytics-api',
        cached: false,
        retrieved_at: new Date().toISOString()
      };
      
      // Cache the response
      await this.cacheData(cacheKey, JSON.stringify(data), 180); // 3 minutes
      
      logger.info(`Retrieved recommendation for ${symbol} from API`);
      return data;
      
    } catch (error) {
      logger.error(`Error getting recommendation for ${symbol}:`, error);
      
      if (error.response?.status === 404) {
        throw new Error(`No recommendation found for symbol ${symbol}`);
      }
      
      // Return fallback data if API is unavailable
      return this.getFallbackRecommendation(symbol);
    }
  }
  
  /**
   * Get multiple recommendations by symbols
   */
  async getRecommendationsBySymbols(symbols, options = {}) {
    try {
      const promises = symbols.map(symbol => 
        this.getRecommendationBySymbol(symbol, options)
          .catch(error => {
            logger.warn(`Failed to get recommendation for ${symbol}:`, error.message);
            return null;
          })
      );
      
      const results = await Promise.all(promises);
      
      // Filter out failed requests
      const validRecommendations = results.filter(result => result !== null);
      
      return {
        recommendations: validRecommendations,
        requested_symbols: symbols,
        successful_count: validRecommendations.length,
        failed_count: symbols.length - validRecommendations.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Error getting recommendations by symbols:', error);
      throw error;
    }
  }
  
  /**
   * Get trending stocks (stocks with high activity/recommendations)
   */
  async getTrendingStocks(limit = 10) {
    try {
      // Get all recommendations and identify trending ones
      const recommendations = await this.getRecommendations({ limit: 50 });
      
      if (!recommendations.recommendations) {
        return { trending_stocks: [], count: 0 };
      }
      
      // Sort by prediction score and confidence
      const trending = recommendations.recommendations
        .filter(rec => rec.prediction_score > 0.6 && rec.confidence > 0.7)
        .sort((a, b) => (b.prediction_score * b.confidence) - (a.prediction_score * a.confidence))
        .slice(0, limit);
      
      return {
        trending_stocks: trending,
        count: trending.length,
        criteria: 'High prediction score and confidence',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Error getting trending stocks:', error);
      return { trending_stocks: [], count: 0, error: error.message };
    }
  }
  
  /**
   * Get market summary from recommendations
   */
  async getMarketSummary() {
    try {
      const recommendations = await this.getRecommendations({ limit: 50 });
      
      if (!recommendations.recommendations) {
        return this.getFallbackMarketSummary();
      }
      
      const recs = recommendations.recommendations;
      
      // Calculate market sentiment
      const buyCount = recs.filter(r => r.recommendation_type === 'BUY').length;
      const sellCount = recs.filter(r => r.recommendation_type === 'SELL').length;
      const holdCount = recs.filter(r => r.recommendation_type === 'HOLD').length;
      
      const avgPredictionScore = recs.reduce((sum, r) => sum + r.prediction_score, 0) / recs.length;
      const avgConfidence = recs.reduce((sum, r) => sum + r.confidence, 0) / recs.length;
      
      // Determine overall market sentiment
      let marketSentiment = 'NEUTRAL';
      if (buyCount > sellCount * 1.5) {
        marketSentiment = 'BULLISH';
      } else if (sellCount > buyCount * 1.5) {
        marketSentiment = 'BEARISH';
      }
      
      return {
        market_sentiment: marketSentiment,
        recommendation_distribution: {
          buy: buyCount,
          sell: sellCount,
          hold: holdCount
        },
        average_prediction_score: avgPredictionScore,
        average_confidence: avgConfidence,
        total_recommendations: recs.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error('Error getting market summary:', error);
      return this.getFallbackMarketSummary();
    }
  }
  
  /**
   * Get data from Redis cache
   */
  async getFromCache(key) {
    try {
      if (!this.redisClient || !this.redisClient.isReady) {
        return null;
      }
      
      return await this.redisClient.get(key);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }
  
  /**
   * Store data in Redis cache
   */
  async cacheData(key, data, ttlSeconds = 300) {
    try {
      if (!this.redisClient || !this.redisClient.isReady) {
        return false;
      }
      
      await this.redisClient.setEx(key, ttlSeconds, data);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }
  
  /**
   * Fallback recommendations when API is unavailable
   */
  getFallbackRecommendations(options = {}) {
    logger.warn('Using fallback recommendations due to API unavailability');
    
    const fallbackStocks = [
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'BUY', score: 0.75 },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'BUY', score: 0.72 },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'HOLD', score: 0.65 },
      { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'HOLD', score: 0.63 },
      { symbol: 'TSLA', name: 'Tesla Inc.', type: 'SELL', score: 0.45 }
    ];
    
    const limit = options.limit || 10;
    const filteredStocks = fallbackStocks.slice(0, limit);
    
    return {
      recommendations: filteredStocks.map((stock, index) => ({
        recommendation_id: `fallback_${stock.symbol}_${Date.now()}`,
        symbol: stock.symbol,
        recommendation_type: stock.type,
        prediction_score: stock.score,
        confidence: 0.6,
        current_price: 150 + Math.random() * 100,
        target_price: 150 + Math.random() * 120,
        risk_level: 'MEDIUM',
        ranking: index + 1,
        rationale: 'Fallback recommendation - API unavailable',
        timestamp: new Date().toISOString(),
        metadata: {
          fallback: true,
          reason: 'API_UNAVAILABLE'
        }
      })),
      count: filteredStocks.length,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Fallback recommendation for single symbol
   */
  getFallbackRecommendation(symbol) {
    logger.warn(`Using fallback recommendation for ${symbol} due to API unavailability`);
    
    return {
      recommendation: {
        recommendation_id: `fallback_${symbol}_${Date.now()}`,
        symbol: symbol,
        recommendation_type: 'HOLD',
        prediction_score: 0.6,
        confidence: 0.5,
        current_price: 100 + Math.random() * 50,
        target_price: 100 + Math.random() * 60,
        risk_level: 'MEDIUM',
        ranking: 1,
        rationale: 'Fallback recommendation - API unavailable',
        timestamp: new Date().toISOString(),
        metadata: {
          fallback: true,
          reason: 'API_UNAVAILABLE'
        }
      },
      symbol: symbol,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Fallback market summary
   */
  getFallbackMarketSummary() {
    return {
      market_sentiment: 'NEUTRAL',
      recommendation_distribution: {
        buy: 3,
        sell: 1,
        hold: 2
      },
      average_prediction_score: 0.6,
      average_confidence: 0.65,
      total_recommendations: 6,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Check API health
   */
  async checkHealth() {
    try {
      const response = await this.httpClient.get('/health', { timeout: 5000 });
      return {
        status: 'healthy',
        response_time: response.headers['x-response-time'],
        api_url: this.apiUrl
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        api_url: this.apiUrl
      };
    }
  }
}

module.exports = StockService;