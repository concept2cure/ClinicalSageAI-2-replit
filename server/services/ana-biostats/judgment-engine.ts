/**
 * AnA Biostats — Layer 3: Biostatistical Judgment Engine
 *
 * Rule-backed judgment modules on top of deterministic results.
 * No LLM involvement — all judgments are typed, reproducible, and reusable.
 * Feeds both AnA explanations and governed documents.
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  JudgmentVerdict,
  RiskLevel,
  ActionRecommendation,
  ConfidenceLevel,
  JudgmentDimension,
  FragilityAssessment,
  EndpointMethodFit,
  RoleExplanations,
} from './types';
import { phaseOf } from './input-normalizer';
import { computationEngine, ComputationRefusal } from './computation-engine';
import {
  COMPARATOR_LABELS,
  ENDPOINT_TYPE_LABELS,
  ESTIMAND_STRATEGY_LABELS,
  MISSING_DATA_METHOD_LABELS,
  STUDY_TYPE_LABELS,
  TRACK_LABELS,
  parameterLabel,
  vocabLabel,
  vocabPhrase,
} from '../../../shared/biostat-vocabulary';

/* Every phase rule below reads `phaseOf(input)` — the one reading of a phase
   as written ("Phase 3", "III", "2/3"), in input-normalizer.ts. Until
   2026-10-31 they compared `input.phase === 'III'` and no caller sent that, so
   none of them ever fired. Rationale and flag prose names vocabulary values by
   their labels (shared/biostat-vocabulary.ts); the verdicts stay the keys. */

/** The power below which a sensitivity point is a breakpoint. */
export const SENSITIVITY_POWER_THRESHOLD = 0.8;

function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/* Sensitivity points (GA-DEMO-05, 2026-11-10; repaired 2026-11-12). A
   breakpoint is the value at which the design's evaluable N stops giving 80%
   power, recomputed with the computation engine itself, so it carries each
   method's own reading of the effect (a hazard-ratio reduction, a rate
   difference, a margin). Until 2026-11-10 the effect point used
   1 − Φ(z_{1−α/2} − mult·z_power), which is under 80% at the first step for
   every design (always a 5% margin), and the attrition point was
   min(1.5 × attrition, 0.5) with a fixed 50% margin. A design already under
   80% power has no margin: its breakpoint is its current value. Margins are
   the relative change in the parameter. Whether a design is under 80% is said
   from the engine's own power (document-generator.ts), never from a rounded
   margin. */
type SensitivityPoint = FragilityAssessment['sensitiveParameters'][number];

/** The smallest multiple of the planned effect the breakpoint search tries. */
const EFFECT_SEARCH_FLOOR = 0.01;

/** Said when power holds at 80% down to the search floor: no breakpoint was found, so none is claimed. */
export const EFFECT_HOLDS_NOTE =
  'Power stays at or above 80% for every effect size tested, down to 1% of the planned effect, so no effect-size breakpoint was found.';

/** Said when the design could not be recomputed at 80% power: nothing was assessed, so nothing is claimed. */
export const SENSITIVITY_NOT_ASSESSED_NOTE =
  'Sensitivity to the effect size and the dropout rate was not assessed: the design could not be recomputed at 80% power.';

/** Evaluable N the engine needs for 80% power with the effect scaled by `mult`. */
function evaluableNeededAt80(input: StatisticalInput, mult: number): number {
  const rates = typeof input.controlRate === 'number' && typeof input.treatmentRate === 'number'
    ? { treatmentRate: input.controlRate + (input.treatmentRate - input.controlRate) * mult }
    : {};
  const scaled: StatisticalInput = {
    ...input,
    effectSize: input.effectSize * mult,
    powerTarget: SENSITIVITY_POWER_THRESHOLD,
    ...rates,
  };
  const n = computationEngine.compute(scaled).sampleSize.total;
  return Number.isFinite(n) ? n : Infinity;
}

/** As above, where a scaled effect outside the method's domain cannot be sized: no evaluable N reaches 80% there. */
function scaledNeededAt80(input: StatisticalInput, mult: number): number {
  try {
    return evaluableNeededAt80(input, mult);
  } catch (err) {
    if (err instanceof ComputationRefusal) return Infinity;
    throw err;
  }
}

/**
 * The evaluable N needed for 80% power at the planned effect, or null when the
 * design cannot be recomputed (the engine refuses it, or there is no effect or
 * N to scale). Only a refusal means "not assessed"; any other error is a
 * defect and is not swallowed.
 */
function baseNeededAt80(input: StatisticalInput, evaluableN: number): number | null {
  const scalable = Number.isFinite(input.effectSize) && input.effectSize !== 0
    && Number.isFinite(evaluableN) && evaluableN > 0;
  if (!scalable) return null;
  try {
    return evaluableNeededAt80(input, 1);
  } catch (err) {
    if (err instanceof ComputationRefusal) return null;
    throw err;
  }
}

