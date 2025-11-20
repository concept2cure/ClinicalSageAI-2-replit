import React, { useState } from 'react';
import {
  Book,
  FileCheck,
  FileText,
  FlaskConical,
  Users,
  BriefcaseMedical,
  Brain,
  Microscope,
  Clipboard,
  CopyCheck,
  UploadCloud,
  Pin,
  Filter,
  Plus,
  Folder,
  Layers,
  PlusCircle,
  Search,
} from 'lucide-react';
import { useIntegration } from '../integration/ModuleIntegrationLayer';

const StudyArchitectModule = () => {
  const { blockchainStatus, aiProcessing, addAuditEntry } = useIntegration();
  const [activeTab, setActiveTab] = useState('templates');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const handleTabChange = tab => {
    setActiveTab(tab);
    addAuditEntry('study_architect_tab_changed', { tab });
  };

  const handleCategorySelect = category => {
    setSelectedCategory(category);
  };

  // Protocol template categories
  const templateCategories = [
    'All',
    'Phase 1',
    'Phase 2',
    'Phase 3',
    'Rare Disease',
    'Oncology',
    'Pediatric',
    'Medical Device',
  ];

  // Protocol templates
  const protocolTemplates = [
    {
      id: 'tpl-1',
      name: 'Phase 1 Healthy Volunteer First-in-Human',
      category: 'Phase 1',
      sections: 14,
      lastUpdated: '2025-03-05',
      regulatory: ['FDA', 'EMA'],
      usageCount: 42,
      description: 'Standard template for Phase 1 first-in-human studies with healthy volunteers',
    },
    {
      id: 'tpl-2',
      name: 'Phase 2 Proof-of-Concept',
      category: 'Phase 2',
      sections: 18,
      lastUpdated: '2025-03-01',
      regulatory: ['FDA', 'EMA', 'PMDA'],
      usageCount: 28,
      description: 'Template for Phase 2 studies focusing on proof-of-concept objectives',
    },
    {
      id: 'tpl-3',
      name: 'Phase 3 Pivotal Trial',
      category: 'Phase 3',
      sections: 22,
      lastUpdated: '2025-02-20',
      regulatory: ['FDA', 'EMA', 'PMDA', 'NMPA'],
      usageCount: 35,
      description:
        'Comprehensive Phase 3 pivotal trial protocol template with all required regulatory elements',
    },
    {
      id: 'tpl-4',
      name: 'Rare Disease Adaptive Design',
      category: 'Rare Disease',
      sections: 20,
      lastUpdated: '2025-02-10',
      regulatory: ['FDA', 'EMA'],
      usageCount: 14,
      description:
        'Specialized protocol template for rare disease studies with adaptive trial design',
    },
    {
      id: 'tpl-5',
      name: 'Oncology Basket Trial',
      category: 'Oncology',
      sections: 24,
      lastUpdated: '2025-01-30',
      regulatory: ['FDA', 'EMA', 'PMDA'],
      usageCount: 22,
      description:
        'Template for oncology basket trials evaluating a targeted therapy across multiple tumor types',
    },
    {
      id: 'tpl-6',
      name: 'Pediatric PK/PD Study',
      category: 'Pediatric',
      sections: 19,
      lastUpdated: '2025-01-25',
      regulatory: ['FDA', 'EMA'],
      usageCount: 17,
      description: 'Pediatric-specific template for pharmacokinetic and pharmacodynamic studies',
    },
  ];

  // Recent active studies
  const activeStudies = [
    {
      id: 'study-1',
      name: 'XYZ-123 Phase 2 Multiple Ascending Dose',
      phase: 'Phase 2',
      status: 'Draft',
      lastModified: '2025-03-15T09:22:00Z',
      owner: 'John Smith',
      progress: 45,
    },
    {
      id: 'study-2',
      name: 'ABC-456 Phase 1 Healthy Volunteer Study',
      phase: 'Phase 1',
      status: 'Final',
      lastModified: '2025-03-10T14:38:00Z',
      owner: 'Sarah Johnson',
      progress: 100,
    },
    {
      id: 'study-3',
      name: 'LMN-789 Phase 3 Pivotal Efficacy Trial',
      phase: 'Phase 3',
      status: 'In Review',
      lastModified: '2025-03-03T11:15:00Z',
      owner: 'Michael Chen',
      progress: 85,
    },
  ];

  // Site documents for site tab
  const siteDocuments = [
    {
      id: 'doc-1',
      name: 'Informed Consent Form Template',
      type: 'Template',
      lastUpdated: '2025-03-08',
      status: 'Approved',
    },
    {
      id: 'doc-2',
      name: 'Site Feasibility Questionnaire',
      type: 'Form',
      lastUpdated: '2025-03-05',
      status: 'Approved',
    },
    {
      id: 'doc-3',
      name: 'Investigator Site File Index',
      type: 'Checklist',
      lastUpdated: '2025-02-28',
      status: 'Approved',
    },
    {
      id: 'doc-4',
      name: 'Protocol Deviation Form',
      type: 'Form',
      lastUpdated: '2025-02-20',
      status: 'Approved',
    },
    {
      id: 'doc-5',
      name: 'Site Initiation Visit Checklist',
      type: 'Checklist',
      lastUpdated: '2025-02-15',
      status: 'Approved',
    },
  ];

  // Filter templates by selected category
  const filteredTemplates =
    selectedCategory === 'All'
      ? protocolTemplates
      : protocolTemplates.filter(t => t.category === selectedCategory);

  const formatDate = dateString => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Helper function to format dates from ISO
  const formatDateTime = isoString => {
    const date = new Date(isoString);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return date.toLocaleDateString(undefined, options);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Study Architect™</h1>
        <p className="text-gray-600">
          Design clinical trials and create protocols with intelligent templates based on regulatory
          standards
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px overflow-x-auto">
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('templates')}
          >
            <Book size={16} className="mr-2" />
            Protocol Templates
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium whitespace-nowrap ${
              activeTab === 'active'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('active')}
          >
            <FileText size={16} className="mr-2" />
            Active Studies
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium whitespace-nowrap ${
              activeTab === 'site'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('site')}
          >
            <BriefcaseMedical size={16} className="mr-2" />
            Site Documents
          </button>
          <button
            className={`py-3 px-4 flex items-center text-sm font-medium whitespace-nowrap ${
              activeTab === 'ai'
                ? 'border-b-2 border-pink-600 text-pink-600'
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => handleTabChange('ai')}
          >
            <Brain size={16} className="mr-2" />
            AI Protocol Review
          </button>
        </nav>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left sidebar - categories */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                <div className="flex items-center mb-4">
                  <Filter size={18} className="text-gray-500 mr-2" />
                  <h3 className="font-medium">Template Categories</h3>
                </div>

                <div className="space-y-1">
                  {templateCategories.map(category => (
                    <button
                      key={category}
                      className={`block w-full text-left px-3 py-2 rounded-md text-sm ${
                        selectedCategory === category
                          ? 'bg-pink-50 text-pink-600 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      onClick={() => handleCategorySelect(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Regulatory Updates</h3>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    New
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="border-l-2 border-blue-500 pl-3 py-1">
                    <h4 className="text-sm font-medium">FDA Guidance Update</h4>
                    <p className="text-xs text-gray-500">
                      Updated requirements for Phase 1 studies
                    </p>
                    <a href="#" className="text-xs text-blue-600 hover:underline">
                      View details
                    </a>
                  </div>

                  <div className="border-l-2 border-blue-500 pl-3 py-1">
                    <h4 className="text-sm font-medium">EMA Protocol Changes</h4>
                    <p className="text-xs text-gray-500">New sections for data transparency</p>
                    <a href="#" className="text-xs text-blue-600 hover:underline">
                      View details
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex-1">
              <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                  <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search size={16} className="text-gray-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search templates..."
                      className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md text-sm"
                    />
                  </div>

                  <button className="hot-pink-btn flex items-center">
                    <Plus size={16} className="mr-2" />
                    Create Custom Template
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map(template => (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium">{template.name}</h3>
                          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                            {template.category}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-sm text-gray-600 mb-3">{template.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                          <div>
                            Sections: <span className="font-medium">{template.sections}</span>
                          </div>
                          <div>
                            Used: <span className="font-medium">{template.usageCount} times</span>
                          </div>
                          <div>
                            Updated: <span className="font-medium">{template.lastUpdated}</span>
                          </div>
                          <div>
                            Compliant:{' '}
                            <span className="font-medium">{template.regulatory.join(', ')}</span>
                          </div>
                        </div>

                        <div className="flex space-x-2">
                          <button className="text-xs bg-pink-600 text-white px-3 py-1.5 rounded-md flex-1 hover:bg-pink-700">
                            Use Template
                          </button>
                          <button className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50">
                            Preview
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Studies Tab */}
      {activeTab === 'active' && (
        <div>
          <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search studies..."
                  className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md text-sm"
                />
              </div>

              <button className="hot-pink-btn flex items-center">
                <Plus size={16} className="mr-2" />
                New Study
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Study Name</th>
                    <th className="px-4 py-3">Phase</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Modified</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeStudies.map(study => (
                    <tr key={study.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">{study.name}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{study.phase}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            study.status === 'Draft'
                              ? 'bg-yellow-100 text-yellow-800'
                              : study.status === 'Final'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {study.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDateTime(study.lastModified)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">{study.owner}</td>
                      <td className="px-4 py-4 w-32">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                            <div
                              className={`h-2.5 rounded-full ${
                                study.status === 'Final' ? 'bg-green-600' : 'bg-blue-600'
                              }`}
                              style={{ width: `${study.progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500">{study.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center space-x-2">
                          <button className="p-1 text-gray-500 hover:text-gray-700">
                            <FileText size={16} />
                          </button>
                          <button className="p-1 text-gray-500 hover:text-gray-700">
                            <Users size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Recent Activities</h3>
              <a href="#" className="text-sm text-pink-600 hover:underline">
                View All
              </a>
            </div>

            <div className="space-y-3">
              <div className="flex items-start">
                <div className="bg-blue-100 p-2 rounded-full mr-3">
                  <FileCheck size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">Sarah Johnson</span> finalized{' '}
                    <span className="font-medium">ABC-456 Phase 1 Protocol</span>
                  </p>
                  <p className="text-xs text-gray-500">Today at 2:38 PM</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="bg-yellow-100 p-2 rounded-full mr-3">
                  <Pen size={16} className="text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">John Smith</span> updated{' '}
                    <span className="font-medium">XYZ-123 Study Endpoints</span>
                  </p>
                  <p className="text-xs text-gray-500">Yesterday at 11:15 AM</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="bg-green-100 p-2 rounded-full mr-3">
                  <Brain size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">AI Assistant</span> completed review of{' '}
                    <span className="font-medium">LMN-789 Protocol</span>
                  </p>
                  <p className="text-xs text-gray-500">March 14, 2025 at 3:22 PM</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Documents Tab */}
      {activeTab === 'site' && (
        <div>
          <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search documents..."
                  className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md text-sm"
                />
              </div>

              <div className="flex space-x-2">
                <button className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md text-sm font-medium flex items-center">
                  <UploadCloud size={16} className="mr-2" />
                  Upload
                </button>
                <button className="hot-pink-btn flex items-center">
                  <Plus size={16} className="mr-2" />
                  New Document
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {siteDocuments.map(doc => (
                <div key={doc.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText size={18} className="text-gray-500 mr-2" />
                        <h3 className="font-medium truncate">{doc.name}</h3>
                      </div>
                      <button className="text-gray-400 hover:text-gray-500">
                        <Pin size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium">{doc.type}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-gray-500">Last Updated:</span>
                      <span>{doc.lastUpdated}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-4">
                      <span className="text-gray-500">Status:</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          doc.status === 'Approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>

                    <div className="flex space-x-2">
                      <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded flex-1">
                        View
                      </button>
                      <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded flex-1">
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add new document card */}
              <div className="border border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-center">
                <PlusCircle size={32} className="text-gray-400 mb-2" />
                <h3 className="font-medium text-gray-700 mb-1">Add New Document</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Upload or create a new site document template
                </p>
                <button className="text-xs bg-pink-600 text-white px-3 py-1.5 rounded">
                  Add Document
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center mb-4">
              <Folder size={18} className="text-gray-500 mr-2" />
              <h3 className="font-medium">Document Categories</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <CopyCheck size={16} className="text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Informed Consent</h4>
                    <p className="text-xs text-gray-500">5 templates</p>
                  </div>
                </div>
              </div>

              <div className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <Clipboard size={16} className="text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Site Checklists</h4>
                    <p className="text-xs text-gray-500">12 templates</p>
                  </div>
                </div>
              </div>

              <div className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                    <Layers size={16} className="text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-medium">Regulatory Forms</h4>
                    <p className="text-xs text-gray-500">8 templates</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Protocol Review Tab */}
      {activeTab === 'ai' && (
        <div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 mb-4">
            <div className="flex items-center mb-6">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mr-4">
                <Brain size={24} className="text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium">AI Protocol Review Assistant</h3>
                <p className="text-gray-600">
                  Upload a protocol for AI-powered review and recommendations
                </p>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-md p-6 flex flex-col items-center justify-center mb-6">
              <FileText size={48} className="text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 text-center mb-2">
                Drag and drop a protocol document here, or click to select a file
              </p>
              <button className="bg-gray-200 text-gray-800 px-3 py-1 rounded-md text-sm font-medium">
                Browse Files
              </button>
              <input type="file" className="hidden" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <FileCheck size={18} className="text-green-600 mr-2" />
                  <h4 className="font-medium">Compliance Check</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Verify protocol compliance with FDA, EMA, and ICH guidelines
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <Microscope size={18} className="text-blue-600 mr-2" />
                  <h4 className="font-medium">Scientific Review</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Evaluate scientific rationale, endpoints, and methodology
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <BriefcaseMedical size={18} className="text-red-600 mr-2" />
                  <h4 className="font-medium">Operational Assessment</h4>
                </div>
                <p className="text-sm text-gray-600">
                  Review feasibility, timeline, and site/patient considerations
                </p>
              </div>
            </div>

            <button
              className="hot-pink-btn w-full justify-center"
              disabled={aiProcessing.status === 'processing'}
            >
              {aiProcessing.status === 'processing' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Processing ({aiProcessing.progress}%)
                </>
              ) : (
                'Start AI Review'
              )}
            </button>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Previous Reviews</h3>
              <a href="#" className="text-sm text-pink-600 hover:underline">
                View All
              </a>
            </div>

            <div className="space-y-3">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-medium">XYZ-123 Phase 2 Protocol</h4>
                    <p className="text-xs text-gray-500">Reviewed on March 15, 2025</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle size={12} className="mr-1" />
                    93% Compliance Score
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    View Report
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Download Analysis
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div>
                    <h4 className="font-medium">ABC-456 Phase 1 Protocol</h4>
                    <p className="text-xs text-gray-500">Reviewed on March 10, 2025</p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle size={12} className="mr-1" />
                    97% Compliance Score
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    View Report
                  </button>
                  <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded">
                    Download Analysis
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudyArchitectModule;
