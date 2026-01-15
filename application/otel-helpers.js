/**
 * OpenTelemetry Helper Functions
 * Custom tracing utilities for manual instrumentation
 */

const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

// Get the tracer instance
const tracer = trace.getTracer('stock-portfolio-dashboard', '1.0.0');

/**
 * Create a custom span with automatic error handling
 * @param {string} name - Span name
 * @param {Function} fn - Function to execute within the span
 * @param {Object} attributes - Additional span attributes
 * @returns {Promise} Result of the function execution
 */
async function withSpan(name, fn, attributes = {}) {
  const span = tracer.startSpan(name, {
    attributes: {
      'service.name': 'stock-portfolio-dashboard',
      ...attributes
    }
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace a database operation
 * @param {string} operation - Database operation name
 * @param {string} table - Table name
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the operation
 */
async function traceDbOperation(operation, table, fn) {
  return withSpan(`db.${operation}`, fn, {
    'db.operation': operation,
    'db.table': table,
    'db.system': 'postgresql'
  });
}

/**
 * Trace an API call
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the API call
 */
async function traceApiCall(endpoint, method, fn) {
  return withSpan(`api.${method.toLowerCase()}.${endpoint}`, fn, {
    'http.method': method,
    'http.url': endpoint,
    'component': 'http'
  });
}

/**
 * Trace a business logic operation
 * @param {string} operation - Operation name
 * @param {Object} metadata - Additional metadata
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the operation
 */
async function traceBusinessLogic(operation, metadata, fn) {
  return withSpan(`business.${operation}`, fn, {
    'business.operation': operation,
    ...metadata
  });
}

/**
 * Trace financial calculations with specific attributes
 * @param {string} calculationType - Type of calculation
 * @param {Object} metadata - Financial metadata
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the calculation
 */
async function traceFinancialCalculation(calculationType, metadata, fn) {
  const attributes = {
    'financial.calculation_type': calculationType,
    'financial.market_session': getCurrentMarketSession(),
    'financial.timestamp': new Date().toISOString(),
    ...metadata
  };

  return withSpan(`financial.${calculationType}`, fn, attributes);
}

/**
 * Trace portfolio operations with portfolio-specific context
 * @param {string} operation - Portfolio operation
 * @param {string} portfolioId - Portfolio ID
 * @param {Object} metadata - Additional metadata
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the operation
 */
async function tracePortfolioOperation(operation, portfolioId, metadata, fn) {
  const attributes = {
    'portfolio.operation': operation,
    'portfolio.id': portfolioId,
    'portfolio.user_id': metadata.userId || 'unknown',
    'portfolio.market_session': getCurrentMarketSession(),
    ...metadata
  };

  return withSpan(`portfolio.${operation}`, fn, attributes);
}

/**
 * Trace stock data operations with market context
 * @param {string} operation - Stock operation
 * @param {Array|string} symbols - Stock symbols
 * @param {Object} metadata - Additional metadata
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the operation
 */
async function traceStockOperation(operation, symbols, metadata, fn) {
  const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
  const attributes = {
    'stock.operation': operation,
    'stock.symbols': symbolArray.join(','),
    'stock.symbol_count': symbolArray.length,
    'stock.market_session': getCurrentMarketSession(),
    'stock.data_source': metadata.dataSource || 'unknown',
    ...metadata
  };

  return withSpan(`stock.${operation}`, fn, attributes);
}

/**
 * Trace AI/ML operations with model context
 * @param {string} operation - AI operation
 * @param {Object} metadata - ML metadata
 * @param {Function} fn - Function to execute
 * @returns {Promise} Result of the operation
 */
async function traceAIOperation(operation, metadata, fn) {
  const attributes = {
    'ai.operation': operation,
    'ai.model_version': metadata.modelVersion || 'v1.0',
    'ai.input_size': metadata.inputSize || 0,
    'ai.market_session': getCurrentMarketSession(),
    ...metadata
  };

  return withSpan(`ai.${operation}`, fn, attributes);
}

/**
 * Get current market session
 * @returns {string} Market session status
 */
function getCurrentMarketSession() {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  const hour = easternTime.getHours();
  const day = easternTime.getDay();

  // Weekend
  if (day === 0 || day === 6) return 'weekend';

  // Market hours: 9:30 AM - 4:00 PM Eastern
  if (hour >= 9 && hour < 16) {
    if (hour === 9 && easternTime.getMinutes() < 30) return 'pre_market';
    return 'market_hours';
  } else if (hour >= 4 && hour < 20) {
    return 'after_market';
  } else {
    return 'closed';
  }
}

/**
 * Add custom attributes to the current span
 * @param {Object} attributes - Attributes to add
 */
function addSpanAttributes(attributes) {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Record an event in the current span
 * @param {string} name - Event name
 * @param {Object} attributes - Event attributes
 */
function recordSpanEvent(name, attributes = {}) {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

module.exports = {
  withSpan,
  traceDbOperation,
  traceApiCall,
  traceBusinessLogic,
  traceFinancialCalculation,
  tracePortfolioOperation,
  traceStockOperation,
  traceAIOperation,
  addSpanAttributes,
  recordSpanEvent,
  getCurrentMarketSession,
  tracer
};
