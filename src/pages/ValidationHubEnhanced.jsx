import React from 'react';
import { Link } from 'wouter';
import ValidatorRunner from '../components/validator/ValidatorRunner';

/**
 * ValidationHubEnhanced - Microsoft 365-inspired RegIntel Validator UI
 *
 * This page provides a modern, enterprise-grade UI for validating regulatory
 * documents against global compliance standards. The design follows the
 * Microsoft 365 aesthetic with features like:
 *
 * - Outlook-style sidebar for files and engines
 * - OneDrive-inspired drag/drop interface
 * - Fluent Design System UI elements
 * - AI-powered rule explanations and fix suggestions
 */
const ValidationHubEnhanced = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navigation bar */}
      <header className="bg-[#003057] text-white p-4 shadow">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/">
            <div className="flex items-center space-x-2">
              <span className="font-bold">TrialSage™</span>
              <span className="text-xs bg-[#0078d4] px-2 py-0.5 rounded">RegIntel Validator</span>
            </div>
          </Link>

          <div className="flex items-center space-x-4">
            <Link to="/versions">
              <button className="text-sm hover:underline">Document Vault</button>
            </Link>
            <Link to="/analytics-dashboard">
              <button className="text-sm hover:underline">Analytics</button>
            </Link>
            <Link to="/ind-wizard">
              <button className="text-sm hover:underline">IND Wizard</button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content area with validator */}
      <div className="flex-1">
        <ValidatorRunner />
      </div>
    </div>
  );
};

export default ValidationHubEnhanced;
