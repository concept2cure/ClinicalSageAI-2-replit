import React, { useState, useCallback } from 'react';
// import { useDropzone } from 'react-dropzone';
import {
 Upload,
 File,
 CheckCircle,
 AlertCircle,
 Loader2,
 History,
 Shield,
 Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * UNIFIED DOCUMENT UPLOAD COMPONENT
 *
 * This component provides document upload functionality for ALL modules:
 * - AnA 1.0 RI Agent
 * - eCTD Co-Author
 * - CER v2 Generator
 * - IND Wizard
 * - Document Vault
 * - Any future modules
 */

const UnifiedDocumentUpload = ({
 module = 'lumen-ai',
 context = 'general',
 purpose = 'knowledge-base',
 onUploadSuccess = () => {},
 onUploadError = () => {},
 acceptedFileTypes = {
 'application/pdf': ['.pdf'],
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
 'text/plain': ['.txt'],
 'text/xml': ['.xml'],
 },
 maxFileSize = 50 * 1024 * 1024, // 50MB default
 multiple = false,
 showModuleSelector = false,
 className = '',
}) => {
 const [uploadStatus, setUploadStatus] = useState('idle');
 const [uploadProgress, setUploadProgress] = useState(0);
 const [uploadResult, setUploadResult] = useState(null);
 const [selectedModule, setSelectedModule] = useState(module);
 const [showAdvancedMetadata, setShowAdvancedMetadata] = useState(false);

 // Enhanced metadata state
 const [metadata, setMetadata] = useState({
 regulatoryPathway: '',
 therapeuticArea: '',
 studyId: '',
 productName: '',
 regulatoryAgency: 'FDA',
 versionNotes: '',
 ectdModule: '',
 ectdSection: '',
 previousVersionId: null,
 });

 const moduleConfigs = {
 'lumen-ai': {
 name: 'AnA 1.0 RI Agent',
 icon: '🤖',
 description: 'Upload documents to enhance AnA 1.0 RI knowledge base',
 color: 'bg-stone-100 border-stone-200',
 },
 coauthor: {
 name: 'eCTD Co-Author',
 icon: '📋',
 description: 'Upload regulatory documents for eCTD submission',
 color: 'bg-green-100 border-green-200',
 },
 'cer-v2': {
 name: 'CER v2 Generator',
 icon: '🏥',
 description: 'Upload clinical data for CER generation',
 color: 'bg-purple-100 border-purple-200',
 },
 'ind-wizard': {
 name: 'eCTD Co-Author (IND)',
 icon: '🧪',
 description: 'Upload IND-related documents via eCTD Co-Author',
 color: 'bg-orange-100 border-orange-200',
 },
 vault: {
 name: 'Document Vault',
 icon: '🔒',
 description: 'Store documents securely in vault',
 color: 'bg-gray-100 border-gray-200',
 },
 };

 const onDrop = useCallback(
 async acceptedFiles => {
 if (acceptedFiles.length === 0) return;

 setUploadStatus('uploading');
 setUploadProgress(0);

 try {
 const formData = new FormData();

 if (multiple) {
 acceptedFiles.forEach(file => {
 formData.append('documents', file);
 });
 } else {
 formData.append('document', acceptedFiles[0]);
 }

 formData.append('module', selectedModule);
 formData.append('context', context);
 formData.append('purpose', purpose);

 // Append enhanced metadata
 formData.append('regulatoryPathway', metadata.regulatoryPathway);
 formData.append('therapeuticArea', metadata.therapeuticArea);
 formData.append('studyId', metadata.studyId);
 formData.append('productName', metadata.productName);
 formData.append('regulatoryAgency', metadata.regulatoryAgency);
 formData.append('versionNotes', metadata.versionNotes);
 formData.append('ectdModule', metadata.ectdModule);
 formData.append('ectdSection', metadata.ectdSection);
 if (metadata.previousVersionId) {
 formData.append('previousVersionId', metadata.previousVersionId);
 }

 const response = await fetch('/api/unified/document-ingestion', {
 method: 'POST',
 body: formData,
 });

 if (!response.ok) {
 throw new Error(`Upload failed: ${response.statusText}`);
 }

 const result = await response.json();
 setUploadResult(result);
 setUploadStatus('success');
 setUploadProgress(100);
 onUploadSuccess(result);
 } catch (error) {
 console.error('Upload error:', error);
 setUploadStatus('error');
 setUploadResult({ error: error.message });
 onUploadError(error);
 }
 },
 [selectedModule, context, purpose, multiple, onUploadSuccess, onUploadError]
 );

 // Temporarily commented out due to react-dropzone import issue
 // const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
 // onDrop,
 // accept: acceptedFileTypes,
 // maxSize: maxFileSize,
 // multiple,
 // disabled: uploadStatus === 'uploading'
 // });

 // Basic fallback for file input
 const getRootProps = () => ({ onClick: () => {} });
 const getInputProps = () => ({ type: 'file', multiple, disabled: uploadStatus === 'uploading' });
 const isDragActive = false;
 const isDragReject = false;

 const resetUpload = () => {
 setUploadStatus('idle');
 setUploadProgress(0);
 setUploadResult(null);
 };

 const currentModule = moduleConfigs[selectedModule] || moduleConfigs['lumen-ai'];

 return (
 <Card className={`w-full ${className}`}>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Upload className="w-5 h-5" />
 Unified Document Upload
 </CardTitle>
 <CardDescription>Upload documents to {currentModule.name}</CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 {/* Module Selector */}
 {showModuleSelector && (
 <div className="space-y-2">
 <label className="text-sm font-medium">Target Module</label>
 <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
 {Object.entries(moduleConfigs).map(([key, config]) => (
 <Button
 key={key}
 variant={selectedModule === key ? 'default' : 'outline'}
 size="sm"
 onClick={() => setSelectedModule(key)}
 className="justify-start"
 >
 <span className="mr-2">{config.icon}</span>
 {config.name}
 </Button>
 ))}
 </div>
 </div>
 )}

 {/* Current Module Display */}
 <div className={`p-3 rounded-lg border ${currentModule.color}`}>
 <div className="flex items-center gap-2">
 <span className="text-lg">{currentModule.icon}</span>
 <div>
 <p className="font-medium">{currentModule.name}</p>
 <p className="text-sm text-gray-600">{currentModule.description}</p>
 </div>
 </div>
 </div>

 {/* Upload Area */}
 <div
 {...getRootProps()}
 className={`
 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
 ${isDragActive ? 'border-stone-400 bg-stone-50' : 'border-gray-300 hover:border-gray-400'}
 ${isDragReject ? 'border-red-400 bg-red-50' : ''}
 ${uploadStatus === 'uploading' ? 'pointer-events-none opacity-50' : ''}
 `}
 >
 <input {...getInputProps()} />

 {uploadStatus === 'uploading' ? (
 <div className="space-y-2">
 <Loader2 className="w-8 h-8 animate-spin mx-auto text-stone-500" />
 <p className="text-sm text-gray-600">Processing document...</p>
 <Progress value={uploadProgress} className="w-full" />
 </div>
 ) : (
 <div className="space-y-2">
 <Upload className="w-8 h-8 mx-auto text-gray-400" />
 <p className="text-sm text-gray-600">
 {isDragActive ? 'Drop files here...' : 'Drag & drop files here, or click to select'}
 </p>
 <p className="text-xs text-gray-500">
 Supports PDF, DOCX, XLSX, PPTX, TXT, XML (max{' '}
 {Math.round(maxFileSize / 1024 / 1024)}MB)
 </p>
 </div>
 )}
 </div>

 {/* Enhanced Metadata Toggle */}
 <Button
 variant="outline"
 size="sm"
 onClick={() => setShowAdvancedMetadata(!showAdvancedMetadata)}
 className="w-full flex items-center justify-center gap-2"
 >
 <Tag className="w-4 h-4" />
 {showAdvancedMetadata ? 'Hide' : 'Show'} Advanced Metadata
 </Button>

 {/* Enhanced Metadata Fields */}
 {showAdvancedMetadata && (
 <Card className="border-indigo-200 bg-indigo-50/30">
 <CardHeader className="pb-3">
 <CardTitle className="text-sm flex items-center gap-2">
 <Shield className="w-4 h-4 text-indigo-600" />
 Regulatory Compliance Metadata
 </CardTitle>
 </CardHeader>
 <CardContent>
 <Tabs defaultValue="regulatory" className="w-full">
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
 <TabsTrigger value="clinical">Clinical</TabsTrigger>
 <TabsTrigger value="ectd">eCTD</TabsTrigger>
 </TabsList>

 <TabsContent value="regulatory" className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="regulatoryPathway">Regulatory Pathway</Label>
 <Select
 value={metadata.regulatoryPathway}
 onValueChange={value =>
 setMetadata({ ...metadata, regulatoryPathway: value })
 }
 >
 <SelectTrigger id="regulatoryPathway">
 <SelectValue placeholder="Select pathway" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="510k">510(k)</SelectItem>
 <SelectItem value="PMA">PMA</SelectItem>
 <SelectItem value="IND">IND</SelectItem>
 <SelectItem value="NDA">NDA</SelectItem>
 <SelectItem value="BLA">BLA</SelectItem>
 <SelectItem value="ANDA">ANDA</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-2">
 <Label htmlFor="regulatoryAgency">Regulatory Agency</Label>
 <Select
 value={metadata.regulatoryAgency}
 onValueChange={value =>
 setMetadata({ ...metadata, regulatoryAgency: value })
 }
 >
 <SelectTrigger id="regulatoryAgency">
 <SelectValue placeholder="Select agency" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="FDA">FDA</SelectItem>
 <SelectItem value="EMA">EMA</SelectItem>
 <SelectItem value="PMDA">PMDA</SelectItem>
 <SelectItem value="Health Canada">Health Canada</SelectItem>
 <SelectItem value="TGA">TGA</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="productName">Product Name</Label>
 <Input
 id="productName"
 value={metadata.productName}
 onChange={e => setMetadata({ ...metadata, productName: e.target.value })}
 placeholder="Enter product name"
 />
 </div>
 </TabsContent>

 <TabsContent value="clinical" className="space-y-4">
 <div className="space-y-2">
 <Label htmlFor="therapeuticArea">Therapeutic Area</Label>
 <Input
 id="therapeuticArea"
 value={metadata.therapeuticArea}
 onChange={e => setMetadata({ ...metadata, therapeuticArea: e.target.value })}
 placeholder="e.g., Oncology, Cardiology, Neurology"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="studyId">Study ID</Label>
 <Input
 id="studyId"
 value={metadata.studyId}
 onChange={e => setMetadata({ ...metadata, studyId: e.target.value })}
 placeholder="e.g., NCT12345678"
 />
 </div>
 </TabsContent>

 <TabsContent value="ectd" className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="ectdModule">eCTD Module</Label>
 <Select
 value={metadata.ectdModule}
 onValueChange={value => setMetadata({ ...metadata, ectdModule: value })}
 >
 <SelectTrigger id="ectdModule">
 <SelectValue placeholder="Select module" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="1">Module 1 - Administrative</SelectItem>
 <SelectItem value="2">Module 2 - Summaries</SelectItem>
 <SelectItem value="3">Module 3 - Quality</SelectItem>
 <SelectItem value="4">Module 4 - Nonclinical</SelectItem>
 <SelectItem value="5">Module 5 - Clinical</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-2">
 <Label htmlFor="ectdSection">eCTD Section</Label>
 <Input
 id="ectdSection"
 value={metadata.ectdSection}
 onChange={e => setMetadata({ ...metadata, ectdSection: e.target.value })}
 placeholder="e.g., 2.7.3"
 />
 </div>
 </div>
 </TabsContent>
 </Tabs>

 <div className="mt-4 space-y-2">
 <Label htmlFor="versionNotes">Version Notes</Label>
 <Textarea
 id="versionNotes"
 value={metadata.versionNotes}
 onChange={e => setMetadata({ ...metadata, versionNotes: e.target.value })}
 placeholder="Document version notes or comments..."
 rows={3}
 />
 </div>
 </CardContent>
 </Card>
 )}

 {/* Upload Status */}
 {uploadStatus === 'success' && uploadResult && (
 <Alert className="border-green-200 bg-green-50">
 <CheckCircle className="h-4 w-4 text-green-600" />
 <AlertDescription>
 <div className="space-y-2">
 <p className="text-green-800">Document uploaded successfully!</p>
 {uploadResult.analysis && (
 <div className="space-y-1">
 <p className="text-sm">
 <strong>Document Type:</strong> {uploadResult.analysis.documentType}
 </p>
 <p className="text-sm">
 <strong>Confidence:</strong> {uploadResult.analysis.confidence}%
 </p>
 {uploadResult.analysis.regulatoryTerms && (
 <div className="flex flex-wrap gap-1">
 <span className="text-sm font-medium">Regulatory Terms:</span>
 {uploadResult.analysis.regulatoryTerms.slice(0, 3).map((term, idx) => (
 <Badge key={idx} variant="secondary" className="text-xs">
 {term}
 </Badge>
 ))}
 </div>
 )}
 </div>
 )}
 <Button size="sm" onClick={resetUpload} className="mt-2">
 Upload Another Document
 </Button>
 </div>
 </AlertDescription>
 </Alert>
 )}

 {uploadStatus === 'error' && (
 <Alert className="border-red-200 bg-red-50">
 <AlertCircle className="h-4 w-4 text-red-600" />
 <AlertDescription>
 <div className="space-y-2">
 <p className="text-red-800">Upload failed</p>
 {uploadResult?.error && (
 <p className="text-sm text-red-700">{uploadResult.error}</p>
 )}
 <Button size="sm" onClick={resetUpload} className="mt-2">
 Try Again
 </Button>
 </div>
 </AlertDescription>
 </Alert>
 )}
 </CardContent>
 </Card>
 );
};

export default UnifiedDocumentUpload;
