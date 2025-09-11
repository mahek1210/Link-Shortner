// src/services/contentModerationService.js - Content moderation and safety service
const Url = require('../models/Url');
const User = require('../models/User');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class ContentModerationService {
  constructor() {
    // Initialize blocked domains and patterns
    this.blockedDomains = new Set([
      'malware.com',
      'phishing.net',
      'spam.org',
      // Add more blocked domains
    ]);

    this.suspiciousPatterns = [
      /bit\.ly\/[a-zA-Z0-9]{6,}/i, // Nested shorteners
      /tinyurl\.com\/[a-zA-Z0-9]+/i,
      /t\.co\/[a-zA-Z0-9]+/i,
      /goo\.gl\/[a-zA-Z0-9]+/i,
      /ow\.ly\/[a-zA-Z0-9]+/i
    ];

    this.maliciousKeywords = [
      'phishing', 'malware', 'virus', 'trojan', 'ransomware',
      'scam', 'fraud', 'fake', 'counterfeit', 'illegal',
      'adult', 'gambling', 'casino', 'porn', 'xxx'
    ];

    this.loadModerationRules();
  }

  // Load moderation rules from configuration
  async loadModerationRules() {
    try {
      // Load additional blocked domains from environment or database
      const envBlockedDomains = process.env.BLOCKED_DOMAINS?.split(',') || [];
      envBlockedDomains.forEach(domain => {
        this.blockedDomains.add(domain.trim().toLowerCase());
      });

      logger.info(`Content moderation initialized with ${this.blockedDomains.size} blocked domains`);
    } catch (error) {
      logger.error('Failed to load moderation rules:', error);
    }
  }

  // Moderate URL before shortening
  async moderateUrl(originalUrl, userId = null, additionalData = {}) {
    try {
      const moderationResult = {
        url: originalUrl,
        userId,
        timestamp: new Date(),
        status: 'approved',
        flags: [],
        riskScore: 0,
        actions: []
      };

      // Parse URL
      let parsedUrl;
      try {
        parsedUrl = new URL(originalUrl);
      } catch (error) {
        moderationResult.status = 'rejected';
        moderationResult.flags.push('invalid_url');
        moderationResult.riskScore = 100;
        return moderationResult;
      }

      // Check blocked domains
      const domainCheck = await this.checkBlockedDomains(parsedUrl.hostname);
      if (domainCheck.blocked) {
        moderationResult.status = 'rejected';
        moderationResult.flags.push('blocked_domain');
        moderationResult.riskScore += 50;
        moderationResult.actions.push('domain_blocked');
      }

      // Check for suspicious patterns
      const patternCheck = this.checkSuspiciousPatterns(originalUrl);
      if (patternCheck.suspicious) {
        moderationResult.flags.push('suspicious_pattern');
        moderationResult.riskScore += 30;
        moderationResult.actions.push('pattern_flagged');
      }

      // Check for malicious keywords
      const keywordCheck = this.checkMaliciousKeywords(originalUrl, additionalData);
      if (keywordCheck.malicious) {
        moderationResult.flags.push('malicious_keywords');
        moderationResult.riskScore += 25;
        moderationResult.actions.push('keyword_flagged');
      }

      // Check URL reputation
      const reputationCheck = await this.checkUrlReputation(originalUrl);
      if (reputationCheck.risky) {
        moderationResult.flags.push('poor_reputation');
        moderationResult.riskScore += reputationCheck.riskScore;
        moderationResult.actions.push('reputation_flagged');
      }

      // Check for nested shorteners
      const nestedCheck = this.checkNestedShorteners(originalUrl);
      if (nestedCheck.nested) {
        moderationResult.flags.push('nested_shortener');
        moderationResult.riskScore += 20;
        moderationResult.actions.push('nested_shortener_detected');
      }

      // User-specific checks
      if (userId) {
        const userCheck = await this.checkUserHistory(userId);
        if (userCheck.suspicious) {
          moderationResult.flags.push('suspicious_user');
          moderationResult.riskScore += userCheck.riskScore;
          moderationResult.actions.push('user_flagged');
        }
      }

      // Determine final status based on risk score
      if (moderationResult.riskScore >= 70) {
        moderationResult.status = 'rejected';
      } else if (moderationResult.riskScore >= 40) {
        moderationResult.status = 'review_required';
      } else if (moderationResult.riskScore >= 20) {
        moderationResult.status = 'flagged';
      }

      // Log moderation result
      if (moderationResult.status !== 'approved') {
        logger.security.suspiciousActivity('URL moderation flag', {
          url: originalUrl,
          userId,
          status: moderationResult.status,
          flags: moderationResult.flags,
          riskScore: moderationResult.riskScore
        });
      }

      // Store moderation result
      await this.storeModerationResult(moderationResult);

      return moderationResult;

    } catch (error) {
      logger.error('Failed to moderate URL:', error);
      return {
        url: originalUrl,
        status: 'error',
        error: error.message,
        riskScore: 100
      };
    }
  }

  // Check if domain is blocked
  async checkBlockedDomains(hostname) {
    const domain = hostname.toLowerCase();
    
    // Check exact match
    if (this.blockedDomains.has(domain)) {
      return { blocked: true, reason: 'exact_match' };
    }

    // Check subdomain matches
    const domainParts = domain.split('.');
    for (let i = 1; i < domainParts.length; i++) {
      const parentDomain = domainParts.slice(i).join('.');
      if (this.blockedDomains.has(parentDomain)) {
        return { blocked: true, reason: 'subdomain_match' };
      }
    }

    // Check against dynamic blocklist (could be from external API)
    const dynamicCheck = await this.checkDynamicBlocklist(domain);
    if (dynamicCheck.blocked) {
      return { blocked: true, reason: 'dynamic_blocklist' };
    }

    return { blocked: false };
  }

  // Check for suspicious URL patterns
  checkSuspiciousPatterns(url) {
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(url)) {
        return { suspicious: true, pattern: pattern.toString() };
      }
    }

    // Check for suspicious URL characteristics
    if (url.length > 2000) {
      return { suspicious: true, reason: 'url_too_long' };
    }

    if ((url.match(/\//g) || []).length > 10) {
      return { suspicious: true, reason: 'too_many_slashes' };
    }

    if (url.includes('..') || url.includes('//')) {
      return { suspicious: true, reason: 'path_traversal' };
    }

    return { suspicious: false };
  }

  // Check for malicious keywords
  checkMaliciousKeywords(url, additionalData = {}) {
    const textToCheck = [
      url.toLowerCase(),
      additionalData.title?.toLowerCase() || '',
      additionalData.description?.toLowerCase() || ''
    ].join(' ');

    const foundKeywords = [];
    for (const keyword of this.maliciousKeywords) {
      if (textToCheck.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    }

    return {
      malicious: foundKeywords.length > 0,
      keywords: foundKeywords
    };
  }

  // Check URL reputation (mock implementation)
  async checkUrlReputation(url) {
    try {
      // This would integrate with reputation services like:
      // - Google Safe Browsing API
      // - VirusTotal API
      // - URLVoid API
      // - PhishTank API

      // Mock implementation
      const cacheKey = `reputation:${Buffer.from(url).toString('base64')}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Simulate reputation check
      const result = {
        risky: false,
        riskScore: 0,
        sources: []
      };

      // Cache result for 1 hour
      await cacheService.set(cacheKey, result, 3600);
      
      return result;

    } catch (error) {
      logger.error('Failed to check URL reputation:', error);
      return { risky: false, riskScore: 0, error: error.message };
    }
  }

  // Check for nested shorteners
  checkNestedShorteners(url) {
    const shortenerDomains = [
      'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
      'short.link', 'tiny.cc', 'is.gd', 'buff.ly', 'rebrand.ly'
    ];

    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      for (const domain of shortenerDomains) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return { nested: true, domain };
        }
      }

      return { nested: false };
    } catch (error) {
      return { nested: false };
    }
  }

  // Check user's moderation history
  async checkUserHistory(userId) {
    try {
      const cacheKey = `user_moderation:${userId}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get user's recent URLs and their moderation status
      const recentUrls = await Url.find({
        userId,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      }).select('status moderationFlags').lean();

      const flaggedUrls = recentUrls.filter(url => 
        url.moderationFlags && url.moderationFlags.length > 0
      );

      const suspiciousRatio = recentUrls.length > 0 ? flaggedUrls.length / recentUrls.length : 0;

      const result = {
        suspicious: suspiciousRatio > 0.3, // More than 30% flagged URLs
        riskScore: Math.min(suspiciousRatio * 50, 30),
        flaggedUrls: flaggedUrls.length,
        totalUrls: recentUrls.length
      };

      // Cache for 5 minutes
      await cacheService.set(cacheKey, result, 300);
      
      return result;

    } catch (error) {
      logger.error('Failed to check user history:', error);
      return { suspicious: false, riskScore: 0 };
    }
  }

  // Check dynamic blocklist (external API)
  async checkDynamicBlocklist(domain) {
    try {
      // This would check against external threat intelligence APIs
      // For now, return false
      return { blocked: false };
    } catch (error) {
      logger.error('Failed to check dynamic blocklist:', error);
      return { blocked: false };
    }
  }

  // Store moderation result
  async storeModerationResult(result) {
    try {
      // Store in cache for quick access
      const cacheKey = `moderation:${Buffer.from(result.url).toString('base64')}`;
      await cacheService.set(cacheKey, result, 3600); // Cache for 1 hour

      // Store in database if needed (would require ModerationLog model)
      if (result.status !== 'approved') {
        logger.audit.systemEvent('Content moderation result', result);
      }

    } catch (error) {
      logger.error('Failed to store moderation result:', error);
    }
  }

  // Report malicious URL
  async reportUrl(shortCode, reportData, reporterId = null) {
    try {
      const url = await Url.findOne({ shortCode });
      if (!url) {
        throw new Error('URL not found');
      }

      const report = {
        urlId: url._id,
        shortCode,
        originalUrl: url.originalUrl,
        reporterId,
        reportType: reportData.type || 'malicious',
        description: reportData.description,
        category: reportData.category,
        timestamp: new Date(),
        status: 'pending',
        ipHash: reportData.ipHash
      };

      // Increment report count for this URL
      await Url.findByIdAndUpdate(url._id, {
        $inc: { reportCount: 1 },
        $push: { reports: report }
      });

      // Auto-disable URL if it has too many reports
      if ((url.reportCount || 0) >= 5) {
        await this.disableUrl(shortCode, 'multiple_reports');
      }

      logger.security.suspiciousActivity('URL reported', report);

      return {
        success: true,
        reportId: `report_${Date.now()}_${shortCode}`,
        status: 'received'
      };

    } catch (error) {
      logger.error('Failed to report URL:', error);
      throw error;
    }
  }

  // Disable malicious URL
  async disableUrl(shortCode, reason) {
    try {
      const url = await Url.findOneAndUpdate(
        { shortCode },
        {
          $set: {
            status: 'disabled',
            disabledReason: reason,
            disabledAt: new Date()
          }
        },
        { new: true }
      );

      if (url) {
        // Clear cache
        await cacheService.del(`url:${shortCode}`);
        
        logger.audit.systemEvent('URL disabled', {
          shortCode,
          originalUrl: url.originalUrl,
          reason,
          userId: url.userId
        });
      }

      return url;

    } catch (error) {
      logger.error('Failed to disable URL:', error);
      throw error;
    }
  }

  // Get moderation statistics
  async getModerationStats() {
    try {
      const [
        totalUrls,
        flaggedUrls,
        disabledUrls,
        recentReports
      ] = await Promise.all([
        Url.countDocuments(),
        Url.countDocuments({ moderationFlags: { $exists: true, $ne: [] } }),
        Url.countDocuments({ status: 'disabled' }),
        Url.countDocuments({
          reportCount: { $gte: 1 },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        totalUrls,
        flaggedUrls,
        disabledUrls,
        recentReports,
        flaggedPercentage: totalUrls > 0 ? (flaggedUrls / totalUrls * 100).toFixed(2) : 0,
        disabledPercentage: totalUrls > 0 ? (disabledUrls / totalUrls * 100).toFixed(2) : 0
      };

    } catch (error) {
      logger.error('Failed to get moderation stats:', error);
      throw error;
    }
  }

  // Bulk moderate URLs
  async bulkModerateUrls(urlIds, action, reason) {
    try {
      const results = [];

      for (const urlId of urlIds) {
        try {
          const url = await Url.findById(urlId);
          if (!url) {
            results.push({ urlId, success: false, error: 'URL not found' });
            continue;
          }

          switch (action) {
            case 'disable':
              await this.disableUrl(url.shortCode, reason);
              break;
            case 'enable':
              await Url.findByIdAndUpdate(urlId, {
                $set: { status: 'active' },
                $unset: { disabledReason: 1, disabledAt: 1 }
              });
              break;
            case 'flag':
              await Url.findByIdAndUpdate(urlId, {
                $addToSet: { moderationFlags: reason }
              });
              break;
            default:
              throw new Error('Invalid action');
          }

          results.push({ urlId, success: true, action });

        } catch (error) {
          results.push({ urlId, success: false, error: error.message });
        }
      }

      logger.audit.adminAction('Bulk moderation completed', {
        action,
        reason,
        urlCount: urlIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

      return results;

    } catch (error) {
      logger.error('Failed to bulk moderate URLs:', error);
      throw error;
    }
  }
}

module.exports = new ContentModerationService();
