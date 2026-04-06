import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { cerApiService } from '@/services/CerAPIService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { AlertCircle, FileText, Loader2, Save, Search, Sparkles } from 'lucide-react';

/**
 * Literature Search Methodology Panel Component
 *
 * Allows users to document their literature search strategy for Clinical Evaluation Reports
 * in compliance with MEDDEV 2.7/1 Rev 4 and EU MDR requirements.
 */
const LiteratureMethodologyPanel = ({
 deviceName = '',
 deviceType = '',
 manufacturer = '',
 onAddToCER,
}) => {
 const { toast } = useToast();

 // Form state
 const [formState, setFormState] = useState({
 deviceName: deviceName || '',
 deviceType: deviceType || '',
 manufacturer: manufacturer || '',
 indication: '',
 databases: ['PubMed', 'Embase', 'Cochrane Library'],
 searchTerms: [''],
 inclusionCriteria: {
 'Publication Type': 'Clinical studies, systematic reviews, meta-analyses',
 'Publication Date': 'Last 10 years',
 'Study Design': 'Randomized controlled trials, prospective studies, retrospective analyses',
 Population: 'Adult patients',
 },
 exclusionCriteria: {
 'Publication Type': 'Case reports with n<5, letters to editor, opinion pieces',
 Language: 'Non-English publications',
 Access: 'Publications where full text is not available',
 Relevance: 'Studies not related to the device or similar devices',
 },
 searchDateRange: `${new Date().getFullYear() - 10}-${new Date().getFullYear()}`,
 languages: ['English'],
 reviewerName: '',
 });

 // Add additional form fields
 const [newInclusionKey, setNewInclusionKey] = useState('');
 const [newInclusionValue, setNewInclusionValue] = useState('');
 const [newExclusionKey, setNewExclusionKey] = useState('');
 const [newExclusionValue, setNewExclusionValue] = useState('');
 const [newSearchTerm, setNewSearchTerm] = useState('');
 const [newDatabase, setNewDatabase] = useState('');

 // Result state
 const [generatedMethodology, setGeneratedMethodology] = useState(null);
 const [isLoading, setIsLoading] = useState(false);
 const [activeTab, setActiveTab] = useState('form');

 // Handle form field changes
 const handleChange = (field, value) => {
 setFormState({
 ...formState,
 [field]: value,
 });
 };

 // Add search term to the list
 const addSearchTerm = () => {
 if (newSearchTerm.trim()) {
 setFormState({
 ...formState,
 searchTerms: [...formState.searchTerms, newSearchTerm.trim()],
 });
 setNewSearchTerm('');
 }
 };

 // Remove search term from the list
 const removeSearchTerm = index => {
 const updatedTerms = [...formState.searchTerms];
 updatedTerms.splice(index, 1);
 setFormState({
 ...formState,
 searchTerms: updatedTerms,
 });
 };

 // Add database to the list
 const addDatabase = () => {
 if (newDatabase.trim() && !formState.databases.includes(newDatabase.trim())) {
 setFormState({
 ...formState,
 databases: [...formState.databases, newDatabase.trim()],
 });
 setNewDatabase('');
 }
 };

 // Remove database from the list
 const removeDatabase = index => {
 const updatedDatabases = [...formState.databases];
 updatedDatabases.splice(index, 1);
 setFormState({
 ...formState,
 databases: updatedDatabases,
 });
 };

 // Add inclusion criteria
 const addInclusionCriteria = () => {
 if (newInclusionKey.trim() && newInclusionValue.trim()) {
 setFormState({
 ...formState,
 inclusionCriteria: {
 ...formState.inclusionCriteria,
 [newInclusionKey.trim()]: newInclusionValue.trim(),
 },
 });
 setNewInclusionKey('');
 setNewInclusionValue('');
 }
 };

 // Remove inclusion criteria
 const removeInclusionCriteria = key => {
 const updatedCriteria = { ...formState.inclusionCriteria };
 delete updatedCriteria[key];
 setFormState({
 ...formState,
 inclusionCriteria: updatedCriteria,
 });
 };

 // Add exclusion criteria
 const addExclusionCriteria = () => {
 if (newExclusionKey.trim() && newExclusionValue.trim()) {
 setFormState({
 ...formState,
 exclusionCriteria: {
 ...formState.exclusionCriteria,
 [newExclusionKey.trim()]: newExclusionValue.trim(),
 },
 });
 setNewExclusionKey('');
 setNewExclusionValue('');
 }
 };

 // Remove exclusion criteria
 const removeExclusionCriteria = key => {
 const updatedCriteria = { ...formState.exclusionCriteria };
 delete updatedCriteria[key];
 setFormState({
 ...formState,
 exclusionCriteria: updatedCriteria,
 });
 };

 // Generate literature methodology documentation
 const generateMethodology = async () => {
 if (!formState.deviceName || !formState.deviceType) {
 toast({
 title: 'Missing Information',
 description: 'Device name and type are required to generate the methodology',
 variant: 'destructive',
 });
 return;
 }

 if (formState.searchTerms.length === 0 || formState.databases.length === 0) {
 toast({
 title: 'Missing Search Parameters',
 description: 'At least one search term and database are required',
 variant: 'destructive',
 });
 return;
 }

 try {
 setIsLoading(true);

 const result = await cerApiService.documentLiteratureSearch(formState);

 setGeneratedMethodology(result);
 setActiveTab('preview');

 toast({
 title: 'Methodology Generated',
 description: 'EU MDR & MEDDEV 2.7/1 Rev 4 compliant methodology documentation created',
 });
 } catch (error) {
 console.error('Error generating methodology:', error);
 toast({
 title: 'Generation Failed',
 description: error.message || 'Failed to generate methodology documentation',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(false);
 }
 };

 // Add methodology to CER
 const addToCER = () => {
 if (!generatedMethodology) return;

 onAddToCER({
 title: 'Literature Search Methodology',
 type: 'literature-methodology',
 content: generatedMethodology.content,
 metadata: generatedMethodology.searchParams,
 });

 toast({
 title: 'Added to CER',
 description: 'Literature search methodology added to your report',
 });
 };

 return (
 <div className="space-y-6 p-4 border rounded-md bg-white">
 <div className="flex justify-between items-center">
 <div>
 <h2 className="text-xl font-bold">Literature Search Methodology</h2>
 <p className="text-sm text-gray-500">
 Document your literature search strategy in compliance with MEDDEV 2.7/1 Rev 4
 </p>
 </div>
 <Badge variant="outline" className="px-2 py-1 border-stone-200 bg-stone-50 text-stone-700">
 EU MDR Compliant
 </Badge>
 </div>

 <Tabs defaultValue="form" value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="grid w-full grid-cols-2">
 <TabsTrigger value="form" className="flex items-center gap-1">
 <Search className="h-4 w-4" /> Search Parameters
 </TabsTrigger>
 <TabsTrigger
 value="preview"
 className="flex items-center gap-1"
 disabled={!generatedMethodology}
 >
 <FileText className="h-4 w-4" /> Generated Documentation
 </TabsTrigger>
 </TabsList>

 <TabsContent value="form" className="mt-4 space-y-6">
 <Card>
 <CardHeader>
 <CardTitle>Device Information</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="deviceName">Device Name *</Label>
 <Input
 id="deviceName"
 value={formState.deviceName}
 onChange={e => handleChange('deviceName', e.target.value)}
 placeholder="Enter device name"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="deviceType">Device Type/Classification *</Label>
 <Input
 id="deviceType"
 value={formState.deviceType}
 onChange={e => handleChange('deviceType', e.target.value)}
 placeholder="e.g., Class III implantable device"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="manufacturer">Manufacturer</Label>
 <Input
 id="manufacturer"
 value={formState.manufacturer}
 onChange={e => handleChange('manufacturer', e.target.value)}
 placeholder="Enter manufacturer name"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="indication">Intended Use/Indication</Label>
 <Input
 id="indication"
 value={formState.indication}
 onChange={e => handleChange('indication', e.target.value)}
 placeholder="Enter intended use of the device"
 />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Search Parameters</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <Label>Databases Searched *</Label>
 <div className="flex flex-wrap gap-2 mb-2">
 {formState.databases.map((db, index) => (
 <Badge key={index} variant="secondary" className="py-1 px-2">
 {db}
 <button
 type="button"
 className="ml-2 text-gray-500 hover:text-red-500"
 onClick={() => removeDatabase(index)}
 >
 ×
 </button>
 </Badge>
 ))}
 </div>
 <div className="flex gap-2">
 <Input
 value={newDatabase}
 onChange={e => setNewDatabase(e.target.value)}
 placeholder="Add database"
 />
 <Button
 type="button"
 onClick={addDatabase}
 className="shrink-0"
 variant="outline"
 >
 Add
 </Button>
 </div>
 </div>

 <div className="space-y-2">
 <Label>Search Terms *</Label>
 <div className="flex flex-wrap gap-2 mb-2">
 {formState.searchTerms.map((term, index) => (
 <Badge key={index} variant="secondary" className="py-1 px-2">
 {term}
 <button
 type="button"
 className="ml-2 text-gray-500 hover:text-red-500"
 onClick={() => removeSearchTerm(index)}
 >
 ×
 </button>
 </Badge>
 ))}
 </div>
 <div className="flex gap-2">
 <Input
 value={newSearchTerm}
 onChange={e => setNewSearchTerm(e.target.value)}
 placeholder="Add search term"
 />
 <Button
 type="button"
 onClick={addSearchTerm}
 className="shrink-0"
 variant="outline"
 >
 Add
 </Button>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-2">
 <Label htmlFor="searchDateRange">Search Date Range *</Label>
 <Input
 id="searchDateRange"
 value={formState.searchDateRange}
 onChange={e => handleChange('searchDateRange', e.target.value)}
 placeholder="e.g., 2015-2025"
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="reviewerName">Reviewer Name</Label>
 <Input
 id="reviewerName"
 value={formState.reviewerName}
 onChange={e => handleChange('reviewerName', e.target.value)}
 placeholder="Name of person conducting search"
 />
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Inclusion & Exclusion Criteria</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-3">
 <Label>Inclusion Criteria *</Label>
 {Object.entries(formState.inclusionCriteria).map(([key, value]) => (
 <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
 <div className="flex-1">
 <span className="font-semibold">{key}:</span> {value}
 </div>
 <button
 type="button"
 className="text-gray-500 hover:text-red-500"
 onClick={() => removeInclusionCriteria(key)}
 >
 ×
 </button>
 </div>
 ))}
 <div className="grid grid-cols-3 gap-2">
 <Input
 value={newInclusionKey}
 onChange={e => setNewInclusionKey(e.target.value)}
 placeholder="Category"
 className="col-span-1"
 />
 <Input
 value={newInclusionValue}
 onChange={e => setNewInclusionValue(e.target.value)}
 placeholder="Criteria description"
 className="col-span-1"
 />
 <Button
 type="button"
 onClick={addInclusionCriteria}
 className="shrink-0"
 variant="outline"
 >
 Add
 </Button>
 </div>
 </div>

 <div className="space-y-3">
 <Label>Exclusion Criteria *</Label>
 {Object.entries(formState.exclusionCriteria).map(([key, value]) => (
 <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
 <div className="flex-1">
 <span className="font-semibold">{key}:</span> {value}
 </div>
 <button
 type="button"
 className="text-gray-500 hover:text-red-500"
 onClick={() => removeExclusionCriteria(key)}
 >
 ×
 </button>
 </div>
 ))}
 <div className="grid grid-cols-3 gap-2">
 <Input
 value={newExclusionKey}
 onChange={e => setNewExclusionKey(e.target.value)}
 placeholder="Category"
 className="col-span-1"
 />
 <Input
 value={newExclusionValue}
 onChange={e => setNewExclusionValue(e.target.value)}
 placeholder="Criteria description"
 className="col-span-1"
 />
 <Button
 type="button"
 onClick={addExclusionCriteria}
 className="shrink-0"
 variant="outline"
 >
 Add
 </Button>
 </div>
 </div>
 </CardContent>
 <CardFooter className="flex justify-end">
 <Button
 onClick={generateMethodology}
 disabled={isLoading}
 className="flex items-center gap-2"
 >
 {isLoading ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 Generating...
 </>
 ) : (
 <>
 <Sparkles className="h-4 w-4" />
 Generate Methodology Documentation
 </>
 )}
 </Button>
 </CardFooter>
 </Card>
 </TabsContent>

 <TabsContent value="preview" className="mt-4 space-y-6">
 {generatedMethodology ? (
 <Card>
 <CardHeader>
 <CardTitle>Literature Search Methodology</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="prose max-w-none">
 {/* Use a div with dangerouslySetInnerHTML to render markdown */}
 <div
 className="markdown-content"
 dangerouslySetInnerHTML={{
 __html: DOMPurify.sanitize(
 generatedMethodology.content
 .replace(/\n/g, '<br />')
 .replace(/#{1,6}\s+([^\n]+)/g, (match, p1, offset, string) => {
 const level = match.trim().indexOf(' ');
 return `<h${level} class="text-lg font-bold mt-4 mb-2">${p1}</h${level}>`;
 })
 .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
 .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
 ),
 }}
 />
 </div>
 </CardContent>
 <CardFooter className="flex justify-end gap-2">
 <Button variant="outline" onClick={() => setActiveTab('form')}>
 Edit Parameters
 </Button>
 <Button onClick={addToCER} className="flex items-center gap-2">
 <Save className="h-4 w-4" />
 Add to CER
 </Button>
 </CardFooter>
 </Card>
 ) : (
 <div className="flex flex-col items-center justify-center p-6 text-center bg-gray-50 rounded-md border border-dashed">
 <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
 <h3 className="text-lg font-medium">No methodology generated yet</h3>
 <p className="text-sm text-gray-500 mt-2 mb-4">
 Complete the search parameters form and generate your documentation first
 </p>
 <Button variant="outline" onClick={() => setActiveTab('form')}>
 Return to Form
 </Button>
 </div>
 )}
 </TabsContent>
 </Tabs>
 </div>
 );
};

export default LiteratureMethodologyPanel;
