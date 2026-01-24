// CERDashboard.jsx
import React, { useState, useEffect } from 'react';
import CERGenerator from './CERGenerator';
import Dashboard from './Dashboard';

export default function CERDashboard() {
  const [ndcCodes, setNdcCodes] = useState([]);
  const [inputNdcCode, setInputNdcCode] = useState('');
  const [isAnalysisEnabled, setIsAnalysisEnabled] = useState(false);
  const [reportData, setReportData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Add an NDC code to the list for comparative analysis
  const addNdcCode = () => {
    if (!inputNdcCode || inputNdcCode.trim() === '') {
      setError('Please enter a valid NDC code');
      return;
    }

    if (ndcCodes.includes(inputNdcCode)) {
      setError('This NDC code is already in the analysis list');
      return;
    }

    setNdcCodes([...ndcCodes, inputNdcCode]);
    setInputNdcCode('');
    setError('');

    // Enable analysis when we have at least one code
    if (!isAnalysisEnabled) {
      setIsAnalysisEnabled(true);
    }
  };

  // Remove an NDC code from the list
  const removeNdcCode = codeToRemove => {
    const updatedCodes = ndcCodes.filter(code => code !== codeToRemove);
    setNdcCodes(updatedCodes);

    // Disable analysis if no codes are left
    if (updatedCodes.length === 0) {
      setIsAnalysisEnabled(false);
    }
  };

  // Run batch analysis for all selected NDC codes
  const runBatchAnalysis = async () => {
    if (ndcCodes.length === 0) {
      setError('Please add at least one NDC code for analysis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/cer/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ndc_codes: ndcCodes,
          include_comparative_analysis: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to retrieve batch analysis data');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error in batch processing');
      }

      setReportData(data);
    } catch (err) {
      console.error('Batch analysis error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate suggested NDC codes for user convenience
  const suggestedNdcCodes = [
    { code: '0074-3799', name: 'Humira (adalimumab)' },
    { code: '0078-0527', name: 'Entresto (sacubitril/valsartan)' },
    { code: '50090-4730', name: 'Ozempic (semaglutide)' },
    { code: '0069-0187', name: 'Lipitor (atorvastatin)' },
    { code: '0006-0277', name: 'Januvia (sitagliptin)' },
  ];

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ borderBottom: '3px solid #3498db', paddingBottom: '10px', color: '#2c3e50' }}>
        CER Analytics Dashboard
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        {/* Individual CER Generator Section */}
        <section>
          <h2>Single CER Generator</h2>
          <CERGenerator />
        </section>

        {/* Batch Analysis Section */}
        <section
          style={{
            padding: '20px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            backgroundColor: '#f8f9fa',
          }}
        >
          <h2
            style={{
              borderBottom: '2px solid #3498db',
              paddingBottom: '10px',
              marginBottom: '20px',
            }}
          >
            Comparative Analysis
          </h2>

          {/* NDC Code Selection */}
          <div style={{ marginBottom: '20px' }}>
            <h3>Select NDC Codes for Analysis</h3>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}
            >
              <input
                type="text"
                value={inputNdcCode}
                onChange={e => setInputNdcCode(e.target.value)}
                placeholder="Enter NDC Code"
                style={{
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  width: '250px',
                  fontSize: '16px',
                }}
              />
              <button
                onClick={addNdcCode}
                style={{
                  padding: '10px 15px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Add to Analysis
              </button>
            </div>

            {/* Suggested NDC Codes */}
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ marginBottom: '8px' }}>Suggested Medications:</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {suggestedNdcCodes.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInputNdcCode(item.code);
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#e9ecef',
                      border: '1px solid #ced4da',
                      borderRadius: '20px',
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.name} ({item.code})
                  </button>
                ))}
              </div>
            </div>

            {/* Selected NDC Codes List */}
            {ndcCodes.length > 0 && (
              <div>
                <h4 style={{ marginBottom: '8px' }}>Selected for Analysis:</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {ndcCodes.map((code, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '8px 12px',
                        backgroundColor: '#e1f5fe',
                        borderRadius: '20px',
                        fontSize: '14px',
                      }}
                    >
                      <span>{code}</span>
                      <button
                        onClick={() => removeNdcCode(code)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#f44336',
                          fontWeight: 'bold',
                          fontSize: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#f8d7da',
                  color: '#721c24',
                  borderRadius: '4px',
                  border: '1px solid #f5c6cb',
                }}
              >
                {error}
              </div>
            )}

            {/* Run Analysis Button */}
            <div style={{ marginTop: '20px' }}>
              <button
                onClick={runBatchAnalysis}
                disabled={!isAnalysisEnabled || loading}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isAnalysisEnabled && !loading ? '#2ecc71' : '#cccccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isAnalysisEnabled && !loading ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                {loading ? 'Analyzing...' : 'Run Comparative Analysis'}
              </button>
            </div>
          </div>

          {/* Dashboard Visualization */}
          {isAnalysisEnabled && ndcCodes.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <Dashboard ndcCodes={ndcCodes} />
            </div>
          )}

          {/* Batch Reports Summary */}
          {reportData.reports && reportData.reports.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3>Report Summaries</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '20px',
                }}
              >
                {reportData.reports.map((report, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '15px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                    }}
                  >
                    <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>
                      Report for NDC: {report.ndc_code}
                    </h4>
                    {report.success ? (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <strong>Events: </strong> {report.summary?.event_count || 'N/A'}
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                          <strong>Total Reactions: </strong>{' '}
                          {report.summary?.total_reactions || 'N/A'}
                        </div>
                        {report.summary?.top_events && (
                          <div>
                            <strong>Top Events:</strong>
                            <ul style={{ marginTop: '5px' }}>
                              {report.summary.top_events.map((event, idx) => (
                                <li key={idx}>
                                  {event[0]}: {event[1]}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <button
                          onClick={() => window.open(`/api/cer/${report.ndc_code}/pdf`, '_blank')}
                          style={{
                            marginTop: '15px',
                            padding: '8px 12px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Download PDF
                        </button>
                      </>
                    ) : (
                      <div style={{ color: '#e74c3c' }}>Error: {report.cer_report}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
