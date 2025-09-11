// src/middleware/adminAuth.js - Admin authentication middleware
const logger = require('../config/logger');
const auditService = require('../services/auditService');

const adminAuth = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      // Log unauthorized admin access attempt
      await auditService.logSecurityEvent(
        'unauthorized_admin_access',
        'User attempted to access admin endpoint without proper role',
        {
          userId: req.user.id,
          userRole: req.user.role,
          endpoint: req.path,
          method: req.method
        },
        {
          severity: 'high',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          success: false
        }
      );

      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Log admin access
    await auditService.logAdminAction(
      'admin_endpoint_access',
      `Admin accessed ${req.method} ${req.path}`,
      req.user.id,
      {
        endpoint: req.path,
        method: req.method
      },
      {
        severity: 'low',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    next();
  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

module.exports = adminAuth;
