/**
 * BLA 351(a) — immunogenicity engine.
 *
 * Computes anti-drug-antibody (ADA) and neutralizing-antibody (NAb) incidence
 * from tiered-assay subject counts, the comparative immunogenicity difference
 * between a test arm and a reference/comparator arm, and an overall
 * immunogenicity risk classification.
 *
 * Grounded in:
 *   - FDA "Immunogenicity Assessment for Therapeutic Protein Products" (2014)
 *     and "Immunogenicity Testing of Therapeutic Protein Products — Developing
 *     and Validating Assays for Anti-Drug Antibody Detection" (2019): the
 *     tiered screening → confirmatory → titer/NAb assay scheme, and the
 *     risk-based framework where risk = likelihood × clinical consequence.
 *
 * Incidence uses the Wilson score interval and the between-arm difference uses
 * Newcombe's interval — both well-behaved at the low incidence and small n
 * typical of immunogenicity data. Deterministic computation, not guidance text.
 *
 * @module server/services/biologics/immunogenicity
 */

import { wilsonCI, newcombeDiffCI, round, type ProportionCI } from './statistics';

export type RiskTier = 'low' | 'moderate' | 'high';

export interface ImmunoArmInput {
  /** Display label, e.g. "Proposed product" or "US-licensed reference". */
  label: string;
  /** Optional role to drive the comparison. */
  role?: 'test' | 'reference' | 'comparator';
  /** Evaluable subjects with ≥1 post-baseline ADA sample. */
  nSubjects: number;
  /** Confirmed ADA-positive subjects (any). */
  adaPositive: number;
  /** Treatment-emergent (induced + boosted) ADA-positive — preferred numerator. */
  treatmentEmergentAda?: number;
  /** Pre-existing (baseline) ADA-positive subjects. */
  preExistingAda?: number;
  /** Neutralizing-antibody-positive subjects. */
  nabPositive?: number;
  /** Persistent (vs transient) ADA-positive subjects. */
  persistentAda?: number;
  /** ADA titers among positives (reciprocal titer values). */
  titers?: number[];
  /** Among ADA+ subjects: number with a relevant PK impact. */
  impactedPk?: number;
  /** Among ADA+ subjects: number with loss of efficacy. */
  impactedEfficacy?: number;
  /** Serious hypersensitivity / anaphylaxis events associated with ADA. */
  hypersensitivity?: number;
}

export interface ImmunoRiskFactors {
  /** Chronic / repeated dosing (raises likelihood). */
  chronicDosing?: boolean;
  /** Concomitant immunomodulation / immunosuppression (lowers likelihood). */
  immunomodulator?: boolean;
  /** Non-human / foreign sequence content (raises likelihood). */
  foreignSequence?: boolean;
  /** Aggregation-prone product (raises likelihood). */
  aggregationProne?: boolean;
  /**
   * Product is (or neutralizes) an endogenous protein with a non-redundant
   * function — neutralizing ADA then carries severe consequence.
   */
  neutralizesEndogenous?: boolean;
}

export interface ImmunogenicityInput {
  productType?: 'biologic' | 'biosimilar';
  modality?: string;
  targetAgency?: string;
  riskFactors?: ImmunoRiskFactors;
  arms: ImmunoArmInput[];
}

export interface ImmunoArmResult {
  label: string;
  role?: 'test' | 'reference' | 'comparator';
  nSubjects: number;
  /** Treatment-emergent ADA incidence (preferred) with 95% Wilson CI. */
  adaIncidence: ProportionCI;
  /** NAb incidence among all subjects with 95% Wilson CI. */
  nabIncidence: ProportionCI;
  /** NAb incidence among ADA-positive subjects, when ADA+ > 0. */
  nabAmongAdaPositive: number | null;
  persistentRate: number | null;
  titerSummary: { n: number; median: number; min: number; max: number } | null;
  clinicalImpact: {
    pkImpactRate: number | null;
    efficacyImpactRate: number | null;
    hypersensitivityEvents: number;
  };
}

export interface ImmunoComparison {
  testArm: string;
  referenceArm: string;
  adaDiff: number;
  adaDiffLower: number;
  adaDiffUpper: number;
  nabDiff: number | null;
  verdict: 'similar' | 'higher_in_test' | 'lower_in_test';
  rationale: string;
}

export interface ImmunoRisk {
  tier: RiskTier;
  likelihood: RiskTier;
  consequence: RiskTier;
  rationale: string;
  factors: string[];
}

export interface ImmunogenicityResult {
  productType: string | null;
  modality: string | null;
  targetAgency: string | null;
  arms: ImmunoArmResult[];
  comparison: ImmunoComparison | null;
  risk: ImmunoRisk;
  summary: string;
  recommendations: string[];
  methodology: string[];
}

