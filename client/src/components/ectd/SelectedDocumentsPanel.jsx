import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, FileText, Download } from 'lucide-react'

const SelectedDocumentsPanel = ({ selectedFiles = [], onRemoveFile, onCompile }) => {
  const getFileDisplayName = fileId => {
    const fileMap = {
      'file-m1-1': 'Cover Letter',
      'file-m1-2': 'Comprehensive Table of Contents',
      'file-m1-3': 'Application Form',
      'file-m1-4': 'Product Information',
      'file-m2-1': 'CTD Table of Contents',
      'file-m2-2': 'CTD Introduction',
      'file-m2-3': 'Quality Overall Summary',
      'file-m2-4': 'Nonclinical Overview',
      'file-m2-5': 'Clinical Overview',
      'file-m2-6': 'Nonclinical Summary',
      'file-m2-7': 'Clinical Summary',
      'file-m3-1': 'Drug Substance',
      'file-m3-2': 'Drug Product',
      'file-m3-3': 'Literature References (M3)',
      'file-m4-1': 'Pharmacology',
      'file-m4-2': 'Pharmacokinetics',
      'file-m4-3': 'Toxicology',
      'file-m5-1': 'Tabulated and Analyzed Data',
      'file-m5-2': 'Study Reports',
      'file-m5-3': 'Literature References (M5)',
    };
    return fileMap[fileId] || fileId;
  };

  const getModuleFromFileId = fileId => {
    if (fileId.startsWith('file-m1')) return 'Module 1';
    if (fileId.startsWith('file-m2')) return 'Module 2';
    if (fileId.startsWith('file-m3')) return 'Module 3';
    if (fileId.startsWith('file-m4')) return 'Module 4';
    if (fileId.startsWith('file-m5')) return 'Module 5';
    return 'Unknown';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Selected Documents
          </span>
          <Badge variant="outline">{selectedFiles.length} selected</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents selected</p>
            <p className="text-sm">Select documents from the file browser to begin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedFiles.map(fileId => (
              <div
                key={fileId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{getFileDisplayName(fileId)}</div>
                  <div className="text-xs text-gray-500">{getModuleFromFileId(fileId)}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveFile && onRemoveFile(fileId)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <div className="pt-4 border-t">
              <Button
                onClick={() => onCompile && onCompile(selectedFiles)}
                className="w-full"
                disabled={selectedFiles.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Compile eCTD Submission
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SelectedDocumentsPanel;
