/**
 * RBM engine — deterministic scoring + RACT/KRI/QTL seed libraries.
 *
 * Pure functions (no I/O, no LLM) so the same logic backs the API routes
 * (server/routes/mdx-rbm.ts), the site-risk engine, and the AnA tools
 * (run_rbm_assessment, evaluate_kris_qtls). Aligned to ICH E6(R3) risk-based
 * quality management and ICH E8(R1) Quality-by-Design / Critical-to-Quality
 * (CtQ) factors. Default catalogs follow the TransCelerate RACT model.
 *
 * @module server/services/rbm/rbm-engine
 */

export type RiskBand = 'low' | 'medium' | 'high';
export type KriStatus = 'green' | 'amber' | 'red';
export type QtlStatus = 'within' | 'approaching' | 'breached';
export type MonitoringTier = 'reduced' | 'standard' | 'enhanced';
export type KriDirection = 'higher_worse' | 'lower_worse';

/** Risk score = likelihood × impact (each 1..5), banded per RACT convention. */
export function scoreRisk(likelihood: number, impact: number): { score: number; band: RiskBand } {
  const l = clamp1to5(likelihood);
  const i = clamp1to5(impact);
  const score = l * i;
  return { score, band: bandFromScore(score) };
}

export function bandFromScore(score: number): RiskBand {
  if (score >= 15) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}

