/**
 * Browser Telemetry Middleware
 * Receives and processes frontend tracing data
 */

const winston = require('winston');
const {
  withSpan,
  traceBusinessLogic,
  addSpanAttributes,
  recordSpanEvent
} = require('../otel-helpers');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'browser-telemetry' },
  transports: [
    new winston.transports.Console()
  ]
});

/**
 * Process browser telemetry data and create backend spans
 */
async function processBrowserTelemetry(req, res) {
  return traceBusinessLogic('process_browser_telemetry', {
    'telemetry.source': 'browser',
    'telemetry.session_id': req.body.session_id
  }, async () => {
    try {
      const { session_id, events, browser_info } = req.body;

      if (!session_id || !events || !Array.isArray(events)) {
        res.status(400).json({ error: 'Invalid telemetry data' });
        return;
      }

      addSpanAttributes({
        'browser.session_id': session_id,
        'browser.event_count': events.length,
        'browser.user_agent': browser_info?.user_agent || 'unknown',
        'browser.url': browser_info?.url || 'unknown',
        'browser.market_session': browser_info?.market_session || 'unknown'
      });

      recordSpanEvent('browser_telemetry.received', {
        event_count: events.length,
        session_id: session_id
      });

      // Process each event/journey
      for (const event of events) {
        await processBrowserEvent(event, session_id, browser_info);
      }

      // Log summary
      logger.info('Processed browser telemetry', {
        session_id,
        event_count: events.length,
        browser_url: browser_info?.url,
        market_session: browser_info?.market_session
      });

      recordSpanEvent('browser_telemetry.processed', {
        event_count: events.length,
        processing_success: true
      });

      res.status(200).json({
        status: 'success',
        processed_events: events.length
      });

    } catch (error) {
      recordSpanEvent('browser_telemetry.error', {
        error_type: error.name,
        error_message: error.message
      });

      logger.error('Error processing browser telemetry:', error);
      res.status(500).json({ error: 'Failed to process telemetry data' });
    }
  });
}

/**
 * Process individual browser event and create corresponding backend span
 */
async function processBrowserEvent(eventData, sessionId, browserInfo) {
  return withSpan('browser_event.process', async () => {
    const { data, priority, timestamp } = eventData;

    if (!data) return;

    // Determine span name based on event type
    let spanName = 'browser.unknown_event';
    const attributes = {
      'browser.session_id': sessionId,
      'browser.event_priority': priority || 'normal',
      'browser.event_timestamp': timestamp,
      'browser.user_agent': browserInfo?.user_agent || 'unknown',
      'browser.market_session': browserInfo?.market_session || 'unknown'
    };

    if (data.journey_name) {
      // This is a user journey
      spanName = `browser.journey.${data.journey_name}`;
      attributes['browser.journey_name'] = data.journey_name;
      attributes['browser.journey_duration'] = data.duration || 0;
      attributes['browser.journey_status'] = data.attributes?.['journey.status'] || 'unknown';

      // Add journey-specific attributes
      if (data.attributes) {
        Object.entries(data.attributes).forEach(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number') {
            attributes[`browser.${key}`] = value;
          }
        });
      }

      // Process journey events
      if (data.events && Array.isArray(data.events)) {
        attributes['browser.event_count'] = data.events.length;

        // Record significant events
        data.events.forEach(event => {
          recordSpanEvent(`browser.${event.name}`, {
            event_timestamp: event.timestamp,
            ...event.attributes
          });
        });
      }

      // Process journey spans (API calls, etc.)
      if (data.spans && Array.isArray(data.spans)) {
        attributes['browser.span_count'] = data.spans.length;

        // Record API call performance
        data.spans.forEach(span => {
          if (span.attributes?.['span.type'] === 'api_call') {
            recordSpanEvent('browser.api_call', {
              api_url: span.attributes['http.url'],
              api_method: span.attributes['http.method'],
              api_status: span.attributes['http.status_code'],
              api_duration: span.duration,
              api_success: span.attributes['api.success']
            });
          }
        });
      }

      // Add performance metrics for completed journeys
      if (data.attributes?.['journey.status'] === 'completed') {
        addPerformanceMetrics(data, attributes);
      }

    } else if (data.name) {
      // This is a standalone event
      spanName = `browser.event.${data.name}`;
      attributes['browser.event_name'] = data.name;

      if (data.attributes) {
        Object.entries(data.attributes).forEach(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number') {
            attributes[`browser.${key}`] = value;
          }
        });
      }
    }

    // Set span attributes
    addSpanAttributes(attributes);

    // Log based on priority
    if (priority === 'critical_event') {
      logger.error('Critical browser event', { spanName, attributes });
    } else {
      logger.info('Browser event processed', { spanName, eventType: data.journey_name || data.name });
    }

  }, {
    'browser.event_type': eventData.data?.journey_name || eventData.data?.name || 'unknown'
  });
}

