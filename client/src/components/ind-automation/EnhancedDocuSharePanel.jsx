import React, { useState, useEffect } from 'react';
import { listDocuments, uploadDocument, downloadDocument } from '@/services/DocuShareService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogFooter, } from '@/components/ui/dialog';
import { useDropzone } from 'react-dropzone';
import {
  Loader2, DownloadCloud, Sparkles, UploadCloud, Filter, Search, Grid, List, Folder, FileText, File, Clock, ChevronRight, ChevronDown, Check, X } from 'lucide-react'
import { summarizeDocumentAI } from '@/services/OpenAIService';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * EnhancedDocuSharePanel - Microsoft 365-style document management interface
 *
 * Enterprise-grade document management component for the IND Module with
 * drag-and-drop uploading, document previewing, filtering, and AI summarization.
 */
export default function EnhancedDocuSharePanel() {
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [currentFolder, setCurrentFolder] = useState('/IND');
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'IND', path: '/IND' }]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showUploadSuccess, setShowUploadSuccess] = useState(false);

  // Fetch documents when current folder changes
  useEffect(() => {
    fetchDocuments();
  }, [currentFolder]);

  // Fetch documents from the server
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const docs = await listDocuments(currentFolder);
      setDocuments(docs);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle file drop for upload
  const onDrop = acceptedFiles => {
    setSelectedFile(acceptedFiles[0]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
    },
  });

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      // Determine module from current folder if possible
      const moduleMatch = currentFolder.match(/\/IND\/Module (\d+)/);
      const module = moduleMatch ? `Module ${moduleMatch[1]}` : '';

      // Upload document with metadata
      await uploadDocument(currentFolder, selectedFile, {
        module,
        documentType: guessDocumentType(selectedFile.name),
        status: 'draft',
      });

      setSelectedFile(null);
      setShowUploadSuccess(true);
      await fetchDocuments();

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setShowUploadSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  // Handle document download
  const handleDownload = async id => {
    try {
      await downloadDocument(id);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Handle AI summarization of document
  const handleSummarize = async id => {
    setLoadingSummary(true);
    setSelectedDocId(id);
    try {
      const sum = await summarizeDocumentAI(id);
      setSummary(sum);
    } catch (error) {
      console.error('Summarization failed:', error);
      setSummary('Failed to generate summary. Please try again later.');
    } finally {
      setLoadingSummary(false);
    }
  };

  // Navigate to a folder
  const navigateToFolder = folder => {
    setLoading(true);
    setCurrentFolder(folder.path);

    // Update breadcrumbs
    const paths = folder.path.split('/').filter(p => p);
    const newBreadcrumbs = paths.map((part, index) => ({
      name: part,
      path: '/' + paths.slice(0, index + 1).join('/'),
    }));

    setBreadcrumbs(newBreadcrumbs);
  };

  // Filter documents based on search term and module filter
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = moduleFilter
      ? doc.metadata?.module === moduleFilter || doc.name.includes(moduleFilter)
      : true;

    return matchesSearch && matchesModule;
  });

  // Helper to determine document type based on filename
  const guessDocumentType = filename => {
    const lowercased = filename.toLowerCase();

    if (lowercased.includes('protocol')) return 'Protocol';
    if (lowercased.includes('form')) return 'Form';
    if (lowercased.includes('letter') || lowercased.includes('cover')) return 'Cover Letter';
    if (lowercased.includes('report')) return 'Report';
    if (lowercased.includes('summary')) return 'Summary';
    if (lowercased.includes('cv') || lowercased.includes('resume')) return 'CV';

    return '';
  };

  // Get appropriate icon for document type
  const getDocumentIcon = doc => {
    if (doc.type === 'folder') {
      return <Folder className="h-10 w-10 text-blue-500" />;
    }

    const extension = doc.name.split('.').pop().toLowerCase();

    switch (extension) {
      case 'pdf':
        return <FileText className="h-10 w-10 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="h-10 w-10 text-blue-600" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="h-10 w-10 text-green-600" />;
      case 'ppt':
      case 'pptx':
        return <FileText className="h-10 w-10 text-orange-500" />;
      default:
        return <File className="h-10 w-10 text-gray-500" />;
    }
  };

  // Get document status badge
  const getStatusBadge = status => {
    if (!status) return null;

    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800 border border-green-300">Approved</Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300">
            Pending Review
          </Badge>
        );
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-800 border border-gray-300">Draft</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 border border-red-300">Rejected</Badge>;
      default:
        return null;
    }
  };

  // Format date consistently
  const formatDate = dateString => {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg border shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-white rounded-t-lg">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-gray-800">IND Documents</h2>

          <div className="border-l h-6 mx-2"></div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={value => value && setViewMode(value)}
          >
            <ToggleGroupItem value="grid" aria-label="Grid View">
              <Grid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List View">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="border-l h-6 mx-2"></div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 w-[200px] h-9"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Filter by module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Modules</SelectItem>
              <SelectItem value="Module 1">Module 1</SelectItem>
              <SelectItem value="Module 2">Module 2</SelectItem>
              <SelectItem value="Module 3">Module 3</SelectItem>
              <SelectItem value="Module 4">Module 4</SelectItem>
              <SelectItem value="Module 5">Module 5</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="flex items-center gap-2"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center p-3 bg-gray-50 text-sm border-b">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            {index > 0 && <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />}
            <button
              className={`hover:underline ${index === breadcrumbs.length - 1 ? 'font-medium text-blue-600' : 'text-gray-600'}`}
              onClick={() => navigateToFolder(crumb)}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Upload Success Message */}
      {showUploadSuccess && (
        <div className="mx-4 mt-4 p-3 bg-green-50 text-green-800 rounded-md border border-green-200 flex items-center justify-between">
          <div className="flex items-center">
            <Check className="h-5 w-5 mr-2 text-green-600" />
            <span>File uploaded successfully!</span>
          </div>
          <button onClick={() => setShowUploadSuccess(false)}>
            <X className="h-4 w-4 text-green-600" />
          </button>
        </div>
      )}

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className="m-4 border-2 border-dashed border-blue-300 bg-white p-6 rounded-lg flex flex-col items-center justify-center hover:bg-blue-50 transition cursor-pointer"
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-10 w-10 text-blue-500 mb-2" />
        <p className="text-blue-700 font-medium">
          {isDragActive ? 'Drop the file here...' : 'Drag and drop a file, or click to select'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Supported formats: PDF, Word, Excel, PowerPoint, and plain text
        </p>
        {selectedFile && (
          <div className="mt-3 flex items-center bg-blue-50 py-1 px-3 rounded-full">
            <Check className="h-4 w-4 text-blue-600 mr-2" />
            <span className="text-sm font-medium text-blue-700">{selectedFile.name}</span>
          </div>
        )}
      </div>

      {/* Document List */}
      <div className="p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <p className="mt-4 text-gray-600">Loading documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Folder className="w-16 h-16 text-gray-400 mb-2" />
            <p className="text-lg font-medium">No documents found</p>
            <p className="text-sm">Upload a document or change your search criteria</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocuments.map(doc => (
              <Card
                key={doc.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition overflow-hidden"
                onClick={() => (doc.type === 'folder' ? navigateToFolder(doc) : null)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start">
                    {getDocumentIcon(doc)}

                    <div className="ml-3 flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{doc.name}</p>

                      {doc.type === 'folder' ? (
                        <p className="text-sm text-gray-500">{doc.items || 0} items</p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-500 flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDate(doc.lastModified)}
                          </p>
                          <div className="mt-2 flex items-center">
                            {getStatusBadge(doc.status || doc.metadata?.status)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {doc.type !== 'folder' && (
                    <div className="mt-4 flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={e => {
                          e.stopPropagation();
                          handleDownload(doc.id);
                        }}
                      >
                        <DownloadCloud className="h-3 w-3 mr-1" /> Download
                      </Button>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={e => {
                              e.stopPropagation();
                              handleSummarize(doc.id);
                            }}
                          >
                            <Sparkles className="h-3 w-3 mr-1" /> Summarize
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogTitle>Document Summary</DialogTitle>
                          <DialogDescription>
                            AI-generated summary of "{doc.name}"
                          </DialogDescription>

                          <div className="mt-4 bg-gray-50 p-4 rounded-md max-h-[400px] overflow-y-auto">
                            {loadingSummary && selectedDocId === doc.id ? (
                              <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                              </div>
                            ) : (
                              <p className="text-sm text-gray-800 whitespace-pre-line">{summary}</p>
                            )}
                          </div>

                          <DialogFooter className="mt-4">
                            <Button variant="outline" size="sm">
                              Close
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden border rounded-lg bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Modified
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocuments.map(doc => (
                  <tr
                    key={doc.id}
                    className={
                      doc.type === 'folder' ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50'
                    }
                    onClick={() => (doc.type === 'folder' ? navigateToFolder(doc) : null)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center">
                          {getDocumentIcon(doc)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                          {doc.type === 'folder' && (
                            <div className="text-sm text-gray-500">{doc.items || 0} items</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{formatDate(doc.lastModified)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {doc.type !== 'folder' && getStatusBadge(doc.status || doc.metadata?.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {doc.type !== 'folder' && (
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={e => {
                              e.stopPropagation();
                              handleDownload(doc.id);
                            }}
                          >
                            <DownloadCloud className="h-4 w-4 mr-1" /> Download
                          </Button>

                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleSummarize(doc.id);
                                }}
                              >
                                <Sparkles className="h-4 w-4 mr-1" /> Summarize
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogTitle>Document Summary</DialogTitle>
                              <DialogDescription>
                                AI-generated summary of "{doc.name}"
                              </DialogDescription>

                              <div className="mt-4 bg-gray-50 p-4 rounded-md max-h-[400px] overflow-y-auto">
                                {loadingSummary && selectedDocId === doc.id ? (
                                  <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-800 whitespace-pre-line">
                                    {summary}
                                  </p>
                                )}
                              </div>

                              <DialogFooter className="mt-4">
                                <Button variant="outline" size="sm">
                                  Close
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="p-3 border-t text-xs text-gray-500 flex justify-between bg-gray-50 rounded-b-lg">
        <div>
          {filteredDocuments.length} item{filteredDocuments.length !== 1 ? 's' : ''}
          {searchTerm && ` (filtered from ${documents.length})`}
        </div>
        <div>Connected to DocuShare • Server ID: TrialSAGE-DS7</div>
      </div>
    </div>
  );
}
