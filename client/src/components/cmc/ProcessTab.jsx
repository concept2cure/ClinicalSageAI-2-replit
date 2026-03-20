import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Area,
  AreaChart,
} from 'recharts';
import {
  ChevronRight,
  Zap,
  FileText,
  Play,
  Settings,
  RefreshCw,
  Edit,
  Download,
  CheckCircle,
  AlertTriangle,
  Activity,
  Target,
  Shield,
  Clock,
  TrendingUp,
  Database,
  FileCheck,
  Package,
  Factory,
  Gauge,
  BarChart4,
  Users,
  Calendar,
  Bell,
  Plus,
  Upload,
  Search,
  Filter,
  Eye,
  Trash2,
  Save,
  X,
  Check,
  Info,
  AlertCircle,
  CheckCircle2,
  Clipboard,
  TestTube,
  Microscope,
  FlaskConical,
  Building2,
  Wrench,
  Timer,
  PieChart,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  HelpCircle,
  GitBranch,
  Brain,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PortfolioDashboard from './PortfolioDashboard';

// Mock data for demonstration
const mockValidationData = {
  overview: {
    totalProcesses: 12,
    stage1: 3,
    stage2: 5,
    stage3: 4,
    complianceScore: 94,
  },
  cpps: [
    { id: 1, name: 'Compression Force', target: '10-15 kN', current: '12.5 kN', status: 'In Control' },
    { id: 2, name: 'Blend Time', target: '15±2 min', current: '14.8 min', status: 'In Control' },
    { id: 3, name: 'Granulation Temp', target: '60±5°C', current: '62°C', status: 'In Control' },
    { id: 4, name: 'Coating Weight', target: '3±0.5%', current: '3.2%', status: 'Warning' },
  ],
  cqas: [
    { id: 1, name: 'Assay', spec: '95-105%', result: '99.8%', status: 'Pass' },
    { id: 2, name: 'Dissolution', spec: 'Q=80% at 30min', result: '85%', status: 'Pass' },
    { id: 3, name: 'Impurities', spec: '<0.5%', result: '0.3%', status: 'Pass' },
    { id: 4, name: 'Water Content', spec: '<3%', result: '2.1%', status: 'Pass' },
  ],
  ppqBatches: [
    { id: 'PPQ-001', date: '2025-01-15', status: 'Completed', cpk: 1.45, yield: '98.5%' },
    { id: 'PPQ-002', date: '2025-01-18', status: 'Completed', cpk: 1.52, yield: '99.1%' },
    { id: 'PPQ-003', date: '2025-01-21', status: 'In Progress', cpk: '--', yield: '--' },
  ],
  equipment: [
    { id: 1, name: 'Tablet Press X200', iq: 'Complete', oq: 'Complete', pq: 'Complete', nextCal: '2025-03-15' },
    { id: 2, name: 'Blender V50', iq: 'Complete', oq: 'Complete', pq: 'In Progress', nextCal: '2025-02-28' },
    { id: 3, name: 'Coater C100', iq: 'Complete', oq: 'In Progress', pq: 'Pending', nextCal: '2025-04-10' },
  ],
};

// Process control chart data
const controlChartData = [
  { batch: 'B001', value: 99.2, ucl: 105, lcl: 95, target: 100 },
  { batch: 'B002', value: 100.1, ucl: 105, lcl: 95, target: 100 },
  { batch: 'B003', value: 98.7, ucl: 105, lcl: 95, target: 100 },
  { batch: 'B004', value: 101.3, ucl: 105, lcl: 95, target: 100 },
  { batch: 'B005', value: 99.8, ucl: 105, lcl: 95, target: 100 },
  { batch: 'B006', value: 100.5, ucl: 105, lcl: 95, target: 100 },
];

// FMEA Risk Matrix data
const fmeaData = [
  { step: 'Blending', risk: 'Non-uniform blend', severity: 8, occurrence: 3, detection: 4, rpn: 96 },
  { step: 'Compression', risk: 'Weight variation', severity: 7, occurrence: 4, detection: 3, rpn: 84 },
  { step: 'Coating', risk: 'Color variation', severity: 4, occurrence: 5, detection: 5, rpn: 100 },
  { step: 'Packaging', risk: 'Wrong label', severity: 9, occurrence: 2, detection: 2, rpn: 36 },
];

const ProcessTab = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [showProtocolDialog, setShowProtocolDialog] = useState(false);
  const [showFMEADialog, setShowFMEADialog] = useState(false);
  const [showDoEDialog, setShowDoEDialog] = useState(false);
  const [showEquipmentDialog, setShowEquipmentDialog] = useState(false);
  const [validationData, setValidationData] = useState(mockValidationData);
  const [loading, setLoading] = useState(false);
  const [showCriticalPathView, setShowCriticalPathView] = useState(false);
  const { toast } = useToast();

  // Function to handle generating PPQ protocol
  const handleGenerateProtocol = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({
        title: '✅ PPQ Protocol Generated',
        description: 'Process Performance Qualification protocol has been generated successfully.',
      });
      setShowProtocolDialog(false);
    }, 2000);
  };

  // Function to handle FMEA analysis
  const handleFMEAAnalysis = () => {
    toast({
      title: '🔍 FMEA Analysis Started',
      description: 'Risk assessment matrix is being calculated for all process steps.',
    });
    setShowFMEADialog(false);
  };

  // Function to handle DoE execution
  const handleDoEExecution = () => {
    toast({
      title: '🧪 DoE Execution Initiated',
      description: 'Design of Experiments study has been scheduled for execution.',
    });
    setShowDoEDialog(false);
  };

  // Function to handle equipment qualification
  const handleEquipmentQualification = (type) => {
    toast({
      title: `🔧 ${type} Qualification Started`,
      description: `${type} protocol has been initiated for the selected equipment.`,
    });
    setShowEquipmentDialog(false);
  };

  // Process Validation Dashboard Component
  const ProcessValidationDashboard = () => (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Stage 1: Design</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{validationData.overview.stage1}</div>
            <p className="text-xs text-blue-600 mt-1">Active processes</p>
            <Button 
              size="sm" 
              variant="ghost" 
              className="mt-2 w-full text-blue-700 hover:bg-blue-200"
              onClick={() => {
                setActiveTab('stage1');
                toast({ title: '📋 Navigating to Process Design', description: 'Loading Stage 1 validation data...' });
              }}
              data-testid="button-view-stage1"
            >
              View Details <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">Stage 2: PPQ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{validationData.overview.stage2}</div>
            <p className="text-xs text-purple-600 mt-1">In qualification</p>
            <Button 
              size="sm" 
              variant="ghost" 
              className="mt-2 w-full text-purple-700 hover:bg-purple-200"
              onClick={() => {
                setActiveTab('stage2');
                toast({ title: '🔬 Navigating to PPQ', description: 'Loading Performance Qualification data...' });
              }}
              data-testid="button-view-stage2"
            >
              View Details <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Stage 3: CPV</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{validationData.overview.stage3}</div>
            <p className="text-xs text-green-600 mt-1">Monitoring</p>
            <Button 
              size="sm" 
              variant="ghost" 
              className="mt-2 w-full text-green-700 hover:bg-green-200"
              onClick={() => {
                setActiveTab('stage3');
                toast({ title: '📊 Navigating to CPV', description: 'Loading Continued Process Verification data...' });
              }}
              data-testid="button-view-stage3"
            >
              View Details <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Compliance Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{validationData.overview.complianceScore}%</div>
            <Progress value={validationData.overview.complianceScore} className="mt-2" />
            <p className="text-xs text-amber-600 mt-1">FDA/ICH compliant</p>
          </CardContent>
        </Card>
      </div>

      {/* CPP and CQA Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                Critical Process Parameters (CPP)
              </span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => toast({ title: '📈 CPP Analysis', description: 'Generating CPP trend analysis report...' })}
                data-testid="button-cpp-analysis"
              >
                <BarChart4 className="h-3 w-3 mr-1" /> Analysis
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {validationData.cpps.map(cpp => (
                <div key={cpp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{cpp.name}</div>
                    <div className="text-xs text-gray-600">Target: {cpp.target}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{cpp.current}</div>
                    <Badge 
                      variant={cpp.status === 'In Control' ? 'default' : 'secondary'}
                      className="text-xs mt-1"
                    >
                      {cpp.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                Critical Quality Attributes (CQA)
              </span>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => toast({ title: '📊 CQA Report', description: 'Generating CQA compliance report...' })}
                data-testid="button-cqa-report"
              >
                <FileText className="h-3 w-3 mr-1" /> Report
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {validationData.cqas.map(cqa => (
                <div key={cqa.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{cqa.name}</div>
                    <div className="text-xs text-gray-600">Spec: {cqa.spec}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{cqa.result}</div>
                    <Badge 
                      variant={cqa.status === 'Pass' ? 'default' : 'destructive'}
                      className="text-xs mt-1"
                    >
                      {cqa.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Process Control Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-600" />
              Process Control Chart
            </span>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => toast({ title: '🎯 Control Limits Updated', description: 'Statistical control limits recalculated based on recent data.' })}
                data-testid="button-update-limits"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Update Limits
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => toast({ title: '📥 Chart Exported', description: 'Control chart saved as PDF.' })}
                data-testid="button-export-chart"
              >
                <Download className="h-3 w-3 mr-1" /> Export
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={controlChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="batch" />
              <YAxis domain={[90, 110]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#6a9bcc" name="Measured Value" strokeWidth={2} />
              <Line type="monotone" dataKey="ucl" stroke="#ff0000" name="UCL" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="lcl" stroke="#ff0000" name="LCL" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="target" stroke="#00ff00" name="Target" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  // Stage 1: Process Design Component
  const Stage1ProcessDesign = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Clipboard className="h-6 w-6 text-blue-600" />
          Stage 1: Process Design
        </h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowFMEADialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="button-new-fmea"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            New FMEA
          </Button>
          <Button 
            onClick={() => setShowDoEDialog(true)}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-new-doe"
          >
            <TestTube className="h-4 w-4 mr-2" />
            New DoE
          </Button>
        </div>
      </div>

      {/* Risk Assessment Matrix (FMEA) */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Assessment Matrix (FMEA)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process Step</TableHead>
                <TableHead>Potential Risk</TableHead>
                <TableHead className="text-center">Severity</TableHead>
                <TableHead className="text-center">Occurrence</TableHead>
                <TableHead className="text-center">Detection</TableHead>
                <TableHead className="text-center">RPN</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fmeaData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.step}</TableCell>
                  <TableCell>{item.risk}</TableCell>
                  <TableCell className="text-center">{item.severity}</TableCell>
                  <TableCell className="text-center">{item.occurrence}</TableCell>
                  <TableCell className="text-center">{item.detection}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={item.rpn > 80 ? 'destructive' : 'secondary'}>
                      {item.rpn}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => toast({ title: '✏️ Edit Risk', description: `Editing risk assessment for ${item.step}` })}
                      data-testid={`button-edit-risk-${index}`}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Design of Experiments (DoE) Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Design of Experiments (DoE) Results</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => toast({ title: '📊 DoE Analysis', description: 'Generating statistical analysis of DoE results...' })}
              data-testid="button-doe-analysis"
            >
              <BarChart4 className="h-3 w-3 mr-1" /> Analyze
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Significant Factors</h4>
              <div className="space-y-1">
                <div className="flex justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm">Compression Force</span>
                  <Badge className="text-xs">p=0.002</Badge>
                </div>
                <div className="flex justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm">Blend Time</span>
                  <Badge className="text-xs">p=0.015</Badge>
                </div>
                <div className="flex justify-between p-2 bg-yellow-50 rounded">
                  <span className="text-sm">Granulation Temp</span>
                  <Badge variant="secondary" className="text-xs">p=0.082</Badge>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Optimal Settings</h4>
              <div className="space-y-1">
                <div className="flex justify-between p-2 bg-blue-50 rounded">
                  <span className="text-sm">Compression Force</span>
                  <span className="text-sm font-medium">12.5 kN</span>
                </div>
                <div className="flex justify-between p-2 bg-blue-50 rounded">
                  <span className="text-sm">Blend Time</span>
                  <span className="text-sm font-medium">15 min</span>
                </div>
                <div className="flex justify-between p-2 bg-blue-50 rounded">
                  <span className="text-sm">Granulation Temp</span>
                  <span className="text-sm font-medium">60°C</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Process Parameter Ranges */}
      <Card>
        <CardHeader>
          <CardTitle>Process Parameter Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Parameter Name</Label>
                <Input placeholder="e.g., Compression Force" />
              </div>
              <div>
                <Label>Operating Range</Label>
                <Input placeholder="e.g., 10-15 kN" />
              </div>
              <div>
                <Label>Control Strategy</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ipc">In-Process Control</SelectItem>
                    <SelectItem value="pat">PAT Monitoring</SelectItem>
                    <SelectItem value="manual">Manual Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              onClick={() => toast({ title: '✅ Parameter Added', description: 'Process parameter range has been defined.' })}
              data-testid="button-add-parameter"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Parameter
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Stage 2: PPQ Component
  const Stage2PPQ = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-purple-600" />
          Stage 2: Process Performance Qualification (PPQ)
        </h2>
        <Button 
          onClick={() => setShowProtocolDialog(true)}
          className="bg-purple-600 hover:bg-purple-700"
          data-testid="button-generate-protocol"
        >
          <FileText className="h-4 w-4 mr-2" />
          Generate Protocol
        </Button>
      </div>

      {/* PPQ Batch Tracking */}
      <Card>
        <CardHeader>
          <CardTitle>PPQ Batch Execution Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cpk Value</TableHead>
                <TableHead>Yield</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationData.ppqBatches.map(batch => (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.id}</TableCell>
                  <TableCell>{batch.date}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={batch.status === 'Completed' ? 'default' : 'secondary'}
                    >
                      {batch.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={batch.cpk >= 1.33 ? 'default' : 'destructive'}>
                      {batch.cpk}
                    </Badge>
                  </TableCell>
                  <TableCell>{batch.yield}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => toast({ title: '👁️ View Details', description: `Loading batch ${batch.id} details...` })}
                        data-testid={`button-view-batch-${batch.id}`}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => toast({ title: '📄 Generate Report', description: `Generating report for ${batch.id}...` })}
                        data-testid={`button-report-batch-${batch.id}`}
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Process Capability Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Process Capability Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="bg-blue-50">
              <CardContent className="p-4">
                <div className="text-sm text-blue-600">Cp Index</div>
                <div className="text-2xl font-bold text-blue-900">1.67</div>
                <p className="text-xs text-blue-600 mt-1">Process capability</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-4">
                <div className="text-sm text-green-600">Cpk Index</div>
                <div className="text-2xl font-bold text-green-900">1.45</div>
                <p className="text-xs text-green-600 mt-1">Process performance</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="p-4">
                <div className="text-sm text-purple-600">Ppk Index</div>
                <div className="text-2xl font-bold text-purple-900">1.38</div>
                <p className="text-xs text-purple-600 mt-1">Overall performance</p>
              </CardContent>
            </Card>
          </div>

          {/* Statistical Process Control Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name="Sample" />
              <YAxis dataKey="y" name="Value" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter
                name="Process Data"
                data={[
                  { x: 1, y: 99.2 },
                  { x: 2, y: 100.1 },
                  { x: 3, y: 98.7 },
                  { x: 4, y: 101.3 },
                  { x: 5, y: 99.8 },
                  { x: 6, y: 100.5 },
                  { x: 7, y: 99.6 },
                  { x: 8, y: 100.2 },
                ]}
                fill="#6a9bcc"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* In-Process Control Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>In-Process Control (IPC) Data</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => toast({ title: '📊 IPC Trend Analysis', description: 'Analyzing in-process control trends...' })}
              data-testid="button-ipc-analysis"
            >
              <TrendingUp className="h-3 w-3 mr-1" /> Trend Analysis
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-sm font-medium text-gray-600">
              <div>Test Point</div>
              <div>Parameter</div>
              <div>Result</div>
              <div>Status</div>
            </div>
            {[
              { point: 'Blending', param: 'Uniformity', result: '98.5% RSD<2%', status: 'Pass' },
              { point: 'Compression', param: 'Weight', result: '250±5mg', status: 'Pass' },
              { point: 'Compression', param: 'Hardness', result: '10.5 kN', status: 'Pass' },
              { point: 'Coating', param: 'Weight Gain', result: '3.1%', status: 'Pass' },
            ].map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 p-2 bg-gray-50 rounded">
                <div className="text-sm">{item.point}</div>
                <div className="text-sm">{item.param}</div>
                <div className="text-sm font-medium">{item.result}</div>
                <Badge variant="default" className="text-xs">{item.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Stage 3: CPV Component
  const Stage3CPV = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-green-600" />
          Stage 3: Continued Process Verification (CPV)
        </h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => toast({ title: '📈 APR Generated', description: 'Annual Product Review report has been generated.' })}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-generate-apr"
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate APR
          </Button>
          <Button 
            variant="outline"
            onClick={() => toast({ title: '🔔 Alert Settings', description: 'Process drift alert thresholds updated.' })}
            data-testid="button-alert-settings"
          >
            <Bell className="h-4 w-4 mr-2" />
            Alert Settings
          </Button>
        </div>
      </div>

      {/* Real-time Process Monitoring Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-r from-green-50 to-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Batches Monitored</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">247</div>
            <p className="text-xs text-gray-600">Last 12 months</p>
            <Progress value={85} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-yellow-50 to-yellow-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">OOS Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-gray-600">0.012% rate</p>
            <Badge variant="secondary" className="mt-2">Low Risk</Badge>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-blue-50 to-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Process Capability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1.48</div>
            <p className="text-xs text-gray-600">Cpk (6-month avg)</p>
            <Badge className="mt-2">Capable</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Control Charts */}
      <Card>
        <CardHeader>
          <CardTitle>Control Charts</CardTitle>
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">X-bar Chart</Badge>
            <Badge variant="outline">R Chart</Badge>
            <Badge variant="outline">CUSUM</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="xbar">
            <TabsList>
              <TabsTrigger value="xbar">X-bar Chart</TabsTrigger>
              <TabsTrigger value="rchart">R Chart</TabsTrigger>
              <TabsTrigger value="cusum">CUSUM</TabsTrigger>
            </TabsList>
            <TabsContent value="xbar">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={controlChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="batch" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#6a9bcc" strokeWidth={2} />
                  <Line type="monotone" dataKey="ucl" stroke="#ff0000" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="lcl" stroke="#ff0000" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="rchart">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={controlChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="batch" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#92a87a" fill="#92a87a" />
                </AreaChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="cusum">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={controlChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="batch" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#ffc658" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Process Trend Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Process Trend Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Trend Alert:</strong> Slight upward drift detected in compression force parameter. 
                Current mean: 12.8 kN (Target: 12.5±0.5 kN)
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Analysis Period</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Last 30 days" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="1y">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Parameter</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="All parameters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All parameters</SelectItem>
                    <SelectItem value="compression">Compression Force</SelectItem>
                    <SelectItem value="blend">Blend Time</SelectItem>
                    <SelectItem value="temp">Temperature</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button 
              onClick={() => toast({ title: '📊 Analysis Complete', description: 'Process trend analysis report generated.' })}
              className="w-full"
              data-testid="button-run-analysis"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Run Trend Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Equipment Qualification Component
  const EquipmentQualification = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Wrench className="h-6 w-6 text-orange-600" />
          Equipment Qualification
        </h2>
        <Button 
          onClick={() => setShowEquipmentDialog(true)}
          className="bg-orange-600 hover:bg-orange-700"
          data-testid="button-new-qualification"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Qualification
        </Button>
      </div>

      {/* Equipment Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">IQ Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">12/12</div>
            <Progress value={100} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-700">OQ Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-900">10/12</div>
            <Progress value={83} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-700">PQ Complete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">8/12</div>
            <Progress value={67} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Equipment Qualification Table */}
      <Card>
        <CardHeader>
          <CardTitle>Equipment Qualification Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment Name</TableHead>
                <TableHead className="text-center">IQ</TableHead>
                <TableHead className="text-center">OQ</TableHead>
                <TableHead className="text-center">PQ</TableHead>
                <TableHead>Next Calibration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validationData.equipment.map(equip => (
                <TableRow key={equip.id}>
                  <TableCell className="font-medium">{equip.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={equip.iq === 'Complete' ? 'default' : 'secondary'}>
                      {equip.iq}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={equip.oq === 'Complete' ? 'default' : 'secondary'}>
                      {equip.oq}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={equip.pq === 'Complete' ? 'default' : equip.pq === 'In Progress' ? 'secondary' : 'outline'}>
                      {equip.pq}
                    </Badge>
                  </TableCell>
                  <TableCell>{equip.nextCal}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => toast({ title: '📋 View Protocol', description: `Loading qualification protocol for ${equip.name}...` })}
                        data-testid={`button-view-protocol-${equip.id}`}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => toast({ title: '📅 Schedule Calibration', description: `Calibration scheduled for ${equip.name}` })}
                        data-testid={`button-schedule-cal-${equip.id}`}
                      >
                        <Calendar className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preventive Maintenance Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Preventive Maintenance Schedule</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => toast({ title: '📅 Schedule Updated', description: 'Preventive maintenance schedule has been updated.' })}
              data-testid="button-update-schedule"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Update Schedule
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { equip: 'Tablet Press X200', task: 'Monthly cleaning', due: '2025-02-01', status: 'Scheduled' },
              { equip: 'Blender V50', task: 'Quarterly inspection', due: '2025-03-15', status: 'Scheduled' },
              { equip: 'Coater C100', task: 'Annual overhaul', due: '2025-06-01', status: 'Planning' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <div className="font-medium text-sm">{item.equip}</div>
                  <div className="text-xs text-gray-600">{item.task}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">{item.due}</div>
                  <Badge variant="outline" className="text-xs mt-1">{item.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Process Analytics Component
  const ProcessAnalytics = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <PieChart className="h-6 w-6 text-indigo-600" />
          Process Analytics
        </h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => toast({ title: '📊 Report Generated', description: 'Comprehensive analytics report has been generated.' })}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="button-generate-analytics"
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
        </div>
      </div>

      {/* Process Capability Indices */}
      <Card>
        <CardHeader>
          <CardTitle>Process Capability Indices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Cp</div>
                <div className="text-2xl font-bold">1.67</div>
                <div className="text-xs text-green-600">▲ 5%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Cpk</div>
                <div className="text-2xl font-bold">1.45</div>
                <div className="text-xs text-green-600">▲ 3%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Pp</div>
                <div className="text-2xl font-bold">1.58</div>
                <div className="text-xs text-red-600">▼ 2%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-600">Ppk</div>
                <div className="text-2xl font-bold">1.38</div>
                <div className="text-xs text-gray-600">— 0%</div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Multivariate Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Multivariate Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={[
              { subject: 'Compression', A: 85, B: 90, fullMark: 100 },
              { subject: 'Blending', A: 92, B: 88, fullMark: 100 },
              { subject: 'Granulation', A: 78, B: 85, fullMark: 100 },
              { subject: 'Coating', A: 88, B: 82, fullMark: 100 },
              { subject: 'Packaging', A: 95, B: 92, fullMark: 100 },
            ]}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar name="Current" dataKey="A" stroke="#6a9bcc" fill="#6a9bcc" fillOpacity={0.6} />
              <Radar name="Target" dataKey="B" stroke="#92a87a" fill="#92a87a" fillOpacity={0.6} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Process Comparison Studies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Process Comparison Studies</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => toast({ title: '🔄 Comparison Updated', description: 'Process comparison analysis refreshed with latest data.' })}
              data-testid="button-refresh-comparison"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-center">Site A</TableHead>
                <TableHead className="text-center">Site B</TableHead>
                <TableHead className="text-center">Site C</TableHead>
                <TableHead className="text-center">Statistical Significance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Average Yield</TableCell>
                <TableCell className="text-center">98.5%</TableCell>
                <TableCell className="text-center">97.8%</TableCell>
                <TableCell className="text-center">99.1%</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">p=0.082</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Cpk Value</TableCell>
                <TableCell className="text-center">1.45</TableCell>
                <TableCell className="text-center">1.38</TableCell>
                <TableCell className="text-center">1.52</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">p=0.045</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>OOS Rate</TableCell>
                <TableCell className="text-center">0.5%</TableCell>
                <TableCell className="text-center">0.8%</TableCell>
                <TableCell className="text-center">0.3%</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">p=0.021</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Technology Transfer Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Technology Transfer Documentation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-medium text-sm">Tech Transfer Protocol v2.1</div>
                  <div className="text-xs text-gray-600">Updated: 2025-01-15</div>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => toast({ title: '📄 Document Opened', description: 'Technology transfer protocol opened in new window.' })}
                data-testid="button-open-protocol"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium text-sm">Site Qualification Report</div>
                  <div className="text-xs text-gray-600">Approved: 2025-01-20</div>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => toast({ title: '📄 Report Downloaded', description: 'Site qualification report downloaded successfully.' })}
                data-testid="button-download-report"
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <Gauge className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="critical-path" data-testid="tab-critical-path">
            <Target className="h-4 w-4 mr-2" />
            Critical Path
          </TabsTrigger>
          <TabsTrigger value="stage1" data-testid="tab-stage1">
            <Clipboard className="h-4 w-4 mr-2" />
            Stage 1
          </TabsTrigger>
          <TabsTrigger value="stage2" data-testid="tab-stage2">
            <FlaskConical className="h-4 w-4 mr-2" />
            Stage 2
          </TabsTrigger>
          <TabsTrigger value="stage3" data-testid="tab-stage3">
            <Activity className="h-4 w-4 mr-2" />
            Stage 3
          </TabsTrigger>
          <TabsTrigger value="equipment" data-testid="tab-equipment">
            <Wrench className="h-4 w-4 mr-2" />
            Equipment
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <PieChart className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <ProcessValidationDashboard />
        </TabsContent>

        <TabsContent value="critical-path">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="h-5 w-5 mr-2" />
                Enhanced Critical Path Analysis & Dependency Mapping
              </CardTitle>
              <CardDescription>
                AI-powered critical path identification, dependency mapping, and real-time bottleneck analysis for process validation workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Critical Path Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">28 days</div>
                    <p className="text-sm text-blue-700">Critical Path Duration</p>
                    <Badge variant="outline" className="mt-1 bg-blue-100 text-blue-800 border-blue-300">
                      <GitBranch className="w-3 h-3 mr-1" />
                      Optimized Path
                    </Badge>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">3</div>
                    <p className="text-sm text-orange-700">Active Bottlenecks</p>
                    <Button size="sm" variant="outline" className="mt-1 border-orange-300 text-orange-700 hover:bg-orange-50" data-testid="button-resolve-bottlenecks">
                      <Zap className="w-3 h-3 mr-1" />
                      Auto-Resolve
                    </Button>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">12</div>
                    <p className="text-sm text-green-700">Dependencies Mapped</p>
                    <Badge variant="default" className="mt-1 bg-green-100 text-green-800">
                      All Tracked
                    </Badge>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">94%</div>
                    <p className="text-sm text-purple-700">On-time Probability</p>
                    <Badge variant="outline" className="mt-1 bg-purple-100 text-purple-700">
                      AI Predicted
                    </Badge>
                  </div>
                </div>

                {/* Dependency Mapping & Bottleneck Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <GitBranch className="w-5 h-5" />
                        Process Dependencies
                      </CardTitle>
                      <CardDescription>Real-time dependency tracking and impact analysis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {[
                          {
                            process: 'Stage 1: Process Design',
                            depends_on: 'Equipment Qualification',
                            status: 'completed',
                            impact: 'None - on track',
                            completion: 100
                          },
                          {
                            process: 'Stage 2: Process Qualification',
                            depends_on: 'Stage 1 + Method Validation',
                            status: 'in_progress',
                            impact: 'Method validation 2 days behind',
                            completion: 65
                          },
                          {
                            process: 'Stage 3: Continued Verification',
                            depends_on: 'Stage 2 + Initial Batches',
                            status: 'blocked',
                            impact: 'Waiting for Stage 2 completion',
                            completion: 0
                          },
                          {
                            process: 'Tech Transfer',
                            depends_on: 'Stage 2 + Documentation',
                            status: 'at_risk',
                            impact: 'Documentation review delayed',
                            completion: 25
                          }
                        ].map((dep, index) => (
                          <div key={index} className={`p-4 border rounded-lg ${
                            dep.status === 'completed' ? 'bg-green-50 border-green-200' :
                            dep.status === 'in_progress' ? 'bg-blue-50 border-blue-200' :
                            dep.status === 'blocked' ? 'bg-red-50 border-red-200' :
                            'bg-yellow-50 border-yellow-200'
                          }`}>
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <h5 className="font-medium text-sm">{dep.process}</h5>
                                <p className="text-xs text-gray-600 mt-1">Depends on: {dep.depends_on}</p>
                                <p className={`text-xs mt-1 ${
                                  dep.status === 'completed' ? 'text-green-600' :
                                  dep.status === 'blocked' ? 'text-red-600' : 'text-yellow-600'
                                }`}>
                                  Impact: {dep.impact}
                                </p>
                              </div>
                              <Badge variant={
                                dep.status === 'completed' ? 'default' :
                                dep.status === 'in_progress' ? 'secondary' :
                                dep.status === 'blocked' ? 'destructive' : 'outline'
                              } className="text-xs">
                                {dep.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span>Progress</span>
                                <span>{dep.completion}%</span>
                              </div>
                              <Progress value={dep.completion} className="h-2" />
                            </div>
                            {dep.status === 'blocked' && (
                              <Button size="sm" variant="outline" className="mt-2 w-full border-red-300 text-red-700 hover:bg-red-50">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Resolve Dependency
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Bottleneck Detection
                      </CardTitle>
                      <CardDescription>AI-powered bottleneck identification and resolution recommendations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {[
                          {
                            bottleneck: 'Method Validation Review',
                            severity: 'high',
                            delay: '3-5 days',
                            cause: 'Reviewer backlog in analytical department',
                            solution: 'Escalate to backup reviewer or external consultant',
                            confidence: 85
                          },
                          {
                            bottleneck: 'Equipment Maintenance Window',
                            severity: 'medium',
                            delay: '1-2 days',
                            cause: 'Scheduled maintenance overlap with testing',
                            solution: 'Reschedule maintenance or use backup equipment',
                            confidence: 92
                          },
                          {
                            bottleneck: 'Raw Material Supply',
                            severity: 'low',
                            delay: '0-1 days',
                            cause: 'Supplier lead time variance',
                            solution: 'Pre-order critical materials for next batch',
                            confidence: 78
                          }
                        ].map((bottleneck, index) => (
                          <div key={index} className={`p-4 border rounded-lg ${
                            bottleneck.severity === 'high' ? 'bg-red-50 border-red-200' :
                            bottleneck.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-gray-50 border-gray-200'
                          }`}>
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <h5 className="font-medium text-sm">{bottleneck.bottleneck}</h5>
                                <p className="text-xs text-gray-600 mt-1">Delay Risk: {bottleneck.delay}</p>
                                <p className="text-xs text-gray-600">Root Cause: {bottleneck.cause}</p>
                              </div>
                              <Badge variant={
                                bottleneck.severity === 'high' ? 'destructive' :
                                bottleneck.severity === 'medium' ? 'secondary' : 'outline'
                              } className="text-xs">
                                {bottleneck.severity} risk
                              </Badge>
                            </div>
                            <div className="bg-purple-100 p-3 rounded text-xs text-purple-800 mb-3">
                              <span className="font-medium">AI Recommendation:</span> {bottleneck.solution}
                              <div className="flex items-center mt-1">
                                <Brain className="w-3 h-3 mr-1" />
                                <span>{bottleneck.confidence}% confidence</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 flex-1">
                                <Zap className="w-3 h-3 mr-1" />
                                Apply Solution
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1">
                                <Eye className="w-3 h-3 mr-1" />
                                Monitor
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Enhanced Portfolio Dashboard */}
                <PortfolioDashboard />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stage1">
          <Stage1ProcessDesign />
        </TabsContent>

        <TabsContent value="stage2">
          <Stage2PPQ />
        </TabsContent>

        <TabsContent value="stage3">
          <Stage3CPV />
        </TabsContent>

        <TabsContent value="equipment">
          <EquipmentQualification />
        </TabsContent>

        <TabsContent value="analytics">
          <ProcessAnalytics />
        </TabsContent>
      </Tabs>

      {/* PPQ Protocol Generation Dialog */}
      <Dialog open={showProtocolDialog} onOpenChange={setShowProtocolDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate PPQ Protocol</DialogTitle>
            <DialogDescription>
              Create a comprehensive Process Performance Qualification protocol based on FDA guidance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Name</Label>
                <Input placeholder="e.g., Acetaminophen Tablets 500mg" />
              </div>
              <div>
                <Label>Batch Size</Label>
                <Input placeholder="e.g., 200,000 tablets" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Number of PPQ Batches</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select number" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 Batches</SelectItem>
                    <SelectItem value="3">3 Batches (Standard)</SelectItem>
                    <SelectItem value="5">5 Batches</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Manufacturing Site</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site-a">Site A - New Jersey</SelectItem>
                    <SelectItem value="site-b">Site B - California</SelectItem>
                    <SelectItem value="site-c">Site C - Puerto Rico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Critical Process Parameters to Monitor</Label>
              <Textarea 
                placeholder="List all CPPs to be monitored during PPQ batches..."
                className="h-20"
              />
            </div>
            <div>
              <Label>Acceptance Criteria</Label>
              <Textarea 
                placeholder="Define acceptance criteria for PPQ success..."
                className="h-20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowProtocolDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateProtocol} disabled={loading}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Protocol
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FMEA Dialog */}
      <Dialog open={showFMEADialog} onOpenChange={setShowFMEADialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New FMEA Analysis</DialogTitle>
            <DialogDescription>
              Create a Failure Mode and Effects Analysis for process risk assessment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Process Step</Label>
              <Input placeholder="e.g., Tablet Compression" />
            </div>
            <div>
              <Label>Potential Failure Mode</Label>
              <Textarea placeholder="Describe the potential failure mode..." className="h-20" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Severity (1-10)</Label>
                <Input type="number" min="1" max="10" placeholder="8" />
              </div>
              <div>
                <Label>Occurrence (1-10)</Label>
                <Input type="number" min="1" max="10" placeholder="3" />
              </div>
              <div>
                <Label>Detection (1-10)</Label>
                <Input type="number" min="1" max="10" placeholder="4" />
              </div>
            </div>
            <div>
              <Label>Mitigation Strategy</Label>
              <Textarea placeholder="Describe mitigation strategy..." className="h-20" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowFMEADialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleFMEAAnalysis}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Create FMEA
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DoE Dialog */}
      <Dialog open={showDoEDialog} onOpenChange={setShowDoEDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Design of Experiments (DoE)</DialogTitle>
            <DialogDescription>
              Set up a new experimental design to optimize process parameters
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Experiment Name</Label>
              <Input placeholder="e.g., Compression Force Optimization" />
            </div>
            <div>
              <Label>Design Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select design type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-factorial">Full Factorial</SelectItem>
                  <SelectItem value="fractional">Fractional Factorial</SelectItem>
                  <SelectItem value="plackett">Plackett-Burman</SelectItem>
                  <SelectItem value="response">Response Surface</SelectItem>
                  <SelectItem value="taguchi">Taguchi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Factors</Label>
              <Textarea 
                placeholder="List factors and their levels (e.g., Compression Force: 8-12 kN)"
                className="h-20"
              />
            </div>
            <div>
              <Label>Response Variables</Label>
              <Textarea 
                placeholder="List response variables to measure (e.g., Tablet Hardness, Dissolution)"
                className="h-20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDoEDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDoEExecution}>
              <TestTube className="h-4 w-4 mr-2" />
              Execute DoE
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Equipment Qualification Dialog */}
      <Dialog open={showEquipmentDialog} onOpenChange={setShowEquipmentDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Equipment Qualification</DialogTitle>
            <DialogDescription>
              Initiate qualification protocol for manufacturing equipment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Equipment Name</Label>
              <Input placeholder="e.g., Tablet Press Model X200" />
            </div>
            <div>
              <Label>Equipment ID</Label>
              <Input placeholder="e.g., TP-001" />
            </div>
            <div>
              <Label>Qualification Type</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select qualification type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iq">Installation Qualification (IQ)</SelectItem>
                  <SelectItem value="oq">Operational Qualification (OQ)</SelectItem>
                  <SelectItem value="pq">Performance Qualification (PQ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qualification Scope</Label>
              <Textarea 
                placeholder="Describe the scope of qualification..."
                className="h-20"
              />
            </div>
            <div>
              <Label>Acceptance Criteria</Label>
              <Textarea 
                placeholder="Define acceptance criteria for successful qualification..."
                className="h-20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowEquipmentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleEquipmentQualification('IQ')}>
              <Wrench className="h-4 w-4 mr-2" />
              Start Qualification
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProcessTab;