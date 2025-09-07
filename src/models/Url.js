// src/models/Url.js
const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const urlSchema = new mongoose.Schema({
  originalUrl: { 
    type: String, 
    required: true,
    trim: true
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
  lastClicked: {
    type: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 } // TTL index for automatic cleanup
  },
  password: {
    type: String,
    select: false // Don't include in queries by default
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
});

// Indexes for performance
urlSchema.index({ shortCode: 1 });
urlSchema.index({ customAlias: 1 }, { sparse: true });
urlSchema.index({ userId: 1, createdAt: -1 }); // For user's URL queries
urlSchema.index({ userId: 1, isActive: 1 }); // For active URL queries
urlSchema.index({ expiresAt: 1 }, { sparse: true }); // For expiry queries

module.exports = mongoose.model('Url', urlSchema);