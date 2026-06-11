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
  type RiskFactor,
  type OpenQuestion,
  type KeyDecision,
  type LearnedInsight,
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
  JUDGMENT_FRAMEWORK_VERSION,
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
  persistPatternRegistry,
  loadPatternRegistry,
  PATTERN_REGISTRY_VERSION,
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
  getSectionHistory,
  getRecurringPatterns,
  persistSignals,
  type SignalType,
  type SignalProvenance,
  type IntelligenceSignal,
  type SignalSummary,
  type SignalQuery,
  type PersistenceResult,
  type TrendConfidence,
} from './signal-capture.js';

export {
  runRIMAssessment,
  quickPatternScan,
  getProjectSignals,
  RIM_VERSION,
  type RIMContext,
  type RIMAssessment,
  type RIMRun,
  type RIMRunStatus,
} from './rim.js';

export {
  enrichChangeImpact,
  type RIMChangeInsight,
  type RIMChangeEnrichment,
} from './rim-change-impact.js';

export {
  interceptChatResponse,
  interceptComplianceScan,
  interceptArtifactChange,
  interceptFeedback,
  type ChatInterceptInput,
  type ComplianceScanInterceptInput,
  type ArtifactChangeInterceptInput,
  type FeedbackInterceptInput,
} from './rim-interceptors.js';

export {
  analyzeCrossArtifactIntelligence,
  type CrossArtifactIssue,
  type CrossArtifactReport,
} from './rim-cross-artifact.js';

export {
  buildProvenance,
  integratePatternScan,
  integrateJudgmentReport,
  integrateSignal,
  persistPatterns,
  type RIMRunType,
  type RIMIntegrationResult,
  type RIMIntegrationContext,
} from './rim-integration.js';

// NOTE: proactive-commitment-engine was removed with the formal drop of the
// staged charter tables (decision register #727, item 10) — it was a pure
// computation engine typed against the dropped charterSections/timelinePhases/
// projectCommitments rows and had no consumers. The MDX-specific peer lives in
// server/services/ana-ri/mdx-proactive-signals.ts.

export {
  interceptFabricDecision,
  buildRIMContextForFabric,
  type FabricDecisionInterceptInput,
  type RIMFabricContext,
  type GovernedFabricLearningEvent,
} from './fabric-signal-bridge.js';
