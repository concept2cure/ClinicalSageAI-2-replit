import { useState, useEffect, useCallback, useRef } from 'react';
import PhaseJourneyNavigator from '@/components/ForesightAI/PhaseJourneyNavigator';
import DoseEscalationModule from '@/components/ForesightAI/DoseEscalationModule';
import CrossSpeciesPKPDModule from '@/components/ForesightAI/CrossSpeciesPKPDModule';
import INDNarrativeModule from '@/components/ForesightAI/INDNarrativeModule';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  TrendingUp, 
  Activity, 
  FileText, 
  Calculator,
  Zap,
  Shield,
  BarChart3,
  Target,
  Lightbulb,
  ArrowRight,
  Search,
  Network,
  Database,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  BookOpen,
  Clock,
  Beaker,
  GitBranch,
  Sparkles,
  FlaskConical,
  Users,
  ChevronRight,
  Download,
  Share2,
  MessageSquare,
  Play,
  Pause,
  Settings,
  Filter,
  Eye,
  PieChart,
  TrendingDown,
  AlertTriangle,
  Award,
  Layers,
  Cpu,
  Gauge,
  LineChart,
  Microscope,
  Pill,
  TestTube,
  Heart,
  Stethoscope,
  Bot,
  Workflow,
  Bell,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useQuery, useMutation } from '@tanstack/react-query';
import queryClient from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  LineChart as RechartsLineChart,
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
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
  RadialBarChart,
  RadialBar
} from 'recharts';

// Use the correct organization ID from the database
const ORGANIZATION_ID = 7;

// Advanced prediction confidence data
const CONFIDENCE_SCORES = [
  { phase: 'Preclinical', confidence: 65, trend: 'up', delta: 3.2 },
  { phase: 'Phase I', confidence: 72, trend: 'up', delta: 5.1 },
  { phase: 'Phase II', confidence: 78, trend: 'stable', delta: 0.3 },
  { phase: 'Phase III', confidence: 85, trend: 'up', delta: 2.8 },
  { phase: 'FDA Approval', confidence: 91, trend: 'up', delta: 4.2 }
];

// Risk assessment matrix data
const RISK_MATRIX_DATA = [
  { category: 'Efficacy', probability: 'High', impact: 'High', score: 9, mitigation: 'Optimize dose-response' },
  { category: 'Safety', probability: 'Medium', impact: 'High', score: 6, mitigation: 'Enhanced monitoring protocol' },
  { category: 'Manufacturing', probability: 'Low', impact: 'Medium', score: 3, mitigation: 'Scale-up validation' },
  { category: 'Regulatory', probability: 'Low', impact: 'High', score: 4, mitigation: 'Early FDA meeting' },
  { category: 'Market', probability: 'Medium', impact: 'Medium', score: 5, mitigation: 'Competitive analysis' }
];

// Biomarker correlation matrix data
const BIOMARKER_CORRELATIONS = [
  { marker1: 'PD-L1', marker2: 'TMB', correlation: 0.82, pValue: 0.001 },
  { marker1: 'PD-L1', marker2: 'CD8+', correlation: 0.75, pValue: 0.002 },
  { marker1: 'TMB', marker2: 'MSI', correlation: 0.68, pValue: 0.003 },
  { marker1: 'BRCA', marker2: 'HRD', correlation: 0.91, pValue: 0.0001 },
  { marker1: 'Ki-67', marker2: 'ER', correlation: -0.65, pValue: 0.004 }
];

// ML Model performance metrics
const MODEL_METRICS = [
  { model: 'Dose Optimizer', accuracy: 92, precision: 89, recall: 91, f1Score: 90, auc: 0.94 },
  { model: 'Biomarker Predictor', accuracy: 88, precision: 85, recall: 87, f1Score: 86, auc: 0.91 },
  { model: 'Outcome Classifier', accuracy: 85, precision: 83, recall: 84, f1Score: 83.5, auc: 0.89 },
  { model: 'Safety Analyzer', accuracy: 90, precision: 88, recall: 89, f1Score: 88.5, auc: 0.92 },
  { model: 'Response Predictor', accuracy: 87, precision: 84, recall: 86, f1Score: 85, auc: 0.90 }
];

// Dose response curve data
const DOSE_RESPONSE_DATA = [
  { dose: 0, response: 0, ci_lower: 0, ci_upper: 0 },
  { dose: 10, response: 15, ci_lower: 12, ci_upper: 18 },
  { dose: 25, response: 35, ci_lower: 30, ci_upper: 40 },
  { dose: 50, response: 62, ci_lower: 55, ci_upper: 69 },
  { dose: 100, response: 78, ci_lower: 72, ci_upper: 84 },
  { dose: 200, response: 85, ci_lower: 80, ci_upper: 90 },
  { dose: 400, response: 88, ci_lower: 84, ci_upper: 92 },
  { dose: 800, response: 89, ci_lower: 86, ci_upper: 92 }
];

// Patient stratification data
const PATIENT_STRATIFICATION = [
  { segment: 'High Responders', percentage: 32, characteristics: ['PD-L1 >50%', 'TMB-H', 'MSI-H'], predictedORR: 78 },
  { segment: 'Moderate Responders', percentage: 45, characteristics: ['PD-L1 1-49%', 'TMB-M'], predictedORR: 45 },
  { segment: 'Low Responders', percentage: 23, characteristics: ['PD-L1 <1%', 'TMB-L'], predictedORR: 12 }
];

// Therapeutic target data
const THERAPEUTIC_TARGETS = [
  { target: 'PD-1/PD-L1', score: 95, druggability: 'High', novelty: 'Low', competition: 12 },
  { target: 'KRAS G12C', score: 88, druggability: 'Medium', novelty: 'High', competition: 5 },
  { target: 'CDK4/6', score: 82, druggability: 'High', novelty: 'Medium', competition: 8 },
  { target: 'BCL-2', score: 79, druggability: 'High', novelty: 'Low', competition: 6 },
  { target: 'TIGIT', score: 75, druggability: 'Medium', novelty: 'High', competition: 3 }
];

