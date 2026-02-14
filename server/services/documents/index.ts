/**
 * Document Services - Unified Entry Point
 *
 * Consolidates all document-related services into a single module.
 * Part of Q1 2026 consolidation sprint.
 *
 * Services consolidated:
 * - documentService.js (core CRUD)
 * - documentProcessor.js (text extraction)
 * - documentReconstruction.js (version control)
 * - documentLocking.js (concurrent access)
 * - documentIngestionWorkflow.js (import pipeline)
 * - unifiedDocumentIngestion.js (multi-format ingestion)
 * - documentTemplateMapper.ts (template mapping)
 * - DocumentOrchestrationService.ts (workflow orchestration)
 * - DocumentDataCenterService.ts (data center operations)
 * - academic-document-processor.ts (academic papers)
 *
 * @module server/services/documents
 * @version 2.0.0
 */

// Core document service
export { default as documentService } from '../documentService';

// Document processing
export { default as documentProcessor } from '../document-processor';
export { default as academicDocumentProcessor } from '../academic-document-processor';

// Version control & locking
export { default as documentReconstruction } from '../documentReconstruction';
export { default as documentLocking } from '../documentLocking';

// Ingestion workflows
export { default as documentIngestionWorkflow } from '../documentIngestionWorkflow';
export { default as unifiedDocumentIngestion } from '../unifiedDocumentIngestion';

// Template & orchestration
export { default as documentTemplateMapper } from '../documentTemplateMapper';
export { DocumentOrchestrationService } from '../DocumentOrchestrationService';
export { DocumentDataCenterService } from '../DocumentDataCenterService';

// Generator services (submission-specific)
export { default as fda510kDocumentGenerator } from '../fda510kDocumentGenerator';
export { default as pmaDocumentGenerator } from '../pmaDocumentGenerator';

// Types
export interface DocumentMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  projectId?: string;
  submissionId?: string;
  ctdSection?: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  checksum?: string;
  tags?: string[];
}

export interface DocumentContent {
  raw: Buffer;
  text?: string;
  pages?: number;
  metadata?: Record<string, unknown>;
}

export interface DocumentVersion {
  versionId: string;
  documentId: string;
  version: string;
  changeDescription?: string;
  changedBy: string;
  changedAt: Date;
  previousVersionId?: string;
}

export interface DocumentLock {
  documentId: string;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
  lockType: 'edit' | 'review' | 'approval';
}

export interface IngestionOptions {
  extractText?: boolean;
  generateEmbeddings?: boolean;
  detectLanguage?: boolean;
  ctdClassification?: boolean;
  ocrEnabled?: boolean;
}

export interface IngestionResult {
  documentId: string;
  success: boolean;
  extractedText?: string;
  pageCount?: number;
  language?: string;
  ctdSection?: string;
  errors?: string[];
}

/**
 * Service registry for document operations
 */
export const DOCUMENT_SERVICE_REGISTRY = {
  // Core operations
  crud: 'documentService',
  storage: 'documentService',

  // Processing
  textExtraction: 'document-processor',
  academicParsing: 'academic-document-processor',

  // Version control
  versioning: 'documentReconstruction',
  locking: 'documentLocking',

  // Ingestion
  singleIngestion: 'documentIngestionWorkflow',
  batchIngestion: 'unifiedDocumentIngestion',

  // Orchestration
  workflow: 'DocumentOrchestrationService',
  dataCenter: 'DocumentDataCenterService',

  // Generation
  '510k': 'fda510kDocumentGenerator',
  pma: 'pmaDocumentGenerator',
} as const;

export type DocumentCapability = keyof typeof DOCUMENT_SERVICE_REGISTRY;

/**
 * Get the appropriate service for a document operation
 */
export function getDocumentService(capability: DocumentCapability): string {
  return DOCUMENT_SERVICE_REGISTRY[capability];
}
