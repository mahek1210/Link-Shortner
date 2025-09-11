// src/config/redis.js - Enhanced Redis configuration with connection pooling and retry logic
const Redis = require('ioredis');
const logger = require('./logger');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.memoryCache = new Map(); // Fallback memory cache
    this.connectionPool = null;
    this.healthCheckInterval = null;
  }

  async connect() {
    try {
      // Check if Redis is enabled
      if (process.env.REDIS_ENABLED === 'false') {
        logger.info('Redis disabled, using memory-based caching');
        this.isConnected = false;
        this.startMemoryCacheCleanup();
        return null;
      }

      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB) || 0,
        
        // Enhanced connection settings
        connectTimeout: 10000,
        commandTimeout: 5000,
        lazyConnect: true,
        keepAlive: 30000,
        enableReadyCheck: true,
        
        // Retry configuration
        retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 2000,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
        
        // Connection pool settings
        family: 4,
        enableOfflineQueue: false,
        
        // TLS configuration for Upstash
        tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
        
        // Retry strategy
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
          return times > 10 ? null : delay;
        },
        
        // Reconnect on error
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          return err.message.includes(targetError);
        }
      };

      // Parse Redis URL if provided (Upstash format)
      if (process.env.REDIS_URL) {
        logger.info('Connecting to Redis using URL (Upstash)');
        this.client = new Redis(process.env.REDIS_URL, redisConfig);
      } else {
        logger.info('Connecting to Redis using host/port configuration');
        this.client = new Redis(redisConfig);
      }

      // Enhanced event handlers
      this.client.on('connect', () => {
        logger.info('✅ Redis connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis ready to accept commands');
        this.isConnected = true;
        this.startHealthCheck();
      });

      this.client.on('error', (error) => {
        logger.warn('⚠️ Redis connection error, falling back to memory cache:', { 
          error: error.message,
          code: error.code,
          errno: error.errno 
        });
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('⚠️ Redis connection closed, using memory cache');
        this.isConnected = false;
        this.stopHealthCheck();
      });

      this.client.on('reconnecting', (time) => {
        this.reconnectAttempts++;
        logger.info(`🔄 Redis reconnecting in ${time}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          logger.warn('❌ Max Redis reconnection attempts reached, using memory cache only');
          this.client.disconnect();
          this.isConnected = false;
        }
      });

      this.client.on('end', () => {
        logger.warn('Redis connection ended');
        this.isConnected = false;
      });

      // Test connection with timeout and retry
      await this.testConnection();
      
      return this.client;
    } catch (error) {
      logger.warn('❌ Failed to connect to Redis, using memory cache:', { 
        error: error.message,
        stack: error.stack 
      });
      this.isConnected = false;
      this.client = null;
      this.startMemoryCacheCleanup();
      return null;
    }
  }

  async testConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const connectionPromise = this.client.ping();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
        });

        const result = await Promise.race([connectionPromise, timeoutPromise]);
        if (result === 'PONG') {
          logger.info('✅ Redis connection test successful');
          this.isConnected = true;
          return true;
        }
      } catch (error) {
        logger.warn(`Redis connection test failed (attempt ${i + 1}/${retries}):`, error.message);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    throw new Error('Redis connection test failed after all retries');
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.client && this.isConnected) {
          await this.client.ping();
        }
      } catch (error) {
        logger.warn('Redis health check failed:', error.message);
        this.isConnected = false;
      }
    }, 30000); // Check every 30 seconds
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  startMemoryCacheCleanup() {
    // Clean up memory cache every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.memoryCache.entries()) {
        if (value.expiry && value.expiry < now) {
          this.memoryCache.delete(key);
        }
      }
    }, 300000);
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      logger.info('Redis connection closed');
    }
  }

  getClient() {
    return this.client;
  }

  isHealthy() {
    return this.isConnected && this.client && this.client.status === 'ready';
  }

  // Enhanced cache operations with memory fallback
  async set(key, value, ttl = 3600) {
    try {
      if (this.isHealthy()) {
        const serializedValue = JSON.stringify(value);
        if (ttl) {
          await this.client.setex(key, ttl, serializedValue);
        } else {
          await this.client.set(key, serializedValue);
        }
        return true;
      } else {
        // Fallback to memory cache
        const expiry = ttl ? Date.now() + (ttl * 1000) : null;
        this.memoryCache.set(key, { value, expiry });
        logger.debug('Using memory cache for SET operation:', key);
        return true;
      }
    } catch (error) {
      logger.error('Redis SET error, falling back to memory:', { key, error: error.message });
      // Fallback to memory cache on error
      const expiry = ttl ? Date.now() + (ttl * 1000) : null;
      this.memoryCache.set(key, { value, expiry });
      return true;
    }
  }

  async get(key) {
    try {
      if (this.isHealthy()) {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Fallback to memory cache
        const cached = this.memoryCache.get(key);
        if (cached) {
          if (!cached.expiry || cached.expiry > Date.now()) {
            logger.debug('Using memory cache for GET operation:', key);
            return cached.value;
          } else {
            this.memoryCache.delete(key);
          }
        }
        return null;
      }
    } catch (error) {
      logger.error('Redis GET error, checking memory cache:', { key, error: error.message });
      // Fallback to memory cache on error
      const cached = this.memoryCache.get(key);
      if (cached && (!cached.expiry || cached.expiry > Date.now())) {
        return cached.value;
      }
      return null;
    }
  }

  async del(key) {
    try {
      if (this.isHealthy()) {
        await this.client.del(key);
      }
      // Always delete from memory cache as well
      this.memoryCache.delete(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error, removing from memory cache:', { key, error: error.message });
      this.memoryCache.delete(key);
      return true;
    }
  }

  async exists(key) {
    try {
      if (!this.isHealthy()) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error:', { key, error: error.message });
      return false;
    }
  }

  async incr(key, ttl = null) {
    try {
      if (!this.isHealthy()) {
        logger.warn('Redis not available for INCR operation');
        return null;
      }

      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Redis INCR error:', { key, error: error.message });
      return null;
    }
  }

  async expire(key, ttl) {
    try {
      if (!this.isHealthy()) {
        return false;
      }

      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Redis EXPIRE error:', { key, ttl, error: error.message });
      return false;
    }
  }

  // Hash operations for complex data
  async hset(key, field, value, ttl = null) {
    try {
      if (!this.isHealthy()) {
        return false;
      }

      await this.client.hset(key, field, JSON.stringify(value));
      if (ttl) {
        await this.client.expire(key, ttl);
      }
      return true;
    } catch (error) {
      logger.error('Redis HSET error:', { key, field, error: error.message });
      return false;
    }
  }

  async hget(key, field) {
    try {
      if (!this.isHealthy()) {
        return null;
      }

      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis HGET error:', { key, field, error: error.message });
      return null;
    }
  }

  async hgetall(key) {
    try {
      if (!this.isHealthy()) {
        return {};
      }

      const hash = await this.client.hgetall(key);
      const result = {};
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Redis HGETALL error:', { key, error: error.message });
      return {};
    }
  }

  // List operations for queues
  async lpush(key, value) {
    try {
      if (!this.isHealthy()) {
        return false;
      }

      await this.client.lpush(key, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis LPUSH error:', { key, error: error.message });
      return false;
    }
  }

  async rpop(key) {
    try {
      if (!this.isHealthy()) {
        return null;
      }

      const value = await this.client.rpop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis RPOP error:', { key, error: error.message });
      return null;
    }
  }

  // Pattern-based operations
  async keys(pattern) {
    try {
      if (!this.isHealthy()) {
        return [];
      }

      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error:', { pattern, error: error.message });
      return [];
    }
  }

  async deletePattern(pattern) {
    try {
      if (!this.isHealthy()) {
        return false;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis DELETE PATTERN error:', { pattern, error: error.message });
      return false;
    }
  }

  // Health check
  async ping() {
    try {
      if (!this.client) {
        return false;
      }
      
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis PING error:', { error: error.message });
      return false;
    }
  }

  // Get connection stats
  getStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      status: this.client ? this.client.status : 'disconnected'
    };
  }
}

// Create singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;
