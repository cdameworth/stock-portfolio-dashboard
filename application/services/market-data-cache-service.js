'use strict';

/**
 * Market Data Cache Service
 *
 * Proactively fetches and caches real-time market data during market hours
 * to improve page load performance for quotes and market information.
 *
 * Features:
 * - Market hours awareness (9:30 AM - 4:00 PM ET, Mon-Fri)
 * - Intelligent fetch scheduling (more frequent during volatile periods)
 * - Multi-tier caching (Redis primary, memory fallback)
 * - Aggregates watched symbols from portfolios and recommendations
 * - Provider health-aware fetching
 *
 * @version 1.0.0
 */

const BaseService = require('./base-service');
const { getPriceService } = require('./price-service');
const NodeCache = require('node-cache');

// Market hours constants (Eastern Time)
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

// Pre/post market extended hours
const PREMARKET_START_HOUR = 4;
const AFTERHOURS_END_HOUR = 20;

class MarketDataCacheService extends BaseService {
  constructor(options = {}) {
    super('market-data-cache', options);

    // Dependencies
    this.redisClient = options.redisClient || null;
    this.databaseService = options.databaseService || null;
    this.portfolioService = options.portfolioService || null;
    this.priceService = options.priceService || getPriceService();

    // Cache configuration
    this.redisTTL = options.redisTTL || 60; // 60 seconds for Redis
    this.memoryTTL = options.memoryTTL || 30; // 30 seconds for memory
    this.memoryCache = new NodeCache({
      stdTTL: this.memoryTTL,
      checkperiod: 10,
      useClones: false // Performance optimization
    });

    // Fetch scheduling
    this.fetchIntervalMs = options.fetchIntervalMs || 30000; // 30 seconds during market hours
    this.extendedHoursIntervalMs = options.extendedHoursIntervalMs || 60000; // 1 minute extended hours
    this.closedMarketIntervalMs = options.closedMarketIntervalMs || 300000; // 5 minutes when closed

    // State
    this.isRunning = false;
    this.fetchTimer = null;
    this.lastFetchTime = null;
    this.watchedSymbols = new Set();
    this.fetchStats = {
      totalFetches: 0,
      successfulFetches: 0,
      failedFetches: 0,
      symbolsFetched: 0,
      lastFetchDuration: 0,
      averageFetchDuration: 0
    };

    // Configuration
    this.maxSymbolsPerFetch = options.maxSymbolsPerFetch || 50;
    this.prioritySymbols = new Set(options.prioritySymbols || [
      'SPY', 'QQQ', 'DIA', 'IWM', // Major ETFs
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA' // Top stocks
    ]);
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      // Test Redis connection if available
      if (this.redisClient) {
        try {
          await this.redisClient.ping();
          this.logger.info('Redis connection verified for market data cache');
        } catch (err) {
          this.logger.warn('Redis unavailable, using memory cache only', { error: err.message });
          this.redisClient = null;
        }
      }

      // Initial symbol collection
      await this.refreshWatchedSymbols();

      this.logger.info('Market data cache service initialized', {
        watchedSymbols: this.watchedSymbols.size,
        redisEnabled: !!this.redisClient,
        fetchInterval: this.fetchIntervalMs
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to initialize market data cache service', { error: error.message });
      throw error;
    }
  }

  /**
   * Start the periodic fetch cycle
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Market data cache service already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting market data cache service');

    // Perform initial fetch
    this.performFetch();

    // Schedule periodic fetches based on market state
    this.scheduleFetch();
  }

  /**
   * Stop the periodic fetch cycle
   */
  stop() {
    if (this.fetchTimer) {
      clearTimeout(this.fetchTimer);
      this.fetchTimer = null;
    }
    this.isRunning = false;
    this.logger.info('Market data cache service stopped');
  }

  /**
   * Schedule the next fetch based on market hours
   */
  scheduleFetch() {
    if (!this.isRunning) return;

    const marketState = this.getMarketState();
    let intervalMs;

    switch (marketState) {
      case 'OPEN':
        intervalMs = this.fetchIntervalMs;
        break;
      case 'PREMARKET':
      case 'AFTERHOURS':
        intervalMs = this.extendedHoursIntervalMs;
        break;
      case 'CLOSED':
      default:
        intervalMs = this.closedMarketIntervalMs;
    }

    this.fetchTimer = setTimeout(() => {
      this.performFetch();
      this.scheduleFetch();
    }, intervalMs);

    this.logger.debug('Next fetch scheduled', {
      marketState,
      intervalMs,
      nextFetchAt: new Date(Date.now() + intervalMs).toISOString()
    });
  }

  /**
   * Perform a fetch cycle for all watched symbols
   */
  async performFetch() {
    const startTime = Date.now();
    this.fetchStats.totalFetches++;

    try {
      // Refresh watched symbols periodically (every 10 fetches)
      if (this.fetchStats.totalFetches % 10 === 0) {
        await this.refreshWatchedSymbols();
      }

      const symbols = this.getSymbolsToFetch();
      if (symbols.length === 0) {
        this.logger.debug('No symbols to fetch');
        return;
      }

      this.logger.debug('Starting market data fetch', { symbolCount: symbols.length });

      // Fetch prices using the price service (handles provider fallback)
      const prices = await this.priceService.getPrices(symbols);

      // Cache each result
      let cachedCount = 0;
      for (const [symbol, priceData] of prices) {
        if (priceData && priceData.price > 0) {
          await this.cachePrice(symbol, priceData);
          cachedCount++;
        }
      }

      // Update stats
      const duration = Date.now() - startTime;
      this.fetchStats.successfulFetches++;
      this.fetchStats.symbolsFetched += cachedCount;
      this.fetchStats.lastFetchDuration = duration;
      this.fetchStats.averageFetchDuration = Math.round(
        (this.fetchStats.averageFetchDuration * (this.fetchStats.successfulFetches - 1) + duration) /
        this.fetchStats.successfulFetches
      );
      this.lastFetchTime = new Date();

      this.logger.info('Market data fetch completed', {
        symbolsRequested: symbols.length,
        symbolsCached: cachedCount,
        duration,
        marketState: this.getMarketState()
      });

    } catch (error) {
      this.fetchStats.failedFetches++;
      this.logger.error('Market data fetch failed', { error: error.message });
    }
  }

  /**
   * Get the current market state
   */
  getMarketState() {
    const now = new Date();
    const etTime = this.getEasternTime(now);

    const dayOfWeek = etTime.getDay();
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'CLOSED';
    }

    const marketOpenMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
    const marketCloseMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
    const premarketMinutes = PREMARKET_START_HOUR * 60;
    const afterhoursEndMinutes = AFTERHOURS_END_HOUR * 60;

    // Market hours
    if (timeInMinutes >= marketOpenMinutes && timeInMinutes < marketCloseMinutes) {
      return 'OPEN';
    }

    // Pre-market
    if (timeInMinutes >= premarketMinutes && timeInMinutes < marketOpenMinutes) {
      return 'PREMARKET';
    }

    // After-hours
    if (timeInMinutes >= marketCloseMinutes && timeInMinutes < afterhoursEndMinutes) {
      return 'AFTERHOURS';
    }

    return 'CLOSED';
  }

