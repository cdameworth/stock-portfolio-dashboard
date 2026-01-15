'use strict';

const { Pool } = require('pg');
const winston = require('winston');
const os = require('os');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'admin-service' },
  transports: [new winston.transports.Console()]
});

/**
 * Admin Service - handles user management, database stats, and system config
 */
class AdminService {
  constructor(config = {}) {
    this.poolConfig = {
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME || 'stock_portfolio',
      user: config.user || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD || 'postgres',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
    this.pool = new Pool(this.poolConfig);
    this.startTime = Date.now();
  }

  // ==================== USER MANAGEMENT ====================

  async getUsers(options = {}) {
    const { page = 1, limit = 20, search, role, sortBy = 'created_at', sortOrder = 'DESC' } = options;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, email, username, is_admin, role, created_at, updated_at,
        (SELECT COUNT(*) FROM portfolios WHERE user_id = users.id) as portfolio_count
      FROM users WHERE 1=1
    `;
    const values = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (email ILIKE $${paramCount} OR username ILIKE $${paramCount})`;
      values.push(`%${search}%`);
    }

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      values.push(role);
    }

    const countQuery = query.replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await this.pool.query(countQuery.split('ORDER BY')[0], values);
    const totalCount = parseInt(countResult.rows[0].count);

    const validSortColumns = ['id', 'email', 'username', 'created_at', 'updated_at', 'role'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortColumn} ${order} LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);

    const result = await this.pool.query(query, values);

    return {
      users: result.rows.map(user => ({ ...user, password: undefined })),
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    };
  }

  async getUserById(userId) {
    const query = `
      SELECT u.id, u.email, u.username, u.is_admin, u.role, u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM portfolios WHERE user_id = u.id) as portfolio_count,
        (SELECT json_agg(json_build_object('id', p.id, 'name', p.name)) FROM portfolios p WHERE p.user_id = u.id) as portfolios
      FROM users u WHERE u.id = $1
    `;
    const result = await this.pool.query(query, [userId]);
    if (result.rows.length === 0) throw new Error('User not found');
    return result.rows[0];
  }

  async updateUser(userId, updates, adminUserId) {
    const allowedUpdates = ['is_admin', 'role'];
    const updateFields = [];
    const values = [];
    let paramCount = 0;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }

    if (updateFields.length === 0) throw new Error('No valid update fields provided');

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE users SET ${updateFields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING id, email, username, is_admin, role, updated_at
    `;
    values.push(userId);

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) throw new Error('User not found');

    await this.logAdminAction(adminUserId, 'UPDATE_USER', 'user', userId, updates);
    return result.rows[0];
  }

  async deleteUser(userId, adminUserId) {
    const checkResult = await this.pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (checkResult.rows.length === 0) throw new Error('User not found');

    await this.pool.query('DELETE FROM portfolios WHERE user_id = $1', [userId]);
    await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);

    await this.logAdminAction(adminUserId, 'DELETE_USER', 'user', userId, { email: checkResult.rows[0].email });
    return { success: true, deletedUserId: userId };
  }

  // ==================== DATABASE STATS ====================

  async getDatabaseStats() {
    const stats = {};

    const tableSizeQuery = `
      SELECT tablename as table_name,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
        pg_total_relation_size(schemaname || '.' || tablename) as size_bytes
      FROM pg_tables WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    `;
    const tableSizes = await this.pool.query(tableSizeQuery);
    stats.tableSizes = tableSizes.rows;

    const tables = ['users', 'portfolios', 'recommendations', 'stock_recommendations'];
    stats.rowCounts = {};
    for (const table of tables) {
      try {
        const countResult = await this.pool.query(`SELECT COUNT(*) FROM ${table}`);
        stats.rowCounts[table] = parseInt(countResult.rows[0].count);
      } catch (error) {
        stats.rowCounts[table] = 'error';
      }
    }

    const dbSizeQuery = `SELECT pg_size_pretty(pg_database_size(current_database())) as db_size`;
    const dbSize = await this.pool.query(dbSizeQuery);
    stats.databaseSize = dbSize.rows[0].db_size;

    stats.connectionPool = {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingRequests: this.pool.waitingCount
    };

    return stats;
  }

  // ==================== SYSTEM HEALTH ====================

  async getExtendedSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
        },
        cpu: { cores: os.cpus().length, model: os.cpus()[0]?.model || 'Unknown', loadAvg: os.loadavg() }
      },
      process: { pid: process.pid, memoryUsage: process.memoryUsage(), uptime: process.uptime() }
    };

    try {
      const dbStart = Date.now();
      await this.pool.query('SELECT 1');
      health.database = { status: 'connected', responseTime: Date.now() - dbStart };
    } catch (error) {
      health.database = { status: 'error', error: error.message };
      health.status = 'degraded';
    }

    return health;
  }

  // ==================== AUDIT LOGGING ====================

  async logAdminAction(adminUserId, action, targetType, targetId, details = {}, meta = {}) {
    const query = `
      INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `;
    try {
      await this.pool.query(query, [
        adminUserId, action, targetType, String(targetId),
        JSON.stringify(details), meta.ipAddress || null, meta.userAgent || null
      ]);
    } catch (error) {
      logger.error('Failed to log admin action:', error);
    }
  }

  async getAuditLog(options = {}) {
    const { page = 1, limit = 50, action, adminUserId, since } = options;
    const offset = (page - 1) * limit;

    let query = `
      SELECT al.*, u.email as admin_email
      FROM admin_audit_log al LEFT JOIN users u ON al.admin_user_id = u.id
      WHERE 1=1
    `;
    const values = [];
    let paramCount = 0;

    if (action) {
      paramCount++;
      query += ` AND al.action = $${paramCount}`;
      values.push(action);
    }
    if (adminUserId) {
      paramCount++;
      query += ` AND al.admin_user_id = $${paramCount}`;
      values.push(adminUserId);
    }
    if (since) {
      paramCount++;
      query += ` AND al.created_at >= $${paramCount}`;
      values.push(since);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return { logs: result.rows, pagination: { page, limit } };
  }

  // ==================== SYSTEM CONFIG ====================

  async getSystemConfig() {
    try {
      const query = `SELECT config_key, config_value, description, updated_at FROM system_config ORDER BY config_key`;
      const result = await this.pool.query(query);
      return result.rows.reduce((acc, row) => {
        acc[row.config_key] = { value: row.config_value, description: row.description, updatedAt: row.updated_at };
        return acc;
      }, {});
    } catch (error) {
      // Table might not exist yet
      return {};
    }
  }

  async updateSystemConfig(key, value, adminUserId) {
    const query = `
      UPDATE system_config SET config_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
      WHERE config_key = $3 RETURNING *
    `;
    const result = await this.pool.query(query, [JSON.stringify(value), adminUserId, key]);
    if (result.rows.length === 0) throw new Error(`Config key '${key}' not found`);
    await this.logAdminAction(adminUserId, 'UPDATE_CONFIG', 'system_config', key, { newValue: value });
    return result.rows[0];
  }
}

module.exports = AdminService;
