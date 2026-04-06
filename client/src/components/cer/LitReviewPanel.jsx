import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
 Search,
 Filter,
 Calendar,
 FileText,
 Plus,
 Check,
 X,
 ExternalLink,
 Clock,
 Upload,
 Trash,
 BookOpen,
 GraduationCap,
 Beaker,
 Database,
 FileCheck,
 FileWarning,
} from 'lucide-react';

export default function LitReviewPanel() {
 const [searchQuery, setSearchQuery] = useState('');
 const [currentTab, setCurrentTab] = useState('search');
 const [searchResults, setSearchResults] = useState([]);
 const [selectedArticles, setSelectedArticles] = useState([]);
 const [searching, setSearching] = useState(false);
 const [filters, setFilters] = useState({
 yearStart: 2020,
 yearEnd: 2025,
 peerReviewedOnly: true,
 fullTextAvailable: true,
 includePreprints: false,
 keywordFilters: ['efficacy', 'safety', 'clinical trial'],
 });

 // Simulate search functionality
 const handleSearch = () => {
 if (!searchQuery.trim()) return;

 setSearching(true);
 setSearchResults([]);

 // Simulate API call delay
 setTimeout(() => {
 const mockResults = [
 {
 id: '10.1056/NEJMra1910136',
 title: 'Advances in Enzyme Replacement Therapy for Metabolic Disorders',
 authors: 'Chen M, Johnson S, Smith RJ',
 journal: 'New England Journal of Medicine',
 year: 2024,
 abstract:
 'Recent advances in enzyme replacement therapy have shown significant promise for treating various metabolic disorders. This review summarizes clinical evidence from pivotal trials and real-world data.',
 keywords: [
 'enzyme replacement therapy',
 'metabolic disorders',
 'clinical trials',
 'efficacy',
 ],
 citationCount: 47,
 fullTextAvailable: true,
 peerReviewed: true,
 },
 {
 id: '10.1016/j.jceh.2023.06.003',
 title:
 'Long-term Safety Profile of Enzymex Forte in Adult Patients: A Five-Year Follow-up Study',
 authors: 'Rodriguez KL, Williams P, Li X',
 journal: 'Journal of Clinical Enzymology and Health',
 year: 2023,
 abstract:
 'This five-year follow-up study evaluates the long-term safety profile of Enzymex Forte in adult patients with enzyme deficiencies. Results indicate a favorable safety profile with minimal adverse events.',
 keywords: ['Enzymex', 'enzyme therapy', 'safety', 'long-term follow-up'],
 citationCount: 28,
 fullTextAvailable: true,
 peerReviewed: true,
 },
 {
 id: '10.1038/s41591-022-01942-9',
 title: 'Comparative Efficacy of Novel Enzyme Formulations in Pediatric Patients',
 authors: 'Patel A, Schneider B, Martinez C',
 journal: 'Nature Medicine',
 year: 2022,
 abstract:
 'This randomized controlled trial compares the efficacy of three novel enzyme formulations, including Enzymex Forte, in pediatric patients with enzyme deficiencies. Enzymex Forte demonstrated superior efficacy with comparable safety.',
 keywords: ['comparative efficacy', 'enzyme formulations', 'pediatric', 'clinical trial'],
 citationCount: 63,
 fullTextAvailable: true,
 peerReviewed: true,
 },
 {
 id: '10.1101/2024.02.15.573921',
 title:
 'Mechanism of Action of Enzymex Forte: Insights from Molecular Dynamics Simulations',
 authors: 'Zhang Y, Kumar R',
 journal: 'bioRxiv',
 year: 2024,
 abstract:
 'This preprint explores the molecular mechanism underlying the enhanced activity of Enzymex Forte using computational methods. Results suggest a novel binding mode that explains improved clinical outcomes.',
 keywords: ['mechanism of action', 'molecular dynamics', 'enzyme kinetics'],
 citationCount: 5,
 fullTextAvailable: true,
 peerReviewed: false,
 },
 {
 id: '10.1016/j.clint.2023.08.012',
 title:
 'Real-world Effectiveness of Enzyme Replacement Therapies in Rare Metabolic Conditions',
 authors: 'Blackwell T, Davidson J, Miller HS',
 journal: 'Clinical Therapeutics',
 year: 2023,
 abstract:
 'This retrospective analysis of registry data evaluates the real-world effectiveness of enzyme replacement therapies, including Enzymex Forte, in patients with rare metabolic conditions. Outcomes are consistent with clinical trial results.',
 keywords: ['real-world evidence', 'registry data', 'enzyme replacement', 'effectiveness'],
 citationCount: 19,
 fullTextAvailable: false,
 peerReviewed: true,
 },
 {
 id: '10.1002/jimd.12455',
 title:
 'Systematic Review and Meta-analysis of Enzyme Replacement Therapies for Lysosomal Storage Disorders',
 authors: 'Brown L, Fernandez G, Cho SY',
 journal: 'Journal of Inherited Metabolic Disease',
 year: 2021,
 abstract:
 'This systematic review and meta-analysis evaluates the efficacy and safety of enzyme replacement therapies for lysosomal storage disorders. Pooled data from 24 studies demonstrates significant clinical benefits with manageable safety profiles.',
 keywords: [
 'systematic review',
 'meta-analysis',
 'lysosomal storage disorders',
 'enzyme replacement therapy',
 ],
 citationCount: 89,
 fullTextAvailable: true,
 peerReviewed: true,
 },
 ];

 setSearchResults(mockResults);
 setSearching(false);
 }, 1500);
 };

 const toggleArticleSelection = article => {
 if (selectedArticles.some(a => a.id === article.id)) {
 setSelectedArticles(selectedArticles.filter(a => a.id !== article.id));
 } else {
 setSelectedArticles([...selectedArticles, article]);
 }
 };

 const handleFilterChange = (key, value) => {
 setFilters({
 ...filters,
 [key]: value,
 });
 };

 const handleKeywordAdd = e => {
 if (e.key === 'Enter' && e.target.value.trim()) {
 const newKeyword = e.target.value.trim();
 if (!filters.keywordFilters.includes(newKeyword)) {
 setFilters({
 ...filters,
 keywordFilters: [...filters.keywordFilters, newKeyword],
 });
 e.target.value = '';
 }
 }
 };

 const removeKeywordFilter = keyword => {
 setFilters({
 ...filters,
 keywordFilters: filters.keywordFilters.filter(k => k !== keyword),
 });
 };

 const uploadPaperHandler = () => {
 // In a real app, this would trigger a file upload dialog
 document.getElementById('paper-upload').click();
 };

 const handleFileUpload = e => {
 if (e.target.files.length > 0) {
 // In a real app, we would upload the file and process it
 // For now, we'll just simulate adding it to the selected articles
 const file = e.target.files[0];

 const newArticle = {
 id: `upload-${Date.now()}`,
 title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
 authors: 'Manually Uploaded',
 journal: 'User Upload',
 year: new Date().getFullYear(),
 abstract: 'This is a manually uploaded document.',
 keywords: ['user upload'],
 citationCount: 0,
 fullTextAvailable: true,
 peerReviewed: false,
 isUpload: true,
 };

 setSelectedArticles([...selectedArticles, newArticle]);

 // Reset file input
 e.target.value = '';

 // Switch to selected tab
 setCurrentTab('selected');
 }
 };

 const handleClearSelections = () => {
 if (confirm('Are you sure you want to clear all selected literature?')) {
 setSelectedArticles([]);
 }
 };

 const getSourceIcon = article => {
 if (article.isUpload) return <Upload className="h-4 w-4 text-purple-500" />;
 if (!article.peerReviewed) return <FileWarning className="h-4 w-4 text-yellow-500" />;

 const journal = article.journal.toLowerCase();
 if (
 journal.includes('nature') ||
 journal.includes('science') ||
 journal.includes('cell') ||
 journal.includes('nejm')
 ) {
 return <GraduationCap className="h-4 w-4 text-indigo-600" />;
 } else if (
 journal.includes('clinical') ||
 journal.includes('medicine') ||
 journal.includes('medical') ||
 journal.includes('therapeutic')
 ) {
 return <Beaker className="h-4 w-4 text-stone-600" />;
 } else if (journal.includes('review') || journal.includes('meta')) {
 return <Database className="h-4 w-4 text-emerald-600" />;
 }

 return <FileCheck className="h-4 w-4 text-gray-500" />;
 };

 return (
 <div className="space-y-6">
 <Card>
 <CardContent className="pt-6">
 <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
 <h3 className="text-lg font-semibold flex items-center">
 <BookOpen className="mr-2 h-5 w-5 text-stone-600" />
 Literature Review
 </h3>
 <div className="mt-2 sm:mt-0 flex space-x-2">
 <Badge variant="outline" className="flex items-center">
 <Clock className="mr-1 h-3 w-3" />
 <span>{selectedArticles.length} publications selected</span>
 </Badge>
 {selectedArticles.length > 0 && (
 <Button variant="ghost" size="sm" onClick={handleClearSelections}>
 <Trash className="mr-1 h-3 w-3" />
 Clear
 </Button>
 )}
 </div>
 </div>

 <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
 <TabsList>
 <TabsTrigger value="search" className="flex items-center">
 <Search className="mr-2 h-4 w-4" />
 Search
 </TabsTrigger>
 <TabsTrigger value="selected" className="flex items-center">
 <FileText className="mr-2 h-4 w-4" />
 Selected ({selectedArticles.length})
 </TabsTrigger>
 <TabsTrigger value="upload" className="flex items-center">
 <Upload className="mr-2 h-4 w-4" />
 Upload Paper
 </TabsTrigger>
 </TabsList>

 <TabsContent value="search">
 <div className="space-y-4">
 <div className="flex flex-col sm:flex-row items-start gap-4">
 <div className="w-full sm:w-3/4">
 <div className="flex space-x-2">
 <div className="relative flex-grow">
 <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
 <Input
 placeholder="Search for relevant literature..."
 className="pl-9"
 value={searchQuery}
 onChange={e => setSearchQuery(e.target.value)}
 onKeyPress={e => e.key === 'Enter' && handleSearch()}
 />
 </div>
 <Button onClick={handleSearch} disabled={searching}>
 {searching ? 'Searching...' : 'Search'}
 </Button>
 </div>
 <p className="text-xs text-gray-500 mt-1">
 Search PubMed, Google Scholar, and other scientific databases
 </p>
 </div>

 <div className="w-full sm:w-1/4">
 <div className="flex items-center p-2 border rounded-md">
 <Filter className="h-4 w-4 text-gray-500 mr-2" />
 <span className="text-sm font-medium">
 Filters Applied: {Object.values(filters).flat().filter(Boolean).length}
 </span>
 </div>
 </div>
 </div>

 {searching && (
 <div className="py-8 text-center">
 <p className="text-sm text-gray-500 mb-2">Searching multiple databases...</p>
 <Progress value={65} className="max-w-md mx-auto" />
 </div>
 )}

 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <div className="md:col-span-1">
 <Card>
 <CardContent className="p-4">
 <h4 className="font-medium text-sm mb-3">Filter Results</h4>
 <div className="space-y-4">
 <div>
 <Label className="text-xs">Publication Year Range</Label>
 <div className="flex items-center space-x-2 mt-1">
 <Input
 type="number"
 min="1900"
 max="2030"
 value={filters.yearStart}
 onChange={e =>
 handleFilterChange('yearStart', parseInt(e.target.value))
 }
 className="w-24"
 />
 <span>to</span>
 <Input
 type="number"
 min="1900"
 max="2030"
 value={filters.yearEnd}
 onChange={e =>
 handleFilterChange('yearEnd', parseInt(e.target.value))
 }
 className="w-24"
 />
 </div>
 </div>

 <Separator />

 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <Label htmlFor="peer-reviewed" className="text-xs">
 Peer-Reviewed Only
 </Label>
 <Switch
 id="peer-reviewed"
 checked={filters.peerReviewedOnly}
 onCheckedChange={checked =>
 handleFilterChange('peerReviewedOnly', checked)
 }
 />
 </div>

 <div className="flex items-center justify-between">
 <Label htmlFor="full-text" className="text-xs">
 Full Text Available
 </Label>
 <Switch
 id="full-text"
 checked={filters.fullTextAvailable}
 onCheckedChange={checked =>
 handleFilterChange('fullTextAvailable', checked)
 }
 />
 </div>

 <div className="flex items-center justify-between">
 <Label htmlFor="preprints" className="text-xs">
 Include Preprints
 </Label>
 <Switch
 id="preprints"
 checked={filters.includePreprints}
 onCheckedChange={checked =>
 handleFilterChange('includePreprints', checked)
 }
 />
 </div>
 </div>

 <Separator />

 <div>
 <Label className="text-xs">Keyword Filters</Label>
 <Input
 placeholder="Add keyword and press Enter"
 onKeyPress={handleKeywordAdd}
 className="mt-1"
 />
 <div className="flex flex-wrap gap-1 mt-2">
 {filters.keywordFilters.map(keyword => (
 <Badge
 key={keyword}
 variant="secondary"
 className="flex items-center gap-1"
 >
 {keyword}
 <X
 className="h-3 w-3 cursor-pointer"
 onClick={() => removeKeywordFilter(keyword)}
 />
 </Badge>
 ))}
 </div>
 </div>

 <Button
 variant="outline"
 size="sm"
 className="w-full"
 onClick={() => handleSearch()}
 >
 Apply Filters
 </Button>
 </div>
 </CardContent>
 </Card>
 </div>

 <div className="md:col-span-3">
 {searchResults.length === 0 && !searching ? (
 <div className="text-center py-12 border rounded-md">
 <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
 <h3 className="text-lg font-medium text-gray-700 mb-1">
 No search results yet
 </h3>
 <p className="text-gray-500">
 Enter search terms or try different filters to find relevant literature
 </p>
 </div>
 ) : (
 <div className="space-y-4">
 {searchResults.map(article => (
 <Card
 key={article.id}
 className={`transition-all ${
 selectedArticles.some(a => a.id === article.id)
 ? 'border-stone-500 bg-stone-50'
 : ''
 }`}
 >
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <div className="flex items-center mb-1 gap-2">
 {getSourceIcon(article)}
 <Badge variant="outline" className="text-xs">
 {article.journal}
 </Badge>
 <Badge variant="outline" className="text-xs bg-stone-50">
 <Calendar className="h-3 w-3 mr-1" />
 {article.year}
 </Badge>
 {article.citationCount > 0 && (
 <Badge variant="outline" className="text-xs bg-amber-50">
 {article.citationCount} citations
 </Badge>
 )}
 </div>

 <h4 className="font-medium text-base mb-1">{article.title}</h4>
 <p className="text-sm text-gray-600 mb-2">{article.authors}</p>

 <p className="text-sm text-gray-500 line-clamp-2 mb-2">
 {article.abstract}
 </p>

 <div className="flex flex-wrap gap-1">
 {article.keywords.map(keyword => (
 <Badge key={keyword} variant="secondary" className="text-xs">
 {keyword}
 </Badge>
 ))}
 </div>
 </div>

 <div className="flex items-center ml-4">
 <Button
 variant={
 selectedArticles.some(a => a.id === article.id)
 ? 'default'
 : 'outline'
 }
 size="sm"
 className="min-w-24"
 onClick={() => toggleArticleSelection(article)}
 >
 {selectedArticles.some(a => a.id === article.id) ? (
 <>
 <Check className="mr-1 h-4 w-4" />
 Selected
 </>
 ) : (
 <>
 <Plus className="mr-1 h-4 w-4" />
 Select
 </>
 )}
 </Button>
 </div>
 </div>

 <div className="flex justify-between items-center mt-3 pt-2 border-t">
 <div className="flex space-x-2">
 <Badge
 variant={article.fullTextAvailable ? 'success' : 'outline'}
 className="text-xs"
 >
 {article.fullTextAvailable
 ? 'Full Text Available'
 : 'Abstract Only'}
 </Badge>
 <Badge
 variant={article.peerReviewed ? 'success' : 'warning'}
 className="text-xs"
 >
 {article.peerReviewed ? 'Peer Reviewed' : 'Preprint'}
 </Badge>
 </div>
 <Button variant="ghost" size="sm">
 <ExternalLink className="h-3.5 w-3.5 mr-1" />
 View Source
 </Button>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 </TabsContent>

 <TabsContent value="selected">
 {selectedArticles.length === 0 ? (
 <div className="text-center py-12 border rounded-md">
 <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
 <h3 className="text-lg font-medium text-gray-700 mb-1">
 No literature selected yet
 </h3>
 <p className="text-gray-500 mb-3">
 Search for and select relevant articles for your clinical evaluation
 </p>
 <Button onClick={() => setCurrentTab('search')}>
 <Search className="mr-2 h-4 w-4" />
 Search Literature
 </Button>
 </div>
 ) : (
 <div className="space-y-4">
 <div className="flex justify-between items-center">
 <h4 className="font-medium">Selected Literature ({selectedArticles.length})</h4>
 <div className="flex space-x-2">
 <Button variant="outline" size="sm" onClick={() => setCurrentTab('search')}>
 <Plus className="mr-1 h-4 w-4" />
 Add More
 </Button>
 <Button variant="destructive" size="sm" onClick={handleClearSelections}>
 <Trash className="mr-1 h-4 w-4" />
 Clear All
 </Button>
 </div>
 </div>

 <div className="space-y-3">
 {selectedArticles.map(article => (
 <Card key={article.id}>
 <CardContent className="p-4">
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <div className="flex items-center mb-1 gap-2">
 {getSourceIcon(article)}
 <Badge variant="outline" className="text-xs">
 {article.journal}
 </Badge>
 <Badge variant="outline" className="text-xs">
 {article.year}
 </Badge>
 </div>

 <h4 className="font-medium text-base mb-1">{article.title}</h4>
 <p className="text-sm text-gray-600">{article.authors}</p>
 </div>

 <Button
 variant="ghost"
 size="sm"
 onClick={() => toggleArticleSelection(article)}
 className="text-red-500 hover:text-red-700"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>

 <div className="bg-stone-50 p-4 rounded-md">
 <div className="flex justify-between items-center">
 <div>
 <h4 className="font-medium text-stone-800">Literature Review Summary</h4>
 <p className="text-sm text-stone-600">
 Selected literature will be incorporated into your Clinical Evaluation
 Report
 </p>
 </div>

 <Button>
 <FileText className="mr-2 h-4 w-4" />
 Generate Literature Review
 </Button>
 </div>
 </div>
 </div>
 )}
 </TabsContent>

 <TabsContent value="upload">
 <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-md">
 <Upload className="h-12 w-12 text-gray-300 mx-auto mb-3" />
 <h3 className="text-lg font-medium text-gray-700 mb-1">Upload Literature</h3>
 <p className="text-gray-500 max-w-md mx-auto mb-3">
 Upload PDFs of literature relevant to your clinical evaluation. The system will
 extract key information automatically.
 </p>
 <input
 id="paper-upload"
 type="file"
 accept=".pdf"
 className="hidden"
 onChange={handleFileUpload}
 />
 <Button onClick={uploadPaperHandler}>
 <Upload className="mr-2 h-4 w-4" />
 Select PDF File
 </Button>
 </div>

 <div className="mt-6 space-y-2">
 <h4 className="font-medium">Upload Guidelines</h4>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
 <div className="flex space-x-2">
 <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
 <p>Upload peer-reviewed journal articles relevant to your device</p>
 </div>
 <div className="flex space-x-2">
 <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
 <p>Include systematic reviews and meta-analyses when available</p>
 </div>
 <div className="flex space-x-2">
 <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
 <p>Clinical studies with your specific device are especially valuable</p>
 </div>
 <div className="flex space-x-2">
 <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
 <p>Make sure PDFs are text-searchable for best extraction results</p>
 </div>
 <div className="flex space-x-2">
 <X className="h-4 w-4 text-red-500 flex-shrink-0" />
 <p>Avoid marketing materials or non-peer-reviewed content</p>
 </div>
 <div className="flex space-x-2">
 <X className="h-4 w-4 text-red-500 flex-shrink-0" />
 <p>Do not upload copyrighted content without proper permissions</p>
 </div>
 </div>
 </div>
 </TabsContent>
 </Tabs>
 </CardContent>
 </Card>
 </div>
 );
}
