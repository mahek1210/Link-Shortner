// src/config/database.js - Optimized MongoDB connection with performance tuning
const mongoose = require('mongoose');
const logger = require('./logger');

class Database {
  constructor() {
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      // Use MONGODB_URI or MONGO_URI
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/link-shortener';
      
      const options = {
        // Connection pool settings
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        
        // Timeout settings
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        
        // Performance settings
        bufferCommands: false,
        
        // Reliability settings
        retryWrites: true,
        retryReads: true,
        
        // Network settings
        family: 4, // Use IPv4
        
        // Database name
        dbName: mongoUri.includes('localhost') ? 'link-shortener' : undefined
      };

      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      this.connectionRetries = 0;
      
      logger.info('✅ MongoDB connected successfully');
      logger.info(`📍 Database: ${mongoose.connection.db.databaseName}`);
      
      // Handle connection events
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
        this.handleReconnection();
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      return true;
      
    } catch (error) {
      this.isConnected = false;
      this.connectionRetries++;
      
      logger.error(`MongoDB connection failed (attempt ${this.connectionRetries}/${this.maxRetries}):`, error.message);
      
      if (this.connectionRetries < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, this.connectionRetries), 30000);
        logger.info(`Retrying connection in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
      } else {
        logger.error('❌ Max connection retries exceeded. Please check your MongoDB configuration.');
        throw error;
      }
    }
  }

  async handleReconnection() {
    if (!this.isConnected && this.connectionRetries < this.maxRetries) {
      this.connectionRetries++;
      const delay = Math.min(1000 * Math.pow(2, this.connectionRetries), 30000);
      
      setTimeout(() => {
        logger.info(`Attempting to reconnect to MongoDB (${this.connectionRetries}/${this.maxRetries})...`);
        this.connect().catch(() => {});
      }, delay);
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('MongoDB disconnected gracefully');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
    }
  }

  getConnectionState() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState] || 'unknown';
  }

  async getConnectionStats() {
    try {
      const stats = await mongoose.connection.db.stats();
      return {
        isHealthy: this.isConnected && mongoose.connection.readyState === 1,
        state: this.getConnectionState(),
        database: mongoose.connection.db.databaseName,
        collections: stats.collections,
        dataSize: `${Math.round(stats.dataSize / 1024 / 1024 * 100) / 100} MB`,
        indexSize: `${Math.round(stats.indexSize / 1024 / 1024 * 100) / 100} MB`,
        responseTime: Date.now()
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: error.message,
        responseTime: Date.now()
      };
    }
  }

  // Graceful shutdown
  async gracefulShutdown() {
    logger.info('Initiating graceful database shutdown...');
    
    try {
      // Close all connections
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('✅ Database shutdown completed');
    } catch (error) {
      logger.error('Error during database shutdown:', error);
    }
  }
}

// Create singleton instance
const database = new Database();

// Handle process termination
process.on('SIGINT', async () => {
  await database.gracefulShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await database.gracefulShutdown();
  process.exit(0);
});

module.exports = database;