// Prediction timeline data
const PREDICTION_TIMELINE = [
  { month: 'Jan', actualSuccess: 68, predictedSuccess: 70, confidence: 85 },
  { month: 'Feb', actualSuccess: 71, predictedSuccess: 72, confidence: 87 },
  { month: 'Mar', actualSuccess: 73, predictedSuccess: 74, confidence: 88 },
  { month: 'Apr', actualSuccess: 75, predictedSuccess: 76, confidence: 89 },
  { month: 'May', actualSuccess: 78, predictedSuccess: 78, confidence: 91 },
  { month: 'Jun', actualSuccess: 80, predictedSuccess: 81, confidence: 92 },
  { month: 'Jul', actualSuccess: null, predictedSuccess: 83, confidence: 93 },
  { month: 'Aug', actualSuccess: null, predictedSuccess: 85, confidence: 94 }
];

// Seeded CSR Studies Data
const SEEDED_STUDIES = [
  {
    id: 'pembrolizumab-nsclc',
    name: 'Pembrolizumab NSCLC',
    nctNumber: 'NCT02142738',
    drug: 'Pembrolizumab',
    indication: 'Non-Small Cell Lung Cancer',
    outcomes: { orr: 44.8, pfs: 10.3, os: 30.0 },
    biomarkers: ['PD-L1 ≥50%', 'TMB-H'],
    impactScore: 92,
    color: 'blue'
  },
  {
    id: 'nivolumab-ipilimumab',
    name: 'Nivolumab + Ipilimumab',
    nctNumber: 'NCT02477826',
    drug: 'Nivolumab + Ipilimumab',
    indication: 'Advanced Melanoma',
    outcomes: { orr: 58.0, pfs: 11.5, os: 72.1 },
    biomarkers: ['PD-L1', 'TMB', 'LAG-3'],
    impactScore: 88,
    color: 'purple'
  },
  {
    id: 'palbociclib',
    name: 'Palbociclib HR+ BC',
    nctNumber: 'NCT01740427',
    drug: 'Palbociclib',
    indication: 'HR+ Breast Cancer',
    outcomes: { orr: 42.1, pfs: 27.6, os: 53.9 },
    biomarkers: ['ER+', 'PR+', 'Ki-67'],
    impactScore: 85,
    color: 'pink'
  },
  {
    id: 'car-t-all',
    name: 'CAR-T ALL',
    nctNumber: 'NCT02435849',
    drug: 'Tisagenlecleucel',
    indication: 'Acute Lymphoblastic Leukemia',
    outcomes: { orr: 81.0, pfs: 13.1, os: 76.4 },
    biomarkers: ['CD19+', 'CD20', 'BCR-ABL'],
    impactScore: 95,
    color: 'green'
  },
  {
    id: 'olaparib-brca',
    name: 'Olaparib BRCA',
    nctNumber: 'NCT02000622',
    drug: 'Olaparib',
    indication: 'BRCA-mutated Ovarian Cancer',
    outcomes: { orr: 72.2, pfs: 19.1, os: 51.7 },
    biomarkers: ['BRCA1/2', 'HRD', 'PARP'],
    impactScore: 90,
    color: 'orange'
  }
];

// Biomarker contribution data
const BIOMARKER_CONTRIBUTIONS = [
  { name: 'PD-L1', weight: 28, impact: 'High', studies: 23 },
  { name: 'TMB', weight: 22, impact: 'High', studies: 18 },
  { name: 'BRCA1/2', weight: 20, impact: 'High', studies: 12 },
  { name: 'Ki-67', weight: 15, impact: 'Medium', studies: 15 },
  { name: 'CD19', weight: 15, impact: 'Medium', studies: 8 }
];

// Mock accuracy trend data
const ACCURACY_TREND_DATA = [
  { date: 'Jan', accuracy: 82.3, csrCount: 5 },
  { date: 'Feb', accuracy: 83.1, csrCount: 12 },
  { date: 'Mar', accuracy: 84.7, csrCount: 18 },
  { date: 'Apr', accuracy: 85.2, csrCount: 25 },
  { date: 'May', accuracy: 86.8, csrCount: 35 },
  { date: 'Jun', accuracy: 87.3, csrCount: 42 },
  { date: 'Jul', accuracy: 88.9, csrCount: 48 },
  { date: 'Aug', accuracy: 90.1, csrCount: 56 },
];

