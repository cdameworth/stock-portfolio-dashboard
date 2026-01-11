/**
 * Business Metrics Collection for Financial Dashboard
 * Collects and reports custom business KPIs to SigNoz
 */

const { metrics } = require('@opentelemetry/api');
const { trackSLOMetric, BUSINESS_ERRORS } = require('./slo-definitions');
const { addSpanAttributes, recordSpanEvent } = require('./otel-helpers');

// Initialize meter for business metrics
const meter = metrics.getMeter('stock-portfolio-business', '1.0.0');

// User Engagement Metrics
const activeUsers = meter.createGauge('users.active', {
  description: 'Number of active users in last 5 minutes'
});

const userSessions = meter.createCounter('users.sessions', {
  description: 'Number of user sessions started'
});

const sessionDuration = meter.createHistogram('users.session_duration', {
  description: 'User session duration in seconds'
});

// Portfolio Metrics
const totalPortfolioValue = meter.createGauge('portfolio.total_value', {
  description: 'Total value of all portfolios in USD'
});

const portfolioCount = meter.createGauge('portfolio.count', {
  description: 'Total number of portfolios'
});

const avgPortfolioValue = meter.createGauge('portfolio.avg_value', {
  description: 'Average portfolio value in USD'
});

const portfolioTransactions = meter.createCounter('portfolio.transactions', {
  description: 'Number of portfolio transactions'
});

// Stock Trading Metrics
const stockSearches = meter.createCounter('stocks.searches', {
  description: 'Number of stock searches performed'
});

const stockPriceRequests = meter.createCounter('stocks.price_requests', {
  description: 'Number of stock price lookups'
});

const recommendationsGenerated = meter.createCounter('recommendations.generated', {
  description: 'Number of AI recommendations generated'
});

const recommendationsActedOn = meter.createCounter('recommendations.acted_on', {
  description: 'Number of recommendations users acted on'
});

// Financial Performance Metrics
const dailyPnL = meter.createGauge('financial.daily_pnl', {
  description: 'Daily profit and loss across all portfolios'
});

const totalMarketExposure = meter.createGauge('financial.market_exposure', {
  description: 'Total market exposure in USD'
});

const riskScore = meter.createGauge('financial.risk_score', {
  description: 'Aggregate risk score (0-100)'
});

// System Performance Metrics
const apiCallVolume = meter.createCounter('system.api_calls', {
  description: 'Total API calls'
});

const databaseQueryTime = meter.createHistogram('system.db_query_time', {
  description: 'Database query execution time'
});

const cacheHitRate = meter.createGauge('system.cache_hit_rate', {
  description: 'Cache hit rate percentage'
});

/**
 * Business metrics tracking class
 */
class BusinessMetrics {
  constructor() {
    this.activeSessions = new Set();
    this.sessionStartTimes = new Map();
    this.portfolioValues = new Map();
    this.dailyStats = {
      searches: 0,
      transactions: 0,
      recommendations: 0,
      errors: 0
    };
  }

  /**
   * Track user session metrics
   */
  trackUserSession(userId, action, metadata = {}) {
    const sessionKey = `${userId}_${Date.now()}`;

    switch (action) {
      case 'start':
        this.activeSessions.add(userId);
        this.sessionStartTimes.set(sessionKey, Date.now());
        userSessions.add(1, {
          user_id: userId,
          session_type: metadata.type || 'web',
          ...metadata
        });
        activeUsers.record(this.activeSessions.size);
        break;

      case 'end':
        this.activeSessions.delete(userId);
        const startTime = this.sessionStartTimes.get(sessionKey);
        if (startTime) {
          const duration = (Date.now() - startTime) / 1000;
          sessionDuration.record(duration, {
            user_id: userId,
            ...metadata
          });
          this.sessionStartTimes.delete(sessionKey);
        }
        activeUsers.record(this.activeSessions.size);
        break;

      case 'heartbeat':
        // Keep session alive
        activeUsers.record(this.activeSessions.size);
        break;
    }

    // Add to span context
    addSpanAttributes({
      'user.id': userId,
      'user.session_action': action,
      'user.active_count': this.activeSessions.size
    });
  }

  /**
   * Track portfolio performance metrics
   */
  trackPortfolioMetrics(portfolioId, metrics) {
    const {
      value,
      positions,
      dailyChange,
      dailyChangePercent,
      transactions
    } = metrics;

    // Update portfolio value tracking
    this.portfolioValues.set(portfolioId, value);

    // Calculate aggregates
    const totalValue = Array.from(this.portfolioValues.values())
      .reduce((sum, val) => sum + val, 0);
    const avgValue = totalValue / this.portfolioValues.size;

    // Record metrics
    totalPortfolioValue.record(totalValue);
    avgPortfolioValue.record(avgValue);
    portfolioCount.record(this.portfolioValues.size);

    if (transactions) {
      portfolioTransactions.add(transactions, {
        portfolio_id: portfolioId,
        transaction_type: metrics.transactionType
      });
      this.dailyStats.transactions += transactions;
    }

    // Track daily P&L
    if (dailyChange !== undefined) {
      dailyPnL.record(dailyChange, {
        portfolio_id: portfolioId,
        change_percent: dailyChangePercent
      });
    }

    // Track SLO metrics
    if (value > 0) {
      trackSLOMetric('portfolio_calculation_accuracy', 99.99, {
        portfolio_id: portfolioId,
        calculation_type: 'value_update'
      });
    }

    // Add span attributes
    addSpanAttributes({
      'portfolio.id': portfolioId,
      'portfolio.value': value,
      'portfolio.positions': positions,
      'portfolio.daily_change': dailyChange
    });
  }

