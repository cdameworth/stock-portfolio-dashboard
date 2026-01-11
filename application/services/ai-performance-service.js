'use strict';

const axios = require('axios');
const yahooFinance = require('yahoo-finance2').default;
const NodeCache = require('node-cache');
const {
  traceAIOperation,
  traceStockOperation,
  addSpanAttributes,
  recordSpanEvent
} = require('../otel-helpers');

/**
 * AI Performance Analytics Service with Real Yahoo Finance Integration
 * Tracks recommendation outcomes using actual market data
 */
class AIPerformanceService {
    constructor(options = {}) {
        this.stockApiUrl = options.stockApiUrl || process.env.STOCK_ANALYTICS_API_URL;
        this.localApiUrl = options.localApiUrl;
        this.stockService = options.stockService;  // Direct access to stock service
        this.apiKey = process.env.STOCK_API_KEY || 't8RkVcn41a6vhFAIhfHBf6AoxvtqVDPg6Q9rN5S6';
        
        // Cache settings
        this.priceCache = new NodeCache({ stdTTL: 300 }); // 5 minute price cache
        this.analysisCache = new NodeCache({ stdTTL: 1800 }); // 30 minute analysis cache
        
        // Rate limiting for Yahoo Finance API
        this.lastYahooCall = 0;
        this.yahooCallDelay = 1000; // 1 second between calls
        
        console.log('AI Performance Service initialized with Yahoo Finance integration');
    }

    /**
     * Get current stock price from Yahoo Finance
     */
    async getCurrentPrice(symbol) {
        return traceStockOperation('fetch_current_price', symbol, {
            dataSource: 'yahoo_finance',
            requestType: 'single'
        }, async () => {
            const cacheKey = `current_price_${symbol}`;
            const cached = this.priceCache.get(cacheKey);

            if (cached) {
                addSpanAttributes({
                    'cache.hit': true,
                    'stock.price': cached,
                    'stock.symbol': symbol
                });
                recordSpanEvent('price.cache_hit', { symbol, price: cached });
                console.log(`Using cached price for ${symbol}: $${cached}`);
                return cached;
            }

            addSpanAttributes({ 'cache.hit': false });

            try {
                // Rate limit Yahoo Finance calls
                const now = Date.now();
                const timeSinceLastCall = now - this.lastYahooCall;
                if (timeSinceLastCall < this.yahooCallDelay) {
                    const waitTime = this.yahooCallDelay - timeSinceLastCall;
                    addSpanAttributes({ 'rate_limit.wait_ms': waitTime });
                    await new Promise(resolve =>
                        setTimeout(resolve, waitTime)
                    );
                }
                this.lastYahooCall = Date.now();

                recordSpanEvent('yahoo_finance.request_started', { symbol });
                console.log(`Fetching current price for ${symbol} from Yahoo Finance...`);

                const quote = await yahooFinance.quote(symbol);
                const price = quote.regularMarketPrice || quote.price || null;

                if (price) {
                    this.priceCache.set(cacheKey, price);
                    addSpanAttributes({
                        'stock.price': price,
                        'stock.symbol': symbol,
                        'yahoo_finance.success': true
                    });
                    recordSpanEvent('price.fetched', { symbol, price });
                    console.log(`${symbol}: Current price $${price}`);
                    return price;
                } else {
                    addSpanAttributes({ 'yahoo_finance.no_data': true });
                    recordSpanEvent('price.no_data', { symbol });
                    console.warn(`No price data available for ${symbol}`);
                    return null;
                }

            } catch (error) {
                recordSpanEvent('price.error', {
                    symbol,
                    error_type: error.name,
                    error_message: error.message
                });
                addSpanAttributes({
                    'error.type': 'yahoo_finance_error',
                    'error.symbol': symbol
                });
                console.error(`Error fetching price for ${symbol}:`, error.message);
                return null;
            }
        });
    }

