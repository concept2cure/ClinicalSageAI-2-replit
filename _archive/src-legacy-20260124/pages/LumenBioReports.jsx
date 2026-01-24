import React, { useState } from 'react';
import { Link } from 'wouter';
import AppPackagesBanner from '../components/AppPackagesBanner';
import {
  FileText,
  Search,
  Download,
  Filter,
  ChevronDown,
  Calendar,
  ChevronRight,
  BarChart2,
  PieChart,
  FileBarChart,
  FileSpreadsheet,
  BookOpen,
} from 'lucide-react';

// Mock data for reports - would come from API in production
const REPORTS = [
  {
    id: 'rep_001',
    title: 'LUM-1 Phase 2 Interim Analysis Report',
    drugName: 'LUM-1',
    date: '2025-04-01',
    phase: 'Phase 2',
    indication: 'Non-Small Cell Lung Cancer',
    status: 'Active',
    summary:
      'Interim analysis of LUM-1 Phase 2 trial showing promising efficacy signal in PD-L1 high expressing NSCLC patients with manageable safety profile.',
    fileType: 'Clinical Study Report',
    fileSize: '12MB',
    icon: <FileText size={24} className="text-blue-500" />,
  },
  {
    id: 'rep_002',
    title: 'Competitive Intelligence: Checkpoint Inhibitor Landscape',
    drugName: 'LUM-1',
    date: '2025-03-15',
    phase: 'Market Analysis',
    indication: 'Oncology',
    status: 'Completed',
    summary:
      'Comprehensive analysis of the checkpoint inhibitor competitive landscape with focus on NSCLC indications and combination approaches.',
    fileType: 'Market Report',
    fileSize: '8MB',
    icon: <PieChart size={24} className="text-purple-500" />,
  },
  {
    id: 'rep_003',
    title: 'LUM-2 Phase 1 Clinical Protocol',
    drugName: 'LUM-2',
    date: '2025-03-05',
    phase: 'Phase 1',
    indication: 'Advanced Solid Tumors',
    status: 'Active',
    summary:
      'Protocol for dose-escalation study of LUM-2 as monotherapy and in combination with pembrolizumab in patients with advanced solid tumors.',
    fileType: 'Protocol',
    fileSize: '5MB',
    icon: <BookOpen size={24} className="text-green-500" />,
  },
  {
    id: 'rep_004',
    title: 'LUM-3 Investigator Brochure v2.1',
    drugName: 'LUM-3',
    date: '2025-02-28',
    phase: 'Pre-clinical',
    indication: 'HPV+ Malignancies',
    status: 'Active',
    summary:
      'Updated investigator brochure incorporating new toxicology data and preliminary clinical findings from dose-escalation cohorts.',
    fileType: 'Investigator Brochure',
    fileSize: '18MB',
    icon: <FileText size={24} className="text-indigo-500" />,
  },
  {
    id: 'rep_005',
    title: 'Enrollment and Demographics Dashboard',
    drugName: 'Multiple',
    date: '2025-02-15',
    phase: 'All',
    indication: 'All',
    status: 'Active',
    summary:
      'Interactive dashboard showing real-time enrollment metrics and patient demographics across all active Lumen Bio clinical trials.',
    fileType: 'Analytics Dashboard',
    fileSize: '3MB',
    icon: <BarChart2 size={24} className="text-amber-500" />,
  },
  {
    id: 'rep_006',
    title: 'Safety Monitoring Committee Briefing Document',
    drugName: 'LUM-1/LUM-2',
    date: '2025-02-10',
    phase: 'Multiple',
    indication: 'Multiple',
    status: 'Active',
    summary:
      'Briefing document for upcoming Safety Monitoring Committee meeting, including all reportable adverse events and safety signals.',
    fileType: 'Safety Report',
    fileSize: '10MB',
    icon: <FileSpreadsheet size={24} className="text-red-500" />,
  },
  {
    id: 'rep_007',
    title: 'Biomarker Analysis: LUM-1 Dose Expansion Cohort',
    drugName: 'LUM-1',
    date: '2025-01-30',
    phase: 'Phase 2',
    indication: 'Non-Small Cell Lung Cancer',
    status: 'Active',
    summary:
      'Comprehensive analysis of biomarker data from LUM-1 dose expansion cohort, including PD-L1 expression, tumor mutation burden, and immune infiltration correlations.',
    fileType: 'Biomarker Report',
    fileSize: '15MB',
    icon: <FileBarChart size={24} className="text-teal-500" />,
  },
];

