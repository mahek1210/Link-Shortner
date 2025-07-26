const express = require('express');
const router = express.Router();
const urlController = require('../controllers/urlController');

// Shorten URL
router.post('/shorten', urlController.createShortUrl);
// Redirect
router.get('/:code', urlController.redirectUrl);
// Analytics
router.get('/analytics/:code', urlController.getAnalytics);

module.exports = router;



