/**
 * RBM Central Statistical Monitoring (CSM) — a deterministic, unsupervised
 * cross-site outlier engine inspired by CluePoints' SMART approach.
 *
 * Premise (ICH E6(R3) central monitoring): site-level data should be broadly
 * comparable, so a site whose metric deviates sharply from the study cohort is
 * a candidate risk. We score each site against the cohort distribution with a
 * robust modified z-score (median + MAD, Iglewicz–Hoaglin), falling back to the
 * classic mean/SD z-score when the MAD is degenerate. No distributional
 * assumptions, no user thresholds — the data picks the outliers.
 *
 * Pure functions (no I/O, no LLM); the route/AnA layers feed in site metrics and
 * persist the resulting signals.
 *
 * @module server/services/rbm/central-statistical-monitoring
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Minimum cohort size for the statistics to be meaningful. */
export const MIN_COHORT = 5;

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface OutlierScore {
  index: number;
  value: number;
  /** Robust score (modified z) where available, else classic z, or the mean-absolute-deviation form when asked. */
  score: number;
  method: 'modified_z' | 'z' | 'modified_z_meanad';
}

/**
 * Score each value against the cohort. Returns one score per input value.
 * Uses the modified z-score (0.6745·(x−median)/MAD); when MAD is 0 (e.g. many
 * tied values) it falls back to the standard z-score. Empty / degenerate input
 * yields zero scores.
 */
export function scoreCohort(values: number[], options: { whenTied?: 'z' | 'mean_absolute_deviation' } = {}): OutlierScore[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const absDev = values.map(v => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = median(absDev);

  if (mad > 0) {
    return values.map((v, i) => ({
      index: i,
      value: v,
      score: Math.round((0.6745 * (v - med)) / mad * 1000) / 1000,
      method: 'modified_z' as const,
    }));
  }

  // MAD degenerate (more than half the values equal the median). Iglewicz and Hoaglin's form for this case uses the
  // mean absolute deviation about the median: (x - median) / (1.253314 * MeanAD). Asked for by the cross-site
  // indicator scan, where ties are the rule (most sites read the same low count). The classic z below cannot exceed
  // (n-1)/sqrt(n), which is under the 3.5 threshold for every cohort smaller than 15.
  if (options.whenTied === 'mean_absolute_deviation') {
    const meanAd = absDev.reduce((a, b) => a + b, 0) / n;
    return values.map((v, i) => ({
      index: i, value: v,
      score: meanAd > 0 ? Math.round(((v - med) / (1.253314 * meanAd)) * 1000) / 1000 : 0,
      method: 'modified_z_meanad' as const,
    }));
  }

  // MAD degenerate → classic z-score.
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return values.map((v, i) => ({
    index: i,
    value: v,
    score: sd > 0 ? Math.round((v - mean) / sd * 1000) / 1000 : 0,
    method: 'z' as const,
  }));
}

/** Map an absolute outlier score to a signal severity (Iglewicz–Hoaglin: 3.5 = outlier). */
export function severityFromScore(absScore: number): Severity | null {
  if (absScore >= 5) return 'critical';
  if (absScore >= 4.5) return 'high';
  if (absScore >= 3.5) return 'medium';
  return null;
}

export interface SiteMetric {
  siteId: string | null;
  siteNumber: string | null;
  /** higher = worse (risk), so a high positive outlier is the concern. */
  metrics: Record<string, number | null>;
}

export interface SiteOutlierFinding {
  siteId: string | null;
  siteNumber: string | null;
  dimension: string;
  value: number;
  score: number;
  severity: Severity;
}

/**
 * Run CSM across a cohort of sites and one or more risk dimensions. For each
 * dimension we score the present values and flag high-side outliers (a site
 * markedly *riskier* than its peers). Returns one finding per flagged
 * site×dimension. Cohorts below MIN_COHORT return [] (too few sites to judge).
 */
export function detectSiteOutliers(
  sites: SiteMetric[],
  dimensions: string[] = ['composite', 'enrollment', 'quality', 'operational'],
): SiteOutlierFinding[] {
  const findings: SiteOutlierFinding[] = [];
  for (const dim of dimensions) {
    const present = sites
      .map((s, i) => ({ i, v: s.metrics[dim] }))
      .filter((x): x is { i: number; v: number } => typeof x.v === 'number' && Number.isFinite(x.v));
    if (present.length < MIN_COHORT) continue;

    const scores = scoreCohort(present.map(p => p.v));
    for (let k = 0; k < present.length; k++) {
      const sc = scores[k];
      if (sc.score <= 0) continue; // only high-side (worse-than-peers) outliers
      const severity = severityFromScore(Math.abs(sc.score));
      if (!severity) continue;
      const site = sites[present[k].i];
      findings.push({
        siteId: site.siteId,
        siteNumber: site.siteNumber,
        dimension: dim,
        value: present[k].v,
        score: sc.score,
        severity,
      });
    }
  }
  // Most severe first.
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || b.score - a.score);
}

