// src/services/complianceService.js - GDPR compliance and data protection service
const User = require('../models/User');
const Url = require('../models/Url');
const Analytics = require('../models/Analytics');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class ComplianceService {
  // Handle GDPR data export request
  async exportUserData(userId, requestId = null) {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw new Error('User not found');
      }

      // Collect all user data
      const [urls, analytics, subscriptionData] = await Promise.all([
        Url.find({ userId }).lean(),
        Analytics.find({ userId }).lean(),
        this.getSubscriptionData(userId)
      ]);

      const exportData = {
        exportId: requestId || `export_${Date.now()}_${userId}`,
        exportDate: new Date().toISOString(),
        dataSubject: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLogin: user.lastLogin,
          branding: user.branding
        },
        urls: urls.map(url => ({
          id: url._id,
          shortCode: url.shortCode,
          originalUrl: url.originalUrl,
          title: url.title,
          description: url.description,
          clicks: url.clicks,
          status: url.status,
          createdAt: url.createdAt,
          updatedAt: url.updatedAt,
          lastClicked: url.lastClicked,
          expiresAt: url.expiresAt,
          tags: url.tags
        })),
        analytics: analytics.map(record => ({
          id: record._id,
          urlId: record.urlId,
          timestamp: record.timestamp,
          country: record.country,
          city: record.city,
          deviceType: record.deviceType,
          browser: record.browser,
          os: record.os,
          referrer: record.referrer,
          ipHash: record.ipHash // Hashed IP, not raw IP
        })),
        subscription: subscriptionData,
        legalBasis: 'GDPR Article 20 - Right to data portability',
        retentionPolicy: 'Data is retained as per our privacy policy',
        contactInfo: {
          dpo: process.env.DPO_EMAIL || 'dpo@example.com',
          support: process.env.SUPPORT_EMAIL || 'support@example.com'
        }
      };

      // Log the export request
      logger.audit.userAction('GDPR data export completed', {
        userId,
        requestId,
        dataTypes: ['profile', 'urls', 'analytics', 'subscription'],
        recordCount: {
          urls: urls.length,
          analytics: analytics.length
        }
      });

      return exportData;
    } catch (error) {
      logger.error('Failed to export user data for GDPR:', error);
      throw error;
    }
  }

  // Handle GDPR data deletion request (Right to be forgotten)
  async deleteUserData(userId, deletionType = 'full', requestId = null) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const deletionLog = {
        userId,
        requestId: requestId || `deletion_${Date.now()}_${userId}`,
        deletionType,
        requestedAt: new Date(),
        status: 'processing'
      };

      let deletedData = {};

      switch (deletionType) {
        case 'full':
          deletedData = await this.performFullDeletion(userId);
          break;
        case 'analytics_only':
          deletedData = await this.deleteAnalyticsData(userId);
          break;
        case 'urls_only':
          deletedData = await this.deleteUrlsData(userId);
          break;
        case 'anonymize':
          deletedData = await this.anonymizeUserData(userId);
          break;
        default:
          throw new Error('Invalid deletion type');
      }

      deletionLog.status = 'completed';
      deletionLog.completedAt = new Date();
      deletionLog.deletedData = deletedData;

      // Log the deletion
      logger.audit.userAction('GDPR data deletion completed', deletionLog);

      return {
        success: true,
        deletionId: deletionLog.requestId,
        deletionType,
        deletedData,
        completedAt: deletionLog.completedAt
      };

    } catch (error) {
      logger.error('Failed to delete user data for GDPR:', error);
      throw error;
    }
  }

  // Perform full account deletion
  async performFullDeletion(userId) {
    const deletedData = {};

    // Delete analytics data
    const analyticsResult = await Analytics.deleteMany({ userId });
    deletedData.analytics = analyticsResult.deletedCount;

    // Delete URLs
    const urlsResult = await Url.deleteMany({ userId });
    deletedData.urls = urlsResult.deletedCount;

    // Delete subscription data
    const Subscription = require('../models/Subscription');
    const subscriptionResult = await Subscription.deleteMany({ userId });
    deletedData.subscription = subscriptionResult.deletedCount;

    // Delete user account
    const userResult = await User.deleteOne({ _id: userId });
    deletedData.user = userResult.deletedCount;

    // Clear all caches related to this user
    await cacheService.invalidatePattern(`*:${userId}:*`);
    await cacheService.invalidatePattern(`*:${userId}`);

    return deletedData;
  }

  // Delete only analytics data
  async deleteAnalyticsData(userId) {
    const result = await Analytics.deleteMany({ userId });
    await cacheService.invalidatePattern(`analytics:*:${userId}*`);
    
    return { analytics: result.deletedCount };
  }

  // Delete only URLs data
  async deleteUrlsData(userId) {
    const urls = await Url.find({ userId }).select('shortCode');
    const result = await Url.deleteMany({ userId });
    
    // Clear URL caches
    for (const url of urls) {
      await cacheService.del(`url:${url.shortCode}`);
    }
    
    return { urls: result.deletedCount };
  }

  // Anonymize user data instead of deletion
  async anonymizeUserData(userId) {
    const anonymizedId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Anonymize user profile
    await User.findByIdAndUpdate(userId, {
      $set: {
        username: anonymizedId,
        email: `${anonymizedId}@anonymized.local`,
        isActive: false,
        anonymized: true,
        anonymizedAt: new Date()
      },
      $unset: {
        branding: 1,
        lastLogin: 1
      }
    });

    // Anonymize analytics data (keep aggregated data but remove identifying info)
    await Analytics.updateMany(
      { userId },
      {
        $unset: {
          ipHash: 1,
          userAgent: 1
        },
        $set: {
          anonymized: true
        }
      }
    );

    return {
      user: 1,
      analytics: 'anonymized',
      anonymizedId
    };
  }

  // Get user consent status
  async getUserConsent(userId) {
    try {
      const user = await User.findById(userId).select('consent');
      
      return user?.consent || {
        analytics: false,
        marketing: false,
        functional: true, // Required for basic functionality
        consentDate: null,
        ipAddress: null,
        userAgent: null
      };
    } catch (error) {
      logger.error('Failed to get user consent:', error);
      return null;
    }
  }

  // Update user consent
  async updateUserConsent(userId, consentData, metadata = {}) {
    try {
      const consentRecord = {
        analytics: consentData.analytics || false,
        marketing: consentData.marketing || false,
        functional: true, // Always true for basic functionality
        consentDate: new Date(),
        ipAddress: this.hashIP(metadata.ipAddress),
        userAgent: metadata.userAgent,
        consentVersion: '1.0'
      };

      await User.findByIdAndUpdate(userId, {
        $set: { consent: consentRecord }
      });

      // Log consent change
      logger.audit.userAction('Consent updated', {
        userId,
        consent: consentRecord,
        ipHash: consentRecord.ipAddress
      });

      return consentRecord;
    } catch (error) {
      logger.error('Failed to update user consent:', error);
      throw error;
    }
  }

  // Check if user has given consent for specific purpose
  async hasConsent(userId, purpose) {
    try {
      const consent = await this.getUserConsent(userId);
      return consent?.[purpose] || false;
    } catch (error) {
      logger.error('Failed to check user consent:', error);
      return false;
    }
  }

  // Generate privacy policy compliance report
  async generateComplianceReport() {
    try {
      const [
        totalUsers,
        activeUsers,
        anonymizedUsers,
        totalUrls,
        totalAnalytics,
        consentStats
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ anonymized: true }),
        Url.countDocuments(),
        Analytics.countDocuments(),
        this.getConsentStatistics()
      ]);

      const report = {
        generatedAt: new Date().toISOString(),
        dataSubjects: {
          total: totalUsers,
          active: activeUsers,
          anonymized: anonymizedUsers,
          inactive: totalUsers - activeUsers
        },
        dataProcessing: {
          urls: totalUrls,
          analyticsRecords: totalAnalytics
        },
        consent: consentStats,
        dataRetention: {
          analyticsRetentionDays: parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 365,
          inactiveUserRetentionDays: parseInt(process.env.INACTIVE_USER_RETENTION_DAYS) || 1095
        },
        legalBasis: {
          userAccounts: 'Contract (GDPR Article 6(1)(b))',
          analytics: 'Consent (GDPR Article 6(1)(a))',
          security: 'Legitimate Interest (GDPR Article 6(1)(f))'
        },
        contactInfo: {
          dpo: process.env.DPO_EMAIL || 'dpo@example.com',
          support: process.env.SUPPORT_EMAIL || 'support@example.com'
        }
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      throw error;
    }
  }

  // Get consent statistics
  async getConsentStatistics() {
    try {
      const pipeline = [
        {
          $match: {
            consent: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalWithConsent: { $sum: 1 },
            analyticsConsent: {
              $sum: { $cond: ['$consent.analytics', 1, 0] }
            },
            marketingConsent: {
              $sum: { $cond: ['$consent.marketing', 1, 0] }
            },
            functionalConsent: {
              $sum: { $cond: ['$consent.functional', 1, 0] }
            }
          }
        }
      ];

      const result = await User.aggregate(pipeline);
      return result[0] || {
        totalWithConsent: 0,
        analyticsConsent: 0,
        marketingConsent: 0,
        functionalConsent: 0
      };
    } catch (error) {
      logger.error('Failed to get consent statistics:', error);
      return {};
    }
  }

  // Clean up expired data based on retention policies
  async cleanupExpiredData() {
    try {
      const now = new Date();
      const analyticsRetentionDays = parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 365;
      const inactiveUserRetentionDays = parseInt(process.env.INACTIVE_USER_RETENTION_DAYS) || 1095;

      const analyticsCleanupDate = new Date(now.getTime() - (analyticsRetentionDays * 24 * 60 * 60 * 1000));
      const userCleanupDate = new Date(now.getTime() - (inactiveUserRetentionDays * 24 * 60 * 60 * 1000));

      // Clean up old analytics data
      const analyticsResult = await Analytics.deleteMany({
        timestamp: { $lt: analyticsCleanupDate }
      });

      // Clean up inactive users (if they haven't logged in for the retention period)
      const inactiveUsersResult = await User.deleteMany({
        isActive: false,
        lastLogin: { $lt: userCleanupDate }
      });

      const cleanupReport = {
        cleanupDate: now,
        analyticsDeleted: analyticsResult.deletedCount,
        inactiveUsersDeleted: inactiveUsersResult.deletedCount,
        retentionPolicies: {
          analyticsRetentionDays,
          inactiveUserRetentionDays
        }
      };

      logger.audit.systemEvent('Data retention cleanup completed', cleanupReport);

      return cleanupReport;
    } catch (error) {
      logger.error('Failed to cleanup expired data:', error);
      throw error;
    }
  }

  // Get subscription data for GDPR export
  async getSubscriptionData(userId) {
    try {
      const Subscription = require('../models/Subscription');
      const subscription = await Subscription.findOne({ userId }).lean();
      
      if (!subscription) {
        return null;
      }

      return {
        id: subscription._id,
        tier: subscription.tier,
        status: subscription.status,
        features: subscription.features,
        usage: subscription.usage,
        billingCycle: subscription.billingCycle,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      };
    } catch (error) {
      logger.error('Failed to get subscription data:', error);
      return null;
    }
  }

  // Hash IP address for privacy
  hashIP(ipAddress) {
    if (!ipAddress) return null;
    
    const crypto = require('crypto');
    const salt = process.env.IP_SALT || 'default-salt';
    return crypto.createHash('sha256').update(ipAddress + salt).digest('hex');
  }

  // Validate GDPR request
  validateGDPRRequest(requestType, userId, requestData = {}) {
    const validRequestTypes = ['export', 'delete', 'rectify', 'restrict', 'object'];
    
    if (!validRequestTypes.includes(requestType)) {
      throw new Error('Invalid GDPR request type');
    }

    if (!userId) {
      throw new Error('User ID is required for GDPR requests');
    }

    // Additional validation based on request type
    switch (requestType) {
      case 'delete':
        const validDeletionTypes = ['full', 'analytics_only', 'urls_only', 'anonymize'];
        if (requestData.deletionType && !validDeletionTypes.includes(requestData.deletionType)) {
          throw new Error('Invalid deletion type');
        }
        break;
      case 'export':
        // Export requests are always valid if user exists
        break;
      default:
        // Other request types would have their own validation
        break;
    }

    return true;
  }
}

module.exports = new ComplianceService();
