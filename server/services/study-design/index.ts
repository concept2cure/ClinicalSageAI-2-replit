/**
 * Study Design module — the design-as-data spine (USDM / ICH M11-aligned).
 *
 * Public surface for the structured study-design object, its deterministic gates, and
 * the seeded synthetic-twin outcome simulator. Persistence, the Schedule of Activities and
 * the protocol projection have shipped; SAP projection and governance follow in subsequent
 * slices. This barrel exposes the object model, the §2/§3/§4/§6/§7/§10/§17 validation, the
 * SoA and protocol projections, the structured eligibility model and the registry-filing
 * requirements/statutory clocks, and the evidence-grounded trial simulator everything builds on.
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
  isUuid,
  StudyDesignPersistRefusal,
  STUDY_DESIGN_REFUSAL_STATUS,
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
  type RegistrationEligibilityStructure,
  type RegistrationModule,
  type RegistrationRecord,
  projectRegistration,
  projectAllRegistrations,
} from './registration-projection';
export {
  type EligibilityStructure,
  type EligibilityUnparsedReason,
  type StructuredEligibilityCriterion,
  type EligibilityFinding,
  type EligibilityFindingStatus,
  type EligibilityFindingSeverity,
  type EligibilityCounts,
  type EligibilityVerdict,
  type EligibilityAssessment,
  type EligibilityRecordedFacts,
  type RegistryAgeLimit,
  type RegistryAbsentField,
  type RegistryEligibilityRow,
  type RegistryEligibilityBlock,
  ELIGIBILITY_BASIS,
  parseEligibilityCriterion,
  structureEligibility,
  assessEligibility,
  projectRegistryEligibility,
} from './eligibility-model';
export {
  type FilingRequirement,
  type ObligationStatus,
  type RegistryFilingContext,
  type PlacedRecord,
  type FilingExpectation,
  type FilingRow,
  type TimelinessObligation,
  type RegistryFilingCounts,
  type RegistryFiling,
  OBLIGATION_STATUSES,
  timelinessObligations,
  filingExpectations,
  buildRegistryFiling,
} from './registry-filing';
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
export {
  type BurdenCellState,
  type BurdenInvasiveness,
  type BurdenVisitInput,
  type BurdenActivityInput,
  type BurdenCellInput,
  type BurdenMatrix,
  type Measure,
  type NotComputedNote,
  type BurdenPeakVisit,
  type BurdenVisitLoad,
  type BurdenAssessmentLoad,
  type BurdenComplexity,
  type BurdenProfile,
  BURDEN_BASIS,
  BURDEN_SECTION,
  computeBurdenProfile,
  absentBurdenProfile,
} from './burden-model';
export {
  burdenMatrixFromDesign,
  burdenProfileForDesign,
  burdenMatrixFromProtocolSoaMatrix,
} from './burden-adapters';
export {
  type MeasureDelta,
  type VisitLoadChange,
  type BurdenDelta,
  compareBurden,
} from './burden-delta';
export {
  type DesignRegionMapping,
  type DesignRegionEvaluation,
  type UnmappedRegionField,
  type RegionFindingStatus,
  REGION_INPUT_FIELDS,
  DERIVED_REGION_INPUT_FIELDS,
  REGION_FINDING_SECTION,
  regionToAgency,
  regionFindingStatus,
  studyDesignToRegionInput,
  evaluateDesignRegionRules,
} from './region-rules-adapter';
