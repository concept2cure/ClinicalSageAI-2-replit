import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Brain,
  Activity,
  FileText,
  BarChart2,
  Shield,
  TrendingUp,
  Users,
  Calendar,
  Target,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Package,
  Send,
  Bot,
  Sparkles,
  Layers,
  LineChart,
  PieChart,
  GitBranch,
  Microscope,
  FlaskConical,
  Beaker,
  Upload,
  Download,
  Search,
  Settings,
  RefreshCw,
  X,
  Plus,
  Minus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Zap,
  Award,
  Lightbulb,
  AlertTriangle,
  Info,
  MessageSquare,
  HelpCircle,
  DollarSign,
  Heart,
  Pill,
  TestTube,
  Stethoscope,
  Share2,
  Eye,
  Filter,
  Play,
  Pause,
  Bell,
  Gauge,
  Workflow,
  ArrowRight,
  ArrowUpRight,
} from 'lucide-react';

// API imports
import * as protocolAPI from '@/api/protocol';
import * as csrAPI from '@/api/csr';
import * as ragAPI from '@/api/biotechRag';

// Lazy load tab components for better performance
const OverviewTab = lazy(() => import('@/components/unified/tabs/OverviewTab'));
const DesignTab = lazy(() => import('@/components/unified/tabs/DesignTab'));
const OperationsTab = lazy(() => import('@/components/unified/tabs/OperationsTab'));
const InsightsTab = lazy(() => import('@/components/unified/tabs/InsightsTab'));
const ComplianceTab = lazy(() => import('@/components/unified/tabs/ComplianceTab'));

// Loading fallback component for Suspense
function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
        <p className="text-sm text-muted-foreground">Loading module...</p>
      </div>
    </div>
  );
}

