// src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

// Completely disable rate limiting in development
const createLimiter = (options) => {
  if (process.env.NODE_ENV === 'development') {
    // Return a no-op middleware in development
    return (req, res, next) => next();
  }
  return rateLimit(options);
};

// General rate limiting - disabled in development
const generalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path.includes('/health') || req.path.includes('/ready');
  }
});

// Authentication rate limiting - disabled in development
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path.includes('/health') || req.path.includes('/ready');
  }
});

// URL creation rate limiting - disabled in development
const urlCreationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: {
    success: false,
    error: 'Too many URL creations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Password verification rate limiting - disabled in development
const passwordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: {
    success: false,
    error: 'Too many password attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Bulk operations rate limiting - disabled in development
const bulkLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    error: 'Too many bulk operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Export rate limiters with consistent naming
module.exports = {
  api: generalLimiter,
  auth: authLimiter,
  shorten: urlCreationLimiter,
  password: passwordLimiter,
  bulk: bulkLimiter,
  // Legacy exports for backward compatibility
  generalLimiter,
  authLimiter,
  urlCreationLimiter
};
