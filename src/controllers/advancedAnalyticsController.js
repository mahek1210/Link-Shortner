// src/controllers/advancedAnalyticsController.js - Advanced Analytics Controller
const Analytics = require('../models/Analytics');
const Url = require('../models/Url');
const crypto = require('crypto');
const UAParser = require('ua-parser-js');

// Utility function to hash IP for privacy
const hashIP = (ip) => {
  return crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'default-salt').digest('hex');
};

// Utility function to categorize referrer
const categorizeReferrer = (referrer) => {
  if (!referrer || referrer === '') return 'direct';
  
  const url = referrer.toLowerCase();
  
  // Social media
  if (url.includes('facebook.com') || url.includes('twitter.com') || 
      url.includes('linkedin.com') || url.includes('instagram.com') ||
      url.includes('tiktok.com') || url.includes('youtube.com') ||
      url.includes('reddit.com') || url.includes('pinterest.com')) {
    return 'social';
  }
  
  // Search engines
  if (url.includes('google.') || url.includes('bing.com') ||
      url.includes('yahoo.com') || url.includes('duckduckgo.com') ||
      url.includes('baidu.com') || url.includes('yandex.')) {
    return 'search';
  }
  
  // Email
  if (url.includes('mail.') || url.includes('gmail.com') ||
      url.includes('outlook.') || url.includes('yahoo.com/mail')) {
    return 'email';
  }
  
  // Ads
  if (url.includes('ads.') || url.includes('doubleclick.') ||
      url.includes('googleadservices.') || url.includes('facebook.com/tr')) {
    return 'ads';
  }
  
  return 'other';
};

// Utility function to detect device type
const detectDevice = (userAgent) => {
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  
  if (device.type === 'mobile') return 'mobile';
  if (device.type === 'tablet') return 'tablet';
  if (device.type === 'smarttv') return 'smart-tv';
  if (device.type === 'wearable') return 'wearable';
  
  return 'desktop';
};

// Utility function to detect bot
const detectBot = (userAgent) => {
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
    /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
    /whatsapp/i, /telegram/i, /skype/i,
    /monitoring/i, /uptime/i, /pingdom/i, /newrelic/i
  ];
  
  return botPatterns.some(pattern => pattern.test(userAgent));
};

// Utility function to get bot type
const getBotType = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('googlebot') || ua.includes('bingbot') || 
      ua.includes('slurp') || ua.includes('duckduckbot')) {
    return 'search-engine';
  }
  
  if (ua.includes('facebookexternalhit') || ua.includes('twitterbot') || 
      ua.includes('linkedinbot')) {
    return 'social-media';
  }
  
  if (ua.includes('monitoring') || ua.includes('uptime') || 
      ua.includes('pingdom') || ua.includes('newrelic')) {
    return 'monitoring';
  }
  
  if (ua.includes('scraper') || ua.includes('crawler')) {
    return 'scraper';
  }
  
  return 'other';
};