const METHODOLOGY = [
  'ADA incidence uses the treatment-emergent numerator when supplied (induced + boosted), else total confirmed ADA+.',
  'Incidence reported with 95% Wilson score intervals; the between-arm difference uses Newcombe’s interval.',
  'Risk = likelihood × clinical consequence (FDA 2014 immunogenicity risk-based framework). Likelihood is graded from treatment-emergent incidence and product/patient factors; consequence from NAb, PK/efficacy impact, hypersensitivity, and whether the product neutralizes a non-redundant endogenous protein.',
];

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function assessArm(arm: ImmunoArmInput): ImmunoArmResult {
  const n = arm.nSubjects;
  const adaNum = arm.treatmentEmergentAda ?? arm.adaPositive ?? 0;
  const nab = arm.nabPositive ?? 0;
  const titers = (arm.titers ?? []).filter((t) => Number.isFinite(t) && t > 0);

  return {
    label: arm.label,
    role: arm.role,
    nSubjects: n,
    adaIncidence: roundCI(wilsonCI(adaNum, n, 0.95)),
    nabIncidence: roundCI(wilsonCI(nab, n, 0.95)),
    nabAmongAdaPositive:
      arm.adaPositive && arm.adaPositive > 0 ? round(nab / arm.adaPositive, 4) : null,
    persistentRate:
      arm.persistentAda != null && arm.adaPositive
        ? round(arm.persistentAda / arm.adaPositive, 4)
        : null,
    titerSummary: titers.length
      ? { n: titers.length, median: round(median(titers), 2), min: Math.min(...titers), max: Math.max(...titers) }
      : null,
    clinicalImpact: {
      pkImpactRate:
        arm.impactedPk != null && arm.adaPositive ? round(arm.impactedPk / arm.adaPositive, 4) : null,
      efficacyImpactRate:
        arm.impactedEfficacy != null && arm.adaPositive
          ? round(arm.impactedEfficacy / arm.adaPositive, 4)
          : null,
      hypersensitivityEvents: arm.hypersensitivity ?? 0,
    },
  };
}

function roundCI(ci: ProportionCI): ProportionCI {
  return { ...ci, p: round(ci.p, 4), lower: round(ci.lower, 4), upper: round(ci.upper, 4) };
}

function compareArms(input: ImmunogenicityInput): ImmunoComparison | null {
  const arms = input.arms ?? [];
  let test = arms.find((a) => a.role === 'test');
  let reference = arms.find((a) => a.role === 'reference' || a.role === 'comparator');
  if ((!test || !reference) && arms.length === 2) {
    test = arms[0];
    reference = arms[1];
  }
  if (!test || !reference || test === reference) return null;

  const tAda = test.treatmentEmergentAda ?? test.adaPositive ?? 0;
  const rAda = reference.treatmentEmergentAda ?? reference.adaPositive ?? 0;
  const diffCi = newcombeDiffCI(tAda, test.nSubjects, rAda, reference.nSubjects, 0.95);

  const tNab = test.nabPositive;
  const rNab = reference.nabPositive;
  const nabDiff =
    tNab != null && rNab != null && test.nSubjects > 0 && reference.nSubjects > 0
      ? round(tNab / test.nSubjects - rNab / reference.nSubjects, 4)
      : null;

  let verdict: ImmunoComparison['verdict'];
  if (diffCi.lower > 0) verdict = 'higher_in_test';
  else if (diffCi.upper < 0) verdict = 'lower_in_test';
  else verdict = 'similar';

  const rationale =
    verdict === 'similar'
      ? `ADA incidence difference ${round(diffCi.diff * 100, 1)}% (95% CI ${round(diffCi.lower * 100, 1)}% to ${round(diffCi.upper * 100, 1)}%) includes 0 — comparative immunogenicity supported.`
      : `ADA incidence is ${verdict === 'higher_in_test' ? 'higher' : 'lower'} in the test arm: difference ${round(diffCi.diff * 100, 1)}% (95% CI ${round(diffCi.lower * 100, 1)}% to ${round(diffCi.upper * 100, 1)}%).`;

  return {
    testArm: test.label,
    referenceArm: reference.label,
    adaDiff: round(diffCi.diff, 4),
    adaDiffLower: round(diffCi.lower, 4),
    adaDiffUpper: round(diffCi.upper, 4),
    nabDiff,
    verdict,
    rationale,
  };
}

