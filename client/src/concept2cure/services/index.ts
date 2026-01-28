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
