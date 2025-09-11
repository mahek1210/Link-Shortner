/*
 * FIXES APPLIED:
 * 1. Added JWT_SECRET validation
 * 2. Enhanced error handling with specific error types
 * 3. Improved input validation
 * 4. Better security practices (no password in responses)
 * 5. Added proper HTTP status codes
 * 6. Enhanced token generation with more secure options
 * 7. Fixed authentication issues: added name field handling, improved error responses, and optimized performance
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
    console.log('Signup attempt:', { email: req.body.email, name: req.body.name });
    
    const { username, email, password, name } = req.body;

    // Input validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required',
        errors: [
          { field: 'username', message: !username ? 'Username is required' : null },
          { field: 'email', message: !email ? 'Email is required' : null },
          { field: 'password', message: !password ? 'Password is required' : null }
        ].filter(e => e.message)
      });
    }

    // Enhanced validation
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ 
        success: false,
        message: 'Username must be between 3 and 30 characters' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please enter a valid email address' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [ 
        { email: email.toLowerCase() }, 
        { username: username.trim() } 
      ] 
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false,
        message: existingUser.email === email.toLowerCase() 
          ? 'User already exists with this email'
          : 'Username is already taken'
      });
    }

    // Create new user
    const user = new User({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
      name: name ? name.trim() : username.trim(), // Use name if provided, fallback to username
      role: 'user',
      isActive: true
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });

    console.log('User created successfully:', user.email);
  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: 'Validation failed', 
        errors: errors 
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'User already exists with this email'
        : field === 'username'
        ? 'Username is already taken'
        : 'User already exists';
      
      return res.status(409).json({ 
        success: false,
        message
      });
    }

    res.status(500).json({ 
      success: false,
      message: 'Internal server error during signup' 
    });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    console.log('Login attempt:', { email: req.body.email });
    
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Please enter a valid email address' 
      });
    }

    // Find user (include password for comparison)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Account is deactivated. Please contact support.' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });

    console.log('Login successful:', user.email);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error during login' 
    });
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
        name: req.user.name,
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
      console.error('Google OAuth callback: No user found');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorUrl = `${frontendUrl}/auth-error?error=${encodeURIComponent('Authentication failed')}`;
      return res.redirect(errorUrl);
    }
    
    // Generate JWT token
    const token = generateToken(user._id);
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    console.log('Google OAuth successful for user:', user.email);
    
    // Redirect to frontend with token and user data
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const userData = {
      id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      provider: 'google'
    };
    
    const redirectUrl = `${frontendUrl}/auth-success?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userData))}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorUrl = `${frontendUrl}/auth-error?error=${encodeURIComponent('Authentication failed: ' + error.message)}`;
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
