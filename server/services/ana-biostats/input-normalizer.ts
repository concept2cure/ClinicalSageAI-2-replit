/**
 * AnA Biostats — Layer 1: Structured Statistical Input Normalization
 *
 * Validates, normalizes, and enriches statistical workflow inputs.
 * Prefills from project context where available.
 * Rejects vague free-text when structure is required.
 */

import type {
  StatisticalInput,
  InputValidationResult,
  InputWarning,
  InputError,
  ClientTrack,
  EndpointType,
  StudyType,
} from './types';
import { phaseNumber, phaseNumbers } from '../../../shared/clinical-phase';

/** The four clinical phases the judgment rules are written against. */
export type CanonicalPhase = 'I' | 'II' | 'III' | 'IV';

/**
 * A study phase as written, read as the phase the judgment rules compare.
 *
 * ── Why this exists (2026-10-31) ─────────────────────────────────────────────
 * The judgment engine, the domain adapter and the SME router compare
 * `input.phase === 'III'` / `'II'`, but no caller sends that: the bridge's
 * design adapter sends "Phase III", the workbench "Phase 3", the presets
 * "Phase III", AnA "3" or "2/3". So every phase rule was dead on every path —
 * a Phase III design with no estimand was rated ADEQUATE on estimand clarity
 * (score 70, the non-confirmatory branch) instead of INADEQUATE (40).
 *
 * The reading is `shared/clinical-phase.ts`'s, the one the CMC program stage
 * and the Module 2 summaries already use, so the three cannot disagree about
 * what a study is: "Phase 2", "Phase II", "2", "2b", "IIb" → II.
 *
 * A seamless or combined phase is read as its HIGHEST phase — "2/3" and
 * "Phase II/III" → III, "1/2" → II. That is the conservative choice: a
 * seamless Phase 2/3 study carries a confirmatory component, so it is held to
 * the confirmatory rules rather than excused from them. The normalizer says so
 * in a warning whenever it applies.
 *
 * Phase 4 / IV is recognised here because shared/clinical-phase reads only
 * 1–3. Anything else (blank, "N/A", "pilot", "0") is undefined: no phase rule
 * applies, and the normalizer warns that the phase was not recognised rather
 * than guessing one.
 *
 * Idempotent: `canonicalPhase('III') === 'III'`. The engines call it at every
 * rule because the bridge (biostatistics-bridge/bridge-service.ts) feeds the
 * judgment engine the adapter's input directly, without this normalizer.
 */
export function canonicalPhase(raw: unknown): CanonicalPhase | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  const n = phaseNumber(text);
  if (n !== null) return n === 3 ? 'III' : n === 2 ? 'II' : 'I';
  return /\b(iv|4)[ab]?\b/i.test(text.replace(/phase|_|-/gi, ' ')) ? 'IV' : undefined;
}

/** The phase the judgment rules read, from any input — normalized or not. */
export function phaseOf(input: { phase?: unknown }): CanonicalPhase | undefined {
  return canonicalPhase(input.phase);
}

/** "Phase III" — the canonical phase as a reader writes it. */
export function phaseDisplay(phase: unknown): string | undefined {
  const p = canonicalPhase(phase);
  return p ? `Phase ${p}` : undefined;
}

/** The warning that says how a stated phase was read, or none when it needs no comment. */
function phaseWarning(raw: unknown): InputWarning | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const canonical = canonicalPhase(raw);
  if (!canonical) {
    return {
      field: 'phase',
      message: `The phase "${String(raw).trim()}" is not one the engine recognises (I, II, III or IV), so no phase-specific rule was applied.`,
      suggestion: 'State the phase as 1, 2, 3 or 4',
    };
  }
  if (new Set(phaseNumbers(raw)).size > 1) {
    return {
      field: 'phase',
      message: `The phase "${String(raw).trim()}" names more than one phase. It is judged as Phase ${canonical}, the stricter of them.`,
    };
  }
  return null;
}

/** A stated missing-data strategy as it is carried: trimmed, bounded, or absent. */
function statedStrategy(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  return text ? text.slice(0, 500) : undefined;
}

export class InputNormalizer {

