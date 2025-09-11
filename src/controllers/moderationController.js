// src/controllers/moderationController.js - Content moderation controller
const contentModerationService = require('../services/contentModerationService');
const auditService = require('../services/auditService');
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

class ModerationController {
  // Report a malicious URL
  async reportUrl(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { shortCode } = req.params;
      const { type, description, category } = req.body;
      const reporterId = req.user?.id || null;

      const reportData = {
        type,
        description,
        category,
        ipHash: contentModerationService.hashIP ? contentModerationService.hashIP(req.ip) : req.ip
      };

      const result = await contentModerationService.reportUrl(shortCode, reportData, reporterId);

      await auditService.logUserAction(
        'url_reported',
        `Reported URL ${shortCode} for ${type}`,
        reporterId,
        { shortCode, reportType: type, category },
        { 
          category: 'security',
          severity: 'medium',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: 'URL reported successfully',
        reportId: result.reportId
      });

    } catch (error) {
      logger.error('Failed to report URL:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to report URL'
      });
    }
  }

  // Get moderation statistics (admin only)
  async getModerationStats(req, res) {
    try {
      const stats = await contentModerationService.getModerationStats();

      await auditService.logDataAccess(
        'moderation_stats',
        'summary',
        'view_moderation_statistics',
        req.user.id,
        stats,
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      logger.error('Failed to get moderation stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve moderation statistics'
      });
    }
  }

  // Disable a URL (admin only)
  async disableUrl(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { shortCode } = req.params;
      const { reason } = req.body;

      const url = await contentModerationService.disableUrl(shortCode, reason);

      if (!url) {
        return res.status(404).json({
          success: false,
          message: 'URL not found'
        });
      }

      await auditService.logAdminAction(
        'url_disabled',
        `Disabled URL ${shortCode}`,
        req.user.id,
        { shortCode, reason, originalUrl: url.originalUrl },
        { 
          category: 'security',
          severity: 'high',
          resourceType: 'url',
          resourceId: shortCode,
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: 'URL disabled successfully',
        url: {
          shortCode: url.shortCode,
          status: url.status,
          disabledReason: url.disabledReason,
          disabledAt: url.disabledAt
        }
      });

    } catch (error) {
      logger.error('Failed to disable URL:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disable URL'
      });
    }
  }

  // Enable a URL (admin only)
  async enableUrl(req, res) {
    try {
      const { shortCode } = req.params;

      const Url = require('../models/Url');
      const url = await Url.findOneAndUpdate(
        { shortCode },
        {
          $set: { status: 'active' },
          $unset: { disabledReason: 1, disabledAt: 1 }
        },
        { new: true }
      );

      if (!url) {
        return res.status(404).json({
          success: false,
          message: 'URL not found'
        });
      }

      await auditService.logAdminAction(
        'url_enabled',
        `Enabled URL ${shortCode}`,
        req.user.id,
        { shortCode, originalUrl: url.originalUrl },
        { 
          category: 'security',
          severity: 'medium',
          resourceType: 'url',
          resourceId: shortCode,
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: 'URL enabled successfully',
        url: {
          shortCode: url.shortCode,
          status: url.status
        }
      });

    } catch (error) {
      logger.error('Failed to enable URL:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to enable URL'
      });
    }
  }

  // Bulk moderate URLs (admin only)
  async bulkModerateUrls(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { urlIds, action, reason } = req.body;

      if (!Array.isArray(urlIds) || urlIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'URL IDs array is required'
        });
      }

      const results = await contentModerationService.bulkModerateUrls(urlIds, action, reason);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      await auditService.logAdminAction(
        'bulk_moderation',
        `Bulk ${action} operation on ${urlIds.length} URLs`,
        req.user.id,
        { 
          action,
          reason,
          urlCount: urlIds.length,
          successful,
          failed,
          results
        },
        { 
          category: 'security',
          severity: 'high',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: `Bulk moderation completed: ${successful} successful, ${failed} failed`,
        results,
        summary: {
          total: urlIds.length,
          successful,
          failed
        }
      });

    } catch (error) {
      logger.error('Failed to bulk moderate URLs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk moderate URLs'
      });
    }
  }

  // Get flagged URLs for review (admin only)
  async getFlaggedUrls(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        severity,
        status
      } = req.query;

      const Url = require('../models/Url');
      const query = {
        $or: [
          { moderationFlags: { $exists: true, $ne: [] } },
          { reportCount: { $gte: 1 } },
          { status: 'disabled' }
        ]
      };

      if (status) {
        query.status = status;
      }

      const [urls, total] = await Promise.all([
        Url.find(query)
          .sort({ reportCount: -1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('userId', 'username email')
          .lean(),
        Url.countDocuments(query)
      ]);

      await auditService.logDataAccess(
        'flagged_urls',
        'multiple',
        'view_flagged_urls',
        req.user.id,
        { page, limit, resultCount: urls.length },
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        urls,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Failed to get flagged URLs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve flagged URLs'
      });
    }
  }

  // Test URL moderation
  async testModeration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { url, title, description } = req.body;
      const userId = req.user?.id;

      const moderationResult = await contentModerationService.moderateUrl(
        url,
        userId,
        { title, description }
      );

      await auditService.logAdminAction(
        'moderation_test',
        'Tested URL moderation',
        req.user.id,
        { 
          url,
          moderationResult: {
            status: moderationResult.status,
            flags: moderationResult.flags,
            riskScore: moderationResult.riskScore
          }
        },
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        moderationResult
      });

    } catch (error) {
      logger.error('Failed to test moderation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test moderation'
      });
    }
  }

  // Update moderation rules (admin only)
  async updateModerationRules(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { blockedDomains, maliciousKeywords } = req.body;

      // Update blocked domains
      if (blockedDomains && Array.isArray(blockedDomains)) {
        blockedDomains.forEach(domain => {
          contentModerationService.blockedDomains.add(domain.toLowerCase());
        });
      }

      // Update malicious keywords
      if (maliciousKeywords && Array.isArray(maliciousKeywords)) {
        contentModerationService.maliciousKeywords.push(...maliciousKeywords);
      }

      await auditService.logAdminAction(
        'moderation_rules_updated',
        'Updated content moderation rules',
        req.user.id,
        { 
          blockedDomainsAdded: blockedDomains?.length || 0,
          keywordsAdded: maliciousKeywords?.length || 0
        },
        { 
          category: 'admin',
          severity: 'medium',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: 'Moderation rules updated successfully',
        summary: {
          totalBlockedDomains: contentModerationService.blockedDomains.size,
          totalKeywords: contentModerationService.maliciousKeywords.length
        }
      });

    } catch (error) {
      logger.error('Failed to update moderation rules:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update moderation rules'
      });
    }
  }
}

module.exports = new ModerationController();
