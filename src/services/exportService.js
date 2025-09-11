// src/services/exportService.js - Data export and analytics export service
const Analytics = require('../models/Analytics');
const Url = require('../models/Url');
const User = require('../models/User');
const logger = require('../config/logger');
const analyticsService = require('./analyticsService');
const subscriptionService = require('./subscriptionService');

class ExportService {
  // Export user data in various formats
  async exportUserData(userId, options = {}) {
    try {
      const {
        format = 'json',
        includeAnalytics = true,
        includeUrls = true,
        timeRange = '30d',
        dataTypes = ['urls', 'analytics', 'profile']
      } = options;

      // Check export permissions
      const canExport = await subscriptionService.canPerformAction(userId, 'advanced_analytics');
      if (!canExport && (includeAnalytics || format === 'csv')) {
        throw new Error('Data export requires a paid subscription');
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        userId,
        format,
        timeRange
      };

      // Export profile data
      if (dataTypes.includes('profile')) {
        exportData.profile = await this.exportProfileData(userId);
      }

      // Export URLs
      if (dataTypes.includes('urls') && includeUrls) {
        exportData.urls = await this.exportUrlsData(userId);
      }

      // Export analytics
      if (dataTypes.includes('analytics') && includeAnalytics) {
        exportData.analytics = await this.exportAnalyticsData(userId, timeRange);
      }

      // Format the data
      const formattedData = await this.formatExportData(exportData, format);

      // Log export activity
      logger.audit.userAction('Data exported', {
        userId,
        format,
        dataTypes,
        timeRange
      });

      return formattedData;

    } catch (error) {
      logger.error('Failed to export user data:', error);
      throw error;
    }
  }

  // Export profile data
  async exportProfileData(userId) {
    try {
      const user = await User.findById(userId).select('-password -__v');
      return {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
        branding: user.branding
      };
    } catch (error) {
      logger.error('Failed to export profile data:', error);
      throw error;
    }
  }

  // Export URLs data
  async exportUrlsData(userId) {
    try {
      const urls = await Url.find({ userId }).select('-__v').lean();
      
      return urls.map(url => ({
        id: url._id,
        shortCode: url.shortCode,
        originalUrl: url.originalUrl,
        shortUrl: `${process.env.BASE_URL}/${url.shortCode}`,
        title: url.title,
        description: url.description,
        clicks: url.clicks,
        uniqueClicks: url.uniqueClicks,
        status: url.status,
        isActive: url.isActive,
        createdAt: url.createdAt,
        updatedAt: url.updatedAt,
        lastClicked: url.lastClicked,
        expiresAt: url.expiresAt,
        isExpired: url.expiresAt && url.expiresAt < new Date(),
        hasPassword: !!url.password,
        tags: url.tags,
        customAlias: url.customAlias
      }));
    } catch (error) {
      logger.error('Failed to export URLs data:', error);
      throw error;
    }
  }

  // Export analytics data
  async exportAnalyticsData(userId, timeRange) {
    try {
      const report = await analyticsService.generateAnalyticsReport(userId, {
        timeRange,
        includeDetailed: true
      });

      return {
        summary: report.summary,
        topUrls: report.topUrls,
        geographic: report.geographic,
        devices: report.devices,
        referrers: report.referrers,
        timeSeries: report.timeSeries,
        detailed: report.detailed
      };
    } catch (error) {
      logger.error('Failed to export analytics data:', error);
      throw error;
    }
  }

  // Format export data based on requested format
  async formatExportData(data, format) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        return this.convertToCSV(data);
      
      case 'xlsx':
        return await this.convertToExcel(data);
      
      case 'pdf':
        return await this.convertToPDF(data);
      
