// src/routes/urlRoutes.js
const express = require('express');
const { createShortUrl, handleRedirect, getAnalytics } = require('../controllers/urlController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/shorten - Create short URL (requires authentication)
router.post('/shorten', auth, createShortUrl);

// GET /:shortCode - Redirect to original URL (public)
router.get('/:shortCode', handleRedirect);

// GET /api/analytics/:shortCode - Get URL analytics (requires authentication)
router.get('/analytics/:shortCode', auth, getAnalytics);

module.exports = router;