export default function LumenBioReports() {
  const [location] = useState('/lumen-bio/reports');
  const [selectedDrug, setSelectedDrug] = useState('all');
  const [selectedIndication, setSelectedIndication] = useState('all');
  const [selectedPhase, setSelectedPhase] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter reports based on selections
  const filteredReports = REPORTS.filter(report => {
    if (selectedDrug !== 'all' && report.drugName !== selectedDrug) return false;
    if (selectedIndication !== 'all' && report.indication !== selectedIndication) return false;
    if (selectedPhase !== 'all' && report.phase !== selectedPhase) return false;
    if (searchTerm && !report.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Get unique values for filters
  const drugNames = ['all', ...new Set(REPORTS.map(r => r.drugName))];
  const indications = ['all', ...new Set(REPORTS.map(r => r.indication))];
  const phases = ['all', ...new Set(REPORTS.map(r => r.phase))];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppPackagesBanner currentPath={location} />

      <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-2">
              Client Portal
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Lumen Biosciences Trial Reports</h1>
            <p className="text-gray-500 mt-1">
              Access to all clinical reports and analytics for your pipeline
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1 text-sm text-gray-700 px-3 py-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50">
              <Calendar size={16} />
              Last 90 days
            </button>
            <button className="flex items-center gap-1 text-sm text-white px-3 py-1.5 border border-blue-600 rounded-md bg-blue-600 hover:bg-blue-700">
              <Download size={16} />
              Export All
            </button>
          </div>
        </div>

        {/* Filters and search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative rounded-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  placeholder="Search reports by title or content"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              {/* Drug filter */}
              <select
                className="block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedDrug}
                onChange={e => setSelectedDrug(e.target.value)}
              >
                <option value="all">All Products</option>
                {drugNames
                  .filter(d => d !== 'all')
                  .map(drug => (
                    <option key={drug} value={drug}>
                      {drug}
                    </option>
                  ))}
              </select>

              {/* Indication filter */}
              <select
                className="block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedIndication}
                onChange={e => setSelectedIndication(e.target.value)}
              >
                <option value="all">All Indications</option>
                {indications
                  .filter(i => i !== 'all')
                  .map(indication => (
                    <option key={indication} value={indication}>
                      {indication}
                    </option>
                  ))}
              </select>

              {/* Phase filter */}
              <select
                className="block pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={selectedPhase}
                onChange={e => setSelectedPhase(e.target.value)}
              >
                <option value="all">All Phases</option>
                {phases
                  .filter(p => p !== 'all')
                  .map(phase => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
              </select>

              <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                <Filter size={16} className="mr-2" />
                More Filters
              </button>
            </div>
          </div>
        </div>

        {/* Reports grid */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          {filteredReports.length > 0 ? (
            filteredReports.map(report => (
              <div
                key={report.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200"
              >
                <div className="p-6">
                  <div className="flex">
                    <div className="flex-shrink-0 mr-4">{report.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-xl font-semibold text-gray-900 mb-1">
                            {report.title}
                          </h2>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {report.drugName}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {report.phase}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {report.indication}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {report.fileType}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center text-gray-500 text-sm">
                          <Calendar size={16} className="mr-1" />
                          {report.date}
                        </div>
                      </div>

                      <p className="text-gray-600 mb-4">{report.summary}</p>

                      <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-gray-500">{report.fileSize}</div>
                        <div className="flex gap-3">
                          <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                            Preview
                          </button>
                          <button className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                            <Download size={16} className="mr-2" />
                            Download
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No reports found</h3>
              <p className="text-gray-500 mb-4">Try adjusting your search criteria or filters</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedDrug('all');
                  setSelectedIndication('all');
                  setSelectedPhase('all');
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
