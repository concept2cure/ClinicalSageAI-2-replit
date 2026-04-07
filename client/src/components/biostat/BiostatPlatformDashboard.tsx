import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ============================================================
// Shared Components
// ============================================================

function ErrorAlert({ error, title = 'Error' }: { error: any; title?: string }) {
  const message = error?.message || error?.error || 'An unexpected error occurred. Please try again.';
  return (
    <Alert variant="destructive" className="my-4">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, description, actionLabel, onAction }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-12" role="status">
      <h3 className="text-lg font-semibold text-muted-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="outline">{actionLabel}</Button>
      )}
    </div>
  );
}

// ============================================================
// Statistical Continuum Workspace (Capability 1)
// ============================================================

function StatisticalContinuumTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newThread, setNewThread] = useState({
    title: '',
    indication: '',
    phase: '',
    primaryEndpoint: '',
    sampleSize: '',
  });

  const { data: threads, isLoading, error: threadsError } = useQuery({
    queryKey: ['/api/biostat/continuum/threads'],
  });

  const initMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/continuum/initialize', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create thread');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/biostat/continuum/threads'] });
      toast({ title: 'Thread Created', description: `Statistical thread "${data?.data?.title || newThread.title}" initialized successfully.` });
      setNewThread({ title: '', indication: '', phase: '', primaryEndpoint: '', sampleSize: '' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to Create Thread', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New Statistical Thread</CardTitle>
          <CardDescription>
            Initialize a protocol-to-submission statistical continuum
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Title</Label>
              <Input
                value={newThread.title}
                onChange={e => setNewThread(t => ({ ...t, title: e.target.value }))}
                placeholder="e.g., BEACON-3 Phase III NSCLC"
              />
            </div>
            <div>
              <Label>Indication</Label>
              <Input
                value={newThread.indication}
                onChange={e => setNewThread(t => ({ ...t, indication: e.target.value }))}
                placeholder="e.g., Non-Small Cell Lung Cancer"
              />
            </div>
            <div>
              <Label>Phase</Label>
              <Select
                value={newThread.phase}
                onValueChange={v => setNewThread(t => ({ ...t, phase: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  {['Phase 1', 'Phase 1/2', 'Phase 2', 'Phase 2/3', 'Phase 3', 'Phase 4'].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary Endpoint</Label>
              <Input
                value={newThread.primaryEndpoint}
                onChange={e => setNewThread(t => ({ ...t, primaryEndpoint: e.target.value }))}
                placeholder="e.g., Overall Survival"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {!newThread.title && !newThread.indication ? 'Fill in trial details to begin' : ''}
            {newThread.title && !newThread.indication ? 'Add indication to continue' : ''}
            {newThread.title && newThread.indication && !newThread.phase ? 'Select a trial phase' : ''}
          </div>
          <Button
            onClick={() => initMutation.mutate({
              title: newThread.title,
              indication: newThread.indication,
              phase: newThread.phase,
              protocolData: {
                primary_endpoint: newThread.primaryEndpoint,
                sample_size: parseInt(newThread.sampleSize) || 200,
              },
            })}
            disabled={initMutation.isPending || !newThread.title || !newThread.indication || !newThread.phase}
            aria-label="Initialize new statistical thread"
          >
            {initMutation.isPending ? 'Creating...' : 'Initialize Thread'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Threads</CardTitle>
          <CardDescription>Protocol-to-submission statistical workflows</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : threadsError ? (
            <ErrorAlert error={threadsError} title="Failed to load threads" />
          ) : !(threads as any[])?.length ? (
            <EmptyState
              title="No Statistical Threads"
              description="Create your first protocol-to-submission statistical workflow above."
            />
          ) : (
            <div className="space-y-3">
              {(threads as any[]).map((thread: any) => (
                <ThreadCard key={thread.id} thread={thread} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ThreadCard({ thread }: { thread: any }) {
  const queryClient = useQueryClient();
  const stages = [
    { key: 'protocolSnapshot', label: 'Protocol', action: null },
    { key: 'sapSnapshot', label: 'SAP', action: 'sap' },
    { key: 'analysisSpecSnapshot', label: 'Analysis Specs', action: 'analysis-specs' },
    { key: 'tlfSnapshot', label: 'TLF Shells', action: 'tlf-shells' },
    { key: 'resultsSnapshot', label: 'Results', action: null },
    { key: 'csrSectionsSnapshot', label: 'CSR Sections', action: 'csr-sections' },
  ];

  const generateMutation = useMutation({
    mutationFn: async (action: string) => {
      const method = action === 'csr-sections' ? 'GET' : 'PUT';
      const res = await apiRequest(method, `/api/biostat/continuum/${thread.id}/${action}`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/biostat/continuum/threads'] }),
  });

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold">{thread.title}</h4>
            <p className="text-sm text-muted-foreground">
              {thread.indication} | {thread.phase}
            </p>
          </div>
          <Badge variant={thread.status === 'active' ? 'default' : 'secondary'}>
            {thread.status}
          </Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stages.map(stage => {
            const completed = !!thread[stage.key];
            return (
              <div key={stage.key} className="flex items-center gap-1">
                <Badge variant={completed ? 'default' : 'outline'} className="text-xs">
                  {completed ? '✓' : '○'} {stage.label}
                </Badge>
                {stage.action && !completed && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => generateMutation.mutate(stage.action!)}
                    disabled={generateMutation.isPending}
                  >
                    Generate
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Regulatory Design Optimizer (Capability 2)
// ============================================================

function DesignOptimizerTab() {
  const { toast } = useToast();
  const [params, setParams] = useState({
    indication: '',
    phase: '',
    drugClass: '',
    endpoint: '',
  });

  const recommendMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/design-optimizer/recommend', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to get recommendations');
      return res.json();
    },
    onSuccess: (data) => {
      const count = (data as any)?.recommendations?.length || 0;
      toast({ title: 'Analysis Complete', description: `${count} design options ranked by regulatory approval probability.` });
    },
    onError: (err: Error) => {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Regulatory-Outcome-Aware Design Optimizer</CardTitle>
          <CardDescription>
            Recommends study designs ranked by probability of regulatory approval, based on historical CSR data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Indication</Label>
              <Input
                value={params.indication}
                onChange={e => setParams(p => ({ ...p, indication: e.target.value }))}
                placeholder="e.g., Type 2 Diabetes"
              />
            </div>
            <div>
              <Label>Phase</Label>
              <Select
                value={params.phase}
                onValueChange={v => setParams(p => ({ ...p, phase: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
                <SelectContent>
                  {['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'].map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Drug Class (optional)</Label>
              <Input
                value={params.drugClass}
                onChange={e => setParams(p => ({ ...p, drugClass: e.target.value }))}
                placeholder="e.g., GLP-1 receptor agonist"
              />
            </div>
            <div>
              <Label>Primary Endpoint (optional)</Label>
              <Input
                value={params.endpoint}
                onChange={e => setParams(p => ({ ...p, endpoint: e.target.value }))}
                placeholder="e.g., HbA1c change from baseline"
              />
            </div>
          </div>
          <Button
            onClick={() => recommendMutation.mutate(params)}
            disabled={recommendMutation.isPending || !params.indication || !params.phase}
          >
            {recommendMutation.isPending ? 'Analyzing...' : 'Get Design Recommendations'}
          </Button>
        </CardContent>
      </Card>

      {recommendMutation.error && (
        <ErrorAlert error={recommendMutation.error} title="Design analysis failed" />
      )}

      {recommendMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Designs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(recommendMutation.data as any).recommendations?.map((rec: any, i: number) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{rec.design}</h4>
                      <Badge
                        variant={rec.successProbability > 0.7 ? 'default' : rec.successProbability > 0.5 ? 'secondary' : 'destructive'}
                      >
                        P(approval) = {(rec.successProbability * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{rec.rationale}</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><strong>Endpoint:</strong> {rec.endpoint}</div>
                      <div><strong>Method:</strong> {rec.statisticalMethod}</div>
                      <div><strong>Sample Size:</strong> {rec.sampleSize}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Estimand & Multiplicity Engine (Capability 3)
// ============================================================

function EstimandEngineTab() {
  const { toast } = useToast();
  const [estimand, setEstimand] = useState({
    endpointName: '',
    population: '',
    variable: '',
    summaryMeasure: '',
    strategy: '',
    intercurrentEvents: [{ event: '', handling: '' }],
  });

  const defineMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/estimand/define', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to define estimand');
      return res.json();
    },
    onSuccess: (data) => {
      const compliant = (data as any)?.ichE9R1Compliant;
      toast({
        title: compliant ? 'Estimand Defined - Compliant' : 'Estimand Defined - Review Needed',
        description: compliant
          ? 'ICH E9(R1) compliant estimand created with method recommendations.'
          : 'Estimand created but has compliance issues. Review the validation results.',
        variant: compliant ? 'default' : 'destructive',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Estimand Definition Failed', description: err.message, variant: 'destructive' });
    },
  });

  const addICE = () => {
    setEstimand(e => ({
      ...e,
      intercurrentEvents: [...e.intercurrentEvents, { event: '', handling: '' }],
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>ICH E9(R1) Estimand Builder</CardTitle>
          <CardDescription>
            Define estimands with compliance checking and automatic method recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Endpoint Name</Label>
              <Input
                value={estimand.endpointName}
                onChange={e => setEstimand(s => ({ ...s, endpointName: e.target.value }))}
                placeholder="e.g., Change in HbA1c at Week 24"
              />
            </div>
            <div>
              <Label>Population</Label>
              <Input
                value={estimand.population}
                onChange={e => setEstimand(s => ({ ...s, population: e.target.value }))}
                placeholder="e.g., All randomized patients with T2DM"
              />
            </div>
            <div>
              <Label>Variable</Label>
              <Input
                value={estimand.variable}
                onChange={e => setEstimand(s => ({ ...s, variable: e.target.value }))}
                placeholder="e.g., HbA1c (%) at Week 24"
              />
            </div>
            <div>
              <Label>Summary Measure</Label>
              <Select
                value={estimand.summaryMeasure}
                onValueChange={v => setEstimand(s => ({ ...s, summaryMeasure: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select measure" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="difference_in_means">Difference in means</SelectItem>
                  <SelectItem value="odds_ratio">Odds ratio</SelectItem>
                  <SelectItem value="hazard_ratio">Hazard ratio</SelectItem>
                  <SelectItem value="risk_difference">Risk difference</SelectItem>
                  <SelectItem value="rate_ratio">Rate ratio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Estimand Strategy</Label>
              <Select
                value={estimand.strategy}
                onValueChange={v => setEstimand(s => ({ ...s, strategy: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select ICH E9(R1) strategy" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="treatment_policy">Treatment Policy (ITT-like)</SelectItem>
                  <SelectItem value="hypothetical">Hypothetical (no ICE)</SelectItem>
                  <SelectItem value="composite">Composite (ICE as failure)</SelectItem>
                  <SelectItem value="principal_stratum">Principal Stratum (compliers only)</SelectItem>
                  <SelectItem value="while_on_treatment">While on Treatment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-4">
            <Label className="mb-2 block">Intercurrent Events</Label>
            {estimand.intercurrentEvents.map((ice, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  placeholder="Event (e.g., treatment discontinuation)"
                  value={ice.event}
                  onChange={e => {
                    const newICEs = [...estimand.intercurrentEvents];
                    newICEs[i] = { ...newICEs[i], event: e.target.value };
                    setEstimand(s => ({ ...s, intercurrentEvents: newICEs }));
                  }}
                />
                <Input
                  placeholder="Handling (e.g., include all data)"
                  value={ice.handling}
                  onChange={e => {
                    const newICEs = [...estimand.intercurrentEvents];
                    newICEs[i] = { ...newICEs[i], handling: e.target.value };
                    setEstimand(s => ({ ...s, intercurrentEvents: newICEs }));
                  }}
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addICE}>
              + Add Intercurrent Event
            </Button>
          </div>

          <Button
            onClick={() => defineMutation.mutate(estimand)}
            disabled={defineMutation.isPending}
          >
            {defineMutation.isPending ? 'Validating...' : 'Define Estimand'}
          </Button>
        </CardContent>
      </Card>

      {defineMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Estimand Defined</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={(defineMutation.data as any).ichE9R1Compliant ? 'default' : 'destructive'}>
                  {(defineMutation.data as any).ichE9R1Compliant ? 'ICH E9(R1) Compliant' : 'Non-Compliant'}
                </Badge>
              </div>
              {(defineMutation.data as any).recommendedMethods && (
                <div>
                  <h4 className="font-semibold mt-3">Recommended Methods</h4>
                  <ul className="list-disc list-inside text-sm">
                    {(defineMutation.data as any).recommendedMethods.map((m: string, i: number) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Knowledge Graph Explorer (Capability 7)
// ============================================================

function KnowledgeGraphTab() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [indication, setIndication] = useState('');

  const queryMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest('POST', '/api/biostat/knowledge/query', { query: q });
      if (!res.ok) throw new Error((await res.json()).error || 'Query failed');
      return res.json();
    },
    onError: (err: Error) => {
      toast({ title: 'Knowledge Query Failed', description: err.message, variant: 'destructive' });
    },
  });

  const { data: methodLandscape } = useQuery({
    queryKey: ['/api/biostat/knowledge/method-landscape', indication],
    queryFn: async () => {
      if (!indication) return null;
      const res = await apiRequest('GET', `/api/biostat/knowledge/method-landscape/${encodeURIComponent(indication)}`);
      return res.json();
    },
    enabled: !!indication,
  });

  const { data: matrix } = useQuery({
    queryKey: ['/api/biostat/knowledge/endpoint-method-matrix'],
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Biostatistics Knowledge Graph</CardTitle>
          <CardDescription>
            Query the knowledge graph connecting indications, endpoints, methods, and regulatory outcomes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              className="flex-1"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g., What statistical method has highest FDA acceptance for PFS in NSCLC Phase 3?"
              onKeyDown={e => e.key === 'Enter' && query && queryMutation.mutate(query)}
            />
            <Button
              onClick={() => queryMutation.mutate(query)}
              disabled={queryMutation.isPending || !query}
            >
              {queryMutation.isPending ? 'Searching...' : 'Query'}
            </Button>
          </div>

          {queryMutation.data && (
            <div className="bg-muted rounded-lg p-4 mb-4">
              <h4 className="font-semibold mb-2">Results</h4>
              <p className="text-sm whitespace-pre-wrap">{(queryMutation.data as any).answer}</p>
              {(queryMutation.data as any).nodes?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(queryMutation.data as any).nodes.map((node: any, i: number) => (
                    <Badge key={i} variant="outline">{node.nodeType}: {node.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Method Landscape by Indication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              value={indication}
              onChange={e => setIndication(e.target.value)}
              placeholder="Enter indication to view method landscape"
            />
          </div>
          {methodLandscape && (
            <div className="space-y-2">
              {(methodLandscape as any).methods?.map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-2">
                  <span className="font-medium">{m.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Used {m.count} times</span>
                    <Badge variant={m.acceptanceRate > 0.8 ? 'default' : 'secondary'}>
                      {(m.acceptanceRate * 100).toFixed(0)}% accepted
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {matrix && (
        <Card>
          <CardHeader>
            <CardTitle>Endpoint-Method Matrix</CardTitle>
            <CardDescription>Success rates across endpoints and statistical methods</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2">Endpoint</th>
                    {(matrix as any).methods?.map((m: string) => (
                      <th key={m} className="text-center p-2">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(matrix as any).rows?.map((row: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-medium">{row.endpoint}</td>
                      {row.cells?.map((cell: any, j: number) => (
                        <td key={j} className="text-center p-2">
                          {cell ? (
                            <Badge variant={cell.rate > 0.7 ? 'default' : 'secondary'} className="text-xs">
                              {(cell.rate * 100).toFixed(0)}% ({cell.n})
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Adaptive Trial Dashboard (Capability 6)
// ============================================================

function AdaptiveTrialTab() {
  const { toast } = useToast();
  const [planForm, setPlanForm] = useState({
    title: '',
    designType: '',
    maxSampleSize: '',
    spendingFunction: 'obrien_fleming',
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/adaptive/plan', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create plan');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Adaptive Plan Created', description: 'Operating characteristics computed via Monte Carlo simulation.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Plan Creation Failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Adaptive Trial Operating Model</CardTitle>
          <CardDescription>
            Create and manage adaptive trial plans with real-time decision support
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Trial Title</Label>
              <Input
                value={planForm.title}
                onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., ADAPT-3 Group Sequential"
              />
            </div>
            <div>
              <Label>Design Type</Label>
              <Select
                value={planForm.designType}
                onValueChange={v => setPlanForm(f => ({ ...f, designType: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select design" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group_sequential">Group Sequential</SelectItem>
                  <SelectItem value="sample_size_reestimation">Sample Size Re-estimation</SelectItem>
                  <SelectItem value="response_adaptive">Response-Adaptive Randomization</SelectItem>
                  <SelectItem value="platform_trial">Platform Trial</SelectItem>
                  <SelectItem value="seamless_phase">Seamless Phase 2/3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Sample Size</Label>
              <Input
                type="number"
                value={planForm.maxSampleSize}
                onChange={e => setPlanForm(f => ({ ...f, maxSampleSize: e.target.value }))}
                placeholder="e.g., 500"
              />
            </div>
            <div>
              <Label>Alpha Spending Function</Label>
              <Select
                value={planForm.spendingFunction}
                onValueChange={v => setPlanForm(f => ({ ...f, spendingFunction: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="obrien_fleming">O'Brien-Fleming</SelectItem>
                  <SelectItem value="pocock">Pocock</SelectItem>
                  <SelectItem value="hwang_shih_decani">Hwang-Shih-DeCani</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => createPlanMutation.mutate({
              ...planForm,
              maxSampleSize: parseInt(planForm.maxSampleSize) || 500,
              adaptations: [],
              interimLooks: [
                { lookNumber: 1, informationFraction: 0.5 },
                { lookNumber: 2, informationFraction: 0.75 },
              ],
              stoppingRules: {
                efficacy: { type: 'spending_function', function: planForm.spendingFunction },
                futility: { type: 'conditional_power', threshold: 0.1 },
              },
            })}
            disabled={createPlanMutation.isPending}
          >
            {createPlanMutation.isPending ? 'Creating...' : 'Create Adaptive Plan'}
          </Button>
        </CardContent>
      </Card>

      {createPlanMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Plan Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Plan ID:</strong> {(createPlanMutation.data as any).id}
              </p>
              {(createPlanMutation.data as any).operatingCharacteristics && (
                <div>
                  <h4 className="font-semibold mt-2">Operating Characteristics</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                    <div>
                      <strong>Type I Error:</strong>{' '}
                      {((createPlanMutation.data as any).operatingCharacteristics.typeIError * 100).toFixed(1)}%
                    </div>
                    <div>
                      <strong>Power:</strong>{' '}
                      {((createPlanMutation.data as any).operatingCharacteristics.power * 100).toFixed(1)}%
                    </div>
                    <div>
                      <strong>Expected N:</strong>{' '}
                      {(createPlanMutation.data as any).operatingCharacteristics.expectedSampleSize}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// External Control Arms (Capability 5)
// ============================================================

function ExternalControlTab() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useState({
    indication: '',
    endpoint: '',
    phase: '',
    armType: 'placebo',
  });

  const searchMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/external-control/search', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Search failed');
      return res.json();
    },
    onSuccess: (data) => {
      const count = (data as any)?.arms?.length || 0;
      toast({ title: 'Search Complete', description: `Found ${count} matching historical arms.` });
    },
    onError: (err: Error) => {
      toast({ title: 'Search Failed', description: err.message, variant: 'destructive' });
    },
  });

  const synthesizeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/biostat/external-control/synthesize', data);
      if (!res.ok) throw new Error((await res.json()).error || 'Synthesis failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Control Arm Synthesized', description: 'External control arm created with diagnostics.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Synthesis Failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>External Control Arm Synthesizer</CardTitle>
          <CardDescription>
            Build synthetic/external control arms from historical CSR data for single-arm trials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label>Indication</Label>
              <Input
                value={searchParams.indication}
                onChange={e => setSearchParams(p => ({ ...p, indication: e.target.value }))}
                placeholder="e.g., Breast Cancer"
              />
            </div>
            <div>
              <Label>Endpoint</Label>
              <Input
                value={searchParams.endpoint}
                onChange={e => setSearchParams(p => ({ ...p, endpoint: e.target.value }))}
                placeholder="e.g., Overall Response Rate"
              />
            </div>
            <div>
              <Label>Phase</Label>
              <Select
                value={searchParams.phase}
                onValueChange={v => setSearchParams(p => ({ ...p, phase: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Any phase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="Phase 2">Phase 2</SelectItem>
                  <SelectItem value="Phase 3">Phase 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Arm Type</Label>
              <Select
                value={searchParams.armType}
                onValueChange={v => setSearchParams(p => ({ ...p, armType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="placebo">Placebo</SelectItem>
                  <SelectItem value="active_control">Active Control</SelectItem>
                  <SelectItem value="standard_of_care">Standard of Care</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => searchMutation.mutate(searchParams)}
            disabled={searchMutation.isPending || !searchParams.indication}
          >
            {searchMutation.isPending ? 'Searching...' : 'Search Historical Arms'}
          </Button>
        </CardContent>
      </Card>

      {searchMutation.error && (
        <ErrorAlert error={searchMutation.error} title="Search failed" />
      )}

      {searchMutation.data && (
        <Card>
          <CardHeader>
            <CardTitle>Matching Historical Arms</CardTitle>
            <CardDescription>
              {(searchMutation.data as any).arms?.length || 0} arms found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(searchMutation.data as any).arms?.map((arm: any, i: number) => (
                <div key={i} className="flex items-center justify-between border-b py-2">
                  <div>
                    <span className="font-medium">{arm.armName}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({arm.trialId}) n={arm.n}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {arm.mean && <Badge variant="outline">Mean: {arm.mean.toFixed(2)}</Badge>}
                    {arm.proportion && <Badge variant="outline">{(arm.proportion * 100).toFixed(0)}%</Badge>}
                  </div>
                </div>
              ))}
            </div>
            {(searchMutation.data as any).arms?.length > 0 && (
              <Button
                className="mt-4"
                onClick={() => synthesizeMutation.mutate({
                  name: `${searchParams.indication} External Control`,
                  indication: searchParams.indication,
                  endpoint: searchParams.endpoint,
                  method: 'bayesian_borrowing',
                  sourceArmIds: (searchMutation.data as any).arms.map((a: any) => a.id),
                })}
                disabled={synthesizeMutation.isPending}
              >
                {synthesizeMutation.isPending ? 'Synthesizing...' : 'Synthesize Control Arm'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Collaborative SAP (Capability 4)
// ============================================================

function CollaborativeSAPTab() {
  const [threadId, setThreadId] = useState('');

  const { data: versions } = useQuery({
    queryKey: ['/api/biostat/sap', threadId, 'versions'],
    queryFn: async () => {
      if (!threadId) return null;
      const res = await apiRequest('GET', `/api/biostat/sap/${threadId}/versions`);
      return res.json();
    },
    enabled: !!threadId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Collaborative SAP Workspace</CardTitle>
          <CardDescription>
            Version-controlled SAP authoring with 21 CFR Part 11 compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input
              value={threadId}
              onChange={e => setThreadId(e.target.value)}
              placeholder="Enter Thread ID to view SAP versions"
            />
          </div>

          {versions && (
            <div className="space-y-3">
              {(versions as any[])?.map((v: any) => (
                <Card key={v.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">Version {v.version}</span>
                        {v.amendmentNumber && (
                          <Badge variant="outline" className="ml-2">
                            Amendment {v.amendmentNumber}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={v.status === 'approved' ? 'default' : 'secondary'}>
                          {v.status}
                        </Badge>
                        {v.isLocked && <Badge variant="destructive">Locked</Badge>}
                        {v.signatureId && <Badge>Signed</Badge>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Main Dashboard
// ============================================================

export default function BiostatPlatformDashboard() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Biostatistics Platform</h1>
          <p className="text-muted-foreground">
            AI-powered protocol-to-submission statistical intelligence
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">7 Capabilities</Badge>
          <Badge variant="outline" className="text-sm">ICH E9(R1)</Badge>
          <Badge variant="outline" className="text-sm">21 CFR Part 11</Badge>
        </div>
      </div>

      <Tabs defaultValue="continuum" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="continuum">Continuum</TabsTrigger>
          <TabsTrigger value="optimizer">Design Optimizer</TabsTrigger>
          <TabsTrigger value="estimand">Estimand</TabsTrigger>
          <TabsTrigger value="sap">SAP</TabsTrigger>
          <TabsTrigger value="external">External Controls</TabsTrigger>
          <TabsTrigger value="adaptive">Adaptive</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="continuum">
          <StatisticalContinuumTab />
        </TabsContent>
        <TabsContent value="optimizer">
          <DesignOptimizerTab />
        </TabsContent>
        <TabsContent value="estimand">
          <EstimandEngineTab />
        </TabsContent>
        <TabsContent value="sap">
          <CollaborativeSAPTab />
        </TabsContent>
        <TabsContent value="external">
          <ExternalControlTab />
        </TabsContent>
        <TabsContent value="adaptive">
          <AdaptiveTrialTab />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeGraphTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
