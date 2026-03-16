import React from 'react';
import { Database, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import NavigationBanner from '../../components/common/NavigationBanner';
import EmbeddedFileBrowser from '../../components/ectd/EmbeddedFileBrowser';

/**
 * VAULT Document Browser Page
 *
 * Provides a Windows-style file browser interface for accessing
 * documents stored in the VAULT/Docushare system.
 */
const VaultBrowser = () => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <NavigationBanner
        currentModule="VAULT Document System"
        moduleColor="from-blue-600 to-blue-800"
      />

      {/* Sub-header with quick navigation */}
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database className="h-5 w-5 text-blue-400" />
          <span className="font-medium">VAULT/Docushare Document Browser</span>
        </div>
        <Button variant="outline" className="bg-white hover:bg-blue-50" asChild>
          <Link href="/coauthor">
            <ArrowLeft className="h-4 w-4 mr-2 text-blue-600" />
            <span className="text-blue-600">Back to eCTD CoAuthor</span>
          </Link>
        </Button>
      </div>

      {/* Guidance banner explaining the two-way workflow */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-t border-b border-blue-200">
        <div className="flex items-start">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-blue-800">
              Using the File Explorer with eCTD CoAuthor
            </h3>
            <p className="text-xs text-blue-700 mt-1">
              You can select multiple files and click the "Send to eCTD CoAuthor" button to add
              documents to your eCTD submission. Files will be available in the CoAuthor module
              immediately after transfer.
            </p>
          </div>
        </div>
      </div>

      {/* Main content with full-screen document browser */}
      <div className="flex-1 overflow-hidden">
        <EmbeddedFileBrowser
          onSelectFile={file => {
            // Store this file in localStorage to be available in CoAuthor
            const selectedDocs = JSON.parse(
              localStorage.getItem('ectd_selected_documents') || '[]'
            );

            // Add the file if it's not already in the array
            if (!selectedDocs.some(doc => doc.id === file.id)) {
              selectedDocs.push({
                id: file.id,
                name: file.name,
                path: file.path || `/${file.folder}/${file.name}`,
                type: file.type,
                section: file.section || 'module1',
                source: 'vault',
                dateAdded: new Date().toISOString(),
              });

              localStorage.setItem('ectd_selected_documents', JSON.stringify(selectedDocs));

              // Notify the user that the file is now available in CoAuthor
              alert(`The file "${file.name}" has been opened and added to your eCTD dossier.`);
            }
          }}
          onFileAction={(action, file) => {
            if (action === 'send-to-coauthor') {
              const selectedDocs = JSON.parse(
                localStorage.getItem('ectd_selected_documents') || '[]'
              );

              // Add the file if it's not already in the array
              if (!selectedDocs.some(doc => doc.id === file.id)) {
                selectedDocs.push({
                  id: file.id,
                  name: file.name,
                  path: file.path || `/${file.folder}/${file.name}`,
                  type: file.type,
                  section: file.section || 'module1',
                  source: 'vault',
                  dateAdded: new Date().toISOString(),
                });

                localStorage.setItem('ectd_selected_documents', JSON.stringify(selectedDocs));
              }
            }
          }}
        />
      </div>
    </div>
  );
};

export default VaultBrowser;
