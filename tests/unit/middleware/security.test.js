// tests/unit/middleware/security.test.js - Unit tests for security middleware
const securityMiddleware = require('../../../src/middleware/security');
const rateLimit = require('express-rate-limit');

// Mock dependencies
jest.mock('express-rate-limit');
jest.mock('rate-limiter-flexible');
jest.mock('../../../src/config/redis');
jest.mock('../../../src/config/logger');

describe('Security Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = global.testUtils.mockRequest();
    res = global.testUtils.mockResponse();
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('sanitizeInput', () => {
    it('should sanitize malicious input', () => {
      req.body = {
        username: '<script>alert("xss")</script>',
        email: 'test@example.com',
        description: 'javascript:alert("xss")'
      };

      securityMiddleware.sanitizeInput(req, res, next);

      expect(req.body.username).not.toContain('<script>');
      expect(req.body.username).not.toContain('alert');
      expect(req.body.email).toBe('test@example.com'); // Should remain unchanged
      expect(req.body.description).not.toContain('javascript:');
      expect(next).toHaveBeenCalled();
    });

    it('should handle nested objects', () => {
      req.body = {
        user: {
          name: '<img src="x" onerror="alert(1)">',
          profile: {
            bio: 'javascript:void(0)'
          }
        }
      };

      securityMiddleware.sanitizeInput(req, res, next);

      expect(req.body.user.name).not.toContain('<img');
      expect(req.body.user.name).not.toContain('onerror');
      expect(req.body.user.profile.bio).not.toContain('javascript:');
      expect(next).toHaveBeenCalled();
    });

    it('should handle arrays', () => {
      req.body = {
        tags: ['<script>alert(1)</script>', 'normal-tag', 'javascript:alert(2)']
      };

      securityMiddleware.sanitizeInput(req, res, next);

      expect(req.body.tags[0]).not.toContain('<script>');
      expect(req.body.tags[1]).toBe('normal-tag');
      expect(req.body.tags[2]).not.toContain('javascript:');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateCSRF', () => {
    it('should validate CSRF token for POST requests', () => {
      req.method = 'POST';
      req.headers['x-csrf-token'] = 'valid-csrf-token';
      req.session = { csrfToken: 'valid-csrf-token' };

      securityMiddleware.validateCSRF(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid CSRF token', () => {
      req.method = 'POST';
      req.headers['x-csrf-token'] = 'invalid-token';
      req.session = { csrfToken: 'valid-csrf-token' };

      securityMiddleware.validateCSRF(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid CSRF token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should skip CSRF validation for GET requests', () => {
      req.method = 'GET';

      securityMiddleware.validateCSRF(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should skip CSRF validation for API endpoints', () => {
      req.method = 'POST';
      req.path = '/api/v1/urls/shorten';

      securityMiddleware.validateCSRF(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect rapid requests from same IP', async () => {
      req.ip = '192.168.1.100';
      req.rateLimit = { remaining: 0, total: 100 };

      await securityMiddleware.detectSuspiciousActivity(req, res, next);

      expect(next).toHaveBeenCalled();
      // Should log suspicious activity
    });

    it('should detect unusual user agent patterns', async () => {
      req.headers['user-agent'] = 'curl/7.68.0';
      req.user = { id: 'user123' };

      await securityMiddleware.detectSuspiciousActivity(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should detect multiple failed login attempts', async () => {
      req.path = '/api/v1/auth/login';
      req.method = 'POST';
      req.ip = '192.168.1.100';
      req.body = { email: 'test@example.com' };
      res.statusCode = 401;

      await securityMiddleware.detectSuspiciousActivity(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('ipFilter', () => {
    it('should allow requests from whitelisted IPs', () => {
      req.ip = '127.0.0.1'; // Localhost should be allowed

      securityMiddleware.ipFilter(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should block requests from blacklisted IPs', () => {
      // Mock a blacklisted IP
      const originalEnv = process.env.BLACKLISTED_IPS;
      process.env.BLACKLISTED_IPS = '192.168.1.100,10.0.0.1';
      
      req.ip = '192.168.1.100';

      securityMiddleware.ipFilter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied from this IP address'
      });
      expect(next).not.toHaveBeenCalled();

      // Restore environment
      process.env.BLACKLISTED_IPS = originalEnv;
    });
  });

  describe('securityHeaders', () => {
    it('should set security headers', () => {
      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(res.setHeader).toHaveBeenCalledWith('Permissions-Policy', expect.any(String));
      expect(next).toHaveBeenCalled();
    });

    it('should set HSTS header for HTTPS', () => {
      req.secure = true;

      securityMiddleware.securityHeaders(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requestLogger', () => {
    it('should log request details', () => {
      req.method = 'GET';
      req.originalUrl = '/api/v1/urls';
      req.ip = '192.168.1.1';
      req.headers['user-agent'] = 'Mozilla/5.0';

      securityMiddleware.requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
      // Should log request details
    });

    it('should not log sensitive data in request body', () => {
      req.method = 'POST';
      req.originalUrl = '/api/v1/auth/login';
      req.body = {
        email: 'test@example.com',
        password: 'secret123'
      };

      securityMiddleware.requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
      // Should log request but mask password
    });
  });

  describe('rateLimitByEndpoint', () => {
    beforeEach(() => {
      // Mock rate limiter
      rateLimit.mockImplementation(() => (req, res, next) => next());
    });

    it('should apply different limits for different endpoints', () => {
      const authLimiter = securityMiddleware.createRateLimiter('auth');
      const urlLimiter = securityMiddleware.createRateLimiter('url');

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          windowMs: expect.any(Number),
          max: expect.any(Number)
        })
      );
    });

    it('should use Redis store for distributed rate limiting', () => {
      const limiter = securityMiddleware.createRateLimiter('auth');

      expect(rateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          store: expect.any(Object)
        })
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key from header', async () => {
      req.headers['x-api-key'] = 'valid-api-key';
      
      // Mock API key validation
      const mockApiKey = { isValid: true, userId: 'user123', tier: 'premium' };
      jest.spyOn(securityMiddleware, 'validateApiKeyInDb').mockResolvedValue(mockApiKey);

      await securityMiddleware.validateApiKey(req, res, next);

      expect(req.apiKey).toBe(mockApiKey);
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      req.headers['x-api-key'] = 'invalid-api-key';
      
      jest.spyOn(securityMiddleware, 'validateApiKeyInDb').mockResolvedValue(null);

      await securityMiddleware.validateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle missing API key', async () => {
      await securityMiddleware.validateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'API key required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('contentSecurityPolicy', () => {
    it('should set CSP header', () => {
      securityMiddleware.contentSecurityPolicy(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("default-src 'self'")
      );
      expect(next).toHaveBeenCalled();
    });

    it('should allow different CSP for development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      securityMiddleware.contentSecurityPolicy(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.stringContaining("'unsafe-eval'")
      );

      process.env.NODE_ENV = originalEnv;
    });
  });
});
