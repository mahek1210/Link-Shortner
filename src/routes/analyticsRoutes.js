// src/routes/analyticsRoutes.js
const express = require('express');
const Url = require('../models/Url');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/analytics/:shortId - Get analytics for specific URL
router.get('/:shortId', auth, async (req, res) => {
  try {
    const { shortId } = req.params;
    const { timeRange = '7d' } = req.query;

    // Find URL and verify ownership (check both shortId and shortCode)
    const url = await Url.findOne({ 
      $or: [
        { shortId },
        { shortCode: shortId }
      ]
    });

    if (!url) {
      return res.status(404).json({
        success: false,
        message: 'URL not found'
      });
    }

    // Check if user owns this URL
    if (url.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view analytics for this URL'
      });
    }

    // Calculate time range for filtering
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Filter click history by time range
    const filteredClicks = url.clickHistory.filter(click => 
      new Date(click.timestamp) >= startDate
    );

    // Calculate analytics
    const analytics = {
      totalClicks: url.clicks,
      clicksInRange: filteredClicks.length,
      uniqueVisitors: calculateUniqueVisitors(filteredClicks),
      browserStats: calculateBrowserStats(filteredClicks),
      deviceStats: calculateDeviceStats(filteredClicks),
      referrerStats: calculateReferrerStats(filteredClicks),
      dailyClicks: calculateDailyClicks(filteredClicks, timeRange),
      topCountries: calculateTopCountries(filteredClicks),
      recentClicks: getRecentClicks(filteredClicks, 10)
    };

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

    res.json({
      success: true,
      data: {
        url: {
          id: url._id,
          originalUrl: url.originalUrl,
          shortId: url.shortId,
          shortUrl: `${baseUrl}/${url.shortId}`,
          createdAt: url.createdAt,
          lastAccessed: url.lastAccessed,
          expiresAt: url.expiresAt,
          hasPassword: !!url.password
        },
        analytics,
        timeRange,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching analytics'
    });
  }
});

// GET /api/analytics/user/summary - Get user's overall analytics summary
router.get('/user/summary', auth, async (req, res) => {
  try {
    const urls = await Url.find({ userId: req.user._id });

    if (urls.length === 0) {
      return res.json({
        success: true,
        data: {
          totalUrls: 0,
          totalClicks: 0,
          topPerformingUrls: [],
          recentActivity: []
        }
      });
    }

    // Calculate summary statistics
    const totalClicks = urls.reduce((sum, url) => sum + url.clicks, 0);
    
    // Get top performing URLs
    const topPerformingUrls = urls
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map(url => ({
        shortId: url.shortId,
        originalUrl: url.originalUrl,
        clicks: url.clicks,
        createdAt: url.createdAt
      }));

    // Get recent activity (last 10 clicks across all URLs)
    const allClicks = [];
    urls.forEach(url => {
      url.clickHistory.forEach(click => {
        allClicks.push({
          shortId: url.shortId,
          originalUrl: url.originalUrl,
          ...click.toObject()
        });
      });
    });

    const recentActivity = allClicks
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        totalUrls: urls.length,
        totalClicks,
        topPerformingUrls,
        recentActivity
      }
    });

  } catch (error) {
    console.error('User summary analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user analytics'
    });
  }
});

// Helper functions for analytics calculations
function calculateUniqueVisitors(clicks) {
  const uniqueIPs = new Set(clicks.map(click => click.ip));
  return uniqueIPs.size;
}

function calculateBrowserStats(clicks) {
  const browserCount = {};
  clicks.forEach(click => {
    const browser = click.browser || 'Unknown';
    browserCount[browser] = (browserCount[browser] || 0) + 1;
  });

  return Object.entries(browserCount)
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count);
}

function calculateDeviceStats(clicks) {
  const deviceCount = {};
  clicks.forEach(click => {
    const device = click.device || 'Unknown';
    deviceCount[device] = (deviceCount[device] || 0) + 1;
  });

  return Object.entries(deviceCount)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);
}

function calculateReferrerStats(clicks) {
  const referrerCount = {};
  clicks.forEach(click => {
    let referrer = 'Direct';
    if (click.referrer) {
      try {
        const url = new URL(click.referrer);
        referrer = url.hostname;
      } catch (e) {
        referrer = 'Unknown';
      }
    }
    referrerCount[referrer] = (referrerCount[referrer] || 0) + 1;
  });

  return Object.entries(referrerCount)
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function calculateDailyClicks(clicks, timeRange) {
  const dailyCount = {};
  const days = timeRange === '24h' ? 1 : (timeRange === '7d' ? 7 : (timeRange === '30d' ? 30 : 90));
  
  // Initialize all days with 0
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyCount[dateStr] = 0;
  }

  // Count clicks per day
  clicks.forEach(click => {
    const dateStr = new Date(click.timestamp).toISOString().split('T')[0];
    if (dailyCount.hasOwnProperty(dateStr)) {
      dailyCount[dateStr]++;
    }
  });

  return Object.entries(dailyCount)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateTopCountries(clicks) {
  const countryCount = {};
  clicks.forEach(click => {
    // This would require a GeoIP service in a real implementation
    const country = click.country || 'Unknown';
    countryCount[country] = (countryCount[country] || 0) + 1;
  });

  return Object.entries(countryCount)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function getRecentClicks(clicks, limit = 10) {
  return clicks
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(click => ({
      timestamp: click.timestamp,
      ip: click.ip,
      browser: click.browser,
      device: click.device,
      referrer: click.referrer
    }));
}

module.exports = router;
