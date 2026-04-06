import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { CheckCircle, Circle, FileText, AlertTriangle, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const ECTDPyramidTemplateSelector = ({ onTemplateSelect, selectedTemplate }) => {
 const [templates, setTemplates] = useState([]);
 const [selectedTemplateDetails, setSelectedTemplateDetails] = useState(null);
 const [checklist, setChecklist] = useState(null);
 const [loading, setLoading] = useState(true);
 const [activeTab, setActiveTab] = useState('templates');
 const [error, setError] = useState(null); // Added error state

 useEffect(() => {
 loadTemplates();
 }, []);

 useEffect(() => {
 if (selectedTemplate) {
 loadTemplateDetails(selectedTemplate);
 loadTemplateChecklist(selectedTemplate);
 }
 }, [selectedTemplate]);

 const loadTemplates = async () => {
 try {
 const response = await fetch('/api/ectd/pyramid-templates');
 if (!response.ok) {
 throw new Error(`HTTP error! status: ${response.status}`);
 }
 const data = await response.json();

 if (data.success) {
 setTemplates(data.templates);
 } else {
 console.error('Failed to load templates:', data.error);
 setError('Failed to load templates'); // Set error message
 }
 } catch (error) {
 console.error('Error loading templates:', error);
 setError('Error loading templates'); // Set error message
 setTemplates([]); // Ensure templates is empty on error
 } finally {
 setLoading(false);
 }
 };

 const loadTemplateDetails = async templateType => {
 try {
 const response = await fetch(`/api/ectd/pyramid-templates/${templateType}`);
 if (!response.ok) {
 throw new Error(`HTTP error! status: ${response.status}`);
 }
 const data = await response.json();

 if (data.success) {
 setSelectedTemplateDetails(data.template);
 } else {
 console.error('Error loading template details:', data.error);
 setError('Error loading template details');
 }
 } catch (error) {
 console.error('Error loading template details:', error);
 setError('Error loading template details');
 }
 };

 const loadTemplateChecklist = async templateType => {
 try {
 const response = await fetch(`/api/ectd/pyramid-templates/${templateType}/checklist`);
 if (!response.ok) {
 throw new Error(`HTTP error! status: ${response.status}`);
 }
 const data = await response.json();

 if (data.success) {
 setChecklist(data.checklist);
 } else {
 console.error('Error loading template checklist:', data.error);
 setError('Error loading template checklist');
 }
 } catch (error) {
 console.error('Error loading template checklist:', error);
 setError('Error loading template checklist');
 }
 };

 const handleTemplateSelection = template => {
 onTemplateSelect(template.type);
 };

 const getTemplateTypeColor = type => {
 const colors = {
 IND: 'bg-stone-100 text-stone-800',
 NDA: 'bg-green-100 text-green-800',
 BLA: 'bg-purple-100 text-purple-800',
 '510K': 'bg-orange-100 text-orange-800',
 };
 return colors[type] || 'bg-gray-100 text-gray-800';
 };

 const renderSection = (section, level = 0) => {
 const indent = level * 20;

 return (
 <div key={section.id} className="mb-2" style={{ marginLeft: `${indent}px` }}>
 <div className="flex items-start space-x-2 p-2 rounded hover:bg-gray-50">
 <div className="flex-shrink-0 mt-1">
 {section.required ? (
 <AlertTriangle className="h-4 w-4 text-amber-500" />
 ) : (
 <Info className="h-4 w-4 text-stone-500" />
 )}
 </div>
 <div className="flex-1">
 <h4 className="font-medium text-sm">{section.title}</h4>
 {section.guidance && <p className="text-xs text-gray-600 mt-1">{section.guidance}</p>}
 {section.contentRequirements && section.contentRequirements.length > 0 && (
 <ul className="text-xs text-gray-500 mt-1 ml-4">
 {section.contentRequirements.map((req, index) => (
 <li key={index} className="list-disc">
 {req}
 </li>
 ))}
 </ul>
 )}
 {section.wordCount && (
 <Badge variant="outline" className="text-xs mt-1">
 {section.wordCount} words
 </Badge>
 )}
 {section.estimatedPages && (
 <Badge variant="outline" className="text-xs mt-1 ml-1">
 {section.estimatedPages} pages
 </Badge>
 )}
 </div>
 </div>
 {section.subsections &&
 section.subsections.map(subsection => renderSection(subsection, level + 1))}
 </div>
 );
 };

 const renderChecklistItem = (item, level = 0) => {
 const indent = level * 20;

 return (
 <div key={item.id} className="mb-1" style={{ marginLeft: `${indent}px` }}>
 <div className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50">
 <div className="flex-shrink-0">
 {item.completed ? (
 <CheckCircle className="h-4 w-4 text-green-500" />
 ) : (
 <Circle className="h-4 w-4 text-gray-400" />
 )}
 </div>
 <div className="flex-1">
 <span className={`text-sm ${item.required ? 'font-medium' : ''}`}>{item.title}</span>
 {item.required && (
 <Badge variant="outline" className="text-xs ml-2">
 Required
 </Badge>
 )}
 {item.guidance && <p className="text-xs text-gray-600 mt-1">{item.guidance}</p>}
 </div>
 </div>
 {item.children && item.children.map(child => renderChecklistItem(child, level + 1))}
 </div>
 );
 };

 if (loading) {
 return (
 <Card>
 <CardContent className="p-6">
 <div className="flex items-center justify-center">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-700"></div>
 <span className="ml-2">Loading eCTD templates...</span>
 </div>
 </CardContent>
 </Card>
 );
 }

 return (
 <div className="space-y-4">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center space-x-2">
 <FileText className="h-5 w-5" />
 <span>FDA eCTD Pyramid Templates</span>
 </CardTitle>
 </CardHeader>
 <CardContent>
 {error && <div className="text-red-500 mb-4">Error: {error}</div>}
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="grid w-full grid-cols-3">
 <TabsTrigger value="templates">Templates</TabsTrigger>
 <TabsTrigger value="structure">Structure</TabsTrigger>
 <TabsTrigger value="checklist">Checklist</TabsTrigger>
 </TabsList>

 <TabsContent value="templates" className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {templates.length > 0 ? (
 templates.map(template => (
 <Card
 key={template.id}
 className={`cursor-pointer transition-all hover:shadow-md ${
 selectedTemplate === template.type ? 'ring-2 ring-stone-400' : ''
 }`}
 onClick={() => handleTemplateSelection(template)}
 >
 <CardContent className="p-4">
 <div className="flex items-center justify-between mb-2">
 <h3 className="font-semibold text-lg">{template.type}</h3>
 <Badge className={getTemplateTypeColor(template.type)}>
 {template.type}
 </Badge>
 </div>
 <h4 className="font-medium text-sm mb-2">{template.title}</h4>
 <p className="text-sm text-gray-600">{template.description}</p>

 <div className="mt-4">
 <Button
 variant={selectedTemplate === template.type ? 'default' : 'outline'}
 size="sm"
 className="w-full"
 data-testid={`create-template-${template.type}`}
 >
 {selectedTemplate === template.type ? 'Template Active' : 'Create from Template'}
 </Button>
 </div>
 </CardContent>
 </Card>
 ))
 ) : (
 <div className="text-center text-gray-500 py-8">No templates found.</div>
 )}
 </div>
 </TabsContent>

 <TabsContent value="structure" className="space-y-4">
 {selectedTemplateDetails ? (
 <div>
 <div className="mb-4">
 <h3 className="text-lg font-semibold">{selectedTemplateDetails.title}</h3>
 <p className="text-gray-600">{selectedTemplateDetails.description}</p>
 </div>

 <div className="space-y-4">
 {selectedTemplateDetails.modules.map(module => (
 <Card key={module.number}>
 <CardHeader className="pb-3">
 <CardTitle className="text-base">
 Module {module.number}: {module.title}
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 {module.sections.map(section => renderSection(section))}
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 </div>
 ) : (
 <div className="text-center text-gray-500 py-8">
 Select a template to view its structure
 </div>
 )}
 </TabsContent>

 <TabsContent value="checklist" className="space-y-4">
 {checklist ? (
 <div>
 <div className="mb-4">
 <h3 className="text-lg font-semibold">{checklist.title}</h3>
 <p className="text-gray-600">
 Completion checklist for {checklist.templateType} submission
 </p>
 </div>

 <div className="space-y-2">
 {checklist.items.map(item => renderChecklistItem(item))}
 </div>
 </div>
 ) : (
 <div className="text-center text-gray-500 py-8">
 Select a template to view its checklist
 </div>
 )}
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 </div>
 );
};

export default ECTDPyramidTemplateSelector;
const handleTemplateSelect = async templateId => {
 try {
 setLoading(true);
 const template = await getTemplateById(templateId);

 if (template) {
 // Validate template content
 if (!template.content || template.content.length < 100) {
 throw new Error('Selected template appears to be incomplete or missing content');
 }

 // Show confirmation with template details
 const confirmed = window.confirm(
 `Load "${template.title}"?\n\n` +
 `This template includes:\n` +
 `• ${template.sections?.length || 0} sections\n` +
 `• ${template.regulatory_requirements?.length || 0} regulatory requirements\n` +
 `• Comprehensive ${template.category} content\n\n` +
 `Content length: ${template.content.length} characters`
 );

 if (confirmed) {
 onTemplateSelect(template);
 onClose();
 }
 }
 } catch (error) {
 console.error('Error selecting template:', error);
 toast({ title: `Error loading template: ${error.message}` });
 } finally {
 setLoading(false);
 }
};
