// src/middleware/security.js - Comprehensive security middleware
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const rateLimit = require('express-rate-limit');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisManager = require('../config/redis');
const securityManager = require('../config/security');
const logger = require('../config/logger');

// Helmet configuration for security headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.github.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Advanced rate limiting with Redis
class AdvancedRateLimiter {
  constructor() {
    this.limiters = new Map();
    this.initialized = false;
    // Initialize with memory limiters first, then upgrade to Redis if available
    this.initializeMemoryLimiters();
    // Try to upgrade to Redis limiters asynchronously
    this.upgradeToRedisLimiters();
  }

  async upgradeToRedisLimiters() {
    try {
      // Wait a bit for Redis to potentially connect
      setTimeout(async () => {
        try {
          const redisClient = redisManager.getClient();
          
          if (!redisClient) {
            logger.info('Redis client not available, keeping memory-based rate limiting');
            return;
          }

          // Test Redis connection
          const isRedisHealthy = await redisManager.ping();
          if (!isRedisHealthy) {
            logger.info('Redis not healthy, keeping memory-based rate limiting');
            return;
          }
          
          logger.info('Upgrading to Redis-based rate limiters');
          
          // General API rate limiter
          this.limiters.set('api', new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_api',
            points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 900,
            blockDuration: 900, // 15 minutes
            execEvenly: true
          }));

          // Auth endpoints - stricter limits
          this.limiters.set('auth', new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_auth',
            points: 5, // 5 attempts
            duration: 900, // per 15 minutes
            blockDuration: 1800, // block for 30 minutes
            execEvenly: true
          }));

          // URL shortening - moderate limits
          this.limiters.set('shorten', new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_shorten',
            points: 50, // 50 URLs
            duration: 3600, // per hour
            blockDuration: 3600, // block for 1 hour
            execEvenly: true
          }));

          // Password attempts - very strict
          this.limiters.set('password', new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_password',
            points: 3, // 3 attempts
            duration: 300, // per 5 minutes
            blockDuration: 1800, // block for 30 minutes
            execEvenly: true
          }));

          // Bulk operations - limited
          this.limiters.set('bulk', new RateLimiterRedis({
            storeClient: redisClient,
            keyPrefix: 'rl_bulk',
            points: 5, // 5 bulk operations
            duration: 3600, // per hour
            blockDuration: 7200, // block for 2 hours
            execEvenly: true
          }));

          this.initialized = true;
          logger.info('Successfully upgraded to Redis-based rate limiters');
        } catch (error) {
          logger.warn('Failed to upgrade to Redis rate limiters:', error.message);
        }
      }, 2000); // Wait 2 seconds for Redis to potentially connect
    } catch (error) {
      logger.warn('Error in upgradeToRedisLimiters:', error.message);
    }
  }

  initializeMemoryLimiters() {
    logger.info('Initializing memory-based rate limiters');
    
    // Fallback to express-rate-limit for memory-based limiting
    this.limiters.set('api', rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        status: 'error',
        message: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    }));

    this.limiters.set('auth', rateLimit({
      windowMs: 900000, // 15 minutes
      max: 5,
      message: {
        status: 'error',
        message: 'Too many authentication attempts, please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED'
      }
    }));

    this.limiters.set('shorten', rateLimit({
      windowMs: 3600000, // 1 hour
      max: 50,
      message: {
        status: 'error',
        message: 'Too many URL shortening requests, please try again later.',
        code: 'SHORTEN_RATE_LIMIT_EXCEEDED'
      }
    }));

    this.limiters.set('password', rateLimit({
      windowMs: 300000, // 5 minutes
      max: 3,
      message: {
        status: 'error',
        message: 'Too many password attempts, please try again later.',
        code: 'PASSWORD_RATE_LIMIT_EXCEEDED'
      }
    }));

    this.limiters.set('bulk', rateLimit({
      windowMs: 3600000, // 1 hour
      max: 5,
      message: {
        status: 'error',
        message: 'Too many bulk operations, please try again later.',
        code: 'BULK_RATE_LIMIT_EXCEEDED'
      }
    }));
  }

  async checkLimit(type, identifier, req) {
    const limiter = this.limiters.get(type);
    if (!limiter) {
      logger.warn(`Rate limiter type '${type}' not found`);
      return { allowed: true };
    }

    try {
      const key = `${identifier}:${req.ip}`;
      const result = await limiter.consume(key);
      
      return {
        allowed: true,
        remaining: result.remainingPoints,
        resetTime: result.msBeforeNext
      };
    } catch (rejRes) {
      // Rate limit exceeded
      logger.security.rateLimitExceeded(req.ip, `${type}:${req.path}`);
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: rejRes.msBeforeNext,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000)
      };
    }
  }
}