/**
 * Add performance metrics to span attributes
 */
function addPerformanceMetrics(journeyData, attributes) {
  const performanceKeys = [
    'lcp', 'fid', 'cls', // Core Web Vitals
    'navigation_type', 'dns_time', 'connect_time', 'response_time', 'dom_ready_time', 'load_time', // Navigation timing
    'memory.used_heap_size', 'memory.total_heap_size', 'memory.heap_size_limit' // Memory usage
  ];

  performanceKeys.forEach(key => {
    if (journeyData.attributes && journeyData.attributes[key] !== undefined) {
      attributes[`performance.${key}`] = journeyData.attributes[key];
    }
  });

  // Calculate performance score
  const performanceScore = calculatePerformanceScore(journeyData.attributes);
  if (performanceScore !== null) {
    attributes['performance.score'] = performanceScore;
  }
}

/**
 * Calculate a simple performance score based on Core Web Vitals
 */
function calculatePerformanceScore(attrs) {
  if (!attrs) return null;

  let score = 100;

  // LCP scoring (good: <2.5s, needs improvement: 2.5-4s, poor: >4s)
  if (attrs.lcp) {
    if (attrs.lcp > 4000) score -= 30;
    else if (attrs.lcp > 2500) score -= 15;
  }

  // FID scoring (good: <100ms, needs improvement: 100-300ms, poor: >300ms)
  if (attrs.fid) {
    if (attrs.fid > 300) score -= 25;
    else if (attrs.fid > 100) score -= 10;
  }

  // CLS scoring (good: <0.1, needs improvement: 0.1-0.25, poor: >0.25)
  if (attrs.cls) {
    if (attrs.cls > 0.25) score -= 20;
    else if (attrs.cls > 0.1) score -= 10;
  }

  return Math.max(0, score);
}

/**
 * Extract correlation headers from browser requests
 */
function extractCorrelationHeaders(req, res, next) {
  // Extract browser trace correlation headers
  const browserTraceId = req.headers['x-trace-id'];
  const parentSpanId = req.headers['x-parent-span-id'];
  const browserSession = req.headers['x-browser-session'];
  const portfolioId = req.headers['x-portfolio-id'];

  if (browserTraceId) {
    // Add correlation attributes to any spans created in this request
    req.traceContext = {
      browserTraceId,
      parentSpanId,
      browserSession,
      portfolioId
    };

    // Add to response headers for debugging
    res.setHeader('x-backend-trace-correlation', 'true');
  }

  next();
}

/**
 * Middleware to add browser correlation to backend spans
 */
function addBrowserCorrelation(req, res, next) {
  if (req.traceContext) {
    // This will be picked up by any tracing functions in the request
    addSpanAttributes({
      'browser.trace_id': req.traceContext.browserTraceId,
      'browser.parent_span_id': req.traceContext.parentSpanId,
      'browser.session_id': req.traceContext.browserSession,
      'browser.portfolio_id': req.traceContext.portfolioId,
      'correlation.frontend_backend': true
    });

    recordSpanEvent('browser.correlation_established', {
      browser_trace_id: req.traceContext.browserTraceId,
      has_portfolio_context: !!req.traceContext.portfolioId
    });
  }

  next();
}

module.exports = {
  processBrowserTelemetry,
  extractCorrelationHeaders,
  addBrowserCorrelation,
  processBrowserEvent
};