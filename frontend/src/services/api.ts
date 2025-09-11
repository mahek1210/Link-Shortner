import axios from 'axios';
import { 
  User, 
  Url, 
  Analytics, 
  CreateUrlData, 
  UpdateUrlData, 
  LoginData, 
  SignupData,
  ApiResponse,
  AuthResponse,
  Pagination
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/api` : 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Increased timeout for better reliability
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Simple in-memory cache for GET requests
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

const getCacheKey = (url: string, params?: any) => {
  return `${url}${params ? JSON.stringify(params) : ''}`;
};

const getCachedData = (key: string) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

const setCachedData = (key: string, data: any, ttl = 300000) => { // 5 minutes default
  cache.set(key, { data, timestamp: Date.now(), ttl });
};

// Request interceptor to add auth token and handle caching
api.interceptors.request.use(
  (config) => {
    // Only add token for protected routes, not for signup/login
    const isAuthRoute = config.url?.includes('/auth/signup') || config.url?.includes('/auth/login');
    
    if (!isAuthRoute) {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    // Check cache for GET requests
    if (config.method === 'get') {
      const cacheKey = getCacheKey(config.url || '', config.params);
      const cachedData = getCachedData(cacheKey);
      if (cachedData) {
        // Return cached response
        return Promise.reject({
          __CACHED_RESPONSE__: true,
          data: cachedData
        });
      }
    }
    
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors and caching
api.interceptors.response.use(
  (response) => {
    // Store token from successful auth responses
    if (response.data?.token) {
      localStorage.setItem('token', response.data.token);
    }
    
    // Cache GET responses
    if (response.config.method === 'get') {
      const cacheKey = getCacheKey(response.config.url || '', response.config.params);
      const ttl = response.config.url?.includes('/analytics') ? 60000 : 300000; // Analytics cache for 1 min, others 5 min
      setCachedData(cacheKey, response.data, ttl);
    }
    
    return response;
  },
  (error) => {
    // Handle cached responses
    if (error.__CACHED_RESPONSE__) {
      return Promise.resolve({ data: error.data });
    }
    
    console.error('API Error:', {
      status: error.response?.status,
      url: error.config?.url,
      data: error.response?.data,
      message: error.message
    });
    
    // Handle 401 - unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tokenLastCheck');
      // Clear cache on auth failure
      cache.clear();
      // Redirect to login if not already on auth pages
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

// Clear cache function
export const clearCache = () => {
  cache.clear();
};

// Auth API
export const authAPI = {
  signup: async (data: SignupData): Promise<AuthResponse> => {
    try {
      const response = await api.post('/auth/signup', data);
      // Clear cache after successful signup
      clearCache();
      return response.data;
    } catch (error: any) {
      console.error('Signup error:', error.response?.data || error.message);
      throw error;
    }
  },

  login: async (data: LoginData): Promise<AuthResponse> => {
    try {
      const response = await api.post('/auth/login', data);
      // Clear cache after successful login
      clearCache();
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      throw error;
    }
  },

  getProfile: async (): Promise<{ user: User }> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  getProfileWithToken: async (token: string): Promise<{ user: User }> => {
    const response = await api.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  },
};

// URL API
export const urlAPI = {
  createShortUrl: async (data: CreateUrlData): Promise<Url> => {
    console.log('Creating URL with data:', data);
    
    const response = await api.post('/shorten', data);
    console.log('Server response:', response.data);
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to create URL');
    }
    
    // Clear relevant cache entries
    cache.forEach((_, key) => {
      if (key.includes('/user/urls') || key.includes('/summary')) {
        cache.delete(key);
      }
    });
    
    // Transform the response to match the Url interface
    const urlData: Url = {
      id: response.data.data.id || response.data.data._id,
      shortId: response.data.data.shortId || response.data.data.shortCode,
      customAlias: response.data.data.customAlias || undefined,
      originalUrl: response.data.data.originalUrl,
      shortUrl: response.data.data.shortUrl,
      clicks: response.data.data.clicks || 0,
      createdAt: response.data.data.createdAt,
      lastClicked: response.data.data.lastClicked,
      expiresAt: response.data.data.expiresAt || undefined,
      isExpired: response.data.data.isExpired || false,
      password: response.data.data.password || undefined,
      tags: response.data.data.tags || [],
      isActive: response.data.data.isActive || true
    };
    
    console.log('Transformed URL data:', urlData);
    return urlData;
  },

  getUserUrls: async (page = 1, limit = 10, search?: string): Promise<{ urls: Url[]; pagination: Pagination }> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    
    const response = await api.get(`/user/urls?${params.toString()}`);
    return response.data;
  },

  updateUrl: async (id: string, data: UpdateUrlData): Promise<{ message: string; url: Url }> => {
    const response = await api.put(`/user/urls/${id}`, data);
    
    // Clear relevant cache entries
    cache.forEach((_, key) => {
      if (key.includes('/user/urls') || key.includes(id)) {
        cache.delete(key);
      }
    });
    
    return response.data;
  },

  deleteUrl: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/user/urls/${id}`);
    
    // Clear relevant cache entries
    cache.forEach((_, key) => {
      if (key.includes('/user/urls') || key.includes('/summary') || key.includes(id)) {
        cache.delete(key);
      }
    });
    
    return response.data;
  },

  getAnalytics: async (shortId: string, params?: { timeRange?: string }): Promise<any> => {
    const queryParams = new URLSearchParams();
    if (params?.timeRange) queryParams.append('timeRange', params.timeRange);
    
    const url = `/advanced-analytics/url/${shortId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  getRealtimeStats: async (shortId: string): Promise<any> => {
    // Don't cache realtime stats
    const response = await api.get(`/advanced-analytics/realtime/${shortId}`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    return response.data;
  },

  exportAnalytics: async (shortId: string, params?: { format?: 'json' | 'csv'; timeRange?: string }): Promise<any> => {
    const queryParams = new URLSearchParams();
    if (params?.format) queryParams.append('format', params.format);
    if (params?.timeRange) queryParams.append('timeRange', params.timeRange);
    
    const url = `/advanced-analytics/export/${shortId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  getUserAnalyticsSummary: async (params?: { timeRange?: string }): Promise<any> => {
    const queryParams = new URLSearchParams();
    if (params?.timeRange) queryParams.append('timeRange', params.timeRange);
    
    const url = `/advanced-analytics/summary${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await api.get(url);
    return response.data;
  },

  generateQR: async (id: string): Promise<{ qrCode: string; shortUrl: string }> => {
    const response = await api.get(`/user/urls/${id}/qr`);
    return response.data;
  },
};

// Admin API
export const adminAPI = {
  getStats: async (): Promise<{ stats: any; recentUrls: Url[] }> => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  getAllUsers: async (page = 1, limit = 20, search?: string): Promise<{ users: User[]; pagination: Pagination }> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    
    const response = await api.get(`/admin/users?${params.toString()}`);
    return response.data;
  },

  getAllUrls: async (page = 1, limit = 20, search?: string, userId?: string): Promise<{ urls: Url[]; pagination: Pagination }> => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (userId) params.append('userId', userId);
    
    const response = await api.get(`/admin/urls?${params.toString()}`);
    return response.data;
  },

  updateUserStatus: async (id: string, data: { isActive?: boolean; role?: string }): Promise<{ message: string; user: User }> => {
    const response = await api.put(`/admin/users/${id}`, data);
    
    // Clear user-related cache
    cache.forEach((_, key) => {
      if (key.includes('/admin/users') || key.includes(id)) {
        cache.delete(key);
      }
    });
    
    return response.data;
  },

  deleteUrl: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/admin/urls/${id}`);
    
    // Clear relevant cache entries
    cache.forEach((_, key) => {
      if (key.includes('/admin/urls') || key.includes(id)) {
        cache.delete(key);
      }
    });
    
    return response.data;
  },
};

export default api;
