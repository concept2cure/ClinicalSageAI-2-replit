/**
 * Submission-readiness aggregator.
 *
 * The platform has standalone per-domain assessors (substantial equivalence,
 * analytical/clinical performance, §524B cybersecurity, human factors, UDI/GUDID,
 * SaMD, IVDR performance evaluation, companion diagnostics, SPL labeling,
 * post-market planning). This capstone composes the domains that apply to a
 * chosen regulatory pathway into the mean completeness of the domains that were
 * assessed, a completeness verdict, the domains not assessed, and a prioritized
 * gap list. It is completeness of what was assessed, not a readiness finding.
 *
 * Pure and deterministic. It consumes per-domain completeness figures (0–1) that
 * the individual assessors produce; it does not re-derive them. 2026-10-15: a
 * domain with no figure was scored 0 and the mean was called the overall
 * readiness score, with a 'ready' / 'nearly-ready' / 'not-ready' verdict.
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
  /**
   * Per-domain completeness in [0,1], as its assessor computed it. A required domain
   * with no figure is not assessed: excluded and named in `notAssessedDomains`.
   */
  domainScores: Partial<Record<ReadinessDomain, number>>;
  /** A domain at/above this score is considered complete. Default 1. */
  completeThreshold?: number;
}

export interface DomainReadiness {
  domain: ReadinessDomain;
  score: number;
  complete: boolean;
}

/**
 * Over the required domains: 'complete' when every one was assessed and is complete;
 * 'nearly-complete' when every one was assessed and the mean is ≥ 0.8; 'incomplete'
 * when an assessed one is incomplete otherwise; 'not-assessed' when none assessed is
 * incomplete but some required domain was not assessed.
 */
export type CompletenessVerdict = 'complete' | 'nearly-complete' | 'incomplete' | 'not-assessed';

export interface SubmissionReadinessResult {
  pathway: SubmissionPathway;
  /** Mean completeness (0–1) of the assessed required domains only; null when none was assessed. Not readiness. */
  assessedDomainCompleteness: number | null;
  verdict: CompletenessVerdict;
  /** The assessed required domains. */
  perDomain: DomainReadiness[];
  /** Required domains with no figure: not assessed, not scored 0. */
  notAssessedDomains: ReadinessDomain[];
  /** Assessed domains that are incomplete, lowest score first — the prioritized work list. */
  prioritizedGaps: DomainReadiness[];
  requiredDomains: ReadinessDomain[];
  framework: 'Concept2Cure submission-readiness';
}

/** Compose per-domain completeness into the completeness of a pathway's assessed domains. */
export function assessSubmissionReadiness(
  input: SubmissionReadinessInput
): SubmissionReadinessResult {
  const required = PATHWAY_DOMAINS[input.pathway];
  if (!required) throw new Error(`Unknown submission pathway: ${input.pathway}`);
  const threshold = input.completeThreshold ?? 1;

  const perDomain: DomainReadiness[] = [];
  const notAssessedDomains: ReadinessDomain[] = [];
  for (const domain of required) {
    const raw = input.domainScores[domain];
    if (typeof raw !== 'number') {
      notAssessedDomains.push(domain);
      continue;
    }
    if (raw < 0 || raw > 1) throw new Error(`Domain score for ${domain} must be in [0,1].`);
    perDomain.push({ domain, score: raw, complete: raw >= threshold });
  }

  const assessedDomainCompleteness =
    perDomain.length > 0 ? perDomain.reduce((s, d) => s + d.score, 0) / perDomain.length : null;
  const prioritizedGaps = perDomain
    .filter(d => !d.complete)
    .sort((a, b) => a.score - b.score || a.domain.localeCompare(b.domain));

  const allAssessed = notAssessedDomains.length === 0;
  let verdict: CompletenessVerdict;
  if (prioritizedGaps.length === 0) verdict = allAssessed ? 'complete' : 'not-assessed';
  else if (allAssessed && assessedDomainCompleteness !== null && assessedDomainCompleteness >= 0.8) verdict = 'nearly-complete';
  else verdict = 'incomplete';

  return {
    pathway: input.pathway,
    assessedDomainCompleteness,
    verdict,
    perDomain,
    notAssessedDomains,
    prioritizedGaps,
    requiredDomains: required,
    framework: 'Concept2Cure submission-readiness',
  };
}
