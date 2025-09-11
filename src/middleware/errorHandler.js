// src/middleware/errorHandler.js - Enhanced error handling with comprehensive logging and monitoring
const logger = require('../config/logger');
const redisManager = require('../config/redis');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE_ERROR');
  }
}

// Database error handlers
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message, { field: err.path, value: err.value });
};

const handleDuplicateFieldsDB = (err) => {
  const duplicateField = Object.keys(err.keyValue)[0];
  const duplicateValue = err.keyValue[duplicateField];
  const message = `${duplicateField} '${duplicateValue}' already exists`;
  return new ConflictError(message);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => ({
    field: el.path,
    message: el.message,
    value: el.value
  }));
  const message = 'Validation failed';
  return new ValidationError(message, errors);
};

// JWT error handlers
const handleJWTError = () => new AuthenticationError('Invalid token. Please log in again');
const handleJWTExpiredError = () => new AuthenticationError('Token expired. Please log in again');

// Redis error handlers
const handleRedisError = (err) => {
  logger.error('Redis error:', { error: err.message });
  return new ServiceUnavailableError('Cache service temporarily unavailable');
};

// Rate limiting error handler
const handleRateLimitError = (err) => {
  const retryAfter = Math.ceil(err.msBeforeNext / 1000);
  return new RateLimitError(`Rate limit exceeded. Try again in ${retryAfter} seconds`);
};

// Error response formatters
const sendErrorDev = (err, req, res) => {
  // Log detailed error in development
  logger.error('Development Error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(err.statusCode).json({
    status: err.status,
    error: {
      message: err.message,
      code: err.code,
      details: err.details,
      stack: err.stack,
      timestamp: err.timestamp
    },
    request: {
      url: req.originalUrl,
      method: req.method,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    }
  });
};

const sendErrorProd = (err, req, res) => {
  // Log error for monitoring
  logger.error('Production Error:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: err.timestamp
  });

  // Track error metrics
  trackErrorMetrics(err, req);

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const response = {
      status: err.status,
      message: err.message,
      code: err.code,
      timestamp: err.timestamp
    };

    // Include details for validation errors
    if (err.code === 'VALIDATION_ERROR' && err.details) {
      response.details = err.details;
    }

    // Include retry information for rate limiting
    if (err.code === 'RATE_LIMIT_ERROR' && err.retryAfter) {
      response.retryAfter = err.retryAfter;
      res.set('Retry-After', err.retryAfter);
    }

    res.status(err.statusCode).json(response);
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Unexpected Error:', {
      error: err,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method
    });

    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

// Error metrics tracking
const trackErrorMetrics = async (err, req) => {
  try {
    const errorKey = `error_metrics:${err.code || 'UNKNOWN'}:${new Date().toISOString().split('T')[0]}`;
    await redisManager.incr(errorKey, 86400); // 24 hours TTL

    // Track endpoint-specific errors
    const endpointErrorKey = `endpoint_errors:${req.method}:${req.route?.path || req.path}:${new Date().toISOString().split('T')[0]}`;
    await redisManager.incr(endpointErrorKey, 86400);

    // Track user-specific errors (if authenticated)
    if (req.user?.id) {
      const userErrorKey = `user_errors:${req.user.id}:${new Date().toISOString().split('T')[0]}`;
      await redisManager.incr(userErrorKey, 86400);
    }
  } catch (redisError) {
    logger.error('Failed to track error metrics:', { error: redisError.message });
  }
};

// Alert system for critical errors
const sendErrorAlert = async (err, req) => {
  const criticalErrors = ['INTERNAL_SERVER_ERROR', 'SERVICE_UNAVAILABLE_ERROR'];

  if (criticalErrors.includes(err.code)) {
    // In a real application, you would send alerts to Slack, email, etc.
    logger.error('CRITICAL ERROR ALERT:', {
      message: err.message,
      code: err.code,
      url: req.originalUrl,
      method: req.method,
      timestamp: err.timestamp,
      stack: err.stack
    });
  }
};

// Main error handling middleware
const errorHandler = async (err, req, res, next) => {
  // Set default error properties
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  err.timestamp = err.timestamp || new Date().toISOString();

  // Handle different types of errors
  let error = { ...err };
  error.message = err.message;

  // Database errors
  if (error.name === 'CastError') error = handleCastErrorDB(error);
  if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  if (error.name === 'ValidationError') error = handleValidationErrorDB(error);

  // JWT errors
  if (error.name === 'JsonWebTokenError') error = handleJWTError();
  if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

  // Redis errors
  if (error.name === 'RedisError') error = handleRedisError(error);

  // Rate limiting errors
  if (error.name === 'RateLimiterError') error = handleRateLimitError(error);

  // Send alerts for critical errors
  await sendErrorAlert(error, req);

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

// Async error wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Unhandled rejection handler
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    error: err.message,
    stack: err.stack,
    promise
  });

  // Close server gracefully
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', {
    error: err.message,
    stack: err.stack
  });

  // Close server gracefully
  process.exit(1);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = {
  errorHandler,
  catchAsync,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError
};