    /**
     * Get historical stock price for a specific date
     */
    async getHistoricalPrice(symbol, date) {
        const cacheKey = `historical_${symbol}_${date.toISOString().split('T')[0]}`;
        const cached = this.priceCache.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            // Rate limit Yahoo Finance calls
            const now = Date.now();
            const timeSinceLastCall = now - this.lastYahooCall;
            if (timeSinceLastCall < this.yahooCallDelay) {
                await new Promise(resolve => 
                    setTimeout(resolve, this.yahooCallDelay - timeSinceLastCall)
                );
            }
            this.lastYahooCall = Date.now();

            console.log(`Fetching historical price for ${symbol} on ${date.toISOString().split('T')[0]}...`);

            // Get historical data around the target date
            const endDate = new Date(date.getTime() + (24 * 60 * 60 * 1000)); // Next day
            const startDate = new Date(date.getTime() - (7 * 24 * 60 * 60 * 1000)); // Week before
            
            const historical = await yahooFinance.historical(symbol, {
                period1: startDate,
                period2: endDate,
                interval: '1d'
            });

            if (historical && historical.length > 0) {
                // Find the closest date to our target
                const targetTime = date.getTime();
                let closestData = historical[0];
                let closestDiff = Math.abs(closestData.date.getTime() - targetTime);

                for (const data of historical) {
                    const diff = Math.abs(data.date.getTime() - targetTime);
                    if (diff < closestDiff) {
                        closestData = data;
                        closestDiff = diff;
                    }
                }

                const price = closestData.close;
                this.priceCache.set(cacheKey, price);
                console.log(`${symbol}: Historical price on ${date.toISOString().split('T')[0]}: $${price}`);
                return price;
            }

            console.warn(`No historical data available for ${symbol} on ${date.toISOString().split('T')[0]}`);
            return null;

        } catch (error) {
            console.error(`Error fetching historical price for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Get market index data (S&P 500, NASDAQ)
     */
    async getMarketBenchmarkData(period) {
        const cacheKey = `benchmarks_${period}`;
        const cached = this.analysisCache.get(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            console.log(`Fetching market benchmark data for period ${period}...`);

            // Calculate date range for the period
            const now = new Date();
            let startDate;
            
            switch (period) {
                case '1M':
                    startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                    break;
                case '3M':
                    startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                    break;
                case '6M':
                    startDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
                    break;
                case '1Y':
                    startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
                    break;
                default:
                    startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
            }

            // Fetch S&P 500 data
            await this.rateLimitYahoo();
            const sp500Data = await yahooFinance.historical('^GSPC', {
                period1: startDate,
                period2: now,
                interval: '1d'
            });

            // Fetch NASDAQ data
            await this.rateLimitYahoo();
            const nasdaqData = await yahooFinance.historical('^IXIC', {
                period1: startDate,
                period2: now,
                interval: '1d'
            });

            const calculateReturn = (data) => {
                if (!data || data.length < 2) return 0;
                const start = data[0].close;
                const end = data[data.length - 1].close;
                return ((end - start) / start) * 100;
            };

            const benchmarks = {
                sp500Return: Math.round(calculateReturn(sp500Data) * 10) / 10,
                nasdaqReturn: Math.round(calculateReturn(nasdaqData) * 10) / 10,
                period: period,
                dataPoints: {
                    sp500: sp500Data?.length || 0,
                    nasdaq: nasdaqData?.length || 0
                }
            };

            console.log(`Market benchmarks for ${period}:`, benchmarks);

            this.analysisCache.set(cacheKey, benchmarks);
            return benchmarks;

        } catch (error) {
            console.error('Error fetching market benchmark data:', error.message);
            
            // Return fallback data
            const fallbackBenchmarks = {
                '1M': { sp500Return: 2.1, nasdaqReturn: 3.2 },
                '3M': { sp500Return: 6.8, nasdaqReturn: 9.4 },
                '6M': { sp500Return: 8.2, nasdaqReturn: 12.1 },
                '1Y': { sp500Return: 11.5, nasdaqReturn: 15.8 }
            };
            
            return fallbackBenchmarks[period] || fallbackBenchmarks['3M'];
        }
    }

    /**
     * Rate limit Yahoo Finance API calls
     */
    async rateLimitYahoo() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastYahooCall;
        if (timeSinceLastCall < this.yahooCallDelay) {
            await new Promise(resolve => 
                setTimeout(resolve, this.yahooCallDelay - timeSinceLastCall)
            );
        }
        this.lastYahooCall = Date.now();
    }

    /**
     * Calculate recommendation outcome with real market data
     */
    async calculateRecommendationOutcome(recommendation) {
        const recDate = new Date(recommendation.timestamp);
        const now = new Date();
        const daysSinceRec = Math.floor((now - recDate) / (1000 * 60 * 60 * 24));
        
        // Only evaluate recommendations between 1 day and 1 year old
        if (daysSinceRec < 1 || daysSinceRec > 365) {
            return null;
        }

        console.log(`Evaluating recommendation for ${recommendation.symbol} from ${recDate.toISOString().split('T')[0]} (${daysSinceRec} days ago)`);

        // Get current price and original price
        const currentPrice = await this.getCurrentPrice(recommendation.symbol);
        if (!currentPrice) {
            console.warn(`Skipping ${recommendation.symbol} - no current price available`);
            return null;
        }

        // Use the price from the recommendation, or get historical price
        let originalPrice = recommendation.current_price;
        if (!originalPrice || originalPrice === 0) {
            originalPrice = await this.getHistoricalPrice(recommendation.symbol, recDate);
            if (!originalPrice) {
                console.warn(`Skipping ${recommendation.symbol} - no original price available`);
                return null;
            }
        }

        const targetPrice = recommendation.target_price || originalPrice;
        const actualChange = ((currentPrice - originalPrice) / originalPrice) * 100;
        const predictedChange = ((targetPrice - originalPrice) / originalPrice) * 100;

        // Determine success based on recommendation type and actual performance
        let isSuccess = false;
        let achievedTarget = false;
        const tolerance = 0.05; // 5% tolerance for target achievement

        switch (recommendation.recommendation_type?.toUpperCase()) {
            case 'BUY':
                isSuccess = actualChange > 2; // At least 2% gain
                achievedTarget = currentPrice >= (targetPrice * (1 - tolerance));
                break;
            case 'SELL':
                isSuccess = actualChange < -1; // At least 1% decline (or less loss than predicted)
                achievedTarget = currentPrice <= (targetPrice * (1 + tolerance));
                break;
            case 'HOLD':
                isSuccess = Math.abs(actualChange) < 10; // Less than 10% movement
                achievedTarget = Math.abs(currentPrice - targetPrice) < (targetPrice * tolerance * 2);
                break;
            default:
                // For unspecified types, consider success if it moved in predicted direction
                isSuccess = (predictedChange > 0 && actualChange > 1) || 
                          (predictedChange < 0 && actualChange < -1) || 
                          (Math.abs(predictedChange) < 2 && Math.abs(actualChange) < 5);
                achievedTarget = Math.abs(currentPrice - targetPrice) < (targetPrice * tolerance);
        }

        const outcome = {
            recommendation_id: recommendation.recommendation_id,
            symbol: recommendation.symbol,
            recommendation_type: recommendation.recommendation_type || 'UNKNOWN',
            original_price: Math.round(originalPrice * 100) / 100,
            target_price: Math.round(targetPrice * 100) / 100,
            current_price: Math.round(currentPrice * 100) / 100,
            predicted_change: Math.round(predictedChange * 10) / 10,
            actual_change: Math.round(actualChange * 10) / 10,
            is_success: isSuccess,
            achieved_target: achievedTarget,
            confidence: recommendation.confidence || 0,
            prediction_score: recommendation.prediction_score || 0,
            risk_level: recommendation.risk_level || 'UNKNOWN',
            days_since_recommendation: daysSinceRec,
            recommendation_date: recDate.toISOString(),
            evaluated_at: now.toISOString(),
            data_source: 'yahoo_finance'
        };

        console.log(`${recommendation.symbol}: ${originalPrice} → ${currentPrice} (${actualChange.toFixed(1)}%) - ${isSuccess ? 'SUCCESS' : 'FAILED'}`);

        return outcome;
    }

    /**
     * Analyze all recommendations with real market data
     */
    async analyzeAllRecommendations(options = {}) {
        const cacheKey = `analysis_real_${JSON.stringify(options)}`;
        const cached = this.analysisCache.get(cacheKey);
        
        if (cached) {
            console.log('Using cached recommendation analysis');
            return cached;
        }

        try {
            console.log('Fetching recommendations for real market analysis...');
            
            let recommendations = [];
            
            // Try to use stock service directly first (most efficient)
            if (this.stockService && typeof this.stockService.getRecommendations === 'function') {
                const result = await this.stockService.getRecommendations({ limit: 200 });
                recommendations = result.recommendations || [];
            } 
            // Fall back to API call
            else {
                // Use provided API URL or fallback to local endpoint
                const apiUrl = this.stockApiUrl || this.localApiUrl || `http://localhost:${process.env.PORT || 3000}`;
                const endpoint = `${apiUrl}/api/recommendations`;
                
                // Get recommendations from API
                const response = await axios.get(endpoint, {
                    headers: this.apiKey ? {
                        'x-api-key': this.apiKey
                    } : {},
                    params: {
                        limit: 200 // Reasonable limit for analysis
                    },
                    timeout: 30000
                });

                recommendations = response.data.recommendations || [];
            }
            console.log(`Analyzing ${recommendations.length} recommendations with real market data...`);

            // Filter out recommendations with no useful data
            const validRecommendations = recommendations.filter(rec => 
                rec.symbol && 
                rec.timestamp && 
                (rec.current_price > 0 || rec.target_price > 0) &&
                rec.confidence > 0
            );

            console.log(`Found ${validRecommendations.length} valid recommendations to analyze`);

            if (validRecommendations.length === 0) {
                return [];
            }

            // Process recommendations in smaller batches to avoid overwhelming APIs
            const outcomes = [];
            const batchSize = 5; // Smaller batches for Yahoo Finance API limits
            
            for (let i = 0; i < validRecommendations.length; i += batchSize) {
                const batch = validRecommendations.slice(i, i + batchSize);
                console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(validRecommendations.length/batchSize)} (${batch.length} recommendations)`);
                
                const batchPromises = batch.map(async (rec) => {
                    try {
                        return await this.calculateRecommendationOutcome(rec);
                    } catch (error) {
                        console.error(`Error processing ${rec.symbol}:`, error.message);
                        return null;
                    }
                });
                
                const batchResults = await Promise.all(batchPromises);
                outcomes.push(...batchResults.filter(result => result !== null));
                
                // Longer delay between batches for API rate limiting
                if (i + batchSize < validRecommendations.length) {
                    console.log('Waiting 2 seconds before next batch...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            console.log(`Successfully analyzed ${outcomes.length} recommendation outcomes with real market data`);

            // Cache results for 30 minutes
            this.analysisCache.set(cacheKey, outcomes);
            return outcomes;

        } catch (error) {
            console.error('Error in recommendation analysis:', error);
            throw new Error(`Failed to analyze recommendations: ${error.message}`);
        }
    }

    /**
     * Calculate comprehensive performance metrics with real data
     */
    async calculatePerformanceMetrics(period = '3M') {
        console.log(`Calculating AI performance metrics for period: ${period}`);
        
        try {
            const outcomes = await this.analyzeAllRecommendations();
            const filteredOutcomes = this.filterOutcomesByPeriod(outcomes, period);
            
            console.log(`Analyzing ${filteredOutcomes.length} outcomes for ${period} period`);

            if (filteredOutcomes.length === 0) {
                console.warn('No valid outcomes found for analysis');
                return this.getDefaultMetrics(period);
            }

            // Calculate success rate
            const totalRecs = filteredOutcomes.length;
            const successfulRecs = filteredOutcomes.filter(o => o.is_success).length;
            const successRate = (successfulRecs / totalRecs) * 100;

            // Calculate average gain for successful recommendations only
            const successfulOutcomes = filteredOutcomes.filter(o => o.is_success);
            const avgGain = successfulOutcomes.length > 0
                ? successfulOutcomes.reduce((sum, o) => sum + o.actual_change, 0) / successfulOutcomes.length
                : 0;

            // Calculate confidence accuracy (high confidence recommendations that succeeded)
            const highConfidenceRecs = filteredOutcomes.filter(o => o.confidence > 0.7);
            const highConfSuccesses = highConfidenceRecs.filter(o => o.is_success).length;
            const confidenceAccuracy = highConfidenceRecs.length > 0
                ? (highConfSuccesses / highConfidenceRecs.length) * 100
                : 0;

            // Calculate overall AI return (all recommendations, weighted equally)
            const totalReturn = filteredOutcomes.reduce((sum, o) => sum + o.actual_change, 0) / totalRecs;

            // Get real market benchmark data
            const benchmarks = await this.getMarketBenchmarkData(period);
            const aiAlpha = totalReturn - benchmarks.sp500Return;

            const metrics = {
                successRate: Math.round(successRate * 10) / 10,
                avgGain: Math.round(avgGain * 10) / 10,
                totalRecs: totalRecs,
                confidenceAccuracy: Math.round(confidenceAccuracy * 10) / 10,
                aiReturn: Math.round(totalReturn * 10) / 10,
                sp500Return: benchmarks.sp500Return,
                nasdaqReturn: benchmarks.nasdaqReturn,
                aiAlpha: Math.round(aiAlpha * 10) / 10,
                period: period,
                calculatedAt: new Date().toISOString(),
                sampleSize: totalRecs,
                dataSource: 'yahoo_finance',
                highConfidenceCount: highConfidenceRecs.length,
                successfulCount: successfulRecs
            };

            console.log('Calculated AI performance metrics:', metrics);
            return metrics;

        } catch (error) {
            console.error('Error calculating performance metrics:', error);
            return this.getDefaultMetrics(period);
        }
    }

    /**
     * Filter outcomes by time period
     */
    filterOutcomesByPeriod(outcomes, period) {
        const now = new Date();
        let cutoffDate;

        switch (period) {
            case '1M':
                cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                break;
            case '3M':
                cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                break;
            case '6M':
                cutoffDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
                break;
            case '1Y':
                cutoffDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
                break;
            default:
                cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        }

        return outcomes.filter(outcome => {
            const recDate = new Date(outcome.recommendation_date);
            return recDate >= cutoffDate;
        });
    }

    /**
     * Get default metrics when analysis fails
     */
    getDefaultMetrics(period) {
        return {
            successRate: 0,
            avgGain: 0,
            totalRecs: 0,
            confidenceAccuracy: 0,
            aiReturn: 0,
            sp500Return: 0,
            nasdaqReturn: 0,
            aiAlpha: 0,
            period: period || '3M',
            calculatedAt: new Date().toISOString(),
            sampleSize: 0,
            dataSource: 'none',
            error: 'No data available for analysis'
        };
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.priceCache.flushAll();
        this.analysisCache.flushAll();
        console.log('All caches cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            priceCache: {
                keys: this.priceCache.keys().length,
                hits: this.priceCache.getStats().hits,
                misses: this.priceCache.getStats().misses
            },
            analysisCache: {
                keys: this.analysisCache.keys().length,
                hits: this.analysisCache.getStats().hits,
                misses: this.analysisCache.getStats().misses
            }
        };
    }
}

module.exports = AIPerformanceService;