// ── Cross-site scan of the study's own indicator readings ─────────────────────

/** One site of a snapshot scored from the study's site-level indicators, with the readings it records. */
export interface SiteIndicatorCohortRow {
  siteId: string | null;
  siteNumber: string | null;
  indicators: { kriName: string; value: number; unit?: string | null; direction?: 'higher_worse' | 'lower_worse' }[];
}

export interface SiteIndicatorFinding extends SiteOutlierFinding {
  unit: string | null;
  direction: 'higher_worse' | 'lower_worse';
  /** The median of the indicator's readings across the sites that have one. */
  cohortMedian: number;
  /** How many sites had a reading of this indicator. */
  cohortSize: number;
}

/**
 * Scan each indicator across the study's sites, in the indicator's own direction, and flag the site that is markedly
 * worse than its peers. The dimension is the indicator's name and `value` is the reading as recorded.
 *
 * This is what a snapshot scored from the study's site-level indicators is scanned on (site-risk-engine.ts). Its
 * composite is a three-level roll-up of the same readings: with most sites green it ties at 0, the MAD is 0, and the
 * classic z scoreCohort then falls back to cannot reach 3.5 in a cohort under 15 (its maximum is (n-1)/sqrt(n)),
 * so no site could ever be flagged. The readings themselves have the spread a cross-site comparison needs. No limit
 * is needed: an indicator with no amber or red configured is still compared. A site better than its peers is not a
 * finding. An indicator read at fewer than MIN_COHORT sites is not scanned. Where most sites tie (a count that is
 * usually the same low number) the MAD is 0, and the score takes Iglewicz and Hoaglin's mean-absolute-deviation form.
 */
export function detectSiteIndicatorOutliers(sites: SiteIndicatorCohortRow[]): SiteIndicatorFinding[] {
  const names = [...new Set(sites.flatMap((s) => s.indicators.map((i) => i.kriName)))];
  const findings: SiteIndicatorFinding[] = [];
  for (const name of names) {
    const present = sites.flatMap((s) => {
      const reading = s.indicators.find((i) => i.kriName === name);
      return reading && Number.isFinite(reading.value) ? [{ site: s, reading }] : [];
    });
    if (present.length < MIN_COHORT) continue;
    const direction = present[0].reading.direction === 'lower_worse' ? 'lower_worse' as const : 'higher_worse' as const;
    // Scored so that a high positive score is the concern, whichever way the indicator runs.
    const worseIsHigh = direction === 'higher_worse' ? 1 : -1;
    const scores = scoreCohort(present.map((p) => p.reading.value * worseIsHigh), { whenTied: 'mean_absolute_deviation' });
    const cohortMedian = median(present.map((p) => p.reading.value).sort((a, b) => a - b));
    present.forEach((p, k) => {
      const severity = scores[k].score > 0 ? severityFromScore(scores[k].score) : null;
      if (!severity) return;
      findings.push({
        siteId: p.site.siteId, siteNumber: p.site.siteNumber, dimension: name, value: p.reading.value,
        score: scores[k].score, severity, unit: p.reading.unit ?? null, direction, cohortMedian, cohortSize: present.length,
      });
    });
  }
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || b.score - a.score || a.dimension.localeCompare(b.dimension));
}

