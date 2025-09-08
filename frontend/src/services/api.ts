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

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      headers: config.headers,
      data: config.data
    });
  } else {
    console.warn('No authentication token found in localStorage');
  }
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      url: error.config?.url,
      data: error.response?.data,
      message: error.message
    });
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  signup: async (data: SignupData): Promise<AuthResponse> => {
    const response = await api.post('/auth/signup', data);
    return response.data;
  },

  login: async (data: LoginData): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data;
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
    return response.data;
  },

  deleteUrl: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/user/urls/${id}`);
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
    const response = await api.get(`/advanced-analytics/realtime/${shortId}`);
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
    return response.data;
  },

  deleteUrl: async (id: string): Promise<{ message: string }> => {
    const response = await api.delete(`/admin/urls/${id}`);
    return response.data;
  },
};

export default api;
