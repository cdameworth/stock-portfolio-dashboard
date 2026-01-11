/**
 * Improved Authentication Service
 * Extends BaseService for standardized error handling and logging
 */

'use strict';

const bcrypt = require('bcryptjs');
const branca = require('branca');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const BaseService = require('./base-service');

class ImprovedAuthService extends BaseService {
  constructor({ dbConfig } = {}) {
    super('auth-service', { dbConfig });
    
    this.inMemory = { users: {} };
    this.brancaSecret = process.env.BRANCA_SECRET;
    if (!this.brancaSecret) {
      throw new Error('BRANCA_SECRET environment variable is required for authentication');
    }
    this.brancaInstance = null;
    this.ready = false;

    // Input validation schemas
    this.schemas = {
      register: {
        email: { 
          required: true, 
          type: 'string',
          validate: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        },
        password: { 
          required: true, 
          type: 'string',
          validate: (password) => password.length >= 8
        },
        plan: {
          required: false,
          type: 'string',
          validate: (plan) => ['free', 'basic', 'premium', 'pro'].includes(plan)
        }
      },
      login: {
        email: { required: true, type: 'string' },
        password: { required: true, type: 'string' }
      }
    };
  }

  /**
   * Initialize the service and database tables
   */
  async init() {
    if (this.ready) return;

    return this.executeOperation(async () => {
      if (this.pool) {
        await this.executeQuery(`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            plan VARCHAR(50) DEFAULT 'free',
            verified BOOLEAN DEFAULT false,
            verification_token UUID,
            reset_token UUID,
            reset_token_expires TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
          )
        `, [], 'init_users_table');

        // Create index for better performance
        await this.executeQuery(
          'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
          [],
          'create_email_index'
        );
      }
      
      this.ready = true;
      return { initialized: true };
    }, 'init');
  }

  /**
   * Get Branca instance for token operations
   */
  getBrancaInstance() {
    if (!this.brancaInstance) {
      try {
        const key = Buffer.from(this.brancaSecret, 'utf8').subarray(0, 32);
        this.brancaInstance = branca(key);
      } catch (error) {
        this.logger.error('Failed to initialize Branca instance', error);
        throw new Error('Token service initialization failed');
      }
    }
    return this.brancaInstance;
  }

  /**
   * Register a new user with improved validation and error handling
   */
  async registerUser({ email, password, plan = 'free' }) {
    return this.executeOperation(async () => {
      await this.init();
      
      // Validate input
      this.validateInput({ email, password, plan }, this.schemas.register, 'registerUser');
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user already exists
      const existingUser = await this.getUserByEmail(normalizedEmail);
      if (existingUser) {
        throw new Error('User already exists with this email');
      }
      
      const userId = uuidv4();
      const passwordHash = await this.hashPassword(password);
      const verificationToken = uuidv4();
      
      if (!this.pool) {
        // In-memory storage
        const user = {
          id: userId,
          email: normalizedEmail,
          password_hash: passwordHash,
          plan,
          verified: false,
          verification_token: verificationToken,
          created_at: new Date().toISOString()
        };
        
        this.inMemory.users[normalizedEmail] = user;
        return { 
          id: userId, 
          email: normalizedEmail, 
          plan, 
          verified: false 
        };
      }
      
      // Database storage
      const result = await this.executeQuery(
        `INSERT INTO users (id, email, password_hash, plan, verification_token) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, plan, verified, created_at`,
        [userId, normalizedEmail, passwordHash, plan, verificationToken],
        'registerUser'
      );
      
      return result.rows[0];
    }, 'registerUser', { email: email?.toLowerCase(), plan });
  }

  /**
   * Authenticate user with improved error handling
   */
  async loginUser({ email, password }) {
    return this.executeOperation(async () => {
      await this.init();
      
      // Validate input
      this.validateInput({ email, password }, this.schemas.login, 'loginUser');
      
      const normalizedEmail = email.toLowerCase().trim();
      const user = await this.getUserByEmail(normalizedEmail);
      
      if (!user) {
        throw new Error('Invalid email or password');
      }
      
      const isValidPassword = await this.verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }
      
      // Generate token
      const token = this.generateToken({
        userId: user.id,
        email: user.email,
        plan: user.plan
      });
      
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          verified: user.verified
        }
      };
    }, 'loginUser', { email: normalizedEmail });
  }

  /**
   * Get user by email with caching
   */
  async getUserByEmail(email) {
    return this.executeOperation(async () => {
      await this.init();
      
      const normalizedEmail = email.toLowerCase().trim();
      
      if (!this.pool) {
        return this.inMemory.users[normalizedEmail] || null;
      }
      
      const result = await this.executeQuery(
        'SELECT * FROM users WHERE email = $1',
        [normalizedEmail],
        'getUserByEmail'
      );
      
      return result.rows[0] || null;
    }, 'getUserByEmail', { email: email?.toLowerCase() });
  }

  /**
   * Generate secure authentication token
   */
  generateToken(payload) {
    try {
      const tokenData = {
        userId: payload.userId,
        email: payload.email,
        plan: payload.plan,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        iat: Math.floor(Date.now() / 1000)
      };
      
      return this.getBrancaInstance().encode(JSON.stringify(tokenData));
    } catch (error) {
      this.logger.error('Token generation failed', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Verify and decode authentication token
   */
  verifyToken(token) {
    try {
      const decoded = this.getBrancaInstance().decode(token, 'utf8');
      const payload = JSON.parse(decoded);
      
      // Check expiration
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        throw new Error('Token expired');
      }
      
      return payload;
    } catch (error) {
      this.logger.error('Token verification failed', error);
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Enhanced health check including token service
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    try {
      // Test token generation/verification
      const testToken = this.generateToken({ userId: 'test', email: 'test@example.com', plan: 'free' });
      this.verifyToken(testToken);
      baseHealth.checks.tokenService = 'healthy';
    } catch (error) {
      baseHealth.checks.tokenService = 'unhealthy';
      baseHealth.status = 'degraded';
      this.logger.error('Token service health check failed', error);
    }
    
    return baseHealth;
  }
}

module.exports = ImprovedAuthService;
