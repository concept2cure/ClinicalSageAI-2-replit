/**
 * Intelligence Layer — Barrel Export
 *
 * Single entry point for all intelligence services.
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
