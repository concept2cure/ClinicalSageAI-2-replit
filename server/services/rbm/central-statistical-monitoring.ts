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
  /** Robust score (modified z) where available, else classic z. */
  score: number;
  method: 'modified_z' | 'z';
}

/**
 * Score each value against the cohort. Returns one score per input value.
 * Uses the modified z-score (0.6745·(x−median)/MAD); when MAD is 0 (e.g. many
 * tied values) it falls back to the standard z-score. Empty / degenerate input
 * yields zero scores.
 */
export function scoreCohort(values: number[]): OutlierScore[] {
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

// ── Patient Profiles (CluePoints-style patient-level anomaly detection) ────────

export interface PatientMetric {
  subjectId: string;
  siteId: string | null;
  metrics: Record<string, number | null>;
}

export type PatientStatus = 'normal' | 'review' | 'flagged';

export interface PatientAnomaly {
  subjectId: string;
  siteId: string | null;
  anomalyScore: number;       // max |robust z| across dimensions
  topDimension: string | null;
  status: PatientStatus;
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
  for (const dim of dims) {
    const present = patients
      .map((p, i) => ({ i, v: p.metrics[dim] }))
      .filter((x): x is { i: number; v: number } => typeof x.v === 'number' && Number.isFinite(x.v));
    if (present.length < MIN_COHORT) continue;
    const scores = scoreCohort(present.map(p => p.v));
    for (let k = 0; k < present.length; k++) {
      const abs = Math.abs(scores[k].score);
      const slot = best[present[k].i];
      if (abs > Math.abs(slot.score)) { slot.score = scores[k].score; slot.dim = dim; }
    }
  }

  return patients.map((p, i) => ({
    subjectId: p.subjectId,
    siteId: p.siteId,
    anomalyScore: Math.round(Math.abs(best[i].score) * 1000) / 1000,
    topDimension: best[i].dim,
    status: patientStatusFromScore(Math.abs(best[i].score)),
  }));
}
