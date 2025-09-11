// src/index.js - Enhanced production-ready Link Shortener server with comprehensive error handling

// Add error handlers at the very top
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  console.error('Process will exit...');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  if (reason && reason.stack) {
    console.error('Stack:', reason.stack);
  }
  console.error('Process will exit...');
  process.exit(1);
});

// Environment variables
console.log('🔧 Loading environment variables...');
require('dotenv').config();
console.log('✅ Environment variables loaded');

// Import dependencies with try-catch
let Application, logger;
try {
  console.log('📦 Importing dependencies...');
  Application = require('./app');
  logger = require('./config/logger');
  console.log('✅ Dependencies imported successfully');
} catch (error) {
  console.error('❌ Failed to import dependencies:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

// Enhanced server startup with step-by-step logging
async function startServer() {
  try {
    console.log('🚀 Starting Link Shortener Server...');
    logger.info('🚀 Starting Link Shortener Server...');
    
    // 1. Check environment variables
    console.log('📋 Checking environment variables...');
    logger.info('📋 Checking environment variables...');
    
    const requiredEnvVars = ['JWT_SECRET'];
    const missingVars = [];
    
    // Check for MongoDB URI (allow both MONGO_URI and MONGODB_URI)
    if (!process.env.MONGO_URI && !process.env.MONGODB_URI) {
      missingVars.push('MONGO_URI or MONGODB_URI');
    }
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missingVars.push(envVar);
      }
    }
    
    if (missingVars.length > 0) {
      const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
      console.error('❌', errorMsg);
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('✅ Environment variables validated');
    logger.info('✅ Environment variables validated');

    // 2. Initialize Application
    console.log('⚡ Initializing Express application...');
    logger.info('⚡ Initializing Express application...');
    
    const app = new Application();
    const port = process.env.PORT || 5000;
    
    console.log('✅ Application instance created');
    logger.info('✅ Application instance created');
    
    // 3. Start server (this will handle database connections internally)
    console.log('🔌 Starting server and connecting to services...');
    logger.info('🔌 Starting server and connecting to services...');
    
    await app.start(port);
    
    // 4. Success logging
    console.log('🎉 Link Shortener application started successfully!');
    console.log(`📊 Server running on http://localhost:${port}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${port}`}`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    
    logger.info('🎉 Link Shortener application started successfully!');
    logger.info('📋 Application Features:');
    logger.info('  ✅ Production-ready security (Helmet, CORS, Rate limiting)');
    logger.info('  ✅ Redis caching and session management');
    logger.info('  ✅ Comprehensive logging and monitoring');
    logger.info('  ✅ Input validation and sanitization');
    logger.info('  ✅ Error handling and graceful shutdown');
    logger.info('  ✅ Database connection pooling and optimization');
    logger.info('  ✅ API versioning and backward compatibility');
    logger.info('  ✅ Health checks and metrics');
    
    // Performance monitoring
    if (process.env.NODE_ENV === 'production') {
      logger.info('🔍 Production monitoring enabled');
      
      // Log memory usage every 5 minutes
      setInterval(() => {
        const memUsage = process.memoryUsage();
        logger.performance.apiResponse('memory_check', 'GET', 0, 200);
        logger.info('Memory usage:', {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        });
      }, 300000); // 5 minutes
    }
    
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    console.error('Stack:', error.stack);
    
    if (logger) {
      logger.error('❌ Failed to start Link Shortener application:', {
        error: error.message,
        stack: error.stack
      });
    }
    
    // Provide specific error guidance
    if (error.message.includes('ECONNREFUSED') && error.message.includes('27017')) {
      console.error('🔍 MongoDB Connection Issue:');
      console.error('   - Make sure MongoDB is running locally');
      console.error('   - Or update MONGO_URI in .env to use MongoDB Atlas');
      console.error('   - Try: brew services start mongodb/brew/mongodb-community (macOS)');
      console.error('   - Try: net start MongoDB (Windows)');
    }
    
    if (error.message.includes('ECONNREFUSED') && error.message.includes('6379')) {
      console.error('🔍 Redis Connection Issue:');
      console.error('   - Make sure Redis is running locally');
      console.error('   - Try: brew services start redis (macOS)');
      console.error('   - Try: redis-server (to start Redis manually)');
      console.error('   - Or comment out Redis usage in development');
    }
    
    if (error.message.includes('EADDRINUSE')) {
      console.error('🔍 Port Already in Use:');
      console.error(`   - Port ${process.env.PORT || 5000} is already in use`);
      console.error('   - Try a different port: PORT=3001 npm run dev');
    }
    
    // Exit with error code
    process.exit(1);
  }
}

// Start the server
startServer();
