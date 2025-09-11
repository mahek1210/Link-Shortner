// src/models/Subscription.js - User subscription tiers and limits
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  tier: {
    type: String,
    enum: {
      values: ['free', 'pro', 'enterprise'],
      message: 'Tier must be free, pro, or enterprise'
    },
    default: 'free',
    index: true
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'cancelled', 'expired', 'suspended'],
      message: 'Status must be active, cancelled, expired, or suspended'
    },
    default: 'active',
    index: true
  },
  limits: {
    maxUrls: {
      type: Number,
      default: function() {
        const tierLimits = {
          free: parseInt(process.env.FREE_TIER_LIMITS) || 100,
          pro: parseInt(process.env.PRO_TIER_LIMITS) || 10000,
          enterprise: -1 // Unlimited
        };
        return tierLimits[this.tier] || tierLimits.free;
      }
    },
    maxCustomDomains: {
      type: Number,
      default: function() {
        const tierLimits = {
          free: 0,
          pro: parseInt(process.env.MAX_CUSTOM_DOMAINS) || 5,
          enterprise: -1 // Unlimited
        };
        return tierLimits[this.tier] || tierLimits.free;
      }
    },
    analyticsRetentionDays: {
      type: Number,
      default: function() {
        const tierLimits = {
          free: 30,
          pro: 365,
          enterprise: -1 // Unlimited
        };
        return tierLimits[this.tier] || tierLimits.free;
      }
    },
    apiCallsPerMonth: {
      type: Number,
      default: function() {
        const tierLimits = {
          free: 1000,
          pro: 100000,
          enterprise: -1 // Unlimited
        };
        return tierLimits[this.tier] || tierLimits.free;
      }
    },
    bulkOperationsPerDay: {
      type: Number,
      default: function() {
        const tierLimits = {
          free: 1,
          pro: 10,
          enterprise: -1 // Unlimited
        };
        return tierLimits[this.tier] || tierLimits.free;
      }
    }
  },
  usage: {
    urlsCreated: {
      type: Number,
      default: 0
    },
    customDomainsUsed: {
      type: Number,
      default: 0
    },
    apiCallsThisMonth: {
      type: Number,
      default: 0
    },
    bulkOperationsToday: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  billing: {
    stripeCustomerId: {
      type: String,
      sparse: true
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true
    },
    currentPeriodStart: {
      type: Date
    },
    currentPeriodEnd: {
      type: Date
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    trialEnd: {
      type: Date
    }
  },
  features: {
    customBranding: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    passwordProtection: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    expirationDates: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    bulkOperations: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    advancedAnalytics: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    apiAccess: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    },
    teamCollaboration: {
      type: Boolean,
      default: function() {
        return this.tier === 'enterprise';
      }
    },
    whiteLabeling: {
      type: Boolean,
      default: function() {
        return this.tier === 'enterprise';
      }
    },
    prioritySupport: {
      type: Boolean,
      default: function() {
        return ['pro', 'enterprise'].includes(this.tier);
      }
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ tier: 1, status: 1 });
subscriptionSchema.index({ 'billing.currentPeriodEnd': 1 });
subscriptionSchema.index({ createdAt: -1 });

// Virtual for checking if subscription is active
subscriptionSchema.virtual('isActive').get(function() {
  return this.status === 'active' && 
         (!this.billing.currentPeriodEnd || this.billing.currentPeriodEnd > new Date());
});

// Virtual for checking if trial is active
subscriptionSchema.virtual('isTrialActive').get(function() {
  return this.billing.trialEnd && this.billing.trialEnd > new Date();
});

// Virtual for days remaining in current period
subscriptionSchema.virtual('daysRemaining').get(function() {
  if (!this.billing.currentPeriodEnd) return null;
  
  const now = new Date();
  const end = new Date(this.billing.currentPeriodEnd);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
});

// Pre-save middleware to update limits based on tier
subscriptionSchema.pre('save', function(next) {
  if (this.isModified('tier')) {
    const tierLimits = {
      free: {
        maxUrls: parseInt(process.env.FREE_TIER_LIMITS) || 100,
        maxCustomDomains: 0,
        analyticsRetentionDays: 30,
        apiCallsPerMonth: 1000,
        bulkOperationsPerDay: 1
      },
      pro: {
        maxUrls: parseInt(process.env.PRO_TIER_LIMITS) || 10000,
        maxCustomDomains: parseInt(process.env.MAX_CUSTOM_DOMAINS) || 5,
        analyticsRetentionDays: 365,
        apiCallsPerMonth: 100000,
        bulkOperationsPerDay: 10
      },
      enterprise: {
        maxUrls: -1,
        maxCustomDomains: -1,
        analyticsRetentionDays: -1,
        apiCallsPerMonth: -1,
        bulkOperationsPerDay: -1
      }
    };
    
    const limits = tierLimits[this.tier] || tierLimits.free;
    this.limits = { ...this.limits, ...limits };
    
    // Update features based on tier
    this.features.customBranding = ['pro', 'enterprise'].includes(this.tier);
    this.features.passwordProtection = ['pro', 'enterprise'].includes(this.tier);
    this.features.expirationDates = ['pro', 'enterprise'].includes(this.tier);
    this.features.bulkOperations = ['pro', 'enterprise'].includes(this.tier);
    this.features.advancedAnalytics = ['pro', 'enterprise'].includes(this.tier);
    this.features.apiAccess = ['pro', 'enterprise'].includes(this.tier);
    this.features.teamCollaboration = this.tier === 'enterprise';
    this.features.whiteLabeling = this.tier === 'enterprise';
    this.features.prioritySupport = ['pro', 'enterprise'].includes(this.tier);
  }
  
  next();
});

// Method to check if user can perform action
subscriptionSchema.methods.canPerformAction = function(action, currentCount = 0) {
  if (!this.isActive) {
    return { allowed: false, reason: 'Subscription is not active' };
  }
  
  const limits = this.limits;
  
  switch (action) {
    case 'createUrl':
      if (limits.maxUrls === -1) return { allowed: true };
      if (currentCount >= limits.maxUrls) {
        return { allowed: false, reason: `URL limit reached (${limits.maxUrls})` };
      }
      return { allowed: true };
      
    case 'addCustomDomain':
      if (limits.maxCustomDomains === -1) return { allowed: true };
      if (currentCount >= limits.maxCustomDomains) {
        return { allowed: false, reason: `Custom domain limit reached (${limits.maxCustomDomains})` };
      }
      return { allowed: true };
      
    case 'apiCall':
      if (limits.apiCallsPerMonth === -1) return { allowed: true };
      if (this.usage.apiCallsThisMonth >= limits.apiCallsPerMonth) {
        return { allowed: false, reason: `API call limit reached (${limits.apiCallsPerMonth}/month)` };
      }
      return { allowed: true };
      
    case 'bulkOperation':
      if (limits.bulkOperationsPerDay === -1) return { allowed: true };
      if (this.usage.bulkOperationsToday >= limits.bulkOperationsPerDay) {
        return { allowed: false, reason: `Bulk operation limit reached (${limits.bulkOperationsPerDay}/day)` };
      }
      return { allowed: true };
      
    default:
      return { allowed: false, reason: 'Unknown action' };
  }
};

// Method to increment usage
subscriptionSchema.methods.incrementUsage = async function(action, amount = 1) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Reset daily counters if needed
  if (this.usage.lastResetDate < today) {
    this.usage.bulkOperationsToday = 0;
    this.usage.lastResetDate = today;
  }
  
  // Reset monthly counters if needed
  if (this.usage.lastResetDate < thisMonth) {
    this.usage.apiCallsThisMonth = 0;
  }
  
  switch (action) {
    case 'createUrl':
      this.usage.urlsCreated += amount;
      break;
    case 'addCustomDomain':
      this.usage.customDomainsUsed += amount;
      break;
    case 'apiCall':
      this.usage.apiCallsThisMonth += amount;
      break;
    case 'bulkOperation':
      this.usage.bulkOperationsToday += amount;
      break;
  }
  
  return this.save();
};

