// src/routes/auditRoutes.js - Audit logging and reporting routes
const express = require('express');
const { query, param } = require('express-validator');
const auditController = require('../controllers/auditController');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// All audit routes require authentication and admin access
router.use(auth);
router.use(adminAuth);

// Get audit logs with filtering and pagination
router.get('/',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), // 100 requests per 15 minutes
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('eventType').optional().isIn([
      'user_action', 'admin_action', 'system_event', 'security_event',
      'data_access', 'data_modification', 'authentication', 'authorization',
      'compliance', 'error', 'performance', 'configuration'
    ]).withMessage('Invalid event type'),
    query('category').optional().isIn([
      'auth', 'url_management', 'user_management', 'subscription', 'analytics',
      'security', 'compliance', 'system', 'api', 'admin', 'monitoring'
    ]).withMessage('Invalid category'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    query('success').optional().isBoolean().withMessage('Success must be boolean'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('sortBy').optional().isIn(['timestamp', 'eventType', 'category', 'severity']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order')
  ],
  auditController.getLogs
);

// Get audit statistics
router.get('/stats',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), // 30 requests per 15 minutes
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('eventType').optional().isIn([
      'user_action', 'admin_action', 'system_event', 'security_event',
      'data_access', 'data_modification', 'authentication', 'authorization',
      'compliance', 'error', 'performance', 'configuration'
    ]).withMessage('Invalid event type'),
    query('category').optional().isIn([
      'auth', 'url_management', 'user_management', 'subscription', 'analytics',
      'security', 'compliance', 'system', 'api', 'admin', 'monitoring'
    ]).withMessage('Invalid category')
  ],
  auditController.getAuditStats
);

// Export audit logs
router.get('/export',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), // 5 requests per hour
  [
    query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('eventType').optional().isIn([
      'user_action', 'admin_action', 'system_event', 'security_event',
      'data_access', 'data_modification', 'authentication', 'authorization',
      'compliance', 'error', 'performance', 'configuration'
    ]).withMessage('Invalid event type'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
  ],
  auditController.exportLogs
);

// Get recent audit logs (cached)
router.get('/recent',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }), // 60 requests per 15 minutes
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  auditController.getRecentLogs
);

// Get audit metadata (event types, categories, etc.)
router.get('/metadata',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 requests per 15 minutes
  auditController.getAuditMetadata
);

// Get specific audit log by ID
router.get('/:logId',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), // 100 requests per 15 minutes
  [
    param('logId').isMongoId().withMessage('Invalid log ID format')
  ],
  auditController.getLogById
);

// Clean up old audit logs
router.delete('/cleanup',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 2 }), // 2 requests per hour
  auditController.cleanupOldLogs
);

module.exports = router;
