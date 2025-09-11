// src/routes/moderationRoutes.js - Content moderation routes
const express = require('express');
const { body, query, param } = require('express-validator');
const moderationController = require('../controllers/moderationController');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Report a malicious URL - can be used by authenticated or anonymous users
router.post('/report/:shortCode',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 reports per 15 minutes
  [
    param('shortCode').notEmpty().withMessage('Short code is required'),
    body('type')
      .isIn(['malicious', 'spam', 'phishing', 'malware', 'inappropriate', 'copyright'])
      .withMessage('Invalid report type'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('category')
      .optional()
      .isIn(['security', 'content', 'legal', 'other'])
      .withMessage('Invalid category')
  ],
  moderationController.reportUrl
);

// Admin routes - require authentication and admin access
router.use(auth);
router.use(adminAuth);

// Get moderation statistics
router.get('/stats',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), // 30 requests per 15 minutes
  moderationController.getModerationStats
);

// Get flagged URLs for review
router.get('/flagged',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), // 50 requests per 15 minutes
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('status').optional().isIn(['active', 'disabled', 'flagged']).withMessage('Invalid status'),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity')
  ],
  moderationController.getFlaggedUrls
);

// Test URL moderation
router.post('/test',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 tests per 15 minutes
  [
    body('url').isURL().withMessage('Valid URL is required'),
    body('title').optional().isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description must be less than 500 characters')
  ],
  moderationController.testModeration
);

// Disable a URL
router.post('/disable/:shortCode',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), // 50 requests per 15 minutes
  [
    param('shortCode').notEmpty().withMessage('Short code is required'),
    body('reason').notEmpty().withMessage('Reason is required')
  ],
  moderationController.disableUrl
);

// Enable a URL
router.post('/enable/:shortCode',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), // 50 requests per 15 minutes
  [
    param('shortCode').notEmpty().withMessage('Short code is required')
  ],
  moderationController.enableUrl
);

// Bulk moderate URLs
router.post('/bulk',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 bulk operations per 15 minutes
  [
    body('urlIds').isArray({ min: 1, max: 100 }).withMessage('URL IDs array is required (max 100)'),
    body('urlIds.*').isMongoId().withMessage('Invalid URL ID format'),
    body('action').isIn(['disable', 'enable', 'flag']).withMessage('Invalid action'),
    body('reason').notEmpty().withMessage('Reason is required')
  ],
  moderationController.bulkModerateUrls
);

// Update moderation rules
router.put('/rules',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), // 5 updates per hour
  [
    body('blockedDomains').optional().isArray().withMessage('Blocked domains must be an array'),
    body('blockedDomains.*').optional().isFQDN().withMessage('Invalid domain format'),
    body('maliciousKeywords').optional().isArray().withMessage('Malicious keywords must be an array'),
    body('maliciousKeywords.*').optional().isString().withMessage('Keywords must be strings')
  ],
  moderationController.updateModerationRules
);

module.exports = router;
