// src/services/subscriptionService.js - Subscription and billing management service
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const logger = require('../config/logger');
const cacheService = require('./cacheService');

class SubscriptionService {
  // Get user subscription with caching
  async getUserSubscription(userId) {
    try {
      const cacheKey = `subscription:${userId}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }

      let subscription = await Subscription.findOne({ userId }).populate('userId', 'username email');
      
      if (!subscription) {
        // Create default free subscription
        subscription = await this.createDefaultSubscription(userId);
      }

      // Cache for 5 minutes
      await cacheService.set(cacheKey, subscription, 300);
      
      return subscription;
    } catch (error) {
      logger.error('Failed to get user subscription:', error);
      throw error;
    }
  }

  // Create default free subscription
  async createDefaultSubscription(userId) {
    try {
      const subscription = new Subscription({
        userId,
        tier: 'free',
        status: 'active',
        features: {
          maxUrls: 100,
          maxClicksPerMonth: 1000,
          customDomains: false,
          analytics: true,
          apiAccess: false,
          bulkOperations: false,
          passwordProtection: true,
          qrCodes: true,
          expirationDates: true
        },
        usage: {
          urlsCreated: 0,
          clicksThisMonth: 0,
          apiCallsThisMonth: 0
        }
      });

      await subscription.save();
      logger.info(`Default subscription created for user ${userId}`);
      
      return subscription;
    } catch (error) {
      logger.error('Failed to create default subscription:', error);
      throw error;
    }
  }

  // Upgrade subscription
  async upgradeSubscription(userId, newTier, paymentData = null) {
    try {
      const subscription = await this.getUserSubscription(userId);
      const oldTier = subscription.tier;

      // Update subscription tier and features
      subscription.tier = newTier;
      subscription.features = this.getTierFeatures(newTier);
      subscription.billingCycle = paymentData?.billingCycle || 'monthly';
      subscription.status = 'active';

      if (paymentData) {
        subscription.payment = {
          method: paymentData.method,
          lastPayment: new Date(),
          nextBilling: this.calculateNextBilling(paymentData.billingCycle),
          amount: this.getTierPrice(newTier, paymentData.billingCycle)
        };
      }

      await subscription.save();

      // Clear cache
      await cacheService.del(`subscription:${userId}`);

      // Log the upgrade
      logger.audit.userAction('Subscription upgraded', {
        userId,
        oldTier,
        newTier,
        paymentMethod: paymentData?.method
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to upgrade subscription:', error);
      throw error;
    }
  }

  // Downgrade subscription
  async downgradeSubscription(userId, newTier) {
    try {
      const subscription = await this.getUserSubscription(userId);
      const oldTier = subscription.tier;

      // Check if user's current usage fits within new tier limits
      const newFeatures = this.getTierFeatures(newTier);
      const usageCheck = await this.checkUsageAgainstLimits(userId, newFeatures);

      if (!usageCheck.canDowngrade) {
        throw new Error(`Cannot downgrade: ${usageCheck.reason}`);
      }

      subscription.tier = newTier;
      subscription.features = newFeatures;
      subscription.status = 'active';

      await subscription.save();

      // Clear cache
      await cacheService.del(`subscription:${userId}`);

      logger.audit.userAction('Subscription downgraded', {
        userId,
        oldTier,
        newTier
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to downgrade subscription:', error);
      throw error;
    }
  }

  // Check if user can perform action based on subscription
  async canPerformAction(userId, action, additionalData = {}) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      switch (action) {
        case 'create_url':
          return subscription.usage.urlsCreated < subscription.features.maxUrls;
          
        case 'api_call':
          return subscription.features.apiAccess && 
                 subscription.usage.apiCallsThisMonth < subscription.features.maxApiCalls;
          
        case 'bulk_operation':
          return subscription.features.bulkOperations;
          
        case 'custom_domain':
          return subscription.features.customDomains;
          
        case 'advanced_analytics':
          return subscription.features.analytics;
          
        case 'password_protection':
          return subscription.features.passwordProtection;
          
        case 'qr_code':
          return subscription.features.qrCodes;
          
        case 'set_expiration':
          return subscription.features.expirationDates;
          
        default:
          return false;
      }
    } catch (error) {
      logger.error('Failed to check subscription permissions:', error);
      return false;
    }
  }

  // Increment usage counter
  async incrementUsage(userId, usageType, amount = 1) {
    try {
      const subscription = await Subscription.findOne({ userId });
      
      if (!subscription) {
        return;
      }

      switch (usageType) {
        case 'url_created':
          subscription.usage.urlsCreated += amount;
          break;
        case 'click':
          subscription.usage.clicksThisMonth += amount;
          break;
        case 'api_call':
          subscription.usage.apiCallsThisMonth += amount;
          break;
      }

      subscription.usage.lastUpdated = new Date();
      await subscription.save();

      // Clear cache to ensure fresh data
      await cacheService.del(`subscription:${userId}`);

    } catch (error) {
      logger.error('Failed to increment usage:', error);
    }
  }

  // Reset monthly usage counters
  async resetMonthlyUsage() {
    try {
      const result = await Subscription.updateMany(
        {},
        {
          $set: {
            'usage.clicksThisMonth': 0,
            'usage.apiCallsThisMonth': 0,
            'usage.lastReset': new Date()
          }
        }
      );

      logger.info(`Reset monthly usage for ${result.modifiedCount} subscriptions`);
      
      // Clear all subscription caches
      await cacheService.invalidatePattern('subscription:*');
      
      return result;
    } catch (error) {
      logger.error('Failed to reset monthly usage:', error);
      throw error;
    }
  }

  // Get tier features
  getTierFeatures(tier) {
    const tiers = {
      free: {
        maxUrls: 100,
        maxClicksPerMonth: 1000,
        maxApiCalls: 0,
        customDomains: false,
        analytics: true,
        apiAccess: false,
        bulkOperations: false,
        passwordProtection: true,
        qrCodes: true,
        expirationDates: true,
        customBranding: false,
        teamCollaboration: false,
        priority_support: false
      },
      starter: {
        maxUrls: 1000,
        maxClicksPerMonth: 10000,
        maxApiCalls: 1000,
        customDomains: true,
        analytics: true,
        apiAccess: true,
        bulkOperations: true,
        passwordProtection: true,
        qrCodes: true,
        expirationDates: true,
        customBranding: true,
        teamCollaboration: false,
        priority_support: false
      },
      professional: {
        maxUrls: 10000,
        maxClicksPerMonth: 100000,
        maxApiCalls: 10000,
        customDomains: true,
        analytics: true,
        apiAccess: true,
        bulkOperations: true,
        passwordProtection: true,
        qrCodes: true,
        expirationDates: true,
        customBranding: true,
        teamCollaboration: true,
        priority_support: true
      },
      enterprise: {
        maxUrls: -1, // Unlimited
        maxClicksPerMonth: -1, // Unlimited
        maxApiCalls: -1, // Unlimited
        customDomains: true,
        analytics: true,
        apiAccess: true,
        bulkOperations: true,
        passwordProtection: true,
        qrCodes: true,
        expirationDates: true,
        customBranding: true,
        teamCollaboration: true,
        priority_support: true
      }
    };

    return tiers[tier] || tiers.free;
  }

  // Get tier pricing
  getTierPrice(tier, billingCycle = 'monthly') {
    const pricing = {
      free: { monthly: 0, yearly: 0 },
      starter: { monthly: 9.99, yearly: 99.99 },
      professional: { monthly: 29.99, yearly: 299.99 },
      enterprise: { monthly: 99.99, yearly: 999.99 }
    };

    return pricing[tier]?.[billingCycle] || 0;
  }

  // Calculate next billing date
  calculateNextBilling(billingCycle) {
    const now = new Date();
    
    if (billingCycle === 'yearly') {
      now.setFullYear(now.getFullYear() + 1);
    } else {
      now.setMonth(now.getMonth() + 1);
    }
    
    return now;
  }

  // Check usage against limits for downgrade
  async checkUsageAgainstLimits(userId, newFeatures) {
    try {
      const User = require('../models/User');
      const Url = require('../models/Url');
      
      const urlCount = await Url.countDocuments({ userId, status: 'active' });
      
      if (newFeatures.maxUrls !== -1 && urlCount > newFeatures.maxUrls) {
        return {
          canDowngrade: false,
          reason: `You have ${urlCount} URLs but the new tier only allows ${newFeatures.maxUrls}`
        };
      }

      return { canDowngrade: true };
    } catch (error) {
      logger.error('Failed to check usage against limits:', error);
      return { canDowngrade: false, reason: 'Unable to verify usage limits' };
    }
  }

  // Get subscription analytics
  async getSubscriptionAnalytics() {
    try {
      const pipeline = [
        {
          $group: {
            _id: '$tier',
            count: { $sum: 1 },
            totalRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'active'] },
                  '$payment.amount',
                  0
                ]
              }
            },
            activeSubscriptions: {
              $sum: {
                $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
              }
            }
          }
        },
        {
          $sort: { count: -1 }
        }
      ];

      const tierStats = await Subscription.aggregate(pipeline);
      
      const totalSubscriptions = await Subscription.countDocuments();
      const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
      const totalRevenue = tierStats.reduce((sum, tier) => sum + tier.totalRevenue, 0);

      return {
        totalSubscriptions,
        activeSubscriptions,
        totalRevenue,
        tierDistribution: tierStats
      };
    } catch (error) {
      logger.error('Failed to get subscription analytics:', error);
      throw error;
    }
  }

  // Process subscription renewals
  async processRenewals() {
    try {
      const now = new Date();
      const subscriptionsToRenew = await Subscription.find({
        status: 'active',
        'payment.nextBilling': { $lte: now }
      });

      const results = {
        processed: 0,
        failed: 0,
        errors: []
      };

      for (const subscription of subscriptionsToRenew) {
        try {
          // Process payment (integrate with payment provider)
          const paymentResult = await this.processPayment(subscription);
          
          if (paymentResult.success) {
            subscription.payment.lastPayment = now;
            subscription.payment.nextBilling = this.calculateNextBilling(subscription.billingCycle);
            await subscription.save();
            results.processed++;
          } else {
            subscription.status = 'payment_failed';
            await subscription.save();
            results.failed++;
            results.errors.push({
              userId: subscription.userId,
              error: paymentResult.error
            });
          }
        } catch (error) {
          results.failed++;
          results.errors.push({
            userId: subscription.userId,
            error: error.message
          });
        }
      }

      logger.info('Subscription renewals processed:', results);
      return results;
    } catch (error) {
      logger.error('Failed to process subscription renewals:', error);
      throw error;
    }
  }

  // Mock payment processing (integrate with actual payment provider)
  async processPayment(subscription) {
    // This would integrate with Stripe, PayPal, etc.
    // For now, return success
    return {
      success: true,
      transactionId: `txn_${Date.now()}_${subscription._id}`
    };
  }
}

module.exports = new SubscriptionService();
