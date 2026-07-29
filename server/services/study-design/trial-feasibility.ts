/**
 * Operational trial-feasibility model — empirical, evidence-grounded.
 *
 * Given a set of comparable registered trials (from ClinicalTrials.gov), this
 * computes the OPERATIONAL feasibility signals for a planned study from observed
 * base rates — never a fabricated probability:
 *
 *   - completion vs discontinuation rate among trials that reached a terminal
 *     state, each with a Wilson 95% confidence interval;
 *   - the realised enrollment distribution (median / IQR) of completed trials;
 *   - competitive density (how many comparable trials are actively recruiting);
 *   - sponsor breadth; and median observed duration where dates allow.
 *
 * It is deliberately distinct from the statistical probability-of-success twin
 * (`study-twin-service`), which answers "will the endpoint hit?"; this answers
 * "can the trial be run — recruited, completed, against how much competition?".
 *
 * NO FABRICATION. Every figure is a count-based statistic over the supplied
 * comparators. When too few trials have reached a terminal state to support a
 * rate (`MIN_RESOLVED`), the rate is reported as null with an
 * `insufficient_evidence` verdict rather than an invented number. The model is
 * pure and deterministic; the comparator set is fetched separately so this is
 * unit-testable with no network.
 *
 * @module server/services/study-design/trial-feasibility
 */

/** Minimal comparator shape (a subset of the ClinicalTrials.gov trial record). */
export interface TrialComparator {
  status: string;
  enrollment: number | null;
  phase?: string;
  sponsor?: string;
  startDate?: string | null;
  completionDate?: string | null;
}

export type FeasibilityVerdict = 'favorable' | 'moderate' | 'challenging' | 'insufficient_evidence';

export interface RateWithInterval {
  rate: number;
  ci95: [number, number];
  /** Numerator / denominator the rate was computed from. */
  of: { count: number; total: number };
}

