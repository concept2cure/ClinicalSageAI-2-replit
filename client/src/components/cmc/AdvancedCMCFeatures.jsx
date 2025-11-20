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
  FlaskConical,
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
  Beaker,
  Calculator,
  ChartLine,
  FileSpreadsheet,
  Gauge,
  GitBranch,
  Hash,
  Layers,
  Lock,
  MessageSquare,
  RefreshCw,
  Scale,
  Thermometer,
  Timer,
  Zap,
  Award,
  Brain,
  CheckSquare,
  CloudUpload,
  Container,
  CopyIcon,
  Fingerprint,
  Globe,
  HardDrive,
  Lightbulb,
  MapPin,
  PenTool,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Advanced CMC Features Component - Real Pharmaceutical Regulatory Workflows
const AdvancedCMCFeatures = ({ organizationId = 7 }) => {
  const [activeFeature, setActiveFeature] = useState('regulatory-submissions');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Regulatory Submissions Management
  const renderRegulatorySubmissions = () => (
    <div className="space-y-6" data-testid="regulatory-submissions">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Regulatory Submissions</h2>
          <p className="text-gray-600 mt-1">FDA, EMA, PMDA, Health Canada submission management</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" data-testid="button-new-submission">
          <FileText className="w-4 h-4 mr-2" />
          New Submission
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Globe className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-gray-600">FDA Submissions</p>
                <Badge variant="default">8 Approved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Award className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">5</p>
                <p className="text-sm text-gray-600">EMA Submissions</p>
                <Badge variant="secondary">3 Approved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <MapPin className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-gray-600">PMDA Submissions</p>
                <Badge variant="outline">2 Approved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Fingerprint className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">4</p>
                <p className="text-sm text-gray-600">Health Canada</p>
                <Badge variant="secondary">3 Approved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Active Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  id: 'IND-2024-001',
                  type: 'IND',
                  agency: 'FDA',
                  status: 'Under Review',
                  progress: 75,
                },
                {
                  id: 'MA-2024-002',
                  type: 'Marketing Authorization',
                  agency: 'EMA',
                  status: 'Data Review',
                  progress: 60,
                },
                {
                  id: 'CTN-2024-003',
                  type: 'Clinical Trial Notification',
                  agency: 'Health Canada',
                  status: 'Approved',
                  progress: 100,
                },
              ].map(submission => (
                <div key={submission.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold">{submission.id}</h4>
                      <p className="text-sm text-gray-600">{submission.type}</p>
                    </div>
                    <Badge variant={submission.status === 'Approved' ? 'default' : 'secondary'}>
                      {submission.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{submission.progress}%</span>
                    </div>
                    <Progress value={submission.progress} className="h-2" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Agency: {submission.agency}</span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { submission: 'IND-2024-001', deadline: '2025-09-15', days: 31 },
                { submission: 'MA-2024-002', deadline: '2025-10-01', days: 47 },
                { submission: 'CTN-2024-003', deadline: '2025-08-30', days: 15 },
              ].map(item => (
                <div
                  key={item.submission}
                  className="p-3 bg-orange-50 rounded border-l-4 border-orange-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{item.submission}</p>
                      <p className="text-xs text-gray-600">{item.deadline}</p>
                    </div>
                    <Badge variant={item.days <= 20 ? 'destructive' : 'secondary'}>
                      {item.days} days
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Manufacturing Excellence
  const renderManufacturingExcellence = () => (
    <div className="space-y-6" data-testid="manufacturing-excellence">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Manufacturing Excellence</h2>
          <p className="text-gray-600 mt-1">
            GMP compliance, continuous improvement, risk management
          </p>
        </div>
        <Button variant="outline" data-testid="button-new-deviation">
          <AlertTriangle className="w-4 h-4 mr-2" />
          Report Deviation
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">98.5%</p>
                <p className="text-sm text-gray-600">GMP Compliance</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <Progress value={98.5} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">24</p>
                <p className="text-sm text-gray-600">Active Batches</p>
              </div>
              <Container className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">8 in QC, 16 released</div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-orange-600">3</p>
                <p className="text-sm text-gray-600">Open Deviations</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">1 critical, 2 minor</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-purple-600">15</p>
                <p className="text-sm text-gray-600">CAPA Actions</p>
              </div>
              <RefreshCw className="w-8 h-8 text-purple-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">12 open, 3 overdue</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Batch Quality Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  batch: 'BT-2024-087',
                  product: 'Product A 10mg',
                  yield: 94.2,
                  purity: 99.8,
                  status: 'Released',
                },
                {
                  batch: 'BT-2024-088',
                  product: 'Product A 10mg',
                  yield: 93.8,
                  purity: 99.7,
                  status: 'QC Testing',
                },
                {
                  batch: 'BT-2024-089',
                  product: 'Product B 25mg',
                  yield: 95.1,
                  purity: 99.9,
                  status: 'Released',
                },
              ].map(batch => (
                <div key={batch.batch} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">{batch.batch}</h4>
                      <p className="text-sm text-gray-600">{batch.product}</p>
                    </div>
                    <Badge variant={batch.status === 'Released' ? 'default' : 'secondary'}>
                      {batch.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Yield: </span>
                      <span className="font-medium">{batch.yield}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Purity: </span>
                      <span className="font-medium">{batch.purity}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  risk: 'Supplier Quality Issues',
                  level: 'High',
                  probability: 'Medium',
                  impact: 'High',
                  mitigation: 'Dual sourcing strategy',
                },
                {
                  risk: 'Equipment Failure',
                  level: 'Medium',
                  probability: 'Low',
                  impact: 'High',
                  mitigation: 'Preventive maintenance',
                },
                {
                  risk: 'Staff Training Gap',
                  level: 'Low',
                  probability: 'Medium',
                  impact: 'Medium',
                  mitigation: 'Training program update',
                },
              ].map((risk, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-medium text-sm">{risk.risk}</h5>
                    <Badge
                      variant={
                        risk.level === 'High'
                          ? 'destructive'
                          : risk.level === 'Medium'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {risk.level}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>
                      Probability: {risk.probability} | Impact: {risk.impact}
                    </div>
                    <div>Mitigation: {risk.mitigation}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Supply Chain Excellence
  const renderSupplyChain = () => (
    <div className="space-y-6" data-testid="supply-chain">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Supply Chain Excellence</h2>
          <p className="text-gray-600 mt-1">
            Vendor management, supply continuity, quality assurance
          </p>
        </div>
        <Button variant="outline" data-testid="button-new-supplier">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Approved Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'ChemCorp Industries', material: 'API', score: 95, status: 'Approved' },
                { name: 'PharmaSupply Co.', material: 'Excipients', score: 88, status: 'Approved' },
                {
                  name: 'PackTech Solutions',
                  material: 'Packaging',
                  score: 92,
                  status: 'Qualified',
                },
              ].map((supplier, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-sm">{supplier.name}</h5>
                      <p className="text-xs text-gray-600">{supplier.material}</p>
                    </div>
                    <Badge variant={supplier.status === 'Approved' ? 'default' : 'secondary'}>
                      {supplier.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-600">Quality Score: {supplier.score}%</span>
                    <Button size="sm" variant="ghost">
                      <Eye className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" />
              Inventory Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  material: 'API Compound X',
                  current: 250,
                  minimum: 100,
                  unit: 'kg',
                  status: 'Good',
                },
                {
                  material: 'Microcrystalline Cellulose',
                  current: 50,
                  minimum: 75,
                  unit: 'kg',
                  status: 'Low',
                },
                {
                  material: 'HPMC Capsules',
                  current: 500000,
                  minimum: 250000,
                  unit: 'units',
                  status: 'Good',
                },
              ].map((item, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-sm">{item.material}</h5>
                      <p className="text-xs text-gray-600">
                        {item.current.toLocaleString()} {item.unit}
                      </p>
                    </div>
                    <Badge variant={item.status === 'Good' ? 'default' : 'destructive'}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600">
                    Min: {item.minimum.toLocaleString()} {item.unit}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Thermometer className="w-5 h-5" />
              Environmental Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { location: 'Warehouse Zone A', temp: 22, humidity: 45, status: 'Normal' },
                { location: 'Cold Storage', temp: 4, humidity: 55, status: 'Normal' },
                { location: 'Production Area', temp: 20, humidity: 48, status: 'Normal' },
              ].map((monitor, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-sm">{monitor.location}</h5>
                      <p className="text-xs text-gray-600">
                        {monitor.temp}°C | {monitor.humidity}% RH
                      </p>
                    </div>
                    <Badge variant="default">{monitor.status}</Badge>
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
          <h1 className="text-3xl font-bold text-gray-900">Advanced CMC Features</h1>
          <p className="text-gray-600 mt-2">
            Comprehensive pharmaceutical regulatory and manufacturing management
          </p>
        </div>

        {/* Feature Navigation */}
        <Tabs value={activeFeature} onValueChange={setActiveFeature} className="w-full">
          <TabsList className="grid w-full grid-cols-3" data-testid="advanced-cmc-tabs">
            <TabsTrigger value="regulatory-submissions" data-testid="tab-regulatory">
              Regulatory Submissions
            </TabsTrigger>
            <TabsTrigger value="manufacturing-excellence" data-testid="tab-manufacturing">
              Manufacturing Excellence
            </TabsTrigger>
            <TabsTrigger value="supply-chain" data-testid="tab-supply-chain">
              Supply Chain
            </TabsTrigger>
          </TabsList>

          <TabsContent value="regulatory-submissions">{renderRegulatorySubmissions()}</TabsContent>
          <TabsContent value="manufacturing-excellence">
            {renderManufacturingExcellence()}
          </TabsContent>
          <TabsContent value="supply-chain">{renderSupplyChain()}</TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdvancedCMCFeatures;
