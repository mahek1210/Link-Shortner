// Analytics Testing Script
// Run this script to test if click tracking and analytics are working properly

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const API_BASE_URL = 'http://localhost:5000/api';

// Test configuration
const TEST_CONFIG = {
  testUrl: 'https://example.com',
  customAlias: 'test-analytics-' + Date.now(),
  userCredentials: {
    email: 'test@example.com',
    password: 'testpassword123'
  }
};

let authToken = '';
let testShortCode = '';

// Helper function to make authenticated API calls
const apiCall = async (method, endpoint, data = null) => {
  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    config.data = data;
  }
  
  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error.response?.data || error.message);
    throw error;
  }
};

// Test functions
const testAuthentication = async () => {
  console.log('\n🔐 Testing Authentication...');
  
  try {
    // Try to login (assuming user exists)
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, TEST_CONFIG.userCredentials);
    
    if (loginResponse.data.success && loginResponse.data.token) {
      authToken = loginResponse.data.token;
      console.log('✅ Authentication successful');
      return true;
    }
  } catch (error) {
    console.log('❌ Login failed, trying to create account...');
    
    try {
      // Create account
      const signupResponse = await axios.post(`${API_BASE_URL}/auth/signup`, {
        username: 'Test User',
        ...TEST_CONFIG.userCredentials
      });
      
      if (signupResponse.data.success && signupResponse.data.token) {
        authToken = signupResponse.data.token;
        console.log('✅ Account created and authenticated');
        return true;
      }
    } catch (signupError) {
      console.error('❌ Authentication failed:', signupError.response?.data || signupError.message);
      return false;
    }
  }
  
  return false;
};

const testUrlCreation = async () => {
  console.log('\n🔗 Testing URL Creation...');
  
  try {
    const response = await apiCall('POST', '/shorten', {
      originalUrl: TEST_CONFIG.testUrl,
      customAlias: TEST_CONFIG.customAlias
    });
    
    if (response.success && response.data) {
      testShortCode = response.data.shortCode || response.data.shortId;
      console.log('✅ URL created successfully');
      console.log(`   Short Code: ${testShortCode}`);
      console.log(`   Short URL: ${response.data.shortUrl}`);
      return true;
    } else {
      console.error('❌ URL creation failed:', response);
      return false;
    }
  } catch (error) {
    console.error('❌ URL creation error:', error.message);
    return false;
  }
};

const testClickTracking = async () => {
  console.log('\n👆 Testing Click Tracking...');
  
  if (!testShortCode) {
    console.error('❌ No test short code available');
    return false;
  }
  
  try {
    // Simulate clicking the short link
    const clickResponse = await axios.get(`${BASE_URL}/${testShortCode}`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 301
    });
    
    if (clickResponse.status === 302 || clickResponse.status === 301) {
      console.log('✅ Click redirect working');
      console.log(`   Redirected to: ${clickResponse.headers.location}`);
      
      // Wait a moment for analytics to process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return true;
    } else {
      console.error('❌ Click tracking failed - no redirect');
      return false;
    }
  } catch (error) {
    if (error.response && (error.response.status === 302 || error.response.status === 301)) {
      console.log('✅ Click redirect working (caught redirect)');
      return true;
    }
    console.error('❌ Click tracking error:', error.message);
    return false;
  }
};

const testAnalyticsRetrieval = async () => {
  console.log('\n📊 Testing Analytics Retrieval...');
  
  if (!testShortCode) {
    console.error('❌ No test short code available');
    return false;
  }
  
  try {
    // Test basic analytics endpoint
    const analyticsResponse = await apiCall('GET', `/advanced-analytics/url/${testShortCode}`);
    
    if (analyticsResponse.success && analyticsResponse.data) {
      console.log('✅ Analytics retrieval working');
      console.log(`   Total Clicks: ${analyticsResponse.data.analytics.totalClicks}`);
      console.log(`   Unique Visitors: ${analyticsResponse.data.analytics.uniqueVisitors}`);
      return true;
    } else {
      console.error('❌ Analytics retrieval failed:', analyticsResponse);
      return false;
    }
  } catch (error) {
    console.error('❌ Analytics retrieval error:', error.message);
    return false;
  }
};

const testUserAnalyticsSummary = async () => {
  console.log('\n📈 Testing User Analytics Summary...');
  
  try {
    const summaryResponse = await apiCall('GET', '/advanced-analytics/summary');
    
    if (summaryResponse.success && summaryResponse.data) {
      console.log('✅ User analytics summary working');
      console.log(`   Total URLs: ${summaryResponse.data.totalUrls}`);
      console.log(`   Total Clicks: ${summaryResponse.data.totalClicks}`);
      return true;
    } else {
      console.error('❌ User analytics summary failed:', summaryResponse);
      return false;
    }
  } catch (error) {
    console.error('❌ User analytics summary error:', error.message);
    return false;
  }
};

const cleanup = async () => {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Get user URLs and delete the test URL
    const urlsResponse = await apiCall('GET', '/user/urls');
    
    if (urlsResponse.urls) {
      const testUrl = urlsResponse.urls.find(url => 
        url.shortCode === testShortCode || url.customAlias === TEST_CONFIG.customAlias
      );
      
      if (testUrl) {
        await apiCall('DELETE', `/user/urls/${testUrl.id}`);
        console.log('✅ Test URL deleted');
      }
    }
  } catch (error) {
    console.log('⚠️  Cleanup warning:', error.message);
  }
};

// Main test runner
const runTests = async () => {
  console.log('🚀 Starting Analytics System Tests');
  console.log('=====================================');
  
  const results = {
    authentication: false,
    urlCreation: false,
    clickTracking: false,
    analyticsRetrieval: false,
    userAnalyticsSummary: false
  };
  
  try {
    results.authentication = await testAuthentication();
    
    if (results.authentication) {
      results.urlCreation = await testUrlCreation();
      
      if (results.urlCreation) {
        results.clickTracking = await testClickTracking();
        results.analyticsRetrieval = await testAnalyticsRetrieval();
        results.userAnalyticsSummary = await testUserAnalyticsSummary();
      }
    }
    
    // Cleanup
    await cleanup();
    
    // Summary
    console.log('\n📋 Test Results Summary');
    console.log('=======================');
    
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    
    Object.entries(results).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}`);
    });
    
    console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All analytics features are working correctly!');
    } else {
      console.log('⚠️  Some analytics features need attention.');
    }
    
  } catch (error) {
    console.error('💥 Test runner error:', error.message);
  }
};

// Run the tests
runTests();
