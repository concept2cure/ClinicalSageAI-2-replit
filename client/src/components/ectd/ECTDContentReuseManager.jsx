/**
 * eCTD Content Reuse Manager
 * Automated content extraction and reuse system for eCTD sections
 * Enables efficient content repurposing across regulatory documents
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Copy,
  FileText,
  Search,
  Filter,
  Download,
  Upload,
  Eye,
  Tags,
  GitBranch,
  History,
  RefreshCw,
  Database,
  Package,
  CheckCircle,
  AlertCircle,
  Clock,
  Link2,
  BookOpen,
  Archive,
  Scissors,
  FileCode,
  FileOutput,
  Sparkles,
  Wand2,
  PlusCircle,
  Save,
  X,
} from 'lucide-react';

// Reusable content types
const CONTENT_TYPES = {
  'section': { label: 'Section', icon: FileText, color: 'bg-blue-500' },
  'paragraph': { label: 'Paragraph', icon: FileCode, color: 'bg-green-500' },
  'table': { label: 'Table', icon: Database, color: 'bg-purple-500' },
  'figure': { label: 'Figure', icon: FileOutput, color: 'bg-yellow-500' },
  'reference': { label: 'Reference', icon: Link2, color: 'bg-cyan-500' },
  'template': { label: 'Template', icon: Package, color: 'bg-pink-500' },
  'fragment': { label: 'Fragment', icon: Scissors, color: 'bg-orange-500' },
};

// Content categories for organization
const CONTENT_CATEGORIES = [
  'Drug Substance',
  'Drug Product',
  'Manufacturing',
  'Quality Control',
  'Stability',
  'Nonclinical',
  'Clinical',
  'Statistical',
  'Administrative',
  'Labeling',
];

export default function ECTDContentReuseManager({ projectId, onContentInsert }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);
  const [extractionMode, setExtractionMode] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [newContentData, setNewContentData] = useState({
    title: '',
    type: 'section',
    category: '',
    description: '',
    content: '',
    tags: [],
    isTemplate: false,
  });
  const { toast } = useToast();

  const organizationId = localStorage.getItem('currentOrganizationId') || '7';

  // Fetch reusable content library
  const { data: contentLibrary = [], isLoading: libraryLoading, refetch: refetchLibrary } = useQuery({
    queryKey: ['/api/ectd-content/library', { projectId, organizationId }],
    queryFn: async () => {
      const response = await fetch(
        `/api/ectd-content/library?projectId=${projectId}&organizationId=${organizationId}`
      );
      if (!response.ok) throw new Error('Failed to fetch content library');
      return response.json();
    },
  });

  // Fetch content templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/ectd-content/templates', { organizationId }],
    queryFn: async () => {
      const response = await fetch(`/api/ectd-content/templates?organizationId=${organizationId}`);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Create reusable content mutation
  const createContentMutation = useMutation({
    mutationFn: async (contentData) => {
      return apiRequest('/api/ectd-content/create', {
        method: 'POST',
        body: JSON.stringify({
          ...contentData,
          projectId,
          organizationId,
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Content Saved',
        description: `${data.content.type} "${data.content.title}" has been saved to library`,
      });
      refetchLibrary();
      setShowExtractDialog(false);
      resetNewContentData();
    },
  });

  // Extract content mutation
  const extractContentMutation = useMutation({
    mutationFn: async ({ sourceId, selection }) => {
      return apiRequest('/api/ectd-content/extract', {
        method: 'POST',
        body: JSON.stringify({
          sourceId,
          selection,
          projectId,
          organizationId,
        }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Content Extracted',
        description: 'Content has been extracted and added to library',
      });
      refetchLibrary();
      setExtractionMode(false);
    },
  });

  // AI-powered content suggestion mutation
  const suggestContentMutation = useMutation({
    mutationFn: async ({ context, targetSection }) => {
      return apiRequest('/api/ectd-content/suggest', {
        method: 'POST',
        body: JSON.stringify({
          context,
          targetSection,
          projectId,
        }),
      });
    },
    onSuccess: (data) => {
      if (data.suggestions && data.suggestions.length > 0) {
        // Show suggestions in a dialog or insert directly
        handleSuggestionsReceived(data.suggestions);
      }
    },
  });

  // Filter content library
  const filteredContent = contentLibrary.filter(item => {
    const matchesSearch = !searchQuery || 
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedType === 'all' || item.type === selectedType;
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  // Group content by category for better organization
  const groupedContent = filteredContent.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const handleSuggestionsReceived = (suggestions) => {
    // Display suggestions to user
    const selectedSuggestion = suggestions[0]; // For demo, auto-select first
    if (selectedSuggestion && onContentInsert) {
      onContentInsert({
        content: selectedSuggestion.content,
        metadata: {
          source: 'AI Suggestion',
          confidence: selectedSuggestion.confidence,
        },
      });
    }
  };

  const handleExtractContent = () => {
    if (!selectedText) {
      toast({
        title: 'No Selection',
        description: 'Please select text to extract',
        variant: 'destructive',
      });
      return;
    }

    setNewContentData(prev => ({
      ...prev,
      content: selectedText,
    }));
    setShowExtractDialog(true);
  };

  const handleSaveContent = () => {
    if (!newContentData.title || !newContentData.content) {
      toast({
        title: 'Missing Information',
        description: 'Please provide title and content',
        variant: 'destructive',
      });
      return;
    }

    createContentMutation.mutate(newContentData);
  };

  const handleInsertContent = (item) => {
    if (onContentInsert) {
      onContentInsert({
        content: item.content,
        metadata: {
          id: item.id,
          title: item.title,
          type: item.type,
          source: item.source,
        },
      });
      
      toast({
        title: 'Content Inserted',
        description: `${item.title} has been inserted into the document`,
      });
    }
  };

  const resetNewContentData = () => {
    setNewContentData({
      title: '',
      type: 'section',
      category: '',
      description: '',
      content: '',
      tags: [],
      isTemplate: false,
    });
    setSelectedText('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Copy className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Content Reuse Manager</h2>
            <p className="text-sm text-muted-foreground">
              Extract, organize, and reuse content across eCTD documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={extractionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setExtractionMode(!extractionMode)}
          >
            <Scissors className="h-4 w-4 mr-2" />
            {extractionMode ? 'Exit Extraction' : 'Extract Mode'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTemplateDialog(true)}
          >
            <Package className="h-4 w-4 mr-2" />
            Create Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchLibrary()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Extraction Mode Alert */}
      {extractionMode && (
        <Alert>
          <Scissors className="h-4 w-4" />
          <AlertTitle>Extraction Mode Active</AlertTitle>
          <AlertDescription>
            Select text from any document to extract it as reusable content. 
            Click "Extract Selected" when ready.
          </AlertDescription>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={handleExtractContent} disabled={!selectedText}>
              <Scissors className="h-4 w-4 mr-2" />
              Extract Selected
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setExtractionMode(false);
                setSelectedText('');
              }}
            >
              Cancel
            </Button>
          </div>
        </Alert>
      )}

      {/* Search and Filters */}
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reusable content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-content"
            />
          </div>
        </div>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Content type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(CONTENT_TYPES).map(([key, type]) => (
              <SelectItem key={key} value={key}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CONTENT_CATEGORIES.map(category => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content Library */}
      <Tabs defaultValue="library">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="library">Content Library</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="ai-suggest">AI Suggestions</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          <ScrollArea className="h-[500px]">
            {Object.entries(groupedContent).map(([category, items]) => (
              <div key={category} className="mb-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  {category} ({items.length})
                </h3>
                <div className="grid gap-3">
                  {items.map(item => {
                    const typeConfig = CONTENT_TYPES[item.type];
                    const Icon = typeConfig?.icon || FileText;
                    
                    return (
                      <Card 
                        key={item.id}
                        className="cursor-pointer hover:bg-accent transition-colors"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded ${typeConfig?.color || 'bg-gray-500'}`}>
                                  <Icon className="h-3 w-3 text-white" />
                                </div>
                                <span className="font-medium">{item.title}</span>
                                {item.version > 1 && (
                                  <Badge variant="outline" className="text-xs">
                                    v{item.version}
                                  </Badge>
                                )}
                                {item.isTemplate && (
                                  <Badge variant="secondary" className="text-xs">
                                    Template
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {item.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                {item.tags?.map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                <span className="text-xs text-muted-foreground">
                                  Used {item.usageCount || 0} times
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedContent(item);
                                  // Show preview dialog
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleInsertContent(item)}
                              >
                                <PlusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <ScrollArea className="h-[500px]">
            <div className="grid gap-4">
              {templates.map(template => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {template.name}
                      </CardTitle>
                      <Badge>{template.module}</Badge>
                    </div>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      {template.tags?.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          onContentInsert?.({
                            content: template.content,
                            metadata: {
                              template: template.name,
                              module: template.module,
                            },
                          });
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="ai-suggest" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI-Powered Content Suggestions
              </CardTitle>
              <CardDescription>
                Get intelligent content suggestions based on your current section and regulatory requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="context">Current Context</Label>
                  <Textarea
                    id="context"
                    placeholder="Describe the section you're working on..."
                    className="mt-2"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="target">Target Section</Label>
                  <Select>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select target section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2.3">2.3 Quality Overall Summary</SelectItem>
                      <SelectItem value="2.5">2.5 Clinical Overview</SelectItem>
                      <SelectItem value="3.1">3.1 Drug Substance</SelectItem>
                      <SelectItem value="3.2">3.2 Drug Product</SelectItem>
                      <SelectItem value="5.2">5.2 Clinical Study Reports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => {
                    suggestContentMutation.mutate({
                      context: 'Current working context',
                      targetSection: 'Selected section',
                    });
                  }}
                  disabled={suggestContentMutation.isPending}
                >
                  {suggestContentMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Getting Suggestions...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Get AI Suggestions
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Extract Content Dialog */}
      <Dialog open={showExtractDialog} onOpenChange={setShowExtractDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Save Reusable Content</DialogTitle>
            <DialogDescription>
              Save this content to your library for future reuse
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newContentData.title}
                onChange={(e) => setNewContentData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter a descriptive title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select 
                  value={newContentData.type} 
                  onValueChange={(value) => setNewContentData(prev => ({ ...prev, type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTENT_TYPES).map(([key, type]) => (
                      <SelectItem key={key} value={key}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={newContentData.category} 
                  onValueChange={(value) => setNewContentData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newContentData.description}
                onChange={(e) => setNewContentData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe this content and when to use it"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={newContentData.content}
                onChange={(e) => setNewContentData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="The actual content to be reused"
                rows={6}
              />
            </div>
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="e.g., clinical, safety, drug-substance"
                onChange={(e) => setNewContentData(prev => ({ 
                  ...prev, 
                  tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)
                }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtractDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveContent} disabled={createContentMutation.isPending}>
              {createContentMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save to Library
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}