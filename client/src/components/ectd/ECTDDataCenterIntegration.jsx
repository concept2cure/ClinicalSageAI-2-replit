/**
 * eCTD Data Center Integration Component
 * Provides eCTD-specific document management, version control, and content reuse
 * for seamless integration with eCTD Co-Author module
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
 FileText,
 Upload,
 Search,
 Filter,
 Download,
 Eye,
 Tags,
 GitBranch,
 History,
 RefreshCw,
 Database,
 Copy,
 Package,
 CheckCircle,
 AlertCircle,
 Clock,
 Link2,
 BookOpen,
 Archive,
 FolderOpen,
 ChevronRight,
 Shield,
 Zap,
 Activity,
 ArrowUpDown,
 GitCommit,
 GitPullRequest,
 FileSearch,
 Users,
 Lock,
 Unlock,
} from 'lucide-react';

// eCTD Module Mapping
const ECTD_MODULES = {
 'module1': {
 name: 'Module 1: Administrative',
 sections: [
 '1.0 Cover Letter',
 '1.1 Comprehensive Table of Contents',
 '1.2 Application Information',
 '1.3 Labeling',
 '1.4 References',
 '1.5 Application Forms',
 '1.6 Meetings',
 '1.14 Regulatory Information'
 ]
 },
 'module2': {
 name: 'Module 2: Common Technical Document Summaries',
 sections: [
 '2.1 Introduction',
 '2.2 CTD Table of Contents',
 '2.3 Quality Overall Summary',
 '2.4 Nonclinical Overview',
 '2.5 Clinical Overview',
 '2.6 Nonclinical Written and Tabulated Summaries',
 '2.7 Clinical Summary'
 ]
 },
 'module3': {
 name: 'Module 3: Quality',
 sections: [
 '3.1 Drug Substance',
 '3.2 Drug Product',
 '3.3 Appendices'
 ]
 },
 'module4': {
 name: 'Module 4: Nonclinical Study Reports',
 sections: [
 '4.1 Pharmacology',
 '4.2 Pharmacokinetics',
 '4.3 Toxicology'
 ]
 },
 'module5': {
 name: 'Module 5: Clinical Study Reports',
 sections: [
 '5.1 Tabular Listing of All Clinical Studies',
 '5.2 Clinical Study Reports',
 '5.3 Literature References',
 '5.4 Other Clinical Study Reports'
 ]
 }
};

// Document status and lifecycle states
const DOCUMENT_STATUS = {
 draft: { label: 'Draft', color: 'bg-gray-500', icon: Clock },
 review: { label: 'In Review', color: 'bg-yellow-500', icon: Eye },
 approved: { label: 'Approved', color: 'bg-stone-700', icon: CheckCircle },
 finalized: { label: 'Finalized', color: 'bg-green-500', icon: Shield },
 locked: { label: 'Locked', color: 'bg-red-500', icon: Lock },
};

export default function ECTDDataCenterIntegration({ onDocumentSelect, projectId }) {
 const [selectedModule, setSelectedModule] = useState('module1');
 const [selectedSection, setSelectedSection] = useState('');
 const [searchQuery, setSearchQuery] = useState('');
 const [viewMode, setViewMode] = useState('modules');
 const [showVersionHistory, setShowVersionHistory] = useState(false);
 const [selectedDocument, setSelectedDocument] = useState(null);
 const [showLineageView, setShowLineageView] = useState(false);
 const [contentReuseMode, setContentReuseMode] = useState(false);
 const [assemblyMode, setAssemblyMode] = useState(false);
 const [selectedDocuments, setSelectedDocuments] = useState([]);
 const { toast } = useToast();

 const organizationId = localStorage.getItem('currentOrganizationId') || '7';

 // Fetch eCTD documents with metadata
 const { data: documents = [], isLoading: documentsLoading, refetch: refetchDocuments } = useQuery({
 queryKey: ['/api/ectd-documents', { projectId, organizationId }],
 queryFn: async () => {
 const response = await fetch(`/api/ectd-documents?projectId=${projectId}&organizationId=${organizationId}`);
 if (!response.ok) throw new Error('Failed to fetch documents');
 return response.json();
 },
 });

 // Fetch document versions
 const { data: versions = [], isLoading: versionsLoading } = useQuery({
 queryKey: ['/api/ectd-documents/versions', selectedDocument?.id],
 enabled: !!selectedDocument?.id && showVersionHistory,
 queryFn: async () => {
 const response = await fetch(`/api/ectd-documents/${selectedDocument.id}/versions`);
 if (!response.ok) throw new Error('Failed to fetch versions');
 return response.json();
 },
 });

 // Fetch document lineage
 const { data: lineage = null, isLoading: lineageLoading } = useQuery({
 queryKey: ['/api/ectd-documents/lineage', selectedDocument?.id],
 enabled: !!selectedDocument?.id && showLineageView,
 queryFn: async () => {
 const response = await fetch(`/api/ectd-documents/${selectedDocument.id}/lineage`);
 if (!response.ok) throw new Error('Failed to fetch lineage');
 return response.json();
 },
 });

 // Create new document version mutation
 const createVersionMutation = useMutation({
 mutationFn: async ({ documentId, versionData }) => {
 return apiRequest(`/api/ectd-documents/${documentId}/versions`, {
 method: 'POST',
 body: JSON.stringify(versionData),
 });
 },
 onSuccess: () => {
 toast({
 title: 'Version Created',
 description: 'New document version has been created successfully',
 });
 queryClient.invalidateQueries(['/api/ectd-documents/versions']);
 },
 });

 // Link documents mutation
 const linkDocumentsMutation = useMutation({
 mutationFn: async ({ parentId, childId, linkType }) => {
 return apiRequest(`/api/ectd-documents/link`, {
 method: 'POST',
 body: JSON.stringify({ parentId, childId, linkType }),
 });
 },
 onSuccess: () => {
 toast({
 title: 'Documents Linked',
 description: 'Document relationship has been established',
 });
 queryClient.invalidateQueries(['/api/ectd-documents/lineage']);
 },
 });

 // Extract reusable content mutation
 const extractContentMutation = useMutation({
 mutationFn: async ({ documentId, sectionPath }) => {
 return apiRequest(`/api/ectd-documents/${documentId}/extract`, {
 method: 'POST',
 body: JSON.stringify({ sectionPath }),
 });
 },
 onSuccess: (data) => {
 toast({
 title: 'Content Extracted',
 description: 'Content has been extracted and is ready for reuse',
 });
 },
 });

 // Filter documents by module and section
 const filteredDocuments = documents.filter(doc => {
 const matchesModule = !selectedModule || doc.module === selectedModule;
 const matchesSection = !selectedSection || doc.section === selectedSection;
 const matchesSearch = !searchQuery || 
 doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
 doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
 
 return matchesModule && matchesSection && matchesSearch;
 });

 // Group documents by module and section
 const groupedDocuments = filteredDocuments.reduce((acc, doc) => {
 const module = doc.module || 'unassigned';
 const section = doc.section || 'general';
 
 if (!acc[module]) acc[module] = {};
 if (!acc[module][section]) acc[module][section] = [];
 
 acc[module][section].push(doc);
 return acc;
 }, {});

 const handleCreateVersion = () => {
 if (!selectedDocument) return;
 
 createVersionMutation.mutate({
 documentId: selectedDocument.id,
 versionData: {
 versionNumber: selectedDocument.version + 1,
 changeDescription: 'New version created from Data Center',
 author: 'Current User',
 },
 });
 };

 const handleLinkDocument = (parentDoc, childDoc, linkType) => {
 linkDocumentsMutation.mutate({
 parentId: parentDoc.id,
 childId: childDoc.id,
 linkType,
 });
 };

 const handleExtractContent = (doc, sectionPath) => {
 extractContentMutation.mutate({
 documentId: doc.id,
 sectionPath,
 });
 };

 const handleAssembleDocument = () => {
 if (selectedDocuments.length === 0) {
 toast({
 title: 'No Documents Selected',
 description: 'Please select documents to assemble',
 variant: 'destructive',
 });
 return;
 }

 // Navigate to eCTD Co-Author with selected documents
 const params = new URLSearchParams({
 action: 'assemble',
 documents: selectedDocuments.map(d => d.id).join(','),
 });
 
 window.location.href = `/ectd-coauthor?${params.toString()}`;
 };

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-4">
 <Database className="h-6 w-6 text-primary" />
 <div>
 <h2 className="text-xl font-semibold">eCTD Data Center</h2>
 <p className="text-sm text-muted-foreground">
 Manage eCTD documents with version control and content reuse
 </p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <Button
 variant={contentReuseMode ? 'default' : 'outline'}
 size="sm"
 onClick={() => setContentReuseMode(!contentReuseMode)}
 >
 <Copy className="h-4 w-4 mr-2" />
 Content Reuse
 </Button>
 <Button
 variant={assemblyMode ? 'default' : 'outline'}
 size="sm"
 onClick={() => setAssemblyMode(!assemblyMode)}
 >
 <Package className="h-4 w-4 mr-2" />
 Assembly Mode
 </Button>
 <Button variant="outline" size="sm" onClick={() => refetchDocuments()}>
 <RefreshCw className="h-4 w-4" />
 </Button>
 </div>
 </div>

 {/* Search and Filters */}
 <div className="flex gap-2">
 <div className="flex-1">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder="Search eCTD documents..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-10"
 data-testid="input-search-ectd"
 />
 </div>
 </div>
 <Select value={selectedModule} onValueChange={setSelectedModule}>
 <SelectTrigger className="w-[200px]">
 <SelectValue placeholder="Select module" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">All Modules</SelectItem>
 {Object.entries(ECTD_MODULES).map(([key, module]) => (
 <SelectItem key={key} value={key}>
 {module.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 {/* Main Content */}
 <Tabs value={viewMode} onValueChange={setViewMode}>
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="modules">By Module</TabsTrigger>
 <TabsTrigger value="timeline">Timeline</TabsTrigger>
 <TabsTrigger value="relationships">Relationships</TabsTrigger>
 </TabsList>

 <TabsContent value="modules" className="mt-4">
 <ScrollArea className="h-[500px]">
 <Accordion type="single" collapsible className="w-full">
 {Object.entries(groupedDocuments).map(([module, sections]) => (
 <AccordionItem key={module} value={module}>
 <AccordionTrigger>
 <div className="flex items-center justify-between w-full pr-4">
 <span className="font-medium">{ECTD_MODULES[module]?.name || 'Unassigned'}</span>
 <Badge variant="secondary">
 {Object.values(sections).flat().length} documents
 </Badge>
 </div>
 </AccordionTrigger>
 <AccordionContent>
 <div className="space-y-2 p-2">
 {Object.entries(sections).map(([section, docs]) => (
 <div key={section} className="space-y-2">
 <div className="text-sm font-medium text-muted-foreground pl-2">
 {section}
 </div>
 {docs.map(doc => (
 <Card 
 key={doc.id}
 className={`cursor-pointer hover:bg-accent transition-colors ${
 assemblyMode && selectedDocuments.includes(doc) ? 'ring-2 ring-primary' : ''
 }`}
 onClick={() => {
 if (assemblyMode) {
 setSelectedDocuments(prev => 
 prev.includes(doc) 
 ? prev.filter(d => d !== doc)
 : [...prev, doc]
 );
 } else if (contentReuseMode) {
 handleExtractContent(doc, section);
 } else {
 setSelectedDocument(doc);
 onDocumentSelect?.(doc);
 }
 }}
 >
 <CardContent className="p-3">
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4" />
 <span className="font-medium">{doc.title}</span>
 {doc.version > 1 && (
 <Badge variant="outline" className="text-xs">
 v{doc.version}
 </Badge>
 )}
 </div>
 {doc.description && (
 <p className="text-sm text-muted-foreground mt-1">
 {doc.description}
 </p>
 )}
 <div className="flex items-center gap-2 mt-2">
 <Badge 
 className={DOCUMENT_STATUS[doc.status]?.color}
 variant="secondary"
 >
 {DOCUMENT_STATUS[doc.status]?.label || doc.status}
 </Badge>
 <span className="text-xs text-muted-foreground">
 Modified: {new Date(doc.updatedAt).toLocaleDateString()}
 </span>
 </div>
 </div>
 <div className="flex gap-1">
 {doc.hasLineage && (
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 setSelectedDocument(doc);
 setShowLineageView(true);
 }}
 >
 <GitBranch className="h-4 w-4" />
 </Button>
 )}
 <Button
 variant="ghost"
 size="sm"
 onClick={(e) => {
 e.stopPropagation();
 setSelectedDocument(doc);
 setShowVersionHistory(true);
 }}
 >
 <History className="h-4 w-4" />
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 ))}
 </div>
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </ScrollArea>
 </TabsContent>

 <TabsContent value="timeline" className="mt-4">
 <ScrollArea className="h-[500px]">
 <div className="space-y-4 p-4">
 {filteredDocuments
 .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
 .map(doc => (
 <div key={doc.id} className="flex gap-4">
 <div className="flex flex-col items-center">
 <div className="h-2 w-2 rounded-full bg-primary" />
 <div className="h-full w-px bg-border" />
 </div>
 <Card className="flex-1">
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4" />
 <span className="font-medium">{doc.title}</span>
 <Badge variant="outline">v{doc.version}</Badge>
 </div>
 <p className="text-sm text-muted-foreground mt-1">
 {ECTD_MODULES[doc.module]?.name} - {doc.section}
 </p>
 <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
 <span>Author: {doc.author}</span>
 <span>{new Date(doc.updatedAt).toLocaleString()}</span>
 </div>
 </div>
 <Badge className={DOCUMENT_STATUS[doc.status]?.color}>
 {DOCUMENT_STATUS[doc.status]?.label}
 </Badge>
 </div>
 </CardContent>
 </Card>
 </div>
 ))}
 </div>
 </ScrollArea>
 </TabsContent>

 <TabsContent value="relationships" className="mt-4">
 <Alert>
 <GitBranch className="h-4 w-4" />
 <AlertTitle>Document Relationships</AlertTitle>
 <AlertDescription>
 View and manage relationships between eCTD documents, including parent-child relationships,
 cross-references, and content dependencies.
 </AlertDescription>
 </Alert>
 <div className="mt-4">
 {selectedDocument && showLineageView && (
 <Card>
 <CardHeader>
 <CardTitle>Document Lineage: {selectedDocument.title}</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {lineage?.parents?.length > 0 && (
 <div>
 <Label>Parent Documents</Label>
 <div className="mt-2 space-y-2">
 {lineage.parents.map(parent => (
 <div key={parent.id} className="flex items-center gap-2">
 <ArrowUpDown className="h-4 w-4" />
 <span className="text-sm">{parent.title}</span>
 <Badge variant="outline" className="text-xs">
 {parent.relationship}
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 {lineage?.children?.length > 0 && (
 <div>
 <Label>Child Documents</Label>
 <div className="mt-2 space-y-2">
 {lineage.children.map(child => (
 <div key={child.id} className="flex items-center gap-2">
 <ArrowUpDown className="h-4 w-4 rotate-180" />
 <span className="text-sm">{child.title}</span>
 <Badge variant="outline" className="text-xs">
 {child.relationship}
 </Badge>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </CardContent>
 </Card>
 )}
 </div>
 </TabsContent>
 </Tabs>

 {/* Assembly Mode Actions */}
 {assemblyMode && selectedDocuments.length > 0 && (
 <div className="fixed bottom-4 right-4 z-50">
 <Card>
 <CardContent className="p-4">
 <div className="flex items-center gap-4">
 <span className="text-sm font-medium">
 {selectedDocuments.length} documents selected
 </span>
 <Button size="sm" onClick={handleAssembleDocument}>
 <Package className="h-4 w-4 mr-2" />
 Assemble into eCTD
 </Button>
 <Button 
 variant="outline" 
 size="sm" 
 onClick={() => setSelectedDocuments([])}
 >
 Clear Selection
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Version History Dialog */}
 <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Version History: {selectedDocument?.title}</DialogTitle>
 <DialogDescription>
 View and manage document versions
 </DialogDescription>
 </DialogHeader>
 <ScrollArea className="h-[400px] mt-4">
 <div className="space-y-3">
 {versions.map(version => (
 <Card key={version.id}>
 <CardContent className="p-3">
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2">
 <GitCommit className="h-4 w-4" />
 <span className="font-medium">Version {version.versionNumber}</span>
 {version.isCurrent && (
 <Badge variant="default" className="text-xs">Current</Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground mt-1">
 {version.changeDescription}
 </p>
 <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
 <span>By: {version.author}</span>
 <span>{new Date(version.createdAt).toLocaleString()}</span>
 </div>
 </div>
 <div className="flex gap-1">
 <Button variant="ghost" size="sm">
 <Eye className="h-4 w-4" />
 </Button>
 {!version.isCurrent && (
 <Button variant="ghost" size="sm">
 <GitPullRequest className="h-4 w-4" />
 </Button>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </ScrollArea>
 <DialogFooter>
 <Button onClick={handleCreateVersion}>
 Create New Version
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}