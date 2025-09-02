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
const redis = require('redis');
require('dotenv').config();

// Import services
const StockService = require('./services/stock-service');
const PortfolioService = require('./services/portfolio-service');
const MetricsService = require('./services/metrics-service');
const AuthService = require('./services/auth-service');
const AIPerformanceService = require('./services/ai-performance-service');
const DatabaseService = require('./services/database-service');
const RecommendationSyncService = require('./services/recommendation-sync-service');

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

const authService = new AuthService({
  dbConfig: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }
});

const aiPerformanceService = new AIPerformanceService({
  stockApiUrl: process.env.STOCK_ANALYTICS_API_URL,
  localApiUrl: `http://localhost:${PORT}`,
  stockService: stockService  // Pass the stock service for direct access
});

// Initialize database service
const databaseService = new DatabaseService({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Initialize Redis client for caching
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

// Initialize recommendation sync service
const recommendationSyncService = new RecommendationSyncService({
  databaseService: databaseService,
  stockService: stockService
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://pagead2.googlesyndication.com", "https://ep2.adtrafficquality.google", "https://*.google.com", "https://*.googleapis.com", "https://*.doubleclick.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://ep1.adtrafficquality.google", "https://ep2.adtrafficquality.google", "https://googleads.g.doubleclick.net", "https://pagead2.googlesyndication.com", "https://*.google.com", "https://*.googleapis.com", "https://*.doubleclick.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com", "https://ep2.adtrafficquality.google", "https://www.google.com", "https://*.google.com"]
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

// Static file serving (without index.html auto-serve to allow custom routing)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  index: false // Disable automatic index.html serving
}));

// Ads.txt route for Google AdSense verification
app.get('/ads.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'public', 'ads.txt'));
});

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
  res.status(200).json(health);
});

// Simple debug endpoint
app.get('/debug', (req, res) => {
  res.status(200).send('Service is running!');
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

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const user = authService.verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Authentication Routes

// Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await authService.registerUser({ email, password });
    const token = authService.generateToken({
      userId: user.id,
      email: user.email,
      plan: user.plan
    });

    metricsService.incrementCounter('user_registrations_total');
    res.status(201).json({ user, token });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });
    
    metricsService.incrementCounter('user_logins_total');
    res.json(result);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.generatePasswordResetToken(email);
    
    // In a real app, you'd send an email here
    logger.info(`Password reset requested for ${email}`);
    
    res.json({ message: 'Password reset link sent' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(400).json({ error: error.message });
  }
});

// API Routes

// Get stock recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    const { type, risk, limit, min_confidence, include_metrics, use_database } = req.query;
    
    // Allow up to 100 recommendations per request for comprehensive data
    const parsedLimit = Math.min(parseInt(limit) || 100, 100);
    
    // Check Redis cache first
    const cacheKey = `recommendations:${type || 'all'}:${risk || 'all'}:${parsedLimit}:${min_confidence || 0}`;
    let recommendations;
    
    try {
      if (redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          logger.info('Returning cached recommendations');
          return res.json(JSON.parse(cached));
        }
      }
    } catch (cacheError) {
      logger.warn('Redis cache read failed:', cacheError.message);
    }
    
    // Try database first if available and requested
    if (use_database !== 'false' && recommendationSyncService) {
      try {
        const dbRecommendations = await recommendationSyncService.getEnrichedRecommendations({
          type: type,
          risk_level: risk,
          limit: parsedLimit,
          since: min_confidence ? null : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
        });
        
        if (dbRecommendations.length > 0) {
          recommendations = {
            recommendations: dbRecommendations,
            source: 'database',
            count: dbRecommendations.length
          };
        }
      } catch (error) {
        logger.warn('Database recommendations failed, falling back to API:', error.message);
      }
    }
    
    // Fallback to stock service if database didn't work
    if (!recommendations) {
      recommendations = await stockService.getRecommendations({
        type: type,
        risk: risk,
        limit: parsedLimit,
        min_confidence: parseFloat(min_confidence) || 0
      });
    }
    
    // Add metadata if requested
    if (include_metrics === 'true' && recommendations.recommendations) {
      recommendations.metadata = {
        request_limit: parsedLimit,
        actual_count: recommendations.recommendations.length,
        has_more: recommendations.recommendations.length === parsedLimit,
        api_timestamp: new Date().toISOString(),
        cache_suggested: true
      };
    }
    
    // Cache the result in Redis for 5 minutes
    try {
      if (redisClient.isReady) {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(recommendations));
      }
    } catch (cacheError) {
      logger.warn('Redis cache write failed:', cacheError.message);
    }
    
    // Track API usage
    metricsService.incrementCounter('api_requests_total', { 
      endpoint: 'recommendations'
    });
    
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
app.get('/api/portfolios', authMiddleware, async (req, res) => {
  try {
    const portfolios = await portfolioService.getUserPortfolios(req.user.userId);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'portfolios' });
    res.json(portfolios);
  } catch (error) {
    logger.error('Error getting portfolios:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'portfolios' });
    res.status(500).json({ error: 'Failed to get portfolios' });
  }
});

app.post('/api/portfolios', authMiddleware, async (req, res) => {
  try {
    const { name, description, symbols } = req.body;
    
    const portfolio = await portfolioService.createPortfolio(req.user.userId, {
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

// Update portfolio
app.put('/api/portfolios/:portfolioId', authMiddleware, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { name, description, symbols } = req.body;
    
    const portfolio = await portfolioService.updatePortfolio(req.user.userId, portfolioId, {
      name,
      description,
      symbols
    });
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'update_portfolio' });
    res.json(portfolio);
  } catch (error) {
    logger.error('Error updating portfolio:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'update_portfolio' });
    res.status(500).json({ error: 'Failed to update portfolio' });
  }
});

// Delete portfolio
app.delete('/api/portfolios/:portfolioId', authMiddleware, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    
    await portfolioService.deletePortfolio(req.user.userId, portfolioId);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'delete_portfolio' });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting portfolio:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'delete_portfolio' });
    res.status(500).json({ error: 'Failed to delete portfolio' });
  }
});

app.get('/api/portfolios/:portfolioId/analysis', authMiddleware, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    
    const analysis = await portfolioService.getPortfolioAnalysis(req.user.userId, portfolioId);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'portfolio_analysis' });
    res.json(analysis);
  } catch (error) {
    logger.error('Error getting portfolio analysis:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'portfolio_analysis' });
    res.status(500).json({ error: 'Failed to get portfolio analysis' });
  }
});

// AI Performance Analytics endpoints

// Get AI performance metrics for a specific period
app.get('/api/ai-performance/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { use_database = 'true' } = req.query;
    
    // Validate period parameter
    const validPeriods = ['1M', '3M', '6M', '1Y'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: ' + validPeriods.join(', ')
      });
    }
    
    logger.info(`Calculating AI performance metrics for period: ${period}`);
    
    let metrics;
    
    // Try database metrics first if available
    if (use_database !== 'false' && recommendationSyncService) {
      try {
        const dbMetrics = await recommendationSyncService.getPerformanceMetrics(period);
        if (dbMetrics && !dbMetrics.error) {
          metrics = {
            ...dbMetrics,
            dataSource: 'database_with_hit_validation',
            calculatedAt: new Date().toISOString()
          };
          logger.info(`Retrieved database performance metrics for ${period}: ${JSON.stringify(dbMetrics)}`);
        }
      } catch (error) {
        logger.warn('Database performance metrics failed, falling back to Yahoo Finance:', error.message);
      }
    }
    
    // Fallback to existing Yahoo Finance approach
    if (!metrics) {
      metrics = await aiPerformanceService.calculatePerformanceMetrics(period);
    }
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'ai_performance' });
    res.json({
      ...metrics,
      requestId: req.headers['x-request-id'] || 'unknown'
    });
    
  } catch (error) {
    logger.error('Error getting AI performance metrics:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'ai_performance' });
    res.status(500).json({ 
      error: 'Failed to calculate AI performance metrics',
      details: error.message
    });
  }
});

