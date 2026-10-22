/**
 * Module 2 — Assumption Fragility Judgment
 *
 * Evaluates how fragile a study design is to assumption shifts:
 * effect size weakening, attrition increasing, event rate misspecification,
 * variance misspecification.
 *
 * Rule-backed — no LLM involvement. The scores and thresholds are rules; every
 * power figure a reader sees is computed exactly from `stats/normal`:
 *
 *   A design stated to reach power P at two-sided level α has, for its z test, the
 *   noncentrality λ solving Φ(λ − z₁₋α/₂) + Φ(−λ − z₁₋α/₂) = P. Each shift scales λ:
 *     • effect × 0.8            → λ × 0.8           (λ is proportional to the effect)
 *     • variance × 1.5          → λ / √1.5          (λ ∝ 1/σ)
 *     • attrition a → a'        → λ · √((1−a')/(1−a)) (λ ∝ √n_evaluable)
 *   and the power under the shift is Φ(λ' − z) + Φ(−λ' − z). For an 80%-powered design
 *   at α .05, 80% of the effect leaves 61.1% power (an earlier `power × 0.64` shortcut
 *   said 51%). Where the shift does not scale λ — the effect of a non-inferiority or
 *   equivalence design (the margin enters λ too), or any shift of a TOST equivalence
 *   design — no number is produced and the factor says so.
 *
 * @module server/services/biostatistics-judgment/assumption-fragility
 */

