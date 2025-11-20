// --- TrialSage Enterprise DocuShare (Fully Integrated, Optimized, Tailored for Replit) ---

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDropzone } from 'react-dropzone';
import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  lockDocument,
  unlockDocument,
  moveDocument,
  deleteDocument,
  createFolder,
  listFolders,
} from '@/services/DocuShareService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  DownloadCloud,
  Lock,
  Unlock,
  Trash2,
  FolderPlus,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Folder,
  ArrowLeft,
  ChevronRight,
  MoveRight,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_FOLDER = '/';

export default function EnhancedDocuSharePanel() {
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(DEFAULT_FOLDER);
  const [folderPath, setFolderPath] = useState([{ name: 'Root', path: DEFAULT_FOLDER }]);
  const [filterName, setFilterName] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingDoc, setMovingDoc] = useState(null);
  const [moveFolderDialog, setMoveFolderDialog] = useState(false);
  const [targetFolder, setTargetFolder] = useState('');
  const [page, setPage] = useState(1);
  const [activeView, setActiveView] = useState('all');
  const pageSize = 9;
  const { toast } = useToast();

  // Mock user data - in a real app, this would come from authentication
  const user = {
    id: 'user123',
    name: 'Jane Smith',
    tenantId: 'trialsage',
    role: 'admin',
  };

  useEffect(() => {
    fetchDocuments();
    fetchFolders();
  }, [currentFolder]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await listDocuments(currentFolder);
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

  const fetchFolders = async () => {
    try {
      const res = await listFolders(currentFolder);
      setFolders(res || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  const onDrop = async acceptedFiles => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);
    try {
      const file = acceptedFiles[0];

      // Create metadata for the file
      const metadata = {
        trialId: extractTrialId(file.name),
        molecule: extractMolecule(file.name),
        folder: currentFolder,
      };

      await uploadDocument(currentFolder, file, metadata);
      fetchDocuments();
      toast({
        title: 'Success!',
        description: `Uploaded ${file.name} successfully`,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload Failed',
        description: 'Could not upload file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    },
  });

  // Simple trial ID and molecule extraction (in a real app, would be more sophisticated)
  const extractTrialId = filename => {
    const match = filename.match(/(?:Trial|Study|ID)[_\s-]*(\w+\d+)/i);
    return match ? match[1] : '';
  };

  const extractMolecule = filename => {
    const match = filename.match(/(?:Molecule|Compound|Drug)[_\s-]*([A-Z0-9-]+)/i);
    return match ? match[1] : '';
  };

  const navigateToFolder = folder => {
    setCurrentFolder(folder.path);

    // Update the breadcrumb
    if (folder.path === DEFAULT_FOLDER) {
      setFolderPath([{ name: 'Root', path: DEFAULT_FOLDER }]);
    } else {
      // Split path and construct breadcrumbs
      const parts = folder.path.split('/').filter(p => p);
      const breadcrumbs = [{ name: 'Root', path: DEFAULT_FOLDER }];

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

    // Reset filters and pagination when changing folders
    setFilterName('');
    setFilterType('');
    setPage(1);
  };

  // Handle creating a new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: 'Error',
        description: 'Folder name cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createFolder(currentFolder, newFolderName);
      setNewFolderDialog(false);
      setNewFolderName('');
      fetchFolders();
      toast({
        title: 'Success',
        description: `Folder "${newFolderName}" created successfully`,
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create folder',
        variant: 'destructive',
      });
    }
  };

  // Handle moving a document to a different folder
  const handleMoveDocument = async () => {
    if (!movingDoc || !targetFolder) return;

    try {
      await moveDocument(movingDoc.id, targetFolder);
      setMoveFolderDialog(false);
      setMovingDoc(null);
      setTargetFolder('');
      fetchDocuments();
      toast({
        title: 'Success',
        description: `Moved document to new location`,
      });
    } catch (error) {
      console.error('Error moving document:', error);
      toast({
        title: 'Error',
        description: 'Failed to move document',
        variant: 'destructive',
      });
    }
  };

  // Filter documents based on search and type filters
  const filteredDocs = documents.filter(doc => {
    const nameMatch = filterName ? doc.name.toLowerCase().includes(filterName.toLowerCase()) : true;

    const typeMatch = filterType
      ? (doc.name.split('.').pop() || '').toLowerCase() === filterType.toLowerCase()
      : true;

    return nameMatch && typeMatch;
  });

  // Paginate the filtered documents
  const paginatedDocs = filteredDocs.slice((page - 1) * pageSize, page * pageSize);

  // Document operations
  const handleDownload = async id => {
    try {
      await downloadDocument(id);
      toast({
        title: 'Success',
        description: 'Document download started',
      });
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to download document',
        variant: 'destructive',
      });
    }
  };

  const handleLock = async id => {
    try {
      await lockDocument(id);
      fetchDocuments();
      toast({
        title: 'Success',
        description: 'Document locked successfully',
      });
    } catch (error) {
      console.error('Error locking document:', error);
      toast({
        title: 'Error',
        description: 'Failed to lock document',
        variant: 'destructive',
      });
    }
  };

  const handleUnlock = async id => {
    try {
      await unlockDocument(id);
      fetchDocuments();
      toast({
        title: 'Success',
        description: 'Document unlocked successfully',
      });
    } catch (error) {
      console.error('Error unlocking document:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlock document',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async id => {
    try {
      await deleteDocument(id);
      fetchDocuments();
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  // Render file icon based on file type
  const renderFileIcon = filename => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    switch (extension) {
      case 'pdf':
        return <FileText className="h-10 w-10 text-red-500" />;
      case 'doc':
      case 'docx':
        return <FileText className="h-10 w-10 text-blue-600" />;
      case 'xls':
      case 'xlsx':
        return <FileText className="h-10 w-10 text-green-600" />;
      case 'txt':
        return <FileText className="h-10 w-10 text-gray-500" />;
      default:
        return <FileText className="h-10 w-10 text-gray-400" />;
    }
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-600">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Document Management</h1>
        <div className="text-sm text-gray-500">
          Securely store, organize, and access essential regulatory and clinical documents
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center mb-4 text-sm">
        {folderPath.map((folder, index) => (
          <React.Fragment key={folder.path}>
            {index > 0 && <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />}
            <button
              onClick={() => navigateToFolder(folder)}
              className={`hover:text-blue-600 ${
                index === folderPath.length - 1 ? 'text-blue-600 font-medium' : 'text-gray-600'
              }`}
            >
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="mb-6">
        <Tabs
          defaultValue="all"
          className="w-full"
          value={activeView}
          onValueChange={setActiveView}
        >
          <TabsList>
            <TabsTrigger value="all">All Documents</TabsTrigger>
            <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 mb-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="text-center">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto mb-2" />
            <p className="text-blue-600 font-medium">Uploading document...</p>
          </div>
        ) : (
          <>
            <DownloadCloud className="h-10 w-10 text-blue-500 mb-2" />
            <p className="text-blue-600 font-medium">
              Drag & drop documents here, or click to select
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Support for PDF, Word, Excel, and TXT files
            </p>
          </>
        )}
      </div>

      {/* Folder Actions & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search documents..."
            value={filterName}
            onChange={e => setFilterName(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger>
            <SelectValue placeholder="All file types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All file types</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="docx">Word</SelectItem>
            <SelectItem value="xlsx">Excel</SelectItem>
            <SelectItem value="txt">Text</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setNewFolderDialog(true)}>
            <FolderPlus className="h-4 w-4 mr-2" /> New Folder
          </Button>
          <Button variant="outline" className="flex-1" onClick={fetchDocuments}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Folders</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {folders.map(folder => (
              <Card
                key={folder.id}
                className="cursor-pointer hover:bg-gray-50 transition"
                onClick={() => navigateToFolder(folder)}
              >
                <CardContent className="p-4 flex items-center">
                  <Folder className="h-6 w-6 text-blue-500 mr-3" />
                  <div className="truncate">{folder.name}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {documents.length === 0 && !loading ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Folder className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700">No documents found</h3>
          <p className="text-gray-500 mt-1">Upload documents or create folders to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {paginatedDocs.map(doc => (
            <Card key={doc.id} className="overflow-hidden shadow-sm hover:shadow transition">
              <CardContent className="p-0">
                <div className="flex items-center p-4 border-b">
                  {renderFileIcon(doc.name)}
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{doc.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3 bg-gray-50">
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                    <div>
                      <strong>Version:</strong> {doc.version || '1.0'}
                    </div>
                    <div>
                      <strong>Size:</strong> {formatFileSize(doc.size)}
                    </div>
                    <div>
                      <strong>Trial ID:</strong> {doc.metadata?.trialId || 'N/A'}
                    </div>
                    <div>
                      <strong>Molecule:</strong> {doc.metadata?.molecule || 'N/A'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDownload(doc.id)}
                    >
                      <DownloadCloud className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setMovingDoc(doc);
                        setMoveFolderDialog(true);
                      }}
                    >
                      <MoveRight className="h-3.5 w-3.5 mr-1" /> Move
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        if (doc.locked) {
                          handleUnlock(doc.id);
                        } else {
                          handleLock(doc.id);
                        }
                      }}
                    >
                      {doc.locked ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 mr-1" /> Lock
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${doc.name}"?`)) {
                          handleDelete(doc.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredDocs.length > pageSize && (
        <div className="flex justify-center gap-2 my-6">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(page - 1, 1))}
            disabled={page === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <div className="flex items-center px-4">
            <span className="text-sm text-gray-600">
              Page {page} of {Math.ceil(filteredDocs.length / pageSize)}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(filteredDocs.length / pageSize)}
          >
            Next <MoveRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialog} onOpenChange={setNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for your new folder. Folders help you organize your documents.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setNewFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Document Dialog */}
      <Dialog open={moveFolderDialog} onOpenChange={setMoveFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Document</DialogTitle>
            <DialogDescription>
              Select the destination folder for "{movingDoc?.name}"
            </DialogDescription>
          </DialogHeader>
          <Select value={targetFolder} onValueChange={setTargetFolder}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_FOLDER}>Root</SelectItem>
              {folders.map(folder => (
                <SelectItem key={folder.id} value={folder.path}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setMoveFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveDocument}>Move Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto h-full">
            {selectedDoc && (
              <iframe
                src={selectedDoc.viewUrl || `/api/preview/${selectedDoc.id}`}
                className="w-full h-full border-0"
                title={selectedDoc.name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
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
