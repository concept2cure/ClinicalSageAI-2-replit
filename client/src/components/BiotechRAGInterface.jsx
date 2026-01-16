import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import queryClient, { apiRequest } from '@/lib/queryClient';
import {
  Search, Upload, FileText, Download, BookOpen, Brain, Network, Filter, RefreshCw, ChevronRight, ChevronDown, AlertCircle, CheckCircle2, Info, X, File, Loader2, Send, Copy, ExternalLink, Star, StarOff, ThumbsUp, ThumbsDown, Microscope, Pill, Dna, FlaskConical, TestTube, Activity, ShieldCheck, FileSearch, MessageSquare, Sparkles, Hash, Target, Zap, GitBranch, BarChart3, PieChart, TrendingUp, Clock, Calendar, Settings, HelpCircle, ChevronLeft, MoreVertical, Maximize2, Share2, Save, Trash2, ArrowRight, Eye } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Scatter,
  ScatterChart,
  ZAxis,
  Treemap
} from 'recharts';

// Constants
const DOCUMENT_TYPES = [
  { value: 'pdf', label: 'PDF Document', icon: FileText },
  { value: 'csr', label: 'Clinical Study Report', icon: Activity },
  { value: 'protocol', label: 'Clinical Protocol', icon: FileSearch },
  { value: 'regulatory', label: 'Regulatory Document', icon: ShieldCheck },
  { value: 'patent', label: 'Patent', icon: GitBranch },
  { value: 'literature', label: 'Literature/Publication', icon: BookOpen },
  { value: 'ind', label: 'IND Application', icon: Pill },
  { value: 'nda', label: 'NDA Submission', icon: Target }
];

