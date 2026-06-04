/**
 * Study Design module — the design-as-data spine (USDM / ICH M11-aligned).
 *
 * Public surface for the structured study-design object, its deterministic gates, and
 * the seeded synthetic-twin outcome simulator. Persistence, the Schedule of Activities and
 * the protocol projection have shipped; SAP projection and governance follow in subsequent
 * slices. This barrel exposes the object model, the §2/§3/§4/§6/§7/§10/§17 validation, the
 * SoA and protocol projections, and the evidence-grounded trial simulator everything builds on.
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
  scheduleOfActivitiesGate,
  runAllGates,
} from './design-gates';
export {
  type SoaProjection,
  type SoaGridCell,
  type SoaGridRow,
  type SoaEpochSpan,
  type SoaIssue,
  projectScheduleOfActivities,
  analyzeScheduleOfActivities,
  summarizeSoaForProtocol,
  endpointTimeFrameFromSoa,
} from './schedule-of-activities';
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
export {
  type SolveSampleSizeOptions,
  type SampleSizeReport,
  solveSampleSize,
  sampleSizeForPower,
  sampleSizeForAssurance,
} from './sample-size';
export {
  type ProtocolDocument,
  type ProtocolSection,
  type SectionStatus,
  projectProtocol,
} from './protocol-projection';
export {
  type RegistrationRegistry,
  type RegistrationFieldStatus,
  type RegistrationField,
  type RegistrationModule,
  type RegistrationRecord,
  projectRegistration,
  projectAllRegistrations,
} from './registration-projection';
export {
  type CrfShell,
  type CrfForm,
  type CrfItem,
  type CrfFormOrigin,
  type CrfItemType,
  projectCrfShell,
} from './crf-shell';
export {
  type SapDocument,
  type SapSection,
  projectSap,
} from './sap-projection';
