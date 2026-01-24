/**
 * DocDrawer Component - Simplified Version
 *
 * Document drawer for IND Wizard 2.0 with tabs for Browse, Search, QC Errors, and Recent
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  FolderOpen,
  Search,
  AlertCircle,
  Clock,
  File,
  FileCheck,
  FileWarning,
  ChevronRight,
} from 'lucide-react';

export default function DocDrawer({ onClose }) {
  const [documents, setDocuments] = useState([]);
  const [qcErrors, setQcErrors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    // Fetch documents
    fetch('/api/docs')
      .then(r => r.json())
      .then(data => {
        setDocuments(data);
        // Get recent docs from the last 48 hours
        const recent = data
          .filter(d => {
            const docDate = new Date(d.updatedAt || d.createdAt);
            const twoDaysAgo = new Date();
            twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
            return docDate > twoDaysAgo;
          })
          .sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt);
            const dateB = new Date(b.updatedAt || b.createdAt);
            return dateB - dateA;
          })
          .slice(0, 10);
        setRecentDocs(recent);
      })
      .catch(err => {
        console.error('Error fetching documents:', err);
        // Fallback data for demonstration
        const fallbackDocs = [
          {
            id: 1,
            name: 'Toxicology Study 28-Day Rat.pdf',
            status: 'validated',
            module: 'Nonclinical',
          },
          { id: 2, name: 'Phase 1 Protocol.pdf', status: 'has_errors', module: 'Clinical' },
          { id: 3, name: 'CMC Stability Data.pdf', status: 'validated', module: 'Quality' },
          {
            id: 4,
            name: "Investigator's Brochure v2.pdf",
            status: 'validated',
            module: 'Clinical',
          },
          { id: 5, name: 'FDA Form 1571.pdf', status: 'has_errors', module: 'Administrative' },
        ];
        setDocuments(fallbackDocs);
        setRecentDocs(fallbackDocs.slice(0, 3));
      });

    // Fetch QC errors
    fetch('/api/qc/list')
      .then(r => r.json())
      .then(setQcErrors)
      .catch(err => {
        console.error('Error fetching QC errors:', err);
        // Fallback data for demonstration
        setQcErrors([
          {
            id: 1,
            documentId: 2,
            page: 12,
            severity: 'major',
            message: 'Missing primary endpoint definition',
          },
          {
            id: 2,
            documentId: 2,
            page: 15,
            severity: 'minor',
            message: 'Inconsistent inclusion criteria numbering',
          },
          {
            id: 3,
            documentId: 5,
            page: 2,
            severity: 'major',
            message: 'Missing investigator credentials',
          },
        ]);
      });
  }, []);

  // Handle search
  useEffect(() => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const term = searchTerm.toLowerCase();
    const results = documents.filter(
      doc => doc.name.toLowerCase().includes(term) || doc.module?.toLowerCase().includes(term)
    );

    setSearchResults(results);
  }, [searchTerm, documents]);

  // Tabs configuration
  const tabs = [
    { key: 'browse', label: 'Browse', icon: FolderOpen },
    { key: 'search', label: 'Search', icon: Search },
    { key: 'qc', label: 'QC Errors', icon: AlertCircle },
    { key: 'recent', label: 'Recent', icon: Clock },
  ];

  // Simplified tabs component without @headlessui/react dependency
  const renderContent = () => {
    switch (activeTab) {
      case 0: // Browse
        return (
          <div className="p-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              All Documents ({documents.length})
            </h3>
            {documents.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 my-8">
                No documents uploaded yet
              </p>
            ) : (
              <ul className="space-y-2">
                {documents.map(doc => (
                  <li
                    key={doc.id}
                    className="flex items-start p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    {doc.status === 'validated' ? (
                      <FileCheck size={20} className="mr-2 mt-1 text-emerald-500" />
                    ) : doc.status === 'has_errors' ? (
                      <FileWarning size={20} className="mr-2 mt-1 text-amber-500" />
                    ) : (
                      <File size={20} className="mr-2 mt-1 text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{doc.module}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );

      case 1: // Search
        return (
          <div className="p-4">
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search documents..."
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:border-slate-600"
              />
            </div>

            {searchTerm.length < 2 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 my-8">
                Type at least 2 characters to search
              </p>
            ) : searchResults.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 my-8">
                No results found for "{searchTerm}"
              </p>
            ) : (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  Results ({searchResults.length})
                </h3>
                <ul className="space-y-2">
                  {searchResults.map(doc => (
                    <li
                      key={doc.id}
                      className="flex items-start p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <File size={20} className="mr-2 mt-1 text-indigo-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{doc.module}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 2: // QC Errors
        return (
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              Quality Control Issues ({qcErrors.length})
            </h3>

            {qcErrors.length === 0 ? (
              <div className="text-center py-8">
                <FileCheck size={32} className="mx-auto mb-2 text-emerald-500" />
                <p className="text-gray-500 dark:text-gray-400">No QC issues found</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {qcErrors.map(error => {
                  const doc = documents.find(d => d.id === error.documentId);
                  return (
                    <li
                      key={error.id}
                      className="border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:border-gray-700"
                    >
                      <div className="flex items-center mb-1">
                        {error.severity === 'major' ? (
                          <span className="h-2 w-2 rounded-full bg-red-500 mr-2"></span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-amber-500 mr-2"></span>
                        )}
                        <p className="text-sm font-medium truncate flex-1">
                          {doc?.name || `Document #${error.documentId}`}
                        </p>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                          Page {error.page}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 ml-4">
                        {error.message}
                      </p>
                      <button className="ml-4 mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                        Jump to location
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );

      case 3: // Recent Documents
        return (
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              Recently Updated
            </h3>

            {recentDocs.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 my-8">
                No recent documents
              </p>
            ) : (
              <ul className="space-y-2">
                {recentDocs.map(doc => (
                  <li
                    key={doc.id}
                    className="flex items-start p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <Clock size={20} className="mr-2 mt-1 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{doc.module}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-400" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="absolute top-0 right-0 w-96 h-full bg-white dark:bg-slate-800 border-l shadow-xl flex flex-col z-50"
    >
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">Document Manager</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Close document manager"
        >
          <X size={20} />
        </button>
      </div>

      {/* Simplified tab navigation */}
      <div className="flex space-x-1 p-1 border-b">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(index)}
            className={`w-full py-2 text-sm font-medium leading-5 text-center rounded-lg 
                       flex items-center justify-center transition-colors duration-150
                       ${
                         activeTab === index
                           ? 'bg-regulatory-50 dark:bg-regulatory-900/40 text-regulatory-700 dark:text-regulatory-200'
                           : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                       }`}
            aria-selected={activeTab === index}
            role="tab"
          >
            <tab.icon size={16} className="mr-1" />
            {tab.label}
            {tab.key === 'qc' && qcErrors.length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {qcErrors.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">{renderContent()}</div>
    </motion.div>
  );
}
