/**
 * The worked examples Biostatistics opens on and offers (surfaces/Biostatistics.tsx). Each is a complete design
 * in the engine's StatisticalInput shape (server/services/ana-biostats/types.ts): the engine assumes no input, so
 * an example missing one opens the page on a refusal. __tests__/biostatWorkedExamplesSize.test.ts sizes each on the
 * real engine.
 */
import type { EngineInput } from './Biostatistics';

export const BIOSTAT_WORKED_EXAMPLES: Record<string, { label: string; input: EngineInput }> = {
  survival: { label: 'Pivotal OS (survival)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.90, effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, interimAnalyses: 2, comparatorType: 'placebo', estimandStrategy: 'treatment_policy', missingDataMethod: 'MMRM', indication: 'Oncology', phase: 'Phase III' } },
  binary: { label: 'ORR (binary)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'binary', alpha: 0.05, powerTarget: 0.90, effectSize: 0.15, controlRate: 0.30, treatmentRate: 0.45, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, comparatorType: 'placebo', phase: 'Phase III' } },
  ni: { label: 'Non-inferiority', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'EMA', studyType: 'non_inferiority', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.025, powerTarget: 0.90, effectSize: 0.0, nonInferiorityMargin: -0.4, variance: 1, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2, comparatorType: 'active', phase: 'Phase III' } },
  ivd: { label: 'Diagnostic accuracy', input: { clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy', endpointType: 'sensitivity_specificity', alpha: 0.05, powerTarget: 0.90, effectSize: 0.9, sensitivity: 0.90, specificity: 0.92, prevalence: 0.30, nonInferiorityMargin: 0.05, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 1, numberOfEndpoints: 2 } },
  // Two designs the engine has always sized and no control could ask for.
  roc: { label: 'ROC / AUC', input: { clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy', endpointType: 'auc_roc', alpha: 0.05, powerTarget: 0.80, effectSize: 0, aucTarget: 0.85, aucNull: 0.50, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2 } },
  crossover: { label: '2×2 crossover', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.05, powerTarget: 0.80, effectSize: 0.5, variance: 1, crossoverPeriods: 2, withinSubjectCorrelation: 0.5, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2 } },
};
