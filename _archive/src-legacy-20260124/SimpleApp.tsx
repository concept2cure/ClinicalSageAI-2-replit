import React, { useState, useEffect } from 'react';
import { Route, Switch, Link, useLocation } from 'wouter';

// WebSocket status component (simplified)
const WebSocketStatus = () => {
  const [wsStatus, setWsStatus] = useState('Not connected');

  // Check WebSocket status but don't block app functionality
  useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => setWsStatus('Connected');
      ws.onerror = () => setWsStatus('Error');
      ws.onclose = event => setWsStatus(`Closed (${event.code})`);

      return () => ws.close();
    } catch (err) {
      setWsStatus('Initialization Error');
    }
  }, []);

  return (
    <div
      style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '9999px',
        backgroundColor: wsStatus === 'Connected' ? '#22c55e' : '#ef4444',
        color: 'white',
      }}
    >
      WebSocket: {wsStatus}
    </div>
  );
};

// App navigation
const Navigation = () => {
  const [location] = useLocation();

  return (
    <nav
      style={{
        padding: '1rem',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/">
          <a
            style={{
              fontWeight: location === '/' ? 'bold' : 'normal',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            TrialSage Home
          </a>
        </Link>
        <Link href="/ind-wizard">
          <a
            style={{
              fontWeight: location === '/ind-wizard' ? 'bold' : 'normal',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            IND Wizard
          </a>
        </Link>
        <Link href="/cro">
          <a
            style={{
              fontWeight: location === '/cro' ? 'bold' : 'normal',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            CRO Dashboard
          </a>
        </Link>
        <Link href="/reports">
          <a
            style={{
              fontWeight: location === '/reports' ? 'bold' : 'normal',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            CSR Reports
          </a>
        </Link>
        <Link href="/diagnostic">
          <a
            style={{
              fontWeight: location === '/diagnostic' ? 'bold' : 'normal',
              textDecoration: 'none',
              color: '#2563eb',
            }}
          >
            System Diagnostic
          </a>
        </Link>
      </div>
      <WebSocketStatus />
    </nav>
  );
};

// Diagnostic component (simplified version of the original)
const WebSocketDiagnostic = () => {
  const [testResults, setTestResults] = useState<{ [key: string]: string }>({});

  // Test API connectivity
  useEffect(() => {
    const testApiConnectivity = async () => {
      // API health check
      try {
        const healthResponse = await fetch('/api/health');
        setTestResults(prev => ({
          ...prev,
          'API Health': healthResponse.ok ? 'Working' : `Failed: ${healthResponse.status}`,
        }));
      } catch (err: any) {
        setTestResults(prev => ({
          ...prev,
          'API Health': `Error: ${err.message}`,
        }));
      }

      // IND wizard data
      try {
        const indDataResponse = await fetch('/api/ind/wizard/data');
        setTestResults(prev => ({
          ...prev,
          'IND Wizard Data': indDataResponse.ok ? 'Available' : `Failed: ${indDataResponse.status}`,
        }));
      } catch (err: any) {
        setTestResults(prev => ({
          ...prev,
          'IND Wizard Data': `Error: ${err.message}`,
        }));
      }
    };

    testApiConnectivity();
  }, []);

  return (
    <div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>System Diagnostic</h1>

      <div
        style={{
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <h2>API Connectivity</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th
                style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}
              >
                Endpoint
              </th>
              <th
                style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(testResults).map(([test, result]) => (
              <tr key={test}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>{test}</td>
                <td
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid #e5e7eb',
                    color:
                      result.includes('Working') || result.includes('Available') ? 'green' : 'red',
                    fontWeight: 'bold',
                  }}
                >
                  {result}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          backgroundColor: '#fef9c3',
        }}
      >
        <h2>Known Issues</h2>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>WebSocket connections are failing with code 1006</li>
          <li>FastAPI server at port 8000 is not accessible</li>
        </ul>
        <p>The application can still function in limited capacity without these connections.</p>
      </div>
    </div>
  );
};

// IND Wizard component (simplified)
const INDWizard = () => {
  const [wizardData, setWizardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch IND wizard data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/ind/wizard/data');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        setWizardData(data);
      } catch (err: any) {
        setError(err.message);
        console.error('Error fetching IND wizard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading IND Wizard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h2>Error Loading IND Wizard</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h1>IND Wizard</h1>
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '0.25rem 0.5rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
            }}
          >
            Draft ID: {wizardData?.id || 'N/A'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '250px 1fr',
          gap: '1rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            backgroundColor: '#f9fafb',
            padding: '1rem',
            borderRight: '1px solid #e5e7eb',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Sections</h3>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
            }}
          >
            <li
              style={{
                padding: '0.5rem',
                borderRadius: '0.25rem',
                backgroundColor: '#2563eb',
                color: 'white',
                marginBottom: '0.5rem',
              }}
            >
              Pre-IND Information
            </li>
            <li
              style={{
                padding: '0.5rem',
                borderRadius: '0.25rem',
                marginBottom: '0.5rem',
              }}
            >
              Nonclinical Studies
            </li>
            <li
              style={{
                padding: '0.5rem',
                borderRadius: '0.25rem',
                marginBottom: '0.5rem',
                opacity: 0.5,
              }}
            >
              Clinical Studies
            </li>
            <li
              style={{
                padding: '0.5rem',
                borderRadius: '0.25rem',
                marginBottom: '0.5rem',
                opacity: 0.5,
              }}
            >
              CMC Information
            </li>
            <li
              style={{
                padding: '0.5rem',
                borderRadius: '0.25rem',
                marginBottom: '0.5rem',
                opacity: 0.5,
              }}
            >
              Additional Information
            </li>
          </ul>
        </div>

        <div style={{ padding: '1rem' }}>
          <h2>Pre-IND Information</h2>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Drug Name
            </label>
            <input
              type="text"
              value={wizardData?.sections?.preIndData?.drugName || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Indication
            </label>
            <input
              type="text"
              value={wizardData?.sections?.preIndData?.indicationName || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Sponsor Information
            </label>
            <input
              type="text"
              value={wizardData?.sections?.preIndData?.sponsorInfo || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              IND Number
            </label>
            <input
              type="text"
              value={wizardData?.sections?.preIndData?.indNumber || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.25rem',
                fontWeight: 'bold',
              }}
            >
              Target Submission Date
            </label>
            <input
              type="text"
              value={wizardData?.sections?.preIndData?.targetSubmissionDate || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
              }}
            />
          </div>

          <div style={{ marginTop: '2rem', textAlign: 'right' }}>
            <button
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                marginLeft: '0.5rem',
              }}
            >
              Next: Nonclinical Studies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// CSR Reports component (simplified)
// CRO Dashboard Component
const CRODashboard = () => {
  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>CRO Operations Dashboard</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2563eb' }}>Total Clients</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0' }}>24</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0' }}>Active partnerships</p>
        </div>
        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2563eb' }}>Active Studies</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0' }}>47</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0' }}>
            Ongoing clinical trials
          </p>
        </div>
        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2563eb' }}>Pending Submissions</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0' }}>12</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0' }}>
            Awaiting regulatory review
          </p>
        </div>
        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#2563eb' }}>Compliance Score</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0' }}>94%</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0' }}>
            Overall compliance rating
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
        >
          <h3 style={{ margin: '0 0 1rem 0' }}>Recent Activity</h3>
          <div style={{ space: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  backgroundColor: '#22c55e',
                  borderRadius: '50%',
                }}
              ></div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  BPI-001 First Patient Enrolled
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>2 hours ago</p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  backgroundColor: '#3b82f6',
                  borderRadius: '50%',
                }}
              ></div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  510(k) Submission K243567 Submitted
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>1 day ago</p>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  backgroundColor: '#eab308',
                  borderRadius: '50%',
                }}
              ></div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  IND-123456 Approved by FDA
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>3 days ago</p>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
        >
          <h3 style={{ margin: '0 0 1rem 0' }}>Upcoming Deadlines</h3>
          <div style={{ space: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  Interim Safety Analysis
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>BPI-001 Study</p>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid #f97316',
                  borderRadius: '0.25rem',
                  color: '#f97316',
                }}
              >
                Due Aug 30
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  Study Report Submission
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>MDS-501K</p>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid #ef4444',
                  borderRadius: '0.25rem',
                  color: '#ef4444',
                }}
              >
                Due Sep 15
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0' }}>
                  Annual Report Filing
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0' }}>
                  Multiple studies
                </p>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid #3b82f6',
                  borderRadius: '0.25rem',
                  color: '#3b82f6',
                }}
              >
                Due Oct 1
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            textAlign: 'center',
            fontStyle: 'italic',
          }}
        >
          CRO Operations Dashboard - Comprehensive contract research organization management
          platform
        </p>
      </div>
    </div>
  );
};

