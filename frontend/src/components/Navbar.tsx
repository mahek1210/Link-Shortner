import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Settings, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">LS</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Link Shortener</span>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              to="/dashboard"
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              Dashboard
            </Link>

            {user.role === 'admin' && (
              <Link
                to="/admin"
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                Admin
              </Link>
            )}

            <div className="relative group">
              <button className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt={user.name || user.username || 'User'} 
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span>{user.name || user.username || 'User'}</span>
              </button>
              
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="px-4 py-2 text-sm text-gray-700 border-b">
                  <div className="font-medium">{user.name || user.username || 'User'}</div>
                  <div className="text-gray-500">{user.email}</div>
                  {user.avatar && (
                    <div className="mt-2">
                      <img 
                        src={user.avatar} 
                        alt={user.name || user.username || 'User'} 
                        className="w-8 h-8 rounded-full"
                      />
                    </div>
                  )}
                </div>
                
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
