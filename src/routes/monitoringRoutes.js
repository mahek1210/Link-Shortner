// src/routes/monitoringRoutes.js - Monitoring and health check routes
const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { auth, adminAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { body } = require('express-validator');

// Public health check endpoint (no auth required)
router.get('/health', monitoringController.getHealth);

// Protected monitoring endpoints (admin only)
router.use(auth, adminAuth);

// Get system metrics
router.get('/metrics', monitoringController.getMetrics);

// Get system alerts
router.get('/alerts', monitoringController.getAlerts);

// Clear specific alert
router.delete('/alerts/:alertId', monitoringController.clearAlert);

// Get monitoring dashboard data
router.get('/dashboard', monitoringController.getDashboard);

// Get performance metrics
router.get('/performance', monitoringController.getPerformanceMetrics);

// Get API metrics
router.get('/api-metrics', monitoringController.getApiMetrics);

// Get system information
router.get('/system-info', monitoringController.getSystemInfo);

// Test alert system
router.post('/test-alert', [
  body('level').optional().isIn(['info', 'warning', 'critical']),
  body('message').optional().isString().isLength({ min: 1, max: 200 }),
  validate('testAlert')
], monitoringController.testAlert);

module.exports = router;
