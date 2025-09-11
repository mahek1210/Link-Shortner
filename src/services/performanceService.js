// src/services/performanceService.js - Performance optimization service
const mongoose = require('mongoose');
const logger = require('../config/logger');

class PerformanceService {
  constructor() {
    this.initialized = false;
  }

  // Initialize database indexes for optimal performance
  async initializeIndexes() {
    try {
      logger.info('Initializing database indexes for performance optimization...');
      
      // Drop existing conflicting indexes first
      try {
        await User.collection.dropIndex('userId_1_createdAt_-1').catch(() => {});
        await Url.collection.dropIndex('customAlias_1').catch(() => {});
      } catch (error) {
        // Ignore errors if indexes don't exist
      }
      
      // User collection indexes
      await User.collection.createIndex({ email: 1 }, { unique: true, background: true, name: 'user_email_unique' });
      await User.collection.createIndex({ username: 1 }, { unique: true, background: true, name: 'user_username_unique' });
      await User.collection.createIndex({ googleId: 1 }, { sparse: true, background: true, name: 'user_googleId_sparse' });
      await User.collection.createIndex({ createdAt: -1 }, { background: true, name: 'user_createdAt_desc' });
      
      // URL collection indexes
      await Url.collection.createIndex({ shortCode: 1 }, { unique: true, background: true, name: 'url_shortCode_unique' });
      await Url.collection.createIndex({ customAlias: 1 }, { unique: true, sparse: true, background: true, name: 'url_customAlias_unique' });
      await Url.collection.createIndex({ userId: 1, createdAt: -1 }, { background: true, name: 'url_userId_createdAt' });
      await Url.collection.createIndex({ expiresAt: 1 }, { sparse: true, background: true, name: 'url_expiresAt_sparse' });
      await Url.collection.createIndex({ isActive: 1 }, { background: true, name: 'url_isActive' });
      
      // Analytics collection indexes
      if (Analytics) {
        await Analytics.collection.createIndex({ urlId: 1, 'clickData.timestamp': -1 }, { background: true, name: 'analytics_urlId_timestamp' });
        await Analytics.collection.createIndex({ 'clickData.timestamp': -1 }, { background: true, name: 'analytics_timestamp_desc' });
        await Analytics.collection.createIndex({ 'clickData.country': 1 }, { background: true, name: 'analytics_country' });
      }
      
      // AuditLog collection indexes
      if (AuditLog) {
        await AuditLog.collection.createIndex({ timestamp: -1 }, { background: true, name: 'audit_timestamp_desc' });
        await AuditLog.collection.createIndex({ userId: 1, timestamp: -1 }, { background: true, name: 'audit_userId_timestamp' });
        await AuditLog.collection.createIndex({ eventType: 1 }, { background: true, name: 'audit_eventType' });
      }
      
      logger.info('✅ Database indexes initialized successfully');
      this.initialized = true;

    } catch (error) {
      logger.error('Failed to initialize database indexes:', error);
      // Don't throw error to prevent app from crashing
    }
  }

  // Optimize MongoDB connection settings
  getOptimizedConnectionOptions() {
    return {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
      // Compression
      compressors: ['zlib'],
      zlibCompressionLevel: 6,
      // Read preferences for better performance
      readPreference: 'secondaryPreferred',
      // Write concern for better performance (adjust based on your needs)
      writeConcern: {
        w: 1,
        j: true,
        wtimeout: 5000
      }
    };
  }

  // Clean up old data to maintain performance
  async performMaintenance() {
    try {
      logger.info('Starting performance maintenance...');

      // Clean up old click history (keep only last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const Url = mongoose.model('Url');
      await Url.updateMany(
        {},
        {
          $pull: {
            clickHistory: {
              timestamp: { $lt: ninetyDaysAgo }
            }
          }
        }
      );

      // Clean up old analytics data (keep only last 90 days of detailed clicks)
      const Analytics = mongoose.model('Analytics');
      await Analytics.updateMany(
        {},
        {
          $pull: {
            clicks: {
              timestamp: { $lt: ninetyDaysAgo }
            }
          }
        }
      );

      // Clean up expired URLs (mark as expired, don't delete)
      await Url.updateMany(
        {
          expiresAt: { $lt: new Date() },
          status: 'active'
        },
        {
          $set: {
            status: 'expired',
            isActive: false
          }
        }
      );

      // Clean up old audit logs (handled by TTL index, but we can also do manual cleanup)
      const AuditLog = mongoose.model('AuditLog');
      const result = await AuditLog.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      logger.info(`Performance maintenance completed. Cleaned up ${result.deletedCount} audit logs`);

    } catch (error) {
      logger.error('Performance maintenance failed:', error);
    }
  }

  // Get performance metrics
  async getPerformanceMetrics() {
    try {
      const metrics = {
        database: await this.getDatabaseMetrics(),
        application: this.getApplicationMetrics(),
        timestamp: new Date()
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      return null;
    }
  }

  // Get database performance metrics
  async getDatabaseMetrics() {
    try {
      const db = mongoose.connection.db;
      
      // Get database stats
      const dbStats = await db.stats();
      
      // Get collection stats
      const collections = ['users', 'urls', 'analytics', 'auditlogs'];
      const collectionStats = {};
      
      for (const collectionName of collections) {
        try {
          const stats = await db.collection(collectionName).stats();
          collectionStats[collectionName] = {
            count: stats.count,
            size: stats.size,
            avgObjSize: stats.avgObjSize,
            indexSizes: stats.indexSizes,
            totalIndexSize: stats.totalIndexSize
          };
        } catch (error) {
          // Collection might not exist yet
          collectionStats[collectionName] = { error: 'Collection not found' };
        }
      }

      return {
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexSize: dbStats.indexSize,
        collections: collectionStats,
        connectionCount: mongoose.connections.length
      };
    } catch (error) {
      logger.error('Failed to get database metrics:', error);
      return { error: error.message };
    }
  }

  // Get application performance metrics
  getApplicationMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024) // MB
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  // Schedule regular maintenance
  startMaintenanceScheduler() {
    // Run maintenance every 6 hours
    setInterval(() => {
      this.performMaintenance();
    }, 6 * 60 * 60 * 1000);

    logger.info('Performance maintenance scheduler started (runs every 6 hours)');
  }
}

module.exports = new PerformanceService();
