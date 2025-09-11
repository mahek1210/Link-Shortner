// src/config/db.js - Enhanced database connection with connection pooling and monitoring
const mongoose = require('mongoose');
const logger = require('./logger');
const redisManager = require('./redis');

class Database {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.connectionMetrics = {
      totalConnections: 0,
      failedConnections: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null
    };
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.info('Database already connected');
        return this.connection;
      }

      const mongoUri = process.env.NODE_ENV === 'test' 
        ? process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/linkshortener_test'
        : process.env.MONGO_URI || 'mongodb://localhost:27017/linkshortener';

      const options = {
        // Connection options
        maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        
        // Buffer options
        bufferCommands: false,
        
        // Heartbeat options
        heartbeatFrequencyMS: 10000,
        
        // Retry options
        retryWrites: true,
        retryReads: true,
        
        // Compression
        compressors: ['zlib'],
        zlibCompressionLevel: 6,
        
        // Read preference
        readPreference: 'primary',
        
        // Write concern
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: 10000
        }
      };

      logger.info('Connecting to MongoDB...', { uri: mongoUri.replace(/\/\/.*@/, '//***:***@') });
      
      this.connection = await mongoose.connect(mongoUri, options);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionMetrics.totalConnections++;
      this.connectionMetrics.lastConnectedAt = new Date();

      logger.info(`MongoDB Connected: ${this.connection.connection.host}:${this.connection.connection.port}`);
      
      // Set up connection event listeners
      this.setupEventListeners();
      
      // Initialize indexes
      await this.createIndexes();
      
      // Start connection monitoring
      this.startConnectionMonitoring();
      
      return this.connection;
    } catch (error) {
      this.connectionMetrics.failedConnections++;
      logger.error('Database connection failed:', { 
        error: error.message,
        attempt: this.reconnectAttempts + 1,
        maxAttempts: this.maxReconnectAttempts
      });
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        logger.info(`Retrying connection in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
      }
      
      throw error;
    }
  }

  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
      this.isConnected = true;
      this.connectionMetrics.lastConnectedAt = new Date();
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', { error: err.message });
      this.isConnected = false;
      this.connectionMetrics.failedConnections++;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      this.isConnected = false;
      this.connectionMetrics.lastDisconnectedAt = new Date();
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.connectionMetrics.lastConnectedAt = new Date();
    });

    mongoose.connection.on('close', () => {
      logger.info('MongoDB connection closed');
      this.isConnected = false;
    });

    mongoose.connection.on('fullsetup', () => {
      logger.info('MongoDB replica set fully connected');
    });

    mongoose.connection.on('all', () => {
      logger.info('MongoDB replica set all servers connected');
    });
  }

  async clearConflictingIndexes() {
    try {
      logger.info('Clearing conflicting database indexes...');
      
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        try {
          const indexes = await mongoose.connection.db.collection(collection.name).indexes();
          
          // Drop conflicting indexes
          for (const index of indexes) {
            if (index.name !== '_id_' && (
              index.name.includes('expiresAt_1') || 
              index.name.includes('clicks.hashedIp_1') ||
              index.name.includes('keyId_1')
            )) {
              try {
                await mongoose.connection.db.collection(collection.name).dropIndex(index.name);
                logger.debug(`Dropped conflicting index: ${index.name} from ${collection.name}`);
              } catch (dropError) {
                // Index might not exist, ignore error
                logger.debug(`Index ${index.name} already dropped or doesn't exist`);
              }
            }
          }
        } catch (error) {
          logger.debug(`Error processing collection ${collection.name}:`, error.message);
        }
      }
      
      logger.info('Conflicting indexes cleared');
    } catch (error) {
      logger.warn('Error clearing conflicting indexes:', { error: error.message });
    }
  }

  async createIndexes() {
    try {
      logger.info('Creating database indexes...');
      
      // Clear conflicting indexes first
      await this.clearConflictingIndexes();
      
      // Get all models and create their indexes
      const models = mongoose.modelNames();
      
      for (const modelName of models) {
        try {
          const model = mongoose.model(modelName);
          await model.createIndexes();
          logger.debug(`Indexes created for ${modelName}`);
        } catch (error) {
          logger.warn(`Error creating indexes for ${modelName}:`, error.message);
        }
      }
      
      // Create custom compound indexes
      const db = mongoose.connection.db;
      
      // URLs collection indexes
      await db.collection('urls').createIndex(
        { userId: 1, createdAt: -1 },
        { background: true, name: 'user_urls_by_date' }
      );
      
      await db.collection('urls').createIndex(
        { userId: 1, clicks: -1 },
        { background: true, name: 'user_urls_by_clicks' }
      );
      
      await db.collection('urls').createIndex(
        { originalUrl: 1 },
        { background: true, name: 'original_url_lookup' }
      );
      
      await db.collection('urls').createIndex(
        { expiresAt: 1 },
        { background: true, expireAfterSeconds: 0, name: 'url_expiry' }
      );
      
      // Analytics collection indexes
      await db.collection('analytics').createIndex(
        { shortCode: 1, 'clicks.timestamp': -1 },
        { background: true, name: 'analytics_by_date' }
      );
      
      await db.collection('analytics').createIndex(
        { 'clicks.country': 1 },
        { background: true, name: 'analytics_by_country' }
      );
      
      // Users collection indexes
      await db.collection('users').createIndex(
        { email: 1 },
        { unique: true, background: true, name: 'unique_email' }
      );
      
      await db.collection('users').createIndex(
        { username: 1 },
        { unique: true, sparse: true, background: true, name: 'unique_username' }
      );
      
      logger.info('Database indexes created successfully');
    } catch (error) {
      logger.error('Error creating database indexes:', { error: error.message });
    }
  }

  startConnectionMonitoring() {
    // Monitor connection every 30 seconds
    setInterval(async () => {
      try {
        const stats = await this.getConnectionStats();
        
        // Cache connection stats in Redis
        await redisManager.set('db_connection_stats', stats, 60);
        
        // Log performance metrics
        logger.performance.dbQuery('connection_monitor', 'ping', stats.responseTime);
        
        // Alert if connection is unhealthy
        if (!this.isHealthy()) {
          logger.error('Database connection unhealthy', stats);
        }
      } catch (error) {
        logger.error('Connection monitoring error:', { error: error.message });
      }
    }, 30000);
  }

  async getConnectionStats() {
    const start = Date.now();
    
    try {
      // Ping database
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - start;
      
      // Get connection pool stats
      const poolStats = mongoose.connection.db.serverConfig?.s?.pool?.totalConnectionCount || 0;
      
      return {
        isHealthy: this.isHealthy(),
        responseTime,
        poolSize: poolStats,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        metrics: this.connectionMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: error.message,
        responseTime: Date.now() - start,
        timestamp: new Date().toISOString()
      };
    }
  }

  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.connection.close();
        this.isConnected = false;
        this.connectionMetrics.lastDisconnectedAt = new Date();
        logger.info('Database connection closed gracefully');
      }
    } catch (error) {
      logger.error('Error closing database connection:', { error: error.message });
    }
  }

  isHealthy() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  getConnectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      state: states[mongoose.connection.readyState],
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      isConnected: this.isConnected,
      metrics: this.connectionMetrics
    };
  }

  // Database maintenance operations
  async runMaintenance() {
    try {
      logger.info('Running database maintenance...');
      
      // Clean up expired URLs
      const expiredUrls = await mongoose.model('Url').deleteMany({
        expiresAt: { $lt: new Date() },
        status: 'expired'
      });
      
      logger.info(`Cleaned up ${expiredUrls.deletedCount} expired URLs`);
      
      // Clean up old analytics data (older than retention period)
      const retentionDays = parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 365;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const oldAnalytics = await mongoose.model('Analytics').updateMany(
        {},
        {
          $pull: {
            clicks: { timestamp: { $lt: cutoffDate } }
          }
        }
      );
      
      logger.info(`Cleaned up old analytics data: ${oldAnalytics.modifiedCount} records updated`);
      
      // Optimize collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        try {
          await mongoose.connection.db.collection(collection.name).reIndex();
          logger.debug(`Reindexed collection: ${collection.name}`);
        } catch (error) {
          logger.warn(`Failed to reindex ${collection.name}:`, { error: error.message });
        }
      }
      
      logger.info('Database maintenance completed');
    } catch (error) {
      logger.error('Database maintenance failed:', { error: error.message });
    }
  }

  async connectDatabases() {
    try {
      logger.info('Connecting to databases...');

      // Connect to MongoDB
      await database.connect();

      // Connect to Redis (optional)
      try {
        await redisManager.connect();
        if (redisManager.isHealthy()) {
          logger.info('Redis connection established');
        } else {
          logger.info('Redis disabled, using memory-based caching');
        }
      } catch (error) {
        logger.warn('Redis connection failed, continuing without cache:', { error: error.message });
      }

      logger.info('Database connections established');
    } catch (error) {
      logger.error('Database connection failed:', { error: error.message });
      throw error;
    }
  }

  // Backup operations
  async createBackup() {
    try {
      logger.info('Creating database backup...');
      
      // In production, you would use mongodump or a cloud backup service
      const collections = ['users', 'urls', 'analytics', 'apikeys'];
      const backupData = {};
      
      for (const collectionName of collections) {
        const data = await mongoose.connection.db.collection(collectionName).find({}).toArray();
        backupData[collectionName] = data;
      }
      
      const backupKey = `backup:${new Date().toISOString().split('T')[0]}`;
      await redisManager.set(backupKey, backupData, 86400 * 7); // Keep for 7 days
      
      logger.info('Database backup created successfully', { key: backupKey });
      return backupKey;
    } catch (error) {
      logger.error('Database backup failed:', { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
const database = new Database();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connection...');
  await database.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connection...');
  await database.disconnect();
  process.exit(0);
});

module.exports = database;