// ==========================================
// Main Component: Study & Regulatory Intelligence Suite
// ==========================================
export default function StudyRegulatoryIntelligenceSuite() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [lumenPanelOpen, setLumenPanelOpen] = useState(true);
  const [lumenQuery, setLumenQuery] = useState('');
  const [lumenResponses, setLumenResponses] = useState([]);
  const [lumenLoading, setLumenLoading] = useState(false);
  const [contextAwareness, setContextAwareness] = useState({
    currentModule: 'overview',
    lastAction: '',
    suggestions: [],
  });

  // Protocol Designer State
  const [protocol, setProtocol] = useState({
    id: '1',
    title: '',
    phase: 'Phase 1',
    indication: '',
    studyPopulation: '',
    primaryEndpoint: '',
    secondaryEndpoints: [],
    arms: [
      { id: 1, name: 'Treatment', description: '', dosage: '' },
      { id: 2, name: 'Placebo', description: '', dosage: '' },
    ],
    visits: [
      { id: 1, name: 'Screening', timepoint: 'Day -14', procedures: [] },
      { id: 2, name: 'Baseline', timepoint: 'Day 0', procedures: [] },
      { id: 3, name: 'Follow-up', timepoint: 'Day 30', procedures: [] },
    ],
  });

  const [schedule, setSchedule] = useState(null);
  const [validationResults, setValidationResults] = useState([]);
  const [protocolLoading, setProtocolLoading] = useState(false);

  // CSR Intelligence State
  const [csrSearchQuery, setCsrSearchQuery] = useState('');
  const [selectedCsr, setSelectedCsr] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Regulatory Compliance State
  const [readinessScore, setReadinessScore] = useState(0);
  const [complianceGaps, setComplianceGaps] = useState([]);

  // ForesightAI State
  const [selectedPhase, setSelectedPhase] = useState('Phase I');
  const [predictionConfidence, setPredictionConfidence] = useState(75);
  const [biomarkers, setBiomarkers] = useState([]);

  // Fetch dashboard metrics
  const { data: dashboardMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/csr-real-data/stats'],
    queryFn: csrAPI.fetchDashboardMetrics,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch regulatory readiness
  const { data: regulatoryData, isLoading: regulatoryLoading } = useQuery({
    queryKey: ['/api/lumen-cortex/regulatory-analysis'],
    enabled: activeTab === 'compliance',
    queryFn: async () => {
      const response = await fetch('/api/lumen-cortex/regulatory-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'Phase III oncology IND submission readiness assessment',
          context: {
            submission_type: 'IND',
            indication: 'oncology',
            phase: 'III',
            regulatory_framework: 'ICH_E6_R3',
          },
        }),
      });
      if (!response.ok) throw new Error('Failed to fetch regulatory analysis');
      return response.json();
    },
  });

  // Update context awareness based on active tab
  useEffect(() => {
    const contextMap = {
      overview: {
        module: 'Executive Dashboard',
        suggestions: [
          'View key metrics across all modules',
          'Check study progress timeline',
          'Review recent regulatory alerts',
        ],
      },
      design: {
        module: 'Protocol Designer',
        suggestions: [
          'Design study arms and visits',
          'Validate protocol against guidelines',
          'Generate study schedule',
        ],
      },
      operations: {
        module: 'Study Operations',
        suggestions: ['Plan study milestones', 'Allocate resources', 'Track operational metrics'],
      },
      insights: {
        module: 'Analytics & Intelligence',
        suggestions: [
          'Analyze CSR insights',
          'View ForesightAI predictions',
          'Compare biomarker correlations',
        ],
      },
      compliance: {
        module: 'Regulatory Compliance',
        suggestions: [
          'Check ICH E6(R3) compliance',
          'Review regulatory gaps',
          'Get Lumen AI guidance',
        ],
      },
    };

    setContextAwareness({
      currentModule: contextMap[activeTab]?.module || 'Overview',
      lastAction: `Viewing ${contextMap[activeTab]?.module}`,
      suggestions: contextMap[activeTab]?.suggestions || [],
    });
  }, [activeTab]);

  // Lumen AI Query Handler
  const handleLumenQuery = async () => {
    if (!lumenQuery.trim()) {
      toast({
        title: 'Query Required',
        description: 'Please enter a query for Lumen AI',
        variant: 'destructive',
      });
      return;
    }

    setLumenLoading(true);
    try {
      const response = await fetch('/api/lumen-cortex/ich-e6r3-guidance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: lumenQuery,
          context: {
            regulatory_framework: 'ICH_E6_R3',
            current_module: contextAwareness.currentModule,
            guidance_type: 'comprehensive',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to get Lumen AI response');

      const result = await response.json();
      setLumenResponses(prev => [
        {
          query: lumenQuery,
          answer: result.guidance_response || result.comprehensive_guidance,
          confidence: result.confidence_score || 95,
          timestamp: new Date().toISOString(),
          context: contextAwareness.currentModule,
        },
        ...prev,
      ]);
      setLumenQuery('');

      toast({
        title: '✅ Lumen AI Response',
        description: 'Successfully received guidance',
      });
    } catch (error) {
      console.error('Lumen AI error:', error);
      toast({
        title: '❌ Query Failed',
        description: 'Failed to get Lumen AI response',
        variant: 'destructive',
      });
    } finally {
      setLumenLoading(false);
    }
  };

  // Protocol Handler Functions
  const handleProtocolChange = (field, value) => {
    setProtocol(prev => ({ ...prev, [field]: value }));
  };

  const handleArmChange = (armId, field, value) => {
    setProtocol(prev => ({
      ...prev,
      arms: prev.arms.map(arm => (arm.id === armId ? { ...arm, [field]: value } : arm)),
    }));
  };

  const addArm = () => {
    const newId = Math.max(...protocol.arms.map(a => a.id)) + 1;
    setProtocol(prev => ({
      ...prev,
      arms: [...prev.arms, { id: newId, name: `Arm ${newId}`, description: '', dosage: '' }],
    }));
  };

  const removeArm = armId => {
    setProtocol(prev => ({
      ...prev,
      arms: prev.arms.filter(arm => arm.id !== armId),
    }));
  };

  const handleVisitChange = (visitId, field, value) => {
    setProtocol(prev => ({
      ...prev,
      visits: prev.visits.map(visit =>
        visit.id === visitId ? { ...visit, [field]: value } : visit
      ),
    }));
  };

  const addVisit = () => {
    const newId = Math.max(...protocol.visits.map(v => v.id)) + 1;
    setProtocol(prev => ({
      ...prev,
      visits: [
        ...prev.visits,
        { id: newId, name: `Visit ${newId}`, timepoint: '', procedures: [] },
      ],
    }));
  };

  const removeVisit = visitId => {
    setProtocol(prev => ({
      ...prev,
      visits: prev.visits.filter(visit => visit.id !== visitId),
    }));
  };

  const handleSaveProtocol = async () => {
    setProtocolLoading(true);
    try {
      await protocolAPI.saveProtocol(protocol);
      toast({
        title: '✅ Protocol Saved',
        description: 'Protocol has been successfully saved',
      });
    } catch (error) {
      toast({
        title: '❌ Save Failed',
        description: 'Failed to save protocol',
        variant: 'destructive',
      });
    } finally {
      setProtocolLoading(false);
    }
  };

  const handleValidateProtocol = async () => {
    setProtocolLoading(true);
    try {
      const results = await protocolAPI.validateProtocol(protocol);
      setValidationResults(results);
      toast({
        title: '✅ Validation Complete',
        description: `Found ${results.length} items to review`,
      });
    } catch (error) {
      toast({
        title: '❌ Validation Failed',
        description: 'Failed to validate protocol',
        variant: 'destructive',
      });
    } finally {
      setProtocolLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    setProtocolLoading(true);
    try {
      const scheduleData = await protocolAPI.generateSchedule(protocol);
      setSchedule(scheduleData);
      toast({
        title: '✅ Schedule Generated',
        description: 'Study schedule has been generated',
      });
    } catch (error) {
      toast({
        title: '❌ Generation Failed',
        description: 'Failed to generate schedule',
        variant: 'destructive',
      });
    } finally {
      setProtocolLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Header Section */}
      <div className="px-8 py-6 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg">
              <Brain className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Study & Regulatory Intelligence Suite
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Unified platform for clinical trial design, analytics, and regulatory compliance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl"
                    onClick={() => window.location.reload()}
                    data-testid="button-refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh Dashboard</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-xl"
                    onClick={() => setLumenPanelOpen(!lumenPanelOpen)}
                    data-testid="button-toggle-lumen"
                  >
                    <Bot className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {lumenPanelOpen ? 'Hide' : 'Show'} Lumen AI Assistant
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              data-testid="button-new-study"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Study
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area with Lumen AI Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className={`flex-1 flex flex-col ${lumenPanelOpen ? 'mr-0' : ''}`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-8 py-4 bg-white dark:bg-gray-900 border-b">
              <TabsList className="grid grid-cols-5 gap-2 bg-gray-100/50 dark:bg-gray-800/50 p-1.5 rounded-2xl">
                <TabsTrigger
                  value="overview"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md flex items-center gap-2"
                  data-testid="tab-overview"
                >
                  <BarChart2 className="h-4 w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="design"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md flex items-center gap-2"
                  data-testid="tab-design"
                >
                  <Package className="h-4 w-4" />
                  Design
                </TabsTrigger>
                <TabsTrigger
                  value="operations"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md flex items-center gap-2"
                  data-testid="tab-operations"
                >
                  <Users className="h-4 w-4" />
                  Operations
                </TabsTrigger>
                <TabsTrigger
                  value="insights"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md flex items-center gap-2"
                  data-testid="tab-insights"
                >
                  <LineChart className="h-4 w-4" />
                  Insights
                </TabsTrigger>
                <TabsTrigger
                  value="compliance"
                  className="rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-md flex items-center gap-2"
                  data-testid="tab-compliance"
                >
                  <Shield className="h-4 w-4" />
                  Compliance
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-8">
                {/* OVERVIEW TAB - Executive Dashboard */}
                <TabsContent value="overview" className="space-y-6 mt-0">
                  <Suspense fallback={<TabLoadingFallback />}>
                    <OverviewTab
                      setActiveTab={setActiveTab}
                      dashboardMetrics={dashboardMetrics}
                      regulatoryData={regulatoryData}
                    />
                  </Suspense>
                </TabsContent>

                {/* DESIGN TAB - Protocol Designer */}
                <TabsContent value="design" className="space-y-6 mt-0">
                  <Suspense fallback={<TabLoadingFallback />}>
                    <DesignTab
                      protocol={protocol}
                      handleProtocolChange={handleProtocolChange}
                      handleArmChange={handleArmChange}
                      addArm={addArm}
                      removeArm={removeArm}
                      handleVisitChange={handleVisitChange}
                      addVisit={addVisit}
                      removeVisit={removeVisit}
                      handleSaveProtocol={handleSaveProtocol}
                      handleValidateProtocol={handleValidateProtocol}
                      handleGenerateSchedule={handleGenerateSchedule}
                      protocolLoading={protocolLoading}
                      validationResults={validationResults}
                    />
                  </Suspense>
                </TabsContent>

                {/* OPERATIONS TAB - Study Planning */}
                <TabsContent value="operations" className="space-y-6 mt-0">
                  <Suspense fallback={<TabLoadingFallback />}>
                    <OperationsTab />
                  </Suspense>
                </TabsContent>

                {/* INSIGHTS TAB - CSR Intelligence + ForesightAI */}
                <TabsContent value="insights" className="space-y-6 mt-0">
                  <Suspense fallback={<TabLoadingFallback />}>
                    <InsightsTab />
                  </Suspense>
                </TabsContent>

                {/* COMPLIANCE TAB - Regulatory Intelligence */}
                <TabsContent value="compliance" className="space-y-6 mt-0">
                  <Suspense fallback={<TabLoadingFallback />}>
                    <ComplianceTab regulatoryData={regulatoryData} />
                  </Suspense>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Lumen AI Assistant Panel */}

        {/* Lumen AI Assistant Panel */}
        {lumenPanelOpen && (
          <div className="w-96 border-l bg-white dark:bg-gray-900 flex flex-col">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold">AnA — RI Co-pilot</h3>
                    <p className="text-xs text-muted-foreground">
                      Context: {contextAwareness.currentModule}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLumenPanelOpen(false)}
                  className="rounded-lg"
                  data-testid="button-close-lumen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Context-aware suggestions */}
            <div className="p-4 border-b bg-blue-50 dark:bg-blue-950/20">
              <p className="text-xs font-medium mb-2">Suggested Actions:</p>
              <div className="space-y-2">
                {contextAwareness.suggestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs rounded-lg"
                    onClick={() => setLumenQuery(suggestion)}
                    data-testid={`button-suggestion-${idx}`}
                  >
                    <Sparkles className="h-3 w-3 mr-2" />
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>

            {/* Chat interface */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {lumenResponses.map((response, idx) => (
                  <div key={idx} className="space-y-2" data-testid={`lumen-response-${idx}`}>
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 mt-1 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{response.query}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(response.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 ml-6">
                      <Bot className="h-4 w-4 mt-1 text-purple-500" />
                      <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <p className="text-sm">{response.answer}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {response.confidence}% confidence
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {response.context}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={lumenQuery}
                  onChange={e => setLumenQuery(e.target.value)}
                  placeholder="Ask AnA anything..."
                  className="rounded-lg"
                  onKeyPress={e => e.key === 'Enter' && handleLumenQuery()}
                  data-testid="input-lumen-query"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleLumenQuery}
                        disabled={lumenLoading}
                        size="icon"
                        className="rounded-lg bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
                        data-testid="button-send-lumen"
                      >
                        {lumenLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Send to AnA</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Powered by ICH E6(R3) regulatory framework
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
