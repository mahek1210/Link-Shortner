// src/controllers/urlController.js
const { nanoid } = require('nanoid');
const Url = require('../models/Url');
const Analytics = require('../models/Analytics');
const { 
  parseUserAgent, 
  getClientIP, 
  getGeolocation,
  getReferrer,
  getTimeBasedAnalytics,
  getGeographicAnalytics,
  getDeviceAnalytics,
  getBrowserAnalytics,
  getReferrerAnalytics
} = require('../utils/analyticsUtils');

// Generate unique short code with retry logic
const generateShortCode = async () => {
  let shortCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!isUnique && attempts < maxAttempts) {
    shortCode = nanoid(8);
    try {
      const existing = await Url.findOne({ shortCode });
      if (!existing) {
        isUnique = true;
      }
    } catch (error) {
      console.error('Error checking shortCode uniqueness:', error);
      throw new Error('Database error while generating short code');
    }
    attempts++;
  }
  
  if (!isUnique) {
    throw new Error('Failed to generate unique short code after multiple attempts');
  }
  
  return shortCode;
};

// POST /api/shorten
const createShortUrl = async (req, res) => {
  try {
    console.log('=== CREATE URL REQUEST START ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user?._id);
    
    const { originalUrl, customAlias, expiresAt, password, tags } = req.body;
    
    // Validate originalUrl
    if (!originalUrl || typeof originalUrl !== 'string') {
      console.log('ERROR: originalUrl is required');
      return res.status(400).json({ 
        success: false, 
        error: 'originalUrl is required' 
      });
    }
    
    // Basic URL validation
    try {
      new URL(originalUrl);
    } catch {
      console.log('ERROR: Invalid URL format');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid URL format' 
      });
    }
    
    let shortCode;
    
    // Handle custom alias
    if (customAlias && customAlias.trim() !== '') {
      console.log('Checking if custom alias exists:', customAlias);
      
      // Check if custom alias already exists
      const existing = await Url.findOne({ 
        $or: [{ shortCode: customAlias }, { customAlias: customAlias }] 
      });
      
      if (existing) {
        console.log('ERROR: Custom alias already exists');
        return res.status(400).json({ 
          success: false, 
          error: 'Custom alias already exists' 
        });
      }
      
      shortCode = customAlias.trim();
      console.log('Using custom alias as shortCode:', shortCode);
    } else {
      // Generate unique short code
      console.log('Generating unique shortCode...');
      shortCode = await generateShortCode();
      console.log('Generated shortCode:', shortCode);
    }
    
    // Validate shortCode is not empty
    if (!shortCode || shortCode.trim() === '') {
      console.log('ERROR: shortCode is empty');
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to generate short code' 
      });
    }
    
    // Create URL document with all fields
    const urlData = {
      originalUrl: originalUrl.trim(),
      shortCode: shortCode.trim(),
      userId: req.user._id, // Associate with user
      ...(customAlias && customAlias.trim() !== '' && { customAlias: customAlias.trim() }),
      ...(expiresAt && { expiresAt: new Date(expiresAt) }),
      ...(password && { password: password }),
      ...(tags && Array.isArray(tags) && { tags: tags.filter(tag => tag.trim() !== '') })
    };
    
    console.log('Creating URL with data:', urlData);
    
    const urlDoc = new Url(urlData);
    await urlDoc.save();
    
    console.log('URL saved successfully:', urlDoc.shortCode);
    
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    // Return complete URL object matching frontend expectations
    const response = {
      success: true,
      data: {
        _id: urlDoc._id,
        id: urlDoc._id.toString(), // For frontend compatibility
        originalUrl: urlDoc.originalUrl,
        shortCode: urlDoc.shortCode,
        shortId: urlDoc.shortCode, // Map shortCode to shortId for frontend
        shortUrl: `${baseUrl}/${urlDoc.shortCode}`,
        customAlias: urlDoc.customAlias || undefined,
        clicks: urlDoc.clicks,
        createdAt: urlDoc.createdAt,
        lastClicked: urlDoc.lastClicked,
        expiresAt: urlDoc.expiresAt || undefined,
        isExpired: urlDoc.expiresAt ? new Date() > new Date(urlDoc.expiresAt) : false,
        password: urlDoc.password ? '***' : undefined, // Don't send actual password
        tags: urlDoc.tags || [],
        isActive: urlDoc.isActive
      }
    };
    
    console.log('Response:', response);
    console.log('=== CREATE URL REQUEST END ===');
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error('=== CREATE URL ERROR ===');
    console.error('Error details:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      console.log('Duplicate key error detected');
      return res.status(400).json({ 
        success: false, 
        error: 'Short code already exists, please try again' 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.log('Validation error:', error.message);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid data provided' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
};

// GET /:shortCode
const handleRedirect = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { password } = req.query;
    
    // Find URL by shortCode or customAlias
    const urlDoc = await Url.findOne({ 
      $or: [{ shortCode }, { customAlias: shortCode }] 
    }).select('+password');
    
    if (!urlDoc) {
      return res.status(404).json({ error: 'URL not found' });
    }
    
    // Check if URL is active
    if (!urlDoc.isActive) {
      return res.status(410).json({ error: 'URL is no longer active' });
    }
    
    // Check if URL has expired
    if (urlDoc.expiresAt && new Date() > new Date(urlDoc.expiresAt)) {
      return res.status(410).json({ error: 'URL has expired' });
    }
    
    // Check password protection
    if (urlDoc.password) {
      if (!password || urlDoc.password !== password) {
        return res.status(401).json({ 
          error: 'Password required',
          requiresPassword: true 
        });
      }
    }
    
    // Get client information for analytics (fast)
    const clientIP = getClientIP(req);
    const userAgent = req.get('User-Agent') || 'Unknown';
    const referrer = getReferrer(req);
    
    // Update click count immediately (fast operation)
    const updatePromise = Url.updateOne(
      { _id: urlDoc._id },
      { 
        $inc: { clicks: 1 },
        $set: { lastClicked: new Date() }
      }
    );
    
    // Save analytics data asynchronously (don't wait)
    setImmediate(async () => {
      try {
        const parsedUA = parseUserAgent(userAgent);
        const geoData = getGeolocation(clientIP);
        
        const analyticsData = {
          urlId: urlDoc._id,
          shortCode: urlDoc.shortCode,
          clickData: {
            ip: clientIP,
            userAgent: userAgent,
            referrer: referrer,
            country: geoData.country,
            city: geoData.city,
            device: parsedUA.device,
            browser: parsedUA.browser,
            os: parsedUA.os,
            isBot: parsedUA.isBot,
            timestamp: new Date()
          }
        };
        
        await Analytics.create(analyticsData);
        await updatePromise;
      } catch (err) {
        console.error('Error saving analytics:', err);
      }
    });
    
    // Redirect immediately without waiting for analytics
    res.redirect(301, urlDoc.originalUrl);
    
  } catch (error) {
    console.error('Error handling redirect:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/analytics/:shortCode
const getAnalytics = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { timeRange = '7d' } = req.query;
    
    console.log('Analytics request for shortCode:', shortCode, 'timeRange:', timeRange);
    
    const urlDoc = await Url.findOne({ 
      $or: [{ shortCode }, { customAlias: shortCode }] 
    });
    
    if (!urlDoc) {
      return res.status(404).json({ error: 'URL not found' });
    }
    
    // Get detailed analytics data
    const [
      timeBasedData,
      geographicData,
      deviceData,
      browserData,
      referrerData,
      recentClicks
    ] = await Promise.all([
      Analytics.aggregate(getTimeBasedAnalytics(urlDoc._id, timeRange)),
      Analytics.aggregate(getGeographicAnalytics(urlDoc._id)),
      Analytics.aggregate(getDeviceAnalytics(urlDoc._id)),
      Analytics.aggregate(getBrowserAnalytics(urlDoc._id)),
      Analytics.aggregate(getReferrerAnalytics(urlDoc._id)),
      Analytics.find({ urlId: urlDoc._id })
        .sort({ 'clickData.timestamp': -1 })
        .limit(50)
        .select('clickData')
        .lean()
    ]);
    
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    // Calculate unique visitors
    const uniqueVisitors = await Analytics.distinct('clickData.ip', { urlId: urlDoc._id });
    
    res.json({
      success: true,
      data: {
        // Basic URL info
        _id: urlDoc._id,
        originalUrl: urlDoc.originalUrl,
        shortCode: urlDoc.shortCode,
        shortUrl: `${baseUrl}/${urlDoc.shortCode}`,
        customAlias: urlDoc.customAlias,
        clicks: urlDoc.clicks,
        uniqueVisitors: uniqueVisitors.length,
        lastClicked: urlDoc.lastClicked,
        createdAt: urlDoc.createdAt,
        expiresAt: urlDoc.expiresAt,
        isExpired: urlDoc.expiresAt ? new Date() > new Date(urlDoc.expiresAt) : false,
        tags: urlDoc.tags || [],
        isActive: urlDoc.isActive,
        hasPassword: !!urlDoc.password,
        
        // Analytics data
        analytics: {
          timeBased: timeBasedData,
          geographic: geographicData,
          devices: deviceData,
          browsers: browserData,
          referrers: referrerData,
          recentClicks: recentClicks.map(click => ({
            timestamp: click.clickData.timestamp,
            ip: click.clickData.ip,
            country: click.clickData.country,
            city: click.clickData.city,
            device: click.clickData.device,
            browser: click.clickData.browser,
            os: click.clickData.os,
            referrer: click.clickData.referrer,
            isBot: click.clickData.isBot
          }))
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createShortUrl,
  handleRedirect,
  getAnalytics
};