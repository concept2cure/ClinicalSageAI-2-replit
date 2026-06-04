/**
 * BLA 351(a) / 351(k) — analytical similarity engine.
 *
 * Implements the tiered statistical assessment of analytical similarity between
 * a proposed biologic (test) and a reference product (RP), following the FDA
 * framework ("Statistical Approaches to Evaluate Analytical Similarity", 2017;
 * "Development of Therapeutic Protein Biosimilars: Comparative Analytical
 * Assessment and Other Quality-Related Considerations", 2019):
 *
 *   - Tier 1 (most critical / mechanism-related CQAs): equivalence testing.
 *     The equivalence acceptance criterion is EAC = ±1.5 · σ_R. Similarity is
 *     declared when the 90% confidence interval of (mean_T − mean_R) lies
 *     entirely within (−EAC, +EAC) — i.e. the two one-sided tests at α = 0.05.
 *
 *   - Tier 2 (moderately critical CQAs): quality-range approach. The quality
 *     range is mean_R ± k · σ_R (k typically 3). Similarity is supported when a
 *     high proportion of test lots (default ≥ 90%) fall inside the range.
 *
 *   - Tier 3 (least critical CQAs): raw-data / min–max comparison. Reported
 *     descriptively against the observed reference range.
 *
 * This is a deterministic computation over measured lot data — not a guidance
 * string. It returns per-attribute verdicts with the underlying statistics and
 * an overall conclusion, so a reviewer can see exactly why each CQA passed or
 * failed.
 *
 * @module server/services/biologics/analytical-similarity
 */

import {
  describe,
  tost,
  qualityRange,
  fractionWithin,
  round,
  type DescriptiveStats,
} from './statistics';

export type Tier = 1 | 2 | 3;
export type AttributeVerdict = 'pass' | 'marginal' | 'fail' | 'insufficient_data';
export type SimilarityConclusion =
  | 'similar'
  | 'similar_with_residual_uncertainty'
  | 'not_demonstrated'
  | 'insufficient_data';

export interface SimilarityAttributeInput {
  /** Stable id (optional — generated if absent). */
  id?: string;
  /** CQA name, e.g. "Potency (relative, %)". */
  name: string;
  /** 1 = most critical / mechanism-related, 2 = moderate, 3 = least critical. */
  tier: Tier;
  /** Free-text criticality note (e.g. "binds FcγRIIIa — ADCC"). */
  criticality?: string;
  unit?: string;
  /** Reference-product lot measurements. */
  reference: number[];
  /** Proposed/test-product lot measurements. */
  test: number[];
  /** Tier 1 only: σ_R multiplier for the EAC (default 1.5). */
  eacSigmaMultiplier?: number;
  /** Tier 2 only: SD multiplier for the quality range (default 3). */
  qualityRangeK?: number;
  /** Tier 2/3 only: fraction of test lots required inside the range (default 0.90). */
  withinThreshold?: number;
  /** Marks a mechanism-of-action–related attribute (informational, raises weight). */
  mechanismRelated?: boolean;
}

export interface SimilarityAttributeResult {
  id: string;
  name: string;
  tier: Tier;
  unit?: string;
  criticality?: string;
  mechanismRelated: boolean;
  verdict: AttributeVerdict;
  /** Human-readable one-line explanation of the verdict. */
  rationale: string;
  reference: DescriptiveStats;
  testStats: DescriptiveStats;
  /** Tier 1 detail. */
  tier1?: {
    eac: number;
    eacSigmaMultiplier: number;
    diff: number;
    ci90Lower: number;
    ci90Upper: number;
    equivalent: boolean;
    tostPValue: number;
  };
  /** Tier 2 detail. */
  tier2?: {
    rangeLower: number;
    rangeUpper: number;
    k: number;
    fractionWithin: number;
    threshold: number;
  };
  /** Tier 3 detail. */
  tier3?: {
    referenceMin: number;
    referenceMax: number;
    fractionWithin: number;
  };
}