function clamp1to5(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Roll a set of risk-item scores up to a program-level overall risk level. */
export function overallRiskFromScores(scores: number[]): RiskBand {
  if (scores.length === 0) return 'low';
  const high = scores.filter(s => s >= 15).length;
  const medium = scores.filter(s => s >= 8 && s < 15).length;
  if (high > 0) return 'high';
  if (medium >= 2) return 'high';
  if (medium > 0) return 'medium';
  return 'low';
}

/**
 * KRI status from current value against amber/red thresholds. `direction`
 * captures whether a higher or a lower value is worse.
 */
export function kriStatus(
  value: number | null | undefined,
  amber: number | null | undefined,
  red: number | null | undefined,
  direction: KriDirection = 'higher_worse',
): KriStatus {
  if (value == null) return 'green';
  const worseAbove = direction === 'higher_worse';
  const breach = (threshold: number | null | undefined) => {
    if (threshold == null) return false;
    return worseAbove ? value >= threshold : value <= threshold;
  };
  if (breach(red)) return 'red';
  if (breach(amber)) return 'amber';
  return 'green';
}

/**
 * QTL status. A breach is value beyond the primary threshold; "approaching" is
 * beyond the secondary (early-warning) limit, conventionally 50–75% of the
 * primary per TransCelerate. Assumes a higher value is worse.
 */
export function qtlStatus(
  value: number | null | undefined,
  threshold: number | null | undefined,
  secondaryLimit: number | null | undefined,
): QtlStatus {
  if (value == null || threshold == null) return 'within';
  if (value >= threshold) return 'breached';
  if (secondaryLimit != null && value >= secondaryLimit) return 'approaching';
  return 'within';
}

/**
 * Map a composite site-risk score (0–100, higher = riskier) to a monitoring
 * tier. Risk-proportionate per ICH E6(R3): higher risk → more oversight.
 */
export function monitoringTierFromRisk(compositeRisk: number): MonitoringTier {
  if (compositeRisk >= 60) return 'enhanced';
  if (compositeRisk >= 30) return 'standard';
  return 'reduced';
}

// ── Seed libraries (TransCelerate RACT model, ICH E6(R3)/E8(R1)) ──────────────

export interface CtqSeed {
  category: 'safety' | 'efficacy' | 'data_integrity' | 'compliance' | 'operational';
  ctqFactor: string;
  riskDescription: string;
  likelihood: number;
  impact: number;
  isCritical: boolean;
  mitigation: string;
}

/** Default Critical-to-Quality factors — a starting RACT a sponsor refines. */
export const DEFAULT_CTQ_FACTORS: CtqSeed[] = [
  {
    category: 'safety',
    ctqFactor: 'Serious adverse event identification and reporting',
    riskDescription: 'SAEs missed, mis-graded, or reported outside the required timeline.',
    likelihood: 3, impact: 5, isCritical: true,
    mitigation: 'Central safety review; expedited-reporting KRI; site SAE-timeliness monitoring.',
  },
  {
    category: 'safety',
    ctqFactor: 'Informed consent process and documentation',
    riskDescription: 'Consent obtained late, with a superseded version, or undocumented.',
    likelihood: 3, impact: 5, isCritical: true,
    mitigation: 'Consent-version control; first-subject consent review; reconsent tracking KRI.',
  },
  {
    category: 'efficacy',
    ctqFactor: 'Primary endpoint data collection',
    riskDescription: 'Primary endpoint measured off-window, by untrained staff, or with uncalibrated equipment.',
    likelihood: 3, impact: 5, isCritical: true,
    mitigation: 'Endpoint-specific training; central read where applicable; visit-window KRI.',
  },
  {
    category: 'data_integrity',
    ctqFactor: 'Eligibility / inclusion-exclusion verification',
    riskDescription: 'Ineligible subjects enrolled; eligibility not source-verifiable.',
    likelihood: 3, impact: 4, isCritical: true,
    mitigation: 'Eligibility KRI by site; targeted SDV of eligibility criteria; central screening review.',
  },
  {
    category: 'data_integrity',
    ctqFactor: 'Investigational product accountability and compliance',
    riskDescription: 'IP dosing errors, accountability gaps, temperature excursions.',
    likelihood: 2, impact: 4, isCritical: true,
    mitigation: 'IP accountability KRI; dosing-error signal; temperature-excursion alerts.',
  },
  {
    category: 'compliance',
    ctqFactor: 'Protocol deviation identification and management',
    riskDescription: 'Important deviations not detected, classified, or actioned.',
    likelihood: 4, impact: 3, isCritical: false,
    mitigation: 'Deviation-rate KRI; central deviation review; QTL on important deviations.',
  },
  {
    category: 'data_integrity',
    ctqFactor: 'Data entry timeliness and query resolution',
    riskDescription: 'Stale data and aged queries delay risk detection and lock.',
    likelihood: 4, impact: 3, isCritical: false,
    mitigation: 'CRF-lag KRI; open-query-aging KRI; query-rate central monitoring.',
  },
  {
    category: 'operational',
    ctqFactor: 'Enrollment and retention performance',
    riskDescription: 'Under-enrollment or excess dropout threatens study power.',
    likelihood: 4, impact: 3, isCritical: false,
    mitigation: 'Enrollment-vs-target KRI; screen-failure-rate KRI; dropout QTL.',
  },
];

export interface KriSeed {
  name: string;
  metricDefinition: string;
  dataSource: 'edc' | 'ctms' | 'site_intel' | 'central_stats' | 'manual';
  unit: string;
  direction: KriDirection;
  thresholdAmber: number;
  thresholdRed: number;
}

/** Default KRI library — the metrics most central-monitoring programs run. */
export const DEFAULT_KRIS: KriSeed[] = [
  { name: 'SAE reporting timeliness', metricDefinition: 'Median days from SAE awareness to report', dataSource: 'edc', unit: 'days', direction: 'higher_worse', thresholdAmber: 2, thresholdRed: 5 },
  { name: 'Important protocol deviation rate', metricDefinition: 'Important deviations per enrolled subject', dataSource: 'edc', unit: 'per subject', direction: 'higher_worse', thresholdAmber: 0.5, thresholdRed: 1.0 },
  { name: 'Query rate', metricDefinition: 'Open queries per 100 CRF pages', dataSource: 'edc', unit: 'per 100 pages', direction: 'higher_worse', thresholdAmber: 10, thresholdRed: 20 },
  { name: 'Open query aging', metricDefinition: 'Median age of open queries', dataSource: 'edc', unit: 'days', direction: 'higher_worse', thresholdAmber: 14, thresholdRed: 30 },
  { name: 'CRF entry lag', metricDefinition: 'Median days from visit to data entry', dataSource: 'edc', unit: 'days', direction: 'higher_worse', thresholdAmber: 7, thresholdRed: 14 },
  { name: 'Screen failure rate', metricDefinition: 'Screen failures / screened', dataSource: 'ctms', unit: 'ratio', direction: 'higher_worse', thresholdAmber: 0.3, thresholdRed: 0.5 },
  { name: 'Dropout rate', metricDefinition: 'Early discontinuations / enrolled', dataSource: 'ctms', unit: 'ratio', direction: 'higher_worse', thresholdAmber: 0.15, thresholdRed: 0.25 },
  { name: 'Enrollment vs target', metricDefinition: 'Actual / planned enrollment to date', dataSource: 'site_intel', unit: 'ratio', direction: 'lower_worse', thresholdAmber: 0.8, thresholdRed: 0.6 },
];

export interface QtlSeed {
  parameter: string;
  rationale: string;
  threshold: number;
  /** secondary limit as a fraction of threshold (TransCelerate 0.5–0.75). */
  secondaryFraction: number;
}

/** Default study-level Quality Tolerance Limits. */
export const DEFAULT_QTLS: QtlSeed[] = [
  { parameter: 'Important protocol deviations (study-wide rate)', rationale: 'Systemic deviation excess threatens reliability of results.', threshold: 0.15, secondaryFraction: 0.66 },
  { parameter: 'Subject dropout / withdrawal rate', rationale: 'Excess attrition threatens statistical power and interpretability.', threshold: 0.2, secondaryFraction: 0.75 },
  { parameter: 'Primary-endpoint missing-data rate', rationale: 'Missing primary data biases the efficacy estimate.', threshold: 0.1, secondaryFraction: 0.5 },
  { parameter: 'Eligibility-violation rate', rationale: 'Ineligible subjects undermine the analysis population.', threshold: 0.05, secondaryFraction: 0.6 },
];

/** Default monitoring-plan actions seeded from an assessment's critical CtQs. */
export function defaultPlanStrategy(overall: RiskBand): 'centralized' | 'risk_based' | 'hybrid' {
  if (overall === 'high') return 'hybrid';
  if (overall === 'medium') return 'risk_based';
  return 'centralized';
}
