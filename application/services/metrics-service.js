'use strict';

const client = require('prom-client');

class MetricsService {
  constructor() {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry });

    this.apiRequests = new client.Counter({
      name: 'api_requests_total',
      help: 'Total API requests',
      labelNames: ['endpoint']
    });
    this.apiErrors = new client.Counter({
      name: 'api_errors_total',
      help: 'Total API errors',
      labelNames: ['endpoint']
    });
    this.sseConnections = new client.Counter({
      name: 'sse_connections_total',
      help: 'Total SSE connections'
    });
    this.unhandledErrors = new client.Counter({
      name: 'unhandled_errors_total',
      help: 'Unhandled errors'
    });

    this.registry.registerMetric(this.apiRequests);
    this.registry.registerMetric(this.apiErrors);
    this.registry.registerMetric(this.sseConnections);
    this.registry.registerMetric(this.unhandledErrors);
  }

  initializeMetrics() {
    // no-op; default metrics already registered
  }

  incrementCounter(name, labels = {}) {
    switch (name) {
      case 'api_requests_total':
        this.apiRequests.inc(labels);
        break;
      case 'api_errors_total':
        this.apiErrors.inc(labels);
        break;
      case 'sse_connections_total':
        this.sseConnections.inc();
        break;
      case 'unhandled_errors_total':
        this.unhandledErrors.inc();
        break;
      default:
        break;
    }
  }

  async getMetrics() {
    return this.registry.metrics();
  }
}

module.exports = MetricsService;