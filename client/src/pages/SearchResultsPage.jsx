/**
 * Search Results Page
 * SharePoint-style search results with refiners and comprehensive display
 * Features filtering, sorting, pagination, and intelligent result display
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import Mark from 'mark.js';
import { 
  Search,
  Filter,
  Download,
  Share2,
  Eye,
  Clock,
  User,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  X,
  FileText,
  Folder,
  AlertCircle,
  Info,
  CheckCircle,
  Sparkles,
  TrendingUp,
  RefreshCw,
  Grid,
  List,
  MoreVertical,
  Copy,
  Link,
  Star,
  Loader2,
  FileIcon,
  Hash,
  GitBranch,
  Table,
  Presentation
} from 'lucide-react';
import { GlobalSearchComponent } from '@/components/coauthor/GlobalSearchComponent';
import { AdvancedSearchPanel } from '@/components/coauthor/AdvancedSearchPanel';

// Helper function to get file icon
function getFileIcon(type, fileName) {
  const name = fileName?.toLowerCase() || '';
  const typeStr = type?.toLowerCase() || '';
  
  if (typeStr.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) {
    return <FileText className="h-6 w-6 text-blue-600" />;
  }
  if (typeStr.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return <Table className="h-6 w-6 text-green-600" />;
  }
  if (typeStr.includes('powerpoint') || name.endsWith('.pptx') || name.endsWith('.ppt')) {
    return <Presentation className="h-6 w-6 text-orange-600" />;
  }
  if (typeStr.includes('pdf') || name.endsWith('.pdf')) {
    return <FileText className="h-6 w-6 text-red-600" />;
  }
  return <FileIcon className="h-6 w-6 text-slate-500" />;
}

// Helper to highlight search terms
function highlightSearchTerms(text, searchTerms) {
  if (!text || !searchTerms) return text;
  
  let highlightedText = text;
  const terms = searchTerms.split(' ').filter(t => t.length > 2);
  
  terms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 font-semibold">$1</mark>');
  });
  
  return highlightedText;
}

export default function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get search query from URL
  const queryParam = searchParams.get('q') || '';
  const advancedParam = searchParams.get('advanced');
  const pageParam = parseInt(searchParams.get('page') || '1');
  
  // Parse advanced search parameters if present
  const advancedSearchParams = useMemo(() => {
    if (advancedParam) {
      try {
        return JSON.parse(decodeURIComponent(advancedParam));
      } catch (e) {
        console.error('Failed to parse advanced params:', e);
        return null;
      }
    }
    return null;
  }, [advancedParam]);
  
  // State for filters and sorting
  const [viewMode, setViewMode] = useState('list'); // list or grid
  const [sortBy, setSortBy] = useState('relevance');
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
  const [selectedResults, setSelectedResults] = useState(new Set());
  const [activeRefiners, setActiveRefiners] = useState({
    fileType: [],
    module: [],
    status: [],
    author: [],
    dateRange: null
  });
  
  // Current page and items per page
  const [currentPage, setCurrentPage] = useState(pageParam);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Build search request
  const buildSearchRequest = () => {
    if (advancedSearchParams) {
      return advancedSearchParams;
    }
    
    return {
      query: queryParam,
      sortBy,
      filters: activeRefiners,
      page: currentPage,
      limit: itemsPerPage
    };
  };
  
  // Fetch search results
  const { data: searchResults, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/coauthor/search', queryParam, advancedSearchParams, sortBy, activeRefiners, currentPage],
    queryFn: async () => {
      const request = buildSearchRequest();
      const response = await apiRequest('POST', '/api/coauthor/search', request);
      return response.json();
    },
    enabled: !!(queryParam || advancedSearchParams),
    keepPreviousData: true
  });
  
  // Update URL when page changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (currentPage > 1) {
      newParams.set('page', currentPage.toString());
    } else {
      newParams.delete('page');
    }
    setSearchParams(newParams);
  }, [currentPage]);
  
  // Highlight search terms after results load
  useEffect(() => {
    if (searchResults?.results && queryParam) {
      setTimeout(() => {
        const markInstance = new Mark(document.querySelectorAll('.search-result-content'));
        markInstance.mark(queryParam.split(' '), {
          className: 'bg-yellow-200 dark:bg-yellow-800 font-semibold rounded px-0.5'
        });
      }, 100);
    }
  }, [searchResults, queryParam]);
  
  // Handle result selection
  const toggleResultSelection = (resultId) => {
    const newSelection = new Set(selectedResults);
    if (newSelection.has(resultId)) {
      newSelection.delete(resultId);
    } else {
      newSelection.add(resultId);
    }
    setSelectedResults(newSelection);
  };
  
  // Select all visible results
  const selectAllResults = () => {
    const allIds = searchResults?.results?.map(r => r.id) || [];
    setSelectedResults(new Set(allIds));
  };
  
  // Clear selection
  const clearSelection = () => {
    setSelectedResults(new Set());
  };
  
  // Apply refiner
  const applyRefiner = (refinerType, value, checked) => {
    setActiveRefiners(prev => {
      const updated = { ...prev };
      if (checked) {
        updated[refinerType] = [...updated[refinerType], value];
      } else {
        updated[refinerType] = updated[refinerType].filter(v => v !== value);
      }
      return updated;
    });
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Clear all refiners
  const clearAllRefiners = () => {
    setActiveRefiners({
      fileType: [],
      module: [],
      status: [],
      author: [],
      dateRange: null
    });
    setCurrentPage(1);
  };
  
  // Get active refiner count
  const activeRefinerCount = Object.values(activeRefiners).reduce((count, values) => {
    if (Array.isArray(values)) {
      return count + values.length;
    }
    return values ? count + 1 : count;
  }, 0);
  
  // Export selected results
  const exportResults = async (format = 'csv') => {
    try {
      const resultsToExport = selectedResults.size > 0 
        ? searchResults?.results?.filter(r => selectedResults.has(r.id))
        : searchResults?.results;
      
      const response = await apiRequest('POST', '/api/coauthor/search/export', {
        results: resultsToExport,
        format
      });
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `search-results-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: `Exported ${resultsToExport?.length || 0} results as ${format.toUpperCase()}`
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export failed",
        description: "Unable to export results",
        variant: "destructive"
      });
    }
  };
  
  // Share results
  const shareResults = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied",
      description: "Search results link copied to clipboard"
    });
  };
  
  // Calculate pagination
  const totalPages = Math.ceil((searchResults?.totalCount || 0) / itemsPerPage);
  const startResult = ((currentPage - 1) * itemsPerPage) + 1;
  const endResult = Math.min(currentPage * itemsPerPage, searchResults?.totalCount || 0);
  
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Search Bar */}
            <div className="flex-1 max-w-3xl">
              <GlobalSearchComponent 
                embedded={true}
                className="w-full"
              />
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedPanel(!showAdvancedPanel)}
                data-testid="button-toggle-advanced"
              >
                <Filter className="h-4 w-4 mr-1" />
                Advanced
              </Button>
              
              <div className="flex items-center gap-1 border-l pl-2 ml-2">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  data-testid="button-view-grid"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Advanced Search Panel */}
      {showAdvancedPanel && (
        <div className="container mx-auto px-4 py-4">
          <AdvancedSearchPanel
            initialQuery={queryParam}
            onClose={() => setShowAdvancedPanel(false)}
          />
        </div>
      )}
      
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Sidebar - Refiners */}
          <div className="w-64 flex-shrink-0">
            <Card className="sticky top-24">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Refine Results</h3>
                  {activeRefinerCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllRefiners}
                      data-testid="button-clear-refiners"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                
                <ScrollArea className="h-[600px]">
                  <div className="space-y-6">
                    {/* File Type Refiner */}
                    {searchResults?.facets?.fileTypes && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">File Type</h4>
                        <div className="space-y-2">
                          {searchResults.facets.fileTypes.map(type => (
                            <div key={type.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={activeRefiners.fileType.includes(type.value)}
                                onCheckedChange={(checked) => applyRefiner('fileType', type.value, checked)}
                                data-testid={`refiner-filetype-${type.value}`}
                              />
                              <label className="flex-1 text-sm cursor-pointer flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  {type.value === 'word' && <FileText className="h-3 w-3 text-blue-600" />}
                                  {type.value === 'excel' && <Table className="h-3 w-3 text-green-600" />}
                                  {type.value === 'powerpoint' && <Presentation className="h-3 w-3 text-orange-600" />}
                                  {type.value === 'pdf' && <FileText className="h-3 w-3 text-red-600" />}
                                  {type.label}
                                </span>
                                <span className="text-xs text-slate-500">({type.count})</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Module Refiner */}
                    {searchResults?.facets?.modules && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Module</h4>
                        <div className="space-y-2">
                          {searchResults.facets.modules.map(module => (
                            <div key={module.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={activeRefiners.module.includes(module.value)}
                                onCheckedChange={(checked) => applyRefiner('module', module.value, checked)}
                                data-testid={`refiner-module-${module.value}`}
                              />
                              <label className="flex-1 text-sm cursor-pointer flex items-center justify-between">
                                <span>{module.label}</span>
                                <span className="text-xs text-slate-500">({module.count})</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Status Refiner */}
                    {searchResults?.facets?.statuses && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Status</h4>
                        <div className="space-y-2">
                          {searchResults.facets.statuses.map(status => (
                            <div key={status.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={activeRefiners.status.includes(status.value)}
                                onCheckedChange={(checked) => applyRefiner('status', status.value, checked)}
                                data-testid={`refiner-status-${status.value}`}
                              />
                              <label className="flex-1 text-sm cursor-pointer flex items-center justify-between">
                                <span>{status.label}</span>
                                <span className="text-xs text-slate-500">({status.count})</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Author Refiner */}
                    {searchResults?.facets?.authors && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Author</h4>
                        <div className="space-y-2">
                          {searchResults.facets.authors.slice(0, 5).map(author => (
                            <div key={author.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={activeRefiners.author.includes(author.value)}
                                onCheckedChange={(checked) => applyRefiner('author', author.value, checked)}
                                data-testid={`refiner-author-${author.value}`}
                              />
                              <label className="flex-1 text-sm cursor-pointer flex items-center justify-between">
                                <span className="truncate">{author.label}</span>
                                <span className="text-xs text-slate-500">({author.count})</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
          
          {/* Right Content - Results */}
          <div className="flex-1">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {queryParam ? `Search results for "${queryParam}"` : 'Search Results'}
                </h2>
                {searchResults && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Showing {startResult}-{endResult} of {searchResults.totalCount} results
                    {searchResults.searchTime && ` (${searchResults.searchTime}ms)`}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {selectedResults.size > 0 && (
                  <div className="flex items-center gap-2 mr-4">
                    <Badge variant="secondary">
                      {selectedResults.size} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                      data-testid="button-clear-selection"
                    >
                      Clear
                    </Button>
                  </div>
                )}
                
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="date">Date (Newest)</SelectItem>
                    <SelectItem value="date-oldest">Date (Oldest)</SelectItem>
                    <SelectItem value="name">Name (A-Z)</SelectItem>
                    <SelectItem value="size">Size</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportResults('csv')}
                  data-testid="button-export"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={shareResults}
                  data-testid="button-share"
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
              </div>
            </div>
            
            {/* Did You Mean Suggestion */}
            {searchResults?.didYouMean && (
              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Did you mean:{' '}
                  <button
                    className="text-blue-600 dark:text-blue-400 underline font-medium"
                    onClick={() => setLocation(`/search?q=${encodeURIComponent(searchResults.didYouMean)}`)}
                  >
                    {searchResults.didYouMean}
                  </button>
                  ?
                </AlertDescription>
              </Alert>
            )}
            
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Searching...</p>
              </div>
            )}
            
            {/* Error State */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load search results. Please try again.
                </AlertDescription>
              </Alert>
            )}
            
            {/* No Results State */}
            {searchResults && searchResults.results?.length === 0 && (
              <Card className="p-12">
                <div className="text-center">
                  <Search className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Try adjusting your search terms or removing some filters
                  </p>
                  <Button
                    variant="outline"
                    onClick={clearAllRefiners}
                    data-testid="button-clear-filters-empty"
                  >
                    Clear all filters
                  </Button>
                </div>
              </Card>
            )}
            
            {/* Results List/Grid */}
            {searchResults?.results && searchResults.results.length > 0 && (
              <>
                {viewMode === 'list' ? (
                  <div className="space-y-4">
                    {searchResults.results.map((result, index) => (
                      <Card 
                        key={result.id || index}
                        className="hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex gap-4">
                            {/* Selection Checkbox */}
                            <div className="flex items-start pt-1">
                              <Checkbox
                                checked={selectedResults.has(result.id)}
                                onCheckedChange={() => toggleResultSelection(result.id)}
                                data-testid={`checkbox-result-${result.id}`}
                              />
                            </div>
                            
                            {/* File Icon */}
                            <div className="flex-shrink-0">
                              {getFileIcon(result.type, result.fileName)}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Title */}
                              <h3 className="text-lg font-semibold mb-1">
                                <a 
                                  href="#"
                                  className="text-blue-600 dark:text-blue-400 hover:underline search-result-content"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    // Handle result click
                                  }}
                                  dangerouslySetInnerHTML={{ 
                                    __html: highlightSearchTerms(result.title, queryParam) 
                                  }}
                                />
                              </h3>
                              
                              {/* Path/Breadcrumb */}
                              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mb-2">
                                <Folder className="h-3 w-3" />
                                {result.path?.split('/').map((part, idx, arr) => (
                                  <React.Fragment key={idx}>
                                    <span>{part}</span>
                                    {idx < arr.length - 1 && <ChevronRight className="h-3 w-3" />}
                                  </React.Fragment>
                                ))}
                              </div>
                              
                              {/* Snippet */}
                              <p 
                                className="text-sm text-slate-700 dark:text-slate-300 mb-2 search-result-content"
                                dangerouslySetInnerHTML={{ 
                                  __html: highlightSearchTerms(result.snippet || result.description, queryParam) 
                                }}
                              />
                              
                              {/* Metadata */}
                              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                {result.udi && (
                                  <div className="flex items-center gap-1">
                                    <Hash className="h-3 w-3" />
                                    <code className="font-mono">{result.udi}</code>
                                  </div>
                                )}
                                {result.module && (
                                  <Badge variant="secondary" className="text-xs">
                                    {result.module}
                                  </Badge>
                                )}
                                {result.status && (
                                  <Badge variant="outline" className="text-xs">
                                    {result.status}
                                  </Badge>
                                )}
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(result.modifiedDate || result.createdDate).toLocaleDateString()}
                                </div>
                                {result.modifiedBy && (
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {result.modifiedBy}
                                  </div>
                                )}
                                {result.size && (
                                  <span>{(result.size / 1024).toFixed(1)} KB</span>
                                )}
                              </div>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-start gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-view-${result.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-download-${result.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-share-${result.id}`}
                              >
                                <Share2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  // Grid View
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {searchResults.results.map((result, index) => (
                      <Card 
                        key={result.id || index}
                        className="hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-shrink-0">
                              {getFileIcon(result.type, result.fileName)}
                            </div>
                            <Checkbox
                              checked={selectedResults.has(result.id)}
                              onCheckedChange={() => toggleResultSelection(result.id)}
                              data-testid={`checkbox-grid-${result.id}`}
                            />
                          </div>
                          
                          <h4 className="font-medium text-sm mb-2 line-clamp-2 search-result-content">
                            {result.title}
                          </h4>
                          
                          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-3 search-result-content">
                            {result.snippet || result.description}
                          </p>
                          
                          {result.udi && (
                            <code className="text-xs font-mono text-blue-600 dark:text-blue-400 block mb-2">
                              {result.udi}
                            </code>
                          )}
                          
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{new Date(result.modifiedDate || result.createdDate).toLocaleDateString()}</span>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                data-testid={`button-grid-view-${result.id}`}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                data-testid={`button-grid-download-${result.id}`}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-8">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-2">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            data-testid={`button-page-${pageNum}`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}