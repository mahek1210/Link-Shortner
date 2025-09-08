// src/models/Analytics.js - Enhanced Analytics Model for Advanced Tracking
const mongoose = require('mongoose');

// Individual click tracking schema
const clickSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ip: {
    type: String,
    required: true
  },
  hashedIp: {
    type: String, // For privacy-compliant unique visitor tracking
    required: true,
    index: true
  },
  userAgent: {
    type: String,
    required: true
  },
  referrer: {
    type: String,
    default: null
  },
  referrerCategory: {
    type: String,
    enum: ['direct', 'social', 'search', 'email', 'ads', 'other'],
    default: 'direct'
  },
  // Geographic data
  country: {
    type: String,
    default: 'Unknown'
  },
  countryCode: {
    type: String,
    default: 'XX'
  },
  region: {
    type: String,
    default: 'Unknown'
  },
  city: {
    type: String,
    default: 'Unknown'
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  coordinates: {
    lat: Number,
    lng: Number
  },
  // Device information
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'smart-tv', 'wearable', 'unknown'],
    default: 'unknown'
  },
  deviceBrand: {
    type: String,
    default: 'Unknown'
  },
  deviceModel: {
    type: String,
    default: 'Unknown'
  },
  // Browser information
  browser: {
    type: String,
    default: 'Unknown'
  },
  browserVersion: {
    type: String,
    default: 'Unknown'
  },
  // Operating System
  os: {
    type: String,
    default: 'Unknown'
  },
  osVersion: {
    type: String,
    default: 'Unknown'
  },
  // Screen information
  screenResolution: {
    width: Number,
    height: Number
  },
  // UTM parameters
  utmSource: String,
  utmMedium: String,
  utmCampaign: String,
  utmTerm: String,
  utmContent: String,
  // Bot detection
  isBot: {
    type: Boolean,
    default: false
  },
  botType: {
    type: String,
    enum: ['search-engine', 'social-media', 'monitoring', 'scraper', 'other'],
    default: null
  },
  // Session tracking
  sessionId: {
    type: String,
    index: true
  },
  isUniqueVisitor: {
    type: Boolean,
    default: true
  },
  // Performance metrics
  loadTime: Number, // Time to redirect in ms
  // Custom tracking
  customData: {
    type: Map,
    of: String
  }
}, { _id: false });

// Main analytics schema
const analyticsSchema = new mongoose.Schema({
  urlId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Url',
    required: true,
    index: true
  },
  shortCode: {
    type: String,
    required: true,
    index: true
  },
  // Individual clicks
  clicks: [clickSchema],
  // Aggregated statistics (for performance)
  stats: {
    totalClicks: {
      type: Number,
      default: 0
    },
    uniqueVisitors: {
      type: Number,
      default: 0
    },
    // Time-based stats
    dailyStats: [{
      date: {
        type: Date,
        required: true
      },
      clicks: {
        type: Number,
        default: 0
      },
      uniqueVisitors: {
        type: Number,
        default: 0
      }
    }],
    // Geographic stats
    topCountries: [{
      country: String,
      countryCode: String,
      count: Number,
      percentage: Number
    }],
    topCities: [{
      city: String,
      country: String,
      count: Number,
      percentage: Number
    }],
    // Device stats
    deviceStats: [{
      device: String,
      count: Number,
      percentage: Number
    }],
    // Browser stats
    browserStats: [{
      browser: String,
      version: String,
      count: Number,
      percentage: Number
    }],
    // OS stats
    osStats: [{
      os: String,
      version: String,
      count: Number,
      percentage: Number
    }],
    // Referrer stats
    referrerStats: [{
      referrer: String,
      category: String,
      count: Number,
      percentage: Number
    }],
    // Time-based patterns
    hourlyPattern: [{
      hour: Number, // 0-23
      count: Number
    }],
    weeklyPattern: [{
      day: Number, // 0-6 (Sunday-Saturday)
      count: Number
    }]
  },
  // Last update timestamp for cache invalidation
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
analyticsSchema.index({ urlId: 1, lastUpdated: -1 });
analyticsSchema.index({ shortCode: 1, lastUpdated: -1 });
analyticsSchema.index({ 'clicks.timestamp': -1 });
analyticsSchema.index({ 'clicks.hashedIp': 1 });
analyticsSchema.index({ 'clicks.country': 1 });
analyticsSchema.index({ 'clicks.device': 1 });
analyticsSchema.index({ 'clicks.browser': 1 });
analyticsSchema.index({ 'clicks.referrerCategory': 1 });
analyticsSchema.index({ 'stats.dailyStats.date': -1 });

// Virtual for click rate (clicks per day)
analyticsSchema.virtual('clickRate').get(function() {
  if (!this.createdAt || this.stats.totalClicks === 0) return 0;
  const daysSinceCreation = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round((this.stats.totalClicks / Math.max(daysSinceCreation, 1)) * 100) / 100;
});

// Virtual for engagement rate (unique visitors / total clicks)
analyticsSchema.virtual('engagementRate').get(function() {
  if (this.stats.totalClicks === 0) return 0;
  return Math.round((this.stats.uniqueVisitors / this.stats.totalClicks) * 100);
});

// Method to add a click and update stats
analyticsSchema.methods.addClick = function(clickData) {
  // Add the click
  this.clicks.push(clickData);
  
  // Update aggregated stats
  this.stats.totalClicks += 1;
  
  // Update unique visitors if it's a new visitor
  if (clickData.isUniqueVisitor) {
    this.stats.uniqueVisitors += 1;
  }
  
  // Update daily stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let dailyStat = this.stats.dailyStats.find(stat => 
    stat.date.getTime() === today.getTime()
  );
  
  if (!dailyStat) {
    dailyStat = {
      date: today,
      clicks: 0,
      uniqueVisitors: 0
    };
    this.stats.dailyStats.push(dailyStat);
  }
  
  dailyStat.clicks += 1;
  if (clickData.isUniqueVisitor) {
    dailyStat.uniqueVisitors += 1;
  }
  
  // Keep only last 90 days of daily stats
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  this.stats.dailyStats = this.stats.dailyStats.filter(
    stat => stat.date >= ninetyDaysAgo
  );
  
  this.lastUpdated = new Date();
  return this.save();
};

