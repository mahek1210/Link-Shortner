/*
 * FIXES APPLIED:
 * 1. Added JWT_SECRET validation
 * 2. Enhanced error handling with specific error types
 * 3. Improved token extraction from multiple sources
 * 4. Better error messages for different scenarios
 * 5. Added proper HTTP status codes
 * 6. Enhanced adminAuth middleware
 * 7. Added token validation with issuer/audience
 */

// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Validate JWT_SECRET exists
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const auth = async (req, res, next) => {
  try {
    // Extract token from Authorization header or query parameter
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Fallback to query parameter (for testing purposes)
    if (!token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        message: 'Please provide a valid JWT token in the Authorization header'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'link-shortener-api',
      audience: 'link-shortener-users'
    });
    
    // Find user (password already excluded by model select: false)
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid token.',
        message: 'User associated with this token no longer exists'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        error: 'Account deactivated.',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.',
        message: 'The provided token is malformed or invalid'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired.',
        message: 'Your session has expired. Please login again.'
      });
    }
    
    if (error.name === 'NotBeforeError') {
      return res.status(401).json({ 
        error: 'Token not active.',
        message: 'The token is not yet valid'
      });
    }
    
    res.status(401).json({ 
      error: 'Authentication failed.',
      message: 'Unable to verify your identity'
    });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    // First check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required.',
        message: 'Please login first'
      });
    }
    
    // Then check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required.',
        message: 'You do not have permission to access this resource'
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authorization check failed.',
      message: 'Unable to verify your permissions'
    });
  }
};

module.exports = { auth, adminAuth };
