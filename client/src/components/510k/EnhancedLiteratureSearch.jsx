/**
 * Enhanced Literature Search Component
 *
 * This component provides a search interface for the 510(k) literature discovery feature,
 * supporting multi-source search, semantic search, and filtering capabilities.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
 Card,
 CardContent,
 CardDescription,
 CardFooter,
 CardHeader,
 CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toaster';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from '@/components/ui/accordion';
import {
 Search,
 Book,
 FileText,
 BookOpen,
 ExternalLink,
 Calendar,
 Loader2,
 X,
 Check,
 Info,
} from 'lucide-react';

import { useContext } from 'react';
import { useTenant } from '../../contexts/TenantContext.tsx';

const LiteratureSearchResult = ({ result, onCite, onSummarize }) => {
 const formattedDate = result.publication_date
 ? new Date(result.publication_date).toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 })
 : 'No date';

 return (
 <Card
 className="mb-4 border-l-4"
 style={{ borderLeftColor: getSourceColor(result.source_name) }}
 >
 <CardHeader className="pb-2">
 <div className="flex justify-between">
 <Badge variant="outline" className="bg-slate-100 mb-2">
 {result.source_name}
 </Badge>
 {result.relevance_score && (
 <Badge variant="outline" className="bg-green-50">
 {Math.round(result.relevance_score * 100)}% match
 </Badge>
 )}
 </div>
 <CardTitle className="text-lg font-bold">{result.title}</CardTitle>
 <div className="flex items-center text-sm text-muted-foreground">
 <Calendar className="mr-1 h-3 w-3" /> {formattedDate}
 {result.journal && (
 <>
 <span className="mx-1">•</span>
 <BookOpen className="mr-1 h-3 w-3" /> {result.journal}
 </>
 )}
 </div>
 </CardHeader>
 <CardContent>
 {result.authors && result.authors.length > 0 && (
 <p className="text-sm text-muted-foreground mb-2">
 <strong>Authors:</strong> {result.authors.join(', ')}
 </p>
 )}
 {result.abstract && (
 <div className="mt-2">
 <p className="text-sm">{truncateText(result.abstract, 200)}</p>
 </div>
 )}
 </CardContent>
 <CardFooter className="flex justify-between pt-0">
 <div>
 <Button variant="outline" size="sm" className="mr-2" onClick={() => onCite(result)}>
 <FileText className="mr-1 h-4 w-4" /> Cite
 </Button>
 <Button variant="outline" size="sm" onClick={() => onSummarize([result])}>
 <Book className="mr-1 h-4 w-4" /> Summarize
 </Button>
 </div>
 {result.url && (
 <Button variant="ghost" size="sm" onClick={() => window.open(result.url, '_blank')}>
 <ExternalLink className="mr-1 h-4 w-4" /> View Source
 </Button>
 )}
 </CardFooter>
 </Card>
 );
};

// Helper to get color based on source
const getSourceColor = source => {
 const colors = {
 PubMed: '#292524',
 FDA: '#1c1917',
 'ClinicalTrials.gov': '#788c5d',
 'Previously Imported': '#1c1917',
 };

 return colors[source] || '#8a8880';
};

// Helper to truncate text
const truncateText = (text, maxLength) => {
 if (!text) return '';
 if (text.length <= maxLength) return text;
 return text.substr(0, maxLength) + '...';
};

const EnhancedLiteratureSearch = ({
 documentId,
 documentType,
 onCiteSuccess,
 multiSelectMode = false,
}) => {
 const [searchQuery, setSearchQuery] = useState('');
 const [searchResults, setSearchResults] = useState([]);
 const [isLoading, setIsLoading] = useState(false);
 const [sources, setSources] = useState([]);
 const [selectedSources, setSelectedSources] = useState([]);
 const [useSemanticSearch, setUseSemanticSearch] = useState(true);
 const [lastExecutedQuery, setLastExecutedQuery] = useState('');
 const [selectedEntries, setSelectedEntries] = useState([]);

 const { toast } = useToast();
 const { organizationId } = useContext(TenantContext);

 useEffect(() => {
 // Fetch available literature sources
 const fetchSources = async () => {
 try {
 const response = await axios.get('/api/510k/literature/sources');
 setSources(response.data.sources);
 setSelectedSources(response.data.sources.map(s => s.id));
 } catch (error) {
 console.error('Error fetching literature sources:', error);
 toast({
 title: 'Error',
 description: 'Failed to load literature sources',
 variant: 'destructive',
 });
 }
 };

 fetchSources();
 }, [toast]);

 const handleSearch = async e => {
 e?.preventDefault();

 if (!searchQuery.trim()) {
 toast({
 title: 'Error',
 description: 'Please enter a search query',
 variant: 'destructive',
 });
 return;
 }

 setIsLoading(true);
 setSearchResults([]);
 setLastExecutedQuery(searchQuery);

 try {
 const response = await axios.post('/api/510k/literature/search', {
 query: searchQuery,
 sources: selectedSources,
 useSemanticSearch,
 organizationId: organizationId || 'default-org',
 });

 setSearchResults(response.data.results);

 if (response.data.results.length === 0) {
 toast({
 title: 'No results found',
 description: 'Try broadening your search or using different keywords',
 variant: 'default',
 });
 }
 } catch (error) {
 console.error('Error searching literature:', error);
 toast({
 title: 'Search failed',
 description: error.response?.data?.error || 'An unexpected error occurred',
 variant: 'destructive',
 });
 } finally {
 setIsLoading(false);
 }
 };

 const handleCite = async entry => {
 if (!documentId) {
 toast({
 title: 'Cannot cite',
 description: 'No document is currently selected',
 variant: 'destructive',
 });
 return;
 }

 try {
 const response = await axios.post('/api/510k/literature/cite', {
 literatureId: entry.id,
 documentId,
 documentType: documentType || '510k',
 sectionId: 'current-section', // This should be dynamically set based on the active section
 sectionName: 'Current Section', // This should be dynamically set based on the active section
 citationText: `${entry.authors ? entry.authors.join(', ') : 'Unknown'} (${
 entry.publication_date ? new Date(entry.publication_date).getFullYear() : 'n.d.'
 }). ${entry.title}. ${entry.journal || 'Unknown source'}.`,
 organizationId: organizationId || 'default-org',
 });

 toast({
 title: 'Citation added',
 description: 'The literature has been cited in your document',
 variant: 'default',
 });

 // Call the callback if provided
 if (onCiteSuccess) {
 onCiteSuccess(response.data.citation);
 }
 } catch (error) {
 console.error('Error citing literature:', error);
 toast({
 title: 'Citation failed',
 description: error.response?.data?.error || 'An unexpected error occurred',
 variant: 'destructive',
 });
 }
 };

 const handleSourceToggle = sourceId => {
 if (selectedSources.includes(sourceId)) {
 setSelectedSources(selectedSources.filter(id => id !== sourceId));
 } else {
 setSelectedSources([...selectedSources, sourceId]);
 }
 };

 const handleEntrySelection = entry => {
 if (!multiSelectMode) return;

 const isSelected = selectedEntries.some(e => e.id === entry.id);

 if (isSelected) {
 setSelectedEntries(selectedEntries.filter(e => e.id !== entry.id));
 } else {
 setSelectedEntries([...selectedEntries, entry]);
 }
 };

 const handleSummarize = entries => {
 if (multiSelectMode) {
 if (!entries && selectedEntries.length === 0) {
 toast({
 title: 'Cannot summarize',
 description: 'Please select at least one literature entry',
 variant: 'destructive',
 });
 return;
 }

 // Use passed entries or selectedEntries if in multi-select mode
 const entriesToSummarize = entries || selectedEntries;
 onSummarize(entriesToSummarize);
 } else {
 // In single selection mode, just pass the provided entries
 onSummarize(entries);
 }
 };

 const onSummarize = entries => {
 // This should be provided by parent component or
 // implement a local summarization UI
 toast({
 title: 'Summarize feature',
 description: `Selected ${entries.length} entries for summarization`,
 variant: 'default',
 });

 // Navigate to summary page with selected entry IDs
 // or open a modal for summary configuration
 };

 return (
 <div className="enhanced-literature-search">
 <Card>
 <CardHeader>
 <CardTitle className="text-xl">Enhanced Literature Search</CardTitle>
 <CardDescription>
 Search and cite literature from multiple sources for your 510(k) submission
 </CardDescription>
 </CardHeader>
 <CardContent>
 <form onSubmit={handleSearch} className="mb-4">
 <div className="flex w-full items-center space-x-2">
 <Input
 type="text"
 placeholder="Search for literature..."
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 className="flex-grow"
 />
 <Button type="submit" disabled={isLoading}>
 {isLoading ? (
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 ) : (
 <Search className="mr-2 h-4 w-4" />
 )}
 Search
 </Button>
 </div>

 <div className="mt-4">
 <Accordion type="single" collapsible className="w-full">
 <AccordionItem value="options">
 <AccordionTrigger className="text-sm">Search Options</AccordionTrigger>
 <AccordionContent>
 <div className="grid gap-4">
 <div className="flex items-center space-x-2">
 <Switch
 id="semantic-search"
 checked={useSemanticSearch}
 onCheckedChange={setUseSemanticSearch}
 />
 <Label htmlFor="semantic-search">Use Semantic Search</Label>
 <Info
 className="h-4 w-4 text-muted-foreground cursor-help"
 title="Semantic search understands the meaning of your query, not just keywords"
 />
 </div>

 <div>
 <Label className="block mb-2">Search Sources</Label>
 <div className="grid grid-cols-2 gap-2">
 {sources.map(source => (
 <div key={source.id} className="flex items-center space-x-2">
 <Checkbox
 id={`source-${source.id}`}
 checked={selectedSources.includes(source.id)}
 onCheckedChange={() => handleSourceToggle(source.id)}
 />
 <Label
 htmlFor={`source-${source.id}`}
 className="text-sm cursor-pointer"
 >
 {source.name}
 </Label>
 </div>
 ))}
 </div>
 </div>
 </div>
 </AccordionContent>
 </AccordionItem>
 </Accordion>
 </div>
 </form>

 {lastExecutedQuery && (
 <div className="mb-4">
 <h3 className="text-sm font-medium mb-2">
 {isLoading
 ? 'Searching...'
 : `Results for "${lastExecutedQuery}" (${searchResults.length})`}
 </h3>
 <Separator />
 </div>
 )}

 {searchResults.length > 0 && multiSelectMode && (
 <div className="mb-4 flex justify-between items-center">
 <span className="text-sm">
 {selectedEntries.length} {selectedEntries.length === 1 ? 'entry' : 'entries'}{' '}
 selected
 </span>

 <div>
 <Button
 variant="outline"
 size="sm"
 disabled={selectedEntries.length === 0}
 onClick={() => handleSummarize()}
 className="mr-2"
 >
 <Book className="mr-1 h-4 w-4" />
 Summarize Selected
 </Button>

 <Button
 variant="ghost"
 size="sm"
 onClick={() => setSelectedEntries([])}
 disabled={selectedEntries.length === 0}
 >
 <X className="mr-1 h-4 w-4" />
 Clear Selection
 </Button>
 </div>
 </div>
 )}

 {isLoading ? (
 <div className="flex justify-center items-center py-12">
 <Loader2 className="h-8 w-8 animate-spin text-primary" />
 <span className="ml-2">Searching literature...</span>
 </div>
 ) : searchResults.length > 0 ? (
 <ScrollArea className="max-h-[500px]">
 {searchResults.map(result => (
 <div
 key={result.id}
 className={`relative ${multiSelectMode ? 'cursor-pointer' : ''}`}
 onClick={() => handleEntrySelection(result)}
 >
 {multiSelectMode && (
 <div className="absolute top-2 right-2 z-10">
 <Checkbox
 checked={selectedEntries.some(e => e.id === result.id)}
 onCheckedChange={checked => {
 if (checked) {
 setSelectedEntries([...selectedEntries, result]);
 } else {
 setSelectedEntries(selectedEntries.filter(e => e.id !== result.id));
 }
 }}
 onClick={e => e.stopPropagation()}
 />
 </div>
 )}
 <LiteratureSearchResult
 result={result}
 onCite={handleCite}
 onSummarize={handleSummarize}
 />
 </div>
 ))}
 </ScrollArea>
 ) : (
 lastExecutedQuery && (
 <Alert className="mt-4">
 <Info className="h-4 w-4" />
 <AlertTitle>No results found</AlertTitle>
 <AlertDescription>
 Try broadening your search or using different keywords
 </AlertDescription>
 </Alert>
 )
 )}
 </CardContent>
 </Card>
 </div>
 );
};

export default EnhancedLiteratureSearch;
