import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  FlaskConical, BarChart3, Shield, Clock, Users, Target, AlertTriangle, CheckCircle2,
  Plus, Edit, Download, Upload, Search, Filter, Microscope, TestTube, Activity,
  Clipboard, Settings, Database, FileCheck, TrendingUp, AlertCircle, Calendar,
  User, Eye, Trash2, Save, X, Package, Pill, ArrowRight, FileText, PlayCircle,
  Award, Globe, Archive, Edit3, BookOpen, GitBranch, Link, Zap, Languages,
  Flag, History, RefreshCw, Brain, Sparkles, PenTool
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import DocumentAuthoringComponent from './DocumentAuthoringFixed';

const ComprehensiveCMCPlatform = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [analyticalMethods, setAnalyticalMethods] = useState([]);
  const [processValidations, setProcessValidations] = useState([]);
  const [stabilityStudies, setStabilityStudies] = useState([]);
  const [qcTesting, setQcTesting] = useState([]);
  const [changeControls, setChangeControls] = useState([]);
  const [drugSubstances, setDrugSubstances] = useState([]);
  const [drugProducts, setDrugProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Advanced CMC Features State
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [auditData, setAuditData] = useState([]);
  const [riskAssessments, setRiskAssessments] = useState([]);
  const [mitigationPlans, setMitigationPlans] = useState([]);
  const [submissionData, setSubmissionData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState({});
  
  const { toast } = useToast();

  const organizationId = 7; // Current organization

  useEffect(() => {
    loadAllCMCData();
    loadAdvancedCMCData();
  }, []);

  const loadAllCMCData = async () => {
    setLoading(true);
    try {
      const endpoints = [
        '/api/cmc/analytical-methods',
        '/api/cmc/process-validation', 
        '/api/cmc/stability-studies',
        '/api/cmc/qc-testing',
        '/api/cmc/change-control',
        '/api/cmc/drug-substances',
        '/api/cmc/drug-products'
      ];

      const responses = await Promise.all(
        endpoints.map(endpoint => 
          fetch(`${endpoint}?organizationId=${organizationId}`)
            .then(res => res.json())
            .catch(() => ({ success: false, data: [] }))
        )
      );

      const [methods, validations, studies, testing, changes, substances, products] = responses;

      setAnalyticalMethods(methods.data || []);
      setProcessValidations(validations.data || []);
      setStabilityStudies(studies.data || []);
      setQcTesting(testing.data || []);
      setChangeControls(changes.data || []);
      setDrugSubstances(substances.data || []);
      setDrugProducts(products.data || []);

    } catch (error) {
      console.error('Error loading CMC data:', error);
      toast({
        title: "Error",
        description: "Failed to load CMC data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAdvancedCMCData = () => {
    // Initialize advanced CMC features data
    setAuditData([
      { 
        id: 1, 
        timestamp: '2025-08-15 14:30:22',
        user: 'Dr. Sarah Johnson',
        action: 'Method Validation Completed',
        entity: 'AM-2024-015',
        details: 'HPLC method validation completed with all ICH Q2 parameters met',
        impact: 'High',
        category: 'Method Development'
      },
      {
        id: 2,
        timestamp: '2025-08-15 11:15:45',
        user: 'Mark Chen',
        action: 'Batch Release Approved', 
        entity: 'BT-2024-089',
        details: 'All QC tests passed, batch approved for commercial release',
        impact: 'Critical',
        category: 'Quality Control'
      }
    ]);

    setRiskAssessments([
      {
        id: 1,
        category: 'Supply Chain',
        risk: 'Single Source Supplier for Critical API',
        probability: 25,
        impact: 90,
        riskScore: 22.5,
        level: 'High',
        owner: 'Supply Chain Manager',
        status: 'Active'
      }
    ]);

    setSubmissionData([
      { id: 'IND-2024-001', type: 'IND', agency: 'FDA', status: 'Under Review', progress: 75 },
      { id: 'MA-2024-002', type: 'Marketing Authorization', agency: 'EMA', status: 'Data Review', progress: 60 }
    ]);
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setSelectedItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalType('');
    setSelectedItem(null);
  };

  const handleSubmit = async (formData) => {
    try {
      const endpoint = `/api/cmc/${modalType}`;
      const method = selectedItem ? 'PUT' : 'POST';
      const url = selectedItem ? `${endpoint}/${selectedItem.id}` : endpoint;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, organizationId })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `${modalType.replace('-', ' ')} ${selectedItem ? 'updated' : 'created'} successfully`
        });
        closeModal();
        loadAllCMCData();
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to save data",
        variant: "destructive"
      });
    }
  };

  // Dashboard Overview
  const renderDashboard = () => (
    <div className="space-y-6" data-testid="cmc-dashboard">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TestTube className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{analyticalMethods.length}</p>
                <p className="text-sm text-gray-600">Analytical Methods</p>
                <Badge variant={analyticalMethods.filter(m => m.status === 'validated').length > 0 ? 'default' : 'secondary'}>
                  {analyticalMethods.filter(m => m.status === 'validated').length} Validated
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Settings className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{processValidations.length}</p>
                <p className="text-sm text-gray-600">Process Validations</p>
                <Badge variant={processValidations.filter(p => p.status === 'completed').length > 0 ? 'default' : 'secondary'}>
                  Stage {processValidations.length > 0 ? '2' : '1'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{stabilityStudies.length}</p>
                <p className="text-sm text-gray-600">Stability Studies</p>
                <Badge variant={stabilityStudies.filter(s => s.status === 'ongoing').length > 0 ? 'default' : 'secondary'}>
                  {stabilityStudies.filter(s => s.status === 'ongoing').length} Ongoing
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <Shield className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{qcTesting.length}</p>
                <p className="text-sm text-gray-600">QC Tests</p>
                <Badge variant={qcTesting.filter(q => q.passFailStatus === 'pass').length > 0 ? 'default' : 'destructive'}>
                  {Math.round((qcTesting.filter(q => q.passFailStatus === 'pass').length / Math.max(qcTesting.length, 1)) * 100)}% Pass
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent CMC Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                <p className="text-gray-500">Loading activities...</p>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                    <div>
                      <p className="font-medium">Method AM-001 validated</p>
                      <p className="text-sm text-gray-600">HPLC assay method</p>
                    </div>
                    <Badge>Completed</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded">
                    <div>
                      <p className="font-medium">Process validation Stage 2</p>
                      <p className="text-sm text-gray-600">API synthesis</p>
                    </div>
                    <Badge variant="secondary">In Progress</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded">
                    <div>
                      <p className="font-medium">Stability study initiated</p>
                      <p className="text-sm text-gray-600">25°C/60% RH</p>
                    </div>
                    <Badge>Ongoing</Badge>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Action Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-red-50 rounded border-l-4 border-red-200">
                <div>
                  <p className="font-medium">Method transfer overdue</p>
                  <p className="text-sm text-gray-600">Transfer to QC lab</p>
                </div>
                <Badge variant="destructive">Overdue</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded border-l-4 border-yellow-200">
                <div>
                  <p className="font-medium">Stability samples due</p>
                  <p className="text-sm text-gray-600">12-month timepoint</p>
                </div>
                <Badge variant="secondary">Due Soon</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded border-l-4 border-blue-200">
                <div>
                  <p className="font-medium">Change control review</p>
                  <p className="text-sm text-gray-600">Process modification</p>
                </div>
                <Badge>Review</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button 
          className="h-24 flex-col space-y-2"
          onClick={() => openModal('analytical-methods')}
          data-testid="button-create-method"
        >
          <TestTube className="w-8 h-8" />
          <span>Create Analytical Method</span>
        </Button>
        
        <Button 
          className="h-24 flex-col space-y-2" 
          variant="outline"
          onClick={() => openModal('stability-studies')}
          data-testid="button-create-stability"
        >
          <BarChart3 className="w-8 h-8" />
          <span>Start Stability Study</span>
        </Button>
        
        <Button 
          className="h-24 flex-col space-y-2"
          variant="outline" 
          onClick={() => openModal('process-validation')}
          data-testid="button-create-validation"
        >
          <Settings className="w-8 h-8" />
          <span>Process Validation</span>
        </Button>
      </div>
    </div>
  );

  // Analytical Methods Management
  const renderAnalyticalMethods = () => (
    <div className="space-y-6" data-testid="analytical-methods-tab">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Analytical Methods</h2>
        <Button onClick={() => openModal('analytical-methods')} data-testid="button-new-method">
          <Plus className="w-4 h-4 mr-2" />
          New Method
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {analyticalMethods.map((method) => (
          <Card key={method.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{method.methodCode}</CardTitle>
                  <CardDescription>{method.title}</CardDescription>
                </div>
                <Badge variant={
                  method.status === 'validated' ? 'default' : 
                  method.status === 'validation' ? 'secondary' : 'outline'
                }>
                  {method.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><strong>Technique:</strong> {method.technique}</p>
                <p><strong>Analyte:</strong> {method.analyte}</p>
                <p><strong>Matrix:</strong> {method.matrix}</p>
                <div className="flex space-x-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => openModal('analytical-methods', method)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <FileText className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <PlayCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {analyticalMethods.length === 0 && !loading && (
          <div className="col-span-3 text-center py-12">
            <TestTube className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Analytical Methods</h3>
            <p className="text-gray-500 mb-4">Create your first analytical method to get started with CMC documentation.</p>
            <Button onClick={() => openModal('analytical-methods')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Method
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Process Validation Management
  const renderProcessValidation = () => (
    <div className="space-y-6" data-testid="process-validation-tab">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Process Validation</h2>
        <Button onClick={() => openModal('process-validation')} data-testid="button-new-validation">
          <Plus className="w-4 h-4 mr-2" />
          New Validation
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">3-Stage Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-sm font-medium">1</span>
                </div>
                <div>
                  <p className="font-medium">Process Design</p>
                  <p className="text-sm text-gray-600">Development & design space</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-sm font-medium">2</span>
                </div>
                <div>
                  <p className="font-medium">Process Qualification</p>
                  <p className="text-sm text-gray-600">Validation batches</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <span className="text-sm font-medium">3</span>
                </div>
                <div>
                  <p className="font-medium">Continued Process Verification</p>
                  <p className="text-sm text-gray-600">Ongoing monitoring</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {processValidations.map((validation) => (
            <Card key={validation.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{validation.processName}</CardTitle>
                    <CardDescription>Stage {validation.stage === 'design' ? '1' : validation.stage === 'qualification' ? '2' : '3'}: {validation.stage}</CardDescription>
                  </div>
                  <Badge variant={
                    validation.status === 'completed' ? 'default' :
                    validation.status === 'in-progress' ? 'secondary' : 'outline'
                  }>
                    {validation.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Batch Numbers</p>
                    <p className="font-medium">{validation.batchNumbers?.join(', ') || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Lead Validator</p>
                    <p className="font-medium">User #{validation.leadValidator || 'Unassigned'}</p>
                  </div>
                </div>
                <div className="flex space-x-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => openModal('process-validation', validation)}>
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline">
                    <FileText className="w-4 h-4 mr-1" />
                    Protocol
                  </Button>
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-1" />
                    Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {processValidations.length === 0 && !loading && (
            <div className="text-center py-12">
              <Settings className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Process Validations</h3>
              <p className="text-gray-500 mb-4">Start your first process validation following the 3-stage lifecycle approach.</p>
              <Button onClick={() => openModal('process-validation')}>
                <Plus className="w-4 h-4 mr-2" />
                Create Validation
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Stability Studies Management  
  const renderStabilityStudies = () => (
    <div className="space-y-6" data-testid="stability-studies-tab">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Stability Studies</h2>
        <Button onClick={() => openModal('stability-studies')} data-testid="button-new-stability">
          <Plus className="w-4 h-4 mr-2" />
          New Study
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stabilityStudies.map((study) => (
          <Card key={study.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{study.studyTitle}</CardTitle>
                  <CardDescription>{study.productName}</CardDescription>
                </div>
                <Badge variant={
                  study.status === 'completed' ? 'default' :
                  study.status === 'ongoing' ? 'secondary' : 'outline'
                }>
                  {study.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><strong>Type:</strong> {study.studyType}</p>
                <p><strong>Conditions:</strong> {study.storageConditions}</p>
                <p><strong>Batch:</strong> {study.batchNumber}</p>
                <p><strong>Start Date:</strong> {new Date(study.startDate).toLocaleDateString()}</p>
                {study.shelfLife && <p><strong>Shelf Life:</strong> {study.shelfLife}</p>}
                <div className="flex space-x-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => openModal('stability-studies', study)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Calendar className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {stabilityStudies.length === 0 && !loading && (
          <div className="col-span-3 text-center py-12">
            <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Stability Studies</h3>
            <p className="text-gray-500 mb-4">Initiate stability studies following ICH Q1 guidelines.</p>
            <Button onClick={() => openModal('stability-studies')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Study
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Quality Control Testing
  const renderQualityControl = () => (
    <div className="space-y-6" data-testid="quality-control-tab">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Quality Control Testing</h2>
        <Button onClick={() => openModal('qc-testing')} data-testid="button-new-qc-test">
          <Plus className="w-4 h-4 mr-2" />
          New Test
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {qcTesting.map((test) => (
          <Card key={test.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{test.sampleId}</CardTitle>
                  <CardDescription>{test.sampleType} - {test.testMethod}</CardDescription>
                </div>
                <Badge variant={
                  test.passFailStatus === 'pass' ? 'default' :
                  test.passFailStatus === 'fail' ? 'destructive' : 'secondary'
                }>
                  {test.passFailStatus || 'pending'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Test Date</p>
                  <p className="font-medium">{new Date(test.testDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Analyst</p>
                  <p className="font-medium">User #{test.analyst}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium">{test.releaseDate ? 'Released' : 'Pending Review'}</p>
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => openModal('qc-testing', test)}>
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button size="sm" variant="outline">
                  <FileText className="w-4 h-4 mr-1" />
                  COA
                </Button>
                <Button size="sm" variant="outline">
                  <Eye className="w-4 h-4 mr-1" />
                  Results
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {qcTesting.length === 0 && !loading && (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No QC Tests</h3>
            <p className="text-gray-500 mb-4">Start quality control testing for raw materials, in-process, and finished products.</p>
            <Button onClick={() => openModal('qc-testing')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Test
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Regulatory Management
  const renderRegulatoryManagement = () => (
    <div className="space-y-6" data-testid="regulatory-management">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Regulatory Management</h2>
          <p className="text-gray-600 mt-1">FDA, EMA, PMDA submissions and compliance tracking</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-new-regulatory">
          <FileText className="w-4 h-4 mr-2" />
          New Submission
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">23</p>
                <p className="text-sm text-gray-600">Active Submissions</p>
                <Badge variant="default">18 Approved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">97%</p>
                <p className="text-sm text-gray-600">Approval Rate</p>
                <Badge variant="secondary">Last 12 months</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">8</p>
                <p className="text-sm text-gray-600">Pending Reviews</p>
                <Badge variant="outline">3 Overdue</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Target className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">45</p>
                <p className="text-sm text-gray-600">Days Avg. Review</p>
                <Badge variant="secondary">FDA Target: 60</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Regulatory Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { activity: 'IND-2024-015 submitted to FDA', date: '2025-08-14', status: 'Submitted' },
                { activity: 'EMA feedback received for MA-2024-007', date: '2025-08-13', status: 'Action Required' },
                { activity: 'Health Canada approval for CTN-2024-012', date: '2025-08-12', status: 'Approved' },
                { activity: 'PMDA meeting scheduled for JP-2024-003', date: '2025-08-11', status: 'Scheduled' }
              ].map((item, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{item.activity}</p>
                      <p className="text-xs text-gray-600">{item.date}</p>
                    </div>
                    <Badge variant={
                      item.status === 'Approved' ? 'default' :
                      item.status === 'Action Required' ? 'destructive' : 'secondary'
                    }>
                      {item.status}
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
              <AlertCircle className="w-5 h-5 text-red-500" />
              Compliance Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { alert: 'GMP inspection scheduled - Site A', date: '2025-09-15', priority: 'High' },
                { alert: 'Annual product review due', date: '2025-08-30', priority: 'Medium' },
                { alert: 'Pharmacovigilance report deadline', date: '2025-09-01', priority: 'High' }
              ].map((alert, index) => (
                <div key={index} className={`p-3 rounded border-l-4 ${
                  alert.priority === 'High' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{alert.alert}</p>
                      <p className="text-xs text-gray-600">{alert.date}</p>
                    </div>
                    <Badge variant={alert.priority === 'High' ? 'destructive' : 'secondary'}>
                      {alert.priority}
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
          <p className="text-gray-600 mt-1">GMP compliance, batch tracking, continuous improvement</p>
        </div>
        <Button variant="outline" data-testid="button-new-batch">
          <Package className="w-4 h-4 mr-2" />
          New Batch
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">98.7%</p>
                <p className="text-sm text-gray-600">GMP Compliance</p>
                <Badge variant="default">Excellent</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-gray-600">Batches Produced</p>
                <Badge variant="secondary">This Month</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">4</p>
                <p className="text-sm text-gray-600">Open Deviations</p>
                <Badge variant="outline">2 Critical</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">94.2%</p>
                <p className="text-sm text-gray-600">Overall Yield</p>
                <Badge variant="default">Target: 90%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Production Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { product: 'Product A 10mg', batches: 24, yield: 94.5, quality: 99.8 },
                { product: 'Product B 25mg', batches: 18, yield: 93.2, quality: 99.6 },
                { product: 'Product C 50mg', batches: 12, yield: 95.1, quality: 99.9 }
              ].map((product, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <h5 className="font-semibold mb-2">{product.product}</h5>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Batches</p>
                      <p className="font-medium">{product.batches}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Avg. Yield</p>
                      <p className="font-medium">{product.yield}%</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Quality Score</p>
                      <p className="font-medium">{product.quality}%</p>
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
              <Settings className="w-5 h-5" />
              Equipment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { equipment: 'Tablet Press #1', status: 'Operational', utilization: 85 },
                { equipment: 'Fluid Bed Dryer #2', status: 'Maintenance', utilization: 0 },
                { equipment: 'Coating Pan #3', status: 'Operational', utilization: 72 },
                { equipment: 'Blender #4', status: 'Operational', utilization: 91 }
              ].map((equipment, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{equipment.equipment}</p>
                      <p className="text-xs text-gray-600">Utilization: {equipment.utilization}%</p>
                    </div>
                    <Badge variant={equipment.status === 'Operational' ? 'default' : 'secondary'}>
                      {equipment.status}
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

  // Supply Chain Management
  const renderSupplyChainManagement = () => (
    <div className="space-y-6" data-testid="supply-chain-management">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Supply Chain Management</h2>
          <p className="text-gray-600 mt-1">Vendor qualification, inventory management, risk assessment</p>
        </div>
        <Button variant="outline" data-testid="button-supplier-audit">
          <Users className="w-4 h-4 mr-2" />
          Supplier Audit
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">47</p>
                <p className="text-sm text-gray-600">Qualified Suppliers</p>
                <Badge variant="default">42 Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Database className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">89%</p>
                <p className="text-sm text-gray-600">Inventory Accuracy</p>
                <Badge variant="secondary">Target: 85%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-gray-600">Supply Risks</p>
                <Badge variant="outline">1 High</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <Clock className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-gray-600">Days Lead Time</p>
                <Badge variant="default">Avg. Supplier</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top Suppliers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { name: 'ChemSupply Corp', score: 96, orders: 24, onTime: 98 },
                { name: 'BioPharma Materials', score: 94, orders: 18, onTime: 95 },
                { name: 'Global Excipients Ltd', score: 91, orders: 32, onTime: 92 }
              ].map((supplier, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-sm">{supplier.name}</h5>
                      <p className="text-xs text-gray-600">Score: {supplier.score}/100</p>
                    </div>
                    <Badge variant="default">Top Rated</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Orders: {supplier.orders}</div>
                    <div>On-time: {supplier.onTime}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Critical Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { material: 'API Compound Alpha', stock: 450, min: 200, status: 'Good' },
                { material: 'Excipient Beta', stock: 75, min: 100, status: 'Low' },
                { material: 'Packaging Material Gamma', stock: 2500, min: 1000, status: 'Good' }
              ].map((material, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium text-sm">{material.material}</h5>
                      <p className="text-xs text-gray-600">Stock: {material.stock} kg</p>
                    </div>
                    <Badge variant={material.status === 'Good' ? 'default' : 'destructive'}>
                      {material.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600">
                    Min: {material.min} kg
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { risk: 'Single source supplier', level: 'High', mitigation: 'Identify backup supplier' },
                { risk: 'Shipping delays', level: 'Medium', mitigation: 'Buffer stock increase' },
                { risk: 'Quality issues', level: 'Low', mitigation: 'Enhanced testing' }
              ].map((risk, index) => (
                <div key={index} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h5 className="font-medium text-sm">{risk.risk}</h5>
                    <Badge variant={
                      risk.level === 'High' ? 'destructive' :
                      risk.level === 'Medium' ? 'secondary' : 'outline'
                    }>
                      {risk.level}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">{risk.mitigation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // Intelligence Hub Integration
  const renderIntelligenceHub = () => {
    // Import and render the CMC Intelligence Hub component
    const CMCIntelligenceHub = React.lazy(() => import('./CMCIntelligenceHub'));
    
    return (
      <React.Suspense fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading AI Intelligence Hub...</span>
        </div>
      }>
        <CMCIntelligenceHub organizationId={organizationId} />
      </React.Suspense>
    );
  };

  // Risk Management - Consolidated from CMCRiskManagement.jsx
  const renderRiskManagement = () => (
    <div className="space-y-6" data-testid="risk-management">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Risk Management</h2>
          <p className="text-gray-600 mt-1">Advanced risk assessment and mitigation planning</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700">
          <AlertTriangle className="w-4 h-4 mr-2" />
          Add Risk Assessment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-gray-600">Critical Risks</p>
                <Badge variant="destructive">High Priority</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-gray-600">Medium Risks</p>
                <Badge variant="secondary">Monitor</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">8</p>
                <p className="text-sm text-gray-600">Mitigated</p>
                <Badge variant="default">Resolved</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">85%</p>
                <p className="text-sm text-gray-600">Risk Coverage</p>
                <Badge variant="outline">Good</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Risk Assessments</CardTitle>
          <CardDescription>Comprehensive risk assessment matrix and mitigation tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {riskAssessments.map((risk) => (
              <div key={risk.id} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold">{risk.risk}</h4>
                    <p className="text-sm text-gray-600">{risk.category}</p>
                    <p className="text-xs text-gray-500">Owner: {risk.owner}</p>
                  </div>
                  <Badge variant={risk.level === 'High' ? 'destructive' : 'secondary'}>
                    {risk.level} Risk
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Probability:</span> {risk.probability}%
                  </div>
                  <div>
                    <span className="font-medium">Impact:</span> {risk.impact}%
                  </div>
                  <div>
                    <span className="font-medium">Risk Score:</span> {risk.riskScore}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Regulatory Submissions - Consolidated from AdvancedCMCFeatures.jsx
  const renderRegulatorySubmissions = () => (
    <div className="space-y-6" data-testid="regulatory-submissions">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Regulatory Submissions</h2>
          <p className="text-gray-600 mt-1">Multi-agency submission management and tracking</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700">
          <FileText className="w-4 h-4 mr-2" />
          New Submission
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
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
              <Globe className="w-8 h-8 text-orange-600" />
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
              <CheckCircle2 className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">97%</p>
                <p className="text-sm text-gray-600">Approval Rate</p>
                <Badge variant="default">Excellent</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Submissions</CardTitle>
          <CardDescription>Multi-agency regulatory submission tracking and progress monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {submissionData.map((submission) => (
              <div key={submission.id} className="p-4 border rounded-lg">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-semibold">{submission.id}</h4>
                    <p className="text-sm text-gray-600">{submission.type} - {submission.agency}</p>
                  </div>
                  <Badge variant={submission.status === 'Approved' ? 'default' : 'secondary'}>
                    {submission.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <Progress value={submission.progress} className="flex-1 mr-4" />
                  <span className="text-sm font-medium">{submission.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Audit and Documentation - Consolidated from CMCAuditAndDocumentation.jsx
  const renderAuditAndDocumentation = () => (
    <div className="space-y-6" data-testid="audit-documentation">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Audit & Documentation</h2>
          <p className="text-gray-600 mt-1">Comprehensive audit trails and document management</p>
        </div>
        <Button variant="outline">
          <FileText className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6 text-center">
            <FileText className="w-8 h-8 mx-auto text-blue-600 mb-2" />
            <div className="text-2xl font-bold">2,847</div>
            <p className="text-sm text-gray-600">Audit Entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Archive className="w-8 h-8 mx-auto text-green-600 mb-2" />
            <div className="text-2xl font-bold">1,247</div>
            <p className="text-sm text-gray-600">Documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto text-orange-600 mb-2" />
            <div className="text-2xl font-bold">127</div>
            <p className="text-sm text-gray-600">Reports Generated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="w-8 h-8 mx-auto text-purple-600 mb-2" />
            <div className="text-2xl font-bold">15</div>
            <p className="text-sm text-gray-600">Active Users</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Activities</CardTitle>
          <CardDescription>Comprehensive activity tracking and compliance logging</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {auditData.map((audit) => (
              <div key={audit.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                <div className={`w-3 h-3 rounded-full mt-2 ${
                  audit.impact === 'Critical' ? 'bg-red-500' : 
                  audit.impact === 'High' ? 'bg-orange-500' : 'bg-blue-500'
                }`}></div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{audit.action}</h4>
                      <p className="text-sm text-gray-600">{audit.details}</p>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>User: {audit.user}</span>
                        <span>Entity: {audit.entity}</span>
                        <span>Time: {audit.timestamp}</span>
                      </div>
                    </div>
                    <Badge variant={audit.impact === 'Critical' ? 'destructive' : 'secondary'}>
                      {audit.impact}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Regulatory Document Authoring & Lifecycle Management
  const renderDocumentAuthoring = () => {
    return <DocumentAuthoringComponent />;
  };

  // Manufacturing Excellence Management
    const [activeDocument, setActiveDocument] = useState(null);
    const [documentFilter, setDocumentFilter] = useState('all');
    const [documentSearch, setDocumentSearch] = useState('');
    const [showTemplateDialog, setShowTemplateDialog] = useState(false);
    const [showVersionDialog, setShowVersionDialog] = useState(false);

    // Comprehensive Document Template Library - Complete regulatory template coverage
    const documentTemplates = [
      // eCTD Module 3 Templates
      {
        id: 'module-3-qos',
        name: 'Module 3 - Quality Overall Summary (QOS)',
        category: 'eCTD Module 3',
        type: 'QOS',
        description: 'Comprehensive quality overview with manufacturing and control strategy',
        sections: [
          '3.1 Quality Overall Summary',
          '3.1.1 General Information',
          '3.1.2 Drug Substance',
          '3.1.3 Drug Product',
          '3.1.4 Appendices'
        ],
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'WHO'],
        languages: ['English', 'German', 'French', 'Japanese', 'Spanish'],
        aiGuidance: true,
        estimatedPages: 25,
        lastUpdated: '2025-08-15',
        version: 'v3.0',
        builtInGuidance: ['ICH Q8(R2)', 'ICH Q9', 'ICH Q10', 'ICH Q11'],
        variablePlaceholders: ['[PRODUCT_NAME]', '[DOSAGE_FORM]', '[STRENGTH]', '[MANUFACTURING_SITE]'],
        regulatoryNotes: 'Based on approved dossiers from major pharmaceutical companies'
      },
      {
        id: 'module-3-2-s',
        name: 'Module 3.2.S - Drug Substance',
        category: 'eCTD Module 3',
        type: 'CTD',
        description: 'Complete drug substance characterization and manufacturing controls',
        sections: [
          '3.2.S.1 General Information',
          '3.2.S.1.1 Nomenclature',
          '3.2.S.1.2 Structure',
          '3.2.S.1.3 General Properties',
          '3.2.S.2 Manufacture',
          '3.2.S.2.1 Manufacturer(s)',
          '3.2.S.2.2 Description of Manufacturing Process',
          '3.2.S.2.3 Control of Materials',
          '3.2.S.2.4 Controls of Critical Steps',
          '3.2.S.2.5 Process Validation',
          '3.2.S.2.6 Manufacturing Process Development',
          '3.2.S.3 Characterisation',
          '3.2.S.3.1 Elucidation of Structure',
          '3.2.S.3.2 Impurities',
          '3.2.S.4 Control of Drug Substance',
          '3.2.S.4.1 Specification',
          '3.2.S.4.2 Analytical Procedures',
          '3.2.S.4.3 Validation of Analytical Procedures',
          '3.2.S.4.4 Batch Analyses',
          '3.2.S.4.5 Justification of Specification',
          '3.2.S.5 Reference Standards or Materials',
          '3.2.S.6 Container Closure System',
          '3.2.S.7 Stability',
          '3.2.S.7.1 Stability Summary and Conclusion',
          '3.2.S.7.2 Post-approval Stability Protocol',
          '3.2.S.7.3 Stability Data'
        ],
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'WHO'],
        languages: ['English', 'German', 'French', 'Japanese', 'Spanish'],
        aiGuidance: true,
        estimatedPages: 65,
        lastUpdated: '2025-08-15',
        version: 'v3.1',
        builtInGuidance: ['ICH Q3A(R2)', 'ICH Q3B(R2)', 'ICH Q6A', 'ICH Q1A(R2)', 'ICH Q2(R1)'],
        variablePlaceholders: ['[API_NAME]', '[MOLECULAR_FORMULA]', '[BATCH_SIZE]', '[RETEST_PERIOD]', '[STORAGE_CONDITIONS]'],
        regulatoryNotes: 'Template validated against 150+ approved API submissions including biosimilars'
      },
      {
        id: 'module-3-2-p',
        name: 'Module 3.2.P - Drug Product',
        category: 'eCTD Module 3',
        type: 'CTD',
        description: 'Drug product development, manufacturing, and control strategy',
        sections: [
          '3.2.P.1 Description and Composition of the Drug Product',
          '3.2.P.2 Pharmaceutical Development',
          '3.2.P.2.1 Components of the Drug Product',
          '3.2.P.2.2 Drug Product',
          '3.2.P.2.3 Manufacturing Process Development',
          '3.2.P.2.4 Container Closure System',
          '3.2.P.2.5 Microbiological Attributes',
          '3.2.P.2.6 Compatibility',
          '3.2.P.3 Manufacture',
          '3.2.P.3.1 Manufacturer(s)',
          '3.2.P.3.2 Batch Formula',
          '3.2.P.3.3 Description of Manufacturing Process',
          '3.2.P.3.4 Controls of Critical Steps',
          '3.2.P.3.5 Process Validation',
          '3.2.P.4 Control of Excipients',
          '3.2.P.4.1 Specifications',
          '3.2.P.4.2 Analytical Procedures',
          '3.2.P.4.3 Validation of Analytical Procedures',
          '3.2.P.4.4 Justification of Specifications',
          '3.2.P.4.5 Excipients of Human or Animal Origin',
          '3.2.P.4.6 Novel Excipients',
          '3.2.P.5 Control of Drug Product',
          '3.2.P.5.1 Specification(s)',
          '3.2.P.5.2 Analytical Procedures',
          '3.2.P.5.3 Validation of Analytical Procedures',
          '3.2.P.5.4 Batch Analyses',
          '3.2.P.5.5 Characterisation of Impurities',
          '3.2.P.5.6 Justification of Specification(s)',
          '3.2.P.6 Reference Standards or Materials',
          '3.2.P.7 Container Closure System',
          '3.2.P.8 Stability',
          '3.2.P.8.1 Stability Summary and Conclusions',
          '3.2.P.8.2 Post-marketing Stability Protocol',
          '3.2.P.8.3 Stability Data'
        ],
        regions: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'WHO'],
        languages: ['English', 'German', 'French', 'Japanese', 'Spanish'],
        aiGuidance: true,
        estimatedPages: 85,
        lastUpdated: '2025-08-15',
        version: 'v3.2',
        builtInGuidance: ['ICH Q8(R2)', 'ICH Q9', 'ICH Q10', 'ICH Q6B', 'ICH Q1A(R2)', 'ICH Q5C'],
        variablePlaceholders: ['[PRODUCT_NAME]', '[DOSAGE_FORM]', '[UNIT_DOSE]', '[BATCH_SIZE]', '[SHELF_LIFE]', '[PACKAGING_TYPE]'],
        regulatoryNotes: 'Incorporates QbD principles from 200+ approved NDA/BLA submissions'
      },
      {
        id: 'module-3-2-a',
        name: 'Module 3.2.A - Appendices',
        category: 'eCTD Module 3',
        type: 'CTD',
        description: 'Supporting documentation and facility information',
        sections: [
          '3.2.A.1 Facilities and Equipment',
          '3.2.A.2 Adventitious Agents Safety Evaluation',
          '3.2.A.3 Excipients'
        ],
        regions: ['FDA', 'EMA', 'PMDA'],
        languages: ['English', 'German', 'French', 'Japanese'],
        aiGuidance: true,
        estimatedPages: 20,
        lastUpdated: '2025-08-10',
        version: 'v2.0',
        builtInGuidance: ['ICH Q7', 'ICH Q5A(R1)'],
        variablePlaceholders: ['[FACILITY_NAME]', '[GMP_CERTIFICATION]', '[EQUIPMENT_LIST]'],
        regulatoryNotes: 'Template covers facility inspections and GMP compliance documentation'
      },

      // CTD Section Templates
      {
        id: 'ctd-quality-summary',
        name: 'CTD Quality Summary',
        category: 'CTD Sections',
        type: 'CTD',
        description: 'Standard CTD quality summary for non-eCTD submissions',
        sections: [
          'S. Drug Substance (Active Pharmaceutical Ingredient)',
          'P. Drug Product (Finished Pharmaceutical Product)',
          'A. Appendices',
          'R. Regional Information'
        ],
        regions: ['Health Canada', 'Australia TGA', 'Brazil ANVISA'],
        languages: ['English', 'Portuguese', 'Spanish'],
        aiGuidance: true,
        estimatedPages: 45,
        lastUpdated: '2025-08-12',
        version: 'v2.5',
        builtInGuidance: ['ICH Q6A', 'ICH Q6B'],
        variablePlaceholders: ['[SUBMISSION_TYPE]', '[PRODUCT_CLASS]', '[THERAPEUTIC_INDICATION]'],
        regulatoryNotes: 'Optimized for non-ICH regions with CTD format requirements'
      },
      {
        id: 'ctd-nonclinical-summary',
        name: 'CTD Non-Clinical Summary',
        category: 'CTD Sections',
        type: 'CTD',
        description: 'Non-clinical overview relevant to CMC safety assessments',
        sections: [
          'Pharmacology',
          'Pharmacokinetics',
          'Toxicology',
          'CMC-Related Safety'
        ],
        regions: ['Health Canada', 'WHO'],
        languages: ['English', 'French'],
        aiGuidance: true,
        estimatedPages: 30,
        lastUpdated: '2025-08-05',
        version: 'v1.8',
        builtInGuidance: ['ICH M4S', 'ICH S6(R1)'],
        variablePlaceholders: ['[SPECIES_TESTED]', '[DOSE_LEVELS]', '[STUDY_DURATION]'],
        regulatoryNotes: 'Focuses on CMC-toxicology interface for pharmaceutical development'
      },

      // IND/IMPD Templates
      {
        id: 'ind-cmc-comprehensive',
        name: 'US IND CMC Section - Comprehensive',
        category: 'IND/IMPD',
        type: 'IND',
        description: 'Complete US IND Chemistry, Manufacturing and Controls section',
        sections: [
          'Drug Substance',
          'Drug Product',
          'Placebo (if applicable)',
          'Labeling',
          'Environmental Assessment'
        ],
        regions: ['FDA'],
        languages: ['English'],
        aiGuidance: true,
        estimatedPages: 40,
        lastUpdated: '2025-08-15',
        version: 'v2.8',
        builtInGuidance: ['FDA Guidance for Industry: IND Applications', '21 CFR 312.23'],
        variablePlaceholders: ['[IND_NUMBER]', '[PHASE_OF_STUDY]', '[INVESTIGATIONAL_PRODUCT]', '[CLINICAL_SITES]'],
        regulatoryNotes: 'Based on 500+ successful IND submissions across all therapeutic areas'
      },
      {
        id: 'impd-part-ii',
        name: 'EU IMPD Part II - Quality Dossier',
        category: 'IND/IMPD',
        type: 'IMPD',
        description: 'European IMPD Part II covering pharmaceutical quality',
        sections: [
          'S. Active Substance',
          'P. Medicinal Product',
          'A. Appendices',
          'R. Regional Information'
        ],
        regions: ['EMA'],
        languages: ['English', 'German', 'French', 'Spanish', 'Italian'],
        aiGuidance: true,
        estimatedPages: 55,
        lastUpdated: '2025-08-12',
        version: 'v2.3',
        builtInGuidance: ['EMA Guideline on IMPD', 'Directive 2001/83/EC'],
        variablePlaceholders: ['[EUDRACT_NUMBER]', '[SPONSOR_NAME]', '[INVESTIGATIONAL_MEDICINAL_PRODUCT]'],
        regulatoryNotes: 'Compliant with current EMA IMPD requirements and CTA procedures'
      },

      // NDA/BLA Templates
      {
        id: 'nda-cmc-comprehensive',
        name: 'FDA NDA CMC - Comprehensive',
        category: 'NDA/BLA',
        type: 'NDA',
        description: 'Complete FDA NDA Chemistry, Manufacturing and Controls sections',
        sections: [
          'Module 3.1 Quality Overall Summary',
          'Module 3.2 Quality Documentation',
          'Regional Information'
        ],
        regions: ['FDA'],
        languages: ['English'],
        aiGuidance: true,
        estimatedPages: 120,
        lastUpdated: '2025-08-15',
        version: 'v3.5',
        builtInGuidance: ['21 CFR 314.50', 'FDA eCTD Guidance', 'ICH M4Q'],
        variablePlaceholders: ['[NDA_NUMBER]', '[PROPRIETARY_NAME]', '[ESTABLISHED_NAME]', '[DOSAGE_FORM]', '[STRENGTH]'],
        regulatoryNotes: 'Template from 300+ approved NDAs including complex generics and 505(b)(2) applications'
      },
      {
        id: 'bla-cmc-biologics',
        name: 'FDA BLA CMC - Biologics',
        category: 'NDA/BLA',
        type: 'BLA',
        description: 'Biological License Application CMC sections for biologics',
        sections: [
          'Module 3.1 Quality Overall Summary',
          'Module 3.2 Quality Documentation - Biologics',
          'Comparability Protocols',
          'Manufacturing Changes'
        ],
        regions: ['FDA'],
        languages: ['English'],
        aiGuidance: true,
        estimatedPages: 150,
        lastUpdated: '2025-08-10',
        version: 'v2.7',
        builtInGuidance: ['21 CFR 601', 'ICH Q5A-E series', 'ICH Q6B', 'ICH Q11'],
        variablePlaceholders: ['[BLA_NUMBER]', '[BIOLOGIC_PRODUCT]', '[CELL_LINE]', '[EXPRESSION_SYSTEM]', '[PURIFICATION_PROCESS]'],
        regulatoryNotes: 'Specialized for monoclonal antibodies, vaccines, and cell/gene therapies'
      },
      {
        id: 'ema-maa-cmc',
        name: 'EMA MAA CMC Sections',
        category: 'NDA/BLA',
        type: 'MAA',
        description: 'European Marketing Authorization Application CMC documentation',
        sections: [
          'Module 3.1 Quality Overall Summary',
          'Module 3.2 Quality Documentation',
          'European Specific Requirements'
        ],
        regions: ['EMA'],
        languages: ['English', 'German', 'French', 'Spanish', 'Italian'],
        aiGuidance: true,
        estimatedPages: 110,
        lastUpdated: '2025-08-13',
        version: 'v2.9',
        builtInGuidance: ['Directive 2001/83/EC', 'EMA Quality Guidelines', 'ICH M4Q'],
        variablePlaceholders: ['[MAA_NUMBER]', '[MEDICINAL_PRODUCT]', '[ATC_CODE]', '[THERAPEUTIC_INDICATION]'],
        regulatoryNotes: 'Covers centralized, decentralized, and mutual recognition procedures'
      },
      {
        id: 'post-approval-supplement',
        name: 'Post-Approval CMC Supplement',
        category: 'NDA/BLA',
        type: 'Supplement',
        description: 'Post-approval manufacturing changes and supplements',
        sections: [
          'Description of Change',
          'Comparability Assessment',
          'Supporting Data',
          'Regulatory Justification'
        ],
        regions: ['FDA', 'EMA', 'Health Canada'],
        languages: ['English', 'German', 'French'],
        aiGuidance: true,
        estimatedPages: 35,
        lastUpdated: '2025-08-08',
        version: 'v1.9',
        builtInGuidance: ['ICH Q12', 'FDA SUPAC Guidelines', 'EMA Variation Guidelines'],
        variablePlaceholders: ['[CHANGE_TYPE]', '[SUPPLEMENT_TYPE]', '[REPORTING_CATEGORY]', '[IMPLEMENTATION_DATE]'],
        regulatoryNotes: 'Covers major/minor changes, prior approval supplements, and annual reports'
      }
    ];

    // Active Documents in development
    const activeDocuments = [
      {
        id: 'DOC-001',
        title: 'Adalimumab Module 3.2.S Drug Substance',
        template: 'TPL-001',
        status: 'in-progress',
        version: '1.3',
        lastModified: '2025-08-15 14:30',
        author: 'Dr. Sarah Johnson',
        wordCount: 8547,
        completionPercent: 72,
        reviewStatus: 'pending-review',
        aiSuggestions: 5,
        language: 'English',
        region: 'FDA'
      },
      {
        id: 'DOC-002',
        title: 'Bevacizumab IND CMC Section',
        template: 'TPL-003',
        status: 'draft',
        version: '0.8',
        lastModified: '2025-08-14 16:45',
        author: 'Mark Chen',
        wordCount: 4892,
        completionPercent: 45,
        reviewStatus: 'draft',
        aiSuggestions: 12,
        language: 'English',
        region: 'FDA'
      },
      {
        id: 'DOC-003',
        title: 'Atorvastatin Module 3.2.P Drug Product',
        template: 'TPL-002',
        status: 'review',
        version: '2.1',
        lastModified: '2025-08-13 11:20',
        author: 'Dr. Lisa Rodriguez',
        wordCount: 12234,
        completionPercent: 95,
        reviewStatus: 'under-review',
        aiSuggestions: 2,
        language: 'English',
        region: 'EMA'
      }
    ];

    const openDocumentEditor = (document) => {
      // Enhanced integration with existing DocumentEditor
      const editorUrl = new URL('/editor', window.location.origin);
      editorUrl.searchParams.set('template', document.template || '');
      editorUrl.searchParams.set('title', document.title || '');
      editorUrl.searchParams.set('type', document.type || 'CMC');
      editorUrl.searchParams.set('version', document.version || '1.0');
      editorUrl.searchParams.set('region', document.region || 'FDA');
      window.open(editorUrl.href, '_blank');
    };

    const createNewDocument = (template, selectedRegion = 'FDA') => {
      const newDocTitle = `New ${template.name} - ${selectedRegion} - ${new Date().toLocaleDateString()}`;
      const editorUrl = new URL('/editor', window.location.origin);
      editorUrl.searchParams.set('template', template.id);
      editorUrl.searchParams.set('title', newDocTitle);
      editorUrl.searchParams.set('type', template.type);
      editorUrl.searchParams.set('category', template.category);
      editorUrl.searchParams.set('sections', JSON.stringify(template.sections));
      editorUrl.searchParams.set('region', selectedRegion);
      editorUrl.searchParams.set('guidance', JSON.stringify(template.builtInGuidance || []));
      editorUrl.searchParams.set('placeholders', JSON.stringify(template.variablePlaceholders || []));
      editorUrl.searchParams.set('regulatoryNotes', template.regulatoryNotes || '');
      window.open(editorUrl.href, '_blank');
    };

    return (
      <div className="space-y-6" data-testid="document-authoring-tab">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Regulatory Document Authoring</h2>
            <p className="text-gray-600 mt-1">Pre-built templates for Module 3 (eCTD), CTD sections, IND/IMPD, NDA/BLA CMC sections</p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
              <BookOpen className="w-4 h-4 mr-2" />
              Template Library
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => setShowTemplateDialog(true)}
              data-testid="new-document-btn"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              New Document
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="w-8 h-8 mx-auto text-blue-600 mb-2" />
              <div className="text-2xl font-bold">3</div>
              <p className="text-sm text-gray-600">Active Documents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <BookOpen className="w-8 h-8 mx-auto text-green-600 mb-2" />
              <div className="text-2xl font-bold">12</div>
              <p className="text-sm text-gray-600">Templates Available</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Brain className="w-8 h-8 mx-auto text-purple-600 mb-2" />
              <div className="text-2xl font-bold">19</div>
              <p className="text-sm text-gray-600">AI Suggestions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-orange-600 mb-2" />
              <div className="text-2xl font-bold">71%</div>
              <p className="text-sm text-gray-600">Avg Completion</p>
            </CardContent>
          </Card>
        </div>

        {/* Document Templates Section */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Document Templates</CardTitle>
              <div className="flex space-x-2">
                <Select value={documentFilter} onValueChange={setDocumentFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="eCTD">eCTD Module 3</SelectItem>
                    <SelectItem value="IND">IND/IMPD</SelectItem>
                    <SelectItem value="NDA">NDA/BLA</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <CardDescription>Pre-built regulatory document templates with AI-driven guidance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documentTemplates.map((template) => (
                <Card key={template.id} className="border-2 hover:border-blue-300 cursor-pointer">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription>{template.category}</CardDescription>
                      </div>
                      <div className="flex space-x-1">
                        {template.aiGuidance && (
                          <Badge variant="secondary">
                            <Brain className="w-3 h-3 mr-1" />
                            AI Guided
                          </Badge>
                        )}
                        <Badge variant="outline">{template.version}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Sections: {template.sections.length}</span>
                        <span>Est. {template.estimatedPages} pages</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          {template.regions.slice(0, 3).map((region) => (
                            <Badge key={region} variant="outline" className="text-xs">
                              {region}
                            </Badge>
                          ))}
                          {template.regions.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{template.regions.length - 3}
                            </Badge>
                          )}
                        </div>
                        <div className="flex space-x-1">
                          <Button size="sm" variant="outline" data-testid={`preview-template-${template.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => createNewDocument(template)}
                            data-testid={`use-template-${template.id}`}
                          >
                            Use Template
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Active Documents Section */}
        <Card>
          <CardHeader>
            <CardTitle>Active Documents</CardTitle>
            <CardDescription>Documents currently in development or review</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeDocuments.map((doc) => (
                <Card key={doc.id} className="border hover:border-blue-300">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-semibold text-lg">{doc.title}</h3>
                          <Badge variant={
                            doc.status === 'in-progress' ? 'default' :
                            doc.status === 'review' ? 'secondary' : 'outline'
                          }>
                            {doc.status}
                          </Badge>
                          <Badge variant={
                            doc.reviewStatus === 'under-review' ? 'secondary' :
                            doc.reviewStatus === 'pending-review' ? 'outline' : 'default'
                          }>
                            {doc.reviewStatus}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Version:</span> {doc.version}
                          </div>
                          <div>
                            <span className="font-medium">Words:</span> {doc.wordCount.toLocaleString()}
                          </div>
                          <div>
                            <span className="font-medium">Author:</span> {doc.author}
                          </div>
                          <div>
                            <span className="font-medium">Region:</span> {doc.region}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <div className="text-right text-sm text-gray-500">
                          Last modified: {doc.lastModified}
                        </div>
                        <Progress value={doc.completionPercent} className="w-24" />
                        <span className="text-xs text-gray-500">{doc.completionPercent}% complete</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-4">
                        {doc.aiSuggestions > 0 && (
                          <div className="flex items-center space-x-1 text-sm text-blue-600">
                            <Sparkles className="w-4 h-4" />
                            <span>{doc.aiSuggestions} AI suggestions</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          <Languages className="w-4 h-4" />
                          <span>{doc.language}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-sm text-gray-500">
                          <GitBranch className="w-4 h-4" />
                          <span>Version Control</span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowVersionDialog(true)}
                          data-testid={`version-history-${doc.id}`}
                        >
                          <History className="w-4 h-4 mr-1" />
                          Version History
                        </Button>
                        <Button size="sm" variant="outline">
                          <Link className="w-4 h-4 mr-1" />
                          Auto-Citations
                        </Button>
                        <Button 
                          size="sm" 
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => openDocumentEditor(doc)}
                        >
                          <Edit3 className="w-4 h-4 mr-1" />
                          Edit Document
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Content Suggestions Panel */}
        <Card className="border-blue-200">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-blue-600" />
                AI Content Suggestions & Regulatory Guidance
              </CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                <Brain className="w-3 h-3 mr-1" />
                Active
              </Badge>
            </div>
            <CardDescription>Real-time content suggestions mapped to ICH Q-series, WHO, EMA, FDA, PMDA regulatory expectations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  section: 'Module 3.2.S.3 Characterisation',
                  suggestion: 'Consider adding detailed impurity profiling data per ICH Q3A(R2) guidelines',
                  guidance: 'ICH Q3A(R2)',
                  priority: 'High',
                  region: 'FDA/EMA'
                },
                {
                  section: 'Module 3.2.P.2 Pharmaceutical Development',
                  suggestion: 'Include QbD principles and design space definition as per ICH Q8(R2)',
                  guidance: 'ICH Q8(R2)',
                  priority: 'Medium',
                  region: 'Global'
                },
                {
                  section: 'Module 3.2.S.7 Stability',
                  suggestion: 'Add accelerated stability data following ICH Q1A(R2) stress conditions',
                  guidance: 'ICH Q1A(R2)',
                  priority: 'High',
                  region: 'FDA'
                },
                {
                  section: 'Module 3.2.P.5 Control of Drug Product',
                  suggestion: 'Enhance analytical method validation per ICH Q2(R1) requirements',
                  guidance: 'ICH Q2(R1)',
                  priority: 'Medium',
                  region: 'EMA/PMDA'
                }
              ].map((suggestion, index) => (
                <div key={index} className="p-4 border rounded-lg hover:border-blue-300">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-blue-900">{suggestion.section}</h4>
                      <p className="text-sm text-gray-700 mt-1">{suggestion.suggestion}</p>
                    </div>
                    <div className="flex space-x-1 ml-4">
                      <Badge variant={suggestion.priority === 'High' ? 'destructive' : 'secondary'} className="text-xs">
                        {suggestion.priority}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {suggestion.region}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <Flag className="w-3 h-3" />
                      <span>Guidance: {suggestion.guidance}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" className="text-xs">
                        <Link className="w-3 h-3 mr-1" />
                        Reference
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs">
                        <PenTool className="w-3 h-3 mr-1" />
                        Apply
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Key Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-blue-200">
            <CardContent className="p-6 text-center">
              <Brain className="w-12 h-12 mx-auto text-blue-600 mb-4" />
              <h3 className="font-semibold mb-2">AI-Guided Authoring</h3>
              <p className="text-sm text-gray-600">Content suggestions mapped to ICH Q-series, WHO, EMA, FDA, PMDA expectations</p>
            </CardContent>
          </Card>
          
          <Card className="border-green-200">
            <CardContent className="p-6 text-center">
              <GitBranch className="w-12 h-12 mx-auto text-green-600 mb-4" />
              <h3 className="font-semibold mb-2">Version Control</h3>
              <p className="text-sm text-gray-600">Regulatory-compliant audit trails with redlining capabilities</p>
            </CardContent>
          </Card>
          
          <Card className="border-purple-200">
            <CardContent className="p-6 text-center">
              <Link className="w-12 h-12 mx-auto text-purple-600 mb-4" />
              <h3 className="font-semibold mb-2">Auto-Citations</h3>
              <p className="text-sm text-gray-600">Reference linking to batch records, stability data, validation reports</p>
            </CardContent>
          </Card>
          
          <Card className="border-orange-200">
            <CardContent className="p-6 text-center">
              <Globe className="w-12 h-12 mx-auto text-orange-600 mb-4" />
              <h3 className="font-semibold mb-2">Global Localization</h3>
              <p className="text-sm text-gray-600">Language localization workflows for global regulatory submissions</p>
            </CardContent>
          </Card>
        </div>

        {/* Template Selection Dialog */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Template Library - Regulatory Document Templates</DialogTitle>
              <DialogDescription>
                Choose from pre-built templates for Module 3 (eCTD), CTD sections, IND/IMPD, and NDA/BLA CMC sections
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Advanced Filtering Options */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select value={documentFilter} onValueChange={setDocumentFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="eCTD Module 3">eCTD Module 3</SelectItem>
                    <SelectItem value="CTD Sections">CTD Sections</SelectItem>
                    <SelectItem value="IND/IMPD">IND/IMPD</SelectItem>
                    <SelectItem value="NDA/BLA">NDA/BLA</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Regions</SelectItem>
                    <SelectItem value="FDA">FDA (US)</SelectItem>
                    <SelectItem value="EMA">EMA (EU)</SelectItem>
                    <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
                    <SelectItem value="Health Canada">Health Canada</SelectItem>
                    <SelectItem value="WHO">WHO</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Document type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="QOS">Quality Overall Summary</SelectItem>
                    <SelectItem value="CTD">CTD Module</SelectItem>
                    <SelectItem value="IND">IND Submission</SelectItem>
                    <SelectItem value="IMPD">IMPD Submission</SelectItem>
                    <SelectItem value="NDA">NDA/BLA</SelectItem>
                    <SelectItem value="BLA">BLA Biologics</SelectItem>
                    <SelectItem value="MAA">EMA MAA</SelectItem>
                    <SelectItem value="Supplement">Post-Approval</SelectItem>
                  </SelectContent>
                </Select>
                
                <Input 
                  placeholder="Search templates..." 
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* Template Statistics */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{documentTemplates.length}</div>
                  <div className="text-sm text-gray-600">Total Templates</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{documentTemplates.filter(t => t.category === 'eCTD Module 3').length}</div>
                  <div className="text-sm text-gray-600">eCTD Module 3</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{documentTemplates.filter(t => t.category === 'IND/IMPD').length}</div>
                  <div className="text-sm text-gray-600">IND/IMPD</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{documentTemplates.filter(t => t.category === 'NDA/BLA').length}</div>
                  <div className="text-sm text-gray-600">NDA/BLA</div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {documentTemplates
                  .filter(template => 
                    documentFilter === 'all' || 
                    template.category.toLowerCase().includes(documentFilter.toLowerCase())
                  )
                  .filter(template =>
                    documentSearch === '' ||
                    template.name.toLowerCase().includes(documentSearch.toLowerCase()) ||
                    template.description.toLowerCase().includes(documentSearch.toLowerCase())
                  )
                  .map((template) => (
                  <Card key={template.id} className="border-2 hover:border-blue-300 cursor-pointer">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription>{template.category}</CardDescription>
                        </div>
                        <div className="flex flex-col space-y-1">
                          {template.aiGuidance && (
                            <Badge variant="secondary" className="text-xs">
                              <Brain className="w-3 h-3 mr-1" />
                              AI Guided
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">{template.version}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                      
                      <div className="space-y-3">
                        <div className="text-sm">
                          <h4 className="font-medium mb-2">Sections Included:</h4>
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {template.sections.slice(0, 5).map((section, index) => (
                              <div key={index} className="text-xs text-gray-600">• {section}</div>
                            ))}
                            {template.sections.length > 5 && (
                              <div className="text-xs text-gray-500">+ {template.sections.length - 5} more sections</div>
                            )}
                          </div>
                        </div>

                        {/* Built-in Guidance Display */}
                        {template.builtInGuidance && (
                          <div className="text-sm">
                            <h4 className="font-medium mb-2">Built-in Regulatory Guidance:</h4>
                            <div className="flex flex-wrap gap-1">
                              {template.builtInGuidance.slice(0, 3).map((guidance, index) => (
                                <Badge key={index} variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                  {guidance}
                                </Badge>
                              ))}
                              {template.builtInGuidance.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{template.builtInGuidance.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Variable Placeholders */}
                        {template.variablePlaceholders && (
                          <div className="text-sm">
                            <h4 className="font-medium mb-2">Variable Placeholders:</h4>
                            <div className="text-xs text-gray-600 space-y-1">
                              {template.variablePlaceholders.slice(0, 3).map((placeholder, index) => (
                                <div key={index} className="font-mono bg-gray-100 px-2 py-1 rounded inline-block mr-1">
                                  {placeholder}
                                </div>
                              ))}
                              {template.variablePlaceholders.length > 3 && (
                                <span className="text-gray-500">+{template.variablePlaceholders.length - 3} more</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Regulatory Notes */}
                        {template.regulatoryNotes && (
                          <div className="text-xs p-2 bg-green-50 border border-green-200 rounded">
                            <div className="flex items-start space-x-1">
                              <FileCheck className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                              <span className="text-green-700">{template.regulatoryNotes}</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Est. {template.estimatedPages} pages • {template.version}</span>
                          <span>Updated: {template.lastUpdated}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <div className="flex flex-wrap gap-1">
                            {template.regions.map((region) => (
                              <Badge key={region} variant="outline" className="text-xs">
                                {region}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex space-x-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              data-testid={`dialog-preview-${template.id}`}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Preview
                            </Button>
                            <Button 
                              size="sm" 
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => {
                                createNewDocument(template);
                                setShowTemplateDialog(false);
                              }}
                              data-testid={`dialog-create-${template.id}`}
                            >
                              <Edit3 className="w-3 h-3 mr-1" />
                              Create Document
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>

        {/* Version Control Dialog */}
        <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Version History & Control</DialogTitle>
              <DialogDescription>
                Track changes, manage versions, and view regulatory compliance audit trails
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <Card>
                  <CardContent className="p-4">
                    <GitBranch className="w-8 h-8 mx-auto text-blue-600 mb-2" />
                    <div className="text-lg font-bold">v1.3</div>
                    <div className="text-xs text-gray-500">Current Version</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <History className="w-8 h-8 mx-auto text-green-600 mb-2" />
                    <div className="text-lg font-bold">15</div>
                    <div className="text-xs text-gray-500">Tracked Changes</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <Shield className="w-8 h-8 mx-auto text-purple-600 mb-2" />
                    <div className="text-lg font-bold">98%</div>
                    <div className="text-xs text-gray-500">Compliance Score</div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Recent Changes</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {[
                    { version: '1.3', date: '2025-08-15 14:30', author: 'Dr. Sarah Johnson', change: 'Updated stability data references', type: 'content' },
                    { version: '1.2', date: '2025-08-14 11:20', author: 'Mark Chen', change: 'Added manufacturing process details', type: 'content' },
                    { version: '1.1', date: '2025-08-13 16:45', author: 'Dr. Sarah Johnson', change: 'Corrected analytical method citations', type: 'correction' },
                    { version: '1.0', date: '2025-08-10 09:15', author: 'Dr. Sarah Johnson', change: 'Initial document creation from template', type: 'creation' }
                  ].map((entry, index) => (
                    <div key={index} className="flex justify-between items-center p-3 border rounded-lg">
                      <div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">v{entry.version}</Badge>
                          <span className="text-sm font-medium">{entry.change}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {entry.author} • {entry.date}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Badge variant={
                          entry.type === 'creation' ? 'default' :
                          entry.type === 'correction' ? 'destructive' : 'secondary'
                        } className="text-xs">
                          {entry.type}
                        </Badge>
                        <Button size="sm" variant="outline">
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">CMC Management Platform</h1>
          <p className="text-gray-600 mt-2">Chemistry, Manufacturing & Controls - Pharmaceutical Development</p>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="grid grid-cols-1 gap-4 mb-4">
            <TabsList className="grid w-full grid-cols-12" data-testid="cmc-comprehensive-tabs">
              <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="analytical" data-testid="tab-analytical">Analytical</TabsTrigger>
              <TabsTrigger value="process" data-testid="tab-process">Process</TabsTrigger>
              <TabsTrigger value="stability" data-testid="tab-stability">Stability</TabsTrigger>
              <TabsTrigger value="quality" data-testid="tab-quality">Quality</TabsTrigger>
              <TabsTrigger value="regulatory" data-testid="tab-regulatory">Regulatory</TabsTrigger>
              <TabsTrigger value="document-authoring" data-testid="tab-document-authoring">Document Authoring</TabsTrigger>
              <TabsTrigger value="manufacturing" data-testid="tab-manufacturing">Manufacturing</TabsTrigger>
              <TabsTrigger value="supply-chain" data-testid="tab-supply-chain">Supply Chain</TabsTrigger>
              <TabsTrigger value="intelligence" data-testid="tab-intelligence">AI Intelligence</TabsTrigger>
              <TabsTrigger value="risk-management" data-testid="tab-risk">Risk Management</TabsTrigger>
              <TabsTrigger value="audit-docs" data-testid="tab-audit">Audit & Docs</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard">{renderDashboard()}</TabsContent>
          <TabsContent value="analytical">{renderAnalyticalMethods()}</TabsContent>
          <TabsContent value="process">{renderProcessValidation()}</TabsContent>
          <TabsContent value="stability">{renderStabilityStudies()}</TabsContent>
          <TabsContent value="quality">{renderQualityControl()}</TabsContent>
          <TabsContent value="regulatory">{renderRegulatoryManagement()}</TabsContent>
          <TabsContent value="document-authoring">{renderDocumentAuthoring()}</TabsContent>
          <TabsContent value="manufacturing">{renderManufacturingExcellence()}</TabsContent>
          <TabsContent value="supply-chain">{renderSupplyChainManagement()}</TabsContent>
          <TabsContent value="intelligence">{renderIntelligenceHub()}</TabsContent>
          <TabsContent value="risk-management">{renderRiskManagement()}</TabsContent>
          <TabsContent value="audit-docs">{renderAuditAndDocumentation()}</TabsContent>
        </Tabs>

        {/* Dynamic Modal for all CMC operations */}
        <CMCModal
          isOpen={showModal}
          onClose={closeModal}
          type={modalType}
          item={selectedItem}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};

// Modal Component for CMC Forms
const CMCModal = ({ isOpen, onClose, type, item, onSubmit }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (item) {
      setFormData(item);
    } else {
      setFormData({});
    }
  }, [item, type]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const renderFormContent = () => {
    switch (type) {
      case 'analytical-methods':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Method Code</Label>
                <Input 
                  value={formData.methodCode || ''} 
                  onChange={(e) => handleInputChange('methodCode', e.target.value)}
                  placeholder="AM-001"
                />
              </div>
              <div>
                <Label>Technique</Label>
                <Select value={formData.technique || ''} onValueChange={(value) => handleInputChange('technique', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select technique" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HPLC">HPLC</SelectItem>
                    <SelectItem value="GC">GC</SelectItem>
                    <SelectItem value="UV-VIS">UV-VIS</SelectItem>
                    <SelectItem value="FTIR">FTIR</SelectItem>
                    <SelectItem value="NMR">NMR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input 
                value={formData.title || ''} 
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="HPLC method for assay determination"
              />
            </div>
            <div>
              <Label>Purpose</Label>
              <Textarea 
                value={formData.purpose || ''} 
                onChange={(e) => handleInputChange('purpose', e.target.value)}
                placeholder="Quantitative determination of active ingredient..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Analyte</Label>
                <Input 
                  value={formData.analyte || ''} 
                  onChange={(e) => handleInputChange('analyte', e.target.value)}
                  placeholder="Active Pharmaceutical Ingredient"
                />
              </div>
              <div>
                <Label>Matrix</Label>
                <Input 
                  value={formData.matrix || ''} 
                  onChange={(e) => handleInputChange('matrix', e.target.value)}
                  placeholder="Tablet, solution, etc."
                />
              </div>
            </div>
          </div>
        );

      case 'process-validation':
        return (
          <div className="space-y-4">
            <div>
              <Label>Process Name</Label>
              <Input 
                value={formData.processName || ''} 
                onChange={(e) => handleInputChange('processName', e.target.value)}
                placeholder="API Synthesis Process"
              />
            </div>
            <div>
              <Label>Validation Stage</Label>
              <Select value={formData.stage || ''} onValueChange={(value) => handleInputChange('stage', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="design">Stage 1: Process Design</SelectItem>
                  <SelectItem value="qualification">Stage 2: Process Qualification</SelectItem>
                  <SelectItem value="verification">Stage 3: Continued Process Verification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Batch Numbers (comma-separated)</Label>
              <Input 
                value={formData.batchNumbers?.join(', ') || ''} 
                onChange={(e) => handleInputChange('batchNumbers', e.target.value.split(', '))}
                placeholder="Batch-001, Batch-002, Batch-003"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status || ''} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'stability-studies':
        return (
          <div className="space-y-4">
            <div>
              <Label>Study Title</Label>
              <Input 
                value={formData.studyTitle || ''} 
                onChange={(e) => handleInputChange('studyTitle', e.target.value)}
                placeholder="Long-term stability study - Product X"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Product Name</Label>
                <Input 
                  value={formData.productName || ''} 
                  onChange={(e) => handleInputChange('productName', e.target.value)}
                  placeholder="Product X 10mg tablets"
                />
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input 
                  value={formData.batchNumber || ''} 
                  onChange={(e) => handleInputChange('batchNumber', e.target.value)}
                  placeholder="ST-2024-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Study Type</Label>
                <Select value={formData.studyType || ''} onValueChange={(value) => handleInputChange('studyType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long-term">Long-term</SelectItem>
                    <SelectItem value="accelerated">Accelerated</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="stress">Stress Testing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Storage Conditions</Label>
                <Select value={formData.storageConditions || ''} onValueChange={(value) => handleInputChange('storageConditions', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select conditions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25C/60%RH">25°C/60% RH</SelectItem>
                    <SelectItem value="30C/75%RH">30°C/75% RH</SelectItem>
                    <SelectItem value="40C/75%RH">40°C/75% RH</SelectItem>
                    <SelectItem value="-20C">-20°C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input 
                type="date"
                value={formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''} 
                onChange={(e) => handleInputChange('startDate', e.target.value)}
              />
            </div>
          </div>
        );

      case 'qc-testing':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sample ID</Label>
                <Input 
                  value={formData.sampleId || ''} 
                  onChange={(e) => handleInputChange('sampleId', e.target.value)}
                  placeholder="QC-2024-001"
                />
              </div>
              <div>
                <Label>Sample Type</Label>
                <Select value={formData.sampleType || ''} onValueChange={(value) => handleInputChange('sampleType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw-material">Raw Material</SelectItem>
                    <SelectItem value="in-process">In-Process</SelectItem>
                    <SelectItem value="finished-product">Finished Product</SelectItem>
                    <SelectItem value="stability">Stability Sample</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Test Method</Label>
              <Input 
                value={formData.testMethod || ''} 
                onChange={(e) => handleInputChange('testMethod', e.target.value)}
                placeholder="USP <xxx> Assay Method"
              />
            </div>
            <div>
              <Label>Test Date</Label>
              <Input 
                type="date"
                value={formData.testDate ? new Date(formData.testDate).toISOString().split('T')[0] : ''} 
                onChange={(e) => handleInputChange('testDate', e.target.value)}
              />
            </div>
            <div>
              <Label>Pass/Fail Status</Label>
              <Select value={formData.passFailStatus || ''} onValueChange={(value) => handleInputChange('passFailStatus', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">Pass</SelectItem>
                  <SelectItem value="fail">Fail</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return <div>Form not implemented for {type}</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit' : 'Create'} {type?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </DialogTitle>
          <DialogDescription>
            {item ? 'Update the details below' : 'Fill in the details to create a new entry'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          {renderFormContent()}
          
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {item ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ComprehensiveCMCPlatform;