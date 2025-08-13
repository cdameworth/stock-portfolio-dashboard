/**
 * Stock Portfolio Dashboard - Main Server
 * Express.js application that serves the web dashboard
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const winston = require('winston');
const expressWinston = require('express-winston');
require('dotenv').config();

// Import services
const StockService = require('./services/stock-service');
const PortfolioService = require('./services/portfolio-service');
const MetricsService = require('./services/metrics-service');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

const IS_PROD = (process.env.NODE_ENV || '').toLowerCase() === 'production';

app.set('trust proxy', 1);

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'stock-portfolio-dashboard' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize services
const stockService = new StockService({
  apiUrl: process.env.STOCK_ANALYTICS_API_URL
});

const portfolioService = new PortfolioService({
  dbConfig: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }
});

const metricsService = new MetricsService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  // Suppress COOP warning in non-secure contexts (dev). For prod HTTPS, you can enable defaults.
  crossOriginOpenerPolicy: IS_PROD ? { policy: "same-origin" } : false,
  crossOriginEmbedderPolicy: IS_PROD ? true : false,
  hsts: IS_PROD ? undefined : false
}));

// In non-secure contexts, explicitly opt-out of Origin-Agent-Cluster to avoid mixed clustering
if (!IS_PROD) {
  app.use((req, res, next) => {
    res.setHeader('Origin-Agent-Cluster', '?0');
    next();
  });
}
// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
// Request logging
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}}',
  expressFormat: true,
  colorize: false,
  ignoreRoute: function (req, res) {
    return req.url === '/health' || req.url === '/metrics';
  }
}));

// Static file serving
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      stockApi: 'unknown', // Would need to implement health check
      database: 'unknown'  // Would need to implement health check
    }
  };
  res.json(health);
});

// Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await metricsService.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// API Routes

// Get stock recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    const { type, risk, limit, min_confidence } = req.query;
    
    const recommendations = await stockService.getRecommendations({
      type: type,
      risk: risk,
      limit: parseInt(limit) || 10,
      min_confidence: parseFloat(min_confidence) || 0
    });
    
    // Track API usage
    metricsService.incrementCounter('api_requests_total', { endpoint: 'recommendations' });
    
    res.json(recommendations);
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'recommendations' });
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get recommendation for specific symbol
app.get('/api/recommendations/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { include_history } = req.query;
    
    const recommendation = await stockService.getRecommendationBySymbol(symbol, {
      include_history: include_history === 'true'
    });
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'recommendation_by_symbol' });
    
    res.json(recommendation);
  } catch (error) {
    logger.error(`Error getting recommendation for ${req.params.symbol}:`, error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'recommendation_by_symbol' });
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get recommendation' });
    }
  }
});

// Portfolio management endpoints
app.get('/api/portfolios', async (req, res) => {
  try {
    const userId = req.session?.userId || 'anonymous';
    const portfolios = await portfolioService.getUserPortfolios(userId);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'portfolios' });
    res.json(portfolios);
  } catch (error) {
    logger.error('Error getting portfolios:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'portfolios' });
    res.status(500).json({ error: 'Failed to get portfolios' });
  }
});

app.post('/api/portfolios', async (req, res) => {
  try {
    const userId = req.session?.userId || 'anonymous';
    const { name, description, symbols } = req.body;
    
    const portfolio = await portfolioService.createPortfolio(userId, {
      name,
      description,
      symbols
    });
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'create_portfolio' });
    res.status(201).json(portfolio);
  } catch (error) {
    logger.error('Error creating portfolio:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'create_portfolio' });
    res.status(500).json({ error: 'Failed to create portfolio' });
  }
});

app.get('/api/portfolios/:portfolioId/analysis', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = req.session?.userId || 'anonymous';
    
    const analysis = await portfolioService.getPortfolioAnalysis(userId, portfolioId);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'portfolio_analysis' });
    res.json(analysis);
  } catch (error) {
    logger.error('Error getting portfolio analysis:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'portfolio_analysis' });
    res.status(500).json({ error: 'Failed to get portfolio analysis' });
  }
});

// WebSocket-like endpoint for real-time updates (using Server-Sent Events)
app.get('/api/stream/recommendations', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial data
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\\n\\n`);
  
  // Set up periodic updates
  const updateInterval = setInterval(async () => {
    try {
      const recommendations = await stockService.getRecommendations({ limit: 5 });
      res.write(`data: ${JSON.stringify({ 
        type: 'recommendations_update', 
        data: recommendations,
        timestamp: new Date().toISOString()
      })}\\n\\n`);
    } catch (error) {
      logger.error('Error in SSE update:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: 'Failed to get updates',
        timestamp: new Date().toISOString()
      })}\\n\\n`);
    }
  }, 30000); // Update every 30 seconds
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(updateInterval);
    logger.info('SSE client disconnected');
  });
  
  metricsService.incrementCounter('sse_connections_total');
});

app.get('/recommendations', async (req, res, next) => {
  try {
    // If the client wants HTML, serve the SPA
    if (req.accepts(['html', 'json']) === 'html') {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }

    // Otherwise serve JSON (alias to /api/recommendations)
    const { type, risk, limit, min_confidence } = req.query;
    const data = await stockService.getRecommendations({
      type,
      risk,
      limit: parseInt(limit) || 10,
      min_confidence: parseFloat(min_confidence) || 0
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Serve the main dashboard page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve dashboard pages
app.get(['/dashboard', '/portfolio'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use(expressWinston.errorLogger({
  winstonInstance: logger
}));

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  metricsService.incrementCounter('unhandled_errors_total');
  res.status(500).json({ 
    error: 'Internal server error',
    requestId: req.id 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Stock Portfolio Dashboard running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Stock Analytics API: ${process.env.STOCK_ANALYTICS_API_URL || 'not configured'}`);
  
  // Initialize metrics
  metricsService.initializeMetrics();
});

module.exports = app;