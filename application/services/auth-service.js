'use strict';

const bcrypt = require('bcryptjs');
const branca = require('branca');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const BaseService = require('./base-service');
const { businessMetrics } = require('../business-metrics');

class AuthService extends BaseService {
  constructor({ dbConfig } = {}) {
    super('auth-service', { dbConfig });

    this.inMemory = { users: {} }; // { email: { id, email, password_hash, plan, created_at } }

    // Store the secret for lazy initialization
    this.brancaSecret = process.env.BRANCA_SECRET || 'StockPortfolio2024_32ByteSecret_';
    if (!this.brancaSecret && process.env.NODE_ENV === 'production') {
      console.error('WARNING: BRANCA_SECRET environment variable is not set, using default value');
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
        }
      },
      login: {
        email: { required: true, type: 'string' },
        password: { required: true, type: 'string' }
      }
    };
  }

  getBrancaInstance() {
    if (!this.brancaInstance) {
      try {
        // Branca requires exactly 32 bytes for the secret key
        let secret = this.brancaSecret;

        // If secret is longer than 32 chars, truncate it
        if (secret.length > 32) {
          secret = secret.substring(0, 32);
        }
        // If secret is shorter than 32 chars, pad it with zeros
        else if (secret.length < 32) {
          secret = secret.padEnd(32, '0');
        }

        const secretBuffer = Buffer.from(secret, 'utf8');
        this.brancaInstance = branca(secretBuffer);
        this.logger.info('Branca instance created successfully with 32-byte key');
      } catch (error) {
        this.logger.error('Error creating Branca instance:', error.message);
        throw new Error('Failed to initialize authentication service');
      }
    }
    return this.brancaInstance;
  }

  async init() {
    if (!this.pool || this.ready) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          plan VARCHAR(20) DEFAULT 'free',
          verified BOOLEAN DEFAULT false,
          verification_token VARCHAR(255),
          reset_token VARCHAR(255),
          reset_expires TIMESTAMPTZ,
          last_login TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        )
      `);
      
      // Create password reset tokens table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);
      
      // Create indexes
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
        CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_user_unique ON password_reset_tokens(user_id) WHERE NOT used;
      `);
      
      this.ready = true;
    } catch (error) {
      console.error('Failed to initialize auth database:', error);
      // Fallback to in-memory if DB init fails
      await this.close();
      this.pool = null;
    }
  }

  /**
   * Generate a Branca token for user authentication
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
      console.error('Token generation failed:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Verify and decode a Branca token
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
      console.error('Token verification failed:', error);
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Register a new user
   */
  async registerUser({ email, password, plan = 'free' }) {
    await this.init();
    
    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    
    if (!email.includes('@')) {
      throw new Error('Valid email address is required');
    }

    const userId = uuidv4();
    const passwordHash = await this.hashPassword(password);
    const verificationToken = uuidv4();
    
    if (!this.pool) {
      // In-memory storage
      if (this.inMemory.users[email]) {
        throw new Error('User already exists');
      }
      
      const user = {
        id: userId,
        email: email.toLowerCase(),
        password_hash: passwordHash,
        plan,
        verified: false,
        verification_token: verificationToken,
        created_at: new Date().toISOString()
      };
      
      this.inMemory.users[email.toLowerCase()] = user;
      return { id: userId, email: user.email, plan, verified: false };
    }
    
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO users (id, email, password_hash, plan, verification_token) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, plan, verified, created_at`,
        [userId, email.toLowerCase(), passwordHash, plan, verificationToken]
      );
      
      return rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('User already exists');
      }
      throw error;
    }
  }

  /**
   * Authenticate user login
   */
  async loginUser({ email, password }) {
    await this.init();
    
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    console.log('DEBUG: Login attempt for email:', email.toLowerCase());
    console.log('DEBUG: Available users in memory:', Object.keys(this.inMemory.users));

    let user;
    
    if (!this.pool) {
      // In-memory storage
      user = this.inMemory.users[email.toLowerCase()];
      console.log('DEBUG: Found user in memory:', !!user);
      if (!user) {
        throw new Error('Invalid credentials');
      }
    } else {
      const { rows } = await this.pool.query(
        'SELECT id, email, password_hash, plan, verified, last_login FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      
      if (rows.length === 0) {
        throw new Error('Invalid credentials');
      }
      
      user = rows[0];
    }

    console.log('DEBUG: About to verify password');
    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    console.log('DEBUG: Password verification result:', isValidPassword);
    if (!isValidPassword) {
      // Track failed login attempt
      businessMetrics.trackBusinessError('AUTHENTICATION_FAILURE_SPIKE', {
        email: email.toLowerCase(),
        failure_reason: 'invalid_password'
      });
      throw new Error('Invalid credentials');
    }

    // Update last login if using database
    if (this.pool) {
      await this.pool.query(
        'UPDATE users SET last_login = now() WHERE id = $1',
        [user.id]
      );
    }

    // Generate authentication token
    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      plan: user.plan
    });

    // Track successful login metrics
    businessMetrics.trackUserSession(user.id, 'start', {
      email: user.email,
      plan: user.plan,
      type: 'login'
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        verified: user.verified
      },
      token
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    await this.init();
    
    if (!this.pool) {
      // In-memory storage
      const user = Object.values(this.inMemory.users).find(u => u.id === userId);
      if (user) {
        const { password_hash, verification_token, ...userWithoutSecrets } = user;
        return userWithoutSecrets;
      }
      return null;
    }
    
    const { rows } = await this.pool.query(
      'SELECT id, email, plan, verified, last_login, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    return rows[0] || null;
  }

  /**
   * Update user plan
   */
  async updateUserPlan(userId, newPlan) {
    await this.init();
    
    if (!this.pool) {
      // In-memory storage
      const user = Object.values(this.inMemory.users).find(u => u.id === userId);
      if (user) {
        user.plan = newPlan;
        return user;
      }
      throw new Error('User not found');
    }
    
    const { rows } = await this.pool.query(
      `UPDATE users SET plan = $1, updated_at = now() 
       WHERE id = $2 
       RETURNING id, email, plan, verified`,
      [newPlan, userId]
    );
    
    if (rows.length === 0) {
      throw new Error('User not found');
    }
    
    return rows[0];
  }

  /**
   * Check user plan limits
   */
  getPlanLimits(plan) {
    const limits = {
      free: {
        portfolios: 1,
        stocksPerPortfolio: 10,
        recommendationsPerDay: 5,
        realTimeData: false,
        alerts: false,
        export: false
      },
      pro: {
        portfolios: Infinity,
        stocksPerPortfolio: Infinity,
        recommendationsPerDay: Infinity,
        realTimeData: true,
        alerts: true,
        export: true
      },
      premium: {
        portfolios: Infinity,
        stocksPerPortfolio: Infinity,
        recommendationsPerDay: Infinity,
        realTimeData: true,
        alerts: true,
        export: true,
        aiInsights: true,
        prioritySupport: true
      }
    };
    
    return limits[plan] || limits.free;
  }

  /**
   * Generate a password reset token for the user
   */
  async generatePasswordResetToken(email) {
    await this.init();
    
    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    if (this.pool) {
      try {
        // First check if user exists
        const userResult = await this.pool.query(
          'SELECT id, email FROM users WHERE email = $1',
          [email.toLowerCase()]
        );
        
        if (userResult.rows.length === 0) {
          throw new Error('User not found');
        }
        
        const user = userResult.rows[0];
        
        // Store the reset token in database
        await this.pool.query(`
          INSERT INTO password_reset_tokens (user_id, token, expires_at, used) 
          VALUES ($1, $2, $3, false)
          ON CONFLICT (user_id) DO UPDATE SET
            token = $2,
            expires_at = $3,
            used = false,
            created_at = CURRENT_TIMESTAMP
        `, [user.id, resetToken, expiresAt]);
        
        return { resetToken, user };
      } catch (error) {
        console.error('Database error generating reset token:', error);
        throw new Error('Failed to generate reset token');
      }
    } else {
      // In-memory fallback
      const user = Object.values(this.inMemory.users).find(u => u.email === email);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Store in memory (this would be lost on restart in real app)
      this.inMemory.resetTokens = this.inMemory.resetTokens || {};
      this.inMemory.resetTokens[resetToken] = {
        userId: user.id,
        email: user.email,
        expiresAt: expiresAt,
        used: false
      };
      
      return { resetToken, user };
    }
  }

  /**
   * Validate a password reset token
   */
  async validatePasswordResetToken(token) {
    await this.init();
    
    if (this.pool) {
      try {
        const result = await this.pool.query(`
          SELECT prt.*, u.id as user_id, u.email 
          FROM password_reset_tokens prt
          JOIN users u ON prt.user_id = u.id
          WHERE prt.token = $1 AND prt.expires_at > CURRENT_TIMESTAMP AND prt.used = false
        `, [token]);
        
        if (result.rows.length === 0) {
          throw new Error('Invalid or expired reset token');
        }
        
        return result.rows[0];
      } catch (error) {
        console.error('Database error validating reset token:', error);
        throw new Error('Failed to validate reset token');
      }
    } else {
      // In-memory fallback
      const resetData = this.inMemory.resetTokens?.[token];
      if (!resetData || resetData.used || new Date() > resetData.expiresAt) {
        throw new Error('Invalid or expired reset token');
      }
      
      return {
        user_id: resetData.userId,
        email: resetData.email,
        token: token
      };
    }
  }

  /**
   * Reset password using a valid token
   */
  async resetPassword(token, newPassword) {
    await this.init();
    
    // Validate the token first
    const tokenData = await this.validatePasswordResetToken(token);
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    if (this.pool) {
      try {
        // Start transaction
        const client = await this.pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Update the user's password
          await client.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [hashedPassword, tokenData.user_id]
          );
          
          // Mark the token as used
          await client.query(
            'UPDATE password_reset_tokens SET used = true WHERE token = $1',
            [token]
          );
          
          await client.query('COMMIT');
          
          return { success: true };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        console.error('Database error resetting password:', error);
        throw new Error('Failed to reset password');
      }
    } else {
      // In-memory fallback
      const user = this.inMemory.users[tokenData.email];
      if (!user) {
        throw new Error('User not found');
      }
      
      // Update password
      user.password_hash = hashedPassword;
      
      // Mark token as used
      if (this.inMemory.resetTokens && this.inMemory.resetTokens[token]) {
        this.inMemory.resetTokens[token].used = true;
      }
      
      return { success: true };
    }
  }

  /**
   * Delete user account (temporary method for cleanup)
   */
  async deleteUser(email) {
    await this.init();
    
    if (this.pool) {
      try {
        // Start a transaction to delete user and related data
        const client = await this.pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Delete password reset tokens first (foreign key constraint)
          await client.query('DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [email]);
          
          // Delete the user
          const result = await client.query('DELETE FROM users WHERE email = $1', [email]);
          
          await client.query('COMMIT');
          
          return result.rowCount > 0;
          
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        
      } catch (error) {
        console.error('Database error deleting user:', error);
        throw new Error('Failed to delete user from database');
      }
    } else {
      // In-memory storage
      const userToDelete = Object.values(this.inMemory.users).find(u => u.email === email);
      if (userToDelete) {
        delete this.inMemory.users[userToDelete.id];
        // Clean up reset tokens
        if (this.inMemory.resetTokens) {
          Object.keys(this.inMemory.resetTokens).forEach(token => {
            if (this.inMemory.resetTokens[token].email === email) {
              delete this.inMemory.resetTokens[token];
            }
          });
        }
        return true;
      }
      return false;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }
}

module.exports = AuthService;