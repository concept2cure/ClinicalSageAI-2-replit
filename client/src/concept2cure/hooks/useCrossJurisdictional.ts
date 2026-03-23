/**
 * Cross-Jurisdictional Intelligence React Hooks
 * @module concept2cure/hooks/useCrossJurisdictional
 */

import { useQuery } from '@tanstack/react-query';

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

const BASE = '/api/cross-jurisdictional';

export interface JurisdictionParams {
  submissionType: string;
  therapeuticArea?: string;
  indication?: string;
  targetAgencies?: string[];
  productType?: string;
}

export interface DivergenceItem {
  domain: 'clinical' | 'cmc' | 'safety' | 'labeling' | 'regulatory_pathway';
  topic: string;
  agencies: Array<{ agency: string; position: string; guidanceRef?: string }>;
  divergenceLevel: 'aligned' | 'minor' | 'significant' | 'incompatible';
  harmonizationGuidance: string;
  ichReference?: string;
}

export interface ReliancePathway {
  name: string;
  referenceAgency: string;
  relyingAgencies: string[];
  applicableSubmissionTypes: string[];
  timelineSavings: string;
  requirements: string[];
  limitations: string[];
}

export interface FilingSequenceOption {
  sequence: string[];
  rationale: string;
  totalTimeline: string;
  riskLevel: 'low' | 'medium' | 'high';
  advantages: string[];
  disadvantages: string[];
}

export interface HarmonizationFramework {
  name: string;
  description: string;
  memberAgencies: string[];
  applicableTo: string[];
  benefits: string[];
  requirements: string[];
}

export interface CrossJurisdictionalResult {
  submissionType: string;
  targetAgencies: string[];
  divergences: DivergenceItem[];
  reliancePathways: ReliancePathway[];
  filingSequences: FilingSequenceOption[];
  harmonizationFrameworks: HarmonizationFramework[];
  summary: {
    totalDivergences: number;
    significantDivergences: number;
    availablePathways: number;
    recommendedSequence: string;
  };
}

export const crossJurisdictionalKeys = {
  all: ['cross-jurisdictional'] as const,
  analyze: (params: JurisdictionParams) => [...crossJurisdictionalKeys.all, 'analyze', params] as const,
};

export function useCrossJurisdictionalAnalysis(params: JurisdictionParams | null) {
  return useQuery({
    queryKey: crossJurisdictionalKeys.analyze(params!),
    queryFn: async (): Promise<CrossJurisdictionalResult> => {
      const res = await fetch(`${BASE}/analyze`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Cross-jurisdictional analysis failed');
      const json = await res.json();
      return json.data;
    },
    enabled: !!params?.submissionType,
    staleTime: 10 * 60 * 1000,
  });
}
