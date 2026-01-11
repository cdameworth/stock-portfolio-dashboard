/**
 * Market Data Service - Real-time stock price fetching
 */

const yahooFinance = require('yahoo-finance2').default;
const NodeCache = require('node-cache');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'market-data-service' },
  transports: [
    new winston.transports.Console()
  ]
});

class MarketDataService {
  constructor() {
    // Cache stock prices for 1 minute to avoid hitting rate limits
    this.cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
  }

  /**
   * Get real-time stock quote
   */
  async getQuote(symbol) {
    try {
      // Check cache first
      const cachedData = this.cache.get(symbol);
      if (cachedData) {
        logger.debug(`Returning cached data for ${symbol}`);
        return cachedData;
      }

      // Fetch from Yahoo Finance
      const quote = await yahooFinance.quote(symbol);
      
      const data = {
        symbol: quote.symbol,
        name: quote.longName || quote.shortName,
        currentPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        dayLow: quote.regularMarketDayLow,
        dayHigh: quote.regularMarketDayHigh,
        volume: quote.regularMarketVolume,
        marketCap: quote.marketCap,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.cache.set(symbol, data);
      logger.info(`Fetched real-time data for ${symbol}: $${data.currentPrice}`);
      
      return data;
    } catch (error) {
      logger.error(`Error fetching quote for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple stock quotes
   */
  async getQuotes(symbols) {
    try {
      const promises = symbols.map(symbol => 
        this.getQuote(symbol).catch(error => {
          logger.error(`Failed to get quote for ${symbol}:`, error.message);
          return null;
        })
      );
      
      const results = await Promise.all(promises);
      return results.filter(result => result !== null);
    } catch (error) {
      logger.error('Error fetching multiple quotes:', error);
      throw error;
    }
  }

  /**
   * Get historical data for a stock
   */
  async getHistoricalData(symbol, period = '1mo') {
    try {
      const cacheKey = `${symbol}_historical_${period}`;
      const cachedData = this.cache.get(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const endDate = new Date();
      const startDate = new Date();
      
      // Calculate start date based on period
      switch(period) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '1w':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '1mo':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case '3mo':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(startDate.getMonth() - 1);
      }

      const historicalData = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: endDate,
        interval: period === '1d' ? '5m' : '1d'
      });

      const data = {
        symbol,
        period,
        data: historicalData.map(d => ({
          date: d.date,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        }))
      };

      // Cache for 5 minutes
      this.cache.set(cacheKey, data, 300);
      
      return data;
    } catch (error) {
      logger.error(`Error fetching historical data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Search for stocks by query
   */
  async searchStocks(query) {
    try {
      const results = await yahooFinance.search(query);
      return results.quotes.map(quote => ({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname,
        type: quote.quoteType,
        exchange: quote.exchange
      }));
    } catch (error) {
      logger.error(`Error searching stocks for query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Get trending stocks
   */
  async getTrendingStocks() {
    try {
      const trending = await yahooFinance.trendingSymbols('US');
      const symbols = trending.quotes.slice(0, 10).map(q => q.symbol);
      return await this.getQuotes(symbols);
    } catch (error) {
      logger.error('Error fetching trending stocks:', error);
      // Fallback to popular stocks
      const popularStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'SPY'];
      return await this.getQuotes(popularStocks);
    }
  }
}

module.exports = MarketDataService;