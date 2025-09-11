// tests/unit/services/urlService.test.js - Unit tests for URL service
const urlService = require('../../../src/services/urlService');
const Url = require('../../../src/models/Url');
const Analytics = require('../../../src/models/Analytics');
const cacheService = require('../../../src/services/cacheService');

// Mock dependencies
jest.mock('../../../src/services/cacheService');
jest.mock('../../../src/models/Url');
jest.mock('../../../src/models/Analytics');

describe('UrlService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createShortUrl', () => {
    it('should create a new short URL successfully', async () => {
      const userId = 'user123';
      const urlData = {
        originalUrl: 'https://example.com',
        title: 'Test URL',
        description: 'Test description'
      };

      const mockUrl = {
        _id: 'url123',
        originalUrl: urlData.originalUrl,
        shortCode: 'abc123',
        userId,
        save: jest.fn().mockResolvedValue(true)
      };

      Url.findOne.mockResolvedValue(null); // No existing URL
      Url.mockImplementation(() => mockUrl);
      cacheService.cacheUrl.mockResolvedValue(true);

      const result = await urlService.createShortUrl(urlData, userId);

      expect(result).toBeDefined();
      expect(Url.findOne).toHaveBeenCalledWith({
        originalUrl: urlData.originalUrl,
        userId,
        status: 'active'
      });
      expect(cacheService.cacheUrl).toHaveBeenCalled();
    });

    it('should return existing URL if duplicate found', async () => {
      const userId = 'user123';
      const urlData = {
        originalUrl: 'https://example.com'
      };

      const existingUrl = {
        _id: 'url123',
        originalUrl: urlData.originalUrl,
        shortCode: 'existing123',
        userId
      };

      Url.findOne.mockResolvedValue(existingUrl);
      cacheService.cacheUrl.mockResolvedValue(true);

      const result = await urlService.createShortUrl(urlData, userId);

      expect(result).toBe(existingUrl);
      expect(cacheService.cacheUrl).toHaveBeenCalledWith('existing123', existingUrl);
    });

    it('should throw error for invalid custom alias', async () => {
      const userId = 'user123';
      const urlData = {
        originalUrl: 'https://example.com',
        customAlias: 'taken'
      };

      // Mock alias already exists
      Url.findOne.mockResolvedValueOnce(null); // No existing URL
      Url.findOne.mockResolvedValueOnce({ shortCode: 'taken' }); // Alias exists

      await expect(urlService.createShortUrl(urlData, userId))
        .rejects.toThrow('Custom alias is already taken');
    });
  });

  describe('getUrlByShortCode', () => {
    it('should return cached URL if available', async () => {
      const shortCode = 'abc123';
      const cachedUrl = {
        _id: 'url123',
        shortCode,
        originalUrl: 'https://example.com',
        status: 'active'
      };

      cacheService.getCachedUrl.mockResolvedValue(cachedUrl);

      const result = await urlService.getUrlByShortCode(shortCode);

      expect(result).toBe(cachedUrl);
      expect(cacheService.getCachedUrl).toHaveBeenCalledWith(shortCode);
      expect(Url.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      const shortCode = 'abc123';
      const dbUrl = {
        _id: 'url123',
        shortCode,
        originalUrl: 'https://example.com',
        status: 'active',
        populate: jest.fn().mockReturnThis()
      };

      cacheService.getCachedUrl.mockResolvedValue(null);
      Url.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(dbUrl)
      });
      cacheService.cacheUrl.mockResolvedValue(true);

      const result = await urlService.getUrlByShortCode(shortCode);

      expect(result).toBe(dbUrl);
      expect(Url.findOne).toHaveBeenCalledWith({
        $or: [{ shortId: shortCode }, { shortCode }],
        status: 'active'
      });
      expect(cacheService.cacheUrl).toHaveBeenCalledWith(shortCode, dbUrl);
    });

    it('should throw NotFoundError if URL not found', async () => {
      const shortCode = 'notfound';

      cacheService.getCachedUrl.mockResolvedValue(null);
      Url.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await expect(urlService.getUrlByShortCode(shortCode))
        .rejects.toThrow('URL not found');
    });
  });

  describe('updateUrl', () => {
    it('should update URL successfully', async () => {
      const shortCode = 'abc123';
      const userId = 'user123';
      const updateData = {
        title: 'Updated Title',
        description: 'Updated Description'
      };

      const mockUrl = {
        _id: 'url123',
        shortCode,
        userId,
        title: 'Old Title',
        description: 'Old Description',
        save: jest.fn().mockResolvedValue(true)
      };

      Url.findOne.mockResolvedValue(mockUrl);
      cacheService.cacheUrl.mockResolvedValue(true);
      cacheService.invalidateAnalytics.mockResolvedValue(true);

      const result = await urlService.updateUrl(shortCode, updateData, userId);

      expect(mockUrl.title).toBe(updateData.title);
      expect(mockUrl.description).toBe(updateData.description);
      expect(mockUrl.save).toHaveBeenCalled();
      expect(cacheService.cacheUrl).toHaveBeenCalled();
      expect(cacheService.invalidateAnalytics).toHaveBeenCalledWith(shortCode);
    });

    it('should throw NotFoundError if URL not found', async () => {
      const shortCode = 'notfound';
      const userId = 'user123';
      const updateData = { title: 'New Title' };

      Url.findOne.mockResolvedValue(null);

      await expect(urlService.updateUrl(shortCode, updateData, userId))
        .rejects.toThrow('URL not found');
    });
  });

  describe('deleteUrl', () => {
    it('should soft delete URL successfully', async () => {
      const shortCode = 'abc123';
      const userId = 'user123';

      const mockUrl = {
        _id: 'url123',
        shortCode,
        userId,
        status: 'active',
        isActive: true,
        save: jest.fn().mockResolvedValue(true)
      };

      Url.findOne.mockResolvedValue(mockUrl);
      cacheService.invalidateUrl.mockResolvedValue(true);
      cacheService.invalidateAnalytics.mockResolvedValue(true);

      const result = await urlService.deleteUrl(shortCode, userId);

      expect(mockUrl.status).toBe('deleted');
      expect(mockUrl.isActive).toBe(false);
      expect(mockUrl.save).toHaveBeenCalled();
      expect(cacheService.invalidateUrl).toHaveBeenCalledWith(shortCode);
      expect(result.message).toBe('URL deleted successfully');
    });
  });

  describe('trackClick', () => {
    it('should track click and update URL stats', async () => {
      const shortCode = 'abc123';
      const clickData = {
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        referrer: 'https://google.com'
      };

      const mockUrl = {
        _id: 'url123',
        shortCode,
        clicks: 5,
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock getUrlByShortCode
      jest.spyOn(urlService, 'getUrlByShortCode').mockResolvedValue(mockUrl);
      jest.spyOn(urlService, 'trackAnalytics').mockResolvedValue(true);
      cacheService.cacheUrl.mockResolvedValue(true);

      const result = await urlService.trackClick(shortCode, clickData);

      expect(result.clicks).toBe(6);
      expect(mockUrl.save).toHaveBeenCalled();
      expect(cacheService.cacheUrl).toHaveBeenCalled();
    });
  });

  describe('generateUniqueShortCode', () => {
    it('should generate unique short code', async () => {
      // Mock checkAliasAvailability to return true (available)
      jest.spyOn(urlService, 'checkAliasAvailability').mockResolvedValue(true);

      const shortCode = await urlService.generateUniqueShortCode();

      expect(shortCode).toBeDefined();
      expect(typeof shortCode).toBe('string');
      expect(shortCode.length).toBe(8);
    });

    it('should retry if short code is not unique', async () => {
      // Mock checkAliasAvailability to return false first, then true
      jest.spyOn(urlService, 'checkAliasAvailability')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const shortCode = await urlService.generateUniqueShortCode();

      expect(shortCode).toBeDefined();
      expect(urlService.checkAliasAvailability).toHaveBeenCalledTimes(2);
    });

    it('should throw error if unable to generate unique code', async () => {
      // Mock checkAliasAvailability to always return false
      jest.spyOn(urlService, 'checkAliasAvailability').mockResolvedValue(false);

      await expect(urlService.generateUniqueShortCode())
        .rejects.toThrow('Unable to generate unique short code');
    });
  });

  describe('checkAliasAvailability', () => {
    it('should return true if alias is available', async () => {
      const alias = 'available';

      Url.findOne.mockResolvedValue(null);

      const result = await urlService.checkAliasAvailability(alias);

      expect(result).toBe(true);
      expect(Url.findOne).toHaveBeenCalledWith({
        $or: [
          { shortId: alias },
          { shortCode: alias },
          { customAlias: alias }
        ]
      });
    });

    it('should return false if alias is taken', async () => {
      const alias = 'taken';

      Url.findOne.mockResolvedValue({ shortCode: alias });

      const result = await urlService.checkAliasAvailability(alias);

      expect(result).toBe(false);
    });
  });

  describe('bulkCreateUrls', () => {
    it('should create multiple URLs successfully', async () => {
      const userId = 'user123';
      const urlsData = [
        { originalUrl: 'https://example1.com' },
        { originalUrl: 'https://example2.com' }
      ];

      // Mock createShortUrl to succeed for both URLs
      jest.spyOn(urlService, 'createShortUrl')
        .mockResolvedValueOnce({ shortCode: 'abc123' })
        .mockResolvedValueOnce({ shortCode: 'def456' });

      const result = await urlService.createBulkUrls(urlsData, userId);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.total).toBe(2);
    });

    it('should handle partial failures in bulk creation', async () => {
      const userId = 'user123';
      const urlsData = [
        { originalUrl: 'https://example1.com' },
        { originalUrl: 'invalid-url' }
      ];

      // Mock createShortUrl to succeed for first, fail for second
      jest.spyOn(urlService, 'createShortUrl')
        .mockResolvedValueOnce({ shortCode: 'abc123' })
        .mockRejectedValueOnce(new Error('Invalid URL'));

      const result = await urlService.createBulkUrls(urlsData, userId);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.failed[0].error).toBe('Invalid URL');
    });
  });
});
