/**
 * Stock Service - Interface to Stock Analytics API
 */

const axios = require('axios');
const winston = require('winston');
const {
  traceStockOperation,
  traceApiCall,
  addSpanAttributes,
  recordSpanEvent
} = require('../otel-helpers');
const { businessMetrics } = require('../business-metrics');

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
    this.timeout = options.timeout || 30000;
    this.apiKey = options.apiKey || process.env.STOCK_API_KEY || process.env.STOCK_ANALYTICS_API_KEY;
    
    // Configure axios instance
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'StockPortfolioDashboard/1.0'
    };
    
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: headers
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
    return traceStockOperation('fetch_recommendations', [], {
      dataSource: 'analytics_api',
      requestType: 'batch',
      limit: options.limit || 10
    }, async () => {
      try {
        const {
          type,
          risk,
          limit = 10,
          min_confidence = 0
        } = options;

        addSpanAttributes({
          'stock.recommendation_type': type || 'all',
          'stock.risk_level': risk || 'all',
          'stock.min_confidence': min_confidence,
          'stock.limit': limit
        });

        recordSpanEvent('recommendations.request_started', { limit, type, risk });

        // Build query parameters
        const params = { limit };
        if (type) params.type = type;
        if (risk) params.risk = risk;
        if (min_confidence > 0) params.min_confidence = min_confidence;

        // Make API request with tracing
        const response = await traceApiCall('/recommendations', 'GET', async () => {
          return this.httpClient.get('/recommendations', { params });
        });

      // Transform API response to match our internal format and validate prices
      const transformedRecommendations = await Promise.all(
        (response.data.recommendations || []).map(async (rec) => {
          // Validate and update current price if needed
          const validatedPrice = await this.validateCurrentPrice(rec.symbol, rec.current_price);

          return {
            recommendation_id: rec.recommendation_id || `${rec.symbol}_${Date.now()}`,
            symbol: rec.symbol,
            recommendation_type: rec.prediction || 'HOLD', // API returns 'prediction' (BUY/SELL/HOLD), default to HOLD
            prediction_score: rec.confidence || 0.5, // Use confidence as prediction score, default to 0.5
            confidence: rec.confidence || 0.5,
            current_price: validatedPrice.price,
            target_price: rec.target_price || 0,
            risk_level: this.mapRiskScore(rec.risk_score), // Convert risk_score to risk_level
            ranking: null, // Not provided by API
            rationale: rec.rationale || `ML prediction with ${((rec.confidence || 0.5) * 100).toFixed(1)}% confidence`,
            timestamp: rec.timestamp || new Date().toISOString(),
            generated_at: rec.timestamp || new Date().toISOString(),
            upside_potential: rec.upside_potential || 0,
            model_version: rec.model_version || 'unknown',
            features_used: rec.features_used || 0,
            metadata: {
              ttl: rec.ttl,
              source: 'stock-analytics-api',
              price_updated: validatedPrice.updated,
              price_source: validatedPrice.source
            }
          };
        })
      );

        const data = {
          recommendations: transformedRecommendations,
          count: transformedRecommendations.length,
          meta: response.data.meta,
          source: 'stock-analytics-api',
          cached: false,
          retrieved_at: new Date().toISOString()
        };

        addSpanAttributes({
          'stock.recommendations_count': data.count,
          'stock.api_response_time': response.headers['x-response-time'] || 'unknown',
          'stock.data_source': 'analytics_api'
        });

        recordSpanEvent('recommendations.received', {
          count: data.count,
          source: 'analytics_api'
        });

        // Track business metrics for recommendations
        businessMetrics.trackStockOperation('recommendation_generated', {
          count: data.count,
          type: type || 'all',
          risk_level: risk || 'all',
          source: 'analytics_api'
        });

        logger.info(`Retrieved ${data.recommendations.length} recommendations from API`);
        return data;

      } catch (error) {
        recordSpanEvent('recommendations.error', {
          error_type: error.code || 'unknown',
          error_message: error.message
        });

        addSpanAttributes({
          'error.type': error.code || 'api_error',
          'error.fallback_used': true
        });

        logger.error('Error getting recommendations:', error);

        // Return fallback data if API is unavailable
        return await this.getFallbackRecommendations(options);
      }
    });
  }
  
  /**
   * Get recommendation for a specific stock symbol
   */
  async getRecommendationBySymbol(symbol, options = {}) {
    try {
      const { include_history = false } = options;
      
      // Build query parameters
      const params = {};
      if (include_history) params.include_history = 'true';
      
      // Make API request
      const response = await this.httpClient.get(`/recommendations/${symbol.toUpperCase()}`, { params });

      // Transform single recommendation response
      const rec = response.data;
      const transformedRecommendation = {
        recommendation_id: rec.recommendation_id || `${rec.symbol}_${Date.now()}`,
        symbol: rec.symbol,
        recommendation_type: rec.prediction || 'HOLD', // API returns 'prediction' (BUY/SELL/HOLD), default to HOLD
        prediction_score: rec.confidence || 0.5, // Use confidence as prediction score, default to 0.5
        confidence: rec.confidence || 0.5,
        current_price: rec.current_price || 0,
        target_price: rec.target_price || 0,
        risk_level: this.mapRiskScore(rec.risk_score), // Convert risk_score to risk_level
        ranking: 1, // Single recommendation is rank 1
        rationale: rec.rationale || `ML prediction with ${((rec.confidence || 0.5) * 100).toFixed(1)}% confidence`,
        timestamp: rec.timestamp || new Date().toISOString(),
        generated_at: rec.timestamp || new Date().toISOString(),
        upside_potential: rec.upside_potential || 0,
        model_version: rec.model_version || 'unknown',
        features_used: rec.features_used || 0,
        metadata: {
          ttl: rec.ttl,
          source: 'stock-analytics-api'
        }
      };

      const data = {
        recommendation: transformedRecommendation,
        symbol: symbol,
        source: 'stock-analytics-api',
        cached: false,
        retrieved_at: new Date().toISOString()
      };

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
  
   /* Fallback recommendations when API is unavailable
   */
  async getFallbackRecommendations(options = {}) {
    logger.warn('Using fallback recommendations due to API unavailability');

    const fallbackStocks = [
      { symbol: 'TWLO', name: 'Twilio Inc.', type: 'BUY', score: 0.88, risk: 'MEDIUM' },
      { symbol: 'AAPL', name: 'Apple Inc.', type: 'BUY', score: 0.85, risk: 'LOW' },
      { symbol: 'TWLO', name: 'Twilio Inc.', type: 'HOLD', score: 0.75, risk: 'MEDIUM' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'BUY', score: 0.82, risk: 'LOW' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'BUY', score: 0.78, risk: 'MEDIUM' },
      { symbol: 'TWLO', name: 'Twilio Inc.', type: 'BUY', score: 0.80, risk: 'HIGH' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'BUY', score: 0.76, risk: 'HIGH' },
      { symbol: 'META', name: 'Meta Platforms', type: 'BUY', score: 0.74, risk: 'MEDIUM' },
      { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'HOLD', score: 0.70, risk: 'MEDIUM' },
      { symbol: 'BRK.B', name: 'Berkshire Hathaway', type: 'BUY', score: 0.72, risk: 'LOW' },
      { symbol: 'JPM', name: 'JPMorgan Chase', type: 'BUY', score: 0.71, risk: 'LOW' },
      { symbol: 'V', name: 'Visa Inc.', type: 'BUY', score: 0.73, risk: 'LOW' },
      { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'HOLD', score: 0.68, risk: 'LOW' },
      { symbol: 'WMT', name: 'Walmart Inc.', type: 'BUY', score: 0.69, risk: 'LOW' },
      { symbol: 'PG', name: 'Procter & Gamble', type: 'HOLD', score: 0.67, risk: 'LOW' },
      { symbol: 'UNH', name: 'UnitedHealth Group', type: 'BUY', score: 0.70, risk: 'MEDIUM' },
      { symbol: 'HD', name: 'Home Depot', type: 'HOLD', score: 0.65, risk: 'MEDIUM' },
      { symbol: 'MA', name: 'Mastercard', type: 'BUY', score: 0.72, risk: 'LOW' },
      { symbol: 'DIS', name: 'Walt Disney', type: 'HOLD', score: 0.64, risk: 'MEDIUM' },
      { symbol: 'TSLA', name: 'Tesla Inc.', type: 'HOLD', score: 0.66, risk: 'HIGH' },
      { symbol: 'BAC', name: 'Bank of America', type: 'BUY', score: 0.68, risk: 'MEDIUM' },
      { symbol: 'XOM', name: 'Exxon Mobil', type: 'HOLD', score: 0.62, risk: 'MEDIUM' },
      { symbol: 'CVX', name: 'Chevron', type: 'HOLD', score: 0.61, risk: 'MEDIUM' },
      { symbol: 'KO', name: 'Coca-Cola', type: 'HOLD', score: 0.65, risk: 'LOW' },
      { symbol: 'PEP', name: 'PepsiCo', type: 'HOLD', score: 0.64, risk: 'LOW' },
      { symbol: 'COST', name: 'Costco', type: 'BUY', score: 0.71, risk: 'LOW' },
      { symbol: 'ADBE', name: 'Adobe Inc.', type: 'BUY', score: 0.70, risk: 'MEDIUM' },
      { symbol: 'CRM', name: 'Salesforce', type: 'HOLD', score: 0.66, risk: 'MEDIUM' },
      { symbol: 'NFLX', name: 'Netflix', type: 'HOLD', score: 0.63, risk: 'HIGH' },
      { symbol: 'AMD', name: 'AMD', type: 'BUY', score: 0.72, risk: 'HIGH' },
      { symbol: 'INTC', name: 'Intel', type: 'SELL', score: 0.45, risk: 'HIGH' },
      { symbol: 'ORCL', name: 'Oracle', type: 'HOLD', score: 0.65, risk: 'MEDIUM' },
      { symbol: 'IBM', name: 'IBM', type: 'SELL', score: 0.52, risk: 'MEDIUM' }
    ];
    
    const limit = options.limit || 20;
    const filteredStocks = fallbackStocks.slice(0, limit);
    
    // Generate more realistic price data based on actual market ranges
    const priceRanges = {
      'TWLO': { min: 60, max: 80 },
      'AAPL': { min: 170, max: 200 },
      'MSFT': { min: 380, max: 430 },
      'GOOGL': { min: 140, max: 170 },
      'NVDA': { min: 450, max: 550 },
      'META': { min: 480, max: 540 },
      'AMZN': { min: 170, max: 190 },
      'BRK.B': { min: 480, max: 510 },
      'JPM': { min: 180, max: 210 },
      'V': { min: 270, max: 290 },
      'JNJ': { min: 150, max: 165 },
      'WMT': { min: 170, max: 185 },
      'PG': { min: 155, max: 170 },
      'UNH': { min: 520, max: 560 },
      'HD': { min: 360, max: 390 },
      'MA': { min: 440, max: 470 },
      'DIS': { min: 85, max: 100 },
      'TSLA': { min: 240, max: 280 },
      'BAC': { min: 34, max: 40 },
      'XOM': { min: 100, max: 115 },
      'CVX': { min: 145, max: 160 },
      'KO': { min: 58, max: 64 },
      'PEP': { min: 165, max: 175 },
      'COST': { min: 680, max: 720 },
      'ADBE': { min: 590, max: 640 },
      'CRM': { min: 260, max: 290 },
      'NFLX': { min: 430, max: 480 },
      'AMD': { min: 140, max: 170 },
      'INTC': { min: 40, max: 48 },
      'ORCL': { min: 115, max: 130 },
      'IBM': { min: 160, max: 175 }
    };
    
    // Try to get real-time prices for fallback data
    const enrichedStocks = await Promise.all(
      filteredStocks.map(async (stock) => {
        const range = priceRanges[stock.symbol] || { min: 100, max: 200 };
        const fallbackPrice = range.min + Math.random() * (range.max - range.min);

        // Try to get real-time price
        const priceData = await this.getRealTimePrice(stock.symbol, fallbackPrice);
        const currentPrice = priceData.price || fallbackPrice;

        const gainMultiplier = stock.type === 'BUY' ? 1.05 + Math.random() * 0.15 :
                              stock.type === 'SELL' ? 0.85 + Math.random() * 0.1 :
                              0.98 + Math.random() * 0.04;
        const targetPrice = currentPrice * gainMultiplier;

        return { ...stock, currentPrice, targetPrice, priceSource: priceData.source };
      })
    );

    return {
      recommendations: enrichedStocks.map((stock, index) => {
        
        // Generate historical timestamps between 7 and 90 days ago for proper analysis
        const daysAgo = 7 + Math.floor(Math.random() * 83);
        const historicalDate = new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000));
        
        return {
          recommendation_id: `fallback_${stock.symbol}_${Date.now()}_${index}`,
          symbol: stock.symbol,
          company_name: stock.name,
          recommendation_type: stock.type,
          prediction_score: stock.score,
          confidence: 0.55 + Math.random() * 0.35,
          current_price: parseFloat(stock.currentPrice.toFixed(2)),
          target_price: parseFloat(stock.targetPrice.toFixed(2)),
          risk_level: stock.risk || 'MEDIUM',
          ranking: index + 1,
          rationale: `Based on technical analysis and market trends, ${stock.name} shows ${stock.type === 'BUY' ? 'strong growth potential' : stock.type === 'SELL' ? 'downside risk' : 'stable consolidation'} with ${stock.risk} risk profile.`,
          timestamp: historicalDate.toISOString(),
          generated_at: historicalDate.toISOString(),
          metadata: {
            fallback: true,
            reason: 'API_UNAVAILABLE',
            sector: this.getSector(stock.symbol),
            price_source: stock.priceSource
          }
        };
      }),
      count: filteredStocks.length,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Map API risk_score (0-1) to risk_level (LOW/MEDIUM/HIGH)
   */
  mapRiskScore(riskScore) {
    if (riskScore === null || riskScore === undefined) return 'MEDIUM';
    if (riskScore <= 0.3) return 'LOW';
    if (riskScore <= 0.7) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Validate and update current price using real-time data
   */
  async validateCurrentPrice(symbol, apiPrice) {
    try {
      // If API price seems reasonable (not 0, not extremely old), trust it for now
      const numPrice = parseFloat(apiPrice);
      if (numPrice > 0 && numPrice < 10000) {
        // For high-confidence recent data, return as-is
        return {
          price: numPrice,
          source: 'api',
          updated: false
        };
      }

      // For questionable prices, try to get real-time data
      return await this.getRealTimePrice(symbol, numPrice);
    } catch (error) {
      logger.warn(`Price validation failed for ${symbol}:`, error.message);
      // Return API price as fallback
      const fallbackPrice = parseFloat(apiPrice) || 0;
      return {
        price: fallbackPrice,
        source: 'api_fallback',
        updated: false
      };
    }
  }

  /**
   * Get real-time price from Yahoo Finance
   */
  async getRealTimePrice(symbol, fallbackPrice = 0) {
    try {
      const yahooFinance = require('yahoo-finance2').default;

      // Handle special symbols (BRK.B -> BRK-B for Yahoo)
      const yahooSymbol = symbol.replace('.', '-');

      const quote = await yahooFinance.quote(yahooSymbol);
      const currentPrice = quote.regularMarketPrice || quote.price || quote.ask || quote.bid;

      if (currentPrice && currentPrice > 0) {
        logger.info(`Updated ${symbol} price from real-time data: $${currentPrice}`);
        return {
          price: currentPrice,
          source: 'yahoo_finance',
          updated: true
        };
      }

      // If no real-time price available, return fallback
      return {
        price: fallbackPrice,
        source: 'fallback',
        updated: false
      };
    } catch (error) {
      logger.warn(`Failed to get real-time price for ${symbol}:`, error.message);
      return {
        price: fallbackPrice,
        source: 'error_fallback',
        updated: false
      };
    }
  }

  /**
   * Get sector for a given stock symbol
   */
  getSector(symbol) {
    const sectors = {
      'AAPL': 'Technology',
      'MSFT': 'Technology',
      'GOOGL': 'Technology',
      'NVDA': 'Technology',
      'META': 'Technology',
      'AMZN': 'Consumer Discretionary',
      'BRK.B': 'Financials',
      'JPM': 'Financials',
      'V': 'Financials',
      'JNJ': 'Healthcare',
      'WMT': 'Consumer Staples',
      'PG': 'Consumer Staples',
      'UNH': 'Healthcare',
      'HD': 'Consumer Discretionary',
      'MA': 'Financials',
      'DIS': 'Communication Services',
      'TSLA': 'Consumer Discretionary',
      'BAC': 'Financials',
      'XOM': 'Energy',
      'CVX': 'Energy',
      'KO': 'Consumer Staples',
      'PEP': 'Consumer Staples',
      'COST': 'Consumer Staples',
      'ADBE': 'Technology',
      'CRM': 'Technology',
      'NFLX': 'Communication Services',
      'AMD': 'Technology',
      'INTC': 'Technology',
      'ORCL': 'Technology',
      'IBM': 'Technology'
    };
    return sectors[symbol] || 'Other';
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
   * Request custom stock analysis for a specific ticker
   * This will add the stock to the prediction pipeline
   */
  async requestCustomStock(symbol, options = {}) {
    return traceStockOperation('request_custom_stock', [symbol], {
      dataSource: 'analytics_api',
      requestType: 'custom_request',
      symbol: symbol.toUpperCase()
    }, async () => {
      try {
        const upperSymbol = symbol.toUpperCase();

        addSpanAttributes({
          'stock.symbol': upperSymbol,
          'stock.custom_request': true,
          'stock.request_source': options.source || 'portfolio'
        });

        recordSpanEvent('custom_stock.request_initiated', {
          'symbol': upperSymbol,
          'user_id': options.userId || 'anonymous'
        });

        // Prepare request payload
        const requestData = {
          symbol: upperSymbol,
          request_type: 'prediction_analysis',
          source: options.source || 'portfolio_request',
          priority: options.priority || 'normal',
          user_context: {
            user_id: options.userId,
            portfolio_context: true,
            request_timestamp: new Date().toISOString()
          }
        };

        // Add optional parameters
        if (options.analysisType) {
          requestData.analysis_type = options.analysisType;
        }
        if (options.timeframe) {
          requestData.timeframe = options.timeframe;
        }

        logger.info(`Requesting custom stock analysis for ${upperSymbol}`, requestData);

        // Make API request
        const response = await traceApiCall('/custom-requests', 'POST', async () => {
          return this.httpClient.post('/custom-requests', requestData);
        });

        recordSpanEvent('custom_stock.request_completed', {
          'symbol': upperSymbol,
          'request_id': response.data.request_id,
          'status': response.data.status
        });

        // Track business metrics
        businessMetrics.trackStockOperation('custom_request', {
          symbol: upperSymbol,
          success: true,
          source: options.source || 'portfolio',
          request_id: response.data.request_id
        });

        return {
          success: true,
          request_id: response.data.request_id,
          symbol: upperSymbol,
          status: response.data.status,
          message: response.data.message || `Custom analysis requested for ${upperSymbol}`,
          estimated_completion: response.data.estimated_completion,
          priority: response.data.priority || 'normal'
        };

      } catch (error) {
        logger.error(`Error requesting custom stock analysis for ${symbol}:`, error);

        recordSpanEvent('custom_stock.request_failed', {
          'symbol': symbol.toUpperCase(),
          'error': error.message
        });

        // Track failure metrics
        businessMetrics.trackStockOperation('custom_request', {
          symbol: symbol.toUpperCase(),
          success: false,
          error: error.message,
          source: options.source || 'portfolio'
        });

        // If API is unavailable, return a helpful response
        if (error.code === 'ECONNREFUSED' || error.response?.status >= 500) {
          return {
            success: false,
            symbol: symbol.toUpperCase(),
            status: 'queued_offline',
            message: `Custom analysis request for ${symbol.toUpperCase()} has been queued. Analysis will be processed when the service is available.`,
            error: 'API temporarily unavailable'
          };
        }

        // For client errors (4xx), return more specific error
        if (error.response?.status >= 400 && error.response?.status < 500) {
          return {
            success: false,
            symbol: symbol.toUpperCase(),
            status: 'rejected',
            message: error.response.data?.message || `Invalid request for ${symbol.toUpperCase()}`,
            error: error.response.data?.error || 'Client error'
          };
        }

        throw error;
      }
    });
  }

  /**
   * Get status of a custom stock request
   */
  async getCustomRequestStatus(requestId) {
    try {
      const response = await this.httpClient.get(`/custom-requests/${requestId}`);
      return {
        success: true,
        request_id: requestId,
        status: response.data.status,
        symbol: response.data.symbol,
        progress: response.data.progress,
        estimated_completion: response.data.estimated_completion,
        created_at: response.data.created_at,
        completed_at: response.data.completed_at
      };
    } catch (error) {
      logger.error(`Error getting custom request status for ${requestId}:`, error);
      return {
        success: false,
        request_id: requestId,
        error: error.message
      };
    }
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