      default:
        return data;
    }
  }

  // Convert data to CSV format
  convertToCSV(data) {
    const csvSections = [];

    // Profile section
    if (data.profile) {
      csvSections.push('Profile Information');
      csvSections.push('Field,Value');
      Object.entries(data.profile).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          csvSections.push(`${key},${JSON.stringify(value)}`);
        } else {
          csvSections.push(`${key},${value || ''}`);
        }
      });
      csvSections.push('');
    }

    // URLs section
    if (data.urls && data.urls.length > 0) {
      csvSections.push('URLs');
      const urlHeaders = Object.keys(data.urls[0]).join(',');
      csvSections.push(urlHeaders);
      
      data.urls.forEach(url => {
        const values = Object.values(url).map(value => {
          if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value || '').replace(/"/g, '""')}"`;
        }).join(',');
        csvSections.push(values);
      });
      csvSections.push('');
    }

    // Analytics section
    if (data.analytics) {
      csvSections.push('Analytics Summary');
      csvSections.push('Metric,Value');
      Object.entries(data.analytics.summary).forEach(([key, value]) => {
        csvSections.push(`${key},${value}`);
      });
      csvSections.push('');

      // Top URLs
      if (data.analytics.topUrls && data.analytics.topUrls.length > 0) {
        csvSections.push('Top URLs');
        csvSections.push('Short Code,Original URL,Clicks,Unique Visitors');
        data.analytics.topUrls.forEach(url => {
          csvSections.push(`${url.shortCode},"${url.originalUrl}",${url.clicks},${url.uniqueVisitors}`);
        });
        csvSections.push('');
      }

      // Geographic data
      if (data.analytics.geographic && data.analytics.geographic.byCountry) {
        csvSections.push('Geographic Data');
        csvSections.push('Country,Clicks,Unique Visitors');
        data.analytics.geographic.byCountry.forEach(country => {
          csvSections.push(`${country.country},${country.clicks},${country.uniqueVisitors}`);
        });
      }
    }

    return csvSections.join('\n');
  }

  // Convert data to Excel format (requires xlsx library)
  async convertToExcel(data) {
    try {
      // This would require the 'xlsx' package
      // For now, return a message indicating the feature
      return {
        message: 'Excel export requires additional dependencies',
        data: data,
        format: 'xlsx'
      };
    } catch (error) {
      logger.error('Failed to convert to Excel:', error);
      throw error;
    }
  }

  // Convert data to PDF format (requires pdf generation library)
  async convertToPDF(data) {
    try {
      // This would require a PDF generation library like puppeteer or pdfkit
      // For now, return a message indicating the feature
      return {
        message: 'PDF export requires additional dependencies',
        data: data,
        format: 'pdf'
      };
    } catch (error) {
      logger.error('Failed to convert to PDF:', error);
      throw error;
    }
  }

  // Export analytics report for specific URL
  async exportUrlAnalytics(userId, urlId, options = {}) {
    try {
      const {
        format = 'json',
        timeRange = '30d',
        includeRawData = false
      } = options;

      // Verify URL ownership
      const url = await Url.findOne({ _id: urlId, userId });
      if (!url) {
        throw new Error('URL not found or access denied');
      }

      // Generate analytics report for specific URL
      const report = await analyticsService.generateAnalyticsReport(userId, {
        urlId,
        timeRange,
        includeDetailed: includeRawData
      });

      const exportData = {
        exportedAt: new Date().toISOString(),
        url: {
          id: url._id,
          shortCode: url.shortCode,
          originalUrl: url.originalUrl,
          title: url.title
        },
        timeRange,
        analytics: report
      };

      // Format the data
      const formattedData = await this.formatExportData(exportData, format);

      logger.audit.userAction('URL analytics exported', {
        userId,
        urlId,
        format,
        timeRange
      });

      return formattedData;

    } catch (error) {
      logger.error('Failed to export URL analytics:', error);
      throw error;
    }
  }

  // Bulk export multiple URLs analytics
  async bulkExportAnalytics(userId, urlIds, options = {}) {
    try {
      const canBulkExport = await subscriptionService.canPerformAction(userId, 'bulk_operations');
      if (!canBulkExport) {
        throw new Error('Bulk export requires a paid subscription');
      }

      const {
        format = 'json',
        timeRange = '30d'
      } = options;

      const exports = [];

      for (const urlId of urlIds) {
        try {
          const urlExport = await this.exportUrlAnalytics(userId, urlId, {
            format: 'json', // Always use JSON for individual exports in bulk
            timeRange
          });
          exports.push(JSON.parse(urlExport));
        } catch (error) {
          exports.push({
            urlId,
            error: error.message
          });
        }
      }

      const bulkExportData = {
        exportedAt: new Date().toISOString(),
        userId,
        timeRange,
        totalUrls: urlIds.length,
        successfulExports: exports.filter(exp => !exp.error).length,
        failedExports: exports.filter(exp => exp.error).length,
        exports
      };

      const formattedData = await this.formatExportData(bulkExportData, format);

      logger.audit.userAction('Bulk analytics exported', {
        userId,
        urlCount: urlIds.length,
        format,
        timeRange
      });

      return formattedData;

    } catch (error) {
      logger.error('Failed to bulk export analytics:', error);
      throw error;
    }
  }

  // Schedule automated exports
  async scheduleExport(userId, schedule) {
    try {
      const {
        frequency, // daily, weekly, monthly
        format,
        dataTypes,
        email,
        webhookUrl
      } = schedule;

      // Check if user can schedule exports
      const canSchedule = await subscriptionService.canPerformAction(userId, 'advanced_analytics');
      if (!canSchedule) {
        throw new Error('Scheduled exports require a paid subscription');
      }

      // Store schedule in database (would need a ScheduledExport model)
      const scheduledExport = {
        userId,
        frequency,
        format,
        dataTypes,
        email,
        webhookUrl,
        isActive: true,
        nextExport: this.calculateNextExportDate(frequency),
        createdAt: new Date()
      };

      // This would be saved to a ScheduledExports collection
      logger.audit.userAction('Export scheduled', {
        userId,
        frequency,
        format,
        dataTypes
      });

      return scheduledExport;

    } catch (error) {
      logger.error('Failed to schedule export:', error);
      throw error;
    }
  }

  // Calculate next export date based on frequency
  calculateNextExportDate(frequency) {
    const now = new Date();
    
    switch (frequency) {
      case 'daily':
        now.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
      default:
        now.setDate(now.getDate() + 7); // Default to weekly
    }
    
    return now;
  }

  // Get export history
  async getExportHistory(userId, limit = 20) {
    try {
      // This would query an ExportHistory collection
      // For now, return mock data
      return {
        exports: [],
        totalExports: 0,
        message: 'Export history tracking would be implemented with a dedicated collection'
      };
    } catch (error) {
      logger.error('Failed to get export history:', error);
      throw error;
    }
  }
}

module.exports = new ExportService();
