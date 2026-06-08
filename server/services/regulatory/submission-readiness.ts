/**
 * Submission-readiness aggregator.
 *
 * The platform now has a dozen standalone readiness assessors (substantial
 * equivalence, analytical/clinical performance, §524B cybersecurity, human
 * factors, UDI/GUDID, SaMD, IVDR performance evaluation, companion diagnostics,
 * SPL labeling, post-market planning). This capstone composes the domains that
 * apply to a chosen regulatory pathway into a single weighted readiness score
 * with a prioritized gap list — so a program owner gets one "is this ready?"
 * answer instead of ten.
 *
 * Pure and deterministic. It consumes per-domain readiness scores (0–1) that the
 * individual assessors produce; it does not re-derive them.
 */

export type ReadinessDomain =
  | 'substantialEquivalence'
  | 'analyticalPerformance'
  | 'clinicalPerformance'
  | 'cybersecurity'
  | 'humanFactors'
  | 'udiGudid'
  | 'samdClassification'
  | 'ivdrPerformanceEvaluation'
  | 'companionDiagnostics'
  | 'postMarketPlan'
  | 'labelingSpl';

export type SubmissionPathway = '510k' | 'ivd-510k' | 'de-novo' | 'pma' | 'cdx' | 'eu-ivdr';

/** Domains that apply to each pathway. */
export const PATHWAY_DOMAINS: Record<SubmissionPathway, ReadinessDomain[]> = {
  '510k': ['substantialEquivalence', 'cybersecurity', 'humanFactors', 'udiGudid', 'labelingSpl', 'postMarketPlan'],
  'ivd-510k': ['analyticalPerformance', 'clinicalPerformance', 'substantialEquivalence', 'udiGudid', 'postMarketPlan'],
  'de-novo': ['analyticalPerformance', 'clinicalPerformance', 'cybersecurity', 'humanFactors', 'udiGudid', 'postMarketPlan'],
  pma: ['clinicalPerformance', 'cybersecurity', 'humanFactors', 'udiGudid', 'labelingSpl', 'postMarketPlan'],
  cdx: ['companionDiagnostics', 'analyticalPerformance', 'clinicalPerformance', 'postMarketPlan'],
  'eu-ivdr': ['ivdrPerformanceEvaluation', 'analyticalPerformance', 'clinicalPerformance', 'udiGudid'],
};

export interface SubmissionReadinessInput {
  pathway: SubmissionPathway;
  /** Per-domain readiness scores in [0,1]; a missing domain is treated as 0. */
  domainScores: Partial<Record<ReadinessDomain, number>>;
  /** A domain at/above this score is considered complete. Default 1. */
  completeThreshold?: number;
}

export interface DomainReadiness {
  domain: ReadinessDomain;
  score: number;
  complete: boolean;
}

export type ReadinessVerdict = 'ready' | 'nearly-ready' | 'not-ready';

export interface SubmissionReadinessResult {
  pathway: SubmissionPathway;
  /** Mean of the applicable-domain scores. */
  overallScore: number;
  verdict: ReadinessVerdict;
  perDomain: DomainReadiness[];
  /** Incomplete domains, lowest score first — the prioritized work list. */
  prioritizedGaps: DomainReadiness[];
  requiredDomains: ReadinessDomain[];
  framework: 'Concept2Cure submission-readiness';
}

/** Compose per-domain readiness into an overall pathway readiness scorecard. */
export function assessSubmissionReadiness(
  input: SubmissionReadinessInput
): SubmissionReadinessResult {
  const required = PATHWAY_DOMAINS[input.pathway];
  if (!required) throw new Error(`Unknown submission pathway: ${input.pathway}`);
  const threshold = input.completeThreshold ?? 1;

  const perDomain: DomainReadiness[] = required.map(domain => {
    const raw = input.domainScores[domain] ?? 0;
    if (raw < 0 || raw > 1) throw new Error(`Domain score for ${domain} must be in [0,1].`);
    return { domain, score: raw, complete: raw >= threshold };
  });

  const overallScore = perDomain.reduce((s, d) => s + d.score, 0) / perDomain.length;
  const prioritizedGaps = perDomain
    .filter(d => !d.complete)
    .sort((a, b) => a.score - b.score || a.domain.localeCompare(b.domain));

  const verdict: ReadinessVerdict =
    prioritizedGaps.length === 0 ? 'ready' : overallScore >= 0.8 ? 'nearly-ready' : 'not-ready';

  return {
    pathway: input.pathway,
    overallScore,
    verdict,
    perDomain,
    prioritizedGaps,
    requiredDomains: required,
    framework: 'Concept2Cure submission-readiness',
  };
}
