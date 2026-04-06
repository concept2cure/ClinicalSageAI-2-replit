/**
 * Intelligence Layer Hooks — TanStack Query bindings for /api/intelligence
 *
 * Provides hooks for:
 *   - Recommendations
 *   - Readiness scoring
 *   - Project intelligence profiles
 *   - Next best actions
 *   - Learning loop feedback
 *   - Cross-module analysis
 *   - Unified dashboard
 *
 * @module concept2cure/hooks/useIntelligence
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  const orgId =
    sessionStorage.getItem('trialsage_org_id') ||
    localStorage.getItem('trialsage_org_id');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (orgId) headers['x-organization-id'] = orgId;
  return headers;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers as Record<string, string>) },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const intelligenceKeys = {
  all: ['intelligence'] as const,
  dashboard: (projectId: number | string) =>
    ['intelligence', 'dashboard', projectId] as const,
  recommendations: (projectId: number | string) =>
    ['intelligence', 'recommendations', projectId] as const,
  readiness: (projectId: number | string) =>
    ['intelligence', 'readiness', projectId] as const,
  profile: (projectId: number | string) =>
    ['intelligence', 'profile', projectId] as const,
  memory: (projectId: number | string) =>
    ['intelligence', 'memory', projectId] as const,
  nextActions: (projectId: number | string) =>
    ['intelligence', 'next-actions', projectId] as const,
  feedbackSummary: (projectId: number | string) =>
    ['intelligence', 'feedback-summary', projectId] as const,
  crossModule: (projectId: number | string) =>
    ['intelligence', 'cross-module', projectId] as const,
  rimAssessment: (projectId: number | string) =>
    ['intelligence', 'rim-assessment', projectId] as const,
  rimSignals: (projectId: number | string) =>
    ['intelligence', 'rim-signals', projectId] as const,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (mirror backend)
// ═══════════════════════════════════════════════════════════════════════════════

export interface Recommendation {
  recommendationId: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  sourceType: 'rules_based' | 'validation_based' | 'ai_inferred';
  targetObjectType: string;
  targetObjectId: string;
  reason: string;
  evidence: EvidenceRef[];
  confidence: number | null;
  suggestedAction: string;
  requiresApproval: boolean;
  status: 'active' | 'accepted' | 'dismissed' | 'resolved';
  createdAt: string;
}

export interface EvidenceRef {
  sourceType: string;
  sourceId: string;
  sourceTitle: string;
  relevance: number;
}

export interface RecommendationSet {
  recommendations: Recommendation[];
  generatedAt: string;
  totalGenerated: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  bySource: { rules_based: number; validation_based: number; ai_inferred: number };
}

export interface ReadinessScore {
  overallScore: number;
  dimensions: {
    completeness: number;
    quality: number;
    consistency: number;
    compliance: number;
  };
  moduleBreakdown: ModuleScore[];
  gaps: ReadinessGap[];
  trend: { direction: 'improving' | 'stable' | 'declining'; delta: number; dataPoints: number };
  predictions: {
    approvalProbability: number;
    estimatedReviewDays: number;
    estimatedDeficiencies: number;
  };
  scoredAt: string;
}

export interface ModuleScore {
  modulePath: string;
  moduleName: string;
  score: number;
  gapCount: number;
  status: 'complete' | 'in_progress' | 'not_started' | 'at_risk';
}

export interface ReadinessGap {
  id: string;
  module: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
  estimatedEffortHours: number | null;
}

export interface NextAction {
  actionId: string;
  rank: number;
  title: string;
  description: string;
  category: string;
  urgency: 'immediate' | 'this_week' | 'this_sprint' | 'backlog';
  impactEstimate: 'high' | 'medium' | 'low';
  effortEstimate: 'quick' | 'moderate' | 'substantial';
  sourceRecommendationId: string | null;
  sourceGapId: string | null;
  targetObjectType: string;
  targetObjectId: string;
}

export interface NextActionSet {
  actions: NextAction[];
  generatedAt: string;
  totalActions: number;
  readinessScore: number;
  topCategory: string | null;
}

export interface ProjectIntelligenceSummary {
  profileId: number;
  projectId: number;
  organizationId: number;
  regulatoryStrategy: string | null;
  targetIndication: string | null;
  targetPopulation: string | null;
  riskFactors: Array<{ risk: string; likelihood: string; impact: string; mitigation?: string }>;
  openQuestions: Array<{ question: string; context?: string; priority?: string }>;
  keyDecisions: Array<{ decision: string; rationale: string; date: string; source?: string }>;
  learnedInsights: Array<{ insight: string; source: string; confidence: number; extractedAt: string }>;
  documentStats: { totalIngested: number; totalTokens: number; lastIngestedAt: string | null };
  memoryEntryCount: number;
  profileStatus: string;
  lastEnrichedAt: string | null;
}

export interface FeedbackSummary {
  totalFeedback: number;
  accepted: number;
  dismissed: number;
  resolved: number;
  overridden: number;
  acceptanceRate: number;
  resolutionRate: number;
  averageTimeToAction: number | null;
  topDismissedTypes: Array<{ type: string; count: number }>;
}

export interface CrossModuleReport {
  projectId: number;
  insights: CrossModuleInsight[];
  totalInsights: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  documentsCovered: number;
  analyzedAt: string;
}

export interface CrossModuleInsight {
  insightId: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  targetDocumentId: string;
  targetDocumentTitle: string;
  description: string;
  suggestedResolution: string;
  detectedAt: string;
}

export interface IntelligenceDashboard {
  readiness: ReadinessScore | null;
  recommendations: RecommendationSet | null;
  nextActions: NextActionSet | null;
  crossModule: CrossModuleReport | null;
  profile: ProjectIntelligenceSummary | null;
  feedbackSummary: FeedbackSummary | null;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recommendations for a project.
 */
