// src/routes/complianceRoutes.js - GDPR compliance and data protection routes
const express = require('express');
const { body, query } = require('express-validator');
const complianceController = require('../controllers/complianceController');
const { auth } = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// GDPR data export - authenticated users only
router.get('/export',
  auth,
  rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), // 3 requests per hour
  query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
  complianceController.exportUserData
);

// GDPR data deletion - authenticated users only
router.post('/delete',
  auth,
  rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 1 }), // 1 request per day
  [
    body('deletionType')
      .optional()
      .isIn(['full', 'analytics_only', 'urls_only', 'anonymize'])
      .withMessage('Invalid deletion type'),
    body('confirmPassword')
      .notEmpty()
      .withMessage('Password confirmation is required')
      .isLength({ min: 1 })
      .withMessage('Password cannot be empty')
  ],
  complianceController.deleteUserData
);

// Get user consent status
router.get('/consent',
  auth,
  complianceController.getUserConsent
);

// Update user consent
router.put('/consent',
  auth,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 requests per 15 minutes
  [
    body('analytics')
      .isBoolean()
      .withMessage('Analytics consent must be boolean'),
    body('marketing')
      .isBoolean()
      .withMessage('Marketing consent must be boolean')
  ],
  complianceController.updateUserConsent
);

// Get data processing information (public)
router.get('/data-processing-info',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 requests per 15 minutes
  complianceController.getDataProcessingInfo
);

// Admin routes
router.use(adminAuth); // All routes below require admin access

// Generate compliance report
router.get('/report',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), // 5 requests per hour
  complianceController.generateComplianceReport
);

// Clean up expired data
router.post('/cleanup',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 2 }), // 2 requests per hour
  complianceController.cleanupExpiredData
);

module.exports = router;
