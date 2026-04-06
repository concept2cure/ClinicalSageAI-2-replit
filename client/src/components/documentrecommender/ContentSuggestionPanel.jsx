import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Copy, Check, ArrowRight, AlertCircle } from 'lucide-react';
import { isFeatureEnabled } from '../../flags/featureFlags';
import DocumentSectionRecommenderService from '../../services/DocumentSectionRecommenderService';

/**
 * ContentSuggestionPanel Component
 *
 * This component provides content suggestions for a specific document section
 * based on device profile information.
 *
 * @param {Object} props - Component props
 * @param {string} props.documentType - The type of document (e.g., '510k', 'cer')
 * @param {Object} props.section - The section information
 * @param {Object} props.deviceProfile - The device profile information
 * @param {Object} props.predicateDevice - Optional predicate device information (for 510k)
 * @param {string} props.existingContent - Existing content for the section
 */
export const ContentSuggestionPanel = ({
 documentType = '510k',
 section,
 deviceProfile,
 predicateDevice = null,
 existingContent = '',
}) => {
 const [selectedSuggestion, setSelectedSuggestion] = useState(null);
 const [copiedIndex, setCopiedIndex] = useState(null);
 const [activeTab, setActiveTab] = useState('suggestions');

 // Query for content suggestions
 const suggestionsQuery = useQuery({
 queryKey: ['contentSuggestions', documentType, section?.key, deviceProfile?.id],
 queryFn: () =>
 DocumentSectionRecommenderService.getSectionContentSuggestions(
 documentType,
 section.key,
 deviceProfile,
 predicateDevice
 ),
 enabled: isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!section && !!deviceProfile,
 staleTime: 60 * 60 * 1000, // 1 hour
 });

 // Query for content requirements
 const requirementsQuery = useQuery({
 queryKey: ['contentRequirements', documentType, section?.key],
 queryFn: () =>
 DocumentSectionRecommenderService.getSectionRequirements(documentType, section.key),
 enabled:
 isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!section && activeTab === 'requirements',
 });

 // Query for regulatory guidance
 const guidanceQuery = useQuery({
 queryKey: ['regulatoryGuidance', documentType, section?.key],
 queryFn: () =>
 DocumentSectionRecommenderService.getRegulatoryGuidance(documentType, section.key),
 enabled:
 isFeatureEnabled('ENABLE_SECTION_RECOMMENDER') && !!section && activeTab === 'guidance',
 });

 // Handle copy to clipboard
 const copyToClipboard = (text, index) => {
 navigator.clipboard.writeText(text).then(() => {
 setCopiedIndex(index);
 setTimeout(() => setCopiedIndex(null), 2000);
 });
 };

 // Feature flag check
 if (!isFeatureEnabled('ENABLE_SECTION_RECOMMENDER')) {
 return (
 <Card>
 <CardHeader>
 <CardTitle>Content Suggestions</CardTitle>
 <CardDescription>
 This feature is currently disabled. Please contact your administrator to enable it.
 </CardDescription>
 </CardHeader>
 </Card>
 );
 }

 // Loading states
 const isLoading =
 suggestionsQuery.isLoading ||
 (activeTab === 'requirements' && requirementsQuery.isLoading) ||
 (activeTab === 'guidance' && guidanceQuery.isLoading);

 // Error states
 const hasError =
 suggestionsQuery.error ||
 (activeTab === 'requirements' && requirementsQuery.error) ||
 (activeTab === 'guidance' && guidanceQuery.error);

 if (!section) {
 return null;
 }

 if (hasError) {
 return (
 <Card className="border-destructive">
 <CardHeader>
 <CardTitle className="text-destructive">Error Loading Content</CardTitle>
 <CardDescription>Failed to load content suggestions. Please try again.</CardDescription>
 </CardHeader>
 <CardFooter>
 <Button
 variant="outline"
 onClick={() => {
 if (activeTab === 'suggestions') suggestionsQuery.refetch();
 if (activeTab === 'requirements') requirementsQuery.refetch();
 if (activeTab === 'guidance') guidanceQuery.refetch();
 }}
 >
 Retry
 </Button>
 </CardFooter>
 </Card>
 );
 }

 return (
 <Card>
 <CardHeader>
 <div className="flex flex-col space-y-1.5">
 <CardTitle className="flex items-center">
 Content for {section.title}
 {section.priority === 'high' && <Badge className="ml-2">Required</Badge>}
 </CardTitle>
 <CardDescription>{section.description}</CardDescription>
 </div>
 </CardHeader>
 <CardContent>
 <Tabs value={activeTab} onValueChange={setActiveTab}>
 <TabsList className="grid grid-cols-3 mb-6">
 <TabsTrigger value="suggestions">Content Suggestions</TabsTrigger>
 <TabsTrigger value="requirements">Requirements</TabsTrigger>
 <TabsTrigger value="guidance">Regulatory Guidance</TabsTrigger>
 </TabsList>

 <TabsContent value="suggestions">
 {isLoading ? (
 <div className="flex justify-center items-center p-12">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 ) : suggestionsQuery.data ? (
 <div className="space-y-6">
 {existingContent && (
 <div className="space-y-2">
 <h3 className="text-lg font-medium">Existing Content</h3>
 <Card className="bg-muted">
 <CardContent className="p-4">
 <ScrollArea className="h-32">
 <p className="whitespace-pre-wrap">{existingContent}</p>
 </ScrollArea>
 </CardContent>
 </Card>
 </div>
 )}

 <div className="space-y-4">
 <h3 className="text-lg font-medium">Content Suggestions</h3>

 {suggestionsQuery.data.map((suggestion, index) => (
 <Card
 key={index}
 className={`border ${selectedSuggestion === index ? 'border-primary shadow-md' : ''}`}
 >
 <CardHeader className="pb-2">
 <div className="flex justify-between">
 <CardTitle className="text-base">{suggestion.title}</CardTitle>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => copyToClipboard(suggestion.content, index)}
 >
 {copiedIndex === index ? (
 <Check className="h-4 w-4 text-green-500" />
 ) : (
 <Copy className="h-4 w-4" />
 )}
 </Button>
 </div>
 {suggestion.description && (
 <CardDescription>{suggestion.description}</CardDescription>
 )}
 </CardHeader>
 <CardContent>
 <ScrollArea className="h-56 rounded-md border p-4">
 <div className="whitespace-pre-wrap">{suggestion.content}</div>
 </ScrollArea>
 </CardContent>
 <CardFooter className="pt-0">
 <Button
 variant="outline"
 size="sm"
 className="ml-auto"
 onClick={() => setSelectedSuggestion(index)}
 >
 Use This Template
 </Button>
 </CardFooter>
 </Card>
 ))}

 {(!suggestionsQuery.data || suggestionsQuery.data.length === 0) && (
 <div className="text-center p-6">
 <p>No content suggestions available for this section.</p>
 <Button
 variant="outline"
 className="mt-4"
 onClick={() => suggestionsQuery.refetch()}
 >
 Refresh Suggestions
 </Button>
 </div>
 )}
 </div>
 </div>
 ) : (
 <div className="text-center p-6">
 <p>No content suggestions available for this section.</p>
 <Button
 variant="outline"
 className="mt-4"
 onClick={() => suggestionsQuery.refetch()}
 >
 Generate Suggestions
 </Button>
 </div>
 )}
 </TabsContent>

 <TabsContent value="requirements">
 {isLoading ? (
 <div className="flex justify-center items-center p-12">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 ) : requirementsQuery.data ? (
 <div className="space-y-6">
 <div>
 <h3 className="text-lg font-medium mb-4">Section Requirements</h3>
 <div className="space-y-4">
 {requirementsQuery.data.map((req, index) => (
 <div key={index} className="border rounded-lg p-4">
 <div className="flex items-start gap-2">
 <div className="mt-0.5">
 {req.required ? (
 <Badge variant="default">Required</Badge>
 ) : (
 <Badge variant="outline">Recommended</Badge>
 )}
 </div>
 <div>
 <p className="font-medium">{req.title}</p>
 <p className="text-sm text-muted-foreground mt-1">{req.description}</p>

 {req.examples && (
 <div className="mt-3">
 <p className="text-sm font-medium">Example:</p>
 <p className="text-sm italic mt-1 text-muted-foreground">
 {req.examples[0]}
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {requirementsQuery.data.length === 0 && (
 <div className="text-center p-6">
 <p>No requirements specified for this section.</p>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center p-6">
 <p>No requirements available for this section.</p>
 <Button
 variant="outline"
 className="mt-4"
 onClick={() => requirementsQuery.refetch()}
 >
 Fetch Requirements
 </Button>
 </div>
 )}
 </TabsContent>

 <TabsContent value="guidance">
 {isLoading ? (
 <div className="flex justify-center items-center p-12">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 </div>
 ) : guidanceQuery.data ? (
 <div className="space-y-6">
 <div>
 <h3 className="text-lg font-medium mb-4">Regulatory Guidance</h3>

 {guidanceQuery.data.guidanceDocuments &&
 guidanceQuery.data.guidanceDocuments.length > 0 && (
 <div className="space-y-2 mb-6">
 <h4 className="font-medium">Guidance Documents</h4>
 <div className="space-y-3">
 {guidanceQuery.data.guidanceDocuments.map((doc, index) => (
 <Card key={index} className="overflow-hidden">
 <CardHeader className="py-3 px-4">
 <CardTitle className="text-base">{doc.title}</CardTitle>
 </CardHeader>
 <CardContent className="py-3 px-4">
 <div className="text-sm space-y-2">
 <div>
 <span className="font-medium">Document ID:</span>{' '}
 {doc.id || 'N/A'}
 </div>
 <div>
 <span className="font-medium">Published:</span>{' '}
 {doc.date || 'N/A'}
 </div>
 <div>
 <span className="font-medium">Agency:</span>{' '}
 {doc.agency || 'FDA'}
 </div>
 <p className="mt-2">{doc.description}</p>
 </div>
 </CardContent>
 {doc.url && (
 <CardFooter className="py-3 px-4 bg-muted border-t">
 <Button
 variant="link"
 className="px-0 h-auto"
 onClick={() => window.open(doc.url, '_blank')}
 >
 View Guidance <ArrowRight className="h-4 w-4 ml-1" />
 </Button>
 </CardFooter>
 )}
 </Card>
 ))}
 </div>
 </div>
 )}

 {guidanceQuery.data.keyPoints && guidanceQuery.data.keyPoints.length > 0 && (
 <div className="space-y-3">
 <h4 className="font-medium">Key Points</h4>
 <div className="space-y-2">
 {guidanceQuery.data.keyPoints.map((point, index) => (
 <div key={index} className="flex items-start gap-2 p-2">
 <AlertCircle className="h-5 w-5 text-stone-500 mt-0.5 flex-shrink-0" />
 <p>{point}</p>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {(!guidanceQuery.data.guidanceDocuments ||
 guidanceQuery.data.guidanceDocuments.length === 0) &&
 (!guidanceQuery.data.keyPoints || guidanceQuery.data.keyPoints.length === 0) && (
 <div className="text-center p-6">
 <p>No regulatory guidance available for this section.</p>
 </div>
 )}
 </div>
 ) : (
 <div className="text-center p-6">
 <p>No regulatory guidance available for this section.</p>
 <Button variant="outline" className="mt-4" onClick={() => guidanceQuery.refetch()}>
 Fetch Guidance
 </Button>
 </div>
 )}
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 );
};

export default ContentSuggestionPanel;
