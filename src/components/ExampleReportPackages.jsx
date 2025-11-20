import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  FileText,
  ChevronRight,
  Download,
  ExternalLink,
  Clock,
  CheckCircle,
  Tag,
  Shield,
  Book,
  Beaker,
  FileArchive,
  Calendar,
  Users,
  BarChart2,
  Star,
} from 'lucide-react';

const SAMPLE_REPORTS = [
  {
    id: 'csr-oncology-2024',
    type: 'CSR',
    title: 'Oncology Phase 2 Clinical Study Report',
    description:
      'Comprehensive CSR for a Phase 2 trial of an investigational oncology treatment, including efficacy and safety endpoints.',
    date: 'March 15, 2024',
    status: 'final',
    region: 'Global',
    modules: ['Efficacy Analysis', 'Safety Analysis', 'PK/PD', 'Statistical Appendices'],
    fileSize: '4.2 MB',
    pageCount: 246,
    thumbnailUrl: 'https://raw.githubusercontent.com/Concepts2Cures/assets/main/csr-sample.png',
    downloadUrl: '/example-reports/oncology-phase2-csr.pdf',
  },
  {
    id: 'cer-device-2024',
    type: 'CER',
    title: 'Medical Device Clinical Evaluation Report',
    description:
      'MEDDEV 2.7/1 Rev. 4 compliant CER for Class III implantable device with post-market surveillance data.',
    date: 'April 5, 2024',
    status: 'final',
    region: 'EU',
    modules: ['Clinical Data', 'Risk Assessment', 'PMS Data', 'PMCF Analysis'],
    fileSize: '3.8 MB',
    pageCount: 187,
    thumbnailUrl: 'https://raw.githubusercontent.com/Concepts2Cures/assets/main/cer-sample.png',
    downloadUrl: '/example-reports/implantable-device-cer.pdf',
  },
  {
    id: 'ind-submission-2024',
    type: 'IND',
    title: 'Autoimmune IND Submission Package',
    description:
      'Complete IND submission ready for FDA filing, including preclinical data and Phase 1 protocol.',
    date: 'March 28, 2024',
    status: 'final',
    region: 'US',
    modules: ['Form 1571', "Investigator's Brochure", 'Protocol', 'CMC', 'Pharmacology/Toxicology'],
    fileSize: '8.6 MB',
    pageCount: 412,
    thumbnailUrl: 'https://raw.githubusercontent.com/Concepts2Cures/assets/main/ind-sample.png',
    downloadUrl: '/example-reports/autoimmune-ind-package.pdf',
  },
  {
    id: 'pmsr-device-2024',
    type: 'PMSR',
    title: 'Post-Market Surveillance Report',
    description:
      'EU MDR Article 85 compliant post-market surveillance report for a Class IIb diagnostic device.',
    date: 'April 10, 2024',
    status: 'final',
    region: 'EU',
    modules: ['Complaint Analysis', 'PSUR Data', 'CAPA Summary', 'Risk Assessment'],
    fileSize: '2.6 MB',
    pageCount: 98,
    thumbnailUrl: 'https://raw.githubusercontent.com/Concepts2Cures/assets/main/pmsr-sample.png',
    downloadUrl: '/example-reports/diagnostic-pmsr.pdf',
  },
  {
    id: 'cta-submission-2024',
    type: 'CTA',
    title: 'Clinical Trial Application',
    description:
      'EMA-compliant Clinical Trial Application for a Phase 1b/2a study in rare neurodegenerative disease.',
    date: 'April 1, 2024',
    status: 'final',
    region: 'EU',
    modules: ['Protocol', 'IB', 'IMPD', 'Supporting Documentation'],
    fileSize: '5.3 MB',
    pageCount: 238,
    thumbnailUrl: 'https://raw.githubusercontent.com/Concepts2Cures/assets/main/cta-sample.png',
    downloadUrl: '/example-reports/neurodegenerative-cta.pdf',
  },
];

export default function ExampleReportPackages() {
  const [filter, setFilter] = useState('all');

  const filteredReports =
    filter === 'all' ? SAMPLE_REPORTS : SAMPLE_REPORTS.filter(report => report.type === filter);

  const getTypeColor = type => {
    switch (type) {
      case 'CSR':
        return 'bg-blue-100 text-blue-800';
      case 'CER':
        return 'bg-emerald-100 text-emerald-800';
      case 'IND':
        return 'bg-indigo-100 text-indigo-800';
      case 'PMSR':
        return 'bg-amber-100 text-amber-800';
      case 'CTA':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = type => {
    switch (type) {
      case 'CSR':
        return <FileText className="h-5 w-5" />;
      case 'CER':
        return <Beaker className="h-5 w-5" />;
      case 'IND':
        return <FileArchive className="h-5 w-5" />;
      case 'PMSR':
        return <Shield className="h-5 w-5" />;
      case 'CTA':
        return <Book className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Example Report Packages</h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Browse our collection of real-world regulatory document examples that showcase the
            quality and comprehensiveness of documents generated on our platform.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Reports
            </button>
            <button
              onClick={() => setFilter('CSR')}
              className={`px-4 py-2 text-sm font-medium border-t border-b ${
                filter === 'CSR'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              CSR
            </button>
            <button
              onClick={() => setFilter('CER')}
              className={`px-4 py-2 text-sm font-medium border-t border-b ${
                filter === 'CER'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              CER
            </button>
            <button
              onClick={() => setFilter('IND')}
              className={`px-4 py-2 text-sm font-medium border-t border-b ${
                filter === 'IND'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              IND
            </button>
            <button
              onClick={() => setFilter('PMSR')}
              className={`px-4 py-2 text-sm font-medium border-t border-b ${
                filter === 'PMSR'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              PMSR
            </button>
            <button
              onClick={() => setFilter('CTA')}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg border ${
                filter === 'CTA'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              CTA
            </button>
          </div>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredReports.map(report => (
            <div
              key={report.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
                {report.thumbnailUrl ? (
                  <img
                    src={report.thumbnailUrl}
                    alt={`${report.title} thumbnail`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full bg-gray-100 text-gray-400">
                    <FileText size={64} />
                  </div>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center mb-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(report.type)}`}
                  >
                    {getTypeIcon(report.type)}
                    <span className="ml-1">{report.type}</span>
                  </span>
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                    <Tag size={12} className="mr-1" />
                    {report.region}
                  </span>
                  <span className="ml-auto text-xs text-gray-500 flex items-center">
                    <Calendar size={12} className="mr-1" />
                    {report.date}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2">{report.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{report.description}</p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {report.modules.slice(0, 3).map((module, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                    >
                      {module}
                    </span>
                  ))}
                  {report.modules.length > 3 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      +{report.modules.length - 3} more
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <div className="flex items-center">
                    <FileText size={14} className="mr-1" />
                    {report.pageCount} pages
                  </div>
                  <div className="flex items-center">
                    <Download size={14} className="mr-1" />
                    {report.fileSize}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <Link to={`/reports/view/${report.id}`}>
                    <button className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800">
                      View Full Report
                      <ChevronRight size={16} className="ml-1" />
                    </button>
                  </Link>
                  <a
                    href={report.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    <Download size={14} className="mr-1" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link to="/reports/library">
            <button className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow">
              Browse Full Report Library
              <ExternalLink size={16} className="ml-2" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
