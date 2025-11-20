import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Table, FileImage, Settings, Loader2 } from 'lucide-react';
import coauthorService from '@/services/coauthorService';

export default function ExportModal({ content, onClose }) {
  const [exportFormat, setExportFormat] = useState('docx');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [includeTrackChanges, setIncludeTrackChanges] = useState(false);
  const [paperSize, setPaperSize] = useState('a4');
  const [templateStyle, setTemplateStyle] = useState('standard');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    try {
      // Collect export options
      const exportOptions = {
        includeMetadata,
        includeComments,
        includeTrackChanges,
        paperSize,
        templateStyle,
      };

      // Get document ID and template number from content
      const documentId = content?.documentId || content?.id;
      const templateNumber = content?.templateNumber || content?.metadata?.templateNumber;

      if (!documentId) {
        throw new Error('Document ID is required for export');
      }

      // Call the REAL export service - this will trigger actual browser download
      const result = await coauthorService.exportContent(
        documentId, 
        exportFormat, 
        templateNumber,
        exportOptions
      );

      // Close modal after successful download
      setExporting(false);
      onClose();
      
      // Success notification handled by parent component
      console.log('Export successful:', result);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error.message}`);
      setExporting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <span>Export Document</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="format" className="mt-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="format" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span>Format</span>
            </TabsTrigger>
            <TabsTrigger value="options" className="gap-1.5">
              <Settings className="h-4 w-4" />
              <span>Options</span>
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-1.5">
              <Table className="h-4 w-4" />
              <span>Template</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="format" className="py-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Export Format</h3>
                <RadioGroup
                  defaultValue="docx"
                  value={exportFormat}
                  onValueChange={setExportFormat}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="docx" id="docx" />
                    <Label htmlFor="docx" className="flex items-center gap-2 cursor-pointer">
                      <FileText className="h-5 w-5 text-blue-500" />
                      <span>Word Document (DOCX)</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pdf" id="pdf" />
                    <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer">
                      <FileText className="h-5 w-5 text-red-500" />
                      <span>PDF Document</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2">Document Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="include-metadata"
                        checked={includeMetadata}
                        onCheckedChange={setIncludeMetadata}
                      />
                      <label htmlFor="include-metadata" className="text-sm cursor-pointer">
                        Include Metadata
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="include-comments"
                        checked={includeComments}
                        onCheckedChange={setIncludeComments}
                      />
                      <label htmlFor="include-comments" className="text-sm cursor-pointer">
                        Include Comments
                      </label>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="include-track-changes"
                        checked={includeTrackChanges}
                        onCheckedChange={setIncludeTrackChanges}
                      />
                      <label htmlFor="include-track-changes" className="text-sm cursor-pointer">
                        Include Track Changes
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="options" className="py-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Paper & Layout</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="paper-size" className="text-sm">
                      Paper Size
                    </Label>
                    <Select value={paperSize} onValueChange={setPaperSize}>
                      <SelectTrigger id="paper-size" className="mt-1">
                        <SelectValue placeholder="Select paper size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
                        <SelectItem value="letter">US Letter (8.5 × 11 in)</SelectItem>
                        <SelectItem value="legal">US Legal (8.5 × 14 in)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Advanced Options</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-toc" />
                    <label htmlFor="include-toc" className="text-sm cursor-pointer">
                      Include Table of Contents
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-pagination" />
                    <label htmlFor="include-pagination" className="text-sm cursor-pointer">
                      Add Page Numbers
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="template" className="py-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Template Style</h3>
                <RadioGroup
                  defaultValue="standard"
                  value={templateStyle}
                  onValueChange={setTemplateStyle}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="standard" id="standard" />
                    <Label htmlFor="standard" className="flex items-center gap-2 cursor-pointer">
                      <FileImage className="h-5 w-5 text-blue-500" />
                      <span>Standard Template</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="regulatory" id="regulatory" />
                    <Label htmlFor="regulatory" className="flex items-center gap-2 cursor-pointer">
                      <FileImage className="h-5 w-5 text-green-500" />
                      <span>Regulatory Template</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scientific" id="scientific" />
                    <Label htmlFor="scientific" className="flex items-center gap-2 cursor-pointer">
                      <FileImage className="h-5 w-5 text-purple-500" />
                      <span>Scientific Journal</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="custom" id="custom" />
                    <Label htmlFor="custom" className="flex items-center gap-2 cursor-pointer">
                      <FileImage className="h-5 w-5 text-orange-500" />
                      <span>Custom Template</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-3">Header & Footer</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-header" />
                    <label htmlFor="include-header" className="text-sm cursor-pointer">
                      Include Company Header
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="include-footer" />
                    <label htmlFor="include-footer" className="text-sm cursor-pointer">
                      Include Confidentiality Footer
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between items-center pt-4 border-t">
          <div>
            <span className="text-sm text-gray-500">Export Section: Clinical Summary</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={exporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  <span>Export Document</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
