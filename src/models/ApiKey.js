// src/models/ApiKey.js
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  keyId: {
    type: String,
    required: true,
    unique: true,
    default: () => `ak_${nanoid(32)}`
  },
  keySecret: {
    type: String,
    required: true,
    select: false // Don't include in queries by default
  },
  permissions: [{
    type: String,
    enum: ['create_url', 'read_url', 'update_url', 'delete_url', 'read_analytics'],
    default: ['create_url', 'read_url']
  }],
  rateLimit: {
    requestsPerHour: {
      type: Number,
      default: 1000,
      min: 1,
      max: 10000
    },
    requestsPerDay: {
      type: Number,
      default: 10000,
      min: 1,
      max: 100000
    }
  },
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date
    },
    requestsToday: {
      type: Number,
      default: 0
    },
    requestsThisHour: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    lastResetHour: {
      type: Number,
      default: () => new Date().getHours()
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date
  },
  allowedDomains: [{
    type: String,
    trim: true
  }],
  allowedIPs: [{
    type: String,
    trim: true
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastRotated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
apiKeySchema.index({ userId: 1, isActive: 1 });
apiKeySchema.index({ keyId: 1 }, { unique: true });
apiKeySchema.index({ expiresAt: 1 }, { sparse: true });

// Method to check if API key has permission
apiKeySchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

// Method to check rate limits
apiKeySchema.methods.checkRateLimit = function() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDate = now.toDateString();
  
  // Reset hourly counter if hour changed
  if (this.usage.lastResetHour !== currentHour) {
    this.usage.requestsThisHour = 0;
    this.usage.lastResetHour = currentHour;
  }
  
  // Reset daily counter if date changed
  if (this.usage.lastResetDate.toDateString() !== currentDate) {
    this.usage.requestsToday = 0;
    this.usage.lastResetDate = now;
  }
  
  // Check limits
  if (this.usage.requestsThisHour >= this.rateLimit.requestsPerHour) {
    return { allowed: false, reason: 'Hourly rate limit exceeded' };
  }
  
  if (this.usage.requestsToday >= this.rateLimit.requestsPerDay) {
    return { allowed: false, reason: 'Daily rate limit exceeded' };
  }
  
  return { allowed: true };
};

// Method to increment usage
apiKeySchema.methods.incrementUsage = function() {
  this.usage.totalRequests += 1;
  this.usage.requestsThisHour += 1;
  this.usage.requestsToday += 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
