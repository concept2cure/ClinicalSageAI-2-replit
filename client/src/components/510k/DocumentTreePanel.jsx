import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/toaster';
import {
  FolderOpen, File, ChevronRight, ChevronDown, FilePlus, FolderPlus, Download, FileText, X, Search, FolderTree, AlertCircle, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from 'lucide-react'
import { Input } from '@/components/ui/input';
import docuShareService from '@/services/DocuShareService';

/**
 * Document Tree Panel
 *
 * A sliding panel that displays a hierarchical tree of documents in the vault.
 */
const DocumentTreePanel = ({ isOpen, onClose, documentId }) => {
  const [expandedFolders, setExpandedFolders] = useState({
    'folder-1': true, // Start with the first folder expanded
    'folder-2': false,
    'folder-3': false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // Simple hardcoded document structure for the file tree
  const vaultFiles = [
    {
      id: 'folder-1',
      name: '510(k) Submission',
      type: 'folder',
      children: [
        { id: 'doc-1-1', name: 'Device Description.pdf', type: 'document', format: 'pdf' },
        { id: 'doc-1-2', name: 'Intended Use.docx', type: 'document', format: 'docx' },
        { id: 'doc-1-3', name: 'Test Results.pdf', type: 'document', format: 'pdf' },
      ],
    },
    {
      id: 'folder-2',
      name: 'Predicate Devices',
      type: 'folder',
      children: [
        { id: 'doc-2-1', name: 'Predicate A.pdf', type: 'document', format: 'pdf' },
        { id: 'doc-2-2', name: 'Predicate B.pdf', type: 'document', format: 'pdf' },
        { id: 'doc-2-3', name: 'Comparison Table.xlsx', type: 'document', format: 'xlsx' },
      ],
    },
    {
      id: 'folder-3',
      name: 'Regulatory Documents',
      type: 'folder',
      children: [
        { id: 'doc-3-1', name: 'FDA Guidelines.pdf', type: 'document', format: 'pdf' },
        { id: 'doc-3-2', name: 'Submission Checklist.docx', type: 'document', format: 'docx' },
      ],
    },
  ];

  // Toggle a folder's expanded state
  const toggleFolder = folderId => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // Handle document click
  const handleDocumentClick = document => {
    toast({
      title: 'Document Selected',
      description: `Opening ${document.name}`,
      variant: 'default',
    });
  };

  // Render a document icon based on format
  const renderDocumentIcon = format => {
    switch (format) {
      case 'pdf':
        return <FileText size={16} className="text-red-500" />;
      case 'docx':
        return <FileText size={16} className="text-blue-500" />;
      case 'xlsx':
        return <FileText size={16} className="text-green-500" />;
      default:
        return <File size={16} className="text-gray-500" />;
    }
  };

  // Render a document item (document or folder)
  const renderDocumentItem = (doc, depth = 0) => {
    const isFolder = doc.type === 'folder';
    const isExpanded = expandedFolders[doc.id];

    return (
      <div key={doc.id} className="document-tree-item">
        <div
          className={`flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-gray-100 ${
            depth > 0 ? 'ml-' + depth * 4 : ''
          }`}
          onClick={() => (isFolder ? toggleFolder(doc.id) : handleDocumentClick(doc))}
        >
          {isFolder ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 mr-1 p-0"
              onClick={e => {
                e.stopPropagation();
                toggleFolder(doc.id);
              }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </Button>
          ) : (
            <span className="ml-7 mr-1">{renderDocumentIcon(doc.format)}</span>
          )}

          {isFolder ? <FolderOpen size={16} className="text-yellow-500 mr-1.5" /> : null}

          <span className="text-sm truncate flex-grow">{doc.name}</span>

          {isFolder && (
            <span className="text-xs text-gray-500 ml-1">({doc.children?.length || 0})</span>
          )}
        </div>

        {isFolder && isExpanded && doc.children && (
          <div className="mt-1">
            {doc.children.map(child => renderDocumentItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  console.log('DocumentTreePanel rendering with isOpen:', isOpen);

  // Always display this debug info in dev
  useEffect(() => {
    console.log('DocumentTreePanel mounted with isOpen:', isOpen);

    // Cleanup
    return () => {
      console.log('DocumentTreePanel unmounted');
    };
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-y-0 right-0 w-[350px] bg-white border-l shadow-xl z-[100] transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center">
            <FolderTree className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="font-semibold text-lg">Document Vault</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {/* Search Box */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="Search files..." className="pl-8" />
          </div>
        </div>

        {/* File Tree */}
        <div className="flex-grow overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-3">{vaultFiles.map(file => renderDocumentItem(file))}</div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 flex justify-between">
          <Button variant="outline" size="sm" className="text-xs">
            <FolderPlus size={14} className="mr-1" />
            New Folder
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <FilePlus size={14} className="mr-1" />
            Upload File
          </Button>
        </div>
      </div>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center">
            <FolderTree className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="font-semibold text-lg">Document Vault</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X size={18} />
          </Button>
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9"
                onClick={() => setSearchTerm('')}
              >
                <X size={14} />
              </Button>
            )}
          </div>
        </div>

        <div className="flex-grow overflow-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p>Loading documents...</p>
            </div>
          ) : filteredDocuments.length > 0 ? (
            <ScrollArea className="h-full">
              <div className="p-2">{filteredDocuments.map(doc => renderDocumentItem(doc))}</div>
            </ScrollArea>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>No documents found</p>
              {searchTerm && <p className="text-sm mt-1">Try adjusting your search terms</p>}
            </div>
          )}
        </div>

        <div className="p-3 border-t flex justify-between">
          <Button variant="outline" size="sm">
            <FolderPlus size={14} className="mr-1" />
            New Folder
          </Button>
          <Button variant="outline" size="sm">
            <FilePlus size={14} className="mr-1" />
            Upload
          </Button>
        </div>
      </div>

      {/* Document Preview Dialog */}
      <Dialog open={showDocumentPreview} onOpenChange={setShowDocumentPreview}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedDocument?.name}</DialogTitle>
            <DialogDescription>Document preview</DialogDescription>
          </DialogHeader>

          <div className="border rounded-md p-4 text-center my-4">
            {selectedDocument?.format === 'pdf' ? (
              <div className="text-center">
                <FileText size={48} className="text-red-500 mx-auto mb-2" />
                <p className="text-gray-700 mb-2">PDF Document Preview</p>
                <p className="text-sm text-gray-500">
                  PDF preview is not available in this version.
                </p>
              </div>
            ) : selectedDocument?.format === 'docx' ? (
              <div className="text-center">
                <FileText size={48} className="text-blue-500 mx-auto mb-2" />
                <p className="text-gray-700 mb-2">Word Document Preview</p>
                <p className="text-sm text-gray-500">
                  Word document preview is not available in this version.
                </p>
              </div>
            ) : (
              <div className="text-center">
                <FileText size={48} className="text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Preview not available</p>
              </div>
            )}
          </div>

          <div className="flex flex-col space-y-2 text-sm mb-2">
            <div className="flex justify-between">
              <span className="text-gray-500">File Type:</span>
              <span className="font-medium">
                {selectedDocument?.format === 'pdf'
                  ? 'PDF Document'
                  : selectedDocument?.format === 'docx'
                    ? 'Word Document'
                    : 'Unknown'}
              </span>
            </div>

            {selectedDocument?.date && (
              <div className="flex justify-between">
                <span className="text-gray-500">Last Modified:</span>
                <span className="font-medium">
                  {new Date(selectedDocument.date).toLocaleString()}
                </span>
              </div>
            )}

            {selectedDocument?.status && (
              <div className="flex justify-between">
                <span className="text-gray-500">Status:</span>
                <span>{renderStatusBadge(selectedDocument.status)}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDocumentPreview(false)}>
              Close
            </Button>
            <Button size="sm">
              <Download size={14} className="mr-1" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentTreePanel;
