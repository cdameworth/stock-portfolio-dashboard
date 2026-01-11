/**
 * React Hook for Browser Tracing
 * Provides easy integration of user journey tracking in React components
 */

import { useRef, useEffect, useCallback } from 'react';
import { browserTracer, userJourneys, generateTraceId } from '../services/browser-tracing.js';

/**
 * Main tracing hook for React components
 */
export function useTracing() {
  const activeJourneys = useRef(new Map());

  const startJourney = useCallback((journeyName, attributes = {}) => {
    const traceId = browserTracer.startJourney(journeyName, {
      'component.name': attributes.componentName || 'unknown',
      'component.props': JSON.stringify(attributes.props || {}),
      ...attributes
    });

    activeJourneys.current.set(journeyName, traceId);
    return traceId;
  }, []);

  const endJourney = useCallback((journeyName, attributes = {}) => {
    const traceId = activeJourneys.current.get(journeyName);
    if (traceId) {
      browserTracer.endJourney(traceId, attributes);
      activeJourneys.current.delete(journeyName);
    }
  }, []);

  const addEvent = useCallback((journeyName, eventName, attributes = {}) => {
    const traceId = activeJourneys.current.get(journeyName);
    if (traceId) {
      browserTracer.addJourneyEvent(traceId, eventName, attributes);
    }
  }, []);

  const trackApiCall = useCallback(async (url, options = {}, journeyName = null) => {
    const traceId = journeyName ? activeJourneys.current.get(journeyName) : null;
    return browserTracer.traceApiCall(url, options, traceId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // End any active journeys when component unmounts
      activeJourneys.current.forEach((traceId, journeyName) => {
        browserTracer.endJourney(traceId, { 'journey.status': 'component_unmounted' });
      });
      activeJourneys.current.clear();
    };
  }, []);

  return {
    startJourney,
    endJourney,
    addEvent,
    trackApiCall,
    getActiveJourneys: () => Array.from(activeJourneys.current.keys())
  };
}

/**
 * Hook for portfolio-specific tracing
 */
export function usePortfolioTracing() {
  const { trackApiCall } = useTracing();

  const trackPortfolioView = useCallback((portfolioId) => {
    return userJourneys.viewPortfolio(portfolioId);
  }, []);

  const trackPortfolioCreate = useCallback(() => {
    return userJourneys.createPortfolio();
  }, []);

  const trackPortfolioRefresh = useCallback((portfolioId) => {
    return userJourneys.refreshPortfolio(portfolioId);
  }, []);

  const trackPortfolioApiCall = useCallback(async (url, options, portfolioId) => {
    // Add portfolio context to API calls
    const enhancedOptions = {
      ...options,
      headers: {
        ...options.headers,
        'x-portfolio-id': portfolioId
      }
    };
    return trackApiCall(url, enhancedOptions);
  }, [trackApiCall]);

  return {
    trackPortfolioView,
    trackPortfolioCreate,
    trackPortfolioRefresh,
    trackPortfolioApiCall
  };
}

/**
 * Hook for authentication tracing
 */
export function useAuthTracing() {
  const { addEvent } = useTracing();

  const trackLogin = useCallback((method = 'form') => {
    const traceId = userJourneys.login();
    browserTracer.addJourneyEvent(traceId, 'auth.login_attempt', {
      'auth.method': method,
      'auth.timestamp': new Date().toISOString()
    });
    return traceId;
  }, []);

  const trackLoginSuccess = useCallback((traceId, userId) => {
    if (traceId) {
      browserTracer.addJourneyEvent(traceId, 'auth.login_success', {
        'auth.user_id': userId,
        'auth.success': true
      });
      browserTracer.endJourney(traceId, { 'auth.status': 'success' });
    }
  }, []);

  const trackLoginFailure = useCallback((traceId, error) => {
    if (traceId) {
      browserTracer.addJourneyEvent(traceId, 'auth.login_failed', {
        'auth.error': error,
        'auth.success': false
      });
      browserTracer.endJourney(traceId, { 'auth.status': 'failed' });
    }
  }, []);

  const trackLogout = useCallback(() => {
    const traceId = userJourneys.logout();
    browserTracer.addJourneyEvent(traceId, 'auth.logout_initiated', {
      'auth.timestamp': new Date().toISOString()
    });
    return traceId;
  }, []);

  return {
    trackLogin,
    trackLoginSuccess,
    trackLoginFailure,
    trackLogout
  };
}

