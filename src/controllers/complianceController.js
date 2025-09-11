// src/controllers/complianceController.js - GDPR compliance and data protection controller
const complianceService = require('../services/complianceService');
const auditService = require('../services/auditService');
const { validationResult } = require('express-validator');
const logger = require('../config/logger');

class ComplianceController {
  // Handle GDPR data export request
  async exportUserData(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { format = 'json' } = req.query;
      const requestId = `export_${Date.now()}_${userId}`;

      // Log the export request
      await auditService.logComplianceEvent(
        'gdpr_data_export_requested',
        'User requested GDPR data export',
        userId,
        { format, requestId },
        { 
          severity: 'medium',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      const exportData = await complianceService.exportUserData(userId, requestId);

      // Set appropriate headers for download
      const filename = `user_data_export_${userId}_${Date.now()}.${format}`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/plain');

      // Log successful export
      await auditService.logComplianceEvent(
        'gdpr_data_export_completed',
        'GDPR data export completed successfully',
        userId,
        { requestId, recordCount: exportData.urls.length + exportData.analytics.length },
        { severity: 'medium' }
      );

      if (format === 'json') {
        return res.json(exportData);
      } else {
        // Convert to other formats if needed
        return res.json(exportData);
      }

    } catch (error) {
      logger.error('Failed to export user data:', error);
      
      await auditService.logComplianceEvent(
        'gdpr_data_export_failed',
        'GDPR data export failed',
        req.user.id,
        { error: error.message },
        { 
          severity: 'high',
          success: false
        }
      );

      res.status(500).json({
        success: false,
        message: 'Failed to export user data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Handle GDPR data deletion request
  async deleteUserData(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { deletionType = 'full', confirmPassword } = req.body;
      const requestId = `deletion_${Date.now()}_${userId}`;

      // Verify password for security
      const user = await require('../models/User').findById(userId).select('+password');
      if (!user || !user.comparePassword(confirmPassword)) {
        await auditService.logSecurityEvent(
          'unauthorized_deletion_attempt',
          'User attempted data deletion with incorrect password',
          { userId, deletionType },
          { 
            severity: 'high',
            ipAddress: req.ip,
            success: false
          }
        );

        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }

      // Log the deletion request
      await auditService.logComplianceEvent(
        'gdpr_data_deletion_requested',
        'User requested GDPR data deletion',
        userId,
        { deletionType, requestId },
        { 
          severity: 'high',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      const deletionResult = await complianceService.deleteUserData(userId, deletionType, requestId);

      // Log successful deletion
      await auditService.logComplianceEvent(
        'gdpr_data_deletion_completed',
        'GDPR data deletion completed successfully',
        userId,
        { 
          requestId, 
          deletionType,
          deletedData: deletionResult.deletedData
        },
        { severity: 'high' }
      );

      res.json({
        success: true,
        message: 'Data deletion completed successfully',
        deletionId: deletionResult.deletionId,
        deletionType: deletionResult.deletionType,
        deletedData: deletionResult.deletedData,
        completedAt: deletionResult.completedAt
      });

    } catch (error) {
      logger.error('Failed to delete user data:', error);
      
      await auditService.logComplianceEvent(
        'gdpr_data_deletion_failed',
        'GDPR data deletion failed',
        req.user.id,
        { error: error.message },
        { 
          severity: 'critical',
          success: false
        }
      );

      res.status(500).json({
        success: false,
        message: 'Failed to delete user data',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Get user consent status
  async getUserConsent(req, res) {
    try {
      const userId = req.user.id;
      const consent = await complianceService.getUserConsent(userId);

      res.json({
        success: true,
        consent
      });

    } catch (error) {
      logger.error('Failed to get user consent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get consent status'
      });
    }
  }

  // Update user consent
  async updateUserConsent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { analytics, marketing } = req.body;

      const metadata = {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const consentRecord = await complianceService.updateUserConsent(
        userId,
        { analytics, marketing },
        metadata
      );

      res.json({
        success: true,
        message: 'Consent updated successfully',
        consent: consentRecord
      });

    } catch (error) {
      logger.error('Failed to update user consent:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update consent'
      });
    }
  }

  // Generate compliance report (admin only)
  async generateComplianceReport(req, res) {
    try {
      const report = await complianceService.generateComplianceReport();

      await auditService.logAdminAction(
        'compliance_report_generated',
        'Generated compliance report',
        req.user.id,
        { reportDate: report.generatedAt },
        { severity: 'medium' }
      );

      res.json({
        success: true,
        report
      });

    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate compliance report'
      });
    }
  }

  // Clean up expired data (admin only)
  async cleanupExpiredData(req, res) {
    try {
      const cleanupReport = await complianceService.cleanupExpiredData();

      await auditService.logAdminAction(
        'expired_data_cleanup',
        'Performed expired data cleanup',
        req.user.id,
        cleanupReport,
        { severity: 'medium' }
      );

      res.json({
        success: true,
        message: 'Data cleanup completed successfully',
        report: cleanupReport
      });

    } catch (error) {
      logger.error('Failed to cleanup expired data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup expired data'
      });
    }
  }

  // Get data processing information
  async getDataProcessingInfo(req, res) {
    try {
      const dataProcessingInfo = {
        purposes: [
          {
            purpose: 'URL Shortening Service',
            legalBasis: 'Contract (GDPR Article 6(1)(b))',
            dataTypes: ['URL data', 'User account information'],
            retention: 'Until account deletion or service termination'
          },
          {
            purpose: 'Analytics and Performance',
            legalBasis: 'Consent (GDPR Article 6(1)(a))',
            dataTypes: ['Click analytics', 'Device information', 'Geographic data'],
            retention: `${process.env.ANALYTICS_RETENTION_DAYS || 365} days`
          },
          {
            purpose: 'Security and Fraud Prevention',
            legalBasis: 'Legitimate Interest (GDPR Article 6(1)(f))',
            dataTypes: ['IP addresses (hashed)', 'Access logs', 'Security events'],
            retention: '7 years for audit purposes'
          }
        ],
        rights: [
          'Right to access your data',
          'Right to rectification',
          'Right to erasure (right to be forgotten)',
          'Right to restrict processing',
          'Right to data portability',
          'Right to object to processing',
          'Right to withdraw consent'
        ],
        contact: {
          dpo: process.env.DPO_EMAIL || 'dpo@example.com',
          support: process.env.SUPPORT_EMAIL || 'support@example.com'
        },
        lastUpdated: new Date().toISOString()
      };

      res.json({
        success: true,
        dataProcessingInfo
      });

    } catch (error) {
      logger.error('Failed to get data processing info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get data processing information'
      });
    }
  }
}

module.exports = new ComplianceController();
