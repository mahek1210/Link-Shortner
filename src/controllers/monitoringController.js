// src/controllers/monitoringController.js - Monitoring and health check endpoints
const monitoringService = require('../services/monitoringService');
const logger = require('../config/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');

class MonitoringController {
  // Get system health status
  async getHealth(req, res) {
    try {
      const healthStatus = await monitoringService.getHealthStatus();
      const overallStatus = Object.values(healthStatus).every(check => check.status === 'healthy') 
        ? 'healthy' : 'unhealthy';

      res.status(overallStatus === 'healthy' ? 200 : 503).json({
        success: true,
        status: overallStatus,
        timestamp: Date.now(),
        checks: healthStatus,
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: Date.now()
      });
    }
  }

  // Get detailed system metrics
  async getMetrics(req, res) {
    try {
      const { type = 'system', limit = 50 } = req.query;
      
      if (!['system', 'health', 'api', 'database'].includes(type)) {
        throw new ValidationError('Invalid metrics type');
      }

      const metrics = await monitoringService.getMetrics(type, parseInt(limit));
      const stats = monitoringService.getStats();

      res.json({
        success: true,
        data: {
          metrics,
          stats,
          type,
          count: metrics.length
        }
      });
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      throw error;
    }
  }

  // Get system alerts
  async getAlerts(req, res) {
    try {
      const { limit = 20 } = req.query;
      const alerts = await monitoringService.getAlerts(parseInt(limit));

      res.json({
        success: true,
        data: {
          alerts,
          count: alerts.length
        }
      });
    } catch (error) {
      logger.error('Failed to get alerts:', error);
      throw error;
    }
  }

  // Clear specific alert
  async clearAlert(req, res) {
    try {
      const { alertId } = req.params;
      
      if (!alertId) {
        throw new ValidationError('Alert ID is required');
      }

      monitoringService.clearAlert(alertId);

      logger.audit.adminAction('Alert cleared', {
        alertId,
        adminId: req.user.id,
        timestamp: Date.now()
      });

      res.json({
        success: true,
        message: 'Alert cleared successfully'
      });
    } catch (error) {
      logger.error('Failed to clear alert:', error);
      throw error;
    }
  }

  // Get monitoring dashboard data
  async getDashboard(req, res) {
    try {
      const [
        healthStatus,
        systemMetrics,
        alerts,
        stats
      ] = await Promise.all([
        monitoringService.getHealthStatus(),
        monitoringService.getMetrics('system', 10),
        monitoringService.getAlerts(10),
        Promise.resolve(monitoringService.getStats())
      ]);

      // Calculate summary statistics
      const summary = {
        overallHealth: Object.values(healthStatus).every(check => check.status === 'healthy') 
          ? 'healthy' : 'unhealthy',
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter(alert => alert.level === 'critical').length,
        uptime: stats.uptime,
        lastMetricsUpdate: systemMetrics.length > 0 ? systemMetrics[systemMetrics.length - 1].timestamp : null
      };

      res.json({
        success: true,
        data: {
          summary,
          health: healthStatus,
          metrics: systemMetrics,
          alerts: alerts.slice(0, 5), // Latest 5 alerts
          stats
        }
      });
    } catch (error) {
      logger.error('Failed to get monitoring dashboard:', error);
      throw error;
    }
  }

  // Get performance metrics
  async getPerformanceMetrics(req, res) {
    try {
      const { timeRange = '1h' } = req.query;
      
      // Calculate time range in milliseconds
      const timeRanges = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000
      };

      const rangeMs = timeRanges[timeRange] || timeRanges['1h'];
      const cutoffTime = Date.now() - rangeMs;

      const metrics = await monitoringService.getMetrics('system', 1000);
      const filteredMetrics = metrics.filter(metric => metric.timestamp >= cutoffTime);

      // Calculate performance statistics
      const performanceStats = this.calculatePerformanceStats(filteredMetrics);

      res.json({
        success: true,
        data: {
          timeRange,
          metrics: filteredMetrics,
          stats: performanceStats,
          count: filteredMetrics.length
        }
      });
    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  // Calculate performance statistics
  calculatePerformanceStats(metrics) {
    if (metrics.length === 0) {
      return {
        avgMemoryUsage: 0,
        avgEventLoopDelay: 0,
        maxMemoryUsage: 0,
        maxEventLoopDelay: 0,
        dataPoints: 0
      };
    }

    const memoryUsages = metrics.map(m => (m.memory.process.heapUsed / m.memory.process.heapTotal) * 100);
    const eventLoopDelays = metrics.map(m => m.eventLoop.delay);

    return {
      avgMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      avgEventLoopDelay: eventLoopDelays.reduce((a, b) => a + b, 0) / eventLoopDelays.length,
      maxMemoryUsage: Math.max(...memoryUsages),
      maxEventLoopDelay: Math.max(...eventLoopDelays),
      minMemoryUsage: Math.min(...memoryUsages),
      minEventLoopDelay: Math.min(...eventLoopDelays),
      dataPoints: metrics.length
    };
  }

  // Get API performance metrics
  async getApiMetrics(req, res) {
    try {
      const redisManager = require('../config/redis');
      const client = redisManager.getClient();
      
      // Get API metrics from Redis
      const apiMetrics = await client.hgetall('api:metrics');
      const errorMetrics = await client.hgetall('api:errors');
      
      // Get recent API calls
      const recentCalls = await client.lrange('api:recent_calls', 0, 99);
      const parsedCalls = recentCalls.map(call => JSON.parse(call));

      // Calculate API statistics
      const stats = {
        totalRequests: Object.values(apiMetrics).reduce((sum, count) => sum + parseInt(count || 0), 0),
        totalErrors: Object.values(errorMetrics).reduce((sum, count) => sum + parseInt(count || 0), 0),
        endpoints: Object.keys(apiMetrics).length,
        recentCallsCount: parsedCalls.length
      };

      res.json({
        success: true,
        data: {
          metrics: apiMetrics,
          errors: errorMetrics,
          recentCalls: parsedCalls.slice(0, 20),
          stats
        }
      });
    } catch (error) {
      logger.error('Failed to get API metrics:', error);
      throw error;
    }
  }

  // Test alert system
  async testAlert(req, res) {
    try {
      const { level = 'info', message = 'Test alert' } = req.body;
      
      if (!['info', 'warning', 'critical'].includes(level)) {
        throw new ValidationError('Invalid alert level');
      }

      // Trigger test alert
      monitoringService.triggerAlert('test_alert', {
        level,
        message: `${message} (triggered by ${req.user.username})`,
        testAlert: true,
        triggeredBy: req.user.id
      });

      logger.audit.adminAction('Test alert triggered', {
        level,
        message,
        adminId: req.user.id
      });

      res.json({
        success: true,
        message: 'Test alert triggered successfully'
      });
    } catch (error) {
      logger.error('Failed to trigger test alert:', error);
      throw error;
    }
  }

  // Get system information
  async getSystemInfo(req, res) {
    try {
      const os = require('os');
      const process = require('process');

      const systemInfo = {
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime()
        },
        system: {
          hostname: os.hostname(),
          type: os.type(),
          release: os.release(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
          loadAverage: os.loadavg()
        },
        application: {
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV,
          startTime: new Date(Date.now() - (process.uptime() * 1000)).toISOString(),
          pid: process.pid
        }
      };

      res.json({
        success: true,
        data: systemInfo
      });
    } catch (error) {
      logger.error('Failed to get system info:', error);
      throw error;
    }
  }
}

module.exports = new MonitoringController();
