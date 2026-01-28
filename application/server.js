/**
 * Stock Portfolio Dashboard - Main Server
 * Express.js application that serves the web dashboard
 */

// IMPORTANT: Initialize OpenTelemetry FIRST before any other modules
require('./tracing');

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

// Log environment variables for debugging (without sensitive values)
console.log('Environment variables loaded:', {
  NODE_ENV: process.env.NODE_ENV || 'not set',
  PORT: process.env.PORT || '3000',
  DB_HOST: process.env.DB_HOST ? 'set' : 'not set',
  BRANCA_SECRET: process.env.BRANCA_SECRET ? 'set' : 'not set',
  STOCK_API_KEY: process.env.STOCK_API_KEY ? 'set' : 'not set',
  REDIS_URL: process.env.REDIS_URL ? 'set' : 'not set',
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'not set',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'set' : 'not set',
  SMTP_HOST: process.env.SMTP_HOST || 'not set',
  EMAIL_FROM: process.env.EMAIL_FROM || 'not set',
  BASE_URL: process.env.BASE_URL || 'not set'
});

// Import services
const StockService = require('./services/stock-service');
const PortfolioService = require('./services/portfolio-service');
const MetricsService = require('./services/metrics-service');
const AuthService = require('./services/auth-service');
const AIPerformanceService = require('./services/ai-performance-service');
const DatabaseService = require('./services/database-service');
const RecommendationSyncService = require('./services/recommendation-sync-service');
const { getMarketDataCacheService } = require('./services/market-data-cache-service');
const AdminService = require('./services/admin-service');
const EmailService = require('./services/email-service');
// Import business metrics
const { businessMetrics } = require('./business-metrics');
// Import admin middleware
const { adminMiddleware } = require('./middleware/admin');
// Import auth middleware functions for plan-based feature gating
const { checkPlanLimits, optionalAuth, setAuthService } = require('./middleware/auth');

// Import browser telemetry middleware
const {
  processBrowserTelemetry,
  extractCorrelationHeaders,
  addBrowserCorrelation
} = require('./middleware/browser-telemetry');

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

// Initialize auth service in middleware for plan-based feature gating
setAuthService(authService);

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

// Initialize admin service
const adminService = new AdminService({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Initialize email service
const emailService = new EmailService();
// emailServiceReady is true if a transporter was created (verify callback may still be pending)
app.locals.emailServiceReady = !!emailService.transporter && !emailService.useConsoleFallback;
logger.info(`Email service initialized: transporter=${!!emailService.transporter}, consoleFallback=${!!emailService.useConsoleFallback}`);

// Initialize Redis client for caching (optional - falls back to node-cache if unavailable)
const NodeCache = require('node-cache');
const memoryCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

let redisClient = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        // Exponential backoff with jitter (from official docs)
        const jitter = Math.floor(Math.random() * 200);
        const delay = Math.min(Math.pow(2, retries) * 50, 2000);
        return delay + jitter;
      }
    }
  })
    .on('error', (err) => {
      logger.error('Redis Client Error - falling back to memory cache', err);
      useRedis = false;
    })
    .on('connect', () => {
      logger.info('Redis client connected');
      useRedis = true;
    });
} else {
  logger.info('No REDIS_URL configured - using in-memory cache (node-cache)');
}

// Initialize recommendation sync service
const recommendationSyncService = new RecommendationSyncService({
  databaseService: databaseService,
  stockService: stockService
});

// Initialize market data cache service (initialized after Redis connects)
let marketDataCacheService = null;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://pagead2.googlesyndication.com", "https://ep2.adtrafficquality.google", "https://*.google.com", "https://*.googleapis.com", "https://*.doubleclick.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://2cqomr4nb2.execute-api.us-east-1.amazonaws.com", "https://ep1.adtrafficquality.google", "https://ep2.adtrafficquality.google", "https://googleads.g.doubleclick.net", "https://pagead2.googlesyndication.com", "https://*.google.com", "https://*.googleapis.com", "https://*.doubleclick.net"],
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