export interface EnrollmentStats {
  n: number;
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

export interface TrialFeasibilityResult {
  verdict: FeasibilityVerdict;
  comparatorsAnalyzed: number;
  statusCounts: Record<string, number>;
  /** Trials that reached a terminal state (completed / terminated / withdrawn / suspended). */
  resolved: number;
  completionRate: RateWithInterval | null;
  discontinuationRate: RateWithInterval | null;
  /** Enrollment distribution among completed trials with a recorded enrollment. */
  enrollment: EnrollmentStats | null;
  /** Count of comparable trials currently recruiting / active — the competitive field. */
  activeCompetitors: number;
  /** Distinct sponsors among the comparators. */
  distinctSponsors: number;
  /** Median observed duration (months) of completed trials with start+completion dates. */
  medianDurationMonths: number | null;
  /** Plain-language findings and explicit caveats. */
  findings: string[];
  caveats: string[];
}

const MIN_RESOLVED = 5;
const Z95 = 1.959963984540054;

const COMPLETED = new Set(['completed']);
const DISCONTINUED = new Set(['terminated', 'withdrawn', 'suspended']);
const ACTIVE = new Set([
  'recruiting',
  'active_not_recruiting',
  'enrolling_by_invitation',
  'not_yet_recruiting',
]);

function normStatus(s: string): string {
  return (s || '').toLowerCase().replace(/[\s-]+/g, '_').trim();
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(successes: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 0];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [clamp01(center - half), clamp01(center + half)];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function round(x: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

function monthsBetween(start: string, end: string): number | null {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / (1000 * 60 * 60 * 24 * 30.4375);
}

/**
 * Compute operational feasibility from a comparator set. Pure and deterministic.
 */
export function assessFeasibility(comparators: TrialComparator[]): TrialFeasibilityResult {
  const statusCounts: Record<string, number> = {};
  let completed = 0;
  let discontinued = 0;
  let active = 0;
  const completedEnrollments: number[] = [];
  const durations: number[] = [];
  const sponsors = new Set<string>();

  for (const c of comparators) {
    const s = normStatus(c.status);
    statusCounts[s] = (statusCounts[s] || 0) + 1;
    if (c.sponsor) sponsors.add(c.sponsor.trim().toLowerCase());
    if (COMPLETED.has(s)) {
      completed++;
      if (typeof c.enrollment === 'number' && c.enrollment > 0) completedEnrollments.push(c.enrollment);
      if (c.startDate && c.completionDate) {
        const d = monthsBetween(c.startDate, c.completionDate);
        if (d != null) durations.push(d);
      }
    } else if (DISCONTINUED.has(s)) {
      discontinued++;
    } else if (ACTIVE.has(s)) {
      active++;
    }
  }

  const resolved = completed + discontinued;
  const findings: string[] = [];
  const caveats: string[] = [
    'Rates are over registered comparators only; ClinicalTrials.gov status can lag and registration is incomplete for some regions.',
    'Comparators are selected by the search query — a broader or narrower query changes the base rates.',
  ];

  let completionRate: RateWithInterval | null = null;
  let discontinuationRate: RateWithInterval | null = null;
  let verdict: FeasibilityVerdict;

  if (resolved < MIN_RESOLVED) {
    verdict = 'insufficient_evidence';
    findings.push(
      `Only ${resolved} comparable trial${resolved === 1 ? '' : 's'} reached a terminal state — too few to estimate a completion rate; treat any operational read as qualitative.`
    );
  } else {
    completionRate = {
      rate: round(completed / resolved),
      ci95: wilsonInterval(completed, resolved).map(v => round(v)) as [number, number],
      of: { count: completed, total: resolved },
    };
    discontinuationRate = {
      rate: round(discontinued / resolved),
      ci95: wilsonInterval(discontinued, resolved).map(v => round(v)) as [number, number],
      of: { count: discontinued, total: resolved },
    };
    const cr = completionRate.rate;
    verdict = cr >= 0.8 ? 'favorable' : cr >= 0.6 ? 'moderate' : 'challenging';
    findings.push(
      `${completed} of ${resolved} resolved comparable trials completed (${(cr * 100).toFixed(0)}%, 95% CI ${(completionRate.ci95[0] * 100).toFixed(0)}–${(completionRate.ci95[1] * 100).toFixed(0)}%).`
    );
    if (discontinuationRate.rate >= 0.3) {
      findings.push(
        `A high discontinuation rate (${(discontinuationRate.rate * 100).toFixed(0)}%) among comparators — investigate common failure modes (recruitment, safety, futility) before committing.`
      );
    }
  }

  let enrollment: EnrollmentStats | null = null;
  if (completedEnrollments.length > 0) {
    const sorted = [...completedEnrollments].sort((a, b) => a - b);
    enrollment = {
      n: sorted.length,
      median: round(quantile(sorted, 0.5), 0),
      p25: round(quantile(sorted, 0.25), 0),
      p75: round(quantile(sorted, 0.75), 0),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
    findings.push(
      `Completed comparators enrolled a median of ${enrollment.median} participants (IQR ${enrollment.p25}–${enrollment.p75}).`
    );
  }

  if (active > 0) {
    findings.push(
      `${active} comparable trial${active === 1 ? ' is' : 's are'} currently active/recruiting — a competitive recruitment field to account for in site and enrollment planning.`
    );
  }

  const medianDurationMonths =
    durations.length > 0 ? round(quantile([...durations].sort((a, b) => a - b), 0.5), 1) : null;
  if (medianDurationMonths != null) {
    findings.push(`Median observed duration of completed comparators: ${medianDurationMonths} months.`);
  }

  return {
    verdict,
    comparatorsAnalyzed: comparators.length,
    statusCounts,
    resolved,
    completionRate,
    discontinuationRate,
    enrollment,
    activeCompetitors: active,
    distinctSponsors: sponsors.size,
    medianDurationMonths,
    findings,
    caveats,
  };
}