/**
 * Hook for stock/recommendation tracing
 */
export function useStockTracing() {
  const { trackApiCall } = useTracing();

  const trackRecommendationView = useCallback(() => {
    return userJourneys.viewRecommendations();
  }, []);

  const trackRecommendationGeneration = useCallback(() => {
    return userJourneys.generateRecommendations();
  }, []);

  const trackStockSearch = useCallback((symbol, traceId) => {
    if (traceId) {
      browserTracer.addJourneyEvent(traceId, 'stock.search', {
        'stock.symbol': symbol,
        'search.type': 'symbol_lookup'
      });
    }
  }, []);

  const trackPriceRefresh = useCallback((symbols, traceId) => {
    if (traceId) {
      const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
      browserTracer.trackStockOperation('price_refresh', symbolArray, traceId, {
        'refresh.type': 'manual',
        'refresh.symbol_count': symbolArray.length
      });
    }
  }, []);

  return {
    trackRecommendationView,
    trackRecommendationGeneration,
    trackStockSearch,
    trackPriceRefresh
  };
}

/**
 * Hook for performance tracking
 */
export function usePerformanceTracing() {
  const measureComponentRender = useCallback((componentName, renderFn) => {
    const startTime = performance.now();
    const result = renderFn();
    const endTime = performance.now();

    // Send performance data
    browserTracer.addJourneyEvent(generateTraceId(), 'component.render', {
      'component.name': componentName,
      'component.render_time': endTime - startTime,
      'performance.type': 'render_timing'
    });

    return result;
  }, []);

  const trackPageLoad = useCallback((pageName) => {
    const traceId = browserTracer.startJourney('page_load', {
      'page.name': pageName,
      'journey.category': 'navigation'
    });

    // End the journey after a short delay to capture full page load
    setTimeout(() => {
      browserTracer.endJourney(traceId, {
        'page.load_complete': true,
        'page.interactive': document.readyState === 'complete'
      });
    }, 100);

    return traceId;
  }, []);

  return {
    measureComponentRender,
    trackPageLoad
  };
}

/**
 * Hook for error tracking
 */
export function useErrorTracing() {
  const trackError = useCallback((error, context = {}) => {
    const traceId = browserTracer.startJourney('error_occurred', {
      'error.name': error.name || 'unknown',
      'error.message': error.message || 'unknown error',
      'error.stack': error.stack || 'no stack trace',
      'error.context': JSON.stringify(context),
      'journey.category': 'error'
    });

    browserTracer.addJourneyEvent(traceId, 'error.captured', {
      'error.type': error.constructor.name,
      'error.fatal': context.fatal || false,
      'error.source': context.source || 'javascript'
    });

    browserTracer.endJourney(traceId, { 'error.handled': true });
    return traceId;
  }, []);

  const trackApiError = useCallback((url, error, response = null) => {
    const traceId = browserTracer.startJourney('api_error', {
      'api.url': url,
      'api.error': error.message,
      'api.status': response?.status || 'unknown',
      'journey.category': 'api_error'
    });

    browserTracer.addJourneyEvent(traceId, 'api.error_occurred', {
      'api.method': 'unknown', // Should be passed in
      'api.error_type': error.name,
      'api.recoverable': false // Should be determined by caller
    });

    browserTracer.endJourney(traceId, { 'api.error_handled': true });
    return traceId;
  }, []);

  return {
    trackError,
    trackApiError
  };
}

export default useTracing;