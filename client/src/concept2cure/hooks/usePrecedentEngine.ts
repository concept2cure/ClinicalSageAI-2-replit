/**
 * @fileoverview Precedent Engine React Hooks
 * @module concept2cure/hooks/usePrecedentEngine
 *
 * Live hooks for the Regulatory Precedent Engine API:
 * - Search precedents (510k clearances, adversarial, unified)
 * - Compare your submission against a precedent
 * - Risk analysis with adversarial cross-referencing
 * - Strategy recommendation based on approval history
 * - Real-time claim checking (authoring assistant)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Auth helper ──────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

const BASE = '/api/precedent-engine';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrecedentRecord {
  id: string;
  submissionType: string;
  productType?: string;
  deviceClass?: string;
  therapeuticArea?: string;
  indication?: string;
  clearanceNumber?: string;
  deviceName?: string;
  applicant?: string;
  decisionDate?: string;
  decisionOutcome?: string;
  clearanceType?: string;
  predicateDevice?: string;
  predicateKNumber?: string;
  strategySummary?: string;
  testingApproach?: string;
  trialDesign?: string;
  sampleSize?: number;
  primaryEndpoint?: string;
  endpointMet?: boolean;
  fdaComments?: string;
  fdaQuestions?: string[];
  riskFactors?: string[];
  sourceType?: string;
  confidenceScore?: number;
  similarityScore?: number;
}

export interface SearchParams {
  submissionType: string;
  deviceClass?: string;
  therapeuticArea?: string;
  indication?: string;
  productType?: string;
  query?: string;
  limit?: number;
}

export interface CompareParams {
  precedentId: string;
  submissionType: string;
  deviceName?: string;
  indication?: string;
  trialDesign?: string;
  sampleSize?: number;
  primaryEndpoint?: string;
  testingApproach?: string;
  predicateDevice?: string;
}

export interface CompareResult {
  precedent: PrecedentRecord;
  similarities: Dimension[];
  differences: Dimension[];
  riskLevel: 'low' | 'medium' | 'high';
  overallScore: number;
  recommendations: string[];
}

export interface Dimension {
  dimension: string;
  userValue: string;
  precedentValue: string;
  match: boolean;
  impact: 'low' | 'medium' | 'high';
}

export interface RiskParams {
  submissionType: string;
  deviceName?: string;
  indication?: string;
  therapeuticArea?: string;
  deviceClass?: string;
}

export interface RiskResult {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: Array<{ factor: string; severity: string; detail: string }>;
  historicalObjections: Array<{ type: string; count: number; detail: string }>;
  mitigationStrategies: string[];
  safetySignals: Array<{ device: string; signal: string; severity: string }>;
}

export interface StrategyParams {
  submissionType: string;
  deviceName?: string;
  indication?: string;
  therapeuticArea?: string;
  deviceClass?: string;
}

export interface StrategyResult {
  recommendedStrategy: string;
  confidence: number;
  supportingPrecedents: PrecedentRecord[];
  alternativeStrategies: Array<{ strategy: string; confidence: number; rationale: string }>;
  testingRequirements: string[];
  estimatedTimeline: string;
  keyRisks: string[];
}

export interface ClaimCheckParams {
  claim: string;
  submissionType: string;
  therapeuticArea?: string;
  indication?: string;
}

export interface ClaimCheckResult {
  claim: string;
  supported: boolean;
  precedents: PrecedentRecord[];
  warnings: Array<{ type: string; message: string; severity: string }>;
  suggestedCitations: Array<{ clearanceNumber: string; deviceName: string; relevance: string }>;
  recommendation: string;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const precedentKeys = {
  all: ['precedent-engine'] as const,
  search: (params: SearchParams) => [...precedentKeys.all, 'search', params] as const,
  risk: (params: RiskParams) => [...precedentKeys.all, 'risk', params] as const,
  strategy: (params: StrategyParams) => [...precedentKeys.all, 'strategy', params] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Search regulatory precedents — cached, auto-refetches on param change */
export function usePrecedentSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: precedentKeys.search(params!),
    queryFn: async (): Promise<PrecedentRecord[]> => {
      const res = await fetch(`${BASE}/search`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!params?.submissionType,
    staleTime: 2 * 60 * 1000,
  });
}

/** Compare your submission against a specific precedent */
export function usePrecedentCompare() {
  return useMutation({
    mutationFn: async (params: CompareParams): Promise<CompareResult> => {
      const res = await fetch(`${BASE}/compare`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Compare failed');
      const json = await res.json();
      return json.data;
    },
  });
}

/** Analyze regulatory risk */
export function usePrecedentRisk(params: RiskParams | null) {
  return useQuery({
    queryKey: precedentKeys.risk(params!),
    queryFn: async (): Promise<RiskResult> => {
      const res = await fetch(`${BASE}/risk`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Risk analysis failed');
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}

/** Get strategy recommendation */
export function usePrecedentStrategy(params: StrategyParams | null) {
  return useQuery({
    queryKey: precedentKeys.strategy(params!),
    queryFn: async (): Promise<StrategyResult> => {
      const res = await fetch(`${BASE}/strategy`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Strategy recommendation failed');
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}

/** Real-time claim checking for the document editor */
export function useClaimCheck() {
  return useMutation({
    mutationFn: async (params: ClaimCheckParams): Promise<ClaimCheckResult> => {
      const res = await fetch(`${BASE}/check-claim`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Claim check failed');
      const json = await res.json();
      return json.data;
    },
  });
}