const advancedRateLimiter = new AdvancedRateLimiter();

// Rate limiting middleware factory
const createRateLimiter = (type) => {
  return async (req, res, next) => {
    // Skip rate limiting if disabled in environment
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return next();
    }
    
    try {
      const identifier = req.user?.id || req.ip;
      const result = await advancedRateLimiter.checkLimit(type, identifier, req);
      
      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded for ${type} operations`,
          retryAfter: result.retryAfter
        });
      }
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': process.env.RATE_LIMIT_MAX_REQUESTS || 100,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(Date.now() + result.resetTime).toISOString()
      });
      
      next();
    } catch (error) {
      logger.error('Rate limiting error:', { error: error.message, path: req.path });
      next(); // Continue on rate limiter error
    }
  };
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    logger.error('Input sanitization error:', { error: error.message });
    next();
  }
};

const sanitizeObject = (obj) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // XSS protection
      sanitized[key] = xss(value, {
        whiteList: {}, // No HTML tags allowed
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script']
      });
      
      // NoSQL injection protection
      sanitized[key] = securityManager.sanitizeInput(sanitized[key]);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// CSRF protection middleware
const csrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests and API endpoints with API keys
  if (req.method === 'GET' || req.headers['x-api-key']) {
    return next();
  }
  
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;
  
  if (!token || !sessionToken || token !== sessionToken) {
    logger.security.suspiciousActivity('CSRF token mismatch', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid CSRF token'
    });
  }
  
  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  const headers = securityManager.getSecurityHeaders();
  
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.performance.apiResponse(
      req.path,
      req.method,
      duration,
      res.statusCode
    );
    
    // Log suspicious activities
    if (res.statusCode >= 400) {
      logger.security.suspiciousActivity('HTTP error response', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration
      });
    }
  });
  
  next();
};

// IP whitelist/blacklist middleware
const ipFilter = (req, res, next) => {
  const ip = req.ip;
  const blacklistedIPs = (process.env.BLACKLISTED_IPS || '').split(',').filter(Boolean);
  const whitelistedIPs = (process.env.WHITELISTED_IPS || '').split(',').filter(Boolean);
  
  // Check blacklist
  if (blacklistedIPs.includes(ip)) {
    logger.security.suspiciousActivity('Blacklisted IP access attempt', { ip });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied'
    });
  }
  
  // Check whitelist (if configured)
  if (whitelistedIPs.length > 0 && !whitelistedIPs.includes(ip)) {
    logger.security.suspiciousActivity('Non-whitelisted IP access attempt', { ip });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access denied'
    });
  }
  
  next();
};

// Suspicious activity detection
const suspiciousActivityDetector = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const ip = req.ip;
  
  // Detect common attack patterns
  const suspiciousPatterns = [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /burp/i,
    /owasp/i,
    /\.\.\/\.\.\//,
    /<script/i,
    /union.*select/i,
    /drop.*table/i
  ];
  
  const requestString = `${req.path} ${req.get('User-Agent')} ${JSON.stringify(req.body)}`;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      logger.security.suspiciousActivity('Suspicious request pattern detected', {
        ip,
        userAgent,
        path: req.path,
        pattern: pattern.toString()
      });
      
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Suspicious activity detected'
      });
    }
  }
  
  next();
};

// Export middleware functions
module.exports = {
  helmet: helmetConfig,
  mongoSanitize: mongoSanitize(),
  rateLimiters: {
    api: createRateLimiter('api'),
    auth: createRateLimiter('auth'),
    shorten: createRateLimiter('shorten'),
    password: createRateLimiter('password'),
    bulk: createRateLimiter('bulk')
  },
  sanitizeInput,
  csrfProtection,
  securityHeaders,
  requestLogger,
  ipFilter,
  suspiciousActivityDetector,
  AdvancedRateLimiter
};
