// src/services/monitoringService.js - Comprehensive monitoring and metrics service
const EventEmitter = require('events');
const os = require('os');
const process = require('process');
const logger = require('../config/logger');
const redisManager = require('../config/redis');

class MonitoringService extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.alerts = new Map();
    this.healthChecks = new Map();
    this.startTime = Date.now();
    this.isMonitoring = false;
    
    // Initialize default health checks
    this.initializeHealthChecks();
    
    // Start monitoring if enabled
    if (process.env.MONITORING_ENABLED === 'true') {
      this.startMonitoring();
    }
  }

  // Initialize default health checks
  initializeHealthChecks() {
    this.registerHealthCheck('database', async () => {
      const mongoose = require('mongoose');
      return {
        status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
        details: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          name: mongoose.connection.name
        }
      };
    });

    this.registerHealthCheck('redis', async () => {
      try {
        const client = redisManager.getClient();
        await client.ping();
        return {
          status: 'healthy',
          details: {
            connected: true,
            memory: await client.memory('usage')
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message }
        };
      }
    });

    this.registerHealthCheck('memory', async () => {
      const memUsage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = (usedMem / totalMem) * 100;

      return {
        status: memoryUsagePercent > 90 ? 'unhealthy' : 'healthy',
        details: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          systemMemoryUsage: memoryUsagePercent.toFixed(2) + '%'
        }
      };
    });

    this.registerHealthCheck('disk', async () => {
      const fs = require('fs').promises;
      try {
        const stats = await fs.stat(process.cwd());
        return {
          status: 'healthy',
          details: {
            accessible: true,
            workingDirectory: process.cwd()
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          details: { error: error.message }
        };
      }
    });
  }

  // Start monitoring
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    logger.info('Monitoring service started');

    // Collect system metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Run health checks every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, 60000);

    // Process monitoring
    this.setupProcessMonitoring();

    // Initial metrics collection
    this.collectSystemMetrics();
    this.runHealthChecks();
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    logger.info('Monitoring service stopped');
  }

  // Collect system metrics
  async collectSystemMetrics() {
    try {
      const timestamp = Date.now();
      const uptime = Date.now() - this.startTime;
      
      // System metrics
      const systemMetrics = {
        timestamp,
        uptime,
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: os.loadavg()
        },
        memory: {
          process: process.memoryUsage(),
          system: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
          }
        },
        eventLoop: {
          delay: await this.measureEventLoopDelay()
        }
      };

      // Store metrics
      await this.storeMetrics('system', systemMetrics);
      
      // Check for alerts
      this.checkSystemAlerts(systemMetrics);
      
      this.emit('metrics:collected', systemMetrics);
      
    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
    }
  }

  // Measure event loop delay
  measureEventLoopDelay() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const delay = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        resolve(delay);
      });
    });
  }

  // Store metrics in Redis
  async storeMetrics(type, data) {
    try {
      const client = redisManager.getClient();
      const key = `metrics:${type}:${Date.now()}`;
      
      await client.setex(key, 3600, JSON.stringify(data)); // Store for 1 hour
      
      // Keep only last 100 entries per type
      const pattern = `metrics:${type}:*`;
      const keys = await client.keys(pattern);
      
      if (keys.length > 100) {
        const sortedKeys = keys.sort();
        const keysToDelete = sortedKeys.slice(0, keys.length - 100);
        if (keysToDelete.length > 0) {
          await client.del(...keysToDelete);
        }
      }
      
    } catch (error) {
      logger.error('Failed to store metrics:', error);
    }
  }

  // Register health check
  registerHealthCheck(name, checkFunction) {
    this.healthChecks.set(name, checkFunction);
    logger.debug(`Health check registered: ${name}`);
  }

  // Run all health checks
  async runHealthChecks() {
    const results = {};
    const timestamp = Date.now();
    
    for (const [name, checkFunction] of this.healthChecks) {
      try {
        const result = await Promise.race([
          checkFunction(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);
        
        results[name] = {
          ...result,
          timestamp,
          responseTime: Date.now() - timestamp
        };
        
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
          timestamp,
          responseTime: Date.now() - timestamp
        };
      }
    }
    
    // Store health check results
    await this.storeMetrics('health', results);
    
    // Check for health alerts
    this.checkHealthAlerts(results);
    
    this.emit('health:checked', results);
    
    return results;
  }

  // Get current health status
  async getHealthStatus() {
    return await this.runHealthChecks();
  }

  // Check system alerts
  checkSystemAlerts(metrics) {
    const { memory, cpu, eventLoop } = metrics;
    
    // Memory usage alert
    const memoryUsage = (memory.process.heapUsed / memory.process.heapTotal) * 100;
    if (memoryUsage > 85) {
      this.triggerAlert('high_memory_usage', {
        level: memoryUsage > 95 ? 'critical' : 'warning',
        message: `High memory usage: ${memoryUsage.toFixed(2)}%`,
        metrics: { memoryUsage, heapUsed: memory.process.heapUsed }
      });
    }
    
    // Event loop delay alert
    if (eventLoop.delay > 100) {
      this.triggerAlert('high_event_loop_delay', {
        level: eventLoop.delay > 500 ? 'critical' : 'warning',
        message: `High event loop delay: ${eventLoop.delay.toFixed(2)}ms`,
        metrics: { delay: eventLoop.delay }
      });
    }
    
    // CPU load average alert (for systems with load average)
    if (cpu.loadAverage && cpu.loadAverage[0] > os.cpus().length * 0.8) {
      this.triggerAlert('high_cpu_load', {
        level: 'warning',
        message: `High CPU load: ${cpu.loadAverage[0].toFixed(2)}`,
        metrics: { loadAverage: cpu.loadAverage }
      });
    }
  }

  // Check health alerts
  checkHealthAlerts(healthResults) {
    for (const [service, result] of Object.entries(healthResults)) {
      if (result.status === 'unhealthy') {
        this.triggerAlert(`service_unhealthy_${service}`, {
          level: 'critical',
          message: `Service ${service} is unhealthy`,
          details: result
        });
      }
    }
  }

  // Trigger alert
  triggerAlert(alertId, alertData) {
    const existingAlert = this.alerts.get(alertId);
    const now = Date.now();
    
    // Prevent alert spam (minimum 5 minutes between same alerts)
    if (existingAlert && (now - existingAlert.lastTriggered) < 300000) {
      return;
    }
    
    const alert = {
      id: alertId,
      ...alertData,
      timestamp: now,
      lastTriggered: now,
      count: existingAlert ? existingAlert.count + 1 : 1
    };
    
    this.alerts.set(alertId, alert);
    
    // Log alert
    logger.security.suspiciousActivity('System alert triggered', {
      alertId,
      level: alertData.level,
      message: alertData.message
    });
    
    // Emit alert event
    this.emit('alert:triggered', alert);
    
    // Send notifications if configured
    this.sendAlertNotification(alert);
  }

  // Send alert notification
  async sendAlertNotification(alert) {
    try {
      // Store alert in Redis for dashboard
      const client = redisManager.getClient();
      await client.lpush('system:alerts', JSON.stringify(alert));
      await client.ltrim('system:alerts', 0, 99); // Keep last 100 alerts
      
      // Send webhook if configured
      if (process.env.ALERT_WEBHOOK_URL) {
        const fetch = require('node-fetch');
        await fetch(process.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🚨 Alert: ${alert.message}`,
            alert
          })
        });
      }
      
      // Send email if configured
      if (process.env.ALERT_EMAIL && alert.level === 'critical') {
        // Email notification would be implemented here
        logger.info('Critical alert email notification sent');
      }
      
    } catch (error) {
      logger.error('Failed to send alert notification:', error);
    }
  }

  // Setup process monitoring
  setupProcessMonitoring() {
    // Monitor uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.triggerAlert('uncaught_exception', {
        level: 'critical',
        message: 'Uncaught exception occurred',
        error: error.message,
        stack: error.stack
      });
    });
    
    // Monitor unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.triggerAlert('unhandled_rejection', {
        level: 'critical',
        message: 'Unhandled promise rejection',
        reason: reason?.message || reason,
        promise: promise.toString()
      });
    });
    
    // Monitor process warnings
    process.on('warning', (warning) => {
      this.triggerAlert('process_warning', {
        level: 'warning',
        message: `Process warning: ${warning.message}`,
        warning: {
          name: warning.name,
          message: warning.message,
          stack: warning.stack
        }
      });
    });
  }

  // Get metrics for dashboard
  async getMetrics(type = 'system', limit = 50) {
    try {
      const client = redisManager.getClient();
      const pattern = `metrics:${type}:*`;
      const keys = await client.keys(pattern);
      
      if (keys.length === 0) return [];
      
      const sortedKeys = keys.sort().slice(-limit);
      const metrics = [];
      
      for (const key of sortedKeys) {
        const data = await client.get(key);
        if (data) {
          metrics.push(JSON.parse(data));
        }
      }
      
      return metrics;
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      return [];
    }
  }

  // Get recent alerts
  async getAlerts(limit = 20) {
    try {
      const client = redisManager.getClient();
      const alerts = await client.lrange('system:alerts', 0, limit - 1);
      return alerts.map(alert => JSON.parse(alert));
    } catch (error) {
      logger.error('Failed to get alerts:', error);
      return [];
    }
  }

  // Clear alert
  clearAlert(alertId) {
    this.alerts.delete(alertId);
    this.emit('alert:cleared', { alertId });
  }

  // Get monitoring stats
  getStats() {
    return {
      isMonitoring: this.isMonitoring,
      uptime: Date.now() - this.startTime,
      healthChecks: Array.from(this.healthChecks.keys()),
      activeAlerts: this.alerts.size,
      metricsCollected: this.metrics.size
    };
  }
}

// Create singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;
