import React from 'react';
import { Button } from '@/components/ui/button';
import { X, FolderTree, FolderOpen } from 'lucide-react'

/**
 * A very basic document panel with minimal dependencies
 */
const BasicDocumentPanel = ({ isOpen, onClose }) => {
  // Basic document structure
  const documents = [
    { id: 1, name: 'Device Description.pdf', type: 'file' },
    { id: 2, name: 'Substantial Equivalence.docx', type: 'file' },
    { id: 3, name: 'Test Reports', type: 'folder' },
    { id: 4, name: 'FDA Guidance', type: 'folder' },
    { id: 5, name: 'Predicate Devices', type: 'folder' },
    { id: 6, name: '510(k) Submission.pdf', type: 'file' },
  ];

  return (
    <div
      className={`fixed top-0 left-0 h-full w-[350px] bg-white border-r shadow-xl z-50 transform transition-transform ${
        isOpen ? 'translate-x-0' : 'translate-x-[-100%]'
      }`}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center">
            <FolderTree className="w-5 h-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold">Document Vault</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <ul className="space-y-2">
            {documents.map(doc => (
              <li
                key={doc.id}
                className="flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer"
              >
                {doc.type === 'folder' ? (
                  <FolderOpen className="w-4 h-4 text-yellow-500 mr-2" />
                ) : (
                  <div className="w-4 h-4 bg-gray-200 mr-2"></div>
                )}
                <span>{doc.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BasicDocumentPanel;
