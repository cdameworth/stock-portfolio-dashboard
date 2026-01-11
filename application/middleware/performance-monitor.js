/**
 * Performance Monitoring Middleware
 * Tracks application performance metrics, response times, and system health
 */

'use strict';

const winston = require('winston');
const os = require('os');
const process = require('process');

// Configure performance logger
const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/performance.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'warn' // Only log warnings and errors to console
    })
  ]
});

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimes: []
      },
      endpoints: new Map(),
      system: {
        startTime: Date.now(),
        lastHealthCheck: Date.now()
      },
      errors: {
        total: 0,
        byType: new Map(),
        recent: []
      }
    };

    // Start system monitoring
    this.startSystemMonitoring();
  }

  /**
   * Request tracking middleware
   */
  trackRequest() {
    return (req, res, next) => {
      const startTime = process.hrtime.bigint();
      const requestId = this.generateRequestId();
      
      req.requestId = requestId;
      req.startTime = startTime;

      // Track request start
      this.metrics.requests.total++;

      res.on('finish', () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        this.recordRequestMetrics(req, res, duration);
      });

      next();
    };
  }

  /**
   * Record request metrics
   */
  recordRequestMetrics(req, res, duration) {
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    const isSuccessful = res.statusCode < 400;

    // Update global metrics
    if (isSuccessful) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
      this.recordError(req, res, duration);
    }

    // Update response time metrics
    this.updateResponseTimeMetrics(duration);

    // Update endpoint-specific metrics
    this.updateEndpointMetrics(endpoint, duration, isSuccessful);

    // Log performance data
    const logData = {
      requestId: req.requestId,
      method: req.method,
      endpoint: req.route?.path || req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    if (duration > 1000) { // Log slow requests (>1s)
      performanceLogger.warn('Slow request detected', logData);
    } else if (!isSuccessful) {
      performanceLogger.error('Request failed', logData);
    } else {
      performanceLogger.info('Request completed', logData);
    }
  }

  /**
   * Update response time metrics
   */
  updateResponseTimeMetrics(duration) {
    this.metrics.requests.responseTimes.push(duration);
    
    // Keep only last 1000 response times
    if (this.metrics.requests.responseTimes.length > 1000) {
      this.metrics.requests.responseTimes.shift();
    }

    // Calculate average response time
    const sum = this.metrics.requests.responseTimes.reduce((a, b) => a + b, 0);
    this.metrics.requests.averageResponseTime = sum / this.metrics.requests.responseTimes.length;
  }

  /**
   * Update endpoint-specific metrics
   */
  updateEndpointMetrics(endpoint, duration, isSuccessful) {
    if (!this.metrics.endpoints.has(endpoint)) {
      this.metrics.endpoints.set(endpoint, {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimes: [],
        slowestRequest: 0,
        fastestRequest: Infinity
      });
    }

    const endpointMetrics = this.metrics.endpoints.get(endpoint);
    endpointMetrics.total++;
    
    if (isSuccessful) {
      endpointMetrics.successful++;
    } else {
      endpointMetrics.failed++;
    }

    endpointMetrics.responseTimes.push(duration);
    endpointMetrics.slowestRequest = Math.max(endpointMetrics.slowestRequest, duration);
    endpointMetrics.fastestRequest = Math.min(endpointMetrics.fastestRequest, duration);

    // Keep only last 100 response times per endpoint
    if (endpointMetrics.responseTimes.length > 100) {
      endpointMetrics.responseTimes.shift();
    }

    // Calculate average
    const sum = endpointMetrics.responseTimes.reduce((a, b) => a + b, 0);
    endpointMetrics.averageResponseTime = sum / endpointMetrics.responseTimes.length;
  }

  /**
   * Record error information
   */
  recordError(req, res, duration) {
    this.metrics.errors.total++;
    
    const errorType = `${res.statusCode}`;
    const currentCount = this.metrics.errors.byType.get(errorType) || 0;
    this.metrics.errors.byType.set(errorType, currentCount + 1);

    // Keep recent errors for analysis
    const errorInfo = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };

    this.metrics.errors.recent.push(errorInfo);
    
    // Keep only last 50 errors
    if (this.metrics.errors.recent.length > 50) {
      this.metrics.errors.recent.shift();
    }
  }

  /**
   * Start system monitoring
   */
  startSystemMonitoring() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000); // Every 30 seconds
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    const systemMetrics = {
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      system: {
        uptime,
        loadAverage: os.loadavg(),
        freeMemory: os.freemem(),
        totalMemory: os.totalmem(),
        cpuCount: os.cpus().length
      },
      timestamp: new Date().toISOString()
    };

    // Log system metrics
    performanceLogger.info('System metrics', systemMetrics);

    // Check for performance issues
    this.checkPerformanceThresholds(systemMetrics);

    this.metrics.system.lastHealthCheck = Date.now();
  }

  /**
   * Check performance thresholds and alert if needed
   */
  checkPerformanceThresholds(systemMetrics) {
    const warnings = [];

    // Memory usage warnings
    const memoryUsagePercent = (systemMetrics.memory.heapUsed / systemMetrics.memory.heapTotal) * 100;
    if (memoryUsagePercent > 80) {
      warnings.push(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
    }

    // Response time warnings
    if (this.metrics.requests.averageResponseTime > 1000) {
      warnings.push(`High average response time: ${this.metrics.requests.averageResponseTime.toFixed(2)}ms`);
    }

    // Error rate warnings
    const errorRate = (this.metrics.requests.failed / this.metrics.requests.total) * 100;
    if (errorRate > 5) {
      warnings.push(`High error rate: ${errorRate.toFixed(2)}%`);
    }

    // System load warnings
    const loadAverage = systemMetrics.system.loadAverage[0];
    if (loadAverage > systemMetrics.system.cpuCount * 0.8) {
      warnings.push(`High system load: ${loadAverage.toFixed(2)}`);
    }

    if (warnings.length > 0) {
      performanceLogger.warn('Performance thresholds exceeded', {
        warnings,
        metrics: systemMetrics,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const uptime = Date.now() - this.metrics.system.startTime;
    const requestsPerSecond = this.metrics.requests.total / (uptime / 1000);
    const errorRate = (this.metrics.requests.failed / this.metrics.requests.total) * 100;

    return {
      uptime,
      requests: {
        total: this.metrics.requests.total,
        successful: this.metrics.requests.successful,
        failed: this.metrics.requests.failed,
        requestsPerSecond: requestsPerSecond.toFixed(2),
        errorRate: errorRate.toFixed(2),
        averageResponseTime: this.metrics.requests.averageResponseTime.toFixed(2)
      },
      endpoints: this.getTopEndpoints(),
      errors: {
        total: this.metrics.errors.total,
        byType: Object.fromEntries(this.metrics.errors.byType),
        recent: this.metrics.errors.recent.slice(-10) // Last 10 errors
      },
      system: {
        lastHealthCheck: new Date(this.metrics.system.lastHealthCheck).toISOString()
      }
    };
  }

  /**
   * Get top endpoints by request count
   */
  getTopEndpoints(limit = 10) {
    return Array.from(this.metrics.endpoints.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, limit)
      .map(([endpoint, metrics]) => ({
        endpoint,
        total: metrics.total,
        successful: metrics.successful,
        failed: metrics.failed,
        averageResponseTime: metrics.averageResponseTime.toFixed(2),
        slowestRequest: metrics.slowestRequest.toFixed(2),
        fastestRequest: metrics.fastestRequest === Infinity ? 0 : metrics.fastestRequest.toFixed(2)
      }));
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics() {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0,
        responseTimes: []
      },
      endpoints: new Map(),
      system: {
        startTime: Date.now(),
        lastHealthCheck: Date.now()
      },
      errors: {
        total: 0,
        byType: new Map(),
        recent: []
      }
    };
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
  performanceMonitor,
  trackRequest: () => performanceMonitor.trackRequest(),
  getPerformanceSummary: () => performanceMonitor.getPerformanceSummary(),
  resetMetrics: () => performanceMonitor.resetMetrics()
};
