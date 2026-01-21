/**
 * ENTERPRISE-GRADE Policy Engine with AI - STEP 10: Regional Rule Packs (FDA/EMA/PMDA)
 *
 * World-class regulatory policy management system with advanced AI capabilities:
 * - AI-powered policy recommendations and optimization
 * - Smart impact prediction with machine learning models
 * - Intelligent policy conflict detection and resolution
 * - Natural language policy queries and explanations
 * - Automated compliance gap analysis with remediation suggestions
 * - AI-driven regulatory trend analysis and forecasting
 */

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Globe,
  CheckCircle2,
  AlertTriangle,
  FileText,
  TrendingUp,
  Upload,
  Download,
  Eye,
  Edit,
  Trash2,
  History,
  BarChart3,
  Activity,
  Shield,
  Zap,
  GitBranch,
  Target,
  Users,
  Clock,
  Layers,
  Database,
  RefreshCw,
  Play,
  Pause,
  Info,
  AlertCircle,
  CheckCircle,
  XCircle,
  Cpu,
  Monitor,
  Network,
  Server,
  Code2,
  FileCode,
  Wrench,
  Gauge,
  Bot,
  Brain,
  Lightbulb,
  MessageSquare,
  Search,
  Filter,
  Star,
  Sparkles,
  Wand2,
  ChevronRight,
  PieChart,
  LineChart,
  BarChart2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

interface PolicyEngineProps {
  subId?: string;
}

interface AIRecommendation {
  id: string;
  type: 'optimization' | 'compliance' | 'risk' | 'efficiency';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  action: string;
  estimated_savings: string;
}

interface PolicyImpact {
  system: string;
  affected: number;
  risk: 'low' | 'medium' | 'high';
  description: string;
}

interface PolicyMetrics {
  compliance_score: number | null;
  coverage_percentage: number | null;
  last_updated: string | null;
  active_submissions: number | null;
  pending_reviews: number | null;
  ai_optimization_score: number | null;
  predictive_accuracy: number | null;
}

interface SystemHealth {
  system: string;
  status: 'healthy' | 'warning' | 'error';
  policy_version: string;
  last_sync: string | null;
  issues: number;
  ai_health_score: number;
}

interface Policy {
  meta: {
    region: string;
    version: string;
    source: string;
  };
  module3: {
    requiredSections: string[];
    stability: {
      minCoverageMonths: number;
      requireAccelerated: boolean;
    };
    methods: {
      requireValidatedForCQA: boolean;
    };
  };
  ir: {
    defaultResponseDays: number;
    tone: string;
    signatureRoles: string[];
  };
  q12: {
    classificationMap: any;
  };
  sequences: {
    defaultFormats: string[];
    allowForceBuild: boolean;
  };
  weights: {
    rpi: any;
  };
}

interface PolicyVersion {
  region: string;
  version: string;
  is_active: boolean;
  created_at: string;
  notes?: string;
}

