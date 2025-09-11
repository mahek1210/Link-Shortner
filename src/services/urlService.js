// src/services/urlService.js - Enhanced URL service with caching and business logic
const { nanoid } = require('nanoid');
const QRCode = require('qrcode');
const Url = require('../models/Url');
const Analytics = require('../models/Analytics');
const cacheService = require('./cacheService');
const logger = require('../config/logger');
const { NotFoundError, ConflictError, ValidationError } = require('../middleware/errorHandler');

class UrlService {
  constructor() {
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  }

  // Create a new short URL
  async createShortUrl(urlData, userId) {
    try {
      logger.info('Creating short URL', { originalUrl: urlData.originalUrl, userId });

      // Validate URL accessibility if enabled
      if (process.env.VALIDATE_URL_ACCESSIBILITY === 'true') {
        const isAccessible = await this.validateUrlAccessibility(urlData.originalUrl);
        if (!isAccessible) {
          throw new ValidationError('The provided URL is not accessible');
        }
      }

      // Check for existing URL to prevent duplicates
      const existingUrl = await Url.findOne({
        originalUrl: urlData.originalUrl,
        userId,
        status: 'active'
      });

      if (existingUrl && !urlData.customAlias) {
        logger.info('Returning existing URL', { shortCode: existingUrl.shortCode });
        
        // Update cache
        await cacheService.cacheUrl(existingUrl.shortCode, existingUrl);
        
        return existingUrl;
      }

      // Generate short code
      let shortCode;
      if (urlData.customAlias) {
        // Check if custom alias is available
        const aliasExists = await this.checkAliasAvailability(urlData.customAlias);
        if (!aliasExists) {
          throw new ConflictError('Custom alias is already taken');
        }
        shortCode = urlData.customAlias;
      } else {
        shortCode = await this.generateUniqueShortCode();
      }

      // Generate QR code
      const qrCode = await this.generateQRCode(`${this.baseUrl}/${shortCode}`);

      // Create URL document
      const newUrl = new Url({
        originalUrl: urlData.originalUrl,
        shortId: shortCode,
        shortCode: shortCode,
        customAlias: urlData.customAlias || null,
        userId,
        password: urlData.password || null,
        expiresAt: urlData.expiresAt || null,
        tags: urlData.tags || [],
        title: urlData.title || '',
        description: urlData.description || '',
        qrCode
      });

      const savedUrl = await newUrl.save();
      
      // Cache the new URL
      await cacheService.cacheUrl(shortCode, savedUrl);
      
      // Create initial analytics record
      await this.createInitialAnalytics(savedUrl);

      logger.info('Short URL created successfully', { 
        shortCode, 
        originalUrl: urlData.originalUrl,
        userId 
      });

      return savedUrl;
    } catch (error) {
      logger.error('Error creating short URL:', { 
        error: error.message, 
        originalUrl: urlData.originalUrl,
        userId 
      });
      throw error;
    }
  }

  // Get URL by short code with caching
  async getUrlByShortCode(shortCode) {
    try {
      // Try cache first
      let url = await cacheService.getCachedUrl(shortCode);
      
      if (!url) {
        // Cache miss - fetch from database
        url = await Url.findOne({
          $or: [{ shortId: shortCode }, { shortCode }],
          status: 'active'
        }).populate('userId', 'username email');

        if (!url) {
          throw new NotFoundError('URL');
        }

        // Cache the result
        await cacheService.cacheUrl(shortCode, url);
      }

      // Check if URL is expired
      if (url.isExpired && url.isExpired()) {
        await this.markUrlAsExpired(url._id);
        throw new NotFoundError('URL has expired');
      }

      return url;
    } catch (error) {
      logger.error('Error retrieving URL:', { error: error.message, shortCode });
      throw error;
    }
  }

  // Update URL
  async updateUrl(shortCode, updateData, userId) {
    try {
      const url = await Url.findOne({
        $or: [{ shortId: shortCode }, { shortCode }],
        userId,
        status: 'active'
      });

      if (!url) {
        throw new NotFoundError('URL');
      }

      // Update fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          url[key] = updateData[key];
        }
      });

      // Regenerate QR code if URL changed
      if (updateData.originalUrl) {
        url.qrCode = await this.generateQRCode(`${this.baseUrl}/${shortCode}`);
      }

      const updatedUrl = await url.save();

      // Update cache
      await cacheService.cacheUrl(shortCode, updatedUrl);
      
      // Invalidate related analytics cache
      await cacheService.invalidateAnalytics(shortCode);

      logger.info('URL updated successfully', { shortCode, userId });

      return updatedUrl;
    } catch (error) {
      logger.error('Error updating URL:', { error: error.message, shortCode, userId });
      throw error;
    }
  }

  // Delete URL
  async deleteUrl(shortCode, userId) {
    try {
      const url = await Url.findOne({
        $or: [{ shortId: shortCode }, { shortCode }],
        userId,
        status: { $ne: 'deleted' }
      });

      if (!url) {
        throw new NotFoundError('URL');
      }

      // Soft delete
      url.status = 'deleted';
      url.isActive = false;
      await url.save();

      // Remove from cache
      await cacheService.invalidateUrl(shortCode);
      await cacheService.invalidateAnalytics(shortCode);

      logger.info('URL deleted successfully', { shortCode, userId });

      return { message: 'URL deleted successfully' };
    } catch (error) {
      logger.error('Error deleting URL:', { error: error.message, shortCode, userId });
      throw error;
    }
  }

  // Get user URLs with pagination and filtering
  async getUserUrls(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search = '',
        tags = [],
        status = 'active'
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      // Build query
      const query = {
        userId,
        status: status === 'all' ? { $ne: 'deleted' } : status
      };

      // Add search filter
      if (search) {
        query.$or = [
          { originalUrl: { $regex: search, $options: 'i' } },
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { shortCode: { $regex: search, $options: 'i' } }
        ];
      }

      // Add tags filter
      if (tags.length > 0) {
        query.tags = { $in: tags };
      }

      // Execute query with pagination
      const [urls, total] = await Promise.all([
        Url.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Url.countDocuments(query)
      ]);

      // Add analytics summary to each URL
      const urlsWithAnalytics = await Promise.all(
        urls.map(async (url) => {
          const analytics = await this.getUrlAnalyticsSummary(url.shortCode);
          return {
            ...url,
            analytics
          };
        })
      );

      return {
        urls: urlsWithAnalytics,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error retrieving user URLs:', { error: error.message, userId });
      throw error;
    }
  }

  // Track URL click
  async trackClick(shortCode, clickData) {
    try {
      const url = await this.getUrlByShortCode(shortCode);
      
      // Update URL click count
      url.clicks = (url.clicks || 0) + 1;
      url.lastClicked = new Date();
      url.lastAccessed = new Date();
      await url.save();

      // Update cache
      await cacheService.cacheUrl(shortCode, url);

      // Track in analytics
      await this.trackAnalytics(shortCode, clickData);

      logger.info('Click tracked successfully', { shortCode, clicks: url.clicks });

      return url;
    } catch (error) {
      logger.error('Error tracking click:', { error: error.message, shortCode });
      throw error;
    }
  }

  // Get URL analytics summary
  async getUrlAnalyticsSummary(shortCode) {
    try {
      // Try cache first
      let analytics = await cacheService.getCachedAnalytics(shortCode);
      
      if (!analytics) {
        // Cache miss - fetch from database
        const analyticsDoc = await Analytics.findOne({ shortCode });
        
        if (!analyticsDoc) {
          return {
            totalClicks: 0,
            uniqueVisitors: 0,
            recentClicks: 0,
            topCountry: 'Unknown',
            topDevice: 'Unknown',
            topBrowser: 'Unknown'
          };
        }

        analytics = analyticsDoc.getAnalyticsSummary();
        
        // Cache the result
        await cacheService.cacheAnalytics(shortCode, analytics);
      }

      return analytics;
    } catch (error) {
      logger.error('Error retrieving analytics summary:', { error: error.message, shortCode });
      return null;
    }
  }

  // Bulk URL operations
  async createBulkUrls(urlsData, userId) {
    try {
      logger.info('Creating bulk URLs', { count: urlsData.length, userId });

      const results = {
        successful: [],
        failed: [],
        total: urlsData.length
      };

      for (const urlData of urlsData) {
        try {
          const shortUrl = await this.createShortUrl(urlData, userId);
          results.successful.push({
            originalUrl: urlData.originalUrl,
            shortCode: shortUrl.shortCode,
            shortUrl: `${this.baseUrl}/${shortUrl.shortCode}`
          });
        } catch (error) {
          results.failed.push({
            originalUrl: urlData.originalUrl,
            error: error.message
          });
        }
      }

      logger.info('Bulk URL creation completed', {
        successful: results.successful.length,
        failed: results.failed.length,
        userId
      });

      return results;
    } catch (error) {
      logger.error('Error in bulk URL creation:', { error: error.message, userId });
      throw error;
    }
  }

  // Helper methods
  async generateUniqueShortCode(length = 8) {
    let shortCode;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      shortCode = nanoid(length);
      attempts++;
      
      if (attempts > maxAttempts) {
        throw new Error('Unable to generate unique short code');
      }
    } while (!(await this.checkAliasAvailability(shortCode)));

    return shortCode;
  }

  async checkAliasAvailability(alias) {
    const existing = await Url.findOne({
      $or: [
        { shortId: alias },
        { shortCode: alias },
        { customAlias: alias }
      ]
    });
    
    return !existing;
  }

  async generateQRCode(url) {
    try {
      return await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      logger.error('Error generating QR code:', { error: error.message, url });
      return null;
    }
  }

  async validateUrlAccessibility(url) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        timeout: 5000,
        headers: {
          'User-Agent': 'LinkShortener-Bot/1.0'
        }
      });
      
      return response.ok;
    } catch (error) {
      logger.warn('URL accessibility check failed:', { error: error.message, url });
      return false;
    }
  }

  async createInitialAnalytics(url) {
    try {
      const analytics = new Analytics({
        urlId: url._id,
        shortCode: url.shortCode,
        clicks: [],
        stats: {
          totalClicks: 0,
          uniqueVisitors: 0,
          dailyStats: []
        }
      });

      await analytics.save();
      logger.debug('Initial analytics created', { shortCode: url.shortCode });
    } catch (error) {
      logger.error('Error creating initial analytics:', { 
        error: error.message, 
        shortCode: url.shortCode 
      });
    }
  }

  async trackAnalytics(shortCode, clickData) {
    try {
      let analytics = await Analytics.findOne({ shortCode });
      
      if (!analytics) {
        // Create analytics if it doesn't exist
        const url = await Url.findOne({
          $or: [{ shortId: shortCode }, { shortCode }]
        });
        
        if (!url) return;
        
        analytics = new Analytics({
          urlId: url._id,
          shortCode,
          clicks: [],
          stats: {
            totalClicks: 0,
            uniqueVisitors: 0,
            dailyStats: []
          }
        });
      }

      // Add click data
      await analytics.addClick(clickData);
      
      // Invalidate analytics cache
      await cacheService.invalidateAnalytics(shortCode);
      
      logger.debug('Analytics tracked', { shortCode });
    } catch (error) {
      logger.error('Error tracking analytics:', { error: error.message, shortCode });
    }
  }

  async markUrlAsExpired(urlId) {
    try {
      await Url.findByIdAndUpdate(urlId, {
        status: 'expired',
        isActive: false
      });
      
      logger.info('URL marked as expired', { urlId });
    } catch (error) {
      logger.error('Error marking URL as expired:', { error: error.message, urlId });
    }
  }

  // Get popular URLs
  async getPopularUrls(limit = 10, timeframe = '7d') {
    try {
      const timeframeMap = {
        '1d': 1,
        '7d': 7,
        '30d': 30,
        '90d': 90
      };

      const days = timeframeMap[timeframe] || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const popularUrls = await Url.aggregate([
        {
          $match: {
            status: 'active',
            lastClicked: { $gte: startDate }
          }
        },
        {
          $sort: { clicks: -1 }
        },
        {
          $limit: limit
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            shortCode: 1,
            originalUrl: 1,
            clicks: 1,
            title: 1,
            createdAt: 1,
            'user.username': 1
          }
        }
      ]);

      return popularUrls;
    } catch (error) {
      logger.error('Error retrieving popular URLs:', { error: error.message });
      throw error;
    }
  }

  // Get URL statistics
  async getUrlStats(userId = null) {
    try {
      const matchStage = userId ? { userId: new mongoose.Types.ObjectId(userId) } : {};
      
      const stats = await Url.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalUrls: { $sum: 1 },
            activeUrls: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            expiredUrls: {
              $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
            },
            totalClicks: { $sum: '$clicks' },
            averageClicks: { $avg: '$clicks' }
          }
        }
      ]);

      return stats[0] || {
        totalUrls: 0,
        activeUrls: 0,
        expiredUrls: 0,
        totalClicks: 0,
        averageClicks: 0
      };
    } catch (error) {
      logger.error('Error retrieving URL stats:', { error: error.message, userId });
      throw error;
    }
  }
}

// Create singleton instance
const urlService = new UrlService();

module.exports = urlService;
