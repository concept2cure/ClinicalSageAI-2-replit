import React, { useState } from 'react';
import { Database, ArrowLeft, X, LayoutSidebar, LayoutSidebarClose, CornerUpLeft, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button';
import NavigationBanner from '../components/common/NavigationBanner';
import VaultDocumentBrowser from '../components/ectd/VaultDocumentBrowser';
import DocumentViewer from '../components/ectd/DocumentViewer';

/**
 * Embedded VAULT Document Browser Page
 *
 * Provides an integrated Windows-style file browser with document viewer,
 * allowing seamless workflow between document selection and editing.
 */
const EmbeddedVaultBrowser = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Handle file selection from the browser
  const handleFileSelect = file => {
    // Only select files, not folders
    if (file.type === 'document') {
      setSelectedFile({
        id: file.id,
        title: file.name,
        content: `This is the content of ${file.name}. In a real implementation, this would be fetched from the VAULT/Docushare server.`,
        author: file.user || 'Unknown Author',
        lastEdited: file.lastModified || 'Unknown',
        status: file.status || 'draft',
        version: '1.0',
        sectionCode: file.sectionCode || determineSection(file.id),
      });
    }
  };

  // Helper to determine section code based on file ID
  const determineSection = fileId => {
    if (fileId.includes('doc-1-')) return '1.0';
    if (fileId.includes('doc-2-')) return '2.0';
    if (fileId.includes('doc-3-')) return '3.0';
    if (fileId.includes('doc-4-')) return '4.0';
    if (fileId.includes('doc-5-')) return '5.0';
    return 'Unknown';
  };

  // Handle file actions (download, share, etc.)
  const handleFileAction = (action, file) => {
    console.log(`Action ${action} performed on`, file);

    // Example implementation of common actions
    switch (action) {
      case 'open':
        handleFileSelect(file);
        break;
      case 'download':
        // Simulate download
        setTimeout(() => {
          alert(`Downloaded ${file.name}`);
        }, 1000);
        break;
      case 'edit':
        handleFileSelect(file);
        break;
      default:
        console.log('Action not implemented:', action);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top Navigation Banner */}
      <NavigationBanner
        currentModule="VAULT Document System"
        moduleColor="from-blue-600 to-blue-800"
      />

      {/* File browser header */}
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database className="h-5 w-5 text-blue-400" />
          <span className="font-medium">VAULT/Docushare Windows-Style Browser</span>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-blue-700"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? (
              <LayoutSidebarClose className="h-4 w-4 mr-1" />
            ) : (
              <LayoutSidebar className="h-4 w-4 mr-1" />
            )}
            {showSidebar ? 'Hide Folders' : 'Show Folders'}
          </Button>
          <Button
            variant="outline"
            className="bg-white hover:bg-blue-50"
            onClick={() => (window.location.href = '/coauthor')}
          >
            <CornerUpLeft className="h-4 w-4 mr-2 text-blue-600" />
            <span className="text-blue-600">Return to eCTD CoAuthor</span>
          </Button>
        </div>
      </div>

      {/* Main content area with file browser and document viewer */}
      <div className="flex flex-1 overflow-hidden">
        {/* File browser sidebar */}
        {showSidebar && (
          <div className="w-96 border-r relative flex flex-col">
            <div className="flex-1 overflow-auto">
              <VaultDocumentBrowser
                onSelectFile={handleFileSelect}
                onFileAction={handleFileAction}
              />
            </div>
          </div>
        )}

        {/* Document viewer area */}
        <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
          {selectedFile ? (
            <div className="w-full h-full">
              <DocumentViewer document={selectedFile} onClose={() => setSelectedFile(null)} />
            </div>
          ) : (
            <div className="text-center p-10">
              <Database className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">No Document Selected</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Select a document from the file browser on the left to view and edit its contents.
                You can navigate through the eCTD folder structure to find your documents.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t px-4 py-1 bg-gray-100 text-xs text-gray-600 flex justify-between">
        <div>
          {selectedFile
            ? `Selected: ${selectedFile.title} (${selectedFile.sectionCode})`
            : 'No document selected'}
        </div>
        <div>VAULT Connection: Active</div>
      </div>
    </div>
  );
};

export default EmbeddedVaultBrowser;
