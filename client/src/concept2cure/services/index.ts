/**
 * Concept2Cure Services Index
 * 
 * Unified service layer for all backend connectivity.
 * 
 * @module concept2cure/services
 * @version 3.0.0
 */

// Cortex Service (Lumen Cortex + Project Cortex)
export {
  CortexService,
  cortexService,
  cortexQueryKeys,
  CortexServiceError,
  type CortexMessage,
  type CortexArtifact,
  type CortexCitation,
  type CortexThread,
  type CortexSearchResult,
  type CortexHealth,
  type CortexStats,
  type RegulatorySignal,
  type SubmissionPrediction,
  type PredictionFactor,
  type PredictionRecommendation,
  type TokenUsage,
} from './cortexService';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE SERVICES - Phase 52 Sherpa System
// ═══════════════════════════════════════════════════════════════════════════════

// Regulatory Intelligence Service
export {
  regulatoryIntelligenceService,
  regulatoryQueryKeys,
  type RegulatoryAlert,
  type MAUDEEvent,
  type FDARecall,
  type FDAGuidance,
  type PDUFADate,
  type MorningBriefing,
  type AlertPriority,
} from './regulatoryIntelligenceService';

// Medical Device Service
export {
  medicalDeviceService,
  deviceQueryKeys,
  type DeviceProfile,
  type PredicateDevice,
  type PredicateEquivalenceAnalysis,
  type Submission510k,
  type EstarValidation,
  type CERReport,
  type MAUDEReport,
  type HazardAnalysis,
  type RegulatoryPathway,
} from './medicalDeviceService';

// Document Intelligence Service
export {
  documentIntelligenceService,
  documentQueryKeys,
  type Document,
  type DocumentVersion,
  type SmartTag,
  type Citation,
  type DocumentValidation,
  type ApprovalWorkflow,
  type ApprovalStep,
  type ContentSuggestion,
} from './documentIntelligenceService';

// CMC Service
export {
  cmcService,
  cmcQueryKeys,
  type Specification,
  type Impurity,
  type StabilityProtocol,
  type StabilityStudy,
  type BatchRecord,
  type ICHComplianceResult,
  type ICHGuideline,
} from './cmcService';
