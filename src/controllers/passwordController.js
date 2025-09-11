// src/controllers/passwordController.js - Password Protection System
const Url = require('../models/Url');
const Analytics = require('../models/Analytics');
const crypto = require('crypto');

// Render password form for protected links
const renderPasswordForm = (req, res) => {
  const { shortCode } = req.params;
  const error = req.query.error;
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Protected Link</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 400px;
                width: 100%;
                text-align: center;
            }
            
            .lock-icon {
                width: 60px;
                height: 60px;
                margin: 0 auto 20px;
                background: #f3f4f6;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: #6b7280;
            }
            
            h1 {
                color: #1f2937;
                margin-bottom: 10px;
                font-size: 24px;
                font-weight: 600;
            }
            
            p {
                color: #6b7280;
                margin-bottom: 30px;
                line-height: 1.5;
            }
            
            .form-group {
                margin-bottom: 20px;
                text-align: left;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                color: #374151;
                font-weight: 500;
            }
            
            input[type="password"] {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.2s;
            }
            
            input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .submit-btn {
                width: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s;
            }
            
            .submit-btn:hover {
                transform: translateY(-1px);
            }
            
            .error {
                background: #fef2f2;
                color: #dc2626;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 20px;
                border: 1px solid #fecaca;
            }
            
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #9ca3af;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="lock-icon">🔒</div>
            <h1>Password Required</h1>
            <p>This link is password protected. Please enter the password to continue.</p>
            
            ${error ? `<div class="error">${error}</div>` : ''}
            
            <form method="POST" action="/password/${shortCode}">
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required autofocus>
                </div>
                <button type="submit" class="submit-btn">Access Link</button>
            </form>
            
            <div class="footer">
                Powered by Link Shortener
            </div>
        </div>
    </body>
    </html>
  `;
  
  res.send(html);
};

// Verify password and redirect
const verifyPassword = async (req, res) => {
  try {
    const { shortCode } = req.params;
    const { password } = req.body;
    
    console.log(`Password verification attempt for: ${shortCode}`);
    
    // Find the URL
    const url = await Url.findOne({ 
      $or: [{ shortId: shortCode }, { shortCode }] 
    }).select('+password');
    
    if (!url) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Link Not Found</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Link Not Found</h1>
          <p>The requested link does not exist or has been removed.</p>
        </body></html>
      `);
    }
    
    // Check if link is expired
    if (url.status === 'expired' || url.isExpired()) {
      // Track failed attempt for expired link
      await trackAnalytics(url, req, 'expired_access_attempt');
      
      return res.status(410).send(`
        <!DOCTYPE html>
        <html><head><title>Link Expired</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fef2f2;">
          <h1 style="color: #dc2626;">Link Expired</h1>
          <p>This link has expired and is no longer accessible.</p>
          <p style="color: #6b7280; margin-top: 20px;">Expired on: ${url.expiresAt ? url.expiresAt.toLocaleDateString() : 'N/A'}</p>
        </body></html>
      `);
    }
    
    // Verify password
    if (!url.password || !password) {
      await trackAnalytics(url, req, 'password_missing');
      return res.redirect(`/password/${shortCode}?error=Password is required`);
    }
    
    if (!url.verifyPassword(password)) {
      await trackAnalytics(url, req, 'password_incorrect');
      return res.redirect(`/password/${shortCode}?error=Incorrect password`);
    }
    
    // Password correct - track successful access and redirect
    await trackAnalytics(url, req, 'password_success');
    
    // Update click count
    url.clicks = (url.clicks || 0) + 1;
    url.lastClicked = new Date();
    url.lastAccessed = new Date();
    await url.save();
    
    console.log(`Password verified successfully for ${shortCode}, redirecting to: ${url.originalUrl}`);
    res.redirect(url.originalUrl);
    
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html><head><title>Server Error</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>Server Error</h1>
        <p>An error occurred while processing your request. Please try again later.</p>
      </body></html>
    `);
  }
};

// Track analytics for password attempts
const trackAnalytics = async (url, req, eventType) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const userAgent = req.get('User-Agent') || '';
    const referrer = req.get('Referer') || '';
    
    // Hash IP for privacy
    const hashedIp = crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'default-salt')).digest('hex');
    
    const clickData = {
      timestamp: new Date(),
      ip,
      hashedIp,
      userAgent,
      referrer,
      referrerCategory: 'direct',
      country: req.geoip?.country || 'Unknown',
      countryCode: req.geoip?.country_code || 'XX',
      region: req.geoip?.region || 'Unknown',
      city: req.geoip?.city || 'Unknown',
      timezone: req.geoip?.timezone || 'UTC',
      device: 'unknown',
      browser: 'Unknown',
      os: 'Unknown',
      isBot: false,
      isUniqueVisitor: true,
      eventType, // Track the type of event (password_success, password_incorrect, etc.)
      customData: new Map([['eventType', eventType]])
    };
    
    // Find or create analytics record
    let analytics = await Analytics.findOne({ 
      shortCode: url.shortCode || url.shortId 
    });
    
    if (!analytics) {
      analytics = new Analytics({
        urlId: url._id,
        shortCode: url.shortCode || url.shortId,
        clicks: [clickData],
        stats: {
          totalClicks: 1,
          uniqueVisitors: 1,
          dailyStats: [{
            date: new Date().setHours(0, 0, 0, 0),
            clicks: 1,
            uniqueVisitors: 1
          }]
        }
      });
      await analytics.save();
    } else {
      await analytics.addClick(clickData);
    }
    
    console.log(`Analytics tracked for ${url.shortCode}: ${eventType}`);
  } catch (error) {
    console.error('Analytics tracking error:', error);
  }
};

module.exports = {
  renderPasswordForm,
  verifyPassword
};
