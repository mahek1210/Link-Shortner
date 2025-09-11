// src/services/cacheService.js - Comprehensive caching service with Redis
const redisManager = require('../config/redis');
const logger = require('../config/logger');

class CacheService {
  constructor() {
    this.defaultTTL = parseInt(process.env.CACHE_TTL) || 3600; // 1 hour
    this.keyPrefix = 'ls:'; // Link Shortener prefix
  }

  // Generate cache key with prefix
  generateKey(type, identifier) {
    return `${this.keyPrefix}${type}:${identifier}`;
  }

  // URL caching methods
  async cacheUrl(shortCode, urlData, ttl = this.defaultTTL) {
    try {
      const key = this.generateKey('url', shortCode);
      const success = await redisManager.set(key, urlData, ttl);
      
      if (success) {
        logger.debug('URL cached successfully', { shortCode, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching URL:', { error: error.message, shortCode });
      return false;
    }
  }

  async getCachedUrl(shortCode) {
    try {
      const key = this.generateKey('url', shortCode);
      const urlData = await redisManager.get(key);
      
      if (urlData) {
        logger.debug('URL cache hit', { shortCode });
        
        // Track cache hit metrics
        await this.trackCacheMetrics('url', 'hit');
      } else {
        logger.debug('URL cache miss', { shortCode });
        
        // Track cache miss metrics
        await this.trackCacheMetrics('url', 'miss');
      }
      
      return urlData;
    } catch (error) {
      logger.error('Error retrieving cached URL:', { error: error.message, shortCode });
      return null;
    }
  }

  async invalidateUrl(shortCode) {
    try {
      const key = this.generateKey('url', shortCode);
      const success = await redisManager.del(key);
      
      if (success) {
        logger.debug('URL cache invalidated', { shortCode });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating URL cache:', { error: error.message, shortCode });
      return false;
    }
  }

  // User session caching
  async cacheUserSession(userId, sessionData, ttl = 86400) { // 24 hours
    try {
      const key = this.generateKey('session', userId);
      const success = await redisManager.set(key, sessionData, ttl);
      
      if (success) {
        logger.debug('User session cached', { userId, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching user session:', { error: error.message, userId });
      return false;
    }
  }

  async getCachedUserSession(userId) {
    try {
      const key = this.generateKey('session', userId);
      const sessionData = await redisManager.get(key);
      
      if (sessionData) {
        logger.debug('User session cache hit', { userId });
        await this.trackCacheMetrics('session', 'hit');
      } else {
        await this.trackCacheMetrics('session', 'miss');
      }
      
      return sessionData;
    } catch (error) {
      logger.error('Error retrieving cached user session:', { error: error.message, userId });
      return null;
    }
  }

  async invalidateUserSession(userId) {
    try {
      const key = this.generateKey('session', userId);
      const success = await redisManager.del(key);
      
      if (success) {
        logger.debug('User session cache invalidated', { userId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating user session cache:', { error: error.message, userId });
      return false;
    }
  }

  // Analytics caching
  async cacheAnalytics(shortCode, analyticsData, ttl = 1800) { // 30 minutes
    try {
      const key = this.generateKey('analytics', shortCode);
      const success = await redisManager.set(key, analyticsData, ttl);
      
      if (success) {
        logger.debug('Analytics cached', { shortCode, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching analytics:', { error: error.message, shortCode });
      return false;
    }
  }

  async getCachedAnalytics(shortCode) {
    try {
      const key = this.generateKey('analytics', shortCode);
      const analyticsData = await redisManager.get(key);
      
      if (analyticsData) {
        logger.debug('Analytics cache hit', { shortCode });
        await this.trackCacheMetrics('analytics', 'hit');
      } else {
        await this.trackCacheMetrics('analytics', 'miss');
      }
      
      return analyticsData;
    } catch (error) {
      logger.error('Error retrieving cached analytics:', { error: error.message, shortCode });
      return null;
    }
  }

  async invalidateAnalytics(shortCode) {
    try {
      const key = this.generateKey('analytics', shortCode);
      const success = await redisManager.del(key);
      
      if (success) {
        logger.debug('Analytics cache invalidated', { shortCode });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating analytics cache:', { error: error.message, shortCode });
      return false;
    }
  }

  // User data caching
  async cacheUser(userId, userData, ttl = 3600) { // 1 hour
    try {
      const key = this.generateKey('user', userId);
      const success = await redisManager.set(key, userData, ttl);
      
      if (success) {
        logger.debug('User data cached', { userId, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching user data:', { error: error.message, userId });
      return false;
    }
  }

  async getCachedUser(userId) {
    try {
      const key = this.generateKey('user', userId);
      const userData = await redisManager.get(key);
      
      if (userData) {
        logger.debug('User data cache hit', { userId });
        await this.trackCacheMetrics('user', 'hit');
      } else {
        await this.trackCacheMetrics('user', 'miss');
      }
      
      return userData;
    } catch (error) {
      logger.error('Error retrieving cached user data:', { error: error.message, userId });
      return null;
    }
  }

  async invalidateUser(userId) {
    try {
      const key = this.generateKey('user', userId);
      const success = await redisManager.del(key);
      
      if (success) {
        logger.debug('User data cache invalidated', { userId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating user data cache:', { error: error.message, userId });
      return false;
    }
  }

  // API response caching
  async cacheApiResponse(endpoint, params, responseData, ttl = 600) { // 10 minutes
    try {
      const cacheKey = this.generateApiCacheKey(endpoint, params);
      const key = this.generateKey('api', cacheKey);
      const success = await redisManager.set(key, responseData, ttl);
      
      if (success) {
        logger.debug('API response cached', { endpoint, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching API response:', { error: error.message, endpoint });
      return false;
    }
  }

  async getCachedApiResponse(endpoint, params) {
    try {
      const cacheKey = this.generateApiCacheKey(endpoint, params);
      const key = this.generateKey('api', cacheKey);
      const responseData = await redisManager.get(key);
      
      if (responseData) {
        logger.debug('API response cache hit', { endpoint });
        await this.trackCacheMetrics('api', 'hit');
      } else {
        await this.trackCacheMetrics('api', 'miss');
      }
      
      return responseData;
    } catch (error) {
      logger.error('Error retrieving cached API response:', { error: error.message, endpoint });
      return null;
    }
  }

  generateApiCacheKey(endpoint, params) {
    const sortedParams = Object.keys(params || {})
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {});
    
    return `${endpoint}:${JSON.stringify(sortedParams)}`;
  }

  // Subscription data caching
  async cacheSubscription(userId, subscriptionData, ttl = 3600) {
    try {
      const key = this.generateKey('subscription', userId);
      const success = await redisManager.set(key, subscriptionData, ttl);
      
      if (success) {
        logger.debug('Subscription data cached', { userId, ttl });
      }
      
      return success;
    } catch (error) {
      logger.error('Error caching subscription data:', { error: error.message, userId });
      return false;
    }
  }

  async getCachedSubscription(userId) {
    try {
      const key = this.generateKey('subscription', userId);
      const subscriptionData = await redisManager.get(key);
      
      if (subscriptionData) {
        logger.debug('Subscription data cache hit', { userId });
        await this.trackCacheMetrics('subscription', 'hit');
      } else {
        await this.trackCacheMetrics('subscription', 'miss');
      }
      
      return subscriptionData;
    } catch (error) {
      logger.error('Error retrieving cached subscription data:', { error: error.message, userId });
      return null;
    }
  }

  async invalidateSubscription(userId) {
    try {
      const key = this.generateKey('subscription', userId);
      const success = await redisManager.del(key);
      
      if (success) {
        logger.debug('Subscription data cache invalidated', { userId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating subscription data cache:', { error: error.message, userId });
      return false;
    }
  }

  // Cache metrics tracking
  async trackCacheMetrics(type, result) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const key = `cache_metrics:${type}:${result}:${date}`;
      await redisManager.incr(key, 86400); // 24 hours TTL
    } catch (error) {
      logger.error('Error tracking cache metrics:', { error: error.message, type, result });
    }
  }

  async getCacheMetrics(type, days = 7) {
    try {
      const metrics = {};
      const today = new Date();
      
      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const hitKey = `cache_metrics:${type}:hit:${dateStr}`;
        const missKey = `cache_metrics:${type}:miss:${dateStr}`;
        
        const hits = await redisManager.get(hitKey) || 0;
        const misses = await redisManager.get(missKey) || 0;
        const total = hits + misses;
        const hitRate = total > 0 ? (hits / total * 100).toFixed(2) : 0;
        
        metrics[dateStr] = {
          hits: parseInt(hits),
          misses: parseInt(misses),
          total,
          hitRate: parseFloat(hitRate)
        };
      }
      
      return metrics;
    } catch (error) {
      logger.error('Error retrieving cache metrics:', { error: error.message, type });
      return {};
    }
  }

  // Bulk cache operations
  async invalidatePattern(pattern) {
    try {
      const fullPattern = `${this.keyPrefix}${pattern}`;
      const success = await redisManager.deletePattern(fullPattern);
      
      if (success) {
        logger.info('Cache pattern invalidated', { pattern });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating cache pattern:', { error: error.message, pattern });
      return false;
    }
  }

  async invalidateUserCache(userId) {
    try {
      const patterns = [
        `user:${userId}`,
        `session:${userId}`,
        `subscription:${userId}`,
        `analytics:*:${userId}`
      ];
      
      let success = true;
      for (const pattern of patterns) {
        const result = await this.invalidatePattern(pattern);
        success = success && result;
      }
      
      if (success) {
        logger.info('User cache invalidated', { userId });
      }
      
      return success;
    } catch (error) {
      logger.error('Error invalidating user cache:', { error: error.message, userId });
      return false;
    }
  }

  // Cache warming
  async warmCache(type, data) {
    try {
      logger.info('Warming cache', { type });
      
      switch (type) {
        case 'popular_urls':
          for (const url of data) {
            await this.cacheUrl(url.shortCode, url, this.defaultTTL * 2);
          }
          break;
          
        case 'active_users':
          for (const user of data) {
            await this.cacheUser(user._id, user, this.defaultTTL);
          }
          break;
          
        default:
          logger.warn('Unknown cache warming type', { type });
          return false;
      }
      
      logger.info('Cache warming completed', { type, count: data.length });
      return true;
    } catch (error) {
      logger.error('Error warming cache:', { error: error.message, type });
      return false;
    }
  }

  // Cache health check
  async healthCheck() {
    try {
      const testKey = this.generateKey('health', 'check');
      const testValue = { timestamp: Date.now() };
      
      // Test write
      const writeSuccess = await redisManager.set(testKey, testValue, 60);
      if (!writeSuccess) {
        return { healthy: false, error: 'Failed to write to cache' };
      }
      
      // Test read
      const readValue = await redisManager.get(testKey);
      if (!readValue || readValue.timestamp !== testValue.timestamp) {
        return { healthy: false, error: 'Failed to read from cache' };
      }
      
      // Test delete
      const deleteSuccess = await redisManager.del(testKey);
      if (!deleteSuccess) {
        return { healthy: false, error: 'Failed to delete from cache' };
      }
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  // Get cache statistics
  async getStats() {
    try {
      const stats = redisManager.getStats();
      const health = await this.healthCheck();
      
      return {
        redis: stats,
        health,
        keyPrefix: this.keyPrefix,
        defaultTTL: this.defaultTTL
      };
    } catch (error) {
      logger.error('Error retrieving cache stats:', { error: error.message });
      return { error: error.message };
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
