import React, { useState } from 'react';
import { Link } from 'wouter';

/**
 * StandaloneClientPortal Component
 *
 * A self-contained client portal with zero external dependencies
 * and guaranteed stability
 */
const StandaloneClientPortal = () => {
  // Local state management
  const [activeModule, setActiveModule] = useState('dashboard');
  const [selectedOrg, setSelectedOrg] = useState('Acme CRO');
  const [selectedClient, setSelectedClient] = useState('NeuroPharma Inc.');

  // Static data to ensure stability
  const organizations = [
    'Acme CRO',
    'BioTech Partners',
    'MedRex Research',
    'Pharmaceutical Solutions',
  ];

  const clients = [
    'NeuroPharma Inc.',
    'CardioMed Therapeutics',
    'ImmuneTech',
    'Oncology Research Labs',
  ];

  const modules = [
    { id: 'dashboard', name: 'Dashboard', color: 'gray' },
    { id: 'cer', name: 'CER2V™', color: 'green' },
    { id: 'ind', name: 'IND Wizard™', color: 'blue' },
    { id: 'ectd', name: 'eCTD Author™', color: 'purple' },
    { id: 'cmc', name: 'CMC Module™', color: 'amber' },
    { id: 'csr', name: 'CSR Intelligence™', color: 'teal' },
    { id: 'study', name: 'Study Architect™', color: 'orange' },
    { id: 'reports', name: 'Reports', color: 'pink' },
    { id: 'vault', name: 'Vault™', color: 'slate' },
    { id: 'ai', name: 'Ask Lument AI', color: 'indigo' },
  ];

  const projects = [
    {
      name: 'NeuroVance Phase II',
      status: 'active',
      progress: 68,
      dueDate: '2025-07-15',
    },
    {
      name: 'CardioZen Phase III',
      status: 'active',
      progress: 42,
      dueDate: '2025-09-18',
    },
    {
      name: 'ImmuneBoost mAb Study',
      status: 'active',
      progress: 56,
      dueDate: '2025-07-28',
    },
  ];

  // Module change handler
  const handleModuleChange = moduleId => {
    setActiveModule(moduleId);
  };

  // Get text color for module
  const getModuleTextColor = moduleId => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return 'text-gray-700';

    switch (module.color) {
      case 'green':
        return 'text-green-700';
      case 'blue':
        return 'text-blue-700';
      case 'purple':
        return 'text-purple-700';
      case 'amber':
        return 'text-amber-700';
      case 'teal':
        return 'text-teal-700';
      case 'orange':
        return 'text-orange-700';
      case 'pink':
        return 'text-pink-700';
      case 'slate':
        return 'text-slate-700';
      case 'indigo':
        return 'text-indigo-700';
      default:
        return 'text-gray-700';
    }
  };

  // Get background color for module
  const getModuleBgColor = moduleId => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return 'bg-gray-50';

    switch (module.color) {
      case 'green':
        return 'bg-green-50';
      case 'blue':
        return 'bg-blue-50';
      case 'purple':
        return 'bg-purple-50';
      case 'amber':
        return 'bg-amber-50';
      case 'teal':
        return 'bg-teal-50';
      case 'orange':
        return 'bg-orange-50';
      case 'pink':
        return 'bg-pink-50';
      case 'slate':
        return 'bg-slate-50';
      case 'indigo':
        return 'bg-indigo-50';
      default:
        return 'bg-gray-50';
    }
  };

  // Get border color for module
  const getModuleBorderColor = moduleId => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return 'border-gray-200';

    switch (module.color) {
      case 'green':
        return 'border-green-200';
      case 'blue':
        return 'border-blue-200';
      case 'purple':
        return 'border-purple-200';
      case 'amber':
        return 'border-amber-200';
      case 'teal':
        return 'border-teal-200';
      case 'orange':
        return 'border-orange-200';
      case 'pink':
        return 'border-pink-200';
      case 'slate':
        return 'border-slate-200';
      case 'indigo':
        return 'border-indigo-200';
      default:
        return 'border-gray-200';
    }
  };

  // Get status badge class
  const getStatusBadgeClass = status => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'planning':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-amber-100 text-amber-800';
      case 'completed':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="h-16 px-4 mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="font-bold text-xl flex items-center">
            <span className="text-blue-600">TrialSage</span>
            <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">Enterprise</span>
          </div>

          {/* Organization/Client Controls */}
          <div className="flex items-center space-x-3">
            {/* Organization Dropdown */}
            <div className="relative">
              <select
                className="appearance-none bg-white border rounded-md px-3 py-1 pr-8 text-sm"
                value={selectedOrg}
                onChange={e => setSelectedOrg(e.target.value)}
              >
                {organizations.map(org => (
                  <option key={org} value={org}>
                    {org}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            {/* Client Dropdown */}
            <div className="relative">
              <select
                className="appearance-none bg-white border rounded-md px-3 py-1 pr-8 text-sm"
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
              >
                {clients.map(client => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Module Navigation */}
        <div className="bg-white border-b">
          <nav className="flex px-4 overflow-x-auto pb-1">
            {modules.map(module => (
              <button
                key={module.id}
                className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                  activeModule === module.id
                    ? `border-${module.color}-500 ${getModuleTextColor(module.id)} ${getModuleBgColor(module.id)}`
                    : `border-transparent ${getModuleTextColor(module.id)} hover:text-${module.color}-700 hover:border-${module.color}-300 hover:${getModuleBgColor(module.id)}/50`
                }`}
                onClick={() => handleModuleChange(module.id)}
              >
                <div className="flex items-center whitespace-nowrap">
                  <span className="font-medium">{module.name}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Dashboard View */}
        {activeModule === 'dashboard' && (
          <div>
            <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-white p-6 rounded-xl border shadow-sm">
                <h2 className="text-lg font-medium mb-4">Active Projects</h2>
                <div className="space-y-4">
                  {projects.map((project, index) => (
                    <div key={index} className="p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{project.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">Due: {project.dueDate}</p>
                        </div>
                        <span
                          className={`px-2 py-1 ${getStatusBadgeClass(project.status)} text-xs rounded-full`}
                        >
                          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Progress</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${project.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                {/* Reports Widget - Globally Connected */}
                <div className="bg-white p-6 rounded-xl border shadow-sm border-pink-200">
                  <div className="flex items-center mb-4">
                    <h2 className="text-lg font-medium text-pink-700">Reports</h2>
                    <span className="ml-2 px-2 py-0.5 bg-pink-100 text-pink-800 text-xs rounded-full">
                      Global
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                      <div>
                        <p className="text-sm font-medium">BTX-112 IND Readiness</p>
                        <p className="text-xs text-gray-500">Generated on May 8</p>
                      </div>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <svg
                          className="h-4 w-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                      <div>
                        <p className="text-sm font-medium">CMC Documentation Quality</p>
                        <p className="text-xs text-gray-500">Generated on May 5</p>
                      </div>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <svg
                          className="h-4 w-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button className="w-full mt-4 py-2 text-sm text-center text-pink-700 hover:bg-pink-50 border border-pink-200 rounded-md">
                    View All Reports
                  </button>
                </div>

                {/* CMC CoPilot Preview */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-xl border border-amber-200 shadow-sm">
                  <div className="flex items-center mb-4">
                    <h2 className="text-lg font-medium text-amber-800">CMC CoPilot™</h2>
                  </div>
                  <p className="text-sm text-amber-700 mb-3">
                    Your 24/7 intelligent regulatory partner
                  </p>
                  <button className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-sm">
                    Launch CMC CoPilot
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CER2V Module */}
        {activeModule === 'cer' && (
          <div>
            <div className="flex items-center mb-6">
              <h1 className="text-2xl font-bold text-green-700">CER2V Module</h1>
              <div className="ml-4 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Enterprise Feature
              </div>
            </div>

            <div className="bg-green-50 p-8 rounded-xl border border-green-200 text-center">
              <h2 className="text-xl font-medium text-green-800 mb-2">CER2V Module Content</h2>
              <p className="text-green-700 mb-4">
                Clinical Evaluation Report management and generation
              </p>
              <div className="w-4/5 mx-auto h-12 bg-green-100 rounded-lg"></div>
            </div>
          </div>
        )}

        {/* CMC Module */}
        {activeModule === 'cmc' && (
          <div>
            <div className="flex items-center mb-6">
              <h1 className="text-2xl font-bold text-amber-700">CMC Module</h1>
              <div className="ml-4 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                Enterprise Feature
              </div>
            </div>

            <div className="bg-amber-50 p-8 rounded-xl border border-amber-200">
              <h2 className="text-xl font-medium text-amber-800 mb-6">CMC Module Features</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg border border-amber-200">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">
                    Automated CMC Drafting
                  </h3>
                  <p className="text-sm">
                    Generate full ICH Module 3 sections from molecular structure, synthesis pathway,
                    formulation ingredients, and process parameters.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-lg border border-amber-200">
                  <h3 className="text-lg font-medium text-amber-800 mb-2">
                    AI Change Impact Simulator
                  </h3>
                  <p className="text-sm">
                    Before you change anything, know what could go wrong and how to fix it. Maps
                    changes against prior global regulatory submissions.
                  </p>
                </div>
              </div>

              {/* CMC CoPilot */}
              <div className="mt-8 bg-gradient-to-br from-amber-100 to-orange-100 p-4 rounded-lg border border-amber-300">
                <div className="flex items-center mb-2">
                  <h3 className="text-lg font-medium text-amber-800">CMC CoPilot™</h3>
                </div>
                <p className="text-sm text-amber-700 mb-3">
                  Your voice-enabled regulatory guidance assistant
                </p>
                <div className="bg-white rounded-md p-3 border border-amber-200">
                  <div className="flex">
                    <input
                      type="text"
                      placeholder="Ask CMC CoPilot..."
                      className="flex-1 p-2 text-sm border border-amber-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button className="ml-2 px-3 py-2 bg-amber-500 text-white rounded-md">
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reports Module - GLOBALLY CONNECTED */}
        {activeModule === 'reports' && (
          <div>
            <div className="flex items-center mb-6">
              <h1 className="text-2xl font-bold text-pink-700">Reports Module</h1>
              <div className="ml-4 px-2 py-1 bg-pink-100 text-pink-800 text-xs font-medium rounded-full">
                Global Module
              </div>
            </div>

            <div className="bg-pink-50 p-8 rounded-xl border border-pink-200">
              <h2 className="text-xl font-medium text-pink-800 mb-4">
                Generate Reports Across All Modules
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="h-5 w-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">CER2V Reports</p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="h-5 w-5 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">IND Reports</p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="h-5 w-5 text-amber-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">CMC Reports</p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <svg
                      className="h-5 w-5 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">Vault Reports</p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-pink-200 mb-6">
                <h3 className="text-lg font-medium text-pink-800 mb-3">Quick Report Generator</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select className="p-2 border border-pink-200 rounded-md flex-1">
                    <option>Select report category</option>
                    <option>Regulatory Reports</option>
                    <option>Quality Reports</option>
                    <option>Clinical Reports</option>
                    <option>CMC Reports</option>
                  </select>

                  <select className="p-2 border border-pink-200 rounded-md flex-1">
                    <option>Select specific report</option>
                    <option>Submission Status Report</option>
                    <option>Regulatory Timeline Analysis</option>
                    <option>Compliance Status Report</option>
                  </select>

                  <button className="py-2 px-4 bg-pink-600 text-white rounded-md">
                    Generate Report
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-pink-800 mb-3">Recent Reports</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border border-pink-200">
                    <div>
                      <h4 className="font-medium">BTX-112 IND Readiness</h4>
                      <p className="text-sm text-gray-500">Generated on May 8, 2025</p>
                    </div>
                    <button className="px-3 py-1 text-pink-700 hover:bg-pink-50 border border-pink-200 rounded-md text-sm">
                      View
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border border-pink-200">
                    <div>
                      <h4 className="font-medium">CMC Documentation Quality</h4>
                      <p className="text-sm text-gray-500">Generated on May 5, 2025</p>
                    </div>
                    <button className="px-3 py-1 text-pink-700 hover:bg-pink-50 border border-pink-200 rounded-md text-sm">
                      View
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border border-pink-200">
                    <div>
                      <h4 className="font-medium">Clinical Trial Enrollment Trends</h4>
                      <p className="text-sm text-gray-500">Generated on May 1, 2025</p>
                    </div>
                    <button className="px-3 py-1 text-pink-700 hover:bg-pink-50 border border-pink-200 rounded-md text-sm">
                      View
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder for other modules */}
        {activeModule !== 'dashboard' &&
          activeModule !== 'cer' &&
          activeModule !== 'cmc' &&
          activeModule !== 'reports' && (
            <div>
              <h1 className={`text-2xl font-bold mb-6 ${getModuleTextColor(activeModule)}`}>
                {modules.find(m => m.id === activeModule)?.name || 'Module'}
              </h1>
              <div
                className={`${getModuleBgColor(activeModule)} p-8 rounded-xl border ${getModuleBorderColor(activeModule)} text-center`}
              >
                <h2 className={`text-xl font-medium ${getModuleTextColor(activeModule)} mb-4`}>
                  Module Content
                </h2>
                <p className={`${getModuleTextColor(activeModule)} mb-6`}>
                  This is the {modules.find(m => m.id === activeModule)?.name || 'module'} content
                  area.
                </p>
                <div className="w-4/5 mx-auto h-40 bg-white rounded-lg border flex items-center justify-center">
                  <p className="text-gray-400">Module Interface</p>
                </div>
              </div>
            </div>
          )}
      </main>
    </div>
  );
};

export default StandaloneClientPortal;
