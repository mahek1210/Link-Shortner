import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Copy, QrCode, BarChart3, Calendar, Lock, TrendingUp, Users, MousePointer, Eye } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { urlAPI } from '../services/api';
import { Url, CreateUrlData } from '../types';
import { formatDate, truncateUrl, copyToClipboard } from '../lib/utils';
import { CreateUrlModal } from '../components/CreateUrlModal';
import { QRModal } from '../components/QRModal';
import AdvancedAnalyticsModal from '../components/AdvancedAnalyticsModal';

// Debounce hook for search optimization
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const DashboardPage: React.FC = () => {
  const [urls, setUrls] = useState<Url[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null);
  const [selectedUrl, setSelectedUrl] = useState<Url | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Debounce search term to reduce API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Memoize analytics summary to prevent unnecessary re-renders
  const analyticsSummaryCards = useMemo(() => {
    if (!analyticsSummary) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-600 text-sm font-medium">Total URLs</p>
              <p className="text-3xl font-bold text-blue-900">{analyticsSummary.totalUrls}</p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-600 text-sm font-medium">Total Clicks</p>
              <p className="text-3xl font-bold text-green-900">{analyticsSummary.totalClicks}</p>
            </div>
            <MousePointer className="w-8 h-8 text-green-600" />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-600 text-sm font-medium">Unique Visitors</p>
              <p className="text-3xl font-bold text-purple-900">{analyticsSummary.totalUniqueVisitors}</p>
            </div>
            <Users className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-600 text-sm font-medium">Click Rate</p>
              <p className="text-3xl font-bold text-orange-900">{analyticsSummary.summary?.clickRate || 0}</p>
              <p className="text-sm text-orange-600">/day</p>
            </div>
            <TrendingUp className="w-8 h-8 text-orange-600" />
          </div>
        </div>
      </div>
    );
  }, [analyticsSummary]);

  const fetchUrls = useCallback(async (page = 1, search = '') => {
    try {
      setLoading(true);
      const response = await urlAPI.getUserUrls(page, 10, search);
      console.log('Fetched URLs from server:', response.urls.length);
      setUrls(response.urls);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error('Failed to fetch URLs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalyticsSummary = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const summaryResponse = await urlAPI.getUserAnalyticsSummary({ timeRange: '30d' });
      if (summaryResponse.success) {
        setAnalyticsSummary(summaryResponse.data);
      }
    } catch (summaryError) {
      console.error('Failed to fetch analytics summary:', summaryError);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Fetch URLs when page or debounced search term changes
  useEffect(() => {
    fetchUrls(currentPage, debouncedSearchTerm);
  }, [currentPage, debouncedSearchTerm, fetchUrls]);

  // Fetch analytics summary only once on mount
  useEffect(() => {
    fetchAnalyticsSummary();
  }, [fetchAnalyticsSummary]);

  // Reset page when search term changes
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  const handleCreateUrl = async (data: CreateUrlData) => {
    try {
      console.log('Dashboard: Creating URL with data:', data);
      const newUrl = await urlAPI.createShortUrl(data);
      console.log('Dashboard: URL created successfully:', newUrl);
      
      // Add the new URL to the beginning of the list immediately
      setUrls(prevUrls => {
        console.log('Adding new URL to list. Previous count:', prevUrls.length);
        const updatedUrls = [newUrl, ...prevUrls];
        console.log('Updated URLs count:', updatedUrls.length);
        return updatedUrls;
      });
      
      // Close modal
      setShowCreateModal(false);
      
      // Show success message
      setCopySuccess('Link created successfully!');
      setTimeout(() => setCopySuccess(null), 3000);
      
      // Update analytics summary
      fetchAnalyticsSummary();
      
    } catch (error: any) {
      console.error('Dashboard: Failed to create URL:', error);
      throw error;
    }
  };

  const handleDeleteUrl = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this URL?')) {
      try {
        await urlAPI.deleteUrl(id);
        // Remove from local state immediately
        setUrls(prevUrls => prevUrls.filter(url => url.id !== id));
        // Update analytics summary
        fetchAnalyticsSummary();
      } catch (error) {
        console.error('Failed to delete URL:', error);
        // Refresh on error
        fetchUrls(currentPage, debouncedSearchTerm);
      }
    }
  };

  const handleCopyUrl = (url: string) => {
    copyToClipboard(url);
    setCopySuccess(url);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const handleShowQR = (url: Url) => {
    setSelectedUrl(url);
    setShowQRModal(true);
  };

  const handleShowAnalytics = (url: Url) => {
    setSelectedUrl(url);
    setShowAnalyticsModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Manage your shortened URLs</p>
          </div>

          {/* Analytics Summary Cards */}
          {analyticsLoading ? (
            <div className="mb-8">
              <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-gray-200 h-24 rounded-lg"></div>
                ))}
              </div>
            </div>
          ) : (
            analyticsSummaryCards
          )}

          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Your Links</h1>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Link
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      type="text"
                      placeholder="Search URLs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  {searchTerm && searchTerm !== debouncedSearchTerm && (
                    <div className="text-sm text-gray-500">Searching...</div>
                  )}
                </div>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Short URL
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your links...</p>
              </div>
            ) : urls.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500 mb-4">
                  {searchTerm ? 'No links found matching your search.' : 'No links created yet.'}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Link
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Short URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Original URL
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Clicks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {urls.map((url) => (
                      <motion.tr
                        key={url.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {url.shortUrl}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyUrl(url.shortUrl)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-xs truncate">
                            {truncateUrl(url.originalUrl)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">{url.clicks}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-500">
                            {formatDate(url.createdAt)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            {url.isExpired && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Expired
                              </span>
                            )}
                            {url.password && (
                              <Lock className="w-4 h-4 text-gray-400" />
                            )}
                            {url.expiresAt && !url.isExpired && (
                              <Calendar className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowQR(url)}
                              className="h-8 w-8 p-0"
                            >
                              <QrCode className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowAnalytics(url)}
                              className="h-8 w-8 p-0"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUrl(url.id)}
                              className="h-8 px-2"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {showCreateModal && (
        <CreateUrlModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateUrl}
        />
      )}

      {showQRModal && selectedUrl && (
        <QRModal
          url={selectedUrl}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {showAnalyticsModal && selectedUrl && (
        <AdvancedAnalyticsModal
          isOpen={showAnalyticsModal}
          url={selectedUrl}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}

      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
          {copySuccess === 'Link created successfully!' ? copySuccess : 'Copied to clipboard!'}
        </div>
      )}
    </div>
  );
};
