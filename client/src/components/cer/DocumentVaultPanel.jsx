import React, { useState, useEffect } from 'react';
import { documentApiService } from '@/services/DocumentAPIService';
import { Card, CardContent } from '@/components/ui/card';
import UnifiedDocumentUpload from '../unified/UnifiedDocumentUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
} from '@/components/ui/dialog';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
 FolderOpen,
 Search,
 UploadCloud,
 Download,
 FileText,
 File,
 FileLock2,
 FileArchive,
 Share2,
 Trash2,
 CalendarDays,
 Info,
 Grid3X3,
 LayoutList,
 User,
 Link2,
 CheckCircle2,
} from 'lucide-react';

export default function DocumentVaultPanel({
 jobId,
 projectId,
 attachedDocuments = [],
 onAttachDocument,
}) {
 const [searchQuery, setSearchQuery] = useState('');
 const [currentTab, setCurrentTab] = useState('all-documents');
 const [viewMode, setViewMode] = useState('list');
 const [showUploadDialog, setShowUploadDialog] = useState(false);
 const [showShareDialog, setShowShareDialog] = useState(false);
 const [selectedDocument, setSelectedDocument] = useState(null);
 const [documents, setDocuments] = useState([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);
 const [uploadFile, setUploadFile] = useState(null);
 const [uploadMetadata, setUploadMetadata] = useState({
 name: '',
 type: 'cer',
 category: 'Clinical Evaluation',
 status: 'draft',
 description: '',
 author: 'Concept2Cure AI',
 tags: ['CER'],
 });

 // Fetch documents on component mount
 useEffect(() => {
 const fetchDocuments = async () => {
 try {
 setLoading(true);
 // Get documents from the API
 const docs = await documentApiService.getDocuments();
 setDocuments(docs || []);
 } catch (error) {
 console.error('Error fetching documents:', error);
 setError('Failed to load documents. Please try again later.');
 } finally {
 setLoading(false);
 }
 };

 fetchDocuments();
 }, [jobId]);

 // Handle file selection for upload
 const handleFileChange = e => {
 const selectedFile = e.target.files[0];
 if (selectedFile) {
 setUploadFile(selectedFile);
 setUploadMetadata({
 ...uploadMetadata,
 name: selectedFile.name.split('.')[0], // Use filename as document name
 fileSize: selectedFile.size,
 });
 }
 };

 // Handle file upload
 const handleUpload = async () => {
 try {
 if (!uploadFile) {
 toast({ title: 'Please select a file to upload' });
 return;
 }

 const formData = new FormData();
 formData.append('file', uploadFile);
 formData.append('data', JSON.stringify(uploadMetadata));

 const response = await documentApiService.uploadDocument(formData);

 // Add new document to the list
 setDocuments(prev => [response, ...prev]);

 // Reset form
 setUploadFile(null);
 setUploadMetadata({
 name: '',
 type: 'cer',
 category: 'Clinical Evaluation',
 status: 'draft',
 description: '',
 author: 'Concept2Cure AI',
 tags: ['CER'],
 });

 // Close dialog
 setShowUploadDialog(false);
 } catch (error) {
 console.error('Error uploading document:', error);
 toast({ title: 'Failed to upload document. Please try again.' });
 }
 };

 // Handle document download
 const handleDownload = async document => {
 try {
 await documentApiService.downloadDocument(document.id, document.name);
 } catch (error) {
 console.error('Error downloading document:', error);
 toast({ title: 'Failed to download document. Please try again.' });
 }
 };

 // Handle document selection
 const handleSelectDocument = document => {
 setSelectedDocument(document);
 };

 // Handle document sharing
 const handleShare = document => {
 setSelectedDocument(document);
 setShowShareDialog(true);
 };

 // Filter documents based on search query and current tab
 const filteredDocuments = documents.filter(doc => {
 const matchesSearch =
 searchQuery.trim() === '' ||
 doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
 (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));

 if (!matchesSearch) return false;

 if (currentTab === 'all-documents') return true;
 if (currentTab === 'cer-documents') return doc.type === 'cer';
 if (currentTab === 'literature') return doc.type === 'literature';
 if (currentTab === 'data') return doc.type === 'data';
 if (currentTab === 'approved') return doc.status === 'approved';
 if (currentTab === 'drafts') return doc.status === 'draft';

 return true;
 });

 // Document metrics
 const documentMetrics = {
 total: documents.length,
 approved: documents.filter(doc => doc.status === 'approved').length,
 draft: documents.filter(doc => doc.status === 'draft').length,
 cer: documents.filter(doc => doc.type === 'cer').length,
 literature: documents.filter(doc => doc.type === 'literature').length,
 data: documents.filter(doc => doc.type === 'data').length,
 };

 // Document type icon mapping
 const getDocumentIcon = type => {
 switch (type) {
 case 'cer':
 return <FileText className="h-5 w-5 text-stone-500" />;
 case 'literature':
 return <File className="h-5 w-5 text-green-500" />;
 case 'data':
 return <FileArchive className="h-5 w-5 text-amber-500" />;
 case 'risk':
 return <FileLock2 className="h-5 w-5 text-red-500" />;
 case 'pms':
 return <FileText className="h-5 w-5 text-purple-500" />;
 default:
 return <File className="h-5 w-5" />;
 }
 };

 // Format date helper
 const formatDate = dateString => {
 if (!dateString) return 'N/A';
 const date = new Date(dateString);
 return date.toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 });
 };

 return (
 <div className="space-y-4">
 <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
 <div>
 <h2 className="text-2xl font-semibold tracking-tight">Document Vault</h2>
 <p className="text-sm text-gray-500">
 Manage all your clinical evaluation reports and related documents
 </p>
 </div>

 <div className="flex gap-2">
 <Button
 onClick={() => setShowUploadDialog(true)}
 className="gap-1 bg-stone-800 hover:bg-stone-900"
 >
 <UploadCloud className="h-4 w-4" />
 Upload
 </Button>
 <Button variant="outline" className="gap-1">
 <FolderOpen className="h-4 w-4" />
 New Folder
 </Button>
 </div>
 </div>

 {/* Document metrics */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold">{documentMetrics.total}</div>
 <div className="text-xs text-gray-500">Total Documents</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold text-green-600">{documentMetrics.approved}</div>
 <div className="text-xs text-gray-500">Approved</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold text-amber-600">{documentMetrics.draft}</div>
 <div className="text-xs text-gray-500">Drafts</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold text-stone-600">{documentMetrics.cer}</div>
 <div className="text-xs text-gray-500">CER Documents</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold text-green-600">{documentMetrics.literature}</div>
 <div className="text-xs text-gray-500">Literature Reviews</div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="p-3 flex flex-col items-center justify-center">
 <div className="text-3xl font-bold text-amber-600">{documentMetrics.data}</div>
 <div className="text-xs text-gray-500">Data Summaries</div>
 </CardContent>
 </Card>
 </div>

 {/* Search and filters */}
 <div className="flex items-center space-x-2">
 <div className="relative flex-1">
 <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search documents..."
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 className="pl-8"
 />
 </div>
 <Button
 variant={viewMode === 'list' ? 'default' : 'outline'}
 size="icon"
 onClick={() => setViewMode('list')}
 className="h-9 w-9"
 >
 <LayoutList className="h-4 w-4" />
 </Button>
 <Button
 variant={viewMode === 'grid' ? 'default' : 'outline'}
 size="icon"
 onClick={() => setViewMode('grid')}
 className="h-9 w-9"
 >
 <Grid3X3 className="h-4 w-4" />
 </Button>
 </div>

 {/* Document list */}
 <Card>
 <CardContent className="p-0">
 {loading ? (
 <div className="flex justify-center items-center p-8">
 <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
 </div>
 ) : error ? (
 <div className="flex flex-col items-center justify-center p-8 text-center">
 <FileText className="h-16 w-16 text-muted-foreground mb-4" />
 <h3 className="font-medium text-lg mb-2">Error Loading Documents</h3>
 <p className="text-muted-foreground mb-4">{error}</p>
 <Button onClick={() => window.location.reload()}>Retry</Button>
 </div>
 ) : filteredDocuments.length === 0 ? (
 <div className="flex flex-col items-center justify-center p-8 text-center">
 <FileText className="h-16 w-16 text-muted-foreground mb-4" />
 <h3 className="font-medium text-lg mb-2">No Documents Found</h3>
 <p className="text-muted-foreground mb-4">
 {searchQuery
 ? 'Try adjusting your search criteria'
 : 'Upload your first document to get started'}
 </p>
 <Button onClick={() => setShowUploadDialog(true)}>Upload Document</Button>
 </div>
 ) : viewMode === 'list' ? (
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Document</TableHead>
 <TableHead>Type</TableHead>
 <TableHead>Status</TableHead>
 <TableHead>Modified</TableHead>
 <TableHead className="text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {filteredDocuments.map(doc => (
 <TableRow key={doc.id}>
 <TableCell>
 <div className="flex items-center gap-2">
 {getDocumentIcon(doc.type)}
 <div>
 <div className="font-medium">{doc.name}</div>
 <div className="text-xs text-muted-foreground truncate max-w-[300px]">
 {doc.description}
 </div>
 </div>
 </div>
 </TableCell>
 <TableCell>
 <Badge variant="outline">{doc.type}</Badge>
 </TableCell>
 <TableCell>
 <Badge variant={doc.status === 'approved' ? 'success' : 'outline'}>
 {doc.status}
 </Badge>
 </TableCell>
 <TableCell>{formatDate(doc.dateModified || doc.modified_at)}</TableCell>
 <TableCell className="text-right">
 <div className="flex justify-end gap-1">
 {onAttachDocument && (
 <Button
 variant={attachedDocuments.includes(doc.id) ? 'default' : 'ghost'}
 size="icon"
 onClick={() => onAttachDocument(doc.id)}
 className={
 attachedDocuments.includes(doc.id)
 ? 'bg-green-600 hover:bg-green-700'
 : ''
 }
 title={
 attachedDocuments.includes(doc.id)
 ? 'Attached to Submission'
 : 'Attach to Submission'
 }
 data-testid={`button-attach-${doc.id}`}
 >
 {attachedDocuments.includes(doc.id) ? (
 <CheckCircle2 className="h-4 w-4" />
 ) : (
 <Link2 className="h-4 w-4" />
 )}
 </Button>
 )}
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleSelectDocument(doc)}
 >
 <Info className="h-4 w-4" />
 </Button>
 <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)}>
 <Download className="h-4 w-4" />
 </Button>
 <Button variant="ghost" size="icon" onClick={() => handleShare(doc)}>
 <Share2 className="h-4 w-4" />
 </Button>
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
 {filteredDocuments.map(doc => (
 <Card
 key={doc.id}
 className="cursor-pointer hover:border-primary"
 onClick={() => handleSelectDocument(doc)}
 >
 <CardContent className="p-0">
 <div className="p-3 border-b flex items-center justify-between">
 {getDocumentIcon(doc.type)}
 <Badge variant={doc.status === 'approved' ? 'success' : 'outline'}>
 {doc.status}
 </Badge>
 </div>
 <div className="p-3">
 <h3 className="font-medium truncate">{doc.name}</h3>
 <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
 {doc.description}
 </p>
 <div className="flex items-center text-xs text-muted-foreground mt-2">
 <User className="h-3 w-3 mr-1" />
 <span className="truncate">{doc.author || 'Unknown'}</span>
 <span className="mx-1">•</span>
 <CalendarDays className="h-3 w-3 mr-1" />
 <span>{formatDate(doc.dateModified || doc.modified_at)}</span>
 </div>
 </div>
 <div className="p-2 border-t flex justify-end gap-1">
 {onAttachDocument && (
 <Button
 variant={attachedDocuments.includes(doc.id) ? 'default' : 'ghost'}
 size="icon"
 className={`h-8 w-8 ${attachedDocuments.includes(doc.id) ? 'bg-green-600 hover:bg-green-700' : ''}`}
 onClick={e => {
 e.stopPropagation();
 onAttachDocument(doc.id);
 }}
 title={
 attachedDocuments.includes(doc.id)
 ? 'Attached to Submission'
 : 'Attach to Submission'
 }
 data-testid={`button-attach-grid-${doc.id}`}
 >
 {attachedDocuments.includes(doc.id) ? (
 <CheckCircle2 className="h-4 w-4" />
 ) : (
 <Link2 className="h-4 w-4" />
 )}
 </Button>
 )}
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={e => {
 e.stopPropagation();
 handleDownload(doc);
 }}
 >
 <Download className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8"
 onClick={e => {
 e.stopPropagation();
 handleShare(doc);
 }}
 >
 <Share2 className="h-4 w-4" />
 </Button>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </CardContent>
 </Card>

 {/* Upload Dialog */}
 <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Upload Document</DialogTitle>
 </DialogHeader>
 <div className="grid gap-4 py-4">
 <div className="grid gap-2">
 <label htmlFor="file">File</label>
 <Input id="file" type="file" onChange={handleFileChange} />
 </div>
 <div className="grid gap-2">
 <label htmlFor="name">Document Name</label>
 <Input
 id="name"
 value={uploadMetadata.name}
 onChange={e => setUploadMetadata({ ...uploadMetadata, name: e.target.value })}
 />
 </div>
 <div className="grid gap-2">
 <label htmlFor="description">Description</label>
 <Input
 id="description"
 value={uploadMetadata.description}
 onChange={e =>
 setUploadMetadata({ ...uploadMetadata, description: e.target.value })
 }
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div className="grid gap-2">
 <label htmlFor="type">Type</label>
 <select
 id="type"
 className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
 value={uploadMetadata.type}
 onChange={e => setUploadMetadata({ ...uploadMetadata, type: e.target.value })}
 >
 <option value="cer">CER</option>
 <option value="literature">Literature</option>
 <option value="data">Data</option>
 <option value="risk">Risk</option>
 <option value="pms">PMS</option>
 </select>
 </div>
 <div className="grid gap-2">
 <label htmlFor="status">Status</label>
 <select
 id="status"
 className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
 value={uploadMetadata.status}
 onChange={e => setUploadMetadata({ ...uploadMetadata, status: e.target.value })}
 >
 <option value="draft">Draft</option>
 <option value="approved">Approved</option>
 </select>
 </div>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
 Cancel
 </Button>
 <Button onClick={handleUpload}>Upload</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Share Dialog */}
 <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Share Document</DialogTitle>
 </DialogHeader>
 <div className="grid gap-4 py-4">
 {selectedDocument && (
 <div className="flex items-center gap-2 p-2 border rounded-md">
 {getDocumentIcon(selectedDocument.type)}
 <div>
 <div className="font-medium">{selectedDocument.name}</div>
 <div className="text-sm text-muted-foreground">
 {selectedDocument.type} • {selectedDocument.status}
 </div>
 </div>
 </div>
 )}
 <div className="grid gap-2">
 <label htmlFor="email">Share with Email</label>
 <Input id="email" type="email" placeholder="Enter email address" />
 </div>
 <div className="grid gap-2">
 <label htmlFor="permission">Permission</label>
 <select
 id="permission"
 className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
 >
 <option value="view">View only</option>
 <option value="comment">Comment</option>
 <option value="edit">Edit</option>
 </select>
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowShareDialog(false)}>
 Cancel
 </Button>
 <Button>Share</Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}
