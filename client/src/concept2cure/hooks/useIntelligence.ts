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
 * Unified intelligence dashboard — all signals in one request.
 */
export function useIntelligenceDashboard(projectId: number | string | null) {
  return useQuery<IntelligenceDashboard>({
    queryKey: intelligenceKeys.dashboard(projectId ?? 0),
    queryFn: () => apiFetch(`/api/intelligence/projects/${projectId}/dashboard`),
    enabled: !!projectId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });
}

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
