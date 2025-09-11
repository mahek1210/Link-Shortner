// src/config/logger.js - Production-ready logging with Winston
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'link-shortener' },
  transports: [
    // Error log file
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    
    // Combined log file
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    }),
    
    // Security events log
    new DailyRotateFile({
      filename: path.join(logDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true
    })
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    })
  ],
  
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Security logger for sensitive events
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'security' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'security-events-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '365d',
      zippedArchive: true
    })
  ]
});

// Performance logger
const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'performance' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'performance-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true
    })
  ]
});

// Audit logger for compliance
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'audit' },
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '2555d', // 7 years for compliance
      zippedArchive: true
    })
  ]
});

// Helper functions for structured logging
const loggers = {
  // Main application logger
  info: (message, meta = {}) => logger.info(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  
  // Security events
  security: {
    loginAttempt: (userId, ip, success) => {
      securityLogger.info('Login attempt', {
        userId,
        ip,
        success,
        timestamp: new Date().toISOString(),
        event: 'login_attempt'
      });
    },
    
    rateLimitExceeded: (ip, endpoint) => {
      securityLogger.warn('Rate limit exceeded', {
        ip,
        endpoint,
        timestamp: new Date().toISOString(),
        event: 'rate_limit_exceeded'
      });
    },
    
    suspiciousActivity: (description, meta) => {
      securityLogger.warn('Suspicious activity detected', {
        description,
        ...meta,
        timestamp: new Date().toISOString(),
        event: 'suspicious_activity'
      });
    },
    
    dataAccess: (userId, resource, action) => {
      auditLogger.info('Data access', {
        userId,
        resource,
        action,
        timestamp: new Date().toISOString(),
        event: 'data_access'
      });
    }
  },
  
  // Performance monitoring
  performance: {
    apiResponse: (endpoint, method, duration, statusCode) => {
      performanceLogger.info('API response', {
        endpoint,
        method,
        duration,
        statusCode,
        timestamp: new Date().toISOString(),
        event: 'api_response'
      });
    },
    
    dbQuery: (collection, operation, duration) => {
      performanceLogger.info('Database query', {
        collection,
        operation,
        duration,
        timestamp: new Date().toISOString(),
        event: 'db_query'
      });
    }
  },
  
  // Audit trail
  audit: {
    userAction: (userId, action, resource, details = {}) => {
      auditLogger.info('User action', {
        userId,
        action,
        resource,
        details,
        timestamp: new Date().toISOString(),
        event: 'user_action'
      });
    },
    
    adminAction: (adminId, action, target, details = {}) => {
      auditLogger.info('Admin action', {
        adminId,
        action,
        target,
        details,
        timestamp: new Date().toISOString(),
        event: 'admin_action'
      });
    },
    
    systemEvent: (event, details = {}) => {
      auditLogger.info('System event', {
        event,
        details,
        timestamp: new Date().toISOString(),
        event: 'system_event'
      });
    }
  }
};

module.exports = loggers;
