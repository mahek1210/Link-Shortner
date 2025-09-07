// src/routes/apiRoutes.js
const express = require('express');
const { 
  getUserApiKeys,
  createApiKey,
  updateApiKey,
  rotateApiKey,
  deleteApiKey,
  getApiKeyUsage
} = require('../controllers/apiController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// GET /api/keys - Get user's API keys
router.get('/', getUserApiKeys);

// POST /api/keys - Create new API key
router.post('/', createApiKey);

// PUT /api/keys/:id - Update API key
router.put('/:id', updateApiKey);

// POST /api/keys/:id/rotate - Rotate API key secret
router.post('/:id/rotate', rotateApiKey);

// DELETE /api/keys/:id - Delete API key
router.delete('/:id', deleteApiKey);

// GET /api/keys/:id/usage - Get API key usage statistics
router.get('/:id/usage', getApiKeyUsage);

module.exports = router;