// Method to get usage summary
subscriptionSchema.methods.getUsageSummary = function() {
  const limits = this.limits;
  const usage = this.usage;
  
  return {
    urls: {
      used: usage.urlsCreated,
      limit: limits.maxUrls,
      percentage: limits.maxUrls === -1 ? 0 : Math.round((usage.urlsCreated / limits.maxUrls) * 100)
    },
    customDomains: {
      used: usage.customDomainsUsed,
      limit: limits.maxCustomDomains,
      percentage: limits.maxCustomDomains === -1 ? 0 : Math.round((usage.customDomainsUsed / limits.maxCustomDomains) * 100)
    },
    apiCalls: {
      used: usage.apiCallsThisMonth,
      limit: limits.apiCallsPerMonth,
      percentage: limits.apiCallsPerMonth === -1 ? 0 : Math.round((usage.apiCallsThisMonth / limits.apiCallsPerMonth) * 100)
    },
    bulkOperations: {
      used: usage.bulkOperationsToday,
      limit: limits.bulkOperationsPerDay,
      percentage: limits.bulkOperationsPerDay === -1 ? 0 : Math.round((usage.bulkOperationsToday / limits.bulkOperationsPerDay) * 100)
    }
  };
};

// Static method to get tier pricing
subscriptionSchema.statics.getTierPricing = function() {
  return {
    free: {
      price: 0,
      currency: 'USD',
      interval: 'month',
      features: [
        '100 URLs per month',
        'Basic analytics',
        'Standard support'
      ]
    },
    pro: {
      price: 9.99,
      currency: 'USD',
      interval: 'month',
      features: [
        '10,000 URLs per month',
        'Custom domains (5)',
        'Password protection',
        'Advanced analytics',
        'API access',
        'Bulk operations',
        'Priority support'
      ]
    },
    enterprise: {
      price: 49.99,
      currency: 'USD',
      interval: 'month',
      features: [
        'Unlimited URLs',
        'Unlimited custom domains',
        'Team collaboration',
        'White labeling',
        'Advanced security',
        'Dedicated support',
        'SLA guarantee'
      ]
    }
  };
};

// Static method to create default subscription
subscriptionSchema.statics.createDefault = function(userId) {
  return this.create({
    userId,
    tier: 'free',
    status: 'active'
  });
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