import { normalCdf, normalQuantile } from '../stats/normal';
import type {
  StudyDesignInput,
  AssumptionFragility,
  FragilityLevel,
  SensitivityFactor,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// FRAGILITY SCORING
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// EXACT POWER UNDER A SHIFT (two-sided z test)
// ═══════════════════════════════════════════════════════════════════════════════

/** Power of the two-sided level-α z test at noncentrality λ, both rejection regions. */
function zTestPower(ncp: number, alpha: number): number {
  const z = normalQuantile(1 - alpha / 2);
  return normalCdf(ncp - z) + normalCdf(-ncp - z);
}

/**
 * The noncentrality λ ≥ 0 at which the two-sided level-α z test has `power`, by bisection
 * to machine precision. Null when the stated power or alpha cannot be inverted (outside
 * (0, 1)); 0 when the stated power is at or below α (power at λ = 0 is α).
 */
export function noncentralityForPower(power: number, alpha: number): number | null {
  if (!(alpha > 0 && alpha < 1) || !(power > 0 && power < 1)) return null;
  if (power <= alpha) return 0;
  const z = normalQuantile(1 - alpha / 2);
  let lo = 0;
  let hi = z + normalQuantile(power) + 1; // zTestPower(hi) > power
  for (let i = 0; i < 200 && hi - lo > 1e-15; i++) {
    const mid = (lo + hi) / 2;
    if (zTestPower(mid, alpha) < power) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Exact power of the two-sided z test once the design's noncentrality is multiplied by
 * `scale`, given the power it was stated to reach. Null when the stated power is not invertible.
 */
export function powerUnderNoncentralityScale(power: number, alpha: number, scale: number): number | null {
  const ncp = noncentralityForPower(power, alpha);
  return ncp === null ? null : zTestPower(ncp * scale, alpha);
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

const FRAGILITY_THRESHOLDS = {
  low: 30,
  moderate: 60,
  high: 60, // score >= 60 is high
} as const;

export function judgeAssumptionFragility(input: StudyDesignInput): AssumptionFragility {
  const sensitivityFactors: SensitivityFactor[] = [];
  const keyDependencies: string[] = [];
  const likelyFailureModes: string[] = [];
  let fragilityScore = 0;

  // ─── Effect size sensitivity ───────────────────────────────────────────────
  const effectSizeFragility = assessEffectSizeFragility(input);
  fragilityScore += effectSizeFragility.score;
  sensitivityFactors.push(...effectSizeFragility.factors);
  keyDependencies.push(...effectSizeFragility.dependencies);
  likelyFailureModes.push(...effectSizeFragility.failureModes);

  // ─── Attrition sensitivity ─────────────────────────────────────────────────
  const attritionFragility = assessAttritionFragility(input);
  fragilityScore += attritionFragility.score;
  sensitivityFactors.push(...attritionFragility.factors);
  keyDependencies.push(...attritionFragility.dependencies);
  likelyFailureModes.push(...attritionFragility.failureModes);

  // ─── Variance / event rate sensitivity ─────────────────────────────────────
  const varianceFragility = assessVarianceFragility(input);
  fragilityScore += varianceFragility.score;
  sensitivityFactors.push(...varianceFragility.factors);
  keyDependencies.push(...varianceFragility.dependencies);
  likelyFailureModes.push(...varianceFragility.failureModes);

  // ─── Power margin sensitivity ──────────────────────────────────────────────
  const powerMargin = assessPowerMarginFragility(input);
  fragilityScore += powerMargin.score;
  sensitivityFactors.push(...powerMargin.factors);
  keyDependencies.push(...powerMargin.dependencies);
  likelyFailureModes.push(...powerMargin.failureModes);

  // Cap score at 100
  fragilityScore = Math.min(100, Math.max(0, fragilityScore));

  // Classify
  const fragilityLevel: FragilityLevel =
    fragilityScore >= FRAGILITY_THRESHOLDS.high ? 'high' :
    fragilityScore >= FRAGILITY_THRESHOLDS.low ? 'moderate' :
    'low';

  const overallAssessment = buildOverallAssessment(fragilityLevel, keyDependencies, likelyFailureModes);

  return {
    fragilityLevel,
    fragilityScore,
    keyDependencies,
    likelyFailureModes,
    sensitivityFactors,
    overallAssessment,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ASSESSMENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface SubAssessment {
  score: number;
  factors: SensitivityFactor[];
  dependencies: string[];
  failureModes: string[];
}

function assessEffectSizeFragility(input: StudyDesignInput): SubAssessment {
  const factors: SensitivityFactor[] = [];
  const dependencies: string[] = [];
  const failureModes: string[] = [];
  let score = 0;

  if (!input.effectSizeAssumption || input.effectSizeAssumption <= 0) {
    return {
      score: 25,
      factors: [{
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption ?? 0,
        breakingPoint: null,
        impact: 'high',
        description: 'Effect size is missing or zero — cannot assess sensitivity.',
      }],
      dependencies: ['Effect size assumption'],
      failureModes: ['Missing effect size makes the entire design unvalidatable.'],
    };
  }

  dependencies.push('Effect size assumption');

  // Power if the true effect is 20% smaller than planned (see effectReductionShift).
  const effectivePower = input.computedPower ?? input.powerTarget;
  if (effectivePower > 0) {
    const { reducedEffect, reducedLabel, reducedPower, scalesWithEffect } = effectReductionShift(input, effectivePower);

    if (reducedPower === null) {
      score += 15;
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: null,
        impact: 'moderate',
        description: scalesWithEffect
          ? `Power under a 20% effect size reduction was not computed: a stated power of ${pct(effectivePower)} at alpha ${input.alpha} cannot be inverted to the design's noncentrality.`
          : `Power under a 20% effect size reduction was not computed: in a ${input.studyType.replace('_', '-')} design the margin enters the test statistic as well as the effect, so the inputs do not determine it. Assess it with the margin and the assumed true difference.`,
      });
    } else if (reducedPower < 0.70) {
      score += 25;
      failureModes.push('A 20% effect size reduction drops power below 70%.');
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: reducedEffect,
        impact: 'high',
        description: `A 20% effect size reduction (${reducedLabel}) drops power from ${pct(effectivePower)} to ${pct(reducedPower)} (two-sided z test, alpha ${input.alpha}).`,
      });
    } else if (reducedPower < 0.80) {
      score += 15;
      failureModes.push('A 20% effect size reduction makes the study marginal.');
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: reducedEffect,
        impact: 'moderate',
        description: `A 20% effect size reduction (${reducedLabel}) drops power from ${pct(effectivePower)} to ${pct(reducedPower)} (two-sided z test, alpha ${input.alpha}).`,
      });
    } else {
      score += 5;
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: null,
        impact: 'low',
        description: `Design tolerates a 20% effect size reduction: power stays at ${pct(reducedPower)} (from ${pct(effectivePower)}).`,
      });
    }
  }

  return { score, factors, dependencies, failureModes };
}

/**
 * A 20% weaker true effect, on the test's analysis scale (mean difference; risk difference
 * with the variance held at its planned value; log hazard ratio). Exact for a z test whose
 * noncentrality is proportional to the effect — superiority and single-arm designs. For a
 * time-to-event design with a hazard ratio, 20% weaker is HR^0.8, not 0.8 × HR (which is a
 * stronger effect).
 */
