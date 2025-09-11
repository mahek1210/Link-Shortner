// src/routes/shortenRoutes.js
const express = require('express');
const { nanoid } = require('nanoid');
const Url = require('../models/Url');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/shorten - Create short URL
router.post('/', auth, async (req, res) => {
  try {
    const { originalUrl, customAlias, expiresAt, password } = req.body;

    // Validate original URL
    if (!originalUrl) {
      return res.status(400).json({
        success: false,
        message: 'Original URL is required'
      });
    }

    // Basic URL validation
    try {
      new URL(originalUrl);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }

    let shortId;

    // Handle custom alias
    if (customAlias) {
      // Check if custom alias already exists
      const existingUrl = await Url.findOne({ shortId: customAlias });
      if (existingUrl) {
        return res.status(400).json({
          success: false,
          message: 'Custom alias already exists'
        });
      }
      shortId = customAlias;
    } else {
      // Generate unique short ID
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        shortId = nanoid(8);
        const existingUrl = await Url.findOne({ shortId });
        if (!existingUrl) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate unique short ID'
        });
      }
    }

    // Create URL document
    const urlData = {
      originalUrl,
      shortId,
      userId: req.user.id,
      clicks: 0,
      clickHistory: [],
      createdAt: new Date(),
      lastAccessed: null
    };

    // Add optional fields
    if (expiresAt) {
      urlData.expiresAt = new Date(expiresAt);
    }
    if (password) {
      urlData.password = password;
    }

    const url = new Url(urlData);
    await url.save();

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    res.status(201).json({
      success: true,
      data: {
        id: url._id,
        originalUrl: url.originalUrl,
        shortCode: url.shortId, // Map shortId to shortCode for consistency
        shortId: url.shortId,
        shortUrl: `${baseUrl}/${url.shortId}`,
        clicks: url.clicks,
        createdAt: url.createdAt,
        expiresAt: url.expiresAt,
        hasPassword: !!url.password
      }
    });

  } catch (error) {
    console.error('Shorten URL error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Short ID already exists, please try again'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating short URL'
    });
  }
});

// GET /api/shorten/user - Get user's URLs
router.get('/user', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    let query = { userId: req.user.id };
    
    if (search) {
      query.$or = [
        { originalUrl: { $regex: search, $options: 'i' } },
        { shortId: { $regex: search, $options: 'i' } }
      ];
    }

    const urls = await Url.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-clickHistory -password');

    const total = await Url.countDocuments(query);
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    const formattedUrls = urls.map(url => ({
      id: url._id,
      originalUrl: url.originalUrl,
      shortId: url.shortId,
      shortUrl: `${baseUrl}/${url.shortId}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      lastAccessed: url.lastAccessed,
      expiresAt: url.expiresAt,
      hasPassword: !!url.password,
      isExpired: url.expiresAt ? new Date() > url.expiresAt : false
    }));

    res.json({
      success: true,
      data: {
        urls: formattedUrls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get user URLs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching URLs'
    });
  }
});

// DELETE /api/shorten/:id - Delete URL
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const url = await Url.findOne({ _id: id, userId: req.user.id });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found or you do not have permission to delete it'
      });
    }

    await Url.deleteOne({ _id: id });

    res.json({
      success: true,
      message: 'URL deleted successfully'
    });

  } catch (error) {
    console.error('Delete URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting URL'
    });
  }
});

// PUT /api/shorten/:id - Update URL
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { originalUrl, customAlias, expiresAt, password } = req.body;

    const url = await Url.findOne({ _id: id, userId: req.user.id });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found or you do not have permission to update it'
      });
    }

    // Validate original URL if provided
    if (originalUrl) {
      try {
        new URL(originalUrl);
        url.originalUrl = originalUrl;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid URL format'
        });
      }
    }

    // Handle custom alias update
    if (customAlias && customAlias !== url.shortId) {
      const existingUrl = await Url.findOne({ shortId: customAlias });
      if (existingUrl) {
        return res.status(400).json({
          success: false,
          message: 'Custom alias already exists'
        });
      }
      url.shortId = customAlias;
    }

    // Update other fields
    if (expiresAt !== undefined) {
      url.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (password !== undefined) {
      url.password = password || null;
    }

    await url.save();

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    res.json({
      success: true,
      data: {
        id: url._id,
        originalUrl: url.originalUrl,
        shortId: url.shortId,
        shortUrl: `${baseUrl}/${url.shortId}`,
        clicks: url.clicks,
        createdAt: url.createdAt,
        lastAccessed: url.lastAccessed,
        expiresAt: url.expiresAt,
        hasPassword: !!url.password
      }
    });

  } catch (error) {
    console.error('Update URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating URL'
    });
  }
});

module.exports = router;