// Track a click with comprehensive analytics
const trackClick = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userAgent = req.get('User-Agent') || '';
    const referrer = req.get('Referer') || '';
    
    // Parse UTM parameters
    const utmParams = {
      utmSource: req.query.utm_source,
      utmMedium: req.query.utm_medium,
      utmCampaign: req.query.utm_campaign,
      utmTerm: req.query.utm_term,
      utmContent: req.query.utm_content
    };
    
    // Find the URL
    const url = await Url.findOne({ 
      $or: [{ shortId: shortCode }, { shortCode }] 
    });
    
    if (!url) {
      return res.status(404).json({ 
        success: false, 
        message: 'Short URL not found' 
      });
    }
    
    // Parse user agent
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();
    
    // Hash IP for privacy
    const hashedIp = hashIP(ip);
    
    // Check if this is a unique visitor (within last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let analytics = await Analytics.findOne({ shortCode });
    
    let isUniqueVisitor = true;
    if (analytics) {
      const recentClick = analytics.clicks.find(click => 
        click.hashedIp === hashedIp && 
        click.timestamp > twentyFourHoursAgo
      );
      isUniqueVisitor = !recentClick;
    }
    
    // Detect bot
    const isBot = detectBot(userAgent);
    const botType = isBot ? getBotType(userAgent) : null;
    
    // Create click data
    const clickData = {
      timestamp: new Date(),
      ip,
      hashedIp,
      userAgent,
      referrer,
      referrerCategory: categorizeReferrer(referrer),
      country: req.geoip?.country || 'Unknown',
      countryCode: req.geoip?.country_code || 'XX',
      region: req.geoip?.region || 'Unknown',
      city: req.geoip?.city || 'Unknown',
      timezone: req.geoip?.timezone || 'UTC',
      coordinates: req.geoip ? {
        lat: req.geoip.latitude,
        lng: req.geoip.longitude
      } : undefined,
      device: detectDevice(userAgent),
      deviceBrand: device.vendor || 'Unknown',
      deviceModel: device.model || 'Unknown',
      browser: browser.name || 'Unknown',
      browserVersion: browser.version || 'Unknown',
      os: os.name || 'Unknown',
      osVersion: os.version || 'Unknown',
      screenResolution: {
        width: req.body?.screenWidth,
        height: req.body?.screenHeight
      },
      ...utmParams,
      isBot,
      botType,
      sessionId: req.sessionID || crypto.randomUUID(),
      isUniqueVisitor,
      loadTime: req.body?.loadTime
    };
    
    // Create or update analytics
    if (!analytics) {
      analytics = new Analytics({
        urlId: url._id,
        shortCode,
        clicks: [clickData],
        stats: {
          totalClicks: 1,
          uniqueVisitors: isUniqueVisitor ? 1 : 0,
          dailyStats: [{
            date: new Date().setHours(0, 0, 0, 0),
            clicks: 1,
            uniqueVisitors: isUniqueVisitor ? 1 : 0
          }],
          topCountries: [],
          deviceStats: [],
          browserStats: [],
          referrerStats: [],
          hourlyPattern: Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 })),
          weeklyPattern: Array(7).fill(0).map((_, i) => ({ day: i, count: 0 }))
        }
      });
      
      // Set initial patterns
      const hour = new Date().getHours();
      const day = new Date().getDay();
      analytics.stats.hourlyPattern[hour].count = 1;
      analytics.stats.weeklyPattern[day].count = 1;
      
      await analytics.save();
    } else {
      await analytics.addClick(clickData);
    }
    
    // Update URL click count
    url.clicks = (url.clicks || 0) + 1;
    url.lastClicked = new Date();
    await url.save();
    
    // Redirect to original URL
    res.redirect(url.originalUrl);
    
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error tracking click' 
    });
  }
};

