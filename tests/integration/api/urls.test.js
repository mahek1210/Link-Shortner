// tests/integration/api/urls.test.js - Integration tests for URL API
const request = require('supertest');
const app = require('../../../src/app');
const User = require('../../../src/models/User');
const Url = require('../../../src/models/Url');

describe('URL API Integration Tests', () => {
  let server;
  let testUser;
  let authToken;

  beforeAll(async () => {
    const Application = require('../../../src/app');
    const appInstance = new Application();
    server = appInstance.getExpressApp();
  });

  beforeEach(async () => {
    testUser = await global.testUtils.createTestUser();
    authToken = global.testUtils.generateTestToken(testUser._id);
  });

  describe('POST /api/v1/urls/shorten', () => {
    it('should create short URL successfully', async () => {
      const urlData = {
        originalUrl: 'https://example.com',
        title: 'Test URL',
        description: 'Test description'
      };

      const response = await request(server)
        .post('/api/v1/urls/shorten')
        .set('Authorization', `Bearer ${authToken}`)
        .send(urlData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('shortCode');
      expect(response.body.data).toHaveProperty('shortUrl');
      expect(response.body.data).toHaveProperty('originalUrl', urlData.originalUrl);
      expect(response.body.data).toHaveProperty('title', urlData.title);
      expect(response.body.data).toHaveProperty('description', urlData.description);

      // Verify URL was created in database
      const url = await Url.findOne({ originalUrl: urlData.originalUrl });
      expect(url).toBeTruthy();
      expect(url.userId.toString()).toBe(testUser._id.toString());
    });

    it('should create short URL with custom alias', async () => {
      const urlData = {
        originalUrl: 'https://example.com',
        customAlias: 'myalias'
      };

      const response = await request(server)
        .post('/api/v1/urls/shorten')
        .set('Authorization', `Bearer ${authToken}`)
        .send(urlData)
        .expect(201);

      expect(response.body.data).toHaveProperty('shortCode', 'myalias');
      expect(response.body.data.shortUrl).toContain('myalias');
    });

    it('should reject invalid URL', async () => {
      const urlData = {
        originalUrl: 'not-a-valid-url'
      };

      const response = await request(server)
        .post('/api/v1/urls/shorten')
        .set('Authorization', `Bearer ${authToken}`)
        .send(urlData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('originalUrl');
    });

    it('should reject duplicate custom alias', async () => {
      const urlData1 = {
        originalUrl: 'https://example1.com',
        customAlias: 'duplicate'
      };

      const urlData2 = {
        originalUrl: 'https://example2.com',
        customAlias: 'duplicate'
      };

      // First URL with alias
      await request(server)
        .post('/api/v1/urls/shorten')
        .set('Authorization', `Bearer ${authToken}`)
        .send(urlData1)
        .expect(201);

      // Second URL with same alias should fail
      const response = await request(server)
        .post('/api/v1/urls/shorten')
        .set('Authorization', `Bearer ${authToken}`)
        .send(urlData2)
        .expect(409);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('alias is already taken');
    });

    it('should require authentication', async () => {
      const urlData = {
        originalUrl: 'https://example.com'
      };

      const response = await request(server)
        .post('/api/v1/urls/shorten')
        .send(urlData)
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('No token provided');
    });
  });

  describe('GET /api/v1/urls', () => {
    beforeEach(async () => {
      // Create test URLs
      await global.testUtils.createTestUrl(testUser._id, {
        originalUrl: 'https://example1.com',
        shortCode: 'test1',
        title: 'Test URL 1'
      });
      await global.testUtils.createTestUrl(testUser._id, {
        originalUrl: 'https://example2.com',
        shortCode: 'test2',
        title: 'Test URL 2'
      });
    });

    it('should get user URLs with pagination', async () => {
      const response = await request(server)
        .get('/api/v1/urls?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('urls');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.urls).toHaveLength(2);
      expect(response.body.data.pagination).toHaveProperty('currentPage', 1);
      expect(response.body.data.pagination).toHaveProperty('totalPages');
      expect(response.body.data.pagination).toHaveProperty('totalUrls', 2);
    });

    it('should filter URLs by search query', async () => {
      const response = await request(server)
        .get('/api/v1/urls?search=Test URL 1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.urls).toHaveLength(1);
      expect(response.body.data.urls[0]).toHaveProperty('title', 'Test URL 1');
    });

    it('should sort URLs by creation date', async () => {
      const response = await request(server)
        .get('/api/v1/urls?sortBy=createdAt&sortOrder=desc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.urls).toHaveLength(2);
      // Verify sorting (newer first)
      const dates = response.body.data.urls.map(url => new Date(url.createdAt));
      expect(dates[0] >= dates[1]).toBe(true);
    });
  });

  describe('GET /api/v1/urls/:shortCode', () => {
    let testUrl;

    beforeEach(async () => {
      testUrl = await global.testUtils.createTestUrl(testUser._id, {
        originalUrl: 'https://example.com',
        shortCode: 'gettest',
        title: 'Get Test URL'
      });
    });

    it('should get URL details', async () => {
      const response = await request(server)
        .get('/api/v1/urls/gettest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('shortCode', 'gettest');
      expect(response.body.data).toHaveProperty('originalUrl', 'https://example.com');
      expect(response.body.data).toHaveProperty('title', 'Get Test URL');
    });

    it('should return 404 for non-existent URL', async () => {
      const response = await request(server)
        .get('/api/v1/urls/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('URL not found');
    });

    it('should not allow access to other user URLs', async () => {
      const otherUser = await global.testUtils.createTestUser();
      otherUser.email = 'other@example.com';
      otherUser.username = 'otheruser';
      await otherUser.save();

      const otherUrl = await global.testUtils.createTestUrl(otherUser._id, {
        shortCode: 'othertest'
      });

      const response = await request(server)
        .get('/api/v1/urls/othertest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('PUT /api/v1/urls/:shortCode', () => {
    let testUrl;

    beforeEach(async () => {
      testUrl = await global.testUtils.createTestUrl(testUser._id, {
        originalUrl: 'https://example.com',
        shortCode: 'updatetest',
        title: 'Original Title'
      });
    });

    it('should update URL successfully', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated Description'
      };

      const response = await request(server)
        .put('/api/v1/urls/updatetest')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('title', updateData.title);
      expect(response.body.data).toHaveProperty('description', updateData.description);

      // Verify update in database
      const updatedUrl = await Url.findById(testUrl._id);
      expect(updatedUrl.title).toBe(updateData.title);
      expect(updatedUrl.description).toBe(updateData.description);
    });

    it('should not allow updating originalUrl', async () => {
      const updateData = {
        originalUrl: 'https://malicious.com'
      };

      const response = await request(server)
        .put('/api/v1/urls/updatetest')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('originalUrl cannot be updated');
    });
  });

  describe('DELETE /api/v1/urls/:shortCode', () => {
    let testUrl;

    beforeEach(async () => {
      testUrl = await global.testUtils.createTestUrl(testUser._id, {
        shortCode: 'deletetest'
      });
    });

    it('should delete URL successfully', async () => {
      const response = await request(server)
        .delete('/api/v1/urls/deletetest')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify soft delete in database
      const deletedUrl = await Url.findById(testUrl._id);
      expect(deletedUrl.status).toBe('deleted');
      expect(deletedUrl.isActive).toBe(false);
    });
  });

  describe('POST /api/v1/urls/bulk', () => {
    it('should create multiple URLs successfully', async () => {
      const bulkData = {
        urls: [
          { originalUrl: 'https://example1.com', title: 'Bulk URL 1' },
          { originalUrl: 'https://example2.com', title: 'Bulk URL 2' },
          { originalUrl: 'https://example3.com', title: 'Bulk URL 3' }
        ]
      };

      const response = await request(server)
        .post('/api/v1/urls/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('successful');
      expect(response.body.data).toHaveProperty('failed');
      expect(response.body.data).toHaveProperty('total', 3);
      expect(response.body.data.successful).toHaveLength(3);
      expect(response.body.data.failed).toHaveLength(0);
    });

    it('should handle partial failures in bulk creation', async () => {
      const bulkData = {
        urls: [
          { originalUrl: 'https://example1.com', title: 'Valid URL' },
          { originalUrl: 'invalid-url', title: 'Invalid URL' },
          { originalUrl: 'https://example3.com', title: 'Another Valid URL' }
        ]
      };

      const response = await request(server)
        .post('/api/v1/urls/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData)
        .expect(207); // Multi-status

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.successful).toHaveLength(2);
      expect(response.body.data.failed).toHaveLength(1);
      expect(response.body.data.total).toBe(3);
    });
  });

  describe('GET /api/v1/urls/:shortCode/analytics', () => {
    let testUrl;

    beforeEach(async () => {
      testUrl = await global.testUtils.createTestUrl(testUser._id, {
        shortCode: 'analyticstest',
        clicks: 10
      });
    });

    it('should get URL analytics', async () => {
      const response = await request(server)
        .get('/api/v1/urls/analyticstest/analytics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalClicks');
      expect(response.body.data).toHaveProperty('clickHistory');
      expect(response.body.data).toHaveProperty('topReferrers');
      expect(response.body.data).toHaveProperty('topCountries');
      expect(response.body.data).toHaveProperty('deviceStats');
      expect(response.body.data).toHaveProperty('browserStats');
    });

    it('should filter analytics by date range', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const response = await request(server)
        .get(`/api/v1/urls/analyticstest/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('dateRange');
      expect(response.body.data.dateRange).toHaveProperty('startDate');
      expect(response.body.data.dateRange).toHaveProperty('endDate');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on URL creation', async () => {
      const urlData = {
        originalUrl: 'https://example.com'
      };

      // Make requests up to the rate limit
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(server)
            .post('/api/v1/urls/shorten')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ ...urlData, originalUrl: `https://example${i}.com` })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should succeed, others should be rate limited
      const successfulRequests = responses.filter(res => res.status === 201);
      const rateLimitedRequests = responses.filter(res => res.status === 429);

      expect(successfulRequests.length).toBeGreaterThan(0);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });
});
