import React, { useState } from 'react';
import { X } from 'lucide-react'

export default function VersionsTour() {
  const [showTour, setShowTour] = useState(true);

  if (!showTour) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-50 border border-blue-200 p-4 rounded-lg shadow-lg max-w-xs z-40">
      <button
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        onClick={() => setShowTour(false)}
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-blue-900 mb-2">Welcome to Document Vault</h3>
      <p className="text-sm text-gray-600 mb-3">
        You can now drag and drop to reorder documents, view content, compare versions, and download
        in different formats.
      </p>
      <div className="text-xs text-blue-600">
        Pro tip: Try clicking "Compare" to see document differences
      </div>
    </div>
  );
}
