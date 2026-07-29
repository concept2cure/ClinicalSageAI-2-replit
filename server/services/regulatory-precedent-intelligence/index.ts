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

// Seed loaders — idempotent per organization. Real FDA / ICH citations,
// not placeholders. Re-runs skip patterns whose patternCode is already
// present so onboarding scripts can call them without guarding.
export { seedCrlTriggers } from './seeds/seed-crl-triggers';
export type { SeedCrlTriggersResult } from './seeds/seed-crl-triggers';
export { CRL_TRIGGER_PATTERNS } from './seeds/crl-trigger-patterns';
export type { CrlTriggerSeed } from './seeds/crl-trigger-patterns';

export { seedNonclinicalRtf } from './seeds/seed-nonclinical-rtf';
export type { SeedNonclinicalRtfResult } from './seeds/seed-nonclinical-rtf';
export { NONCLINICAL_RTF_PATTERNS } from './seeds/nonclinical-rtf-patterns';
export type { NonclinicalRtfSeed } from './seeds/nonclinical-rtf-patterns';

export { seedCmcRtf } from './seeds/seed-cmc-rtf';
export type { SeedCmcRtfResult } from './seeds/seed-cmc-rtf';
export { CMC_RTF_PATTERNS } from './seeds/cmc-rtf-patterns';
export type { CmcRtfSeed } from './seeds/cmc-rtf-patterns';

export { seedAdvisoryCommittee } from './seeds/seed-advisory-committee';
export type { SeedAdvisoryCommitteeResult } from './seeds/seed-advisory-committee';
export { ADVISORY_COMMITTEE_PATTERNS } from './seeds/advisory-committee-patterns';
export type { AdvisoryCommitteeSeed } from './seeds/advisory-committee-patterns';

export { seedEmaQuestions } from './seeds/seed-ema-questions';
export type { SeedEmaQuestionsResult } from './seeds/seed-ema-questions';
export { EMA_QUESTION_PATTERNS } from './seeds/ema-question-patterns';
export type { EmaQuestionSeed } from './seeds/ema-question-patterns';

export { seedCrossJurisdictional } from './seeds/seed-cross-jurisdictional';
export type { SeedCrossJurisdictionalResult } from './seeds/seed-cross-jurisdictional';
export { CROSS_JURISDICTIONAL_FRAMEWORKS } from './seeds/cross-jurisdictional-frameworks';
export type { CrossJurisdictionalSeed } from './seeds/cross-jurisdictional-frameworks';

export { seedConfidenceCalibration } from './seeds/seed-confidence-calibration';
export type { SeedConfidenceCalibrationResult } from './seeds/seed-confidence-calibration';
export { PRECEDENT_APPLICATION_RULES } from './seeds/precedent-application-rules';
export type { PrecedentApplicationRuleSeed } from './seeds/precedent-application-rules';

// Central orchestrator — call once per org on creation.
export { seedAllRegulatoryPatterns } from './seeds/seed-all-regulatory-patterns';
export type { SeedAllResult } from './seeds/seed-all-regulatory-patterns';