// ── Patient Profiles (CluePoints-style patient-level anomaly detection) ────────

export interface PatientMetric {
  subjectId: string;
  siteId: string | null;
  metrics: Record<string, number | null>;
}

export type PatientStatus = 'normal' | 'review' | 'flagged';

/**
 * One dimension's contribution to a patient's anomaly score. Signed, because the
 * direction is the finding: an AE count 4 sigma BELOW the cohort is
 * under-reporting, one 4 sigma above may be a genuinely sick patient, and an
 * absolute value alone cannot tell a monitor which they are looking at.
 */
export interface PatientDimensionScore {
  dimension: string;
  z: number;
}

export interface PatientAnomaly {
  subjectId: string;
  siteId: string | null;
  anomalyScore: number;       // max |robust z| across dimensions
  topDimension: string | null;
  status: PatientStatus;
  /**
   * Every dimension the patient was scorable on, most extreme first. This is the
   * explanation of the score: a flag reading "4.8, top dimension: query rate" is
   * not actionable on its own, and a monitor cannot tell a single bad dimension
   * from a patient who is atypical across the board without it. Dimensions the
   * cohort was too small to score (< MIN_COHORT) are absent rather than zero —
   * "not comparable" is not "typical".
   */
  dimensions: PatientDimensionScore[];
}

/** Patient anomaly status from an absolute aggregate score. */
export function patientStatusFromScore(absScore: number): PatientStatus {
  if (absScore >= 4.5) return 'flagged';
  if (absScore >= 3.5) return 'review';
  return 'normal';
}

/**
 * Score a patient cohort: for each numeric metric present across >= MIN_COHORT
 * patients, score every patient against the cohort; a patient's anomaly score is
 * the largest |robust z| across dimensions (atypical in EITHER direction — the
 * CluePoints Patient-Profiles idea). Returns one entry per patient.
 */
export function scorePatientCohort(patients: PatientMetric[]): PatientAnomaly[] {
  const dims = new Set<string>();
  for (const p of patients) for (const k of Object.keys(p.metrics)) dims.add(k);

  const best = patients.map(() => ({ score: 0, dim: null as string | null }));
  // The per-dimension breakdown, kept rather than discarded: it is the only thing
  // that makes a score explainable, and it costs nothing here because every z is
  // already computed on the way to finding the maximum.
  const breakdown: PatientDimensionScore[][] = patients.map(() => []);
  for (const dim of dims) {
    const present = patients
      .map((p, i) => ({ i, v: p.metrics[dim] }))
      .filter((x): x is { i: number; v: number } => typeof x.v === 'number' && Number.isFinite(x.v));
    if (present.length < MIN_COHORT) continue;
    const scores = scoreCohort(present.map(p => p.v));
    for (let k = 0; k < present.length; k++) {
      const z = scores[k].score;
      const abs = Math.abs(z);
      const i = present[k].i;
      breakdown[i].push({ dimension: dim, z: Math.round(z * 1000) / 1000 });
      const slot = best[i];
      if (abs > Math.abs(slot.score)) { slot.score = z; slot.dim = dim; }
    }
  }

  return patients.map((p, i) => ({
    subjectId: p.subjectId,
    siteId: p.siteId,
    anomalyScore: Math.round(Math.abs(best[i].score) * 1000) / 1000,
    topDimension: best[i].dim,
    status: patientStatusFromScore(Math.abs(best[i].score)),
    // Most extreme first, so the reason for the flag reads off the top of the list.
    dimensions: breakdown[i].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)),
  }));
}
