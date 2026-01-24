/**
 * File Upload Wrapper Component
 *
 * This is a stable wrapper around the FileUpload component to prevent version conflicts.
 * All components should import FileUpload from this wrapper instead of directly from
 * file-upload.jsx or file-upload.tsx to prevent compatibility issues.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import React, { useState, useCallback } from 'react';
import { FileUpload as FileUploadTsx } from './file-upload';
import { STABILITY_CONFIG } from '@/config/stabilityConfig';

/**
 * A robust, error-protected wrapper for the FileUpload component
 * that prevents errors from propagating upward.
 */
export const FileUpload = props => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Safely handle errors that might occur in the wrapped component
  const handleError = useCallback(
    error => {
      console.error('FileUpload component error:', error);
      setHasError(true);
      setErrorMessage(error.message);

      // Log error for diagnostics if configured to do so
      if (STABILITY_CONFIG.logErrors) {
        try {
          const errorLog = {
            component: 'FileUpload',
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            props: JSON.stringify(props),
          };
          const existingLogs = JSON.parse(localStorage.getItem('component_errors') || '[]');
          existingLogs.push(errorLog);
          // Keep only the last N errors
          if (existingLogs.length > STABILITY_CONFIG.maxErrorsToStore) {
            existingLogs.shift();
          }
          localStorage.setItem('component_errors', JSON.stringify(existingLogs));
        } catch (e) {
          // Ignore storage errors
        }
      }

      // If a callback for errors was provided, call it
      if (props.onError) {
        props.onError(error);
      }
    },
    [props]
  );

  // Reset the error state to try again
  const resetError = useCallback(() => {
    setHasError(false);
    setErrorMessage(null);
  }, []);

  // If component is in error state, show fallback UI
  if (hasError) {
    return (
      <div className="border-2 border-dashed border-red-200 rounded-lg p-4 bg-red-50 text-center">
        <p className="text-sm text-red-600 mb-2">File upload component error</p>
        {STABILITY_CONFIG.showDetailedErrors && errorMessage && (
          <p className="text-xs text-gray-600 mb-2">{errorMessage}</p>
        )}
        <button
          onClick={resetError}
          className="text-sm text-blue-600 hover:text-blue-800 underline mt-1"
        >
          Try again
        </button>
      </div>
    );
  }

  // Wrap the actual component in an error boundary
  try {
    return <FileUploadTsx {...props} />;
  } catch (error) {
    handleError(error);
    return null;
  }
};

// Also export as default for components that use default imports
export default FileUpload;
