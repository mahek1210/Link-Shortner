import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { OfflineIndicator } from './components/OfflineIndicator';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useServiceWorker } from './hooks/useServiceWorker';

// Lazy load pages for better performance
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })));
const SignupPage = React.lazy(() => import('./pages/SignupPage').then(module => ({ default: module.SignupPage })));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(module => ({ default: module.DashboardPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })));
const AuthSuccessPage = React.lazy(() => import('./pages/AuthSuccessPage').then(module => ({ default: module.AuthSuccessPage })));
const AuthErrorPage = React.lazy(() => import('./pages/AuthErrorPage').then(module => ({ default: module.AuthErrorPage })));

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-gray-600">Loading...</p>
    </div>
  </div>
);

function App() {
  const { isSupported } = useServiceWorker();

  useEffect(() => {
    // Register service worker and handle PWA features
    if (isSupported) {
      console.log('PWA features enabled');
    }

    // Handle URL parameters for PWA shortcuts
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    if (action === 'create') {
      // Trigger create URL modal when opened from PWA shortcut
      setTimeout(() => {
        const event = new CustomEvent('pwa-create-url');
        window.dispatchEvent(event);
      }, 1000);
    }
  }, [isSupported]);

  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="App">
          {/* PWA Components */}
          <OfflineIndicator />
          <PWAInstallPrompt />
          <UpdatePrompt />
          
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/auth-success" element={<AuthSuccessPage />} />
              <Route path="/auth-error" element={<AuthErrorPage />} />
              
              {/* Protected routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              } />
              
              <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              } />
              
              {/* Redirect root to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              
              {/* Catch all - redirect to dashboard */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