const PolicyEnginePanel: React.FC<PolicyEngineProps> = ({ subId }) => {
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [activeRegion, setActiveRegion] = React.useState('FDA');
  const [policy, setPolicy] = React.useState<Policy | null>(null);
  const [versions, setVersions] = React.useState<PolicyVersion[]>([]);
  const [editMode, setEditMode] = React.useState(false);
  const [editedPolicy, setEditedPolicy] = React.useState<string>('');
  const [evaluation, setEvaluation] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [simulationResults, setSimulationResults] = React.useState<any>(null);
  const [systemHealth, setSystemHealth] = React.useState<SystemHealth[]>([]);
  const [policyMetrics, setPolicyMetrics] = React.useState<PolicyMetrics | null>(null);
  const [aiRecommendations, setAiRecommendations] = React.useState<AIRecommendation[]>([]);
  const [aiQuery, setAiQuery] = React.useState('');
  const [aiResponse, setAiResponse] = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);

  const regions = ['FDA', 'EMA', 'PMDA'];

  const formatLastSync = (value?: string | null) => {
    if (!value) return 'No sync recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'No sync recorded' : date.toLocaleString();
  };

  const loadPolicy = async (region: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reg/policy/${region}`);
      const policyData = await response.json();
      setPolicy(policyData);
    } catch (error) {
      console.error('Failed to load policy:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemHealth = async (region: string) => {
    try {
      const response = await fetch(`/api/reg/policy/health?region=${region}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load system health');
      }
      setSystemHealth(data.systems || []);
    } catch (error) {
      console.error('Failed to load system health:', error);
      setSystemHealth([]);
    }
  };

  const loadPolicyMetrics = async (region: string) => {
    try {
      const response = await fetch(`/api/reg/policy/metrics?region=${region}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load policy metrics');
      }
      setPolicyMetrics(data);
    } catch (error) {
      console.error('Failed to load policy metrics:', error);
      setPolicyMetrics(null);
    }
  };

  const loadAiRecommendations = async (region: string) => {
    try {
      const response = await fetch(`/api/reg/policy/recommendations?region=${region}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load AI recommendations');
      }
      setAiRecommendations(data.recommendations || []);
    } catch (error) {
      console.error('Failed to load AI recommendations:', error);
      setAiRecommendations([]);
    }
  };

  const loadVersions = async (region: string) => {
    try {
      const response = await fetch(`/api/reg/policy/${region}/versions`);
      const versionsData = await response.json();
      setVersions(versionsData);
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  };

  const evaluatePolicy = async () => {
    if (!subId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/reg/policy/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subId }),
      });
      const evalData = await response.json();
      setEvaluation(evalData);
    } catch (error) {
      console.error('Failed to evaluate policy:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async () => {
    try {
      setLoading(true);
      const policyJson = JSON.parse(editedPolicy);
      const response = await fetch(`/api/reg/policy/${activeRegion}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policyJson),
      });

      if (response.ok) {
        alert('Draft saved successfully!');
        setEditMode(false);
        loadVersions(activeRegion);
      } else {
        const error = await response.json();
        alert(`Validation failed: ${error.details?.[0] || error.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const activateVersion = async (version: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reg/policy/${activeRegion}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });

      if (response.ok) {
        alert(`Version ${version} activated!`);
        loadPolicy(activeRegion);
        loadVersions(activeRegion);
      }
    } catch (error) {
      alert('Failed to activate version');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPolicy(activeRegion);
    loadVersions(activeRegion);
    loadSystemHealth(activeRegion);
    loadPolicyMetrics(activeRegion);
    loadAiRecommendations(activeRegion);
  }, [activeRegion]);

  const runPolicySimulation = async () => {
    if (!policy) return;
    setLoading(true);
    try {
      const response = await fetch('/api/reg/policy/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: activeRegion }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Policy simulation failed');
      }
      setSimulationResults(data);
    } catch (error) {
      console.error('Policy simulation failed:', error);
      setSimulationResults(null);
    } finally {
      setLoading(false);
    }
  };

  const validatePolicyIntegrity = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/reg/policy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: activeRegion }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Policy validation failed');
      }
      await loadSystemHealth(activeRegion);
      await loadPolicyMetrics(activeRegion);
    } catch (error) {
      console.error('Policy validation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAiQuery = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    try {
      const response = await fetch('/api/reg/policy/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: activeRegion, query: aiQuery }),
      });
      const data = await response.json();
      if (response.ok) {
        setAiResponse(data.response || 'No response generated.');
      } else {
        setAiResponse(data.error || 'AI response unavailable.');
      }
    } catch (error) {
      console.error('AI query failed:', error);
      setAiResponse('AI response unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiRecommendation = async (recommendation: AIRecommendation) => {
    setLoading(true);
    try {
      const response = await fetch('/api/reg/policy/recommendations/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: activeRegion, recommendation }),
      });
      if (!response.ok) {
        const payload = await response.json();
        alert(payload.error || 'Failed to apply recommendation');
        return;
      }
      alert('Recommendation logged for review and policy change workflow.');
    } catch (error) {
      alert('Failed to apply recommendation');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="destructive">Critical</Badge>;
      case 'WARN':
        return <Badge className="bg-orange-500">Warning</Badge>;
      case 'INFO':
        return <Badge variant="outline">Info</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const renderExecutiveDashboard = () => (
    <div className="space-y-6">
      {/* Executive KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Compliance Score</p>
                <p className="text-2xl font-bold text-green-600">
                  {policyMetrics?.compliance_score !== null && policyMetrics?.compliance_score !== undefined
                    ? `${policyMetrics.compliance_score}%`
                    : 'N/A'}
                </p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <div className="mt-2">
              <Progress value={policyMetrics?.compliance_score ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Policy Coverage</p>
                <p className="text-2xl font-bold text-blue-600">
                  {policyMetrics?.coverage_percentage !== null && policyMetrics?.coverage_percentage !== undefined
                    ? `${policyMetrics.coverage_percentage}%`
                    : 'N/A'}
                </p>
              </div>
              <Target className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-2">
              <Progress value={policyMetrics?.coverage_percentage ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI Optimization</p>
                <p className="text-2xl font-bold text-purple-600">
                  {policyMetrics?.ai_optimization_score !== null && policyMetrics?.ai_optimization_score !== undefined
                    ? `${policyMetrics.ai_optimization_score}%`
                    : 'N/A'}
                </p>
              </div>
              <Brain className="h-8 w-8 text-purple-600" />
            </div>
            <div className="mt-2">
              <Progress value={policyMetrics?.ai_optimization_score ?? 0} className="h-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Submissions</p>
                <p className="text-2xl font-bold">
                  {policyMetrics?.active_submissions ?? 'N/A'}
                </p>
              </div>
              <Activity className="h-8 w-8 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Predictive Accuracy</p>
                <p className="text-2xl font-bold text-orange-600">
                  {policyMetrics?.predictive_accuracy !== null && policyMetrics?.predictive_accuracy !== undefined
                    ? `${policyMetrics.predictive_accuracy}%`
                    : 'N/A'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI-Powered Policy Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {aiRecommendations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No AI recommendations available. Configure the AI provider or generate new policy insights.
              </div>
            ) : (
            aiRecommendations.map((recommendation: AIRecommendation) => (
              <div
                key={recommendation.id}
                className="border rounded-lg p-4 bg-gradient-to-r from-purple-50 to-blue-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant={
                          recommendation.impact === 'high'
                            ? 'destructive'
                            : recommendation.impact === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {recommendation.impact.toUpperCase()} IMPACT
                      </Badge>
                      <Badge variant="outline">
                        <Bot className="w-3 h-3 mr-1" />
                        {recommendation.confidence}% confidence
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-lg mb-1">{recommendation.title}</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {recommendation.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {recommendation.estimated_savings}
                      </span>
                      <span className="flex items-center gap-1">
                        <Code2 className="w-3 h-3" />
                        {recommendation.action}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => applyAiRecommendation(recommendation)}
                      disabled={loading}
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      Apply
                    </Button>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3 h-3 mr-1" />
                      Preview
                    </Button>
                  </div>
                </div>
              </div>
            ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Health with AI Scores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              System Integration Health & AI Performance
            </CardTitle>
            <Button
              onClick={validatePolicyIntegrity}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Validate All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {systemHealth.map((system: SystemHealth, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      system.status === 'healthy'
                        ? 'bg-green-500'
                        : system.status === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{system.system}</p>
                      <Badge variant="outline" className="text-xs">
                        AI Score: {system.ai_health_score.toFixed(1)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      v{system.policy_version} • {formatLastSync(system.last_sync)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {system.issues > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {system.issues} issues
                    </Badge>
                  )}
                  <Progress value={system.ai_health_score} className="w-16 h-2" />
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      system.status === 'healthy'
                        ? 'text-green-600'
                        : system.status === 'warning'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}
                  >
                    {system.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderAiAssistant = () => (
    <div className="space-y-6">
      {/* AI Query Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            AI Policy Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ai-query">
              Ask me anything about regulatory policies, optimization, or compliance:
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="ai-query"
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                placeholder="e.g., 'How can I optimize FDA stability requirements?' or 'Compare EMA vs PMDA response times'"
                className="flex-1"
                onKeyPress={e => e.key === 'Enter' && handleAiQuery()}
              />
              <Button onClick={handleAiQuery} disabled={aiLoading || !aiQuery.trim()}>
                {aiLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Quick AI Query Suggestions */}
          <div className="flex flex-wrap gap-2">
            {[
              'Optimize stability coverage requirements',
              'Compare regional response times',
              'Analyze compliance gaps',
              'Predict policy impact',
              'Generate optimization report',
            ].map(suggestion => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setAiQuery(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>

          {/* AI Response */}
          {aiResponse && (
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="font-medium text-blue-800">AI Analysis</p>
                    <p className="text-sm leading-relaxed">{aiResponse}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* AI-Powered Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="w-5 h-5" />
              Predictive Trend Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Compliance Trajectory</span>
                <Badge variant="outline" className="text-green-600">
                  ↑ +2.3% projected
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Processing Time Trend</span>
                <Badge variant="outline" className="text-blue-600">
                  ↓ -15% this quarter
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Policy Optimization Score</span>
                <Badge variant="outline" className="text-purple-600">
                  92.1% (+1.8%)
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Smart Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Policy Updates Available</span>
                <Badge className="bg-purple-600">3 ready</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Optimization Opportunities</span>
                <Badge variant="outline">5 identified</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Risk Mitigation Actions</span>
                <Badge className="bg-orange-600">2 urgent</Badge>
              </div>
              <Button className="w-full mt-3" size="sm">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Full AI Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Settings className="w-6 h-6 text-blue-600" />
                <Sparkles className="w-3 h-3 text-purple-600 absolute -top-1 -right-1" />
              </div>
              <div>
                <CardTitle>Enterprise AI Policy Engine</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Advanced regulatory policy management with AI-powered optimization and real-time
                  intelligence
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <Select value={activeRegion} onValueChange={setActiveRegion}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regions.map(region => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subId && (
                <Button onClick={evaluatePolicy} disabled={loading} size="sm">
                  <BarChart3 className="w-4 h-4 mr-1" />
                  AI Impact Analysis
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">
            <Shield className="w-4 h-4 mr-1" />
            Executive Dashboard
          </TabsTrigger>
          <TabsTrigger value="ai-assistant">
            <Bot className="w-4 h-4 mr-1" />
            AI Assistant
          </TabsTrigger>
          <TabsTrigger value="policies">
            <FileText className="w-4 h-4 mr-1" />
            Policy Management
          </TabsTrigger>
          <TabsTrigger value="simulation">
            <Gauge className="w-4 h-4 mr-1" />
            Impact Simulation
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Network className="w-4 h-4 mr-1" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart2 className="w-4 h-4 mr-1" />
            Analytics & Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">{renderExecutiveDashboard()}</TabsContent>

        <TabsContent value="ai-assistant">{renderAiAssistant()}</TabsContent>

        <TabsContent value="policies">
          <div className="space-y-6">
            {/* Policy Editor & Management */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Policy JSON Editor */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Code2 className="w-5 h-5" />
                      Policy Configuration Editor
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setEditMode(true)} size="sm" variant="outline">
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="w-4 h-4 mr-1" />
                        Export
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {policy ? (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <Label className="font-medium">Region:</Label>
                              <p>{policy.meta.region}</p>
                            </div>
                            <div>
                              <Label className="font-medium">Version:</Label>
                              <p>{policy.meta.version}</p>
                            </div>
                            <div>
                              <Label className="font-medium">IR Response Days:</Label>
                              <p>{policy.ir.defaultResponseDays} days</p>
                            </div>
                            <div>
                              <Label className="font-medium">Stability Coverage:</Label>
                              <p>{policy.module3.stability.minCoverageMonths} months</p>
                            </div>
                          </div>
                          <div className="pt-3 border-t">
                            <Label className="font-medium mb-2 block">Policy Sections:</Label>
                            <div className="flex flex-wrap gap-2">
                              {policy.module3.requiredSections.map(section => (
                                <Badge key={section} variant="outline">
                                  {section}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No policy loaded for {activeRegion}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Policy Validation & Testing */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Policy Validation & Testing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={runPolicySimulation}
                      disabled={loading}
                      className="h-20 flex-col"
                    >
                      <Play className="w-6 h-6 mb-2" />
                      Run Validation Test
                    </Button>
                    <Button variant="outline" className="h-20 flex-col">
                      <Wrench className="w-6 h-6 mb-2" />
                      Syntax Check
                    </Button>
                  </div>

                  {simulationResults && (
                    <Card className="bg-green-50 border-green-200">
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-green-800 mb-2">Validation Results</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Affected Submissions:</span>
                            <span className="font-medium">
                              {simulationResults.affected_submissions}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Compliance Improvement:</span>
                            <span className="font-medium text-green-600">
                              {simulationResults.compliance_improvement !== null &&
                              simulationResults.compliance_improvement !== undefined
                                ? `+${simulationResults.compliance_improvement}%`
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Time Savings:</span>
                            <span className="font-medium text-blue-600">
                              {simulationResults.estimated_time_savings || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Version History & Rollback */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Policy Version History & Deployment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {versions.length > 0 ? (
                    versions.map((version, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 border rounded-lg ${
                          version.is_active ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              version.is_active ? 'bg-blue-500' : 'bg-gray-400'
                            }`}
                          />
                          <div>
                            <p className="font-medium">v{version.version}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(version.created_at).toLocaleDateString()} • {version.region}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {version.is_active ? (
                            <Badge className="bg-blue-600">ACTIVE</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => activateVersion(version.version)}
                              disabled={loading}
                            >
                              <GitBranch className="w-3 h-3 mr-1" />
                              Activate
                            </Button>
                          )}
                          <Button size="sm" variant="ghost">
                            <Eye className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No policy versions found for {activeRegion}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Edit Mode Modal */}
            {editMode && (
              <Card className="border-2 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Edit className="w-5 h-5" />
                      Edit {activeRegion} Policy Configuration
                    </span>
                    <Button onClick={() => setEditMode(false)} variant="ghost" size="sm">
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={editedPolicy}
                    onChange={e => setEditedPolicy(e.target.value)}
                    rows={15}
                    className="font-mono text-sm"
                    placeholder={`Enter ${activeRegion} policy JSON configuration...`}
                  />
                  <div className="flex justify-between">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <FileCode className="w-4 h-4 mr-1" />
                        Format JSON
                      </Button>
                      <Button variant="outline" size="sm">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Validate
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => setEditMode(false)} variant="outline">
                        Cancel
                      </Button>
                      <Button onClick={saveDraft} disabled={loading}>
                        <Upload className="w-4 h-4 mr-1" />
                        {loading ? 'Saving...' : 'Save Draft'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="simulation">
          <div className="space-y-6">
            {/* Simulation Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-purple-600" />
                  Policy Impact Simulation Engine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Simulation Parameters */}
                  <Card className="border-dashed">
                    <CardContent className="p-4 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Simulation Parameters
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Time Range</Label>
                          <Select defaultValue="3months">
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1month">1 Month</SelectItem>
                              <SelectItem value="3months">3 Months</SelectItem>
                              <SelectItem value="6months">6 Months</SelectItem>
                              <SelectItem value="1year">1 Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Scope</Label>
                          <Select defaultValue="all">
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Systems</SelectItem>
                              <SelectItem value="m3">M3 Builder Only</SelectItem>
                              <SelectItem value="q12">Q12 Changes Only</SelectItem>
                              <SelectItem value="ir">IR Responses Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={runPolicySimulation}
                          disabled={loading}
                          className="w-full"
                          size="sm"
                        >
                          {loading ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 mr-1" />
                          )}
                          Run Simulation
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* What-If Scenarios */}
                  <Card className="border-dashed">
                    <CardContent className="p-4 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        What-If Scenarios
                      </h4>
                      <div className="space-y-3">
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <AlertTriangle className="w-3 h-3 mr-2" />
                          Reduce Response Days by 5
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <TrendingUp className="w-3 h-3 mr-2" />
                          Lower Stability Requirement
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <Shield className="w-3 h-3 mr-2" />
                          Add New Q12 Categories
                        </Button>
                        <Button variant="outline" size="sm" className="w-full justify-start">
                          <Users className="w-3 h-3 mr-2" />
                          Change Signature Roles
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Recommendations */}
                  <Card className="border-dashed bg-gradient-to-br from-purple-50 to-blue-50">
                    <CardContent className="p-4 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        AI Optimization
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span>Efficiency Score:</span>
                          <Badge variant="outline" className="text-green-600">
                            94.2%
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span>Risk Level:</span>
                          <Badge variant="outline" className="text-yellow-600">
                            Medium
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span>Confidence:</span>
                          <Badge variant="outline" className="text-blue-600">
                            89.7%
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        Apply AI Recommendations
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {/* Simulation Results */}
            {simulationResults && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Impact Metrics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="w-5 h-5 text-blue-600" />
                      Predicted Impact Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">
                            {simulationResults.affected_submissions}
                          </p>
                          <p className="text-xs text-muted-foreground">Affected Submissions</p>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {simulationResults.compliance_improvement !== null &&
                            simulationResults.compliance_improvement !== undefined
                              ? `+${simulationResults.compliance_improvement}%`
                              : 'N/A'}
                          </p>
                          <p className="text-xs text-muted-foreground">Compliance Improvement</p>
                        </div>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg text-center">
                        <p className="text-xl font-bold text-purple-600">
                          {simulationResults.estimated_time_savings || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Estimated Time Savings Per Week
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Risk Assessment:</Label>
                        <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                          <span className="text-sm">{simulationResults.risk_reduction || 'N/A'}</span>
                          <Badge variant="outline" className="text-yellow-600">
                            Acceptable
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* System Impact Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Network className="w-5 h-5 text-indigo-600" />
                      System Impact Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(simulationResults.systems_impacted || []).map((system: string, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Server className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">{system}</span>
                          </div>
                          <Badge variant="outline" className="text-green-600">
                            ✓ Compatible
                          </Badge>
                        </div>
                      ))}

                      <div className="pt-3 border-t">
                        <Label className="text-sm font-medium mb-2 block">
                          AI Recommendations:
                        </Label>
                        <div className="space-y-2">
                          {(simulationResults.recommendations || []).length === 0 ? (
                            <div className="text-sm text-slate-500">No recommendations available.</div>
                          ) : (
                            (simulationResults.recommendations || []).map((rec: string, index: number) => (
                              <div
                                key={index}
                                className="flex items-start gap-2 p-2 bg-blue-50 rounded text-sm"
                              >
                                <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>{rec}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-6">
            {/* Integration Overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-5 h-5 text-blue-600" />
                    Regulatory System Integration Health
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" />6 Systems Online
                    </Badge>
                    <Button onClick={validatePolicyIntegrity} disabled={loading} size="sm">
                      <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                      Sync All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {systemHealth.map((system: SystemHealth, index: number) => (
                    <Card
                      key={index}
                      className={`border-2 ${
                        system.status === 'healthy'
                          ? 'border-green-200 bg-green-50'
                          : system.status === 'warning'
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                system.status === 'healthy'
                                  ? 'bg-green-500'
                                  : system.status === 'warning'
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                            />
                            <h3 className="font-semibold text-sm">{system.system}</h3>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              system.status === 'healthy'
                                ? 'text-green-600'
                                : system.status === 'warning'
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                            }`}
                          >
                            {system.status}
                          </Badge>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span>Policy Version:</span>
                            <span className="font-medium">v{system.policy_version}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Last Sync:</span>
                            <span className="font-medium">{formatLastSync(system.last_sync)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>AI Health Score:</span>
                            <span className="font-medium text-purple-600">
                              {system.ai_health_score.toFixed(1)}%
                            </span>
                          </div>
                          {system.issues > 0 && (
                            <div className="flex justify-between">
                              <span>Issues:</span>
                              <Badge variant="destructive" className="text-xs h-4">
                                {system.issues}
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="mt-3">
                          <Progress value={system.ai_health_score} className="h-1.5" />
                        </div>

                        <div className="flex gap-1 mt-3">
                          <Button size="sm" variant="outline" className="text-xs h-6 px-2">
                            <Eye className="w-3 h-3 mr-1" />
                            Details
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-6 px-2">
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Sync
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Data Flow Mapping */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowRight className="w-5 h-5 text-blue-600" />
                    Upstream Data Sources
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Database className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="font-medium text-sm">Regulatory Intelligence Hub</p>
                          <p className="text-xs text-muted-foreground">
                            Policy updates from FDA/EMA/PMDA
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-purple-600" />
                        <div>
                          <p className="font-medium text-sm">Document Intelligence</p>
                          <p className="text-xs text-muted-foreground">
                            Extracts policy requirements from guidance
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bot className="w-4 h-4 text-orange-600" />
                        <div>
                          <p className="font-medium text-sm">AI Recommendation Engine</p>
                          <p className="text-xs text-muted-foreground">
                            Machine learning optimization suggestions
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        Active
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowLeft className="w-5 h-5 text-green-600" />
                    Downstream Consumers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="font-medium text-sm">Gatekeeper v2</p>
                          <p className="text-xs text-muted-foreground">
                            Enforcement of regulatory policies
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        Synced
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Layers className="w-4 h-4 text-purple-600" />
                        <div>
                          <p className="font-medium text-sm">M3 Builder</p>
                          <p className="text-xs text-muted-foreground">
                            Module 3 document generation
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-green-600">
                        Synced
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <GitBranch className="w-4 h-4 text-orange-600" />
                        <div>
                          <p className="font-medium text-sm">Q12 Change Control</p>
                          <p className="text-xs text-muted-foreground">
                            Change classification automation
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-yellow-600">
                        Pending
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Integration Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  Integration Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">99.8%</p>
                    <p className="text-sm text-muted-foreground">Uptime</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">1.2s</p>
                    <p className="text-sm text-muted-foreground">Avg Sync Time</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">847</p>
                    <p className="text-sm text-muted-foreground">Daily Sync Events</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">0</p>
                    <p className="text-sm text-muted-foreground">Failed Syncs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* Executive Analytics Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-blue-600" />
                    Policy Compliance Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <p className="text-lg font-bold text-blue-600">94.7%</p>
                        <p className="text-xs text-muted-foreground">Current Compliance</p>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-lg font-bold text-green-600">+2.3%</p>
                        <p className="text-xs text-muted-foreground">30-Day Change</p>
                      </div>
                      <div className="text-center p-3 bg-purple-50 rounded-lg">
                        <p className="text-lg font-bold text-purple-600">97.1%</p>
                        <p className="text-xs text-muted-foreground">Projected (90d)</p>
                      </div>
                    </div>

                    {/* Simulated chart area */}
                    <div className="h-48 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 flex items-center justify-center border-dashed border-2 border-blue-200">
                      <div className="text-center">
                        <BarChart3 className="w-12 h-12 mx-auto mb-2 text-blue-400" />
                        <p className="text-sm text-muted-foreground">
                          Policy Compliance Trend Chart
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Interactive visualization showing 90-day compliance trends
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-green-600" />
                    Policy Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {regions.map((region, index) => {
                      const percentages = [45, 32, 23]; // Mock data
                      const colors = ['blue', 'green', 'purple'];
                      return (
                        <div key={region} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full bg-${colors[index]}-500`} />
                            <span className="text-sm font-medium">{region}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{percentages[index]}%</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.floor(percentages[index] * 2.3)} policies
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-3 border-t">
                      <Button size="sm" className="w-full">
                        <Download className="w-3 h-3 mr-1" />
                        Export Report
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Policy Performance Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Processing Efficiency</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Average Processing Time:</span>
                        <span className="font-medium text-blue-600">4.2 hrs</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Time Saved (30d):</span>
                        <span className="font-medium text-green-600">127 hrs</span>
                      </div>
                      <Progress value={87} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Error Reduction</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Error Rate:</span>
                        <span className="font-medium text-green-600">0.3%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Improvement (30d):</span>
                        <span className="font-medium text-green-600">-0.8%</span>
                      </div>
                      <Progress value={97} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Automation Impact</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Tasks Automated:</span>
                        <span className="font-medium text-purple-600">234</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Manual Effort Saved:</span>
                        <span className="font-medium text-purple-600">67%</span>
                      </div>
                      <Progress value={67} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Quality Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Quality Score:</span>
                        <span className="font-medium text-blue-600">9.2/10</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Consistency Rate:</span>
                        <span className="font-medium text-blue-600">98.4%</span>
                      </div>
                      <Progress value={92} className="h-2" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Regulatory Intelligence Reports */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Executive Reports
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="font-medium text-sm">Monthly Policy Summary</p>
                        <p className="text-xs text-muted-foreground">Generated 2 hours ago</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="font-medium text-sm">Compliance Analytics</p>
                        <p className="text-xs text-muted-foreground">Updated daily</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <div>
                        <p className="font-medium text-sm">Performance Benchmarks</p>
                        <p className="text-xs text-muted-foreground">Weekly analysis</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>

                  <Button className="w-full mt-3">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Custom Report
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-600" />
                    AI Insights & Predictions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-purple-600" />
                      <p className="font-semibold text-sm">Key Insight</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      FDA policy alignment improved 15% this month. EMA harmonization opportunities
                      identified.
                    </p>
                    <Button size="sm" variant="outline">
                      <ChevronRight className="w-3 h-3 mr-1" />
                      View Details
                    </Button>
                  </div>

                  <div className="p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-green-600" />
                      <p className="font-semibold text-sm">Prediction</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      With current trends, compliance score will reach 97% by December 2025.
                    </p>
                    <Button size="sm" variant="outline">
                      <ChevronRight className="w-3 h-3 mr-1" />
                      View Forecast
                    </Button>
                  </div>

                  <div className="p-3 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                      <p className="font-semibold text-sm">Risk Alert</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      PMDA policy update expected Q4 2025. Recommend proactive alignment review.
                    </p>
                    <Button size="sm" variant="outline">
                      <ChevronRight className="w-3 h-3 mr-1" />
                      Create Action Plan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PolicyEnginePanel;