  /**
   * Validate and normalize a raw statistical input request.
   */
  normalize(raw: Partial<StatisticalInput>): InputValidationResult {
    const warnings: InputWarning[] = [];
    const errors: InputError[] = [];
    const prefilled: string[] = [];

    // Required fields
    if (!raw.clientTrack) {
      errors.push({ field: 'clientTrack', message: 'Client track is required (biotech_pharma, medical_device, or diagnostics_ivd)', required: true });
    }
    if (!raw.studyType) {
      errors.push({ field: 'studyType', message: 'Study type is required', required: true });
    }
    if (!raw.objectiveType) {
      errors.push({ field: 'objectiveType', message: 'Objective type is required', required: true });
    }
    if (!raw.endpointType) {
      errors.push({ field: 'endpointType', message: 'Endpoint type is required', required: true });
    }

    // Apply defaults and validate numeric ranges
    const alpha = raw.alpha ?? 0.05;
    if (alpha <= 0 || alpha >= 1) {
      errors.push({ field: 'alpha', message: 'Alpha must be between 0 and 1 (exclusive)', required: true });
    } else if (alpha > 0.1) {
      warnings.push({ field: 'alpha', message: `Alpha of ${alpha} is unusually high. Standard is 0.05 (two-sided) or 0.025 (one-sided).`, suggestion: 'Consider using 0.05' });
    }
    if (!raw.alpha) prefilled.push('alpha');

    const powerTarget = raw.powerTarget ?? 0.80;
    if (powerTarget <= 0 || powerTarget >= 1) {
      errors.push({ field: 'powerTarget', message: 'Power target must be between 0 and 1 (exclusive)', required: true });
    } else if (powerTarget < 0.70) {
      warnings.push({ field: 'powerTarget', message: `Power target of ${powerTarget} is below standard thresholds. Regulatory agencies typically expect ≥0.80.`, suggestion: 'Consider 0.80 or 0.90' });
    }
    if (!raw.powerTarget) prefilled.push('powerTarget');

    const attritionRate = raw.attritionRate ?? 0.15;
    if (attritionRate < 0 || attritionRate >= 1) {
      errors.push({ field: 'attritionRate', message: 'Attrition rate must be between 0 and 1', required: false });
    } else if (attritionRate > 0.30) {
      warnings.push({ field: 'attritionRate', message: `Attrition rate of ${(attritionRate * 100).toFixed(0)}% is high. Ensure this is justified.` });
    }
    if (raw.attritionRate == null) prefilled.push('attritionRate');

    const allocationRatio = raw.allocationRatio ?? 1;
    if (allocationRatio <= 0) {
      errors.push({ field: 'allocationRatio', message: 'Allocation ratio must be positive', required: true });
    }
    if (!raw.allocationRatio) prefilled.push('allocationRatio');

    // Effect size validation
    /* Not every design is sized on its effect size, and those that are not usually state it as zero.
       A non-inferiority design is sized on (δ − Δ_NI) and most assume a true difference of 0; an
       equivalence design is sized on its margin with the true difference taken as 0; an ROC design is
       sized on its AUC and never reads the effect size (computation-engine.ts, in as many words).
       Until 2026-11-12 "Effect size must be positive" refused all three here, in front of an engine
       that sizes them — so the "Non-inferiority" and "ROC / AUC" worked examples answered a red
       refusal on the Biostatistics screen. The margin, or the AUC, is still required below. */
    const sizedOnSomethingElse =
      (raw.studyType === 'non_inferiority' && Boolean(raw.nonInferiorityMargin)) ||
      (raw.studyType === 'equivalence' && Boolean(raw.equivalenceMargin)) ||
      raw.endpointType === 'auc_roc';
    if (raw.effectSize === undefined || raw.effectSize === null) {
      if (sizedOnSomethingElse) {
        prefilled.push('effectSize (not used: the design is sized on its margin or its AUC)');
      } else if (raw.controlRate !== undefined && raw.treatmentRate !== undefined) {
        // Derive effect size from rates
        prefilled.push('effectSize (derived from rates)');
      } else if (raw.sensitivity !== undefined && raw.specificity !== undefined) {
        // Diagnostic track — effect size not directly needed
        prefilled.push('effectSize (diagnostic metrics used instead)');
      } else {
        errors.push({ field: 'effectSize', message: 'Effect size is required. Provide directly or via controlRate/treatmentRate.', required: true });
      }
    } else if (raw.effectSize <= 0 && !sizedOnSomethingElse) {
      errors.push({ field: 'effectSize', message: 'Effect size must be positive', required: true });
    }

    // Track-specific validation
    if (raw.clientTrack) {
      this.validateTrackSpecific(raw, warnings, errors);
    }

    // Study type specific validation
    if (raw.studyType) {
      this.validateStudyTypeSpecific(raw, warnings, errors);
    }

    // How the stated phase is read by the phase rules — said when it needs saying.
    const phaseNote = phaseWarning(raw.phase);
    if (phaseNote) warnings.push(phaseNote);

    const normalizedInput: StatisticalInput = {
      projectId: raw.projectId,
      clientTrack: raw.clientTrack as ClientTrack ?? 'biotech_pharma',
      regulatoryBody: raw.regulatoryBody,
      studyType: raw.studyType as StudyType ?? 'superiority',
      objectiveType: raw.objectiveType ?? 'efficacy',
      endpointType: raw.endpointType as EndpointType ?? 'continuous',
      alpha,
      powerTarget,
      effectSize: raw.effectSize ?? this.deriveEffectSize(raw),
      variance: raw.variance,
      eventRate: raw.eventRate,
      controlRate: raw.controlRate,
      treatmentRate: raw.treatmentRate,
      sensitivity: raw.sensitivity,
      specificity: raw.specificity,
      prevalence: raw.prevalence,
      nonInferiorityMargin: raw.nonInferiorityMargin,
      equivalenceMargin: raw.equivalenceMargin,
      attritionRate,
      allocationRatio,
      comparatorType: raw.comparatorType ?? 'placebo',
      methodPreference: raw.methodPreference,
      contextArtifactId: raw.contextArtifactId,
      contextDocumentId: raw.contextDocumentId,
      contextSectionRef: raw.contextSectionRef,
      indication: raw.indication,
      /* Kept as the sponsor wrote it, so a governed document never restates a
         "Phase 2/3" study as "Phase III". Every phase RULE reads it through
         `phaseOf` above — the one reading, applied wherever a rule asks. */
      phase: raw.phase,
      numberOfGroups: raw.numberOfGroups ?? 2,
      followUpDuration: raw.followUpDuration,
      interimAnalyses: raw.interimAnalyses,
      // Enhancement fields
      crossoverPeriods: raw.crossoverPeriods,
      withinSubjectCorrelation: raw.withinSubjectCorrelation,
      numberOfEndpoints: raw.numberOfEndpoints,
      multiplicityMethod: raw.multiplicityMethod,
      estimandStrategy: raw.estimandStrategy,
      missingDataMethod: raw.missingDataMethod,
      // The design's own words for a strategy the engine does not model; never beside a modelled method.
      missingDataStrategyStated: raw.missingDataMethod ? undefined : statedStrategy(raw.missingDataStrategyStated),
      expectedMissingRate: raw.expectedMissingRate,
      numberOfMeasurements: raw.numberOfMeasurements,
      compoundSymmetryRho: raw.compoundSymmetryRho,
      agreementTarget: raw.agreementTarget,
      aucTarget: raw.aucTarget,
      aucNull: raw.aucNull,
    };

    return {
      valid: errors.length === 0,
      normalizedInput,
      warnings,
      errors,
      prefilled,
    };
  }

