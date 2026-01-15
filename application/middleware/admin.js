'use strict';

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'admin-middleware' },
  transports: [new winston.transports.Console()]
});

/**
 * Admin middleware - checks if user has admin role
 * Must be used after authMiddleware
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user) {
    logger.warn('Admin access attempted without authentication');
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  }

  // Check various admin indicators
  const isAdmin = req.user.isAdmin ||
                  req.user.is_admin ||
                  req.user.role === 'admin' ||
                  req.user.email?.endsWith('@stockportfolio.com');

  if (!isAdmin) {
    logger.warn(`Admin access denied for user ${req.user.userId}`);
    return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_REQUIRED' });
  }

  logger.info(`Admin access granted for user ${req.user.userId}`);
  next();
};

module.exports = { adminMiddleware };
