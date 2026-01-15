/**
 * SLO (Service Level Objective) Definitions for Financial Dashboard
 * These are business-critical metrics that define success
 */

const { addSpanAttributes, recordSpanEvent } = require('./otel-helpers');
const { metrics } = require('@opentelemetry/api');

// Get meter for custom metrics
const meter = metrics.getMeter('stock-portfolio-dashboard', '1.0.0');

// Create custom metric instruments
const loginSuccessRate = meter.createCounter('auth.login.success_rate', {
  description: 'Successful login rate',
  unit: 'percent'
});

const portfolioLoadTime = meter.createHistogram('portfolio.load_time', {
  description: 'Time to load portfolio data',
  unit: 'milliseconds'
});

const stockApiLatency = meter.createHistogram('stock_api.latency', {
  description: 'External stock API latency',
  unit: 'milliseconds'
});

const recommendationAccuracy = meter.createCounter('recommendations.accuracy', {
  description: 'AI recommendation accuracy rate',
  unit: 'percent'
});

const transactionVolume = meter.createCounter('portfolio.transaction_volume', {
  description: 'Total transaction volume in USD',
  unit: 'USD'
});

const criticalErrorRate = meter.createCounter('errors.critical_rate', {
  description: 'Rate of critical errors',
  unit: 'errors'
});

const dataFreshness = meter.createGauge('data.freshness', {
  description: 'Data freshness indicator',
  unit: 'seconds'
});

/**
 * SLO Definitions
 */
const SLO_DEFINITIONS = {
  // Availability SLOs
  availability: {
    name: 'Service Availability',
    target: 99.9, // 99.9% uptime
    measurement: 'uptime_percentage',
    window: '30d',
    critical: true,
    alert_thresholds: {
      warning: 99.95,
      critical: 99.9
    },
    description: 'Core service must be available 99.9% of the time'
  },

  // Latency SLOs
  api_latency_p99: {
    name: 'API Latency P99',
    target: 500, // 500ms
    measurement: 'milliseconds',
    window: '5m',
    critical: true,
    alert_thresholds: {
      warning: 400,
      critical: 500
    },
    description: '99th percentile of API requests must complete within 500ms'
  },

  portfolio_load_time: {
    name: 'Portfolio Load Time P95',
    target: 2000, // 2 seconds
    measurement: 'milliseconds',
    window: '5m',
    critical: true,
    alert_thresholds: {
      warning: 1500,
      critical: 2000
    },
    description: '95th percentile of portfolio loads must complete within 2s'
  },

  // Error Rate SLOs
  error_rate: {
    name: 'Error Rate',
    target: 0.1, // 0.1% error rate
    measurement: 'percentage',
    window: '5m',
    critical: true,
    alert_thresholds: {
      warning: 0.05,
      critical: 0.1
    },
    description: 'Less than 0.1% of requests should result in errors'
  },

  critical_error_rate: {
    name: 'Critical Error Rate',
    target: 0.01, // 0.01% critical errors
    measurement: 'percentage',
    window: '1m',
    critical: true,
    alert_thresholds: {
      warning: 0.005,
      critical: 0.01
    },
    description: 'Zero tolerance for critical errors affecting financial data'
  },

  // Business SLOs
  login_success_rate: {
    name: 'Login Success Rate',
    target: 99.5, // 99.5% success
    measurement: 'percentage',
    window: '15m',
    critical: false,
    alert_thresholds: {
      warning: 99.7,
      critical: 99.5
    },
    description: 'User authentication must succeed 99.5% of the time'
  },

  recommendation_generation_time: {
    name: 'AI Recommendation Generation',
    target: 5000, // 5 seconds
    measurement: 'milliseconds',
    window: '5m',
    critical: false,
    alert_thresholds: {
      warning: 4000,
      critical: 5000
    },
    description: 'AI recommendations must generate within 5 seconds'
  },

  data_freshness: {
    name: 'Market Data Freshness',
    target: 60, // 60 seconds
    measurement: 'seconds',
    window: '1m',
    critical: true,
    alert_thresholds: {
      warning: 45,
      critical: 60
    },
    description: 'Stock prices must be updated within 60 seconds during market hours'
  },

  // Financial SLOs
  transaction_accuracy: {
    name: 'Transaction Processing Accuracy',
    target: 100, // 100% accuracy
    measurement: 'percentage',
    window: '1h',
    critical: true,
    alert_thresholds: {
      warning: 99.999,
      critical: 99.99
    },
    description: 'All financial transactions must be processed accurately'
  },

  portfolio_calculation_accuracy: {
    name: 'Portfolio Calculation Accuracy',
    target: 99.99, // 99.99% accuracy
    measurement: 'percentage',
    window: '15m',
    critical: true,
    alert_thresholds: {
      warning: 99.995,
      critical: 99.99
    },
    description: 'Portfolio value calculations must be accurate to 4 decimal places'
  }
};

