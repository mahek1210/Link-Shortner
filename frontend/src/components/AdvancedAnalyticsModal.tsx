import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Calendar, Download, RefreshCw, Globe, Smartphone, Monitor, 
  Clock, TrendingUp, Users, MousePointer, Eye, ExternalLink,
  Filter, BarChart3, PieChart as PieChartIcon, Activity
} from 'lucide-react';
import CountUp from 'react-countup';
import { format, subDays, parseISO } from 'date-fns';
import { urlAPI } from '../services/api';

// TypeScript interfaces
interface AdvancedAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: {
    _id?: string;
    shortId: string;
    shortCode?: string;
    originalUrl: string;
    createdAt: string;
  };
}

interface AnalyticsData {
  totalClicks: number;
  uniqueVisitors: number;
  clickRate: number;
  engagementRate: number;
  dailyStats: DailyStat[];
  topCountries: CountryStat[];
  deviceStats: DeviceStat[];
  browserStats: BrowserStat[];
  osStats: OSStat[];
  referrerStats: ReferrerStat[];
  hourlyPattern: HourlyPattern[];
  weeklyPattern: WeeklyPattern[];
  recentClicks: RecentClick[];
}

interface DailyStat {
  date: string;
  clicks: number;
  uniqueVisitors: number;
}

interface CountryStat {
  country: string;
  countryCode: string;
  count: number;
  percentage: number;
}

interface DeviceStat {
  device: string;
  count: number;
  percentage: number;
}

interface BrowserStat {
  browser: string;
  count: number;
  percentage: number;
}

interface OSStat {
  os: string;
  count: number;
  percentage: number;
}

interface ReferrerStat {
  referrer: string;
  category: string;
  count: number;
  percentage: number;
}

interface HourlyPattern {
  hour: number;
  count: number;
}

interface WeeklyPattern {
  day: number;
  count: number;
}

interface RecentClick {
  timestamp: string;
  country: string;
  city: string;
  device: string;
  browser: string;
  os: string;
  referrer: string;
  referrerCategory: string;
  isBot: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];

