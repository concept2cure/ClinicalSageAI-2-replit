/**
 * Server Services - Unified Index
 *
 * Single entry point for all server services.
 * Part of Q1 2026 consolidation sprint to reduce service sprawl.
 *
 * @module server/services
 * @version 2.1.0
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
// openai-service exports OpenAI Assistants API functions (threads, runs, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

export * as openaiService from './openai-service';

// ═══════════════════════════════════════════════════════════════════════════════
// CORTEX PRIME SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as cortexPrimeService } from './cortexPrimeService';
export {
  ForesightKnowledgeGraph,
  knowledgeGraph as foresightKnowledgeGraph,
} from './foresight-knowledge-graph';
export { MemoryService, memoryService } from './memory-service';

// ═══════════════════════════════════════════════════════════════════════════════
// FDA / REGULATORY SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { eSTARValidator } from './eSTARValidator';
export { default as FDAFormGenerator } from './FDAFormGenerator';
export { default as part11ComplianceService } from './part11ComplianceService';
export { RegulatoryIntelligenceService } from './regulatory-intelligence-service';

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL / CSR SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { csrSearchService } from './csr-search-service';
export { csrKnowledgeExtractor } from './csr-knowledge-extractor';
export { default as csrForesightOrchestrator } from './csr-foresight-orchestrator';
export { clinicalIntelligenceService } from './clinical-intelligence-service';

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY DESIGN SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { studyDesignAgentService, StudyDesignAgentService } from './study-design-agent-service';
export {
  EndpointRecommenderService,
  getEndpointRecommenderService,
} from './endpoint-recommender-service';
export { PowerSampleSizeService } from './power-sample-size-service';
export { default as sapGeneratorService } from './sap-generator-service';

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS / INTELLIGENCE SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { MonteCarloService as monteCarloService } from './monte-carlo-service';
export { default as reportGeneratorService } from './report-generator-service';

// ═══════════════════════════════════════════════════════════════════════════════
// DATA SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as harvestEngine } from './harvestEngine.js';
export { default as dataHarvester } from './dataHarvester.js';
export * from './enhancedFaersService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export { default as s3Storage, s3Storage as s3StorageInstance } from './s3-storage';
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
