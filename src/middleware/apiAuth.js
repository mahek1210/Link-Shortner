// src/middleware/apiAuth.js
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');

// API Key authentication middleware
const apiAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'API key required. Use Authorization: Bearer <your-api-key>'
      });
    }

    const apiKeyValue = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!apiKeyValue || !apiKeyValue.includes('.')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key format'
      });
    }

    // Parse API key (format: keyId.keySecret)
    const [keyId, keySecret] = apiKeyValue.split('.');
    
    if (!keyId || !keySecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key format'
      });
    }

    // Find API key
    const apiKey = await ApiKey.findOne({ 
      keyId: keyId,
      isActive: true 
    }).select('+keySecret');

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // Check if API key has expired
    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      return res.status(401).json({
        success: false,
        error: 'API key has expired'
      });
    }

    // Verify secret
    const hashedSecret = crypto.createHash('sha256').update(keySecret).digest('hex');
    if (apiKey.keySecret !== hashedSecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // Check rate limits
    const rateLimitCheck = apiKey.checkRateLimit();
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: rateLimitCheck.reason,
        retryAfter: rateLimitCheck.reason.includes('Hourly') ? 3600 : 86400
      });
    }

    // Check IP restrictions
    if (apiKey.allowedIPs && apiKey.allowedIPs.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
      if (!apiKey.allowedIPs.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          error: 'IP address not allowed for this API key'
        });
      }
    }

    // Check domain restrictions (for web requests)
    if (apiKey.allowedDomains && apiKey.allowedDomains.length > 0) {
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        const domain = new URL(origin).hostname;
        if (!apiKey.allowedDomains.some(allowed => domain.endsWith(allowed))) {
          return res.status(403).json({
            success: false,
            error: 'Domain not allowed for this API key'
          });
        }
      }
    }

    // Get user associated with API key
    const user = await User.findById(apiKey.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User account not found or inactive'
      });
    }

    // Increment usage (async, don't wait)
    apiKey.incrementUsage().catch(err => {
      console.error('Error incrementing API key usage:', err);
    });

    // Attach user and API key to request
    req.user = user;
    req.apiKey = apiKey;
    req.isApiRequest = true;

    next();

  } catch (error) {
    console.error('API authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication server error'
    });
  }
};

// Permission check middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key authentication required'
      });
    }

    if (!req.apiKey.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        error: `API key does not have '${permission}' permission`
      });
    }

    next();
  };
};

module.exports = {
  apiAuth,
  requirePermission
};
