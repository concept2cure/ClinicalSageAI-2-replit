/**
 * Trial-feasibility service — grounds the operational feasibility model in live
 * ClinicalTrials.gov comparators.
 *
 * Fetches comparable registered trials for a condition (+ optional intervention
 * / phase) WITHOUT a status filter — so completed and discontinued trials are
 * both captured — and feeds them to the pure `assessFeasibility` model. Returns
 * the empirical feasibility read plus a provenance record citing the query. The
 * searcher is injectable so this is unit-testable with no network.
 *
 * @module server/services/study-design/trial-feasibility-service
 */

import { searchTrials, type CtgovSearchResult } from '../integrations/clinicaltrials-client.js';
import { assessFeasibility, type TrialFeasibilityResult } from './trial-feasibility.js';
import { buildProvenance, type ProvenanceRecord } from '../evidence/provenance.js';

export interface TrialFeasibilityRequest {
  condition: string;
  intervention?: string;
  phase?: string;
  /** Max comparators to analyze (1–200, default 100). */
  maxComparators?: number;
}

export interface TrialFeasibilityServiceResult extends TrialFeasibilityResult {
  source: 'ClinicalTrials.gov';
  query: { condition: string; intervention?: string; phase?: string };
  /** Total registered trials matching the query (may exceed comparatorsAnalyzed). */
  totalMatched: number;
  provenance: ProvenanceRecord[];
}

export type TrialSearcher = (params: {
  condition?: string;
  intervention?: string;
  phase?: string;
  pageSize?: number;
}) => Promise<CtgovSearchResult>;

/**
 * Assess operational feasibility for a planned trial from live CT.gov comparators.
 * Throws on a network/HTTP error so the caller can degrade gracefully.
 */
export async function assessTrialFeasibility(
  req: TrialFeasibilityRequest,
  search: TrialSearcher = searchTrials
): Promise<TrialFeasibilityServiceResult> {
  const condition = (req.condition || '').trim();
  if (!condition) throw new Error('A condition is required to assess trial feasibility.');
  const pageSize = Math.min(Math.max(Math.trunc(req.maxComparators ?? 100), 1), 200);

  const result = await search({
    condition,
    intervention: req.intervention?.trim() || undefined,
    phase: req.phase?.trim() || undefined,
    pageSize,
  });

  const comparators = result.trials.map(t => ({
    status: t.status,
    enrollment: t.enrollment,
    phase: t.phase,
    sponsor: t.sponsor,
    startDate: t.startDate,
    completionDate: t.completionDate,
  }));

  const assessment = assessFeasibility(comparators);
  const queryLabel = [condition, req.intervention, req.phase].filter(Boolean).join(' · ');

  return {
    ...assessment,
    source: 'ClinicalTrials.gov',
    query: { condition, intervention: req.intervention?.trim() || undefined, phase: req.phase?.trim() || undefined },
    totalMatched: result.totalCount,
    provenance: [
      buildProvenance({
        sourceId: 'clinicaltrials',
        citation: {
          title: `Feasibility base rates from ${assessment.comparatorsAnalyzed} comparable trials — ${queryLabel}`,
          identifier: null,
          url: `https://clinicaltrials.gov/search?cond=${encodeURIComponent(condition)}`,
        },
        query: queryLabel,
        confidence: assessment.verdict === 'insufficient_evidence' ? 'low' : 'moderate',
        extraCaveats: assessment.caveats,
      }),
    ],
  };
}
