// --- TrialSage Enterprise: Intelligent DocuShare Panel with Recommendation System ---

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useDropzone } from 'react-dropzone';
import { Separator } from '@/components/ui/separator';
import {
  FolderPlus,
  RefreshCw,
  Eye,
  Download,
  Trash2,
  History,
  Search,
  Upload,
  FileText,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  lockDocument,
  unlockDocument,
  deleteDocument,
  createFolder,
  listFolders,
  listDocumentVersions,
  revertToVersion,
} from '@/services/DocuShareService';

import { logDocumentInteraction } from '@/services/RecommendationService';

import InlineViewer from '@/components/InlineViewer';
import RecommendationSidebar from '@/components/docushare/RecommendationSidebar';

// Simulated user session for development - in production, this would come from authentication
const mockUser = {
  id: 'user123',
  name: 'Jane Smith',
  tenantId: 'trialsage',
  role: 'admin',
};

export default function IntelligentDocuSharePanel() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [docuShareConfig, setDocuShareConfig] = useState({
    apiUrl: '',
    version: '',
    features: {
      versioning: false,
      workflow: false,
      encryption: false,
      audit: false,
    },
  });

  // DocuShare OEM Configuration Check
  useEffect(() => {
    checkDocuShareConfiguration();
  }, []);

  const checkDocuShareConfiguration = async () => {
    try {
      const response = await fetch('/api/docushare/config');
      const config = await response.json();
      setDocuShareConfig(config);
    } catch (error) {
      console.error('DocuShare configuration check failed:', error);
    }
  };

  // Enhanced Document Upload with DocuShare API
  const uploadToDocuShare = async (file, metadata) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'metadata',
        JSON.stringify({
          ...metadata,
          projectId: metadata.projectId,
          regulatoryPhase: metadata.regulatoryPhase,
          submissionType: metadata.submissionType,
          tenantId: metadata.tenantId,
        })
      );

      const response = await fetch('/api/docushare/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'X-Tenant-ID': metadata.tenantId,
        },
      });

      const result = await response.json();

      if (result.success) {
        setDocuments(prev => [...prev, result.document]);
        // Trigger audit log
        await auditDocumentAction('upload', result.document.id, metadata.tenantId);
      }

      return result;
    } catch (error) {
      console.error('DocuShare upload failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Document Search with Advanced Filtering
  const searchDocuments = async (query, filters = {}) => {
    setLoading(true);
    try {
      const searchParams = new URLSearchParams({
        query: query,
        ...filters,
        tenantIsolation: 'true',
      });

      const response = await fetch(`/api/docushare/search?${searchParams}`);
      const results = await response.json();

      setDocuments(results.documents);
      return results;
    } catch (error) {
      console.error('DocuShare search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Version Management
  const createNewVersion = async (documentId, file, versionNote) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('versionNote', versionNote);

      const response = await fetch(`/api/docushare/documents/${documentId}/version`, {
        method: 'POST',
        body: formData,
      });

      return await response.json();
    } catch (error) {
      console.error('Version creation failed:', error);
      throw error;
    }
  };

  // Workflow Initiation
  const initiateDocumentWorkflow = async (documentId, workflowType, participants) => {
    try {
      const response = await fetch(`/api/docushare/documents/${documentId}/workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowType: workflowType,
          participants: participants,
        }),
      });

      return await response.json();
    } catch (error) {
      console.error('Workflow initiation failed:', error);
      throw error;
    }
  };

  // Audit Logging
  const auditDocumentAction = async (action, documentId, tenantId) => {
    try {
      await fetch('/api/docushare/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: action,
          documentId: documentId,
          tenantId: tenantId,
          timestamp: new Date().toISOString(),
          userId: mockUser?.id, // Changed user?.id to mockUser?.id
        }),
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  };
  // State for documents and folders
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState('/');
  const [folderPath, setFolderPath] = useState([{ name: 'Root', path: '/' }]);

  // UI state
  const [filterName, setFilterName] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [versions, setVersions] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');

  const pageSize = 9;
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    fetchDocuments();
    fetchFolders();
  }, [currentFolder]);

  // Fetch documents from current folder
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await listDocuments(mockUser.tenantId, currentFolder);
      setDocuments(res || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch folders
  const fetchFolders = async () => {
    try {
      const res = await listFolders(mockUser.tenantId);
      setFolders(res || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  // Handle file uploads
  const onDrop = useCallback(
    async acceptedFiles => {
      if (acceptedFiles.length === 0) return;

      try {
        const file = acceptedFiles[0];
        await uploadDocument(file, mockUser.tenantId, currentFolder);

        toast({
          title: 'Document Uploaded',
          description: `${file.name} uploaded successfully.`,
        });

        fetchDocuments();
      } catch (error) {
        console.error('Error uploading file:', error);
        toast({
          title: 'Upload Failed',
          description: error.message || 'Failed to upload document.',
          variant: 'destructive',
        });
      }
    },
    [currentFolder]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // Filter documents by name
  const filteredDocs = documents.filter(doc =>
    filterName ? doc.name.toLowerCase().includes(filterName.toLowerCase()) : true
  );

  // Paginate documents
  const paginatedDocs = filteredDocs.slice((page - 1) * pageSize, page * pageSize);

  // Document operations
  const handleDownload = async id => {
    try {
      await downloadDocument(id, mockUser.tenantId);

      // Log interaction for recommendations
      await logDocumentInteraction({
        documentId: id,
        userId: mockUser.id,
        action: 'download',
        tenantId: mockUser.tenantId,
      });

      toast({
        title: 'Download Started',
        description: 'Your download has started.',
      });
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to download document.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async id => {
    try {
      if (confirm('Are you sure you want to delete this document?')) {
        await deleteDocument(id, mockUser.tenantId);
        fetchDocuments();

        toast({
          title: 'Document Deleted',
          description: 'Document deleted successfully.',
        });
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document.',
        variant: 'destructive',
      });
    }
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName, mockUser.tenantId, currentFolder);
      setNewFolderName('');
      fetchFolders();

      toast({
        title: 'Folder Created',
        description: `Folder "${newFolderName}" created successfully.`,
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create folder.',
        variant: 'destructive',
      });
    }
  };

  // View document versions
  const handleViewVersions = async docId => {
    try {
      const res = await listDocumentVersions(docId);
      setVersions(res);
    } catch (error) {
      console.error('Error fetching version history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load version history.',
        variant: 'destructive',
      });
    }
  };

  // Revert to version
  const handleRevertToVersion = async (docId, versionNumber) => {
    try {
      if (confirm(`Are you sure you want to revert to version ${versionNumber}?`)) {
        await revertToVersion(docId, versionNumber);
        fetchDocuments();
        setVersions([]);

        toast({
          title: 'Document Reverted',
          description: `Document reverted to version ${versionNumber} successfully.`,
        });
      }
    } catch (error) {
      console.error('Error reverting document version:', error);
      toast({
        title: 'Error',
        description: 'Failed to revert document version.',
        variant: 'destructive',
      });
    }
  };

  // Navigate to folder
  const navigateToFolder = folder => {
    setCurrentFolder(folder.path);

    // Update breadcrumb
    if (folder.path === '/') {
      setFolderPath([{ name: 'Root', path: '/' }]);
    } else {
      // Split path and construct breadcrumbs
      const parts = folder.path.split('/').filter(p => p);
      const breadcrumbs = [{ name: 'Root', path: '/' }];

      let currentPath = '';
      parts.forEach(part => {
        currentPath += '/' + part;
        breadcrumbs.push({
          name: part,
          path: currentPath,
        });
      });

      setFolderPath(breadcrumbs);
    }

    // Reset pagination
    setPage(1);
  };

  // Handle document preview
  const handleDocumentPreview = async doc => {
    setSelectedDoc(doc);

    // Log interaction for recommendations
    try {
      await logDocumentInteraction({
        documentId: doc._id,
        userId: mockUser.id,
        action: 'view',
        metadata: {
          folder: currentFolder,
        },
        tenantId: mockUser.tenantId,
      });
    } catch (error) {
      console.error('Error logging document view:', error);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Intelligent Document Management</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main content area */}
          <div className="lg:col-span-3">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center mb-4 text-sm">
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.path}>
                  {index > 0 && <span className="mx-2">/</span>}
                  <button
                    onClick={() => navigateToFolder(folder)}
                    className={`hover:text-blue-600 ${
                      index === folderPath.length - 1
                        ? 'text-blue-600 font-medium'
                        : 'text-gray-600'
                    }`}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search documents..."
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex">
                  <Input
                    placeholder="New folder name..."
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    className="rounded-r-none"
                  />
                  <Button onClick={handleCreateFolder} className="rounded-l-none">
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </div>
                <Button onClick={fetchDocuments}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Upload Area */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed p-6 bg-white rounded-lg hover:bg-blue-50 cursor-pointer mb-6 ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center">
                <Upload className="h-10 w-10 text-blue-500 mb-2" />
                <p className="text-blue-700 font-medium">Drop files here or click to upload</p>
                <p className="text-sm text-gray-500 mt-1">
                  Documents will be automatically tagged and analyzed
                </p>
              </div>
            </div>

            {/* Folders */}
            {folders.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-medium mb-3">Folders</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {folders.map(folder => (
                    <Card
                      key={folder._id}
                      className="cursor-pointer hover:bg-gray-50 transition"
                      onClick={() => navigateToFolder(folder)}
                    >
                      <CardContent className="p-4 flex items-center">
                        <FolderOpen className="h-5 w-5 text-blue-500 mr-3" />
                        <span className="truncate">{folder.name}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            <div>
              <h2 className="text-lg font-medium mb-3">Documents</h2>

              {paginatedDocs.length === 0 ? (
                <div className="text-center p-8 bg-white rounded-lg border border-gray-200">
                  <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-gray-700 font-medium">No documents found</h3>
                  <p className="text-gray-500 mt-1 mb-4">
                    {filterName
                      ? 'No documents match your search'
                      : 'Upload documents or create folders to get started'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {paginatedDocs.map(doc => (
                    <Card key={doc._id} className="overflow-hidden shadow-sm hover:shadow">
                      <CardContent className="p-0">
                        <div className="p-4 border-b">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center min-w-0">
                              <FileText
                                className={`h-5 w-5 flex-shrink-0 text-${getDocumentColor(doc)}-500 mr-2`}
                              />
                              <div className="min-w-0">
                                <h3 className="font-medium text-gray-900 truncate">{doc.name}</h3>
                                <p className="text-xs text-gray-500">
                                  {formatFileSize(doc.size)} • {formatDate(doc.createdAt)}
                                </p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Tags */}
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {doc.tags.slice(0, 3).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700"
                                >
                                  {tag}
                                </span>
                              ))}
                              {doc.tags.length > 3 && (
                                <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                                  +{doc.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex divide-x border-t">
                          <button
                            className="flex-1 p-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex justify-center items-center"
                            onClick={() => handleDocumentPreview(doc)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            View
                          </button>
                          <button
                            className="flex-1 p-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex justify-center items-center"
                            onClick={() => handleDownload(doc._id)}
                          >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                          </button>
                          <button
                            className="flex-1 p-2 text-xs font-medium text-red-600 hover:bg-red-50 flex justify-center items-center"
                            onClick={() => handleDelete(doc._id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {filteredDocs.length > pageSize && (
                <div className="flex justify-center mt-6">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(p - 1, 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {page} of {Math.ceil(filteredDocs.length / pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPage(p => Math.min(p + 1, Math.ceil(filteredDocs.length / pageSize)))
                      }
                      disabled={page >= Math.ceil(filteredDocs.length / pageSize)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendation Sidebar */}
          <div className="lg:col-span-1">
            <RecommendationSidebar
              userId={mockUser.id}
              tenantId={mockUser.tenantId}
              currentDocument={selectedDoc}
              currentFolder={currentFolder}
              onDocumentSelect={handleDocumentPreview}
            />
          </div>
        </div>
      </div>

      {/* Document Viewer Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          {selectedDoc && (
            <div className="h-full border rounded">
              <InlineViewer fileUrl={selectedDoc.fileUrl} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      {versions.length > 0 && (
        <Dialog open={versions.length > 0} onOpenChange={() => setVersions([])}>
          <DialogContent>
            <h2 className="text-xl font-bold mb-4">Version History</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {versions.map(version => (
                <div
                  key={version.versionNumber}
                  className="flex justify-between items-center p-3 border-b"
                >
                  <div>
                    <div className="font-medium">Version {version.versionNumber}</div>
                    <div className="text-sm text-gray-500">{formatDate(version.uploadedAt)}</div>
                  </div>
                  <Button
                    onClick={() => handleRevertToVersion(version.documentId, version.versionNumber)}
                    variant="outline"
                    size="sm"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Revert
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Helper function to determine document color
function getDocumentColor(doc) {
  const fileType = doc.name.split('.').pop().toLowerCase();

  switch (fileType) {
    case 'pdf':
      return 'red';
    case 'doc':
    case 'docx':
      return 'blue';
    case 'xls':
    case 'xlsx':
      return 'green';
    case 'ppt':
    case 'pptx':
      return 'orange';
    default:
      return 'gray';
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Helper function to format date
function formatDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  return date.toLocaleDateString();
}
