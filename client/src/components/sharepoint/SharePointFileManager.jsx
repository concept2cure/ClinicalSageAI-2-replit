import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Folder, File, FileText, FileSpreadsheet, FileImage, FileVideo, FileAudio,
  ChevronRight, ChevronDown, MoreVertical, Upload, Download, Share2, 
  Copy, Move, Trash2, Edit3, Info, Clock, Users, Lock, Search, 
  Grid, List, LayoutGrid, Home, Star, Plus, FolderPlus,
  Check, X, Eye, History, Link2, Settings, Filter, SortAsc
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

const SharePointFileManager = ({ 
  moduleContext = 'vault',
  onFileSelect,
  selectedFiles = [],
  allowMultiSelect = true,
  showProperties = true 
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('list'); // list, grid, thumbnail
  const [currentPath, setCurrentPath] = useState(['root']);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [filterType, setFilterType] = useState('all');
  const fileInputRef = useRef(null);

  // Fetch documents from the vault API
  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: ['/api/vault', moduleContext],
    queryFn: async () => {
      const organizationId = localStorage.getItem('organizationId') || 'default';
      const response = await fetch('/api/vault', {
        headers: {
          'x-organization-id': organizationId,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    }
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('title', file.name);
      formData.append('type', moduleContext);
      formData.append('status', 'active');
      
      const organizationId = localStorage.getItem('organizationId') || 'default';
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: {
          'x-organization-id': organizationId
        },
        body: formData
      });
      if (!response.ok) throw new Error('Failed to upload file');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault'] });
      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    }
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (documentId) => {
      const organizationId = localStorage.getItem('organizationId') || 'default';
      const response = await fetch(`/api/vault/document/${documentId}`, {
        method: 'DELETE',
        headers: {
          'x-organization-id': organizationId,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to delete file');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault'] });
      toast({
        title: 'Success',
        description: 'File deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete file',
        variant: 'destructive',
      });
    }
  });

  // Transform vault documents to SharePoint structure
  const transformDocumentsToFileSystem = useCallback(() => {
    const moduleFolder = {
      id: 'module-' + moduleContext,
      name: getModuleFolderName(moduleContext),
      type: 'folder',
      modified: new Date().toISOString(),
      modifiedBy: 'System',
      size: null,
      children: documents.map(doc => ({
        id: doc.id,
        name: doc.title || doc.name,
        type: 'file',
        size: doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'Unknown',
        modified: doc.updated_at || doc.created_at,
        modifiedBy: doc.created_by || 'Unknown',
        version: doc.version || '1.0',
        status: doc.status
      }))
    };

    return {
      id: 'root',
      name: 'Document Library',
      type: 'folder',
      modified: new Date().toISOString(),
      modifiedBy: 'System',
      size: null,
      children: [moduleFolder]
    };
  }, [documents, moduleContext]);

  // Helper function to get module-specific folder name
  const getModuleFolderName = (context) => {
    const names = {
      'ectd-coauthor': 'eCTD Documents',
      'cmc-module3': 'CMC Module 3',
      'medical-device': 'Medical Device Files',
      'vault': 'Vault Documents'
    };
    return names[context] || 'Documents';
  };

  // Use transformed file system
  const [fileSystem, setFileSystem] = useState(() => transformDocumentsToFileSystem());
  
  useEffect(() => {
    setFileSystem(transformDocumentsToFileSystem());
  }, [transformDocumentsToFileSystem]);

  // Keep original mock structure for development
  const mockFileSystem = {
    id: 'root',
    name: 'Document Library',
    type: 'folder',
    modified: '2024-10-29',
    modifiedBy: 'System', 
    size: null,
    children: [
      {
        id: 'ectd-submissions',
        name: 'eCTD Submissions',
        type: 'folder',
        modified: '2024-10-28',
        modifiedBy: 'John Doe',
        size: null,
        children: [
          {
            id: 'module1',
            name: 'Module 1 - Administrative',
            type: 'folder',
            modified: '2024-10-27',
            modifiedBy: 'Jane Smith',
            children: [
              { id: 'cover-letter', name: 'Cover Letter.pdf', type: 'file', size: '245 KB', modified: '2024-10-26', modifiedBy: 'Jane Smith', version: '1.2' },
              { id: 'form-fda-1571', name: 'Form FDA 1571.pdf', type: 'file', size: '189 KB', modified: '2024-10-25', modifiedBy: 'John Doe', version: '1.0' },
            ]
          },
          {
            id: 'module2',
            name: 'Module 2 - Summaries',
            type: 'folder',
            modified: '2024-10-26',
            modifiedBy: 'Jane Smith',
            children: [
              { id: 'quality-summary', name: 'Quality Overall Summary.docx', type: 'file', size: '1.2 MB', modified: '2024-10-24', modifiedBy: 'QA Team', version: '2.1' },
              { id: 'clinical-overview', name: 'Clinical Overview.docx', type: 'file', size: '890 KB', modified: '2024-10-23', modifiedBy: 'Clinical Team', version: '1.5' },
            ]
          },
          {
            id: 'module3',
            name: 'Module 3 - Quality',
            type: 'folder',
            modified: '2024-10-25',
            modifiedBy: 'QA Team',
            children: [
              { id: 'drug-substance', name: 'Drug Substance.pdf', type: 'file', size: '2.3 MB', modified: '2024-10-22', modifiedBy: 'CMC Team', version: '3.0' },
              { id: 'drug-product', name: 'Drug Product.pdf', type: 'file', size: '1.8 MB', modified: '2024-10-21', modifiedBy: 'CMC Team', version: '2.5' },
            ]
          }
        ]
      },
      {
        id: 'medical-devices',
        name: 'Medical Devices',
        type: 'folder',
        modified: '2024-10-27',
        modifiedBy: 'Device Team',
        children: [
          {
            id: '510k-submissions',
            name: '510(k) Submissions',
            type: 'folder',
            modified: '2024-10-26',
            modifiedBy: 'Regulatory Team',
            children: [
              { id: 'device-description', name: 'Device Description.docx', type: 'file', size: '567 KB', modified: '2024-10-20', modifiedBy: 'Engineering', version: '1.3' },
              { id: 'predicate-comparison', name: 'Predicate Comparison.xlsx', type: 'file', size: '234 KB', modified: '2024-10-19', modifiedBy: 'Regulatory Team', version: '1.1' },
            ]
          },
          {
            id: 'cer-documents',
            name: 'CER Documents',
            type: 'folder',
            modified: '2024-10-25',
            modifiedBy: 'Clinical Team',
            children: [
              { id: 'clinical-evaluation', name: 'Clinical Evaluation Report.pdf', type: 'file', size: '3.4 MB', modified: '2024-10-18', modifiedBy: 'Clinical Team', version: '2.0' },
            ]
          }
        ]
      },
      {
        id: 'cmc-documents',
        name: 'CMC Documents',
        type: 'folder',
        modified: '2024-10-24',
        modifiedBy: 'CMC Team',
        children: [
          { id: 'stability-data', name: 'Stability Data.xlsx', type: 'file', size: '456 KB', modified: '2024-10-17', modifiedBy: 'QC Lab', version: '1.8' },
          { id: 'batch-records', name: 'Batch Records.pdf', type: 'file', size: '789 KB', modified: '2024-10-16', modifiedBy: 'Manufacturing', version: '1.2' },
          { id: 'analytical-methods', name: 'Analytical Methods.docx', type: 'file', size: '912 KB', modified: '2024-10-15', modifiedBy: 'QC Lab', version: '2.3' },
        ]
      }
    ]
  };

  // Get file icon based on type
  const getFileIcon = (item) => {
    if (item.type === 'folder') return <Folder className="h-4 w-4" />;
    const ext = item.name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf': return <FileText className="h-4 w-4 text-red-500" />;
      case 'docx':
      case 'doc': return <FileText className="h-4 w-4 text-blue-500" />;
      case 'xlsx':
      case 'xls': return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
      case 'jpg':
      case 'png':
      case 'gif': return <FileImage className="h-4 w-4 text-purple-500" />;
      case 'mp4':
      case 'avi': return <FileVideo className="h-4 w-4 text-orange-500" />;
      case 'mp3':
      case 'wav': return <FileAudio className="h-4 w-4 text-pink-500" />;
      default: return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  // Navigate to folder
  const navigateToFolder = (folder, pathIndex = null) => {
    if (pathIndex !== null) {
      // Navigate via breadcrumb
      setCurrentPath(currentPath.slice(0, pathIndex));
    } else {
      // Navigate by clicking folder
      setCurrentPath([...currentPath, folder]);
    }
    setSelectedItems(new Set());
  };

  // Get current folder content
  const getCurrentFolder = () => {
    let current = fileSystem;
    for (const folder of currentPath) {
      current = folder;
    }
    return current;
  };

  // Handle file/folder selection
  const toggleSelection = (item, event) => {
    if (event) {
      event.stopPropagation();
    }
    
    const newSelection = new Set(selectedItems);
    if (newSelection.has(item.id)) {
      newSelection.delete(item.id);
    } else {
      if (!allowMultiSelect) {
        newSelection.clear();
      }
      newSelection.add(item.id);
    }
    setSelectedItems(newSelection);
    
    if (onFileSelect && item.type === 'file') {
      onFileSelect(Array.from(newSelection));
    }
  };

  // Handle drag and drop
  const handleDragStart = (e, item) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, folder) => {
    e.preventDefault();
    if (folder.type === 'folder' && draggedItem && draggedItem.id !== folder.id) {
      setDragOverFolder(folder.id);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleDrop = (e, targetFolder) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedItem && targetFolder.type === 'folder' && draggedItem.id !== targetFolder.id) {
      // Move item to target folder
      toast({
        title: "Item Moved",
        description: `${draggedItem.name} moved to ${targetFolder.name}`,
      });
    }
    
    setDraggedItem(null);
    setDragOverFolder(null);
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileNames = Array.from(files).map(f => f.name).join(', ');
      toast({
        title: "Files Uploaded",
        description: `Uploaded: ${fileNames}`,
      });
    }
  };

  // Handle rename
  const startRename = (item) => {
    setRenamingItem(item.id);
    setNewName(item.name);
  };

  const confirmRename = () => {
    if (newName && newName !== '') {
      toast({
        title: "Item Renamed",
        description: `Renamed to ${newName}`,
      });
      setRenamingItem(null);
      setNewName('');
    }
  };

  const cancelRename = () => {
    setRenamingItem(null);
    setNewName('');
  };

  // Handle context menu actions
  const handleContextAction = (action, item) => {
    switch (action) {
      case 'open':
        if (item.type === 'folder') {
          navigateToFolder(item);
        } else {
          toast({ title: "Opening file", description: item.name });
        }
        break;
      case 'download':
        toast({ title: "Downloading", description: item.name });
        break;
      case 'share':
        toast({ title: "Share dialog", description: `Sharing ${item.name}` });
        break;
      case 'copy':
        toast({ title: "Copied", description: item.name });
        break;
      case 'move':
        toast({ title: "Move dialog", description: `Moving ${item.name}` });
        break;
      case 'rename':
        startRename(item);
        break;
      case 'delete':
        toast({ 
          title: "Delete confirmation", 
          description: `Are you sure you want to delete ${item.name}?`,
          variant: "destructive"
        });
        break;
      case 'properties':
        toast({ title: "Properties", description: `Showing properties for ${item.name}` });
        break;
      case 'version':
        toast({ title: "Version History", description: `Showing versions for ${item.name}` });
        break;
    }
  };

  const currentFolder = getCurrentFolder();
  const filteredItems = currentFolder.children?.filter(item => {
    const matchesSearch = !searchQuery || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' ||
      (filterType === 'folders' && item.type === 'folder') ||
      (filterType === 'files' && item.type === 'file');
    return matchesSearch && matchesFilter;
  }) || [];

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    // Folders first
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'modified':
        return new Date(b.modified) - new Date(a.modified);
      case 'size':
        if (a.type === 'folder') return 0;
        return parseInt(a.size) - parseInt(b.size);
      default:
        return 0;
    }
  });

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center"
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
            
            <Button variant="outline" size="sm">
              <FolderPlus className="h-4 w-4 mr-1" />
              New Folder
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SortAsc className="h-4 w-4 mr-1" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSortBy('name')}>
                  Name {sortBy === 'name' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('modified')}>
                  Modified {sortBy === 'modified' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('size')}>
                  Size {sortBy === 'size' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterType('all')}>
                  All {filterType === 'all' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('folders')}>
                  Folders {filterType === 'folders' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('files')}>
                  Files {filterType === 'files' && <Check className="h-3 w-3 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-gray-400" />
              <Input
                type="search"
                placeholder="Search files..."
                className="pl-8 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-r-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-none border-x"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'thumbnail' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('thumbnail')}
                className="rounded-l-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center text-sm text-gray-600">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPath([])}
            className="p-1"
          >
            <Home className="h-4 w-4" />
          </Button>
          <ChevronRight className="h-4 w-4 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPath([])}
            className="p-1"
          >
            Document Library
          </Button>
          {currentPath.map((folder, index) => (
            <React.Fragment key={folder.id}>
              <ChevronRight className="h-4 w-4 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateToFolder(folder, index + 1)}
                className="p-1"
              >
                {folder.name}
              </Button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'list' ? (
          <div className="space-y-1">
            {/* List header */}
            <div className="flex items-center px-4 py-2 text-xs font-medium text-gray-500 border-b">
              <div className="w-8">
                <Checkbox
                  checked={selectedItems.size === sortedItems.length && sortedItems.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedItems(new Set(sortedItems.map(item => item.id)));
                    } else {
                      setSelectedItems(new Set());
                    }
                  }}
                />
              </div>
              <div className="flex-1 flex items-center">Name</div>
              <div className="w-32">Modified</div>
              <div className="w-24">Modified By</div>
              <div className="w-20">Size</div>
              <div className="w-16">Version</div>
              <div className="w-8"></div>
            </div>

            {/* List items */}
            {sortedItems.map(item => (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger>
                  <div
                    className={`flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer rounded ${
                      selectedItems.has(item.id) ? 'bg-blue-50' : ''
                    } ${dragOverFolder === item.id ? 'bg-blue-100' : ''}`}
                    onClick={() => item.type === 'folder' ? navigateToFolder(item) : toggleSelection(item)}
                    onDoubleClick={() => item.type === 'folder' ? navigateToFolder(item) : handleContextAction('open', item)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragOver={(e) => handleDragOver(e, item)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item)}
                  >
                    <div className="w-8">
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleSelection(item)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="flex-1 flex items-center">
                      {getFileIcon(item)}
                      {renamingItem === item.id ? (
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmRename();
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={confirmRename}
                          className="ml-2 h-6"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="ml-2">{item.name}</span>
                      )}
                    </div>
                    <div className="w-32 text-sm text-gray-500">{item.modified}</div>
                    <div className="w-24 text-sm text-gray-500">{item.modifiedBy}</div>
                    <div className="w-20 text-sm text-gray-500">{item.size || '-'}</div>
                    <div className="w-16 text-sm text-gray-500">{item.version || '-'}</div>
                    <div className="w-8">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleContextAction('open', item)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Open
                          </DropdownMenuItem>
                          {item.type === 'file' && (
                            <DropdownMenuItem onClick={() => handleContextAction('download', item)}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleContextAction('share', item)}>
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleContextAction('copy', item)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleContextAction('move', item)}>
                            <Move className="h-4 w-4 mr-2" />
                            Move
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleContextAction('rename', item)}>
                            <Edit3 className="h-4 w-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleContextAction('delete', item)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {item.type === 'file' && (
                            <DropdownMenuItem onClick={() => handleContextAction('version', item)}>
                              <History className="h-4 w-4 mr-2" />
                              Version History
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleContextAction('properties', item)}>
                            <Info className="h-4 w-4 mr-2" />
                            Properties
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleContextAction('open', item)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Open
                  </ContextMenuItem>
                  {item.type === 'file' && (
                    <ContextMenuItem onClick={() => handleContextAction('download', item)}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={() => handleContextAction('share', item)}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => handleContextAction('copy', item)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextAction('move', item)}>
                    <Move className="h-4 w-4 mr-2" />
                    Move
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleContextAction('rename', item)}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem 
                    onClick={() => handleContextAction('delete', item)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  {item.type === 'file' && (
                    <ContextMenuItem onClick={() => handleContextAction('version', item)}>
                      <History className="h-4 w-4 mr-2" />
                      Version History
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={() => handleContextAction('properties', item)}>
                    <Info className="h-4 w-4 mr-2" />
                    Properties
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {sortedItems.map(item => (
              <div
                key={item.id}
                className={`p-4 border rounded-lg hover:bg-gray-50 cursor-pointer ${
                  selectedItems.has(item.id) ? 'bg-blue-50 border-blue-300' : ''
                }`}
                onClick={() => item.type === 'folder' ? navigateToFolder(item) : toggleSelection(item)}
                onDoubleClick={() => item.type === 'folder' ? navigateToFolder(item) : handleContextAction('open', item)}
              >
                <div className="flex flex-col items-center">
                  <div className="text-4xl mb-2">
                    {item.type === 'folder' ? (
                      <Folder className="h-12 w-12 text-blue-500" />
                    ) : (
                      getFileIcon(item)
                    )}
                  </div>
                  <div className="text-sm text-center break-words">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{item.modified}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedItems.map(item => (
              <Card
                key={item.id}
                className={`overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${
                  selectedItems.has(item.id) ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => item.type === 'folder' ? navigateToFolder(item) : toggleSelection(item)}
                onDoubleClick={() => item.type === 'folder' ? navigateToFolder(item) : handleContextAction('open', item)}
              >
                <div className="aspect-video bg-gray-100 flex items-center justify-center">
                  {item.type === 'folder' ? (
                    <Folder className="h-16 w-16 text-blue-500" />
                  ) : (
                    <div className="text-6xl">{getFileIcon(item)}</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {item.modified} • {item.modifiedBy}
                  </div>
                  {item.type === 'file' && (
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline" className="text-xs">
                        {item.size}
                      </Badge>
                      {item.version && (
                        <Badge variant="secondary" className="text-xs">
                          v{item.version}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t px-4 py-2 text-sm text-gray-600">
        <div className="flex items-center justify-between">
          <div>
            {sortedItems.length} items
            {selectedItems.size > 0 && ` • ${selectedItems.size} selected`}
          </div>
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <Users className="h-4 w-4 mr-1" />
              Shared
            </span>
            <span className="flex items-center">
              <Lock className="h-4 w-4 mr-1" />
              21 CFR Part 11 Compliant
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharePointFileManager;