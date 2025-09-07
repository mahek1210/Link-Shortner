import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { CreateUrlData } from '../types';

interface CreateUrlModalProps {
  onClose: () => void;
  onSubmit: (data: CreateUrlData) => void;
}

export const CreateUrlModal: React.FC<CreateUrlModalProps> = ({
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<CreateUrlData>({
    originalUrl: '',
    customAlias: '',
    expiresAt: '',
    password: '',
    tags: [],
  });
  const [errors, setErrors] = useState<Partial<CreateUrlData>>({});
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const validateForm = () => {
    const newErrors: Partial<CreateUrlData> = {};

    if (!formData.originalUrl) {
      newErrors.originalUrl = 'Original URL is required';
    } else if (!/^https?:\/\/.+/.test(formData.originalUrl)) {
      newErrors.originalUrl = 'Please enter a valid URL starting with http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    
    console.log('Form submission started with data:', formData);
    
    if (!validateForm()) {
      console.log('Form validation failed');
      return;
    }

    setLoading(true);
    try {
      console.log('Calling onSubmit with validated data:', formData);
      await onSubmit(formData);
      console.log('Form submission successful');
      
      // Clear form on success
      setFormData({
        originalUrl: '',
        customAlias: '',
        expiresAt: '',
        password: '',
        tags: [],
      });
      setTagInput('');
      setErrors({});
      setApiError(null);
      
    } catch (error: any) {
      console.error('Create URL error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create link';
      console.log('Setting error message:', errorMessage);
      setApiError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof CreateUrlData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || []
    }));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Create Short Link</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {apiError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                <p className="text-sm text-destructive">{apiError}</p>
              </div>
            )}

            <Input
              label="Original URL"
              name="originalUrl"
              type="url"
              required
              value={formData.originalUrl}
              onChange={handleChange}
              error={errors.originalUrl}
              placeholder="https://example.com"
            />

            <Input
              label="Custom Alias (optional)"
              name="customAlias"
              type="text"
              value={formData.customAlias}
              onChange={handleChange}
              error={errors.customAlias}
              placeholder="my-custom-link"
            />

            <Input
              label="Expiration Date (optional)"
              name="expiresAt"
              type="datetime-local"
              value={formData.expiresAt}
              onChange={handleChange}
            />

            <Input
              label="Password Protection (optional)"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter password to protect link"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (optional)</label>
              <div className="flex space-x-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} variant="outline">
                  Add
                </Button>
              </div>
              {formData.tags && formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/10 text-primary"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 text-primary/70 hover:text-primary"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading}
                className="flex-1"
              >
                Create Link
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
