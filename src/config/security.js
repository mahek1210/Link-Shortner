// src/config/security.js - Comprehensive security configuration
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

class SecurityManager {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    this.encryptionKey = process.env.ENCRYPTION_KEY;
    this.ipSalt = process.env.IP_SALT || 'default-salt';
    
    // Validate required secrets
    this.validateSecrets();
  }

  validateSecrets() {
    const requiredSecrets = [
      { name: 'JWT_SECRET', value: this.jwtSecret, minLength: 64 },
      { name: 'JWT_REFRESH_SECRET', value: this.jwtRefreshSecret, minLength: 64 },
      { name: 'ENCRYPTION_KEY', value: this.encryptionKey, minLength: 32 }
    ];

    for (const secret of requiredSecrets) {
      if (!secret.value) {
        throw new Error(`${secret.name} is required but not set`);
      }
      if (secret.value.length < secret.minLength) {
        throw new Error(`${secret.name} must be at least ${secret.minLength} characters long`);
      }
    }

    logger.info('Security configuration validated successfully');
  }

  // JWT Token Management
  generateTokens(payload) {
    try {
      const accessToken = jwt.sign(
        payload,
        this.jwtSecret,
        { 
          expiresIn: process.env.JWT_EXPIRES_IN || '15m',
          issuer: 'link-shortener',
          audience: 'link-shortener-users'
        }
      );

      const refreshToken = jwt.sign(
        { userId: payload.userId, tokenVersion: payload.tokenVersion || 0 },
        this.jwtRefreshSecret,
        { 
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: 'link-shortener',
          audience: 'link-shortener-users'
        }
      );

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Token generation error:', { error: error.message });
      throw new Error('Failed to generate tokens');
    }
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'link-shortener',
        audience: 'link-shortener-users'
      });
    } catch (error) {
      logger.security.suspiciousActivity('Invalid access token used', {
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      throw error;
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.jwtRefreshSecret, {
        issuer: 'link-shortener',
        audience: 'link-shortener-users'
      });
    } catch (error) {
      logger.security.suspiciousActivity('Invalid refresh token used', {
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      throw error;
    }
  }

  // Password Security
  async hashPassword(password) {
    try {
      const saltRounds = 12;
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.error('Password hashing error:', { error: error.message });
      throw new Error('Failed to hash password');
    }
  }

  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification error:', { error: error.message });
      return false;
    }
  }

  // Data Encryption/Decryption
  encrypt(text) {
    try {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      logger.error('Encryption error:', { error: error.message });
      throw new Error('Failed to encrypt data');
    }
  }

  decrypt(encryptedData) {
    try {
      const algorithm = 'aes-256-gcm';
      const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
      
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', { error: error.message });
      throw new Error('Failed to decrypt data');
    }
  }

  // IP Address Hashing for Privacy
  hashIP(ip) {
    try {
      return crypto
        .createHash('sha256')
        .update(ip + this.ipSalt)
        .digest('hex');
    } catch (error) {
      logger.error('IP hashing error:', { error: error.message });
      return 'unknown';
    }
  }

  // API Key Generation and Validation
  generateApiKey() {
    try {
      const key = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(key).digest('hex');
      
      return {
        key: `ls_${key}`, // Prefix for identification
        hash
      };
    } catch (error) {
      logger.error('API key generation error:', { error: error.message });
      throw new Error('Failed to generate API key');
    }
  }

  validateApiKey(providedKey, storedHash) {
    try {
      if (!providedKey || !providedKey.startsWith('ls_')) {
        return false;
      }
      
      const keyWithoutPrefix = providedKey.substring(3);
      const hash = crypto.createHash('sha256').update(keyWithoutPrefix).digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(storedHash, 'hex')
      );
    } catch (error) {
      logger.error('API key validation error:', { error: error.message });
      return false;
    }
  }

  // CSRF Token Generation
  generateCSRFToken() {
    try {
      return crypto.randomBytes(32).toString('hex');
    } catch (error) {
      logger.error('CSRF token generation error:', { error: error.message });
      throw new Error('Failed to generate CSRF token');
    }
  }

  // Secure Random String Generation
  generateSecureRandom(length = 32) {
    try {
      return crypto.randomBytes(length).toString('hex');
    } catch (error) {
      logger.error('Secure random generation error:', { error: error.message });
      throw new Error('Failed to generate secure random string');
    }
  }

  // Input Sanitization
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove potential NoSQL injection patterns
    const sanitized = input
      .replace(/\$where/gi, '')
      .replace(/\$ne/gi, '')
      .replace(/\$gt/gi, '')
      .replace(/\$lt/gi, '')
      .replace(/\$gte/gi, '')
      .replace(/\$lte/gi, '')
      .replace(/\$in/gi, '')
      .replace(/\$nin/gi, '')
      .replace(/\$regex/gi, '')
      .replace(/\$exists/gi, '')
      .replace(/\$type/gi, '')
      .replace(/\$mod/gi, '')
      .replace(/\$all/gi, '')
      .replace(/\$size/gi, '')
      .replace(/\$elemMatch/gi, '')
      .replace(/\$slice/gi, '');

    return sanitized.trim();
  }

  // Rate Limiting Key Generation
  generateRateLimitKey(identifier, endpoint) {
    return `rate_limit:${this.hashIP(identifier)}:${endpoint}`;
  }

  // Session Token Generation
  generateSessionToken() {
    try {
      return crypto.randomBytes(64).toString('hex');
    } catch (error) {
      logger.error('Session token generation error:', { error: error.message });
      throw new Error('Failed to generate session token');
    }
  }

  // Webhook Signature Verification
  verifyWebhookSignature(payload, signature, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Webhook signature verification error:', { error: error.message });
      return false;
    }
  }

  // Password Strength Validation
  validatePasswordStrength(password) {
    const requirements = {
      minLength: 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      notCommon: !this.isCommonPassword(password)
    };

    const isValid = password.length >= requirements.minLength &&
                   requirements.hasUpperCase &&
                   requirements.hasLowerCase &&
                   requirements.hasNumbers &&
                   requirements.hasSpecialChar &&
                   requirements.notCommon;

    return {
      isValid,
      requirements,
      score: this.calculatePasswordScore(password)
    };
  }

  isCommonPassword(password) {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];
    return commonPasswords.includes(password.toLowerCase());
  }

  calculatePasswordScore(password) {
    let score = 0;
    
    // Length bonus
    score += Math.min(password.length * 2, 20);
    
    // Character variety bonus
    if (/[a-z]/.test(password)) score += 5;
    if (/[A-Z]/.test(password)) score += 5;
    if (/\d/.test(password)) score += 5;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 10;
    
    // Pattern penalties
    if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
    if (/123|abc|qwe/i.test(password)) score -= 10; // Sequential patterns
    
    return Math.max(0, Math.min(100, score));
  }

  // Security Headers Configuration
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'Content-Security-Policy': this.getCSPHeader(),
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
  }

  getCSPHeader() {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.github.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join('; ');
  }
}

// Create singleton instance
const securityManager = new SecurityManager();

module.exports = securityManager;
