// src/services/brandingService.js - Custom branding and white-label service
const User = require('../models/User');
const logger = require('../config/logger');
const cacheService = require('./cacheService');
const subscriptionService = require('./subscriptionService');

class BrandingService {
  // Get user's branding configuration
  async getUserBranding(userId) {
    try {
      const cacheKey = `branding:${userId}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      const user = await User.findById(userId).select('branding');
      const branding = user?.branding || this.getDefaultBranding();

      // Cache for 10 minutes
      await cacheService.set(cacheKey, branding, 600);
      
      return branding;
    } catch (error) {
      logger.error('Failed to get user branding:', error);
      return this.getDefaultBranding();
    }
  }

  // Update user's branding configuration
  async updateBranding(userId, brandingData) {
    try {
      // Check if user has branding permissions
      const canCustomize = await subscriptionService.canPerformAction(userId, 'custom_branding');
      
      if (!canCustomize) {
        throw new Error('Custom branding requires a paid subscription');
      }

      // Validate branding data
      const validatedBranding = this.validateBrandingData(brandingData);

      // Update user's branding
      await User.findByIdAndUpdate(userId, {
        $set: { branding: validatedBranding }
      });

      // Clear cache
      await cacheService.del(`branding:${userId}`);

      logger.audit.userAction('Branding updated', {
        userId,
        changes: Object.keys(brandingData)
      });

      return validatedBranding;
    } catch (error) {
      logger.error('Failed to update branding:', error);
      throw error;
    }
  }

  // Get default branding configuration
  getDefaultBranding() {
    return {
      companyName: 'Link Shortener',
      logo: null,
      favicon: null,
      colors: {
        primary: '#2563eb',
        secondary: '#64748b',
        accent: '#10b981',
        background: '#ffffff',
        text: '#1f2937'
      },
      fonts: {
        primary: 'Inter, sans-serif',
        secondary: 'system-ui, sans-serif'
      },
      customDomain: null,
      customFooter: null,
      hideDefaultBranding: false,
      customCSS: null,
      socialLinks: {
        website: null,
        twitter: null,
        linkedin: null,
        facebook: null
      }
    };
  }

  // Validate branding data
  validateBrandingData(data) {
    const validated = {};

    // Company name
    if (data.companyName && typeof data.companyName === 'string') {
      validated.companyName = data.companyName.substring(0, 100);
    }

    // Logo URL
    if (data.logo && typeof data.logo === 'string' && this.isValidUrl(data.logo)) {
      validated.logo = data.logo;
    }

    // Favicon URL
    if (data.favicon && typeof data.favicon === 'string' && this.isValidUrl(data.favicon)) {
      validated.favicon = data.favicon;
    }

    // Colors
    if (data.colors && typeof data.colors === 'object') {
      validated.colors = {};
      const colorFields = ['primary', 'secondary', 'accent', 'background', 'text'];
      
      colorFields.forEach(field => {
        if (data.colors[field] && this.isValidColor(data.colors[field])) {
          validated.colors[field] = data.colors[field];
        }
      });
    }

    // Fonts
    if (data.fonts && typeof data.fonts === 'object') {
      validated.fonts = {};
      
      if (data.fonts.primary && typeof data.fonts.primary === 'string') {
        validated.fonts.primary = data.fonts.primary.substring(0, 200);
      }
      
      if (data.fonts.secondary && typeof data.fonts.secondary === 'string') {
        validated.fonts.secondary = data.fonts.secondary.substring(0, 200);
      }
    }

    // Custom domain
    if (data.customDomain && typeof data.customDomain === 'string') {
      validated.customDomain = data.customDomain.toLowerCase().substring(0, 100);
    }

    // Custom footer
    if (data.customFooter && typeof data.customFooter === 'string') {
      validated.customFooter = data.customFooter.substring(0, 500);
    }

    // Hide default branding
    if (typeof data.hideDefaultBranding === 'boolean') {
      validated.hideDefaultBranding = data.hideDefaultBranding;
    }

    // Custom CSS
    if (data.customCSS && typeof data.customCSS === 'string') {
      validated.customCSS = this.sanitizeCSS(data.customCSS.substring(0, 10000));
    }

    // Social links
    if (data.socialLinks && typeof data.socialLinks === 'object') {
      validated.socialLinks = {};
      const socialFields = ['website', 'twitter', 'linkedin', 'facebook'];
      
      socialFields.forEach(field => {
        if (data.socialLinks[field] && typeof data.socialLinks[field] === 'string' && 
            this.isValidUrl(data.socialLinks[field])) {
          validated.socialLinks[field] = data.socialLinks[field];
        }
      });
    }

    return validated;
  }

  // Generate branded short URL page
  async generateBrandedPage(shortCode, branding, urlData) {
    try {
      const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${branding.companyName || 'Link Shortener'}</title>
    ${branding.favicon ? `<link rel="icon" href="${branding.favicon}">` : ''}
    <style>
        :root {
            --primary-color: ${branding.colors?.primary || '#2563eb'};
            --secondary-color: ${branding.colors?.secondary || '#64748b'};
            --accent-color: ${branding.colors?.accent || '#10b981'};
            --background-color: ${branding.colors?.background || '#ffffff'};
            --text-color: ${branding.colors?.text || '#1f2937'};
            --primary-font: ${branding.fonts?.primary || 'Inter, sans-serif'};
            --secondary-font: ${branding.fonts?.secondary || 'system-ui, sans-serif'};
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: var(--primary-font);
            background-color: var(--background-color);
            color: var(--text-color);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            text-align: center;
            max-width: 600px;
            width: 100%;
        }
        
        .logo {
            margin-bottom: 2rem;
        }
        
        .logo img {
            max-width: 200px;
            height: auto;
        }
        
        .company-name {
            font-size: 2rem;
            font-weight: bold;
            color: var(--primary-color);
            margin-bottom: 1rem;
        }
        
        .redirect-message {
            font-size: 1.2rem;
            margin-bottom: 2rem;
            color: var(--secondary-color);
        }
        
        .url-info {
            background: rgba(0, 0, 0, 0.05);
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
        }
        
        .original-url {
            word-break: break-all;
            color: var(--primary-color);
            text-decoration: none;
            font-weight: 500;
        }
        
        .continue-button {
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 1rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: background-color 0.2s;
        }
        
        .continue-button:hover {
            opacity: 0.9;
        }
        
        .footer {
            margin-top: 3rem;
            font-size: 0.9rem;
            color: var(--secondary-color);
        }
        
        .social-links {
            margin-top: 1rem;
        }
        
        .social-links a {
            color: var(--secondary-color);
            text-decoration: none;
            margin: 0 10px;
        }
        
        .countdown {
            font-size: 1.1rem;
            color: var(--accent-color);
            margin: 1rem 0;
        }
        
        ${branding.customCSS || ''}
    </style>
</head>
<body>
    <div class="container">
        ${branding.logo ? `
        <div class="logo">
            <img src="${branding.logo}" alt="${branding.companyName || 'Logo'}">
        </div>
        ` : ''}
        
        <h1 class="company-name">${branding.companyName || 'Link Shortener'}</h1>
        
        <p class="redirect-message">You're being redirected to:</p>
        
        <div class="url-info">
            <a href="${urlData.originalUrl}" class="original-url" target="_blank">
                ${urlData.originalUrl}
            </a>
        </div>
        
        <div class="countdown">
            Redirecting in <span id="countdown">5</span> seconds...
        </div>
        
        <a href="${urlData.originalUrl}" class="continue-button">
            Continue Now
        </a>
        
        <div class="footer">
            ${branding.customFooter || ''}
            
            ${!branding.hideDefaultBranding ? `
            <p>Powered by ${branding.companyName || 'Link Shortener'}</p>
            ` : ''}
            
            ${branding.socialLinks && Object.values(branding.socialLinks).some(link => link) ? `
            <div class="social-links">
                ${branding.socialLinks.website ? `<a href="${branding.socialLinks.website}">Website</a>` : ''}
                ${branding.socialLinks.twitter ? `<a href="${branding.socialLinks.twitter}">Twitter</a>` : ''}
                ${branding.socialLinks.linkedin ? `<a href="${branding.socialLinks.linkedin}">LinkedIn</a>` : ''}
                ${branding.socialLinks.facebook ? `<a href="${branding.socialLinks.facebook}">Facebook</a>` : ''}
            </div>
            ` : ''}
        </div>
    </div>
    
    <script>
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(timer);
                window.location.href = '${urlData.originalUrl}';
            }
        }, 1000);
    </script>
</body>
</html>`;

      return template;
    } catch (error) {
      logger.error('Failed to generate branded page:', error);
      throw error;
    }
  }

