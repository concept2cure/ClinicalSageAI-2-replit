/**
 * AnA Biostats Panel — Primary biostatistics operating surface
 *
 * Integrates into the existing Concept2Cure workspace as a panel.
 * Provides structured input collection, deterministic computation,
 * judgment display, and governed document actions.
 *
 * Follows the same calm, clean, project-centric workspace language.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

// Types matching server-side contracts
type ClientTrack = 'biotech_pharma' | 'medical_device' | 'diagnostics_ivd';
type StudyType = 'superiority' | 'non_inferiority' | 'equivalence' | 'single_arm' | 'adaptive' | 'diagnostic_accuracy' | 'performance' | 'agreement';
type EndpointType = 'continuous' | 'binary' | 'time_to_event' | 'sensitivity_specificity' | 'agreement' | 'auc_roc';
type ObjectiveType = 'efficacy' | 'safety' | 'performance' | 'diagnostic_accuracy';
type RegulatoryBody = 'FDA' | 'EMA' | 'MHRA' | 'PMDA';
type StatisticalDocumentType = 'sample_size_rationale' | 'statistical_risk_memo' | 'design_assumption_note' | 'sap_section_draft' | 'scenario_comparison_brief';

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
}

interface Props {
  projectId?: number;
  defaultTrack?: ClientTrack;
  onArtifactCreated?: (artifactId: number) => void;
  compact?: boolean;
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

const REGULATORY_OPTIONS: { value: RegulatoryBody; label: string }[] = [
  { value: 'FDA', label: 'FDA (US)' },
  { value: 'EMA', label: 'EMA (EU)' },
  { value: 'MHRA', label: 'MHRA (UK)' },
  { value: 'PMDA', label: 'PMDA (Japan)' },
];

export function AnaBiostatsPanel({ projectId, defaultTrack, onArtifactCreated, compact }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Results state
  const [results, setResults] = useState<any>(null);

  // Build input object
  const buildInput = useCallback((): Partial<StatisticalInput> => ({
    projectId,
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
  }), [track, studyType, endpointType, objectiveType, regulatoryBody, alpha, powerTarget, effectSize, variance, controlRate, treatmentRate, sensitivity, specificity, prevalence, nonInferiorityMargin, attritionRate, allocationRatio, indication, phase, projectId]);

  // Quick compute mutation
  const computeMutation = useMutation({
    mutationFn: async (input: Partial<StatisticalInput>) => {
      const res = await fetch('/api/ana-biostats/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        credentials: 'include',
      });
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
      const res = await fetch('/api/ana-biostats/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowType: documentType === 'statistical_risk_memo' ? 'statistical_risk_review' : 'sample_size_rationale',
          input,
          generateDocument: true,
          documentType,
        }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      setActiveTab('document');
      toast({ title: 'Document generated', description: data.document?.title });
      if (data.workflowActions?.find((a: any) => a.action === 'create_artifact')?.artifactId) {
        onArtifactCreated?.(data.workflowActions.find((a: any) => a.action === 'create_artifact').artifactId);
      }
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleCompute = () => {
    computeMutation.mutate(buildInput());
  };

  const handleGenerateDocument = (docType: StatisticalDocumentType) => {
    workflowMutation.mutate({ input: buildInput(), documentType: docType });
  };

  // Track-aware fields
  const showBinaryFields = endpointType === 'binary';
  const showSurvivalFields = endpointType === 'time_to_event';
  const showDiagnosticFields = track === 'diagnostics_ivd';
  const showNIMargin = studyType === 'non_inferiority';

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-3 pb-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-300">AnA Biostats</h3>
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
          {/* Track */}
          <div>
            <Label className="text-xs text-zinc-400">Domain Track</Label>
            <Select value={track} onValueChange={(v) => { setTrack(v as ClientTrack); setStudyType(STUDY_TYPE_OPTIONS[v as ClientTrack][0].value); setEndpointType(ENDPOINT_OPTIONS[v as ClientTrack][0].value); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRACK_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Regulatory body */}
          <div>
            <Label className="text-xs text-zinc-400">Regulatory Body</Label>
            <Select value={regulatoryBody} onValueChange={(v) => setRegulatoryBody(v as RegulatoryBody)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REGULATORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Study type */}
          <div>
            <Label className="text-xs text-zinc-400">Study Type</Label>
            <Select value={studyType} onValueChange={(v) => setStudyType(v as StudyType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STUDY_TYPE_OPTIONS[track].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint type */}
          <div>
            <Label className="text-xs text-zinc-400">Endpoint Type</Label>
            <Select value={endpointType} onValueChange={(v) => setEndpointType(v as EndpointType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENDPOINT_OPTIONS[track].map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Core parameters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-zinc-400">Alpha (α)</Label>
              <Input type="number" step="0.01" value={alpha} onChange={e => setAlpha(parseFloat(e.target.value) || 0.05)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Power Target</Label>
              <Input type="number" step="0.05" value={powerTarget} onChange={e => setPowerTarget(parseFloat(e.target.value) || 0.80)} className="h-8 text-xs" />
            </div>
          </div>

          {!showDiagnosticFields && (
            <div>
              <Label className="text-xs text-zinc-400">Effect Size</Label>
              <Input type="number" step="0.1" value={effectSize} onChange={e => setEffectSize(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
            </div>
          )}

          {showBinaryFields && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-zinc-400">Control Rate</Label>
                <Input type="number" step="0.05" value={controlRate ?? ''} onChange={e => setControlRate(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Treatment Rate</Label>
                <Input type="number" step="0.05" value={treatmentRate ?? ''} onChange={e => setTreatmentRate(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
            </div>
          )}

          {showDiagnosticFields && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-zinc-400">Sensitivity Target</Label>
                  <Input type="number" step="0.05" value={sensitivity ?? 0.90} onChange={e => setSensitivity(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Specificity Target</Label>
                  <Input type="number" step="0.05" value={specificity ?? 0.90} onChange={e => setSpecificity(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Prevalence</Label>
                <Input type="number" step="0.05" value={prevalence ?? 0.50} onChange={e => setPrevalence(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
              </div>
            </>
          )}

          {showNIMargin && (
            <div>
              <Label className="text-xs text-zinc-400">Non-inferiority Margin</Label>
              <Input type="number" step="0.05" value={nonInferiorityMargin ?? ''} onChange={e => setNonInferiorityMargin(parseFloat(e.target.value) || undefined)} className="h-8 text-xs" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-zinc-400">Attrition Rate</Label>
              <Input type="number" step="0.05" value={attritionRate} onChange={e => setAttritionRate(parseFloat(e.target.value) || 0.15)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Allocation Ratio</Label>
              <Input type="number" step="0.5" value={allocationRatio} onChange={e => setAllocationRatio(parseFloat(e.target.value) || 1)} className="h-8 text-xs" />
            </div>
          </div>

          {track === 'biotech_pharma' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-zinc-400">Indication</Label>
                <Input value={indication} onChange={e => setIndication(e.target.value)} className="h-8 text-xs" placeholder="e.g. NSCLC" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Phase</Label>
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

          <Button onClick={handleCompute} disabled={computeMutation.isPending} className="w-full h-9 text-sm">
            {computeMutation.isPending ? 'Computing...' : 'Compute'}
          </Button>
        </TabsContent>

        {/* RESULTS TAB */}
        <TabsContent value="results" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {!results ? (
            <div className="text-center text-zinc-500 text-sm py-8">Run a computation to see results</div>
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
                <Card className="border-zinc-700 bg-zinc-800/50">
                  <CardContent className="p-3">
                    <p className="text-sm text-zinc-200">{results.interpretation.summary}</p>
                    <p className="text-xs text-zinc-400 mt-2">{results.interpretation.confidenceStatement}</p>
                  </CardContent>
                </Card>
              )}

              {/* Computation Results */}
              {results.computation && (
                <Card className="border-zinc-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Computation</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-zinc-400">Method</span><span>{results.computation.method}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Sample Size (total)</span><span className="font-mono font-bold">{results.computation.adjustedTotal ?? results.computation.sampleSize?.total}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Per Group</span><span className="font-mono">{results.computation.sampleSize?.perGroup}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Power</span><span className="font-mono">{results.computation.power ? (results.computation.power * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                  </CardContent>
                </Card>
              )}

              {/* Judgment Summary */}
              {results.judgment && (
                <Card className="border-zinc-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium flex items-center gap-2">
                      Judgment
                      <VerdictBadge verdict={results.judgment.overallVerdict} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-zinc-400">Risk</span><RiskBadge risk={results.judgment.overallRisk} /></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Action</span><span>{results.judgment.actionRecommendation}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Fragility</span><span>{results.judgment.fragility?.category} ({results.judgment.fragility?.fragilityIndex})</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Confidence</span><span>{results.judgment.confidence?.level} ({results.judgment.confidence?.score}/100)</span></div>
                  </CardContent>
                </Card>
              )}

              {/* Scenarios */}
              {results.computation?.scenarios && results.computation.scenarios.length > 0 && (
                <Card className="border-zinc-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Scenarios</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <table className="w-full text-xs">
                      <thead><tr className="text-zinc-400"><th className="text-left">Scenario</th><th className="text-right">N</th><th className="text-right">Power</th></tr></thead>
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
                <Card className="border-zinc-700">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1">
                    {results.interpretation.suggestedNextSteps.map((step: string, i: number) => (
                      <p key={i} className="text-xs text-zinc-300">{step}</p>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Document generation buttons */}
              <div className="space-y-2">
                <p className="text-xs text-zinc-400 font-medium">Generate Governed Document</p>
                <div className="grid grid-cols-1 gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs justify-start" onClick={() => handleGenerateDocument('sample_size_rationale')} disabled={workflowMutation.isPending}>
                    Sample Size Rationale
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs justify-start" onClick={() => handleGenerateDocument('statistical_risk_memo')} disabled={workflowMutation.isPending}>
                    Statistical Risk Memo
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs justify-start" onClick={() => handleGenerateDocument('design_assumption_note')} disabled={workflowMutation.isPending}>
                    Design Assumption Note
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs justify-start" onClick={() => handleGenerateDocument('sap_section_draft')} disabled={workflowMutation.isPending}>
                    SAP Section Draft
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs justify-start" onClick={() => handleGenerateDocument('scenario_comparison_brief')} disabled={workflowMutation.isPending}>
                    Scenario Comparison Brief
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* DOCUMENT TAB */}
        <TabsContent value="document" className="flex-1 overflow-y-auto px-4 pb-4">
          {results?.document ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-200">{results.document.title}</h4>
                <Badge variant="outline" className="text-xs">{results.document.status}</Badge>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap border border-zinc-700 rounded-md p-3 bg-zinc-900/50">
                {results.document.content}
              </div>
              {results.workflowActions && results.workflowActions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-400 font-medium">Workflow Actions</p>
                  {results.workflowActions.map((action: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={action.success ? 'text-emerald-400' : 'text-red-400'}>
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
            <div className="text-center text-zinc-500 text-sm py-8">Generate a document from the Results tab</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const colorMap: Record<string, string> = {
    adequate: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    marginal: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    inadequate: 'bg-red-500/20 text-red-300 border-red-500/30',
    insufficient_information: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  };
  return <Badge variant="outline" className={`text-[10px] ${colorMap[verdict] ?? ''}`}>{verdict}</Badge>;
}

function RiskBadge({ risk }: { risk: string }) {
  const colorMap: Record<string, string> = {
    low: 'text-emerald-400',
    moderate: 'text-amber-400',
    high: 'text-orange-400',
    critical: 'text-red-400',
  };
  return <span className={`font-medium ${colorMap[risk] ?? ''}`}>{risk}</span>;
}

export default AnaBiostatsPanel;
