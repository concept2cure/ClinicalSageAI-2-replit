import React, { useState, useEffect, useCallback } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import DocumentGenerationPanel from './DocumentGenerationPanel';

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
    entryMode: 'manual',
    aiAssistContext: '',

    // Company information
    applicantName: '',
    dunsNumber: '',
    establishmentNumber: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    raContactName: '',
    raContactEmail: '',
    raContactPhone: '',
    smallBusinessDetermination: false,
    userFeeReference: '',
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
    deviceModelFamily: '',
    deviceAccessories: '',
    accessoriesNotes: '',
    productCode: '',
    regulationNumber: '',
    advisoryCommittee: '',
    deviceClass: '2',
    intendedUse: '',
    indicationsForUse: '',
    rxUse: false,
    otcUse: false,
    environmentOfUse: '',
    patientPopulation: '',
    technicalCharacteristics: '',
    principlesOfOperation: '',
    components: '',
    criticalMaterials: '',
    energySource: '',

    // Testing & standards
    testingBench: '',
    testingEmc: '',
    testingShelfLife: '',
    testingUsability: '',
    standardsList: '',
    declarationsOfConformity: '',

    // Labeling
    ifuAvailable: false,
    labelingNotes: '',
    udiNotes: '',
    artworkReferences: '',

    // Attachments
    attachmentsSummary: '',
    attachmentsTags: '',

    // Software & Cybersecurity
    hasSoftware: false,
    softwareLevel: '',
    softwareComplexity: 'basic',
    connectivity: '',
    phiHandling: '',
    updateMechanism: '',
    sbomAvailable: false,
    authEncryption: '',
    vulnerabilityManagement: '',
    cyberLabeling: '',
    isCyberDevice: false,

    // Sterility & Biocompatibility
    isSterile: false,
    sterilizationMethod: '',
    sterilitySAL: '',
    endotoxinLimits: '',
    pyrogenLimits: '',
    packagingIntegrity: '',
    shelfLife: '',
    hasPatientContacting: true,
    contactDuration: 'limited', // limited, prolonged, permanent
    contactType: 'skin', // skin, mucosal, blood, tissue
    iso10993Mapping: '',
    biocompSummary: '',

    // Clinical data
    hasClinicalData: false,
    clinicalDataUsed: false,
    clinicalDataSummary: '',

    // Forms & attestations
    summaryChoice: '',
    truthfulAccurate: false,

    // Predicate information
    primaryPredicateKNumber: '',
    predicateManufacturer: '',
    predicateDeviceName: '',
    predicateClearanceDate: '',
    additionalPredicates: [],

    // Strategy
    equivalenceRationale: '',
    programJustification: '',

    // Standards & Testing workflow tracking
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
  const [aiDraftStatus, setAiDraftStatus] = useState('idle');
  const [aiDraftContent, setAiDraftContent] = useState('');
  const isAiAssistEnabled = workflowData.entryMode === 'ai';
  
  // ============================================================================
  // API Integration for Workflow Data Persistence
  // ============================================================================

  // Load existing workflow data on mount
  const { data: existingWorkflowData } = useQuery({
    queryKey: ['/api/510k-workflow', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      try {
        const response = await apiRequest(`/api/510k-workflow/${projectId}?organizationId=${organizationId}`);
        return response;
      } catch (error) {
        console.error('[510k] Failed to load workflow data:', error);
        return null;
      }
    },
    enabled: !!projectId && !!organizationId
  });

  // Mutation to save workflow data
  const saveWorkflowMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        console.warn('Cannot save workflow: No project ID available');
        throw new Error('Please create or select a project first');
      }
      return apiRequest(`/api/510k-workflow/${projectId}`, {
        method: 'POST',
        data: {
          organizationId,
          stage: WORKFLOW_CONFIG.stages[currentStage].id,
          section: activeSection,
          data: workflowData,
          completedSteps: Object.keys(workflowData.stageProgress).filter(
            key => workflowData.stageProgress[key].status === 'complete'
          ),
          validationCheckpoints: {}
        }
      });
    },
    onSuccess: (response) => {
      toast({ 
        title: "✅ Workflow Saved & Documents Auto-Updated", 
        description: response?.autoPopulated 
          ? "Your data has been saved and documents have been automatically populated with collected information"
          : "Your 510(k) workflow data has been saved and linked to document generation" 
      });
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
      const incomingData = existingWorkflowData.workflow.workflowData;
      const normalizedData = {
        ...incomingData,
        hasSoftware: incomingData.hasSoftware ?? incomingData.hassSoftware ?? false
      };
      setWorkflowData(normalizedData);
      if (existingWorkflowData.workflow.currentStep) {
        const stageIndex = WORKFLOW_CONFIG.stages.findIndex(s => s.id === existingWorkflowData.workflow.currentStep);
        if (stageIndex >= 0) setCurrentStage(stageIndex);
      }
    } else if (existingProject?.metadata?.workflow) {
      // Fallback to existing project data if no API data
      setWorkflowData(prev => ({
        ...prev,
        ...existingProject.metadata.workflow,
        hasSoftware: existingProject.metadata.workflow.hasSoftware ?? existingProject.metadata.workflow.hassSoftware ?? prev.hasSoftware
      }));
    }
  }, [existingWorkflowData, existingProject]);
  
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

      if (path === 'hasSoftware' && !value) {
        newData.isCyberDevice = false;
      }
      
      // Auto-save to backend and trigger document generation mapping
      if (projectId) {
        // Save to backend API (linked to document generation)
        setTimeout(() => autoSaveWorkflow(), 500); // Debounce saves
      }
      
      // Also call the provided onSave callback
      if (onSave) {
        onSave(newData);
      }
      
      return newData;
    });
  };

  const buildAiIntakeContext = () => {
    const contextBlocks = [
      workflowData.projectName && `Project: ${workflowData.projectName}`,
      workflowData.deviceName && `Device: ${workflowData.deviceName}`,
      workflowData.deviceModels && `Models: ${workflowData.deviceModels}`,
      workflowData.productCode && `Product Code: ${workflowData.productCode}`,
      workflowData.regulationNumber && `Regulation: ${workflowData.regulationNumber}`,
      workflowData.advisoryCommittee && `Advisory Committee: ${workflowData.advisoryCommittee}`,
      workflowData.intendedUse && `Intended Use: ${workflowData.intendedUse}`,
      workflowData.indicationsForUse && `Indications: ${workflowData.indicationsForUse}`,
      workflowData.technicalCharacteristics && `Technical Characteristics: ${workflowData.technicalCharacteristics}`,
      workflowData.principlesOfOperation && `Principles of Operation: ${workflowData.principlesOfOperation}`,
      workflowData.patientPopulation && `Patient Population: ${workflowData.patientPopulation}`,
      workflowData.environmentOfUse && `Environment of Use: ${workflowData.environmentOfUse}`,
      workflowData.hasSoftware ? 'Contains software' : 'No software',
      workflowData.isCyberDevice ? 'Cybersecurity considerations required' : null,
      workflowData.isSterile ? 'Sterile device' : 'Non-sterile device',
      workflowData.hasClinicalData ? 'Clinical data required' : null,
      workflowData.aiAssistContext && `Additional context: ${workflowData.aiAssistContext}`
    ].filter(Boolean);

    return contextBlocks.join('\n');
  };

  const handleGenerateAiDraft = async () => {
    if (!projectId) {
      toast({
        title: 'Project Required',
        description: 'Create or select a project to run AI-assisted intake drafting.',
        variant: 'destructive'
      });
      return;
    }

    if (!workflowData.deviceName || !workflowData.productCode) {
      toast({
        title: 'Missing Required Fields',
        description: 'Provide device name and product code before requesting AI assistance.',
        variant: 'destructive'
      });
      return;
    }

    setAiDraftStatus('drafting');
    setAiDraftContent('');

    try {
      const startResponse = await apiRequest('/api/v1/drafting/start_task', {
        method: 'POST',
        data: {
          documentType: '510k-intake',
          module: '510k',
          section: 'device-intake',
          requirements: {
            deviceClass: workflowData.deviceClass,
            hasSoftware: workflowData.hasSoftware,
            isSterile: workflowData.isSterile,
            hasClinicalData: workflowData.hasClinicalData
          },
          context: buildAiIntakeContext(),
          prompt: 'Generate a concise intake narrative and suggestions for intended use, indications, and technical description.'
        }
      });

      const taskId = startResponse?.taskId;
      if (!taskId) {
        throw new Error('AI task could not be started');
      }

      const taskResponse = await apiRequest(`/api/v1/drafting/task/${taskId}`);
      const content = taskResponse?.task?.result?.content || '';

      if (!content) {
        throw new Error('AI drafting returned empty content');
      }

      setAiDraftContent(content);
      setAiDraftStatus('ready');
      toast({
        title: 'AI Draft Ready',
        description: 'Review the AI draft and apply it to the intake fields as needed.'
      });
    } catch (error) {
      console.error('AI drafting error:', error);
      setAiDraftStatus('error');
      toast({
        title: 'AI Draft Failed',
        description: error.message || 'Unable to generate AI draft. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const applyAiDraft = () => {
    if (!aiDraftContent) return;

    const updates = {
      intendedUse: workflowData.intendedUse || aiDraftContent,
      indicationsForUse: workflowData.indicationsForUse || aiDraftContent,
      technicalCharacteristics: workflowData.technicalCharacteristics || aiDraftContent,
      principlesOfOperation: workflowData.principlesOfOperation || aiDraftContent
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        updateWorkflowData(key, value);
      }
    });

    setAiDraftStatus('applied');
    toast({
      title: 'AI Draft Applied',
      description: 'AI-generated content has been applied to empty intake fields.'
    });
  };

  const markStageComplete = (stageId) => {
    updateWorkflowData(`stageProgress.${stageId}.status`, 'complete');
    updateWorkflowData(`stageProgress.${stageId}.completion`, 100);
  };

  const renderStrategySection = () => (
    <Card>
      <CardHeader>
        <CardTitle>Substantial Equivalence Strategy</CardTitle>
        <CardDescription>Define predicate alignment and rationale</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="equivalence-rationale">Equivalence Rationale</Label>
          <Textarea
            id="equivalence-rationale"
            value={workflowData.equivalenceRationale}
            onChange={(e) => updateWorkflowData('equivalenceRationale', e.target.value)}
            placeholder="Summarize how the device is substantially equivalent to predicate(s)."
            rows={4}
            data-testid="textarea-equivalence-rationale"
          />
        </div>
        <div>
          <Label htmlFor="program-justification">Program Justification</Label>
          <Textarea
            id="program-justification"
            value={workflowData.programJustification}
            onChange={(e) => updateWorkflowData('programJustification', e.target.value)}
            placeholder="Explain submission path selection, reference guidance or standards."
            rows={3}
            data-testid="textarea-program-justification"
          />
        </div>
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => saveWorkflowMutation.mutate()}
            disabled={saveWorkflowMutation.isPending}
            data-testid="button-save-strategy"
          >
            {saveWorkflowMutation.isPending ? 'Saving...' : 'Save Strategy'}
          </Button>
          <Button
            onClick={() => {
              markStageComplete('strategy');
              setCurrentStage(2);
              setActiveSection('standards_matrix');
            }}
            disabled={!workflowData.equivalenceRationale}
            data-testid="button-continue-to-evidence-plan"
          >
            Continue to Evidence Plan
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderEvidencePlanSection = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Standards & Declarations</CardTitle>
          <CardDescription>Document recognized standards and declarations of conformity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="standards-list-evidence">Recognized Standards</Label>
            <Textarea
              id="standards-list-evidence"
              value={workflowData.standardsList}
              onChange={(e) => updateWorkflowData('standardsList', e.target.value)}
              placeholder="IEC 60601-1, ISO 10993-1, IEC 62304, etc."
              rows={3}
              data-testid="textarea-standards-evidence"
            />
          </div>
          <div>
            <Label htmlFor="declarations-evidence">Declarations of Conformity</Label>
            <Textarea
              id="declarations-evidence"
              value={workflowData.declarationsOfConformity}
              onChange={(e) => updateWorkflowData('declarationsOfConformity', e.target.value)}
              placeholder="List declarations and supporting files."
              rows={2}
              data-testid="textarea-declarations-evidence"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrated Test Plan</CardTitle>
          <CardDescription>Confirm planned evidence generation for each discipline</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {Object.entries(workflowData.testingPlan).map(([key, plan]) => (
            <div key={key} className="rounded-lg border p-3 space-y-2">
              <div className="font-semibold text-sm capitalize">{key.replace(/_/g, ' ')}</div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`testing-${key}-planned`}>Planned</Label>
                <Switch
                  id={`testing-${key}-planned`}
                  checked={plan.planned}
                  onCheckedChange={(checked) => updateWorkflowData(`testingPlan.${key}.planned`, checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`testing-${key}-required`}>Required</Label>
                <Switch
                  id={`testing-${key}-required`}
                  checked={plan.required}
                  onCheckedChange={(checked) => updateWorkflowData(`testingPlan.${key}.required`, checked)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => saveWorkflowMutation.mutate()}
          disabled={saveWorkflowMutation.isPending}
          data-testid="button-save-evidence-plan"
        >
          {saveWorkflowMutation.isPending ? 'Saving...' : 'Save Evidence Plan'}
        </Button>
        <Button
          onClick={() => {
            markStageComplete('evidence_plan');
            setCurrentStage(3);
            setActiveSection('bench_testing');
          }}
          disabled={!workflowData.standardsList}
          data-testid="button-continue-to-evidence"
        >
          Continue to Evidence Collection
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
  
  // Render device intake form
  const renderDeviceIntakeForm = () => (
    <TooltipProvider>
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

      {/* Software & Cybersecurity */}
      {(workflowData.hasSoftware || workflowData.isCyberDevice) && (
        <Card>
          <CardHeader>
            <CardTitle>Software & Cybersecurity</CardTitle>
            <CardDescription>Software level of concern, connectivity, and cybersecurity controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="software-level">Software Level of Concern</Label>
                <Select
                  value={workflowData.softwareLevel}
                  onValueChange={(value) => updateWorkflowData('softwareLevel', value)}
                >
                  <SelectTrigger id="software-level" data-testid="select-software-level">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="software-complexity">Software Complexity</Label>
                <Select
                  value={workflowData.softwareComplexity}
                  onValueChange={(value) => updateWorkflowData('softwareComplexity', value)}
                >
                  <SelectTrigger id="software-complexity" data-testid="select-software-complexity">
                    <SelectValue placeholder="Select complexity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="connectivity">Connectivity</Label>
                <Input
                  id="connectivity"
                  value={workflowData.connectivity}
                  onChange={(e) => updateWorkflowData('connectivity', e.target.value)}
                  placeholder="Wi-Fi, Bluetooth, cellular, wired"
                  data-testid="input-connectivity"
                />
              </div>
              <div>
                <Label htmlFor="update-mechanism">Update Mechanism</Label>
                <Input
                  id="update-mechanism"
                  value={workflowData.updateMechanism}
                  onChange={(e) => updateWorkflowData('updateMechanism', e.target.value)}
                  placeholder="OTA, service tool, local update"
                  data-testid="input-update-mechanism"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="phi-handling">PHI / Data Handling</Label>
              <Textarea
                id="phi-handling"
                value={workflowData.phiHandling}
                onChange={(e) => updateWorkflowData('phiHandling', e.target.value)}
                placeholder="Describe PHI, encryption, storage, and access controls"
                rows={2}
                data-testid="textarea-phi-handling"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="sbom">SBOM Available</Label>
                <Switch
                  id="sbom"
                  checked={workflowData.sbomAvailable}
                  onCheckedChange={(checked) => updateWorkflowData('sbomAvailable', checked)}
                  data-testid="switch-sbom"
                />
              </div>
              <div>
                <Label htmlFor="auth-encryption">Authentication & Encryption</Label>
                <Input
                  id="auth-encryption"
                  value={workflowData.authEncryption}
                  onChange={(e) => updateWorkflowData('authEncryption', e.target.value)}
                  placeholder="MFA, TLS 1.2+, AES-256"
                  data-testid="input-auth-encryption"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vulnerability-management">Vulnerability Management</Label>
              <Textarea
                id="vulnerability-management"
                value={workflowData.vulnerabilityManagement}
                onChange={(e) => updateWorkflowData('vulnerabilityManagement', e.target.value)}
                placeholder="Monitoring, patch cadence, disclosure process"
                rows={2}
                data-testid="textarea-vulnerability-management"
              />
            </div>

            <div>
              <Label htmlFor="cyber-labeling">Cybersecurity Labeling</Label>
              <Textarea
                id="cyber-labeling"
                value={workflowData.cyberLabeling}
                onChange={(e) => updateWorkflowData('cyberLabeling', e.target.value)}
                placeholder="Security instructions for users/operators"
                rows={2}
                data-testid="textarea-cyber-labeling"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sterility & Biocompatibility */}
      {(workflowData.isSterile || workflowData.hasPatientContacting) && (
        <Card>
          <CardHeader>
            <CardTitle>Sterility & Biocompatibility</CardTitle>
            <CardDescription>Capture sterility validation and biocompatibility requirements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workflowData.isSterile && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sterilization-method">Sterilization Method</Label>
                    <Input
                      id="sterilization-method"
                      value={workflowData.sterilizationMethod}
                      onChange={(e) => updateWorkflowData('sterilizationMethod', e.target.value)}
                      placeholder="EtO, gamma, steam, aseptic"
                      data-testid="input-sterilization-method"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sterility-sal">Sterility Assurance Level (SAL)</Label>
                    <Input
                      id="sterility-sal"
                      value={workflowData.sterilitySAL}
                      onChange={(e) => updateWorkflowData('sterilitySAL', e.target.value)}
                      placeholder="e.g., 10^-6"
                      data-testid="input-sterility-sal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="endotoxin-limits">Endotoxin Limits</Label>
                    <Input
                      id="endotoxin-limits"
                      value={workflowData.endotoxinLimits}
                      onChange={(e) => updateWorkflowData('endotoxinLimits', e.target.value)}
                      placeholder="EU/device or EU/mL"
                      data-testid="input-endotoxin-limits"
                    />
                  </div>
                  <div>
                    <Label htmlFor="pyrogen-limits">Pyrogen Limits</Label>
                    <Input
                      id="pyrogen-limits"
                      value={workflowData.pyrogenLimits}
                      onChange={(e) => updateWorkflowData('pyrogenLimits', e.target.value)}
                      placeholder="Applicable limits or NA"
                      data-testid="input-pyrogen-limits"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="packaging-integrity">Packaging Integrity</Label>
                    <Input
                      id="packaging-integrity"
                      value={workflowData.packagingIntegrity}
                      onChange={(e) => updateWorkflowData('packagingIntegrity', e.target.value)}
                      placeholder="Seal strength, dye penetration"
                      data-testid="input-packaging-integrity"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shelf-life">Shelf Life</Label>
                    <Input
                      id="shelf-life"
                      value={workflowData.shelfLife}
                      onChange={(e) => updateWorkflowData('shelfLife', e.target.value)}
                      placeholder="Months/years"
                      data-testid="input-shelf-life"
                    />
                  </div>
                </div>
              </>
            )}

            {workflowData.hasPatientContacting && (
              <>
                <div>
                  <Label htmlFor="iso-mapping">ISO 10993 Mapping</Label>
                  <Textarea
                    id="iso-mapping"
                    value={workflowData.iso10993Mapping}
                    onChange={(e) => updateWorkflowData('iso10993Mapping', e.target.value)}
                    placeholder="List applicable ISO 10993 endpoints and rationale"
                    rows={2}
                    data-testid="textarea-iso-mapping"
                  />
                </div>
                <div>
                  <Label htmlFor="biocomp-summary">Biocompatibility Summary</Label>
                  <Textarea
                    id="biocomp-summary"
                    value={workflowData.biocompSummary}
                    onChange={(e) => updateWorkflowData('biocompSummary', e.target.value)}
                    placeholder="Summary of test strategy and results"
                    rows={2}
                    data-testid="textarea-biocomp-summary"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Testing & Standards Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Testing & Standards Summary</CardTitle>
          <CardDescription>High-level testing plans and standards declarations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="testing-bench">Bench/Performance Testing</Label>
              <Textarea
                id="testing-bench"
                value={workflowData.testingBench}
                onChange={(e) => updateWorkflowData('testingBench', e.target.value)}
                placeholder="Summary of bench testing strategy"
                rows={2}
                data-testid="textarea-testing-bench"
              />
            </div>
            <div>
              <Label htmlFor="testing-emc">Electrical Safety & EMC</Label>
              <Textarea
                id="testing-emc"
                value={workflowData.testingEmc}
                onChange={(e) => updateWorkflowData('testingEmc', e.target.value)}
                placeholder="IEC 60601-1, 60601-1-2, etc."
                rows={2}
                data-testid="textarea-testing-emc"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="testing-shelf-life">Shelf Life / Packaging</Label>
              <Textarea
                id="testing-shelf-life"
                value={workflowData.testingShelfLife}
                onChange={(e) => updateWorkflowData('testingShelfLife', e.target.value)}
                placeholder="Aging, packaging integrity"
                rows={2}
                data-testid="textarea-testing-shelf-life"
              />
            </div>
            <div>
              <Label htmlFor="testing-usability">Usability / Human Factors</Label>
              <Textarea
                id="testing-usability"
                value={workflowData.testingUsability}
                onChange={(e) => updateWorkflowData('testingUsability', e.target.value)}
                placeholder="IEC 62366, FDA guidance"
                rows={2}
                data-testid="textarea-testing-usability"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="standards-list">Recognized Standards</Label>
            <Textarea
              id="standards-list"
              value={workflowData.standardsList}
              onChange={(e) => updateWorkflowData('standardsList', e.target.value)}
              placeholder="List standards and versions"
              rows={2}
              data-testid="textarea-standards-list"
            />
          </div>
          <div>
            <Label htmlFor="declarations">Declarations of Conformity</Label>
            <Textarea
              id="declarations"
              value={workflowData.declarationsOfConformity}
              onChange={(e) => updateWorkflowData('declarationsOfConformity', e.target.value)}
              placeholder="Identify declarations and supporting documentation"
              rows={2}
              data-testid="textarea-declarations"
            />
          </div>
        </CardContent>
      </Card>

      {/* Labeling & UDI */}
      <Card>
        <CardHeader>
          <CardTitle>Labeling & UDI</CardTitle>
          <CardDescription>IFU, labeling content, and UDI references</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="ifu-available">IFU Available</Label>
            <Switch
              id="ifu-available"
              checked={workflowData.ifuAvailable}
              onCheckedChange={(checked) => updateWorkflowData('ifuAvailable', checked)}
              data-testid="switch-ifu-available"
            />
          </div>
          <div>
            <Label htmlFor="labeling-notes">Labeling Notes</Label>
            <Textarea
              id="labeling-notes"
              value={workflowData.labelingNotes}
              onChange={(e) => updateWorkflowData('labelingNotes', e.target.value)}
              placeholder="Key labeling statements and use limitations"
              rows={2}
              data-testid="textarea-labeling-notes"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="udi-notes">UDI Notes</Label>
              <Textarea
                id="udi-notes"
                value={workflowData.udiNotes}
                onChange={(e) => updateWorkflowData('udiNotes', e.target.value)}
                placeholder="UDI-DI/UDI-PI format and labeling"
                rows={2}
                data-testid="textarea-udi-notes"
              />
            </div>
            <div>
              <Label htmlFor="artwork-references">Artwork References</Label>
              <Textarea
                id="artwork-references"
                value={workflowData.artworkReferences}
                onChange={(e) => updateWorkflowData('artworkReferences', e.target.value)}
                placeholder="Labels, IFU, packaging artwork IDs"
                rows={2}
                data-testid="textarea-artwork-references"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attachments Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Attachments Summary</CardTitle>
          <CardDescription>Capture files and supporting evidence to upload</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="attachments-summary">Attachment Summary</Label>
            <Textarea
              id="attachments-summary"
              value={workflowData.attachmentsSummary}
              onChange={(e) => updateWorkflowData('attachmentsSummary', e.target.value)}
              placeholder="List key evidence files, reports, and references"
              rows={2}
              data-testid="textarea-attachments-summary"
            />
          </div>
          <div>
            <Label htmlFor="attachments-tags">Attachment Tags</Label>
            <Input
              id="attachments-tags"
              value={workflowData.attachmentsTags}
              onChange={(e) => updateWorkflowData('attachmentsTags', e.target.value)}
              placeholder="bench, biocomp, sterilization, software"
              data-testid="input-attachments-tags"
            />
          </div>
        </CardContent>
      </Card>

      {/* Clinical Data */}
      {workflowData.hasClinicalData && (
        <Card>
          <CardHeader>
            <CardTitle>Clinical Data</CardTitle>
            <CardDescription>Document clinical evidence and trial registration requirements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="clinical-data-used" className="flex items-center gap-2">
                Clinical data will be submitted
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-gray-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    If clinical studies are included, FDA Form 3674 is required.
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="clinical-data-used"
                checked={workflowData.clinicalDataUsed}
                onCheckedChange={(checked) => updateWorkflowData('clinicalDataUsed', checked)}
                data-testid="switch-clinical-data-used"
              />
            </div>
            {workflowData.clinicalDataUsed && (
              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Clinical data selected — FDA Form 3674 will be required in the Authoring stage.
                </AlertDescription>
              </Alert>
            )}
            <div>
              <Label htmlFor="clinical-data-summary">Clinical Data Summary</Label>
              <Textarea
                id="clinical-data-summary"
                value={workflowData.clinicalDataSummary}
                onChange={(e) => updateWorkflowData('clinicalDataSummary', e.target.value)}
                placeholder="Study design, enrollment, endpoints, key outcomes"
                rows={3}
                data-testid="textarea-clinical-data-summary"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Description */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Description</CardTitle>
          <CardDescription>Device composition, principles, and core technical characteristics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="technical-characteristics">Technical Characteristics</Label>
            <Textarea
              id="technical-characteristics"
              value={workflowData.technicalCharacteristics}
              onChange={(e) => updateWorkflowData('technicalCharacteristics', e.target.value)}
              placeholder="Key performance, design features, and technologies"
              rows={3}
              data-testid="textarea-technical-characteristics"
            />
          </div>
          <div>
            <Label htmlFor="principles-operation">Principles of Operation</Label>
            <Textarea
              id="principles-operation"
              value={workflowData.principlesOfOperation}
              onChange={(e) => updateWorkflowData('principlesOfOperation', e.target.value)}
              placeholder="Describe how the device achieves intended function"
              rows={3}
              data-testid="textarea-principles-operation"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="components">Components</Label>
              <Textarea
                id="components"
                value={workflowData.components}
                onChange={(e) => updateWorkflowData('components', e.target.value)}
                placeholder="Major components or subassemblies"
                rows={2}
                data-testid="textarea-components"
              />
            </div>
            <div>
              <Label htmlFor="critical-materials">Critical Materials</Label>
              <Textarea
                id="critical-materials"
                value={workflowData.criticalMaterials}
                onChange={(e) => updateWorkflowData('criticalMaterials', e.target.value)}
                placeholder="Patient-contacting or critical materials"
                rows={2}
                data-testid="textarea-critical-materials"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Entry Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Data Entry Mode
          </CardTitle>
          <CardDescription>Toggle between manual data entry and AI-assisted completion</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="entry-mode" className="flex items-center gap-2">
              AI-assisted completion
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  Use AI to draft intake narratives from your provided context. You remain in control of final edits.
                </TooltipContent>
              </Tooltip>
            </Label>
            <Switch
              id="entry-mode"
              checked={isAiAssistEnabled}
              onCheckedChange={(checked) => updateWorkflowData('entryMode', checked ? 'ai' : 'manual')}
              data-testid="switch-entry-mode"
            />
          </div>

          {isAiAssistEnabled && (
            <div className="space-y-3 rounded-lg border bg-purple-50 p-4">
              <Label htmlFor="ai-assist-context">AI Intake Context</Label>
              <Textarea
                id="ai-assist-context"
                value={workflowData.aiAssistContext}
                onChange={(e) => updateWorkflowData('aiAssistContext', e.target.value)}
                placeholder="Provide high-level device context, prior submissions, or key clinical/technical notes for the AI assistant."
                rows={3}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleGenerateAiDraft}
                  disabled={aiDraftStatus === 'drafting'}
                  data-testid="button-ai-draft"
                >
                  {aiDraftStatus === 'drafting' ? 'Drafting...' : 'Generate AI Draft'}
                </Button>
                {aiDraftContent && (
                  <Button variant="outline" onClick={applyAiDraft} data-testid="button-ai-apply">
                    Apply Draft to Empty Fields
                  </Button>
                )}
              </div>
              {aiDraftContent && (
                <Textarea
                  value={aiDraftContent}
                  onChange={(e) => setAiDraftContent(e.target.value)}
                  rows={4}
                  className="bg-white"
                  data-testid="textarea-ai-draft"
                />
              )}
            </div>
          )}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="address-street">Street Address</Label>
              <Input
                id="address-street"
                value={workflowData.address.street}
                onChange={(e) => updateWorkflowData('address.street', e.target.value)}
                placeholder="123 Main St"
                data-testid="input-address-street"
              />
            </div>
            <div>
              <Label htmlFor="address-city">City</Label>
              <Input
                id="address-city"
                value={workflowData.address.city}
                onChange={(e) => updateWorkflowData('address.city', e.target.value)}
                placeholder="Boston"
                data-testid="input-address-city"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="address-state">State/Province</Label>
              <Input
                id="address-state"
                value={workflowData.address.state}
                onChange={(e) => updateWorkflowData('address.state', e.target.value)}
                placeholder="MA"
                data-testid="input-address-state"
              />
            </div>
            <div>
              <Label htmlFor="address-zip">ZIP/Postal Code</Label>
              <Input
                id="address-zip"
                value={workflowData.address.zip}
                onChange={(e) => updateWorkflowData('address.zip', e.target.value)}
                placeholder="02110"
                data-testid="input-address-zip"
              />
            </div>
            <div>
              <Label htmlFor="address-country">Country</Label>
              <Input
                id="address-country"
                value={workflowData.address.country}
                onChange={(e) => updateWorkflowData('address.country', e.target.value)}
                placeholder="USA"
                data-testid="input-address-country"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="ra-contact-name">Regulatory Contact Name</Label>
              <Input
                id="ra-contact-name"
                value={workflowData.raContactName}
                onChange={(e) => updateWorkflowData('raContactName', e.target.value)}
                placeholder="Regulatory lead"
                data-testid="input-ra-contact-name"
              />
            </div>
            <div>
              <Label htmlFor="ra-contact-email">Regulatory Contact Email</Label>
              <Input
                id="ra-contact-email"
                type="email"
                value={workflowData.raContactEmail}
                onChange={(e) => updateWorkflowData('raContactEmail', e.target.value)}
                placeholder="ra@company.com"
                data-testid="input-ra-contact-email"
              />
            </div>
            <div>
              <Label htmlFor="ra-contact-phone">Regulatory Contact Phone</Label>
              <Input
                id="ra-contact-phone"
                type="tel"
                value={workflowData.raContactPhone}
                onChange={(e) => updateWorkflowData('raContactPhone', e.target.value)}
                placeholder="+1 (555) 123-9876"
                data-testid="input-ra-contact-phone"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="small-business">Small Business Determination</Label>
              <Switch
                id="small-business"
                checked={workflowData.smallBusinessDetermination}
                onCheckedChange={(checked) => updateWorkflowData('smallBusinessDetermination', checked)}
                data-testid="switch-small-business"
              />
            </div>
            <div>
              <Label htmlFor="user-fee">User Fee Reference (FDA 3601)</Label>
              <Input
                id="user-fee"
                value={workflowData.userFeeReference}
                onChange={(e) => updateWorkflowData('userFeeReference', e.target.value)}
                placeholder="Payment confirmation or reference"
                data-testid="input-user-fee"
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
              <Label htmlFor="device-name">Device Name</Label>
              <Input
                id="device-name"
                value={workflowData.deviceName}
                onChange={(e) => updateWorkflowData('deviceName', e.target.value)}
                placeholder="Trade/proprietary name"
                data-testid="input-device-name"
              />
            </div>
            <div>
              <Label htmlFor="product-code">Product Code</Label>
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
            <Label htmlFor="device-model-family">Model Family / Variants</Label>
            <Input
              id="device-model-family"
              value={workflowData.deviceModelFamily}
              onChange={(e) => updateWorkflowData('deviceModelFamily', e.target.value)}
              placeholder="Family name or variant grouping"
              data-testid="input-device-model-family"
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

          <div>
            <Label htmlFor="accessories-notes">Accessory Notes</Label>
            <Input
              id="accessories-notes"
              value={workflowData.accessoriesNotes}
              onChange={(e) => updateWorkflowData('accessoriesNotes', e.target.value)}
              placeholder="Accessory indications or limitations"
              data-testid="input-accessories-notes"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="advisory-committee">Advisory Committee</Label>
              <Input
                id="advisory-committee"
                value={workflowData.advisoryCommittee}
                onChange={(e) => updateWorkflowData('advisoryCommittee', e.target.value)}
                placeholder="e.g., Cardiovascular"
                data-testid="input-advisory-committee"
              />
            </div>
            <div>
              <Label htmlFor="energy-source">Energy Source</Label>
              <Input
                id="energy-source"
                value={workflowData.energySource}
                onChange={(e) => updateWorkflowData('energySource', e.target.value)}
                placeholder="Electrical, mechanical, battery"
                data-testid="input-energy-source"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="rx-use">Rx Use</Label>
              <Switch
                id="rx-use"
                checked={workflowData.rxUse}
                onCheckedChange={(checked) => updateWorkflowData('rxUse', checked)}
                data-testid="switch-rx-use"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="otc-use">OTC Use</Label>
              <Switch
                id="otc-use"
                checked={workflowData.otcUse}
                onCheckedChange={(checked) => updateWorkflowData('otcUse', checked)}
                data-testid="switch-otc-use"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="environment-use">Environment of Use</Label>
              <Input
                id="environment-use"
                value={workflowData.environmentOfUse}
                onChange={(e) => updateWorkflowData('environmentOfUse', e.target.value)}
                placeholder="Hospital, clinic, home"
                data-testid="input-environment-use"
              />
            </div>
            <div>
              <Label htmlFor="patient-population">Patient Population</Label>
              <Input
                id="patient-population"
                value={workflowData.patientPopulation}
                onChange={(e) => updateWorkflowData('patientPopulation', e.target.value)}
                placeholder="Adults, pediatrics, neonates"
                data-testid="input-patient-population"
              />
            </div>
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
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
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
            <Label htmlFor="intended-use">Intended Use Statement</Label>
            <Textarea
              id="intended-use"
              value={workflowData.intendedUse}
              onChange={(e) => updateWorkflowData('intendedUse', e.target.value)}
              placeholder="Describe the general purpose of the device..."
              rows={4}
              data-testid="textarea-intended-use"
            />
            <p className="text-sm text-gray-500 mt-1">
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
            <p className="text-sm text-gray-500 mt-1">
              Specific medical conditions and patient populations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary & Attestation */}
      <Card>
        <CardHeader>
          <CardTitle>Summary & Attestation</CardTitle>
          <CardDescription>Confirm the submission summary type and certification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="summary-choice" className="flex items-center gap-2">
              510(k) Summary or Statement
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  Choose either a 510(k) Summary (most common) or a 510(k) Statement (FD&C Act 513(i)(1)(B)).
                </TooltipContent>
              </Tooltip>
            </Label>
            <Select
              value={workflowData.summaryChoice}
              onValueChange={(value) => updateWorkflowData('summaryChoice', value)}
            >
              <SelectTrigger id="summary-choice" data-testid="select-summary-choice">
                <SelectValue placeholder="Select summary type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">510(k) Summary</SelectItem>
                <SelectItem value="statement">510(k) Statement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="truthful-accurate"
              checked={workflowData.truthfulAccurate}
              onCheckedChange={(checked) => updateWorkflowData('truthfulAccurate', !!checked)}
              data-testid="checkbox-truthful-accurate"
            />
            <Label htmlFor="truthful-accurate">
              I certify the information provided is truthful and accurate.
            </Label>
          </div>
        </CardContent>
      </Card>
      
      {/* Save & Continue */}
      <div className="flex justify-between">
        <Button 
          variant="outline"
          onClick={() => {
            // Save to backend (connected to document generation)
            if (projectId) {
              saveWorkflowMutation.mutate();
            }
            // Also call the provided onSave callback
            if (onSave) onSave(workflowData);
          }}
          disabled={saveWorkflowMutation.isPending}
          data-testid="button-save-intake"
        >
          {saveWorkflowMutation.isPending ? "Saving..." : "Save Progress"}
        </Button>
        
        <Button
          onClick={() => {
            updateWorkflowData('stageProgress.setup.gates.device_intake', true);
            setActiveSection('predicate_search');
            toast({ title: "Device Intake Complete", description: "Moving to Predicate Search" });
          }}
          disabled={
            !workflowData.deviceName ||
            !workflowData.productCode ||
            !workflowData.intendedUse ||
            !workflowData.summaryChoice ||
            !workflowData.truthfulAccurate
          }
          data-testid="button-continue-to-predicate"
        >
          Continue to Predicate Search
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
  
  // Render main workflow interface
  return (
    <div className="min-h-screen bg-gray-50 p-6" data-testid="enhanced-510k-workflow">
      {/* Header with progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">FDA 510(k) Submission Workflow</h1>
            <p className="text-gray-600 mt-1">Enhanced 7-Stage Gated Process with Auto-Population</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Overall Progress</div>
            <div className="text-2xl font-bold text-blue-600">{calculateOverallProgress()}%</div>
          </div>
        </div>
        
        <Progress value={calculateOverallProgress()} className="h-3" />
        
        {/* No Project Warning */}
        {!projectId && (
          <Alert className="mt-4 bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>No Project Selected</strong> - Please create or select a project to save your workflow data. Click "New Project" to get started.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Auto-Population Status Banner */}
        {projectId && (
          <Alert className="mt-4 bg-green-50 border-green-200">
            <Activity className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Automatic Document Population Active</strong> - Your 510(k) documents are automatically populated with data as you complete workflow stages. No manual document generation step needed - everything flows seamlessly from forms to documents.
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
        {/* Left Sidebar - Stage Info */}
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {WORKFLOW_CONFIG.stages[currentStage].icon}
                {WORKFLOW_CONFIG.stages[currentStage].name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
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
                    <span className="text-gray-600">{form.form_number}</span>
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
        <div className="col-span-6">
          {/* Render appropriate section based on current stage and section */}
          {currentStage === 0 && activeSection === 'device_intake' && renderDeviceIntakeForm()}
          
          {currentStage === 0 && activeSection === 'predicate_search' && (
            <div className="space-y-4">
              <PredicateFinderPanel
                deviceProfile={workflowData}
                setDeviceProfile={(newProfile) => setWorkflowData(newProfile)}
                organizationId={organizationId}
                onPredicatesFound={(predicates) => {
                  console.log('Predicates found:', predicates);
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
          {currentStage === 1 && activeSection === 'se_strategy' && renderStrategySection()}

          {currentStage === 2 && (
            <div className="space-y-4">
              {activeSection === 'standards_matrix' && renderEvidencePlanSection()}
              {activeSection === 'test_plan' && renderEvidencePlanSection()}
            </div>
          )}

          {currentStage > 2 && (
            <Card>
              <CardHeader>
                <CardTitle>{WORKFLOW_CONFIG.stages[currentStage].name}</CardTitle>
                <CardDescription>{WORKFLOW_CONFIG.stages[currentStage].description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This stage is ready for evidence upload and authoring workflows. Continue in the document editor and evidence modules to complete this phase.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Right Sidebar - Compliance & Documents */}
        <div className="col-span-4">
          <Tabs defaultValue="oversight" className="space-y-4">
            <TabsList className="w-full">
              <TabsTrigger value="oversight" className="flex-1">Compliance Oversight</TabsTrigger>
              <TabsTrigger value="documents" className="flex-1">Documents Under Production</TabsTrigger>
            </TabsList>
            <TabsContent value="oversight">
              <ComplianceOversightPanel
                projectId={projectId}
                currentData={workflowData}
                stage={WORKFLOW_CONFIG.stages[currentStage].id}
                section={activeSection}
              />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentGenerationPanel
                projectId={projectId}
                projectData={workflowData}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Enhanced510kIntakeWorkflow;