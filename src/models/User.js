/*
 * FIXES APPLIED:
 * 1. Added email validation with regex pattern
 * 2. Enhanced password validation with stronger requirements
 * 3. Added index for better query performance
 * 4. Improved schema validation messages
 */

// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  // Traditional auth fields
  username: { 
    type: String, 
    required: [true, 'Username is required'], // Always required, auto-generated for Google users
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    index: true
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address'],
    index: true
  },
  password: { 
    type: String, 
    required: function() { return !this.googleId; }, // Required only if not Google user
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Never include password in queries by default
  },
  
  // Google OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values for uniqueness
    select: false,
    index: true
  },
  name: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    trim: true
  },
  
  // Common fields
  role: {
    type: String,
    enum: {
      values: ['user', 'admin'],
      message: 'Role must be either user or admin'
    },
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date 
  },
  
  // GDPR Compliance fields
  consent: {
    analytics: {
      type: Boolean,
      default: false
    },
    marketing: {
      type: Boolean,
      default: false
    },
    functional: {
      type: Boolean,
      default: true // Required for basic functionality
    },
    consentDate: {
      type: Date,
      default: null
    },
    ipAddress: {
      type: String, // Hashed IP for consent tracking
      default: null
    },
    userAgent: {
      type: String,
      default: null
    },
    consentVersion: {
      type: String,
      default: '1.0'
    }
  },
  
  // Data protection fields
  anonymized: {
    type: Boolean,
    default: false
  },
  anonymizedAt: {
    type: Date,
    default: null
  },
  
  // Branding configuration
  branding: {
    enabled: {
      type: Boolean,
      default: false
    },
    logo: {
      type: String,
      default: null
    },
    primaryColor: {
      type: String,
      default: '#3B82F6'
    },
    secondaryColor: {
      type: String,
      default: '#1F2937'
    },
    customDomain: {
      type: String,
      default: null
    },
    customCSS: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Create indexes for better performance
UserSchema.index({ isActive: 1 });

// Hash password before saving (only for traditional users)
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password (only for traditional users)
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false; // Google users don't have passwords
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get user data without sensitive fields
UserSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.googleId;
  return userObject;
};

module.exports = mongoose.model('User', UserSchema);