  /**
   * Convert to Eastern Time
   */
  getEasternTime(date) {
    // Use Intl to get Eastern time
    const options = {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(date);

    const dateParts = {};
    for (const part of parts) {
      dateParts[part.type] = part.value;
    }

    return new Date(
      parseInt(dateParts.year),
      parseInt(dateParts.month) - 1,
      parseInt(dateParts.day),
      parseInt(dateParts.hour),
      parseInt(dateParts.minute)
    );
  }

  /**
   * Check if today is a market holiday
   * Note: This is a simplified check - production should use a holiday calendar API
   */
  isMarketHoliday(date) {
    const holidays2024 = [
      '2024-01-01', // New Year's Day
      '2024-01-15', // MLK Day
      '2024-02-19', // Presidents Day
      '2024-03-29', // Good Friday
      '2024-05-27', // Memorial Day
      '2024-06-19', // Juneteenth
      '2024-07-04', // Independence Day
      '2024-09-02', // Labor Day
      '2024-11-28', // Thanksgiving
      '2024-12-25', // Christmas
    ];

    const holidays2025 = [
      '2025-01-01', // New Year's Day
      '2025-01-20', // MLK Day
      '2025-02-17', // Presidents Day
      '2025-04-18', // Good Friday
      '2025-05-26', // Memorial Day
      '2025-06-19', // Juneteenth
      '2025-07-04', // Independence Day
      '2025-09-01', // Labor Day
      '2025-11-27', // Thanksgiving
      '2025-12-25', // Christmas
    ];

    const holidays2026 = [
      '2026-01-01', // New Year's Day
      '2026-01-19', // MLK Day
      '2026-02-16', // Presidents Day
      '2026-04-03', // Good Friday
      '2026-05-25', // Memorial Day
      '2026-06-19', // Juneteenth
      '2026-07-03', // Independence Day (observed)
      '2026-09-07', // Labor Day
      '2026-11-26', // Thanksgiving
      '2026-12-25', // Christmas
    ];

    const allHolidays = [...holidays2024, ...holidays2025, ...holidays2026];
    const dateStr = date.toISOString().split('T')[0];
    return allHolidays.includes(dateStr);
  }

  /**
   * Refresh the list of watched symbols from portfolios and recommendations
   */
  async refreshWatchedSymbols() {
    const newSymbols = new Set(this.prioritySymbols);

    try {
      // Get symbols from portfolios
      if (this.portfolioService) {
        const portfolios = await this.getAllPortfolioSymbols();
        portfolios.forEach(symbol => newSymbols.add(symbol.toUpperCase()));
      }

      // Get symbols from recommendations
      if (this.databaseService) {
        const recommendations = await this.getRecommendationSymbols();
        recommendations.forEach(symbol => newSymbols.add(symbol.toUpperCase()));
      }

      this.watchedSymbols = newSymbols;
      this.logger.info('Refreshed watched symbols', { count: this.watchedSymbols.size });

    } catch (error) {
      this.logger.error('Failed to refresh watched symbols', { error: error.message });
      // Keep existing symbols on failure
    }
  }

  /**
   * Get all unique symbols from all user portfolios
   */
  async getAllPortfolioSymbols() {
    const symbols = new Set();

    try {
      if (!this.portfolioService?.pool) {
        return Array.from(symbols);
      }

      const result = await this.portfolioService.pool.query(`
        SELECT DISTINCT unnest(symbols) as symbol
        FROM portfolios
        WHERE symbols IS NOT NULL AND array_length(symbols, 1) > 0
      `);

      result.rows.forEach(row => {
        if (row.symbol) {
          symbols.add(row.symbol.toUpperCase());
        }
      });

    } catch (error) {
      this.logger.warn('Failed to get portfolio symbols', { error: error.message });
    }

    return Array.from(symbols);
  }

  /**
   * Get symbols from active recommendations
   */
  async getRecommendationSymbols() {
    const symbols = new Set();

    try {
      if (!this.databaseService?.pool) {
        return Array.from(symbols);
      }

      const result = await this.databaseService.pool.query(`
        SELECT DISTINCT symbol
        FROM recommendations
        WHERE created_at > NOW() - INTERVAL '7 days'
        ORDER BY symbol
        LIMIT 100
      `);

      result.rows.forEach(row => {
        if (row.symbol) {
          symbols.add(row.symbol.toUpperCase());
        }
      });

    } catch (error) {
      this.logger.warn('Failed to get recommendation symbols', { error: error.message });
    }

    return Array.from(symbols);
  }

  /**
   * Get the list of symbols to fetch, prioritizing important ones
   */
  getSymbolsToFetch() {
    const symbols = [];

    // Priority symbols first
    for (const symbol of this.prioritySymbols) {
      if (symbols.length < this.maxSymbolsPerFetch) {
        symbols.push(symbol);
      }
    }

    // Then other watched symbols
    for (const symbol of this.watchedSymbols) {
      if (!this.prioritySymbols.has(symbol) && symbols.length < this.maxSymbolsPerFetch) {
        symbols.push(symbol);
      }
    }

    return symbols;
  }

  /**
   * Cache a price in Redis and memory
   */
  async cachePrice(symbol, priceData) {
    const cacheKey = `price:${symbol}`;
    const cacheData = {
      ...priceData,
      cachedAt: Date.now(),
      marketState: this.getMarketState()
    };

    // Memory cache (always)
    this.memoryCache.set(cacheKey, cacheData);

    // Redis cache (if available)
    if (this.redisClient) {
      try {
        await this.redisClient.setEx(
          cacheKey,
          this.redisTTL,
          JSON.stringify(cacheData)
        );
      } catch (error) {
        this.logger.warn('Failed to cache to Redis', { symbol, error: error.message });
      }
    }
  }

  /**
   * Get a cached price
   */
  async getCachedPrice(symbol) {
    const cacheKey = `price:${symbol.toUpperCase()}`;

    // Try memory cache first (faster)
    const memCached = this.memoryCache.get(cacheKey);
    if (memCached) {
      return { ...memCached, source: 'memory-cache' };
    }

    // Try Redis
    if (this.redisClient) {
      try {
        const redisCached = await this.redisClient.get(cacheKey);
        if (redisCached) {
          const data = JSON.parse(redisCached);
          // Also populate memory cache for faster subsequent access
          this.memoryCache.set(cacheKey, data);
          return { ...data, source: 'redis-cache' };
        }
      } catch (error) {
        this.logger.warn('Redis get failed', { symbol, error: error.message });
      }
    }

    return null;
  }

  /**
   * Get cached prices for multiple symbols
   */
  async getCachedPrices(symbols) {
    const results = new Map();

    for (const symbol of symbols) {
      const cached = await this.getCachedPrice(symbol);
      if (cached) {
        results.set(symbol.toUpperCase(), cached);
      }
    }

    return results;
  }

  /**
   * Get price with cache-first strategy
   * Falls back to live fetch if not cached
   */
  async getPrice(symbol) {
    // Try cache first
    const cached = await this.getCachedPrice(symbol);
    if (cached) {
      return cached;
    }

    // Fall back to live fetch
    const livePrice = await this.priceService.getPrice(symbol);
    if (livePrice) {
      await this.cachePrice(symbol, livePrice);
      return { ...livePrice, source: 'live-fetch' };
    }

    return null;
  }

  /**
   * Get prices for multiple symbols with cache-first strategy
   */
  async getPrices(symbols) {
    const results = new Map();
    const uncached = [];

    // Check cache for all symbols
    for (const symbol of symbols) {
      const cached = await this.getCachedPrice(symbol);
      if (cached) {
        results.set(symbol.toUpperCase(), cached);
      } else {
        uncached.push(symbol);
      }
    }

    // Fetch uncached symbols
    if (uncached.length > 0) {
      const livePrices = await this.priceService.getPrices(uncached);
      for (const [symbol, priceData] of livePrices) {
        if (priceData) {
          await this.cachePrice(symbol, priceData);
          results.set(symbol, { ...priceData, source: 'live-fetch' });
        }
      }
    }

    return results;
  }

  /**
   * Force refresh prices for specific symbols
   */
  async refreshPrices(symbols) {
    const prices = await this.priceService.getPrices(symbols);

    for (const [symbol, priceData] of prices) {
      if (priceData && priceData.price > 0) {
        await this.cachePrice(symbol, priceData);
      }
    }

    return prices;
  }

  /**
   * Add symbols to the watch list
   */
  addSymbols(symbols) {
    for (const symbol of symbols) {
      this.watchedSymbols.add(symbol.toUpperCase());
    }
    this.logger.debug('Added symbols to watch list', {
      added: symbols.length,
      total: this.watchedSymbols.size
    });
  }

  /**
   * Remove symbols from the watch list
   */
  removeSymbols(symbols) {
    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      if (!this.prioritySymbols.has(upper)) {
        this.watchedSymbols.delete(upper);
      }
    }
  }

