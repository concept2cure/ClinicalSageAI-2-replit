/**
 * Demo Dashboard Component
 * Showcases CERV2 system with mock data at various completion stages
 */

import React, { useState } from 'react';
import mockDemoData from '../data/mockDemoData.js';

export function DemoDashboard() {
  const [selectedScenario, setSelectedScenario] = useState('midstage');
  const [expandedDevice, setExpandedDevice] = useState(null);

  const scenarios = mockDemoData.mockDemoScenarios;
  const currentScenario = scenarios[selectedScenario];

  const getStatusColor = (status) => {
    const colors = {
      started: '#FF9800',
      device_profile_complete: '#2196F3',
      predicate_selected: '#2196F3',
      equivalence_complete: '#4CAF50',
      compliance_complete: '#4CAF50',
      package_complete: '#4CAF50',
      submitted: '#9C27B0',
      approved: '#00BCD4',
    };
    return colors[status] || '#757575';
  };

  const getStatusLabel = (status) => {
    const labels = {
      started: '🚀 Just Started',
      device_profile_complete: '📋 Profile Complete',
      predicate_selected: '🔍 Predicate Selected',
      equivalence_complete: '⚖️ Equivalence Complete',
      compliance_complete: '✅ Compliance Complete',
      package_complete: '📦 Package Ready',
      submitted: '📤 Submitted to FDA',
      approved: '🎉 FDA Approved',
    };
    return labels[status] || status;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🏥 CERV2 Demo Dashboard</h1>
      <p>
        Showcasing realistic demo scenarios with mock data at various completion
        stages
      </p>

      {/* Scenario Selector */}
      <div style={{ marginBottom: '30px', backgroundColor: '#f5f5f5', padding: '15px' }}>
        <h3>Select Demo Scenario</h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          {Object.entries(scenarios).map(([key, scenario]) => (
            <button
              key={key}
              onClick={() => setSelectedScenario(key)}
              style={{
                padding: '10px 20px',
                backgroundColor: selectedScenario === key ? '#2196F3' : '#e0e0e0',
                color: selectedScenario === key ? 'white' : 'black',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>
        <p style={{ marginTop: '10px', color: '#666' }}>
          <em>{currentScenario.description}</em>
        </p>
      </div>

      {/* Organizations */}
      <div style={{ marginBottom: '30px' }}>
        <h3>📊 Organizations in Scenario</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
          {currentScenario.organizations.map((org) => (
            <div
              key={org.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: '#f9f9f9',
              }}
            >
              <h4>{org.name}</h4>
              <p>
                <strong>Industry:</strong> {org.industry}
              </p>
              <p>
                <strong>Location:</strong> {org.city}, {org.state}, {org.country}
              </p>
              <p>
                <strong>Contact:</strong> {org.email}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Device Pipeline */}
      <div style={{ marginBottom: '30px' }}>
        <h3>🔧 Device Pipeline</h3>
        <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '15px' }}>
          {currentScenario.devices.map((device) => (
            <div
              key={device.id}
              onClick={() =>
                setExpandedDevice(expandedDevice === device.id ? null : device.id)
              }
              style={{
                minWidth: '250px',
                border: `3px solid ${getStatusColor(device.status)}`,
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0' }}>{device.deviceName}</h4>
              <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                <strong>Status:</strong> {getStatusLabel(device.status)}
              </p>
              <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                <strong>Class:</strong> {device.deviceClass}
              </p>
              <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
                <strong>Code:</strong> {device.productCode}
              </p>

              {/* Progress Bar */}
              <div style={{ marginTop: '10px', backgroundColor: '#e0e0e0', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${device.completionPercentage}%`,
                    backgroundColor: getStatusColor(device.status),
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '11px', textAlign: 'right' }}>
                {device.completionPercentage}% complete
              </p>

              {/* Expanded Details */}
              {expandedDevice === device.id && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #ddd', paddingTop: '15px', fontSize: '12px' }}>
                  <p>
                    <strong>Manufacturer:</strong> {device.manufacturer}
                  </p>
                  {device.modelNumber && (
                    <p>
                      <strong>Model:</strong> {device.modelNumber}
                    </p>
                  )}
                  <p>
                    <strong>Intended Use:</strong> {device.intendedUse.substring(0, 100)}...
                  </p>
                  {device.predicateSelected && (
                    <p style={{ color: '#4CAF50' }}>
                      ✅ <strong>Predicate:</strong> {device.predicateDeviceName} ({device.predicateDeviceId})
                    </p>
                  )}
                  {device.equivalenceAnalysis && (
                    <p style={{ color: '#2196F3' }}>
                      ⚖️ <strong>Equivalence Score:</strong> {device.equivalenceAnalysis.score}/100
                    </p>
                  )}
                  {device.complianceCheck && (
                    <p style={{ color: device.complianceCheck.score >= 90 ? '#4CAF50' : '#FF9800' }}>
                      ✓ <strong>Compliance Score:</strong> {device.complianceCheck.score}/100
                    </p>
                  )}
                  {device.fdaSubmission && (
                    <p style={{ color: '#9C27B0' }}>
                      📤 <strong>K-Number:</strong> {device.fdaSubmission.submissionNumber}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div style={{ marginBottom: '30px' }}>
        <h3>📄 Documents</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
          {currentScenario.documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: '#fafafa',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0' }}>{doc.title}</h4>
              <p style={{ margin: '5px 0', fontSize: '12px' }}>
                <strong>Status:</strong> {doc.status}
              </p>

              {/* Section Completion */}
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                  Sections: {doc.sections.filter((s) => s.completed).length}/{doc.sections.length}
                </p>
                {doc.sections.map((section) => (
                  <div
                    key={section.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '5px',
                      fontSize: '11px',
                    }}
                  >
                    <span style={{ color: section.completed ? '#4CAF50' : '#ccc' }}>
                      {section.completed ? '✓' : '○'}
                    </span>
                    <span style={{ flex: 1 }}>{section.title}</span>
                    {section.complianceScore && (
                      <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
                        {section.complianceScore}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  marginTop: '10px',
                  backgroundColor: '#e0e0e0',
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${doc.completionPercentage}%`,
                    backgroundColor: '#4CAF50',
                  }}
                />
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '11px', textAlign: 'right' }}>
                {doc.completionPercentage}% complete
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Predicate Devices */}
      {currentScenario.predicates && (
        <div style={{ marginBottom: '30px' }}>
          <h3>🔍 Predicate Devices Found</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {currentScenario.predicates.map((pred) => (
              <div
                key={pred.id}
                style={{
                  border: '2px solid #2196F3',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: '#E3F2FD',
                }}
              >
                <h4>{pred.deviceName}</h4>
                <p>
                  <strong>K-Number:</strong> {pred.kNumber}
                </p>
                <p>
                  <strong>Manufacturer:</strong> {pred.manufacturer}
                </p>
                <p>
                  <strong>Intended Use:</strong> {pred.intendedUse}
                </p>
                <p>
                  <strong>Clearance Date:</strong> {pred.clearanceDate}
                </p>
                <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
                  <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
                    Relevance Score: {pred.relevanceScore}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equivalence Analyses */}
      {currentScenario.equivalences && (
        <div style={{ marginBottom: '30px' }}>
          <h3>⚖️ Equivalence Analyses</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
            {currentScenario.equivalences.map((equiv) => (
              <div
                key={equiv.id}
                style={{
                  border: '2px solid #4CAF50',
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: '#F1F8E9',
                }}
              >
                <h4>Equivalence Analysis</h4>
                <div style={{ backgroundColor: '#C8E6C9', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                  <p style={{ margin: '5px 0', fontWeight: 'bold', fontSize: '18px' }}>
                    Score: {equiv.equivalenceScore}/100
                  </p>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Similarities:</p>
                  <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
                    {equiv.similarities.slice(0, 2).map((sim, i) => (
                      <li key={i}>{sim}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Key Differences:</p>
                  <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
                    {equiv.differences.slice(0, 2).map((diff, i) => (
                      <li key={i}>{diff}</li>
                    ))}
                  </ul>
                </div>

                {equiv.riskAssessment && (
                  <p style={{ marginTop: '10px', fontSize: '12px' }}>
                    <strong>Risk Level:</strong> {equiv.riskAssessment.overallRisk}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Checks */}
      {currentScenario.compliance && (
        <div style={{ marginBottom: '30px' }}>
          <h3>✅ Compliance Checks</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
            {currentScenario.compliance.map((comp) => (
              <div
                key={comp.id}
                style={{
                  border: `2px solid ${comp.status === 'passed' ? '#4CAF50' : '#FF9800'}`,
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: comp.status === 'passed' ? '#F1F8E9' : '#FFF3E0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Compliance Check</h4>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: comp.status === 'passed' ? '#4CAF50' : '#FF9800' }}>
                    {comp.status === 'passed' ? '✓ PASSED' : '! REVIEW NEEDED'}
                  </span>
                </div>

                <div style={{ backgroundColor: comp.status === 'passed' ? '#C8E6C9' : '#FFE0B2', padding: '10px', borderRadius: '4px', marginBottom: '10px' }}>
                  <p style={{ margin: '5px 0', fontWeight: 'bold', fontSize: '16px' }}>
                    Score: {comp.complianceScore}/100
                  </p>
                </div>

                {comp.warnings.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontWeight: 'bold', marginBottom: '5px', color: '#FF9800' }}>
                      ⚠️ Warnings:
                    </p>
                    <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '12px' }}>
                      {comp.warnings.slice(0, 2).map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {comp.canProceedToSubmission && (
                  <p style={{ color: '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>
                    ✓ Ready for FDA Submission
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FDA Submissions */}
      {currentScenario.submissions && (
        <div style={{ marginBottom: '30px' }}>
          <h3>📤 FDA Submissions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
            {currentScenario.submissions.map((sub) => (
              <div
                key={sub.id}
                style={{
                  border: `2px solid ${sub.status === 'cleared' ? '#00BCD4' : '#9C27B0'}`,
                  borderRadius: '8px',
                  padding: '15px',
                  backgroundColor: sub.status === 'cleared' ? '#E0F2F1' : '#F3E5F5',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0 }}>Submission {sub.submissionNumber}</h4>
                  <span
                    style={{
                      padding: '5px 10px',
                      backgroundColor: sub.status === 'cleared' ? '#00BCD4' : '#9C27B0',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {sub.status === 'cleared' ? '🎉 CLEARED' : '⏳ UNDER REVIEW'}
                  </span>
                </div>

                <p style={{ margin: '5px 0', fontSize: '12px' }}>
                  <strong>Submitted:</strong> {sub.submissionDate}
                </p>

                {sub.decisionDate && (
                  <p style={{ margin: '5px 0', fontSize: '12px' }}>
                    <strong>Decision Date:</strong> {sub.decisionDate}
                  </p>
                )}

                {sub.estimatedDecisionDate && !sub.decisionDate && (
                  <p style={{ margin: '5px 0', fontSize: '12px' }}>
                    <strong>Est. Decision:</strong> {sub.estimatedDecisionDate}
                  </p>
                )}

                {/* Progress Bar */}
                <div style={{ marginTop: '10px', backgroundColor: '#e0e0e0', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${sub.progressPercentage}%`,
                      backgroundColor: sub.status === 'cleared' ? '#00BCD4' : '#9C27B0',
                    }}
                  />
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', textAlign: 'right' }}>
                  {sub.progressPercentage}% complete
                </p>

                {sub.daysFromSubmissionToDecision && (
                  <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#666' }}>
                    ✓ <strong>Decision in {sub.daysFromSubmissionToDecision} days</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          backgroundColor: '#f5f5f5',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '30px',
        }}
      >
        <h3>📊 Summary</h3>
        <p>{currentScenario.progress}</p>
      </div>
    </div>
  );
}

export default DemoDashboard;
