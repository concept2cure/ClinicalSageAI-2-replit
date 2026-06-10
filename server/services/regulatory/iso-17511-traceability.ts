/**
 * Metrological traceability of calibrators — ISO 17511:2020.
 *
 * Pure and deterministic. Closes the audit gap "metrological traceability of
 * calibrators (ISO 17511) — absent", required for IVDR Annex I §9.1 and FDA
 * analytical validation.
 *
 * ISO 17511 defines a hierarchy of calibrator value assignment:
 *   higher-order reference measurement procedure (RMP) + certified reference
 *   material (CRM) → manufacturer's selected measurement procedure → working
 *   calibrator → end-user routine result. Commutability of reference materials
 *   must be demonstrated for the chain to be valid.
 */

/** Ordered traceability tiers, strongest → weakest (ISO 17511 §5). */
export const TRACEABILITY_TIERS = [
  'si_unit', // traceable to SI via a reference measurement procedure + CRM
  'international_conventional_rmp', // international RMP, no SI realization
  'international_conventional_crm', // international CRM, no RMP
  'manufacturer_selected_rmp', // manufacturer's own RMP
  'manufacturer_working_calibrator', // in-house working calibrator only
] as const;
export type TraceabilityTier = (typeof TRACEABILITY_TIERS)[number];

export interface TraceabilityChainInput {
  /** Highest tier the calibrator chain reaches. */
  tier: TraceabilityTier;
  /** A certified reference material is identified at the top of the chain. */
  certifiedReferenceMaterial: boolean;
  /** A reference measurement procedure is documented. */
  referenceMeasurementProcedure: boolean;
  /** Commutability of the reference material with clinical samples is demonstrated. */
  commutabilityDemonstrated: boolean;
  /** Uncertainty is propagated and stated for the end-user result. */
  uncertaintyBudgetDocumented: boolean;
  /** The chain is unbroken (each step's value assigned by the step above). */
  unbrokenChain: boolean;
}

export interface TraceabilityAssessment {
  tier: TraceabilityTier;
  tierRank: number;
  /** 0–1 completeness across the ISO 17511 evidence elements. */
  completenessScore: number;
  /** Whether the chain is metrologically valid for marketing. */
  valid: boolean;
  gaps: string[];
  /** Recommended next step to strengthen the chain. */
  recommendation: string;
}

const TIER_RECOMMENDATION: Record<TraceabilityTier, string> = {
  si_unit: 'Maintain SI traceability; periodically re-verify CRM lots and commutability.',
  international_conventional_rmp:
    'Document uncertainty propagation from the international RMP; pursue SI realization if feasible.',
  international_conventional_crm:
    'Establish a reference measurement procedure to anchor the international CRM.',
  manufacturer_selected_rmp:
    'Seek a higher-order international RMP or CRM to elevate the chain above manufacturer-internal.',
  manufacturer_working_calibrator:
    'Establish a manufacturer reference measurement procedure; an internal working calibrator alone is the weakest defensible tier.',
};

/** Assess a calibrator traceability chain against ISO 17511:2020. */
export function assessTraceability(input: TraceabilityChainInput): TraceabilityAssessment {
  const tierRank = TRACEABILITY_TIERS.indexOf(input.tier);
  const checks = [
    input.certifiedReferenceMaterial || input.referenceMeasurementProcedure,
    input.commutabilityDemonstrated,
    input.uncertaintyBudgetDocumented,
    input.unbrokenChain,
  ];
  const completenessScore = checks.filter(Boolean).length / checks.length;

  const gaps: string[] = [];
  if (!input.certifiedReferenceMaterial && !input.referenceMeasurementProcedure) {
    gaps.push('No certified reference material or reference measurement procedure anchors the chain.');
  }
  if (!input.commutabilityDemonstrated) {
    gaps.push('Commutability of the reference material with clinical samples is not demonstrated (ISO 17511 §6).');
  }
  if (!input.uncertaintyBudgetDocumented) {
    gaps.push('Measurement uncertainty is not propagated to the end-user result.');
  }
  if (!input.unbrokenChain) {
    gaps.push('Traceability chain is broken — a step is not value-assigned by the step above it.');
  }

  // Valid for marketing requires commutability + unbroken chain + uncertainty.
  const valid =
    gaps.length === 0 &&
    (input.certifiedReferenceMaterial || input.referenceMeasurementProcedure);

  return {
    tier: input.tier,
    tierRank,
    completenessScore,
    valid,
    gaps,
    recommendation: TIER_RECOMMENDATION[input.tier],
  };
}
