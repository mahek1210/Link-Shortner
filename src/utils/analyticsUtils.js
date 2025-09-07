// src/utils/analyticsUtils.js
const UserAgent = require('user-agents');
const geoip = require('geoip-lite');

// Parse user agent to extract device, browser, and OS info
const parseUserAgent = (userAgent) => {
  const ua = new UserAgent(userAgent);
  
  return {
    device: getDeviceType(userAgent),
    browser: getBrowser(userAgent),
    os: getOperatingSystem(userAgent),
    isBot: isBot(userAgent)
  };
};

// Determine device type
const getDeviceType = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  } else if (/tablet|ipad|kindle|silk/i.test(ua)) {
    return 'tablet';
  } else if (/desktop|windows|macintosh|linux/i.test(ua)) {
    return 'desktop';
  }
  
  return 'unknown';
};

// Extract browser name
const getBrowser = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('chrome') && !ua.includes('edg')) {
    return 'Chrome';
  } else if (ua.includes('firefox')) {
    return 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    return 'Safari';
  } else if (ua.includes('edg')) {
    return 'Edge';
  } else if (ua.includes('opera')) {
    return 'Opera';
  }
  
  return 'Unknown';
};

// Extract operating system
const getOperatingSystem = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('windows')) {
    return 'Windows';
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    return 'macOS';
  } else if (ua.includes('linux')) {
    return 'Linux';
  } else if (ua.includes('android')) {
    return 'Android';
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    return 'iOS';
  }
  
  return 'Unknown';
};

// Check if user agent is a bot
const isBot = (userAgent) => {
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
    /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
    /twitterbot/i, /linkedinbot/i, /whatsapp/i, /telegram/i
  ];
  
  return botPatterns.some(pattern => pattern.test(userAgent));
};

// Get client IP address
const getClientIP = (req) => {
  return req.ip || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.headers['x-forwarded-for']?.split(',')[0] ||
         '127.0.0.1';
};

// Get geolocation from IP address
const getGeolocation = (ip) => {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      timezone: 'Unknown'
    };
  }
  
  const geo = geoip.lookup(ip);
  if (!geo) {
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      timezone: 'Unknown'
    };
  }
  
  return {
    country: geo.country || 'Unknown',
    city: geo.city || 'Unknown',
    region: geo.region || 'Unknown',
    timezone: geo.timezone || 'Unknown'
  };
};

// Get referrer from request
const getReferrer = (req) => {
  return req.get('Referer') || req.get('Referrer') || null;
};

// Generate analytics aggregation pipeline for time-based data
const getTimeBasedAnalytics = (urlId, timeRange = '7d') => {
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
  
  return [
    {
      $match: {
        urlId: urlId,
        'clickData.timestamp': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: timeRange === '24h' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
            date: '$clickData.timestamp'
          }
        },
        clicks: { $sum: 1 },
        uniqueIPs: { $addToSet: '$clickData.ip' }
      }
    },
    {
      $project: {
        _id: 1,
        clicks: 1,
        uniqueClicks: { $size: '$uniqueIPs' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];
};

// Generate geographic analytics pipeline
const getGeographicAnalytics = (urlId) => {
  return [
    {
      $match: { urlId: urlId }
    },
    {
      $group: {
        _id: {
          country: '$clickData.country',
          city: '$clickData.city'
        },
        clicks: { $sum: 1 }
      }
    },
    {
      $sort: { clicks: -1 }
    },
    {
      $limit: 50
    }
  ];
};

// Generate device analytics pipeline
const getDeviceAnalytics = (urlId) => {
  return [
    {
      $match: { urlId: urlId }
    },
    {
      $group: {
        _id: '$clickData.device',
        clicks: { $sum: 1 }
      }
    },
    {
      $sort: { clicks: -1 }
    }
  ];
};

// Generate browser analytics pipeline
const getBrowserAnalytics = (urlId) => {
  return [
    {
      $match: { urlId: urlId }
    },
    {
      $group: {
        _id: '$clickData.browser',
        clicks: { $sum: 1 }
      }
    },
    {
      $sort: { clicks: -1 }
    },
    {
      $limit: 10
    }
  ];
};

// Generate referrer analytics pipeline
const getReferrerAnalytics = (urlId) => {
  return [
    {
      $match: { 
        urlId: urlId,
        'clickData.referrer': { $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$clickData.referrer',
        clicks: { $sum: 1 }
      }
    },
    {
      $sort: { clicks: -1 }
    },
    {
      $limit: 20
    }
  ];
};

module.exports = {
  parseUserAgent,
  getClientIP,
  getGeolocation,
  getReferrer,
  getTimeBasedAnalytics,
  getGeographicAnalytics,
  getDeviceAnalytics,
  getBrowserAnalytics,
  getReferrerAnalytics
};