export function useRecommendations(projectId: number | string | null) {
  return useQuery<RecommendationSet>({
    queryKey: intelligenceKeys.recommendations(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/recommendations`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Readiness score for a project.
 */
export function useReadinessScore(projectId: number | string | null) {
  return useQuery<ReadinessScore>({
    queryKey: intelligenceKeys.readiness(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/readiness`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Project intelligence profile.
 */
export function useProjectIntelligence(projectId: number | string | null) {
  return useQuery<ProjectIntelligenceSummary>({
    queryKey: intelligenceKeys.profile(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/profile`),
    enabled: !!projectId,
    staleTime: 120_000,
  });
}

/**
 * Next best actions.
 */
export function useNextBestActions(projectId: number | string | null, limit?: number) {
  return useQuery<NextActionSet>({
    queryKey: intelligenceKeys.nextActions(projectId ?? 0),
    queryFn: () =>
      apiFetch(`/api/intelligence/projects/${projectId}/next-actions${limit ? `?limit=${limit}` : ''}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

/**
 * Cross-module analysis.
 */
export function useCrossModuleAnalysis(projectId: number | string | null) {
  return useQuery<CrossModuleReport>({
    queryKey: intelligenceKeys.crossModule(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/cross-module`),
    enabled: !!projectId,
    staleTime: 120_000,
  });
}

/**
 * Feedback summary.
 */
export function useFeedbackSummary(projectId: number | string | null) {
  return useQuery<FeedbackSummary>({
    queryKey: intelligenceKeys.feedbackSummary(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/feedback/summary`),
    enabled: !!projectId,
    staleTime: 120_000,
  });
}

/**
 * Submit feedback on a recommendation.
 */
export function useSubmitFeedback(projectId: number | string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      recommendationId: string;
      recommendationType: string;
      action: 'accepted' | 'dismissed' | 'resolved' | 'overridden';
      userComment?: string;
    }) =>
      apiFetch(`/api/intelligence/projects/${projectId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: intelligenceKeys.feedbackSummary(projectId) });
        qc.invalidateQueries({ queryKey: intelligenceKeys.recommendations(projectId) });
        qc.invalidateQueries({ queryKey: intelligenceKeys.dashboard(projectId) });
      }
    },
  });
}

/**
 * Enrich project intelligence profile.
 */
export function useEnrichIntelligence(projectId: number | string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch(`/api/intelligence/projects/${projectId}/profile/enrich`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: intelligenceKeys.profile(projectId) });
        qc.invalidateQueries({ queryKey: intelligenceKeys.dashboard(projectId) });
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIM SIGNAL TYPES (mirrors backend SignalSummary from signal-capture.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export type RIMSignalType =
  | 'judgment'
  | 'pattern_match'
  | 'recommendation'
  | 'feedback'
  | 'artifact_change';

export type TrendConfidence = 'high' | 'moderate' | 'low' | 'insufficient';

export interface RIMSignalSummary {
  totalSignals: number;
  byType: Partial<Record<RIMSignalType, number>>;
  byRiskLevel: Partial<Record<string, number>>;
  averageScore: number;
  averageConfidence: number;
  topPatternIds: string[];
  overallTrend: 'improving' | 'stable' | 'declining';
  trendConfidence: TrendConfidence;
  trendSampleSize: number;
  periodStart: string;
  periodEnd: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIM ASSESSMENT TYPES (mirrors backend RIMAssessment from rim.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export type JudgmentModel =
  | 'evidence_sufficiency'
  | 'defensibility'
  | 'reviewer_sensitivity'
  | 'claim_risk'
  | 'cross_section_consistency'
  | 'submission_risk';

export type JudgmentVerdict =
  | 'pass'
  | 'acceptable'
  | 'needs_attention'
  | 'at_risk'
  | 'fail';

export interface JudgmentFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  remediation: string;
  reviewerImpact: 'likely_question' | 'possible_question' | 'unlikely_question';
}

export interface JudgmentFactor {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  detail: string;
}

export interface JudgmentScore {
  model: JudgmentModel;
  score: number;
  confidence: number;
  verdict: JudgmentVerdict;
  factors: JudgmentFactor[];
  findings: JudgmentFinding[];
  scoredAt: string;
}

export interface JudgmentReport {
  frameworkVersion: string;
  scores: JudgmentScore[];
  overallRisk: number;
  overallVerdict: JudgmentVerdict;
  topFindings: JudgmentFinding[];
  generatedAt: string;
}

export interface RIMPatternMatch {
  patternId: string;
  matchedText: string;
  matchLocation: string;
  matchConfidence: number;
  pattern: {
    id: string;
    category: string;
    name: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    remediation: string;
    hitCount: number;
    lastMatchedAt: string | null;
  };
}

export interface RIMAssessment {
  judgment: JudgmentReport;
  rimScore: number;
  rimVerdict: string;
  topActions: string[];
  assessedAt: string;
  patternMatches: RIMPatternMatch[];
  signalSummary: RIMSignalSummary | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIM HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * RIM signals summary — accumulated signals with types, scores, trends.
 */
export function useRIMSignals(projectId: number | string | null) {
  return useQuery<RIMSignalSummary>({
    queryKey: intelligenceKeys.rimSignals(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/rim/signals`),
    enabled: !!projectId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * RIM assessment — full judgment framework scores for a project.
 * Calls POST because the endpoint runs a fresh assessment.
 */
export function useRIMAssessment(projectId: number | string | null) {
  return useQuery<RIMAssessment>({
    queryKey: intelligenceKeys.rimAssessment(projectId ?? 0),
    queryFn: () =>
      apiFetch(`/api/intelligence/projects/${projectId}/rim/assess`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    enabled: !!projectId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KERNEL DECISION RECORDS
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelDecision {
  id: string;
  createdAt: string;
  requestId: string | null;
  threadId: string | null;
  route: string;
  organizationId: number | null;
  userId: number | null;
  projectId: number | null;
  plannerVersion: string;
  orchestratorName: string;
  intentLens: string | null;
  intentConfidence: number | null;
  submissionType: string | null;
  selectedTaskType: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  routingStrategy: string | null;
  selectedTools: string[];
  alternatives: Array<Record<string, unknown>>;
  constraints: Record<string, unknown>;
  decisionRationale: string | null;
  estimatedCostUsd: number | null;
  latencyMs: number | null;
  outcome: 'success' | 'failed' | 'partial' | null;
  errorMessage: string | null;
}

export interface KernelDecisionListResponse {
  decisions: KernelDecision[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch kernel AI routing decision records for a project (or org-wide if no projectId).
 */
export function useKernelDecisions(projectId?: number | string | null, limit = 20) {
  return useQuery<KernelDecisionListResponse>({
    queryKey: ['concept2cure', 'kernel-decisions', projectId, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', String(projectId));
      params.set('limit', String(limit));
      const res = await apiFetch<{ data: KernelDecisionListResponse }>(
        `/api/ana-ri/kernel/decisions?${params.toString()}`,
      );
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
