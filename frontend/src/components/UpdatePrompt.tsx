// components/UpdatePrompt.tsx - Service Worker update prompt
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { Button } from './ui/Button';
import { useServiceWorker } from '../hooks/useServiceWorker';

export const UpdatePrompt: React.FC = () => {
  const { isUpdateAvailable, updateServiceWorker } = useServiceWorker();
  const [dismissed, setDismissed] = React.useState(false);

  if (!isUpdateAvailable || dismissed) return null;

  const handleUpdate = () => {
    updateServiceWorker();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-blue-50 border border-blue-200 rounded-lg shadow-lg p-4 z-50"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-blue-900">
                Update Available
              </h4>
              <p className="text-xs text-blue-700">
                A new version is ready to install
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 text-blue-400 hover:text-blue-600"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex space-x-2">
          <Button
            onClick={handleUpdate}
            size="sm"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Update Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismiss}
            className="px-3 text-xs"
          >
            Later
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
