// tests/setup.js - Test setup and configuration
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const Redis = require('ioredis-mock');

// Global test setup
let mongoServer;
let redisClient;

// Setup before all tests
beforeAll(async () => {
  // Setup in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Setup mock Redis
  redisClient = new Redis();
  
  // Mock environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only-minimum-64-chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-purposes-only-minimum-64-chars';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
  process.env.IP_SALT = 'test-salt-for-ip-hashing';
  process.env.BASE_URL = 'http://localhost:5000';
  process.env.FRONTEND_URL = 'http://localhost:3000';
});

// Cleanup after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  redisClient.disconnect();
});

// Clear database between tests
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  
  // Clear Redis mock
  redisClient.flushall();
});

// Global test utilities
global.testUtils = {
  // Create test user
  createTestUser: async () => {
    const User = require('../src/models/User');
    const user = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'TestPassword123!',
      role: 'user'
    });
    return await user.save();
  },

  // Create test admin
  createTestAdmin: async () => {
    const User = require('../src/models/User');
    const admin = new User({
      username: 'testadmin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
      role: 'admin'
    });
    return await admin.save();
  },

  // Create test URL
  createTestUrl: async (userId, customData = {}) => {
    const Url = require('../src/models/Url');
    const url = new Url({
      originalUrl: 'https://example.com',
      shortId: 'test123',
      shortCode: 'test123',
      userId,
      ...customData
    });
    return await url.save();
  },

  // Generate JWT token
  generateTestToken: (userId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Generate admin JWT token
  generateAdminToken: (userId) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Mock request object
  mockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    ip: '127.0.0.1',
    get: jest.fn(),
    ...overrides
  }),

  // Mock response object
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    return res;
  },

  // Wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))
};

// Mock external services
jest.mock('../src/config/redis', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  getClient: () => redisClient,
  isHealthy: () => true,
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  ping: jest.fn().mockResolvedValue(true),
  getStats: jest.fn().mockReturnValue({ isConnected: true })
}));

// Mock logger to prevent console spam during tests
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  security: {
    loginAttempt: jest.fn(),
    rateLimitExceeded: jest.fn(),
    suspiciousActivity: jest.fn(),
    dataAccess: jest.fn()
  },
  performance: {
    apiResponse: jest.fn(),
    dbQuery: jest.fn()
  },
  audit: {
    userAction: jest.fn(),
    adminAction: jest.fn(),
    systemEvent: jest.fn()
  }
}));

// Mock email service (if nodemailer is available)
try {
  jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
    }))
  }));
} catch (error) {
  // nodemailer not installed, skip mock
}

// Increase timeout for async operations
jest.setTimeout(30000);
