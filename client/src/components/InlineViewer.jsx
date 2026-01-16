import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react'

/**
 * InlineViewer Component
 *
 * A component for previewing document content inline within the application.
 * Supports PDF, Word, Excel, and text files through iframe embedding.
 *
 * @param {Object} props - Component props
 * @param {string} props.fileUrl - URL of the file to display
 * @param {string} props.fileType - Optional file type override (e.g., 'pdf', 'docx')
 * @param {Object} props.options - Optional viewer configuration options
 */
const InlineViewer = ({ fileUrl, fileType, options = {} }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewerUrl, setViewerUrl] = useState('');

  useEffect(() => {
    if (!fileUrl) {
      setError('No file URL provided');
      setLoading(false);
      return;
    }

    try {
      // Extract file extension from URL if not provided
      let fileExtension = fileType;
      if (!fileExtension) {
        const urlParts = fileUrl.split('.');
        fileExtension = urlParts[urlParts.length - 1].toLowerCase();
      }

      // Determine the appropriate viewer URL
      let viewerPath = '';

      // For Google Docs Viewer (supports PDF, DOCX, XLSX, etc.)
      if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExtension)) {
        // Use direct URL for PDFs if supported by the browser
        if (fileExtension === 'pdf' && options.nativeViewer !== false) {
          viewerPath = fileUrl;
        } else {
          // Use Google Docs Viewer or Microsoft Office Online Viewer as fallback
          viewerPath = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
        }
      } else if (['txt', 'csv', 'json'].includes(fileExtension)) {
        // For text files, fetch and display in a pre tag
        viewerPath = fileUrl;
      } else {
        // For all other file types, use a generic viewer or show download option
        viewerPath = fileUrl;
      }

      setViewerUrl(viewerPath);
      setLoading(false);
    } catch (err) {
      console.error('Error setting up document viewer:', err);
      setError('Failed to initialize document viewer');
      setLoading(false);
    }
  }, [fileUrl, fileType, options]);

  // Handle iframe load event
  const handleLoad = () => {
    setLoading(false);
  };

  // Handle iframe error event
  const handleError = () => {
    setError('Failed to load document preview');
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-600">Loading document preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-gray-50 border border-gray-200 rounded-md">
        <div className="text-center p-6">
          <p className="text-red-500 font-medium mb-2">{error}</p>
          <p className="text-gray-500">
            Unable to preview this document. Please try downloading it instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] border border-gray-200 rounded-md overflow-hidden">
      <iframe
        src={viewerUrl}
        className="w-full h-full border-0"
        onLoad={handleLoad}
        onError={handleError}
        title="Document Preview"
        sandbox="allow-same-origin allow-scripts allow-forms"
      />
    </div>
  );
};

export default InlineViewer;
