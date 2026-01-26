'use strict';

// Auth service will be set by the server
let authService = null;

/**
 * Set the auth service instance
 */
const setAuthService = (service) => {
  authService = service;
};

/**
 * Authentication middleware - verifies Branca token
 */
const authenticateToken = async (req, res, next) => {
  if (!authService) {
    return res.status(500).json({ error: 'Auth service not initialized' });
  }
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'AUTH_TOKEN_REQUIRED' 
      });
    }

    // Verify the Branca token
    const payload = authService.verifyToken(token);
    
    // Get full user details
    const user = await authService.getUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'AUTH_USER_NOT_FOUND' 
      });
    }

    // Attach user to request
    req.user = user;
    req.user.limits = authService.getPlanLimits(user.plan);
    
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      code: 'AUTH_INVALID_TOKEN' 
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    // If authService is not initialized, continue without authentication
    if (!authService) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const payload = authService.verifyToken(token);
      const user = await authService.getUserById(payload.userId);
      
      if (user) {
        req.user = user;
        req.user.limits = authService.getPlanLimits(user.plan);
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication on error
    next();
  }
};

/**
 * Check plan limits middleware
 */
const checkPlanLimits = (feature) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED' 
        });
      }

      const limits = req.user.limits;
      
      // Check feature-specific limits
      switch (feature) {
        case 'portfolios':
          // Count user's current portfolios
          // This would need to be implemented with portfolio service
          break;
          
        case 'recommendations':
          // Check daily recommendation limit
          // This would need to be implemented with rate limiting
          break;
          
        case 'realtime_data':
          if (!limits.realTimeData) {
            return res.status(402).json({ 
              error: 'Real-time data requires Pro plan or higher',
              code: 'PLAN_UPGRADE_REQUIRED',
              feature: 'realtime_data',
              currentPlan: req.user.plan
            });
          }
          break;
          
        case 'export':
          if (!limits.export) {
            return res.status(402).json({
              error: 'Export feature requires Pro plan or higher',
              code: 'PLAN_UPGRADE_REQUIRED',
              feature: 'export',
              currentPlan: req.user.plan
            });
          }
          break;

        case 'ai_insights':
          if (!limits.aiInsights) {
            return res.status(402).json({
              error: 'Advanced AI insights require Premium plan',
              code: 'PLAN_UPGRADE_REQUIRED',
              feature: 'ai_insights',
              currentPlan: req.user.plan
            });
          }
          break;

        case 'alerts':
          if (!limits.alerts) {
            return res.status(402).json({
              error: 'Price alerts require Pro plan or higher',
              code: 'PLAN_UPGRADE_REQUIRED',
              feature: 'alerts',
              currentPlan: req.user.plan
            });
          }
          break;

        default:
          break;
      }
      
      next();
    } catch (error) {
      console.error('Plan limits check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Rate limiting middleware for free users
 */
const rateLimitFree = (requestsPerHour = 60) => {
  const requestCounts = new Map();
  
  return (req, res, next) => {
    if (!req.user || req.user.plan !== 'free') {
      return next(); // Skip rate limiting for non-free users
    }
    
    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - (60 * 60 * 1000); // 1 hour ago
    
    // Clean old entries
    for (const [key, data] of requestCounts.entries()) {
      if (data.timestamp < windowStart) {
        requestCounts.delete(key);
      }
    }
    
    // Check current user's requests
    const userRequests = requestCounts.get(userId) || { count: 0, timestamp: now };
    
    if (userRequests.timestamp < windowStart) {
      // Reset count for new window
      userRequests.count = 0;
      userRequests.timestamp = now;
    }
    
    if (userRequests.count >= requestsPerHour) {
      return res.status(429).json({
        error: 'Rate limit exceeded for free plan',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: requestsPerHour,
        resetTime: new Date(userRequests.timestamp + (60 * 60 * 1000)).toISOString()
      });
    }
    
    // Increment count
    userRequests.count++;
    requestCounts.set(userId, userRequests);
    
    next();
  };
};

module.exports = {
  setAuthService,
  authenticateToken,
  optionalAuth,
  checkPlanLimits,
  rateLimitFree
};