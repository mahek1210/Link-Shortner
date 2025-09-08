// middleware/auth.js - Fixed Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path as needed

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization header provided'
      });
    }
    
    // Check if it starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization format. Use: Bearer <token>'
      });
    }
    
    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded || !decoded.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token structure'
        });
      }
      
      // Find user by ID from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user is active (if you have this field)
      if (user.isActive === false) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }
      
      // Add user to request object
      req.user = user;
      next();
      
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please log in again.'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Token verification failed'
      });
    }
    
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication server error'
    });
  }
};

// Optional middleware for routes that can work with or without auth
const optionalAuth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  
  const token = authHeader.substring(7);
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    req.user = user;
  } catch (error) {
    req.user = null;
  }
  
  next();
};

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    // First run normal auth
    await auth(req, res, () => {});
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Admin authentication failed'
    });
  }
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth
};