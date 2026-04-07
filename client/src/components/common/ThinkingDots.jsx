// /client/src/components/common/ThinkingDots.jsx

import React from 'react';

export default function ThinkingDots() {
  return (
    <div className="flex items-center space-x-1 py-2">
      <div
        className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"
        style={{ animationDelay: '0ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"
        style={{ animationDelay: '150ms' }}
      ></div>
      <div
        className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"
        style={{ animationDelay: '300ms' }}
      ></div>
      <span className="text-sm text-gray-500 ml-2">Thinking...</span>
    </div>
  );
}