function effectReductionShift(input: StudyDesignInput, effectivePower: number): {
  reducedEffect: number;
  reducedLabel: string;
  reducedPower: number | null;
  scalesWithEffect: boolean;
} {
  const hr = input.hazardRatio;
  const onLogHr = input.endpointType === 'time_to_event' && typeof hr === 'number' && hr > 0 && hr !== 1;
  const reducedEffect = onLogHr ? Math.pow(hr, 0.8) : input.effectSizeAssumption * 0.8;
  const reducedLabel = onLogHr ? `hazard ratio ${hr} → ${reducedEffect.toFixed(3)}` : `to ${reducedEffect.toFixed(3)}`;
  const scalesWithEffect = input.studyType === 'superiority' || input.studyType === 'single_arm';
  const reducedPower = scalesWithEffect ? powerUnderNoncentralityScale(effectivePower, input.alpha, 0.8) : null;
  return { reducedEffect, reducedLabel, reducedPower, scalesWithEffect };
}

function assessAttritionFragility(input: StudyDesignInput): SubAssessment {
  const factors: SensitivityFactor[] = [];
  const dependencies: string[] = [];
  const failureModes: string[] = [];
  let score = 0;

  const attrition = input.attritionAssumption;

  if (attrition <= 0) {
    score += 15;
    dependencies.push('Attrition planning');
    failureModes.push('No attrition assumed — any dropout will directly reduce effective sample size.');
    factors.push({
      parameter: 'attrition',
      currentValue: 0,
      breakingPoint: null,
      impact: 'moderate',
      description: 'Zero attrition is assumed. Real trials always have dropout.',
    });
    return { score, factors, dependencies, failureModes };
  }

  dependencies.push(`Attrition assumption (${(attrition * 100).toFixed(0)}%)`);

  // What happens if attrition doubles (capped at 60%): the evaluable n shrinks by
  // (1 − a')/(1 − a), so the noncentrality shrinks by its square root. Exact power is
  // reported; the score stays a rule on the attrition level itself.
  const doubledAttrition = Math.min(attrition * 2, 0.60);
  const effectiveSampleRatio = (1 - doubledAttrition) / (1 - attrition);
  const statedPower = input.computedPower ?? input.powerTarget;
  const powerIfDoubled = input.studyType === 'equivalence'
    ? null
    : powerUnderNoncentralityScale(statedPower, input.alpha, Math.sqrt(effectiveSampleRatio));
  const doubledNote = powerIfDoubled === null
    ? ''
    : ` If it reaches ${(doubledAttrition * 100).toFixed(0)}%, power falls from ${pct(statedPower)} to ${pct(powerIfDoubled)}.`;

  if (attrition >= 0.30) {
    score += 20;
    failureModes.push(`Attrition of ${(attrition * 100).toFixed(0)}% is already high — further dropout is severely destabilizing.`);
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: `${(doubledAttrition * 100).toFixed(0)}%`,
      impact: 'high',
      description: `High baseline attrition (${(attrition * 100).toFixed(0)}%) leaves little room for enrollment surprises.${doubledNote}`,
    });
  } else if (attrition >= 0.15) {
    score += 10;
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: `${(doubledAttrition * 100).toFixed(0)}%`,
      impact: 'moderate',
      description: `Moderate attrition assumption (${(attrition * 100).toFixed(0)}%).${doubledNote}`,
    });
  } else {
    score += 5;
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: null,
      impact: 'low',
      description: `Conservative attrition assumption (${(attrition * 100).toFixed(0)}%).${doubledNote}`,
    });
  }

  return { score, factors, dependencies, failureModes };
}

