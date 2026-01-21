import React, { useState } from 'react';
import {
  Users,
  Building,
  FileText,
  BookOpen,
  BarChart,
  Database,
  Sparkles,
  Beaker,
  ClipboardList,
  Clock,
  Search,
  Layout,
  ArrowRight,
} from 'lucide-react';

/**
 * SimplePortal Component
 *
 * A minimalist but functional client portal with navigation and module switching
 */
const SimplePortal = () => {
  const [activeModule, setActiveModule] = useState('dashboard');

  // Handle module change
  const handleModuleChange = module => {
    setActiveModule(module);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="h-16 px-4 mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="font-bold text-xl flex items-center">
            <span className="text-primary">TrialSage</span>
            <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">Enterprise</span>
          </div>

          {/* Organization/Client Controls */}
          <div className="flex items-center space-x-3">
            <button className="flex items-center px-3 py-1 border rounded-md text-sm">
              <Building className="h-4 w-4 mr-2" />
              <span>Organization</span>
            </button>
            <button className="flex items-center px-3 py-1 border rounded-md text-sm">
              <Users className="h-4 w-4 mr-2" />
              <span>Client</span>
            </button>
          </div>
        </div>

        {/* Module Navigation */}
        <div className="bg-white border-b">
          <nav className="flex px-4 overflow-x-auto pb-1">
            {/* Dashboard */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => handleModuleChange('dashboard')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Layout className="h-4 w-4 mr-2" />
                Dashboard
              </div>
            </button>

            {/* Medical Device & Diagnostics Regulatory Module */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'cer2v'
                  ? 'border-green-500 text-green-600 bg-green-50'
                  : 'border-transparent text-green-600 hover:text-green-700 hover:border-green-300 hover:bg-green-50/50'
              }`}
              onClick={() => handleModuleChange('cer2v')}
            >
              <div className="flex items-center whitespace-nowrap">
                <FileText className="h-4 w-4 mr-2" />
                <span className="font-semibold">Medical Device & Diagnostics</span>
              </div>
            </button>

            {/* IND Wizard */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'ind-wizard'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-blue-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
              onClick={() => handleModuleChange('ind-wizard')}
            >
              <div className="flex items-center whitespace-nowrap">
                <FileText className="h-4 w-4 mr-2" />
                <span className="font-semibold">IND Wizard</span>
              </div>
            </button>

            {/* eCTD Author */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'ectd-author'
                  ? 'border-purple-500 text-purple-600 bg-purple-50'
                  : 'border-transparent text-purple-600 hover:text-purple-700 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
              onClick={() => handleModuleChange('ectd-author')}
            >
              <div className="flex items-center whitespace-nowrap">
                <BookOpen className="h-4 w-4 mr-2" />
                <span className="font-semibold">eCTD Author</span>
              </div>
            </button>

            {/* CMC Module */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'cmc-module'
                  ? 'border-amber-500 text-amber-600 bg-amber-50'
                  : 'border-transparent text-amber-600 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/50'
              }`}
              onClick={() => handleModuleChange('cmc-module')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Beaker className="h-4 w-4 mr-2" />
                <span className="font-semibold">CMC Module</span>
              </div>
            </button>

            {/* CSR Intelligence */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'csr-intelligence'
                  ? 'border-teal-500 text-teal-600 bg-teal-50'
                  : 'border-transparent text-teal-600 hover:text-teal-700 hover:border-teal-300 hover:bg-teal-50/50'
              }`}
              onClick={() => handleModuleChange('csr-intelligence')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Search className="h-4 w-4 mr-2" />
                <span className="font-semibold">CSR Intelligence</span>
              </div>
            </button>

            {/* Study Architect */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'study-architect'
                  ? 'border-orange-500 text-orange-600 bg-orange-50'
                  : 'border-transparent text-orange-600 hover:text-orange-700 hover:border-orange-300 hover:bg-orange-50/50'
              }`}
              onClick={() => handleModuleChange('study-architect')}
            >
              <div className="flex items-center whitespace-nowrap">
                <ClipboardList className="h-4 w-4 mr-2" />
                <span className="font-semibold">Study Architect</span>
              </div>
            </button>

            {/* Reports - Globally Connected */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'reports'
                  ? 'border-pink-500 text-pink-600 bg-pink-50'
                  : 'border-transparent text-pink-600 hover:text-pink-700 hover:border-pink-300 hover:bg-pink-50/50'
              }`}
              onClick={() => handleModuleChange('reports')}
            >
              <div className="flex items-center whitespace-nowrap">
                <BarChart className="h-4 w-4 mr-2" />
                <span className="font-semibold">Reports</span>
              </div>
            </button>

            {/* Vault */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'vault'
                  ? 'border-slate-500 text-slate-600 bg-slate-50'
                  : 'border-transparent text-slate-600 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
              onClick={() => handleModuleChange('vault')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Database className="h-4 w-4 mr-2" />
                <span className="font-semibold">Vault</span>
              </div>
            </button>

            {/* AI Assistant */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeModule === 'assistant'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-indigo-600 hover:text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
              onClick={() => handleModuleChange('assistant')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Sparkles className="h-4 w-4 mr-2" />
                <span className="font-semibold">Ask Lument AI</span>
              </div>
            </button>
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
                  <div className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">Phase II Clinical Trial - BTX-112</h3>
                        <p className="text-sm text-gray-500 mt-1">Due: June 15, 2025</p>
                      </div>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        In Progress
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progress</span>
                        <span>65%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: '65%' }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium">IND Application - BTX-112</h3>
                        <p className="text-sm text-gray-500 mt-1">Due: July 20, 2025</p>
                      </div>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        In Progress
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progress</span>
                        <span>42%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: '42%' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Reports Widget - Globally Connected */}
                <div className="bg-white p-6 rounded-xl border shadow-sm border-pink-200">
                  <div className="flex items-center mb-4">
                    <BarChart className="h-5 w-5 text-pink-600 mr-2" />
                    <h2 className="text-lg font-medium">Reports</h2>
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
                        <ArrowRight className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md">
                      <div>
                        <p className="text-sm font-medium">CMC Documentation Quality</p>
                        <p className="text-xs text-gray-500">Generated on May 5</p>
                      </div>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <ArrowRight className="h-4 w-4 text-gray-400" />
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
                    <Sparkles className="h-5 w-5 text-amber-600 mr-2" />
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

        {/* Medical Device & Diagnostics Regulatory Module */}
        {activeModule === 'cer2v' && (
          <div>
            <div className="flex items-center mb-6">
              <FileText className="h-6 w-6 text-green-600 mr-2" />
              <h1 className="text-2xl font-bold">Medical Device & Diagnostics Regulatory Module</h1>
              <div className="ml-4 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Enterprise Feature
              </div>
            </div>

            <div className="bg-green-50 p-8 rounded-xl border border-green-200 text-center">
              <h2 className="text-xl font-medium text-green-800 mb-2">
                Medical Device & Diagnostics Regulatory Module Content
              </h2>
              <p className="text-green-700 mb-4">
                Clinical Evaluation Report management and generation
              </p>
              <div className="w-4/5 mx-auto h-12 bg-green-100 rounded-lg"></div>
            </div>
          </div>
        )}

        {/* CMC Module */}
        {activeModule === 'cmc-module' && (
          <div>
            <div className="flex items-center mb-6">
              <Beaker className="h-6 w-6 text-amber-600 mr-2" />
              <h1 className="text-2xl font-bold">CMC Module</h1>
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
                  <Sparkles className="h-5 w-5 mr-2 text-amber-600" />
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
                      <Sparkles className="h-4 w-4" />
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
              <BarChart className="h-6 w-6 text-pink-600 mr-2" />
              <h1 className="text-2xl font-bold">Reports Module</h1>
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
                    <FileText className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-sm font-medium">
                    Medical Device & Diagnostics Regulatory Module Reports
                  </p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <p className="text-sm font-medium">IND Reports</p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Beaker className="h-5 w-5 text-amber-600" />
                  </div>
                  <p className="text-sm font-medium">CMC Reports</p>
                </div>

                <div className="p-4 bg-white rounded-lg border border-pink-200 text-center">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Database className="h-5 w-5 text-slate-600" />
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
          activeModule !== 'cer2v' &&
          activeModule !== 'cmc-module' &&
          activeModule !== 'reports' && (
            <div>
              <h1 className="text-2xl font-bold mb-6">
                {activeModule === 'ind-wizard' && 'IND Wizard'}
                {activeModule === 'ectd-author' && 'eCTD Author'}
                {activeModule === 'csr-intelligence' && 'CSR Intelligence'}
                {activeModule === 'study-architect' && 'Study Architect'}
                {activeModule === 'vault' && 'Vault'}
                {activeModule === 'assistant' && 'Ask Lument AI'}
              </h1>
              <div className="bg-white p-8 rounded-xl border shadow-sm text-center">
                <h2 className="text-xl font-medium mb-4">Module Content</h2>
                <p className="text-gray-500 mb-6">
                  This is the {activeModule} module content area.
                </p>
                <div className="w-4/5 mx-auto h-40 bg-gray-100 rounded-lg flex items-center justify-center">
                  <p className="text-gray-400">Module Interface</p>
                </div>
              </div>
            </div>
          )}
      </main>
    </div>
  );
};

export default SimplePortal;