// Get comprehensive analytics for a URL
const getAnalytics = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { 
      timeRange = '7d', 
      startDate, 
      endDate,
      includeRawData = false 
    } = req.query;
    
    // Find URL and check ownership
    const url = await Url.findOne({ 
      $or: [{ shortId: shortCode }, { shortCode }] 
    });
    
    if (!url) {
      return res.status(404).json({ 
        success: false, 
        message: 'URL not found' 
      });
    }
    
    if (url.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    // Find analytics
    let analytics = await Analytics.findOne({ shortCode });
    
    if (!analytics) {
      return res.json({
        success: true,
        data: {
          url,
          analytics: {
            totalClicks: 0,
            uniqueVisitors: 0,
            clickRate: 0,
            engagementRate: 0,
            dailyStats: [],
            topCountries: [],
            deviceStats: [],
            browserStats: [],
            referrerStats: [],
            hourlyPattern: Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 })),
            weeklyPattern: Array(7).fill(0).map((_, i) => ({ day: i, count: 0 })),
            recentClicks: []
          },
          timeRange,
          generatedAt: new Date()
        }
      });
    }
    
    // Calculate date range
    let dateFilter = {};
    const now = new Date();
    
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const ranges = {
        '1h': 1000 * 60 * 60,
        '24h': 1000 * 60 * 60 * 24,
        '7d': 1000 * 60 * 60 * 24 * 7,
        '30d': 1000 * 60 * 60 * 24 * 30,
        '90d': 1000 * 60 * 60 * 24 * 90,
        '1y': 1000 * 60 * 60 * 24 * 365
      };
      
      if (ranges[timeRange]) {
        dateFilter = {
          $gte: new Date(now.getTime() - ranges[timeRange])
        };
      }
    }
    
    // Filter clicks by date range
    let filteredClicks = analytics.clicks;
    if (Object.keys(dateFilter).length > 0) {
      filteredClicks = analytics.clicks.filter(click => {
        if (dateFilter.$gte && click.timestamp < dateFilter.$gte) return false;
        if (dateFilter.$lte && click.timestamp > dateFilter.$lte) return false;
        return true;
      });
    }
    
    // Calculate filtered statistics
    const totalClicks = filteredClicks.length;
    const uniqueVisitors = new Set(filteredClicks.map(c => c.hashedIp)).size;
    
    // Group by various dimensions
    const countryStats = {};
    const deviceStats = {};
    const browserStats = {};
    const osStats = {};
    const referrerStats = {};
    const dailyStats = {};
    const hourlyPattern = Array(24).fill(0);
    const weeklyPattern = Array(7).fill(0);
    
    filteredClicks.forEach(click => {
      // Country stats
      const country = click.country || 'Unknown';
      countryStats[country] = (countryStats[country] || 0) + 1;
      
      // Device stats
      const device = click.device || 'unknown';
      deviceStats[device] = (deviceStats[device] || 0) + 1;
      
      // Browser stats
      const browser = click.browser || 'Unknown';
      browserStats[browser] = (browserStats[browser] || 0) + 1;
      
      // OS stats
      const os = click.os || 'Unknown';
      osStats[os] = (osStats[os] || 0) + 1;
      
      // Referrer stats
      const referrer = click.referrerCategory || 'direct';
      referrerStats[referrer] = (referrerStats[referrer] || 0) + 1;
      
      // Daily stats
      const dateKey = click.timestamp.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { clicks: 0, uniqueVisitors: new Set() };
      }
      dailyStats[dateKey].clicks += 1;
      dailyStats[dateKey].uniqueVisitors.add(click.hashedIp);
      
      // Time patterns
      hourlyPattern[click.timestamp.getHours()] += 1;
      weeklyPattern[click.timestamp.getDay()] += 1;
    });
    
    // Convert to arrays with percentages
    const toStatsArray = (obj, keyName = 'name') => {
      return Object.entries(obj)
        .map(([key, count]) => ({
          [keyName]: key,
          count,
          percentage: totalClicks > 0 ? Math.round((count / totalClicks) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);
    };
    
    const topCountries = toStatsArray(countryStats, 'country').slice(0, 10);
    const deviceStatsArray = toStatsArray(deviceStats, 'device');
    const browserStatsArray = toStatsArray(browserStats, 'browser');
    const osStatsArray = toStatsArray(osStats, 'os');
    const referrerStatsArray = toStatsArray(referrerStats, 'referrer');
    
    // Daily stats array
    const dailyStatsArray = Object.entries(dailyStats)
      .map(([date, data]) => ({
        date: new Date(date),
        clicks: data.clicks,
        uniqueVisitors: data.uniqueVisitors.size
      }))
      .sort((a, b) => a.date - b.date);
    
    // Recent clicks (last 50)
    const recentClicks = filteredClicks
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50)
      .map(click => ({
        timestamp: click.timestamp,
        country: click.country,
        city: click.city,
        device: click.device,
        browser: click.browser,
        os: click.os,
        referrer: click.referrer,
        referrerCategory: click.referrerCategory,
        isBot: click.isBot
      }));
    
    // Calculate rates
    const daysSinceCreation = Math.max(1, (now - url.createdAt) / (1000 * 60 * 60 * 24));
    const clickRate = Math.round((totalClicks / daysSinceCreation) * 100) / 100;
    const engagementRate = totalClicks > 0 ? Math.round((uniqueVisitors / totalClicks) * 100) : 0;
    
    const responseData = {
      url,
      analytics: {
        totalClicks,
        uniqueVisitors,
        clickRate,
        engagementRate,
        dailyStats: dailyStatsArray,
        topCountries,
        deviceStats: deviceStatsArray,
        browserStats: browserStatsArray,
        osStats: osStatsArray,
        referrerStats: referrerStatsArray,
        hourlyPattern: hourlyPattern.map((count, hour) => ({ hour, count })),
        weeklyPattern: weeklyPattern.map((count, day) => ({ day, count })),
        recentClicks
      },
      timeRange,
      dateRange: dateFilter,
      generatedAt: new Date()
    };
    
    // Include raw data if requested
    if (includeRawData === 'true') {
      responseData.rawClicks = filteredClicks;
    }
    
    res.json({
      success: true,
      data: responseData
    });
    
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving analytics' 
    });
  }
};

