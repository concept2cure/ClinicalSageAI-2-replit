import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  ChevronRight, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  Upload, 
  FileText,
  Settings,
  Search,
  ClipboardCheck,
  Target,
  FlaskConical,
  Edit,
  Package,
  Send,
  Brain,
  Info,
  Building2,
  Phone,
  Mail,
  Globe,
  Hash,
  Calendar,
  Users,
  Shield,
  Cpu,
  Heart,
  Zap,
  Activity,
  Database,
  Layers,
  BookOpen,
  FileCheck
} from 'lucide-react';
import PredicateFinderPanel from './PredicateFinderPanel';
import { ComplianceOversightPanel } from './ComplianceOversightPanel';
import EquivalenceBuilderPanel from './EquivalenceBuilderPanel';
import DocumentGenerationPanel from './DocumentGenerationPanel';
import ESTARBuilderPanel from './ESTARBuilderPanel';
import RTAChecklistPanel from './RTAChecklistPanel';
import ComplianceCheckPanel from './ComplianceCheckPanel';

// Workflow configuration based on the enhanced 510k specification
const WORKFLOW_CONFIG = {
  metadata: {
    name: "510(k) Submission Workflow",
    version: "2.0.0",
    program: "510(k)",
    estarlayout: true,
    status_enum: ["todo", "draft", "ready", "blocked", "complete"],
    roles_enum: ["writer", "regulatory_lead", "engineering", "quality", "lab", "clinical"]
  },
  stages: [
    {
      id: "setup",
      name: "Setup",
      order: 0,
      icon: <Settings className="h-5 w-5" />,
      description: "Project intake, program selection, device metadata, flags for software/cyber/sterility",
      sections: [
        { id: "device_intake", title: "Device Intake", required: true },
        { id: "predicate_search", title: "Predicate & Regulation Finder", required: true }
      ]
    },
    {
      id: "strategy",
      name: "Strategy",
      order: 1,
      icon: <Target className="h-5 w-5" />,
      description: "Predicate strategy and program justification",
      sections: [
        { id: "se_strategy", title: "Substantial Equivalence Strategy", required: true }
      ]
    },
    {
      id: "evidence_plan",
      name: "Evidence Plan",
      order: 2,
      icon: <ClipboardCheck className="h-5 w-5" />,
      description: "Map each requirement to tests/standards; plan evidence generation",
      sections: [
        { id: "standards_matrix", title: "Standards & DoCs", required: true },
        { id: "test_plan", title: "Integrated Test Plan", required: true }
      ]
    },
    {
      id: "evidence",
      name: "Evidence",
      order: 3,
      icon: <FlaskConical className="h-5 w-5" />,
      description: "Collect final signed reports and design artifacts",
      sections: [
        { id: "bench_testing", title: "Bench / Performance Testing", required: true },
        { id: "biocompatibility", title: "Biocompatibility", required: true },
        { id: "sterility", title: "Sterilization & Shelf Life", required: false },
        { id: "emc_es", title: "Electrical Safety & EMC", required: true },
        { id: "software", title: "Software Documentation", required: false },
        { id: "cybersecurity", title: "Cybersecurity", required: false },
        { id: "usability", title: "Usability / Human Factors", required: false },
        { id: "clinical_data", title: "Clinical Data", required: false }
      ]
    },
    {
      id: "authoring",
      name: "Author",
      order: 4,
      icon: <Edit className="h-5 w-5" />,
      description: "Write submission narrative sections in FDA eSTAR structure",
      sections: [
        { id: "administrative_forms", title: "Administrative Forms", required: true },
        { id: "cover_letter", title: "Cover Letter", required: true },
        { id: "indications_for_use", title: "Indications for Use", required: true },
        { id: "510k_summary", title: "510(k) Summary or Statement", required: true },
        { id: "device_description", title: "Device Description", required: true },
        { id: "performance_summaries", title: "Performance Testing Summaries", required: true }
      ]
    },
    {
      id: "estar_rta",
      name: "eSTAR & RTA",
      order: 5,
      icon: <Package className="h-5 w-5" />,
      description: "Create eCopy, fill eSTAR forms, validate RTA checklist",
      sections: [
        { id: "estar_build", title: "eSTAR Build", required: true },
        { id: "rta_checklist", title: "RTA Checklist", required: true },
        { id: "ecopy_assembly", title: "eCopy Assembly", required: true }
      ]
    },
    {
      id: "submit_ai",
      name: "Submit & AI",
      order: 6,
      icon: <Send className="h-5 w-5" />,
      description: "Final validation, AI predictive review, submission tracking",
      sections: [
        { id: "final_validation", title: "Final Validation", required: true },
        { id: "ai_review", title: "AI Predictive Review", required: false },
        { id: "submission", title: "Submission Package", required: true },
        { id: "fda_timeline", title: "FDA Day 1-100 Tracker", required: false }
      ]
    }
  ],
  forms: [
    {
      id: "fda_3514",
      name: "CDRH Cover Sheet",
      form_number: "FDA 3514",
      auto_populate_fields: ["applicant_name", "regulation_number", "product_code", "contact_email"],
      required: true,
      stage_id: "authoring"
    },
    {
      id: "fda_3601",
      name: "User Fee Cover Sheet",
      form_number: "FDA 3601",
      auto_populate_fields: ["duns", "applicant_name", "submission_type"],
      required: true,
      stage_id: "authoring"
    },
    {
      id: "fda_3881",
      name: "Indications for Use",
      form_number: "FDA 3881",
      auto_populate_fields: ["device_name", "indications", "intended_use"],
      required: true,
      stage_id: "authoring"
    },
    {
      id: "fda_3674",
      name: "ClinicalTrials.gov",
      form_number: "FDA 3674",
      required: false,
      visibility_rule: "has_clinical_data",
      stage_id: "authoring"
    }
  ]
};