  private deriveEffectSize(raw: Partial<StatisticalInput>): number {
    if (raw.controlRate !== undefined && raw.treatmentRate !== undefined) {
      return Math.abs(raw.treatmentRate - raw.controlRate);
    }
    if (raw.sensitivity !== undefined && raw.specificity !== undefined) {
      // For diagnostic studies, use sensitivity as the primary metric target
      return raw.sensitivity;
    }
    return 0;
  }

  private validateTrackSpecific(
    raw: Partial<StatisticalInput>,
    warnings: InputWarning[],
    errors: InputError[]
  ): void {
    switch (raw.clientTrack) {
      case 'biotech_pharma':
        if (!raw.indication) {
          warnings.push({ field: 'indication', message: 'Indication is recommended for pharma/biotech studies to enable regulatory precedent lookup' });
        }
        if (!raw.phase) {
          warnings.push({ field: 'phase', message: 'Study phase helps calibrate expectations and regulatory framing' });
        }
        break;

      case 'medical_device':
        if (raw.studyType === 'superiority' && !raw.nonInferiorityMargin) {
          warnings.push({
            field: 'studyType',
            message: 'Most device studies use non-inferiority or equivalence designs. Superiority may require stronger justification.',
            suggestion: 'Consider non_inferiority or equivalence'
          });
        }
        break;

      case 'diagnostics_ivd':
        // An ROC design is sized on its AUC; it has no sensitivity or specificity target to give.
        if (raw.endpointType !== 'auc_roc' && !raw.sensitivity && !raw.specificity) {
          warnings.push({ field: 'sensitivity/specificity', message: 'Diagnostic studies typically require sensitivity and specificity targets' });
        }
        if (!raw.prevalence) {
          warnings.push({ field: 'prevalence', message: 'Prevalence is needed to compute PPV/NPV and adjust sample size for diagnostic studies' });
        }
        break;
    }
  }

  private validateStudyTypeSpecific(
    raw: Partial<StatisticalInput>,
    warnings: InputWarning[],
    errors: InputError[]
  ): void {
    switch (raw.studyType) {
      case 'non_inferiority':
        if (!raw.nonInferiorityMargin) {
          errors.push({ field: 'nonInferiorityMargin', message: 'Non-inferiority margin is required for NI studies', required: true });
        }
        break;

      case 'equivalence':
        if (!raw.equivalenceMargin) {
          errors.push({ field: 'equivalenceMargin', message: 'Equivalence margin is required for equivalence studies', required: true });
        }
        break;

      case 'diagnostic_accuracy':
        if (raw.endpointType === 'auc_roc') {
          // The engine refuses this too, in its own words; saying it here names the field beside the inputs.
          if (typeof raw.aucTarget !== 'number') {
            errors.push({ field: 'aucTarget', message: 'An ROC / AUC design needs the expected AUC (aucTarget).', required: true });
          }
        } else if (!raw.sensitivity && !raw.specificity) {
          errors.push({ field: 'sensitivity/specificity', message: 'At least sensitivity or specificity target is required for diagnostic accuracy studies', required: true });
        }
        break;

      case 'adaptive':
        if (!raw.interimAnalyses) {
          warnings.push({ field: 'interimAnalyses', message: 'Number of interim analyses should be specified for adaptive designs', suggestion: 'Consider 1-3 interim looks' });
        }
        break;
    }
  }
}

export const inputNormalizer = new InputNormalizer();
