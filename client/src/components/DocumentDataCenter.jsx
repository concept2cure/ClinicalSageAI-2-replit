// Enhanced Document Data Center with integrated file vault and 3-axis tagging
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from '@/components/ui/dialog';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuLabel,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
 FileText,
 Upload,
 Search,
 Filter,
 Download,
 Eye,
 Tags,
 FileCheck,
 Heart,
 Zap,
 Shield,
 Clock,
 Package,
 Users,
 Activity,
 Factory,
 AlertTriangle,
 ChevronRight,
 Folder,
 CheckCircle,
 Sparkles,
 UploadCloud,
 X,
 RefreshCw,
 Database,
 FileSearch,
 Copy,
 MoreVertical,
 Calendar,
 Code,
 Trash2,
} from 'lucide-react';

// Category icons and metadata
const CATEGORY_CONFIG = {
 bench_test: { icon: FileCheck, color: 'bg-stone-700', label: 'Bench Testing' },
 biocompatibility: { icon: Heart, color: 'bg-green-500', label: 'Biocompatibility' },
 predicate_labeling: { icon: FileText, color: 'bg-purple-500', label: 'Predicate Labeling' },
 electrical_safety: { icon: Zap, color: 'bg-yellow-500', label: 'Electrical Safety' },
 software_validation: { icon: Code, color: 'bg-cyan-500', label: 'Software Validation' },
 sterilization: { icon: Shield, color: 'bg-red-500', label: 'Sterilization' },
 shelf_life: { icon: Clock, color: 'bg-orange-500', label: 'Shelf Life/Stability' },
 packaging: { icon: Package, color: 'bg-indigo-500', label: 'Packaging' },
 human_factors: { icon: Users, color: 'bg-pink-500', label: 'Human Factors' },
 clinical_data: { icon: Activity, color: 'bg-teal-500', label: 'Clinical Data' },
 manufacturing: { icon: Factory, color: 'bg-gray-500', label: 'Manufacturing' },
 risk_analysis: { icon: AlertTriangle, color: 'bg-amber-500', label: 'Risk Analysis' },
};