function gradeRisk(input: ImmunogenicityInput, arms: ImmunoArmResult[]): ImmunoRisk {
  const factors: string[] = [];
  const rf = input.riskFactors ?? {};

  // Use the highest-incidence arm (typically the test product) to grade.
  const lead = arms.reduce<ImmunoArmResult | null>((acc, a) => {
    if (!acc) return a;
    return (a.adaIncidence.p || 0) > (acc.adaIncidence.p || 0) ? a : acc;
  }, null);
  const adaP = lead?.adaIncidence.p ?? 0;
  const nabP = lead?.nabIncidence.p ?? 0;
  const efficacyImpact = (lead?.clinicalImpact.efficacyImpactRate ?? 0) > 0;
  const hypersensitivity = arms.some((a) => a.clinicalImpact.hypersensitivityEvents > 0);

  // ---- Likelihood from incidence + product/patient factors ----
  let likelihoodScore: number;
  if (adaP < 0.01) likelihoodScore = 0;
  else if (adaP < 0.1) likelihoodScore = 1;
  else if (adaP < 0.3) likelihoodScore = 2;
  else likelihoodScore = 3;

  if (rf.foreignSequence) {
    likelihoodScore += 1;
    factors.push('foreign/non-human sequence content');
  }
  if (rf.aggregationProne) {
    likelihoodScore += 1;
    factors.push('aggregation-prone product');
  }
  if (rf.chronicDosing) {
    likelihoodScore += 1;
    factors.push('chronic/repeated dosing');
  }
  if (rf.immunomodulator) {
    likelihoodScore -= 1;
    factors.push('concomitant immunomodulation (mitigates)');
  }
  likelihoodScore = Math.max(0, Math.min(4, likelihoodScore));
  const likelihood: RiskTier = likelihoodScore <= 1 ? 'low' : likelihoodScore === 2 ? 'moderate' : 'high';

  // ---- Consequence from NAb, clinical impact, hypersensitivity, biology ----
  let consequenceScore = 0;
  if (nabP > 0) {
    consequenceScore += nabP >= 0.05 ? 2 : 1;
    factors.push(`neutralizing antibodies detected (${round(nabP * 100, 1)}%)`);
  }
  if (efficacyImpact) {
    consequenceScore += 2;
    factors.push('ADA-associated loss of efficacy observed');
  }
  if (hypersensitivity) {
    consequenceScore += 3;
    factors.push('ADA-associated serious hypersensitivity');
  }
  if (rf.neutralizesEndogenous) {
    consequenceScore += 2;
    factors.push('neutralization of a non-redundant endogenous protein (severe consequence)');
  }
  const consequence: RiskTier = consequenceScore <= 1 ? 'low' : consequenceScore <= 3 ? 'moderate' : 'high';

  // ---- Combine (risk = likelihood × consequence), consequence-dominant ----
  const order: Record<RiskTier, number> = { low: 0, moderate: 1, high: 2 };
  let tier: RiskTier;
  if (consequence === 'high' || (consequence === 'moderate' && likelihood === 'high')) {
    tier = 'high';
  } else if (order[likelihood] + order[consequence] >= 2) {
    tier = 'moderate';
  } else {
    tier = 'low';
  }

  const rationale =
    `Likelihood ${likelihood} (treatment-emergent ADA ${round(adaP * 100, 1)}%) × consequence ${consequence} ` +
    `(NAb ${round(nabP * 100, 1)}%${efficacyImpact ? ', efficacy impact' : ''}${hypersensitivity ? ', hypersensitivity' : ''}) ` +
    `→ ${tier} immunogenicity risk.`;

  return { tier, likelihood, consequence, rationale, factors };
}

export function assessImmunogenicity(input: ImmunogenicityInput): ImmunogenicityResult {
  const arms = (input.arms ?? []).map(assessArm);
  const comparison = compareArms(input);
  const risk = gradeRisk(input, arms);

  const recommendations: string[] = [];
  if (risk.tier === 'high') {
    recommendations.push(
      'High immunogenicity risk: pre-specify an immunogenicity risk-mitigation and management plan, ensure NAb and titer assays are validated, and design clinical sampling to characterize impact on PK, efficacy and safety.',
    );
  } else if (risk.tier === 'moderate') {
    recommendations.push(
      'Moderate immunogenicity risk: confirm tiered assay validation (screening/confirmatory/titer/NAb) and adequate sampling schedule; monitor for clinical correlates.',
    );
  } else {
    recommendations.push(
      'Low immunogenicity risk: maintain the standard tiered assay strategy and routine sampling; document the basis for the low-risk determination.',
    );
  }
  if (comparison && comparison.verdict === 'higher_in_test') {
    recommendations.push(
      'Comparative ADA incidence is higher in the test arm — investigate product/process drivers and assess impact before relying on extrapolation.',
    );
  }
  if (input.productType === 'biosimilar' && comparison) {
    recommendations.push(
      'For a 351(k) program, the comparative immunogenicity finding feeds the totality-of-evidence biosimilarity assessment.',
    );
  }

  return {
    productType: input.productType ?? null,
    modality: input.modality ?? null,
    targetAgency: input.targetAgency ?? null,
    arms,
    comparison,
    risk,
    summary: buildSummary(arms, comparison, risk),
    recommendations,
    methodology: METHODOLOGY,
  };
}

function buildSummary(
  arms: ImmunoArmResult[],
  comparison: ImmunoComparison | null,
  risk: ImmunoRisk,
): string {
  const armBits = arms
    .map((a) => `${a.label}: ADA ${round(a.adaIncidence.p * 100, 1)}% (95% CI ${round(a.adaIncidence.lower * 100, 1)}–${round(a.adaIncidence.upper * 100, 1)}%)`)
    .join('; ');
  const comp = comparison ? ` ${comparison.rationale}` : '';
  return `${armBits}. Overall ${risk.tier} immunogenicity risk.${comp}`;
}
