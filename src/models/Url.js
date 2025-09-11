// src/models/Url.js - Fixed URL Model with proper analytics support
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const clickHistorySchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: {
    type: String,
    default: 'unknown'
  },
  userAgent: {
    type: String,
    default: ''
  },
  referrer: {
    type: String,
    default: ''
  },
  device: {
    type: String,
    enum: ['Mobile', 'Tablet', 'Desktop', 'Unknown'],
    default: 'Unknown'
  },
  browser: {
    type: String,
    default: 'Unknown'
  },
  os: {
    type: String,
    default: 'Unknown'
  },
  country: {
    type: String,
    default: 'Unknown'
  },
  city: {
    type: String,
    default: 'Unknown'
  }
}, { _id: false });

const urlSchema = new mongoose.Schema({
  originalUrl: { 
    type: String, 
    required: true,
    trim: true
  },
  shortId: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    default: () => nanoid(8)
  },
  shortCode: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    default: () => nanoid(8)
  },
  customAlias: { 
    type: String, 
    sparse: true, // Allow multiple null values
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clicks: { 
    type: Number, 
    default: 0 
  },
  clickHistory: [clickHistorySchema],
  lastAccessed: {
    type: Date
  },
  lastClicked: {
    type: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: {
    type: Date
  },
  password: {
    type: String,
    select: false // Don't include in queries by default
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['active', 'expired', 'deleted', 'disabled', 'flagged'],
    default: 'active',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  qrCode: {
    type: String, // Base64 encoded QR code
    default: null
  },
  
  // Content moderation fields
  moderationFlags: [{
    type: String,
    enum: ['suspicious_pattern', 'blocked_domain', 'malicious_keywords', 'poor_reputation', 'nested_shortener', 'suspicious_user']
  }],
  moderationScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  disabledReason: {
    type: String,
    default: null
  },
  disabledAt: {
    type: Date,
    default: null
  },
  reportCount: {
    type: Number,
    default: 0
  },
  reports: [{
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reportType: {
      type: String,
      enum: ['malicious', 'spam', 'phishing', 'malware', 'inappropriate', 'copyright'],
      required: true
    },
    description: String,
    category: {
      type: String,
      enum: ['security', 'content', 'legal', 'other'],
      default: 'other'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
      default: 'pending'
    },
    ipHash: String
  }]
}, {
  timestamps: true, // Automatically manage createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
urlSchema.index({ userId: 1, createdAt: -1 });
urlSchema.index({ lastAccessed: 1 });
urlSchema.index({ clicks: -1 });
urlSchema.index({ isActive: 1 });

// Virtual for unique visitors count
urlSchema.virtual('uniqueVisitors').get(function() {
  if (!this.clickHistory || this.clickHistory.length === 0) {
    return 0;
  }
  const uniqueIPs = [...new Set(this.clickHistory.map(click => click.ip))];
  return uniqueIPs.length;
});

// Virtual for recent clicks (last 7 days)
urlSchema.virtual('recentClicks').get(function() {
  if (!this.clickHistory || this.clickHistory.length === 0) {
    return [];
  }
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  return this.clickHistory.filter(click => 
    new Date(click.timestamp) >= sevenDaysAgo
  );
});

// Pre-save middleware
urlSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-mark expired URLs (don't delete, just mark as expired)
  if (this.expiresAt && new Date() > this.expiresAt && this.status === 'active') {
    this.status = 'expired';
    this.isActive = false;
  }
  
  next();
});

// Static method to find active URLs
urlSchema.statics.findActive = function() {
  return this.find({ 
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Instance method to check if URL is expired
urlSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

// Instance method to check if URL requires password
urlSchema.methods.requiresPassword = function() {
  return !!this.password;
};

// Instance method to verify password
urlSchema.methods.verifyPassword = function(inputPassword) {
  return this.password === inputPassword;
};

// Instance method to get analytics summary
urlSchema.methods.getAnalyticsSummary = function() {
  const summary = {
    totalClicks: this.clicks || 0,
    uniqueVisitors: this.uniqueVisitors,
    recentClicks: this.recentClicks.length,
    lastAccessed: this.lastAccessed,
    isActive: this.isActive && !this.isExpired()
  };
  
  if (this.clickHistory && this.clickHistory.length > 0) {
    // Browser stats
    const browserCount = {};
    this.clickHistory.forEach(click => {
      browserCount[click.browser] = (browserCount[click.browser] || 0) + 1;
    });
    summary.topBrowser = Object.entries(browserCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';
    
    // Device stats
    const deviceCount = {};
    this.clickHistory.forEach(click => {
      deviceCount[click.device] = (deviceCount[click.device] || 0) + 1;
    });
    summary.topDevice = Object.entries(deviceCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';
    
    // Geographic stats
    const countryCount = {};
    this.clickHistory.forEach(click => {
      const country = click.country || 'Unknown';
      countryCount[country] = (countryCount[country] || 0) + 1;
    });
    summary.topCountry = Object.entries(countryCount)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'Unknown';
  }
  
  return summary;
};

// Instance method to add click
urlSchema.methods.addClick = function(clickData = {}) {
  const click = {
    timestamp: new Date(),
    ip: clickData.ip || 'unknown',
    userAgent: clickData.userAgent || '',
    referrer: clickData.referrer || '',
    device: clickData.device || 'Unknown',
    browser: clickData.browser || 'Unknown',
    os: clickData.os || 'Unknown',
    country: clickData.country || 'Unknown',
    city: clickData.city || 'Unknown'
  };
  
  this.clickHistory.push(click);
  this.clicks = this.clickHistory.length;
  this.lastAccessed = new Date();
  
  return this.save();
};

// Clean up old click history (keep last 1000 clicks per URL)
urlSchema.pre('save', function(next) {
  if (this.clickHistory && this.clickHistory.length > 1000) {
    // Keep only the most recent 1000 clicks
    this.clickHistory = this.clickHistory.slice(-1000);
  }
  next();
});

module.exports = mongoose.model('Url', urlSchema);