/**
 * BLA 351(a) — manufacturing comparability engine (ICH Q5E).
 *
 * Assesses whether a biologic produced after a manufacturing change
 * (process, site, scale, formulation, cell bank, …) is comparable to the
 * pre-change material, following ICH Q5E "Comparability of Biotechnological/
 * Biological Products Subject to Changes in Their Manufacturing Process".
 *
 * For each quality attribute it compares post-change lots against the
 * pre-change quality range (mean_pre ± k·σ_pre), quantifies the mean shift in
 * units of pre-change σ, and — for high-criticality attributes — runs an
 * equivalence test (EAC = ±1.5·σ_pre). It then derives the Q5E conclusion and,
 * crucially, whether analytical data alone is likely to suffice or whether
 * non-clinical / clinical bridging data is indicated — the judgment Q5E makes
 * turn on the criticality of the affected attributes and the magnitude of the
 * differences observed.
 *
 * Deterministic computation over measured lot data — not a narrative record.
 *
 * @module server/services/biologics/comparability
 */

import {
  describe,
  qualityRange,
  fractionWithin,
  tost,
  round,
  type DescriptiveStats,
} from './statistics';

export type Criticality = 'high' | 'moderate' | 'low';
export type ComparabilityVerdict =
  | 'comparable'
  | 'comparable_with_monitoring'
  | 'not_comparable'
  | 'insufficient_data';
export type ComparabilityConclusion =
  | 'comparable'
  | 'comparable_with_additional_data'
  | 'not_comparable'
  | 'insufficient_data';

export interface ComparabilityAttributeInput {
  id?: string;
  name: string;
  /** Attribute criticality — drives how much evidence comparability requires. */
  criticality: Criticality;
  unit?: string;
  /** Lot measurements before the manufacturing change. */
  preChange: number[];
  /** Lot measurements after the manufacturing change. */
  postChange: number[];
  /** SD multiplier for the quality range (default 3). */
  qualityRangeK?: number;
  /** Fraction of post-change lots required within range (default 0.90). */
  withinThreshold?: number;
  /** σ_pre multiplier for the equivalence margin on high-criticality CQAs (default 1.5). */
  eacSigmaMultiplier?: number;
}

export interface ComparabilityAttributeResult {
  id: string;
  name: string;
  criticality: Criticality;
  unit?: string;
  verdict: ComparabilityVerdict;
  rationale: string;
  preChange: DescriptiveStats;
  postChange: DescriptiveStats;
  rangeLower: number;
  rangeUpper: number;
  k: number;
  fractionWithin: number;
  /** (mean_post − mean_pre) / σ_pre — the standardized mean shift. */
  shiftInSigma: number;
  /** Present for high-criticality attributes when both arms have ≥2 lots. */
  equivalence?: {
    eac: number;
    diff: number;
    ci90Lower: number;
    ci90Upper: number;
    equivalent: boolean;
  };
}

export interface ComparabilityInput {
  changeDescription?: string;
  /** e.g. 'process' | 'site' | 'scale' | 'formulation' | 'cell_bank'. */
  changeType?: string;
  processStep?: string;
  modality?: string;
  targetAgency?: string;
  attributes: ComparabilityAttributeInput[];
}

export interface BridgingAssessment {
  analyticalSufficient: boolean;
  nonclinicalRecommended: boolean;
  clinicalRecommended: boolean;
  rationale: string;
}

export interface ComparabilityResult {
  changeDescription: string | null;
  changeType: string | null;
  modality: string | null;
  targetAgency: string | null;
  conclusion: ComparabilityConclusion;
  summary: string;
  counts: {
    total: number;
    comparable: number;
    comparableWithMonitoring: number;
    notComparable: number;
    insufficientData: number;
    byCriticality: Record<Criticality, { total: number; notComparable: number; monitoring: number }>;
  };
  flagged: string[];
  bridging: BridgingAssessment;
  attributes: ComparabilityAttributeResult[];
  recommendations: string[];
  methodology: string[];
}

const METHODOLOGY = [
  'Per attribute: quality range = mean_pre ± k·σ_pre (default k = 3); proportion of post-change lots within range.',
  'Standardized mean shift = (mean_post − mean_pre) / σ_pre.',
  'High-criticality attributes additionally tested for equivalence (EAC = ±1.5·σ_pre, 90% CI).',
  'Overall conclusion and bridging recommendation follow ICH Q5E — evidence required scales with the criticality of affected attributes and the magnitude of differences.',
];

