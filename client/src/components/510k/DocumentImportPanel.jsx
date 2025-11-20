import React, { useState, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileUp,
  FileText,
  File,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Eye,
  Edit,
  ArrowRight,
  Info,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import mammoth from 'mammoth';

// PDF.js will be loaded from CDN when needed
let pdfjsLib = null;
let pdfjsInitialized = false;

const initPdfJS = async () => {
  if (!pdfjsInitialized) {
    try {
      // Load PDF.js from CDN instead of npm package
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      
      // PDF.js is now available globally as pdfjsLib
      pdfjsLib = window.pdfjsLib;
      
      // Use CDN worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      
      pdfjsInitialized = true;
    } catch (err) {
      console.error('Failed to load PDF.js from CDN:', err);
      throw new Error('PDF support is not available');
    }
  }
  return pdfjsLib;
};

/**
 * Document Import Panel for Word/PDF files
 * 
 * Features:
 * - Drag and drop file upload
 * - Word (.docx) and PDF file support
 * - Document parsing and content extraction
 * - Section mapping to FDA 510(k) structure
 * - Preview before import
 * - Direct integration with Document Editor
 */

const SUPPORTED_FORMATS = {
  'application/pdf': { ext: '.pdf', name: 'PDF Document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', name: 'Word Document' },
  'application/msword': { ext: '.doc', name: 'Word Document (Legacy)' },
};

const SECTION_MAPPINGS = [
  { id: 'cover', keywords: ['cover letter', 'cover page'], confidence: 'high' },
  { id: 'indications', keywords: ['indications for use', 'intended use'], confidence: 'high' },
  { id: 'device_desc', keywords: ['device description', 'product description'], confidence: 'high' },
  { id: 'substantial_equiv', keywords: ['substantial equivalence', 'equivalence'], confidence: 'high' },
  { id: 'predicate_comparison', keywords: ['predicate', 'comparison table'], confidence: 'medium' },
  { id: 'performance_testing', keywords: ['performance', 'testing', 'bench test'], confidence: 'medium' },
  { id: 'biocompatibility', keywords: ['biocompatibility', 'iso 10993'], confidence: 'high' },
  { id: 'software', keywords: ['software', 'validation', 'verification'], confidence: 'medium' },
  { id: 'labeling', keywords: ['labeling', 'label', 'instructions'], confidence: 'medium' },
  { id: 'clinical_studies', keywords: ['clinical', 'study', 'trial'], confidence: 'high' },
];

export default function DocumentImportPanel({
  onImportComplete,
  onContentExtracted,
  documentEditor,
}) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [extractedContent, setExtractedContent] = useState(null);
  const [mappedSections, setMappedSections] = useState([]);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [importMethod, setImportMethod] = useState('append');
  const [selectedSections, setSelectedSections] = useState([]);

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    
    const fileType = selectedFile.type;
    
    if (!SUPPORTED_FORMATS[fileType]) {
      toast({
        title: 'Unsupported File Type',
        description: 'Please upload a Word (.docx) or PDF file',
        variant: 'destructive',
      });
      return;
    }
    
    setFile(selectedFile);
    toast({
      title: 'File Selected',
      description: `Ready to import: ${selectedFile.name}`,
    });
  };

  // Extract content from Word document
  const extractWordContent = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      
      // Parse HTML to extract structured content
      const parser = new DOMParser();
      const doc = parser.parseFromString(result.value, 'text/html');
      
      // Extract sections based on headings
      const sections = [];
      let currentSection = null;
      
      doc.body.childNodes.forEach(node => {
        if (node.nodeName === 'H1' || node.nodeName === 'H2') {
          if (currentSection) {
            sections.push(currentSection);
          }
          currentSection = {
            title: node.textContent,
            content: '',
            level: node.nodeName,
          };
        } else if (currentSection) {
          currentSection.content += node.outerHTML || node.textContent;
        }
      });
      
      if (currentSection) {
        sections.push(currentSection);
      }
      
      return {
        html: result.value,
        text: doc.body.textContent,
        sections,
        messages: result.messages,
      };
    } catch (error) {
      console.error('Error extracting Word content:', error);
      throw new Error('Failed to parse Word document');
    }
  };

  // Extract content from PDF document
  const extractPDFContent = async (file) => {
    try {
      // Initialize PDF.js if not already loaded
      const pdfjs = await initPdfJS();
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      const sections = [];
      
      // Extract text from each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
        
        // Simple section detection based on page breaks
        sections.push({
          title: `Page ${i}`,
          content: pageText,
          level: 'page',
          pageNumber: i,
        });
      }
      
      return {
        text: fullText,
        sections,
        numPages: pdf.numPages,
      };
    } catch (error) {
      console.error('Error extracting PDF content:', error);
      throw new Error('Failed to parse PDF document');
    }
  };

  // Map extracted content to FDA 510(k) sections
  const mapToFDASections = (content) => {
    const mapped = [];
    
    content.sections.forEach(section => {
      const sectionText = (section.title + ' ' + section.content).toLowerCase();
      
      SECTION_MAPPINGS.forEach(mapping => {
        const matchScore = mapping.keywords.reduce((score, keyword) => {
          if (sectionText.includes(keyword)) {
            return score + 1;
          }
          return score;
        }, 0);
        
        if (matchScore > 0) {
          mapped.push({
            ...mapping,
            extractedSection: section,
            matchScore,
            confidence: matchScore >= 2 ? 'high' : matchScore === 1 ? 'medium' : 'low',
          });
        }
      });
    });
    
    // Sort by match score
    mapped.sort((a, b) => b.matchScore - a.matchScore);
    
    return mapped;
  };

  // Import document
  const handleImport = async () => {
    if (!file) return;
    
    setImporting(true);
    setImportProgress(0);
    
    try {
      // Step 1: Extract content (30%)
      setImportProgress(10);
      let content;
      
      if (file.type.includes('word')) {
        content = await extractWordContent(file);
      } else if (file.type === 'application/pdf') {
        content = await extractPDFContent(file);
      }
      
      setImportProgress(30);
      setExtractedContent(content);
      
      // Step 2: Map to FDA sections (50%)
      const mapped = mapToFDASections(content);
      setMappedSections(mapped);
      setImportProgress(50);
      
      // Step 3: Prepare for import (70%)
      const importData = {
        fileName: file.name,
        fileType: file.type,
        extractedContent: content,
        mappedSections: mapped,
        timestamp: new Date().toISOString(),
      };
      
      setImportProgress(70);
      
      // Step 4: Send to editor if direct import
      if (importMethod === 'direct' && onContentExtracted) {
        onContentExtracted(importData);
        setImportProgress(100);
        
        toast({
          title: 'Import Successful',
          description: `Content from ${file.name} has been imported to the editor`,
        });
        
        if (onImportComplete) {
          onImportComplete(importData);
        }
      } else {
        // Show preview for manual mapping
        setShowPreview(true);
        setImportProgress(100);
      }
      
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import document',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  // Apply selected sections to editor
  const applyToEditor = () => {
    if (!extractedContent || selectedSections.length === 0) return;
    
    const contentToApply = selectedSections.map(sectionId => {
      const section = mappedSections.find(m => m.id === sectionId);
      return section ? section.extractedSection : null;
    }).filter(Boolean);
    
    if (onContentExtracted) {
      onContentExtracted({
        sections: contentToApply,
        method: importMethod,
      });
    }
    
    toast({
      title: 'Content Applied',
      description: `${selectedSections.length} sections imported to editor`,
    });
    
    setShowPreview(false);
    resetImport();
  };

  // Reset import state
  const resetImport = () => {
    setFile(null);
    setExtractedContent(null);
    setMappedSections([]);
    setImportProgress(0);
    setSelectedSections([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      {/* Import Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Document Import
          </CardTitle>
          <CardDescription>
            Import existing Word or PDF documents into your 510(k) submission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Upload Area */}
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
              ${file ? 'bg-green-50 border-green-300' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetImport}
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium">Drop your document here</p>
                  <p className="text-sm text-gray-500 mt-1">
                    or click to browse for Word (.docx) or PDF files
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.doc,.pdf"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>

          {/* Import Options */}
          {file && !importing && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">Import Method</label>
                  <Select value={importMethod} onValueChange={setImportMethod}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">Append to existing content</SelectItem>
                      <SelectItem value="replace">Replace existing content</SelectItem>
                      <SelectItem value="manual">Manual section mapping</SelectItem>
                      <SelectItem value="direct">Direct import (auto-map)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleImport}
                className="w-full"
                disabled={importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Document
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Import Progress */}
          {importing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing document...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
              <p className="text-xs text-gray-500">
                {importProgress < 30 && 'Extracting content...'}
                {importProgress >= 30 && importProgress < 50 && 'Analyzing structure...'}
                {importProgress >= 50 && importProgress < 70 && 'Mapping to FDA sections...'}
                {importProgress >= 70 && 'Finalizing import...'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Formats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-4 w-4" />
            Supported Formats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="font-medium">Word Documents</p>
                <p className="text-sm text-gray-500">.docx, .doc</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <File className="h-8 w-8 text-red-500" />
              <div>
                <p className="font-medium">PDF Files</p>
                <p className="text-sm text-gray-500">.pdf</p>
              </div>
            </div>
          </div>
          
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              For best results, ensure your document has clear section headings that match FDA 510(k) requirements.
              The import tool will attempt to automatically map content to the appropriate sections.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Preview & Section Mapping</DialogTitle>
            <DialogDescription>
              Review extracted content and select sections to import
            </DialogDescription>
          </DialogHeader>
          
          {mappedSections.length > 0 && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Detected FDA Sections:</p>
                {mappedSections.map((section, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSections.includes(section.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSections([...selectedSections, section.id]);
                          } else {
                            setSelectedSections(selectedSections.filter(id => id !== section.id));
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{section.id}</span>
                          <Badge
                            variant={section.confidence === 'high' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {section.confidence} confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">
                          {section.extractedSection.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {section.extractedSection.content.substring(0, 200)}...
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowPreview(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={applyToEditor}
                  disabled={selectedSections.length === 0}
                >
                  Import Selected Sections ({selectedSections.length})
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}