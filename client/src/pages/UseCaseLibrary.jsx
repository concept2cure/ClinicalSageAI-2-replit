import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  Library, Search, Filter, Tag, FileText, Download, ArrowRight, CheckCircle, Clock } from 'lucide-react'

// Case Study Card Component
const CaseStudyCard = ({ title, category, agency, date, status, description, link }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="border-b border-gray-100 p-4 flex items-center justify-between">
        <div className="flex items-center">
          <div
            className={`w-8 h-8 rounded-md mr-3 flex items-center justify-center ${
              status === 'approved' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {status === 'approved' ? <CheckCircle size={16} /> : <Clock size={16} />}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{title}</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              {agency} • {new Date(date).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">{category}</div>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-600 mb-3">{description}</p>
        <Link to={link}>
          <button className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center">
            View Case Study <ArrowRight size={14} className="ml-1" />
          </button>
        </Link>
      </div>
    </div>
  );
};

// Template Card Component
const TemplateCard = ({ title, category, format, downloads, description, link }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="border-b border-gray-100 p-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-md mr-3 flex items-center justify-center bg-blue-100 text-blue-600">
            <FileText size={16} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{title}</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              {format} • {downloads} Downloads
            </div>
          </div>
        </div>
        <div className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">{category}</div>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-600 mb-3">{description}</p>
        <Link to={link}>
          <button className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded inline-flex items-center">
            <Download size={14} className="mr-1.5" /> Download Template
          </button>
        </Link>
      </div>
    </div>
  );
};

export default function UseCaseLibrary() {
  const [activeTab, setActiveTab] = useState('case-studies');
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data for demonstration
  const caseStudies = [
    {
      id: 1,
      title: 'Oncology Drug Fast Track Approval',
      category: 'IND',
      agency: 'FDA',
      date: '2024-02-15',
      status: 'approved',
      description:
        'A case study on expedited review and approval pathway for a novel targeted therapy in refractory myeloid leukemia.',
      link: '/use-case-library/case-studies/1',
    },
    {
      id: 2,
      title: 'Orphan Drug Designation Process',
      category: 'Orphan Drug',
      agency: 'EMA',
      date: '2023-11-10',
      status: 'approved',
      description:
        'Documentation and pathway for successful orphan drug designation for a rare neurological condition treatment.',
      link: '/use-case-library/case-studies/2',
    },
    {
      id: 3,
      title: 'Multi-Regional Clinical Trial Design',
      category: 'Clinical Trial',
      agency: 'FDA/PMDA',
      date: '2024-01-22',
      status: 'in-progress',
      description:
        'Framework for designing and implementing a harmonized clinical trial across US and Japanese regulatory environments.',
      link: '/use-case-library/case-studies/3',
    },
    {
      id: 4,
      title: 'Combination Product Classification',
      category: 'Combo Product',
      agency: 'FDA',
      date: '2023-09-18',
      status: 'approved',
      description:
        'Regulatory strategy for a drug-device combination product with automated drug delivery system.',
      link: '/use-case-library/case-studies/4',
    },
    {
      id: 5,
      title: 'Biosimilar Comparative Analytical Assessment',
      category: 'Biosimilar',
      agency: 'Health Canada',
      date: '2024-03-05',
      status: 'in-progress',
      description:
        'Analytical similarity demonstration approach for a monoclonal antibody biosimilar product with Health Canada.',
      link: '/use-case-library/case-studies/5',
    },
    {
      id: 6,
      title: 'Advanced Therapy Medicinal Product',
      category: 'ATMP',
      agency: 'EMA',
      date: '2023-10-30',
      status: 'approved',
      description:
        'Regulatory framework navigation for an autologous cell therapy with European regulatory authorities.',
      link: '/use-case-library/case-studies/6',
    },
  ];

  const templates = [
    {
      id: 1,
      title: 'FDA IND Application Template',
      category: 'IND',
      format: 'DOCX',
      downloads: 872,
      description:
        'Comprehensive Investigational New Drug Application template with proper formatting and structure for FDA submission.',
      link: '/use-case-library/templates/1',
    },
    {
      id: 2,
      title: 'Clinical Study Protocol Template',
      category: 'Clinical Trial',
      format: 'DOCX',
      downloads: 1245,
      description:
        'Standardized protocol template with integrated ICH E6(R2) GCP compliance elements and modular design.',
      link: '/use-case-library/templates/2',
    },
    {
      id: 3,
      title: 'Quality Overall Summary (Module 2.3)',
      category: 'CTD',
      format: 'DOCX',
      downloads: 764,
      description:
        'Template for CTD Module 2.3 with embedded guidance and formatting for global regulatory submissions.',
      link: '/use-case-library/templates/3',
    },
    {
      id: 4,
      title: 'PMDA J-NDA Template',
      category: 'NDA',
      format: 'DOCX',
      downloads: 432,
      description:
        'Japanese New Drug Application template with PMDA-specific sections and formatting requirements.',
      link: '/use-case-library/templates/4',
    },
    {
      id: 5,
      title: "Investigator's Brochure Template",
      category: 'Clinical Trial',
      format: 'DOCX',
      downloads: 985,
      description:
        "Comprehensive template for creating compliant Investigator's Brochures with proper safety data presentation.",
      link: '/use-case-library/templates/5',
    },
    {
      id: 6,
      title: 'Clinical Study Report (CSR) Template',
      category: 'CSR',
      format: 'DOCX',
      downloads: 1108,
      description:
        'ICH E3-compliant Clinical Study Report template with embedded guidance and statistical result presentation.',
      link: '/use-case-library/templates/6',
    },
  ];

  // Filter based on search query
  const filteredCaseStudies = caseStudies.filter(
    study =>
      study.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      study.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      study.agency.toLowerCase().includes(searchQuery.toLowerCase()) ||
      study.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = templates.filter(
    template =>
      template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="bg-gradient-to-r from-teal-800 to-teal-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-teal-700 text-white mr-4">
              <Library size={24} />
            </div>
            <h1 className="text-3xl font-bold text-white">Regulatory Use Case Library</h1>
          </div>
          <p className="text-teal-100 max-w-3xl">
            Access a comprehensive collection of regulatory case studies and templates to accelerate
            your submissions and learn from real-world examples across major regulatory agencies.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filter Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-8 flex flex-col md:flex-row justify-between items-center">
          <div className="relative w-full md:w-auto mb-4 md:mb-0">
            <input
              type="text"
              placeholder="Search case studies and templates..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>

          <div className="flex items-center space-x-2">
            <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50">
              <Filter size={16} className="mr-2" />
              Filter
            </button>
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white">
              <option value="">All Categories</option>
              <option value="IND">IND</option>
              <option value="NDA">NDA</option>
              <option value="Clinical Trial">Clinical Trial</option>
              <option value="Orphan Drug">Orphan Drug</option>
              <option value="CTD">CTD</option>
              <option value="Biosimilar">Biosimilar</option>
            </select>
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-white">
              <option value="">All Agencies</option>
              <option value="FDA">FDA</option>
              <option value="EMA">EMA</option>
              <option value="PMDA">PMDA</option>
              <option value="Health Canada">Health Canada</option>
            </select>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex">
            <button
              onClick={() => setActiveTab('case-studies')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'case-studies'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } mr-8`}
            >
              <Tag size={16} className="mr-2" />
              Case Studies
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'templates'
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText size={16} className="mr-2" />
              Templates
            </button>
          </nav>
        </div>

        {/* Content Section */}
        <div className="mb-12">
          {activeTab === 'case-studies' ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">Regulatory Case Studies</h2>
                <div className="text-sm text-gray-500">
                  Showing {filteredCaseStudies.length} case studies
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCaseStudies.map(study => (
                  <CaseStudyCard key={study.id} {...study} />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">Regulatory Templates</h2>
                <div className="text-sm text-gray-500">
                  Showing {filteredTemplates.length} templates
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => (
                  <TemplateCard key={template.id} {...template} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Premium Access Banner */}
        <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg p-6 border border-teal-100">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                Access Premium Regulatory Resources
              </h3>
              <p className="text-gray-600">
                Unlock 250+ additional case studies and templates with our premium subscription
              </p>
            </div>
            <Link to="/pricing">
              <button className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md flex items-center">
                Upgrade Your Access
                <ArrowRight size={16} className="ml-1" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
