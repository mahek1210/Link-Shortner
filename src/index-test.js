// Test server to isolate the problematic route
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Basic middleware
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

// Add routes one by one to find the problematic one
console.log('Loading routes one by one...');

try {
  console.log('1. Loading authRoutes...');
  const authRoutes = require('./routes/authRoutes');
  app.use('/api/auth', authRoutes);
  console.log('✓ authRoutes loaded successfully');
} catch (error) {
  console.error('✗ authRoutes error:', error.message);
  process.exit(1);
}

try {
  console.log('2. Loading shortenRoutes...');
  const shortenRoutes = require('./routes/shortenRoutes');
  app.use('/api/shorten', shortenRoutes);
  console.log('✓ shortenRoutes loaded successfully');
} catch (error) {
  console.error('✗ shortenRoutes error:', error.message);
  process.exit(1);
}

try {
  console.log('3. Loading analyticsRoutes...');
  const analyticsRoutes = require('./routes/analyticsRoutes');
  app.use('/api/analytics', analyticsRoutes);
  console.log('✓ analyticsRoutes loaded successfully');
} catch (error) {
  console.error('✗ analyticsRoutes error:', error.message);
  process.exit(1);
}

try {
  console.log('4. Loading userRoutes...');
  const userRoutes = require('./routes/userRoutes');
  app.use('/api/user', userRoutes);
  console.log('✓ userRoutes loaded successfully');
} catch (error) {
  console.error('✗ userRoutes error:', error.message);
  process.exit(1);
}

console.log('5. Adding redirect route...');
app.get('/:shortId', (req, res) => {
  res.json({ shortId: req.params.shortId, message: 'Redirect would happen here' });
});
console.log('✓ Redirect route added');

console.log('6. Starting server...');
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ Server running on port ${PORT}`);
  console.log('All routes loaded successfully without path-to-regexp error!');
});