// Document Editor Component
const DocumentEditor = () => {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get task ID from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const taskIdParam = urlParams.get('taskId');
    if (taskIdParam) {
      setTaskId(taskIdParam);
      fetchTaskStatus(taskIdParam);
    } else {
      setError('No task ID provided');
      setLoading(false);
    }
  }, []);

  const fetchTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/v1/drafting/task_status/${taskId}`);
      if (response.ok) {
        const data = await response.json();
        setTaskStatus(data);
      } else {
        setError('Failed to fetch task status');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '50vh',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            width: '2rem',
            height: '2rem',
            border: '3px solid #e5e7eb',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        ></div>
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '2rem',
          maxWidth: '600px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2>Error</h2>
        <p style={{ color: '#ef4444' }}>{error}</p>
        <button
          onClick={() => (window.location.href = '/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            marginTop: '1rem',
          }}
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1>Document Editor</h1>
        {taskStatus && (
          <div
            style={{
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span style={{ fontWeight: 'bold' }}>Status:</span>
            <span
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                backgroundColor: taskStatus.status === 'COMPLETED' ? '#dcfce7' : '#fef3c7',
                color: taskStatus.status === 'COMPLETED' ? '#166534' : '#92400e',
              }}
            >
              {taskStatus.status}
            </span>
            <span style={{ color: '#6b7280' }}>Task ID: {taskStatus.id}</span>
          </div>
        )}
      </div>

      {taskStatus && taskStatus.draft_content && (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            backgroundColor: '#f9fafb',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ margin: 0 }}>Generated Document</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(taskStatus.draft_content);
                  alert('Content copied to clipboard!');
                }}
                style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Copy Content
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([taskStatus.draft_content], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${taskStatus.ectd_section}_${taskStatus.document_title}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  padding: '0.375rem 0.75rem',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Download
              </button>
            </div>
          </div>
          <div
            style={{
              backgroundColor: 'white',
              padding: '1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e5e7eb',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              maxHeight: '600px',
              overflowY: 'auto',
            }}
          >
            {taskStatus.draft_content}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            marginRight: '1rem',
          }}
        >
          Back
        </button>
        <button
          onClick={() => (window.location.href = '/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Return to Home
        </button>
      </div>
    </div>
  );
};

const CSRReports = () => {
  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>CSR Reports</h1>

      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          backgroundColor: '#f9fafb',
        }}
      >
        <h2>CSR Library</h2>
        <p>This feature requires a working WebSocket connection.</p>
        <p>Please check the system diagnostic for more information.</p>
      </div>
    </div>
  );
};

// Home component (simplified)
const Home = () => {
  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        style={{
          padding: '2rem',
          backgroundColor: '#f0f9ff',
          borderRadius: '0.5rem',
          marginBottom: '2rem',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            marginTop: 0,
            marginBottom: '1rem',
            color: '#0369a1',
          }}
        >
          Welcome to TrialSage
        </h1>
        <p style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>
          The Clinical Intelligence System That Thinks Like a Biotech Founder
        </p>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
          }}
        >
          <Link href="/ind-wizard">
            <a
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '0.25rem',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              Open IND Wizard
            </a>
          </Link>
          <Link href="/reports">
            <a
              style={{
                display: 'inline-block',
                padding: '0.75rem 1.5rem',
                backgroundColor: 'white',
                color: '#2563eb',
                border: '1px solid #2563eb',
                borderRadius: '0.25rem',
                textDecoration: 'none',
                fontWeight: 'bold',
              }}
            >
              View CSR Reports
            </a>
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem',
        }}
      >
        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
        >
          <h2 style={{ marginTop: 0 }}>IND & NDA Submission Accelerator</h2>
          <ul>
            <li>2× faster INDs</li>
            <li>Eliminates 90% manual formatting</li>
            <li>One-click eCTD → ESG</li>
          </ul>
        </div>

        <div
          style={{
            padding: '1.5rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Global CSR Intelligent Library</h2>
          <ul>
            <li>Advanced CSR analytics</li>
            <li>Automated report generation</li>
            <li>Cross-study insights</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * Simplified App component that doesn't depend on WebSockets
 * This provides basic navigation and functionality that works
 * even when real-time WebSocket connections are failing
 */
export default function SimpleApp() {
  return (
    <div className="app-container" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <Navigation />

      <Switch>
        <Route path="/" component={Home} />
        <Route path="/ind-wizard" component={INDWizard} />
        <Route path="/cro" component={CRODashboard} />
        <Route path="/editor" component={DocumentEditor} />
        <Route path="/reports" component={CSRReports} />
        <Route path="/diagnostic" component={WebSocketDiagnostic} />
        <Route path="*">
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h1>Page Not Found</h1>
            <p>The requested page could not be found.</p>
            <Link href="/">
              <a
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  borderRadius: '0.25rem',
                  textDecoration: 'none',
                }}
              >
                Go Home
              </a>
            </Link>
          </div>
        </Route>
      </Switch>
    </div>
  );
}
