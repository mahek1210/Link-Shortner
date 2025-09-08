// AnalyticsModal.tsx - TypeScript Analytics Modal Component
import React, { useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { Url } from '../types';
import { urlAPI } from '../services/api';

// TypeScript interfaces
interface AnalyticsModalProps {
  url: Url;
  onClose: () => void;
}

interface BrowserStat {
  browser: string;
  count: number;
  percentage: number;
}

interface DeviceStat {
  device: string;
  count: number;
  percentage: number;
}

interface Click {
  timestamp: string;
  browser?: string;
  device?: string;
  country?: string;
  ip: string;
  referrer?: string;
}

interface AnalyticsData {
  url: {
    id: string;
    originalUrl: string;
    shortId: string;
    shortUrl: string;
    createdAt: string;
    lastAccessed?: string;
    expiresAt?: string;
    hasPassword: boolean;
  };
  analytics: {
    totalClicks: number;
    clicksInRange: number;
    uniqueVisitors: number;
    browserStats: BrowserStat[];
    deviceStats: DeviceStat[];
    referrerStats: any[];
    dailyClicks: any[];
    topCountries: any[];
    recentClicks: Click[];
  };
  timeRange: string;
  generatedAt: string;
}

const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ url, onClose }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [url.shortId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const analyticsData = await urlAPI.getAnalytics(url.shortId);
      setAnalytics(analyticsData as AnalyticsData);
    } catch (err: unknown) {
      console.error('Analytics fetch error:', err);
      
      let errorMessage = 'Failed to fetch analytics data';
      
      if (axios.isAxiosError(err)) {
        if (err.response) {
          // Server responded with error status
          if (err.response.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.response.status === 404) {
            errorMessage = 'URL not found or you do not have permission to view its analytics.';
          } else if (err.response.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else {
            errorMessage = err.response.data?.message || `Server error (${err.response.status})`;
          }
        } else if (err.request) {
          // Request was made but no response received
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (err.code === 'ECONNABORTED') {
          // Request timeout
          errorMessage = 'Request timeout. Please try again.';
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'An unexpected error occurred';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Copied to clipboard!');
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center py-8">
            <h3 className="text-lg font-semibold mb-4">Analytics Error</h3>
            <p className="text-red-600 mb-4 p-4 bg-red-50 border border-red-200 rounded">{error}</p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={fetchAnalytics} 
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
              >
                Retry
              </button>
              <button 
                onClick={onClose} 
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center py-8">
            <p className="mb-4">No analytics data available</p>
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5 pb-4 border-b">
          <h2 className="text-xl font-semibold">Analytics Dashboard</h2>
          <button 
            onClick={onClose} 
            className="text-2xl hover:bg-gray-100 rounded p-1 leading-none"
          >
            ×
          </button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="mb-2 break-all">
            <strong>Short URL:</strong> 
            <span 
              onClick={() => copyToClipboard(analytics.url.shortUrl)} 
              className="ml-2 cursor-pointer text-blue-600 hover:underline"
            >
              {analytics.url.shortUrl}
            </span>
          </div>
          <div className="break-all">
            <strong>Original URL:</strong> 
            <span className="ml-2" title={analytics.url.originalUrl}>
              {analytics.url.originalUrl.length > 50 ? 
                analytics.url.originalUrl.substring(0, 50) + '...' : 
                analytics.url.originalUrl}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 p-5 rounded-lg text-center">
            <h3 className="text-sm text-gray-600 mb-2">Total Clicks</h3>
            <div className="text-3xl font-bold text-blue-600">{analytics.analytics.totalClicks}</div>
          </div>
          <div className="bg-gray-50 p-5 rounded-lg text-center">
            <h3 className="text-sm text-gray-600 mb-2">Unique Visitors</h3>
            <div className="text-3xl font-bold text-blue-600">{analytics.analytics.uniqueVisitors}</div>
          </div>
          <div className="bg-gray-50 p-5 rounded-lg text-center">
            <h3 className="text-sm text-gray-600 mb-2">Created</h3>
            <div className="text-sm text-gray-800">{formatDate(analytics.url.createdAt)}</div>
          </div>
        </div>

        {analytics && analytics.analytics.recentClicks && analytics.analytics.recentClicks.length > 0 && (
          <>
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Browser Statistics</h3>
              <div className="space-y-2">
                {analytics.analytics.browserStats?.map((stat, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span>{stat.browser}</span>
                    <span className="font-medium">{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Device Statistics</h3>
              <div className="space-y-2">
                {analytics.analytics.deviceStats?.map((stat, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span>{stat.device}</span>
                    <span className="font-medium">{stat.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Recent Clicks</h3>
              <div className="space-y-2">
                {analytics.analytics.recentClicks.map((click, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded">
                    <div className="font-semibold mb-1">{formatDate(click.timestamp)}</div>
                    <div className="text-sm text-gray-600">
                      {click.browser || 'Unknown'} • {click.device || 'Unknown'} • IP: {click.ip}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {analytics && (!analytics.analytics.recentClicks || analytics.analytics.recentClicks.length === 0) && (
          <div className="text-center py-10 text-gray-600">
            <p>No clicks recorded yet. Share your link to start collecting analytics!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsModal;