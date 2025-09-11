// src/services/auditService.js - Comprehensive audit logging service
const mongoose = require('mongoose');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      'user_action', 'admin_action', 'system_event', 'security_event',
      'data_access', 'data_modification', 'authentication', 'authorization',
      'compliance', 'error', 'performance', 'configuration'
    ]
  },
  category: {
    type: String,
    required: true,
    enum: [
      'auth', 'url_management', 'user_management', 'subscription', 'analytics',
      'security', 'compliance', 'system', 'api', 'admin', 'monitoring'
    ]
  },
  action: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resourceId: {
    type: String,
    default: null
  },
  resourceType: {
    type: String,
    enum: ['url', 'user', 'subscription', 'api_key', 'system', 'config', 'api', 'auth'],
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  sessionId: {
    type: String,
    default: null
  },
  requestId: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  beforeState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  afterState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default retention: 7 years for compliance
      return new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000));
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ resourceId: 1, resourceType: 1 });
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

class AuditService {
  constructor() {
    this.sensitiveFields = [
      'password', 'token', 'secret', 'key', 'hash',
      'ssn', 'creditCard', 'bankAccount', 'pin'
    ];
  }

  // Log user action
  async logUserAction(action, description, userId, metadata = {}, options = {}) {
    return this.log({
      eventType: 'user_action',
      category: options.category || 'user_management',
      action,
      description,
      userId,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'low',
      ...options
    });
  }

  // Log admin action
  async logAdminAction(action, description, adminId, metadata = {}, options = {}) {
    return this.log({
      eventType: 'admin_action',
      category: options.category || 'admin',
      action,
      description,
      userId: adminId,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'medium',
      ...options
    });
  }

  // Log system event
  async logSystemEvent(action, description, metadata = {}, options = {}) {
    return this.log({
      eventType: 'system_event',
      category: options.category || 'system',
      action,
      description,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'low',
      ...options
    });
  }

  // Log security event
  async logSecurityEvent(action, description, metadata = {}, options = {}) {
    return this.log({
      eventType: 'security_event',
      category: 'security',
      action,
      description,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'high',
      ...options
    });
  }

  // Log authentication event
  async logAuthEvent(action, description, userId, metadata = {}, options = {}) {
    return this.log({
      eventType: 'authentication',
      category: 'auth',
      action,
      description,
      userId,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'medium',
      ...options
    });
  }

  // Log data access
  async logDataAccess(resourceType, resourceId, action, userId, metadata = {}, options = {}) {
    return this.log({
      eventType: 'data_access',
      category: options.category || 'api',
      action,
      description: `${action} ${resourceType} ${resourceId}`,
      userId,
      resourceType,
      resourceId,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'low',
      ...options
    });
  }

  // Log data modification
  async logDataModification(resourceType, resourceId, action, userId, beforeState, afterState, options = {}) {
    return this.log({
      eventType: 'data_modification',
      category: options.category || 'api',
      action,
      description: `${action} ${resourceType} ${resourceId}`,
      userId,
      resourceType,
      resourceId,
      beforeState: this.sanitizeMetadata(beforeState),
      afterState: this.sanitizeMetadata(afterState),
      metadata: this.sanitizeMetadata(options.metadata || {}),
      severity: options.severity || 'medium',
      ...options
    });
  }

  // Log compliance event
  async logComplianceEvent(action, description, userId, metadata = {}, options = {}) {
    return this.log({
      eventType: 'compliance',
      category: 'compliance',
      action,
      description,
      userId,
      metadata: this.sanitizeMetadata(metadata),
      severity: options.severity || 'high',
      ...options
    });
  }

