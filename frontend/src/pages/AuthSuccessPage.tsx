import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

export const AuthSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthSuccess = async () => {
      const token = searchParams.get('token');
      const userParam = searchParams.get('user');
      
      if (!token) {
        setError('No authentication token received');
        setLoading(false);
        return;
      }

      try {
        let userData;
        
        // Try to get user data from URL parameter first (Google OAuth)
        if (userParam) {
          try {
            userData = JSON.parse(decodeURIComponent(userParam));
          } catch (parseError) {
            console.warn('Failed to parse user data from URL, fetching from API');
          }
        }
        
        // If no user data in URL, fetch from API
        if (!userData) {
          const response = await authAPI.getProfileWithToken(token);
          userData = response.user;
        }
        
        // Store authentication data
        login(token, userData);
        
        // Show success message briefly before redirect
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1000);
        
      } catch (error: any) {
        console.error('Auth success error:', error);
        setError(error.response?.data?.message || error.message || 'Authentication failed');
        setLoading(false);
      }
    };

    handleAuthSuccess();
  }, [searchParams, login, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Completing authentication...
          </h2>
          <p className="text-gray-600">
            Please wait while we set up your account.
          </p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
            <div className="mx-auto h-12 w-12 bg-destructive rounded-full flex items-center justify-center mb-4">
              <span className="text-white text-xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Authentication Failed
            </h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return null;
};
