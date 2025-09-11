// src/middleware/validation.js - Input validation middleware using Joi
const Joi = require('joi');
const logger = require('../config/logger');

// Custom validation schemas
const schemas = {
  // User registration/login
  userRegistration: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot exceed 30 characters',
        'any.required': 'Username is required'
      }),
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required'
      })
  }),

  userLogin: Joi.object({
    email: Joi.string()
      .email()
      .required(),
    password: Joi.string()
      .required()
  }),

  // URL shortening
  urlShorten: Joi.object({
    originalUrl: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .messages({
        'string.uri': 'Please provide a valid URL starting with http:// or https://',
        'any.required': 'URL is required'
      }),
    customAlias: Joi.string()
      .alphanum()
      .min(3)
      .max(50)
      .optional()
      .messages({
        'string.alphanum': 'Custom alias can only contain letters and numbers',
        'string.min': 'Custom alias must be at least 3 characters long',
        'string.max': 'Custom alias cannot exceed 50 characters'
      }),
    password: Joi.string()
      .min(4)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Password must be at least 4 characters long',
        'string.max': 'Password cannot exceed 100 characters'
      }),
    expiresAt: Joi.date()
      .min('now')
      .optional()
      .messages({
        'date.min': 'Expiration date must be in the future'
      }),
    tags: Joi.array()
      .items(Joi.string().max(50))
      .max(10)
      .optional()
      .messages({
        'array.max': 'Cannot have more than 10 tags',
        'string.max': 'Each tag cannot exceed 50 characters'
      }),
    title: Joi.string()
      .max(200)
      .optional()
      .messages({
        'string.max': 'Title cannot exceed 200 characters'
      }),
    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 500 characters'
      })
  }),

  // Bulk URL operations
  bulkUrls: Joi.object({
    urls: Joi.array()
      .items(Joi.object({
        originalUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
        customAlias: Joi.string().alphanum().min(3).max(50).optional(),
        tags: Joi.array().items(Joi.string().max(50)).max(5).optional()
      }))
      .min(1)
      .max(100)
      .required()
      .messages({
        'array.min': 'At least one URL is required',
        'array.max': 'Cannot process more than 100 URLs at once'
      })
  }),

  // Password verification
  passwordVerification: Joi.object({
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required'
      })
  }),

  // User profile update
  userUpdate: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .optional(),
    email: Joi.string()
      .email()
      .optional(),
    name: Joi.string()
      .max(100)
      .optional(),
    currentPassword: Joi.string()
      .when('newPassword', {
        is: Joi.exist(),
        then: Joi.required(),
        otherwise: Joi.optional()
      }),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .optional()
  }),

  // API key generation
  apiKeyGeneration: Joi.object({
    name: Joi.string()
      .min(3)
      .max(100)
      .required()
      .messages({
        'string.min': 'API key name must be at least 3 characters long',
        'string.max': 'API key name cannot exceed 100 characters',
        'any.required': 'API key name is required'
      }),
    permissions: Joi.array()
      .items(Joi.string().valid('read', 'write', 'delete', 'analytics'))
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one permission is required',
        'any.only': 'Invalid permission. Allowed values: read, write, delete, analytics'
      }),
    expiresAt: Joi.date()
      .min('now')
      .optional()
  }),

  // Analytics query
  analyticsQuery: Joi.object({
    startDate: Joi.date()
      .optional(),
    endDate: Joi.date()
      .min(Joi.ref('startDate'))
      .optional()
      .messages({
        'date.min': 'End date must be after start date'
      }),
    groupBy: Joi.string()
      .valid('day', 'week', 'month', 'year')
      .optional(),
    metrics: Joi.array()
      .items(Joi.string().valid('clicks', 'uniqueVisitors', 'referrers', 'locations', 'devices'))
      .optional()
  }),

  // Contact/Support
  contactForm: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .required(),
    email: Joi.string()
      .email()
      .required(),
    subject: Joi.string()
      .min(5)
      .max(200)
      .required(),
    message: Joi.string()
      .min(10)
      .max(2000)
      .required()
  }),

  // Pagination
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .optional(),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .optional(),
    sortBy: Joi.string()
      .valid('createdAt', 'clicks', 'lastAccessed', 'title')
      .default('createdAt')
      .optional(),
    sortOrder: Joi.string()
      .valid('asc', 'desc')
      .default('desc')
      .optional()
  }),

  // Search
  search: Joi.object({
    query: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.min': 'Search query cannot be empty',
        'string.max': 'Search query cannot exceed 100 characters'
      }),
    filters: Joi.object({
      tags: Joi.array().items(Joi.string()).optional(),
      dateRange: Joi.object({
        start: Joi.date().optional(),
        end: Joi.date().optional()
      }).optional(),
      status: Joi.string().valid('active', 'expired', 'deleted').optional()
    }).optional()
  })
};

