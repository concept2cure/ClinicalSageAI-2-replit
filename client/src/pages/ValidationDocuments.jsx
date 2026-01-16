import React, { useEffect, useState } from 'react';
import { FileText, Download, Shield, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * ValidationDocuments - Page for accessing IQ/OQ/PQ validation documentation
 *
 * This component:
 * 1. Shows available validation documents
 * 2. Allows generation of new validation documentation
 * 3. Provides download options for various formats
 */
export default function ValidationDocuments() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [validationStatus, setValidationStatus] = useState(null);

  // Load validation status on mount
  useEffect(() => {
    fetchValidationStatus();
  }, []);

  // Fetch validation documents status
  const fetchValidationStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/validation/iqoq');
      if (!response.ok) {
        throw new Error(`Failed to fetch validation status: ${response.statusText}`);
      }

      const data = await response.json();
      setValidationStatus(data.success ? data : data.data);
      console.log('Validation status:', data);
    } catch (err) {
      console.error('Error fetching validation status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate new validation documentation
  const generateDocumentation = async () => {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/validation/iqoq/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force: true }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate validation documentation: ${response.statusText}`);
      }

      const data = await response.json();
      alert(`Generation status: ${data.status}. ${data.message}`);

      // Refresh status after generation is initiated
      fetchValidationStatus();
    } catch (err) {
      console.error('Error generating validation documentation:', err);
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Helper to format timestamp
  const formatTimestamp = timestamp => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  // Download a specific format
  const downloadDocument = format => {
    window.open(`/api/validation/iqoq/download?format=${format}`, '_blank');
  };

  // Download complete bundle
  const downloadBundle = () => {
    window.open('/api/validation/iqoq/bundle', '_blank');
  };

  // Loading state
  if (loading) {
    return (
      <div className="w-full p-6">
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin mr-3">
            <RefreshCw size={24} className="text-emerald-600" />
          </div>
          <span>Loading validation status...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          <h4 className="text-lg font-semibold mb-2">Error</h4>
          <p className="mb-4">{error}</p>
          <button
            className="px-4 py-2 border border-red-300 dark:border-red-700 rounded-md flex items-center hover:bg-red-100 dark:hover:bg-red-800/30"
            onClick={fetchValidationStatus}
          >
            <RefreshCw size={16} className="mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      <div className="flex items-center mb-6">
        <Shield size={28} className="text-emerald-600 mr-2" />
        <h1 className="text-2xl font-bold">Validation Documentation</h1>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm mb-6">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <h2 className="font-semibold">IQ/OQ/PQ Documentation Status</h2>
        </div>
        <div className="p-4">
          {validationStatus?.status === 'available' ? (
            <>
              <div className="flex items-center mb-3">
                <CheckCircle size={18} className="text-emerald-500 mr-2" />
                <strong>Status:</strong>&nbsp;Validation documents are available
              </div>
              <p className="mb-2">
                <strong>Last Generated:</strong> {formatTimestamp(validationStatus.generated_at)}
              </p>
              <p className="mb-4">
                <strong>Available Formats:</strong> {validationStatus.available_formats?.join(', ')}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center mb-3">
                <AlertTriangle size={18} className="text-amber-500 mr-2" />
                <strong>Status:</strong>&nbsp;No validation documents available
              </div>
              <p className="mb-4">
                {validationStatus?.message || 'Generate validation documentation to proceed.'}
              </p>
            </>
          )}

          <button
            className="px-4 py-2 bg-emerald-600 text-white rounded-md flex items-center hover:bg-emerald-700 transition-colors disabled:opacity-50"
            onClick={generateDocumentation}
            disabled={generating}
          >
            {generating ? (
              <>
                <div className="animate-spin mr-2">
                  <RefreshCw size={16} />
                </div>
                Generating...
              </>
            ) : (
              <>
                <RefreshCw size={16} className="mr-2" />
                Generate New Documentation
              </>
            )}
          </button>
        </div>
      </div>

      {validationStatus?.status === 'available' && validationStatus.available_formats && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h2 className="font-semibold">Download Options</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {validationStatus.available_formats.map(format => (
                <div
                  key={format}
                  className="flex items-center p-2 bg-gray-50 dark:bg-slate-900 rounded-md"
                >
                  <FileText size={18} className="text-emerald-600 mr-2" />
                  <span className="flex-grow">
                    {format === 'docx'
                      ? 'IQ/OQ/PQ Document (DOCX)'
                      : format === 'standard_docx'
                        ? 'Latest IQ/OQ/PQ Document'
                        : format === 'json'
                          ? 'System Information (JSON)'
                          : format === 'checksum'
                            ? 'File Checksums'
                            : format === 'pdf'
                              ? 'IQ/OQ/PQ Document (PDF)'
                              : format}
                  </span>
                  <button
                    className="px-3 py-1 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-md flex items-center hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                    onClick={() => downloadDocument(format)}
                  >
                    <Download size={14} className="mr-1" />
                    Download
                  </button>
                </div>
              ))}
            </div>

            <button
              className="px-4 py-2 bg-emerald-600 text-white rounded-md flex items-center hover:bg-emerald-700 transition-colors"
              onClick={downloadBundle}
            >
              <Download size={18} className="mr-2" />
              Download Complete Bundle (ZIP)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
