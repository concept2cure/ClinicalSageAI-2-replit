import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter, } from '@/components/ui/card';
import UnifiedDocumentUpload from '../unified/UnifiedDocumentUpload';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import {
  Upload, FileText, AlertTriangle, CheckCircle, Info, FileUp, RotateCw, Trash2, Layers, Zap, Settings, FileType, Cpu, BarChart, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast';
import { documentIntelligenceService } from '@/services/DocumentIntelligenceService';

/**
 * Document Uploader Component
 *
 * Enhanced version with batch processing capabilities, OCR control,
 * and improved progress tracking.
 *
 * @param {Object} props
 * @param {string} props.regulatoryContext - The regulatory context (510k, cer, etc.)
 * @param {Function} props.onDocumentsProcessed - Callback for when documents are processed
 */
const DocumentUploader = ({ regulatoryContext = '510k', onDocumentsProcessed }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentAction, setCurrentAction] = useState('');
  const [currentBatch, setCurrentBatch] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [processedDocuments, setProcessedDocuments] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);

  // Processing options
  const [processingPriority, setProcessingPriority] = useState('normal');
  const [enableOCR, setEnableOCR] = useState(true);
  const [extractMetadata, setExtractMetadata] = useState(true);
  const [detailedAnalysis, setDetailedAnalysis] = useState(true);
  const [useTemplateMatching, setUseTemplateMatching] = useState(true);

  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();

  // Handle file selection from input
  const handleFileChange = event => {
    const selectedFiles = Array.from(event.target.files);
    processSelectedFiles(selectedFiles);
  };

  // Process files selected by the user
  const processSelectedFiles = selectedFiles => {
    // Validate file types
    const validFiles = selectedFiles.filter(file => {
      const fileExt = file.name.split('.').pop().toLowerCase();
      return ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'csv', 'md'].includes(fileExt);
    });

    // Check for invalid files
    if (validFiles.length < selectedFiles.length) {
      toast({
        title: 'Some Files Skipped',
        description: 'Only PDF, Word, Excel, and text files are supported.',
        variant: 'warning',
      });
    }

    // Add valid files to the list
    if (validFiles.length > 0) {
      setFiles(prevFiles => {
        // Check for duplicates
        const existingFilenames = prevFiles.map(f => f.name);
        const newFiles = validFiles.filter(file => !existingFilenames.includes(file.name));

        if (newFiles.length < validFiles.length) {
          toast({
            title: 'Duplicate Files Skipped',
            description: 'Some files were already added to the list.',
            variant: 'info',
          });
        }

        return [...prevFiles, ...newFiles];
      });
    }
  };

  // Open file dialog
  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Drag and Drop handlers
  const handleDragEnter = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;

    const target = document.getElementById('drop-zone');
    if (target) {
      target.classList.add('border-primary', 'bg-primary/10');
      target.classList.remove('border-primary/20');
    }
  }, []);

  const handleDragLeave = useCallback(
    e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;

      if (dragCounter.current === 0) {
        const target = document.getElementById('drop-zone');
        if (target && files.length === 0) {
          target.classList.remove('border-primary', 'bg-primary/10');
          target.classList.add('border-primary/20');
        }
      }
    },
    [files.length]
  );

  const handleDragOver = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;

      const target = document.getElementById('drop-zone');
      if (target && files.length === 0) {
        target.classList.remove('border-primary', 'bg-primary/10');
        target.classList.add('border-primary/20');
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processSelectedFiles(Array.from(e.dataTransfer.files));
      }
    },
    [files.length, processSelectedFiles]
  );

  // Remove a file from the list
  const handleRemoveFile = index => {
    setFiles(prevFiles => {
      const newFiles = [...prevFiles];
      newFiles.splice(index, 1);
      return newFiles;
    });

    // If file was processed, remove it from processed documents
    const fileToRemove = files[index];
    setProcessedDocuments(prevDocs => prevDocs.filter(doc => doc.filename !== fileToRemove.name));

    // Also remove from document types
    setDocumentTypes(prevTypes => {
      const docToRemove = processedDocuments.find(doc => doc.filename === fileToRemove.name);
      if (docToRemove) {
        return prevTypes.filter(type => type.documentId !== docToRemove.id);
      }
      return prevTypes;
    });

    // Update parent component if necessary
    if (onDocumentsProcessed) {
      const updatedDocs = processedDocuments.filter(doc => doc.filename !== fileToRemove.name);
      const updatedTypes = documentTypes.filter(type => {
        const doc = processedDocuments.find(d => d.id === type.documentId);
        return doc && doc.filename !== fileToRemove.name;
      });
      onDocumentsProcessed(updatedDocs, updatedTypes);
    }
  };

  // Process the uploaded files with enhanced options
  const handleProcessFiles = async () => {
    if (files.length === 0) {
      toast({
        title: 'No Files Selected',
        description: 'Please select at least one file to process.',
        variant: 'warning',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentAction('Initializing...');
    setCurrentBatch('');
    setCurrentFile('');

    // Keep previously processed documents or clear them based on user preference
    const isReprocessing = processedDocuments.length > 0;
    if (isReprocessing) {
      // Keep the documents for types which weren't modified
      const keptDocs = processedDocuments.filter(
        doc => files.findIndex(f => f.name === doc.filename) === -1
      );
      setProcessedDocuments(keptDocs);
      setDocumentTypes(prev =>
        prev.filter(type => keptDocs.some(doc => doc.id === type.documentId))
      );
    } else {
      setProcessedDocuments([]);
      setDocumentTypes([]);
    }

    try {
      // Configure processing options
      const processingOptions = {
        enableOCR,
        extractMetadata,
        processingPriority,
      };

      // Process documents with the enhanced service
      const processed = await documentIntelligenceService.processDocuments(
        files,
        regulatoryContext,
        progressInfo => {
          // Handle the enhanced progress format
          if (typeof progressInfo === 'object') {
            setUploadProgress(progressInfo.percentage || 0);

            if (progressInfo.currentBatch) {
              setCurrentBatch(progressInfo.currentBatch);
            }

            if (progressInfo.currentFile) {
              setCurrentFile(progressInfo.currentFile);
              setCurrentAction(`Processing ${progressInfo.currentFile}...`);
            } else {
              setCurrentAction(
                progressInfo.completed
                  ? 'Processing complete!'
                  : `Processing batch ${progressInfo.currentBatch || ''}...`
              );
            }
          } else {
            // Handle simple number progress
            setUploadProgress(progressInfo);
          }
        },
        processingOptions
      );

      // Configure document type identification options
      const typeOptions = {
        detailedAnalysis,
        useTemplateMatching,
      };

      // Update progress info for type identification
      setCurrentAction('Identifying document types...');
      setCurrentBatch('');
      setCurrentFile('');

      // Identify document types with enhanced information
      const types = await documentIntelligenceService.identifyDocumentTypes(
        processed,
        regulatoryContext,
        typeOptions
      );

      // Update state
      setProcessedDocuments(prev => {
        // Combine with any previously kept documents
        return [...prev, ...processed];
      });

      setDocumentTypes(prev => {
        // Combine with any previously kept types
        return [...prev, ...types];
      });

      // Notify parent component
      if (onDocumentsProcessed) {
        // Send all processed documents, including any previously kept ones
        onDocumentsProcessed(
          [
            ...processedDocuments.filter(doc => !processed.some(p => p.filename === doc.filename)),
            ...processed,
          ],
          [
            ...documentTypes.filter(type => !types.some(t => t.documentId === type.documentId)),
            ...types,
          ]
        );
      }

      toast({
        title: 'Processing Complete',
        description: `Successfully processed ${files.length} document(s) using ${processingPriority} priority.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error processing files:', error);

      toast({
        title: 'Processing Failed',
        description: error.message || 'An error occurred during document processing.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setCurrentAction('');
      setCurrentBatch('');
      setCurrentFile('');
    }
  };

  // Clear all files and reset state
  const handleClearAll = () => {
    setFiles([]);
    setProcessedDocuments([]);
    setDocumentTypes([]);

    // Notify parent component
    if (onDocumentsProcessed) {
      onDocumentsProcessed([], []);
    }

    toast({
      title: 'Files Cleared',
      description: 'All files and processed documents have been cleared.',
      variant: 'info',
    });
  };

  // Get file type icon component
  const getFileTypeIcon = filename => {
    const extension = filename.split('.').pop().toLowerCase();

    if (extension === 'pdf') {
      return <FileText className="h-4 w-4 text-red-500" />;
    } else if (['doc', 'docx'].includes(extension)) {
      return <FileText className="h-4 w-4 text-blue-500" />;
    } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return <FileText className="h-4 w-4 text-green-500" />;
    } else if (['txt', 'md'].includes(extension)) {
      return <FileText className="h-4 w-4 text-gray-500" />;
    } else {
      return <FileText className="h-4 w-4" />;
    }
  };

  // Get file size string
  const getFileSizeString = size => {
    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  // Get document processing status badge with enhanced information
  const getStatusBadge = document => {
    const typeInfo = documentTypes.find(type => type.documentId === document.id);

    if (!document.processed) {
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
          Pending
        </Badge>
      );
    }

    if (typeInfo) {
      const confidence = typeInfo.confidence || 0;

      if (confidence >= 0.8) {
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            High Confidence
          </Badge>
        );
      } else if (confidence >= 0.6) {
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-100">
            <Eye className="h-3 w-3 mr-1" />
            Medium Confidence
          </Badge>
        );
      } else {
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-100">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Low Confidence
          </Badge>
        );
      }
    }

    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700">
        Processed
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Document Intelligence
          </CardTitle>
          <CardDescription>
            Upload and process documents with advanced document intelligence capabilities.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Drop Zone with enhanced drag and drop */}
          <div
            id="drop-zone"
            className={`
              border-2 border-dashed rounded-lg p-8 text-center
              ${files.length === 0 ? 'border-primary/20' : 'border-primary/40 bg-primary/5'}
              transition-colors duration-200
            `}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="bg-primary/10 p-3 rounded-full">
                <FileUp className="h-8 w-8 text-primary/80" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-medium">Upload Documents</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Drag and drop your documents here, or click the button below to browse files.
                  <br />
                  Supported formats: PDF, Word, Excel, and text files.
                </p>
              </div>

              <div className="space-x-2">
                <Button onClick={handleBrowseClick} disabled={isUploading}>
                  Browse Files
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClearAll}
                  disabled={isUploading || files.length === 0}
                >
                  Clear All
                </Button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.md"
                multiple
              />
            </div>
          </div>

          {/* Processing Options Accordion */}
          <div className="mt-6">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="processing-options">
                <AccordionTrigger className="text-sm font-medium">
                  <div className="flex items-center">
                    <Settings className="h-4 w-4 mr-2" />
                    Processing Options
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
                    {/* Processing Priority */}
                    <div className="space-y-2">
                      <Label htmlFor="processing-priority" className="flex items-center">
                        <Zap className="h-4 w-4 mr-2" />
                        Processing Priority
                      </Label>
                      <Select
                        value={processingPriority}
                        onValueChange={setProcessingPriority}
                        disabled={isUploading}
                      >
                        <SelectTrigger id="processing-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High (Faster, Lower Accuracy)</SelectItem>
                          <SelectItem value="normal">Normal (Balanced)</SelectItem>
                          <SelectItem value="low">Low (Slower, Higher Accuracy)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Affects processing speed and accuracy balance.
                      </p>
                    </div>

                    {/* OCR Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="enable-ocr" className="flex items-center cursor-pointer">
                          <FileType className="h-4 w-4 mr-2" />
                          Enable OCR
                        </Label>
                        <Switch
                          id="enable-ocr"
                          checked={enableOCR}
                          onCheckedChange={setEnableOCR}
                          disabled={isUploading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Extract text from scanned documents and images.
                      </p>
                    </div>

                    {/* Extract Metadata Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="extract-metadata"
                          className="flex items-center cursor-pointer"
                        >
                          <BarChart className="h-4 w-4 mr-2" />
                          Extract Metadata
                        </Label>
                        <Switch
                          id="extract-metadata"
                          checked={extractMetadata}
                          onCheckedChange={setExtractMetadata}
                          disabled={isUploading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Extract document metadata like author, creation date, etc.
                      </p>
                    </div>

                    {/* Detailed Analysis Toggle */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="detailed-analysis"
                          className="flex items-center cursor-pointer"
                        >
                          <Cpu className="h-4 w-4 mr-2" />
                          Detailed Analysis
                        </Label>
                        <Switch
                          id="detailed-analysis"
                          checked={detailedAnalysis}
                          onCheckedChange={setDetailedAnalysis}
                          disabled={isUploading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Perform in-depth analysis of document structure and content.
                      </p>
                    </div>

                    {/* Template Matching Toggle */}
                    <div className="space-y-2 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="template-matching"
                          className="flex items-center cursor-pointer"
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          Template Matching
                        </Label>
                        <Switch
                          id="template-matching"
                          checked={useTemplateMatching}
                          onCheckedChange={setUseTemplateMatching}
                          disabled={isUploading}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Match documents against regulatory templates for better classification.
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* File List with Enhanced Status Information */}
          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Selected Files ({files.length})</h3>
                {processedDocuments.length > 0 && (
                  <div className="flex items-center">
                    <Info className="h-4 w-4 mr-1 text-blue-500" />
                    <span className="text-xs text-muted-foreground">
                      Processed {processedDocuments.length} of {files.length} files
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {files.map((file, index) => {
                  const processed = processedDocuments.find(doc => doc.filename === file.name);
                  const typeInfo = processed
                    ? documentTypes.find(type => type.documentId === processed.id)
                    : null;

                  return (
                    <div
                      key={index}
                      className={`
                        flex items-center justify-between p-3 rounded-md
                        ${processed ? 'bg-muted/40' : 'bg-muted/20'}
                        transition-colors duration-200
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        {getFileTypeIcon(file.name)}
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs text-muted-foreground">
                              {getFileSizeString(file.size)}
                            </p>

                            {processed && processed.pages && (
                              <span className="text-xs text-muted-foreground">
                                • {processed.pages} pages
                              </span>
                            )}

                            {typeInfo && typeInfo.type && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded cursor-help">
                                      {typeInfo.type}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm">
                                    <p className="text-xs">{typeInfo.description}</p>
                                    {typeInfo.regulatoryRelevance !== undefined && (
                                      <p className="text-xs mt-1">
                                        Regulatory relevance:{' '}
                                        {Math.round(typeInfo.regulatoryRelevance * 100)}%
                                      </p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {processed && getStatusBadge(processed)}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFile(index)}
                          disabled={isUploading}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Enhanced Progress Bar with Batch Information */}
          {isUploading && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <RotateCw className="h-4 w-4 mr-2 animate-spin text-primary" />
                  <span className="text-sm font-medium">
                    {currentAction || 'Processing documents...'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
              </div>

              <Progress value={uploadProgress} className="h-2" />

              {/* Detailed Progress Information */}
              <div className="text-xs text-muted-foreground space-y-1">
                {currentBatch && (
                  <div className="flex items-center">
                    <Layers className="h-3 w-3 mr-1" />
                    <span>Current batch: {currentBatch}</span>
                  </div>
                )}

                {currentFile && (
                  <div className="flex items-center">
                    <FileText className="h-3 w-3 mr-1" />
                    <span>Current file: {currentFile}</span>
                  </div>
                )}

                <div>
                  {uploadProgress < 25
                    ? 'Initializing document processing pipeline...'
                    : uploadProgress < 50
                      ? 'Extracting content and structure from documents...'
                      : uploadProgress < 75
                        ? 'Analyzing document type and regulatory relevance...'
                        : uploadProgress < 90
                          ? 'Finalizing document processing...'
                          : 'Wrapping up and preparing for analysis...'}
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Information Messages */}
          {files.length > 0 && !isUploading && (
            <div className="mt-6">
              {processedDocuments.length === 0 ? (
                <div className="flex items-start p-3 bg-blue-50 rounded-md">
                  <Info className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-700">
                      Click the "Process Documents" button to extract content and identify document
                      types.
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Processing will batch documents by type for optimal performance.
                    </p>
                  </div>
                </div>
              ) : processedDocuments.length === files.length ? (
                <div className="flex items-start p-3 bg-green-50 rounded-md">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-green-700">
                      All documents have been processed successfully. You can now proceed to
                      document analysis.
                    </p>
                    {documentTypes.some(type => type.confidence < 0.7) && (
                      <p className="text-xs text-green-600 mt-1">
                        Some documents have lower confidence scores. Consider using detailed
                        analysis mode for better results.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start p-3 bg-yellow-50 rounded-md">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-700">
                      Some documents have not been processed yet. Click "Process Documents" to
                      continue.
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">
                      Processed: {processedDocuments.length} of {files.length} files
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 mr-1"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path>
              </svg>
              {regulatoryContext === '510k' ? 'FDA 510(k) Context' : 'CER Context'}
            </p>
            {files.length > 0 && !isUploading && (
              <p className="text-xs text-muted-foreground flex items-center">
                <Settings className="h-3 w-3 mr-1" />
                {processingPriority} priority • OCR: {enableOCR ? 'on' : 'off'} • Template matching:{' '}
                {useTemplateMatching ? 'on' : 'off'}
              </p>
            )}
          </div>

          <Button
            onClick={handleProcessFiles}
            disabled={isUploading || files.length === 0}
            className="min-w-32"
          >
            {isUploading ? (
              <>
                <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : processedDocuments.length === files.length && files.length > 0 ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Reprocess Documents
              </>
            ) : (
              <>
                <Cpu className="h-4 w-4 mr-2" />
                Process Documents
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DocumentUploader;
