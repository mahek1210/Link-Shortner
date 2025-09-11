import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          // Parse stored user data
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          
          // Only verify token if it's been more than 1 hour since last check
          const lastCheck = localStorage.getItem('tokenLastCheck');
          const now = Date.now();
          const oneHour = 60 * 60 * 1000;
          
          if (!lastCheck || (now - parseInt(lastCheck)) > oneHour) {
            try {
              const response = await authAPI.getProfile();
              // Update user data if profile fetch succeeds
              if (response.user) {
                setUser(response.user);
                localStorage.setItem('user', JSON.stringify(response.user));
              }
              localStorage.setItem('tokenLastCheck', now.toString());
            } catch (error) {
              // Token is invalid, clear storage
              console.warn('Token validation failed, clearing auth data');
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('tokenLastCheck');
              setToken(null);
              setUser(null);
            }
          }
        } catch (error) {
          // Invalid stored data, clear storage
          console.warn('Invalid stored auth data, clearing');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('tokenLastCheck');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('tokenLastCheck', Date.now().toString());
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenLastCheck');
    setToken(null);
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    loading,
    isAuthenticated: !!token && !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
