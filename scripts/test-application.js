#!/usr/bin/env node

// scripts/test-application.js - Comprehensive application testing script
const axios = require('axios');
const mongoose = require('mongoose');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ApplicationTester {
  constructor() {
    this.baseURL = process.env.BASE_URL || 'http://localhost:5000';
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: []
    };
    this.serverProcess = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async test(name, testFn) {
    try {
      this.log(`Running test: ${name}`, 'info');
      await testFn();
      this.testResults.passed++;
      this.testResults.tests.push({ name, status: 'PASSED' });
      this.log(`✅ ${name} - PASSED`, 'success');
    } catch (error) {
      this.testResults.failed++;
      this.testResults.tests.push({ name, status: 'FAILED', error: error.message });
      this.log(`❌ ${name} - FAILED: ${error.message}`, 'error');
    }
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.log('Starting server for testing...', 'info');
      
      this.serverProcess = spawn('node', ['src/index.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: '5001',
          MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/link-shortener-test',
          JWT_SECRET: 'test-jwt-secret-key-for-development-only-must-be-at-least-64-chars-long-12345',
          SESSION_SECRET: 'test-session-secret-key',
          RATE_LIMIT_ENABLED: 'false',
          AUDIT_LOGGING_ENABLED: 'false',
          BASE_URL: 'http://localhost:5001'
        }
      });

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('server running on port') || output.includes('Server running on')) {
          this.baseURL = 'http://localhost:5001';
          setTimeout(resolve, 2000); // Give server extra time to fully initialize
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      this.serverProcess.on('error', (error) => {
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 30000);
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.log('Stopping test server...', 'info');
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async testDatabaseConnection() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/link-shortener-test';
    await mongoose.connect(mongoUri);
    await mongoose.connection.db.admin().ping();
    await mongoose.disconnect();
  }

  async testServerHealth() {
    const response = await axios.get(`${this.baseURL}/health`);
    if (response.status !== 200) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }
    if (response.data.status !== 'healthy') {
      throw new Error(`Server not healthy: ${response.data.status}`);
    }
  }

  async testUserRegistration() {
    const userData = {
      username: 'testuser' + Date.now(),
      email: `test${Date.now()}@example.com`,
      password: 'testpassword123'
    };

    const response = await axios.post(`${this.baseURL}/api/auth/signup`, userData);
    
    if (response.status !== 201) {
      throw new Error(`Registration failed with status: ${response.status}`);
    }
    
    if (!response.data.success || !response.data.token) {
      throw new Error('Registration response missing token or success flag');
    }

    return { userData, token: response.data.token };
  }

  async testUserLogin() {
    // First register a user
    const { userData } = await this.testUserRegistration();
    
    // Then login
    const loginData = {
      email: userData.email,
      password: userData.password
    };

    const response = await axios.post(`${this.baseURL}/api/auth/login`, loginData);
    
    if (response.status !== 200) {
      throw new Error(`Login failed with status: ${response.status}`);
    }
    
    if (!response.data.success || !response.data.token) {
      throw new Error('Login response missing token or success flag');
    }

    return response.data.token;
  }

  async testURLShortening() {
    const token = await this.testUserLogin();
    
    const urlData = {
      originalUrl: 'https://example.com/test-url-' + Date.now()
    };

    const response = await axios.post(`${this.baseURL}/api/shorten`, urlData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.status !== 201) {
      throw new Error(`URL shortening failed with status: ${response.status}`);
    }
    
    if (!response.data.success || !response.data.data.shortCode) {
      throw new Error('URL shortening response missing shortCode');
    }

    return response.data.data;
  }

  async testURLRedirection() {
    const urlData = await this.testURLShortening();
    
    // Test redirection (should return 301 redirect)
    try {
      await axios.get(`${this.baseURL}/${urlData.shortCode}`, {
        maxRedirects: 0
      });
      throw new Error('Expected redirect but got successful response');
    } catch (error) {
      if (error.response && error.response.status === 301) {
        // This is expected - 301 redirect
        if (error.response.headers.location !== urlData.originalUrl) {
          throw new Error('Redirect location does not match original URL');
        }
      } else {
        throw error;
      }
    }
  }

  async testAnalytics() {
    const token = await this.testUserLogin();
    const urlData = await this.testURLShortening();
    
    // Click the URL to generate analytics data
    try {
      await axios.get(`${this.baseURL}/${urlData.shortCode}`, {
        maxRedirects: 0
      });
    } catch (error) {
      // Expected redirect, ignore
    }

    // Wait a bit for analytics to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try different analytics endpoints
    let response;
    try {
      // Try advanced analytics first
      response = await axios.get(`${this.baseURL}/api/advanced-analytics/url/${urlData.shortCode}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      if (error.response?.status === 403 || error.response?.status === 404) {
        // Try basic analytics endpoint
        response = await axios.get(`${this.baseURL}/api/analytics/${urlData.shortCode}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        throw error;
      }
    }
    
    if (response.status !== 200) {
      throw new Error(`Analytics fetch failed with status: ${response.status}`);
    }
    
    if (!response.data.success) {
      throw new Error('Analytics response missing success flag');
    }
  }

  async testGoogleOAuthRoutes() {
    // Test that Google OAuth routes exist (even if not configured)
    const response = await axios.get(`${this.baseURL}/auth/google`, {
      validateStatus: () => true, // Accept any status
      maxRedirects: 0 // Don't follow redirects
    });
    
    // Should either redirect to Google (302) or return error about missing config (500) or HTML page (200)
    if (![200, 302, 500].includes(response.status)) {
      throw new Error(`Unexpected status for Google OAuth route: ${response.status}`);
    }
  }

  async testRateLimiting() {
    // Test that rate limiting is properly configured (should be disabled in test)
    const promises = Array(5).fill().map(() => 
      axios.get(`${this.baseURL}/health`, { validateStatus: () => true })
    );
    
    const responses = await Promise.all(promises);
    const successfulResponses = responses.filter(r => r.status === 200);
    
    if (successfulResponses.length < 3) {
      throw new Error('Rate limiting is too aggressive in test environment');
    }
  }

  async testErrorHandling() {
    // Test 404 for non-existent short URL
    try {
      await axios.get(`${this.baseURL}/nonexistent123`);
      throw new Error('Expected 404 for non-existent URL');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw new Error(`Expected 404, got ${error.response?.status || 'no response'}`);
      }
    }

    // Test invalid API endpoint
    try {
      await axios.get(`${this.baseURL}/api/invalid-endpoint`);
      throw new Error('Expected 404 for invalid API endpoint');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw new Error(`Expected 404, got ${error.response?.status || 'no response'}`);
      }
    }
  }

  async testSecurityHeaders() {
    const response = await axios.get(`${this.baseURL}/health`, { validateStatus: () => true });
    
    if (response.status !== 200) {
      throw new Error(`Health endpoint returned status: ${response.status}`);
    }
    
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ];
    
    for (const header of requiredHeaders) {
      if (!response.headers[header]) {
        throw new Error(`Missing security header: ${header}`);
      }
    }
  }

  async runAllTests() {
    this.log('🚀 Starting comprehensive application tests...', 'info');
    
    try {
      // Start server
      await this.startServer();
      
      // Wait for server to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Run all tests
      await this.test('Database Connection', () => this.testDatabaseConnection());
      await this.test('Server Health Check', () => this.testServerHealth());
      await this.test('User Registration', () => this.testUserRegistration());
      await this.test('User Login', () => this.testUserLogin());
      await this.test('URL Shortening', () => this.testURLShortening());
      await this.test('URL Redirection', () => this.testURLRedirection());
      await this.test('Analytics Tracking', () => this.testAnalytics());
      await this.test('Google OAuth Routes', () => this.testGoogleOAuthRoutes());
      await this.test('Rate Limiting Configuration', () => this.testRateLimiting());
      await this.test('Error Handling', () => this.testErrorHandling());
      await this.test('Security Headers', () => this.testSecurityHeaders());
      
    } finally {
      await this.stopServer();
    }
    
    // Generate test report
    this.generateTestReport();
    
    return this.testResults;
  }

  generateTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.testResults.passed + this.testResults.failed,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        success_rate: `${Math.round((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100)}%`
      },
      tests: this.testResults.tests
    };
    
    const reportPath = path.join(__dirname, '..', 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log('📊 Test Results Summary:', 'info');
    this.log(`   Total Tests: ${report.summary.total}`, 'info');
    this.log(`   Passed: ${report.summary.passed}`, 'success');
    this.log(`   Failed: ${report.summary.failed}`, report.summary.failed > 0 ? 'error' : 'info');
    this.log(`   Success Rate: ${report.summary.success_rate}`, 'info');
    this.log(`📄 Detailed report saved to: test-report.json`, 'info');
    
    if (report.summary.failed > 0) {
      this.log('❌ Some tests failed. Check the report for details.', 'error');
    } else {
      this.log('✅ All tests passed! Application is ready for production.', 'success');
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ApplicationTester();
  tester.runAllTests()
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = ApplicationTester;
