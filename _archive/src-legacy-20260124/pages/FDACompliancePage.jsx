import React, { useState } from 'react';
import FDAComplianceDashboard from '../components/compliance/FDAComplianceDashboard';
import FDAComplianceDocumentation from '../components/compliance/FDAComplianceDocumentation';
import BlockchainSecurityPanel from '../components/security/BlockchainSecurityPanel';
import AuditLogViewer from '../components/security/AuditLogViewer';

const FDACompliancePage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabOptions = [
    { id: 'dashboard', label: 'Compliance Dashboard' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'blockchain', label: 'Blockchain Security' },
    { id: 'audit', label: 'Audit Logs' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">FDA 21 CFR Part 11 Compliance</h1>
        <p className="text-lg text-gray-600">
          Comprehensive compliance solutions with enhanced blockchain security for FDA 21 CFR Part
          11 certification
        </p>
      </header>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex flex-wrap -mb-px">
          {tabOptions.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`mr-2 inline-flex items-center py-4 px-6 border-b-2 text-sm font-medium ${
                activeTab === tab.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'dashboard' && <FDAComplianceDashboard />}
      {activeTab === 'documentation' && <FDAComplianceDocumentation />}
      {activeTab === 'blockchain' && <BlockchainSecurityPanel />}
      {activeTab === 'audit' && <AuditLogViewer />}

      <div className="bg-pink-50 mt-8 p-6 rounded-lg border border-pink-100">
        <h2 className="text-xl font-semibold text-pink-800 mb-3">
          TrialSage™ Enhanced Compliance Framework
        </h2>
        <p className="text-pink-700 mb-4">
          Our FDA 21 CFR Part 11 compliance framework goes beyond regulatory requirements by
          implementing blockchain-secured audit trails and tamper-evident electronic records and
          signatures. This enhanced approach provides:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Enhanced Security</h3>
            <p className="text-sm text-gray-600">
              Immutable blockchain records provide tamper-evident security for all electronic
              records.
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Verifiable Integrity</h3>
            <p className="text-sm text-gray-600">
              Cryptographic verification ensures record integrity throughout the document lifecycle.
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Complete Audit Trails</h3>
            <p className="text-sm text-gray-600">
              Comprehensive, automated audit trails for all system operations.
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-medium mb-2">Validation Ready</h3>
            <p className="text-sm text-gray-600">
              Built-in validation tools ensure continuous compliance with all requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FDACompliancePage;
