/**
 * Submission Twin Dashboard
 *
 * Living submission intelligence layer — unified view of claims, evidence,
 * drift, regulator challenges, change impacts, and readiness/fragility.
 */

import React, { useState, useCallback } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle, BarChart3, CheckCircle, Clock, FileCheck,
  Gauge, RefreshCw, Shield, Target, TrendingUp, Zap,
  Eye, FileText, GitBranch, AlertCircle, ArrowRight,
  Search, Activity, Brain, Scale,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ── Types ──

interface Assessment {
  id: number;
  packageId: number;
  status: 'running' | 'completed' | 'failed' | 'stale';
  readinessScore: number | null;
  fragilityScore: number | null;
  claimCount: number;
  supportedClaimCount: number;
  unsupportedClaimCount: number;
  driftAlertCount: number;
  challengeCount: number;
  criticalFindingCount: number;
  nextBestArtifact: string | null;
  nextBestArtifactRationale: string | null;
  weakZones: FragilityZone[] | null;
  executiveSummary: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ClaimWithEvidence {
  id: number;
  claimText: string;
  claimType: string;
  sectionPath: string | null;
  confidence: number;
  evidenceCount: number;
  bestSupportStrength: string;
  bestRelevanceScore: number;
  hasStatisticalSupport: boolean;
}

interface DriftAlert {
  id: number;
  driftType: string;
  severity: string;
  description: string;
  sourceExcerpt: string | null;
  targetExcerpt: string | null;
  suggestedFix: string | null;
  resolved: boolean;
  createdAt: string;
}

interface Challenge {
  id: number;
  reviewerLens: string;
  challengeText: string;
  targetSection: string | null;
  severity: string;
  deficiencyLikelihood: number;
  suggestedResponse: string | null;
  suggestedArtifact: string | null;
}

interface ChangeImpact {
  id: number;
  changeDescription: string;
  changeType: string;
  impactSeverity: string;
  impactDescription: string;
  remediation: string | null;
  resolved: boolean;
  createdAt: string;
}

interface FragilityZone {
  section: string;
  sectionId?: number;
  score: number;
  issues: string[];
}

interface NextBestArtifact {
  artifactType: string;
  rationale: string;
  priority: string;
  targetSection?: string;
}

// ── Helpers ──

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  informational: 'bg-gray-100 text-gray-600 border-gray-200',
};

const supportColor: Record<string, string> = {
  direct: 'bg-green-100 text-green-800',
  indirect: 'bg-emerald-100 text-emerald-700',
  weak: 'bg-yellow-100 text-yellow-800',
  stale: 'bg-orange-100 text-orange-800',
  contradictory: 'bg-red-100 text-red-800',
  unsupported: 'bg-gray-100 text-gray-600',
};

const lensLabel: Record<string, string> = {
  skeptical_reviewer: 'Skeptical Reviewer',
  evidence_sufficiency_skeptic: 'Evidence Skeptic',
  cmc_heavy_reviewer: 'CMC Reviewer',
  clinical_risk_reviewer: 'Clinical Risk',
  compliance_inspection: 'Compliance Inspector',
  claims_challenger: 'Claims Challenger',
  biostatistics_skeptic: 'Biostat Skeptic',
};

const driftLabel: Record<string, string> = {
  summary_detail_mismatch: 'Summary/Detail Mismatch',
  claim_escalation_without_evidence: 'Claim Escalation',
  endpoint_framing_drift: 'Endpoint Framing Drift',
  cmc_maturity_overstatement: 'CMC Overstatement',
  narrative_statistical_mismatch: 'Narrative vs. Statistical',
  document_contradiction: 'Document Contradiction',
  stale_downstream_summary: 'Stale Summary',
};

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Request failed');
  return json.data;
}

// ── Component ──

interface Props {
  packageId: number;
}

