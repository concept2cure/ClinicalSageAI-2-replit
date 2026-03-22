/**
 * Intelligence Layer — Barrel Export
 *
 * Single entry point for all intelligence services,
 * including the Regulatory Intelligence Model (RIM).
 *
 * @module server/services/intelligence
 */

export {
  generateRecommendations,
  type Recommendation,
  type RecommendationType,
  type EvidenceRef,
  type RecommendationContext,
  type RecommendationSet,
} from './recommendation-engine.js';

export {
  computeReadinessScore,
  type ReadinessScore,
  type ReadinessDimensions,
  type ModuleScore,
  type ReadinessGap,
  type TrendInfo,
  type ReadinessPredictions,
  type ReadinessContext,
} from './readiness-scoring-engine.js';

export {
  getOrCreateProfile,
  getProjectIntelligence,
  enrichProjectIntelligence,
  getProjectMemory,
  type ProjectIntelligenceSummary,
  type IntelligenceUpdatePayload,
} from './project-intelligence-service.js';

export {
  generateNextActions,
  type NextAction,
  type ActionCategory,
  type NextActionSet,
} from './next-best-action-engine.js';

export {
  recordFeedback,
  getFeedbackSummary,
  getDismissalPatterns,
  type FeedbackAction,
  type RecommendationFeedback,
  type FeedbackSummary,
} from './learning-loop-service.js';

export {
  buildEvidenceChain,
  computeConfidence,
  validateEvidenceChain,
  formatEvidenceForAudit,
  type EvidenceChain,
  type EvidenceSource,
  type EvidenceSourceType,
  type ConfidenceBasis,
  type ConfidenceFactors,
} from './evidence-confidence-model.js';

export {
  analyzeCrossModuleRelationships,
  type CrossModuleInsight,
  type CrossModuleInsightType,
  type CrossModuleReport,
  type CrossModuleContext,
} from './cross-module-intelligence.js';

// ── RIM: Regulatory Intelligence Model ──

export {
  generateJudgmentReport,
  evaluateEvidenceSufficiency,
  evaluateDefensibility,
  evaluateReviewerSensitivity,
  evaluateClaimRisk,
  evaluateCrossSectionConsistency,
  evaluateSubmissionRisk,
  type JudgmentModel,
  type JudgmentScore,
  type JudgmentVerdict,
  type JudgmentFactor,
  type JudgmentFinding,
  type JudgmentContext,
  type JudgmentReport,
  type JudgmentInput,
} from './judgment-framework.js';

export {
  patternRegistry,
  type PatternCategory,
  type RegulatoryAgency,
  type SubmissionType,
  type CTDModule,
  type RegulatoryPattern,
  type PatternMatch,
  type PatternSearchCriteria,
} from './pattern-registry.js';

export {
  captureJudgmentSignals,
  capturePatternSignals,
  captureSignal,
  querySignals,
  getSignalSummary,
  persistSignals,
  type SignalType,
  type IntelligenceSignal,
  type SignalSummary,
  type SignalQuery,
} from './signal-capture.js';

export {
  runRIMAssessment,
  quickPatternScan,
  getProjectSignals,
  type RIMContext,
  type RIMAssessment,
} from './rim.js';
