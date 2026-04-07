// /client/src/components/common/LoadingSpinner.jsx

import React from 'react';

export default function LoadingSpinner({ size = 'default', text = null }) {
  const sizeClasses = {
    small: 'h-4 w-4 border-t-1 border-b-1',
    default: 'h-8 w-8 border-t-2 border-b-2',
    large: 'h-12 w-12 border-t-3 border-b-3',
  };

  return (
    <div className="flex flex-col justify-center items-center py-4">
      <div className={`animate-spin rounded-full ${sizeClasses[size]} border-indigo-600`}></div>
      {text && <p className="text-sm text-gray-500 mt-2">{text}</p>}
    </div>
  );
}
