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
 Award,
 Globe,
 Archive,
 Edit3,
 BookOpen,
 GitBranch,
 Link,
 Zap,
 Languages,
 Flag,
 History,
 RefreshCw,
 Brain,
 Sparkles,
 PenTool,
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
 '/api/cmc/drug-products',
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
 title: 'Error',
 description: 'Failed to load CMC data',
 variant: 'destructive',
 });
 } finally {
 setLoading(false);
 }
 };

 const loadAdvancedCMCData = async () => {
 // Fetch audit trail, risk assessments, and submission data from backend
 try {
 const [auditRes, riskRes, submissionRes] = await Promise.all([
 fetch(`/api/cmc/audit-trail?organizationId=${organizationId}`)
 .then(r => r.json()).catch(() => ({ data: [] })),
 fetch(`/api/cmc/risk-assessments?organizationId=${organizationId}`)
 .then(r => r.json()).catch(() => ({ data: [] })),
 fetch(`/api/submission-center/projects`)
 .then(r => r.json()).catch(() => ({ data: [] })),
 ]);
 setAuditData(auditRes.data || []);
 setRiskAssessments(riskRes.data || []);
 setSubmissionData((submissionRes.data || []).map(p => ({
 id: p.id || p.projectId,
 type: p.submissionType || p.type || 'IND',
 agency: p.agency || 'FDA',
 status: p.status || 'Draft',
 progress: p.completionPercentage || p.progress || 0,
 })));
 } catch (error) {
 console.warn('[CMC] Could not load advanced data:', error);
 }
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

 const handleSubmit = async formData => {
 try {
 const endpoint = `/api/cmc/${modalType}`;
 const method = selectedItem ? 'PUT' : 'POST';
 const url = selectedItem ? `${endpoint}/${selectedItem.id}` : endpoint;

 const response = await fetch(url, {
 method,
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ ...formData, organizationId }),
 });

 if (response.ok) {
 toast({
 title: 'Success',
 description: `${modalType.replace('-', ' ')} ${selectedItem ? 'updated' : 'created'} successfully`,
 });
 closeModal();
 loadAllCMCData();
 } else {
 throw new Error('Failed to save');
 }
 } catch (error) {
 toast({
 title: 'Error',
 description: 'Failed to save data',
 variant: 'destructive',
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
 <TestTube className="w-8 h-8 text-stone-600" />
 <div>
 <p className="text-2xl font-bold">{analyticalMethods.length}</p>
 <p className="text-sm text-gray-600">Analytical Methods</p>
 <Badge
 variant={
 analyticalMethods.filter(m => m.status === 'validated').length > 0
 ? 'default'
 : 'secondary'
 }
 >
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
 <Badge
 variant={
 processValidations.filter(p => p.status === 'completed').length > 0
 ? 'default'
 : 'secondary'
 }
 >
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
 <Badge
 variant={
 stabilityStudies.filter(s => s.status === 'ongoing').length > 0
 ? 'default'
 : 'secondary'
 }
 >
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
 <Badge
 variant={
 qcTesting.filter(q => q.passFailStatus === 'pass').length > 0
 ? 'default'
 : 'destructive'
 }
 >
 {Math.round(
 (qcTesting.filter(q => q.passFailStatus === 'pass').length /
 Math.max(qcTesting.length, 1)) *
 100
 )}
 % Pass
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
 <div className="flex items-center justify-between p-3 bg-stone-50 rounded">
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
 <div className="flex items-center justify-between p-3 bg-stone-50 rounded border-l-4 border-stone-200">
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
 {analyticalMethods.map(method => (
 <Card key={method.id} className="cursor-pointer hover:shadow-md transition-shadow">
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle className="text-lg">{method.methodCode}</CardTitle>
 <CardDescription>{method.title}</CardDescription>
 </div>
 <Badge
 variant={
 method.status === 'validated'
 ? 'default'
 : method.status === 'validation'
 ? 'secondary'
 : 'outline'
 }
 >
 {method.status}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 <p>
 <strong>Technique:</strong> {method.technique}
 </p>
 <p>
 <strong>Analyte:</strong> {method.analyte}
 </p>
 <p>
 <strong>Matrix:</strong> {method.matrix}
 </p>
 <div className="flex space-x-2 mt-4">
 <Button
 size="sm"
 variant="outline"
 onClick={() => openModal('analytical-methods', method)}
 >
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
 <p className="text-gray-500 mb-4">
 Create your first analytical method to get started with CMC documentation.
 </p>
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
 <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
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
 {processValidations.map(validation => (
 <Card key={validation.id}>
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle>{validation.processName}</CardTitle>
 <CardDescription>
 Stage{' '}
 {validation.stage === 'design'
 ? '1'
 : validation.stage === 'qualification'
 ? '2'
 : '3'}
 : {validation.stage}
 </CardDescription>
 </div>
 <Badge
 variant={
 validation.status === 'completed'
 ? 'default'
 : validation.status === 'in-progress'
 ? 'secondary'
 : 'outline'
 }
 >
 {validation.status}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <p className="text-sm text-gray-600">Batch Numbers</p>
 <p className="font-medium">
 {validation.batchNumbers?.join(', ') || 'Not assigned'}
 </p>
 </div>
 <div>
 <p className="text-sm text-gray-600">Lead Validator</p>
 <p className="font-medium">User #{validation.leadValidator || 'Unassigned'}</p>
 </div>
 </div>
 <div className="flex space-x-2 mt-4">
 <Button
 size="sm"
 variant="outline"
 onClick={() => openModal('process-validation', validation)}
 >
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
 <p className="text-gray-500 mb-4">
 Start your first process validation following the 3-stage lifecycle approach.
 </p>
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
 {stabilityStudies.map(study => (
 <Card key={study.id} className="cursor-pointer hover:shadow-md transition-shadow">
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle className="text-lg">{study.studyTitle}</CardTitle>
 <CardDescription>{study.productName}</CardDescription>
 </div>
 <Badge
 variant={
 study.status === 'completed'
 ? 'default'
 : study.status === 'ongoing'
 ? 'secondary'
 : 'outline'
 }
 >
 {study.status}
 </Badge>
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-2">
 <p>
 <strong>Type:</strong> {study.studyType}
 </p>
 <p>
 <strong>Conditions:</strong> {study.storageConditions}
 </p>
 <p>
 <strong>Batch:</strong> {study.batchNumber}
 </p>
 <p>
 <strong>Start Date:</strong> {new Date(study.startDate).toLocaleDateString()}
 </p>
 {study.shelfLife && (
 <p>
 <strong>Shelf Life:</strong> {study.shelfLife}
 </p>
 )}
 <div className="flex space-x-2 mt-4">
 <Button
 size="sm"
 variant="outline"
 onClick={() => openModal('stability-studies', study)}
 >
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
 <p className="text-gray-500 mb-4">
 Initiate stability studies following ICH Q1 guidelines.
 </p>
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
 {qcTesting.map(test => (
 <Card key={test.id}>
 <CardHeader>
 <div className="flex justify-between items-start">
 <div>
 <CardTitle>{test.sampleId}</CardTitle>
 <CardDescription>
 {test.sampleType} - {test.testMethod}
 </CardDescription>
 </div>
 <Badge
 variant={
 test.passFailStatus === 'pass'
 ? 'default'
 : test.passFailStatus === 'fail'
 ? 'destructive'
 : 'secondary'
 }
 >
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
 <p className="text-gray-500 mb-4">
 Start quality control testing for raw materials, in-process, and finished products.
 </p>
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
 <Button className="bg-stone-800 hover:bg-stone-900" data-testid="button-new-regulatory">
 <FileText className="w-4 h-4 mr-2" />
 New Submission
 </Button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <Card className="border-stone-200">
 <CardContent className="p-6">
 <div className="flex items-center space-x-3">
 <FileText className="w-8 h-8 text-stone-600" />
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
 {
 activity: 'IND-2024-015 submitted to FDA',
 date: '2025-08-14',
 status: 'Submitted',
 },
 {
 activity: 'EMA feedback received for MA-2024-007',
 date: '2025-08-13',
 status: 'Action Required',
 },
 {
 activity: 'Health Canada approval for CTN-2024-012',
 date: '2025-08-12',
 status: 'Approved',
 },
 {
 activity: 'PMDA meeting scheduled for JP-2024-003',
 date: '2025-08-11',
 status: 'Scheduled',
 },
 ].map((item, index) => (
 <div key={index} className="p-3 border rounded-lg">
 <div className="flex justify-between items-start">
 <div>
 <p className="font-medium text-sm">{item.activity}</p>
 <p className="text-xs text-gray-600">{item.date}</p>
 </div>
 <Badge
 variant={
 item.status === 'Approved'
 ? 'default'
 : item.status === 'Action Required'
 ? 'destructive'
 : 'secondary'
 }
 >
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
 {
 alert: 'GMP inspection scheduled - Site A',
 date: '2025-09-15',
 priority: 'High',
 },
 { alert: 'Annual product review due', date: '2025-08-30', priority: 'Medium' },
 {
 alert: 'Pharmacovigilance report deadline',
 date: '2025-09-01',
 priority: 'High',
 },
 ].map((alert, index) => (
 <div
 key={index}
 className={`p-3 rounded border-l-4 ${
 alert.priority === 'High'
 ? 'bg-red-50 border-red-200'
 : 'bg-yellow-50 border-yellow-200'
 }`}
 >
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
 <p className="text-gray-600 mt-1">
 GMP compliance, batch tracking, continuous improvement
 </p>
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

 <Card className="border-stone-200">
 <CardContent className="p-6">
 <div className="flex items-center space-x-3">
 <Package className="w-8 h-8 text-stone-600" />
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
 { product: 'Product C 50mg', batches: 12, yield: 95.1, quality: 99.9 },
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
 { equipment: 'Blender #4', status: 'Operational', utilization: 91 },
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
 <p className="text-gray-600 mt-1">
 Vendor qualification, inventory management, risk assessment
 </p>
 </div>
 <Button variant="outline" data-testid="button-supplier-audit">
 <Users className="w-4 h-4 mr-2" />
 Supplier Audit
 </Button>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
 <Card className="border-stone-200">
 <CardContent className="p-6">
 <div className="flex items-center space-x-3">
 <Users className="w-8 h-8 text-stone-600" />
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
 { name: 'Global Excipients Ltd', score: 91, orders: 32, onTime: 92 },
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
 { material: 'Packaging Material Gamma', stock: 2500, min: 1000, status: 'Good' },
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
 <div className="text-xs text-gray-600">Min: {material.min} kg</div>
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
 {
 risk: 'Single source supplier',
 level: 'High',
 mitigation: 'Identify backup supplier',
 },
 { risk: 'Shipping delays', level: 'Medium', mitigation: 'Buffer stock increase' },
 { risk: 'Quality issues', level: 'Low', mitigation: 'Enhanced testing' },
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
 <React.Suspense
 fallback={
 <div className="flex items-center justify-center h-64">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-700"></div>
 <span className="ml-2 text-gray-600">Loading AI Intelligence Hub...</span>
 </div>
 }
 >
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

 <Card className="border-stone-200">
 <CardContent className="p-6">
 <div className="flex items-center space-x-3">
 <TrendingUp className="w-8 h-8 text-stone-600" />
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
 <CardDescription>
 Comprehensive risk assessment matrix and mitigation tracking
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {riskAssessments.map(risk => (
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
 <Card className="border-stone-200">
 <CardContent className="p-6">
 <div className="flex items-center space-x-3">
 <FileText className="w-8 h-8 text-stone-600" />
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
 <CardDescription>
 Multi-agency regulatory submission tracking and progress monitoring
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {submissionData.map(submission => (
 <div key={submission.id} className="p-4 border rounded-lg">
 <div className="flex justify-between items-start mb-3">
 <div>
 <h4 className="font-semibold">{submission.id}</h4>
 <p className="text-sm text-gray-600">
 {submission.type} - {submission.agency}
 </p>
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
 <FileText className="w-8 h-8 mx-auto text-stone-600 mb-2" />
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
 {auditData.map(audit => (
 <div key={audit.id} className="flex items-start space-x-4 p-4 border rounded-lg">
 <div
 className={`w-3 h-3 rounded-full mt-2 ${
 audit.impact === 'Critical'
 ? 'bg-red-500'
 : audit.impact === 'High'
 ? 'bg-orange-500'
 : 'bg-stone-700'
 }`}
 ></div>
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

 return (
 <div className="min-h-screen bg-gray-50 p-6">
 <div className="max-w-7xl mx-auto">
 {/* Header */}
 <div className="mb-8">
 <h1 className="text-3xl font-bold text-gray-900">CMC Management Platform</h1>
 <p className="text-gray-600 mt-2">
 Chemistry, Manufacturing & Controls - Pharmaceutical Development
 </p>
 </div>

 {/* Navigation Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
 <div className="grid grid-cols-1 gap-4 mb-4">
 <TabsList className="grid w-full grid-cols-12" data-testid="cmc-comprehensive-tabs">
 <TabsTrigger value="dashboard" data-testid="tab-dashboard">
 Dashboard
 </TabsTrigger>
 <TabsTrigger value="analytical" data-testid="tab-analytical">
 Analytical
 </TabsTrigger>
 <TabsTrigger value="process" data-testid="tab-process">
 Process
 </TabsTrigger>
 <TabsTrigger value="stability" data-testid="tab-stability">
 Stability
 </TabsTrigger>
 <TabsTrigger value="quality" data-testid="tab-quality">
 Quality
 </TabsTrigger>
 <TabsTrigger value="regulatory" data-testid="tab-regulatory">
 Regulatory
 </TabsTrigger>
 <TabsTrigger value="document-authoring" data-testid="tab-document-authoring">
 Document Authoring
 </TabsTrigger>
 <TabsTrigger value="manufacturing" data-testid="tab-manufacturing">
 Manufacturing
 </TabsTrigger>
 <TabsTrigger value="supply-chain" data-testid="tab-supply-chain">
 Supply Chain
 </TabsTrigger>
 <TabsTrigger value="intelligence" data-testid="tab-intelligence">
 AI Intelligence
 </TabsTrigger>
 <TabsTrigger value="risk-management" data-testid="tab-risk">
 Risk Management
 </TabsTrigger>
 <TabsTrigger value="audit-docs" data-testid="tab-audit">
 Audit & Docs
 </TabsTrigger>
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

 const handleSubmit = e => {
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
 onChange={e => handleInputChange('methodCode', e.target.value)}
 placeholder="AM-001"
 />
 </div>
 <div>
 <Label>Technique</Label>
 <Select
 value={formData.technique || ''}
 onValueChange={value => handleInputChange('technique', value)}
 >
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
 onChange={e => handleInputChange('title', e.target.value)}
 placeholder="HPLC method for assay determination"
 />
 </div>
 <div>
 <Label>Purpose</Label>
 <Textarea
 value={formData.purpose || ''}
 onChange={e => handleInputChange('purpose', e.target.value)}
 placeholder="Quantitative determination of active ingredient..."
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label>Analyte</Label>
 <Input
 value={formData.analyte || ''}
 onChange={e => handleInputChange('analyte', e.target.value)}
 placeholder="Active Pharmaceutical Ingredient"
 />
 </div>
 <div>
 <Label>Matrix</Label>
 <Input
 value={formData.matrix || ''}
 onChange={e => handleInputChange('matrix', e.target.value)}
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
 onChange={e => handleInputChange('processName', e.target.value)}
 placeholder="API Synthesis Process"
 />
 </div>
 <div>
 <Label>Validation Stage</Label>
 <Select
 value={formData.stage || ''}
 onValueChange={value => handleInputChange('stage', value)}
 >
 <SelectTrigger>
 <SelectValue placeholder="Select stage" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="design">Stage 1: Process Design</SelectItem>
 <SelectItem value="qualification">Stage 2: Process Qualification</SelectItem>
 <SelectItem value="verification">
 Stage 3: Continued Process Verification
 </SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label>Batch Numbers (comma-separated)</Label>
 <Input
 value={formData.batchNumbers?.join(', ') || ''}
 onChange={e => handleInputChange('batchNumbers', e.target.value.split(', '))}
 placeholder="Batch-001, Batch-002, Batch-003"
 />
 </div>
 <div>
 <Label>Status</Label>
 <Select
 value={formData.status || ''}
 onValueChange={value => handleInputChange('status', value)}
 >
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
 onChange={e => handleInputChange('studyTitle', e.target.value)}
 placeholder="Long-term stability study - Product X"
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label>Product Name</Label>
 <Input
 value={formData.productName || ''}
 onChange={e => handleInputChange('productName', e.target.value)}
 placeholder="Product X 10mg tablets"
 />
 </div>
 <div>
 <Label>Batch Number</Label>
 <Input
 value={formData.batchNumber || ''}
 onChange={e => handleInputChange('batchNumber', e.target.value)}
 placeholder="ST-2024-001"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label>Study Type</Label>
 <Select
 value={formData.studyType || ''}
 onValueChange={value => handleInputChange('studyType', value)}
 >
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
 <Select
 value={formData.storageConditions || ''}
 onValueChange={value => handleInputChange('storageConditions', value)}
 >
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
 value={
 formData.startDate ? new Date(formData.startDate).toISOString().split('T')[0] : ''
 }
 onChange={e => handleInputChange('startDate', e.target.value)}
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
 onChange={e => handleInputChange('sampleId', e.target.value)}
 placeholder="QC-2024-001"
 />
 </div>
 <div>
 <Label>Sample Type</Label>
 <Select
 value={formData.sampleType || ''}
 onValueChange={value => handleInputChange('sampleType', value)}
 >
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
 onChange={e => handleInputChange('testMethod', e.target.value)}
 placeholder="USP <xxx> Assay Method"
 />
 </div>
 <div>
 <Label>Test Date</Label>
 <Input
 type="date"
 value={
 formData.testDate ? new Date(formData.testDate).toISOString().split('T')[0] : ''
 }
 onChange={e => handleInputChange('testDate', e.target.value)}
 />
 </div>
 <div>
 <Label>Pass/Fail Status</Label>
 <Select
 value={formData.passFailStatus || ''}
 onValueChange={value => handleInputChange('passFailStatus', value)}
 >
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
 {item ? 'Edit' : 'Create'}{' '}
 {type?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
 <Button type="submit">{item ? 'Update' : 'Create'}</Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 );
};

export default ComprehensiveCMCPlatform;
