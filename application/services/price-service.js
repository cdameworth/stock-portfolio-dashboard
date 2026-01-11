/**
 * Real-Time Price Service
 *
 * Provides real-time stock prices from multiple sources with:
 * - Multiple provider fallbacks (Yahoo Finance, Alpha Vantage, Finnhub)
 * - In-memory caching with TTL
 * - Rate limiting protection
 * - Batch price fetching
 */

const axios = require('axios');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'price-service' },
  transports: [new winston.transports.Console()]
});

class PriceService {
  constructor(options = {}) {
    // API Keys (optional - some providers work without keys)
    this.alphaVantageKey = options.alphaVantageKey || process.env.ALPHA_VANTAGE_API_KEY;
    this.finnhubKey = options.finnhubKey || process.env.FINNHUB_API_KEY;

    // Cache configuration
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 1 minute default
    this.maxCacheSize = options.maxCacheSize || 500;

    // Rate limiting
    this.requestCounts = new Map(); // provider -> { count, resetTime }
    this.rateLimits = {
      yahoo: { maxRequests: 100, windowMs: 60000 },
      alphavantage: { maxRequests: 5, windowMs: 60000 }, // Free tier: 5/min
      finnhub: { maxRequests: 60, windowMs: 60000 },
      polygon: { maxRequests: 5, windowMs: 60000 }
    };

    // Provider priority order
    this.providers = ['yahoo', 'finnhub', 'alphavantage', 'polygon'];

    // HTTP client with timeout
    this.httpClient = axios.create({
      timeout: 10000,
      headers: { 'User-Agent': 'StockPortfolioDashboard/1.0' }
    });

    // Track provider health
    this.providerHealth = new Map();
    this.providers.forEach(p => this.providerHealth.set(p, { failures: 0, lastFailure: null }));
  }

  /**
   * Get current price for a single symbol
   */
  async getPrice(symbol) {
    const normalizedSymbol = symbol.toUpperCase().trim();

    // Check cache first
    const cached = this.getFromCache(normalizedSymbol);
    if (cached) {
      logger.debug(`Cache hit for ${normalizedSymbol}: $${cached.price}`);
      return cached;
    }

    // Try each provider in order
    for (const provider of this.getHealthyProviders()) {
      if (!this.checkRateLimit(provider)) {
        logger.debug(`Rate limit reached for ${provider}, trying next`);
        continue;
      }

      try {
        const result = await this.fetchFromProvider(provider, normalizedSymbol);
        if (result && result.price > 0) {
          this.setCache(normalizedSymbol, result);
          this.recordSuccess(provider);
          logger.info(`Got price for ${normalizedSymbol} from ${provider}: $${result.price}`);
          return result;
        }
      } catch (error) {
        this.recordFailure(provider, error);
        logger.warn(`Provider ${provider} failed for ${normalizedSymbol}: ${error.message}`);
      }
    }

    logger.error(`All providers failed for ${normalizedSymbol}`);
    return null;
  }

  /**
   * Get prices for multiple symbols (batch)
   */
  async getPrices(symbols) {
    const results = new Map();
    const uncached = [];

    // Check cache for all symbols first
    for (const symbol of symbols) {
      const normalizedSymbol = symbol.toUpperCase().trim();
      const cached = this.getFromCache(normalizedSymbol);
      if (cached) {
        results.set(normalizedSymbol, cached);
      } else {
        uncached.push(normalizedSymbol);
      }
    }

    // Fetch uncached symbols in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < uncached.length; i += concurrency) {
      const batch = uncached.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(symbol => this.getPrice(symbol))
      );

      batch.forEach((symbol, idx) => {
        if (batchResults[idx].status === 'fulfilled' && batchResults[idx].value) {
          results.set(symbol, batchResults[idx].value);
        }
      });

