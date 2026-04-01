/**
 * Server Services - Unified Index
 *
 * Single entry point for all server services.
 * Part of Q1 2026 consolidation sprint to reduce service sprawl.
 *
 * Service Categories:
 * - AI Services: OpenAI, Kimi, regulatory AI
 * - Document Services: CRUD, processing, ingestion
 * - Cortex Services: Knowledge graph, advisory, predictions
 * - FDA/Regulatory Services: 510k, PMA, IND, compliance
 * - CMC Services: Manufacturing, specs, analytics
 * - Clinical Services: CSR, studies, trials
 * - Infrastructure: Storage, export, notifications
 *
 * @module server/services
 * @version 2.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED SERVICE MODULES (Q1 2026 Consolidation)
// ═══════════════════════════════════════════════════════════════════════════════

export * as ai from './ai';
export * as documents from './documents';
export * as cortex from './cortex';
export * as fda from './fda';
export * as cer from './cer';
export * as csr from './csr';
export * as foresight from './foresight';
export * as literature from './literature';

// ═══════════════════════════════════════════════════════════════════════════════
// AI SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as openaiService } from './openai-service';
export { default as kimiAIService } from './kimiAIService';
// regulatoryAIServicePhase3 — REMOVED (was a stub returning empty objects)

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as documentService } from './documentService';
export { default as pdfGenerator } from './pdfGenerator';
export { default as enhancedPdfBuilder } from './enhancedPdfBuilder';

// ═══════════════════════════════════════════════════════════════════════════════
// CORTEX PRIME SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as cortexPrimeService } from './cortexPrimeService';
export { default as foresightKnowledgeGraph } from './foresight-knowledge-graph';
export { default as memoryService } from './memory-service';

// ═══════════════════════════════════════════════════════════════════════════════
// FDA / REGULATORY SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as fdaService } from './fdaService';
export { default as eSTARValidator } from './eSTARValidator';
export { default as FDAFormGenerator } from './FDAFormGenerator';
export { default as part11ComplianceService } from './part11ComplianceService';
export { default as regulatoryIntelligenceService } from './regulatory-intelligence-service';

// ═══════════════════════════════════════════════════════════════════════════════
// 510K SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as fda510kDocumentGenerator } from './fda510kDocumentGenerator';
// Additional 510k services exposed via routes/fda510k-unified.ts

// ═══════════════════════════════════════════════════════════════════════════════
// CMC SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export * as cmc from './cmc';
export { default as cmcBlueprintService } from './cmcBlueprintService';

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL / CSR SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as csrSearchService } from './csr-search-service';
export { default as csrKnowledgeExtractor } from './csr-knowledge-extractor';
export { default as csrForesightOrchestrator } from './csr-foresight-orchestrator';
export { default as clinicalIntelligenceService } from './clinical-intelligence-service';

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY DESIGN SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as studyDesignAgentService } from './study-design-agent-service';
export { default as endpointRecommenderService } from './endpoint-recommender-service';
export { default as powerSampleSizeService } from './power-sample-size-service';
export { default as sapGeneratorService } from './sap-generator-service';

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS / INTELLIGENCE SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as monteCarloService } from './monte-carlo-service';
export { default as reportGeneratorService } from './report-generator-service';

// ═══════════════════════════════════════════════════════════════════════════════
// DATA SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as harvestEngine } from './harvestEngine.js';
export { default as dataHarvester } from './dataHarvester.js';
export { EnhancedFAERSClient, fetchFaersAnalysis } from './enhancedFaersService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as s3Storage } from './s3-storage';
export { ExportService } from './export-service';
export { notifyOverride } from './notify';
export { TemplateService } from './templateService';

// ═══════════════════════════════════════════════════════════════════════════════
// COLLABORATION SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { MultiAgentCouncilService } from './multi-agent-council';
export {
  ForesightFeedbackOrchestrator,
  feedbackOrchestrator,
} from './foresight-feedback-orchestrator';

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 SERVICES - eCTD Co-Author + Document Drafting
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ArtifactSkeletonGenerator,
  artifactSkeletonGenerator,
} from './documents/ArtifactSkeletonGenerator';

export { ECTDScaffoldingService, ectdScaffoldingService } from './ectd/ECTDScaffoldingService';

export { ReleaseHashGenerator, releaseHashGenerator } from './export/ReleaseHashGenerator';

// ═══════════════════════════════════════════════════════════════════════════════
// GRDHE (Global Regulatory Data Harmonization Engine)
// ═══════════════════════════════════════════════════════════════════════════════

export * as grdhe from './grdhe';

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Master service registry mapping capabilities to service names
 * Use for dependency injection and service discovery
 */
export const SERVICE_REGISTRY = {
  // AI
  'ai.completion': 'ai/openai-orchestrator',
  'ai.assistant': 'openai-service',
  // 'ai.regulatory': removed — was a stub
  'ai.kimi': 'kimiAIService',

  // Documents
  'documents.crud': 'documentService',
  'documents.pdf': 'pdfGenerator',
  'documents.ingestion': 'unifiedDocumentIngestion',

  // Cortex
  'cortex.prime': 'cortexPrimeService',
  'cortex.knowledge': 'foresight-knowledge-graph',
  'cortex.memory': 'memory-service',

  // FDA
  'fda.service': 'fdaService',
  'fda.estar': 'eSTARValidator',
  'fda.forms': 'FDAFormGenerator',
  'fda.510k': 'fda510kDocumentGenerator',

  // Clinical
  'clinical.csr': 'csr-search-service',
  'clinical.intelligence': 'clinical-intelligence-service',
  'clinical.study-design': 'study-design-agent-service',

  // Infrastructure
  'infra.storage': 's3-storage',
  'infra.export': 'export-service',
  'infra.notify': 'notify',

  // Phase 6 - eCTD Co-Author + Document Drafting
  'documents.skeleton': 'documents/ArtifactSkeletonGenerator',
  'ectd.scaffolding': 'ectd/ECTDScaffoldingService',
  'export.hash': 'export/ReleaseHashGenerator',
  'collaboration.council': 'multi-agent-council',
} as const;

export type ServiceCapability = keyof typeof SERVICE_REGISTRY;

/**
 * Get service path for a capability
 */
export function getServicePath(capability: ServiceCapability): string {
  return SERVICE_REGISTRY[capability];
}

/**
 * Check if a capability exists
 */
export function hasCapability(capability: string): capability is ServiceCapability {
  return capability in SERVICE_REGISTRY;
}
