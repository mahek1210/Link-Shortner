// src/services/redisHealthService.js - Redis health monitoring and diagnostics
const logger = require('../config/logger');
const redisManager = require('../config/redis');

class RedisHealthService {
  constructor() {
    this.healthStats = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      lastConnectionAttempt: null,
      lastSuccessfulConnection: null,
      currentStatus: 'unknown',
      memoryFallbackUsage: 0
    };
    this.startHealthMonitoring();
  }

  startHealthMonitoring() {
    // Monitor Redis health every 30 seconds
    setInterval(async () => {
      await this.performHealthCheck();
    }, parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL) || 30000);
  }

  async performHealthCheck() {
    try {
      this.healthStats.totalConnections++;
      this.healthStats.lastConnectionAttempt = new Date();

      const isHealthy = await redisManager.ping();
      
      if (isHealthy) {
        this.healthStats.successfulConnections++;
        this.healthStats.lastSuccessfulConnection = new Date();
        this.healthStats.currentStatus = 'healthy';
        
        // Log success only if previously unhealthy
        if (this.healthStats.currentStatus !== 'healthy') {
          logger.info('✅ Redis health check: Connection restored');
        }
      } else {
        this.healthStats.failedConnections++;
        this.healthStats.currentStatus = 'unhealthy';
        logger.warn('⚠️ Redis health check: Connection failed');
      }
    } catch (error) {
      this.healthStats.failedConnections++;
      this.healthStats.currentStatus = 'error';
      logger.error('❌ Redis health check error:', { error: error.message });
    }
  }

  getHealthReport() {
    const uptime = this.healthStats.lastSuccessfulConnection 
      ? Date.now() - this.healthStats.lastSuccessfulConnection.getTime()
      : null;

    const successRate = this.healthStats.totalConnections > 0 
      ? (this.healthStats.successfulConnections / this.healthStats.totalConnections * 100).toFixed(2)
      : 0;

    return {
      status: this.healthStats.currentStatus,
      isConnected: redisManager.isHealthy(),
      connectionStats: {
        total: this.healthStats.totalConnections,
        successful: this.healthStats.successfulConnections,
        failed: this.healthStats.failedConnections,
        successRate: `${successRate}%`
      },
      timing: {
        lastAttempt: this.healthStats.lastConnectionAttempt,
        lastSuccess: this.healthStats.lastSuccessfulConnection,
        uptimeMs: uptime
      },
      redisStats: redisManager.getStats(),
      memoryFallback: {
        enabled: !redisManager.isHealthy(),
        usage: this.healthStats.memoryFallbackUsage
      }
    };
  }

  async diagnoseConnection() {
    const report = {
      timestamp: new Date(),
      environment: {
        redisEnabled: process.env.REDIS_ENABLED,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
        redisHost: process.env.REDIS_HOST,
        redisPort: process.env.REDIS_PORT,
        nodeEnv: process.env.NODE_ENV
      },
      tests: {}
    };

    // Test 1: Basic connection
    try {
      const pingResult = await redisManager.ping();
      report.tests.basicConnection = {
        status: pingResult ? 'pass' : 'fail',
        result: pingResult ? 'PONG received' : 'No response'
      };
    } catch (error) {
      report.tests.basicConnection = {
        status: 'error',
        error: error.message
      };
    }

    // Test 2: Set/Get operation
    try {
      const testKey = 'health_check_' + Date.now();
      const testValue = { test: true, timestamp: Date.now() };
      
      await redisManager.set(testKey, testValue, 60);
      const retrieved = await redisManager.get(testKey);
      await redisManager.del(testKey);
      
      report.tests.setGetOperation = {
        status: retrieved && retrieved.test === true ? 'pass' : 'fail',
        result: retrieved ? 'Data retrieved successfully' : 'Data retrieval failed'
      };
    } catch (error) {
      report.tests.setGetOperation = {
        status: 'error',
        error: error.message
      };
    }

    // Test 3: Memory fallback
    try {
      const memoryTestKey = 'memory_test_' + Date.now();
      const memoryTestValue = { memoryTest: true };
      
      // Force memory cache usage
      const originalHealthy = redisManager.isHealthy;
      redisManager.isHealthy = () => false;
      
      await redisManager.set(memoryTestKey, memoryTestValue, 60);
      const memoryRetrieved = await redisManager.get(memoryTestKey);
      
      // Restore original method
      redisManager.isHealthy = originalHealthy;
      
      report.tests.memoryFallback = {
        status: memoryRetrieved && memoryRetrieved.memoryTest === true ? 'pass' : 'fail',
        result: memoryRetrieved ? 'Memory fallback working' : 'Memory fallback failed'
      };
    } catch (error) {
      report.tests.memoryFallback = {
        status: 'error',
        error: error.message
      };
    }

    return report;
  }

  incrementMemoryFallbackUsage() {
    this.healthStats.memoryFallbackUsage++;
  }

  getRecommendations() {
    const recommendations = [];
    const health = this.getHealthReport();

    if (health.status === 'unhealthy' || health.status === 'error') {
      recommendations.push({
        type: 'critical',
        message: 'Redis connection is failing. Check network connectivity and credentials.',
        action: 'Verify REDIS_URL and network access to Redis server'
      });
    }

    if (parseFloat(health.connectionStats.successRate) < 90) {
      recommendations.push({
        type: 'warning',
        message: 'Redis connection success rate is below 90%',
        action: 'Consider increasing REDIS_MAX_RETRIES or REDIS_RETRY_DELAY'
      });
    }

    if (health.memoryFallback.enabled) {
      recommendations.push({
        type: 'info',
        message: 'Currently using memory fallback cache',
        action: 'Application will continue to work but performance may be impacted'
      });
    }

    if (health.memoryFallback.usage > 1000) {
      recommendations.push({
        type: 'warning',
        message: 'High memory fallback usage detected',
        action: 'Consider fixing Redis connection to improve performance'
      });
    }

    return recommendations;
  }
}

// Create singleton instance
const redisHealthService = new RedisHealthService();

module.exports = redisHealthService;
