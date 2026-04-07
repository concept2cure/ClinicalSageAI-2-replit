import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Folder, File, CheckCircle, Upload } from 'lucide-react';

const EmbeddedFileBrowser = ({ onFileSelect, selectedFiles = [] }) => {
  const [files, setFiles] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set(['m1', 'm2', 'm3', 'm4', 'm5']));

  // Mock eCTD structure with comprehensive Module organization
  const ectdStructure = {
    m1: {
      name: 'Module 1 - Administrative Information',
      files: [
        { id: 'file-m1-1', name: 'Cover Letter', type: 'pdf', required: true },
        { id: 'file-m1-2', name: 'Comprehensive Table of Contents', type: 'pdf', required: true },
        { id: 'file-m1-3', name: 'Application Form', type: 'pdf', required: true },
        { id: 'file-m1-4', name: 'Product Information', type: 'pdf', required: false },
      ],
    },
    m2: {
      name: 'Module 2 - CTD Summaries',
      files: [
        { id: 'file-m2-1', name: 'CTD Table of Contents', type: 'pdf', required: true },
        { id: 'file-m2-2', name: 'CTD Introduction', type: 'pdf', required: true },
        { id: 'file-m2-3', name: 'Quality Overall Summary', type: 'pdf', required: true },
        { id: 'file-m2-4', name: 'Nonclinical Overview', type: 'pdf', required: false },
        { id: 'file-m2-5', name: 'Clinical Overview', type: 'pdf', required: true },
        { id: 'file-m2-6', name: 'Nonclinical Summary', type: 'pdf', required: false },
        { id: 'file-m2-7', name: 'Clinical Summary', type: 'pdf', required: true },
      ],
    },
    m3: {
      name: 'Module 3 - Quality',
      files: [
        { id: 'file-m3-1', name: 'Drug Substance', type: 'pdf', required: true },
        { id: 'file-m3-2', name: 'Drug Product', type: 'pdf', required: true },
        { id: 'file-m3-3', name: 'Literature References', type: 'pdf', required: false },
      ],
    },
    m4: {
      name: 'Module 4 - Nonclinical Study Reports',
      files: [
        { id: 'file-m4-1', name: 'Pharmacology', type: 'pdf', required: false },
        { id: 'file-m4-2', name: 'Pharmacokinetics', type: 'pdf', required: false },
        { id: 'file-m4-3', name: 'Toxicology', type: 'pdf', required: false },
      ],
    },
    m5: {
      name: 'Module 5 - Clinical Study Reports',
      files: [
        { id: 'file-m5-1', name: 'Tabulated and Analyzed Data', type: 'pdf', required: true },
        { id: 'file-m5-2', name: 'Study Reports', type: 'pdf', required: true },
        { id: 'file-m5-3', name: 'Literature References', type: 'pdf', required: false },
      ],
    },
  };

  const toggleFolder = folderId => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileToggle = fileId => {
    if (onFileSelect) {
      onFileSelect(fileId);
    }
  };

  const isFileSelected = fileId => {
    return selectedFiles.includes(fileId);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          eCTD Document Structure
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(ectdStructure).map(([moduleId, module]) => (
            <div key={moduleId}>
              <Button
                variant="ghost"
                className="w-full justify-start p-2 h-auto"
                onClick={() => toggleFolder(moduleId)}
              >
                <Folder className="h-4 w-4 mr-2" />
                <span className="font-medium">{module.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {module.files.length}
                </Badge>
              </Button>

              {expandedFolders.has(moduleId) && (
                <div className="ml-6 space-y-1">
                  {module.files.map(file => (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between p-2 rounded border transition-colors ${
                        isFileSelected(file.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">{file.name}</span>
                        {file.required && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isFileSelected(file.id) && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        <Button
                          size="sm"
                          variant={isFileSelected(file.id) ? 'default' : 'outline'}
                          onClick={() => handleFileToggle(file.id)}
                        >
                          {isFileSelected(file.id) ? 'Selected' : 'Select'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmbeddedFileBrowser;