// Get analytics summary for all user URLs
const getUserAnalyticsSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timeRange = '30d' } = req.query;
    
    // Get all user URLs
    const urls = await Url.find({ userId }).select('shortId shortCode originalUrl createdAt clicks');
    
    if (urls.length === 0) {
      return res.json({
        success: true,
        data: {
          totalUrls: 0,
          totalClicks: 0,
          totalUniqueVisitors: 0,
          topUrls: [],
          recentActivity: [],
          summary: {
            totalClicks: 0,
            uniqueVisitors: 0,
            clickRate: 0,
            engagementRate: 0
          }
        }
      });
    }
    
    // Calculate date range
    const now = new Date();
    const ranges = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    
    const daysBack = ranges[timeRange] || 30;
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    
    // Get analytics for all URLs
    const shortCodes = urls.map(url => url.shortCode || url.shortId);
    const analyticsData = await Analytics.find({ 
      shortCode: { $in: shortCodes } 
    });
    
    let totalClicks = 0;
    let totalUniqueVisitors = 0;
    const urlStats = [];
    const allRecentClicks = [];
    
    for (const url of urls) {
      const analytics = analyticsData.find(a => 
        a.shortCode === (url.shortCode || url.shortId)
      );
      
      if (analytics) {
        // Filter clicks by date range
        const filteredClicks = analytics.clicks.filter(
          click => click.timestamp >= startDate
        );
        
        const urlClicks = filteredClicks.length;
        const urlUniqueVisitors = new Set(filteredClicks.map(c => c.hashedIp)).size;
        
        totalClicks += urlClicks;
        totalUniqueVisitors += urlUniqueVisitors;
        
        urlStats.push({
          url: {
            shortId: url.shortId,
            shortCode: url.shortCode,
            originalUrl: url.originalUrl,
            createdAt: url.createdAt
          },
          clicks: urlClicks,
          uniqueVisitors: urlUniqueVisitors,
          clickRate: Math.round((urlClicks / Math.max(1, (now - url.createdAt) / (1000 * 60 * 60 * 24))) * 100) / 100
        });
        
        // Add recent clicks
        allRecentClicks.push(...filteredClicks.slice(-10).map(click => ({
          ...click.toObject(),
          shortCode: url.shortCode || url.shortId,
          originalUrl: url.originalUrl
        })));
      } else {
        urlStats.push({
          url: {
            shortId: url.shortId,
            shortCode: url.shortCode,
            originalUrl: url.originalUrl,
            createdAt: url.createdAt
          },
          clicks: 0,
          uniqueVisitors: 0,
          clickRate: 0
        });
      }
    }
    
    // Sort and get top URLs
    const topUrls = urlStats
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
    
    // Sort recent activity
    const recentActivity = allRecentClicks
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
    
    // Calculate overall rates
    const totalDays = Math.max(1, daysBack);
    const clickRate = Math.round((totalClicks / totalDays) * 100) / 100;
    const engagementRate = totalClicks > 0 ? Math.round((totalUniqueVisitors / totalClicks) * 100) : 0;
    
    res.json({
      success: true,
      data: {
        totalUrls: urls.length,
        totalClicks,
        totalUniqueVisitors,
        topUrls,
        recentActivity,
        summary: {
          totalClicks,
          uniqueVisitors: totalUniqueVisitors,
          clickRate,
          engagementRate
        },
        timeRange,
        generatedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Error getting user analytics summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving analytics summary' 
    });
  }
};

