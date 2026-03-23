/**
 * Module 2 — Assumption Fragility Judgment
 *
 * Evaluates how fragile a study design is to assumption shifts:
 * effect size weakening, attrition increasing, event rate misspecification,
 * variance misspecification.
 *
 * Rule-backed — no LLM involvement.
 *
 * @module server/services/biostatistics-judgment/assumption-fragility
 */

import type {
  StudyDesignInput,
  AssumptionFragility,
  FragilityLevel,
  SensitivityFactor,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// FRAGILITY SCORING
// ═══════════════════════════════════════════════════════════════════════════════

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

  // Check power sensitivity to 20% effect size reduction
  const effectivePower = input.computedPower ?? input.powerTarget;
  if (effectivePower > 0) {
    // Approximate: power drops roughly proportional to (effect_size)^2
    const reducedEffect = input.effectSizeAssumption * 0.8;
    const approxReducedPower = effectivePower * Math.pow(0.8, 2);

    if (approxReducedPower < 0.70) {
      score += 25;
      failureModes.push('A 20% effect size reduction drops power below 70%.');
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: reducedEffect,
        impact: 'high',
        description: `A 20% effect size reduction (to ${reducedEffect.toFixed(3)}) drops approximate power to ${(approxReducedPower * 100).toFixed(0)}%.`,
      });
    } else if (approxReducedPower < 0.80) {
      score += 15;
      failureModes.push('A 20% effect size reduction makes the study marginal.');
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: reducedEffect,
        impact: 'moderate',
        description: `A 20% effect size reduction (to ${reducedEffect.toFixed(3)}) drops approximate power to ${(approxReducedPower * 100).toFixed(0)}%.`,
      });
    } else {
      score += 5;
      factors.push({
        parameter: 'effect_size',
        currentValue: input.effectSizeAssumption,
        breakingPoint: null,
        impact: 'low',
        description: 'Design tolerates a 20% effect size reduction reasonably well.',
      });
    }
  }

  return { score, factors, dependencies, failureModes };
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

  // Check what happens if attrition doubles
  const doubledAttrition = Math.min(attrition * 2, 0.60);
  const effectiveSampleRatio = (1 - doubledAttrition) / (1 - attrition);
  const powerImpact = effectiveSampleRatio; // Simplified — power scales with sqrt(n) but this gives direction

  if (attrition >= 0.30) {
    score += 20;
    failureModes.push(`Attrition of ${(attrition * 100).toFixed(0)}% is already high — further dropout is severely destabilizing.`);
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: `${(doubledAttrition * 100).toFixed(0)}%`,
      impact: 'high',
      description: `High baseline attrition (${(attrition * 100).toFixed(0)}%) leaves little room for enrollment surprises.`,
    });
  } else if (attrition >= 0.15) {
    score += 10;
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: `${(doubledAttrition * 100).toFixed(0)}%`,
      impact: 'moderate',
      description: `Moderate attrition assumption (${(attrition * 100).toFixed(0)}%). Design can tolerate some slippage.`,
    });
  } else {
    score += 5;
    factors.push({
      parameter: 'attrition',
      currentValue: `${(attrition * 100).toFixed(0)}%`,
      breakingPoint: null,
      impact: 'low',
      description: `Conservative attrition assumption (${(attrition * 100).toFixed(0)}%).`,
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
      // 50% variance increase
      const inflatedVariance = input.variance * 1.5;
      const powerReduction = 1 / Math.sqrt(1.5); // Approximate
      const approxNewPower = (input.computedPower ?? input.powerTarget) * powerReduction;

      if (approxNewPower < 0.70) {
        score += 20;
        failureModes.push('A 50% variance increase drops power below 70%.');
        factors.push({
          parameter: 'variance',
          currentValue: input.variance,
          breakingPoint: inflatedVariance,
          impact: 'high',
          description: `A 50% variance increase (to ${inflatedVariance.toFixed(2)}) drops approximate power to ${(approxNewPower * 100).toFixed(0)}%.`,
        });
      } else {
        score += 5;
        factors.push({
          parameter: 'variance',
          currentValue: input.variance,
          breakingPoint: null,
          impact: 'low',
          description: 'Design is reasonably robust to moderate variance increases.',
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
