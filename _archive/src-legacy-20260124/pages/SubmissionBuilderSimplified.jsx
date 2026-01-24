// SubmissionBuilderSimplified.jsx – Simplified version without DnD dependencies
import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// Region-specific folder hierarchy definitions (simplified)
const REGION_FOLDERS = {
  FDA: ['m1', 'm2', 'm3', 'm4', 'm5'],
  EMA: ['m1', 'm2', 'm3', 'm4', 'm5', 'application-form'],
  PMDA: ['m1', 'm2', 'm3', 'm4', 'm5', 'jp-annex'],
};

const REGION_HINTS = {
  FDA: [
    '✓ Form 1571 must be in m1.2/form-1571 folder',
    '✓ Form 3674 (clinicaltrials.gov) required in m1.2/form-3674 folder',
    '✓ Cover letter must be in m1.1/cover-letter and PDF < 10 MB',
    '✓ Clinical study reports should be placed in m5.3/clinical-study-reports',
    '✓ Follows FDA eCTD 3.2.2 validation rules',
  ],
  EMA: [
    '✓ EU Application Form PDF required in application-form/eu-application-form folder',
    '✓ Letter of Authorization must be in m1.2/application-form',
    '✓ Active Substance Master File should be in m1/asmf folder',
    '✓ Product Information Annexes I-III must be in m1.3/product-information',
    '✓ Follows EU eCTD 3.2.2 technical validation criteria',
  ],
  PMDA: [
    '✓ JP Annex PDF must be placed in jp-annex folder',
    '✓ Japanese translations required in jp-annex/jp-data/translations',
    '✓ Application form must be in m1.1/application-form',
    '✓ Risk Management Plan required in m1.5/risk-management-plan',
    '✓ Follows JP eCTD 1.0 technical validation requirements',
  ],
};

export default function SubmissionBuilderSimplified({ initialRegion = 'FDA', region: propRegion }) {
  // Use either the passed region prop or fall back to initialRegion
  const [region, setRegion] = useState(propRegion || initialRegion);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('disconnected');

  // Load documents and organize them by module
  useEffect(() => {
    async function loadDocs() {
      setLoading(true);
      try {
        // Mock data for demonstration purposes
        const mockDocs = [
          { id: 1, title: 'Form 1571', module: 'm1.2', status: 'passed' },
          { id: 2, title: 'Form 3674', module: 'm1.2', status: 'failed' },
          { id: 3, title: 'Cover Letter', module: 'm1.1', status: 'passed' },
          { id: 4, title: 'Clinical Study XYZ-123', module: 'm5.3', status: null },
          { id: 5, title: 'Quality Overview', module: 'm2.3', status: 'passed' },
        ];

        setDocuments(mockDocs);
      } catch (error) {
        console.error('Error loading documents:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDocs();
  }, [region]);

  // Mock WebSocket connection status
  useEffect(() => {
    // Simulate a WebSocket connection
    setWsStatus('connecting');

    const timer = setTimeout(() => {
      setWsStatus('connected');
    }, 1500);

    return () => clearTimeout(timer);
  }, [region]);

  // Function to get status badge color
  const getStatusBadgeClass = () => {
    switch (wsStatus) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-warning';
      case 'reconnecting':
        return 'bg-warning';
      case 'disconnected':
      default:
        return 'bg-danger';
    }
  };

  // Function to get status badge text
  const getStatusMessage = () => {
    switch (wsStatus) {
      case 'connected':
        return `Connected to ${region} QC`;
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  // Function to get documents by module
  const getDocumentsByModule = module => {
    return documents.filter(doc => doc.module.startsWith(module));
  };

  if (loading) return <div className="text-center mt-4">Loading...</div>;

  return (
    <div className="container py-4">
      {/* Header with region selector */}
      <div className="mb-4">
        <div className="d-flex align-items-center">
          <h2 className="mb-0 me-4">Submission Builder</h2>

          {/* WebSocket connection status indicator */}
          <div className="d-flex align-items-center me-3">
            <span
              className={`badge ${getStatusBadgeClass()} d-flex align-items-center gap-1`}
              title={`QC WebSocket status: ${wsStatus}`}
            >
              <span
                className="spinner-grow spinner-grow-sm"
                role="status"
                aria-hidden="true"
                style={{
                  display:
                    wsStatus === 'connecting' || wsStatus === 'reconnecting'
                      ? 'inline-block'
                      : 'none',
                }}
              ></span>
              {getStatusMessage()}
            </span>
          </div>

          <div className="btn-group" role="group" aria-label="Region Selection">
            {Object.keys(REGION_FOLDERS).map(r => (
              <button
                key={r}
                type="button"
                className={`btn ${region === r ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setRegion(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Region-specific hints */}
      <div className="mb-4 p-3 bg-light rounded">
        <h5>Validation Profile: {region}</h5>
        <ul className="mb-0">
          {REGION_HINTS[region].map((hint, index) => (
            <li key={index}>{hint}</li>
          ))}
        </ul>
      </div>

      {/* Simplified folder structure */}
      <div className="folder-structure mb-4">
        <h4>Submission Structure</h4>
        <p className="text-muted">
          <AlertTriangle size={16} className="me-1" />
          Drag-and-drop functionality temporarily disabled in this simplified view
        </p>

        <div className="row">
          {REGION_FOLDERS[region].map(folder => (
            <div key={folder} className="col-md-6 mb-3">
              <div className="card">
                <div className="card-header bg-light">
                  <strong>{folder}</strong>
                </div>
                <ul className="list-group list-group-flush">
                  {getDocumentsByModule(folder).map(doc => (
                    <li
                      key={doc.id}
                      className="list-group-item d-flex justify-content-between align-items-center"
                    >
                      {doc.title}
                      <div>
                        <span className="badge text-bg-secondary me-2">{doc.module}</span>
                        {doc.status === 'passed' && (
                          <CheckCircle size={16} className="text-success" />
                        )}
                        {doc.status === 'failed' && <XCircle size={16} className="text-danger" />}
                        {doc.status === null && (
                          <AlertTriangle size={16} className="text-warning" />
                        )}
                      </div>
                    </li>
                  ))}
                  {getDocumentsByModule(folder).length === 0 && (
                    <li className="list-group-item text-muted">No documents in this module</li>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-primary" disabled>
          Save Order
        </button>
        <button className="btn btn-outline-success" disabled>
          Bulk QC Check
        </button>
        <button className="btn btn-outline-secondary">Generate Report</button>
      </div>
    </div>
  );
}
