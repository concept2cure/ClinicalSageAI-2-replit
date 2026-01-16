/**
 * Demo Data Integration Guide
 * Shows how to use mockDemoData in components throughout the application
 */

import React, { useState } from 'react';
import mockDemoData from '../data/mockDemoData';

/**
 * Example 1: Using Mock Data in a Component
 * This shows how to import and display mock demo data
 */
export const Example1_BasicUsage = () => {
  return (
    <div>
      <h2>Demo Organizations</h2>
      {mockDemoData.mockDemoClients.map((client) => (
        <div key={client.id}>
          <h3>{client.name}</h3>
          <p>Email: {client.email}</p>
          <p>Industry: {client.industry}</p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 2: Displaying Device Progression
 * Shows devices at different completion stages
 */
export const Example2_DeviceProgression = () => {
  return (
    <div>
      <h2>Device Submission Progress</h2>
      {mockDemoData.mockDeviceProfiles.map((device) => (
        <div key={device.id} style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
          <h3>{device.deviceName}</h3>
          <p>Progress: {device.completionPercentage}%</p>
          <progress value={device.completionPercentage} max="100" />
          <p>Status: {device.status}</p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 3: Using Pre-Built Scenarios
 * Load one of the three demo scenarios for immediate presentation
 */
export const Example3_Scenarios = () => {
  const [selectedScenario, setSelectedScenario] = useState('startup');
  const scenario = mockDemoData.mockDemoScenarios[selectedScenario];

  return (
    <div>
      <h2>Select Demo Scenario</h2>
      <select value={selectedScenario} onChange={(e) => setSelectedScenario(e.target.value)}>
        <option value="startup">Startup Scenario</option>
        <option value="midstage">Mid-Stage Scenario</option>
        <option value="advanced">Advanced Scenario</option>
      </select>

      <h3>{selectedScenario.toUpperCase()}</h3>
      <p>{scenario.description}</p>

      <h4>Devices in this scenario:</h4>
      <ul>
        {scenario.devices.map((device) => (
          <li key={device.id}>
            {device.deviceName} - {device.completionPercentage}% complete
          </li>
        ))}
      </ul>

      <h4>Organizations:</h4>
      <ul>
        {scenario.organizations.map((org) => (
          <li key={org.id}>{org.name}</li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Example 4: Document Status Overview
 */
export const Example4_DocumentStatus = () => {
  return (
    <div>
      <h2>Document Status</h2>
      {mockDemoData.mockDocuments.map((doc) => (
        <div key={doc.id} style={{ marginBottom: '20px' }}>
          <h3>{doc.title}</h3>
          <p>Overall Completion: {doc.completionPercentage}%</p>
          <progress value={doc.completionPercentage} max="100" />

          <h4>Sections:</h4>
          <ul>
            {doc.sections.map((section) => (
              <li key={section.id}>
                {section.title}: {section.completed ? '✓ Complete' : '○ Incomplete'}
                {section.complianceScore && ` (${section.complianceScore}% compliant)`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 5: Predicate Device Search Results
 */
export const Example5_PredicateDevices = () => {
  return (
    <div>
      <h2>FDA Predicate Devices</h2>
      <p>Matching devices for equivalence analysis</p>
      {mockDemoData.mockPredicateDevices.map((device) => (
        <div
          key={device.id}
          style={{
            marginBottom: '15px',
            padding: '10px',
            border: '2px solid #2196F3',
            borderRadius: '5px',
          }}
        >
          <h3>{device.deviceName}</h3>
          <p>
            <strong>K-Number:</strong> {device.kNumber}
          </p>
          <p>
            <strong>Manufacturer:</strong> {device.manufacturer}
          </p>
          <p>
            <strong>Clearance Date:</strong> {device.clearanceDate}
          </p>
          <p>
            <strong>Relevance:</strong> {device.relevanceScore}%
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 6: Equivalence Analysis Results
 */
export const Example6_EquivalenceAnalysis = () => {
  return (
    <div>
      <h2>Equivalence Analysis Results</h2>
      {mockDemoData.mockEquivalenceAnalyses.map((analysis) => (
        <div key={analysis.id} style={{ marginBottom: '20px', padding: '10px', border: '1px solid #4CAF50' }}>
          <h3>Equivalence Score: {analysis.equivalenceScore}/100</h3>

          <div style={{ marginBottom: '10px' }}>
            <h4>Similarities:</h4>
            <ul>
              {analysis.similarities.map((sim, idx) => (
                <li key={idx}>{sim}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Differences:</h4>
            <ul>
              {analysis.differences.map((diff, idx) => (
                <li key={idx}>{diff}</li>
              ))}
            </ul>
          </div>

          {analysis.riskAssessment && (
            <p>
              <strong>Risk Level:</strong> {analysis.riskAssessment.overallRisk}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * Example 7: Compliance Check Status
 */
export const Example7_ComplianceChecks = () => {
  return (
    <div>
      <h2>Regulatory Compliance Checks</h2>
      {mockDemoData.mockComplianceChecks.map((check) => (
        <div
          key={check.id}
          style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: check.status === 'passed' ? '#E8F5E9' : '#FFF3E0',
            border: `2px solid ${check.status === 'passed' ? '#4CAF50' : '#FF9800'}`,
            borderRadius: '5px',
          }}
        >
          <h3>
            {check.status === 'passed' ? '✓ PASSED' : '⚠ NEEDS REVIEW'} - Score:{' '}
            {check.complianceScore}/100
          </h3>

          {check.warnings.length > 0 && (
            <div>
              <h4>Warnings:</h4>
              <ul>
                {check.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {check.recommendations.length > 0 && (
            <div>
              <h4>Recommendations:</h4>
              <ul>
                {check.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          <p>
            <strong>Can Proceed to Submission:</strong>{' '}
            {check.canProceedToSubmission ? '✓ Yes' : '✗ No'}
          </p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 8: FDA Submission Status
 */
export const Example8_FDASubmissions = () => {
  return (
    <div>
      <h2>FDA Submissions</h2>
      {mockDemoData.mockFDASubmissions.map((submission) => (
        <div
          key={submission.id}
          style={{
            marginBottom: '15px',
            padding: '10px',
            backgroundColor: submission.status === 'cleared' ? '#E0F2F1' : '#F3E5F5',
            border: `2px solid ${submission.status === 'cleared' ? '#00BCD4' : '#9C27B0'}`,
            borderRadius: '5px',
          }}
        >
          <h3>
            {submission.submissionNumber} -{' '}
            {submission.status === 'cleared' ? '🎉 CLEARED' : '⏳ UNDER REVIEW'}
          </h3>
          <p>
            <strong>Submitted:</strong> {submission.submissionDate}
          </p>
          {submission.decisionDate && (
            <p>
              <strong>Decision Date:</strong> {submission.decisionDate}
            </p>
          )}
          {submission.estimatedDecisionDate && !submission.decisionDate && (
            <p>
              <strong>Estimated Decision:</strong> {submission.estimatedDecisionDate}
            </p>
          )}
          <progress value={submission.progressPercentage} max="100" />
          <p>{submission.progressPercentage}% complete</p>
        </div>
      ))}
    </div>
  );
};

/**
 * Example 9: Complete Workflow Display
 * Shows full workflow from device to FDA approval
 */
export const Example9_CompleteWorkflow = () => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const stages = mockDemoData.mockDeviceProfiles;

  return (
    <div>
      <h2>Complete Workflow: Device to FDA Approval</h2>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setCurrentStageIndex(Math.max(0, currentStageIndex - 1))}>
          ← Previous Stage
        </button>
        <span style={{ margin: '0 10px' }}>
          Stage {currentStageIndex + 1} of {stages.length}
        </span>
        <button onClick={() => setCurrentStageIndex(Math.min(stages.length - 1, currentStageIndex + 1))}>
          Next Stage →
        </button>
      </div>

      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h3>{stages[currentStageIndex].deviceName}</h3>
        <p>
          <strong>Stage:</strong> {stages[currentStageIndex].status}
        </p>
        <p>
          <strong>Completion:</strong> {stages[currentStageIndex].completionPercentage}%
        </p>
        <progress value={stages[currentStageIndex].completionPercentage} max="100" />

        <div style={{ marginTop: '20px' }}>
          <h4>Details:</h4>
          <p>
            <strong>Manufacturer:</strong> {stages[currentStageIndex].manufacturer}
          </p>
          <p>
            <strong>Device Class:</strong> {stages[currentStageIndex].deviceClass}
          </p>
          <p>
            <strong>Intended Use:</strong> {stages[currentStageIndex].intendedUse}
          </p>
        </div>
      </div>

      {/* Progress visualization */}
      <div style={{ marginTop: '20px' }}>
        <h4>Overall Progress Through Workflow:</h4>
        <div style={{ display: 'flex', gap: '5px' }}>
          {stages.map((stage, idx) => (
            <div
              key={stage.id}
              style={{
                flex: 1,
                height: '30px',
                backgroundColor: idx <= currentStageIndex ? '#4CAF50' : '#e0e0e0',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '11px',
                color: idx <= currentStageIndex ? 'white' : '#999',
              }}
              onClick={() => setCurrentStageIndex(idx)}
              title={stage.deviceName}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * USAGE INSTRUCTIONS:
 *
 * 1. In your React component, import mockDemoData:
 *    import mockDemoData from '../data/mockDemoData';
 *
 * 2. Access the data directly:
 *    - mockDemoData.mockDemoClients // Array of 3 client organizations
 *    - mockDemoData.mockDeviceProfiles // Array of 8 devices at different stages
 *    - mockDemoData.mockDocuments // Array of 3 documents
 *    - mockDemoData.mockPredicateDevices // FDA predicate devices
 *    - mockDemoData.mockEquivalenceAnalyses // Analysis results
 *    - mockDemoData.mockComplianceChecks // Regulatory compliance
 *    - mockDemoData.mockSubmissionPackages // Assembled packages
 *    - mockDemoData.mockFDASubmissions // FDA submission tracking
 *    - mockDemoData.mockDemoScenarios // 3 pre-built scenarios
 *
 * 3. Use pre-built scenarios for quick demos:
 *    const startup = mockDemoData.mockDemoScenarios.startup;
 *    const advanced = mockDemoData.mockDemoScenarios.advanced;
 *
 * 4. Scenarios include:
 *    - Organizations for the scenario
 *    - Devices at various completion stages
 *    - Documents showing progress
 *    - Predicate devices that were selected
 *    - Equivalence analyses (if applicable)
 *    - Compliance checks (if applicable)
 *    - FDA submissions (if applicable)
 *
 * 5. For client presentations:
 *    - Use the "startup" scenario to show early-stage work
 *    - Use the "midstage" scenario to show progress
 *    - Use the "advanced" scenario to show a near-complete submission
 *
 * 6. The DemoDashboard component provides a complete implementation
 *    showing all features with switchable scenarios.
 */
