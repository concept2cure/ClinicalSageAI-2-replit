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
// @ts-expect-error — JS module without typings
export { default as documentService } from '../documentService';

// Document processing
// @ts-expect-error — JS module without typings
export { default as documentProcessor } from '../document-processor';
export { academicDocumentProcessor } from '../academic-document-processor';

// Version control & locking
// @ts-expect-error — JS module without typings
export { default as documentReconstruction } from '../documentReconstruction';
// @ts-expect-error — JS module without typings
export { default as documentLocking } from '../documentLocking';

// Ingestion workflows
// @ts-expect-error — JS module without typings
export { default as unifiedDocumentIngestion } from '../unifiedDocumentIngestion';

// Template & orchestration
export { default as documentTemplateMapper } from '../documentTemplateMapper';
export { default as DocumentOrchestrationService } from '../DocumentOrchestrationService';
export { documentDataCenterService as DocumentDataCenterService } from '../DocumentDataCenterService';

// Generator services (submission-specific)
// @ts-expect-error — JS module without typings
export { default as fda510kDocumentGenerator } from '../fda510kDocumentGenerator';
// @ts-expect-error — JS module without typings
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

  // Ingestion (canonical path — single + batch)
  singleIngestion: 'unifiedDocumentIngestion',
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