const AdvancedAnalyticsModal: React.FC<AdvancedAnalyticsModalProps> = ({ isOpen, onClose, url }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [activeTab, setActiveTab] = useState('overview');
  const [realtimeData, setRealtimeData] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const timeRanges = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: '1y', label: 'Last Year' }
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'traffic', label: 'Traffic', icon: TrendingUp },
    { id: 'geography', label: 'Geography', icon: Globe },
    { id: 'technology', label: 'Technology', icon: Monitor },
    { id: 'behavior', label: 'Behavior', icon: Activity },
    { id: 'realtime', label: 'Real-time', icon: RefreshCw }
  ];

  useEffect(() => {
    if (isOpen) {
      fetchAnalytics();
    }
  }, [isOpen, timeRange]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh && activeTab === 'realtime') {
      interval = setInterval(fetchRealtimeData, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, activeTab]);

  const fetchAnalytics = async () => {
    if (!url) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await urlAPI.getAnalytics(url.shortId, { timeRange });
      console.log('Advanced Analytics response:', response);
      
      if (response.success && response.data) {
        setAnalytics(response.data.analytics);
      } else {
        setError(response.message || 'Failed to fetch analytics');
      }
    } catch (err) {
      console.error('Advanced Analytics fetch error:', err);
      setError('Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  const fetchRealtimeData = async () => {
    if (!url) return;
    
    try {
      const shortCode = url.shortCode || url.shortId;
      const response = await urlAPI.getRealtimeStats(shortCode);
      
      if (response.success) {
        setRealtimeData(response.data);
      }
    } catch (err) {
      console.error('Realtime data fetch error:', err);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    if (!url) return;
    
    try {
      const shortCode = url.shortCode || url.shortId;
      const response = await urlAPI.exportAnalytics(shortCode, { format, timeRange });
      
      // Create download link
      const blob = new Blob([format === 'json' ? JSON.stringify(response, null, 2) : response], {
        type: format === 'json' ? 'application/json' : 'text/csv'
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${shortCode}-analytics.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const formatDayName = (dayIndex: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[dayIndex];
  };

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case 'mobile': return <Smartphone className="w-4 h-4" />;
      case 'tablet': return <Monitor className="w-4 h-4" />;
      default: return <Monitor className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Advanced Analytics</h2>
              <p className="text-blue-100 truncate max-w-md">{url.originalUrl}</p>
              <p className="text-blue-200 text-sm mt-1">
                Short URL: /{url.shortCode || url.shortId}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-white/20 text-white border border-white/30 rounded-lg px-3 py-2 text-sm"
              >
                {timeRanges.map((range) => (
                  <option key={range.value} value={range.value} className="text-gray-900">
                    {range.label}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
                title="Export JSON"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(95vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-500 text-lg mb-2">Error loading analytics</div>
              <div className="text-gray-600">{error}</div>
              <button
                onClick={fetchAnalytics}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : !analytics ? (
            <div className="text-center py-12 text-gray-500">
              No analytics data available
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-600 text-sm font-medium">Total Clicks</p>
                          <p className="text-3xl font-bold text-blue-900">
                            <CountUp end={analytics.totalClicks} duration={2} />
                          </p>
                        </div>
                        <MousePointer className="w-8 h-8 text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-600 text-sm font-medium">Unique Visitors</p>
                          <p className="text-3xl font-bold text-green-900">
                            <CountUp end={analytics.uniqueVisitors} duration={2} />
                          </p>
                        </div>
                        <Users className="w-8 h-8 text-green-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-600 text-sm font-medium">Click Rate</p>
                          <p className="text-3xl font-bold text-purple-900">
                            <CountUp end={analytics.clickRate} decimals={1} duration={2} />
                            <span className="text-lg">/day</span>
                          </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-purple-600" />
                      </div>
                    </div>
                    
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-600 text-sm font-medium">Engagement Rate</p>
                          <p className="text-3xl font-bold text-orange-900">
                            <CountUp end={analytics.engagementRate} duration={2} />
                            <span className="text-lg">%</span>
                          </p>
                        </div>
                        <Eye className="w-8 h-8 text-orange-600" />
                      </div>
                    </div>
                  </div>

                  {/* Daily Stats Chart */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Daily Activity</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={analytics.dailyStats || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => format(parseISO(value), 'MMM dd')}
                        />
                        <YAxis />
                        <Tooltip 
                          labelFormatter={(value) => format(parseISO(value), 'MMM dd, yyyy')}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="clicks" 
                          stackId="1" 
                          stroke="#3B82F6" 
                          fill="#3B82F6" 
                          fillOpacity={0.6}
                          name="Clicks"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="uniqueVisitors" 
                          stackId="2" 
                          stroke="#10B981" 
                          fill="#10B981" 
                          fillOpacity={0.6}
                          name="Unique Visitors"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Countries */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Top Countries</h3>
                      <div className="space-y-3">
                        {(analytics.topCountries || []).slice(0, 5).map((country, index) => (
                          <div key={country.country} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="text-2xl">{country.countryCode === 'US' ? '🇺🇸' : '🌍'}</span>
                              <span className="font-medium">{country.country}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-600">{country.count} clicks</span>
                              <span className="text-sm font-medium text-blue-600">{country.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Device Breakdown */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Device Types</h3>
                      <div className="space-y-3">
                        {(analytics.deviceStats || []).map((device, index) => (
                          <div key={device.device} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              {getDeviceIcon(device.device)}
                              <span className="font-medium capitalize">{device.device}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-600">{device.count} clicks</span>
                              <span className="text-sm font-medium text-blue-600">{device.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Traffic Tab */}
              {activeTab === 'traffic' && (
                <div className="space-y-6">
                  {/* Traffic Sources */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Traffic Sources</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={analytics.referrerStats}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ referrer, percentage }) => `${referrer} (${percentage}%)`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="count"
                          >
                            {(analytics.referrerStats || []).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Referrer Details</h3>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {(analytics.referrerStats || []).map((referrer, index) => (
                          <div key={referrer.referrer} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium capitalize">{referrer.referrer}</p>
                              <p className="text-sm text-gray-600">{referrer.category}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{referrer.count}</p>
                              <p className="text-sm text-gray-600">{referrer.percentage}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hourly Pattern */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Hourly Traffic Pattern</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={analytics.hourlyPattern || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Weekly Pattern */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Weekly Traffic Pattern</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={(analytics.weeklyPattern || []).map(item => ({
                        ...item,
                        dayName: formatDayName(item.day)
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dayName" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Geography Tab */}
              {activeTab === 'geography' && (
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Geographic Distribution</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(analytics.topCountries || []).map((country, index) => (
                        <div key={country.country} className="p-4 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{country.country}</span>
                            <span className="text-sm text-gray-600">{country.percentage}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${country.percentage}%` }}
                            ></div>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{country.count} clicks</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Technology Tab */}
              {activeTab === 'technology' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Browsers */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Browsers</h3>
                      <div className="space-y-3">
                        {(analytics.browserStats || []).slice(0, 8).map((browser, index) => (
                          <div key={browser.browser} className="flex items-center justify-between">
                            <span className="font-medium">{browser.browser}</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${browser.percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600 w-12 text-right">{browser.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Operating Systems */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Operating Systems</h3>
                      <div className="space-y-3">
                        {(analytics.osStats || []).slice(0, 8).map((os, index) => (
                          <div key={os.os} className="flex items-center justify-between">
                            <span className="font-medium">{os.os}</span>
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-600 h-2 rounded-full" 
                                  style={{ width: `${os.percentage}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600 w-12 text-right">{os.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Behavior Tab */}
              {activeTab === 'behavior' && (
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2">Time</th>
                            <th className="text-left py-2">Location</th>
                            <th className="text-left py-2">Device</th>
                            <th className="text-left py-2">Browser</th>
                            <th className="text-left py-2">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analytics.recentClicks || []).map((click, index) => (
                            <tr key={index} className="border-b border-gray-100">
                              <td className="py-2">
                                {format(parseISO(click.timestamp), 'MMM dd, HH:mm')}
                              </td>
                              <td className="py-2">{click.city}, {click.country}</td>
                              <td className="py-2 capitalize">{click.device}</td>
                              <td className="py-2">{click.browser}</td>
                              <td className="py-2 capitalize">{click.referrerCategory}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Real-time Tab */}
              {activeTab === 'realtime' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Real-time Analytics</h3>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Auto-refresh</span>
                      </label>
                      <button
                        onClick={fetchRealtimeData}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  {realtimeData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="text-green-600 text-sm font-medium">Active Visitors</div>
                        <div className="text-2xl font-bold text-green-900">{realtimeData.activeVisitors}</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="text-blue-600 text-sm font-medium">Clicks (Last Hour)</div>
                        <div className="text-2xl font-bold text-blue-900">{realtimeData.recentClicks}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Click refresh to load real-time data
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnalyticsModal;
