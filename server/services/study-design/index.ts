/**
 * Study Design module — the design-as-data spine (USDM / ICH M11-aligned).
 *
 * Public surface for the structured study-design object, its deterministic gates, and
 * the seeded synthetic-twin outcome simulator. Persistence, SoA, SAP/protocol projection
 * and governance are added in subsequent slices; this barrel exposes the object model,
 * the §2/§3/§4/§6/§10/§17 validation, and the evidence-grounded trial simulator that
 * everything else builds on.
 *
 * @module server/services/study-design
 */

export * from './study-design-types';
export {
  type DesignFinding,
  type FindingSeverity,
  estimandGate,
  endpointRedFlags,
  frameworkRules,
  multiplicityGate,
  powerRedFlags,
  runAllGates,
} from './design-gates';
export {
  type DesignRiskLevel,
  type DesignValidationReport,
  validateDesign,
} from './design-validation';
export {
  type EvidenceObservation,
  type EffectPrior,
  type PriorBasis,
  type BuildEffectPriorOptions,
  buildEffectPrior,
} from './evidence-prior';
export {
  type SimulationAssumptions,
  type TrialSimulationReport,
  type SyntheticTwinSummary,
  type EstimateDistribution,
  type SensitivityPoint,
  type AssumptionsLedger,
  type DefensibilitySnapshot,
  simulateTrial,
  normalApproxPower,
} from './trial-simulator';
export {
  type PersistContext,
  type StudyDesignRows,
  type StudyDesignSummary,
  STUDY_DESIGN_META_KIND,
  studyDesignToRows,
  rowsToStudyDesign,
  persistStudyDesignTx,
  deleteStudyDesignTx,
  loadStudyDesign,
  listStudyDesigns,
} from './study-design-repository';
export {
  type ExtractOptions,
  type CsrEvidenceResult,
  extractEffectObservation,
  gatherCsrEffectEvidence,
} from './csr-evidence-source';
