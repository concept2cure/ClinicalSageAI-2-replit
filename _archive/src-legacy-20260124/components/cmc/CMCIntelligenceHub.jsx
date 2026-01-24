import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/dialog';
import {
  Brain,
  BarChart3,
  Shield,
  Clock,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit,
  Download,
  Upload,
  Search,
  Filter,
  Microscope,
  TestTube,
  Activity,
  Clipboard,
  Settings,
  Database,
  FileCheck,
  TrendingUp,
  AlertCircle,
  Calendar,
  User,
  Eye,
  Trash2,
  Save,
  X,
  Package,
  Pill,
  ArrowRight,
  FileText,
  PlayCircle,
  Lightbulb,
  Zap,
  MessageSquare,
  ChartLine,
  Globe,
  Award,
  Fingerprint,
  Calculator,
  Gauge,
  RefreshCw,
  Scale,
  Thermometer,
  Timer,
  Container,
  HardDrive,
  Lock,
  PenTool,
  CopyIcon,
  Hash,
  Layers,
  GitBranch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// CMC Intelligence Hub - AI-Powered Regulatory Intelligence
const CMCIntelligenceHub = ({ organizationId = 7 }) => {
  const [activeTab, setActiveTab] = useState('ai-advisor');
  const [loading, setLoading] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const { toast } = useToast();

  // AI Regulatory Advisor
  const renderAIAdvisor = () => (
    <div className="space-y-6" data-testid="ai-advisor">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">AI Regulatory Advisor</h2>
          <p className="text-gray-600 mt-1">Get instant regulatory guidance powered by AI</p>
        </div>
        <Badge variant="secondary" className="bg-blue-100 text-blue-700">
          <Brain className="w-4 h-4 mr-1" />
          AI Powered
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Ask AI Advisor
            </CardTitle>
            <CardDescription>
              Ask questions about CMC requirements, regulatory pathways, or compliance guidance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ai-query">Your Question</Label>
                <Textarea
                  id="ai-query"
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  placeholder="e.g., What are the FDA requirements for analytical method validation for a new drug application?"
                  rows={3}
                />
              </div>

              <Button
                onClick={() => {
                  setLoading(true);
                  // Simulate AI response
                  setTimeout(() => {
                    setAiResponse(`Based on FDA guidance, analytical method validation for NDA submissions requires demonstration of the following parameters:

1. **Accuracy**: Recovery studies showing 98-102% recovery across concentration range
2. **Precision**: RSD ≤ 2.0% for repeatability and intermediate precision
3. **Specificity**: Demonstration of method's ability to measure analyte in presence of impurities
4. **Linearity**: Correlation coefficient (r) ≥ 0.999 across 80-120% of test concentration
5. **Range**: Typically 80-120% for assay methods
6. **Robustness**: Evaluation of critical method parameters

**ICH Q2(R1) Compliance Required**: All validation must follow ICH Q2(R1) guidelines and be documented in validation protocols and reports.

**Recommended Next Steps**:
- Develop validation protocol based on intended use
- Execute validation studies in GLP environment  
- Prepare comprehensive validation report
- Include method transfer data if applicable`);
                    setLoading(false);
                  }, 2000);
                }}
                disabled={!aiQuery.trim() || loading}
                className="w-full"
                data-testid="button-ask-ai"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Ask AI Advisor
                  </>
                )}
              </Button>

              {aiResponse && (
                <div className="p-4 border rounded-lg bg-blue-50">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-blue-600" />
                    <span className="font-medium text-blue-900">AI Regulatory Advisor</span>
                  </div>
                  <div className="whitespace-pre-line text-sm text-gray-800">{aiResponse}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Quick Guidance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  topic: 'Method Validation',
                  guidance: 'ICH Q2(R1) requirements for analytical methods',
                },
                { topic: 'Stability Testing', guidance: 'ICH Q1A guidelines for drug products' },
                { topic: 'Process Validation', guidance: 'FDA 3-stage lifecycle approach' },
                { topic: 'Impurities', guidance: 'ICH Q3A/Q3B limits and qualification' },
                { topic: 'Specifications', guidance: 'Setting appropriate acceptance criteria' },
              ].map((item, index) => (
                <div key={index} className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <h5 className="font-medium text-sm">{item.topic}</h5>
                  <p className="text-xs text-gray-600 mt-1">{item.guidance}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">1,247</p>
                <p className="text-sm text-gray-600">Guidance Documents</p>
                <Badge variant="default">FDA, EMA, ICH</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">98%</p>
                <p className="text-sm text-gray-600">Accuracy Rate</p>
                <Badge variant="secondary">AI Responses</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">3.2s</p>
                <p className="text-sm text-gray-600">Avg Response Time</p>
                <Badge variant="outline">Real-time</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-gray-600">Questions Answered</p>
                <Badge variant="default">This Month</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Predictive Analytics
  const renderPredictiveAnalytics = () => (
    <div className="space-y-6" data-testid="predictive-analytics">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Predictive Analytics</h2>
          <p className="text-gray-600 mt-1">
            AI-powered predictions for regulatory and manufacturing outcomes
          </p>
        </div>
        <Button variant="outline" data-testid="button-run-prediction">
          <BarChart3 className="w-4 h-4 mr-2" />
          Run Prediction
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartLine className="w-5 h-5" />
              Regulatory Success Prediction
            </CardTitle>
            <CardDescription>Predict approval likelihood based on submission data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  submission: 'IND-2024-015',
                  probability: 92,
                  factors: ['Complete CMC data', 'Strong preclinical'],
                },
                {
                  submission: 'NDA-2024-008',
                  probability: 87,
                  factors: ['Phase 3 success', 'Manufacturing ready'],
                },
                {
                  submission: 'ANDA-2024-012',
                  probability: 78,
                  factors: ['BE study complete', 'Minor CMC gaps'],
                },
              ].map((prediction, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="font-medium">{prediction.submission}</h5>
                      <div className="text-sm text-gray-600 mt-1">
                        Success Probability: {prediction.probability}%
                      </div>
                    </div>
                    <Badge
                      variant={
                        prediction.probability >= 85
                          ? 'default'
                          : prediction.probability >= 70
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {prediction.probability >= 85
                        ? 'High'
                        : prediction.probability >= 70
                          ? 'Medium'
                          : 'Low'}
                    </Badge>
                  </div>
                  <Progress value={prediction.probability} className="h-3 mb-2" />
                  <div className="text-xs text-gray-600">
                    Key factors: {prediction.factors.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Quality Risk Prediction
            </CardTitle>
            <CardDescription>Predict quality issues before they occur</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  batch: 'BT-2024-089',
                  risk: 15,
                  issue: 'Yield below target',
                  action: 'Process optimization',
                },
                {
                  batch: 'BT-2024-090',
                  risk: 8,
                  issue: 'Impurity spike risk',
                  action: 'Enhanced monitoring',
                },
                {
                  batch: 'BT-2024-091',
                  risk: 23,
                  issue: 'Dissolution variance',
                  action: 'Formulation review',
                },
              ].map((prediction, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="font-medium">{prediction.batch}</h5>
                      <div className="text-sm text-gray-600">Risk: {prediction.risk}%</div>
                    </div>
                    <Badge
                      variant={
                        prediction.risk >= 20
                          ? 'destructive'
                          : prediction.risk >= 10
                            ? 'secondary'
                            : 'default'
                      }
                    >
                      {prediction.risk >= 20
                        ? 'High Risk'
                        : prediction.risk >= 10
                          ? 'Medium Risk'
                          : 'Low Risk'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-800">{prediction.issue}</p>
                    <p className="text-gray-600 text-xs mt-1">Recommended: {prediction.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Market Intelligence
          </CardTitle>
          <CardDescription>Competitive landscape and market trend analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Competitive Submissions</h5>
              <p className="text-2xl font-bold text-blue-600">23</p>
              <p className="text-sm text-gray-600">Similar products in pipeline</p>
              <div className="mt-2">
                <Badge variant="outline">Therapeutic Area: Oncology</Badge>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Market Opportunity</h5>
              <p className="text-2xl font-bold text-green-600">$2.8B</p>
              <p className="text-sm text-gray-600">Estimated market size</p>
              <div className="mt-2">
                <Badge variant="default">Growth: 12% CAGR</Badge>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h5 className="font-medium mb-2">Regulatory Trends</h5>
              <p className="text-2xl font-bold text-orange-600">↑ 15%</p>
              <p className="text-sm text-gray-600">Approval time reduction</p>
              <div className="mt-2">
                <Badge variant="secondary">Fast Track Eligible</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Compliance Monitor
  const renderComplianceMonitor = () => (
    <div className="space-y-6" data-testid="compliance-monitor">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Compliance Monitor</h2>
          <p className="text-gray-600 mt-1">Real-time compliance tracking and alerts</p>
        </div>
        <Button variant="outline" data-testid="button-compliance-report">
          <FileCheck className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">96%</p>
                <p className="text-sm text-gray-600">Overall Compliance</p>
              </div>
              <Shield className="w-8 h-8 text-green-600" />
            </div>
            <Progress value={96} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">12</p>
                <p className="text-sm text-gray-600">Active Audits</p>
              </div>
              <Eye className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">8 internal, 4 external</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">5</p>
                <p className="text-sm text-gray-600">Open Findings</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">2 critical, 3 minor</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">28</p>
                <p className="text-sm text-gray-600">CAPA Actions</p>
              </div>
              <RefreshCw className="w-8 h-8 text-purple-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">24 on track, 4 overdue</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Critical Compliance Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  alert: 'GMP deviation - Batch BT-2024-087',
                  severity: 'Critical',
                  date: '2025-08-14',
                },
                {
                  alert: 'Method validation overdue - AM-2024-015',
                  severity: 'High',
                  date: '2025-08-13',
                },
                { alert: 'Stability data review pending', severity: 'Medium', date: '2025-08-12' },
              ].map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border-l-4 ${
                    alert.severity === 'Critical'
                      ? 'bg-red-50 border-red-200'
                      : alert.severity === 'High'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{alert.alert}</p>
                      <p className="text-xs text-gray-600">{alert.date}</p>
                    </div>
                    <Badge
                      variant={
                        alert.severity === 'Critical'
                          ? 'destructive'
                          : alert.severity === 'High'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Compliance Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { metric: 'GMP Compliance', current: 96, trend: '+2%', status: 'improving' },
                { metric: 'Audit Findings', current: 5, trend: '-3', status: 'improving' },
                { metric: 'CAPA Effectiveness', current: 89, trend: '+5%', status: 'improving' },
                { metric: 'Documentation Quality', current: 94, trend: '+1%', status: 'stable' },
              ].map((trend, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div>
                    <h5 className="font-medium text-sm">{trend.metric}</h5>
                    <p className="text-lg font-bold">
                      {trend.current}
                      {trend.metric.includes('Compliance') ||
                      trend.metric.includes('Quality') ||
                      trend.metric.includes('Effectiveness')
                        ? '%'
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={trend.status === 'improving' ? 'default' : 'secondary'}>
                      {trend.trend}
                    </Badge>
                    <p className="text-xs text-gray-600 mt-1">{trend.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CMC Intelligence Hub</h1>
          <p className="text-gray-600 mt-2">
            AI-powered regulatory intelligence and compliance monitoring
          </p>
        </div>

        {/* Intelligence Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="intelligence-tabs">
            <TabsTrigger value="ai-advisor" data-testid="tab-ai-advisor">
              AI Advisor
            </TabsTrigger>
            <TabsTrigger value="predictive-analytics" data-testid="tab-predictive">
              Predictive Analytics
            </TabsTrigger>
            <TabsTrigger value="compliance-monitor" data-testid="tab-compliance">
              Compliance Monitor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-advisor">{renderAIAdvisor()}</TabsContent>
          <TabsContent value="predictive-analytics">{renderPredictiveAnalytics()}</TabsContent>
          <TabsContent value="compliance-monitor">{renderComplianceMonitor()}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CMCIntelligenceHub;
