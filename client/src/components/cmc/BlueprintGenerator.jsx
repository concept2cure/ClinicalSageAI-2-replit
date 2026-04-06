import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
 Button,
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
 Input,
 Label,
 Textarea,
 Tabs,
 TabsList,
 TabsTrigger,
 TabsContent,
 Tooltip,
 TooltipContent,
 TooltipProvider,
 TooltipTrigger,
 Separator,
 Alert,
 AlertTitle,
 AlertDescription,
} from '@/components/ui';
import {
 FileText,
 Plus,
 Copy,
 Sparkles,
 Download,
 FlaskConical,
 FileSearch,
 Check,
 Clock,
 X,
 HelpCircle,
 ChevronDown,
 Loader2,
 Beaker,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export function BlueprintGenerator() {
 const [selectedRegion, setSelectedRegion] = useState('');
 const [selectedCategory, setSelectedCategory] = useState('');
 const [selectedTemplate, setSelectedTemplate] = useState('');
 const [generationContext, setGenerationContext] = useState({});
 const [newBlueprintData, setNewBlueprintData] = useState({
 name: '',
 description: '',
 productName: '',
 });
 const [activeTab, setActiveTab] = useState('templates');
 const [currentSectionPath, setCurrentSectionPath] = useState('');

 const queryClient = useQueryClient();
 const { toast } = useToast();

 // Fetch templates
 const templatesQuery = useQuery({
 queryKey: ['/api/cmc/templates', { region: selectedRegion, category: selectedCategory }],
 enabled: activeTab === 'templates',
 });

 // Fetch blueprints
 const blueprintsQuery = useQuery({
 queryKey: ['/api/cmc/blueprints'],
 enabled: activeTab === 'blueprints',
 });

 // Fetch template details
 const templateDetailsQuery = useQuery({
 queryKey: ['/api/cmc/templates', selectedTemplate],
 enabled: !!selectedTemplate,
 });

 // Create blueprint mutation
 const createBlueprintMutation = useMutation({
 mutationFn: async data => {
 const response = await apiRequest('POST', '/api/cmc/blueprints', data);
 return await response.json();
 },
 onSuccess: data => {
 toast({
 title: 'Blueprint Created',
 description: 'New blueprint has been created successfully',
 });
 queryClient.invalidateQueries({ queryKey: ['/api/cmc/blueprints'] });
 setActiveTab('blueprints');
 },
 onError: error => {
 toast({
 title: 'Creation Failed',
 description: error.message || 'Failed to create blueprint',
 variant: 'destructive',
 });
 },
 });

 // Generate section content mutation
 const generateSectionMutation = useMutation({
 mutationFn: async ({ blueprintId, sectionPath, context }) => {
 const response = await apiRequest(
 'POST',
 `/api/cmc/blueprints/${blueprintId}/generate/${sectionPath}`,
 context
 );
 return await response.json();
 },
 onSuccess: data => {
 toast({
 title: 'Content Generated',
 description: `Section content generated successfully using ${data.tokens_used} tokens`,
 });
 queryClient.invalidateQueries({ queryKey: ['/api/cmc/blueprints'] });
 },
 onError: error => {
 toast({
 title: 'Generation Failed',
 description: error.message || 'Failed to generate content',
 variant: 'destructive',
 });
 },
 });

 // Generate all sections mutation
 const generateAllMutation = useMutation({
 mutationFn: async ({ blueprintId, context }) => {
 const response = await apiRequest(
 'POST',
 `/api/cmc/blueprints/${blueprintId}/generate-all`,
 context
 );
 return await response.json();
 },
 onSuccess: data => {
 toast({
 title: 'Generation Started',
 description: 'Content generation for all sections has begun. This may take a few minutes.',
 });
 },
 onError: error => {
 toast({
 title: 'Generation Failed',
 description: error.message || 'Failed to start generation process',
 variant: 'destructive',
 });
 },
 });

 // Handle template selection
 const handleTemplateSelect = templateId => {
 setSelectedTemplate(templateId);
 };

 // Handle create blueprint
 const handleCreateBlueprint = () => {
 if (!selectedTemplate) {
 toast({
 title: 'Template Required',
 description: 'Please select a template first',
 variant: 'destructive',
 });
 return;
 }

 if (!newBlueprintData.name) {
 toast({
 title: 'Name Required',
 description: 'Please provide a name for the blueprint',
 variant: 'destructive',
 });
 return;
 }

 createBlueprintMutation.mutate({
 name: newBlueprintData.name,
 description: newBlueprintData.description,
 templateId: selectedTemplate,
 productName: newBlueprintData.productName,
 });
 };

 // Handle generate section content
 const handleGenerateSection = (blueprintId, sectionPath) => {
 setCurrentSectionPath(sectionPath);
 generateSectionMutation.mutate({
 blueprintId,
 sectionPath,
 context: generationContext,
 });
 };

 // Handle generate all sections
 const handleGenerateAll = blueprintId => {
 generateAllMutation.mutate({
 blueprintId,
 context: generationContext,
 });
 };

 // Handle context update
 const handleContextChange = e => {
 const { name, value } = e.target;
 setGenerationContext(prev => ({
 ...prev,
 [name]: value,
 }));
 };

 // Handle new blueprint data update
 const handleNewBlueprintChange = e => {
 const { name, value } = e.target;
 setNewBlueprintData(prev => ({
 ...prev,
 [name]: value,
 }));
 };

 // Render templates tab
 const renderTemplatesTab = () => {
 if (templatesQuery.isLoading) {
 return (
 <div className="flex justify-center items-center h-64">
 <Loader2 className="w-8 h-8 animate-spin text-hotpink-500" />
 </div>
 );
 }

 if (templatesQuery.error) {
 return (
 <Alert variant="destructive" className="mb-4">
 <AlertTitle>Error</AlertTitle>
 <AlertDescription>
 Failed to load templates: {templatesQuery.error.message}
 </AlertDescription>
 </Alert>
 );
 }

 const templates = templatesQuery.data || [];

 return (
 <div>
 <div className="flex flex-wrap gap-4 mb-4">
 <div className="w-1/4">
 <Label htmlFor="region">Region</Label>
 <Select value={selectedRegion} onValueChange={setSelectedRegion}>
 <SelectTrigger id="region">
 <SelectValue placeholder="All Regions" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="">All Regions</SelectItem>
 <SelectItem value="FDA">FDA (US)</SelectItem>
 <SelectItem value="EMA">EMA (EU)</SelectItem>
 <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
 <SelectItem value="NMPA">NMPA (China)</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="w-1/4">
 <Label htmlFor="category">Category</Label>
 <Select value={selectedCategory} onValueChange={setSelectedCategory}>
 <SelectTrigger id="category">
 <SelectValue placeholder="All Categories" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="">All Categories</SelectItem>
 <SelectItem value="Drug Substance">Drug Substance</SelectItem>
 <SelectItem value="Drug Product">Drug Product</SelectItem>
 <SelectItem value="Appendices">Appendices</SelectItem>
 <SelectItem value="Control Strategy">Control Strategy</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {templates.map(template => (
 <Card
 key={template.id}
 className={`cursor-pointer transition-all ${selectedTemplate === template.id ? 'border-hotpink-500 shadow-lg' : 'hover:shadow-md'}`}
 onClick={() => handleTemplateSelect(template.id)}
 >
 <CardHeader className="pb-2">
 <div className="flex justify-between">
 <div
 className={`w-8 h-8 rounded-full bg-${template.icon === 'flask' ? 'blue' : template.icon === 'pill' ? 'green' : 'purple'}-100 flex items-center justify-center`}
 >
 {template.icon === 'flask' ? (
 <Beaker className="w-4 h-4 text-stone-500" />
 ) : template.icon === 'pill' ? (
 <FileText className="w-4 h-4 text-green-500" />
 ) : (
 <FileSearch className="w-4 h-4 text-purple-500" />
 )}
 </div>
 {selectedTemplate === template.id && (
 <div className="bg-hotpink-100 text-hotpink-800 rounded-full flex items-center justify-center w-6 h-6">
 <Check className="w-4 h-4" />
 </div>
 )}
 </div>
 <CardTitle className="text-base">{template.name}</CardTitle>
 <CardDescription className="text-xs">
 {template.region} | {template.category} | v{template.template_version}
 </CardDescription>
 </CardHeader>
 <CardContent className="pb-2">
 <p className="text-sm">{template.description}</p>
 </CardContent>
 </Card>
 ))}
 </div>

 {selectedTemplate && (
 <Card className="mt-6">
 <CardHeader>
 <CardTitle>Create New Blueprint</CardTitle>
 <CardDescription>
 Complete the form below to create a new blueprint using the selected template
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 <div>
 <Label htmlFor="name">Blueprint Name</Label>
 <Input
 id="name"
 name="name"
 placeholder="Enter blueprint name"
 value={newBlueprintData.name}
 onChange={handleNewBlueprintChange}
 />
 </div>

 <div>
 <Label htmlFor="productName">Product Name</Label>
 <Input
 id="productName"
 name="productName"
 placeholder="Enter product name"
 value={newBlueprintData.productName}
 onChange={handleNewBlueprintChange}
 />
 </div>

 <div>
 <Label htmlFor="description">Description (Optional)</Label>
 <Textarea
 id="description"
 name="description"
 placeholder="Enter blueprint description"
 value={newBlueprintData.description}
 onChange={handleNewBlueprintChange}
 />
 </div>
 </div>
 </CardContent>
 <CardFooter>
 <Button onClick={handleCreateBlueprint} disabled={createBlueprintMutation.isPending}>
 {createBlueprintMutation.isPending ? (
 <>
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 Creating...
 </>
 ) : (
 <>
 <Plus className="mr-2 h-4 w-4" />
 Create Blueprint
 </>
 )}
 </Button>
 </CardFooter>
 </Card>
 )}
 </div>
 );
 };

 // Render blueprints tab
 const renderBlueprintsTab = () => {
 if (blueprintsQuery.isLoading) {
 return (
 <div className="flex justify-center items-center h-64">
 <Loader2 className="w-8 h-8 animate-spin text-hotpink-500" />
 </div>
 );
 }

 if (blueprintsQuery.error) {
 return (
 <Alert variant="destructive" className="mb-4">
 <AlertTitle>Error</AlertTitle>
 <AlertDescription>
 Failed to load blueprints: {blueprintsQuery.error.message}
 </AlertDescription>
 </Alert>
 );
 }

 const blueprints = blueprintsQuery.data || [];

 if (blueprints.length === 0) {
 return (
 <Card>
 <CardHeader>
 <CardTitle>No Blueprints Found</CardTitle>
 <CardDescription>
 You haven't created any CMC blueprints yet. Switch to the Templates tab to create your
 first blueprint.
 </CardDescription>
 </CardHeader>
 <CardFooter>
 <Button onClick={() => setActiveTab('templates')}>
 <Plus className="mr-2 h-4 w-4" />
 Create First Blueprint
 </Button>
 </CardFooter>
 </Card>
 );
 }

 return (
 <div className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {blueprints.map(blueprint => (
 <Card key={blueprint.id}>
 <CardHeader className="pb-2">
 <div className="flex justify-between">
 <div
 className={`w-8 h-8 rounded-full bg-${
 blueprint.template?.category === 'Drug Substance'
 ? 'blue'
 : blueprint.template?.category === 'Drug Product'
 ? 'green'
 : 'purple'
 }-100 flex items-center justify-center`}
 >
 {blueprint.template?.category === 'Drug Substance' ? (
 <Beaker className="w-4 h-4 text-stone-500" />
 ) : blueprint.template?.category === 'Drug Product' ? (
 <FileText className="w-4 h-4 text-green-500" />
 ) : (
 <FileSearch className="w-4 h-4 text-purple-500" />
 )}
 </div>
 <div
 className={`px-2 py-1 rounded-full text-xs ${
 blueprint.status === 'DRAFT'
 ? 'bg-yellow-100 text-yellow-800'
 : blueprint.status === 'DRAFT_COMPLETE'
 ? 'bg-stone-100 text-stone-800'
 : blueprint.status === 'APPROVED'
 ? 'bg-green-100 text-green-800'
 : 'bg-gray-100 text-gray-800'
 }`}
 >
 {blueprint.status}
 </div>
 </div>
 <CardTitle className="text-base">{blueprint.name}</CardTitle>
 <CardDescription className="text-xs">
 {blueprint.template?.region} | {blueprint.template?.category} |{' '}
 {blueprint.product_name}
 </CardDescription>
 </CardHeader>
 <CardContent className="pb-2">
 <p className="text-sm">{blueprint.description || 'No description provided'}</p>
 </CardContent>
 <CardFooter className="pt-2 flex justify-between">
 <Button
 size="sm"
 variant="outline"
 onClick={() => (window.location.href = `/cmc/blueprints/${blueprint.id}`)}
 >
 <FileText className="mr-2 h-4 w-4" />
 Edit
 </Button>
 <Button
 size="sm"
 variant="ghost"
 onClick={() => handleGenerateAll(blueprint.id)}
 disabled={generateAllMutation.isPending}
 >
 <Sparkles className="mr-2 h-4 w-4" />
 Generate All
 </Button>
 </CardFooter>
 </Card>
 ))}
 </div>
 </div>
 );
 };

 // Main render
 return (
 <div className="container mx-auto py-6">
 <div className="flex justify-between items-center mb-6">
 <div>
 <h1 className="text-2xl font-bold tracking-tight">AI-CMC Blueprint Generator</h1>
 <p className="text-gray-500">
 Streamline CMC documentation preparation for global regulatory submissions
 </p>
 </div>

 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 variant="outline"
 className="gap-2"
 onClick={() => window.open('/help/cmc-blueprints', '_blank')}
 >
 <HelpCircle className="h-4 w-4" />
 Help & Resources
 </Button>
 </TooltipTrigger>
 <TooltipContent>
 <p>Learn how to effectively use the AI-CMC Blueprint Generator</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 </div>

 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <TabsList className="grid w-full grid-cols-2">
 <TabsTrigger value="templates">
 <FileText className="mr-2 h-4 w-4" />
 Templates
 </TabsTrigger>
 <TabsTrigger value="blueprints">
 <FlaskConical className="mr-2 h-4 w-4" />
 My Blueprints
 </TabsTrigger>
 </TabsList>

 <TabsContent value="templates" className="mt-6">
 {renderTemplatesTab()}
 </TabsContent>

 <TabsContent value="blueprints" className="mt-6">
 {renderBlueprintsTab()}
 </TabsContent>
 </Tabs>

 {(generateSectionMutation.isPending || generateAllMutation.isPending) && (
 <div className="fixed bottom-4 right-4 bg-hotpink-100 text-hotpink-800 p-4 rounded-md shadow-lg flex items-center">
 <Loader2 className="animate-spin mr-2 h-4 w-4" />
 <div>
 <p className="font-medium">
 {generateSectionMutation.isPending
 ? `Generating content for section ${currentSectionPath}...`
 : 'Generating content for multiple sections...'}
 </p>
 <p className="text-sm">This may take a few moments</p>
 </div>
 </div>
 )}
 </div>
 );
}

export default BlueprintGenerator;
