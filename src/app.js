// src/app.js - Enhanced Express application with comprehensive security and monitoring
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const database = require('./config/database');
const path = require('path');

// Import configurations and services
const logger = require('./config/logger');
const redisManager = require('./config/redis');
const securityManager = require('./config/security');

// Import middleware
const { 
  helmet, 
  mongoSanitize, 
  rateLimiters,
  sanitizeInput,
  securityHeaders,
  requestLogger,
  ipFilter,
  suspiciousActivityDetector
} = require('./middleware/security');
const { errorHandler, catchAsync } = require('./middleware/errorHandler');
const { validate } = require('./middleware/validation');

// Import routes
const authRoutes = require('./routes/authRoutes');
const shortenRoutes = require('./routes/shortenRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const advancedAnalyticsRoutes = require('./routes/advancedAnalyticsRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');
const bulkRoutes = require('./routes/bulkRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const auditRoutes = require('./routes/auditRoutes');
const moderationRoutes = require('./routes/moderationRoutes');

// Import services
const urlService = require('./services/urlService');
const cacheService = require('./services/cacheService');
const auditService = require('./services/auditService');
const contentModerationService = require('./services/contentModerationService');
const performanceService = require('./services/performanceService');

class Application {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Link Shortener application...');

      // Connect to databases
      await this.connectDatabases();

      // Setup middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      // Setup health checks
      this.setupHealthChecks();

      // Initialize performance optimizations (non-blocking)
      if (performanceService) {
        logger.info('Initializing performance optimizations...');
        setImmediate(async () => {
          try {
            await performanceService.initializeIndexes();
            performanceService.startMaintenanceScheduler();
            logger.info('✅ Performance optimizations initialized');
          } catch (error) {
            logger.warn('Performance optimization initialization failed:', error.message);
          }
        });
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Application initialized successfully');
      return this.app;
    } catch (error) {
      logger.error('Failed to initialize application:', { error: error.message });
      throw error;
    }
  }

  async connectDatabases() {
    try {
      logger.info('Connecting to databases...');

      // Connect to MongoDB with optimized settings
      logger.info('Connecting to MongoDB...');
      await database.connect();

      // Connect to Redis (optional)
      try {
        await redisManager.connect();
        if (redisManager.isHealthy()) {
          logger.info('Redis connection established');
        } else {
          logger.info('Redis disabled, using memory-based caching');
        }
      } catch (error) {
        logger.warn('Redis connection failed, continuing without cache:', { error: error.message });
      }

      logger.info('Database connections established');
    } catch (error) {
      logger.error('Database connection failed:', { error: error.message });
      throw error;
    }
  }

  setupMiddleware() {
    logger.info('Setting up middleware...');

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);

    // Essential security middleware only
    this.app.use(helmet);
    this.app.use(securityHeaders);

    // Skip heavy middleware in development for better performance
    if (process.env.NODE_ENV !== 'development') {
      this.app.use(ipFilter);
      this.app.use(suspiciousActivityDetector);
    }

    // Optimized request logging - only in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(requestLogger);
    }

    // Compression with optimized settings
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 4, // Reduced from 6 for better performance
      threshold: 512 // Reduced from 1024
    }));

    // CORS configuration with caching
    const corsOptions = {
      origin: (origin, callback) => {
        // In development, allow all origins including no origin
        if (process.env.NODE_ENV === 'development') {
          return callback(null, true);
        }
        
        const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5000').split(',').filter(Boolean);
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.security.suspiciousActivity('CORS violation', { origin });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-CSRF-Token'
      ],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ],
      maxAge: 86400 // Cache preflight for 24 hours
    };

    this.app.use(cors(corsOptions));

    // Optimized body parsing
    this.app.use(express.json({ 
      limit: '512kb', // Reduced from 1mb for better performance
      verify: (req, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '512kb' // Reduced from 1mb for better performance
    }));

    // Input sanitization - simplified for performance
    this.app.use(sanitizeInput);

    // Favicon handler to prevent 404 errors
    this.app.get('/favicon.ico', (req, res) => {
      res.status(204).send(); // No content
    });

    // Static files with enhanced caching
    this.app.use('/static', express.static(path.join(__dirname, '../public'), {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        // Set cache headers based on file type
        if (path.endsWith('.js') || path.endsWith('.css')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    }));

    // Simplified request context middleware
    this.app.use((req, res, next) => {
      req.requestId = require('crypto').randomUUID();
      req.startTime = Date.now();
      
      // Simplified IP detection
      req.clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     '127.0.0.1';

      next();
    });

    // Optimized audit logging middleware - only for critical API requests
    this.app.use('/api', (req, res, next) => {
      // Skip audit logging in development for better performance
      if (process.env.NODE_ENV === 'development') {
        return next();
      }

      const originalSend = res.send;
      const originalJson = res.json;
      
      // Override response methods to capture response data
      res.send = function(data) {
        res.responseData = data;
        return originalSend.call(this, data);
      };
      
      res.json = function(data) {
        res.responseData = data;
        return originalJson.call(this, data);
      };

      // Log API request completion (async, non-blocking)
      res.on('finish', () => {
        // Use setImmediate to make logging non-blocking
        setImmediate(async () => {
          try {
            // Only log significant API calls (not health checks)
            if (!req.path.includes('/health') && !req.path.includes('/ready')) {
              const duration = Date.now() - req.startTime;
              
              await auditService.logDataAccess(
                'api',
                req.path,
                `${req.method} ${req.path}`,
                req.user?.id || null,
                {
                  statusCode: res.statusCode,
                  duration,
                  requestSize: req.get('content-length') || 0,
                  responseSize: res.get('content-length') || 0
                },
                {
                  category: 'api',
                  severity: res.statusCode >= 400 ? 'medium' : 'low',
                  success: res.statusCode < 400,
                  ipAddress: req.clientIP,
                  userAgent: req.get('User-Agent'),
                  requestId: req.requestId
                }
              );
            }
          } catch (error) {
            // Silently fail audit logging to not impact performance
            if (process.env.NODE_ENV !== 'production') {
              logger.error('Failed to log API audit trail:', error);
            }
          }
        });
      });

      next();
    });

    logger.info('Middleware setup completed');
  }

  setupRoutes() {
    logger.info('Setting up routes...');

    // API versioning
    const apiV1 = express.Router();

    // Apply rate limiting to API routes
    apiV1.use(rateLimiters.api);

    // Authentication routes (mount both with and without rate limiting for development)
    if (process.env.NODE_ENV === 'development') {
      apiV1.use('/auth', authRoutes);
    } else {
      apiV1.use('/auth', rateLimiters.auth, authRoutes);
    }

    // URL shortening routes
    apiV1.use('/shorten', rateLimiters.shorten, shortenRoutes);

    // Analytics routes
    apiV1.use('/analytics', analyticsRoutes);
    apiV1.use('/advanced-analytics', advancedAnalyticsRoutes);

    // User management routes
    apiV1.use('/user', userRoutes);

    // Admin routes
    apiV1.use('/admin', adminRoutes);

    // API routes (for API key access)
    apiV1.use('/api', apiRoutes);

    // Bulk operations routes
    apiV1.use('/bulk', rateLimiters.bulk, bulkRoutes);

    // Monitoring routes
    apiV1.use('/monitoring', monitoringRoutes);

    // Compliance routes (GDPR, data protection)
    apiV1.use('/compliance', complianceRoutes);

    // Audit routes (audit logging and reporting)
    apiV1.use('/audit', auditRoutes);

    // Content moderation routes
    apiV1.use('/moderation', moderationRoutes);

    // Mount API v1
    this.app.use('/api/v1', apiV1);

    // Backward compatibility - mount routes directly under /api
    this.app.use('/api', apiV1);

    // Mount auth routes directly for Google OAuth (needed for frontend redirects)
    this.app.use('/auth', authRoutes);

    // Password protection route
    this.app.get('/password/:shortCode', catchAsync(async (req, res) => {
      const { shortCode } = req.params;
      const passwordController = require('./controllers/passwordController');
      return passwordController.renderPasswordForm(req, res);
    }));

    this.app.post('/password/:shortCode', 
      rateLimiters.password,
      validate('passwordVerification'),
      catchAsync(async (req, res) => {
        const passwordController = require('./controllers/passwordController');
        return passwordController.verifyPassword(req, res);
      })
    );

    // Main redirect route with enhanced analytics
    this.app.get('/:shortCode', catchAsync(async (req, res) => {
      const { shortCode } = req.params;
      
      try {
        logger.info(`Redirect request for shortCode: ${shortCode}`);
        
        // Get URL from service (includes caching)
        const url = await urlService.getUrlByShortCode(shortCode);
        
        if (!url) {
          return res.status(404).send(this.generateErrorPage(
            'Link Not Found',
            'The requested link does not exist or has been removed.'
          ));
        }

        // Check if link is disabled by moderation
        if (url.status === 'disabled') {
          logger.security.suspiciousActivity('Disabled link accessed', { 
            shortCode, 
            reason: url.disabledReason,
            ip: req.clientIP 
          });
          
          return res.status(403).send(this.generateErrorPage(
            'Link Disabled',
            'This link has been disabled due to policy violations.',
            'If you believe this is an error, please contact support.'
          ));
        }

        // Check if link is expired
        if (url.status === 'expired' || (url.isExpired && url.isExpired())) {
          logger.info(`Expired link accessed: ${shortCode}`);
          
          return res.status(410).send(this.generateErrorPage(
            'Link Expired',
            'This link has expired and is no longer accessible.',
            `Expired on: ${url.expiresAt ? url.expiresAt.toLocaleDateString() : 'N/A'}`
          ));
        }

        // Check if link requires password
        if (url.requiresPassword && url.requiresPassword()) {
          logger.info(`Password-protected link accessed: ${shortCode}`);
          return res.redirect(`/password/${shortCode}`);
        }

        // Track click using advanced analytics controller
        const advancedAnalyticsController = require('./controllers/advancedAnalyticsController');
        
        // Create a mock request object for the analytics controller
        const analyticsReq = {
          ...req,
          params: { shortCode },
          ip: req.clientIP,
          get: (header) => req.get(header),
          query: req.query,
          geoip: req.geoip,
          sessionID: req.sessionID || require('crypto').randomUUID()
        };
        
        // Create a mock response object that captures the redirect
        const analyticsRes = {
          redirect: (statusCode, redirectUrl) => {
            logger.info(`Analytics tracked, redirecting ${shortCode} to: ${redirectUrl}`);
            res.redirect(statusCode, redirectUrl);
          },
          status: (code) => ({
            json: (data) => {
              logger.error('Analytics tracking failed:', data);
              // Still redirect even if analytics fails
              res.redirect(301, url.originalUrl);
            },
            send: (data) => {
              logger.error('Analytics tracking failed:', data);
              // Still redirect even if analytics fails
              res.redirect(301, url.originalUrl);
            }
          })
        };

        // Call the advanced analytics trackClick method
        await advancedAnalyticsController.trackClick(analyticsReq, analyticsRes);
        
      } catch (error) {
        logger.error('Redirect route error:', { error: error.message, shortCode });
        
        // If analytics fails, still try to redirect
        try {
          const url = await urlService.getUrlByShortCode(shortCode);
          if (url) {
            logger.info(`Fallback redirect for ${shortCode} to: ${url.originalUrl}`);
            return res.redirect(301, url.originalUrl);
          }
        } catch (fallbackError) {
          logger.error('Fallback redirect failed:', fallbackError);
        }
        
        if (error.message.includes('not found') || error.message.includes('expired')) {
          return res.status(404).send(this.generateErrorPage(
            'Link Not Found',
            'The requested link does not exist or has been removed.'
          ));
        }
        
        return res.status(500).send(this.generateErrorPage(
          'Server Error',
          'An error occurred while processing your request. Please try again later.'
        ));
      }
    }));

    logger.info('Routes setup completed');
  }

  setupErrorHandling() {
    logger.info('Setting up error handling...');

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        status: 'fail',
        message: 'API endpoint not found',
        code: 'NOT_FOUND_ERROR',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler for web routes
    this.app.use('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          status: 'fail',
          message: 'API endpoint not found',
          code: 'NOT_FOUND_ERROR',
          timestamp: new Date().toISOString()
        });
      }
      
      res.status(404).send(this.generateErrorPage(
        'Page Not Found',
        'The page you are looking for does not exist.'
      ));
    });

    // Global error handler
    this.app.use(errorHandler);

    logger.info('Error handling setup completed');
  }

  setupHealthChecks() {
    logger.info('Setting up health checks...');

    // Basic health check
    this.app.get('/health', catchAsync(async (req, res) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: require('../../package.json').version
      };

      res.json(health);
    }));

    // Detailed health check
    this.app.get('/health/detailed', catchAsync(async (req, res) => {
      const [dbHealth, redisHealth, cacheHealth] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        cacheService.healthCheck()
      ]);

      const health = {
        status: dbHealth.healthy && redisHealth.healthy && cacheHealth.healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: require('../../package.json').version,
        services: {
          database: dbHealth,
          redis: redisHealth,
          cache: cacheHealth
        },
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      };

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    }));

    // Ready check for Kubernetes
    this.app.get('/ready', catchAsync(async (req, res) => {
      if (database.isHealthy() && redisManager.isHealthy()) {
        res.status(200).json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'not ready' });
      }
    }));

    logger.info('Health checks setup completed');
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, forcing exit...');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      if (this.server) {
        this.server.close(async () => {
          logger.info('HTTP server closed');

          try {
            // Close database connections
            await database.disconnect();
            await redisManager.disconnect();

            logger.info('Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            logger.error('Error during graceful shutdown:', { error: error.message });
            process.exit(1);
          }
        });

        // Force close after 30 seconds
        setTimeout(() => {
          logger.error('Graceful shutdown timeout, forcing exit...');
          process.exit(1);
        }, 30000);
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  // Helper methods
  generateErrorPage(title, message, details = '') {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0;
                  padding: 20px;
              }
              .container {
                  background: white;
                  padding: 40px;
                  border-radius: 12px;
                  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                  max-width: 500px;
                  width: 100%;
                  text-align: center;
              }
              h1 {
                  color: #1f2937;
                  margin-bottom: 20px;
                  font-size: 28px;
              }
              p {
                  color: #6b7280;
                  margin-bottom: 20px;
                  line-height: 1.6;
              }
              .details {
                  color: #9ca3af;
                  font-size: 14px;
                  margin-top: 20px;
              }
              .home-link {
                  display: inline-block;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  text-decoration: none;
                  padding: 12px 24px;
                  border-radius: 8px;
                  font-weight: 600;
                  margin-top: 20px;
                  transition: transform 0.2s;
              }
              .home-link:hover {
                  transform: translateY(-1px);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>${title}</h1>
              <p>${message}</p>
              ${details ? `<div class="details">${details}</div>` : ''}
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="home-link">
                  Go to Homepage
              </a>
          </div>
      </body>
      </html>
    `;
  }

  detectDevice(userAgent) {
    if (!userAgent) return 'Unknown';
    
    if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) {
      return /iPad/i.test(userAgent) ? 'Tablet' : 'Mobile';
    }
    return 'Desktop';
  }

  detectBrowser(userAgent) {
    if (!userAgent) return 'Unknown';
    
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    
    return 'Unknown';
  }

  detectOS(userAgent) {
    if (!userAgent) return 'Unknown';
    
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    
    return 'Unknown';
  }

  async checkDatabaseHealth() {
    try {
      const stats = await database.getConnectionStats();
      return {
        healthy: stats.isHealthy,
        responseTime: stats.responseTime,
        status: database.getConnectionState()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async checkRedisHealth() {
    try {
      const isHealthy = await redisManager.ping();
      const stats = redisManager.getStats();
      
      return {
        healthy: isHealthy,
        stats
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async start(port = process.env.PORT || 5000) {
    try {
      await this.initialize();
      
      this.server = this.app.listen(port, () => {
        logger.info(`🚀 Link Shortener server running on port ${port}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
        logger.info(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${port}`}`);
        logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      });

      return this.server;
    } catch (error) {
      logger.error('Failed to start server:', { error: error.message });
      throw error;
    }
  }
}

module.exports = Application;
