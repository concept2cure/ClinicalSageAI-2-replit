/**
 * Module 1 — Power Adequacy Judgment
 *
 * Takes deterministic power/sample-size results and classifies whether
 * the design is adequately powered, marginal, underpowered, or indeterminate.
 *
 * Rule-backed classification — no LLM involvement.
 *
 * @module server/services/biostatistics-judgment/power-adequacy
 */

import type { StudyDesignInput, PowerAdequacyJudgment, PowerClassification } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

const POWER_THRESHOLDS = {
  adequate: 0.80,
  marginal_lower: 0.70,
  underpowered: 0.70,
  strong: 0.90,
} as const;

const PHASE_POWER_EXPECTATIONS: Record<string, number> = {
  'I': 0.70,
  'I/II': 0.75,
  'II': 0.80,
  'II/III': 0.80,
  'III': 0.80,
  'IV': 0.80,
};

const ATTRITION_CONCERN_THRESHOLD = 0.20;
const HIGH_ATTRITION_THRESHOLD = 0.30;

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export function judgePowerAdequacy(input: StudyDesignInput): PowerAdequacyJudgment {
  const rationale: string[] = [];
  const concerns: string[] = [];
  const recommendedActions: string[] = [];

  // Determine effective power
  const effectivePower = input.computedPower ?? input.powerTarget;
  const phaseExpectation = PHASE_POWER_EXPECTATIONS[input.phase] ?? 0.80;

  // Check for indeterminate cases
  if (!effectivePower || effectivePower <= 0 || effectivePower > 1) {
    return {
      classification: 'indeterminate',
      rationale: ['Power value is missing, zero, or invalid — cannot classify adequacy.'],
      concerns: ['No reliable power estimate available for this design.'],
      effectivePower: null,
      powerGap: null,
      recommendedActions: ['Provide valid effect size and variance estimates to compute power.'],
    };
  }

  if (!input.effectSizeAssumption || input.effectSizeAssumption <= 0) {
    concerns.push('Effect size assumption is missing or zero — power calculation may be unreliable.');
    recommendedActions.push('Verify effect size assumption against historical data or pilot studies.');
  }

  // Classify power
  let classification: PowerClassification;
  const powerGap = effectivePower - phaseExpectation;

  if (effectivePower >= POWER_THRESHOLDS.strong) {
    classification = 'adequate';
    rationale.push(`Power of ${(effectivePower * 100).toFixed(1)}% exceeds 90% — strong statistical design.`);
  } else if (effectivePower >= POWER_THRESHOLDS.adequate) {
    classification = 'adequate';
    rationale.push(`Power of ${(effectivePower * 100).toFixed(1)}% meets the standard 80% threshold.`);
    if (effectivePower < 0.85) {
      rationale.push('Power is adequate but leaves limited margin for assumption slippage.');
    }
  } else if (effectivePower >= POWER_THRESHOLDS.marginal_lower) {
    classification = 'marginal';
    rationale.push(
      `Power of ${(effectivePower * 100).toFixed(1)}% is between 70-80% — marginal for ${input.phase} trial.`
    );
    concerns.push('Marginal power increases the risk of a failed trial due to minor assumption deviations.');
    recommendedActions.push('Consider increasing sample size by 10-20% or re-evaluating effect size assumptions.');
  } else {
    classification = 'underpowered';
    rationale.push(
      `Power of ${(effectivePower * 100).toFixed(1)}% is below 70% — this design is underpowered.`
    );
    concerns.push('An underpowered trial has a high probability of failing to detect a true treatment effect.');
    concerns.push('Regulatory reviewers will likely flag this as a design deficiency.');
    recommendedActions.push('Increase sample size substantially or reconsider the study design.');
    recommendedActions.push('Re-evaluate whether the assumed effect size is realistic.');
  }

  // Attrition impact
  if (input.attritionAssumption >= HIGH_ATTRITION_THRESHOLD) {
    concerns.push(
      `Attrition assumption of ${(input.attritionAssumption * 100).toFixed(0)}% is high — ` +
      `effective power after dropout may be substantially lower.`
    );
    recommendedActions.push('Model power under realistic dropout scenarios, not just target attrition.');
    if (classification === 'adequate') {
      classification = 'marginal';
      rationale.push('Downgraded from adequate to marginal due to high attrition assumption.');
    }
  } else if (input.attritionAssumption >= ATTRITION_CONCERN_THRESHOLD) {
    concerns.push(
      `Attrition assumption of ${(input.attritionAssumption * 100).toFixed(0)}% warrants attention — ` +
      `ensure sample size inflation accounts for this.`
    );
  }

  // Phase-specific concerns
  if (input.phase === 'III' && classification !== 'adequate') {
    concerns.push('Phase III trials with less-than-adequate power carry significant regulatory and commercial risk.');
    recommendedActions.push('Phase III designs should target ≥80% power with conservative assumptions.');
  }

  // Effect size realism check
  if (input.effectSizeAssumption > 0) {
    const effectSizeInfo = assessEffectSizeRealism(input);
    if (effectSizeInfo.concern) {
      concerns.push(effectSizeInfo.concern);
    }
    if (effectSizeInfo.rationale) {
      rationale.push(effectSizeInfo.rationale);
    }
  }

  // Allocation ratio check
  if (input.allocationRatio !== 1) {
    const imbalanceImpact = Math.abs(1 - input.allocationRatio);
    if (imbalanceImpact > 1) {
      concerns.push(
        `Allocation ratio of ${input.allocationRatio}:1 significantly reduces effective sample size — ` +
        `power may be lower than nominal.`
      );
    }
  }

  return {
    classification,
    rationale,
    concerns,
    effectivePower,
    powerGap,
    recommendedActions,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EFFECT SIZE REALISM
// ═══════════════════════════════════════════════════════════════════════════════

function assessEffectSizeRealism(
  input: StudyDesignInput
): { concern?: string; rationale?: string } {
  // For continuous endpoints, check if effect size relative to variance seems optimistic
  if (input.endpointType === 'continuous' && input.variance && input.variance > 0) {
    const standardizedEffect = input.effectSizeAssumption / Math.sqrt(input.variance);
    if (standardizedEffect > 0.8) {
      return {
        concern: `Standardized effect size of ${standardizedEffect.toFixed(2)} is large (Cohen's d > 0.8) — ` +
          `verify this is supported by prior data, not optimistic planning.`,
      };
    }
    if (standardizedEffect < 0.2) {
      return {
        rationale: `Standardized effect size of ${standardizedEffect.toFixed(2)} is small — ` +
          `large sample sizes are expected.`,
      };
    }
  }

  // For binary endpoints
  if (input.endpointType === 'binary' && input.controlRate && input.treatmentRate) {
    const diff = Math.abs(input.treatmentRate - input.controlRate);
    if (diff > 0.30) {
      return {
        concern: `Assumed treatment difference of ${(diff * 100).toFixed(0)}% is very large — ` +
          `rarely seen outside early-phase oncology. Verify with existing evidence.`,
      };
    }
  }

  // For time-to-event
  if (input.endpointType === 'time_to_event' && input.hazardRatio) {
    if (input.hazardRatio < 0.5) {
      return {
        concern: `Hazard ratio of ${input.hazardRatio.toFixed(2)} implies >50% risk reduction — ` +
          `exceptionally optimistic for most indications.`,
      };
    }
  }

  return {};
}
