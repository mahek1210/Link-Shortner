// src/controllers/auditController.js - Audit logging and reporting controller
const auditService = require('../services/auditService');
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

class AuditController {
  // Get audit logs with filtering and pagination
  async getLogs(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        page = 1,
        limit = 50,
        eventType,
        category,
        userId,
        action,
        resourceType,
        resourceId,
        severity,
        success,
        startDate,
        endDate,
        ipAddress,
        search,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        eventType,
        category,
        userId,
        action,
        resourceType,
        resourceId,
        severity,
        success: success !== undefined ? success === 'true' : undefined,
        startDate,
        endDate,
        ipAddress,
        search
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const options = {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100), // Max 100 per page
        sortBy,
        sortOrder
      };

      const result = await auditService.getLogs(filters, options);

      // Log the audit log access
      await auditService.logDataAccess(
        'audit_log',
        'multiple',
        'view_audit_logs',
        req.user.id,
        { 
          filters,
          resultCount: result.logs.length,
          page: options.page
        },
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit logs'
      });
    }
  }

  // Get audit statistics
  async getAuditStats(req, res) {
    try {
      const {
        startDate,
        endDate,
        eventType,
        category,
        userId
      } = req.query;

      const filters = {
        startDate,
        endDate,
        eventType,
        category,
        userId
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const stats = await auditService.getAuditStats(filters);

      await auditService.logDataAccess(
        'audit_stats',
        'summary',
        'view_audit_statistics',
        req.user.id,
        { filters },
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      logger.error('Failed to get audit statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit statistics'
      });
    }
  }

  // Export audit logs
  async exportLogs(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        format = 'json',
        eventType,
        category,
        userId,
        startDate,
        endDate,
        severity
      } = req.query;

      const filters = {
        eventType,
        category,
        userId,
        startDate,
        endDate,
        severity
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const exportData = await auditService.exportLogs(filters, format);

      // Log the export
      await auditService.logAdminAction(
        'audit_logs_exported',
        'Exported audit logs',
        req.user.id,
        { 
          format,
          filters,
          exportSize: exportData.length
        },
        { 
          severity: 'medium',
          ipAddress: req.ip
        }
      );

      // Set appropriate headers for download
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `audit_logs_${timestamp}.${format}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');

      res.send(exportData);

    } catch (error) {
      logger.error('Failed to export audit logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export audit logs'
      });
    }
  }

  // Get recent audit logs (cached)
  async getRecentLogs(req, res) {
    try {
      const { limit = 20 } = req.query;
      const recentLogs = await auditService.getRecentLogs(parseInt(limit));

      res.json({
        success: true,
        logs: recentLogs
      });

    } catch (error) {
      logger.error('Failed to get recent audit logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve recent audit logs'
      });
    }
  }

  // Get specific audit log by ID
  async getLogById(req, res) {
    try {
      const { logId } = req.params;

      if (!logId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid log ID format'
        });
      }

      const log = await auditService.getLogById(logId);

      if (!log) {
        return res.status(404).json({
          success: false,
          message: 'Audit log not found'
        });
      }

      // Log the access
      await auditService.logDataAccess(
        'audit_log',
        logId,
        'view_audit_log_details',
        req.user.id,
        { logId },
        { 
          category: 'admin',
          severity: 'low',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        log
      });

    } catch (error) {
      logger.error('Failed to get audit log by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit log'
      });
    }
  }

  // Clean up old audit logs
  async cleanupOldLogs(req, res) {
    try {
      const deletedCount = await auditService.cleanupOldLogs();

      await auditService.logAdminAction(
        'audit_logs_cleanup',
        'Cleaned up old audit logs',
        req.user.id,
        { deletedCount },
        { 
          severity: 'medium',
          ipAddress: req.ip
        }
      );

      res.json({
        success: true,
        message: `Successfully cleaned up ${deletedCount} old audit logs`,
        deletedCount
      });

    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup old audit logs'
      });
    }
  }

  // Get audit log categories and event types
  async getAuditMetadata(req, res) {
    try {
      const metadata = {
        eventTypes: [
          'user_action',
          'admin_action', 
          'system_event',
          'security_event',
          'data_access',
          'data_modification',
          'authentication',
          'authorization',
          'compliance',
          'error',
          'performance',
          'configuration'
        ],
        categories: [
          'auth',
          'url_management',
          'user_management',
          'subscription',
          'analytics',
          'security',
          'compliance',
          'system',
          'api',
          'admin',
          'monitoring'
        ],
        severityLevels: [
          'low',
          'medium',
          'high',
          'critical'
        ],
        resourceTypes: [
          'url',
          'user',
          'subscription',
          'api_key',
          'system',
          'config'
        ]
      };

      res.json({
        success: true,
        metadata
      });

    } catch (error) {
      logger.error('Failed to get audit metadata:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit metadata'
      });
    }
  }
}

module.exports = new AuditController();