      // Small delay between batches to avoid rate limits
      if (i + concurrency < uncached.length) {
        await this.delay(200);
      }
    }

    return results;
  }

  /**
   * Fetch price from a specific provider
   */
  async fetchFromProvider(provider, symbol) {
    this.incrementRateLimit(provider);

    switch (provider) {
      case 'yahoo':
        return this.fetchFromYahoo(symbol);
      case 'finnhub':
        return this.fetchFromFinnhub(symbol);
      case 'alphavantage':
        return this.fetchFromAlphaVantage(symbol);
      case 'polygon':
        return this.fetchFromPolygon(symbol);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Yahoo Finance - Primary provider (no API key needed)
   */
  async fetchFromYahoo(symbol) {
    // Handle special symbols (BRK.B -> BRK-B for Yahoo)
    const yahooSymbol = symbol.replace('.', '-');

    // Use Yahoo Finance v8 API (public, no key required)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;

    const response = await this.httpClient.get(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://finance.yahoo.com'
      }
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) {
      throw new Error('No data in Yahoo response');
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose;

    if (!price || price <= 0) {
      throw new Error('Invalid price from Yahoo');
    }

    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      change: meta.regularMarketChange || 0,
      changePercent: meta.regularMarketChangePercent || 0,
      volume: meta.regularMarketVolume || 0,
      previousClose: meta.previousClose || price,
      marketState: meta.marketState || 'UNKNOWN',
      source: 'yahoo',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Finnhub - Secondary provider (free tier available)
   */
  async fetchFromFinnhub(symbol) {
    if (!this.finnhubKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.finnhubKey}`;
    const response = await this.httpClient.get(url);

    const data = response.data;
    if (!data || data.c <= 0) {
      throw new Error('Invalid price from Finnhub');
    }

    return {
      symbol,
      price: parseFloat(data.c.toFixed(2)), // Current price
      change: parseFloat((data.d || 0).toFixed(2)), // Change
      changePercent: parseFloat((data.dp || 0).toFixed(2)), // Change percent
      high: data.h,
      low: data.l,
      open: data.o,
      previousClose: data.pc,
      source: 'finnhub',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Alpha Vantage - Tertiary provider (free tier: 5 calls/min)
   */
  async fetchFromAlphaVantage(symbol) {
    if (!this.alphaVantageKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.alphaVantageKey}`;
    const response = await this.httpClient.get(url);

    const quote = response.data?.['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw new Error('Invalid response from Alpha Vantage');
    }

    const price = parseFloat(quote['05. price']);
    if (price <= 0) {
      throw new Error('Invalid price from Alpha Vantage');
    }

    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(quote['09. change'] || 0),
      changePercent: parseFloat((quote['10. change percent'] || '0').replace('%', '')),
      volume: parseInt(quote['06. volume'] || 0),
      previousClose: parseFloat(quote['08. previous close'] || price),
      source: 'alphavantage',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Polygon.io - Quaternary provider (free tier available)
   */
  async fetchFromPolygon(symbol) {
    // Polygon free tier provides delayed data without API key
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY || 'free'}`;

    try {
      const response = await this.httpClient.get(url);
      const result = response.data?.results?.[0];

      if (!result || !result.c) {
        throw new Error('Invalid response from Polygon');
      }

      return {
        symbol,
        price: parseFloat(result.c.toFixed(2)), // Close price
        open: result.o,
        high: result.h,
        low: result.l,
        volume: result.v,
        previousClose: result.c, // Previous day close
        source: 'polygon',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Polygon API error: ${error.message}`);
    }
  }

  // ==================== Caching ====================

  getFromCache(symbol) {
    const cached = this.cache.get(symbol);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.cachedAt > this.cacheTTL) {
      this.cache.delete(symbol);
      return null;
    }

    return { ...cached.data, cached: true };
  }

  setCache(symbol, data) {
    // Enforce max cache size (LRU-style: remove oldest)
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(symbol, {
      data,
      cachedAt: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }

  // ==================== Rate Limiting ====================

  checkRateLimit(provider) {
    const limits = this.rateLimits[provider];
    if (!limits) return true;

    const state = this.requestCounts.get(provider);
    if (!state) return true;

    // Reset if window expired
    if (Date.now() > state.resetTime) {
      this.requestCounts.delete(provider);
      return true;
    }

    return state.count < limits.maxRequests;
  }

  incrementRateLimit(provider) {
    const limits = this.rateLimits[provider];
    if (!limits) return;

    const state = this.requestCounts.get(provider);

    if (!state || Date.now() > state.resetTime) {
      this.requestCounts.set(provider, {
        count: 1,
        resetTime: Date.now() + limits.windowMs
      });
    } else {
      state.count++;
    }
  }

  // ==================== Provider Health ====================

  recordSuccess(provider) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failures = 0;
    }
  }

  recordFailure(provider, error) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.failures++;
      health.lastFailure = Date.now();
      health.lastError = error.message;
    }
  }

  getHealthyProviders() {
    // Sort providers by health (fewer failures = higher priority)
    return [...this.providers].sort((a, b) => {
      const healthA = this.providerHealth.get(a);
      const healthB = this.providerHealth.get(b);

      // If a provider failed recently (last 5 min), deprioritize it
      const recentFailureA = healthA?.lastFailure && (Date.now() - healthA.lastFailure < 300000);
      const recentFailureB = healthB?.lastFailure && (Date.now() - healthB.lastFailure < 300000);

      if (recentFailureA && !recentFailureB) return 1;
      if (!recentFailureA && recentFailureB) return -1;

      return (healthA?.failures || 0) - (healthB?.failures || 0);
    });
  }

  // ==================== Utilities ====================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProviderStatus() {
    const status = {};
    for (const provider of this.providers) {
      const health = this.providerHealth.get(provider);
      const rateLimit = this.requestCounts.get(provider);
      status[provider] = {
        healthy: !health?.lastFailure || (Date.now() - health.lastFailure > 300000),
        failures: health?.failures || 0,
        lastError: health?.lastError || null,
        requestsInWindow: rateLimit?.count || 0,
        rateLimitMax: this.rateLimits[provider]?.maxRequests || 'unlimited'
      };
    }
    return status;
  }
}

// Singleton instance
let priceServiceInstance = null;

function getPriceService(options = {}) {
  if (!priceServiceInstance) {
    priceServiceInstance = new PriceService(options);
  }
  return priceServiceInstance;
}

module.exports = { PriceService, getPriceService };