// Validation middleware factory
const validate = (schemaName, source = 'body') => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      logger.error('Validation schema not found:', { schemaName });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation configuration error'
      });
    }

    const data = source === 'query' ? req.query : 
                 source === 'params' ? req.params : 
                 req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove unknown fields
      convert: true // Convert strings to appropriate types
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation failed:', {
        schemaName,
        errors: validationErrors,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json({
        error: 'Validation Error',
        message: 'The provided data is invalid',
        details: validationErrors
      });
    }

    // Replace the original data with validated and sanitized data
    if (source === 'query') {
      req.query = value;
    } else if (source === 'params') {
      req.params = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Custom validators
const customValidators = {
  // Validate URL accessibility
  validateUrlAccessibility: async (url) => {
    try {
      const response = await fetch(url, { 
        method: 'HEAD', 
        timeout: 5000,
        headers: {
          'User-Agent': 'LinkShortener-Bot/1.0'
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // Validate custom alias availability
  validateAliasAvailability: async (alias) => {
    const Url = require('../models/Url');
    const existing = await Url.findOne({
      $or: [
        { shortId: alias },
        { shortCode: alias },
        { customAlias: alias }
      ]
    });
    return !existing;
  },

  // Validate domain whitelist/blacklist
  validateDomain: (url) => {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Check blacklisted domains
      const blacklistedDomains = (process.env.BLOCKED_DOMAINS || '').split(',').filter(Boolean);
      if (blacklistedDomains.some(blocked => domain.includes(blocked.toLowerCase()))) {
        return { valid: false, reason: 'Domain is blacklisted' };
      }

      // Check for suspicious TLDs
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.bit'];
      if (suspiciousTlds.some(tld => domain.endsWith(tld))) {
        return { valid: false, reason: 'Suspicious domain detected' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Invalid URL format' };
    }
  },

  // Validate file upload
  validateFileUpload: (file) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'csv,txt').split(',');
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB

    if (!file) {
      return { valid: false, reason: 'No file provided' };
    }

    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
      return { valid: false, reason: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}` };
    }

    if (file.size > maxSize) {
      return { valid: false, reason: `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB` };
    }

    return { valid: true };
  }
};

// Async validation middleware for complex validations
const asyncValidate = (validatorName) => {
  return async (req, res, next) => {
    try {
      let isValid = true;
      let errorMessage = '';

      switch (validatorName) {
        case 'urlAccessibility':
          if (req.body.originalUrl) {
            isValid = await customValidators.validateUrlAccessibility(req.body.originalUrl);
            errorMessage = 'The provided URL is not accessible';
          }
          break;

        case 'aliasAvailability':
          if (req.body.customAlias) {
            isValid = await customValidators.validateAliasAvailability(req.body.customAlias);
            errorMessage = 'Custom alias is already taken';
          }
          break;

        case 'domainValidation':
          if (req.body.originalUrl) {
            const validation = customValidators.validateDomain(req.body.originalUrl);
            isValid = validation.valid;
            errorMessage = validation.reason;
          }
          break;

        case 'fileUpload':
          if (req.file) {
            const validation = customValidators.validateFileUpload(req.file);
            isValid = validation.valid;
            errorMessage = validation.reason;
          }
          break;

        default:
          logger.error('Unknown async validator:', { validatorName });
          return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Validation configuration error'
          });
      }

      if (!isValid) {
        return res.status(400).json({
          error: 'Validation Error',
          message: errorMessage
        });
      }

      next();
    } catch (error) {
      logger.error('Async validation error:', { 
        validatorName, 
        error: error.message,
        stack: error.stack 
      });
      
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation failed due to server error'
      });
    }
  };
};

module.exports = {
  validate,
  asyncValidate,
  schemas,
  customValidators
};