export interface SimilarityAssessmentInput {
  referenceProduct?: string;
  modality?: string;
  targetAgency?: string;
  attributes: SimilarityAttributeInput[];
}

export interface SimilarityAssessmentResult {
  referenceProduct: string | null;
  modality: string | null;
  targetAgency: string | null;
  conclusion: SimilarityConclusion;
  /** Plain-language summary suitable for a reviewer or a draft narrative. */
  summary: string;
  counts: {
    total: number;
    pass: number;
    marginal: number;
    fail: number;
    insufficientData: number;
    byTier: Record<Tier, { total: number; pass: number; marginal: number; fail: number }>;
  };
  /** Names of attributes not meeting their tier criterion (fail or marginal). */
  flagged: string[];
  attributes: SimilarityAttributeResult[];
  recommendations: string[];
  methodology: string[];
}

const METHODOLOGY = [
  'Tier 1: equivalence test, EAC = ±1.5·σ_R, 90% CI of (mean_test − mean_reference) (FDA, 2017 statistical approaches).',
  'Tier 2: quality range mean_R ± k·σ_R (default k = 3); proportion of test lots within range (FDA, 2019 comparative analytical assessment).',
  'Tier 3: descriptive comparison against the observed reference min–max range.',
];

let _autoId = 0;
function attrId(input: SimilarityAttributeInput): string {
  return input.id ?? `cqa_${++_autoId}`;
}

function assessTier1(input: SimilarityAttributeInput): SimilarityAttributeResult {
  const reference = describe(input.reference);
  const testStats = describe(input.test);
  const base: SimilarityAttributeResult = {
    id: attrId(input),
    name: input.name,
    tier: 1,
    unit: input.unit,
    criticality: input.criticality,
    mechanismRelated: input.mechanismRelated ?? true, // Tier 1 is typically MoA-related
    verdict: 'insufficient_data',
    rationale: '',
    reference,
    testStats,
  };

  // Equivalence testing needs variability estimates on both arms.
  if (!(reference.n >= 2 && testStats.n >= 1) || !Number.isFinite(reference.sd) || reference.sd === 0) {
    base.rationale =
      reference.n < 2
        ? `Insufficient reference lots (${reference.n}) to estimate σ_R for an equivalence margin.`
        : 'Reference variability (σ_R) is zero or undefined; cannot form an equivalence margin.';
    return base;
  }
  if (testStats.n < 2) {
    base.rationale = `Insufficient test lots (${testStats.n}) for a two-sample equivalence test.`;
    return base;
  }

  const mult = input.eacSigmaMultiplier ?? 1.5;
  const eac = mult * reference.sd;
  const t = tost(input.test, input.reference, -eac, eac, 0.05);
  const diff = t.ci.diff;

  let verdict: AttributeVerdict;
  let rationale: string;
  if (t.equivalent) {
    verdict = 'pass';
    rationale = `90% CI of the mean difference [${round(t.ci.lower, 3)}, ${round(t.ci.upper, 3)}] lies within ±EAC (${round(eac, 3)}).`;
  } else if (Math.abs(diff) <= eac) {
    verdict = 'marginal';
    rationale = `Mean difference (${round(diff, 3)}) is within ±EAC (${round(eac, 3)}) but the 90% CI [${round(t.ci.lower, 3)}, ${round(t.ci.upper, 3)}] is not fully contained — likely under-powered (add lots).`;
  } else {
    verdict = 'fail';
    rationale = `Mean difference (${round(diff, 3)}) exceeds ±EAC (${round(eac, 3)}); equivalence not demonstrated.`;
  }

  base.verdict = verdict;
  base.rationale = rationale;
  base.tier1 = {
    eac: round(eac, 4),
    eacSigmaMultiplier: mult,
    diff: round(diff, 4),
    ci90Lower: round(t.ci.lower, 4),
    ci90Upper: round(t.ci.upper, 4),
    equivalent: t.equivalent,
    tostPValue: round(t.pValue, 4),
  };
  return base;
}

