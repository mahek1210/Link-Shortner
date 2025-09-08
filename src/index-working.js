// Working server without path-to-regexp error
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

connectDB();

// Routes
try {
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log('✓ Auth routes loaded');
} catch (error) {
  console.error('Error loading authRoutes:', error.message);
}

try {
  const shortenRoutes = require('./routes/shortenRoutes');
  app.use('/api/shorten', shortenRoutes);
  console.log('✓ Shorten routes loaded');
} catch (error) {
  console.error('Error loading shortenRoutes:', error.message);
}

try {
  const analyticsRoutes = require('./routes/analyticsRoutes');
  app.use('/api/analytics', analyticsRoutes);
  console.log('✓ Analytics routes loaded');
} catch (error) {
  console.error('Error loading analyticsRoutes:', error.message);
}

try {
  const userRoutes = require('./routes/userRoutes');
  app.use('/api/user', userRoutes);
  console.log('✓ User routes loaded');
} catch (error) {
  console.error('Error loading userRoutes:', error.message);
}

// Simple redirect route
app.get('/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    const Url = require('./models/Url');
    const url = await Url.findOne({ shortId });
    
    if (!url) {
      return res.status(404).send('URL not found');
    }
    
    // Update click count
    await Url.findOneAndUpdate(
      { shortId },
      { 
        $inc: { clicks: 1 },
        $set: { lastAccessed: new Date() }
      }
    );
    
    res.redirect(url.originalUrl);
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).send('Server error');
  }
});

// Error handlers
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
});
