// src/routes/userRoutes.js
const express = require('express');
const { 
  getUserUrls, 
  updateUserUrl, 
  deleteUserUrl, 
  generateUrlQR 
} = require('../controllers/userController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

// GET /api/user/urls - Get user's URLs
router.get('/urls', getUserUrls);

// PUT /api/user/urls/:id - Update user's URL
router.put('/urls/:id', updateUserUrl);

// DELETE /api/user/urls/:id - Delete user's URL
router.delete('/urls/:id', deleteUserUrl);

// GET /api/user/urls/:id/qr - Generate QR code for URL
router.get('/urls/:id/qr', generateUrlQR);

module.exports = router;
