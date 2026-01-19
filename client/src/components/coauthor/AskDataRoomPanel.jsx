/**
 * Ask/Data Room Side Panel
 * Allows users to search, ask questions, and insert referenced content from the Data Room
 * Integrates with the document editor for seamless content insertion
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger, } from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Search, MessageSquare, FileText, Database, ChevronRight, ChevronDown, Copy, ExternalLink, Plus, Sparkles, BookOpen, Filter, Calendar, User, Tag, Folder, FileCode, Table, Image, Link, RefreshCw, AlertCircle, CheckCircle, Info, ArrowRight, Brain, Zap, Download, Eye, PlusCircle, X } from 'lucide-react'

export default function AskDataRoomPanel({ 
  onContentInsert, 
  selectedDocumentId,
  isOpen = true,
  onClose 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [askQuestion, setAskQuestion] = useState('');
  const [activeTab, setActiveTab] = useState('search');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedContent, setSelectedContent] = useState([]);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const { toast } = useToast();

  const organizationId = localStorage.getItem('currentOrganizationId');
  const projectId = localStorage.getItem('currentProjectId');

  // Fetch Data Room documents/evidence
  const { data: dataRoomItems = [], isLoading: loadingDataRoom, refetch: refetchDataRoom } = useQuery({
    queryKey: ['/api/evidence', { projectId, organizationId }],
    queryFn: async () => {
      const response = await fetch(
        `/api/evidence?projectId=${projectId}&organizationId=${organizationId}`
      );
      if (!response.ok) throw new Error('Failed to fetch Data Room items');
      return response.json();
    },
    enabled: !!projectId && !!organizationId,
  });

  // Search Data Room mutation
  const searchDataRoomMutation = useMutation({
    mutationFn: async (query) => {
      return apiRequest('/api/evidence/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          projectId,
          organizationId,
          filters: selectedFilter !== 'all' ? { type: selectedFilter } : {},
        }),
      });
    },
    onSuccess: (data) => {
      console.log('Search results:', data);
    },
  });

  // Ask AI about Data Room content
  const askDataRoomMutation = useMutation({
    mutationFn: async (question) => {
      setIsAskingAI(true);
      return apiRequest('/api/evidence/ask', {
        method: 'POST',
        body: JSON.stringify({
          question,
          projectId,
          organizationId,
          documentContext: selectedDocumentId,
        }),
      });
    },
    onSuccess: (data) => {
      setAiResponse(data);
      setIsAskingAI(false);
    },
    onError: (error) => {
      setIsAskingAI(false);
      toast({
        title: 'Error',
        description: 'Failed to get AI response. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Filter data room items based on search
  const filteredItems = dataRoomItems.filter(item => {
    const matchesSearch = !searchQuery || 
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesFilter = selectedFilter === 'all' || 
      (selectedFilter === 'documents' && item.type === 'document') ||
      (selectedFilter === 'data' && (item.type === 'table' || item.type === 'dataset')) ||
      (selectedFilter === 'figures' && (item.type === 'figure' || item.type === 'image')) ||
      (selectedFilter === 'references' && item.type === 'reference');
    
    return matchesSearch && matchesFilter;
  });

  // Group items by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleInsertContent = (item, contentType = 'full') => {
    if (onContentInsert) {
      let contentToInsert = '';
      let metadata = {
        source: 'Data Room',
        itemId: item.id,
        title: item.title,
        type: item.type,
      };

      switch (contentType) {
        case 'reference':
          contentToInsert = `[${item.title}](dataroom://${item.id})`;
          metadata.insertType = 'reference';
          break;
        case 'excerpt':
          contentToInsert = item.excerpt || item.description || '';
          metadata.insertType = 'excerpt';
          break;
        case 'table':
          contentToInsert = item.tableData ? formatTableAsMarkdown(item.tableData) : '';
          metadata.insertType = 'table';
          break;
        case 'figure':
          contentToInsert = `![${item.title}](${item.url || `dataroom://${item.id}`})`;
          metadata.insertType = 'figure';
          break;
        default:
          contentToInsert = item.content || item.description || '';
          metadata.insertType = 'full';
      }

      onContentInsert({
        content: contentToInsert,
        metadata,
      });

      toast({
        title: 'Content Inserted',
        description: `Inserted ${item.title} into document`,
      });
    }
  };

  const formatTableAsMarkdown = (tableData) => {
    if (!tableData || !tableData.headers || !tableData.rows) return '';
    
    const headers = tableData.headers.join(' | ');
    const separator = tableData.headers.map(() => '---').join(' | ');
    const rows = tableData.rows.map(row => row.join(' | ')).join('\n');
    
    return `| ${headers} |\n| ${separator} |\n${rows.split('\n').map(row => `| ${row} |`).join('\n')}`;
  };

  const handleAskQuestion = () => {
    if (askQuestion.trim()) {
      askDataRoomMutation.mutate(askQuestion);
    }
  };

  const getItemIcon = (type) => {
    switch (type) {
      case 'document': return FileText;
      case 'table': 
      case 'dataset': return Table;
      case 'figure':
      case 'image': return Image;
      case 'reference': return Link;
      default: return Database;
    }
  };

  return (
    <div className={`h-full flex flex-col ${!isOpen && 'hidden'}`}>
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold">Ask/Data Room</h2>
          </div>
          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onClose}
              data-testid="button-close-dataroom"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-600">
          Search evidence, ask questions, and insert referenced content
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 mx-4 mt-3" style={{ width: 'calc(100% - 32px)' }}>
          <TabsTrigger value="search">
            <Search className="h-3 w-3 mr-1" />
            Search
          </TabsTrigger>
          <TabsTrigger value="ask">
            <MessageSquare className="h-3 w-3 mr-1" />
            Ask AI
          </TabsTrigger>
        </TabsList>

        {/* Search Tab */}
        <TabsContent value="search" className="flex-1 flex flex-col px-4 pb-4 mt-3">
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search Data Room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
                data-testid="input-search-dataroom"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="documents">Documents</SelectItem>
                  <SelectItem value="data">Tables & Data</SelectItem>
                  <SelectItem value="figures">Figures & Images</SelectItem>
                  <SelectItem value="references">References</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search Results */}
          <ScrollArea className="flex-1 mt-4">
            <div className="space-y-4">
              {Object.entries(groupedItems).map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {category} ({items.length})
                  </h3>
                  <div className="space-y-2">
                    {items.map(item => {
                      const Icon = getItemIcon(item.type);
                      const isExpanded = expandedItems[item.id];
                      
                      return (
                        <Card key={item.id} className="overflow-hidden">
                          <div
                            className="p-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleExpanded(item.id)}
                          >
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                              <Icon className="h-4 w-4 text-blue-600 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <h4 className="text-sm font-medium truncate">
                                      {item.title}
                                    </h4>
                                    {item.description && (
                                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                                        {item.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1">
                                      {item.tags?.slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="outline" className="text-xs py-0">
                                          {tag}
                                        </Badge>
                                      ))}
                                      {item.lastModified && (
                                        <span className="text-xs text-gray-400">
                                          {new Date(item.lastModified).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div className="border-t px-3 py-2 bg-gray-50">
                              <div className="space-y-2">
                                {/* Preview */}
                                {item.excerpt && (
                                  <div className="p-2 bg-white rounded text-xs text-gray-700 border">
                                    {item.excerpt}
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInsertContent(item, 'full');
                                    }}
                                  >
                                    <PlusCircle className="h-3 w-3 mr-1" />
                                    Insert Full
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleInsertContent(item, 'reference');
                                    }}
                                  >
                                    <Link className="h-3 w-3 mr-1" />
                                    Reference
                                  </Button>
                                  {item.type === 'table' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInsertContent(item, 'table');
                                      }}
                                    >
                                      <Table className="h-3 w-3 mr-1" />
                                      Table
                                    </Button>
                                  )}
                                  {(item.type === 'figure' || item.type === 'image') && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInsertContent(item, 'figure');
                                      }}
                                    >
                                      <Image className="h-3 w-3 mr-1" />
                                      Figure
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs h-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Preview in modal
                                      toast({
                                        title: 'Preview',
                                        description: 'Full preview coming soon',
                                      });
                                    }}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                </div>

                                {/* Metadata */}
                                <div className="text-xs text-gray-500 space-y-0.5">
                                  {item.author && (
                                    <div className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {item.author}
                                    </div>
                                  )}
                                  {item.source && (
                                    <div className="flex items-center gap-1">
                                      <Folder className="h-3 w-3" />
                                      {item.source}
                                    </div>
                                  )}
                                  {item.version && (
                                    <div className="flex items-center gap-1">
                                      <Tag className="h-3 w-3" />
                                      Version {item.version}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Ask AI Tab */}
        <TabsContent value="ask" className="flex-1 flex flex-col px-4 pb-4 mt-3">
          <div className="space-y-3">
            {/* Question Input */}
            <div className="space-y-2">
              <Label className="text-sm">Ask a question about your evidence</Label>
              <Textarea
                placeholder="E.g., What are the key findings from the stability studies? What is the MRSD based on our toxicology data?"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                className="text-sm min-h-[80px]"
                data-testid="textarea-ask-question"
              />
              <Button
                onClick={handleAskQuestion}
                disabled={!askQuestion.trim() || isAskingAI}
                className="w-full"
                size="sm"
              >
                {isAskingAI ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Ask AI
                  </>
                )}
              </Button>
            </div>

            {/* AI Response */}
            {aiResponse && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-2">
                    <Brain className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">AI Response</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Based on your Data Room evidence
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Answer */}
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {aiResponse.answer || 'No specific answer found. Try rephrasing your question.'}
                    </div>

                    {/* Sources */}
                    {aiResponse.sources && aiResponse.sources.length > 0 && (
                      <div className="space-y-2 pt-2 border-t">
                        <h5 className="text-xs font-medium text-gray-600">Sources:</h5>
                        {aiResponse.sources.map((source, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-2 bg-white rounded border text-xs"
                          >
                            <FileText className="h-3 w-3 text-blue-600 mt-0.5" />
                            <div className="flex-1">
                              <div className="font-medium">{source.title}</div>
                              {source.excerpt && (
                                <div className="text-gray-600 mt-0.5">
                                  "{source.excerpt}"
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="link"
                                className="h-auto p-0 text-xs mt-1"
                                onClick={() => handleInsertContent(source, 'reference')}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Insert Reference
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          if (onContentInsert && aiResponse.answer) {
                            onContentInsert({
                              content: aiResponse.answer,
                              metadata: {
                                source: 'AI Assistant',
                                question: askQuestion,
                                timestamp: new Date().toISOString(),
                              },
                            });
                            toast({
                              title: 'Content Inserted',
                              description: 'AI response added to document',
                            });
                          }
                        }}
                      >
                        <PlusCircle className="h-3 w-3 mr-1" />
                        Insert Response
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => {
                          setAskQuestion('');
                          setAiResponse(null);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Example Questions */}
            {!aiResponse && (
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Example questions:</Label>
                <div className="space-y-1">
                  {[
                    'What are the critical quality attributes from our CMC data?',
                    'Summarize the adverse events from the clinical trials',
                    'What is the recommended dosing based on PK/PD studies?',
                    'List all stability test results at 6 months',
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left p-2 text-xs bg-gray-50 hover:bg-gray-100 rounded border transition-colors"
                      onClick={() => setAskQuestion(example)}
                    >
                      <ArrowRight className="h-3 w-3 inline mr-1 text-gray-400" />
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="mt-auto pt-4 border-t">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1 text-gray-600">
                <Database className="h-3 w-3" />
                <span>{dataRoomItems.length} items in Data Room</span>
              </div>
              <div className="flex items-center gap-1 text-gray-600">
                <Zap className="h-3 w-3" />
                <span>AI-powered search</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