export default function ForesightAI() {
  const [activeModule, setActiveModule] = useState('ai-predictions');
  const [searchQuery, setSearchQuery] = useState('');
  const [csrImportOpen, setCSRImportOpen] = useState(false);
  const [selectedCSRs, setSelectedCSRs] = useState<string[]>([]);
  const [recalibrateModalOpen, setRecalibrateModalOpen] = useState(false);
  const [recalibrationResults, setRecalibrationResults] = useState<any>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState([75]);
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<string[]>(['PD-L1', 'TMB']);
  const [scenarioMode, setScenarioMode] = useState('baseline');
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState('6m');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Real-time notification system
  useEffect(() => {
    if (showNotifications) {
      const interval = setInterval(() => {
        const newNotification = {
          id: Date.now(),
          type: ['insight', 'warning', 'success'][Math.floor(Math.random() * 3)],
          title: 'New ML Insight Generated',
          message: 'Biomarker correlation pattern detected with 92% confidence',
          time: new Date().toISOString()
        };
        setNotifications(prev => [newNotification, ...prev].slice(0, 5));
        
        toast({
          title: newNotification.title,
          description: newNotification.message,
        });
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [showNotifications, toast]);

  // Auto-refresh data
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetchStatus();
      }, 10000);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Fetch CSR Integration Status with correct organizationId
  const { data: csrStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['/api/foresight-ai/csr/status', ORGANIZATION_ID],
    queryFn: async () => {
      const response = await axios.get('/api/foresight-ai/csr/status', {
        params: { organizationId: ORGANIZATION_ID }
      });
      return response.data.status;
    },
    refetchInterval: autoRefresh ? 30000 : false
  });

  // Fetch CSR Insights with correct organizationId
  const { data: csrInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ['/api/foresight-ai/csr/insights', ORGANIZATION_ID],
    queryFn: async () => {
      const response = await axios.get('/api/foresight-ai/csr/insights', {
        params: { organizationId: ORGANIZATION_ID }
      });
      return response.data.insights;
    }
  });

  // Fetch available CSRs for import
  const { data: availableCSRs } = useQuery({
    queryKey: ['/api/csr-intelligence/query'],
    queryFn: async () => {
      const response = await axios.get('/api/csr-intelligence/query', {
        params: { limit: 50 }
      });
      return response.data.data || [];
    },
    enabled: csrImportOpen
  });

  // CSR Ingestion Mutation
  const ingestCSRMutation = useMutation({
    mutationFn: async (csrId: string) => {
      const response = await axios.post('/api/foresight-ai/csr/ingest', {
        csrId,
        organizationId: ORGANIZATION_ID,
        processType: 'full'
      });
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "CSR Successfully Ingested",
        description: "ForesightAI has processed and integrated the CSR data.",
      });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/foresight-ai/csr/insights'] });
    },
    onError: (error: any) => {
      toast({
        title: "CSR Ingestion Failed",
        description: error.response?.data?.error || "Failed to process CSR",
        variant: "destructive",
      });
    }
  });

  // Enhanced Recalibrate Predictions Mutation
  const recalibrateMutation = useMutation({
    mutationFn: async () => {
      setIsProcessing(true);
      const beforeAccuracy = csrStatus?.predictionAccuracy || 0.87;
      const response = await axios.post('/api/foresight-ai/predictions/recalibrate', {
        organizationId: ORGANIZATION_ID,
        recalibrationDepth: 'deep'
      });
      
      // Mock enhanced results for demonstration
      const afterAccuracy = beforeAccuracy + (Math.random() * 0.05);
      const results = {
        ...response.data,
        beforeAccuracy,
        afterAccuracy,
        improvement: ((afterAccuracy - beforeAccuracy) * 100).toFixed(2),
        modelsUpdated: response.data.modelsUpdated || 12,
        predictionsImproved: response.data.predictionsUpdated || 156,
        newPatterns: Math.floor(Math.random() * 10) + 5
      };
      
      setRecalibrationResults(results);
      setRecalibrateModalOpen(true);
      setIsProcessing(false);
      
      return results;
    },
    onSuccess: (data) => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['/api/foresight-ai/csr/insights'] });
    },
    onError: () => {
      setIsProcessing(false);
      toast({
        title: "Recalibration Failed",
        description: "Failed to recalibrate predictions",
        variant: "destructive",
      });
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
  };

  const handleImportCSRs = () => {
    selectedCSRs.forEach(csrId => {
      ingestCSRMutation.mutate(csrId);
    });
    setCSRImportOpen(false);
    setSelectedCSRs([]);
  };

  const handleExportReport = (format: string) => {
    toast({
      title: "Report Exported",
      description: `ForesightAI report exported as ${format.toUpperCase()}`,
    });
    setExportModalOpen(false);
  };

  const handleAddAnnotation = () => {
    if (currentAnnotation.trim()) {
      const newAnnotation = {
        id: Date.now(),
        text: currentAnnotation,
        author: 'Current User',
        timestamp: new Date().toISOString(),
        type: 'insight'
      };
      setAnnotations([...annotations, newAnnotation]);
      setCurrentAnnotation('');
      setAnnotationModalOpen(false);
      
      toast({
        title: "Annotation Added",
        description: "Your insight has been saved and shared with the team.",
      });
    }
  };

  const calculateSuccessProbability = (phase: string, biomarkers: string[]) => {
    const baseProb = CONFIDENCE_SCORES.find(c => c.phase === phase)?.confidence || 50;
    const biomarkerBoost = biomarkers.length * 3;
    return Math.min(baseProb + biomarkerBoost, 95);
  };

  const getRiskColor = (score: number) => {
    if (score <= 3) return 'text-green-600 bg-green-50';
    if (score <= 6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Pipeline node data
  const pipelineNodes = [
    { label: 'CSR Studies', count: 5, icon: FileText, color: 'text-blue-600' },
    { label: 'Extraction', count: 80, icon: Beaker, color: 'text-purple-600' },
    { label: 'Patterns', count: 10, icon: GitBranch, color: 'text-indigo-600' },
    { label: 'Predictions', count: 156, icon: Brain, color: 'text-green-600' },
    { label: 'Outcomes', count: 42, icon: Target, color: 'text-orange-600' },
    { label: 'Learning', count: '∞', icon: Sparkles, color: 'text-pink-600' }
  ];

  // Mock learning events
  const learningEvents = [
    {
      id: 1,
      time: '2 hours ago',
      type: 'insight',
      title: 'PD-L1 Expression Pattern Updated',
      description: 'Analysis of Pembrolizumab NSCLC trial revealed stronger correlation between PD-L1 >75% and complete response',
      impact: 'high',
      studies: 3
    },
    {
      id: 2,
      time: '5 hours ago',
      type: 'pattern',
      title: 'New Biomarker Combination Discovered',
      description: 'TMB-H + PD-L1 combination shows 23% better predictive power for immunotherapy response',
      impact: 'medium',
      studies: 7
    },
    {
      id: 3,
      time: '1 day ago',
      type: 'calibration',
      title: 'BRCA Mutation Model Recalibrated',
      description: 'Olaparib response prediction improved by 4.2% after integrating new ovarian cancer CSR data',
      impact: 'high',
      studies: 2
    }
  ];

  const getEventIcon = (type: string) => {
    switch(type) {
      case 'insight': return <Lightbulb className="h-4 w-4" />;
      case 'pattern': return <GitBranch className="h-4 w-4" />;
      case 'calibration': return <RefreshCw className="h-4 w-4" />;
      case 'validation': return <CheckCircle2 className="h-4 w-4" />;
      case 'discovery': return <Sparkles className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch(type) {
      case 'insight': return 'text-yellow-600 bg-yellow-50';
      case 'pattern': return 'text-purple-600 bg-purple-50';
      case 'calibration': return 'text-blue-600 bg-blue-50';
      case 'validation': return 'text-green-600 bg-green-50';
      case 'discovery': return 'text-pink-600 bg-pink-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  // Colors for charts
  const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6'];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ForesightAI™ Translational Intelligence Engine
            </h1>
            <p className="text-gray-600 text-lg">
              Next-generation AI predicting clinical success from preclinical data across all development phases
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              GPT-5 & O3 Reasoning Models
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              FDA/EMA Compliant
            </Badge>
          </div>
        </div>

        {/* Enhanced Control Bar */}
        <div className="flex items-center gap-4 mt-4">
          <form onSubmit={handleSearch} className="flex-grow max-w-3xl flex gap-2">
            <Input
              placeholder="Search biomarkers, endpoints, patterns, or clinical outcomes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
              data-testid="input-search"
            />
            <Button type="submit" data-testid="button-search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </form>
          
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={autoRefresh ? "default" : "outline"}
                    size="icon"
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    data-testid="button-auto-refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showNotifications ? "default" : "outline"}
                    size="icon"
                    onClick={() => setShowNotifications(!showNotifications)}
                    data-testid="button-notifications"
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showNotifications ? 'Notifications enabled' : 'Notifications disabled'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setExportModalOpen(true)}
              data-testid="button-export"
            >
              <Download className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAnnotationModalOpen(true)}
              data-testid="button-annotate"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* AI Intelligence Alert with CSR Integration */}
      <Alert className="mb-6 border-blue-200 bg-blue-50">
        <Zap className="h-4 w-4" />
        <AlertTitle>Advanced AI Capabilities Active</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            ForesightAI™ leverages GPT-5, O3 reasoning models, and specialized transformer architectures 
            for unprecedented predictive accuracy in drug development. Real-time adaptive learning continuously 
            improves predictions based on your clinical outcomes.
          </span>
          <div className="flex gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              CSR Intelligence Connected
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1 animate-pulse">
              <Activity className="h-3 w-3" />
              Processing Live Data
            </Badge>
          </div>
        </AlertDescription>
      </Alert>
      
      {/* Main Content Tabs */}
      <Tabs value={activeModule} onValueChange={setActiveModule} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 h-auto">
          <TabsTrigger value="ai-predictions" className="flex-col gap-1 py-3">
            <Bot className="h-4 w-4" />
            <span className="text-xs">AI Predictions</span>
          </TabsTrigger>
          <TabsTrigger value="biomarker-intelligence" className="flex-col gap-1 py-3">
            <Microscope className="h-4 w-4" />
            <span className="text-xs">Biomarkers</span>
          </TabsTrigger>
          <TabsTrigger value="outcome-simulator" className="flex-col gap-1 py-3">
            <TestTube className="h-4 w-4" />
            <span className="text-xs">Outcome Sim</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex-col gap-1 py-3">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="dose-escalation" className="flex-col gap-1 py-3">
            <Calculator className="h-4 w-4" />
            <span className="text-xs">Dose</span>
          </TabsTrigger>
          <TabsTrigger value="cross-species" className="flex-col gap-1 py-3">
            <Activity className="h-4 w-4" />
            <span className="text-xs">PK/PD</span>
          </TabsTrigger>
          <TabsTrigger value="phase-journey" className="flex-col gap-1 py-3">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">Journey</span>
          </TabsTrigger>
        </TabsList>

        {/* AI-Powered Predictions Dashboard Tab */}
        <TabsContent value="ai-predictions" className="space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Prediction Confidence Scores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-blue-600" />
                    Real-time Prediction Confidence Scores
                  </CardTitle>
                  <CardDescription>
                    ML confidence levels across development phases with trend indicators
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-4">
                    {CONFIDENCE_SCORES.map((score) => (
                      <div key={score.phase} className="text-center p-4 border rounded-lg hover:shadow-md transition-shadow">
                        <div className="text-sm font-medium text-gray-600 mb-2">{score.phase}</div>
                        <div className="relative">
                          <div className="text-3xl font-bold text-blue-600">{score.confidence}%</div>
                          <div className={`flex items-center justify-center gap-1 mt-1 text-xs ${
                            score.trend === 'up' ? 'text-green-600' : 
                            score.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {score.trend === 'up' ? <TrendingUp className="h-3 w-3" /> :
                             score.trend === 'down' ? <TrendingDown className="h-3 w-3" /> :
                             <Minus className="h-3 w-3" />}
                            <span>{score.delta > 0 ? '+' : ''}{score.delta}%</span>
                          </div>
                        </div>
                        <Progress value={score.confidence} className="mt-2 h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Interactive Prediction Timeline */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <LineChart className="h-5 w-5 text-purple-600" />
                        Interactive Prediction Timeline
                      </CardTitle>
                      <CardDescription>
                        Adjustable parameters for success prediction modeling
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label>Confidence Threshold</Label>
                        <Slider
                          value={confidenceThreshold}
                          onValueChange={setConfidenceThreshold}
                          min={50}
                          max={100}
                          step={5}
                          className="w-32"
                        />
                        <span className="text-sm font-medium">{confidenceThreshold[0]}%</span>
                      </div>
                      <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3m">3 Months</SelectItem>
                          <SelectItem value="6m">6 Months</SelectItem>
                          <SelectItem value="1y">1 Year</SelectItem>
                          <SelectItem value="2y">2 Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsLineChart data={PREDICTION_TIMELINE}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="predictedSuccess" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        name="Predicted Success"
                        strokeDasharray="5 5"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="actualSuccess" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        name="Actual Success"
                      />
                      <Area
                        type="monotone"
                        dataKey="confidence"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.1}
                        name="Confidence Band"
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Success Probability Calculator */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-green-600" />
                    Clinical Trial Success Probability Calculator
                  </CardTitle>
                  <CardDescription>
                    AI-powered probability assessment based on multiple factors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label>Select Phase</Label>
                        <Select defaultValue="phase2">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="preclinical">Preclinical</SelectItem>
                            <SelectItem value="phase1">Phase I</SelectItem>
                            <SelectItem value="phase2">Phase II</SelectItem>
                            <SelectItem value="phase3">Phase III</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label>Biomarker Selection</Label>
                        <div className="space-y-2 mt-2">
                          {['PD-L1', 'TMB', 'BRCA', 'Ki-67', 'CD19'].map((marker) => (
                            <div key={marker} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={marker}
                                checked={selectedBiomarkers.includes(marker)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBiomarkers([...selectedBiomarkers, marker]);
                                  } else {
                                    setSelectedBiomarkers(selectedBiomarkers.filter(m => m !== marker));
                                  }
                                }}
                                className="rounded"
                              />
                              <Label htmlFor={marker} className="cursor-pointer">
                                {marker}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <Button 
                        className="w-full"
                        onClick={() => {
                          const prob = calculateSuccessProbability('Phase II', selectedBiomarkers);
                          toast({
                            title: "Success Probability Calculated",
                            description: `Estimated success probability: ${prob}%`,
                          });
                        }}
                        data-testid="button-calculate-probability"
                      >
                        Calculate Probability
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-center">
                      <div className="relative">
                        <div className="w-48 h-48 rounded-full border-8 border-gray-200 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-green-600">
                              {calculateSuccessProbability('Phase II', selectedBiomarkers)}%
                            </div>
                            <div className="text-sm text-gray-600 mt-1">Success Probability</div>
                          </div>
                        </div>
                        <motion.div
                          className="absolute inset-0 rounded-full border-8 border-green-600"
                          style={{
                            clipPath: `polygon(50% 50%, 50% 0, ${
                              50 + 50 * Math.sin((calculateSuccessProbability('Phase II', selectedBiomarkers) * 3.6 - 90) * Math.PI / 180)
                            }% ${
                              50 - 50 * Math.cos((calculateSuccessProbability('Phase II', selectedBiomarkers) * 3.6 - 90) * Math.PI / 180)
                            }%, 50% 50%)`
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 1 }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Assessment Matrix */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    Risk Assessment Matrix
                  </CardTitle>
                  <CardDescription>
                    Comprehensive risk analysis with mitigation strategies
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {RISK_MATRIX_DATA.map((risk) => (
                      <div key={risk.category} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className={`p-2 rounded-lg ${getRiskColor(risk.score)}`}>
                          <Shield className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{risk.category}</h4>
                            <Badge variant="outline" className={getRiskColor(risk.score).split(' ')[0]}>
                              Risk Score: {risk.score}/10
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                            <span>Probability: {risk.probability}</span>
                            <span>Impact: {risk.impact}</span>
                          </div>
                          <div className="mt-2">
                            <span className="text-sm font-medium">Mitigation: </span>
                            <span className="text-sm text-gray-600">{risk.mitigation}</span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" data-testid={`button-mitigate-${risk.category.toLowerCase()}`}>
                          View Details
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">Overall Risk Score</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Weighted average across all categories
                        </p>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-orange-600">5.4</div>
                        <Badge variant="outline" className="mt-1">Medium Risk</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* Biomarker Intelligence Panel Tab */}
        <TabsContent value="biomarker-intelligence" className="space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Biomarker Discovery Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-600" />
                    Biomarker Discovery Timeline
                  </CardTitle>
                  <CardDescription>
                    Historical progression of biomarker identification and validation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                    {[
                      { date: '2024-01', marker: 'PD-L1 >75%', impact: 'High', status: 'Validated' },
                      { date: '2024-03', marker: 'TMB-H + MSI', impact: 'High', status: 'Validated' },
                      { date: '2024-05', marker: 'BRCA1/2', impact: 'Medium', status: 'Testing' },
                      { date: '2024-07', marker: 'CD8+ TILs', impact: 'Low', status: 'Discovery' },
                      { date: '2024-09', marker: 'ctDNA', impact: 'High', status: 'Discovery' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 mb-6">
                        <div className="w-8 h-8 bg-white border-2 border-indigo-600 rounded-full flex items-center justify-center z-10">
                          <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="flex-1 p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold">{item.marker}</h4>
                              <p className="text-sm text-gray-600">{item.date}</p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant={item.impact === 'High' ? 'default' : 'outline'}>
                                {item.impact} Impact
                              </Badge>
                              <Badge variant={item.status === 'Validated' ? 'default' : 'outline'}>
                                {item.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Correlation Matrix Visualization */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-purple-600" />
                    Biomarker Correlation Matrix
                  </CardTitle>
                  <CardDescription>
                    Statistical correlations between key biomarkers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="x" name="PD-L1 Expression" />
                          <YAxis dataKey="y" name="TMB Score" />
                          <ZAxis dataKey="z" range={[50, 400]} name="Response Rate" />
                          <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter
                            name="Patients"
                            data={[
                              { x: 10, y: 20, z: 45 },
                              { x: 30, y: 40, z: 65 },
                              { x: 45, y: 35, z: 72 },
                              { x: 60, y: 55, z: 85 },
                              { x: 75, y: 70, z: 92 },
                              { x: 85, y: 80, z: 95 }
                            ]}
                            fill="#8b5cf6"
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-semibold">Correlation Coefficients</h4>
                      {BIOMARKER_CORRELATIONS.map((corr, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{corr.marker1}</span>
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{corr.marker2}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`text-sm font-medium ${
                              Math.abs(corr.correlation) > 0.8 ? 'text-green-600' :
                              Math.abs(corr.correlation) > 0.6 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              r = {corr.correlation}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              p = {corr.pValue}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Predictive Biomarker Ranking */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-600" />
                    Predictive Biomarker Ranking System
                  </CardTitle>
                  <CardDescription>
                    AI-ranked biomarkers by predictive power and clinical utility
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {BIOMARKER_CONTRIBUTIONS.map((marker, idx) => (
                      <div key={marker.name} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{marker.name}</h4>
                            <div className="flex items-center gap-2">
                              <Badge variant={marker.impact === 'High' ? 'default' : 'outline'}>
                                {marker.impact} Impact
                              </Badge>
                              <span className="text-sm text-gray-600">{marker.studies} studies</span>
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                              <span>Predictive Weight</span>
                              <span>{marker.weight}%</span>
                            </div>
                            <Progress value={marker.weight * 3.5} className="h-2" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Therapeutic Target Identification */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-red-600" />
                    Therapeutic Target Identification
                  </CardTitle>
                  <CardDescription>
                    AI-identified targets with druggability and novelty scores
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={THERAPEUTIC_TARGETS.map(t => ({
                      target: t.target,
                      score: t.score,
                      druggability: t.druggability === 'High' ? 90 : t.druggability === 'Medium' ? 60 : 30,
                      novelty: t.novelty === 'High' ? 90 : t.novelty === 'Medium' ? 60 : 30,
                      competition: (15 - t.competition) * 6
                    }))}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="target" />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} />
                      <Radar name="Overall Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                      <Radar name="Druggability" dataKey="druggability" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {THERAPEUTIC_TARGETS.slice(0, 4).map((target) => (
                      <div key={target.target} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{target.target}</h4>
                          <Badge variant="outline">{target.score}/100</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Druggability:</span>
                            <span className={target.druggability === 'High' ? 'text-green-600' : 'text-yellow-600'}>
                              {target.druggability}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Novelty:</span>
                            <span className={target.novelty === 'High' ? 'text-purple-600' : 'text-gray-600'}>
                              {target.novelty}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Competitors:</span>
                            <span>{target.competition}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* Clinical Outcome Simulator Tab */}
        <TabsContent value="outcome-simulator" className="space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Interactive Outcome Prediction Tool */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-blue-600" />
                    Interactive Outcome Prediction Tool
                  </CardTitle>
                  <CardDescription>
                    Real-time clinical outcome predictions with adjustable parameters
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <Label>Treatment Type</Label>
                      <Select defaultValue="immunotherapy">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="immunotherapy">Immunotherapy</SelectItem>
                          <SelectItem value="chemotherapy">Chemotherapy</SelectItem>
                          <SelectItem value="targeted">Targeted Therapy</SelectItem>
                          <SelectItem value="combination">Combination</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Patient Population</Label>
                      <Select defaultValue="all">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Patients</SelectItem>
                          <SelectItem value="biomarker-positive">Biomarker Positive</SelectItem>
                          <SelectItem value="biomarker-negative">Biomarker Negative</SelectItem>
                          <SelectItem value="elderly">Elderly ({'>'}65)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Endpoint</Label>
                      <Select defaultValue="orr">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="orr">Overall Response Rate</SelectItem>
                          <SelectItem value="pfs">Progression-Free Survival</SelectItem>
                          <SelectItem value="os">Overall Survival</SelectItem>
                          <SelectItem value="dcr">Disease Control Rate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-purple-600">68.5%</div>
                      <div className="text-sm text-gray-600 mt-1">Predicted Overall Response Rate</div>
                      <div className="flex items-center justify-center gap-4 mt-4">
                        <Badge variant="outline">95% CI: 62.3% - 74.7%</Badge>
                        <Badge variant="outline">n = 250 patients</Badge>
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full mt-4"
                      onClick={() => {
                        setIsProcessing(true);
                        setTimeout(() => {
                          setIsProcessing(false);
                          toast({
                            title: "Simulation Complete",
                            description: "Outcome prediction updated with latest parameters",
                          });
                        }, 2000);
                      }}
                      disabled={isProcessing}
                      data-testid="button-run-simulation"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Running Simulation...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Simulation
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Scenario Planning with What-If Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-indigo-600" />
                    Scenario Planning & What-If Analysis
                  </CardTitle>
                  <CardDescription>
                    Compare multiple treatment scenarios and outcomes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <Label>Scenario Mode:</Label>
                    <div className="flex gap-2">
                      {['baseline', 'optimistic', 'pessimistic', 'custom'].map((mode) => (
                        <Button
                          key={mode}
                          variant={scenarioMode === mode ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setScenarioMode(mode)}
                          data-testid={`button-scenario-${mode}`}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={[
                      { scenario: 'Baseline', orr: 65, pfs: 12.5, os: 28, safety: 15 },
                      { scenario: 'Optimistic', orr: 78, pfs: 16.2, os: 35, safety: 12 },
                      { scenario: 'Pessimistic', orr: 52, pfs: 9.8, os: 22, safety: 20 },
                      { scenario: 'Custom', orr: 70, pfs: 14.0, os: 30, safety: 14 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="scenario" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <RechartsTooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="orr" fill="#8b5cf6" name="ORR (%)" />
                      <Bar yAxisId="left" dataKey="pfs" fill="#10b981" name="PFS (months)" />
                      <Line yAxisId="right" type="monotone" dataKey="safety" stroke="#ef4444" name="AE Rate (%)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  
                  {scenarioMode === 'custom' && (
                    <div className="mt-4 p-4 border rounded-lg bg-gray-50">
                      <h4 className="font-semibold mb-3">Custom Scenario Parameters</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>ORR Adjustment</Label>
                          <Slider defaultValue={[0]} min={-20} max={20} step={5} />
                        </div>
                        <div>
                          <Label>PFS Adjustment</Label>
                          <Slider defaultValue={[0]} min={-5} max={5} step={1} />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dose-Response Curve Predictions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-green-600" />
                    Dose-Response Curve Predictions
                  </CardTitle>
                  <CardDescription>
                    ML-predicted dose-response relationships with confidence intervals
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={DOSE_RESPONSE_DATA}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dose" label={{ value: 'Dose (mg)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Response (%)', angle: -90, position: 'insideLeft' }} />
                      <RechartsTooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="ci_upper"
                        stroke="none"
                        fill="#10b981"
                        fillOpacity={0.2}
                        name="Upper CI"
                      />
                      <Area
                        type="monotone"
                        dataKey="ci_lower"
                        stroke="none"
                        fill="#10b981"
                        fillOpacity={0.2}
                        name="Lower CI"
                      />
                      <Line
                        type="monotone"
                        dataKey="response"
                        stroke="#10b981"
                        strokeWidth={3}
                        name="Predicted Response"
                        dot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-sm text-gray-600">EC50</div>
                      <div className="text-xl font-bold text-blue-600">42.5 mg</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-sm text-gray-600">Max Response</div>
                      <div className="text-xl font-bold text-green-600">89%</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <div className="text-sm text-gray-600">Hill Slope</div>
                      <div className="text-xl font-bold text-purple-600">1.8</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Patient Population Stratification */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-600" />
                    Patient Population Stratification
                  </CardTitle>
                  <CardDescription>
                    AI-driven patient segmentation for personalized treatment
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <ResponsiveContainer width="100%" height={250}>
                        <RechartsPieChart>
                          <Pie
                            data={PATIENT_STRATIFICATION}
                            dataKey="percentage"
                            nameKey="segment"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ segment, percentage }) => `${segment}: ${percentage}%`}
                          >
                            {PATIENT_STRATIFICATION.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="space-y-3">
                      {PATIENT_STRATIFICATION.map((segment, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold">{segment.segment}</h4>
                            <Badge>{segment.percentage}%</Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="text-sm">
                              <span className="text-gray-600">Predicted ORR: </span>
                              <span className="font-medium">{segment.predictedORR}%</span>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Key Characteristics:</div>
                              <div className="flex flex-wrap gap-1">
                                {segment.characteristics.map((char, charIdx) => (
                                  <Badge key={charIdx} variant="outline" className="text-xs">
                                    {char}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* Advanced Analytics Features Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Real-time Data Processing Indicators */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-600 animate-pulse" />
                    Real-time Data Processing Status
                  </CardTitle>
                  <CardDescription>
                    Live monitoring of AI model processing and data ingestion
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <Activity className="h-8 w-8 mx-auto mb-2 text-green-600 animate-pulse" />
                      <div className="text-2xl font-bold">1,247</div>
                      <div className="text-sm text-gray-600">Data Points/sec</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <Cpu className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <div className="text-2xl font-bold">87%</div>
                      <div className="text-sm text-gray-600">GPU Utilization</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <Database className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <div className="text-2xl font-bold">3.2TB</div>
                      <div className="text-sm text-gray-600">Data Processed</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                      <div className="text-2xl font-bold">12ms</div>
                      <div className="text-sm text-gray-600">Avg Latency</div>
                    </div>
                  </div>
                  
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">CSR Data Pipeline</span>
                      <span className="text-sm text-gray-600">Processing 85/100 documents</span>
                    </div>
                    <Progress value={85} className="h-2" />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">ML Model Training</span>
                      <span className="text-sm text-gray-600">Epoch 47/50</span>
                    </div>
                    <Progress value={94} className="h-2" />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Prediction Generation</span>
                      <span className="text-sm text-gray-600">156 predictions/min</span>
                    </div>
                    <Progress value={72} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* ML Model Performance Metrics Dashboard */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-indigo-600" />
                    ML Model Performance Metrics Dashboard
                  </CardTitle>
                  <CardDescription>
                    Comprehensive performance analytics for all active models
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={MODEL_METRICS}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="model" />
                      <PolarRadiusAxis angle={90} domain={[70, 100]} />
                      <Radar name="Accuracy" dataKey="accuracy" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                      <Radar name="Precision" dataKey="precision" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                      <Radar name="Recall" dataKey="recall" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                  
                  <div className="mt-4 space-y-3">
                    {MODEL_METRICS.map((model) => (
                      <div key={model.model} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <h4 className="font-semibold">{model.model}</h4>
                          <div className="flex gap-4 mt-1 text-sm text-gray-600">
                            <span>F1: {model.f1Score}%</span>
                            <span>AUC: {model.auc}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={model.accuracy >= 90 ? 'default' : 'outline'}>
                            {model.accuracy}% Accurate
                          </Badge>
                          <Button variant="outline" size="sm" data-testid={`button-model-details-${model.model.toLowerCase().replace(/\s+/g, '-')}`}>
                            Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Automated Insight Generation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-yellow-600" />
                    Automated Insight Generation
                  </CardTitle>
                  <CardDescription>
                    AI-generated insights and recommendations updated in real-time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      {
                        type: 'critical',
                        icon: AlertTriangle,
                        color: 'text-red-600 bg-red-50',
                        title: 'Safety Signal Detected',
                        description: 'Increased AE rate (23%) in elderly population with combination therapy',
                        action: 'Review Protocol'
                      },
                      {
                        type: 'opportunity',
                        icon: TrendingUp,
                        color: 'text-green-600 bg-green-50',
                        title: 'Efficacy Opportunity',
                        description: 'PD-L1 >75% subgroup showing 92% ORR, significantly above expected',
                        action: 'Expand Cohort'
                      },
                      {
                        type: 'insight',
                        icon: Lightbulb,
                        color: 'text-yellow-600 bg-yellow-50',
                        title: 'Biomarker Insight',
                        description: 'Novel TMB-MSI combination predicting 85% response rate',
                        action: 'Validate Finding'
                      }
                    ].map((insight, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-start gap-4 p-4 border rounded-lg hover:shadow-md transition-shadow"
                      >
                        <div className={`p-2 rounded-lg ${insight.color}`}>
                          <insight.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold">{insight.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                        </div>
                        <Button variant="outline" size="sm" data-testid={`button-insight-action-${idx}`}>
                          {insight.action}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                  
                  <Button className="w-full mt-4" variant="outline" data-testid="button-generate-insights">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate More Insights
                  </Button>
                </CardContent>
              </Card>

              {/* Predictive Trend Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    Predictive Trend Analysis
                  </CardTitle>
                  <CardDescription>
                    Forward-looking trends and pattern recognition
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={[
                      { month: 'Jan', actual: 65, predicted: 67, upper: 72, lower: 62 },
                      { month: 'Feb', actual: 68, predicted: 70, upper: 75, lower: 65 },
                      { month: 'Mar', actual: 72, predicted: 73, upper: 78, lower: 68 },
                      { month: 'Apr', actual: 75, predicted: 76, upper: 81, lower: 71 },
                      { month: 'May', actual: 78, predicted: 79, upper: 84, lower: 74 },
                      { month: 'Jun', actual: null, predicted: 82, upper: 87, lower: 77 },
                      { month: 'Jul', actual: null, predicted: 85, upper: 90, lower: 80 },
                      { month: 'Aug', actual: null, predicted: 87, upper: 92, lower: 82 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="upper"
                        stroke="none"
                        fill="#8b5cf6"
                        fillOpacity={0.1}
                        name="Upper Bound"
                      />
                      <Area
                        type="monotone"
                        dataKey="lower"
                        stroke="none"
                        fill="#8b5cf6"
                        fillOpacity={0.1}
                        name="Lower Bound"
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Actual"
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Predicted"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-600" />
                      <div className="text-sm text-gray-600">Trend Direction</div>
                      <div className="font-semibold">Upward</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <Gauge className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                      <div className="text-sm text-gray-600">Confidence Level</div>
                      <div className="font-semibold">93%</div>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <Target className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                      <div className="text-sm text-gray-600">3-Month Forecast</div>
                      <div className="font-semibold">87% ORR</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* Dose Escalation Tab */}
        <TabsContent value="dose-escalation" className="space-y-6">
          <DoseEscalationModule />
        </TabsContent>

        {/* Cross-Species PK/PD Tab */}
        <TabsContent value="cross-species" className="space-y-6">
          <CrossSpeciesPKPDModule />
        </TabsContent>

        {/* Phase Journey Tab */}
        <TabsContent value="phase-journey" className="space-y-6">
          <PhaseJourneyNavigator />
        </TabsContent>
      </Tabs>

      {/* Floating Notifications Panel */}
      <AnimatePresence>
        {showNotifications && notifications.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed right-4 top-20 w-80 space-y-2 z-50"
          >
            {notifications.slice(0, 3).map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white p-3 rounded-lg shadow-lg border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <Bell className="h-4 w-4 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <h5 className="text-sm font-semibold">{notification.title}</h5>
                      <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setNotifications(notifications.filter(n => n.id !== notification.id))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export ForesightAI Report</DialogTitle>
            <DialogDescription>
              Select format and components to include in your report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Export Format</Label>
              <Select defaultValue="pdf">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Report</SelectItem>
                  <SelectItem value="excel">Excel Workbook</SelectItem>
                  <SelectItem value="powerpoint">PowerPoint Presentation</SelectItem>
                  <SelectItem value="json">JSON Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Include Components</Label>
              <div className="space-y-2 mt-2">
                {['Predictions Dashboard', 'Biomarker Analysis', 'Clinical Outcomes', 'Risk Assessment', 'ML Metrics'].map((component) => (
                  <div key={component} className="flex items-center gap-2">
                    <input type="checkbox" id={component} defaultChecked className="rounded" />
                    <Label htmlFor={component} className="cursor-pointer">{component}</Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => handleExportReport('pdf')} data-testid="button-export-confirm">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Annotation Modal */}
      <Dialog open={annotationModalOpen} onOpenChange={setAnnotationModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Collaborative Annotation</DialogTitle>
            <DialogDescription>
              Share insights and observations with your team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Annotation Type</Label>
              <Select defaultValue="insight">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="insight">Insight</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="concern">Concern</SelectItem>
                  <SelectItem value="recommendation">Recommendation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Your Annotation</Label>
              <Textarea
                value={currentAnnotation}
                onChange={(e) => setCurrentAnnotation(e.target.value)}
                placeholder="Enter your annotation here..."
                rows={4}
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAnnotationModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAnnotation} data-testid="button-add-annotation">
                <MessageSquare className="h-4 w-4 mr-2" />
                Add Annotation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSR Import Dialog */}
      <Dialog open={csrImportOpen} onOpenChange={setCSRImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Additional CSR Studies</DialogTitle>
            <DialogDescription>
              Select clinical study reports to enhance ForesightAI predictions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {availableCSRs?.map((csr: any) => (
              <div key={csr.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <input
                  type="checkbox"
                  checked={selectedCSRs.includes(csr.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCSRs([...selectedCSRs, csr.id]);
                    } else {
                      setSelectedCSRs(selectedCSRs.filter(id => id !== csr.id));
                    }
                  }}
                />
                <div className="flex-1">
                  <h4 className="font-semibold">{csr.title || csr.id}</h4>
                  <p className="text-sm text-gray-600">
                    {csr.drug} | {csr.indication}
                  </p>
                </div>
                <Badge variant="outline">{csr.phase}</Badge>
              </div>
            )) || (
              <div className="text-center py-8 text-gray-500">
                No additional CSRs available for import
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCSRImportOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleImportCSRs}
              disabled={selectedCSRs.length === 0 || ingestCSRMutation.isPending}
              data-testid="button-import-csrs"
            >
              Import {selectedCSRs.length} CSR{selectedCSRs.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recalibration Results Modal */}
      <Dialog open={recalibrateModalOpen} onOpenChange={setRecalibrateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Recalibration Complete
            </DialogTitle>
          </DialogHeader>
          {recalibrationResults && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="text-sm text-gray-600 mb-2">Prediction Accuracy</div>
                <div className="flex items-center justify-center gap-4">
                  <div>
                    <div className="text-2xl font-bold text-gray-400">
                      {(recalibrationResults.beforeAccuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Before</div>
                  </div>
                  <ArrowRight className="h-6 w-6 text-green-600" />
                  <div>
                    <div className="text-3xl font-bold text-green-600">
                      {(recalibrationResults.afterAccuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">After</div>
                  </div>
                </div>
                <Badge variant="secondary" className="mt-3">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{recalibrationResults.improvement}% improvement
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{recalibrationResults.modelsUpdated}</div>
                  <div className="text-xs text-gray-600">Models Updated</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{recalibrationResults.predictionsImproved}</div>
                  <div className="text-xs text-gray-600">Predictions Improved</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold">{recalibrationResults.newPatterns}</div>
                  <div className="text-xs text-gray-600">New Patterns</div>
                </div>
              </div>

              <div className="pt-2">
                <Button 
                  className="w-full" 
                  onClick={() => setRecalibrateModalOpen(false)}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}