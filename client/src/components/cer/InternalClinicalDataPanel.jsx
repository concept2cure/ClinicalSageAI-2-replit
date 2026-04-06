import React, { useState, useEffect, useRef } from 'react';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { Progress } from '@/components/ui/progress';
import {
 Database,
 FileUp,
 FileText,
 AlertTriangle,
 Info,
 CheckCircle2,
 ClipboardList,
 LineChart,
 Activity,
 PieChart,
 RefreshCw,
 Plus,
 Upload,
 File,
 X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cerApiService as CerAPIService } from '@/services/CerAPIService';

/**
 * Component for managing internal clinical data for Clinical Evaluation Reports
 *
 * This component provides functionality to upload and manage internal clinical
 * data required for EU MDR-compliant CERs, including:
 * - Clinical investigation summaries
 * - Post-market surveillance (PMS) reports
 * - Registry data
 * - Complaint trend data
 */
export default function InternalClinicalDataPanel({ jobId, deviceName, manufacturer, onAddToCER }) {
 const { toast } = useToast();
 const queryClient = useQueryClient();
 const fileInputRef = useRef(null);
 const [activeTab, setActiveTab] = useState('investigations');
 const [uploadProgress, setUploadProgress] = useState(0);
 const [uploadedFiles, setUploadedFiles] = useState([]);
 const [isUploading, setIsUploading] = useState(false);
 const [formData, setFormData] = useState({
 fileName: '',
 reportType: '',
 studyDesign: '',
 dataType: '',
 timeframe: '',
 sampleSize: '',
 summary: '',
 author: '',
 department: '',
 documentId: '',
 fileUrl: '',
 });

 // Query to fetch existing internal clinical data
 const {
 data: internalData,
 isLoading,
 error,
 refetch,
 } = useQuery({
 queryKey: ['/api/cer/internal-data'],
 enabled: true,
 });

 // Query to fetch summary of internal clinical data
 const {
 data: summaryData,
 isLoading: isSummaryLoading,
 error: summaryError,
 } = useQuery({
 queryKey: ['/api/cer/internal-data/summary'],
 enabled: !!internalData && Object.values(internalData).some(arr => arr.length > 0),
 });

 // Mutation for file upload
 const uploadFileMutation = useMutation({
 mutationFn: formData => {
 return new Promise((resolve, reject) => {
 const xhr = new XMLHttpRequest();
 xhr.open('POST', '/api/cer/internal-data/upload');

 // Track upload progress
 xhr.upload.onprogress = event => {
 if (event.lengthComputable) {
 const progress = Math.round((event.loaded / event.total) * 100);
 setUploadProgress(progress);
 }
 };

 xhr.onload = () => {
 if (xhr.status >= 200 && xhr.status < 300) {
 try {
 const response = JSON.parse(xhr.responseText);
 resolve(response);
 } catch (e) {
 reject(new Error('Invalid response format'));
 }
 } else {
 reject(new Error(`Upload failed with status ${xhr.status}`));
 }
 };

 xhr.onerror = () => reject(new Error('Upload failed'));

 xhr.send(formData);
 });
 },
 onSuccess: data => {
 // Add uploaded file to the list
 setUploadedFiles([...uploadedFiles, data]);

 // Update the form with the file URL
 setFormData(prev => ({
 ...prev,
 fileUrl: data.fileUrl,
 fileName: prev.fileName || data.originalFilename,
 }));

 toast({
 title: 'File Uploaded Successfully',
 description: 'Your file has been uploaded and is ready to be added to the CER database.',
 variant: 'default',
 });

 setIsUploading(false);
 setUploadProgress(0);
 },
 onError: error => {
 toast({
 title: 'Upload Failed',
 description: error.message || 'An error occurred while uploading the file.',
 variant: 'destructive',
 });

 setIsUploading(false);
 setUploadProgress(0);
 },
 });

 // Mutation for adding new internal clinical data
 const addInternalDataMutation = useMutation({
 mutationFn: data => CerAPIService.addInternalClinicalData(data),
 onSuccess: () => {
 toast({
 title: 'Data Added Successfully',
 description: 'Your internal clinical data has been added to the CER database.',
 variant: 'default',
 });

 // Reset form
 setFormData({
 fileName: '',
 reportType: '',
 studyDesign: '',
 dataType: '',
 timeframe: '',
 sampleSize: '',
 summary: '',
 author: '',
 department: '',
 documentId: '',
 fileUrl: '',
 });

 // Clear uploaded files
 setUploadedFiles([]);

 // Refetch data
 queryClient.invalidateQueries({ queryKey: ['/api/cer/internal-data'] });
 queryClient.invalidateQueries({ queryKey: ['/api/cer/internal-data/summary'] });
 },
 onError: error => {
 toast({
 title: 'Failed to Add Data',
 description: error.message || 'An error occurred while adding clinical data.',
 variant: 'destructive',
 });
 },
 });

 // Mutation for deleting internal clinical data
 const deleteInternalDataMutation = useMutation({
 mutationFn: id => CerAPIService.deleteInternalClinicalData(id),
 onSuccess: () => {
 toast({
 title: 'Data Deleted',
 description: 'The internal clinical data has been removed from the CER database.',
 variant: 'default',
 });

 // Refetch data
 queryClient.invalidateQueries({ queryKey: ['/api/cer/internal-data'] });
 queryClient.invalidateQueries({ queryKey: ['/api/cer/internal-data/summary'] });
 },
 onError: error => {
 toast({
 title: 'Failed to Delete Data',
 description: error.message || 'An error occurred while deleting clinical data.',
 variant: 'destructive',
 });
 },
 });

 const handleInputChange = e => {
 const { name, value } = e.target;
 setFormData({
 ...formData,
 [name]: value,
 });
 };

 const handleSelectChange = (name, value) => {
 setFormData({
 ...formData,
 [name]: value,
 });
 };

 // Handle file selection
 const handleFileSelect = e => {
 if (e.target.files && e.target.files.length > 0) {
 const file = e.target.files[0];

 // Create form data for upload
 const uploadData = new FormData();
 uploadData.append('file', file);
 uploadData.append('category', activeTab);
 uploadData.append('jobId', jobId || `cer-${Date.now()}`);

 // Start upload
 setIsUploading(true);
 uploadFileMutation.mutate(uploadData);

 // Auto-populate filename if not already set
 if (!formData.fileName) {
 // Remove extension from filename
 const fileName = file.name.replace(/\.[^/.]+$/, '');
 setFormData(prev => ({
 ...prev,
 fileName,
 }));
 }
 }
 };

 // Trigger file input click
 const triggerFileUpload = () => {
 if (fileInputRef.current) {
 fileInputRef.current.click();
 }
 };

 // Remove uploaded file
 const removeUploadedFile = index => {
 const newFiles = [...uploadedFiles];
 newFiles.splice(index, 1);
 setUploadedFiles(newFiles);

 // If removing the last file, clear the fileUrl
 if (newFiles.length === 0) {
 setFormData(prev => ({
 ...prev,
 fileUrl: '',
 }));
 } else {
 // Set the fileUrl to the last file in the list
 setFormData(prev => ({
 ...prev,
 fileUrl: newFiles[newFiles.length - 1].fileUrl,
 }));
 }
 };

 const handleSubmit = async e => {
 e.preventDefault();

 // Validate required fields
 if (!formData.fileName || !formData.reportType) {
 toast({
 title: 'Missing Information',
 description: 'Please provide at least a file name and report type.',
 variant: 'destructive',
 });
 return;
 }

 // Add category from active tab
 const dataToSubmit = {
 ...formData,
 category: activeTab,
 };

 // Submit data
 addInternalDataMutation.mutate(dataToSubmit);
 };

 const handleDelete = id => {
 if (
 confirm('Are you sure you want to delete this clinical data? This action cannot be undone.')
 ) {
 deleteInternalDataMutation.mutate(id);
 }
 };

 // Helper to render category-specific icon
 const getCategoryIcon = category => {
 switch (category) {
 case 'investigations':
 return <ClipboardList className="h-5 w-5 text-stone-600" />;
 case 'pmsReports':
 return <Activity className="h-5 w-5 text-green-600" />;
 case 'registryData':
 return <PieChart className="h-5 w-5 text-indigo-600" />;
 case 'complaints':
 return <AlertTriangle className="h-5 w-5 text-amber-600" />;
 default:
 return <FileText className="h-5 w-5 text-gray-600" />;
 }
 };

 // Generate CER section content
 const generateCERSection = () => {
 // Early return if there's no data
 if (!internalData || Object.values(internalData).every(arr => arr.length === 0)) {
 toast({
 title: 'No Data Available',
 description: 'Please add internal clinical data before generating a CER section.',
 variant: 'destructive',
 });
 return;
 }

 // Format data for the CER section
 const content = {
 title: 'Internal Clinical Data Analysis',
 type: 'internal-clinical-data',
 content: `# Internal Clinical Data Analysis
 
## Overview
This section presents an analysis of internal clinical data for ${deviceName || 'the device'}, including clinical investigations, post-market surveillance reports, registry data, and complaint trends.

${
 internalData.investigations && internalData.investigations.length > 0
 ? `
## Clinical Investigations
${internalData.investigations
 .map(
 item => `
### ${item.fileName}
- **Type:** ${item.reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
- **Study Design:** ${item.studyDesign ? item.studyDesign.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Not specified'}
- **Time Period:** ${item.timeframe || 'Not specified'}
- **Sample Size:** ${item.sampleSize || 'Not specified'}
- **Document Reference:** ${item.documentId || 'Not specified'}

${item.summary || 'No summary provided.'}
`
 )
 .join('')}
`
 : ''
}

${
 internalData.pmsReports && internalData.pmsReports.length > 0
 ? `
## Post-Market Surveillance
${internalData.pmsReports
 .map(
 item => `
### ${item.fileName}
- **Type:** ${item.reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
- **Time Period:** ${item.timeframe || 'Not specified'}
- **Document Reference:** ${item.documentId || 'Not specified'}

${item.summary || 'No summary provided.'}
`
 )
 .join('')}
`
 : ''
}

${
 internalData.registryData && internalData.registryData.length > 0
 ? `
## Registry Data
${internalData.registryData
 .map(
 item => `
### ${item.fileName}
- **Registry Type:** ${item.reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
- **Time Period:** ${item.timeframe || 'Not specified'}
- **Sample Size:** ${item.sampleSize || 'Not specified'}
- **Document Reference:** ${item.documentId || 'Not specified'}

${item.summary || 'No summary provided.'}
`
 )
 .join('')}
`
 : ''
}

${
 internalData.complaints && internalData.complaints.length > 0
 ? `
## Complaint Trends and Vigilance Data
${internalData.complaints
 .map(
 item => `
### ${item.fileName}
- **Analysis Type:** ${item.reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
- **Time Period:** ${item.timeframe || 'Not specified'}
- **Document Reference:** ${item.documentId || 'Not specified'}

${item.summary || 'No summary provided.'}
`
 )
 .join('')}
`
 : ''
}

## Synthesis of Internal Clinical Data
${summaryData ? summaryData.synthesis || 'The internal clinical data supports the safety and performance of the device within its intended use.' : 'A comprehensive analysis of the internal clinical data supports the safety and performance of the device within its intended use.'}

## Conclusions
${summaryData ? summaryData.conclusions || 'Based on the internal clinical data presented above, the device demonstrates an acceptable safety and performance profile that is consistent with its intended purpose.' : 'Based on the internal clinical data presented above, the device demonstrates an acceptable safety and performance profile that is consistent with its intended purpose.'}
`,
 lastUpdated: new Date().toISOString(),
 };

 return content;
 };

 // Handle adding to CER
 const handleAddToCER = () => {
 if (typeof onAddToCER === 'function') {
 const cerSection = generateCERSection();
 if (cerSection) {
 onAddToCER(cerSection);
 toast({
 title: 'Added to CER',
 description:
 'Internal clinical data analysis has been added to your Clinical Evaluation Report.',
 variant: 'default',
 });
 }
 }
 };

 return (
 <div className="space-y-6">
 <div className="flex flex-col md:flex-row gap-6">
 {/* Left Panel - Data Entry Form */}
 <Card className="w-full md:w-1/2">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Database className="h-5 w-5" />
 Add Internal Clinical Data
 </CardTitle>
 <CardDescription>
 Upload clinical investigation data, PMS reports, registry data, and complaint trends
 required for comprehensive EU MDR-compliant Clinical Evaluation Reports.
 </CardDescription>
 </CardHeader>

 <CardContent>
 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-4">
 <TabsTrigger value="investigations" className="text-xs md:text-sm">
 Investigations
 </TabsTrigger>
 <TabsTrigger value="pmsReports" className="text-xs md:text-sm">
 PMS Reports
 </TabsTrigger>
 <TabsTrigger value="registryData" className="text-xs md:text-sm">
 Registry Data
 </TabsTrigger>
 <TabsTrigger value="complaints" className="text-xs md:text-sm">
 Complaint Trends
 </TabsTrigger>
 </TabsList>

 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="grid grid-cols-1 gap-4">
 <div className="space-y-2">
 <Label htmlFor="fileName">Document Name</Label>
 <Input
 id="fileName"
 name="fileName"
 value={formData.fileName}
 onChange={handleInputChange}
 placeholder="Enter document name"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="reportType">Report Type</Label>
 <Select
 value={formData.reportType}
 onValueChange={value => handleSelectChange('reportType', value)}
 >
 <SelectTrigger>
 <SelectValue placeholder="Select report type" />
 </SelectTrigger>
 <SelectContent>
 {activeTab === 'investigations' && (
 <>
 <SelectItem value="clinical-investigation">
 Clinical Investigation
 </SelectItem>
 <SelectItem value="feasibility-study">Feasibility Study</SelectItem>
 <SelectItem value="usability-study">Usability Study</SelectItem>
 <SelectItem value="first-in-human">First-in-Human Study</SelectItem>
 </>
 )}

 {activeTab === 'pmsReports' && (
 <>
 <SelectItem value="psur">
 Periodic Safety Update Report (PSUR)
 </SelectItem>
 <SelectItem value="pms-report">
 Post-Market Surveillance Report
 </SelectItem>
 <SelectItem value="pmcf-report">PMCF Report</SelectItem>
 <SelectItem value="safety-update">Safety Update</SelectItem>
 </>
 )}

 {activeTab === 'registryData' && (
 <>
 <SelectItem value="device-registry">Device Registry Data</SelectItem>
 <SelectItem value="implant-registry">Implant Registry</SelectItem>
 <SelectItem value="procedure-registry">Procedure Registry</SelectItem>
 <SelectItem value="national-registry">National Registry</SelectItem>
 </>
 )}

 {activeTab === 'complaints' && (
 <>
 <SelectItem value="complaint-analysis">Complaint Analysis</SelectItem>
 <SelectItem value="trend-report">Trend Report</SelectItem>
 <SelectItem value="failure-analysis">Failure Analysis</SelectItem>
 <SelectItem value="vigilance-summary">Vigilance Summary</SelectItem>
 </>
 )}
 </SelectContent>
 </Select>
 </div>

 {(activeTab === 'investigations' || activeTab === 'pmsReports') && (
 <div className="space-y-2">
 <Label htmlFor="studyDesign">Study Design</Label>
 <Select
 value={formData.studyDesign}
 onValueChange={value => handleSelectChange('studyDesign', value)}
 >
 <SelectTrigger>
 <SelectValue placeholder="Select study design" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="rct">Randomized Controlled Trial</SelectItem>
 <SelectItem value="cohort">Cohort Study</SelectItem>
 <SelectItem value="case-control">Case-Control Study</SelectItem>
 <SelectItem value="case-series">Case Series</SelectItem>
 <SelectItem value="observational">Observational Study</SelectItem>
 <SelectItem value="single-arm">Single-Arm Study</SelectItem>
 </SelectContent>
 </Select>
 </div>
 )}

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="timeframe">Time Period</Label>
 <Input
 id="timeframe"
 name="timeframe"
 value={formData.timeframe}
 onChange={handleInputChange}
 placeholder="e.g., 2022-2024"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="sampleSize">Sample Size</Label>
 <Input
 id="sampleSize"
 name="sampleSize"
 value={formData.sampleSize}
 onChange={handleInputChange}
 placeholder="e.g., 250"
 />
 </div>
 </div>

 {/* File Upload Section */}
 <div className="space-y-2">
 <Label>Upload Document</Label>
 <div className="flex flex-col space-y-2">
 {/* Hidden file input */}
 <input
 type="file"
 ref={fileInputRef}
 className="hidden"
 onChange={handleFileSelect}
 accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.json,.xml"
 />

 {/* Upload button */}
 <Button
 type="button"
 variant="outline"
 className="w-full flex items-center justify-center gap-2"
 onClick={triggerFileUpload}
 disabled={isUploading}
 >
 {isUploading ? (
 <span className="flex items-center gap-2">
 <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></span>
 Uploading...
 </span>
 ) : (
 <>
 <Upload className="h-4 w-4" />
 Select File
 </>
 )}
 </Button>

 {/* Upload progress bar */}
 {isUploading && (
 <div className="w-full space-y-1">
 <Progress value={uploadProgress} className="h-2 w-full" />
 <p className="text-xs text-muted-foreground text-center">
 {uploadProgress}%
 </p>
 </div>
 )}

 {/* Uploaded files list */}
 {uploadedFiles.length > 0 && (
 <div className="mt-2 space-y-2">
 <p className="text-xs font-medium">Uploaded Files:</p>
 <div className="space-y-1">
 {uploadedFiles.map((file, index) => (
 <div
 key={index}
 className="flex items-center justify-between p-2 bg-muted rounded-md"
 >
 <div className="flex items-center gap-2">
 <File className="h-4 w-4 text-primary" />
 <span className="text-sm truncate max-w-[180px]">
 {file.originalFilename || 'Uploaded file'}
 </span>
 </div>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="h-7 w-7 p-0"
 onClick={() => removeUploadedFile(index)}
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="summary">Summary</Label>
 <Textarea
 id="summary"
 name="summary"
 value={formData.summary}
 onChange={handleInputChange}
 placeholder="Enter a summary of the clinical data"
 rows={4}
 />
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="author">Author</Label>
 <Input
 id="author"
 name="author"
 value={formData.author}
 onChange={handleInputChange}
 placeholder="Document author"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="department">Department</Label>
 <Input
 id="department"
 name="department"
 value={formData.department}
 onChange={handleInputChange}
 placeholder="e.g., Clinical Affairs"
 />
 </div>
 </div>

 <div className="space-y-2">
 <Label htmlFor="documentId">Document ID/Reference</Label>
 <Input
 id="documentId"
 name="documentId"
 value={formData.documentId}
 onChange={handleInputChange}
 placeholder="e.g., CSR-2023-001"
 />
 </div>
 </div>

 <Button
 type="submit"
 className="w-full"
 disabled={addInternalDataMutation.isPending}
 >
 {addInternalDataMutation.isPending ? (
 <span className="flex items-center gap-2">
 <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
 Adding Data...
 </span>
 ) : (
 <span className="flex items-center gap-2">
 <FileUp className="h-4 w-4" />
 Add Clinical Data
 </span>
 )}
 </Button>
 </form>
 </Tabs>
 </CardContent>

 <CardFooter className="flex flex-col space-y-4 pt-0">
 <div className="text-sm text-muted-foreground mt-2 w-full">
 <div className="flex items-center gap-2 mb-1">
 <Info className="h-4 w-4 text-stone-500" />
 <span>All internal clinical data is included in the CER assessment.</span>
 </div>
 <div className="flex items-center gap-2">
 <CheckCircle2 className="h-4 w-4 text-green-500" />
 <span>EU MDR Article 61 requires inclusion of internal clinical data.</span>
 </div>
 </div>
 <div className="flex justify-end gap-2 w-full">
 <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
 <span className="flex items-center gap-1">
 {isLoading ? (
 <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></span>
 ) : (
 <svg
 xmlns="http://www.w3.org/2000/svg"
 width="14"
 height="14"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 >
 <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
 <path d="M21 3v5h-5"></path>
 <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
 <path d="M8 16H3v5"></path>
 </svg>
 )}
 Refresh
 </span>
 </Button>
 </div>
 </CardFooter>
 </Card>

 {/* Right Panel - Overview and Existing Data */}
 <Card className="w-full md:w-1/2">
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <LineChart className="h-5 w-5" />
 Internal Clinical Evidence Overview
 </CardTitle>
 <CardDescription>
 View and manage your internal clinical data for CER inclusion
 </CardDescription>
 </CardHeader>

 <CardContent className="space-y-4">
 {isLoading ? (
 <div className="flex items-center justify-center p-8">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
 </div>
 ) : error ? (
 <Alert variant="destructive">
 <AlertTriangle className="h-4 w-4" />
 <AlertTitle>Error loading data</AlertTitle>
 <AlertDescription>
 {error.message || 'Failed to load internal clinical data. Please try again.'}
 </AlertDescription>
 </Alert>
 ) : (
 <>
 {/* Summary Cards */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
 <DataCountCard
 title="Investigations"
 count={internalData?.investigations.length || 0}
 icon={<ClipboardList className="h-5 w-5 text-stone-600" />}
 />
 <DataCountCard
 title="PMS Reports"
 count={internalData?.pmsReports.length || 0}
 icon={<Activity className="h-5 w-5 text-green-600" />}
 />
 <DataCountCard
 title="Registry Data"
 count={internalData?.registryData.length || 0}
 icon={<PieChart className="h-5 w-5 text-indigo-600" />}
 />
 <DataCountCard
 title="Complaints"
 count={internalData?.complaints.length || 0}
 icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
 />
 </div>

 {/* Existing Data List */}
 <div className="border rounded-md">
 <div className="p-3 border-b bg-muted/50 font-medium">Clinical Data Records</div>
 <div className="divide-y max-h-[400px] overflow-y-auto">
 {internalData &&
 Object.keys(internalData).map(category =>
 internalData[category].map(item => (
 <div key={item.id} className="p-3 hover:bg-muted/50">
 <div className="flex justify-between items-start">
 <div className="flex items-start gap-3">
 {getCategoryIcon(category)}
 <div>
 <div className="font-medium">{item.name}</div>
 <div className="text-sm text-muted-foreground">
 {item.metadata?.reportType} •{' '}
 {item.metadata?.timeframe || 'No timeframe'}
 </div>
 <div className="text-sm mt-1 text-gray-600 max-w-md">
 {item.metadata?.summary?.length > 100
 ? `${item.metadata.summary.substring(0, 100)}...`
 : item.metadata?.summary}
 </div>
 </div>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="text-red-600 hover:text-red-700 hover:bg-red-50"
 onClick={() => handleDelete(item.id)}
 disabled={deleteInternalDataMutation.isPending}
 >
 Delete
 </Button>
 </div>
 </div>
 ))
 )}

 {(!internalData || Object.values(internalData).flat().length === 0) && (
 <div className="p-8 text-center text-muted-foreground">
 <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
 <p>No internal clinical data has been added yet.</p>
 <p className="text-sm mt-1">
 Add clinical investigations, PMS reports, registry data, and complaint
 trends using the form.
 </p>
 </div>
 )}
 </div>
 </div>

 {/* Summary Section */}
 {isSummaryLoading && (
 <div className="mt-4 flex items-center justify-center p-4 border border-stone-100 rounded-md bg-stone-50">
 <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
 <span className="text-sm text-stone-700">
 Generating summary and regulatory narrative...
 </span>
 </div>
 )}

 {summaryError && (
 <Alert className="mt-4 border-amber-200 bg-amber-50">
 <AlertTriangle className="h-4 w-4 text-amber-500" />
 <AlertTitle>Error generating summary</AlertTitle>
 <AlertDescription className="mt-2">
 <div className="text-sm text-amber-700">
 Unable to generate AI-powered summary. Please try again later.
 </div>
 </AlertDescription>
 </Alert>
 )}

 {!isSummaryLoading && !summaryError && summaryData?.summary?.totalItems > 0 && (
 <Alert className="mt-4 bg-stone-50 border-stone-200">
 <Info className="h-4 w-4 text-stone-500" />
 <AlertTitle>Clinical Evidence Summary</AlertTitle>
 <AlertDescription className="mt-2">
 <div className="text-sm text-stone-700">
 {summaryData?.summary?.narrative || (
 <p>
 Your CER includes {summaryData?.summary?.totalItems} items of internal
 clinical evidence across{' '}
 {
 Object.values(summaryData?.summary?.categories || {}).filter(
 count => count > 0
 ).length
 }{' '}
 categories.
 </p>
 )}
 </div>
 </AlertDescription>
 </Alert>
 )}
 </>
 )}
 </CardContent>

 <CardFooter className="flex justify-between">
 <Button variant="outline" onClick={() => refetch()}>
 Refresh Data
 </Button>
 <Button
 variant="secondary"
 onClick={() =>
 queryClient.invalidateQueries({ queryKey: ['/api/cer/internal-data/summary'] })
 }
 >
 Update Summary
 </Button>
 </CardFooter>
 </Card>
 </div>

 {/* Regulatory Guidance */}
 <Card className="bg-gray-50">
 <CardHeader className="pb-2">
 <CardTitle className="text-lg">EU MDR Clinical Data Requirements</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-3 text-sm">
 <p>
 <strong>Article 61(3) of EU MDR 2017/745</strong> requires manufacturers to actively
 update their clinical evaluation with data obtained from post-market surveillance.
 </p>
 <p>
 <strong>MDCG 2020-13</strong> emphasizes that clinical evaluation must include all
 available clinical data, both from literature and from the manufacturer's internal
 clinical investigations, PMS activities, field safety reports, registry data, and
 complaint trends.
 </p>
 <p>
 <strong>MDCG 2020-6 Section 4</strong> specifically requires post-market clinical
 follow-up (PMCF) data to be incorporated into the clinical evaluation, forming a
 continuous process throughout the device lifecycle.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>
 );
}

// Helper component for data count cards
function DataCountCard({ title, count, icon }) {
 return (
 <div className="bg-white rounded-lg border p-3 flex flex-col items-center text-center">
 <div className="mb-1">{icon}</div>
 <div className="text-xl font-bold">{count}</div>
 <div className="text-xs text-muted-foreground">{title}</div>
 </div>
 );
}