let _autoId = 0;

export function assessComparabilityAttribute(
  input: ComparabilityAttributeInput,
): ComparabilityAttributeResult {
  const pre = describe(input.preChange);
  const post = describe(input.postChange);
  const k = input.qualityRangeK ?? 3;
  const threshold = input.withinThreshold ?? 0.9;

  const base: ComparabilityAttributeResult = {
    id: input.id ?? `cqa_${++_autoId}`,
    name: input.name,
    criticality: input.criticality,
    unit: input.unit,
    verdict: 'insufficient_data',
    rationale: '',
    preChange: pre,
    postChange: post,
    rangeLower: NaN,
    rangeUpper: NaN,
    k,
    fractionWithin: NaN,
    shiftInSigma: NaN,
  };

  if (!(pre.n >= 2) || !Number.isFinite(pre.sd) || pre.sd === 0 || post.n < 1) {
    base.rationale = `Insufficient data (pre-change n=${pre.n}, post-change n=${post.n}, σ_pre=${round(pre.sd, 3)}).`;
    return base;
  }

  const qr = qualityRange(input.preChange, k);
  const frac = fractionWithin(input.postChange, qr);
  const shift = (post.mean - pre.mean) / pre.sd;

  base.rangeLower = round(qr.lower, 4);
  base.rangeUpper = round(qr.upper, 4);
  base.fractionWithin = round(frac, 4);
  base.shiftInSigma = round(shift, 4);

  // High-criticality attributes get an equivalence test when powered.
  let equivalent: boolean | undefined;
  if (input.criticality === 'high' && post.n >= 2) {
    const eac = (input.eacSigmaMultiplier ?? 1.5) * pre.sd;
    const t = tost(input.postChange, input.preChange, -eac, eac, 0.05);
    equivalent = t.equivalent;
    base.equivalence = {
      eac: round(eac, 4),
      diff: round(t.ci.diff, 4),
      ci90Lower: round(t.ci.lower, 4),
      ci90Upper: round(t.ci.upper, 4),
      equivalent: t.equivalent,
    };
  }

  // Verdict logic.
  const absShift = Math.abs(shift);
  let verdict: ComparabilityVerdict;
  if (input.criticality === 'high' && equivalent === false) {
    verdict = 'not_comparable';
  } else if (frac >= threshold && absShift <= 1) {
    verdict = 'comparable';
  } else if (frac >= threshold - 0.1 && absShift <= 1.5) {
    verdict = 'comparable_with_monitoring';
  } else {
    verdict = 'not_comparable';
  }

  base.verdict = verdict;
  const eqNote =
    equivalent === undefined ? '' : ` Equivalence ${equivalent ? 'met' : 'not met'} (EAC ±${round((input.eacSigmaMultiplier ?? 1.5) * pre.sd, 3)}).`;
  base.rationale =
    `${round(frac * 100, 1)}% of post-change lots within mean_pre ± ${k}·σ_pre [${round(qr.lower, 3)}, ${round(qr.upper, 3)}]; ` +
    `mean shift ${round(shift, 2)}σ.${eqNote}`;
  return base;
}

