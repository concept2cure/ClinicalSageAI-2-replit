/**
 * Document catalog — the durable record of what each uploaded file IS, where
 * it is filed, what data is inside it, and the proof AnA actually read it.
 *
 * Composes the pieces that already exist rather than forking them: text lands
 * in vault.documents.extracted_text at ingest (vault-ingest.ts), placement is
 * proposed by classifyForFiling (vault-filing.service.ts), embeddings go
 * through the gateway embedding seam (enhancedEmbeddingService). What was
 * missing — and what this module owns — is the comprehension record and the
 * discipline around it: the extraction tier written in the ingest transaction
 * (a failure recorded AS a failure, never an empty-but-fine document), read
 * receipts for every span served, the full-coverage gate on catalog writes,
 * and the discovery/recall reads that keep unstudied files honestly labeled.
 *
 * The rules themselves (spans, coverage, the gate, extraction outcomes) are
 * pure functions in document-catalog-core.ts, re-exported below; this file is
 * the thin DB layer. Tenancy on vault.documents follows the established
 * idiom: an EXISTS join to regulatory_programs.organization_id, because the
 * table itself carries no org column (see vault-ingest.ts).
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { FeatureToggleService } from '../featureToggleService.js';
import {
  computeCoverage,
  assertCatalogWriteAllowed,
  type Span,
  type CoverageReport,
  type CatalogStatus,
  type ExtractionOutcome,
} from './document-catalog-core.js';

const logger = createScopedLogger('document-catalog');

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag
// ─────────────────────────────────────────────────────────────────────────────

/** Tenant-scoped toggle key (FeatureToggleService — off by default, fails closed). */
export const DOCUMENT_CATALOG_FEATURE_KEY = 'ana.document_catalog';

export async function isDocumentCatalogEnabled(organizationId?: number | null): Promise<boolean> {
  if (process.env.ANA_DOCUMENT_CATALOG_FORCE_ON === 'true') return true;
  return FeatureToggleService.isFeatureEnabled(
    DOCUMENT_CATALOG_FEATURE_KEY,
    organizationId ?? undefined,
  );
}

// One import path for callers: the pure core rides along with the DB layer.
export * from './document-catalog-core.js';

// ─────────────────────────────────────────────────────────────────────────────
// DB wrappers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal query surface so the ingest transaction's client and the pool both fit. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/**
 * Upsert the extraction tier of a document's catalog row. Runs inside the
 * ingest transaction so a document cannot enter the corpus with its
 * extraction outcome unrecorded. A re-upload (new content hash) resets the
 * comprehension tier: receipts from other bytes prove nothing about these.
 */
