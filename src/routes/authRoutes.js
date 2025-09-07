/*
 * FIXES APPLIED:
 * 1. Added logout route
 * 2. Enhanced route organization
 * 3. Added proper route documentation
 * 4. Improved error handling consistency
 * 5. Added Google OAuth routes
 * 6. Integrated passport authentication
 */

// src/routes/authRoutes.js
const express = require('express');
const { passport, isGoogleOAuthConfigured } = require('../config/passport');
const { signup, login, getProfile, logout, googleCallback } = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Public routes (no authentication required)
// POST /api/auth/signup - Create new user account
router.post('/signup', authLimiter, signup);

// POST /api/auth/login - Authenticate user and get token
router.post('/login', authLimiter, login);

// Google OAuth routes (only if configured)
if (isGoogleOAuthConfigured) {
  // GET /auth/google - Redirect to Google consent screen
  router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
  }));

  // GET /auth/google/callback - Handle Google OAuth callback
  router.get('/google/callback', 
    passport.authenticate('google', { session: false }),
    googleCallback
  );
} else {
  // Return error responses if Google OAuth is not configured
  router.get('/google', (req, res) => {
    res.status(500).json({ 
      error: 'Google OAuth not configured',
      message: 'Please configure Google OAuth environment variables'
    });
  });

  router.get('/google/callback', (req, res) => {
    res.status(500).json({ 
      error: 'Google OAuth not configured',
      message: 'Please configure Google OAuth environment variables'
    });
  });
}

// Protected routes (authentication required)
// GET /api/auth/me - Get current user profile
router.get('/me', auth, getProfile);

// POST /api/auth/logout - Logout user (optional)
router.post('/logout', auth, logout);

module.exports = router;
