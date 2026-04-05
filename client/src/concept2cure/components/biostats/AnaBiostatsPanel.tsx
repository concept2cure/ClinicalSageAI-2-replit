/**
 * AnA Biostats Panel — Primary biostatistics operating surface
 *
 * Integrates into the existing Concept2Cure workspace as a panel.
 * Provides structured input collection, deterministic computation,
 * judgment display, and governed document actions.
 *
 * Follows the same calm, clean, project-centric workspace language.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

// Types matching server-side contracts
type ClientTrack = 'biotech_pharma' | 'medical_device' | 'diagnostics_ivd';
type StudyType = 'superiority' | 'non_inferiority' | 'equivalence' | 'single_arm' | 'adaptive' | 'diagnostic_accuracy' | 'performance' | 'agreement';
type EndpointType = 'continuous' | 'binary' | 'time_to_event' | 'sensitivity_specificity' | 'agreement' | 'auc_roc';
type ObjectiveType = 'efficacy' | 'safety' | 'performance' | 'diagnostic_accuracy';
type RegulatoryBody = 'FDA' | 'EMA' | 'MHRA' | 'PMDA' | 'NMPA' | 'TGA' | 'Health_Canada';
type StatisticalDocumentType =
  | 'sample_size_rationale'
  | 'statistical_risk_memo'
  | 'design_assumption_note'
  | 'sap_section_draft'
  | 'scenario_comparison_brief'
  | 'statistical_reviewer_response'
  | 'protocol_statistical_section'
  | 'submission_statistical_note';

interface StatisticalInput {
  projectId?: number;
  clientTrack: ClientTrack;
  regulatoryBody?: RegulatoryBody;
  studyType: StudyType;
  objectiveType: ObjectiveType;
  endpointType: EndpointType;
  alpha: number;
  powerTarget: number;
  effectSize: number;
  variance?: number;
  eventRate?: number;
  controlRate?: number;
  treatmentRate?: number;
  sensitivity?: number;
  specificity?: number;
  prevalence?: number;
  nonInferiorityMargin?: number;
  equivalenceMargin?: number;
  attritionRate: number;
  allocationRatio: number;
  indication?: string;
  phase?: string;
  numberOfGroups?: number;
  interimAnalyses?: number;
  numberOfEndpoints?: number;
  multiplicityMethod?: 'bonferroni' | 'holm' | 'hochberg' | 'dunnett' | 'none';
  estimandStrategy?: 'treatment_policy' | 'hypothetical' | 'composite' | 'principal_stratum' | 'while_on_treatment';
  missingDataMethod?: 'complete_case' | 'LOCF' | 'MMRM' | 'multiple_imputation' | 'pattern_mixture';
  expectedMissingRate?: number;
  comparatorType?: 'placebo' | 'active' | 'historical' | 'performance_goal';
}


interface Props {
  projectId?: number;
  defaultTrack?: ClientTrack;
  onArtifactCreated?: (artifactId: number) => void;
}


interface GenerationHistoryItem {
  documentType: StatisticalDocumentType;
  title: string;
  generatedAt: string;
  status?: string;
  artifactId?: number;
  editorUrl?: string;
}

const TRACK_OPTIONS: { value: ClientTrack; label: string }[] = [
  { value: 'biotech_pharma', label: 'Pharma / Biotech' },
  { value: 'medical_device', label: 'Medical Device' },
  { value: 'diagnostics_ivd', label: 'Diagnostics / IVD' },
];

const STUDY_TYPE_OPTIONS: Record<ClientTrack, { value: StudyType; label: string }[]> = {
  biotech_pharma: [
    { value: 'superiority', label: 'Superiority' },
    { value: 'non_inferiority', label: 'Non-inferiority' },
    { value: 'equivalence', label: 'Equivalence' },
    { value: 'single_arm', label: 'Single-arm' },
    { value: 'adaptive', label: 'Adaptive' },
  ],
  medical_device: [
    { value: 'non_inferiority', label: 'Non-inferiority' },
    { value: 'equivalence', label: 'Equivalence' },
    { value: 'performance', label: 'Performance goal' },
    { value: 'superiority', label: 'Superiority' },
  ],
  diagnostics_ivd: [
    { value: 'diagnostic_accuracy', label: 'Diagnostic accuracy' },
    { value: 'agreement', label: 'Method agreement' },
    { value: 'performance', label: 'Performance evaluation' },
  ],
};

const ENDPOINT_OPTIONS: Record<ClientTrack, { value: EndpointType; label: string }[]> = {
  biotech_pharma: [
    { value: 'continuous', label: 'Continuous' },
    { value: 'binary', label: 'Binary' },
    { value: 'time_to_event', label: 'Time-to-event' },
  ],
  medical_device: [
    { value: 'continuous', label: 'Continuous' },
    { value: 'binary', label: 'Binary (success/failure)' },
  ],
  diagnostics_ivd: [
    { value: 'sensitivity_specificity', label: 'Sensitivity / Specificity' },
    { value: 'agreement', label: 'Agreement' },
    { value: 'auc_roc', label: 'AUC / ROC' },
  ],
};



const DOCUMENT_TYPE_OPTIONS: { value: StatisticalDocumentType; label: string; category: 'sap' | 'core' }[] = [
  { value: 'sample_size_rationale', label: 'Sample Size Rationale', category: 'core' },
  { value: 'statistical_risk_memo', label: 'Statistical Risk Memo', category: 'core' },
  { value: 'design_assumption_note', label: 'Design Assumption Note', category: 'core' },
  { value: 'scenario_comparison_brief', label: 'Scenario Comparison Brief', category: 'core' },
  { value: 'sap_section_draft', label: 'SAP Section Draft', category: 'sap' },
  { value: 'protocol_statistical_section', label: 'Protocol Statistical Section', category: 'sap' },
  { value: 'submission_statistical_note', label: 'Submission Statistical Note', category: 'sap' },
  { value: 'statistical_reviewer_response', label: 'Statistical Reviewer Response', category: 'sap' },
];

const SAP_DOCUMENT_TYPES: StatisticalDocumentType[] = DOCUMENT_TYPE_OPTIONS.filter(option => option.category === 'sap').map(option => option.value);


const DOCUMENT_TEMPLATE_NOTES: Record<StatisticalDocumentType, string> = {
  sample_size_rationale: 'Power and sample-size assumptions with deterministic formula traceability.',
  statistical_risk_memo: 'Risk framing for alpha/power, fragility, missing data, and escalation triggers.',
  design_assumption_note: 'Assumption registry for endpoint definitions, effect size, and operational constraints.',
  sap_section_draft: 'Regulator-grade SAP section draft including estimand, multiplicity, and missing-data strategy.',
  scenario_comparison_brief: 'Side-by-side scenario tradeoff brief for governance decisions.',
  statistical_reviewer_response: 'Structured response template for agency/statistical reviewer questions.',
  protocol_statistical_section: 'Protocol-ready statistical methods section aligned to SAP assumptions.',
  submission_statistical_note: 'Submission package note linking methods, assumptions, and outputs for reviewers.',
};

type BiostatsTemplate = {
  id: string;
  label: string;
  description: string;
  values: Partial<StatisticalInput>;
};

const BIOSTATS_TEMPLATES: BiostatsTemplate[] = [
  {
    id: 'phase3-efficacy-sap',
    label: 'Phase III Efficacy SAP',
    description: 'Two-arm superiority with multiplicity and estimand defaults for pivotal submissions.',
    values: {
      clientTrack: 'biotech_pharma',
      studyType: 'superiority',
      endpointType: 'time_to_event',
      objectiveType: 'efficacy',
      regulatoryBody: 'FDA',
      alpha: 0.05,
      powerTarget: 0.9,
      effectSize: 0.35,
      attritionRate: 0.12,
      allocationRatio: 1,
      numberOfEndpoints: 3,
      multiplicityMethod: 'holm',
      estimandStrategy: 'treatment_policy',
      missingDataMethod: 'MMRM',
      expectedMissingRate: 0.1,
      comparatorType: 'active',
      phase: 'III',
    },
  },
  {
    id: 'device-ni-sap',
    label: 'Device Non-Inferiority SAP',
    description: 'Medical device active-control non-inferiority design with conservative missing-data assumptions.',
    values: {
      clientTrack: 'medical_device',
      studyType: 'non_inferiority',
      endpointType: 'binary',
      objectiveType: 'performance',
      regulatoryBody: 'FDA',
      alpha: 0.025,
      powerTarget: 0.9,
      effectSize: 0.2,
      nonInferiorityMargin: 0.1,
      attritionRate: 0.1,
      allocationRatio: 1,
      numberOfEndpoints: 2,
      multiplicityMethod: 'bonferroni',
      estimandStrategy: 'while_on_treatment',
      missingDataMethod: 'multiple_imputation',
      expectedMissingRate: 0.08,
      comparatorType: 'active',
    },
  },
  {
    id: 'ivd-dx-sap',
    label: 'IVD Diagnostic Accuracy SAP',
    description: 'Sensitivity/specificity-focused template with ROC/AUC-ready assumptions.',
    values: {
      clientTrack: 'diagnostics_ivd',
      studyType: 'diagnostic_accuracy',
      endpointType: 'sensitivity_specificity',
      objectiveType: 'diagnostic_accuracy',
      regulatoryBody: 'FDA',
      alpha: 0.05,
      powerTarget: 0.9,
      sensitivity: 0.9,
      specificity: 0.9,
      prevalence: 0.3,
      attritionRate: 0.08,
      allocationRatio: 1,
      numberOfEndpoints: 2,
      multiplicityMethod: 'none',
      estimandStrategy: 'hypothetical',
      missingDataMethod: 'MMRM',
      expectedMissingRate: 0.05,
      comparatorType: 'performance_goal',
    },
  },
];

const REGULATORY_OPTIONS: { value: RegulatoryBody; label: string }[] = [
  { value: 'FDA', label: 'FDA (US)' },
  { value: 'EMA', label: 'EMA (EU)' },
  { value: 'MHRA', label: 'MHRA (UK)' },
  { value: 'PMDA', label: 'PMDA (Japan)' },
  { value: 'NMPA', label: 'NMPA (China)' },
  { value: 'TGA', label: 'TGA (Australia)' },
  { value: 'Health_Canada', label: 'Health Canada' },
];

export function AnaBiostatsPanel({ projectId, defaultTrack, onArtifactCreated }: Props) {
  const { toast } = useToast();

  // Form state
  const [track, setTrack] = useState<ClientTrack>(defaultTrack ?? 'biotech_pharma');
  const [studyType, setStudyType] = useState<StudyType>('superiority');
  const [endpointType, setEndpointType] = useState<EndpointType>('continuous');
  const [objectiveType, setObjectiveType] = useState<ObjectiveType>('efficacy');
  const [regulatoryBody, setRegulatoryBody] = useState<RegulatoryBody>('FDA');
  const [alpha, setAlpha] = useState(0.05);
  const [powerTarget, setPowerTarget] = useState(0.80);
  const [effectSize, setEffectSize] = useState(0.5);
  const [variance, setVariance] = useState<number | undefined>();
  const [controlRate, setControlRate] = useState<number | undefined>();
  const [treatmentRate, setTreatmentRate] = useState<number | undefined>();
  const [sensitivity, setSensitivity] = useState<number | undefined>();
  const [specificity, setSpecificity] = useState<number | undefined>();
  const [prevalence, setPrevalence] = useState<number | undefined>();
  const [nonInferiorityMargin, setNonInferiorityMargin] = useState<number | undefined>();
  const [attritionRate, setAttritionRate] = useState(0.15);
  const [allocationRatio, setAllocationRatio] = useState(1);
  const [indication, setIndication] = useState('');
  const [phase, setPhase] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [selectedDocumentTypes, setSelectedDocumentTypes] = useState<StatisticalDocumentType[]>(['sample_size_rationale', 'sap_section_draft']);
  const [fullSapMode, setFullSapMode] = useState(true);
  const [attachToProject, setAttachToProject] = useState(true);
  const [autoAttachToDossier, setAutoAttachToDossier] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(true);
  const [numberOfEndpoints, setNumberOfEndpoints] = useState<number>(1);
  const [multiplicityMethod, setMultiplicityMethod] = useState<StatisticalInput['multiplicityMethod']>('none');
  const [estimandStrategy, setEstimandStrategy] = useState<StatisticalInput['estimandStrategy']>('treatment_policy');
  const [missingDataMethod, setMissingDataMethod] = useState<StatisticalInput['missingDataMethod']>('MMRM');
  const [expectedMissingRate, setExpectedMissingRate] = useState<number>(0.1);
  const [comparatorType, setComparatorType] = useState<StatisticalInput['comparatorType']>('active');

  // Results state
  const [results, setResults] = useState<any>(null);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [showFirstRunGuide, setShowFirstRunGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = window.localStorage.getItem('ana_biostats_guide_dismissed') === '1';
    setShowFirstRunGuide(!dismissed);
  }, []);

  // Build input object
  const buildInput = useCallback((): Partial<StatisticalInput> => ({
    projectId: attachToProject ? projectId : undefined,
    clientTrack: track,
    regulatoryBody,
    studyType,
    objectiveType,
    endpointType,
    alpha,
    powerTarget,
    effectSize,
    variance,
    controlRate,
    treatmentRate,
    sensitivity,
    specificity,
    prevalence,
    nonInferiorityMargin,
    attritionRate,
    allocationRatio,
    indication: indication || undefined,
    phase: phase || undefined,
    numberOfEndpoints,
    multiplicityMethod,
    estimandStrategy,
    missingDataMethod,
    expectedMissingRate,
    comparatorType,
  }), [track, studyType, endpointType, objectiveType, regulatoryBody, alpha, powerTarget, effectSize, variance, controlRate, treatmentRate, sensitivity, specificity, prevalence, nonInferiorityMargin, attritionRate, allocationRatio, indication, phase, projectId, attachToProject, numberOfEndpoints, multiplicityMethod, estimandStrategy, missingDataMethod, expectedMissingRate, comparatorType]);

  // Quick compute mutation
  const computeMutation = useMutation({
    mutationFn: async (input: Partial<StatisticalInput>) => {
      const res = await apiRequest('POST', '/api/ana-biostats/compute', input);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      setActiveTab('results');
      toast({ title: 'Computation complete', description: data.interpretation?.summary?.slice(0, 100) });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Workflow mutation (with document generation)
  const workflowMutation = useMutation({
    mutationFn: async ({ input, documentType }: { input: Partial<StatisticalInput>; documentType: StatisticalDocumentType }) => {
      const res = await apiRequest('POST', '/api/ana-biostats/workflow', {
          workflowType: documentType === 'statistical_risk_memo' ? 'statistical_risk_review' : 'sample_size_rationale',
          input,
          generateDocument: true,
          documentType,
          autoAttachToDossier,
          reviewRequired,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data, variables) => {
      setResults(data);
      setActiveTab('document');
      if (data?.document?.title) {
        const artifactAction = data.workflowActions?.find((a: any) => a.action === 'create_artifact');
        const editorAction = data.workflowActions?.find((a: any) => a.action === 'open_in_editor');

        setGenerationHistory(prev => [
          {
            documentType: variables.documentType,
            title: data.document.title,
            generatedAt: new Date().toISOString(),
            status: data.document.status,
            artifactId: artifactAction?.artifactId,
            editorUrl: editorAction?.editorUrl,
          },
          ...prev,
        ].slice(0, 8));
      }
      toast({ title: 'Document generated', description: data.document?.title });
      if (data.workflowActions?.find((a: any) => a.action === 'create_artifact')?.artifactId) {
        onArtifactCreated?.(data.workflowActions.find((a: any) => a.action === 'create_artifact').artifactId);
      }
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const applyTemplate = (template: BiostatsTemplate) => {
    const v = template.values;
    if (v.clientTrack) {
      setTrack(v.clientTrack);
      setStudyType(v.studyType ?? STUDY_TYPE_OPTIONS[v.clientTrack][0].value);
      setEndpointType(v.endpointType ?? ENDPOINT_OPTIONS[v.clientTrack][0].value);
    }
    if (v.objectiveType) setObjectiveType(v.objectiveType);
    if (v.regulatoryBody) setRegulatoryBody(v.regulatoryBody);
    if (typeof v.alpha === 'number') setAlpha(v.alpha);
    if (typeof v.powerTarget === 'number') setPowerTarget(v.powerTarget);
    if (typeof v.effectSize === 'number') setEffectSize(v.effectSize);
    if (typeof v.nonInferiorityMargin === 'number') setNonInferiorityMargin(v.nonInferiorityMargin);
    if (typeof v.sensitivity === 'number') setSensitivity(v.sensitivity);
    if (typeof v.specificity === 'number') setSpecificity(v.specificity);
    if (typeof v.prevalence === 'number') setPrevalence(v.prevalence);
    if (typeof v.attritionRate === 'number') setAttritionRate(v.attritionRate);
    if (typeof v.allocationRatio === 'number') setAllocationRatio(v.allocationRatio);
    if (typeof v.numberOfEndpoints === 'number') setNumberOfEndpoints(v.numberOfEndpoints);
    if (v.multiplicityMethod) setMultiplicityMethod(v.multiplicityMethod);
    if (v.estimandStrategy) setEstimandStrategy(v.estimandStrategy);
    if (v.missingDataMethod) setMissingDataMethod(v.missingDataMethod);
    if (typeof v.expectedMissingRate === 'number') setExpectedMissingRate(v.expectedMissingRate);
    if (v.comparatorType) setComparatorType(v.comparatorType);
    if (v.phase) setPhase(v.phase);

    toast({ title: `${template.label} loaded`, description: template.description });
  };

  const handleCompute = () => {
    computeMutation.mutate(buildInput());
  };

  const handleGenerateDocument = (docType: StatisticalDocumentType) => {
    workflowMutation.mutate({ input: buildInput(), documentType: docType });
  };

  const toggleDocumentType = (docType: StatisticalDocumentType, checked: boolean) => {
    setSelectedDocumentTypes(prev => {
      if (checked) {
        return prev.includes(docType) ? prev : [...prev, docType];
      }
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter(item => item !== docType);
    });
  };

  const handleGenerateSelectedDocuments = async () => {
    if (workflowMutation.isPending) return;

    const docTypesToGenerate = fullSapMode ? SAP_DOCUMENT_TYPES : selectedDocumentTypes;

    if (!docTypesToGenerate.length) {
      toast({ title: 'Select at least one document type', variant: 'destructive' });
      return;
    }

    try {
      for (const docType of docTypesToGenerate) {
        await workflowMutation.mutateAsync({ input: buildInput(), documentType: docType });
      }

      toast({
        title: 'Biostats package generated',
        description: `${docTypesToGenerate.length} governed document${docTypesToGenerate.length > 1 ? 's' : ''} created via AnA.`,
      });
    } catch (error: any) {
      toast({
        title: 'Package generation halted',
        description: error?.message || 'One of the selected documents failed to generate.',
        variant: 'destructive',
      });
    }
  };

  // Track-aware fields
  const showBinaryFields = endpointType === 'binary';
  const showDiagnosticFields = track === 'diagnostics_ivd';
  const showNIMargin = studyType === 'non_inferiority';

  const traceabilityPreview = useMemo(() => {
    const docs = fullSapMode ? SAP_DOCUMENT_TYPES : selectedDocumentTypes;
    return [
      `Multiplicity (${multiplicityMethod}) → ${docs.includes('sap_section_draft') ? 'SAP section draft' : 'selected governed docs'}`,
      `Estimand (${estimandStrategy}) → ${docs.includes('protocol_statistical_section') ? 'Protocol statistical section' : 'statistical rationale set'}`,
      `Missing data (${missingDataMethod}, ${(expectedMissingRate * 100).toFixed(1)}%) → ${docs.includes('statistical_risk_memo') ? 'Risk memo' : 'review thread recommendations'}`,
      `Comparator (${comparatorType}) + endpoints (${numberOfEndpoints}) → ${docs.includes('submission_statistical_note') ? 'Submission statistical note' : 'scenario comparison brief'}`,
      `${attachToProject ? 'Project-bound' : 'Cross-project'} output with ${reviewRequired ? 'review thread' : 'no review thread'} and ${autoAttachToDossier ? 'dossier auto-attach enabled' : 'manual dossier attach'}`,
    ];
  }, [
    fullSapMode,
    selectedDocumentTypes,
    multiplicityMethod,
    estimandStrategy,
    missingDataMethod,
    expectedMissingRate,
    comparatorType,
    numberOfEndpoints,
    attachToProject,
    reviewRequired,
    autoAttachToDossier,
  ]);

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-stone-300">AnA Biostats</h3>
            <Badge variant="outline" className="text-xs">{track.replace('_', ' / ')}</Badge>
          </div>
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="input" className="text-xs">Input</TabsTrigger>
            <TabsTrigger value="results" className="text-xs">Results</TabsTrigger>
            <TabsTrigger value="document" className="text-xs">Document</TabsTrigger>
          </TabsList>
        </div>

        {/* INPUT TAB */}
        <TabsContent value="input" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {showFirstRunGuide && (
            <Alert>
              <AlertDescription className="text-xs flex items-start justify-between gap-2">
                <span>Tip: Start with an SME template, verify SAP strategy controls, then generate a full SAP package.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => {
                    setShowFirstRunGuide(false);
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem('ana_biostats_guide_dismissed', '1');
                    }
                  }}
                >
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {/* Track */}
          <div>
            <Label className="text-xs text-stone-400">Domain Track</Label>
            <Select value={track} onValueChange={(v) => { setTrack(v as ClientTrack); setStudyType(STUDY_TYPE_OPTIONS[v as ClientTrack][0].value); setEndpointType(ENDPOINT_OPTIONS[v as ClientTrack][0].value); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRACK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Regulatory body */}
          <div>
            <Label className="text-xs text-stone-400">Regulatory Body</Label>
            <Select value={regulatoryBody} onValueChange={(v) => setRegulatoryBody(v as RegulatoryBody)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGULATORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setRegulatoryBody('FDA')}>US</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setRegulatoryBody('EMA')}>EU</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setRegulatoryBody('PMDA')}>Japan</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setRegulatoryBody('NMPA')}>China</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setRegulatoryBody('Health_Canada')}>Canada</Button>
          </div>

          {/* Study type */}
          <div>
            <Label className="text-xs text-stone-400">Study Type</Label>
            <Select value={studyType} onValueChange={(v) => setStudyType(v as StudyType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STUDY_TYPE_OPTIONS[track].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint type */}
          <div>
            <Label className="text-xs text-stone-400">Endpoint Type</Label>
            <Select value={endpointType} onValueChange={(v) => setEndpointType(v as EndpointType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENDPOINT_OPTIONS[track].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border border-stone-700/60 bg-stone-900/30 p-3">
            <p className="text-xs font-medium text-stone-300">Biostats SME Templates</p>
            <p className="text-[11px] text-stone-400">Load regulator-grade defaults for common SAP scenarios.</p>
            <div className="space-y-1">
              {BIOSTATS_TEMPLATES.map(template => (
                <Button
                  key={template.id}
                  variant="outline"
                  size="sm"
                  className="w-full h-auto py-1.5 justify-start text-left"
                  onClick={() => applyTemplate(template)}
                >
                  <span className="text-xs font-medium">{template.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Core parameters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-stone-400">Alpha (α)</Label>
              <Input type="number" step="0.01" value={alpha} onChange={e => setAlpha(parseFloat(e.target.value) || 0.05)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Power Target</Label>
              <Input type="number" step="0.05" value={powerTarget} onChange={e => setPowerTarget(parseFloat(e.target.value) || 0.80)} className="h-8 text-xs" />
            </div>
          </div>

          {!showDiagnosticFields && (
            <div>
              <Label className="text-xs text-stone-400">Effect Size</Label>
              <Input type="number" step="0.1" value={effectSize} onChange={e => setEffectSize(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
            </div>
          )}

          {showBinaryFields && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-stone-400">Control Rate</Label>
                <Input type="number" step="0.05" value={controlRate ?? ''} onChange={e => setControlRate(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-stone-400">Treatment Rate</Label>
                <Input type="number" step="0.05" value={treatmentRate ?? ''} onChange={e => setTreatmentRate(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
            </div>
          )}

          {showDiagnosticFields && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-stone-400">Sensitivity Target</Label>
                  <Input type="number" step="0.05" value={sensitivity ?? 0.90} onChange={e => setSensitivity(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-stone-400">Specificity Target</Label>
                  <Input type="number" step="0.05" value={specificity ?? 0.90} onChange={e => setSpecificity(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-stone-400">Prevalence</Label>
                <Input type="number" step="0.05" value={prevalence ?? 0.50} onChange={e => setPrevalence(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
            </>
          )}

          {showNIMargin && (
            <div>
              <Label className="text-xs text-stone-400">Non-inferiority Margin</Label>
              <Input type="number" step="0.05" value={nonInferiorityMargin ?? ''} onChange={e => setNonInferiorityMargin(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-stone-400">Attrition Rate</Label>
              <Input type="number" step="0.05" value={attritionRate} onChange={e => setAttritionRate(parseFloat(e.target.value) || 0.15)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-stone-400">Allocation Ratio</Label>
              <Input type="number" step="0.5" value={allocationRatio} onChange={e => setAllocationRatio(parseFloat(e.target.value) || 1)} className="h-8 text-xs" />
            </div>
          </div>

          {track === 'biotech_pharma' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-stone-400">Indication</Label>
                <Input value={indication} onChange={e => setIndication(e.target.value)} className="h-8 text-xs" placeholder="e.g. NSCLC" />
              </div>
              <div>
                <Label className="text-xs text-stone-400">Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">Phase I</SelectItem>
                    <SelectItem value="II">Phase II</SelectItem>
                    <SelectItem value="III">Phase III</SelectItem>
                    <SelectItem value="IV">Phase IV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2 rounded-md border border-stone-700/60 bg-stone-900/30 p-3">
            <p className="text-xs font-medium text-stone-300">SAP Strategy Controls</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-stone-400">Number of Endpoints</Label>
                <Input type="number" min={1} max={10} value={numberOfEndpoints} onChange={e => setNumberOfEndpoints(Math.max(1, Number(e.target.value) || 1))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-stone-400">Expected Missing Rate</Label>
                <Input type="number" step="0.01" min={0} max={0.8} value={expectedMissingRate} onChange={e => setExpectedMissingRate(Math.max(0, Number(e.target.value) || 0))} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Multiplicity Method</Label>
              <Select value={multiplicityMethod ?? 'none'} onValueChange={(v) => setMultiplicityMethod(v as StatisticalInput['multiplicityMethod'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bonferroni">Bonferroni</SelectItem>
                  <SelectItem value="holm">Holm</SelectItem>
                  <SelectItem value="hochberg">Hochberg</SelectItem>
                  <SelectItem value="dunnett">Dunnett</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Estimand Strategy</Label>
              <Select value={estimandStrategy ?? 'treatment_policy'} onValueChange={(v) => setEstimandStrategy(v as StatisticalInput['estimandStrategy'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatment_policy">Treatment policy</SelectItem>
                  <SelectItem value="hypothetical">Hypothetical</SelectItem>
                  <SelectItem value="composite">Composite</SelectItem>
                  <SelectItem value="principal_stratum">Principal stratum</SelectItem>
                  <SelectItem value="while_on_treatment">While on treatment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Missing Data Method</Label>
              <Select value={missingDataMethod ?? 'MMRM'} onValueChange={(v) => setMissingDataMethod(v as StatisticalInput['missingDataMethod'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="complete_case">Complete case</SelectItem>
                  <SelectItem value="MMRM">MMRM</SelectItem>
                  <SelectItem value="multiple_imputation">Multiple imputation</SelectItem>
                  <SelectItem value="pattern_mixture">Pattern mixture</SelectItem>
                  <SelectItem value="LOCF">LOCF (legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-stone-400">Comparator Type</Label>
              <Select value={comparatorType ?? 'active'} onValueChange={(v) => setComparatorType(v as StatisticalInput['comparatorType'])}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active control</SelectItem>
                  <SelectItem value="placebo">Placebo</SelectItem>
                  <SelectItem value="historical">Historical control</SelectItem>
                  <SelectItem value="performance_goal">Performance goal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-stone-700/60 bg-stone-900/40 p-3">
            <p className="text-xs font-medium text-stone-300">Activation & Project Linking</p>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-stone-400">Bind to active project</Label>
              <Switch checked={attachToProject} onCheckedChange={setAttachToProject} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-stone-400">Require review thread</Label>
              <Switch checked={reviewRequired} onCheckedChange={setReviewRequired} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-stone-400">Auto-attach to dossier when section is available</Label>
              <Switch checked={autoAttachToDossier} onCheckedChange={setAutoAttachToDossier} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs text-stone-400">Full SAP package mode</Label>
              <Switch checked={fullSapMode} onCheckedChange={(next) => {
                const enabled = Boolean(next);
                setFullSapMode(enabled);
                if (enabled) {
                  setSelectedDocumentTypes(SAP_DOCUMENT_TYPES);
                }
              }} />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-stone-800/30 bg-stone-900/20 p-3">
            <p className="text-xs font-medium text-stone-200">Assumption Traceability Preview</p>
            <p className="text-[11px] text-stone-300/80">What your current SAP settings will drive in governed outputs.</p>
            <ul className="space-y-1">
              {traceabilityPreview.map((line, idx) => (
                <li key={idx} className="text-[11px] text-stone-100/90">• {line}</li>
              ))}
            </ul>
          </div>

          <Button onClick={handleCompute} disabled={computeMutation.isPending} className="w-full h-9 text-sm">
            {computeMutation.isPending ? 'Computing...' : 'Compute'}
          </Button>
        </TabsContent>

        {/* RESULTS TAB */}
        <TabsContent value="results" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {!results ? (
            <div className="text-center text-stone-500 text-sm py-8">Run a computation to see results</div>
          ) : results.validation && !results.validation.valid ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p className="font-medium mb-1">Input validation failed</p>
                {results.validation.errors.map((e: any, i: number) => (
                  <p key={i} className="text-xs">{e.field}: {e.message}</p>
                ))}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* AnA Interpretation */}
              {results.interpretation && (
                <Card className="border-stone-700 bg-stone-800/50">
                  <CardContent className="p-3">
                    <p className="text-sm text-stone-200">{results.interpretation.summary}</p>
                    <p className="text-xs text-stone-400 mt-2">{results.interpretation.confidenceStatement}</p>
                  </CardContent>
                </Card>
              )}

              {/* Computation Results */}
              {results.computation && (
                <Card className="border-stone-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Computation</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-stone-400">Method</span><span>{results.computation.method}</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Sample Size (total)</span><span className="font-mono font-bold">{results.computation.adjustedTotal ?? results.computation.sampleSize?.total}</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Per Group</span><span className="font-mono">{results.computation.sampleSize?.perGroup}</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Power</span><span className="font-mono">{results.computation.power ? (results.computation.power * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                  </CardContent>
                </Card>
              )}

              {/* Judgment Summary */}
              {results.judgment && (
                <Card className="border-stone-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium flex items-center gap-2">
                      Judgment
                      <VerdictBadge verdict={results.judgment.overallVerdict} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-stone-400">Risk</span><RiskBadge risk={results.judgment.overallRisk} /></div>
                    <div className="flex justify-between"><span className="text-stone-400">Action</span><span>{results.judgment.actionRecommendation}</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Fragility</span><span>{results.judgment.fragility?.category} ({results.judgment.fragility?.fragilityIndex})</span></div>
                    <div className="flex justify-between"><span className="text-stone-400">Confidence</span><span>{results.judgment.confidence?.level} ({results.judgment.confidence?.score}/100)</span></div>
                  </CardContent>
                </Card>
              )}

              {/* Scenarios */}
              {results.computation?.scenarios && results.computation.scenarios.length > 0 && (
                <Card className="border-stone-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Scenarios</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <table className="w-full text-xs">
                      <thead><tr className="text-stone-400"><th className="text-left">Scenario</th><th className="text-right">N</th><th className="text-right">Power</th></tr></thead>
                      <tbody>
                        {results.computation.scenarios.map((s: any, i: number) => (
                          <tr key={i}><td>{s.label}</td><td className="text-right font-mono">{s.sampleSize.total}</td><td className="text-right font-mono">{(s.power * 100).toFixed(0)}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Suggested next steps */}
              {results.interpretation?.suggestedNextSteps && (
                <Card className="border-stone-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1">
                    {results.interpretation.suggestedNextSteps.map((step: string, i: number) => (
                      <p key={i} className="text-xs text-stone-300">{step}</p>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Document generation buttons */}
              <div className="space-y-2">
                <p className="text-xs text-stone-400 font-medium">Generate Governed Documents (AnA Biostats)</p>
                <div className="space-y-1 rounded-md border border-stone-700/60 bg-stone-900/40 p-2">
                  {DOCUMENT_TYPE_OPTIONS.map(option => {
                    const checked = selectedDocumentTypes.includes(option.value);
                    return (
                      <label key={option.value} className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${fullSapMode ? 'opacity-70' : ''}`}>
                        <span className="text-xs text-stone-200">{option.label}</span>
                        <span className="sr-only">{DOCUMENT_TEMPLATE_NOTES[option.value]}</span>
                        <Switch
                          checked={fullSapMode ? SAP_DOCUMENT_TYPES.includes(option.value) : checked}
                          disabled={fullSapMode}
                          onCheckedChange={(next) => toggleDocumentType(option.value, Boolean(next))}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-stone-500">
                  {fullSapMode
                    ? 'Full SAP mode generates all SAP-class templates in a governed sequence.'
                    : 'Selected template(s): governed drafts are generated with provenance and workflow actions.'}
                </p>
                <div className="grid grid-cols-1 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs justify-start"
                    onClick={handleGenerateSelectedDocuments}
                    disabled={workflowMutation.isPending}
                  >
                    {fullSapMode ? 'Generate Full SAP Package' : 'Generate Selected Documents'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs justify-start"
                    onClick={() => handleGenerateDocument('sap_section_draft')}
                    disabled={workflowMutation.isPending}
                  >
                    Quick: SAP Section Draft
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* DOCUMENT TAB */}
        <TabsContent value="document" className="flex-1 overflow-y-auto px-4 pb-4">
          {generationHistory.length > 0 && (
            <div className="mb-3 rounded-md border border-stone-700/60 bg-stone-900/40 p-3">
              <p className="text-xs font-medium text-stone-300 mb-1">Recent Generated Packages</p>
              <div className="space-y-1">
                {generationHistory.map((item, idx) => (
                  <div key={`${item.generatedAt}-${idx}`} className="flex items-center justify-between text-[11px] text-stone-400 gap-2">
                    <div className="min-w-0">
                      <span className="truncate block max-w-[260px]">{item.title}</span>
                      <span className="text-[10px] text-stone-500">{item.documentType}{item.artifactId ? ` · Artifact #${item.artifactId}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span>{new Date(item.generatedAt).toLocaleTimeString()}</span>
                      {item.editorUrl && (
                        <a href={item.editorUrl} className="text-[10px] text-stone-300 hover:text-stone-200 underline">
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {results?.document ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-stone-200">{results.document.title}</h4>
                <Badge variant="outline" className="text-xs">{results.document.status}</Badge>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap border border-stone-700 rounded-md p-3 bg-stone-900/50">
                {results.document.content}
              </div>
              {results.workflowActions && results.workflowActions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-stone-400 font-medium">Workflow Actions</p>
                  {results.workflowActions.map((action: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={action.success ? 'text-stone-400' : 'text-stone-400'}>
                        {action.success ? '✓' : '✗'}
                      </span>
                      <span>{action.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {results.escalation?.required && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    <p className="font-medium">Escalation Required</p>
                    <p>{results.escalation.suggestedAction}</p>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center text-stone-500 text-sm py-8">Generate a document from the Results tab</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const colorMap: Record<string, string> = {
    adequate: 'bg-stone-900/20 text-stone-300 border-stone-900/30',
    marginal: 'bg-stone-900/20 text-stone-300 border-stone-900/30',
    inadequate: 'bg-stone-900/20 text-stone-300 border-stone-900/30',
    insufficient_information: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
  };
  return <Badge variant="outline" className={`text-[10px] ${colorMap[verdict] ?? ''}`}>{verdict}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const colorMap: Record<string, string> = {
    low: 'text-stone-400',
    moderate: 'text-stone-400',
    high: 'text-stone-400',
    critical: 'text-stone-400',
  };
  return <span className={`font-medium ${colorMap[risk] ?? ''}`}>{risk}</span>;
}

export default AnaBiostatsPanel;
