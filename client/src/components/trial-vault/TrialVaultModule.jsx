import React, { useState, useEffect } from 'react';
import { Upload, Search, Filter, FileText, Shield, Clock, Plus, ArrowUpDown, FileCheck, Download } from 'lucide-react'
import { useIntegration } from '../integration/ModuleIntegrationLayer';
import UnifiedDocumentUpload from '../unified/UnifiedDocumentUpload';

const TrialVaultModule = () => {
  const { data, blockchainStatus, addAuditEntry, verifyDocumentBlockchain } = useIntegration();
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    documentType: '',
  });

  // Mock document data
  const mockDocuments = [
    {
      id: 'd1',
      title: 'Phase 1 Clinical Study Report',
      description: 'Final CSR for Phase 1 Study XYZ-001',
      documentType: 'CSR',
      category: 'Clinical',
      fileName: 'XYZ001_Phase1_CSR_v1.0.pdf',
      fileSize: 2540032,
      uploadDate: '2025-03-15T10:30:00Z',
      uploadedBy: 'admin',
      verified: true,
      verifiedDate: '2025-03-15T10:35:22Z',
      tags: ['Phase 1', 'CSR', 'Final'],
    },
    {
      id: 'd2',
      title: 'Investigator Brochure',
      description: 'Updated IB for compound XYZ-123',
      documentType: 'IB',
      category: 'Regulatory',
      fileName: 'XYZ123_IB_v2.1.pdf',
      fileSize: 4891245,
      uploadDate: '2025-03-10T14:22:33Z',
      uploadedBy: 'admin',
      verified: true,
      verifiedDate: '2025-03-10T14:25:12Z',
      tags: ['IB', 'Safety', 'Update'],
    },
    {
      id: 'd3',
      title: 'Study Protocol',
      description: 'Protocol for Phase 2 clinical trial',
      documentType: 'Protocol',
      category: 'Clinical',
      fileName: 'XYZ002_Phase2_Protocol_v1.2.pdf',
      fileSize: 1834522,
      uploadDate: '2025-03-05T09:45:11Z',
      uploadedBy: 'admin',
      verified: true,
      verifiedDate: '2025-03-05T09:48:50Z',
      tags: ['Phase 2', 'Protocol', 'Amended'],
    },
    {
      id: 'd4',
      title: 'Quality Control Procedures',
      description: 'SOP for quality control of clinical documents',
      documentType: 'SOP',
      category: 'Quality',
      fileName: 'SOP_QC_Clinical_v3.0.pdf',
      fileSize: 982541,
      uploadDate: '2025-02-28T11:12:45Z',
      uploadedBy: 'admin',
      verified: true,
      verifiedDate: '2025-02-28T11:15:32Z',
      tags: ['SOP', 'QC', 'Clinical'],
    },
    {
      id: 'd5',
      title: 'FDA Meeting Minutes',
      description: 'Minutes from Type B meeting with FDA',
      documentType: 'Meeting Minutes',
      category: 'Regulatory',
      fileName: 'FDA_TypeB_Meeting_Minutes_2025-02-15.pdf',
      fileSize: 754222,
      uploadDate: '2025-02-20T16:30:18Z',
      uploadedBy: 'admin',
      verified: true,
      verifiedDate: '2025-02-20T16:33:05Z',
      tags: ['FDA', 'Meeting', 'Type B'],
    },
  ];

  useEffect(() => {
    // Simulating API call to fetch documents
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        // In a real implementation, this would be an API call
        await new Promise(resolve => setTimeout(resolve, 800));

        const filteredDocs = mockDocuments.filter(doc => {
          if (filters.category && doc.category !== filters.category) return false;
          if (filters.documentType && doc.documentType !== filters.documentType) return false;
          return true;
        });

        setDocuments(filteredDocs);
        addAuditEntry('documents_loaded', { count: filteredDocs.length });
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [filters, addAuditEntry]);

  const handleUpload = () => {
    setShowUploadModal(true);
  };

  const handleVerify = async documentId => {
    try {
      const result = await verifyDocumentBlockchain(documentId);
      const updatedDocs = documents.map(doc =>
        doc.id === documentId
          ? { ...doc, verified: result, verifiedDate: new Date().toISOString() }
          : doc
      );
      setDocuments(updatedDocs);
    } catch (error) {
      console.error('Verification error:', error);
    }
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
  };

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value,
    }));
  };

  // Categories and document types for filtering
  const categories = ['Clinical', 'Regulatory', 'Quality', 'Manufacturing', 'Safety'];
  const documentTypes = ['CSR', 'Protocol', 'IB', 'SOP', 'Meeting Minutes', 'Form', 'Report'];

  const formatFileSize = bytes => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDate = dateString => {
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">TrialSage Vault™</h1>
        <p className="text-gray-600">
          Secure document storage with blockchain verification for regulatory submissions
        </p>
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left sidebar - Filters */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
            <div className="flex items-center mb-4">
              <Filter size={18} className="text-gray-500 mr-2" />
              <h3 className="font-medium">Filters</h3>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={filters.category}
                onChange={e => handleFilterChange('category', e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={filters.documentType}
                onChange={e => handleFilterChange('documentType', e.target.value)}
              >
                <option value="">All Types</option>
                {documentTypes.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center mb-4">
              <Shield size={18} className="text-gray-500 mr-2" />
              <h3 className="font-medium">Blockchain Status</h3>
            </div>

            <div className="flex items-center mb-2">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${blockchainStatus.verified ? 'bg-green-500' : 'bg-yellow-500'}`}
              ></div>
              <span className="text-sm">
                {blockchainStatus.verified ? 'Verified' : 'Verification Needed'}
              </span>
            </div>

            <div className="text-xs text-gray-500 flex items-center">
              <Clock size={12} className="mr-1" />
              <span>
                Last checked: {new Date(blockchainStatus.lastVerified).toLocaleTimeString()}
              </span>
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
                  placeholder="Search documents..."
                  className="pl-10 pr-3 py-2 w-full border border-gray-300 rounded-md text-sm"
                />
              </div>

              <button className="hot-pink-btn flex items-center" onClick={handleUpload}>
                <Upload size={16} className="mr-2" />
                Upload Document
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-pink-600"></div>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <FileText size={48} className="mb-4 text-gray-300" />
                <h3 className="font-medium mb-1">No documents found</h3>
                <p className="text-sm">Try adjusting your filters or upload a new document</p>
                <button className="hot-pink-btn flex items-center mt-4" onClick={handleUpload}>
                  <Plus size={16} className="mr-2" />
                  Add Document
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">
                        <div className="flex items-center">
                          Document
                          <ArrowUpDown size={14} className="ml-1" />
                        </div>
                      </th>
                      <th className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center">
                          Type
                          <ArrowUpDown size={14} className="ml-1" />
                        </div>
                      </th>
                      <th className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center">
                          Size
                          <ArrowUpDown size={14} className="ml-1" />
                        </div>
                      </th>
                      <th className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center">
                          Uploaded
                          <ArrowUpDown size={14} className="ml-1" />
                        </div>
                      </th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {documents.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <div className="font-medium text-gray-900">{doc.title}</div>
                            <div className="text-sm text-gray-500">{doc.fileName}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {doc.documentType}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 hidden md:table-cell">
                          {formatFileSize(doc.fileSize)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 hidden lg:table-cell">
                          {formatDate(doc.uploadDate)}
                        </td>
                        <td className="px-4 py-4">
                          {doc.verified ? (
                            <div className="inline-flex items-center text-green-800">
                              <FileCheck size={16} className="mr-1 text-green-600" />
                              <span className="text-xs">Verified</span>
                            </div>
                          ) : (
                            <button
                              className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-pink-600 hover:bg-pink-700 focus:outline-none"
                              onClick={() => handleVerify(doc.id)}
                            >
                              <Shield size={12} className="mr-1" />
                              Verify
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-2">
                            <button className="p-1 text-gray-500 hover:text-gray-700 focus:outline-none">
                              <Download size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Upload Document</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Title</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter document title"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2">
                <option value="">Select type</option>
                {documentTypes.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2">
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
              <div className="border-2 border-dashed border-gray-300 rounded-md p-6 flex flex-col items-center justify-center">
                <Upload size={24} className="text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 text-center mb-2">
                  Drag and drop a file here, or click to select a file
                </p>
                <button className="bg-gray-200 text-gray-800 px-3 py-1 rounded-md text-sm font-medium">
                  Browse Files
                </button>
                <input type="file" className="hidden" />
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={closeUploadModal}
              >
                Cancel
              </button>
              <button className="hot-pink-btn">Upload</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialVaultModule;