/**
 * Track SLO metrics for a specific operation
 */
function trackSLOMetric(sloName, value, attributes = {}) {
  const slo = SLO_DEFINITIONS[sloName];
  if (!slo) {
    console.warn(`Unknown SLO: ${sloName}`);
    return;
  }

  // Add SLO context to current span
  addSpanAttributes({
    'slo.name': sloName,
    'slo.value': value,
    'slo.target': slo.target,
    'slo.window': slo.window,
    'slo.critical': slo.critical,
    ...attributes
  });

  // Check if SLO is violated
  const isViolated = slo.measurement === 'percentage'
    ? value < slo.target
    : value > slo.target;

  if (isViolated) {
    recordSpanEvent('slo.violation', {
      slo_name: sloName,
      actual_value: value,
      target_value: slo.target,
      severity: value > slo.alert_thresholds.critical ? 'critical' : 'warning'
    });
  }

  // Update the appropriate metric based on SLO type
  switch (sloName) {
    case 'login_success_rate':
      loginSuccessRate.add(value, attributes);
      break;
    case 'portfolio_load_time':
      portfolioLoadTime.record(value, attributes);
      break;
    case 'api_latency_p99':
    case 'recommendation_generation_time':
      stockApiLatency.record(value, attributes);
      break;
    case 'critical_error_rate':
    case 'error_rate':
      criticalErrorRate.add(value, attributes);
      break;
    case 'data_freshness':
      dataFreshness.record(value, attributes);
      break;
    case 'transaction_accuracy':
    case 'portfolio_calculation_accuracy':
      recommendationAccuracy.add(value, attributes);
      break;
  }

  return isViolated;
}

/**
 * Calculate current SLO compliance
 */
function calculateSLOCompliance(sloName, values) {
  const slo = SLO_DEFINITIONS[sloName];
  if (!slo || !values.length) return null;

  let compliance;
  if (slo.measurement === 'percentage') {
    // For percentage-based SLOs, calculate average
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    compliance = (avg / slo.target) * 100;
  } else {
    // For latency/time-based SLOs, calculate percentage meeting target
    const meetingTarget = values.filter(v => v <= slo.target).length;
    compliance = (meetingTarget / values.length) * 100;
  }

  return {
    sloName,
    compliance,
    isCompliant: compliance >= 100,
    target: slo.target,
    measurement: slo.measurement,
    window: slo.window,
    critical: slo.critical
  };
}

/**
 * Generate SLO alert configuration for SigNoz
 */
function generateSigNozAlertConfig() {
  const alerts = [];

  for (const [key, slo] of Object.entries(SLO_DEFINITIONS)) {
    // Critical alert
    alerts.push({
      name: `${slo.name} - Critical`,
      description: slo.description,
      query: generateSigNozQuery(key, slo),
      condition: {
        type: slo.measurement === 'percentage' ? 'below' : 'above',
        threshold: slo.alert_thresholds.critical,
        for: slo.window
      },
      severity: 'critical',
      channels: ['pagerduty', 'slack-critical'],
      enabled: true,
      tags: ['slo', 'financial', key]
    });

    // Warning alert
    alerts.push({
      name: `${slo.name} - Warning`,
      description: `Warning threshold for ${slo.description}`,
      query: generateSigNozQuery(key, slo),
      condition: {
        type: slo.measurement === 'percentage' ? 'below' : 'above',
        threshold: slo.alert_thresholds.warning,
        for: slo.window
      },
      severity: 'warning',
      channels: ['slack-monitoring'],
      enabled: true,
      tags: ['slo', 'financial', key]
    });
  }

  return alerts;
}