// Set Origin-Agent-Cluster header uniformly for all environments
app.use((req, res, next) => {
  res.setHeader('Origin-Agent-Cluster', '?1');
  next();
});
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

// Stripe webhook route - MUST be before express.json() to get raw body
// This route needs raw body for signature verification
app.post('/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripeService = require('./services/stripe-service');
    const signature = req.headers['stripe-signature'];

    try {
      const result = await stripeService.handleWebhook(req.body, signature);
      res.json(result.data || { received: true });
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Browser telemetry correlation middleware
app.use(extractCorrelationHeaders);
app.use(addBrowserCorrelation);

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

// Serve React build static files with NO caching to force refresh
app.use(express.static(path.join(__dirname, 'public', 'react-dist'), {
  maxAge: 0,
  etag: false,
  index: false, // Disable automatic index.html serving
  lastModified: false,
  cacheControl: false
}));

// Serve other static assets (ads.txt, etc.)
app.use('/assets', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Favicon routes - try React build first, then main public directory
app.get('/favicon.ico', (req, res) => {
  const reactPath = path.join(__dirname, 'public', 'react-dist', 'favicon.ico');
  const publicPath = path.join(__dirname, 'public', 'favicon.ico');
  
  if (require('fs').existsSync(reactPath)) {
    res.sendFile(reactPath);
  } else {
    res.sendFile(publicPath);
  }
});

app.get('/favicon.svg', (req, res) => {
  const reactPath = path.join(__dirname, 'public', 'react-dist', 'favicon.svg');
  const publicPath = path.join(__dirname, 'public', 'favicon.svg');
  
  if (require('fs').existsSync(reactPath)) {
    res.sendFile(reactPath);
  } else {
    res.sendFile(publicPath);
  }
});

app.get('/favicon-32x32.png', (req, res) => {
  const reactPath = path.join(__dirname, 'public', 'react-dist', 'favicon-32x32.png');
  const publicPath = path.join(__dirname, 'public', 'favicon-32x32.png');
  
  if (require('fs').existsSync(reactPath)) {
    res.sendFile(reactPath);
  } else {
    res.sendFile(publicPath);
  }
});

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

// Price provider status endpoint for debugging
app.get('/api/price-status', (req, res) => {
  try {
    const status = stockService.getPriceProviderStatus();
    res.json({
      timestamp: new Date().toISOString(),
      providers: status
    });
  } catch (error) {
    logger.error('Error getting price provider status:', error);
    res.status(500).json({ error: 'Failed to get price provider status' });
  }
});

// Test real-time price endpoint
app.get('/api/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const priceData = await stockService.getRealTimePrice(symbol.toUpperCase(), 0);
    res.json({
      symbol: symbol.toUpperCase(),
      ...priceData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting price for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to get price' });
  }
});

// Market data cache status endpoint
app.get('/api/market-cache/status', (req, res) => {
  try {
    if (!marketDataCacheService) {
      return res.status(503).json({
        error: 'Market data cache service not initialized',
        timestamp: new Date().toISOString()
      });
    }
    const status = marketDataCacheService.getStatus();
    res.json({
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting market cache status:', error);
    res.status(500).json({ error: 'Failed to get market cache status' });
  }
});

// Get cached price (uses proactive cache, falls back to live fetch)
app.get('/api/market-cache/price/:symbol', async (req, res) => {
  try {
    if (!marketDataCacheService) {
      return res.status(503).json({ error: 'Market data cache service not initialized' });
    }
    const { symbol } = req.params;
    const priceData = await marketDataCacheService.getPrice(symbol.toUpperCase());
    if (!priceData) {
      return res.status(404).json({ error: `No price data for ${symbol}` });
    }
    res.json({
      symbol: symbol.toUpperCase(),
      ...priceData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting cached price for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Failed to get cached price' });
  }
});

// Get multiple cached prices
app.post('/api/market-cache/prices', async (req, res) => {
  try {
    if (!marketDataCacheService) {
      return res.status(503).json({ error: 'Market data cache service not initialized' });
    }
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array required' });
    }
    const prices = await marketDataCacheService.getPrices(symbols);
    res.json({
      prices: Object.fromEntries(prices),
      count: prices.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting cached prices:', error);
    res.status(500).json({ error: 'Failed to get cached prices' });
  }
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

    // Send verification email if email service is configured
    if (app.locals.emailServiceReady && user.verification_token) {
      try {
        await emailService.sendVerificationEmail(user.email, user.verification_token);
        logger.info(`Verification email sent to ${user.email}`);
      } catch (emailError) {
        logger.warn('Failed to send verification email:', emailError);
        // Continue with registration even if email fails
      }
    } else {
      logger.info(`Email service not ready — skipping verification email for ${user.email}`);
    }

    metricsService.incrementCounter('user_registrations_total');

    // Return success but require email verification before login
    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      requiresVerification: true,
      email: user.email
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify email
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const user = await authService.verifyEmail(token);

    // Generate auth token for verified user
    const authToken = authService.generateToken({
      userId: user.id,
      email: user.email,
      plan: user.plan
    });

    // Redirect to app with token (or return JSON for API clients)
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.redirect(`${appUrl}?verified=true&token=${authToken}`);
  } catch (error) {
    logger.error('Email verification error:', error);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.redirect(`${appUrl}?verified=false&error=${encodeURIComponent(error.message)}`);
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!app.locals.emailServiceReady) {
      return res.status(503).json({ error: 'Email service is not configured' });
    }
    const userData = await authService.getVerificationToken(email);
    await emailService.sendVerificationEmail(userData.email, userData.verification_token);
    res.json({ message: 'Verification email sent' });
  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });

    // Check if email is verified (skip for admin users)
    if (!result.user.verified && !result.user.is_admin) {
      // Only enforce if email service is actually configured
      if (app.locals.emailServiceReady) {
        return res.status(403).json({
          error: 'Please verify your email before logging in',
          code: 'EMAIL_NOT_VERIFIED',
          email: result.user.email
        });
      }
      // Email service not configured — allow login but note unverified status
      logger.warn(`User ${result.user.email} logged in without email verification (email service not configured)`);
    }

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

// Browser telemetry endpoint
app.post('/api/telemetry/browser', processBrowserTelemetry);

// API Routes

// Get stock recommendations
app.get('/api/recommendations', async (req, res) => {
  try {
    const { type, risk, limit, min_confidence, include_metrics, use_database } = req.query;
    
    // Allow up to 100 recommendations per request for comprehensive data
    const parsedLimit = Math.min(parseInt(limit) || 100, 100);
    
    // Check cache first (Redis or memory cache)
    const cacheKey = `recommendations:${type || 'all'}:${risk || 'all'}:${parsedLimit}:${min_confidence || 0}`;
    let recommendations;

    try {
      if (redisClient && redisClient.isReady) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          logger.info('Returning cached recommendations from Redis');
          return res.json(JSON.parse(cached));
        }
      } else {
        // Use memory cache as fallback
        const cached = memoryCache.get(cacheKey);
        if (cached) {
          logger.info('Returning cached recommendations from memory cache');
          return res.json(cached);
        }
      }
    } catch (cacheError) {
      logger.warn('Cache read failed:', cacheError.message);
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
    
    // Cache the result for 5 minutes
    try {
      if (redisClient && redisClient.isReady) {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(recommendations));
      } else {
        // Use memory cache as fallback
        memoryCache.set(cacheKey, recommendations);
      }
    } catch (cacheError) {
      logger.warn('Cache write failed:', cacheError.message);
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

// Stock search endpoint
app.get('/api/stocks/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 1) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.trim().toUpperCase();
    let results = [];

    try {
      // Try Yahoo Finance search first
      const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=10&newsCount=0`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 5000
      });

      if (response.ok) {
        const data = await response.json();
        if (data.quotes && Array.isArray(data.quotes)) {
          results = data.quotes
            .filter(quote =>
              quote.symbol &&
              quote.shortname &&
              (quote.typeDisp === 'Equity' || quote.quoteType === 'EQUITY' || !quote.typeDisp) &&
              !quote.symbol.includes('=') && // Filter out currency pairs
              !quote.symbol.includes('^') && // Filter out indices
              quote.symbol.match(/^[A-Z]{1,5}$/) // Only allow 1-5 letter symbols
            )
            .slice(0, 10)
            .map(quote => ({
              symbol: quote.symbol,
              name: quote.shortname || quote.longname || `${quote.symbol} Corporation`,
              exchange: quote.exchange || 'NASDAQ'
            }));
        }
      }
    } catch (apiError) {
      console.log('Yahoo Finance API search failed, using fallback:', apiError.message);
    }

    // If no results from API, provide comprehensive fallback
    if (results.length === 0) {
      const comprehensiveStocks = [
        // Major Tech
        { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
        { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
        { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ' },
        { symbol: 'GOOG', name: 'Alphabet Inc. Class C', exchange: 'NASDAQ' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
        { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
        { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
        { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ' },
        { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ' },
        { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ' },
        { symbol: 'AVGO', name: 'Broadcom Inc.', exchange: 'NASDAQ' },
        { symbol: 'QCOM', name: 'Qualcomm Inc.', exchange: 'NASDAQ' },
        { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'NASDAQ' },
        { symbol: 'CRM', name: 'Salesforce Inc.', exchange: 'NYSE' },
        { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE' },
        { symbol: 'NOW', name: 'ServiceNow Inc.', exchange: 'NYSE' },
        { symbol: 'SNOW', name: 'Snowflake Inc.', exchange: 'NYSE' },
        { symbol: 'PLTR', name: 'Palantir Technologies Inc.', exchange: 'NYSE' },
        { symbol: 'DDOG', name: 'Datadog Inc.', exchange: 'NASDAQ' },

        // Financial & Traditional
        { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', exchange: 'NYSE' },
        { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
        { symbol: 'BAC', name: 'Bank of America Corp.', exchange: 'NYSE' },
        { symbol: 'WFC', name: 'Wells Fargo & Co.', exchange: 'NYSE' },
        { symbol: 'GS', name: 'Goldman Sachs Group Inc.', exchange: 'NYSE' },
        { symbol: 'MS', name: 'Morgan Stanley', exchange: 'NYSE' },
        { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE' },
        { symbol: 'MA', name: 'Mastercard Inc.', exchange: 'NYSE' },
        { symbol: 'PYPL', name: 'PayPal Holdings Inc.', exchange: 'NASDAQ' },

        // Healthcare & Pharma
        { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE' },
        { symbol: 'PFE', name: 'Pfizer Inc.', exchange: 'NYSE' },
        { symbol: 'MRNA', name: 'Moderna Inc.', exchange: 'NASDAQ' },
        { symbol: 'ABBV', name: 'AbbVie Inc.', exchange: 'NYSE' },
        { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', exchange: 'NYSE' },

        // Consumer & Retail
        { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE' },
        { symbol: 'TGT', name: 'Target Corporation', exchange: 'NYSE' },
        { symbol: 'HD', name: 'Home Depot Inc.', exchange: 'NYSE' },
        { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', exchange: 'NYSE' },
        { symbol: 'COST', name: 'Costco Wholesale Corporation', exchange: 'NASDAQ' },
        { symbol: 'SBUX', name: 'Starbucks Corporation', exchange: 'NASDAQ' },
        { symbol: 'MCD', name: 'McDonald\'s Corporation', exchange: 'NYSE' },
        { symbol: 'NKE', name: 'Nike Inc.', exchange: 'NYSE' },
        { symbol: 'DIS', name: 'Walt Disney Company', exchange: 'NYSE' },

        // Energy & Materials
        { symbol: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE' },
        { symbol: 'CVX', name: 'Chevron Corporation', exchange: 'NYSE' },
        { symbol: 'COP', name: 'ConocoPhillips', exchange: 'NYSE' },

        // Transportation & Delivery
        { symbol: 'UPS', name: 'United Parcel Service Inc.', exchange: 'NYSE' },
        { symbol: 'FDX', name: 'FedEx Corporation', exchange: 'NYSE' },
        { symbol: 'UBER', name: 'Uber Technologies Inc.', exchange: 'NYSE' },
        { symbol: 'LYFT', name: 'Lyft Inc.', exchange: 'NASDAQ' },
        { symbol: 'DASH', name: 'DoorDash Inc.', exchange: 'NYSE' },

        // Communication & Media
        { symbol: 'T', name: 'AT&T Inc.', exchange: 'NYSE' },
        { symbol: 'VZ', name: 'Verizon Communications Inc.', exchange: 'NYSE' },
        { symbol: 'CMCSA', name: 'Comcast Corporation', exchange: 'NASDAQ' },
        { symbol: 'TWTR', name: 'Twitter Inc.', exchange: 'NYSE' },
        { symbol: 'SNAP', name: 'Snap Inc.', exchange: 'NYSE' },
        { symbol: 'PINS', name: 'Pinterest Inc.', exchange: 'NYSE' },

        // ETFs
        { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'NYSE' },
        { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ' },
        { symbol: 'IWM', name: 'iShares Russell 2000 ETF', exchange: 'NYSE' },
        { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', exchange: 'NYSE' },
        { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'NYSE' }
      ];

      const queryLower = query.toLowerCase();
      results = comprehensiveStocks.filter(stock =>
        stock.symbol.toLowerCase().includes(queryLower) ||
        stock.name.toLowerCase().includes(queryLower)
      ).slice(0, 10);
    }

    // If still no results and query looks like a valid symbol, allow it
    if (results.length === 0 && query.match(/^[A-Z]{1,5}$/)) {
      results = [{
        symbol: query,
        name: `${query} Corporation`,
        exchange: 'UNKNOWN'
      }];
    }

    // Track stock search metrics
    businessMetrics.trackStockOperation('search', {
      query: q,
      results_count: results.length,
      search_type: 'comprehensive'
    });

    res.json({ results });
  } catch (error) {
    logger.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
});

// Custom stock request endpoint
app.post('/api/stocks/:symbol/request', authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { analysisType, timeframe, priority } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol parameter is required'
      });
    }

    const options = {
      userId: req.user.userId,
      source: 'portfolio_webapp',
      analysisType,
      timeframe,
      priority
    };

    const result = await stockService.requestCustomStock(symbol, options);

    metricsService.incrementCounter('api_requests_total', { endpoint: 'custom_stock_request' });

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(result.status === 'rejected' ? 400 : 503).json(result);
    }

  } catch (error) {
    logger.error(`Error requesting custom stock analysis for ${req.params.symbol}:`, error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'custom_stock_request' });
    res.status(500).json({
      success: false,
      error: 'Failed to request custom stock analysis'
    });
  }
});

// Get custom stock request status
app.get('/api/stocks/requests/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: 'Request ID parameter is required'
      });
    }

    const result = await stockService.getCustomRequestStatus(requestId);

    metricsService.incrementCounter('api_requests_total', { endpoint: 'custom_request_status' });

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }

  } catch (error) {
    logger.error(`Error getting custom request status for ${req.params.requestId}:`, error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'custom_request_status' });
    res.status(500).json({
      success: false,
      error: 'Failed to get custom request status'
    });
  }
});

// Stock price endpoint
app.get('/api/stocks/:symbol/price', authMiddleware, async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol parameter is required'
      });
    }

    // Get real-time current stock price from Yahoo Finance via AIPerformanceService
    const currentPrice = await aiPerformanceService.getCurrentPrice(symbol);

    if (!currentPrice) {
      return res.status(404).json({
        success: false,
        error: `No current price data available for symbol ${symbol}`
      });
    }

    // Price is the real-time value from Yahoo Finance
    const price = currentPrice;

    metricsService.incrementCounter('api_requests_total', { endpoint: 'stock_price' });

    // Track stock price lookup metrics
    businessMetrics.trackStockOperation('price_lookup', {
      symbol: symbol.toUpperCase(),
      price: price,
      source: 'yahoo_finance'
    });

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        price: price,
        timestamp: new Date().toISOString(),
        source: 'yahoo_finance'
      }
    });
  } catch (error) {
    logger.error(`Error getting price for ${req.params.symbol}:`, error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'stock_price' });

    res.status(500).json({
      success: false,
      error: 'Failed to get stock price'
    });
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

// Get portfolio positions
app.get('/api/portfolios/:portfolioId/positions', authMiddleware, async (req, res) => {
  try {
    const { portfolioId } = req.params;

    const positions = await portfolioService.getPortfolioPositions(req.user.userId, portfolioId);

    metricsService.incrementCounter('api_requests_total', { endpoint: 'get_positions' });
    res.json(positions);
  } catch (error) {
    logger.error('Error getting portfolio positions:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'get_positions' });
    res.status(500).json({ error: 'Failed to get portfolio positions' });
  }
});

// Add position to portfolio
app.post('/api/portfolios/:portfolioId/positions', authMiddleware, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { symbol, shares } = req.body;
    
    const position = await portfolioService.addPosition(req.user.userId, portfolioId, {
      symbol: symbol.toUpperCase(),
      shares: parseInt(shares)
    });
    
    metricsService.incrementCounter('api_requests_total', { endpoint: 'add_position' });
    res.status(201).json(position);
  } catch (error) {
    logger.error('Error adding position:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'add_position' });
    res.status(500).json({ error: 'Failed to add position' });
  }
});

// Update position in portfolio
app.put('/api/portfolios/:portfolioId/positions/:symbol', authMiddleware, async (req, res) => {
  try {
    const { portfolioId, symbol } = req.params;
    const { shares } = req.body;

    const position = await portfolioService.updatePosition(req.user.userId, portfolioId, symbol.toUpperCase(), {
      shares: parseInt(shares)
    });

    metricsService.incrementCounter('api_requests_total', { endpoint: 'update_position' });
    res.json(position);
  } catch (error) {
    logger.error('Error updating position:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'update_position' });
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update position' });
    }
  }
});

// Remove position from portfolio
app.delete('/api/portfolios/:portfolioId/positions/:symbol', authMiddleware, async (req, res) => {
  try {
    const { portfolioId, symbol } = req.params;

    const result = await portfolioService.removePosition(req.user.userId, portfolioId, symbol.toUpperCase());

    metricsService.incrementCounter('api_requests_total', { endpoint: 'remove_position' });
    res.json(result);
  } catch (error) {
    logger.error('Error removing position:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'remove_position' });
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to remove position' });
    }
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

// IMPORTANT: Specific routes must be defined BEFORE parameterized routes
// Otherwise /api/ai-performance/tuning-history would match :period as "tuning-history"

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

// Get AI tuning history
app.get('/api/ai-performance/tuning-history', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    logger.info(`Getting AI tuning history for last ${days} days`);

    const history = await aiPerformanceService.getTuningHistory(parseInt(days));

    metricsService.incrementCounter('api_requests_total', { endpoint: 'ai_tuning_history' });
    res.json({
      ...history,
      requestId: req.headers['x-request-id'] || 'unknown'
    });

  } catch (error) {
    logger.error('Error getting AI tuning history:', error);
    metricsService.incrementCounter('api_errors_total', { endpoint: 'ai_tuning_history' });
    res.status(500).json({
      error: 'Failed to get tuning history',
      details: error.message
    });
  }
});

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

// Get detailed AI performance breakdown by recommendation type (Premium feature)
app.get('/api/ai-performance/:period/breakdown', authMiddleware, checkPlanLimits('ai_insights'), async (req, res) => {
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

// Dashboard Analytics API endpoint
app.get('/api/analytics/dashboard', async (req, res) => {
  try {
    // Return market indices and basic analytics data
    const dashboardData = {
      marketIndices: {
        sp500: { value: 5234.18, change: +0.8 },
        nasdaq: { value: 16274.94, change: +1.2 },
        dow: { value: 39294.76, change: +0.6 }
      },
      marketStatus: 'open', // or 'closed', 'pre-market', 'after-hours'
      lastUpdated: new Date().toISOString()
    };

    res.json(dashboardData);
  } catch (error) {
    logger.error('Error fetching dashboard analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard analytics',
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

// Serve the React app for all SPA routes
app.get('/', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.sendFile(path.join(__dirname, 'public', 'react-dist', 'index.html'));
});

// Serve React app for dashboard pages
app.get(['/dashboard', '/portfolio'], (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.sendFile(path.join(__dirname, 'public', 'react-dist', 'index.html'));
});

// Handle /recommendations route - serve SPA or API data
app.get('/recommendations', async (req, res, next) => {
  try {
    // If the client wants HTML, serve the SPA
    if (req.accepts(['html', 'json']) === 'html') {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      return res.sendFile(path.join(__dirname, 'public', 'react-dist', 'index.html'));
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

// ==================== ADMIN API ROUTES ====================

// Get all users (admin only)
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, search, role, sortBy, sortOrder } = req.query;
    const result = await adminService.getUsers({
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
      search, role, sortBy, sortOrder
    });
    res.json(result);
  } catch (error) {
    logger.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get single user (admin only)
app.get('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await adminService.getUserById(parseInt(req.params.userId));
    res.json(user);
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(error.message === 'User not found' ? 404 : 500).json({ error: error.message });
  }
});

// Update user (admin only)
app.put('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await adminService.updateUser(parseInt(req.params.userId), req.body, req.user.userId);
    res.json(user);
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(error.message === 'User not found' ? 404 : 500).json({ error: error.message });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await adminService.deleteUser(parseInt(req.params.userId), req.user.userId);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(error.message === 'User not found' ? 404 : 500).json({ error: error.message });
  }
});

// Get extended system health (admin only)
app.get('/api/admin/system/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const health = await adminService.getExtendedSystemHealth();
    res.json(health);
  } catch (error) {
    logger.error('Error getting system health:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
});

// Get database stats (admin only)
app.get('/api/admin/system/database', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await adminService.getDatabaseStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting database stats:', error);
    res.status(500).json({ error: 'Failed to get database stats' });
  }
});

// Get system config (admin only)
app.get('/api/admin/config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await adminService.getSystemConfig();
    res.json(config);
  } catch (error) {
    logger.error('Error getting system config:', error);
    res.status(500).json({ error: 'Failed to get system config' });
  }
});

// Update system config (admin only)
app.put('/api/admin/config/:key', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await adminService.updateSystemConfig(req.params.key, req.body.value, req.user.userId);
    res.json(result);
  } catch (error) {
    logger.error('Error updating system config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get audit log (admin only)
app.get('/api/admin/audit-log', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, action, adminUserId, since } = req.query;
    const result = await adminService.getAuditLog({
      page: parseInt(page) || 1, limit: parseInt(limit) || 50,
      action, adminUserId: adminUserId ? parseInt(adminUserId) : undefined, since
    });
    res.json(result);
  } catch (error) {
    logger.error('Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

// Check if current user is admin
app.get('/api/admin/check', authMiddleware, (req, res) => {
  const isAdmin = req.user.isAdmin || req.user.is_admin || req.user.role === 'admin' ||
                  req.user.email?.endsWith('@stockportfolio.com');
  res.json({ isAdmin, userId: req.user.userId });
});

// ===========================================
// BILLING & SUBSCRIPTION ROUTES
// ===========================================

const stripeService = require('./services/stripe-service');

// Get subscription plans
app.get('/api/billing/plans', (req, res) => {
  try {
    const plans = stripeService.getPlans();
    res.json({ plans });
  } catch (error) {
    logger.error('Error getting plans:', error);
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// Get current user's subscription
app.get('/api/billing/subscription', authMiddleware, async (req, res) => {
  try {
    const result = await stripeService.getSubscription(req.user.userId);
    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to get subscription' });
    }
    res.json(result.data);
  } catch (error) {
    logger.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Get billing history
app.get('/api/billing/history', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await stripeService.getBillingHistory(req.user.userId, limit);
    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to get billing history' });
    }
    res.json({ history: result.data });
  } catch (error) {
    logger.error('Error getting billing history:', error);
    res.status(500).json({ error: 'Failed to get billing history' });
  }
});

// Create checkout session for subscription upgrade
app.post('/api/billing/checkout', authMiddleware, async (req, res) => {
  try {
    const { plan, billingPeriod = 'monthly' } = req.body;

    if (!plan || !['pro', 'premium'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const user = await authService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await stripeService.createCheckoutSession(
      req.user.userId,
      user.email,
      plan,
      billingPeriod
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to create checkout session' });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create billing portal session for managing subscription
app.post('/api/billing/portal', authMiddleware, async (req, res) => {
  try {
    const result = await stripeService.createBillingPortalSession(req.user.userId);

    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to create portal session' });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

// Cancel subscription (at period end)
app.post('/api/billing/cancel', authMiddleware, async (req, res) => {
  try {
    const result = await stripeService.cancelSubscription(req.user.userId);

    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to cancel subscription' });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Reactivate subscription scheduled for cancellation
app.post('/api/billing/reactivate', authMiddleware, async (req, res) => {
  try {
    const result = await stripeService.reactivateSubscription(req.user.userId);

    if (!result.success) {
      return res.status(500).json({ error: result.error?.message || 'Failed to reactivate subscription' });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error reactivating subscription:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// Apply promo code
app.post('/api/billing/promo', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Promo code required' });
    }

    const result = await stripeService.applyPromoCode(req.user.userId, code);

    if (!result.success) {
      return res.status(400).json({ error: result.error?.message || 'Invalid promo code' });
    }

    res.json(result.data);
  } catch (error) {
    logger.error('Error applying promo code:', error);
    res.status(400).json({ error: error.message || 'Invalid promo code' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (marketDataCacheService) {
    await marketDataCacheService.shutdown();
  }
  await recommendationSyncService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  if (marketDataCacheService) {
    await marketDataCacheService.shutdown();
  }
  await recommendationSyncService.shutdown();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  // Connect to Redis if configured (non-blocking)
  let connectedRedisClient = null;
  if (redisClient) {
    try {
      await redisClient.connect();
      logger.info('Redis connected successfully');
      useRedis = true;
      connectedRedisClient = redisClient;
    } catch (error) {
      logger.warn('Redis connection failed, using memory cache:', error.message);
      useRedis = false;
    }
  } else {
    logger.info('Using in-memory cache (node-cache) - Redis not configured');
  }
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

  // Initialize market data cache service
  try {
    marketDataCacheService = getMarketDataCacheService({
      redisClient: connectedRedisClient,
      databaseService: databaseService,
      portfolioService: portfolioService,
      redisTTL: 60,      // 60 second Redis TTL
      memoryTTL: 30,     // 30 second memory TTL
      fetchIntervalMs: 30000,         // 30 seconds during market hours
      extendedHoursIntervalMs: 60000, // 1 minute during extended hours
      closedMarketIntervalMs: 300000, // 5 minutes when market closed
      maxSymbolsPerFetch: 50
    });

    await marketDataCacheService.initialize();
    marketDataCacheService.start();
    logger.info('Market data cache service started', {
      marketState: marketDataCacheService.getMarketState(),
      watchedSymbols: marketDataCacheService.watchedSymbols.size
    });
  } catch (error) {
    logger.error('Failed to start market data cache service:', error);
    logger.warn('Running without proactive market data caching');
  }
});

module.exports = app;