// Export analytics data
const exportAnalytics = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { format = 'json', timeRange = '30d' } = req.query;
    
    // Find URL and check ownership
    const url = await Url.findOne({ 
      $or: [{ shortId: shortCode }, { shortCode }] 
    });
    
    if (!url) {
      return res.status(404).json({ 
        success: false, 
        message: 'URL not found' 
      });
    }
    
    if (url.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    // Get analytics with raw data
    const analyticsResponse = await this.getAnalytics({
      ...req,
      query: { ...req.query, includeRawData: 'true' }
    }, { json: () => {} });
    
    // Format data based on requested format
    if (format === 'csv') {
      // Convert to CSV format
      const csvData = analyticsResponse.data.rawClicks.map(click => ({
        timestamp: click.timestamp.toISOString(),
        country: click.country,
        city: click.city,
        device: click.device,
        browser: click.browser,
        os: click.os,
        referrer: click.referrer || 'direct',
        referrerCategory: click.referrerCategory,
        isBot: click.isBot,
        isUniqueVisitor: click.isUniqueVisitor
      }));
      
      // Convert to CSV string
      const headers = Object.keys(csvData[0] || {}).join(',');
      const rows = csvData.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${shortCode}-analytics.csv"`);
      res.send(csv);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${shortCode}-analytics.json"`);
      res.json(analyticsResponse.data);
    }
    
  } catch (error) {
    console.error('Error exporting analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error exporting analytics' 
    });
  }
};

// Real-time analytics endpoint (for WebSocket or polling)
const getRealtimeStats = async (req, res) => {
  try {
    const { shortCode } = req.params;
    
    // Find URL and check ownership
    const url = await Url.findOne({ 
      $or: [{ shortId: shortCode }, { shortCode }] 
    });
    
    if (!url) {
      return res.status(404).json({ 
        success: false, 
        message: 'URL not found' 
      });
    }
    
    if (url.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    // Get recent analytics (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const analytics = await Analytics.findOne({ shortCode });
    
    if (!analytics) {
      return res.json({
        success: true,
        data: {
          recentClicks: 0,
          activeVisitors: 0,
          clicksLastHour: [],
          topCountriesLastHour: []
        }
      });
    }
    
    const recentClicks = analytics.clicks.filter(
      click => click.timestamp >= oneHourAgo
    );
    
    const activeVisitors = new Set(
      recentClicks.map(click => click.hashedIp)
    ).size;
    
    // Group by 5-minute intervals
    const intervals = {};
    recentClicks.forEach(click => {
      const interval = Math.floor(click.timestamp.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
      intervals[interval] = (intervals[interval] || 0) + 1;
    });
    
    const clicksLastHour = Object.entries(intervals)
      .map(([timestamp, count]) => ({
        timestamp: new Date(parseInt(timestamp)),
        count
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Top countries in last hour
    const countryCount = {};
    recentClicks.forEach(click => {
      const country = click.country || 'Unknown';
      countryCount[country] = (countryCount[country] || 0) + 1;
    });
    
    const topCountriesLastHour = Object.entries(countryCount)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    res.json({
      success: true,
      data: {
        recentClicks: recentClicks.length,
        activeVisitors,
        clicksLastHour,
        topCountriesLastHour,
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {
    console.error('Error getting realtime stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving realtime stats' 
    });
  }
};

// Export all functions
module.exports = {
  trackClick,
  getAnalytics,
  getUserAnalyticsSummary,
  exportAnalytics,
  getRealtimeStats
};
