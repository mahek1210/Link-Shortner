/*
 * FIXES APPLIED:
 * 1. Added JWT_SECRET validation
 * 2. Enhanced error handling with specific error types
 * 3. Improved input validation
 * 4. Better security practices (no password in responses)
 * 5. Added proper HTTP status codes
 * 6. Enhanced token generation with more secure options
 */

// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Validate JWT_SECRET exists
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId }, 
    process.env.JWT_SECRET, 
    {
      expiresIn: '7d',
      issuer: 'link-shortener-api',
      audience: 'link-shortener-users'
    }
  );
};

// POST /api/auth/signup
async function signup(req, res) {
  try {
    const { username, email, password } = req.body;

    // Input validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'All fields are required',
        details: { username: !!username, email: !!email, password: !!password }
      });
    }

    // Enhanced validation
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Email format validation
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
      return res.status(409).json({ 
        error: `User with this ${field} already exists`,
        field 
      });
    }

    // Create new user
    const user = new User({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors 
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        error: `User with this ${field} already exists`,
        field 
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        details: { email: !!email, password: !!password }
      });
    }

    // Email format validation
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Find user (include password for comparison)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated. Please contact support.' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/auth/me
async function getProfile(req, res) {
  try {
    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        isActive: req.user.isActive,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/auth/logout (optional - for token blacklisting in future)
async function logout(req, res) {
  try {
    // In a more advanced implementation, you might want to blacklist the token
    // For now, we'll just return a success message
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Google OAuth callback handler
async function googleCallback(req, res) {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Google authentication failed',
        message: 'Unable to authenticate with Google'
      });
    }
    
    // Generate JWT token
    const token = generateToken(user._id);
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth-success?token=${encodeURIComponent(token)}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorUrl = `${frontendUrl}/auth-error?error=${encodeURIComponent('Authentication failed')}`;
    res.redirect(errorUrl);
  }
}

module.exports = {
  signup,
  login,
  getProfile,
  logout,
  googleCallback
};
