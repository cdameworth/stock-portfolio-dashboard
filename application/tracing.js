'use strict';

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { detectResources, resourceFromAttributes, defaultResource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { awsEcsDetector, awsEc2Detector } = require('@opentelemetry/resource-detector-aws');

// Initialize the OTLP exporter for SigNoz Cloud with proper timeout and retry configuration
const exporterOptions = {
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'https://ingest.us.signoz.cloud:443/v1/traces',
  headers: {
    'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN || 'NyZfiwSS68wZgbU9QMPzWcY-Qo9bXGjmWLN7'
  },
  timeoutMillis: 30000, // Increase timeout to 30 seconds
  concurrencyLimit: 10, // Limit concurrent requests to prevent connection overload
  compression: 'gzip' // Enable compression to reduce payload size
};

const traceExporter = new OTLPTraceExporter(exporterOptions);

// Add console exporter for debugging if OTEL_LOG_LEVEL is debug
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const consoleExporter = new ConsoleSpanExporter();

// Use console exporter for debugging when OTEL_TRACES_EXPORTER=console
const shouldUseConsole = process.env.OTEL_TRACES_EXPORTER === 'console' || process.env.OTEL_LOG_LEVEL === 'debug';
const finalExporter = shouldUseConsole ? consoleExporter : traceExporter;

// Async function to initialize SDK with AWS resource detection
async function initializeSDK() {
  // Detect AWS resources (ECS, EC2) for SigNoz infrastructure visibility
  let detectedResource;
  try {
    detectedResource = await detectResources({
      detectors: [awsEcsDetector, awsEc2Detector],
    });
    console.log('AWS resources detected:', detectedResource.attributes);
  } catch (error) {
    console.warn('AWS resource detection failed:', error.message);
    detectedResource = defaultResource();
  }

  // Merge detected resources with manual attributes
  const resource = detectedResource.merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'stock-portfolio-dashboard',
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'production'
    })
  );

  // Create SDK with detected resources
  const sdk = new opentelemetry.NodeSDK({
    traceExporter: finalExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            return req.url?.includes('/health') ||
                   req.url?.includes('/static') ||
                   req.url?.includes('/favicon');
          }
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true
        }
      })
    ],
    resource: resource
  });

  return sdk;
}

// Initialize the SDK and register with the OpenTelemetry API
console.log('Starting OpenTelemetry with configuration:', {
  exporter: shouldUseConsole ? 'console' : 'SigNoz OTLP',
  endpoint: exporterOptions.url,
  timeout: exporterOptions.timeoutMillis,
  compression: exporterOptions.compression,
  concurrencyLimit: exporterOptions.concurrencyLimit
});

let sdk;

// Initialize SDK asynchronously with AWS resource detection
initializeSDK().then((initializedSDK) => {
  sdk = initializedSDK;
  try {
    sdk.start();
    console.log('OpenTelemetry started successfully with AWS resource detection');
    if (shouldUseConsole) {
      console.log('Using console exporter for debugging. Set OTEL_TRACES_EXPORTER=otlp to send to SigNoz.');
    }
  } catch (error) {
    console.error('Error starting OpenTelemetry:', error);
    // Don't fail the application if telemetry fails to start
  }
}).catch((error) => {
  console.error('Error initializing OpenTelemetry SDK:', error);
});

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  if (sdk) {
    sdk
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

module.exports = { sdk };