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

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  factors: Array<{
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    precedentCount: number;
    mitigation: string;
  }>;
  historicalObjections: Array<{
    question: string;
    agency: string;
    failureMode: string;
    therapeuticArea: string;
    submissionType: string;
    similarity: number;
  }>;
  mitigationStrategies: string[];
  safetySignals: Array<{
    kNumber: string;
    deviceName: string;
    signalType: string;
    severity: number;
    description: string;
  }>;
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
  rationale?: string;
  confidence: number;
  supportingPrecedents: PrecedentRecord[];
  alternativeStrategies: Array<{
    strategy: string;
    precedentCount: number;
    successRate: number;
    description: string;
  }>;
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

// ── CRL Trigger Types ───────────────────────────────────────────────────

export interface CRLTrigger {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  mitigation: string;
  historicalRate: number;
  supportingObjections: string[];
}

export interface CRLTriggerResult {
  submissionType: string;
  overallCRLRisk: 'low' | 'medium' | 'high';
  triggers: CRLTrigger[];
  totalPatterns: number;
  criticalCount: number;
}

// ── RTF Trigger Types ───────────────────────────────────────────────────

export interface RTFCheckItem {
  section: string;
  item: string;
  required: boolean;
  category: string;
  description: string;
}

export interface RTFTriggerResult {
  submissionType: string;
  checklist: RTFCheckItem[];
  triggers: Array<{
    trigger: string;
    frequency: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  totalChecklistItems: number;
  requiredItems: number;
}

// ── EMA Pattern Types ───────────────────────────────────────────────────

export interface EMAQuestionPattern {
  phase: 'Day 120' | 'Day 180';
  category: string;
  severity: 'major_objection' | 'other_concern';
  pattern: string;
  therapeuticAreas: string[];
  frequency: number;
  confidence: number;
}

export interface EMAPatternResult {
  submissionType: string;
  therapeuticArea: string;
  day120Questions: EMAQuestionPattern[];
  day180Questions: EMAQuestionPattern[];
  majorObjectionCount: number;
  otherConcernCount: number;
}

// ── Advisory Committee Types ────────────────────────────────────────────

export interface AdvisoryCommitteeResult {
  submissionType: string;
  overallAdcomRisk: 'low' | 'medium' | 'high';
  triggers: Array<{
    trigger: string;
    probability: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
  totalTriggers: number;
  highProbabilityTriggers: number;
  votingInsights: string[];
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const precedentKeys = {
  all: ['precedent-engine'] as const,
  search: (params: SearchParams) => [...precedentKeys.all, 'search', params] as const,
  risk: (params: RiskParams) => [...precedentKeys.all, 'risk', params] as const,
  strategy: (params: StrategyParams) => [...precedentKeys.all, 'strategy', params] as const,
  crlTriggers: (params: RiskParams) => [...precedentKeys.all, 'crl-triggers', params] as const,
  rtfTriggers: (params: RiskParams) => [...precedentKeys.all, 'rtf-triggers', params] as const,
  emaPatterns: (params: RiskParams) => [...precedentKeys.all, 'ema-patterns', params] as const,
  advisoryCommittee: (params: RiskParams) => [...precedentKeys.all, 'advisory-committee', params] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Search regulatory precedents — cached, auto-refetches on param change */
export function usePrecedentSearch(params: SearchParams | null) {
  return useQuery({
    queryKey: precedentKeys.search(params!),
    queryFn: async (): Promise<PrecedentRecord[]> => {
      const res = await apiRequest('POST', `${BASE}/search`, params);
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
      const res = await apiRequest('POST', `${BASE}/compare`, params);
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
      const res = await apiRequest('POST', `${BASE}/risk`, params);
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
      const res = await apiRequest('POST', `${BASE}/strategy`, params);
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
      const res = await apiRequest('POST', `${BASE}/check-claim`, params);
      const json = await res.json();
      return json.data;
    },
  });
}

/** CRL trigger pattern analysis */
export function useCRLTriggers(params: RiskParams | null) {
  return useQuery({
    queryKey: precedentKeys.crlTriggers(params!),
    queryFn: async (): Promise<CRLTriggerResult> => {
      const res = await apiRequest('POST', `${BASE}/crl-triggers`, params);
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}

/** RTF trigger pattern analysis */
export function useRTFTriggers(params: RiskParams | null) {
  return useQuery({
    queryKey: precedentKeys.rtfTriggers(params!),
    queryFn: async (): Promise<RTFTriggerResult> => {
      const res = await apiRequest('POST', `${BASE}/rtf-triggers`, params);
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}

/** EMA Day 120/180 question pattern analysis */
export function useEMAPatterns(params: RiskParams | null) {
  return useQuery({
    queryKey: precedentKeys.emaPatterns(params!),
    queryFn: async (): Promise<EMAPatternResult> => {
      const res = await apiRequest('POST', `${BASE}/ema-patterns`, params);
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}

/** Advisory Committee risk analysis */
export function useAdvisoryCommittee(params: RiskParams | null) {
  return useQuery({
    queryKey: precedentKeys.advisoryCommittee(params!),
    queryFn: async (): Promise<AdvisoryCommitteeResult> => {
      const res = await apiRequest('POST', `${BASE}/advisory-committee`, params);
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 5 * 60 * 1000,
  });
}
