import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/components/ui/toaster';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Icons
import {
  FileUp,
  FileText,
  FileSearch,
  AlertCircle,
  CheckCircle,
  Loader2,
  Upload,
  FileOutput,
  Database,
  Zap,
  ListFilter,
  FileJson,
  Bot,
  Table,
  Sparkles,
  Braces,
} from 'lucide-react';

/**
 * Document Upload + Extraction Component
 *
 * This component handles:
 * 1. Upload of regulatory documents (protocol, CSR, CER, tables)
 * 2. OCR and NLP-based parsing
 * 3. Auto-mapping to ICH/MedDev structure
 * 4. Storing structured JSON for each doc
 */
const DocumentUploadExtraction = ({ onDocumentsProcessed }) => {
  const [files, setFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [processingStatus, setProcessingStatus] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [mappedData, setMappedData] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Document type options
  const documentTypes = [
    { id: 'protocol', label: 'Protocol', icon: <FileText className="h-4 w-4" /> },
    { id: 'csr', label: 'Clinical Study Report', icon: <FileText className="h-4 w-4" /> },
    { id: 'cer', label: 'Clinical Evaluation Report', icon: <FileText className="h-4 w-4" /> },
    { id: 'tables', label: 'Statistical Tables', icon: <Table className="h-4 w-4" /> },
    { id: 'meddev', label: 'MedDev Documentation', icon: <FileText className="h-4 w-4" /> },
    { id: 'other', label: 'Other Regulatory Document', icon: <FileText className="h-4 w-4" /> },
  ];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async formData => {
      const response = await apiRequest('POST', '/api/cer/documents/upload', formData, {
        onUploadProgress: progressEvent => {
          const { loaded, total } = progressEvent;
          const fileId = formData.get('fileId');
          setUploadProgress(prev => ({
            ...prev,
            [fileId]: Math.round((loaded * 100) / total),
          }));
        },
      });
      return response.json();
    },
    onSuccess: data => {
      // Update processing status
      setProcessingStatus(prev => ({
        ...prev,
        [data.fileId]: {
          status: 'extracting',
          message: 'Extracting content with OCR & NLP...',
        },
      }));

      // Start extraction process
      extractMutation.mutate({ fileId: data.fileId });

      toast({
        title: 'Upload successful',
        description: 'Your document has been uploaded and is being processed',
      });
    },
    onError: (error, variables) => {
      const fileId = variables.get('fileId');
      setProcessingStatus(prev => ({
        ...prev,
        [fileId]: {
          status: 'error',
          message: 'Upload failed. Please try again.',
        },
      }));

      toast({
        title: 'Upload failed',
        description: 'There was a problem uploading your document',
        variant: 'destructive',
      });
    },
  });

  // Extract content mutation
  const extractMutation = useMutation({
    mutationFn: async ({ fileId }) => {
      const response = await apiRequest('POST', '/api/cer/documents/extract', { fileId });
      return response.json();
    },
    onSuccess: data => {
      // Update processing status
      setProcessingStatus(prev => ({
        ...prev,
        [data.fileId]: {
          status: 'mapping',
          message: 'Mapping content to regulatory structure...',
        },
      }));

      // Start mapping process
      mapMutation.mutate({ fileId: data.fileId });
    },
    onError: (error, { fileId }) => {
      setProcessingStatus(prev => ({
        ...prev,
        [fileId]: {
          status: 'error',
          message: 'Content extraction failed. Please try again.',
        },
      }));

      toast({
        title: 'Extraction failed',
        description: 'There was a problem extracting content from your document',
        variant: 'destructive',
      });
    },
  });

  // Map to structure mutation
  const mapMutation = useMutation({
    mutationFn: async ({ fileId }) => {
      const response = await apiRequest('POST', '/api/cer/documents/map', { fileId });
      return response.json();
    },
    onSuccess: data => {
      // Update processing status
      setProcessingStatus(prev => ({
        ...prev,
        [data.fileId]: {
          status: 'complete',
          message: 'Processing complete!',
        },
      }));

      // Merge the mapped data
      setMappedData(prev => ({
        ...prev,
        [data.fileId]: data.mappedContent,
      }));

      // Switch to mapped tab if all files are processed
      const allComplete = Object.values(processingStatus).every(
        status => status.status === 'complete' || status.status === 'error'
      );

      if (allComplete) {
        setActiveTab('mapped');
        if (onDocumentsProcessed) {
          onDocumentsProcessed(mappedData);
        }
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/cer/documents'] });

      toast({
        title: 'Document processed',
        description: 'Your document has been successfully processed and mapped',
      });
    },
    onError: (error, { fileId }) => {
      setProcessingStatus(prev => ({
        ...prev,
        [fileId]: {
          status: 'error',
          message: 'Mapping failed. Please try again.',
        },
      }));

      toast({
        title: 'Mapping failed',
        description: 'There was a problem mapping your document to the regulatory structure',
        variant: 'destructive',
      });
    },
  });

  // Handle file selection
  const handleFileChange = e => {
    const selectedFiles = Array.from(e.target.files);

    // Add the files to the list
    const newFiles = selectedFiles.map(file => ({
      id: `file-${Date.now()}-${file.name.replace(/[^a-z0-9]/gi, '-')}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      documentType: guessDocumentType(file.name),
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Initialize processing status
    newFiles.forEach(fileObj => {
      setProcessingStatus(prev => ({
        ...prev,
        [fileObj.id]: {
          status: 'pending',
          message: 'Waiting to upload...',
        },
      }));
    });
  };

  // Guess document type based on filename
  const guessDocumentType = filename => {
    filename = filename.toLowerCase();
    if (filename.includes('protocol')) return 'protocol';
    if (filename.includes('csr')) return 'csr';
    if (filename.includes('cer')) return 'cer';
    if (filename.includes('table') || filename.includes('stat')) return 'tables';
    if (filename.includes('meddev') || filename.includes('mdr')) return 'meddev';
    return 'other';
  };

  // Set document type
  const setDocumentType = (fileId, documentType) => {
    setFiles(prev =>
      prev.map(fileObj => (fileObj.id === fileId ? { ...fileObj, documentType } : fileObj))
    );
  };

  // Start upload process
  const handleUpload = () => {
    // Start upload for each file
    files.forEach(fileObj => {
      if (processingStatus[fileObj.id]?.status === 'pending') {
        // Update status to uploading
        setProcessingStatus(prev => ({
          ...prev,
          [fileObj.id]: {
            status: 'uploading',
            message: 'Uploading...',
          },
        }));

        // Create form data
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('fileId', fileObj.id);
        formData.append('documentType', fileObj.documentType);

        // Upload the file
        uploadMutation.mutate(formData);
      }
    });
  };

  // Retry processing a file
  const handleRetry = fileId => {
    const fileObj = files.find(f => f.id === fileId);
    if (!fileObj) return;

    // Reset status
    setProcessingStatus(prev => ({
      ...prev,
      [fileId]: {
        status: 'pending',
        message: 'Waiting to upload...',
      },
    }));

    // Start upload process again
    const formData = new FormData();
    formData.append('file', fileObj.file);
    formData.append('fileId', fileObj.id);
    formData.append('documentType', fileObj.documentType);

    uploadMutation.mutate(formData);
  };

  // Remove a file from the list
  const handleRemoveFile = fileId => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setProcessingStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[fileId];
      return newStatus;
    });
  };

  // Render status icon
  const renderStatusIcon = status => {
    switch (status) {
      case 'pending':
        return <FileUp className="h-5 w-5 text-gray-400" />;
      case 'uploading':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'extracting':
        return <FileSearch className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'mapping':
        return <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <FileUp className="h-5 w-5 text-gray-400" />;
    }
  };

  // Format file size
  const formatFileSize = bytes => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <FileOutput className="mr-2 h-5 w-5 text-blue-600" />
          Document Upload & Extraction
        </h2>
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="mapped">Mapped Content</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="upload">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Upload Regulatory Documents</CardTitle>
            <CardDescription>
              Upload protocols, CSRs, CERs, or tables to extract structured content for your
              reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                multiple
                onChange={handleFileChange}
              />
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium mb-1">Drag files here or click to upload</p>
              <p className="text-xs text-gray-500">
                Support for PDF, Word (.docx), Excel (.xlsx), and XML
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Selected Documents</h3>
                  <Button
                    onClick={handleUpload}
                    disabled={files.every(f => processingStatus[f.id]?.status !== 'pending')}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Start Processing
                  </Button>
                </div>

                <div className="space-y-3 mt-2">
                  {files.map(fileObj => (
                    <div key={fileObj.id} className="border rounded-lg p-3 bg-white">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          {renderStatusIcon(processingStatus[fileObj.id]?.status)}
                          <div>
                            <p className="font-medium text-sm">{fileObj.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(fileObj.size)}</p>
                          </div>
                        </div>
                        <div className="space-x-2">
                          {processingStatus[fileObj.id]?.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveFile(fileObj.id)}
                            >
                              Remove
                            </Button>
                          )}
                          {processingStatus[fileObj.id]?.status === 'error' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(fileObj.id)}
                            >
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>

                      {processingStatus[fileObj.id]?.status === 'pending' && (
                        <div className="mt-2">
                          <Label className="text-xs mb-1 block">Document Type</Label>
                          <div className="flex flex-wrap gap-2">
                            {documentTypes.map(docType => (
                              <Badge
                                key={docType.id}
                                variant={
                                  fileObj.documentType === docType.id ? 'default' : 'outline'
                                }
                                className="cursor-pointer"
                                onClick={() => setDocumentType(fileObj.id, docType.id)}
                              >
                                {docType.icon}
                                <span className="ml-1">{docType.label}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {processingStatus[fileObj.id]?.status === 'uploading' && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-600 mb-1">
                            {processingStatus[fileObj.id]?.message}
                          </p>
                          <Progress value={uploadProgress[fileObj.id] || 0} className="h-2" />
                        </div>
                      )}

                      {(processingStatus[fileObj.id]?.status === 'extracting' ||
                        processingStatus[fileObj.id]?.status === 'mapping') && (
                        <div className="mt-3">
                          <p className="text-xs text-blue-600 font-medium flex items-center">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            {processingStatus[fileObj.id]?.message}
                          </p>
                          <Progress
                            value={processingStatus[fileObj.id]?.status === 'extracting' ? 50 : 80}
                            className="h-2 mt-1"
                          />
                        </div>
                      )}

                      {processingStatus[fileObj.id]?.status === 'complete' && (
                        <div className="mt-3">
                          <p className="text-xs text-green-600 font-medium flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {processingStatus[fileObj.id]?.message}
                          </p>
                          <Progress value={100} className="h-2 mt-1" />
                        </div>
                      )}

                      {processingStatus[fileObj.id]?.status === 'error' && (
                        <Alert variant="destructive" className="mt-3 py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle className="text-xs font-medium">Error</AlertTitle>
                          <AlertDescription className="text-xs">
                            {processingStatus[fileObj.id]?.message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-gray-50 border-t text-xs text-gray-500 pt-4">
            <p>
              Documents are automatically processed using OCR and AI-powered extraction to identify
              key regulatory content.
            </p>
          </CardFooter>
        </Card>
      </TabsContent>

      <TabsContent value="mapped">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center">
              <FileJson className="h-5 w-5 mr-2 text-blue-600" />
              Mapped Document Content
            </CardTitle>
            <CardDescription>
              View structured content extracted from your documents and mapped to ICH/MedDev
              standards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!mappedData || Object.keys(mappedData).length === 0 ? (
              <div className="text-center py-8">
                <Database className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-gray-500 font-medium mb-1">No Mapped Content Yet</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto">
                  Process documents in the Upload tab to see structured content appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Document Structure</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Braces className="h-4 w-4 mr-2" />
                          View as JSON
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View the raw structured data</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <ScrollArea className="h-[400px] border rounded-md p-4 bg-gray-50">
                  {/* This would be replaced with a proper component to display the structured data */}
                  <div className="space-y-6">
                    {Object.entries(mappedData || {}).map(([fileId, content]) => {
                      const file = files.find(f => f.id === fileId);
                      if (!file) return null;

                      return (
                        <div key={fileId} className="bg-white p-4 rounded-md border">
                          <div className="flex items-center mb-3">
                            <Badge className="mr-2">
                              {documentTypes.find(dt => dt.id === file.documentType)?.label ||
                                'Document'}
                            </Badge>
                            <h4 className="font-medium text-sm">{file.name}</h4>
                          </div>

                          <Separator className="my-3" />

                          {/* Sample display of extracted sections */}
                          <div className="space-y-3">
                            {content?.sections?.map((section, index) => (
                              <div key={index} className="text-sm">
                                <h5 className="font-medium mb-1">
                                  {section.title || `Section ${index + 1}`}
                                </h5>
                                <p className="text-gray-600 text-xs">
                                  {section.content?.substring(0, 100)}...
                                </p>
                              </div>
                            ))}

                            {content?.keyFindings && (
                              <div className="bg-blue-50 p-3 rounded-md mt-3">
                                <h5 className="font-medium text-sm mb-1 text-blue-700">
                                  Key Findings
                                </h5>
                                <ul className="text-xs text-blue-600 space-y-1">
                                  {content.keyFindings.map((finding, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="mr-1">•</span> {finding}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                <div className="bg-green-50 p-4 rounded-md border border-green-100 flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-green-800 mb-1">Content Successfully Mapped</h4>
                    <p className="text-sm text-green-700">
                      Your documents have been processed and mapped to the appropriate regulatory
                      structure. You can now use this content in your document generation workflow.
                    </p>
                    <Button className="mt-3" onClick={() => onDocumentsProcessed(mappedData)}>
                      Continue to Template Selection
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default DocumentUploadExtraction;
