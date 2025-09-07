import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Copy, QrCode, BarChart3, Calendar, Lock } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { urlAPI } from '../services/api';
import { Url, CreateUrlData } from '../types';
import { formatDate, truncateUrl, copyToClipboard } from '../lib/utils';
import { CreateUrlModal } from '../components/CreateUrlModal';
import { QRModal } from '../components/QRModal';
import { AnalyticsModal } from '../components/AnalyticsModal';

export const DashboardPage: React.FC = () => {
  const [urls, setUrls] = useState<Url[]>([]);
  
  // Debug: Log when URLs state changes
  useEffect(() => {
    console.log('URLs state updated. Count:', urls.length);
    if (urls.length > 0) {
      console.log('First URL:', urls[0]);
    }
  }, [urls]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<Url | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const fetchUrls = async () => {
    try {
      setLoading(true);
      const response = await urlAPI.getUserUrls(currentPage, 10, searchTerm);
      console.log('Fetched URLs from server:', response.urls.length);
      setUrls(response.urls);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error('Failed to fetch URLs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUrls();
  }, [currentPage, searchTerm]);

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
      
      // REMOVED: Don't refresh the list - it overwrites the state
      // The new URL is already added to the state above
      
    } catch (error: any) {
      console.error('Dashboard: Failed to create URL:', error);
      // Re-throw the error so the modal can handle it
      throw error;
    }
  };

  const handleDeleteUrl = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this URL?')) {
      try {
        await urlAPI.deleteUrl(id);
        fetchUrls();
      } catch (error) {
        console.error('Failed to delete URL:', error);
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
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Your Links</h1>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Link
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <div className="flex items-center space-x-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search your links..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
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
        <AnalyticsModal
          url={selectedUrl}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}

      {copySuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg">
          Copied to clipboard!
        </div>
      )}
    </div>
  );
};