// Get hit time accuracy metrics
app.get('/api/ai-performance/:period/hit-accuracy', async (req, res) => {
  try {
    const { period } = req.params;
    
    const validPeriods = ['1M', '3M', '6M', '1Y'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: ' + validPeriods.join(', ')
      });
    }
    
    if (!recommendationSyncService) {
      return res.status(503).json({
        error: 'Database service not available'
      });
    }
    
    logger.info(`Getting hit time accuracy for period: ${period}`);
    
    // Calculate days for period
    const periodDays = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[period];
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    
    const accuracy = await databaseService.getHitTimeAccuracy({ since });
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'hit_accuracy' });
    res.json({
      period,
      ...accuracy,
      calculatedAt: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || 'unknown'
    });
    
  } catch (error) {
    logger.error('Error getting hit time accuracy:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'hit_accuracy' });
    res.status(500).json({ 
      error: 'Failed to get hit time accuracy',
      details: error.message
    });
  }
});

// Get detailed AI performance breakdown by recommendation type
app.get('/api/ai-performance/:period/breakdown', async (req, res) => {
  try {
    const { period } = req.params;
    
    const validPeriods = ['1M', '3M', '6M', '1Y'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ 
        error: 'Invalid period. Must be one of: ' + validPeriods.join(', ')
      });
    }
    
    logger.info(`Getting AI performance breakdown for period: ${period}`);
    
    const breakdown = await aiPerformanceService.getPerformanceBreakdown(period);
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'ai_performance_breakdown' });
    res.json({
      breakdown,
      period,
      calculatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting AI performance breakdown:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'ai_performance_breakdown' });
    res.status(500).json({ 
      error: 'Failed to get AI performance breakdown',
      details: error.message
    });
  }
});

// Clear AI performance cache (for development/testing)
app.post('/api/ai-performance/cache/clear', async (req, res) => {
  try {
    aiPerformanceService.clearCache();
    
    logger.info('AI performance cache cleared');
    metricsService.incrementCounter('api_requests_total', { endpoint: 'ai_cache_clear' });
    
    res.json({ 
      message: 'AI performance cache cleared successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error clearing AI performance cache:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'ai_cache_clear' });
    res.status(500).json({ 
      error: 'Failed to clear cache',
      details: error.message
    });
  }
});

// Get AI performance cache statistics
app.get('/api/ai-performance/cache/stats', async (req, res) => {
  try {
    const stats = aiPerformanceService.getCacheStats();
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'ai_cache_stats' });
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting AI performance cache stats:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'ai_cache_stats' });
    res.status(500).json({ 
      error: 'Failed to get cache stats',
      details: error.message
    });
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

// Serve the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Serve dashboard pages (require authentication)
app.get(['/dashboard', '/portfolio'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle /recommendations route - serve SPA or API data
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
  await recommendationSyncService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await recommendationSyncService.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  // Connect to Redis (non-blocking)
  redisClient.connect().then(() => {
    logger.info('Redis connected successfully');
  }).catch((error) => {
    logger.warn('Redis connection failed, continuing without cache:', error.message);
  });
  logger.info(`Stock Portfolio Dashboard running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Stock Analytics API: ${process.env.STOCK_ANALYTICS_API_URL || 'not configured'}`);
  
  // Initialize metrics
  metricsService.initializeMetrics();
  
  // Initialize database and recommendation sync
  try {
    // Run database migrations first
    try {
      const { runMigrations } = require('./scripts/run-migrations');
      await runMigrations();
      logger.info('Database migrations completed successfully');
    } catch (migrationError) {
      logger.warn('Database migrations failed, continuing anyway:', migrationError.message);
    }
    
    await recommendationSyncService.initialize();
    recommendationSyncService.startSync();
    logger.info('Database and recommendation sync services started');
  } catch (error) {
    logger.error('Failed to start database services:', error);
    logger.warn('Running without database persistence');
  }
});

module.exports = app;