export default function DocumentDataCenter() {
 const [files, setFiles] = useState([]);
 const [categories, setCategories] = useState([]);
 const [standards, setStandards] = useState([]);
 const [components, setComponents] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategories, setSelectedCategories] = useState([]);
 const [selectedStandards, setSelectedStandards] = useState([]);
 const [selectedComponents, setSelectedComponents] = useState([]);
 const [viewMode, setViewMode] = useState('grid');
 const [isDragging, setIsDragging] = useState(false);
 const [uploadProgress, setUploadProgress] = useState({});
 const [statistics, setStatistics] = useState(null);
 const [selectedFile, setSelectedFile] = useState(null);
 const [showTagEditor, setShowTagEditor] = useState(false);
 const [aiTaggingEnabled, setAiTaggingEnabled] = useState(true);
 const [deepSearchMode, setDeepSearchMode] = useState(false);
 const { toast } = useToast();

 // Get organization ID from localStorage or fall back to default
 const organizationId = localStorage.getItem('currentOrganizationId') || localStorage.getItem('organizationId') || '7';

 // Load initial data
 useEffect(() => {
 loadReferenceData();
 loadFiles();
 loadStatistics();
 }, []);

 // Debounced search effect
 useEffect(() => {
 const timer = setTimeout(() => {
 if (searchQuery || selectedCategories.length || selectedStandards.length || selectedComponents.length) {
 if (deepSearchMode) {
 performDeepSearch();
 } else {
 loadFiles();
 }
 }
 }, 500);
 return () => clearTimeout(timer);
 }, [searchQuery, selectedCategories, selectedStandards, selectedComponents, deepSearchMode]);

 const loadReferenceData = async () => {
 try {
 const headers = { 'X-Organization-Id': organizationId };
 
 const [catRes, stdRes, compRes] = await Promise.all([
 fetch('/api/device-data-center/categories', { headers }),
 fetch('/api/device-data-center/standards', { headers }),
 fetch('/api/device-data-center/components', { headers }),
 ]);

 if (catRes.ok) setCategories(await catRes.json().then(d => d.categories || []));
 if (stdRes.ok) setStandards(await stdRes.json().then(d => d.standards || []));
 if (compRes.ok) setComponents(await compRes.json().then(d => d.components || []));
 } catch (error) {
 toast({
 title: 'Error',
 description: 'Failed to load reference data',
 variant: 'destructive',
 });
 }
 };

 const loadFiles = async () => {
 setLoading(true);
 try {
 const params = new URLSearchParams();
 if (searchQuery) params.append('search', searchQuery);
 selectedCategories.forEach(cat => params.append('category', cat));
 selectedStandards.forEach(std => params.append('standard', std));
 selectedComponents.forEach(comp => params.append('component', comp));

 const response = await fetch(`/api/device-data-center/files?${params}`, {
 headers: { 'X-Organization-Id': organizationId },
 });

 if (response.ok) {
 const data = await response.json();
 setFiles(data.files || []);
 }
 } catch (error) {
 toast({
 title: 'Error',
 description: 'Failed to load files',
 variant: 'destructive',
 });
 } finally {
 setLoading(false);
 }
 };

 const performDeepSearch = async () => {
 setLoading(true);
 try {
 const response = await fetch('/api/device-data-center/search/deep', {
 method: 'POST',
 headers: {
 'X-Organization-Id': organizationId,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 query: searchQuery,
 filters: {
 categories: selectedCategories,
 testStandards: selectedStandards,
 components: selectedComponents,
 },
 }),
 });

 if (response.ok) {
 const data = await response.json();
 setFiles(data.results || []);
 toast({
 title: 'Deep Search Complete',
 description: `Found ${data.count} documents`,
 });
 }
 } catch (error) {
 toast({
 title: 'Search Error',
 description: 'Deep search failed',
 variant: 'destructive',
 });
 } finally {
 setLoading(false);
 }
 };

 const loadStatistics = async () => {
 try {
 const response = await fetch('/api/device-data-center/stats', {
 headers: { 'X-Organization-Id': organizationId },
 });
 if (response.ok) {
 const data = await response.json();
 setStatistics(data.statistics);
 }
 } catch (error) {
 console.error('Failed to load statistics:', error);
 }
 };

 const handleFileUpload = async (files) => {
 const fileList = Array.isArray(files) ? files : Array.from(files);
 
 for (const file of fileList) {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('category', selectedCategories[0] || 'bench_test');
 formData.append('deviceName', 'Medical Device');
 formData.append('aiTagging', aiTaggingEnabled);

 // Track upload progress
 setUploadProgress(prev => ({
 ...prev,
 [file.name]: 0,
 }));

 try {
 const response = await fetch('/api/device-data-center/upload', {
 method: 'POST',
 headers: { 'X-Organization-Id': organizationId },
 body: formData,
 });

 if (response.ok) {
 const result = await response.json();
 setUploadProgress(prev => ({
 ...prev,
 [file.name]: 100,
 }));
 
 toast({
 title: 'Upload Successful',
 description: (
 <div className="space-y-1">
 <p>{file.name} uploaded</p>
 {result.aiTags && (
 <p className="text-xs">
 AI confidence: {Math.round(result.aiTags.confidence * 100)}%
 </p>
 )}
 </div>
 ),
 });
 }
 } catch (error) {
 toast({
 title: 'Upload Failed',
 description: `Failed to upload ${file.name}`,
 variant: 'destructive',
 });
 } finally {
 // Clean up progress after delay
 setTimeout(() => {
 setUploadProgress(prev => {
 const newProgress = { ...prev };
 delete newProgress[file.name];
 return newProgress;
 });
 }, 2000);
 }
 }
 
 loadFiles();
 loadStatistics();
 };

 const handleDrop = (e) => {
 e.preventDefault();
 setIsDragging(false);
 const files = e.dataTransfer.files;
 if (files.length > 0) handleFileUpload(files);
 };

 const handleDragOver = (e) => {
 e.preventDefault();
 setIsDragging(true);
 };

 const handleDragLeave = () => {
 setIsDragging(false);
 };

 const updateFileTags = async (fileId, updates) => {
 try {
 const response = await fetch(`/api/device-data-center/files/${fileId}/tags`, {
 method: 'PATCH',
 headers: {
 'X-Organization-Id': organizationId,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(updates),
 });

 if (response.ok) {
 toast({
 title: 'Tags Updated',
 description: 'Document tags have been updated successfully',
 });
 loadFiles();
 }
 } catch (error) {
 toast({
 title: 'Update Failed',
 description: 'Failed to update document tags',
 variant: 'destructive',
 });
 }
 };

 const getCitationForDocument = async (fileId) => {
 try {
 const response = await fetch(`/api/device-data-center/citations`, {
 method: 'POST',
 headers: {
 'X-Organization-Id': organizationId,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ documentIds: [fileId] }),
 });

 if (response.ok) {
 const data = await response.json();
 const citation = data.citations[0];
 await navigator.clipboard.writeText(citation.citationText);
 toast({
 title: 'Citation Copied',
 description: 'Document citation copied to clipboard',
 });
 }
 } catch (error) {
 toast({
 title: 'Citation Error',
 description: 'Failed to get document citation',
 variant: 'destructive',
 });
 }
 };

 const deleteFile = async (fileId) => {
 try {
 const response = await fetch(`/api/device-data-center/file/${fileId}`, {
 method: 'DELETE',
 headers: { 'X-Organization-Id': organizationId },
 });

 if (response.ok) {
 toast({
 title: 'File Deleted',
 description: 'Document has been deleted successfully',
 });
 loadFiles();
 loadStatistics();
 }
 } catch (error) {
 toast({
 title: 'Delete Failed',
 description: 'Failed to delete document',
 variant: 'destructive',
 });
 }
 };

 const FileCard = ({ file }) => {
 const CategoryIcon = CATEGORY_CONFIG[file.category]?.icon || FileText;
 const categoryColor = CATEGORY_CONFIG[file.category]?.color || 'bg-gray-500';
 
 return (
 <Card className="hover:shadow-lg transition-all cursor-pointer group">
 <CardHeader className="pb-3">
 <div className="flex items-start justify-between">
 <div className="flex items-center space-x-2">
 <div className={`p-2 rounded-lg ${categoryColor} bg-opacity-10`}>
 <CategoryIcon className={`h-5 w-5 ${categoryColor.replace('bg-', 'text-')}`} />
 </div>
 <div className="flex-1">
 <h4 className="font-medium text-sm truncate" data-testid={`file-name-${file.id}`}>
 {file.fileName}
 </h4>
 <p className="text-xs text-muted-foreground">
 {file.deviceName} • {new Date(file.createdAt).toLocaleDateString()}
 </p>
 </div>
 </div>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="h-8 w-8">
 <MoreVertical className="h-4 w-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end">
 <DropdownMenuLabel>Actions</DropdownMenuLabel>
 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={() => window.open(`/api/device-data-center/file/${file.id}`)}>
 <Eye className="mr-2 h-4 w-4" />
 View
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => getCitationForDocument(file.id)}>
 <Copy className="mr-2 h-4 w-4" />
 Copy Citation
 </DropdownMenuItem>
 <DropdownMenuItem onClick={() => {
 setSelectedFile(file);
 setShowTagEditor(true);
 }}>
 <Tags className="mr-2 h-4 w-4" />
 Edit Tags
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem 
 className="text-destructive"
 onClick={() => deleteFile(file.id)}
 >
 <Trash2 className="mr-2 h-4 w-4" />
 Delete
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </CardHeader>
 <CardContent className="space-y-3">
 {/* Test Standards */}
 {file.testStandards?.length > 0 && (
 <div className="flex flex-wrap gap-1">
 {file.testStandards.slice(0, 3).map(std => (
 <Badge key={std} variant="outline" className="text-xs">
 {std}
 </Badge>
 ))}
 {file.testStandards.length > 3 && (
 <Badge variant="outline" className="text-xs">
 +{file.testStandards.length - 3}
 </Badge>
 )}
 </div>
 )}
 
 {/* Tags */}
 {file.tags?.length > 0 && (
 <div className="flex flex-wrap gap-1">
 {file.tags.slice(0, 4).map(tag => (
 <Badge key={tag} variant="secondary" className="text-xs">
 {tag}
 </Badge>
 ))}
 </div>
 )}
 
 {/* AI Confidence */}
 {file.metadata?.aiTagging?.confidence && (
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <Sparkles className="h-3 w-3" />
 AI: {Math.round(file.metadata.aiTagging.confidence * 100)}%
 </div>
 )}
 </CardContent>
 </Card>
 );
 };

 return (
 <div className="container mx-auto p-6 max-w-7xl">
 {/* Header */}
 <div className="mb-6">
 <h1 className="text-3xl font-bold mb-2" data-testid="document-data-center-title">
 Document Data Center
 </h1>
 <p className="text-muted-foreground">
 Intelligent 510(k) file management with AI-powered 3-axis tagging
 </p>
 </div>

 {/* Statistics Bar */}
 {statistics && (
 <div className="grid grid-cols-4 gap-4 mb-6">
 <Card>
 <CardContent className="flex items-center p-4">
 <Database className="h-8 w-8 text-stone-500 mr-3" />
 <div>
 <p className="text-2xl font-bold">{statistics.totalDocuments}</p>
 <p className="text-xs text-muted-foreground">Total Documents</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="flex items-center p-4">
 <UploadCloud className="h-8 w-8 text-green-500 mr-3" />
 <div>
 <p className="text-2xl font-bold">{statistics.recentUploads}</p>
 <p className="text-xs text-muted-foreground">Recent Uploads</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="flex items-center p-4">
 <CheckCircle className="h-8 w-8 text-purple-500 mr-3" />
 <div>
 <p className="text-2xl font-bold">
 {statistics.byStatus?.find(s => s.status === 'approved')?.count || 0}
 </p>
 <p className="text-xs text-muted-foreground">Approved</p>
 </div>
 </CardContent>
 </Card>
 <Card>
 <CardContent className="flex items-center p-4">
 <FileSearch className="h-8 w-8 text-orange-500 mr-3" />
 <div>
 <p className="text-2xl font-bold">
 {statistics.topStandards?.length || 0}
 </p>
 <p className="text-xs text-muted-foreground">Standards Used</p>
 </div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Search and Filters */}
 <Card className="mb-6">
 <CardContent className="p-4">
 <div className="space-y-4">
 {/* Search Bar */}
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search documents..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-10"
 data-testid="search-input"
 />
 </div>
 <Button
 variant={deepSearchMode ? 'default' : 'outline'}
 onClick={() => setDeepSearchMode(!deepSearchMode)}
 data-testid="deep-search-toggle"
 >
 <FileSearch className="h-4 w-4 mr-2" />
 Deep Search
 </Button>
 <Button
 variant={aiTaggingEnabled ? 'default' : 'outline'}
 onClick={() => setAiTaggingEnabled(!aiTaggingEnabled)}
 data-testid="ai-tagging-toggle"
 >
 <Sparkles className="h-4 w-4 mr-2" />
 AI Tagging
 </Button>
 </div>

 {/* Filter Chips */}
 <div className="flex flex-wrap gap-2">
 {/* Category Filter */}
 <div className="flex flex-wrap gap-1">
 {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
 <Badge
 key={key}
 variant={selectedCategories.includes(key) ? 'default' : 'outline'}
 className="cursor-pointer"
 onClick={() => {
 setSelectedCategories(prev =>
 prev.includes(key)
 ? prev.filter(c => c !== key)
 : [...prev, key]
 );
 }}
 data-testid={`category-filter-${key}`}
 >
 <config.icon className="h-3 w-3 mr-1" />
 {config.label}
 </Badge>
 ))}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 {/* Upload Area */}
 <div
 className={`border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-all ${
 isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
 }`}
 onDrop={handleDrop}
 onDragOver={handleDragOver}
 onDragLeave={handleDragLeave}
 data-testid="drop-zone"
 >
 <UploadCloud className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
 <h3 className="text-lg font-semibold mb-2">
 Drag and drop files here
 </h3>
 <p className="text-sm text-muted-foreground mb-4">
 or click to browse files
 </p>
 <Input
 type="file"
 multiple
 className="hidden"
 id="file-upload"
 onChange={(e) => handleFileUpload(e.target.files)}
 data-testid="file-upload-input"
 />
 <Label htmlFor="file-upload">
 <Button variant="outline" asChild>
 <span>
 <Upload className="h-4 w-4 mr-2" />
 Select Files
 </span>
 </Button>
 </Label>
 </div>

 {/* Upload Progress */}
 {Object.keys(uploadProgress).length > 0 && (
 <Card className="mb-6">
 <CardContent className="p-4 space-y-2">
 {Object.entries(uploadProgress).map(([fileName, progress]) => (
 <div key={fileName} className="space-y-1">
 <div className="flex justify-between text-sm">
 <span>{fileName}</span>
 <span>{progress}%</span>
 </div>
 <Progress value={progress} className="h-2" />
 </div>
 ))}
 </CardContent>
 </Card>
 )}

 {/* File Grid/List */}
 <div className="space-y-4">
 <div className="flex justify-between items-center">
 <h3 className="text-lg font-semibold">
 Documents ({files.length})
 </h3>
 <div className="flex gap-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
 data-testid="view-mode-toggle"
 >
 {viewMode === 'grid' ? 'List View' : 'Grid View'}
 </Button>
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 loadFiles();
 loadStatistics();
 }}
 data-testid="refresh-button"
 >
 <RefreshCw className="h-4 w-4 mr-2" />
 Refresh
 </Button>
 </div>
 </div>

 {loading ? (
 <div className="flex justify-center py-12">
 <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
 </div>
 ) : files.length === 0 ? (
 <Card>
 <CardContent className="flex flex-col items-center justify-center py-12">
 <Database className="h-12 w-12 text-muted-foreground mb-4" />
 <h3 className="text-lg font-semibold mb-2">No documents found</h3>
 <p className="text-sm text-muted-foreground text-center">
 Upload documents or adjust your search filters
 </p>
 </CardContent>
 </Card>
 ) : (
 <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
 {files.map(file => (
 <FileCard key={file.id} file={file} />
 ))}
 </div>
 )}
 </div>

 {/* Tag Editor Dialog */}
 <Dialog open={showTagEditor} onOpenChange={setShowTagEditor}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Edit Document Tags</DialogTitle>
 <DialogDescription>
 Update categories, standards, and components for this document
 </DialogDescription>
 </DialogHeader>
 {selectedFile && (
 <Tabs defaultValue="categories" className="mt-4">
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="categories">Categories</TabsTrigger>
 <TabsTrigger value="standards">Standards</TabsTrigger>
 <TabsTrigger value="components">Components</TabsTrigger>
 </TabsList>
 <TabsContent value="categories" className="space-y-4">
 <ScrollArea className="h-[300px]">
 <div className="space-y-2">
 {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
 <div key={key} className="flex items-center space-x-2">
 <Checkbox
 id={key}
 checked={selectedFile.categories?.includes(key)}
 onCheckedChange={(checked) => {
 const newCategories = checked
 ? [...(selectedFile.categories || []), key]
 : (selectedFile.categories || []).filter(c => c !== key);
 setSelectedFile({ ...selectedFile, categories: newCategories });
 }}
 />
 <Label htmlFor={key} className="flex items-center cursor-pointer">
 <config.icon className="h-4 w-4 mr-2" />
 {config.label}
 </Label>
 </div>
 ))}
 </div>
 </ScrollArea>
 </TabsContent>
 <TabsContent value="standards" className="space-y-4">
 <ScrollArea className="h-[300px]">
 <div className="space-y-2">
 {standards.map(std => (
 <div key={std.id} className="flex items-center space-x-2">
 <Checkbox
 id={`std-${std.id}`}
 checked={selectedFile.testStandards?.includes(std.standardCode)}
 />
 <Label htmlFor={`std-${std.id}`} className="cursor-pointer">
 <div>
 <p className="font-medium">{std.standardCode}</p>
 <p className="text-xs text-muted-foreground">{std.standardName}</p>
 </div>
 </Label>
 </div>
 ))}
 </div>
 </ScrollArea>
 </TabsContent>
 <TabsContent value="components" className="space-y-4">
 <ScrollArea className="h-[300px]">
 <div className="space-y-2">
 {components.map(comp => (
 <div key={comp.id} className="flex items-center space-x-2">
 <Checkbox
 id={`comp-${comp.id}`}
 checked={selectedFile.deviceComponents?.includes(comp.componentCode)}
 />
 <Label htmlFor={`comp-${comp.id}`} className="cursor-pointer">
 <div>
 <p className="font-medium">{comp.componentName}</p>
 <p className="text-xs text-muted-foreground">{comp.componentType}</p>
 </div>
 </Label>
 </div>
 ))}
 </div>
 </ScrollArea>
 </TabsContent>
 </Tabs>
 )}
 <DialogFooter>
 <Button variant="outline" onClick={() => setShowTagEditor(false)}>
 Cancel
 </Button>
 <Button
 onClick={() => {
 if (selectedFile) {
 updateFileTags(selectedFile.id, {
 categories: selectedFile.categories,
 testStandards: selectedFile.testStandards,
 components: selectedFile.deviceComponents,
 });
 setShowTagEditor(false);
 }
 }}
 >
 Save Changes
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}