// Method to recalculate aggregated stats
analyticsSchema.methods.recalculateStats = function() {
  const clicks = this.clicks;
  
  // Reset stats
  this.stats = {
    totalClicks: clicks.length,
    uniqueVisitors: 0,
    dailyStats: [],
    topCountries: [],
    topCities: [],
    deviceStats: [],
    browserStats: [],
    osStats: [],
    referrerStats: [],
    hourlyPattern: Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 })),
    weeklyPattern: Array(7).fill(0).map((_, i) => ({ day: i, count: 0 }))
  };
  
  // Count unique visitors
  const uniqueIps = new Set(clicks.map(click => click.hashedIp));
  this.stats.uniqueVisitors = uniqueIps.size;
  
  // Calculate other stats
  const countryCount = {};
  const cityCount = {};
  const deviceCount = {};
  const browserCount = {};
  const osCount = {};
  const referrerCount = {};
  const dailyCount = {};
  
  clicks.forEach(click => {
    // Country stats
    countryCount[click.country] = (countryCount[click.country] || 0) + 1;
    
    // City stats
    const cityKey = `${click.city}, ${click.country}`;
    cityCount[cityKey] = (cityCount[cityKey] || 0) + 1;
    
    // Device stats
    deviceCount[click.device] = (deviceCount[click.device] || 0) + 1;
    
    // Browser stats
    browserCount[click.browser] = (browserCount[click.browser] || 0) + 1;
    
    // OS stats
    osCount[click.os] = (osCount[click.os] || 0) + 1;
    
    // Referrer stats
    referrerCount[click.referrerCategory] = (referrerCount[click.referrerCategory] || 0) + 1;
    
    // Time patterns
    const hour = click.timestamp.getHours();
    const day = click.timestamp.getDay();
    this.stats.hourlyPattern[hour].count += 1;
    this.stats.weeklyPattern[day].count += 1;
    
    // Daily stats
    const dateKey = click.timestamp.toISOString().split('T')[0];
    if (!dailyCount[dateKey]) {
      dailyCount[dateKey] = { clicks: 0, uniqueVisitors: new Set() };
    }
    dailyCount[dateKey].clicks += 1;
    dailyCount[dateKey].uniqueVisitors.add(click.hashedIp);
  });
  
  // Convert counts to sorted arrays with percentages
  const total = clicks.length;
  
  this.stats.topCountries = Object.entries(countryCount)
    .map(([country, count]) => ({
      country,
      countryCode: clicks.find(c => c.country === country)?.countryCode || 'XX',
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  this.stats.deviceStats = Object.entries(deviceCount)
    .map(([device, count]) => ({
      device,
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);
  
  this.stats.browserStats = Object.entries(browserCount)
    .map(([browser, count]) => ({
      browser,
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);
  
  this.stats.referrerStats = Object.entries(referrerCount)
    .map(([category, count]) => ({
      referrer: category,
      category,
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);
  
  // Daily stats
  this.stats.dailyStats = Object.entries(dailyCount)
    .map(([date, data]) => ({
      date: new Date(date),
      clicks: data.clicks,
      uniqueVisitors: data.uniqueVisitors.size
    }))
    .sort((a, b) => b.date - a.date)
    .slice(0, 90); // Keep last 90 days
  
  this.lastUpdated = new Date();
  return this.save();
};

module.exports = mongoose.model('Analytics', analyticsSchema);
