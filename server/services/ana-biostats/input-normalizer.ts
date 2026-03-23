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
    if (!raw.attritionRate) prefilled.push('attritionRate');

    const allocationRatio = raw.allocationRatio ?? 1;
    if (allocationRatio <= 0) {
      errors.push({ field: 'allocationRatio', message: 'Allocation ratio must be positive', required: true });
    }
    if (!raw.allocationRatio) prefilled.push('allocationRatio');

    // Effect size validation
    if (raw.effectSize === undefined || raw.effectSize === null) {
      if (raw.controlRate !== undefined && raw.treatmentRate !== undefined) {
        // Derive effect size from rates
        prefilled.push('effectSize (derived from rates)');
      } else if (raw.sensitivity !== undefined && raw.specificity !== undefined) {
        // Diagnostic track — effect size not directly needed
        prefilled.push('effectSize (diagnostic metrics used instead)');
      } else {
        errors.push({ field: 'effectSize', message: 'Effect size is required. Provide directly or via controlRate/treatmentRate.', required: true });
      }
    } else if (raw.effectSize <= 0) {
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
        if (!raw.sensitivity && !raw.specificity) {
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
        if (!raw.sensitivity && !raw.specificity) {
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
