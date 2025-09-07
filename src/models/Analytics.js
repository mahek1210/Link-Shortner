// src/models/Analytics.js
const mongoose = require('mongoose');

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
  clickData: {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    ip: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      required: true
    },
    referrer: {
      type: String,
      default: null
    },
    country: {
      type: String,
      default: 'Unknown'
    },
    city: {
      type: String,
      default: 'Unknown'
    },
    device: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    browser: {
      type: String,
      default: 'Unknown'
    },
    os: {
      type: String,
      default: 'Unknown'
    },
    isBot: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
analyticsSchema.index({ urlId: 1, 'clickData.timestamp': -1 });
analyticsSchema.index({ shortCode: 1, 'clickData.timestamp': -1 });
analyticsSchema.index({ 'clickData.timestamp': -1 });
analyticsSchema.index({ 'clickData.country': 1 });
analyticsSchema.index({ 'clickData.device': 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
