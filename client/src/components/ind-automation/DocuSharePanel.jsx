import React, { useState, useEffect } from 'react';
import {
  Folder,
  File,
  FileText,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Plus,
  Grid,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';

/**
 * DocuSharePanel - Desktop-like document management interface
 *
 * A sophisticated document management interface for the IND Module
 * that resembles traditional desktop software rather than a web page.
 */
export default function DocuSharePanel() {
  const [view, setView] = useState('grid');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFolder, setCurrentFolder] = useState('/IND');
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'IND', path: '/IND' }]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [folderDialog, setFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Sample document structure - Replace with API call when credentials are available
  const [documents, setDocuments] = useState([
    {
      id: 'folder-1',
      type: 'folder',
      name: 'Module 1',
      path: '/IND/Module 1',
      items: 5,
      lastModified: '2025-04-20T14:30:00Z',
    },
    {
      id: 'folder-2',
      type: 'folder',
      name: 'Module 2',
      path: '/IND/Module 2',
      items: 3,
      lastModified: '2025-04-22T09:15:00Z',
    },
    {
      id: 'folder-3',
      type: 'folder',
      name: 'Module 3',
      path: '/IND/Module 3',
      items: 8,
      lastModified: '2025-04-21T16:45:00Z',
    },
    {
      id: 'folder-4',
      type: 'folder',
      name: 'Module 4',
      path: '/IND/Module 4',
      items: 2,
      lastModified: '2025-04-23T11:20:00Z',
    },
    {
      id: 'folder-5',
      type: 'folder',
      name: 'Module 5',
      path: '/IND/Module 5',
      items: 6,
      lastModified: '2025-04-19T15:10:00Z',
    },
    {
      id: 'doc-1',
      type: 'document',
      name: 'IND Application Cover Letter.pdf',
      size: '285KB',
      lastModified: '2025-04-24T10:45:00Z',
      status: 'approved',
      creator: 'Sarah Johnson',
    },
    {
      id: 'doc-2',
      type: 'document',
      name: 'Form FDA 1571.pdf',
      size: '420KB',
      lastModified: '2025-04-25T09:30:00Z',
      status: 'pending',
      creator: 'David Lee',
    },
    {
      id: 'doc-3',
      type: 'document',
      name: 'Study Protocol.pdf',
      size: '3.2MB',
      lastModified: '2025-04-23T14:15:00Z',
      status: 'approved',
      creator: 'Michael Chen',
    },
  ]);

  useEffect(() => {
    // Simulate loading documents from DocuShare
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [currentFolder]);

  // Filter documents based on search term
  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

    // In a real implementation, this would fetch documents from the API
    setTimeout(() => setLoading(false), 800);
  };

  const handleFileSelection = doc => {
    if (selectedFiles.includes(doc.id)) {
      setSelectedFiles(selectedFiles.filter(id => id !== doc.id));
    } else {
      setSelectedFiles([...selectedFiles, doc.id]);
    }
  };

  const handleUpload = () => {
    // Simulate file upload
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploadDialog(false);
          toast({
            title: 'Upload Complete',
            description: 'Files have been successfully uploaded to DocuShare',
          });
          return 0;
        }
        return prev + 10;
      });
    }, 300);
  };

  const createNewFolder = () => {
    if (!newFolderName.trim()) {
      toast({
        title: 'Error',
        description: 'Folder name cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    // In a real implementation, this would make an API call
    setFolderDialog(false);
    toast({
      title: 'Folder Created',
      description: `Folder "${newFolderName}" has been created`,
    });
    setNewFolderName('');
  };

  const getStatusBadge = status => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-600">Approved</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">Pending Review</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500">Rejected</Badge>;
      default:
        return null;
    }
  };

  const refreshDocuments = () => {
    setLoading(true);
    // In a real implementation, this would fetch documents from DocuShare
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className="flex flex-col h-full bg-background border rounded-md shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={refreshDocuments}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 border-r mx-1"></div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setUploadDialog(true)}>
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Upload Files</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" disabled={selectedFiles.length === 0}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Selected</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" disabled={selectedFiles.length === 0}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Selected</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-5 border-r mx-1"></div>

          <DialogTrigger asChild onClick={() => setFolderDialog(true)}>
            <Button variant="ghost" size="sm" className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              <span>New Folder</span>
            </Button>
          </DialogTrigger>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 w-60 h-8"
            />
          </div>

          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('grid')}
              className="rounded-none px-2"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('list')}
              className="rounded-none px-2"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center px-4 py-2 bg-background border-b text-sm">
        <div className="flex items-center space-x-1">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && <span className="text-muted-foreground mx-1">/</span>}
              <button
                className="hover:underline text-primary"
                onClick={() => navigateToFolder(crumb)}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-muted-foreground">Loading documents...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FileText className="h-16 w-16 mb-4" />
            <p className="text-lg">No documents found</p>
            <p className="text-sm">Upload a new document or change your search criteria</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredDocuments.map(doc => (
              <div
                key={doc.id}
                className={`
                  p-4 border rounded-lg cursor-pointer transition-all
                  ${selectedFiles.includes(doc.id) ? 'bg-primary/10 border-primary' : 'hover:bg-accent'}
                `}
                onClick={() =>
                  doc.type === 'folder' ? navigateToFolder(doc) : handleFileSelection(doc)
                }
              >
                <div className="flex items-start">
                  {doc.type === 'folder' ? (
                    <Folder className="h-10 w-10 text-blue-500" />
                  ) : (
                    <File className="h-10 w-10 text-primary" />
                  )}

                  <div className="ml-3 flex-1">
                    <div className="font-medium truncate" title={doc.name}>
                      {doc.name}
                    </div>

                    {doc.type === 'folder' ? (
                      <div className="text-sm text-muted-foreground">{doc.items} items</div>
                    ) : (
                      <>
                        <div className="text-sm text-muted-foreground">
                          {doc.size} • {new Date(doc.lastModified).toLocaleDateString()}
                        </div>
                        <div className="mt-2">{getStatusBadge(doc.status)}</div>
                      </>
                    )}
                  </div>

                  {doc.type !== 'folder' && (
                    <Checkbox
                      checked={selectedFiles.includes(doc.id)}
                      onCheckedChange={() => handleFileSelection(doc)}
                      onClick={e => e.stopPropagation()}
                      className="ml-2 mt-1"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-8 px-4 py-2 text-left">
                    <Checkbox />
                  </th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Size</th>
                  <th className="px-4 py-2 text-left">Modified</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Creator</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredDocuments.map(doc => (
                  <tr
                    key={doc.id}
                    className={`
                      cursor-pointer transition-colors
                      ${selectedFiles.includes(doc.id) ? 'bg-primary/10' : 'hover:bg-accent'}
                    `}
                    onClick={() =>
                      doc.type === 'folder' ? navigateToFolder(doc) : handleFileSelection(doc)
                    }
                  >
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={selectedFiles.includes(doc.id)}
                        onCheckedChange={() => handleFileSelection(doc)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center">
                        {doc.type === 'folder' ? (
                          <Folder className="h-5 w-5 mr-2 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 mr-2 text-primary" />
                        )}
                        <span>{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {doc.type === 'folder' ? `${doc.items} items` : doc.size}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(doc.lastModified).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      {doc.type !== 'folder' && getStatusBadge(doc.status)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{doc.creator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t px-4 py-2 text-sm text-muted-foreground bg-muted/30 flex justify-between">
        <div>
          {filteredDocuments.length} items • {selectedFiles.length} selected
        </div>
        <div>DocuShare Connected • Last sync: {new Date().toLocaleTimeString()}</div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files to DocuShare</DialogTitle>
            <DialogDescription>
              Select files to upload to the current folder: {currentFolder}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-2">Drop files here or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">
                PDF, Word, Excel, PowerPoint, and image files are supported
              </p>
            </div>

            {uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <ProgressBar value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for the new folder in {currentFolder}
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createNewFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