const SEARCH_MODES = [
  { value: 'hybrid', label: 'Hybrid Search', description: 'Combines semantic and keyword search' },
  { value: 'semantic', label: 'Semantic Search', description: 'AI-powered meaning-based search' },
  { value: 'keyword', label: 'Keyword Search', description: 'Traditional text matching' }
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

function BiotechRAGInterface({ organizationId = 7 }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState('hybrid');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('search');
  const [filters, setFilters] = useState({
    documentType: '',
    therapeuticArea: '',
    indication: '',
    compound: '',
    dateRange: { from: '', to: '' }
  });
  const [advancedSettings, setAdvancedSettings] = useState({
    topK: 10,
    minScore: 0.5,
    includeGraph: false
  });
  const [selectedChunk, setSelectedChunk] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [qaMode, setQaMode] = useState(false);
  const [synthesisDocuments, setSynthesisDocuments] = useState([]);

  // Fetch documents
  const { data: documentsData, isLoading: isLoadingDocuments, refetch: refetchDocuments } = useQuery({
    queryKey: ['/api/biotech-rag/documents', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/biotech-rag/documents?organizationId=${organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    }
  });

  // Fetch query analytics
  const { data: analyticsData } = useQuery({
    queryKey: ['/api/biotech-rag/analytics/queries', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/biotech-rag/analytics/queries?organizationId=${organizationId}&days=30`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 60000 // Refresh every minute
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (params) => {
      const endpoint = qaMode ? '/api/biotech-rag/ask' : '/api/biotech-rag/search';
      return apiRequest(endpoint, 'POST', {
        ...params,
        organizationId
      });
    },
    onSuccess: (data) => {
      setSearchResults(data);
      toast({
        title: 'Search completed',
        description: `Found ${data.totalResults || data.results?.length || 0} relevant results`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Search failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await fetch('/api/biotech-rag/ingest', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Upload failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Document uploaded successfully',
        description: `${data.chunksProcessed} chunks processed and indexed`,
      });
      refetchDocuments();
      setUploadProgress(0);
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive'
      });
      setUploadProgress(0);
    }
  });

  // Multi-document synthesis mutation
  const synthesisMutation = useMutation({
    mutationFn: async (params) => {
      return apiRequest('/api/biotech-rag/synthesize', 'POST', {
        ...params,
        organizationId
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Synthesis complete',
        description: `Synthesized information from ${data.documentCount} documents`,
      });
    }
  });

  // Protocol analysis mutation
  const protocolAnalysisMutation = useMutation({
    mutationFn: async (params) => {
      return apiRequest('/api/biotech-rag/analyze/protocol', 'POST', {
        ...params,
        organizationId
      });
    }
  });

  // Handle file upload
  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('document', file);
    formData.append('title', file.name);
    formData.append('documentType', filters.documentType || 'pdf');
    formData.append('organizationId', organizationId);
    
    // Add metadata
    if (filters.therapeuticArea) formData.append('therapeuticArea', filters.therapeuticArea);
    if (filters.indication) formData.append('indication', filters.indication);
    if (filters.compound) formData.append('compound', filters.compound);

    setUploadProgress(10);
    uploadMutation.mutate(formData);
  };

  // Handle search
  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const searchParams = {
      query: searchQuery,
      searchMode,
      ...advancedSettings,
      filters: Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v && v !== '')
      )
    };

    searchMutation.mutate(searchParams);
  };

  // Handle document synthesis
  const handleSynthesis = () => {
    if (synthesisDocuments.length < 2) {
      toast({
        title: 'Select at least 2 documents',
        description: 'Multi-document synthesis requires multiple documents',
        variant: 'destructive'
      });
      return;
    }

    synthesisMutation.mutate({
      query: searchQuery,
      documentIds: synthesisDocuments
    });
  };

  // Export results
  const exportResults = async (format = 'json') => {
    if (!searchResults?.queryId) return;

    try {
      const response = await fetch('/api/biotech-rag/export/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryId: searchResults.queryId,
          format
        })
      });

      if (!response.ok) throw new Error('Export failed');

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `search_results_${searchResults.queryId}.csv`;
        a.click();
      } else {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `search_results_${searchResults.queryId}.json`;
        a.click();
      }

      toast({
        title: 'Export successful',
        description: `Results exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  // Render search results
  const renderSearchResult = (result, index) => (
    <Card key={result.chunkId || index} className="mb-4 hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {result.documentTitle}
            </CardTitle>
            {result.section && (
              <p className="text-sm text-muted-foreground mt-1">
                Section: {result.section}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              Score: {(result.score * 100).toFixed(1)}%
            </Badge>
            {result.matchType && (
              <Badge variant="outline">{result.matchType}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm line-clamp-3 mb-3">{result.content}</p>
        
        {result.metadata?.entities && (
          <div className="flex flex-wrap gap-1 mb-3">
            {result.metadata.entities.drugs?.slice(0, 3).map((drug, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <Pill className="h-3 w-3 mr-1" /> {drug}
              </Badge>
            ))}
            {result.metadata.entities.diseases?.slice(0, 3).map((disease, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <Activity className="h-3 w-3 mr-1" /> {disease}
              </Badge>
            ))}
            {result.metadata.entities.biomarkers?.slice(0, 3).map((biomarker, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                <Dna className="h-3 w-3 mr-1" /> {biomarker}
              </Badge>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedChunk(result)}
            data-testid={`button-view-details-${index}`}
          >
            <Maximize2 className="h-4 w-4 mr-1" />
            View Details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(result.content);
              toast({ title: 'Copied to clipboard' });
            }}
            data-testid={`button-copy-${index}`}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Render knowledge graph visualization
  const renderKnowledgeGraph = () => {
    if (!searchResults?.graphResults || searchResults.graphResults.length === 0) {
      return (
        <Card>
          <CardContent className="text-center py-8">
            <Network className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No knowledge graph data available</p>
            <p className="text-sm text-muted-foreground mt-1">
              Enable "Include Knowledge Graph" in advanced settings
            </p>
          </CardContent>
        </Card>
      );
    }

    const graphData = searchResults.graphResults.slice(0, 10).map(rel => ({
      source: rel.entityName,
      target: rel.relatedEntityName,
      relationship: rel.relationshipType,
      confidence: rel.confidence
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Graph Relationships</CardTitle>
          <CardDescription>Entity relationships extracted from documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {graphData.map((rel, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{rel.source}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge>{rel.relationship}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{rel.target}</Badge>
                </div>
                <Badge variant="outline">
                  {(rel.confidence * 100).toFixed(0)}% confidence
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Render analytics dashboard
  const renderAnalytics = () => {
    if (!analyticsData?.analytics) {
      return (
        <Card>
          <CardContent className="text-center py-8">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No analytics data available</p>
          </CardContent>
        </Card>
      );
    }

    const { dailyStats, topQueries } = analyticsData.analytics;

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Query Volume</CardTitle>
            <CardDescription>Daily search activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <RechartsTooltip />
                <Area type="monotone" dataKey="count" stroke="#8884d8" fill="#8884d8" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Queries</CardTitle>
            <CardDescription>Most frequent searches</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topQueries?.slice(0, 5).map((query, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-sm truncate flex-1">{query.query}</span>
                  <Badge variant="secondary">{query.count} searches</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Brain className="h-6 w-6" />
                Biotech AI Intelligence RAG System
              </CardTitle>
              <CardDescription>
                Advanced retrieval-augmented generation for pharmaceutical research
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Help & Documentation</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            Search
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <Network className="h-4 w-4 mr-2" />
            Knowledge Graph
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="tools">
            <FlaskConical className="h-4 w-4 mr-2" />
            Biotech Tools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-6">
          <div className="space-y-6">
            {/* Search Interface */}
            <Card>
              <CardHeader>
                <CardTitle>Search & Query</CardTitle>
                <CardDescription>
                  Search across all ingested biotech documents using AI-powered retrieval
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Enter your search query or question..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="min-h-[100px]"
                      data-testid="input-search-query"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Search Mode</Label>
                    <Select value={searchMode} onValueChange={setSearchMode}>
                      <SelectTrigger data-testid="select-search-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEARCH_MODES.map(mode => (
                          <SelectItem key={mode.value} value={mode.value}>
                            <div>
                              <div>{mode.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {mode.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Document Type Filter</Label>
                    <Select 
                      value={filters.documentType} 
                      onValueChange={(v) => setFilters({...filters, documentType: v})}
                    >
                      <SelectTrigger data-testid="select-document-type">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All types</SelectItem>
                        {DOCUMENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="qa-mode"
                      checked={qaMode}
                      onCheckedChange={setQaMode}
                    />
                    <Label htmlFor="qa-mode">Q&A Mode</Label>
                  </div>
                </div>

                {/* Advanced Settings */}
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    <Label>Advanced Settings</Label>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Top K Results</Label>
                      <Slider
                        value={[advancedSettings.topK]}
                        onValueChange={([v]) => setAdvancedSettings({...advancedSettings, topK: v})}
                        min={1}
                        max={50}
                        step={1}
                      />
                      <span className="text-sm text-muted-foreground">{advancedSettings.topK}</span>
                    </div>

                    <div>
                      <Label>Minimum Score</Label>
                      <Slider
                        value={[advancedSettings.minScore]}
                        onValueChange={([v]) => setAdvancedSettings({...advancedSettings, minScore: v})}
                        min={0}
                        max={1}
                        step={0.1}
                      />
                      <span className="text-sm text-muted-foreground">{advancedSettings.minScore}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="include-graph"
                        checked={advancedSettings.includeGraph}
                        onCheckedChange={(v) => setAdvancedSettings({...advancedSettings, includeGraph: v})}
                      />
                      <Label htmlFor="include-graph">Include Knowledge Graph</Label>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || searchMutation.isPending}
                    className="flex-1"
                    data-testid="button-search"
                  >
                    {searchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    {qaMode ? 'Ask Question' : 'Search'}
                  </Button>
                  
                  {searchResults && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => exportResults('json')}
                        data-testid="button-export-json"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export JSON
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => exportResults('csv')}
                        data-testid="button-export-csv"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      {qaMode ? 'Answer' : 'Search Results'}
                    </CardTitle>
                    <Badge variant="secondary">
                      {searchResults.totalResults || searchResults.results?.length || 0} results in {searchResults.responseTime}ms
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {qaMode && searchResults.answer ? (
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="prose max-w-none">
                            {searchResults.answer}
                          </div>
                        </CardContent>
                        <CardFooter className="flex justify-between">
                          <Badge>Confidence: {(searchResults.confidence * 100).toFixed(0)}%</Badge>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost">
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost">
                              <ThumbsDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                      
                      {searchResults.sources && (
                        <div>
                          <h4 className="font-medium mb-2">Sources</h4>
                          <div className="space-y-2">
                            {searchResults.sources.map((source, index) => (
                              <Card key={index}>
                                <CardContent className="pt-3 pb-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">{source.documentTitle}</span>
                                    <Badge variant="outline">
                                      {(source.relevanceScore * 100).toFixed(0)}%
                                    </Badge>
                                  </div>
                                  {source.section && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Section: {source.section}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <ScrollArea className="h-[600px]">
                      <div className="space-y-4">
                        {searchResults.results?.map((result, index) => 
                          renderSearchResult(result, index)
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Knowledge Graph Results */}
            {advancedSettings.includeGraph && searchResults?.graphResults && (
              renderKnowledgeGraph()
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="space-y-6">
            {/* Document Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Document Upload</CardTitle>
                <CardDescription>
                  Upload biotech documents for processing and indexing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Document Type</Label>
                    <Select 
                      value={filters.documentType} 
                      onValueChange={(v) => setFilters({...filters, documentType: v})}
                    >
                      <SelectTrigger data-testid="select-upload-type">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Therapeutic Area</Label>
                    <Input
                      placeholder="e.g., Oncology, Neurology"
                      value={filters.therapeuticArea}
                      onChange={(e) => setFilters({...filters, therapeuticArea: e.target.value})}
                      data-testid="input-therapeutic-area"
                    />
                  </div>

                  <div>
                    <Label>Indication</Label>
                    <Input
                      placeholder="e.g., NSCLC, Alzheimer's"
                      value={filters.indication}
                      onChange={(e) => setFilters({...filters, indication: e.target.value})}
                      data-testid="input-indication"
                    />
                  </div>

                  <div>
                    <Label>Compound/Drug</Label>
                    <Input
                      placeholder="e.g., Pembrolizumab"
                      value={filters.compound}
                      onChange={(e) => setFilters({...filters, compound: e.target.value})}
                      data-testid="input-compound"
                    />
                  </div>
                </div>

                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.html"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    data-testid="button-upload"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Select Document
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">
                    Supported: PDF, Word, Text, HTML (Max 100MB)
                  </p>
                </div>

                {uploadProgress > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing document...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document List */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Document Library</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchDocuments()}
                    data-testid="button-refresh-documents"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingDocuments ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                    <p className="text-muted-foreground mt-2">Loading documents...</p>
                  </div>
                ) : documentsData?.documents?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Chunks</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documentsData.documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{doc.documentType}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={doc.status === 'indexed' ? 'success' : 
                                      doc.status === 'failed' ? 'destructive' : 'secondary'}
                            >
                              {doc.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{doc.chunkCount || 0}</TableCell>
                          <TableCell>{new Date(doc.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedDocument(doc)}
                                data-testid={`button-view-doc-${doc.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (synthesisDocuments.includes(doc.documentId)) {
                                    setSynthesisDocuments(synthesisDocuments.filter(id => id !== doc.documentId));
                                  } else {
                                    setSynthesisDocuments([...synthesisDocuments, doc.documentId]);
                                  }
                                }}
                                data-testid={`button-select-doc-${doc.id}`}
                              >
                                {synthesisDocuments.includes(doc.documentId) ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Circle className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No documents uploaded yet</p>
                  </div>
                )}

                {synthesisDocuments.length > 0 && (
                  <div className="mt-4 p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">
                          {synthesisDocuments.length} documents selected for synthesis
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSynthesisDocuments([])}
                        >
                          Clear Selection
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSynthesis}
                          disabled={!searchQuery || synthesisMutation.isPending}
                        >
                          {synthesisMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          Synthesize
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-6">
          {renderKnowledgeGraph()}
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          {renderAnalytics()}
        </TabsContent>

        <TabsContent value="tools" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5" />
                  Protocol Analysis
                </CardTitle>
                <CardDescription>
                  Analyze clinical trial protocols for key information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Launch Protocol Analyzer
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Regulatory Q&A
                </CardTitle>
                <CardDescription>
                  Get answers to regulatory compliance questions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Ask Regulatory Questions
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Drug Interaction Checker
                </CardTitle>
                <CardDescription>
                  Check for potential drug-drug interactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Check Interactions
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dna className="h-5 w-5" />
                  Biomarker Correlations
                </CardTitle>
                <CardDescription>
                  Find correlations between biomarkers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Analyze Biomarkers
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Literature Review
                </CardTitle>
                <CardDescription>
                  Generate automated literature reviews
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Create Review
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Patent Landscape
                </CardTitle>
                <CardDescription>
                  Analyze patent landscape for compounds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Analyze Patents
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail View Dialog */}
      <Dialog open={!!selectedChunk} onOpenChange={() => setSelectedChunk(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedChunk?.documentTitle}</DialogTitle>
            <DialogDescription>
              {selectedChunk?.section && `Section: ${selectedChunk.section}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Content</h4>
              <div className="p-4 bg-muted rounded-lg">
                <p className="whitespace-pre-wrap">{selectedChunk?.content}</p>
              </div>
            </div>
            
            {selectedChunk?.metadata?.entities && (
              <div>
                <h4 className="font-medium mb-2">Extracted Entities</h4>
                <div className="space-y-2">
                  {Object.entries(selectedChunk.metadata.entities).map(([type, entities]) => (
                    entities?.length > 0 && (
                      <div key={type}>
                        <Label className="capitalize">{type}</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entities.map((entity, i) => (
                            <Badge key={i} variant="secondary">{entity}</Badge>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-between">
              <Badge>Score: {(selectedChunk?.score * 100).toFixed(1)}%</Badge>
              <Badge variant="outline">{selectedChunk?.matchType}</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedChunk(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BiotechRAGInterface;