export function assessComparability(input: ComparabilityInput): ComparabilityResult {
  _autoId = 0;
  const attributes = (input.attributes ?? []).map(assessComparabilityAttribute);

  const byCriticality: Record<Criticality, { total: number; notComparable: number; monitoring: number }> = {
    high: { total: 0, notComparable: 0, monitoring: 0 },
    moderate: { total: 0, notComparable: 0, monitoring: 0 },
    low: { total: 0, notComparable: 0, monitoring: 0 },
  };
  let comparable = 0;
  let comparableWithMonitoring = 0;
  let notComparable = 0;
  let insufficientData = 0;
  const flagged: string[] = [];

  for (const a of attributes) {
    byCriticality[a.criticality].total += 1;
    if (a.verdict === 'comparable') comparable += 1;
    else if (a.verdict === 'comparable_with_monitoring') {
      comparableWithMonitoring += 1;
      byCriticality[a.criticality].monitoring += 1;
      flagged.push(a.name);
    } else if (a.verdict === 'not_comparable') {
      notComparable += 1;
      byCriticality[a.criticality].notComparable += 1;
      flagged.push(a.name);
    } else {
      insufficientData += 1;
      flagged.push(a.name);
    }
  }

  const total = attributes.length;
  const highNotComparable = byCriticality.high.notComparable;
  const moderateNotComparable = byCriticality.moderate.notComparable;
  const highMonitoring = byCriticality.high.monitoring;

  let conclusion: ComparabilityConclusion;
  if (total === 0 || insufficientData === total) {
    conclusion = 'insufficient_data';
  } else if (highNotComparable > 0) {
    conclusion = 'not_comparable';
  } else if (moderateNotComparable > 0 || highMonitoring > 0 || comparableWithMonitoring > 0) {
    conclusion = 'comparable_with_additional_data';
  } else {
    conclusion = 'comparable';
  }

  const bridging = deriveBridging(conclusion, highNotComparable, moderateNotComparable, highMonitoring);

  const recommendations: string[] = [];
  if (highNotComparable > 0) {
    recommendations.push(
      `${highNotComparable} high-criticality attribute(s) are not comparable. Per ICH Q5E, additional non-clinical and/or clinical bridging data is expected before the post-change product can be considered comparable.`,
    );
  }
  if (moderateNotComparable > 0 || highMonitoring > 0) {
    recommendations.push(
      'Generate additional analytical (and where warranted functional/non-clinical) data to resolve the residual differences before filing the change.',
    );
  }
  if (conclusion === 'comparable') {
    recommendations.push(
      'Analytical comparability is supported; document the conclusion in a comparability protocol/report (3.2.S/3.2.P) — analytical data alone is likely sufficient for this change category.',
    );
  }

  return {
    changeDescription: input.changeDescription ?? null,
    changeType: input.changeType ?? null,
    modality: input.modality ?? null,
    targetAgency: input.targetAgency ?? null,
    conclusion,
    summary: buildSummary(conclusion, { total, comparable, comparableWithMonitoring, notComparable, insufficientData }),
    counts: {
      total,
      comparable,
      comparableWithMonitoring,
      notComparable,
      insufficientData,
      byCriticality,
    },
    flagged,
    bridging,
    attributes,
    recommendations,
    methodology: METHODOLOGY,
  };
}

function deriveBridging(
  conclusion: ComparabilityConclusion,
  highNotComparable: number,
  moderateNotComparable: number,
  highMonitoring: number,
): BridgingAssessment {
  if (conclusion === 'comparable') {
    return {
      analyticalSufficient: true,
      nonclinicalRecommended: false,
      clinicalRecommended: false,
      rationale: 'All attributes comparable within the pre-change quality range; analytical evidence is expected to suffice for the change.',
    };
  }
  if (conclusion === 'not_comparable') {
    return {
      analyticalSufficient: false,
      nonclinicalRecommended: true,
      clinicalRecommended: highNotComparable > 0,
      rationale: `${highNotComparable} high-criticality attribute(s) not comparable — analytical data alone is insufficient; non-clinical and likely clinical (PK/PD or efficacy/safety) bridging is indicated under ICH Q5E.`,
    };
  }
  if (conclusion === 'comparable_with_additional_data') {
    return {
      analyticalSufficient: false,
      nonclinicalRecommended: highMonitoring > 0 || moderateNotComparable > 0,
      clinicalRecommended: false,
      rationale: 'Residual differences in moderate-criticality or monitored attributes — additional analytical/functional (and possibly non-clinical) data is recommended before concluding comparability.',
    };
  }
  return {
    analyticalSufficient: false,
    nonclinicalRecommended: false,
    clinicalRecommended: false,
    rationale: 'Insufficient data to assess comparability.',
  };
}

function buildSummary(
  conclusion: ComparabilityConclusion,
  c: { total: number; comparable: number; comparableWithMonitoring: number; notComparable: number; insufficientData: number },
): string {
  const tally = `${c.comparable}/${c.total} attributes comparable (${c.comparableWithMonitoring} with monitoring, ${c.notComparable} not comparable, ${c.insufficientData} insufficient data).`;
  switch (conclusion) {
    case 'comparable':
      return `Pre/post-change comparability supported: ${tally}`;
    case 'comparable_with_additional_data':
      return `Comparability largely supported but additional data recommended: ${tally}`;
    case 'not_comparable':
      return `Comparability not demonstrated: ${tally}`;
    default:
      return `Comparability cannot be concluded — insufficient data: ${tally}`;
  }
}
