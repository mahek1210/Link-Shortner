// src/controllers/apiController.js
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const { nanoid } = require('nanoid');

// GET /api/keys - Get user's API keys
const getUserApiKeys = async (req, res) => {
  try {
    const apiKeys = await ApiKey.find({ 
      userId: req.user._id,
      isActive: true 
    }).select('-keySecret').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: apiKeys
    });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/keys - Create new API key
const createApiKey = async (req, res) => {
  try {
    const { 
      name, 
      permissions = ['create_url', 'read_url'], 
      rateLimit,
      expiresAt,
      allowedDomains,
      allowedIPs
    } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'API key name is required'
      });
    }

    // Check if user already has 10 API keys (limit)
    const existingCount = await ApiKey.countDocuments({ 
      userId: req.user._id, 
      isActive: true 
    });

    if (existingCount >= 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum of 10 API keys allowed per user'
      });
    }

    // Generate secure key secret
    const keySecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = crypto.createHash('sha256').update(keySecret).digest('hex');

    const apiKeyData = {
      userId: req.user._id,
      name: name.trim(),
      keySecret: hashedSecret,
      permissions: permissions || ['create_url', 'read_url'],
      ...(rateLimit && {
        rateLimit: {
          requestsPerHour: Math.min(rateLimit.requestsPerHour || 1000, 10000),
          requestsPerDay: Math.min(rateLimit.requestsPerDay || 10000, 100000)
        }
      }),
      ...(expiresAt && { expiresAt: new Date(expiresAt) }),
      ...(allowedDomains && allowedDomains.length > 0 && { allowedDomains }),
      ...(allowedIPs && allowedIPs.length > 0 && { allowedIPs })
    };

    const apiKey = new ApiKey(apiKeyData);
    await apiKey.save();

    // Return the API key with the plain secret (only time it's shown)
    res.status(201).json({
      success: true,
      data: {
        id: apiKey._id,
        keyId: apiKey.keyId,
        keySecret: keySecret, // Plain text secret (only shown once)
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        expiresAt: apiKey.expiresAt,
        allowedDomains: apiKey.allowedDomains,
        allowedIPs: apiKey.allowedIPs,
        createdAt: apiKey.createdAt
      },
      message: 'API key created successfully. Save the secret key securely - it will not be shown again.'
    });

  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/keys/:id - Update API key
const updateApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      permissions, 
      rateLimit, 
      isActive,
      allowedDomains,
      allowedIPs
    } = req.body;

    const apiKey = await ApiKey.findOne({ 
      _id: id, 
      userId: req.user._id 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    // Update fields
    if (name !== undefined) apiKey.name = name.trim();
    if (permissions !== undefined) apiKey.permissions = permissions;
    if (isActive !== undefined) apiKey.isActive = isActive;
    if (allowedDomains !== undefined) apiKey.allowedDomains = allowedDomains;
    if (allowedIPs !== undefined) apiKey.allowedIPs = allowedIPs;
    
    if (rateLimit) {
      apiKey.rateLimit = {
        requestsPerHour: Math.min(rateLimit.requestsPerHour || apiKey.rateLimit.requestsPerHour, 10000),
        requestsPerDay: Math.min(rateLimit.requestsPerDay || apiKey.rateLimit.requestsPerDay, 100000)
      };
    }

    await apiKey.save();

    res.json({
      success: true,
      data: {
        id: apiKey._id,
        keyId: apiKey.keyId,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        isActive: apiKey.isActive,
        allowedDomains: apiKey.allowedDomains,
        allowedIPs: apiKey.allowedIPs,
        usage: apiKey.usage,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt
      }
    });

  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/keys/:id/rotate - Rotate API key secret
const rotateApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await ApiKey.findOne({ 
      _id: id, 
      userId: req.user._id 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    // Generate new secret
    const newKeySecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = crypto.createHash('sha256').update(newKeySecret).digest('hex');

    apiKey.keySecret = hashedSecret;
    apiKey.lastRotated = new Date();
    await apiKey.save();

    res.json({
      success: true,
      data: {
        keyId: apiKey.keyId,
        keySecret: newKeySecret, // Plain text secret (only shown once)
        lastRotated: apiKey.lastRotated
      },
      message: 'API key rotated successfully. Save the new secret key securely - it will not be shown again.'
    });

  } catch (error) {
    console.error('Rotate API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/keys/:id - Delete API key
const deleteApiKey = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await ApiKey.findOne({ 
      _id: id, 
      userId: req.user._id 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    await ApiKey.deleteOne({ _id: id });

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/keys/:id/usage - Get API key usage statistics
const getApiKeyUsage = async (req, res) => {
  try {
    const { id } = req.params;

    const apiKey = await ApiKey.findOne({ 
      _id: id, 
      userId: req.user._id 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      data: {
        keyId: apiKey.keyId,
        name: apiKey.name,
        usage: apiKey.usage,
        rateLimit: apiKey.rateLimit,
        isActive: apiKey.isActive
      }
    });

  } catch (error) {
    console.error('Get API key usage error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getUserApiKeys,
  createApiKey,
  updateApiKey,
  rotateApiKey,
  deleteApiKey,
  getApiKeyUsage
};
