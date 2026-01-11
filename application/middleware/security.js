/**
 * Security Middleware
 * Comprehensive security middleware for authentication, authorization, and protection
 */

'use strict';

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const validator = require('validator');
const winston = require('winston');

// Configure security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Helmet configuration for security headers
 */
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stockanalytics.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for development
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

/**
 * CORS configuration
 */
const corsConfig = cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://your-domain.com'
    ];
    
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      securityLogger.warn('CORS blocked request from origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

/**
 * Rate limiting configurations
 */
const rateLimiters = {
  // General API rate limiting
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
      success: false,
      error: {
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      },
      data: null
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      securityLogger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests, please try again later',
          code: 'RATE_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString()
        },
        data: null
      });
    }
  }),

  // Strict rate limiting for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: {
        message: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      },
      data: null
    },
    handler: (req, res) => {
      securityLogger.warn('Auth rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        body: req.body ? { email: req.body.email } : undefined
      });
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many authentication attempts, please try again later',
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          timestamp: new Date().toISOString()
        },
        data: null
      });
    }
  }),

  // API-specific rate limiting
  api: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: {
      success: false,
      error: {
        message: 'API rate limit exceeded',
        code: 'API_RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      },
      data: null
    }
  })
};

/**
 * Input validation middleware
 */
function validateInput(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      // Check required fields
      if (rules.required && (!value || value.toString().trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip validation if field is not required and not provided
      if (!rules.required && !value) {
        continue;
      }

      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
        continue;
      }

      // String validations
      if (rules.type === 'string' && value) {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be no more than ${rules.maxLength} characters`);
        }
        if (rules.email && !validator.isEmail(value)) {
          errors.push(`${field} must be a valid email address`);
        }
        if (rules.alphanumeric && !validator.isAlphanumeric(value)) {
          errors.push(`${field} must contain only letters and numbers`);
        }
      }

      // Number validations
      if (rules.type === 'number' && value !== undefined) {
        if (rules.min && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }
        if (rules.max && value > rules.max) {
          errors.push(`${field} must be no more than ${rules.max}`);
        }
      }

      // Custom validation
      if (rules.validate && !rules.validate(value)) {
        errors.push(`${field} is invalid`);
      }
    }

    if (errors.length > 0) {
      securityLogger.warn('Input validation failed', {
        ip: req.ip,
        endpoint: req.path,
        errors
      });

      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: errors,
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString()
        },
        data: null
      });
    }

    next();
  };
}

/**
 * SQL injection protection middleware
 */
function sqlInjectionProtection(req, res, next) {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(;|\-\-|\/\*|\*\/|xp_|sp_)/gi,
    /(\b(OR|AND)\b.*=.*)/gi
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  const checkObject = (obj) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          if (checkObject(value)) return true;
        } else if (checkValue(value) || checkValue(key)) {
          return true;
        }
      }
    }
    return false;
  };

  if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
    securityLogger.error('SQL injection attempt detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      body: req.body,
      query: req.query,
      params: req.params
    });

    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request',
        code: 'INVALID_REQUEST',
        timestamp: new Date().toISOString()
      },
      data: null
    });
  }

  next();
}

/**
 * XSS protection middleware
 */
function xssProtection(req, res, next) {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi
  ];

  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return xssPatterns.reduce((sanitized, pattern) => {
        return sanitized.replace(pattern, '');
      }, value);
    }
    return value;
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          sanitizeObject(value);
        } else {
          obj[key] = sanitizeValue(value);
        }
      }
    }
  };

  // Sanitize request data
  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);

  next();
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    if (res.statusCode >= 400) {
      securityLogger.warn('HTTP Error', logData);
    } else {
      securityLogger.info('HTTP Request', logData);
    }
  });

  next();
}

/**
 * Authentication validation schemas
 */
const validationSchemas = {
  register: {
    email: {
      required: true,
      type: 'string',
      email: true,
      maxLength: 255
    },
    password: {
      required: true,
      type: 'string',
      minLength: 8,
      maxLength: 128
    },
    plan: {
      required: false,
      type: 'string',
      validate: (value) => ['free', 'basic', 'premium', 'pro'].includes(value)
    }
  },
  login: {
    email: {
      required: true,
      type: 'string',
      email: true
    },
    password: {
      required: true,
      type: 'string',
      minLength: 1
    }
  }
};

module.exports = {
  helmet: helmetConfig,
  cors: corsConfig,
  rateLimiters,
  validateInput,
  sqlInjectionProtection,
  xssProtection,
  requestLogger,
  validationSchemas,
  securityLogger
};
