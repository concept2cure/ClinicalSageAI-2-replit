import { useEffect, useState } from 'react';
import { listDocs, uploadDoc } from '../hooks/useDocuShare';
import { toast } from '@/hooks/use-toast';
import {
  FolderOpen,
  FileText,
  Search,
  Download,
  Share2,
  Edit,
  Trash2,
  Filter,
  Clock,
  Tag,
  AlertCircle,
  Check,
  Lock,
  Upload,
  FileUp,
  ChevronRight,
} from 'lucide-react';

// Sample documents for demo mode when backend is unavailable
const SAMPLE_DOCUMENTS = [
  {
    objectId: 'doc1',
    displayName: 'IND-12345-Protocol-v1.2.pdf',
    contentUrl: '#',
    type: 'Clinical Protocol',
    lastModified: '2025-04-15',
    status: 'Final',
    author: 'Dr. Sarah Miller',
  },
  {
    objectId: 'doc2',
    displayName: 'CSR-XYZ-2025-Q1-Report.pdf',
    contentUrl: '#',
    type: 'Clinical Study Report',
    lastModified: '2025-04-10',
    status: 'Draft',
    author: 'John Davis, PhD',
  },
  {
    objectId: 'doc3',
    displayName: 'Regulatory-Submission-2025-04.pdf',
    contentUrl: '#',
    type: 'Regulatory Filing',
    lastModified: '2025-04-05',
    status: 'Under Review',
    author: 'Regulatory Affairs Team',
  },
  {
    objectId: 'doc4',
    displayName: 'Safety-Report-Compound-ABC.pdf',
    contentUrl: '#',
    type: 'Safety Report',
    lastModified: '2025-03-28',
    status: 'Final',
    author: 'Safety Monitoring Committee',
  },
  {
    objectId: 'doc5',
    displayName: 'CMC-Section-Product-XYZ.pdf',
    contentUrl: '#',
    type: 'Chemistry Manufacturing Controls',
    lastModified: '2025-03-15',
    status: 'In Progress',
    author: 'CMC Department',
  },
];