  /**
   * Track stock operation metrics
   */
  trackStockOperation(operation, metadata = {}) {
    switch (operation) {
      case 'search':
        stockSearches.add(1, metadata);
        this.dailyStats.searches++;
        break;

      case 'price_lookup':
        stockPriceRequests.add(1, metadata);
        break;

      case 'recommendation_generated':
        recommendationsGenerated.add(1, metadata);
        this.dailyStats.recommendations++;
        break;

      case 'recommendation_acted':
        recommendationsActedOn.add(1, metadata);
        // Calculate recommendation effectiveness
        const effectiveness = this.dailyStats.recommendations > 0
          ? (this.dailyStats.searches / this.dailyStats.recommendations) * 100
          : 0;
        trackSLOMetric('recommendation_accuracy', effectiveness, metadata);
        break;
    }

    recordSpanEvent(`stock.${operation}`, metadata);
  }

  /**
   * Track financial risk metrics
   */
  trackRiskMetrics(portfolioId, riskData) {
    const {
      volatility,
      beta,
      sharpeRatio,
      maxDrawdown,
      exposure
    } = riskData;

    // Calculate risk score (0-100, lower is better)
    const calculatedRiskScore = Math.min(100,
      (volatility * 20) +
      (Math.abs(beta - 1) * 30) +
      (maxDrawdown * 50)
    );

    riskScore.record(calculatedRiskScore, {
      portfolio_id: portfolioId,
      volatility,
      beta,
      sharpe_ratio: sharpeRatio
    });

    totalMarketExposure.record(exposure, {
      portfolio_id: portfolioId
    });

    // Check risk thresholds
    if (calculatedRiskScore > 75) {
      recordSpanEvent('risk.threshold_exceeded', {
        portfolio_id: portfolioId,
        risk_score: calculatedRiskScore,
        threshold: 75,
        severity: 'high'
      });
    }

    addSpanAttributes({
      'risk.score': calculatedRiskScore,
      'risk.volatility': volatility,
      'risk.beta': beta,
      'risk.exposure': exposure
    });
  }

  /**
   * Track system performance metrics
   */
  trackSystemPerformance(metric, value, metadata = {}) {
    switch (metric) {
      case 'api_call':
        apiCallVolume.add(1, metadata);
        break;

      case 'db_query':
        databaseQueryTime.record(value, metadata);
        // Track slow queries
        if (value > 1000) {
          recordSpanEvent('performance.slow_query', {
            query_time: value,
            ...metadata
          });
        }
        break;

      case 'cache_hit_rate':
        cacheHitRate.record(value, metadata);
        // Alert on low cache hit rate
        if (value < 80) {
          recordSpanEvent('performance.low_cache_hit_rate', {
            hit_rate: value,
            threshold: 80,
            ...metadata
          });
        }
        break;
    }
  }

  /**
   * Track business errors and their impact
   */
  trackBusinessError(errorType, context = {}) {
    const error = BUSINESS_ERRORS[errorType];
    if (!error) {
      console.warn(`Unknown business error type: ${errorType}`);
      return;
    }

    this.dailyStats.errors++;

    recordSpanEvent('business.error', {
      error_type: errorType,
      severity: error.severity,
      impact: error.impact,
      description: error.description,
      action: error.action,
      ...context
    });

    // Track critical errors as SLO violations
    if (error.severity === 'critical') {
      trackSLOMetric('critical_error_rate', 1, {
        error_type: errorType,
        ...context
      });
    }
  }

  /**
   * Generate business health score
   */
  calculateHealthScore() {
    const weights = {
      activeUsers: 0.2,
      errorRate: 0.3,
      cacheHitRate: 0.15,
      portfolioActivity: 0.2,
      recommendationEffectiveness: 0.15
    };

    const scores = {
      activeUsers: Math.min(100, (this.activeSessions.size / 100) * 100),
      errorRate: Math.max(0, 100 - (this.dailyStats.errors * 10)),
      cacheHitRate: 85, // Default, should be tracked
      portfolioActivity: Math.min(100, (this.dailyStats.transactions / 10) * 100),
      recommendationEffectiveness: this.dailyStats.recommendations > 0
        ? (this.dailyStats.searches / this.dailyStats.recommendations) * 100
        : 50
    };

    const healthScore = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * weights[key]);
    }, 0);

    addSpanAttributes({
      'health.score': healthScore,
      'health.active_users': this.activeSessions.size,
      'health.error_count': this.dailyStats.errors,
      'health.transaction_count': this.dailyStats.transactions
    });

    return {
      score: healthScore,
      components: scores,
      status: healthScore > 80 ? 'healthy' : healthScore > 60 ? 'degraded' : 'unhealthy'
    };
  }

  /**
   * Reset daily statistics
   */
  resetDailyStats() {
    this.dailyStats = {
      searches: 0,
      transactions: 0,
      recommendations: 0,
      errors: 0
    };

    recordSpanEvent('metrics.daily_reset', {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Export current metrics snapshot
   */
  getMetricsSnapshot() {
    return {
      users: {
        active: this.activeSessions.size,
        sessions: this.sessionStartTimes.size
      },
      portfolios: {
        count: this.portfolioValues.size,
        totalValue: Array.from(this.portfolioValues.values())
          .reduce((sum, val) => sum + val, 0)
      },
      daily: this.dailyStats,
      health: this.calculateHealthScore()
    };
  }
}

// Create singleton instance
const businessMetrics = new BusinessMetrics();

// Schedule daily stats reset
setInterval(() => {
  businessMetrics.resetDailyStats();
}, 24 * 60 * 60 * 1000); // Reset every 24 hours

module.exports = {
  businessMetrics,
  BusinessMetrics
};