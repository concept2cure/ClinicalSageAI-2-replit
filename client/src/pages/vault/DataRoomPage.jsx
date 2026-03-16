/**
 * Unified Data Room Hub - Central repository for all regulatory evidence
 * Integrates Document Data Center, Vault, Evidence Graph, CCMS, and Citation Helper
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { useEvidenceGraph } from '@/contexts/EvidenceGraphContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Database,
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Eye,
  Tags,
  Shield,
  Clock,
  Package,
  Users,
  Activity,
  Factory,
  AlertTriangle,
  ChevronRight,
  Folder,
  FolderOpen,
  CheckCircle,
  Sparkles,
  Bot,
  Brain,
  BookOpen,
  GitBranch,
  Link2,
  MessageCircle,
  FileSearch,
  Target,
  Layers,
  Info,
  Award,
  FileCheck,
  Copy,
  Settings,
  HelpCircle,
  Home,
  X,
  Plus,
  BarChart3,
  TrendingUp,
  Zap,
  RefreshCw,
  Archive,
  History,
  Lock,
  Share2,
  Workflow,
} from 'lucide-react';

// Import existing components
import DocumentDataCenter from '../../components/DocumentDataCenter';
import DocumentCitationHelper from '../../components/DocumentCitationHelper';
import ComponentManagementSystem from '../../components/coauthor/ComponentManagementSystem';
import UnifiedDocumentUpload from '../../components/unified/UnifiedDocumentUpload';

// Data Room Ask Panel Component
const DataRoomAskPanel = ({ onInsertContent, isCollapsed = false }) => {
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResults, setQueryResults] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const { toast } = useToast();

  // Load search history
  useEffect(() => {
    const history = localStorage.getItem('dataRoomSearchHistory');
    if (history) {
      setSearchHistory(JSON.parse(history));
    }
  }, []);

  const handleAskDataRoom = async () => {
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      // Use semantic search to find relevant evidence
      const response = await fetch('/api/evidence/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': localStorage.getItem('currentOrganizationId') || '7',
        },
        body: JSON.stringify({
          query,
          includeVault: true,
          includeDataCenter: true,
          includeCCMS: true,
          includeCommitments: true,
          limit: 10,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setQueryResults(data);
        
        // Save to history
        const newHistory = [{ query, timestamp: new Date().toISOString() }, ...searchHistory].slice(0, 10);
        setSearchHistory(newHistory);
        localStorage.setItem('dataRoomSearchHistory', JSON.stringify(newHistory));
      }
    } catch (error) {
      console.error('Query failed:', error);
      toast({
        title: 'Query Failed',
        description: 'Unable to search the Data Room. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsQuerying(false);
    }
  };

  const handleInsertEvidence = (evidence) => {
    if (onInsertContent) {
      const citation = `[${evidence.title || evidence.name}](${evidence.id})`;
      onInsertContent({
        type: 'citation',
        content: citation,
        evidence: evidence,
      });
      toast({
        title: 'Evidence Inserted',
        description: 'Citation added to document',
      });
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4">
        <Button variant="ghost" size="icon" className="mb-2">
          <Brain className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground -rotate-90 mt-8">Ask Data Room</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Ask Data Room
        </h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Ask a question about your evidence..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskDataRoom()}
              data-testid="input-ask-data-room"
            />
            <Button 
              onClick={handleAskDataRoom} 
              disabled={isQuerying}
              size="sm"
              data-testid="button-ask-data-room"
            >
              {isQuerying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {searchHistory.length > 0 && (
            <Command className="border rounded-md">
              <CommandInput placeholder="Recent searches..." />
              <CommandList>
                <CommandEmpty>No recent searches</CommandEmpty>
                <CommandGroup heading="Recent">
                  {searchHistory.map((item, idx) => (
                    <CommandItem
                      key={idx}
                      onSelect={() => {
                        setQuery(item.query);
                        handleAskDataRoom();
                      }}
                    >
                      <Clock className="h-3 w-3 mr-2" />
                      {item.query}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {queryResults && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Found {queryResults.results?.length || 0} relevant items
            </div>
            {queryResults.results?.map((result, idx) => (
              <Card key={idx} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{result.title || result.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.description || result.excerpt}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {result.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Score: {(result.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleInsertEvidence(result)}
                    data-testid={`button-insert-evidence-${idx}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

// Content Plan Component
const ContentPlanView = ({ projectId }) => {
  const [contentPlan, setContentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    loadContentPlan();
  }, [projectId]);

  const loadContentPlan = async () => {
    try {
      const response = await fetch(`/api/content-plan/${projectId || 'default'}`, {
        headers: {
          'X-Organization-Id': localStorage.getItem('currentOrganizationId') || '7',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setContentPlan(data);
      }
    } catch (error) {
      console.error('Failed to load content plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSectionStatus = (section) => {
    if (!section.evidence || section.evidence.length === 0) {
      return { status: 'empty', color: 'text-gray-500', icon: <AlertTriangle className="h-4 w-4" /> };
    }
    if (section.isComplete) {
      return { status: 'complete', color: 'text-green-600', icon: <CheckCircle className="h-4 w-4" /> };
    }
    if (section.hasStaleContent) {
      return { status: 'stale', color: 'text-yellow-600', icon: <Clock className="h-4 w-4" /> };
    }
    return { status: 'in-progress', color: 'text-blue-600', icon: <Activity className="h-4 w-4" /> };
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">
      <RefreshCw className="h-6 w-6 animate-spin" />
    </div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Content Plan
        </CardTitle>
        <CardDescription>
          Track section requirements, ownership, and evidence linking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-4">
            {contentPlan?.sections?.map((section, idx) => {
              const status = getSectionStatus(section);
              return (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {status.icon}
                      <h4 className="font-medium">{section.title}</h4>
                    </div>
                    <Badge variant={status.status === 'complete' ? 'success' : 'secondary'}>
                      {status.status}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3">
                    {section.description}
                  </p>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Owner:</span>
                      <span className="ml-2">{section.owner || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Due:</span>
                      <span className="ml-2">{section.dueDate || 'Not set'}</span>
                    </div>
                  </div>

                  {section.evidence && section.evidence.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm text-muted-foreground mb-2">
                        Linked Evidence ({section.evidence.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {section.evidence.map((ev, evIdx) => (
                          <Badge key={evIdx} variant="outline" className="text-xs">
                            {ev.type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {section.gaps && section.gaps.length > 0 && (
                    <Alert className="mt-3">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Gaps Detected</AlertTitle>
                      <AlertDescription>
                        {section.gaps.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// Smart Blocks Component
const SmartBlocksPanel = ({ onInsertBlock }) => {
  const [smartBlocks, setSmartBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadSmartBlocks();
  }, []);

  const loadSmartBlocks = async () => {
    try {
      const response = await fetch('/api/smart-blocks', {
        headers: {
          'X-Organization-Id': localStorage.getItem('currentOrganizationId') || '7',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setSmartBlocks(data.blocks || []);
      }
    } catch (error) {
      console.error('Failed to load smart blocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertBlock = async (block) => {
    try {
      // Fetch the latest data for this block
      const response = await fetch(`/api/smart-blocks/${block.id}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': localStorage.getItem('currentOrganizationId') || '7',
        },
        body: JSON.stringify({
          context: {
            projectId: localStorage.getItem('currentProjectId'),
            documentId: localStorage.getItem('currentDocumentId'),
          },
        }),
      });

      if (response.ok) {
        const renderedContent = await response.json();
        if (onInsertBlock) {
          onInsertBlock({
            type: 'smart-block',
            id: block.id,
            content: renderedContent.content,
            metadata: renderedContent.metadata,
          });
          
          toast({
            title: 'Smart Block Inserted',
            description: `${block.name} added to document`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to render smart block:', error);
      toast({
        title: 'Insert Failed',
        description: 'Unable to render smart block content',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Smart Blocks
        </CardTitle>
        <CardDescription>
          Auto-populated content from versioned sources
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {smartBlocks.map((block) => (
                <Card key={block.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {block.name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {block.description}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {block.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Updated: {new Date(block.lastUpdated).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleInsertBlock(block)}
                      data-testid={`button-insert-smart-block-${block.id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// Main Data Room Page Component
export default function DataRoomPage() {
  const [activeTab, setActiveTab] = useState('repository');
  const [showAskPanel, setShowAskPanel] = useState(true);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const { toast } = useToast();
  const { organizationId, tenantId } = useTenantContext();
  const { evidenceGraph, getEvidenceByType, generateCitations } = useEvidenceGraph();
  const queryClient = useQueryClient();

  // Load statistics
  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      const [vaultRes, dataRes, ccmsRes] = await Promise.all([
        fetch('/api/vault/statistics', {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch('/api/device-data-center/statistics', {
          headers: { 'X-Organization-Id': organizationId },
        }),
        fetch('/api/coauthor/components/statistics', {
          headers: { 'X-Organization-Id': organizationId },
        }),
      ]);

      const [vaultStats, dataStats, ccmsStats] = await Promise.all([
        vaultRes.json(),
        dataRes.json(),
        ccmsRes.json(),
      ]);

      setStatistics({
        totalDocuments: (vaultStats.total || 0) + (dataStats.total || 0),
        vaultDocuments: vaultStats.total || 0,
        dataCenterFiles: dataStats.total || 0,
        ccmsComponents: ccmsStats.total || 0,
        citations: vaultStats.citations || 0,
        evidenceItems: Array.from(evidenceGraph.values()).flat().length,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleContentInsert = (content) => {
    // This would be connected to the active document editor
    console.log('Inserting content:', content);
    toast({
      title: 'Content Ready',
      description: 'Content prepared for insertion. Open a document to insert.',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Database className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Data Room</h1>
                <p className="text-sm text-muted-foreground">
                  Secure repository for all regulatory evidence & source documents
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAskPanel(!showAskPanel)}
                data-testid="button-toggle-ask-panel"
              >
                <Brain className="h-4 w-4 mr-2" />
                {showAskPanel ? 'Hide' : 'Show'} Ask Panel
              </Button>
              <Button variant="outline" size="sm" onClick={loadStatistics}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Bar */}
      {statistics && (
        <div className="bg-muted/50 border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.totalDocuments}</span>
                <span className="text-muted-foreground">Total Documents</span>
              </div>
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.vaultDocuments}</span>
                <span className="text-muted-foreground">Vault</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.dataCenterFiles}</span>
                <span className="text-muted-foreground">Data Center</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.ccmsComponents}</span>
                <span className="text-muted-foreground">CCMS</span>
              </div>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.citations}</span>
                <span className="text-muted-foreground">Citations</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{statistics.evidenceItems}</span>
                <span className="text-muted-foreground">Evidence</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-6">
        <ResizablePanelGroup direction="horizontal" className="min-h-[700px]">
          {/* Main Content Panel */}
          <ResizablePanel defaultSize={showAskPanel ? 75 : 100}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="repository" data-testid="tab-repository">
                  <Archive className="h-4 w-4 mr-2" />
                  Repository
                </TabsTrigger>
                <TabsTrigger value="analyze" data-testid="tab-analyze">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analyze
                </TabsTrigger>
                <TabsTrigger value="collaborate" data-testid="tab-collaborate">
                  <Users className="h-4 w-4 mr-2" />
                  Collaborate
                </TabsTrigger>
                <TabsTrigger value="package" data-testid="tab-package">
                  <Package className="h-4 w-4 mr-2" />
                  Package
                </TabsTrigger>
                <TabsTrigger value="ccms" data-testid="tab-ccms">
                  <GitBranch className="h-4 w-4 mr-2" />
                  CCMS
                </TabsTrigger>
              </TabsList>

              {/* Repository Tab */}
              <TabsContent value="repository" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Upload Evidence</h3>
                    <UnifiedDocumentUpload 
                      onUploadComplete={loadStatistics}
                      showDeviceDataOption={true}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Document Data Center</h3>
                    <DocumentDataCenter />
                  </div>
                </div>
              </TabsContent>

              {/* Analyze Tab */}
              <TabsContent value="analyze" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ContentPlanView projectId={localStorage.getItem('currentProjectId')} />
                  <div className="space-y-6">
                    <SmartBlocksPanel onInsertBlock={handleContentInsert} />
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileSearch className="h-5 w-5" />
                          Readiness Checks
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>3 Sections Need Evidence</AlertTitle>
                            <AlertDescription>
                              Clinical Overview, Biocompatibility, and Sterilization sections are missing required evidence.
                            </AlertDescription>
                          </Alert>
                          <Alert>
                            <Clock className="h-4 w-4" />
                            <AlertTitle>5 Stale Citations</AlertTitle>
                            <AlertDescription>
                              Some citations reference outdated document versions. Review and update.
                            </AlertDescription>
                          </Alert>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Collaborate Tab */}
              <TabsContent value="collaborate" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Active Reviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {[
                          { doc: 'Clinical Overview', reviewer: 'Dr. Smith', status: 'In Review', due: '2 days' },
                          { doc: 'Device Description', reviewer: 'J. Johnson', status: 'Pending', due: '5 days' },
                          { doc: 'Risk Analysis', reviewer: 'M. Williams', status: 'Approved', due: 'Complete' },
                        ].map((review, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 border rounded">
                            <div>
                              <div className="font-medium">{review.doc}</div>
                              <div className="text-sm text-muted-foreground">{review.reviewer}</div>
                            </div>
                            <div className="text-right">
                              <Badge variant={review.status === 'Approved' ? 'success' : 'secondary'}>
                                {review.status}
                              </Badge>
                              <div className="text-xs text-muted-foreground mt-1">{review.due}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Audit Trail</CardTitle>
                      <CardDescription>21 CFR Part 11 compliant</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2 text-sm">
                          {[
                            { action: 'Document uploaded', user: 'Admin', time: '2 mins ago' },
                            { action: 'Citation added', user: 'J. Doe', time: '15 mins ago' },
                            { action: 'Review completed', user: 'Dr. Smith', time: '1 hour ago' },
                            { action: 'Component approved', user: 'Manager', time: '3 hours ago' },
                          ].map((log, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b">
                              <div>
                                <div className="font-medium">{log.action}</div>
                                <div className="text-xs text-muted-foreground">{log.user}</div>
                              </div>
                              <span className="text-xs text-muted-foreground">{log.time}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Package Tab */}
              <TabsContent value="package" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>File Selection</CardTitle>
                      <CardDescription>Select documents for Modules 1-5</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {['Module 1: Administrative', 'Module 2: Summaries', 'Module 3: Quality', 'Module 4: Nonclinical', 'Module 5: Clinical'].map((module, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 border rounded">
                            <span className="font-medium">{module}</span>
                            <Badge>{Math.floor(Math.random() * 10) + 1} files</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Validation Status</CardTitle>
                      <CardDescription>CDISC/Agency technical checks</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">SEND Compliance</span>
                            <span className="text-sm text-green-600">98%</span>
                          </div>
                          <Progress value={98} className="h-2" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">TRC Validation</span>
                            <span className="text-sm text-green-600">100%</span>
                          </div>
                          <Progress value={100} className="h-2" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">eCTD Structure</span>
                            <span className="text-sm text-yellow-600">85%</span>
                          </div>
                          <Progress value={85} className="h-2" />
                        </div>
                      </div>
                      <Button className="w-full mt-4" data-testid="button-generate-submission">
                        <Download className="h-4 w-4 mr-2" />
                        Generate Submission Package
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* CCMS Tab */}
              <TabsContent value="ccms" className="mt-6">
                <ComponentManagementSystem />
              </TabsContent>
            </Tabs>
          </ResizablePanel>

          {/* Ask Panel (Collapsible) */}
          {showAskPanel && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                <div className="h-full border-l">
                  <DataRoomAskPanel 
                    onInsertContent={handleContentInsert}
                    isCollapsed={false}
                  />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}