  // Generate custom domain configuration
  async generateDomainConfig(userId, domain) {
    try {
      const canUseCustomDomain = await subscriptionService.canPerformAction(userId, 'custom_domain');
      
      if (!canUseCustomDomain) {
        throw new Error('Custom domains require a paid subscription');
      }

      const config = {
        domain: domain.toLowerCase(),
        userId,
        status: 'pending',
        dnsRecords: [
          {
            type: 'CNAME',
            name: domain,
            value: process.env.BASE_DOMAIN || 'links.example.com',
            ttl: 300
          },
          {
            type: 'TXT',
            name: `_verification.${domain}`,
            value: `link-shortener-verification=${this.generateVerificationToken(userId, domain)}`,
            ttl: 300
          }
        ],
        sslEnabled: false,
        createdAt: new Date()
      };

      return config;
    } catch (error) {
      logger.error('Failed to generate domain config:', error);
      throw error;
    }
  }

  // Validate URL
  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Validate color (hex, rgb, hsl)
  isValidColor(color) {
    const colorRegex = /^(#([0-9A-Fa-f]{3}){1,2}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\))$/;
    return colorRegex.test(color);
  }

  // Sanitize CSS to prevent XSS
  sanitizeCSS(css) {
    // Remove potentially dangerous CSS
    const dangerous = [
      'javascript:',
      'expression(',
      'behavior:',
      'binding:',
      '@import',
      'url(',
      'document.',
      'window.',
      'eval('
    ];

    let sanitized = css;
    dangerous.forEach(pattern => {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      sanitized = sanitized.replace(regex, '');
    });

    return sanitized;
  }

  // Generate verification token for domain
  generateVerificationToken(userId, domain) {
    const crypto = require('crypto');
    const data = `${userId}:${domain}:${process.env.DOMAIN_VERIFICATION_SECRET || 'default-secret'}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  // Export branding configuration
  async exportBrandingConfig(userId) {
    try {
      const branding = await this.getUserBranding(userId);
      const user = await User.findById(userId).select('username email');

      return {
        exportedAt: new Date().toISOString(),
        user: {
          id: userId,
          username: user.username,
          email: user.email
        },
        branding,
        version: '1.0'
      };
    } catch (error) {
      logger.error('Failed to export branding config:', error);
      throw error;
    }
  }

  // Import branding configuration
  async importBrandingConfig(userId, configData) {
    try {
      if (!configData.branding) {
        throw new Error('Invalid branding configuration');
      }

      const validatedBranding = this.validateBrandingData(configData.branding);
      await this.updateBranding(userId, validatedBranding);

      logger.audit.userAction('Branding configuration imported', {
        userId,
        version: configData.version
      });

      return validatedBranding;
    } catch (error) {
      logger.error('Failed to import branding config:', error);
      throw error;
    }
  }
}

module.exports = new BrandingService();
