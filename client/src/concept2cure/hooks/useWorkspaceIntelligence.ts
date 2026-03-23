/**
 * useWorkspaceIntelligence — React Query hooks for AnA 1.0 RI, Foresight, and CSR APIs.
 *
 * Endpoints wired:
 * - AnA 1.0 RI:    POST /api/lumen-cortex/regulatory-analysis
 * - AnA 1.0 RI:    GET  /api/lumen-cortex/intelligence
 * - CSR Search:    GET  /api/csr-search/fast-query
 * - Foresight:     POST /api/foresight/score
 * - Foresight AI:  POST /api/foresight-ai/risk-analysis/clinical
 */

import { useQuery, useMutation } from '@tanstack/react-query';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RegulatoryAnalysisResult {
  regulatory_framework: string;
  overall_confidence_score: number;
  regulatory_impact_summary: string;
  lumen_ai_recommendations: string[];
  comprehensive_analysis: string;
  cost_analysis: Record<string, unknown>;
  lumen_intelligence_summary: string;
}

export interface CSRSearchResult {
  id: string;
  title: string;
  indication: string;
  phase: string;
  outcome: string;
  sponsor: string;
  sample_size: number;
  summary: string;
  relevance_score?: number;
}

export interface CSRSearchParams {
  query_text: string;
  indication?: string;
  phase?: string;
  outcome?: string;
  limit?: number;
}

export interface ForesightScoreParams {
  studyId?: string;
  phase: string;
  indication: string;
  biomarkers?: string[];
  endpoints?: string[];
  sampleSize?: number;
  organizationId?: string;
}

export interface ForesightPrediction {
  id: string;
  studyId: string;
  phase: string;
  successScore: number;
  confidenceInterval: { low: number; high: number };
  riskFactors: Array<{ factor: string; impact: string; severity: string }>;
  recommendations: string[];
  similarTrials: Array<{ id: string; name: string; similarity: number; outcome: string }>;
  failurePatterns: Array<{ pattern: string; frequency: number }>;
}

export interface ClinicalRiskParams {
  organizationId?: string;
  phase: string;
  indication: string;
  targetPopulation?: string;
  competitiveLandscape?: string;
  historicalData?: string;
  regulatoryPrecedents?: string;
}

export interface ClinicalRiskResult {
  risks: Array<{ category: string; description: string; severity: string; likelihood: string }>;
  mitigationPlan: {
    highRisks: Array<{ risk: string; mitigation: string; timeline: string }>;
    mediumRisks: Array<{ risk: string; mitigation: string; timeline: string }>;
    lowRisks: Array<{ risk: string; mitigation: string }>;
    overallRiskScore: number;
    goNoGoRecommendation: string;
  };
}

export interface IntelligenceFeed {
  id: string;
  title: string;
  priority: string;
  updatedAt: string;
}

// ── Query Keys ───────────────────────────────────────────────────────────────
export const workspaceIntelKeys = {
  all: ['workspace-intelligence'] as const,
  analysis: (query?: string) => [...workspaceIntelKeys.all, 'analysis', query] as const,
  feeds: () => [...workspaceIntelKeys.all, 'feeds'] as const,
  csr: (params: CSRSearchParams | null) => [...workspaceIntelKeys.all, 'csr', params] as const,
  foresight: (params: ForesightScoreParams | null) =>
    [...workspaceIntelKeys.all, 'foresight', params] as const,
  risk: (params: ClinicalRiskParams | null) => [...workspaceIntelKeys.all, 'risk', params] as const,
};

// ── AnA 1.0 RI: Regulatory Analysis (mutation — user-triggered) ──────────────
export function useRegulatoryAnalysis() {
  return useMutation({
    mutationFn: async (query: string): Promise<RegulatoryAnalysisResult> => {
      const res = await fetch('/api/lumen-cortex/regulatory-analysis', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error(`Regulatory analysis failed: ${res.status}`);
      const data = await res.json();
      return data.data ?? data;
    },
  });
}

// ── AnA 1.0 RI: Intelligence Feeds (auto-fetched) ────────────────────────────
export function useIntelligenceFeeds() {
  return useQuery({
    queryKey: workspaceIntelKeys.feeds(),
    queryFn: async (): Promise<IntelligenceFeed[]> => {
      const res = await fetch('/api/lumen-cortex/intelligence', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.feeds ?? data.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── CSR Search (auto-fetched when params present) ────────────────────────────
export function useCSRSearch(params: CSRSearchParams | null) {
  return useQuery({
    queryKey: workspaceIntelKeys.csr(params),
    queryFn: async (): Promise<CSRSearchResult[]> => {
      if (!params) return [];
      const qs = new URLSearchParams();
      qs.set('query_text', params.query_text);
      if (params.indication) qs.set('indication', params.indication);
      if (params.phase) qs.set('phase', params.phase);
      if (params.outcome) qs.set('outcome', params.outcome);
      if (params.limit) qs.set('limit', String(params.limit));

      const res = await fetch(`/api/csr-search/fast-query?${qs.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`CSR search failed: ${res.status}`);
      const data = await res.json();
      return data.data ?? data.results ?? [];
    },
    enabled: !!params?.query_text,
    staleTime: 2 * 60 * 1000,
  });
}

// ── Foresight: Prediction Score (mutation — user-triggered) ──────────────────
export function useForesightPrediction() {
  return useMutation({
    mutationFn: async (params: ForesightScoreParams): Promise<ForesightPrediction> => {
      const res = await fetch('/api/foresight/score', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studyId: params.studyId || `study_${Date.now()}`,
          phase: params.phase,
          indication: params.indication,
          biomarkers: params.biomarkers || [],
          endpoints: params.endpoints || [],
          sampleSize: params.sampleSize || 100,
          organizationId: params.organizationId || 'org_default',
        }),
      });
      if (!res.ok) throw new Error(`Foresight prediction failed: ${res.status}`);
      const data = await res.json();
      return data.prediction ?? data.data ?? data;
    },
  });
}

// ── Foresight AI: Clinical Risk Analysis (mutation — user-triggered) ─────────
export function useClinicalRiskAnalysis() {
  return useMutation({
    mutationFn: async (params: ClinicalRiskParams): Promise<ClinicalRiskResult> => {
      const res = await fetch('/api/foresight-ai/risk-analysis/clinical', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          organizationId: params.organizationId || 'org_default',
          phase: params.phase,
          indication: params.indication,
          targetPopulation: params.targetPopulation,
          competitiveLandscape: params.competitiveLandscape,
          historicalData: params.historicalData,
          regulatoryPrecedents: params.regulatoryPrecedents,
        }),
      });
      if (!res.ok) throw new Error(`Clinical risk analysis failed: ${res.status}`);
      const data = await res.json();
      return data.data ?? data;
    },
  });
}
