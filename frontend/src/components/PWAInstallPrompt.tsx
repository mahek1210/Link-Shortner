// components/PWAInstallPrompt.tsx - PWA installation prompt component
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { Button } from './ui/Button';
import { usePWA } from '../hooks/usePWA';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, showInstallPrompt, dismissInstallPrompt } = usePWA();

  if (!isInstallable) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-lg shadow-xl border border-gray-200 p-6 z-50"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Download className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Install Link Shortener
              </h3>
              <p className="text-sm text-gray-600">
                Get quick access from your home screen
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissInstallPrompt}
            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="mb-4">
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4" />
              <span>Works offline</span>
            </div>
            <div className="flex items-center space-x-2">
              <Monitor className="w-4 h-4" />
              <span>Fast loading</span>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <Button
            onClick={showInstallPrompt}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Install App
          </Button>
          <Button
            variant="outline"
            onClick={dismissInstallPrompt}
            className="px-4"
          >
            Not now
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
