/**
 * Base Service Class
 * Provides common functionality for all service classes including
 * standardized logging, error handling, and validation
 */

const winston = require('winston');
const { Pool } = require('pg');

class BaseService {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.options = options;
    
    // Initialize logger with consistent configuration
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: serviceName,
        environment: process.env.NODE_ENV || 'development'
      },
      transports: [
        new winston.transports.File({ 
          filename: `logs/${serviceName}-error.log`, 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: `logs/${serviceName}.log` 
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Database pool configuration if needed
    if (options.dbConfig) {
      this.pool = new Pool({
        host: options.dbConfig.host || process.env.DB_HOST || 'localhost',
        port: options.dbConfig.port || process.env.DB_PORT || 5432,
        database: options.dbConfig.database || process.env.DB_NAME || 'stock_portfolio',
        user: options.dbConfig.user || process.env.DB_USER || 'postgres',
        password: options.dbConfig.password || process.env.DB_PASSWORD || 'postgres',
        max: 10,
        min: 2,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 5000,
        ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true' 
          ? { rejectUnauthorized: false } 
          : false,
      });
    }
  }

  /**
   * Standardized error handling with logging and context
   */
  handleError(error, context = {}, operation = 'unknown') {
    const errorInfo = {
      operation,
      context,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      },
      timestamp: new Date().toISOString()
    };

    this.logger.error(`${this.serviceName} error in ${operation}:`, errorInfo);

    // Return standardized error response
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'INTERNAL_ERROR',
        operation,
        timestamp: errorInfo.timestamp
      },
      data: null
    };
  }

  /**
   * Standardized success response
   */
  handleSuccess(data, operation = 'unknown', metadata = {}) {
    const response = {
      success: true,
      data,
      metadata: {
        operation,
        timestamp: new Date().toISOString(),
        service: this.serviceName,
        ...metadata
      },
      error: null
    };

    this.logger.info(`${this.serviceName} success in ${operation}`, {
      operation,
      dataType: typeof data,
      hasData: !!data,
      metadata
    });

    return response;
  }

  /**
   * Input validation helper
   */
  validateInput(input, schema, operation = 'unknown') {
    if (!input) {
      throw new Error(`Missing required input for ${operation}`);
    }

    if (schema) {
      // Basic validation - can be extended with Joi or Yup
      for (const [key, validator] of Object.entries(schema)) {
        if (validator.required && !input[key]) {
          throw new Error(`Missing required field: ${key}`);
        }
        
        if (input[key] && validator.type && typeof input[key] !== validator.type) {
          throw new Error(`Invalid type for field ${key}: expected ${validator.type}`);
        }
        
        if (input[key] && validator.validate && !validator.validate(input[key])) {
          throw new Error(`Invalid value for field ${key}`);
        }
      }
    }

    return true;
  }

  /**
   * Async operation wrapper with error handling
   */
  async executeOperation(operation, operationName, context = {}) {
    try {
      this.logger.debug(`Starting ${operationName}`, context);
      const result = await operation();
      return this.handleSuccess(result, operationName, context);
    } catch (error) {
      return this.handleError(error, context, operationName);
    }
  }

  /**
   * Database query wrapper with error handling
   */
  async executeQuery(query, params = [], operationName = 'database_query') {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      this.logger.debug(`Executing query: ${operationName}`, { 
        query: query.substring(0, 100) + '...',
        paramCount: params.length 
      });
      
      const result = await client.query(query, params);
      return result;
    } catch (error) {
      this.logger.error(`Database query failed: ${operationName}`, {
        error: error.message,
        query: query.substring(0, 100) + '...',
        params: params.length
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cache key generator
   */
  generateCacheKey(prefix, ...parts) {
    return `${this.serviceName}:${prefix}:${parts.join(':')}`;
  }

  /**
   * Retry mechanism for external API calls
   */
  async retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`Operation failed, attempt ${attempt}/${maxRetries}`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.pool) {
      await this.pool.end();
      this.logger.info(`${this.serviceName} database pool closed`);
    }
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    const checks = {
      service: this.serviceName,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Database health check
    if (this.pool) {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        checks.checks.database = 'healthy';
      } catch (error) {
        checks.checks.database = 'unhealthy';
        checks.status = 'degraded';
        this.logger.error('Database health check failed', error);
      }
    }

    return checks;
  }
}

module.exports = BaseService;