  /**
   * Get service status and statistics
   */
  getStatus() {
    const marketState = this.getMarketState();
    const providerStatus = this.priceService.getProviderStatus();

    return {
      service: this.serviceName,
      isRunning: this.isRunning,
      marketState,
      watchedSymbols: this.watchedSymbols.size,
      prioritySymbols: this.prioritySymbols.size,
      caching: {
        redisEnabled: !!this.redisClient,
        memoryCacheSize: this.memoryCache.keys().length,
        redisTTL: this.redisTTL,
        memoryTTL: this.memoryTTL
      },
      scheduling: {
        currentIntervalMs: this.getCurrentInterval(),
        nextFetchIn: this.fetchTimer ? 'scheduled' : 'not scheduled'
      },
      stats: {
        ...this.fetchStats,
        lastFetchTime: this.lastFetchTime?.toISOString() || null
      },
      providers: providerStatus
    };
  }

  /**
   * Get current fetch interval based on market state
   */
  getCurrentInterval() {
    const marketState = this.getMarketState();
    switch (marketState) {
      case 'OPEN':
        return this.fetchIntervalMs;
      case 'PREMARKET':
      case 'AFTERHOURS':
        return this.extendedHoursIntervalMs;
      default:
        return this.closedMarketIntervalMs;
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();

    return {
      ...baseHealth,
      checks: {
        ...baseHealth.checks,
        isRunning: this.isRunning,
        marketState: this.getMarketState(),
        watchedSymbols: this.watchedSymbols.size,
        memoryCacheSize: this.memoryCache.keys().length,
        redisConnected: this.redisClient ? 'checking' : 'disabled',
        lastFetch: this.lastFetchTime ?
          `${Math.round((Date.now() - this.lastFetchTime.getTime()) / 1000)}s ago` :
          'never'
      }
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    this.stop();
    this.memoryCache.flushAll();
    this.logger.info('Market data cache service shutdown complete');
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the singleton instance
 */
function getMarketDataCacheService(options = {}) {
  if (!instance) {
    instance = new MarketDataCacheService(options);
  }
  return instance;
}

module.exports = { MarketDataCacheService, getMarketDataCacheService };
