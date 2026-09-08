/**
 * Document Services - Unified Entry Point
 *
 * Consolidates all document-related services into a single module.
 * Part of Q1 2026 consolidation sprint.
 *
 * Services consolidated:
 * - documentService.js (core CRUD)
 * - documentReconstruction.js (version control)
 * - documentLocking.js (concurrent access)
 * - unifiedDocumentIngestion.js (multi-format ingestion — canonical ingestion path)
 * - documentTemplateMapper.ts (template mapping)
 * - DocumentOrchestrationService.ts (workflow orchestration)
 * - DocumentDataCenterService.ts (data center operations)
 * - academic-document-processor.ts (academic papers)
 *
 * @module server/services/documents
 * @version 2.0.0
 */

// Core document service
export { default as documentService } from '../documentService.js';

// Document processing
export { academicDocumentProcessor } from '../academic-document-processor';

// Version control & locking
export { default as documentReconstruction } from '../documentReconstruction.js';
export { default as documentLocking } from '../documentLocking.js';

// Ingestion workflows
export { default as unifiedDocumentIngestion } from '../unifiedDocumentIngestion.js';

// Template & orchestration
export { default as documentTemplateMapper } from '../documentTemplateMapper';
export { default as DocumentOrchestrationService } from '../DocumentOrchestrationService';
export { documentDataCenterService as DocumentDataCenterService } from '../DocumentDataCenterService';

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
  academicParsing: 'academic-document-processor',

  // Version control
  versioning: 'documentReconstruction',
  locking: 'documentLocking',

  // Ingestion (canonical path — single + batch)
  singleIngestion: 'unifiedDocumentIngestion',
  batchIngestion: 'unifiedDocumentIngestion',

  // Orchestration
  workflow: 'DocumentOrchestrationService',
  dataCenter: 'DocumentDataCenterService',

  // Generation: no entries. The legacy fda510kDocumentGenerator and
  // pmaDocumentGenerator are deleted — the latter was unreachable from any
  // route and emitted a hard-coded fixture dossier. Canonical 510(k) / De Novo /
  // PMA drafting is /api/510k/estar/* (build, assemble, filing-readiness) over
  // the governed store (c2c_documents / c2c_document_sections) and, for the
  // legacy editor, cerv2_510k_sections.
} as const;

export type DocumentCapability = keyof typeof DOCUMENT_SERVICE_REGISTRY;

/**
 * Get the appropriate service for a document operation
 */
export function getDocumentService(capability: DocumentCapability): string {
  return DOCUMENT_SERVICE_REGISTRY[capability];
}
