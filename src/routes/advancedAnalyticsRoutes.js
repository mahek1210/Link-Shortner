// src/routes/advancedAnalyticsRoutes.js - Advanced Analytics Routes
const express = require('express');
const router = express.Router();
const advancedAnalyticsController = require('../controllers/advancedAnalyticsController');
const { auth } = require('../middleware/auth');

// Track click (public route - no auth required)
router.get('/track/:shortCode', advancedAnalyticsController.trackClick);

// Get comprehensive analytics for a specific URL (protected)
router.get('/url/:shortCode', auth, advancedAnalyticsController.getAnalytics);

// Get user analytics summary (protected)
router.get('/summary', auth, advancedAnalyticsController.getUserAnalyticsSummary);

// Export analytics data (protected)
router.get('/export/:shortCode', auth, advancedAnalyticsController.exportAnalytics);

// Real-time analytics (protected)
router.get('/realtime/:shortCode', auth, advancedAnalyticsController.getRealtimeStats);

module.exports = router;
