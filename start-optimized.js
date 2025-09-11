#!/usr/bin/env node

// start-optimized.js - Ultra-fast production-ready startup script
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Performance optimizations
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';

// Load environment variables first
require('dotenv').config();

// Essential imports only
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

// Fast logger setup
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] INFO: ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] WARN: ${msg}`)
};

// Fast MongoDB connection
const mongoose = require('mongoose');

async function connectMongoDB() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/link-shortener';
  
  await mongoose.connect(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 3000,
    socketTimeoutMS: 30000
  });
  
  logger.info('MongoDB connected');
}

// Essential models
const User = require('./src/models/User');
const Url = require('./src/models/Url');

// Fast Express setup
function createApp() {
  const app = express();
  
  // Essential middleware only
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }));
  
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Auth routes
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  
  // Fast auth middleware
  const auth = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Access denied' });
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });
      
      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ success: false, error: 'Invalid token' });
    }
  };
  
  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await User.findOne({ email }).select('+password');
      if (!user) return res.status(400).json({ success: false, error: 'Invalid credentials' });
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ success: false, error: 'Invalid credentials' });
      
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      
      user.lastLogin = new Date();
      await user.save();
      
      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          name: user.name
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
  
  // Signup endpoint
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, username, name } = req.body;
      
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: existingUser.email === email ? 'Email already exists' : 'Username already exists' 
        });
      }
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      const user = new User({
        email,
        password: hashedPassword,
        username,
        name
      });
      
      await user.save();
      
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      
      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          name: user.name
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
  
  // URL shortening endpoint
  app.post('/api/shorten', auth, async (req, res) => {
    try {
      const { originalUrl, customAlias } = req.body;
      
      if (!originalUrl) {
        return res.status(400).json({ success: false, error: 'originalUrl is required' });
      }
      
      try {
        new URL(originalUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid URL format' });
      }
      
      let shortCode;
      
      if (customAlias) {
        const existing = await Url.findOne({ $or: [{ shortCode: customAlias }, { customAlias }] });
        if (existing) {
          return res.status(400).json({ success: false, error: 'Custom alias already exists' });
        }
        shortCode = customAlias;
      } else {
        const { nanoid } = require('nanoid');
        shortCode = nanoid(8);
      }
      
      const url = new Url({
        originalUrl,
        shortCode,
        userId: req.user._id,
        customAlias: customAlias || undefined
      });
      
      await url.save();
      
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      
      res.status(201).json({
        success: true,
        data: {
          id: url._id,
          originalUrl: url.originalUrl,
          shortCode: url.shortCode,
          shortUrl: `${baseUrl}/${url.shortCode}`,
          clicks: url.clicks,
          createdAt: url.createdAt
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
  
  // Fast redirect endpoint
  app.get('/:shortCode', async (req, res) => {
    try {
      const { shortCode } = req.params;
      
      const url = await Url.findOne({ 
        $or: [{ shortCode }, { customAlias: shortCode }] 
      });
      
      if (!url) {
        return res.status(404).json({ error: 'URL not found' });
      }
      
      // Update click count asynchronously
      setImmediate(() => {
        Url.updateOne(
          { _id: url._id },
          { $inc: { clicks: 1 }, $set: { lastClicked: new Date() } }
        ).catch(() => {});
      });
      
      res.redirect(301, url.originalUrl);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // Get user URLs
  app.get('/api/urls', auth, async (req, res) => {
    try {
      const urls = await Url.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('-__v');
      
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      
      const formattedUrls = urls.map(url => ({
        id: url._id,
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${baseUrl}/${url.shortCode}`,
        clicks: url.clicks,
        createdAt: url.createdAt,
        lastClicked: url.lastClicked
      }));
      
      res.json({ success: true, data: formattedUrls });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
  
  // Serve static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }
  
  return app;
}

// Fast startup
async function start() {
  try {
    logger.info('🚀 Starting optimized Link Shortener...');
    
    await connectMongoDB();
    
    const app = createApp();
    const port = process.env.PORT || 5000;
    
    const server = app.listen(port, () => {
      logger.info(`✅ Server running on port ${port}`);
      logger.info(`🔗 Health check: http://localhost:${port}/health`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        mongoose.connection.close(false, () => {
          process.exit(0);
        });
      });
    });
    
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

start();