/**
 * Generate SigNoz query for SLO monitoring
 */
function generateSigNozQuery(sloKey, slo) {
  const baseQueries = {
    availability: `avg(rate(http_server_duration_count{status_code!~"5.."}[${slo.window}])) / avg(rate(http_server_duration_count[${slo.window}])) * 100`,
    api_latency_p99: `histogram_quantile(0.99, rate(http_server_duration_bucket[${slo.window}]))`,
    portfolio_load_time: `histogram_quantile(0.95, rate(portfolio_load_time_bucket{operation="load"}[${slo.window}]))`,
    error_rate: `sum(rate(http_server_duration_count{status_code=~"5.."}[${slo.window}])) / sum(rate(http_server_duration_count[${slo.window}])) * 100`,
    critical_error_rate: `sum(rate(errors_critical_rate[${slo.window}])) / sum(rate(http_server_duration_count[${slo.window}])) * 100`,
    login_success_rate: `sum(rate(auth_login_success_rate{success="true"}[${slo.window}])) / sum(rate(auth_login_success_rate[${slo.window}])) * 100`,
    recommendation_generation_time: `histogram_quantile(0.95, rate(stock_api_latency_bucket{operation="recommendations"}[${slo.window}]))`,
    data_freshness: `max(time() - data_last_updated_timestamp)`,
    transaction_accuracy: `sum(rate(portfolio_transaction_volume{accurate="true"}[${slo.window}])) / sum(rate(portfolio_transaction_volume[${slo.window}])) * 100`,
    portfolio_calculation_accuracy: `sum(rate(recommendations_accuracy{accurate="true"}[${slo.window}])) / sum(rate(recommendations_accuracy[${slo.window}])) * 100`
  };

  return baseQueries[sloKey] || `avg(${sloKey}_metric[${slo.window}])`;
}

/**
 * Business error definitions for alerting
 */
const BUSINESS_ERRORS = {
  PORTFOLIO_CALCULATION_ERROR: {
    severity: 'critical',
    impact: 'financial',
    description: 'Portfolio value calculation failed',
    action: 'Immediate investigation required'
  },
  TRANSACTION_PROCESSING_ERROR: {
    severity: 'critical',
    impact: 'financial',
    description: 'Transaction could not be processed',
    action: 'Manual reconciliation may be required'
  },
  MARKET_DATA_STALE: {
    severity: 'high',
    impact: 'data_quality',
    description: 'Market data is stale during trading hours',
    action: 'Check external API connectivity'
  },
  AUTHENTICATION_FAILURE_SPIKE: {
    severity: 'medium',
    impact: 'user_experience',
    description: 'Unusual number of authentication failures',
    action: 'Possible security issue or system problem'
  },
  RECOMMENDATION_ENGINE_DOWN: {
    severity: 'medium',
    impact: 'feature',
    description: 'AI recommendation service is unavailable',
    action: 'Check ML service health'
  },
  DATABASE_CONNECTION_POOL_EXHAUSTED: {
    severity: 'high',
    impact: 'performance',
    description: 'Database connection pool is exhausted',
    action: 'Scale database or optimize queries'
  },
  CACHE_HIT_RATE_LOW: {
    severity: 'low',
    impact: 'performance',
    description: 'Cache hit rate below threshold',
    action: 'Review caching strategy'
  }
};

module.exports = {
  SLO_DEFINITIONS,
  BUSINESS_ERRORS,
  trackSLOMetric,
  calculateSLOCompliance,
  generateSigNozAlertConfig,
  generateSigNozQuery,
  // Export metrics for use in other modules
  metrics: {
    loginSuccessRate,
    portfolioLoadTime,
    stockApiLatency,
    recommendationAccuracy,
    transactionVolume,
    criticalErrorRate,
    dataFreshness
  }
};