function assessVarianceFragility(input: StudyDesignInput): SubAssessment {
  const factors: SensitivityFactor[] = [];
  const dependencies: string[] = [];
  const failureModes: string[] = [];
  let score = 0;

  if (input.endpointType === 'continuous') {
    if (!input.variance || input.variance <= 0) {
      score += 15;
      dependencies.push('Variance estimate');
      failureModes.push('No variance specified for continuous endpoint — design cannot be validated.');
      factors.push({
        parameter: 'variance',
        currentValue: 'not specified',
        breakingPoint: null,
        impact: 'high',
        description: 'Variance is required for continuous endpoints but not provided.',
      });
    } else {
      dependencies.push(`Variance estimate (${input.variance})`);
      // 50% variance increase: σ grows by √1.5, so the noncentrality shrinks by 1/√1.5.
      const inflatedVariance = input.variance * 1.5;
      const statedPower = input.computedPower ?? input.powerTarget;
      const newPower = input.studyType === 'equivalence'
        ? null
        : powerUnderNoncentralityScale(statedPower, input.alpha, 1 / Math.sqrt(1.5));

      if (newPower === null) {
        score += 10;
        factors.push({
          parameter: 'variance',
          currentValue: input.variance,
          breakingPoint: null,
          impact: 'moderate',
          description: input.studyType === 'equivalence'
            ? 'Power under a 50% variance increase was not computed: TOST equivalence power depends on the margin and the assumed true difference, which these inputs do not determine.'
            : `Power under a 50% variance increase was not computed: a stated power of ${pct(statedPower)} at alpha ${input.alpha} cannot be inverted to the design's noncentrality.`,
        });
      } else if (newPower < 0.70) {
        score += 20;
        failureModes.push('A 50% variance increase drops power below 70%.');
        factors.push({
          parameter: 'variance',
          currentValue: input.variance,
          breakingPoint: inflatedVariance,
          impact: 'high',
          description: `A 50% variance increase (to ${inflatedVariance.toFixed(2)}) drops power from ${pct(statedPower)} to ${pct(newPower)} (two-sided z test, alpha ${input.alpha}).`,
        });
      } else {
        score += 5;
        factors.push({
          parameter: 'variance',
          currentValue: input.variance,
          breakingPoint: null,
          impact: 'low',
          description: `Design is reasonably robust to a 50% variance increase: power stays at ${pct(newPower)} (from ${pct(statedPower)}).`,
        });
      }
    }
  }

  if (input.endpointType === 'binary') {
    if (input.controlRate) {
      dependencies.push(`Control rate assumption (${(input.controlRate * 100).toFixed(0)}%)`);
      // Check if control rate is near 0.5 (highest variance for binary)
      if (input.controlRate > 0.40 && input.controlRate < 0.60) {
        score += 10;
        factors.push({
          parameter: 'control_rate',
          currentValue: `${(input.controlRate * 100).toFixed(0)}%`,
          breakingPoint: null,
          impact: 'moderate',
          description: 'Control rate near 50% maximizes binary variance — sample size estimates are conservative.',
        });
      }
    }
  }

  if (input.endpointType === 'time_to_event') {
    if (input.medianSurvivalControl) {
      dependencies.push(`Median survival assumption (${input.medianSurvivalControl} months)`);
      factors.push({
        parameter: 'median_survival',
        currentValue: `${input.medianSurvivalControl} months`,
        breakingPoint: null,
        impact: 'moderate',
        description: 'Event rate and follow-up duration are key drivers for time-to-event designs.',
      });
      score += 5;
    }
  }

  return { score, factors, dependencies, failureModes };
}

function assessPowerMarginFragility(input: StudyDesignInput): SubAssessment {
  const factors: SensitivityFactor[] = [];
  const dependencies: string[] = [];
  const failureModes: string[] = [];
  let score = 0;

  const effectivePower = input.computedPower ?? input.powerTarget;
  const margin = effectivePower - 0.80;

  if (margin <= 0) {
    score += 15;
    failureModes.push('No power margin above 80% — any negative shift in assumptions will make the design underpowered.');
    factors.push({
      parameter: 'power_margin',
      currentValue: `${(effectivePower * 100).toFixed(1)}%`,
      breakingPoint: '80%',
      impact: 'high',
      description: `Power of ${(effectivePower * 100).toFixed(1)}% provides no margin above the standard threshold.`,
    });
  } else if (margin < 0.05) {
    score += 8;
    factors.push({
      parameter: 'power_margin',
      currentValue: `${(effectivePower * 100).toFixed(1)}%`,
      breakingPoint: '80%',
      impact: 'moderate',
      description: `Power margin of only ${(margin * 100).toFixed(1)} percentage points above 80%.`,
    });
  } else {
    score += 2;
    factors.push({
      parameter: 'power_margin',
      currentValue: `${(effectivePower * 100).toFixed(1)}%`,
      breakingPoint: null,
      impact: 'low',
      description: `Comfortable power margin of ${(margin * 100).toFixed(1)} percentage points above 80%.`,
    });
  }

  return { score, factors, dependencies, failureModes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERALL ASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════════

function buildOverallAssessment(
  level: FragilityLevel,
  dependencies: readonly string[],
  failureModes: readonly string[]
): string {
  if (level === 'high') {
    return `This design has HIGH assumption fragility. It depends critically on ${dependencies.length} ` +
      `key assumptions and has ${failureModes.length} identified failure mode(s). ` +
      `Minor deviations in assumed parameters could materially compromise the study's ability to meet its objectives.`;
  }
  if (level === 'moderate') {
    return `This design has MODERATE assumption fragility. Key assumptions (${dependencies.slice(0, 3).join(', ')}) ` +
      `should be monitored during the trial. The design can tolerate small deviations but is not robust to ` +
      `substantial shifts in any critical parameter.`;
  }
  return `This design has LOW assumption fragility. Key assumptions appear conservative and the design ` +
    `provides adequate margin for parameter shifts. Standard monitoring is sufficient.`;
}