export async function recordExtractionOutcome(
  db: Queryable,
  args: {
    documentId: string;
    contentHash: string;
    outcome: ExtractionOutcome;
    pageCount?: number | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO vault.document_catalog (
       document_id, content_hash, catalog_status,
       extraction_method, extraction_confidence, extraction_error,
       char_count, word_count, page_count
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (document_id) DO UPDATE SET
       content_hash = EXCLUDED.content_hash,
       -- Same bytes + already cataloged + a mere re-extraction → the
       -- comprehension claim stands; anything else takes the new status.
       catalog_status = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                                  AND vault.document_catalog.catalog_status = 'cataloged'
                                  AND EXCLUDED.catalog_status = 'extracted'
                             THEN 'cataloged' ELSE EXCLUDED.catalog_status END,
       extraction_method = EXCLUDED.extraction_method,
       extraction_confidence = EXCLUDED.extraction_confidence,
       extraction_error = EXCLUDED.extraction_error,
       char_count = EXCLUDED.char_count,
       word_count = EXCLUDED.word_count,
       page_count = EXCLUDED.page_count,
       -- New bytes void old comprehension; same bytes keep it.
       document_kind = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                            THEN vault.document_catalog.document_kind ELSE NULL END,
       purpose = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                      THEN vault.document_catalog.purpose ELSE NULL END,
       summary = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                      THEN vault.document_catalog.summary ELSE NULL END,
       key_data = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                       THEN vault.document_catalog.key_data ELSE NULL END,
       embedding_status = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                               THEN vault.document_catalog.embedding_status ELSE NULL END,
       cataloged_by = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                           THEN vault.document_catalog.cataloged_by ELSE NULL END,
       cataloged_at = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                           THEN vault.document_catalog.cataloged_at ELSE NULL END,
       updated_at = NOW()`,
    [
      args.documentId,
      args.contentHash,
      args.outcome.status,
      args.outcome.method,
      args.outcome.confidence,
      args.outcome.error,
      args.outcome.charCount,
      args.outcome.wordCount,
      args.pageCount ?? null,
    ],
  );
}

/** The org-checked document row every tool call resolves through (see module header on tenancy). */
export interface CatalogDocumentRow {
  id: string;
  programId: string;
  documentCode: string;
  documentTitle: string;
  documentType: string;
  fileName: string;
  mimeType: string | null;
  contentHash: string;
  extractedText: string | null;
  folderId: string | null;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  catalog: {
    status: CatalogStatus;
    extractionMethod: string | null;
    extractionConfidence: number | null;
    extractionError: string | null;
    charCount: number;
    wordCount: number | null;
    pageCount: number | null;
    documentKind: string | null;
    purpose: string | null;
    summary: string | null;
    keyData: unknown;
    catalogedAt: string | null;
  } | null;
}

export async function loadDocumentForOrg(
  documentId: string,
  organizationId: number,
  opts: { includeText?: boolean } = {},
): Promise<CatalogDocumentRow | null> {
  const textCol = opts.includeText ? 'd.extracted_text' : 'NULL::text AS extracted_text';
  const res = await pool.query(
    `SELECT d.id, d.program_id, d.document_code, d.document_title, d.document_type,
            d.file_name, d.mime_type, d.content_hash, ${textCol},
            d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
            c.catalog_status, c.extraction_method, c.extraction_confidence,
            c.extraction_error, c.char_count, c.word_count, c.page_count,
            c.document_kind, c.purpose, c.summary, c.key_data, c.cataloged_at
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.id = $1 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $2)
      LIMIT 1`,
    [documentId, organizationId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    programId: r.program_id,
    documentCode: r.document_code,
    documentTitle: r.document_title,
    documentType: r.document_type,
    fileName: r.file_name,
    mimeType: r.mime_type,
    contentHash: r.content_hash,
    extractedText: r.extracted_text,
    folderId: r.folder_id,
    evidenceKind: r.evidence_kind,
    ctdSection: r.ctd_section,
    placementStatus: r.placement_status,
    catalog: r.catalog_status
      ? {
          status: r.catalog_status,
          extractionMethod: r.extraction_method,
          extractionConfidence: r.extraction_confidence,
          extractionError: r.extraction_error,
          charCount: r.char_count ?? 0,
          wordCount: r.word_count,
          pageCount: r.page_count,
          documentKind: r.document_kind,
          purpose: r.purpose,
          summary: r.summary,
          keyData: r.key_data,
          catalogedAt: r.cataloged_at ? String(r.cataloged_at) : null,
        }
      : null,
  };
}

/** Record the exact span of extracted text served by a read. */
export async function recordReadReceipt(args: {
  documentId: string;
  contentHash: string;
  span: Span;
  readBy?: number | null;
  threadId?: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO vault.document_read_receipts
       (document_id, content_hash, char_start, char_end, read_by, thread_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.documentId,
      args.contentHash,
      args.span.start,
      args.span.end,
      args.readBy ?? null,
      args.threadId ?? null,
    ],
  );
}

/** Coverage of the CURRENT bytes (receipts against other hashes prove nothing). */
export async function getReadCoverage(
  documentId: string,
  contentHash: string,
  charCount: number,
): Promise<CoverageReport> {
  const res = await pool.query(
    `SELECT char_start, char_end FROM vault.document_read_receipts
      WHERE document_id = $1 AND content_hash = $2`,
    [documentId, contentHash],
  );
  const spans: Span[] = res.rows.map((r: any) => ({ start: r.char_start, end: r.char_end }));
  return computeCoverage(spans, charCount);
}

export interface CompleteCatalogResult {
  ok: boolean;
  refusal?: string;
  coverage?: CoverageReport;
  embeddingStatus?: 'embedded' | 'failed';
}

/**
 * Write the comprehension tier — refused below full read coverage. The
 * embedding is best-effort and its outcome is recorded (embedding_status),
 * never assumed: a catalog entry whose embedding failed is still a valid
 * record that says its semantic index is missing.
 */
export async function completeCatalog(args: {
  documentId: string;
  organizationId: number;
  documentKind: string;
  purpose: string;
  summary: string;
  keyData?: Record<string, unknown> | null;
  userId?: number | null;
}): Promise<CompleteCatalogResult> {
  const doc = await loadDocumentForOrg(args.documentId, args.organizationId);
  if (!doc) {
    return { ok: false, refusal: 'Document not found in your organization\'s programs.' };
  }
  if (!doc.catalog) {
    return {
      ok: false,
      refusal:
        'This document has no catalog record (it predates the catalog, or cataloging was off at ' +
        'ingest), so there is no recorded extraction to verify a read against. Re-ingest it, or ' +
        'read it via the vault surface first.',
    };
  }
  if (doc.catalog.status === 'extraction_failed') {
    return {
      ok: false,
      refusal:
        `Extraction failed for this document (${doc.catalog.extractionError ?? 'no reason recorded'}), ` +
        'so there is no text to have read. Fix extraction (e.g. re-ingest, or OCR the source) before cataloging.',
    };
  }

  const coverage = await getReadCoverage(doc.id, doc.contentHash, doc.catalog.charCount);
  const verdict = assertCatalogWriteAllowed(coverage);
  if (!verdict.allowed) {
    return { ok: false, refusal: verdict.reason ?? 'Catalog write refused.', coverage };
  }

  // Embed the comprehension record so it is semantically retrievable. The
  // column only exists where pgvector does; both absence and failure are
  // recorded as what they are.
  let embeddingStatus: 'embedded' | 'failed';
  let embeddingLiteral: string | null = null;
  try {
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const text = [
      `${doc.fileName} — ${args.documentKind}`,
      `Purpose: ${args.purpose}`,
      `Summary: ${args.summary}`,
      args.keyData ? `Key data: ${JSON.stringify(args.keyData)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const result = await getEmbeddingService(pool as any).embed(text);
    embeddingLiteral = `[${result.embedding.join(',')}]`;
    embeddingStatus = 'embedded';
  } catch (err) {
    embeddingStatus = 'failed';
    logger.warn('Catalog embedding failed — recorded as failed, catalog still written', {
      documentId: doc.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const baseParams = [
    args.documentKind,
    args.purpose,
    args.summary,
    args.keyData ? JSON.stringify(args.keyData) : null,
    embeddingStatus,
    args.userId ?? null,
    doc.id,
    doc.contentHash,
  ];
  if (embeddingLiteral) {
    try {
      await pool.query(
        `UPDATE vault.document_catalog SET
           catalog_status = 'cataloged', document_kind = $1, purpose = $2, summary = $3,
           key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6,
           cataloged_at = NOW(), updated_at = NOW(), embedding = $9::vector
         WHERE document_id = $7 AND content_hash = $8`,
        [...baseParams, embeddingLiteral],
      );
      return { ok: true, coverage, embeddingStatus };
    } catch (err) {
      // The embedding column may not exist on this database (no pgvector).
      logger.warn('Catalog embedding column write failed — storing record without vector', {
        documentId: doc.id,
        err: err instanceof Error ? err.message : String(err),
      });
      embeddingStatus = 'failed';
      baseParams[4] = embeddingStatus;
    }
  }
  await pool.query(
    `UPDATE vault.document_catalog SET
       catalog_status = 'cataloged', document_kind = $1, purpose = $2, summary = $3,
       key_data = $4::jsonb, embedding_status = $5, cataloged_by = $6,
       cataloged_at = NOW(), updated_at = NOW()
     WHERE document_id = $7 AND content_hash = $8`,
    baseParams,
  );
  return { ok: true, coverage, embeddingStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery + recall
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectDocumentListing {
  id: string;
  programId: string;
  programName: string | null;
  documentCode: string;
  documentTitle: string;
  documentType: string;
  fileName: string;
  location: {
    folderId: string | null;
    ctdSection: string | null;
    evidenceKind: string | null;
    placementStatus: string;
  };
  catalogStatus: CatalogStatus | 'uncataloged';
  documentKind: string | null;
  purpose: string | null;
  extractionError: string | null;
  charCount: number | null;
  createdAt: string;
}

/**
 * Every live document across the given programs (or all programs the org
 * owns), each with its filed location and catalog state. A document with no
 * catalog row is reported as 'uncataloged' — an honest "not assessed", never
 * hidden and never presented as assessed-and-empty.
 */
export async function listProjectDocuments(
  organizationId: number,
  opts: { programId?: string | null; limit?: number } = {},
): Promise<ProjectDocumentListing[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const params: unknown[] = [organizationId, limit];
  let programFilter = '';
  if (opts.programId) {
    params.push(opts.programId);
    programFilter = `AND d.program_id = $${params.length}`;
  }
  const res = await pool.query(
    `SELECT d.id, d.program_id, rp.name AS program_name, d.document_code, d.document_title,
            d.document_type, d.file_name, d.folder_id, d.ctd_section, d.evidence_kind,
            d.placement_status, d.created_at,
            c.catalog_status, c.document_kind, c.purpose, c.extraction_error, c.char_count
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.deleted_at IS NULL ${programFilter}
      ORDER BY d.created_at DESC
      LIMIT $2`,
    params,
  );
  return res.rows.map((r: any) => ({
    id: r.id,
    programId: r.program_id,
    programName: r.program_name,
    documentCode: r.document_code,
    documentTitle: r.document_title,
    documentType: r.document_type,
    fileName: r.file_name,
    location: {
      folderId: r.folder_id,
      ctdSection: r.ctd_section,
      evidenceKind: r.evidence_kind,
      placementStatus: r.placement_status,
    },
    catalogStatus: (r.catalog_status ?? 'uncataloged') as CatalogStatus | 'uncataloged',
    documentKind: r.document_kind,
    purpose: r.purpose,
    extractionError: r.extraction_error,
    charCount: r.char_count,
    createdAt: String(r.created_at),
  }));
}

/** Resolve the program UUID a numeric workspace project is anchored to, org-checked. */
export async function resolveProgramForProject(
  projectId: number,
  organizationId: number,
): Promise<string | null> {
  const res = await pool.query(
    `SELECT regulatory_program_id FROM projects
      WHERE id = $1 AND organization_id = $2 AND regulatory_program_id IS NOT NULL
      LIMIT 1`,
    [projectId, organizationId],
  );
  return res.rows[0]?.regulatory_program_id ?? null;
}

export interface VaultDocDigest {
  fileName: string;
  documentTitle: string;
  programName: string | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string;
  catalogStatus: CatalogStatus | 'uncataloged';
  documentKind: string | null;
  purpose: string | null;
}

/**
 * Compact digest of the org's project files for session-start recall — the
 * piece that makes AnA REMEMBER a file exists, where it is filed, and what it
 * is for, without being asked. Bounded; newest first.
 */
export async function getCatalogBootstrapDigest(
  organizationId: number,
  limit = 12,
): Promise<VaultDocDigest[]> {
  const rows = await listProjectDocuments(organizationId, { limit });
  return rows.map(r => ({
    fileName: r.fileName,
    documentTitle: r.documentTitle,
    programName: r.programName,
    folderId: r.location.folderId,
    ctdSection: r.location.ctdSection,
    placementStatus: r.location.placementStatus,
    catalogStatus: r.catalogStatus,
    documentKind: r.documentKind,
    purpose: r.purpose,
  }));
}
