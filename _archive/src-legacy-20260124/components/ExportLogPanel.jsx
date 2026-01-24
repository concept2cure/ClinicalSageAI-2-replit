import React, { useState, useEffect } from 'react';
import { Calendar, FileText, Mail, RefreshCw, Download, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/**
 * ExportLogPanel Component
 *
 * Displays the export log information for a session, showing when exports were made
 * and to whom they were sent. Provides download/re-send capabilities.
 *
 * @param {Object} props
 * @param {string} props.sessionId - The ID of the current session
 * @param {boolean} props.autoRefresh - Whether to auto-refresh (every 30s)
 */
const ExportLogPanel = ({ sessionId, autoRefresh = true }) => {
  const [exportData, setExportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchExportLog = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/session/export-log/${sessionId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch export log: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setExportData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching export log:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportLog();

    // Set up auto-refresh if enabled
    let refreshInterval = null;
    if (autoRefresh) {
      refreshInterval = setInterval(fetchExportLog, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [sessionId, autoRefresh]);

  const formatTimestamp = timestamp => {
    if (!timestamp) return 'Never';

    // Handle different timestamp formats
    try {
      if (timestamp.includes('T')) {
        // ISO format
        return format(parseISO(timestamp), 'MMM d, yyyy h:mm a');
      } else if (timestamp.includes('_')) {
        // Format like 20250414_120530
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(9, 11);
        const minute = timestamp.substring(11, 13);
        const second = timestamp.substring(13, 15);

        return format(new Date(year, month - 1, day, hour, minute, second), 'MMM d, yyyy h:mm a');
      }
      // Fallback - return as is
      return timestamp;
    } catch (e) {
      console.warn('Error formatting timestamp:', e);
      return timestamp;
    }
  };

  // Handle download click
  const handleDownload = filename => {
    // Generate correct download URL based on filename
    let downloadUrl;
    if (filename.includes('regulatory')) {
      downloadUrl = `/api/download/regulatory-bundle/${filename}`;
    } else if (filename.includes('summary')) {
      downloadUrl = `/api/download/summary-packet/${filename}`;
    } else {
      downloadUrl = `/api/download/export/${filename}`;
    }

    // Open in new tab
    window.open(downloadUrl, '_blank');
  };

  if (loading && !exportData) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
        <div className="flex items-center mb-2">
          <Clock className="w-5 h-5 mr-2 text-blue-500" />
          <h3 className="text-lg font-medium">Export History</h3>
        </div>
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  // If no exports yet
  if (!exportData || !exportData.last_export) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <Clock className="w-5 h-5 mr-2 text-blue-500" />
            <h3 className="text-lg font-medium">Export History</h3>
          </div>
          <button
            onClick={fetchExportLog}
            className="text-sm text-gray-500 hover:text-blue-500 flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>
        <p className="text-gray-500 text-sm p-3 text-center">
          No exports have been created yet. Use the export buttons to generate reports.
        </p>
      </div>
    );
  }

  // Render export log data
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Clock className="w-5 h-5 mr-2 text-blue-500" />
          <h3 className="text-lg font-medium">Export History</h3>
        </div>
        <button
          onClick={fetchExportLog}
          className="text-sm text-gray-500 hover:text-blue-500 flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </button>
      </div>

      <div className="border-b pb-3 mb-3">
        <div className="flex items-start mb-1">
          <Calendar className="w-4 h-4 mr-2 text-gray-500 mt-1" />
          <div className="flex-1">
            <div className="text-sm font-medium">Last exported</div>
            <div className="text-gray-700 dark:text-gray-300">
              {formatTimestamp(
                exportData.last_export?.last_exported || exportData.last_export?.timestamp
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start mb-1">
          <FileText className="w-4 h-4 mr-2 text-gray-500 mt-1" />
          <div className="flex-1">
            <div className="text-sm font-medium">File</div>
            <div className="text-gray-700 dark:text-gray-300 flex items-center">
              <span className="truncate mr-2 max-w-[220px]">
                {exportData.last_export?.bundle_file || exportData.last_export?.filename}
              </span>
              <button
                onClick={() =>
                  handleDownload(
                    exportData.last_export?.bundle_file || exportData.last_export?.filename
                  )
                }
                className="text-blue-500 hover:text-blue-700"
                title="Download file"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {exportData.last_export?.recipient && exportData.last_export.recipient !== 'N/A' && (
          <div className="flex items-start">
            <Mail className="w-4 h-4 mr-2 text-gray-500 mt-1" />
            <div className="flex-1">
              <div className="text-sm font-medium">Recipient</div>
              <div className="text-gray-700 dark:text-gray-300">
                {exportData.last_export.recipient}
              </div>
            </div>
          </div>
        )}
      </div>

      {exportData.exports && exportData.exports.length > 1 && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Previous Exports
          </div>
          <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
            {exportData.exports
              .slice(0, -1)
              .reverse()
              .map((exp, idx) => (
                <div
                  key={idx}
                  className="text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between"
                >
                  <div className="flex-1 truncate">
                    {formatTimestamp(exp.last_exported || exp.timestamp)}
                  </div>
                  <button
                    onClick={() => handleDownload(exp.bundle_file || exp.filename)}
                    className="text-blue-500 hover:text-blue-700 ml-2"
                    title="Download file"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-red-500">Error: {error}</div>}
    </div>
  );
};

export default ExportLogPanel;
