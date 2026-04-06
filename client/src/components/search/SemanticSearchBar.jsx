// client/src/components/search/SemanticSearchBar.jsx
import React, { useState } from 'react';
import { Search, Filter, Zap, FileText, Database, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuTrigger,
 DropdownMenuSeparator,
 DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

/**
 * Advanced Semantic Search Component
 *
 * Features:
 * - Natural language search across all content
 * - Semantic understanding with OpenAI embeddings
 * - Filters for document types, modules, and date ranges
 * - Support for complex queries like "critical deviations in EU in Q1"
 */
export default function SemanticSearchBar({
 onSearch,
 placeholder = 'Search across all documents and data...',
 showFilters = true,
 size = 'default',
 className = '',
 initialFilters = {},
}) {
 const [query, setQuery] = useState('');
 const [isSearching, setIsSearching] = useState(false);
 const [filters, setFilters] = useState({
 modules: initialFilters.modules || [],
 docTypes: initialFilters.docTypes || [],
 dateRange: initialFilters.dateRange || null,
 regions: initialFilters.regions || [],
 });
 const [searchMode, setSearchMode] = useState('semantic'); // 'semantic' or 'keyword'
 const { toast } = useToast();

 // Available filter options
 const moduleOptions = [
 { id: 'ind', label: 'IND' },
 { id: 'csr', label: 'CSR' },
 { id: 'cer', label: 'CER' },
 { id: 'regulatory', label: 'Regulatory' },
 { id: 'quality', label: 'Quality' },
 ];

 const docTypeOptions = [
 { id: 'protocol', label: 'Protocols' },
 { id: 'report', label: 'Reports' },
 { id: 'submission', label: 'Submissions' },
 { id: 'correspondence', label: 'Correspondence' },
 { id: 'sop', label: 'SOPs' },
 ];

 const regionOptions = [
 { id: 'us', label: 'US' },
 { id: 'eu', label: 'EU' },
 { id: 'jp', label: 'Japan' },
 { id: 'global', label: 'Global' },
 ];

 const exampleSearches = [
 'Safety concerns in Phase II trials',
 'Critical deviations in EU submissions Q1',
 'Protocol amendments with timeline impacts',
 'Quality issues requiring CAPA',
 'Patient recruitment challenges across sites',
 ];

 const toggleFilter = (type, id) => {
 setFilters(prev => {
 const current = [...prev[type]];
 const index = current.indexOf(id);

 if (index >= 0) {
 current.splice(index, 1);
 } else {
 current.push(id);
 }

 return {
 ...prev,
 [type]: current,
 };
 });
 };

 const clearAllFilters = () => {
 setFilters({
 modules: [],
 docTypes: [],
 dateRange: null,
 regions: [],
 });
 };

 const handleSearch = () => {
 setIsSearching(true);

 // In a real implementation, this would call an API with embeddings
 setTimeout(() => {
 if (onSearch) {
 onSearch({
 query,
 filters,
 searchMode,
 });
 }
 setIsSearching(false);
 }, 600);
 };

 const handleKeyDown = e => {
 if (e.key === 'Enter') {
 handleSearch();
 }
 };

 const suggestSearch = example => {
 setQuery(example);
 };

 const toggleSearchMode = () => {
 const newMode = searchMode === 'semantic' ? 'keyword' : 'semantic';
 setSearchMode(newMode);

 toast({
 title: `Search Mode: ${newMode === 'semantic' ? 'Semantic' : 'Keyword'}`,
 description:
 newMode === 'semantic'
 ? 'Using AI to understand the meaning behind your search'
 : 'Searching exact keywords only',
 variant: newMode === 'semantic' ? 'default' : 'secondary',
 });
 };

 const getActiveFilterCount = () => {
 return (
 filters.modules.length +
 filters.docTypes.length +
 filters.regions.length +
 (filters.dateRange ? 1 : 0)
 );
 };

 return (
 <div className={`w-full flex flex-col gap-2 ${className}`}>
 <div className="relative w-full flex items-center gap-2">
 <div className="relative flex-1">
 <Input
 type="text"
 value={query}
 onChange={e => setQuery(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder={placeholder}
 className={`pr-10 ${size === 'lg' ? 'py-6 text-lg' : ''}`}
 />
 <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
 {searchMode === 'semantic' ? (
 <Sparkles className="h-4 w-4 text-purple-500" />
 ) : (
 <Search className="h-4 w-4 text-gray-400" />
 )}
 </div>
 </div>

 <Button
 onClick={handleSearch}
 disabled={isSearching}
 variant="default"
 size={size === 'lg' ? 'lg' : 'default'}
 >
 {isSearching ? 'Searching...' : 'Search'}
 {!isSearching && <Search className="ml-2 h-4 w-4" />}
 </Button>

 <Button
 variant="outline"
 size={size === 'lg' ? 'lg' : 'default'}
 onClick={toggleSearchMode}
 title={`Currently using ${searchMode} search. Click to toggle.`}
 className="flex items-center gap-1"
 >
 {searchMode === 'semantic' ? (
 <>
 <Sparkles className="h-4 w-4 text-purple-500" />
 <span className="hidden md:inline">AI</span>
 </>
 ) : (
 <>
 <Database className="h-4 w-4" />
 <span className="hidden md:inline">Basic</span>
 </>
 )}
 </Button>

 {showFilters && (
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="outline" size={size === 'lg' ? 'lg' : 'default'}>
 <Filter className="h-4 w-4 mr-2" />
 Filters
 {getActiveFilterCount() > 0 && (
 <Badge variant="secondary" className="ml-2 bg-primary text-primary-foreground">
 {getActiveFilterCount()}
 </Badge>
 )}
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-60">
 <DropdownMenuLabel>Filter by Module</DropdownMenuLabel>
 {moduleOptions.map(option => (
 <DropdownMenuItem
 key={option.id}
 onClick={() => toggleFilter('modules', option.id)}
 >
 <div className="flex items-center justify-between w-full">
 <span>{option.label}</span>
 {filters.modules.includes(option.id) && (
 <Zap className="h-4 w-4 text-primary" />
 )}
 </div>
 </DropdownMenuItem>
 ))}

 <DropdownMenuSeparator />
 <DropdownMenuLabel>Document Types</DropdownMenuLabel>
 {docTypeOptions.map(option => (
 <DropdownMenuItem
 key={option.id}
 onClick={() => toggleFilter('docTypes', option.id)}
 >
 <div className="flex items-center justify-between w-full">
 <span>{option.label}</span>
 {filters.docTypes.includes(option.id) && (
 <Zap className="h-4 w-4 text-primary" />
 )}
 </div>
 </DropdownMenuItem>
 ))}

 <DropdownMenuSeparator />
 <DropdownMenuLabel>Regions</DropdownMenuLabel>
 {regionOptions.map(option => (
 <DropdownMenuItem
 key={option.id}
 onClick={() => toggleFilter('regions', option.id)}
 >
 <div className="flex items-center justify-between w-full">
 <span>{option.label}</span>
 {filters.regions.includes(option.id) && (
 <Zap className="h-4 w-4 text-primary" />
 )}
 </div>
 </DropdownMenuItem>
 ))}

 <DropdownMenuSeparator />
 <DropdownMenuItem onClick={clearAllFilters}>
 <div className="flex items-center justify-between w-full text-red-500">
 <span>Clear All Filters</span>
 </div>
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 )}
 </div>

 {/* Example searches */}
 <div className="flex flex-wrap gap-2 text-xs text-gray-500">
 <span className="pt-0.5">Try:</span>
 {exampleSearches.map((example, i) => (
 <button
 key={i}
 onClick={() => suggestSearch(example)}
 className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 text-xs inline-flex items-center"
 >
 <FileText className="h-3 w-3 mr-1" />
 {example}
 </button>
 ))}
 </div>

 {/* Active filters display */}
 {getActiveFilterCount() > 0 && (
 <div className="flex flex-wrap gap-2 mt-1">
 {filters.modules.map(id => {
 const option = moduleOptions.find(o => o.id === id);
 return option ? (
 <Badge key={id} variant="outline" className="flex items-center gap-1 bg-purple-50">
 <span>{option.label}</span>
 <button
 onClick={() => toggleFilter('modules', id)}
 className="ml-1 text-gray-500 hover:text-gray-700"
 >
 ×
 </button>
 </Badge>
 ) : null;
 })}

 {filters.docTypes.map(id => {
 const option = docTypeOptions.find(o => o.id === id);
 return option ? (
 <Badge key={id} variant="outline" className="flex items-center gap-1 bg-stone-50">
 <span>{option.label}</span>
 <button
 onClick={() => toggleFilter('docTypes', id)}
 className="ml-1 text-gray-500 hover:text-gray-700"
 >
 ×
 </button>
 </Badge>
 ) : null;
 })}

 {filters.regions.map(id => {
 const option = regionOptions.find(o => o.id === id);
 return option ? (
 <Badge key={id} variant="outline" className="flex items-center gap-1 bg-green-50">
 <span>{option.label}</span>
 <button
 onClick={() => toggleFilter('regions', id)}
 className="ml-1 text-gray-500 hover:text-gray-700"
 >
 ×
 </button>
 </Badge>
 ) : null;
 })}
 </div>
 )}
 </div>
 );
}
