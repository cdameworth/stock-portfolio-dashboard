/**
 * Browser-side Tracing Service
 * Provides user journey tracking and correlation with backend traces
 */

// Generate a unique trace ID that can be correlated with backend
function generateTraceId() {
  return 'browser-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Generate a unique span ID
function generateSpanId() {
  return Math.random().toString(36).substr(2, 9);
}

// Get current market session (client-side version)
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

// Browser performance metrics
function getBrowserMetrics() {
  if (!window.performance) return {};

  const navigation = performance.navigation || {};
  const timing = performance.timing || {};

  return {
    navigation_type: navigation.type || 'unknown',
    redirect_time: timing.redirectEnd - timing.redirectStart || 0,
    dns_time: timing.domainLookupEnd - timing.domainLookupStart || 0,
    connect_time: timing.connectEnd - timing.connectStart || 0,
    response_time: timing.responseEnd - timing.responseStart || 0,
    dom_ready_time: timing.domContentLoadedEventEnd - timing.navigationStart || 0,
    load_time: timing.loadEventEnd - timing.navigationStart || 0
  };
}

// User journey tracking
class BrowserTracer {
  constructor() {
    this.currentSession = generateTraceId();
    this.spans = new Map();
    this.userJourneys = [];
    this.apiEndpoint = '/api/telemetry/browser'; // Backend endpoint for browser traces
    this.batchSize = 50;
    this.flushInterval = 10000; // 10 seconds
    this.eventQueue = [];

    // Start automatic flushing
    this.startAutoFlush();

    // Track page visibility changes
    this.setupVisibilityTracking();

    // Track Core Web Vitals
    this.setupWebVitalsTracking();
  }

  /**
   * Start a new user journey span
   */
  startJourney(journeyName, attributes = {}) {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    const startTime = Date.now();

    const journey = {
      trace_id: traceId,
      span_id: spanId,
      journey_name: journeyName,
      start_time: startTime,
      attributes: {
        'user.session_id': this.currentSession,
        'journey.type': 'user_interaction',
        'browser.user_agent': navigator.userAgent,
        'browser.url': window.location.href,
        'browser.referrer': document.referrer,
        'market.session': getCurrentMarketSession(),
        'timestamp': new Date().toISOString(),
        ...getBrowserMetrics(),
        ...attributes
      },
      events: [],
      spans: []
    };

    this.spans.set(traceId, journey);
    return traceId;
  }

  /**
   * Add an event to a journey
   */
  addJourneyEvent(traceId, eventName, attributes = {}) {
    const journey = this.spans.get(traceId);
    if (!journey) return;

    const event = {
      name: eventName,
      timestamp: Date.now(),
      attributes: {
        'event.type': 'user_action',
        'market.session': getCurrentMarketSession(),
        ...attributes
      }
    };

    journey.events.push(event);

    // Add to queue for immediate sending if it's a critical event
    if (this.isCriticalEvent(eventName)) {
      this.queueForSend(journey, 'critical_event');
    }
  }

  /**
   * Add a child span to a journey (e.g., API call)
   */
  addJourneySpan(traceId, spanName, startTime, endTime, attributes = {}) {
    const journey = this.spans.get(traceId);
    if (!journey) return;

    const span = {
      span_id: generateSpanId(),
      name: spanName,
      start_time: startTime,
      end_time: endTime,
      duration: endTime - startTime,
      attributes: {
        'span.type': 'api_call',
        'market.session': getCurrentMarketSession(),
        ...attributes
      }
    };

    journey.spans.push(span);
  }

  /**
   * End a user journey
   */
  endJourney(traceId, attributes = {}) {
    const journey = this.spans.get(traceId);
    if (!journey) return;

    const endTime = Date.now();
    journey.end_time = endTime;
    journey.duration = endTime - journey.start_time;
    journey.attributes = {
      ...journey.attributes,
      'journey.duration_ms': journey.duration,
      'journey.status': 'completed',
      ...attributes
    };

    // Calculate journey performance metrics
    this.addPerformanceMetrics(journey);

    // Queue for sending
    this.queueForSend(journey, 'journey_completed');

    // Clean up
    this.spans.delete(traceId);
  }

  /**
   * Track API calls with backend correlation
   */
  async traceApiCall(url, options = {}, traceId = null) {
    const apiTraceId = traceId || generateTraceId();
    const startTime = Date.now();

    // Add trace headers for backend correlation
    const headers = {
      ...options.headers,
      'x-trace-id': apiTraceId,
      'x-parent-span-id': traceId ? this.spans.get(traceId)?.span_id : undefined,
      'x-browser-session': this.currentSession
    };

    const enhancedOptions = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, enhancedOptions);
      const endTime = Date.now();

      // Add span to journey if part of one
      if (traceId) {
        this.addJourneySpan(traceId, `API ${options.method || 'GET'} ${url}`, startTime, endTime, {
          'http.method': options.method || 'GET',
          'http.url': url,
          'http.status_code': response.status,
          'http.response_size': response.headers.get('content-length') || 'unknown',
          'api.success': response.ok
        });
      }

      return response;
    } catch (error) {
      const endTime = Date.now();

      // Add error span to journey
      if (traceId) {
        this.addJourneySpan(traceId, `API ${options.method || 'GET'} ${url}`, startTime, endTime, {
          'http.method': options.method || 'GET',
          'http.url': url,
          'error.type': error.name,
          'error.message': error.message,
          'api.success': false
        });
      }

      throw error;
    }
  }

  /**
   * Track portfolio operations
   */
  trackPortfolioOperation(operation, portfolioId, traceId, attributes = {}) {
    this.addJourneyEvent(traceId, 'portfolio.operation', {
      'portfolio.operation': operation,
      'portfolio.id': portfolioId,
      'operation.type': 'financial',
      ...attributes
    });
  }

  /**
   * Track stock operations
   */
  trackStockOperation(operation, symbols, traceId, attributes = {}) {
    const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
    this.addJourneyEvent(traceId, 'stock.operation', {
      'stock.operation': operation,
      'stock.symbols': symbolArray.join(','),
      'stock.symbol_count': symbolArray.length,
      'operation.type': 'market_data',
      ...attributes
    });
  }

  /**
   * Track financial calculations
   */
  trackFinancialCalculation(calculationType, traceId, attributes = {}) {
    this.addJourneyEvent(traceId, 'financial.calculation', {
      'financial.calculation_type': calculationType,
      'operation.type': 'financial',
      'calculation.client_side': true,
      ...attributes
    });
  }

  /**
   * Add performance metrics to journey
   */
  addPerformanceMetrics(journey) {
    // Add Core Web Vitals if available
    if (window.webVitals) {
      journey.attributes = {
        ...journey.attributes,
        ...window.webVitals
      };
    }

    // Add memory usage if available
    if (performance.memory) {
      journey.attributes = {
        ...journey.attributes,
        'memory.used_heap_size': performance.memory.usedJSHeapSize,
        'memory.total_heap_size': performance.memory.totalJSHeapSize,
        'memory.heap_size_limit': performance.memory.jsHeapSizeLimit
      };
    }
  }

  /**
   * Setup Core Web Vitals tracking
   */
  setupWebVitalsTracking() {
    // Initialize web vitals object
    window.webVitals = {};

    // Track Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          window.webVitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        // Fallback for browsers that don't support LCP
      }

      // Track First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            window.webVitals.fid = entry.processingStart - entry.startTime;
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        // Fallback for browsers that don't support FID
      }

      // Track Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              window.webVitals.cls = clsValue;
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        // Fallback for browsers that don't support CLS
      }
    }
  }

  /**
   * Setup page visibility tracking
   */
  setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
      const event = {
        name: 'page.visibility_change',
        timestamp: Date.now(),
        attributes: {
          'page.visible': !document.hidden,
          'event.type': 'page_lifecycle'
        }
      };
      this.eventQueue.push(event);
    });
  }

  /**
   * Check if event is critical and should be sent immediately
   */
  isCriticalEvent(eventName) {
    const criticalEvents = [
      'auth.login_failed',
      'auth.logout',
      'portfolio.error',
      'api.error',
      'financial.calculation_error'
    ];
    return criticalEvents.includes(eventName);
  }

  /**
   * Queue data for sending to backend
   */
  queueForSend(data, priority = 'normal') {
    this.eventQueue.push({
      data,
      priority,
      timestamp: Date.now()
    });

    // Send immediately if critical or queue is full
    if (priority === 'critical_event' || this.eventQueue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Start automatic flushing
   */
  startAutoFlush() {
    setInterval(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });
  }

  /**
   * Flush queued events to backend
   */
  async flush(isSync = false) {
    if (this.eventQueue.length === 0) return;

    const payload = {
      session_id: this.currentSession,
      events: this.eventQueue.splice(0, this.batchSize),
      browser_info: {
        user_agent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        market_session: getCurrentMarketSession()
      }
    };

    try {
      if (isSync && navigator.sendBeacon) {
        // Use sendBeacon for synchronous sending on page unload
        navigator.sendBeacon(this.apiEndpoint, JSON.stringify(payload));
      } else {
        // Regular async sending
        await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (error) {
      console.warn('Failed to send browser telemetry:', error);
      // Re-queue failed events (keep only the most recent ones)
      if (this.eventQueue.length < this.batchSize) {
        this.eventQueue.unshift(...payload.events);
      }
    }
  }
}

// Create singleton instance
const browserTracer = new BrowserTracer();

// Higher-level journey tracking functions
export const userJourneys = {
  // Portfolio journeys
  viewPortfolio: (portfolioId) => {
    const traceId = browserTracer.startJourney('view_portfolio', {
      'portfolio.id': portfolioId,
      'journey.category': 'portfolio'
    });
    return traceId;
  },

  createPortfolio: () => {
    const traceId = browserTracer.startJourney('create_portfolio', {
      'journey.category': 'portfolio'
    });
    return traceId;
  },

  refreshPortfolio: (portfolioId) => {
    const traceId = browserTracer.startJourney('refresh_portfolio', {
      'portfolio.id': portfolioId,
      'journey.category': 'portfolio'
    });
    return traceId;
  },

  // Recommendation journeys
  viewRecommendations: () => {
    const traceId = browserTracer.startJourney('view_recommendations', {
      'journey.category': 'ai_recommendations'
    });
    return traceId;
  },

  generateRecommendations: () => {
    const traceId = browserTracer.startJourney('generate_recommendations', {
      'journey.category': 'ai_recommendations'
    });
    return traceId;
  },

  // Authentication journeys
  login: () => {
    const traceId = browserTracer.startJourney('user_login', {
      'journey.category': 'authentication'
    });
    return traceId;
  },

  logout: () => {
    const traceId = browserTracer.startJourney('user_logout', {
      'journey.category': 'authentication'
    });
    return traceId;
  }
};

// Export the main browser tracer and helper functions
export {
  browserTracer,
  generateTraceId,
  getCurrentMarketSession,
  getBrowserMetrics
};

export default browserTracer;