function assessTier2(input: SimilarityAttributeInput): SimilarityAttributeResult {
  const reference = describe(input.reference);
  const testStats = describe(input.test);
  const base: SimilarityAttributeResult = {
    id: attrId(input),
    name: input.name,
    tier: 2,
    unit: input.unit,
    criticality: input.criticality,
    mechanismRelated: input.mechanismRelated ?? false,
    verdict: 'insufficient_data',
    rationale: '',
    reference,
    testStats,
  };

  if (!(reference.n >= 2) || !Number.isFinite(reference.sd) || reference.sd === 0 || testStats.n < 1) {
    base.rationale = `Insufficient data for a quality range (reference n=${reference.n}, test n=${testStats.n}).`;
    return base;
  }

  const k = input.qualityRangeK ?? 3;
  const threshold = input.withinThreshold ?? 0.9;
  const qr = qualityRange(input.reference, k);
  const frac = fractionWithin(input.test, qr);

  let verdict: AttributeVerdict;
  if (frac >= threshold) verdict = 'pass';
  else if (frac >= threshold - 0.1) verdict = 'marginal';
  else verdict = 'fail';

  base.verdict = verdict;
  base.rationale = `${round(frac * 100, 1)}% of test lots fall within the quality range [${round(qr.lower, 3)}, ${round(qr.upper, 3)}] (mean_R ± ${k}·σ_R); threshold ${round(threshold * 100, 0)}%.`;
  base.tier2 = {
    rangeLower: round(qr.lower, 4),
    rangeUpper: round(qr.upper, 4),
    k,
    fractionWithin: round(frac, 4),
    threshold,
  };
  return base;
}

function assessTier3(input: SimilarityAttributeInput): SimilarityAttributeResult {
  const reference = describe(input.reference);
  const testStats = describe(input.test);
  const base: SimilarityAttributeResult = {
    id: attrId(input),
    name: input.name,
    tier: 3,
    unit: input.unit,
    criticality: input.criticality,
    mechanismRelated: input.mechanismRelated ?? false,
    verdict: 'insufficient_data',
    rationale: '',
    reference,
    testStats,
  };

  if (reference.n < 1 || testStats.n < 1) {
    base.rationale = `Insufficient data for a min–max comparison (reference n=${reference.n}, test n=${testStats.n}).`;
    return base;
  }

  const threshold = input.withinThreshold ?? 0.9;
  const range = { lower: reference.min, upper: reference.max };
  const frac = fractionWithin(input.test, range);

  let verdict: AttributeVerdict;
  if (frac >= 1) verdict = 'pass';
  else if (frac >= threshold) verdict = 'marginal';
  else verdict = 'fail';

  base.verdict = verdict;
  base.rationale = `${round(frac * 100, 1)}% of test lots fall within the observed reference range [${round(reference.min, 3)}, ${round(reference.max, 3)}] (Tier 3 is descriptive, not inferential).`;
  base.tier3 = {
    referenceMin: round(reference.min, 4),
    referenceMax: round(reference.max, 4),
    fractionWithin: round(frac, 4),
  };
  return base;
}

export function assessAttribute(input: SimilarityAttributeInput): SimilarityAttributeResult {
  switch (input.tier) {
    case 1:
      return assessTier1(input);
    case 2:
      return assessTier2(input);
    case 3:
      return assessTier3(input);
    default:
      return assessTier3({ ...input, tier: 3 });
  }
}

/**
 * Run a full analytical-similarity assessment across a set of CQAs and derive
 * an overall conclusion.
 */
