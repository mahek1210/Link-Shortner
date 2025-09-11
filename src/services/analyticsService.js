// src/services/analyticsService.js - Advanced analytics and reporting service
const Analytics = require('../models/Analytics');
const Url = require('../models/Url');
const User = require('../models/User');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class AnalyticsService {
  // Generate comprehensive analytics report
  async generateAnalyticsReport(userId, options = {}) {
    try {
      const {
        timeRange = '30d',
        urlId = null,
        includeDetailed = false,
        format = 'json'
      } = options;

      const dateRange = this.calculateDateRange(timeRange);
      const baseQuery = { userId };
      
      if (urlId) {
        baseQuery.urlId = urlId;
      }

      // Get analytics data
      const [
        clicksData,
        topUrls,
        geographicData,
        deviceData,
        referrerData,
        timeSeriesData
      ] = await Promise.all([
        this.getClicksAnalytics(baseQuery, dateRange),
        this.getTopUrls(userId, dateRange),
        this.getGeographicAnalytics(baseQuery, dateRange),
        this.getDeviceAnalytics(baseQuery, dateRange),
        this.getReferrerAnalytics(baseQuery, dateRange),
        this.getTimeSeriesData(baseQuery, dateRange)
      ]);

      const report = {
        summary: {
          timeRange,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          totalClicks: clicksData.totalClicks,
          uniqueVisitors: clicksData.uniqueVisitors,
          totalUrls: topUrls.length,
          avgClicksPerUrl: topUrls.length > 0 ? clicksData.totalClicks / topUrls.length : 0
        },
        topUrls,
        geographic: geographicData,
        devices: deviceData,
        referrers: referrerData,
        timeSeries: timeSeriesData
      };

      if (includeDetailed) {
        report.detailed = await this.getDetailedAnalytics(baseQuery, dateRange);
      }

      // Cache the report
      const cacheKey = `analytics:report:${userId}:${timeRange}:${urlId || 'all'}`;
      await cacheService.set(cacheKey, report, 300); // Cache for 5 minutes

      return format === 'csv' ? this.formatAsCSV(report) : report;

    } catch (error) {
      logger.error('Failed to generate analytics report:', error);
      throw error;
    }
  }

  // Get clicks analytics
  async getClicksAnalytics(baseQuery, dateRange) {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          totalClicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' },
          uniqueUrls: { $addToSet: '$urlId' }
        }
      },
      {
        $project: {
          totalClicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
          uniqueUrls: { $size: '$uniqueUrls' }
        }
      }
    ];

    const result = await Analytics.aggregate(pipeline);
    return result[0] || { totalClicks: 0, uniqueVisitors: 0, uniqueUrls: 0 };
  }

  // Get top performing URLs
  async getTopUrls(userId, dateRange, limit = 10) {
    const pipeline = [
      {
        $match: {
          userId,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: '$urlId',
          clicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' },
          lastClick: { $max: '$timestamp' }
        }
      },
      {
        $lookup: {
          from: 'urls',
          localField: '_id',
          foreignField: '_id',
          as: 'url'
        }
      },
      {
        $unwind: '$url'
      },
      {
        $project: {
          urlId: '$_id',
          shortCode: '$url.shortCode',
          originalUrl: '$url.originalUrl',
          title: '$url.title',
          clicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
          lastClick: 1,
          clickThroughRate: {
            $divide: ['$clicks', { $ifNull: ['$url.impressions', 1] }]
          }
        }
      },
      {
        $sort: { clicks: -1 }
      },
      {
        $limit: limit
      }
    ];

    return await Analytics.aggregate(pipeline);
  }

  // Get geographic analytics
  async getGeographicAnalytics(baseQuery, dateRange) {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: {
            country: '$country',
            city: '$city'
          },
          clicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' }
        }
      },
      {
        $project: {
          country: '$_id.country',
          city: '$_id.city',
          clicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      {
        $sort: { clicks: -1 }
      },
      {
        $limit: 50
      }
    ];

    const results = await Analytics.aggregate(pipeline);
    
    // Group by country for summary
    const countryStats = {};
    results.forEach(item => {
      const country = item.country || 'Unknown';
      if (!countryStats[country]) {
        countryStats[country] = { clicks: 0, uniqueVisitors: 0, cities: [] };
      }
      countryStats[country].clicks += item.clicks;
      countryStats[country].uniqueVisitors += item.uniqueVisitors;
      countryStats[country].cities.push({
        city: item.city || 'Unknown',
        clicks: item.clicks,
        uniqueVisitors: item.uniqueVisitors
      });
    });

    return {
      byLocation: results,
      byCountry: Object.entries(countryStats).map(([country, stats]) => ({
        country,
        ...stats
      })).sort((a, b) => b.clicks - a.clicks)
    };
  }

  // Get device analytics
  async getDeviceAnalytics(baseQuery, dateRange) {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: {
            deviceType: '$deviceType',
            browser: '$browser',
            os: '$os'
          },
          clicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' }
        }
      },
      {
        $project: {
          deviceType: '$_id.deviceType',
          browser: '$_id.browser',
          os: '$_id.os',
          clicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      {
        $sort: { clicks: -1 }
      }
    ];

    const results = await Analytics.aggregate(pipeline);
    
    // Categorize results
    const deviceTypes = {};
    const browsers = {};
    const operatingSystems = {};

    results.forEach(item => {
      // Device types
      const deviceType = item.deviceType || 'Unknown';
      if (!deviceTypes[deviceType]) {
        deviceTypes[deviceType] = { clicks: 0, uniqueVisitors: 0 };
      }
      deviceTypes[deviceType].clicks += item.clicks;
      deviceTypes[deviceType].uniqueVisitors += item.uniqueVisitors;

      // Browsers
      const browser = item.browser || 'Unknown';
      if (!browsers[browser]) {
        browsers[browser] = { clicks: 0, uniqueVisitors: 0 };
      }
      browsers[browser].clicks += item.clicks;
      browsers[browser].uniqueVisitors += item.uniqueVisitors;

      // Operating systems
      const os = item.os || 'Unknown';
      if (!operatingSystems[os]) {
        operatingSystems[os] = { clicks: 0, uniqueVisitors: 0 };
      }
      operatingSystems[os].clicks += item.clicks;
      operatingSystems[os].uniqueVisitors += item.uniqueVisitors;
    });

    return {
      deviceTypes: Object.entries(deviceTypes).map(([type, stats]) => ({ type, ...stats })),
      browsers: Object.entries(browsers).map(([browser, stats]) => ({ browser, ...stats })),
      operatingSystems: Object.entries(operatingSystems).map(([os, stats]) => ({ os, ...stats }))
    };
  }

  // Get referrer analytics
  async getReferrerAnalytics(baseQuery, dateRange) {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: '$referrer',
          clicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' }
        }
      },
      {
        $project: {
          referrer: '$_id',
          clicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      {
        $sort: { clicks: -1 }
      },
      {
        $limit: 20
      }
    ];

    const results = await Analytics.aggregate(pipeline);
    
    // Categorize referrers
    const categorized = results.map(item => {
      const referrer = item.referrer || 'Direct';
      let category = 'Other';
      
      if (!item.referrer || item.referrer === '') {
        category = 'Direct';
      } else if (item.referrer.includes('google')) {
        category = 'Search Engine';
      } else if (item.referrer.includes('facebook') || item.referrer.includes('twitter') || 
                 item.referrer.includes('linkedin') || item.referrer.includes('instagram')) {
        category = 'Social Media';
      } else if (item.referrer.includes('email') || item.referrer.includes('newsletter')) {
        category = 'Email';
      }

      return {
        ...item,
        referrer,
        category
      };
    });

    return categorized;
  }

  // Get time series data
  async getTimeSeriesData(baseQuery, dateRange) {
    const pipeline = [
      {
        $match: {
          ...baseQuery,
          timestamp: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' }
          },
          clicks: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$ipHash' }
        }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day',
              hour: '$_id.hour'
            }
          },
          clicks: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' }
        }
      },
      {
        $sort: { date: 1 }
      }
    ];

    return await Analytics.aggregate(pipeline);
  }

  // Calculate date range based on time range string
  calculateDateRange(timeRange) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    return { startDate, endDate };
  }

  // Export analytics data as CSV
  formatAsCSV(report) {
    const csvData = [];
    
    // Add summary
    csvData.push('Analytics Summary');
    csvData.push(`Time Range,${report.summary.timeRange}`);
    csvData.push(`Total Clicks,${report.summary.totalClicks}`);
    csvData.push(`Unique Visitors,${report.summary.uniqueVisitors}`);
    csvData.push(`Total URLs,${report.summary.totalUrls}`);
    csvData.push('');

    // Add top URLs
    csvData.push('Top URLs');
    csvData.push('Short Code,Original URL,Clicks,Unique Visitors');
    report.topUrls.forEach(url => {
      csvData.push(`${url.shortCode},${url.originalUrl},${url.clicks},${url.uniqueVisitors}`);
    });
    csvData.push('');

    // Add geographic data
    csvData.push('Geographic Data');
    csvData.push('Country,City,Clicks,Unique Visitors');
    report.geographic.byLocation.forEach(location => {
      csvData.push(`${location.country || 'Unknown'},${location.city || 'Unknown'},${location.clicks},${location.uniqueVisitors}`);
    });

    return csvData.join('\n');
  }

  // Get real-time analytics
  async getRealTimeAnalytics(userId) {
    try {
      const cacheKey = `realtime:analytics:${userId}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [recentClicks, activeUrls, topReferrers] = await Promise.all([
        Analytics.find({
          userId,
          timestamp: { $gte: last24Hours }
        }).sort({ timestamp: -1 }).limit(100),
        
        Analytics.aggregate([
          {
            $match: {
              userId,
              timestamp: { $gte: last24Hours }
            }
          },
          {
            $group: {
              _id: '$urlId',
              clicks: { $sum: 1 },
              lastClick: { $max: '$timestamp' }
            }
          },
          {
            $lookup: {
              from: 'urls',
              localField: '_id',
              foreignField: '_id',
              as: 'url'
            }
          },
          {
            $unwind: '$url'
          },
          {
            $project: {
              shortCode: '$url.shortCode',
              clicks: 1,
              lastClick: 1
            }
          },
          {
            $sort: { lastClick: -1 }
          },
          {
            $limit: 10
          }
        ]),
        
        Analytics.aggregate([
          {
            $match: {
              userId,
              timestamp: { $gte: last24Hours }
            }
          },
          {
            $group: {
              _id: '$referrer',
              clicks: { $sum: 1 }
            }
          },
          {
            $sort: { clicks: -1 }
          },
          {
            $limit: 5
          }
        ])
      ]);

      const realTimeData = {
        recentClicks: recentClicks.slice(0, 20),
        activeUrls,
        topReferrers,
        lastUpdated: new Date()
      };

      // Cache for 30 seconds
      await cacheService.set(cacheKey, realTimeData, 30);
      
      return realTimeData;

    } catch (error) {
      logger.error('Failed to get real-time analytics:', error);
      throw error;
    }
  }
}

module.exports = new AnalyticsService();