export function SubmissionTwinDashboard({ packageId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Queries
  const assessmentsQuery = useQuery({
    queryKey: ['submission-twin', 'assessments', packageId],
    queryFn: () => apiCall<Assessment[]>(`/api/submission-twin/assessments/${packageId}`),
  });

  const claimsQuery = useQuery({
    queryKey: ['submission-twin', 'claims', packageId],
    queryFn: () => apiCall<ClaimWithEvidence[]>(`/api/submission-twin/claims/${packageId}`),
    enabled: activeTab === 'claims' || activeTab === 'overview',
  });

  const driftQuery = useQuery({
    queryKey: ['submission-twin', 'drift', packageId],
    queryFn: () => apiCall<DriftAlert[]>(`/api/submission-twin/drift/${packageId}`),
    enabled: activeTab === 'drift' || activeTab === 'overview',
  });

  const challengesQuery = useQuery({
    queryKey: ['submission-twin', 'challenges', packageId],
    queryFn: () => apiCall<Challenge[]>(`/api/submission-twin/challenges/${packageId}`),
    enabled: activeTab === 'challenges' || activeTab === 'overview',
  });

  const impactsQuery = useQuery({
    queryKey: ['submission-twin', 'impacts', packageId],
    queryFn: () => apiCall<ChangeImpact[]>(`/api/submission-twin/change-impacts/${packageId}`),
    enabled: activeTab === 'impacts' || activeTab === 'overview',
  });

  const readinessQuery = useQuery({
    queryKey: ['submission-twin', 'readiness', packageId],
    queryFn: () => apiCall<{ readinessScore: number; fragilityScore: number; weakZones: FragilityZone[] }>(
      `/api/submission-twin/readiness/${packageId}`
    ),
    enabled: activeTab === 'readiness' || activeTab === 'overview',
  });

  const nextArtifactQuery = useQuery({
    queryKey: ['submission-twin', 'next-artifact', packageId],
    queryFn: () => apiCall<NextBestArtifact>(`/api/submission-twin/next-artifact/${packageId}`),
    enabled: activeTab === 'overview',
  });

  // Mutations
  const runAssessment = useMutation({
    mutationFn: () =>
      apiCall<any>(`/api/submission-twin/assess/${packageId}`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Assessment complete', description: 'Submission Twin has been updated.' });
      queryClient.invalidateQueries({ queryKey: ['submission-twin'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Assessment failed', description: err.message, variant: 'destructive' });
    },
  });

  const resolveDrift = useMutation({
    mutationFn: (alertId: number) =>
      apiCall<any>(`/api/submission-twin/drift/${alertId}/resolve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission-twin', 'drift'] });
    },
  });

  const resolveImpact = useMutation({
    mutationFn: (impactId: number) =>
      apiCall<any>(`/api/submission-twin/change-impact/${impactId}/resolve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submission-twin', 'impacts'] });
    },
  });

  const latestAssessment = assessmentsQuery.data?.[0];
  const claims = claimsQuery.data ?? [];
  const driftAlerts = driftQuery.data ?? [];
  const challenges = challengesQuery.data ?? [];
  const impacts = impactsQuery.data ?? [];
  const readiness = readinessQuery.data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Submission Twin</h2>
          <p className="text-muted-foreground text-sm">
            Living intelligence layer — claims, evidence, drift, challenges, readiness
          </p>
        </div>
        <Button
          onClick={() => runAssessment.mutate()}
          disabled={runAssessment.isPending}
        >
          {runAssessment.isPending ? (
            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Running...</>
          ) : (
            <><Zap className="mr-2 h-4 w-4" /> Run Assessment</>
          )}
        </Button>
      </div>

      {/* Score Cards */}
      {(latestAssessment || readiness) && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <ScoreCard
            label="Readiness"
            value={readiness?.readinessScore ?? latestAssessment?.readinessScore ?? 0}
            icon={<Gauge className="h-4 w-4" />}
            color={getScoreColor(readiness?.readinessScore ?? latestAssessment?.readinessScore ?? 0)}
            suffix="%"
          />
          <ScoreCard
            label="Fragility"
            value={readiness?.fragilityScore ?? latestAssessment?.fragilityScore ?? 0}
            icon={<AlertTriangle className="h-4 w-4" />}
            color={getFragilityColor(readiness?.fragilityScore ?? latestAssessment?.fragilityScore ?? 0)}
            suffix="%"
          />
          <ScoreCard
            label="Claims"
            value={latestAssessment?.claimCount ?? claims.length}
            icon={<FileText className="h-4 w-4" />}
            color="text-blue-600"
          />
          <ScoreCard
            label="Supported"
            value={latestAssessment?.supportedClaimCount ?? claims.filter(c => c.bestSupportStrength === 'direct' || c.bestSupportStrength === 'indirect').length}
            icon={<CheckCircle className="h-4 w-4" />}
            color="text-green-600"
          />
          <ScoreCard
            label="Drift Alerts"
            value={latestAssessment?.driftAlertCount ?? driftAlerts.length}
            icon={<GitBranch className="h-4 w-4" />}
            color={driftAlerts.length > 0 ? 'text-orange-600' : 'text-green-600'}
          />
          <ScoreCard
            label="Challenges"
            value={latestAssessment?.challengeCount ?? challenges.length}
            icon={<Shield className="h-4 w-4" />}
            color="text-purple-600"
          />
        </div>
      )}

      {/* Executive Summary */}
      {latestAssessment?.executiveSummary && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Brain className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-indigo-900 mb-1">Executive Summary</p>
                <p className="text-sm text-muted-foreground">{latestAssessment.executiveSummary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="claims">Claims & Evidence</TabsTrigger>
          <TabsTrigger value="drift">Drift</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          <TabsTrigger value="impacts">Change Impact</TabsTrigger>
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Next Best Artifact */}
          {nextArtifactQuery.data && (
            <Card className="border-indigo-200 bg-indigo-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-indigo-600" />
                  Next Best Artifact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-indigo-900">{nextArtifactQuery.data.artifactType}</p>
                    <p className="text-sm text-muted-foreground mt-1">{nextArtifactQuery.data.rationale}</p>
                  </div>
                  <Badge className={severityColor[nextArtifactQuery.data.priority] ?? 'bg-gray-100'}>
                    {nextArtifactQuery.data.priority}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Lists */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Top Unsupported Claims */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Unsupported Claims ({claims.filter(c => c.bestSupportStrength === 'unsupported').length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {claims.filter(c => c.bestSupportStrength === 'unsupported').slice(0, 5).map(claim => (
                    <div key={claim.id} className="flex items-start gap-2 text-sm border-l-2 border-red-300 pl-2">
                      <span className="text-muted-foreground">[{claim.claimType}]</span>
                      <span className="line-clamp-2">{claim.claimText}</span>
                    </div>
                  ))}
                  {claims.filter(c => c.bestSupportStrength === 'unsupported').length === 0 && (
                    <p className="text-sm text-muted-foreground">No unsupported claims detected.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Drift Alerts */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-orange-500" />
                  Active Drift Alerts ({driftAlerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {driftAlerts.slice(0, 5).map(alert => (
                    <div key={alert.id} className="flex items-start gap-2 text-sm border-l-2 border-orange-300 pl-2">
                      <Badge variant="outline" className={`text-xs shrink-0 ${severityColor[alert.severity]}`}>
                        {alert.severity}
                      </Badge>
                      <span className="line-clamp-2">{alert.description}</span>
                    </div>
                  ))}
                  {driftAlerts.length === 0 && (
                    <p className="text-sm text-muted-foreground">No drift alerts.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Assessment History */}
          {assessmentsQuery.data && assessmentsQuery.data.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Assessment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {assessmentsQuery.data.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          a.status === 'completed' ? 'bg-green-50 text-green-700' :
                          a.status === 'running' ? 'bg-blue-50 text-blue-700' :
                          'bg-red-50 text-red-700'
                        }>
                          {a.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {a.readinessScore != null && <span>Readiness: {a.readinessScore}%</span>}
                        {a.claimCount != null && <span>{a.claimCount} claims</span>}
                        {a.criticalFindingCount != null && a.criticalFindingCount > 0 && (
                          <span className="text-red-600 font-medium">{a.criticalFindingCount} critical</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Claims & Evidence Tab */}
        <TabsContent value="claims" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Claim-to-Evidence Integrity Map</CardTitle>
              <CardDescription>Every assertion in your submission and what supports it</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {claims.map(claim => (
                  <div key={claim.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{claim.claimType}</Badge>
                          {claim.hasStatisticalSupport && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                              <BarChart3 className="h-3 w-3 mr-1" /> Statistical
                            </Badge>
                          )}
                          {claim.sectionPath && (
                            <span className="text-xs text-muted-foreground">{claim.sectionPath}</span>
                          )}
                        </div>
                        <p className="text-sm">{claim.claimText}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge className={`text-xs ${supportColor[claim.bestSupportStrength] ?? 'bg-gray-100'}`}>
                          {claim.bestSupportStrength}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {claim.evidenceCount} evidence link{claim.evidenceCount !== 1 ? 's' : ''}
                        </span>
                        <div className="w-16">
                          <Progress value={claim.confidence * 100} className="h-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {claims.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No claims extracted yet. Run an assessment to extract claims.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Drift Tab */}
        <TabsContent value="drift" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Narrative Drift Detection</CardTitle>
              <CardDescription>Inconsistencies, contradictions, and stale references</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {driftAlerts.map(alert => (
                  <div key={alert.id} className={`border rounded-lg p-3 ${alert.severity === 'critical' ? 'border-red-300 bg-red-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${severityColor[alert.severity]}`}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {driftLabel[alert.driftType] ?? alert.driftType}
                          </Badge>
                        </div>
                        <p className="text-sm">{alert.description}</p>
                        {alert.suggestedFix && (
                          <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" /> {alert.suggestedFix}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveDrift.mutate(alert.id)}
                        disabled={resolveDrift.isPending}
                      >
                        Resolve
                      </Button>
                    </div>
                    {(alert.sourceExcerpt || alert.targetExcerpt) && (
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        {alert.sourceExcerpt && (
                          <div className="bg-white border rounded p-2">
                            <span className="font-medium text-muted-foreground">Source:</span>
                            <p className="mt-1 line-clamp-3">{alert.sourceExcerpt}</p>
                          </div>
                        )}
                        {alert.targetExcerpt && (
                          <div className="bg-white border rounded p-2">
                            <span className="font-medium text-muted-foreground">Target:</span>
                            <p className="mt-1 line-clamp-3">{alert.targetExcerpt}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {driftAlerts.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No active drift alerts. Your submission narrative is consistent.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Challenges Tab */}
        <TabsContent value="challenges" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regulator Challenge Simulation</CardTitle>
              <CardDescription>AI-simulated reviewer questions across multiple perspectives</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Group by lens */}
              {Object.entries(
                challenges.reduce<Record<string, Challenge[]>>((acc, c) => {
                  (acc[c.reviewerLens] = acc[c.reviewerLens] || []).push(c);
                  return acc;
                }, {})
              ).map(([lens, lensChallenges]) => (
                <div key={lens} className="mb-4">
                  <h4 className="font-medium text-sm flex items-center gap-2 mb-2">
                    <Eye className="h-4 w-4" />
                    {lensLabel[lens] ?? lens}
                    <Badge variant="outline" className="text-xs">{lensChallenges.length}</Badge>
                  </h4>
                  <div className="space-y-2 ml-6">
                    {lensChallenges.map(challenge => (
                      <div key={challenge.id} className="border rounded p-2">
                        <div className="flex items-start gap-2">
                          <Badge className={`text-xs shrink-0 ${severityColor[challenge.severity]}`}>
                            {Math.round(challenge.deficiencyLikelihood * 100)}%
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm">{challenge.challengeText}</p>
                            {challenge.suggestedResponse && (
                              <p className="text-xs text-green-700 mt-1">
                                Response: {challenge.suggestedResponse}
                              </p>
                            )}
                            {challenge.suggestedArtifact && (
                              <p className="text-xs text-indigo-600 mt-0.5 flex items-center gap-1">
                                <FileCheck className="h-3 w-3" /> Create: {challenge.suggestedArtifact}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {challenges.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No challenges simulated yet. Run an assessment to generate reviewer challenges.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Impact Tab */}
        <TabsContent value="impacts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Consequence Intelligence</CardTitle>
              <CardDescription>Downstream impacts when artifacts change</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {impacts.map(impact => (
                  <div key={impact.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${severityColor[impact.impactSeverity]}`}>
                            {impact.impactSeverity}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{impact.changeType}</Badge>
                        </div>
                        <p className="text-sm font-medium">{impact.changeDescription}</p>
                        <p className="text-sm text-muted-foreground mt-1">{impact.impactDescription}</p>
                        {impact.remediation && (
                          <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" /> {impact.remediation}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveImpact.mutate(impact.id)}
                        disabled={resolveImpact.isPending}
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                ))}
                {impacts.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No unresolved change impacts.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Readiness Tab */}
        <TabsContent value="readiness" className="space-y-4">
          {readiness && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-green-600" /> Readiness Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold mb-2" style={{ color: getScoreHex(readiness.readinessScore) }}>
                      {readiness.readinessScore}%
                    </div>
                    <Progress value={readiness.readinessScore} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {readiness.readinessScore >= 80
                        ? 'Strong readiness. Package is well-supported.'
                        : readiness.readinessScore >= 50
                        ? 'Moderate readiness. Address gaps before submission.'
                        : 'Low readiness. Significant gaps need attention.'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" /> Fragility Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold mb-2" style={{ color: getFragilityHex(readiness.fragilityScore) }}>
                      {readiness.fragilityScore}%
                    </div>
                    <Progress value={readiness.fragilityScore} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {readiness.fragilityScore <= 20
                        ? 'Robust. Package can withstand scrutiny.'
                        : readiness.fragilityScore <= 50
                        ? 'Some fragility. Strengthen weak areas.'
                        : 'Highly fragile. Significant risk of deficiency.'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Weak Zones */}
              {readiness.weakZones.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Scale className="h-4 w-4 text-red-500" /> Weak Zones
                    </CardTitle>
                    <CardDescription>Sections most vulnerable to regulatory challenge</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {readiness.weakZones.map((zone, idx) => (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{zone.section}</span>
                            <span className={`text-sm font-bold ${zone.score < 30 ? 'text-red-600' : zone.score < 60 ? 'text-orange-600' : 'text-yellow-600'}`}>
                              {zone.score}/100
                            </span>
                          </div>
                          <Progress value={zone.score} className="h-2 mb-2" />
                          <div className="flex flex-wrap gap-1">
                            {zone.issues.map((issue, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-700">
                                {issue}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
          {!readiness && (
            <p className="text-center text-muted-foreground py-8">
              Run an assessment to compute readiness and fragility scores.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Small Components ──

function ScoreCard({ label, value, icon, color, suffix }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={color}>{icon}</span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>
          {typeof value === 'number' ? Math.round(value) : value}{suffix ?? ''}
        </div>
      </CardContent>
    </Card>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getFragilityColor(score: number): string {
  if (score <= 20) return 'text-green-600';
  if (score <= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreHex(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 50) return '#ca8a04';
  return '#dc2626';
}

function getFragilityHex(score: number): string {
  if (score <= 20) return '#16a34a';
  if (score <= 50) return '#ca8a04';
  return '#dc2626';
}

export default SubmissionTwinDashboard;
