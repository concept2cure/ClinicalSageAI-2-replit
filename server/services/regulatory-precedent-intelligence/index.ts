/**
 * Regulatory Precedent Intelligence Engine
 *
 * Unified exports for all regulatory precedent intelligence services:
 * - CRL Trigger Patterns & Trajectory Analysis
 * - RTF Trigger Patterns & Recovery Playbooks
 * - EMA Question Pattern Taxonomy
 * - Advisory Committee Risk Factor Engine
 * - Precedent Application Rules & Confidence Calibration
 * - Cross-Jurisdictional Intelligence (ICH/Orbis/Access Consortium)
 *
 * @module server/services/regulatory-precedent-intelligence
 */

export { crlTriggerService } from './crl-trigger-service';
export type {
  CRLTriggerPattern, CRLCategory, CRLTrajectoryRecord,
  CRLRiskAssessment, TrajectoryPrediction, MitigationStrategy,
  CRLSearchInput, TrajectorySearchInput
} from './crl-trigger-service';

export { rtfTriggerService } from './rtf-trigger-service';
export type {
  RTFTriggerPattern, RTFCategory, RTFPreventionReport,
  PreventionItem, RecoveryStep, RTFSearchInput
} from './rtf-trigger-service';

export { emaQuestionTaxonomyService } from './ema-question-taxonomy-service';
export type {
  EMAQuestionPattern, EMAProcedurePhase, EMAQuestionCategory,
  EMAQuestionType, EMAPreparationReport, PreparationGuidanceItem,
  EMASearchInput
} from './ema-question-taxonomy-service';

export { advisoryCommitteeService } from './advisory-committee-service';
export type {
  AdvisoryCommitteePattern, ACRiskCategory, ACRiskAssessment,
  ACRiskFactor, ACPreparationItem, ACSearchInput
} from './advisory-committee-service';

export { confidenceCalibrationService } from './confidence-calibration-service';
export type {
  PrecedentApplicationRule, RuleType, ConfidenceCalibrationEntry,
  ConfidenceScore, CalibrationReport, ConfidenceModifier, RuleSearchInput
} from './confidence-calibration-service';

export { crossJurisdictionalService } from './cross-jurisdictional-service';
export type {
  CrossJurisdictionalFramework, FrameworkType,
  JurisdictionalDivergence, DivergenceDomain,
  ReliancePathway, RelianceType,
  FilingSequenceStrategy, FilingStep, ParallelWindow,
  FilingOptimizationResult
} from './cross-jurisdictional-service';