const Enhanced510kIntakeWorkflow = ({ 
  onComplete, 
  onSave,
  existingProject = null,
  organizationId,
  projectId
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Core workflow state
  const [currentStage, setCurrentStage] = useState(0);
  const [activeSection, setActiveSection] = useState('device_intake');
  const [workflowData, setWorkflowData] = useState({
    // Project metadata
    projectName: existingProject?.name || '',
    projectDescription: existingProject?.description || '',
    submissionType: 'traditional', // traditional, abbreviated, special
    
    // Company information
    applicantName: '',
    dunsNumber: '',
    establishmentNumber: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'USA'
    },
    
    // Device information
    deviceName: '',
    deviceModels: '',
    deviceAccessories: '',
    productCode: '',
    regulationNumber: '',
    deviceClass: '2',
    intendedUse: '',
    indicationsForUse: '',
    technicalCharacteristics: '',
    
    // Toggles/Flags
    hassSoftware: false,
    isCyberDevice: false,
    isSterile: false,
    hasClinicalData: false,
    hasPatientContacting: true,
    contactDuration: 'limited', // limited, prolonged, permanent
    contactType: 'skin', // skin, mucosal, blood, tissue
    
    // Predicate information
    primaryPredicateKNumber: '',
    predicateManufacturer: '',
    predicateDeviceName: '',
    predicateClearanceDate: '',
    additionalPredicates: [],
    
    // Strategy
    equivalenceRationale: '',
    programJustification: '',
    
    // Standards & Testing
    recognizedStandards: [],
    testingPlan: {
      benchTesting: { required: true, planned: false, completed: false },
      biocompatibility: { required: true, planned: false, completed: false },
      sterilization: { required: false, planned: false, completed: false },
      electricalSafety: { required: true, planned: false, completed: false },
      software: { required: false, planned: false, completed: false },
      cybersecurity: { required: false, planned: false, completed: false },
      usability: { required: false, planned: false, completed: false },
      clinical: { required: false, planned: false, completed: false }
    },
    
    // Artifacts & Documents
    artifacts: {},
    uploadedFiles: {},
    
    // Progress tracking
    stageProgress: {
      setup: { status: 'draft', completion: 0, gates: {} },
      strategy: { status: 'todo', completion: 0, gates: {} },
      evidence_plan: { status: 'todo', completion: 0, gates: {} },
      evidence: { status: 'todo', completion: 0, gates: {} },
      authoring: { status: 'todo', completion: 0, gates: {} },
      estar_rta: { status: 'todo', completion: 0, gates: {} },
      submit_ai: { status: 'todo', completion: 0, gates: {} }
    }
  });
  
  // ============================================================================
  // API Integration for Workflow Data Persistence
  // ============================================================================

  // Load existing workflow data on mount
  const { data: existingWorkflowData } = useQuery({
    queryKey: ['/api/510k-workflow', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      try {
        const response = await apiRequest('GET', `/api/510k-workflow/${projectId}?organizationId=${organizationId}`);
        return await response.json();
      } catch (error) {
        return null;
      }
    },
    enabled: !!projectId && !!organizationId
  });

  // Mutation to save workflow data
  // Track whether a save is manual (show toast) or auto (silent).
  const manualSaveRef = useRef(false);

  const saveWorkflowMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        throw new Error('Please create or select a project first');
      }
      const response = await apiRequest('POST', `/api/510k-workflow/${projectId}`, {
        organizationId,
        stage: WORKFLOW_CONFIG.stages[currentStage].id,
        section: activeSection,
        data: workflowData,
        completedSteps: Object.keys(workflowData.stageProgress || {}).filter(
          key => workflowData.stageProgress[key]?.status === 'complete'
        ),
        validationCheckpoints: {}
      });
      return await response.json();
    },
    onSuccess: () => {
      // Only show toast on explicit Save button click, not on every keystroke
      // auto-save. Auto-save runs silently to avoid toast spam.
      if (manualSaveRef.current) {
        toast({
          title: 'Workflow saved',
          description: 'Your 510(k) data has been saved.',
        });
        manualSaveRef.current = false;
      }
      queryClient.invalidateQueries(['/api/510k-workflow', projectId]);
    },
    onError: (error) => {
      toast({ 
        title: "Save Failed", 
        description: "Failed to save workflow data. Please try again.",
        variant: "destructive"
      });
      console.error('Save workflow error:', error);
    }
  });

  // Auto-save workflow data periodically
  const autoSaveWorkflow = useCallback(() => {
    if (projectId) {
      saveWorkflowMutation.mutate();
    }
  }, [projectId, workflowData, currentStage, activeSection]);

  // Load existing workflow data when component mounts or when API data changes
  useEffect(() => {
    if (existingWorkflowData?.workflow?.workflowData) {
      setWorkflowData(existingWorkflowData.workflow.workflowData);
      if (existingWorkflowData.workflow.currentStep) {
        const stageIndex = WORKFLOW_CONFIG.stages.findIndex(s => s.id === existingWorkflowData.workflow.currentStep);
        if (stageIndex >= 0) setCurrentStage(stageIndex);
      }
    } else if (existingProject?.metadata?.workflow) {
      // Fallback to existing project data if no API data
      setWorkflowData(prev => ({
        ...prev,
        ...existingProject.metadata.workflow
      }));
    }
  }, [existingWorkflowData, existingProject]);

  // Auto-compute each stage's completion % from filled fields so gates open
  // as the user progresses. Without this, stages stay at 0% and the user
  // cannot advance past Stage 0.
  useEffect(() => {
    setWorkflowData(prev => {
      const setupGates = {
        deviceName: !!prev.deviceName,
        manufacturer: !!prev.manufacturer,
        deviceClass: !!prev.deviceClass,
        productCode: !!prev.productCode,
        intendedUse: !!(prev.intendedUse || prev.indicationsForUse),
        predicatesSelected: Array.isArray(prev.selectedPredicates) && prev.selectedPredicates.length > 0,
      };
      const setupComplete = Object.values(setupGates).filter(Boolean).length;
      const setupTotal = Object.keys(setupGates).length;
      const setupPct = setupTotal > 0 ? Math.round((setupComplete / setupTotal) * 100) : 0;

      const strategyPct = prev.equivalenceData ? 100 : 0;

      const evidencePlanPct = ['standards_matrix', 'test_plan'].filter(k => prev[k + '_status'] === 'complete').length * 50;

      const evidenceSections = ['bench_testing', 'biocompatibility', 'sterility', 'emc_es', 'software', 'cybersecurity', 'usability', 'clinical_data'];
      const evidenceComplete = evidenceSections.filter(k => prev[k + '_status'] === 'complete').length;
      const evidencePct = Math.round((evidenceComplete / evidenceSections.length) * 100);

      const nextStageProgress = {
        ...prev.stageProgress,
        setup: { ...prev.stageProgress.setup, completion: setupPct, status: setupPct >= 80 ? 'complete' : 'draft', gates: setupGates },
        strategy: { ...prev.stageProgress.strategy, completion: strategyPct, status: strategyPct >= 80 ? 'complete' : (strategyPct > 0 ? 'draft' : 'todo') },
        evidence_plan: { ...prev.stageProgress.evidence_plan, completion: evidencePlanPct, status: evidencePlanPct >= 80 ? 'complete' : (evidencePlanPct > 0 ? 'draft' : 'todo') },
        evidence: { ...prev.stageProgress.evidence, completion: evidencePct, status: evidencePct >= 80 ? 'complete' : (evidencePct > 0 ? 'draft' : 'todo') },
      };

      const same = Object.keys(nextStageProgress).every(k =>
        nextStageProgress[k].completion === prev.stageProgress[k].completion &&
        nextStageProgress[k].status === prev.stageProgress[k].status
      );
      if (same) return prev;
      return { ...prev, stageProgress: nextStageProgress };
    });
  }, [
    workflowData.deviceName,
    workflowData.manufacturer,
    workflowData.deviceClass,
    workflowData.productCode,
    workflowData.intendedUse,
    workflowData.indicationsForUse,
    workflowData.selectedPredicates,
    workflowData.equivalenceData,
    workflowData.standards_matrix_status,
    workflowData.test_plan_status,
    workflowData.bench_testing_status,
    workflowData.biocompatibility_status,
    workflowData.sterility_status,
    workflowData.emc_es_status,
    workflowData.software_status,
    workflowData.cybersecurity_status,
    workflowData.usability_status,
    workflowData.clinical_data_status,
  ]);
  
  // Calculate overall progress
  const calculateOverallProgress = () => {
    const stages = Object.values(workflowData.stageProgress);
    const totalProgress = stages.reduce((sum, stage) => sum + stage.completion, 0);
    return Math.round(totalProgress / stages.length);
  };
  
  // Check if stage is accessible based on gate conditions
  const isStageAccessible = (stageIndex) => {
    if (stageIndex === 0) return true;
    
    // Check if previous stage is complete
    const previousStage = WORKFLOW_CONFIG.stages[stageIndex - 1];
    const previousProgress = workflowData.stageProgress[previousStage.id];
    
    return previousProgress.status === 'complete' || previousProgress.completion >= 80;
  };
  
  // Auto-save debounce — a single timer that resets on each keystroke so
  // we only save after the user pauses for 1.5s, not on every keystroke.
  const autoSaveTimerRef = useRef(null);

  // Update workflow data
  const updateWorkflowData = (path, value) => {
    setWorkflowData(prev => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;

      // Debounced auto-save: reset timer on every change so only one save
      // fires per 1.5s of idle time. No toast spam.
      if (projectId) {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => autoSaveWorkflow(), 1500);
      }

      if (onSave) {
        onSave(newData);
      }

      return newData;
    });
  };
  
  // Render device intake form
  const renderDeviceIntakeForm = () => (
    <div className="space-y-6" data-testid="enhanced-device-intake">
      {/* Project Information */}
      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
          <CardDescription>Basic project details and submission type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={workflowData.projectName}
                onChange={(e) => updateWorkflowData('projectName', e.target.value)}
                placeholder="e.g., CardioFlow 2000 510(k)"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label htmlFor="submission-type">Submission Type</Label>
              <Select
                value={workflowData.submissionType}
                onValueChange={(value) => updateWorkflowData('submissionType', value)}
              >
                <SelectTrigger id="submission-type" data-testid="select-submission-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="traditional">Traditional 510(k)</SelectItem>
                  <SelectItem value="abbreviated">Abbreviated 510(k)</SelectItem>
                  <SelectItem value="special">Special 510(k)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="project-description">Project Description</Label>
            <Textarea
              id="project-description"
              value={workflowData.projectDescription}
              onChange={(e) => updateWorkflowData('projectDescription', e.target.value)}
              placeholder="Brief description of the device and submission objectives"
              rows={3}
              data-testid="textarea-project-description"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Applicant and contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="applicant-name">Applicant Name</Label>
              <Input
                id="applicant-name"
                value={workflowData.applicantName}
                onChange={(e) => updateWorkflowData('applicantName', e.target.value)}
                placeholder="Company legal name"
                data-testid="input-applicant-name"
              />
            </div>
            <div>
              <Label htmlFor="duns-number">DUNS Number</Label>
              <Input
                id="duns-number"
                value={workflowData.dunsNumber}
                onChange={(e) => updateWorkflowData('dunsNumber', e.target.value)}
                placeholder="9-digit DUNS"
                maxLength={9}
                data-testid="input-duns"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="contact-name">Contact Name</Label>
              <Input
                id="contact-name"
                value={workflowData.contactName}
                onChange={(e) => updateWorkflowData('contactName', e.target.value)}
                placeholder="Primary contact"
                data-testid="input-contact-name"
              />
            </div>
            <div>
              <Label htmlFor="contact-email">Contact Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={workflowData.contactEmail}
                onChange={(e) => updateWorkflowData('contactEmail', e.target.value)}
                placeholder="email@company.com"
                data-testid="input-contact-email"
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Contact Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={workflowData.contactPhone}
                onChange={(e) => updateWorkflowData('contactPhone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                data-testid="input-contact-phone"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="establishment">Establishment Number</Label>
              <Input
                id="establishment"
                value={workflowData.establishmentNumber}
                onChange={(e) => updateWorkflowData('establishmentNumber', e.target.value)}
                placeholder="FDA establishment number"
                data-testid="input-establishment"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Device Details */}
      <Card>
        <CardHeader>
          <CardTitle>Device Details</CardTitle>
          <CardDescription>Device identification and classification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="device-name">
                Device Name <span className="text-stone-400" aria-label="required">*</span>
              </Label>
              <Input
                id="device-name"
                value={workflowData.deviceName}
                onChange={(e) => updateWorkflowData('deviceName', e.target.value)}
                placeholder="Trade/proprietary name"
                data-testid="input-device-name"
              />
            </div>
            <div>
              <Label htmlFor="product-code">
                Product Code <span className="text-stone-400" aria-label="required">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="product-code"
                  value={workflowData.productCode}
                  onChange={(e) => updateWorkflowData('productCode', e.target.value)}
                  placeholder="3-letter code"
                  maxLength={3}
                  className="uppercase"
                  data-testid="input-product-code"
                />
                <Button variant="outline" size="sm" data-testid="button-search-product-code">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="regulation">Regulation Number</Label>
              <Input
                id="regulation"
                value={workflowData.regulationNumber}
                onChange={(e) => updateWorkflowData('regulationNumber', e.target.value)}
                placeholder="e.g., 21 CFR 870.2340"
                data-testid="input-regulation"
              />
            </div>
            <div>
              <Label htmlFor="device-class">Device Class</Label>
              <Select
                value={workflowData.deviceClass}
                onValueChange={(value) => updateWorkflowData('deviceClass', value)}
              >
                <SelectTrigger id="device-class" data-testid="select-device-class">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Class I</SelectItem>
                  <SelectItem value="2">Class II</SelectItem>
                  <SelectItem value="3">Class III</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="device-models">Device Models/Catalog Numbers</Label>
            <Textarea
              id="device-models"
              value={workflowData.deviceModels}
              onChange={(e) => updateWorkflowData('deviceModels', e.target.value)}
              placeholder="List all model numbers, one per line"
              rows={3}
              data-testid="textarea-device-models"
            />
          </div>
          
          <div>
            <Label htmlFor="device-accessories">Accessories (if applicable)</Label>
            <Textarea
              id="device-accessories"
              value={workflowData.deviceAccessories}
              onChange={(e) => updateWorkflowData('deviceAccessories', e.target.value)}
              placeholder="List any accessories included in submission"
              rows={2}
              data-testid="textarea-device-accessories"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Device Characteristics & Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Device Characteristics</CardTitle>
          <CardDescription>Important flags that affect submission requirements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="has-software" className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Contains Software
                </Label>
                <Switch
                  id="has-software"
                  checked={workflowData.hasSoftware}
                  onCheckedChange={(checked) => updateWorkflowData('hasSoftware', checked)}
                  data-testid="switch-has-software"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="is-cyber" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Cybersecurity Device
                </Label>
                <Switch
                  id="is-cyber"
                  checked={workflowData.isCyberDevice}
                  onCheckedChange={(checked) => updateWorkflowData('isCyberDevice', checked)}
                  disabled={!workflowData.hasSoftware}
                  data-testid="switch-is-cyber"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="is-sterile" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Sterile Device
                </Label>
                <Switch
                  id="is-sterile"
                  checked={workflowData.isSterile}
                  onCheckedChange={(checked) => updateWorkflowData('isSterile', checked)}
                  data-testid="switch-is-sterile"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="has-clinical" className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Clinical Data Required
                </Label>
                <Switch
                  id="has-clinical"
                  checked={workflowData.hasClinicalData}
                  onCheckedChange={(checked) => updateWorkflowData('hasClinicalData', checked)}
                  data-testid="switch-has-clinical"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="patient-contact" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Patient Contacting
                </Label>
                <Switch
                  id="patient-contact"
                  checked={workflowData.hasPatientContacting}
                  onCheckedChange={(checked) => updateWorkflowData('hasPatientContacting', checked)}
                  data-testid="switch-patient-contact"
                />
              </div>
            </div>
            
            {workflowData.hasPatientContacting && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-stone-50 rounded-lg">
                <div>
                  <Label htmlFor="contact-duration">Contact Duration</Label>
                  <Select
                    value={workflowData.contactDuration}
                    onValueChange={(value) => updateWorkflowData('contactDuration', value)}
                  >
                    <SelectTrigger id="contact-duration" data-testid="select-contact-duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limited">Limited (≤24 hours)</SelectItem>
                      <SelectItem value="prolonged">Prolonged ({'>'}24 hours to 30 days)</SelectItem>
                      <SelectItem value="permanent">Permanent ({'>'}30 days)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="contact-type">Contact Type</Label>
                  <Select
                    value={workflowData.contactType}
                    onValueChange={(value) => updateWorkflowData('contactType', value)}
                  >
                    <SelectTrigger id="contact-type" data-testid="select-contact-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skin">Intact Skin</SelectItem>
                      <SelectItem value="mucosal">Mucosal Membrane</SelectItem>
                      <SelectItem value="blood">Blood Path Indirect</SelectItem>
                      <SelectItem value="tissue">Tissue/Bone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            {workflowData.hasSoftware && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Software documentation requirements detected. Level of concern will be auto-determined based on device risk.
                </AlertDescription>
              </Alert>
            )}
            
            {workflowData.isSterile && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Sterilization validation and shelf life testing will be required in the Evidence stage.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Intended Use Statement */}
      <Card>
        <CardHeader>
          <CardTitle>Intended Use & Indications</CardTitle>
          <CardDescription>Draft your intended use and indications for use statements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="intended-use">
              Intended Use Statement <span className="text-stone-400" aria-label="required">*</span>
            </Label>
            <Textarea
              id="intended-use"
              value={workflowData.intendedUse}
              onChange={(e) => updateWorkflowData('intendedUse', e.target.value)}
              placeholder="Describe the general purpose of the device..."
              rows={4}
              data-testid="textarea-intended-use"
            />
            <p className="text-sm text-stone-500 mt-1">
              The general purpose or function of the device
            </p>
          </div>

          <div>
            <Label htmlFor="indications">Indications for Use</Label>
            <Textarea
              id="indications"
              value={workflowData.indicationsForUse}
              onChange={(e) => updateWorkflowData('indicationsForUse', e.target.value)}
              placeholder="Describe the specific medical conditions, patient populations..."
              rows={4}
              data-testid="textarea-indications"
            />
            <p className="text-sm text-stone-500 mt-1">
              Specific medical conditions and patient populations
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Save & Continue */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            if (projectId) {
              manualSaveRef.current = true;
              saveWorkflowMutation.mutate();
            }
            if (onSave) onSave(workflowData);
          }}
          disabled={saveWorkflowMutation.isPending}
          data-testid="button-save-intake"
        >
          {saveWorkflowMutation.isPending ? 'Saving...' : 'Save progress'}
        </Button>

        <div className="flex items-center gap-3">
          {(!workflowData.deviceName || !workflowData.productCode || !workflowData.intendedUse) && (
            <span className="text-xs text-stone-500">
              Fill device name, product code, and intended use to continue
            </span>
          )}
          <Button
            onClick={() => {
              updateWorkflowData('stageProgress.setup.gates.device_intake', true);
              setActiveSection('predicate_search');
              toast({ title: 'Device intake saved', description: 'Proceeding to predicate search.' });
            }}
            disabled={!workflowData.deviceName || !workflowData.productCode || !workflowData.intendedUse}
            data-testid="button-continue-to-predicate"
          >
            Continue to predicate search
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
  
  // Render main workflow interface
  return (
    <div className="min-h-screen bg-stone-50 p-6" data-testid="enhanced-510k-workflow">
      {/* Header with progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">FDA 510(k) Submission Workflow</h1>
            <p className="text-[13px] text-stone-500 mt-0.5">7-stage process with predicate search, SE analysis, compliance, and eSTAR assembly</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-stone-600">Overall Progress</div>
            <div className="text-lg font-semibold text-stone-800">{calculateOverallProgress()}%</div>
          </div>
        </div>
        
        <Progress value={calculateOverallProgress()} className="h-3" />
        
        {/* No Project Warning */}
        {!projectId && (
          <Alert className="mt-4 bg-amber-50 border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              No project selected. Create or select a project to save your workflow data.
            </AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Stage Navigation */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 overflow-x-auto pb-2">
          {WORKFLOW_CONFIG.stages.map((stage, index) => {
            const isAccessible = isStageAccessible(index);
            const isActive = currentStage === index;
            const stageStatus = workflowData.stageProgress[stage.id].status;
            
            return (
              <Button
                key={stage.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => isAccessible && setCurrentStage(index)}
                disabled={!isAccessible}
                className={`flex items-center gap-2 whitespace-nowrap ${
                  !isAccessible ? 'opacity-50' : ''
                }`}
                data-testid={`button-stage-${stage.id}`}
              >
                {!isAccessible ? (
                  <Lock className="h-4 w-4" />
                ) : stageStatus === 'complete' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  stage.icon
                )}
                <span>Stage {stage.order}: {stage.name}</span>
                {stageStatus === 'draft' && (
                  <Badge variant="secondary" className="ml-2">DRAFT</Badge>
                )}
              </Button>
            );
          })}
        </div>
      </div>
      
      {/* Current Stage Content */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left Sidebar - Stage Info (hidden on small viewports) */}
        <div className="hidden lg:block col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {WORKFLOW_CONFIG.stages[currentStage].icon}
                {WORKFLOW_CONFIG.stages[currentStage].name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-stone-600 mb-4">
                {WORKFLOW_CONFIG.stages[currentStage].description}
              </p>
              
              <div className="space-y-2">
                <div className="text-sm font-semibold">Sections:</div>
                {WORKFLOW_CONFIG.stages[currentStage].sections.map(section => (
                  <Button
                    key={section.id}
                    variant={activeSection === section.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setActiveSection(section.id)}
                    data-testid={`button-section-${section.id}`}
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    {section.title}
                    {section.required && (
                      <Badge variant="outline" className="ml-auto">Required</Badge>
                    )}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* FDA Forms Status */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">FDA Forms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {WORKFLOW_CONFIG.forms.map(form => (
                  <div key={form.id} className="flex items-center justify-between">
                    <span className="text-stone-600">{form.form_number}</span>
                    <Badge variant="outline" className="text-xs">
                      {form.required ? 'Required' : 'Optional'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content Area */}
        <div className="col-span-12 lg:col-span-9">
          {/* Render appropriate section based on current stage and section */}
          {currentStage === 0 && activeSection === 'device_intake' && renderDeviceIntakeForm()}
          
          {currentStage === 0 && activeSection === 'predicate_search' && (
            <div className="space-y-4">
              <PredicateFinderPanel
                deviceProfile={workflowData}
                setDeviceProfile={(newProfile) => setWorkflowData(newProfile)}
                organizationId={organizationId}
                onPredicatesFound={(predicates) => {
                  // Store selected predicates in workflow data
                  setWorkflowData(prev => ({
                    ...prev,
                    selectedPredicates: predicates
                  }));
                }}
                isLoading={false}
                predicates={workflowData.selectedPredicates || []}
              />
            </div>
          )}
          
          {/* Stage 1: Strategy — Substantial Equivalence Builder */}
          {currentStage === 1 && (
            <EquivalenceBuilderPanel
              deviceProfile={workflowData}
              predicateDevices={workflowData.selectedPredicates || []}
              onComplete={(data) => {
                setWorkflowData(prev => ({ ...prev, equivalenceData: data }));
                toast({ title: 'SE strategy saved', description: 'Substantial equivalence comparison documented.' });
              }}
            />
          )}

          {/* Stage 2: Evidence Plan — Section checklist + literature */}
          {currentStage === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{WORKFLOW_CONFIG.stages[2].name}</CardTitle>
                <CardDescription>{WORKFLOW_CONFIG.stages[2].description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {WORKFLOW_CONFIG.stages[2].sections.map(section => (
                  <div key={section.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${workflowData[section.id + '_status'] === 'complete' ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                      <span className="text-sm text-stone-700">{section.title}</span>
                      {section.required && <Badge variant="outline" className="text-[10px] h-4 px-1">Required</Badge>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setWorkflowData(prev => ({ ...prev, [section.id + '_status']: 'complete' }));
                        toast({ title: `${section.title} marked complete` });
                      }}
                    >
                      {workflowData[section.id + '_status'] === 'complete' ? 'Done' : 'Mark Complete'}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Stage 3: Evidence — Section checklist for test reports */}
          {currentStage === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{WORKFLOW_CONFIG.stages[3].name}</CardTitle>
                <CardDescription>{WORKFLOW_CONFIG.stages[3].description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {WORKFLOW_CONFIG.stages[3].sections.map(section => (
                  <div key={section.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${workflowData[section.id + '_status'] === 'complete' ? 'bg-emerald-500' : workflowData[section.id + '_status'] === 'draft' ? 'bg-amber-400' : 'bg-stone-300'}`} />
                      <span className="text-sm text-stone-700">{section.title}</span>
                      {section.required && <Badge variant="outline" className="text-[10px] h-4 px-1">Required</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-stone-500"
                        onClick={() => setWorkflowData(prev => ({ ...prev, [section.id + '_status']: 'draft' }))}
                      >
                        In Progress
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setWorkflowData(prev => ({ ...prev, [section.id + '_status']: 'complete' }));
                          toast({ title: `${section.title} evidence complete` });
                        }}
                      >
                        {workflowData[section.id + '_status'] === 'complete' ? 'Done' : 'Complete'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Stage 4: Authoring — Document generation for submission sections */}
          {currentStage === 4 && (
            <DocumentGenerationPanel
              projectId={projectId}
              projectData={workflowData}
            />
          )}

          {/* Stage 5: eSTAR & RTA — Builder + checklist */}
          {currentStage === 5 && activeSection === 'estar_build' && (
            <ESTARBuilderPanel
              projectId={projectId}
              deviceProfile={workflowData}
              complianceScore={workflowData.complianceScore}
              equivalenceData={workflowData.equivalenceData}
              onGenerationComplete={() => toast({ title: 'eSTAR package generated' })}
              onValidationComplete={() => toast({ title: 'eSTAR validation passed' })}
              isValidating={false}
              isGenerating={false}
            />
          )}
          {currentStage === 5 && activeSection === 'rta_checklist' && (
            <RTAChecklistPanel
              projectId={projectId}
              deviceProfile={workflowData}
              onChecklistUpdate={(data) => setWorkflowData(prev => ({ ...prev, rtaChecklist: data }))}
              onValidationComplete={() => toast({ title: 'RTA checklist validated' })}
            />
          )}
          {currentStage === 5 && activeSection === 'ecopy_assembly' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">eCopy Assembly</CardTitle>
                <CardDescription>Assemble the electronic submission copy for FDA submission gateway.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['Cover letter', '510(k) summary', 'Indications for Use (FDA 3881)', 'Device description', 'SE comparison', 'Performance data summaries', 'Labeling', 'eSTAR package'].map(item => (
                    <div key={item} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 text-stone-400" />
                      <span className="text-sm text-stone-700">{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stage 6: Submit & AI — Compliance check + final validation */}
          {currentStage === 6 && activeSection === 'final_validation' && (
            <ComplianceCheckPanel
              deviceProfile={workflowData}
              predicateDevices={workflowData.selectedPredicates || []}
              equivalenceData={workflowData.equivalenceData}
              onComplete={(score) => {
                setWorkflowData(prev => ({ ...prev, complianceScore: score }));
                toast({ title: 'Final validation complete', description: `Compliance score: ${score}%` });
              }}
            />
          )}
          {currentStage === 6 && activeSection === 'ai_review' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Predictive Review</CardTitle>
                <CardDescription>Simulate likely FDA reviewer questions and identify potential deficiencies before submission.</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertDescription className="text-sm text-stone-600">
                    AI predictive review uses regulatory intelligence to surface patterns from prior 510(k) decisions.
                    Use the AI assistant panel on the right to run a full predictive analysis on your submission.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
          {currentStage === 6 && activeSection === 'submission' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Submission Package</CardTitle>
                <CardDescription>Review and finalize the complete 510(k) submission package.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-stone-200 p-3">
                  <p className="text-sm font-medium text-stone-800">Package contents</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {workflowData.selectedPredicates?.length || 0} predicate devices identified
                    {workflowData.equivalenceData ? ' · SE analysis complete' : ''}
                    {workflowData.complianceScore ? ` · ${workflowData.complianceScore}% compliant` : ''}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    toast({ title: 'Submission package ready', description: 'Package is ready for final review and submission.' });
                  }}
                  className="w-full"
                >
                  Generate Final Package
                </Button>
              </CardContent>
            </Card>
          )}
          {currentStage === 6 && activeSection === 'fda_timeline' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">FDA Day 1-100 Tracker</CardTitle>
                <CardDescription>Track the FDA review timeline after submission, including RTA, SE review, and decision milestones.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { day: 'Day 1-15', milestone: 'Refuse to Accept (RTA) review', status: 'pending' },
                    { day: 'Day 15-60', milestone: 'Substantive review period', status: 'pending' },
                    { day: 'Day 60-90', milestone: 'Additional information requests (if any)', status: 'pending' },
                    { day: 'Day 90-100', milestone: 'FDA decision (SE/NSE/withdrawal)', status: 'pending' },
                  ].map(item => (
                    <div key={item.day} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5">
                      <div>
                        <span className="text-xs font-medium text-stone-800">{item.day}</span>
                        <p className="text-xs text-stone-500">{item.milestone}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">Pending</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default Enhanced510kIntakeWorkflow;