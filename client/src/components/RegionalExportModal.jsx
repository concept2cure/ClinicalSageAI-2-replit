import React, { useState } from 'react';
import { X, Download, FileText, AlertTriangle, Check } from 'lucide-react';

const REGULATORY_FORMATS = [
  {
    id: 'fda',
    name: 'FDA eCTD',
    description: 'U.S. FDA Electronic Common Technical Document format',
    icon: '🇺🇸',
    modules: ['m1', 'm2', 'm3', 'm4', 'm5'],
  },
  {
    id: 'ema',
    name: 'EMA eCTD',
    description: 'European Medicines Agency eCTD format with EU regional requirements',
    icon: '🇪🇺',
    modules: ['m1', 'm2', 'm3', 'm4', 'm5'],
  },
  {
    id: 'pmda',
    name: 'PMDA eCTD',
    description: 'Japan PMDA format with JP regional module and annexes',
    icon: '🇯🇵',
    modules: ['m1', 'm2', 'm3', 'm4', 'm5', 'jp-annex'],
  },
  {
    id: 'hc',
    name: 'Health Canada eCTD',
    description: 'Health Canada format with CA regional module',
    icon: '🇨🇦',
    modules: ['m1', 'm2', 'm3', 'm4', 'm5'],
  },
];

export default function RegionalExportModal({ sequenceId, onClose }) {
  const [selectedFormat, setSelectedFormat] = useState('fda');
  const [exportStatus, setExportStatus] = useState('idle'); // idle, loading, success, error
  const [exportData, setExportData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSelectFormat = formatId => {
    setSelectedFormat(formatId);
  };

  const handleExport = async () => {
    try {
      setExportStatus('loading');
      setErrorMessage('');

      const response = await fetch(`/api/export/sequence/${sequenceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: selectedFormat }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate export');
      }

      const data = await response.json();
      setExportData(data);
      setExportStatus('success');
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus('error');
      setErrorMessage(error.message || 'An unexpected error occurred');
    }
  };

  const handleDownload = () => {
    if (exportData?.download_url) {
      window.location.href = exportData.download_url;
    }
  };

  const selectedFormatObj = REGULATORY_FORMATS.find(f => f.id === selectedFormat);

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">Export Submission Package</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {exportStatus === 'idle' && (
            <>
              <div className="export-info mb-4">
                <p>Select a regulatory format to export sequence #{sequenceId}:</p>
              </div>

              <div className="format-options">
                {REGULATORY_FORMATS.map(format => (
                  <div
                    key={format.id}
                    className={`format-option ${selectedFormat === format.id ? 'selected' : ''}`}
                    onClick={() => handleSelectFormat(format.id)}
                  >
                    <div className="format-icon">{format.icon}</div>
                    <div className="format-details">
                      <h4>{format.name}</h4>
                      <p>{format.description}</p>
                    </div>
                    <div className="format-select">
                      <input
                        type="radio"
                        checked={selectedFormat === format.id}
                        onChange={() => handleSelectFormat(format.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {selectedFormatObj && (
                <div className="selected-format-details mt-4">
                  <h4>Format Details: {selectedFormatObj.name}</h4>
                  <p>Included Modules:</p>
                  <ul className="modules-list">
                    {selectedFormatObj.modules.map(module => (
                      <li key={module}>{module}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {exportStatus === 'loading' && (
            <div className="export-loading">
              <div className="spinner"></div>
              <p>Generating {selectedFormatObj?.name} export package...</p>
              <p className="text-muted">
                This may take a few moments depending on the size of your submission.
              </p>
            </div>
          )}

          {exportStatus === 'error' && (
            <div className="export-error">
              <AlertTriangle size={48} className="text-error mb-3" />
              <h4>Export Failed</h4>
              <p>{errorMessage}</p>
              <button
                className="btn btn-outline-secondary mt-3"
                onClick={() => setExportStatus('idle')}
              >
                Try Again
              </button>
            </div>
          )}

          {exportStatus === 'success' && (
            <div className="export-success">
              <Check size={48} className="text-success mb-3" />
              <h4>Export Generated Successfully</h4>
              <div className="export-details">
                <p>
                  <strong>Format:</strong> {exportData.format.toUpperCase()}
                </p>
                <p>
                  <strong>File Name:</strong> {exportData.file_name}
                </p>
                <p>
                  <strong>File Size:</strong> {formatFileSize(exportData.file_size)}
                </p>
              </div>
              <button className="btn btn-success mt-3" onClick={handleDownload}>
                <Download size={16} className="me-2" />
                Download Package
              </button>
              <button
                className="btn btn-outline-secondary mt-3 ms-2"
                onClick={() => setExportStatus('idle')}
              >
                Create Another Export
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {exportStatus === 'idle' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleExport}>
                <FileText size={16} className="me-2" />
                Generate Export
              </button>
            </>
          )}
          {exportStatus === 'success' && (
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          border-radius: 8px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .modal-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
        }

        .modal-body {
          padding: 20px;
          max-height: 60vh;
          overflow-y: auto;
        }

        .modal-footer {
          padding: 16px 20px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .format-options {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .format-option {
          display: flex;
          align-items: center;
          padding: 12px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .format-option:hover {
          background-color: #f9f9f9;
        }

        .format-option.selected {
          border-color: #788c5d;
          background-color: #f1f8e9;
        }

        .format-icon {
          font-size: 24px;
          margin-right: 16px;
          min-width: 36px;
          text-align: center;
        }

        .format-details {
          flex: 1;
        }

        .format-details h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
        }

        .format-details p {
          margin: 0;
          font-size: 14px;
          color: #666;
        }

        .modules-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
          padding-left: 0;
          list-style: none;
        }

        .modules-list li {
          background-color: #f1f1f1;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 14px;
        }

        .export-loading,
        .export-error,
        .export-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 24px 0;
        }

        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-left-color: #788c5d;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        .text-error {
          color: #e53935;
        }

        .text-success {
          color: #788c5d;
        }

        .text-muted {
          color: #777;
          font-size: 14px;
        }

        .export-details {
          background-color: #f5f5f5;
          padding: 12px 16px;
          border-radius: 6px;
          margin: 16px 0;
          text-align: left;
          width: 100%;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
