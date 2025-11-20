/**
 * Loading Overlay
 *
 * This component provides a full-screen loading overlay.
 */

import React from 'react';

const LoadingOverlay = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-90">
      <div className="text-center">
        <div className="inline-block w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-lg font-medium text-gray-800">{message}</div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