  // Generic log method
  async log(logData) {
    try {
      // Skip audit logging in development
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Audit log skipped (dev mode):', logData);
        return null;
      }

      // Validate required fields
      if (!logData.eventType || !logData.category) {
        throw new Error('eventType and category are required for audit logging');
      }

      // Create audit log entry
      const auditLog = new AuditLog({
        ...logData,
        timestamp: new Date(),
        ipAddress: logData.ipAddress || null,
        userAgent: logData.userAgent || null
      });

      await auditLog.save();
      
      // Cache recent logs for quick access
      await this.cacheRecentLog(auditLog);
      
      logger.debug('Audit log created:', { 
        id: auditLog._id, 
        eventType: logData.eventType,
        category: logData.category 
      });
      
      return auditLog;
    } catch (error) {
      logger.warn('Audit log error (non-critical):', error.message);
      // Don't throw - let the main operation continue
      return null;
    }
  }

  // Get audit logs with filtering and pagination
  async getLogs(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = options;

      const query = this.buildQuery(filters);
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('userId', 'username email')
          .populate('targetUserId', 'username email')
          .lean(),
        AuditLog.countDocuments(query)
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  // Build MongoDB query from filters
  buildQuery(filters) {
    const query = {};

    if (filters.eventType) {
      query.eventType = filters.eventType;
    }

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.userId) {
      query.userId = filters.userId;
    }

    if (filters.action) {
      query.action = new RegExp(filters.action, 'i');
    }

    if (filters.resourceType) {
      query.resourceType = filters.resourceType;
    }

    if (filters.resourceId) {
      query.resourceId = filters.resourceId;
    }

    if (filters.severity) {
      query.severity = filters.severity;
    }

    if (filters.success !== undefined) {
      query.success = filters.success;
    }

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        query.timestamp.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.timestamp.$lte = new Date(filters.endDate);
      }
    }

    if (filters.ipAddress) {
      query.ipAddress = filters.ipAddress;
    }

    if (filters.search) {
      query.$or = [
        { description: new RegExp(filters.search, 'i') },
        { action: new RegExp(filters.search, 'i') }
      ];
    }

    return query;
  }

  // Get audit statistics
  async getAuditStats(filters = {}) {
    try {
      const query = this.buildQuery(filters);

      const pipeline = [
        { $match: query },
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            successfulActions: {
              $sum: { $cond: ['$success', 1, 0] }
            },
            failedActions: {
              $sum: { $cond: ['$success', 0, 1] }
            },
            criticalEvents: {
              $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
            },
            highSeverityEvents: {
              $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] }
            },
            securityEvents: {
              $sum: { $cond: [{ $eq: ['$eventType', 'security_event'] }, 1, 0] }
            },
            userActions: {
              $sum: { $cond: [{ $eq: ['$eventType', 'user_action'] }, 1, 0] }
            },
            adminActions: {
              $sum: { $cond: [{ $eq: ['$eventType', 'admin_action'] }, 1, 0] }
            }
          }
        }
      ];

      const [stats] = await AuditLog.aggregate(pipeline);

      // Get category breakdown
      const categoryStats = await AuditLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Get top users by activity
      const topUsers = await AuditLog.aggregate([
        { $match: { ...query, userId: { $ne: null } } },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $project: {
            userId: '$_id',
            count: 1,
            username: { $arrayElemAt: ['$user.username', 0] }
          }
        }
      ]);

      return {
        summary: stats || {
          totalLogs: 0,
          successfulActions: 0,
          failedActions: 0,
          criticalEvents: 0,
          highSeverityEvents: 0,
          securityEvents: 0,
          userActions: 0,
          adminActions: 0
        },
        categoryBreakdown: categoryStats,
        topUsers
      };

    } catch (error) {
      logger.error('Failed to get audit statistics:', error);
      throw error;
    }
  }

  // Export audit logs
  async exportLogs(filters = {}, format = 'json') {
    try {
      const query = this.buildQuery(filters);
      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .populate('userId', 'username email')
        .populate('targetUserId', 'username email')
        .lean();

      switch (format.toLowerCase()) {
        case 'csv':
          return this.exportToCSV(logs);
        case 'json':
          return this.exportToJSON(logs);
        default:
          throw new Error('Unsupported export format');
      }

    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      throw error;
    }
  }

  // Export to CSV format
  exportToCSV(logs) {
    const headers = [
      'Timestamp', 'Event Type', 'Category', 'Action', 'Description',
      'User ID', 'Username', 'Resource Type', 'Resource ID',
      'IP Address', 'Success', 'Severity'
    ];

    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.eventType,
      log.category,
      log.action,
      log.description,
      log.userId || '',
      log.userId?.username || '',
      log.resourceType || '',
      log.resourceId || '',
      log.ipAddress || '',
      log.success,
      log.severity
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  // Export to JSON format
  exportToJSON(logs) {
    return JSON.stringify({
      exportDate: new Date().toISOString(),
      totalRecords: logs.length,
      logs: logs.map(log => ({
        id: log._id,
        timestamp: log.timestamp,
        eventType: log.eventType,
        category: log.category,
        action: log.action,
        description: log.description,
        userId: log.userId,
        username: log.userId?.username,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        ipAddress: log.ipAddress,
        success: log.success,
        severity: log.severity,
        metadata: log.metadata
      }))
    }, null, 2);
  }

  // Cache recent logs for quick access
  async cacheRecentLog(auditLog) {
    try {
      const cacheKey = 'audit:recent';
      const recentLogs = await cacheService.get(cacheKey) || [];
      
      recentLogs.unshift({
        id: auditLog._id,
        timestamp: auditLog.timestamp,
        eventType: auditLog.eventType,
        action: auditLog.action,
        description: auditLog.description,
        severity: auditLog.severity
      });

      // Keep only last 100 logs
      if (recentLogs.length > 100) {
        recentLogs.splice(100);
      }

      await cacheService.set(cacheKey, recentLogs, 3600); // Cache for 1 hour

    } catch (error) {
      logger.error('Failed to cache recent log:', error);
    }
  }

  // Get recent logs from cache
  async getRecentLogs(limit = 20) {
    try {
      const recentLogs = await cacheService.get('audit:recent') || [];
      return recentLogs.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get recent logs:', error);
      return [];
    }
  }

  // Sanitize metadata to remove sensitive information
  sanitizeMetadata(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      const lowercaseKey = key.toLowerCase();
      
      if (this.sensitiveFields.some(field => lowercaseKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // Get request context (would be set by middleware)
  getRequestContext() {
    // This would typically be set by middleware using async local storage
    // For now, return null
    return null;
  }

  // Clean up old audit logs based on retention policy
  async cleanupOldLogs() {
    try {
      const result = await AuditLog.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      logger.info(`Cleaned up ${result.deletedCount} expired audit logs`);
      return result.deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error);
      throw error;
    }
  }

  // Get audit log by ID
  async getLogById(logId) {
    try {
      const log = await AuditLog.findById(logId)
        .populate('userId', 'username email')
        .populate('targetUserId', 'username email')
        .lean();

      return log;

    } catch (error) {
      logger.error('Failed to get audit log by ID:', error);
      throw error;
    }
  }
}

module.exports = new AuditService();