export function assessAnalyticalSimilarity(
  input: SimilarityAssessmentInput,
): SimilarityAssessmentResult {
  _autoId = 0;
  const attributes = (input.attributes ?? []).map(assessAttribute);

  const byTier: Record<Tier, { total: number; pass: number; marginal: number; fail: number }> = {
    1: { total: 0, pass: 0, marginal: 0, fail: 0 },
    2: { total: 0, pass: 0, marginal: 0, fail: 0 },
    3: { total: 0, pass: 0, marginal: 0, fail: 0 },
  };
  let pass = 0;
  let marginal = 0;
  let fail = 0;
  let insufficientData = 0;
  const flagged: string[] = [];

  for (const a of attributes) {
    byTier[a.tier].total += 1;
    if (a.verdict === 'pass') {
      pass += 1;
      byTier[a.tier].pass += 1;
    } else if (a.verdict === 'marginal') {
      marginal += 1;
      byTier[a.tier].marginal += 1;
      flagged.push(a.name);
    } else if (a.verdict === 'fail') {
      fail += 1;
      byTier[a.tier].fail += 1;
      flagged.push(a.name);
    } else {
      insufficientData += 1;
      flagged.push(a.name);
    }
  }

  const total = attributes.length;
  const tier1Fail = byTier[1].fail > 0;
  const tier1Marginal = byTier[1].marginal > 0;
  const tier1Insufficient = attributes.some((a) => a.tier === 1 && a.verdict === 'insufficient_data');
  const anyTier2Fail = byTier[2].fail > 0;

  let conclusion: SimilarityConclusion;
  if (total === 0) {
    conclusion = 'insufficient_data';
  } else if (tier1Fail || anyTier2Fail) {
    conclusion = 'not_demonstrated';
  } else if (tier1Insufficient) {
    conclusion = 'insufficient_data';
  } else if (tier1Marginal || byTier[2].marginal > 0 || byTier[3].fail > 0) {
    conclusion = 'similar_with_residual_uncertainty';
  } else {
    conclusion = 'similar';
  }

  const recommendations: string[] = [];
  if (tier1Fail) {
    recommendations.push(
      'One or more Tier 1 (mechanism-related) attributes failed equivalence — analytical similarity is not demonstrated. Investigate the manufacturing root cause before progressing the comparative clinical program.',
    );
  }
  if (tier1Marginal || tier1Insufficient) {
    recommendations.push(
      'Tier 1 attributes are under-powered (wide CI). Add reference and/or test lots to tighten the 90% CI within ±1.5·σ_R.',
    );
  }
  if (anyTier2Fail || byTier[2].marginal > 0) {
    recommendations.push(
      'Tier 2 attributes fall outside the quality range for too many lots — review process capability or justify the wider distribution with criticality data.',
    );
  }
  if (conclusion === 'similar') {
    recommendations.push(
      'All tiers met their criteria. Carry the totality-of-evidence narrative into the comparative PK/PD and clinical sections.',
    );
  }

  const summary = buildSummary(conclusion, counts(total, pass, marginal, fail, insufficientData), input.referenceProduct);

  return {
    referenceProduct: input.referenceProduct ?? null,
    modality: input.modality ?? null,
    targetAgency: input.targetAgency ?? null,
    conclusion,
    summary,
    counts: { total, pass, marginal, fail, insufficientData, byTier },
    flagged,
    attributes,
    recommendations,
    methodology: METHODOLOGY,
  };
}

function counts(total: number, pass: number, marginal: number, fail: number, insufficient: number) {
  return { total, pass, marginal, fail, insufficient };
}

function buildSummary(
  conclusion: SimilarityConclusion,
  c: { total: number; pass: number; marginal: number; fail: number; insufficient: number },
  rp?: string,
): string {
  const ref = rp ? ` to ${rp}` : '';
  const tally = `${c.pass}/${c.total} attributes met their tier criterion (${c.marginal} marginal, ${c.fail} failed, ${c.insufficient} insufficient data).`;
  switch (conclusion) {
    case 'similar':
      return `Analytical similarity${ref} is supported: ${tally}`;
    case 'similar_with_residual_uncertainty':
      return `Analytical similarity${ref} is largely supported with residual uncertainty: ${tally}`;
    case 'not_demonstrated':
      return `Analytical similarity${ref} is not demonstrated: ${tally}`;
    default:
      return `Analytical similarity${ref} cannot be concluded — insufficient data: ${tally}`;
  }
}