/** Bisection between the floor and the planned effect for the smallest multiple whose 80%-power N fits. */
function smallestPoweredMultiple(input: StatisticalInput, evaluableN: number): number {
  let lo = EFFECT_SEARCH_FLOOR;
  let hi = 1;
  for (let i = 0; i < 40 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (scaledNeededAt80(input, mid) <= evaluableN) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The effect-size point, or null when power holds at 80% down to the search
 * floor (the floor is not a breakpoint, so it is never reported as one).
 */
function effectSizePoint(input: StatisticalInput, evaluableN: number, baseNeeded: number): SensitivityPoint | null {
  let breakpointMult = 1;
  if (baseNeeded <= evaluableN) {
    if (scaledNeededAt80(input, EFFECT_SEARCH_FLOOR) <= evaluableN) return null;
    breakpointMult = smallestPoweredMultiple(input, evaluableN);
  }
  return {
    parameter: 'effect_size',
    currentValue: input.effectSize,
    breakpointValue: roundTo(input.effectSize * breakpointMult, 4),
    percentMargin: roundTo((1 - breakpointMult) * 100, 1),
  };
}

/** The dropout rate at which the enrolled N leaves fewer evaluable subjects than 80% power needs. */
function attritionPoint(input: StatisticalInput, comp: ComputationResult, baseNeeded: number): SensitivityPoint | null {
  const enrolled = comp.adjustedTotal ?? comp.sampleSize.total;
  if (!(input.attritionRate > 0) || !Number.isFinite(enrolled) || enrolled <= 0) return null;
  const breakpointAttrition = Math.max(input.attritionRate, 1 - baseNeeded / enrolled);
  return {
    parameter: 'attrition_rate',
    currentValue: input.attritionRate,
    breakpointValue: roundTo(breakpointAttrition, 4),
    percentMargin: roundTo(((breakpointAttrition - input.attritionRate) / input.attritionRate) * 100, 1),
  };
}

/** Every sensitivity point the engine could recompute, and a note for each that it could not claim. */
function sensitivityPoints(input: StatisticalInput, comp: ComputationResult): { points: SensitivityPoint[]; notes: string[]; assessed: boolean } {
  const evaluableN = comp.sampleSize.total;
  const baseNeeded = baseNeededAt80(input, evaluableN);
  if (baseNeeded === null) return { points: [], notes: [SENSITIVITY_NOT_ASSESSED_NOTE], assessed: false };
  const points: SensitivityPoint[] = [];
  const notes: string[] = [];
  const effect = effectSizePoint(input, evaluableN, baseNeeded);
  if (effect) points.push(effect);
  else notes.push(EFFECT_HOLDS_NOTE);
  const attrition = attritionPoint(input, comp, baseNeeded);
  if (attrition) points.push(attrition);
  return { points, notes, assessed: true };
}

export class JudgmentEngine {

  judge(input: StatisticalInput, computation: ComputationResult): JudgmentResult {
    const dimensions = this.assessAllDimensions(input, computation);
    const fragility = this.assessFragility(input, computation);
    const endpointMethodFit = this.assessEndpointMethodFit(input, computation);
    const confidence = this.assessConfidence(input, computation, dimensions);

    const overallVerdict = this.deriveOverallVerdict(dimensions);
    const overallRisk = this.deriveOverallRisk(dimensions, fragility);
    const actionRecommendation = this.deriveAction(overallVerdict, overallRisk, confidence);
    const escalationReasons = this.collectEscalationReasons(dimensions, fragility, confidence);
    const roleExplanations = this.generateRoleExplanations(input, computation, overallVerdict, actionRecommendation, fragility);

    return {
      overallVerdict,
      overallRisk,
      actionRecommendation,
      confidence,
      dimensions,
      fragility,
      endpointMethodFit,
      escalationReasons,
      roleExplanations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Dimension assessments
  // ════════════════════════════════════════════════════════════════

  private assessAllDimensions(input: StatisticalInput, comp: ComputationResult): JudgmentDimension[] {
    return [
      this.assessPowerAdequacy(input, comp),
      this.assessSampleSizeAdequacy(input, comp),
      this.assessAssumptionQuality(input, comp),
      this.assessDesignAppropriateness(input, comp),
      this.assessAttritionRisk(input, comp),
      this.assessOverinterpretationRisk(input, comp),
      this.assessMultiplicity(input, comp),
      this.assessEstimandClarity(input, comp),
      this.assessMissingDataRisk(input, comp),
      this.assessComparatorAppropriateness(input, comp),
    ];
  }

  private assessPowerAdequacy(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const power = comp.power;
    let verdict: JudgmentVerdict;
    let score: number;
    const flags: string[] = [];

    if (power >= 0.90) {
      verdict = 'adequate'; score = 95;
    } else if (power >= 0.80) {
      verdict = 'adequate'; score = 80;
    } else if (power >= 0.70) {
      verdict = 'marginal'; score = 55;
      flags.push('Power below 80% — may draw regulatory scrutiny');
    } else if (power >= 0.50) {
      verdict = 'inadequate'; score = 30;
      flags.push('Power below 70% — study likely underpowered');
      flags.push('Consider increasing sample size or effect size assumption');
    } else {
      verdict = 'inadequate'; score = 10;
      flags.push('Power critically low — study would be futile at this sample size');
    }

    // Phase-specific calibration
    if (phaseOf(input) === 'III' && power < 0.80) {
      flags.push('Phase III confirmatory trial with <80% power is a significant regulatory risk');
      score = Math.min(score, 25);
      verdict = 'inadequate';
    }

    return {
      name: 'Power Adequacy',
      verdict,
      score,
      rationale: `Achieved power: ${(power * 100).toFixed(1)}%. ${power >= 0.80 ? 'Meets standard regulatory threshold.' : 'Below standard 80% threshold.'}`,
      flags,
    };
  }

  private assessSampleSizeAdequacy(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 80;
    let verdict: JudgmentVerdict = 'adequate';

    // Check if sample size seems too small for the context
    if (comp.sampleSize.total < 20) {
      verdict = 'marginal';
      score = 40;
      flags.push('Very small sample size — statistical validity may be limited');
    }

    // Check if attrition adjustment is significant
    if (input.attritionRate > 0.20 && comp.adjustedTotal) {
      const overhead = comp.adjustedTotal - comp.sampleSize.total;
      const overheadPct = (overhead / comp.sampleSize.total) * 100;
      if (overheadPct > 30) {
        flags.push(`Attrition adjustment adds ${overheadPct.toFixed(0)}% overhead — high dropout may signal feasibility concerns`);
        score -= 15;
      }
    }

    // Phase III confirmatory considerations
    if (phaseOf(input) === 'III' && comp.sampleSize.total < 100) {
      flags.push('Phase III with <100 total subjects is unusual — verify regulatory alignment');
      score -= 20;
      verdict = 'marginal';
    }

    // Device single-arm considerations
    if (input.clientTrack === 'medical_device' && input.studyType === 'performance' && comp.sampleSize.total < 50) {
      flags.push('Device performance study with <50 subjects may face FDA scrutiny');
    }

    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Sample Size Adequacy',
      verdict,
      score,
      rationale: `Total N=${comp.sampleSize.total} (${comp.adjustedTotal ?? comp.sampleSize.total} after attrition adjustment). ${comp.sampleSize.groups} groups with ${comp.sampleSize.perGroup} per group.`,
      flags,
    };
  }

  private assessAssumptionQuality(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;

    const highSensitivity = comp.assumptions.filter(a => a.sensitivity === 'high');
    const defaulted = comp.assumptions.filter(a => a.source === 'default');

    if (highSensitivity.length > 3) {
      score -= 10;
      flags.push(`${highSensitivity.length} high-sensitivity assumptions — results are fragile to input changes`);
    }

    if (defaulted.length > 2) {
      score -= 15;
      flags.push(`${defaulted.length} parameters used default values — user should verify these match the actual study context`);
    }

    // Effect size plausibility
    if (input.endpointType === 'continuous' && input.effectSize > 1.0) {
      flags.push('Large effect size assumed — verify with literature or pilot data');
      score -= 10;
    }

    if (input.endpointType === 'binary') {
      const diff = Math.abs((input.treatmentRate ?? 0) - (input.controlRate ?? 0));
      if (diff > 0.30) {
        flags.push(`Treatment difference of ${(diff * 100).toFixed(0)}% is large — ensure this is clinically plausible`);
        score -= 10;
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Assumption Quality',
      verdict,
      score,
      rationale: `${comp.assumptions.length} assumptions evaluated. ${highSensitivity.length} are high-sensitivity, ${defaulted.length} used defaults.`,
      flags,
    };
  }

  private assessDesignAppropriateness(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;

    // Check study type / endpoint coherence
    if (input.endpointType === 'time_to_event' && input.studyType === 'equivalence') {
      flags.push('Equivalence testing for time-to-event endpoints is methodologically complex — ensure proper justification');
      score -= 10;
    }

    if (input.clientTrack === 'diagnostics_ivd' && input.studyType === 'superiority') {
      flags.push('Superiority design is unusual for diagnostic studies — consider diagnostic accuracy or agreement designs');
      score -= 15;
    }

    if (input.studyType === 'adaptive' && !input.interimAnalyses) {
      flags.push('Adaptive design specified but no interim analyses defined');
      score -= 20;
    }

    if (input.studyType === 'non_inferiority' && !input.nonInferiorityMargin) {
      flags.push('Non-inferiority design without a defined margin — this is a critical gap');
      score -= 30;
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Design Appropriateness',
      verdict,
      score,
      rationale: `${vocabLabel(STUDY_TYPE_LABELS, input.studyType)} design with a ${vocabPhrase(ENDPOINT_TYPE_LABELS, input.endpointType)} endpoint, ${vocabPhrase(TRACK_LABELS, input.clientTrack)} track.`,
      flags,
    };
  }

  private assessAttritionRisk(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 90;

    if (input.attritionRate > 0.30) {
      score = 40;
      flags.push('Attrition >30% — feasibility at serious risk, consider retention strategies');
    } else if (input.attritionRate > 0.20) {
      score = 60;
      flags.push('Attrition 20-30% — above typical range, ensure dropout assumptions are evidence-based');
    } else if (input.attritionRate > 0.15) {
      score = 75;
      flags.push('Attrition 15-20% — within acceptable range but monitor closely');
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Attrition Sensitivity',
      verdict,
      score,
      rationale: `Assumed dropout rate: ${(input.attritionRate * 100).toFixed(0)}%. Adjusted total: ${comp.adjustedTotal ?? 'N/A'}.`,
      flags,
    };
  }

  private assessOverinterpretationRisk(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 90;

    // Single-arm studies
    if (input.studyType === 'single_arm') {
      score -= 15;
      flags.push('Single-arm design limits causal inference — results should be interpreted with caution');
    }

    // Small sample + many endpoints
    if (comp.sampleSize.total < 50 && input.objectiveType !== 'dose_finding') {
      score -= 10;
      flags.push('Small sample size increases risk of overinterpreting results');
    }

    // Optimistic effect size
    if (comp.scenarios && comp.scenarios.length > 0) {
      const conservative = comp.scenarios.find(s => s.label.includes('Conservative'));
      if (conservative && conservative.sampleSize.total > comp.sampleSize.total * 1.5) {
        flags.push('Conservative scenario requires >50% more subjects — base case may be optimistic');
        score -= 10;
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Overinterpretation Risk',
      verdict,
      score,
      rationale: `Study type: ${vocabPhrase(STUDY_TYPE_LABELS, input.studyType)}. Design complexity and sample size considered.`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NEW: Multiplicity Assessment
  // ════════════════════════════════════════════════════════════════

  private assessMultiplicity(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 90;
    const endpoints = input.numberOfEndpoints ?? 1;

    if (endpoints <= 1) {
      return {
        name: 'Multiplicity Control',
        verdict: 'adequate',
        score: 95,
        rationale: 'Single primary endpoint — no multiplicity concern.',
        flags: [],
      };
    }

    if (!input.multiplicityMethod || input.multiplicityMethod === 'none') {
      if (phaseOf(input) === 'III') {
        score = 25;
        flags.push(`Phase III with ${endpoints} endpoints and no multiplicity correction — regulatory rejection risk`);
      } else {
        score = 50;
        flags.push(`${endpoints} endpoints without multiplicity adjustment — inflated type I error`);
      }
    } else {
      if (comp.multiplicityResult) {
        const impact = comp.multiplicityResult.sampleSizeImpact;
        if (impact > 50) {
          score = 60;
          flags.push(`${input.multiplicityMethod} correction increases required sample size by ~${impact}%`);
        }
        flags.push(`Using ${input.multiplicityMethod}: per-comparison alpha = ${comp.multiplicityResult.effectiveFamilyAlpha.toFixed(4)}`);
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Multiplicity Control',
      verdict,
      score,
      rationale: `${endpoints} endpoint(s). ${input.multiplicityMethod ? `Method: ${input.multiplicityMethod}.` : 'No correction specified.'}`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NEW: Estimand Clarity Assessment
  // ════════════════════════════════════════════════════════════════

  private assessEstimandClarity(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;

    // ICH E9(R1) requires estimand framework for pharma
    if (input.clientTrack === 'biotech_pharma') {
      if (!input.estimandStrategy) {
        const phase = phaseOf(input);
        if (phase === 'III' || phase === 'II') {
          score = 40;
          flags.push('No estimand strategy specified — ICH E9(R1) requires explicit estimand framework for confirmatory trials');
          flags.push('Specify: population, variable, intercurrent event handling, summary measure');
        } else {
          score = 70;
          flags.push('Estimand strategy not specified — recommended per ICH E9(R1)');
        }
      } else {
        flags.push(`Estimand strategy: ${vocabPhrase(ESTIMAND_STRATEGY_LABELS, input.estimandStrategy)}`);
        if (input.estimandStrategy === 'treatment_policy' && input.attritionRate > 0.20) {
          score -= 10;
          flags.push('Treatment policy estimand with high dropout may not reflect true treatment effect');
        }
      }
    } else {
      // Device and IVD — estimand framework less strictly required but becoming standard
      if (!input.estimandStrategy) {
        score = 80;
        // No penalty for device/IVD without explicit estimand
      }
    }

    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Estimand Clarity',
      verdict,
      score,
      rationale: `${input.estimandStrategy ? `Estimand: ${vocabPhrase(ESTIMAND_STRATEGY_LABELS, input.estimandStrategy)} strategy.` : 'No estimand framework specified.'} ${input.clientTrack === 'biotech_pharma' ? 'ICH E9(R1) compliance expected.' : ''}`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NEW: Missing Data Risk Assessment
  // ════════════════════════════════════════════════════════════════

  private assessMissingDataRisk(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;
    const missingRate = input.expectedMissingRate ?? input.attritionRate;

    if (missingRate > 0.30) {
      score = 30;
      flags.push(`Expected missing data rate of ${(missingRate * 100).toFixed(0)}% is very high — power and bias seriously affected`);
    } else if (missingRate > 0.20) {
      score = 55;
      flags.push(`Missing data rate of ${(missingRate * 100).toFixed(0)}% requires robust handling method`);
    } else if (missingRate > 0.10) {
      score = 75;
      flags.push(`Missing data rate of ${(missingRate * 100).toFixed(0)}% is manageable but should be addressed in SAP`);
    }

    if (!input.missingDataMethod) {
      if (phaseOf(input) === 'III') {
        score -= 15;
        flags.push('No missing data handling method specified for Phase III — pre-specify in SAP');
      } else {
        score -= 5;
        flags.push('Missing data handling method not specified');
      }
    } else {
      flags.push(`Method: ${vocabLabel(MISSING_DATA_METHOD_LABELS, input.missingDataMethod)}`);
      if (input.missingDataMethod === 'LOCF') {
        score -= 10;
        flags.push('LOCF is no longer recommended as primary analysis by FDA/EMA — consider MMRM or MI');
      }
      if (input.missingDataMethod === 'complete_case' && missingRate > 0.10) {
        score -= 15;
        flags.push('Complete case analysis with >10% missing data may introduce selection bias');
      }
    }

    // Missing data impact from computation
    if (comp.missingDataImpact) {
      if (comp.missingDataImpact.powerReduction > 0.10) {
        flags.push(`Power reduced by ${(comp.missingDataImpact.powerReduction * 100).toFixed(1)}% due to missing data`);
        score -= 10;
      }
      if (comp.missingDataImpact.biasRisk === 'high') {
        flags.push('High bias risk from missing data pattern');
        score -= 15;
      }
    }

    score = Math.max(0, score);
    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Missing Data Risk',
      verdict,
      score,
      rationale: `Expected missing rate: ${(missingRate * 100).toFixed(0)}%. ${input.missingDataMethod ? `Handling: ${vocabPhrase(MISSING_DATA_METHOD_LABELS, input.missingDataMethod)}.` : 'No method specified.'}`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NEW: Comparator Appropriateness
  // ════════════════════════════════════════════════════════════════

  private assessComparatorAppropriateness(input: StatisticalInput, comp: ComputationResult): JudgmentDimension {
    const flags: string[] = [];
    let score = 85;
    const comparator = input.comparatorType ?? 'placebo';

    if (input.studyType === 'single_arm') {
      if (input.clientTrack === 'biotech_pharma' && phaseOf(input) === 'III') {
        score = 35;
        flags.push('Single-arm Phase III — limited regulatory acceptance without strong justification');
      } else if (input.clientTrack === 'medical_device') {
        score = 70;
        flags.push('Single-arm device study acceptable with justified performance goal');
      }
      return {
        name: 'Comparator Appropriateness',
        verdict: score < 50 ? 'inadequate' : score < 70 ? 'marginal' : 'adequate',
        score,
        rationale: 'Single-arm design — no active comparator.',
        flags,
      };
    }

    if (comparator === 'placebo') {
      if (input.studyType === 'non_inferiority') {
        score = 30;
        flags.push('Placebo comparator in non-inferiority design is contradictory — NI requires active control');
      }
      flags.push('Placebo control — ethical justification required per Declaration of Helsinki');
    }

    if (comparator === 'historical') {
      score -= 15;
      flags.push('Historical control introduces potential bias from temporal changes in standard of care');
      if (phaseOf(input) === 'III') {
        score -= 15;
        flags.push('Historical control rarely acceptable for Phase III confirmatory evidence');
      }
    }

    if (comparator === 'active') {
      if (input.studyType === 'non_inferiority' && !input.nonInferiorityMargin) {
        score -= 20;
        flags.push('Active comparator with NI design requires clinically justified margin');
      } else {
        flags.push('Active comparator — appropriate for NI/superiority design');
      }
    }

    if (comparator === 'performance_goal') {
      if (input.clientTrack !== 'medical_device') {
        score -= 10;
        flags.push('Performance goal comparator is primarily used in device studies');
      }
    }

    score = Math.max(0, score);
    let verdict: JudgmentVerdict = 'adequate';
    if (score < 50) verdict = 'inadequate';
    else if (score < 70) verdict = 'marginal';

    return {
      name: 'Comparator Appropriateness',
      verdict,
      score,
      rationale: `Comparator: ${vocabPhrase(COMPARATOR_LABELS, comparator)}. Study type: ${vocabPhrase(STUDY_TYPE_LABELS, input.studyType)}.`,
      flags,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Fragility assessment
  // ════════════════════════════════════════════════════════════════

  assessFragility(input: StatisticalInput, comp: ComputationResult): FragilityAssessment {
    const { points: sensitiveParams, notes, assessed } = sensitivityPoints(input, comp);
    const effectPoint = sensitiveParams.find(p => p.parameter === 'effect_size');

    // Compute fragility index
    let fragilityIndex = 0;
    if (comp.power < 0.85) fragilityIndex += 20;
    if (comp.power < 0.80) fragilityIndex += 20;
    // A sensitivity that could not be assessed keeps the penalty: missing
    // points never make a design read less fragile.
    if (!assessed || (effectPoint !== undefined && effectPoint.percentMargin < 20)) fragilityIndex += 25;
    if (input.attritionRate > 0.20) fragilityIndex += 15;
    if (comp.sampleSize.total < 50) fragilityIndex += 10;
    const defaultCount = comp.assumptions.filter(a => a.source === 'default').length;
    fragilityIndex += defaultCount * 5;
    fragilityIndex = Math.min(fragilityIndex, 100);

    let category: FragilityAssessment['category'];
    if (fragilityIndex <= 20) category = 'robust';
    else if (fragilityIndex <= 40) category = 'moderate';
    else if (fragilityIndex <= 65) category = 'fragile';
    else category = 'very_fragile';

    const narrative = [this.buildFragilityNarrative(category, sensitiveParams, comp), ...notes].join(' ');

    return { fragilityIndex, category, sensitiveParameters: sensitiveParams, narrative };
  }

  private buildFragilityNarrative(
    category: FragilityAssessment['category'],
    params: FragilityAssessment['sensitiveParameters'],
    comp: ComputationResult
  ): string {
    switch (category) {
      case 'robust':
        return `The design is robust. Power of ${(comp.power * 100).toFixed(1)}% provides adequate margin, and assumptions are well-supported.`;
      case 'moderate':
        return `The design is moderately sensitive to assumptions. ${params.length > 0 ? `Key parameter(s) have ${params[0].percentMargin.toFixed(0)}% margin before power drops below threshold.` : ''} Consider sensitivity analyses in the SAP.`;
      case 'fragile':
        return `The design is fragile. Small changes in assumptions (especially ${params.map(p => parameterLabel(p.parameter).toLowerCase()).join(', ')}) could undermine study conclusions. Strongly recommend formal sensitivity analysis and contingency planning.`;
      case 'very_fragile':
        return `The design is very fragile and should be revisited. Multiple assumptions are at or near breakpoints. The study risks being underpowered under realistic scenario variations. Recommend revising assumptions or increasing sample size before proceeding.`;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Endpoint-Method fit assessment
  // ════════════════════════════════════════════════════════════════

  assessEndpointMethodFit(input: StatisticalInput, comp: ComputationResult): EndpointMethodFit {
    const suggested = this.suggestMethod(input);
    const current = comp.method;

    // Check if current method aligns with suggested
    const suggestedLower = suggested.toLowerCase();
    const currentLower = current.toLowerCase();

    let fit: EndpointMethodFit['fit'];
    if (currentLower.includes(suggestedLower.split(' ')[0])) {
      fit = 'strong';
    } else if (this.areMethodsCompatible(currentLower, suggestedLower)) {
      fit = 'acceptable';
    } else {
      fit = 'weak';
    }

    return {
      fit,
      suggestedMethod: suggested,
      currentMethod: current,
      rationale: this.methodFitRationale(input, fit),
      alternatives: this.getAlternativeMethods(input),
    };
  }

  private suggestMethod(input: StatisticalInput): string {
    if (input.clientTrack === 'diagnostics_ivd') {
      switch (input.endpointType) {
        case 'sensitivity_specificity': return 'Exact binomial confidence interval';
        case 'agreement': return 'Cohen\'s kappa / Fleiss\' kappa';
        case 'auc_roc': return 'DeLong\'s test for AUC comparison';
        default: return 'Diagnostic accuracy analysis';
      }
    }

    switch (input.endpointType) {
      case 'continuous':
        if (input.studyType === 'non_inferiority') return 'Two-sample t-test (non-inferiority)';
        if (input.studyType === 'equivalence') return 'TOST equivalence test';
        if ((input.numberOfGroups ?? 2) > 2) return 'ANOVA with post-hoc tests';
        return 'Two-sample t-test';
      case 'binary':
        if (input.studyType === 'non_inferiority') return 'Two-proportion z-test (non-inferiority)';
        if (input.studyType === 'single_arm') return 'Exact binomial test';
        return 'Chi-squared test / Fisher\'s exact test';
      case 'time_to_event':
        return 'Log-rank test with Cox proportional hazards';
      case 'ordinal':
        return 'Wilcoxon rank-sum test / proportional odds model';
      case 'count':
        return 'Poisson regression / negative binomial regression';
      case 'composite':
        return 'Win ratio / component-wise testing';
      default:
        return 'Two-sample t-test';
    }
  }

  private areMethodsCompatible(a: string, b: string): boolean {
    const groups = [
      ['t-test', 'anova', 'ancova', 'mixed model'],
      ['z-test', 'chi-squared', 'fisher', 'logistic'],
      ['log-rank', 'cox', 'kaplan-meier', 'survival'],
      ['wilcoxon', 'mann-whitney', 'rank-sum', 'kruskal'],
      ['binomial', 'clopper-pearson', 'exact'],
    ];
    for (const group of groups) {
      const aMatch = group.some(m => a.includes(m));
      const bMatch = group.some(m => b.includes(m));
      if (aMatch && bMatch) return true;
    }
    return false;
  }

  private methodFitRationale(input: StatisticalInput, fit: EndpointMethodFit['fit']): string {
    switch (fit) {
      case 'strong': return `The statistical method is well-matched to the ${input.endpointType} endpoint and ${input.studyType} design.`;
      case 'acceptable': return `The method is acceptable but a more specific approach may improve precision for ${input.endpointType} endpoints.`;
      case 'weak': return `The current method may not be optimal for ${input.endpointType} endpoints in a ${input.studyType} design. Consider alternatives.`;
      case 'mismatch': return `The method does not align with the endpoint type. This could be flagged in regulatory review.`;
    }
  }

  private getAlternativeMethods(input: StatisticalInput): string[] {
    const alts: string[] = [];
    switch (input.endpointType) {
      case 'continuous':
        alts.push('ANCOVA with baseline adjustment', 'Mixed-effects model for repeated measures (MMRM)', 'Bayesian adaptive design');
        break;
      case 'binary':
        alts.push('Logistic regression', 'Mantel-Haenszel stratified test', 'Exact conditional test');
        break;
      case 'time_to_event':
        alts.push('Restricted mean survival time (RMST)', 'Weighted log-rank test', 'Accelerated failure time model');
        break;
    }
    return alts;
  }

  // ════════════════════════════════════════════════════════════════
  // Overall derivation
  // ════════════════════════════════════════════════════════════════

  private deriveOverallVerdict(dimensions: JudgmentDimension[]): JudgmentVerdict {
    const scores = dimensions.map(d => d.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const hasCritical = dimensions.some(d => d.verdict === 'inadequate');

    if (hasCritical) return 'inadequate';
    if (avg >= 80) return 'adequate';
    if (avg >= 60) return 'marginal';
    return 'inadequate';
  }

  private deriveOverallRisk(dimensions: JudgmentDimension[], fragility: FragilityAssessment): RiskLevel {
    const inadequateCount = dimensions.filter(d => d.verdict === 'inadequate').length;
    const marginalCount = dimensions.filter(d => d.verdict === 'marginal').length;

    if (inadequateCount >= 2 || fragility.category === 'very_fragile') return 'critical';
    if (inadequateCount >= 1 || fragility.category === 'fragile') return 'high';
    if (marginalCount >= 2 || fragility.category === 'moderate') return 'moderate';
    return 'low';
  }

  private deriveAction(verdict: JudgmentVerdict, risk: RiskLevel, confidence: ConfidenceLevel): ActionRecommendation {
    if (verdict === 'inadequate' || risk === 'critical') return 'escalate';
    if (verdict === 'marginal' || risk === 'high') return 'revise';
    if (confidence.level === 'low' || confidence.level === 'very_low') return 'proceed_with_conditions';
    return 'proceed';
  }

  private assessConfidence(input: StatisticalInput, comp: ComputationResult, dimensions: JudgmentDimension[]): ConfidenceLevel {
    const factors: string[] = [];
    const limitations: string[] = [];
    let score = 85;

    // Power-based confidence
    if (comp.power >= 0.90) {
      factors.push('High power (≥90%)');
    } else if (comp.power >= 0.80) {
      factors.push('Standard power (≥80%)');
    } else {
      limitations.push(`Power below standard threshold (${(comp.power * 100).toFixed(1)}%)`);
      score -= 20;
    }

    // Assumption quality
    const defaults = comp.assumptions.filter(a => a.source === 'default').length;
    if (defaults > 2) {
      limitations.push(`${defaults} parameters used default values`);
      score -= defaults * 5;
    } else {
      factors.push('Most parameters user-specified');
    }

    // Design appropriateness
    const designScore = dimensions.find(d => d.name === 'Design Appropriateness')?.score ?? 80;
    if (designScore < 70) {
      limitations.push('Design appropriateness concerns');
      score -= 10;
    }

    // Track-specific caveats
    if (input.clientTrack === 'diagnostics_ivd' && !input.prevalence) {
      limitations.push('Prevalence not specified — PPV/NPV are estimates');
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));
    let level: ConfidenceLevel['level'];
    if (score >= 80) level = 'high';
    else if (score >= 60) level = 'moderate';
    else if (score >= 40) level = 'low';
    else level = 'very_low';

    return { level, score, factors, limitations };
  }

  private collectEscalationReasons(dimensions: JudgmentDimension[], fragility: FragilityAssessment, confidence: ConfidenceLevel): string[] {
    const reasons: string[] = [];

    for (const dim of dimensions) {
      if (dim.verdict === 'inadequate') {
        reasons.push(`${dim.name}: ${dim.flags[0] || dim.rationale}`);
      }
    }

    if (fragility.category === 'very_fragile') {
      reasons.push(`Design fragility: ${fragility.narrative}`);
    }

    if (confidence.level === 'very_low') {
      reasons.push('Overall confidence is very low — human biostatistician review recommended');
    }

    return reasons;
  }

  // ════════════════════════════════════════════════════════════════
  // Role-aware explanations
  // ════════════════════════════════════════════════════════════════

  private generateRoleExplanations(
    input: StatisticalInput,
    comp: ComputationResult,
    verdict: JudgmentVerdict,
    action: ActionRecommendation,
    fragility: FragilityAssessment
  ): RoleExplanations {
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    const powerPct = (comp.power * 100).toFixed(1);
    const trackLabel = input.clientTrack === 'biotech_pharma' ? 'pharma/biotech' : input.clientTrack === 'medical_device' ? 'device' : 'diagnostic';

    return {
      technical: `${comp.method} yields N=${n} (${comp.sampleSize.perGroup}/group) at ${powerPct}% power, α=${input.alpha}. Effect size: ${input.effectSize}. Fragility: ${fragility.category.replace(/_/g, ' ')} (index ${fragility.fragilityIndex}). ${fragility.sensitiveParameters.map(p => `${parameterLabel(p.parameter)} has ${p.percentMargin}% margin to breakpoint`).join('; ')}.`,

      clinical: `This ${trackLabel} study requires ${n} subjects total to detect the expected treatment effect with ${powerPct}% confidence. ${verdict === 'adequate' ? 'The design is statistically sound.' : verdict === 'marginal' ? 'The design has some statistical concerns that should be addressed.' : 'The design has significant statistical limitations.'}${input.attritionRate > 0.15 ? ` Note: a ${(input.attritionRate * 100).toFixed(0)}% dropout rate is assumed.` : ''}`,

      regulatory: `The sample size of ${n} subjects provides ${powerPct}% power using ${comp.method}. ${action === 'proceed' ? 'The statistical design appears defensible for regulatory submission.' : action === 'revise' ? 'Consider strengthening the statistical rationale before submission — potential review concerns identified.' : action === 'escalate' ? 'Significant statistical gaps exist that would likely be identified in regulatory review.' : 'The design is acceptable but may benefit from additional justification in specific areas.'}`,

      executive: `${verdict === 'adequate' ? '✓ Study design is statistically sound' : verdict === 'marginal' ? '⚠ Study design needs attention' : '✗ Study design has significant issues'}. ${n} subjects needed. ${action === 'proceed' ? 'Ready to proceed.' : action === 'revise' ? 'Revisions recommended before proceeding.' : action === 'escalate' ? 'Escalation to senior biostatistician recommended.' : 'Proceed with noted conditions.'}`,
    };
  }
}

export const judgmentEngine = new JudgmentEngine();
