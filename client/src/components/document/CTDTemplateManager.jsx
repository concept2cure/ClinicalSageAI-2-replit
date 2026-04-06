import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

import {
 Search,
 FileText,
 Folder,
 ChevronRight,
 Plus,
 Download,
 Calendar,
 Users,
 CheckCircle2,
} from 'lucide-react';

import { ctdTemplates } from '../../data/ctd-templates'; // We'll create this next
import { getFullCTDStructure } from '../../utils/ctd-template-validator';
import { mapCTDToGuidelines } from '../../utils/ich-guidelines';

/**
 * CTD Template Manager Component
 *
 * This component provides a comprehensive interface to browse, select,
 * and create documents based on CTD templates, covering all modules
 * specified in the ICH guidelines.
 */
const CTDTemplateManager = () => {
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedModule, setSelectedModule] = useState('all');
 const [filteredTemplates, setFilteredTemplates] = useState([]);
 const [recentTemplates, setRecentTemplates] = useState([]);
 const [popularTemplates, setPopularTemplates] = useState([]);
 const [activeView, setActiveView] = useState('browse'); // 'browse', 'create', 'details'
 const [selectedTemplate, setSelectedTemplate] = useState(null);
 const [ctdStructure, setCTDStructure] = useState(null);

 const navigate = useNavigate();

 useEffect(() => {
 // Load CTD structure
 setCTDStructure(getFullCTDStructure());

 // Filter templates based on search and selected module
 let filtered = [...ctdTemplates];

 if (searchQuery) {
 const query = searchQuery.toLowerCase();
 filtered = filtered.filter(
 template =>
 template.title.toLowerCase().includes(query) ||
 template.moduleSection.toLowerCase().includes(query) ||
 template.description.toLowerCase().includes(query)
 );
 }

 if (selectedModule !== 'all') {
 filtered = filtered.filter(template => template.moduleId === selectedModule);
 }

 setFilteredTemplates(filtered);

 // Set recent templates (would be from user history in a real implementation)
 setRecentTemplates(ctdTemplates.slice(0, 5));

 // Set popular templates (would be from analytics in a real implementation)
 setPopularTemplates(ctdTemplates.filter(t => t.popularity > 8).slice(0, 5));
 }, [searchQuery, selectedModule]);

 const handleTemplateSelect = template => {
 setSelectedTemplate(template);
 setActiveView('details');
 };

 const handleCreateDocument = template => {
 // In a real implementation, this would create a new document
 // based on the template and navigate to the editor
 console.log('Creating document from template:', template);
 navigate(`/document/editor?template=${template.id}`);
 };

 const renderTemplateList = templates => (
 <div className="space-y-4">
 {templates.map(template => (
 <Card
 key={template.id}
 className="cursor-pointer hover:bg-slate-50"
 onClick={() => handleTemplateSelect(template)}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex items-start space-x-4">
 <div className="p-2 bg-orange-100 rounded-md">
 <FileText className="h-6 w-6 text-orange-600" />
 </div>
 <div>
 <h3 className="font-medium">{template.title}</h3>
 <p className="text-sm text-gray-500 mt-1">Module {template.moduleSection}</p>
 </div>
 </div>
 <Badge variant="outline" className="text-xs">
 {template.documentType}
 </Badge>
 </div>
 <p className="text-sm mt-4 text-gray-600">{template.description}</p>
 <div className="flex items-center justify-between mt-4">
 <div className="flex items-center space-x-2 text-xs text-gray-500">
 <Calendar className="h-3 w-3" />
 <span>Updated {template.lastUpdated}</span>
 </div>
 <div className="flex items-center space-x-1">
 <Users className="h-3 w-3 text-gray-400" />
 <span className="text-xs text-gray-500">{template.usageCount} uses</span>
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 );

 const renderBrowseView = () => (
 <div className="space-y-6">
 <div className="flex items-center space-x-4">
 <div className="relative flex-1">
 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
 <Input
 placeholder="Search templates..."
 className="pl-8"
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 />
 </div>
 <Button variant="outline" onClick={() => setActiveView('create')}>
 <Plus className="h-4 w-4 mr-2" />
 New Document
 </Button>
 </div>

 <Tabs defaultValue="all" onValueChange={setSelectedModule}>
 <TabsList className="grid grid-cols-6 mb-4">
 <TabsTrigger value="all">All</TabsTrigger>
 <TabsTrigger value="module1">Module 1</TabsTrigger>
 <TabsTrigger value="module2">Module 2</TabsTrigger>
 <TabsTrigger value="module3">Module 3</TabsTrigger>
 <TabsTrigger value="module4">Module 4</TabsTrigger>
 <TabsTrigger value="module5">Module 5</TabsTrigger>
 </TabsList>

 <TabsContent value="all" className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle>Recent Templates</CardTitle>
 <CardDescription>Recently used document templates</CardDescription>
 </CardHeader>
 <CardContent>{renderTemplateList(recentTemplates)}</CardContent>
 </Card>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle>Popular Templates</CardTitle>
 <CardDescription>Most commonly used templates</CardDescription>
 </CardHeader>
 <CardContent>{renderTemplateList(popularTemplates)}</CardContent>
 </Card>
 </div>

 <Card>
 <CardHeader className="pb-3">
 <CardTitle>All Templates</CardTitle>
 <CardDescription>Browse all available CTD templates</CardDescription>
 </CardHeader>
 <CardContent>
 {filteredTemplates.length > 0 ? (
 renderTemplateList(filteredTemplates)
 ) : (
 <div className="text-center py-8 text-gray-500">
 No templates found. Try adjusting your search.
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>

 {['module1', 'module2', 'module3', 'module4', 'module5'].map(module => (
 <TabsContent key={module} value={module} className="space-y-6">
 <Card>
 <CardHeader className="pb-3">
 <CardTitle>{module.charAt(0).toUpperCase() + module.slice(1)} Templates</CardTitle>
 <CardDescription>
 {module === 'module1' && 'Administrative and Prescribing Information'}
 {module === 'module2' && 'Common Technical Document Summaries'}
 {module === 'module3' && 'Quality (Chemistry, Manufacturing, and Controls)'}
 {module === 'module4' && 'Nonclinical Study Reports'}
 {module === 'module5' && 'Clinical Study Reports'}
 </CardDescription>
 </CardHeader>
 <CardContent>
 {filteredTemplates.length > 0 ? (
 renderTemplateList(filteredTemplates)
 ) : (
 <div className="text-center py-8 text-gray-500">
 No templates found. Try adjusting your search.
 </div>
 )}
 </CardContent>
 </Card>
 </TabsContent>
 ))}
 </Tabs>
 </div>
 );

 const renderTemplateDetails = () => {
 if (!selectedTemplate) return null;

 const relatedGuidelines = mapCTDToGuidelines(selectedTemplate.moduleSection);

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-2">
 <Button variant="ghost" onClick={() => setActiveView('browse')}>
 Back to Templates
 </Button>
 <ChevronRight className="h-4 w-4 text-gray-500" />
 <span className="text-gray-500">{selectedTemplate.title}</span>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
 <div className="md:col-span-2 space-y-6">
 <Card>
 <CardHeader>
 <div className="flex items-center justify-between">
 <div>
 <CardTitle>{selectedTemplate.title}</CardTitle>
 <CardDescription>Module {selectedTemplate.moduleSection}</CardDescription>
 </div>
 <Button onClick={() => handleCreateDocument(selectedTemplate)}>
 Create Document
 </Button>
 </div>
 </CardHeader>
 <CardContent className="space-y-4">
 <div>
 <h3 className="text-sm font-medium mb-2">Description</h3>
 <p className="text-sm text-gray-600">{selectedTemplate.description}</p>
 </div>

 <Separator />

 <div>
 <h3 className="text-sm font-medium mb-2">Template Structure</h3>
 <div className="bg-gray-50 p-4 rounded-md">
 <pre className="text-xs overflow-auto">
 {JSON.stringify(selectedTemplate.structure, null, 2)}
 </pre>
 </div>
 </div>

 <Separator />

 <div>
 <h3 className="text-sm font-medium mb-2">Required Sections</h3>
 <Table>
 <TableHeader>
 <TableRow>
 <TableHead>Section</TableHead>
 <TableHead>Title</TableHead>
 <TableHead>Required</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {selectedTemplate.sections.map(section => (
 <TableRow key={section.id}>
 <TableCell>{section.id}</TableCell>
 <TableCell>{section.title}</TableCell>
 <TableCell>
 {section.required ? (
 <CheckCircle2 className="h-4 w-4 text-green-500" />
 ) : (
 <span className="text-gray-500">Optional</span>
 )}
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Usage Instructions</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4 text-sm text-gray-600">
 <p>
 This template should be used for {selectedTemplate.documentType} submissions as
 part of Module {selectedTemplate.moduleSection.split('.')[0]}.
 </p>
 <p>
 When completing this document, ensure all required sections are filled according
 to the ICH guidelines.
 </p>
 <p>
 The document will be automatically validated against CTD structure requirements
 before submission.
 </p>
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle>Template Information</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 <div>
 <p className="text-sm text-gray-500">Document Type</p>
 <p className="font-medium">{selectedTemplate.documentType}</p>
 </div>
 <div>
 <p className="text-sm text-gray-500">CTD Section</p>
 <p className="font-medium">{selectedTemplate.moduleSection}</p>
 </div>
 <div>
 <p className="text-sm text-gray-500">Last Updated</p>
 <p className="font-medium">{selectedTemplate.lastUpdated}</p>
 </div>
 <div>
 <p className="text-sm text-gray-500">Version</p>
 <p className="font-medium">{selectedTemplate.version}</p>
 </div>
 <div>
 <p className="text-sm text-gray-500">Usage Count</p>
 <p className="font-medium">{selectedTemplate.usageCount} times</p>
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Applicable Guidelines</CardTitle>
 </CardHeader>
 <CardContent>
 <ScrollArea className="h-72">
 <div className="space-y-3">
 {relatedGuidelines.map((guideline, index) => (
 <div key={index} className="p-3 border rounded-md">
 <h4 className="font-medium text-sm">{guideline.title}</h4>
 {guideline.url ? (
 <a
 href={guideline.url}
 target="_blank"
 rel="noopener noreferrer"
 className="text-xs text-stone-600 hover:underline mt-1 block"
 >
 View Guideline
 </a>
 ) : (
 <p className="text-xs text-gray-500 mt-1">No direct link available</p>
 )}
 </div>
 ))}
 </div>
 </ScrollArea>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Actions</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <Button className="w-full" onClick={() => handleCreateDocument(selectedTemplate)}>
 Create New Document
 </Button>
 <Button
 variant="outline"
 className="w-full"
 onClick={() =>
 window.open(`/templates/${selectedTemplate.id}/download`, '_blank')
 }
 >
 <Download className="h-4 w-4 mr-2" />
 Download Template
 </Button>
 </CardContent>
 </Card>
 </div>
 </div>
 </div>
 );
 };

 const renderCreateView = () => {
 if (!ctdStructure) return null;

 return (
 <div className="space-y-6">
 <div className="flex items-center space-x-2">
 <Button variant="ghost" onClick={() => setActiveView('browse')}>
 Back to Templates
 </Button>
 <ChevronRight className="h-4 w-4 text-gray-500" />
 <span className="text-gray-500">Create New Document</span>
 </div>

 <Card>
 <CardHeader>
 <CardTitle>Select Template Type</CardTitle>
 <CardDescription>Choose which CTD module and section to create</CardDescription>
 </CardHeader>
 <CardContent>
 <Accordion type="single" collapsible className="w-full">
 {Object.keys(ctdStructure).map(moduleKey => (
 <AccordionItem key={moduleKey} value={moduleKey}>
 <AccordionTrigger>
 <div className="flex items-center space-x-2">
 <Folder className="h-4 w-4" />
 <span>{ctdStructure[moduleKey].title}</span>
 </div>
 </AccordionTrigger>
 <AccordionContent>
 <div className="pl-6 space-y-4">
 {Object.keys(ctdStructure[moduleKey].sections).map(sectionKey => {
 const section = ctdStructure[moduleKey].sections[sectionKey];
 const templateId = `${moduleKey}.${sectionKey}`;

 // Find matching template
 const template = ctdTemplates.find(
 t => t.moduleId === moduleKey && t.moduleSection.startsWith(sectionKey)
 );

 return (
 <div
 key={sectionKey}
 className="border p-3 rounded-md hover:bg-gray-50 cursor-pointer"
 onClick={() => template && handleTemplateSelect(template)}
 >
 <div className="flex justify-between items-start">
 <div>
 <p className="font-medium text-sm">
 {sectionKey} - {section.title}
 </p>
 {section.subsections && (
 <p className="text-xs text-gray-500 mt-1">
 Contains {Object.keys(section.subsections).length} subsections
 </p>
 )}
 </div>
 {template && (
 <Button
 size="sm"
 onClick={e => {
 e.stopPropagation();
 handleCreateDocument(template);
 }}
 >
 Create
 </Button>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </AccordionContent>
 </AccordionItem>
 ))}
 </Accordion>
 </CardContent>
 </Card>
 </div>
 );
 };

 return (
 <div className="container mx-auto py-6 max-w-7xl">
 <div className="mb-8">
 <h1 className="text-3xl font-bold">CTD Document Templates</h1>
 <p className="text-gray-500 mt-2">
 Browse and create documents using standardized CTD templates compliant with ICH guidelines
 </p>
 </div>

 {activeView === 'browse' && renderBrowseView()}
 {activeView === 'details' && renderTemplateDetails()}
 {activeView === 'create' && renderCreateView()}
 </div>
 );
};

export default CTDTemplateManager;