export default function DocuShareVault() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewUrl, setViewUrl] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [docFilter, setDocFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchDocs = async () => {
      setLoading(true);
      try {
        const data = await listDocs();
        if (Array.isArray(data) && data.length > 0) {
          setDocs(data);
          setError(null);
          setUseDemoMode(false);
        } else {
          throw new Error('No documents available');
        }
      } catch (err) {
        console.error('Error fetching documents:', err);
        setError('Unable to connect to document service');
        setDocs(SAMPLE_DOCUMENTS);
        setUseDemoMode(true);
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  const onFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (useDemoMode) {
      // In demo mode, simulate uploading by adding a new document to the sample list
      const newDoc = {
        objectId: `doc${docs.length + 1}`,
        displayName: file.name,
        contentUrl: '#',
        type: 'Uploaded Document',
        lastModified: new Date().toISOString().split('T')[0],
        status: 'New',
        author: 'Current User',
      };

      setDocs([newDoc, ...docs]);
      toast({ title: 'Document uploaded successfully (Demo Mode)' });
      return;
    }

    try {
      await uploadDoc(file);
      const data = await listDocs();
      setDocs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error uploading document:', err);
      setError('Unable to upload document');
    }
  };

  const filteredDocs = docs.filter(doc => {
    // Apply search term filter
    const matchesSearch =
      searchTerm === '' ||
      doc.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.type && doc.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (doc.author && doc.author.toLowerCase().includes(searchTerm.toLowerCase()));

    // Apply document type filter
    const matchesFilter =
      docFilter === 'all' ||
      (docFilter === 'clinical' && doc.type?.includes('Clinical')) ||
      (docFilter === 'regulatory' && doc.type?.includes('Regulatory')) ||
      (docFilter === 'safety' && doc.type?.includes('Safety')) ||
      (docFilter === 'cmc' && doc.type?.includes('CMC'));

    return matchesSearch && matchesFilter;
  });

  const renderDocList = () => {
    if (loading) {
      return (
        <div className="p-4 text-gray-500 flex items-center">
          <div className="animate-spin mr-2 h-4 w-4 border-2 border-blue-600 border-opacity-50 border-t-blue-600 rounded-full"></div>
          Loading documents...
        </div>
      );
    }

    if (error && !useDemoMode) {
      return (
        <div className="p-4 text-red-500">
          <AlertCircle size={16} className="inline mr-2" />
          {error}
          <div className="mt-2 text-gray-600 text-sm">
            The document service is currently unavailable. This demo page is for UI preview only.
          </div>
        </div>
      );
    }

    if (filteredDocs.length === 0) {
      return (
        <div className="p-4 text-gray-500 flex flex-col items-center justify-center h-40">
          <FolderOpen size={32} className="text-gray-400 mb-2" />
          <p>No documents match your criteria</p>
          <button
            onClick={() => {
              setDocFilter('all');
              setSearchTerm('');
            }}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {filteredDocs.map(doc => (
          <button
            key={doc.objectId}
            className={`block w-full text-left p-2 rounded border-l-2 ${
              selectedDoc?.objectId === doc.objectId
                ? 'bg-blue-50 border-l-blue-500'
                : 'hover:bg-slate-100 border-l-transparent'
            }`}
            onClick={() => {
              setViewUrl(doc.contentUrl);
              setSelectedDoc(doc);
            }}
          >
            <div className="flex items-start">
              <FileText size={16} className="text-blue-500 mt-1 mr-2 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{doc.displayName}</div>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <div className="truncate">{doc.type}</div>
                  <div className="mx-1">•</div>
                  <div>{doc.lastModified}</div>
                </div>
                {doc.status && (
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        doc.status === 'Final'
                          ? 'bg-green-100 text-green-800'
                          : doc.status === 'Draft'
                            ? 'bg-gray-100 text-gray-800'
                            : doc.status === 'Under Review'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {doc.status === 'Final' && <Check size={12} className="mr-1" />}
                      {doc.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
      <div className="space-y-2 border rounded-lg p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold flex items-center">
            <FolderOpen size={18} className="mr-2 text-blue-600" />
            Document Repository
            {useDemoMode && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                Demo Mode
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 mt-1">21 CFR Part 11 compliant document vault</p>
        </div>

        <div className="flex space-x-2 mb-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search documents..."
              className="w-full pl-8 pr-3 py-2 border rounded text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <Search size={16} className="absolute text-gray-400 left-2.5 top-2.5" />
          </div>
          <select
            className="border rounded text-sm py-2 px-3"
            value={docFilter}
            onChange={e => setDocFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="clinical">Clinical</option>
            <option value="regulatory">Regulatory</option>
            <option value="safety">Safety</option>
            <option value="cmc">CMC</option>
          </select>
        </div>

        <div className="relative">
          <label className="inline-flex items-center px-3 py-2 mb-2 bg-blue-50 rounded-lg text-sm font-medium text-blue-600 cursor-pointer hover:bg-blue-100 transition-colors w-full">
            <FileUp size={16} className="mr-2" />
            Upload New Document
            <input
              type="file"
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFile}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>

        <div className="overflow-y-auto max-h-[calc(80vh-200px)]">{renderDocList()}</div>
      </div>

      <div className="lg:col-span-2 border rounded-lg shadow-sm bg-gray-50">
        {!selectedDoc ? (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <div className="bg-white rounded-lg p-8 text-center shadow-sm max-w-md">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-16 w-16 mx-auto mb-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Document Selected</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select a document from the list to preview it here, or upload a new document.
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-500">
                <div className="flex items-center">
                  <FileText size={14} className="mr-1" /> View
                </div>
                <div className="flex items-center">
                  <Download size={14} className="mr-1" /> Download
                </div>
                <div className="flex items-center">
                  <Share2 size={14} className="mr-1" /> Share
                </div>
                <div className="flex items-center">
                  <Lock size={14} className="mr-1" /> Access Control
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-white rounded-t-lg">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <FileText size={18} className="mr-2 text-blue-600" />
                {selectedDoc.displayName}
              </h3>
              <div className="flex space-x-1">
                <button className="p-1 rounded hover:bg-gray-100" title="Edit metadata">
                  <Edit size={16} className="text-gray-500" />
                </button>
                <button className="p-1 rounded hover:bg-gray-100" title="Delete document">
                  <Trash2 size={16} className="text-gray-500" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-white">
              <div className="col-span-2">
                <div className="flex items-center mb-4">
                  <button className="inline-flex items-center px-3 py-1.5 border border-transparent rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none text-sm mr-2">
                    <Download size={14} className="mr-1.5" />
                    Download
                  </button>
                  <button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none text-sm mr-2">
                    <Share2 size={14} className="mr-1.5" />
                    Share
                  </button>
                  <button className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none text-sm">
                    <Edit size={14} className="mr-1.5" />
                    Edit
                  </button>
                </div>

                <div className="bg-blue-50 rounded-lg p-6 text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-16 w-16 mx-auto mb-4 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Document Preview</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {useDemoMode
                      ? 'Document preview is available in production environment.'
                      : 'PDF preview is available in the production version.'}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border">
                <h4 className="font-medium text-gray-900 mb-3">Document Details</h4>
                <div className="space-y-3 text-sm">
                  <div className="flex">
                    <div className="text-gray-500 w-28">Document Type:</div>
                    <div className="font-medium">{selectedDoc.type || 'Not specified'}</div>
                  </div>
                  <div className="flex">
                    <div className="text-gray-500 w-28">Last Modified:</div>
                    <div className="font-medium">{selectedDoc.lastModified || 'Unknown'}</div>
                  </div>
                  <div className="flex">
                    <div className="text-gray-500 w-28">Status:</div>
                    <div className="font-medium">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          selectedDoc.status === 'Final'
                            ? 'bg-green-100 text-green-800'
                            : selectedDoc.status === 'Draft'
                              ? 'bg-gray-100 text-gray-800'
                              : selectedDoc.status === 'Under Review'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {selectedDoc.status || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <div className="flex">
                    <div className="text-gray-500 w-28">Author:</div>
                    <div className="font-medium">{selectedDoc.author || 'Not specified'}</div>
                  </div>

                  <div className="pt-3 mt-3 border-t">
                    <h5 className="font-medium mb-2">Access Control</h5>
                    <div className="px-3 py-2 bg-white rounded border text-xs">
                      <div className="flex items-center mb-1.5">
                        <Lock size={12} className="text-green-600 mr-1.5" />
                        <span className="font-medium">21 CFR Part 11 Compliant</span>
                      </div>
                      <div className="text-gray-500">
                        This document is stored in a 21 CFR Part 11 compliant system with audit
                        trails and electronic signatures.
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t">
                    <h5 className="font-medium mb-2">Version History</h5>
                    <div className="space-y-1.5">
                      <div className="text-xs px-3 py-1.5 bg-blue-50 rounded flex items-center justify-between">
                        <span>Current Version (1.2)</span>
                        <span className="text-gray-500">Apr 15, 2025</span>
                      </div>
                      <div className="text-xs px-3 py-1.5 hover:bg-gray-50 rounded flex items-center justify-between">
                        <span>Version 1.1</span>
                        <span className="text-gray-500">Apr 10, 2025</span>
                      </div>
                      <div className="text-xs px-3 py-1.5 hover:bg-gray-50 rounded flex items-center justify-between">
                        <span>Version 1.0</span>
                        <span className="text-gray-500">Apr 01, 2025</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
