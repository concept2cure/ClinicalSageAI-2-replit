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
import type { RequestSqlClient } from '../../db/requestDb.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { requireCurrentProgramAccess } from '../c2c/current-program-access.js';
import { assertVerifiedProgramScope, getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, type CurrentAccessibleProgramScope } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql, vaultDispositionChoiceSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { catalogableDocument } from './document-catalog-eligibility.js';
import { loadDocumentForOrg } from './document-catalog-document.js';
export { loadDocumentForOrg, type CatalogDocumentRow } from './document-catalog-document.js';
import { createScopedLogger } from '../../utils/logger.js';
import { FeatureToggleService } from '../featureToggleService.js';
import { catalogStateOf, writeCatalogSuggestion, type CatalogProposer } from './document-catalog-governance.service.js';
import { filingVocabularyRefusal } from './vault-filing.service.js';
import {
  computeCoverage,
  assertCatalogWriteAllowed,
  type Span,
  type SpanCoverageReport,
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
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
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
       -- Who proposed and who confirmed are part of the description (S4).
       catalog_state = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                       THEN vault.document_catalog.catalog_state ELSE NULL END,
       proposed_by = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                     THEN vault.document_catalog.proposed_by ELSE NULL END,
       proposed_model = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                        THEN vault.document_catalog.proposed_model ELSE NULL END,
       proposed_thread_id = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                            THEN vault.document_catalog.proposed_thread_id ELSE NULL END,
       proposed_turn_id = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                          THEN vault.document_catalog.proposed_turn_id ELSE NULL END,
       confirmed_by = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                      THEN vault.document_catalog.confirmed_by ELSE NULL END,
       confirmed_at = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                      THEN vault.document_catalog.confirmed_at ELSE NULL END,
       correction_reason = CASE WHEN vault.document_catalog.content_hash = EXCLUDED.content_hash
                           THEN vault.document_catalog.correction_reason ELSE NULL END,
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

/** Record the exact span of extracted text served by a read. */
export async function recordReadReceipt(args: {
  executor?: RequestSqlClient;
  documentId: string;
  contentHash: string;
  span: Span;
  readBy?: number | null;
  threadId?: string | null;
}): Promise<void> {
  await (args.executor ?? pool).query(
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
  executor: RequestSqlClient = pool,
): Promise<SpanCoverageReport> {
  const res = await executor.query(
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
  coverage?: SpanCoverageReport;
  /** Present only on a key_data refusal: every value the text does not state, by path. */
  unverifiedKeyData?: import('./document-catalog-core.js').UnverifiedKeyDataLeaf[];
  embeddingStatus?: 'embedded' | 'failed';
}

/**
 * Write the comprehension tier — refused below full read coverage, and
 * refused when any key_data value does not occur in the text that was read.
 * The embedding is best-effort and its outcome is recorded (embedding_status),
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
  userId: number | undefined;
  executor: RequestSqlClient;
  programId?: string;
  /** Who wrote the description: the agent, its model and turn (S4). */
  proposer?: CatalogProposer | null;
}): Promise<CompleteCatalogResult> {
  // The kind is the Vault's evidence-kind vocabulary, as placement's is (S4).
  const vocabulary = filingVocabularyRefusal({ evidenceKind: args.documentKind });
  if (vocabulary) return { ok: false, refusal: vocabulary.message };
  // The text that was served is the text key_data is verified against.
  const availability = catalogableDocument(await loadDocumentForOrg(args.documentId, args.organizationId, { includeText: true, executor: args.executor, userId: args.userId, programId: args.programId }));
  if (!availability.ok) return availability;
  const doc = availability.document;
  const access = await requireCurrentProgramAccess(args.executor, { organizationId: args.organizationId, userId: args.userId, programId: doc.programId });
  const roleRefusal = vaultWriteRefusal(access.actor.role);
  if (roleRefusal) return { ok: false, refusal: roleRefusal.message };

  /* Coverage proves the model was served every character; it proved nothing
     about what the model then wrote. key_data was stored as the model typed
     it, so a CoA reading batch 23-104 and assay 99.2 % was recorded as batch
     23-105 and assay 98.4 and served back as fact by every reader of the
     catalog. The gate now also checks each value against the same stored text
     read_project_document served, before the embedding and the write, so a
     refusal stores nothing (CLAUDE.md Rule 2). */
  const coverage = await getReadCoverage(doc.id, doc.contentHash, doc.catalog.charCount, args.executor);
  const verdict = assertCatalogWriteAllowed(coverage, args.keyData, doc.extractedText);
  if (!verdict.allowed) {
    const { reason, unverifiedKeyData } = verdict;
    return { ok: false, refusal: reason ?? 'Catalog write refused.', coverage, unverifiedKeyData };
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
    const result = await getEmbeddingService(args.executor as any).embed(text);
    embeddingLiteral = `[${result.embedding.join(',')}]`;
    embeddingStatus = 'embedded';
  } catch (err) {
    embeddingStatus = 'failed';
    logger.warn('Catalog embedding failed — attempting non-vector catalog write', {
      documentId: doc.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  /* A suggestion, never a fact: the record names the agent, model and turn
     that wrote it and is committed with its chained audit row, and it never
     replaces a record a person confirmed or corrected (S4, D5;
     document-catalog-governance.service.ts). */
  const written = await writeCatalogSuggestion({
    documentId: doc.id,
    contentHash: doc.contentHash,
    organizationId: args.organizationId,
    programId: doc.programId,
    documentTitle: doc.documentTitle,
    documentKind: args.documentKind,
    purpose: args.purpose,
    summary: args.summary,
    keyData: args.keyData ?? null,
    embeddingStatus,
    embeddingLiteral,
    userId: args.userId ?? null,
    proposer: args.proposer ?? null,
  });
  if (!written.ok) return { ok: false, refusal: written.refusal, coverage };
  return { ok: true, coverage, embeddingStatus: written.embeddingStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery + recall
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectDocumentListing {
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
  originalFileAvailable?: boolean;
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
  /** suggested (AnA's, not yet confirmed) | confirmed | corrected; null before a description. */
  catalogState: string | null;
  extractionError: string | null;
  charCount: number | null;
  createdAt: string;
}

/**
 * One page of project documents, plus what the page does NOT contain.
 *
 * The counts are computed over the WHOLE scope, in the same query, by window
 * aggregates — never over `documents`, which is a page. That distinction is
 * the point of this type: `documents.length` is how many rows came back and
 * `total` is how many exist, and a caller that conflates them tells the model
 * an organization has exactly as many files as the listing happened to fit.
 */
export interface ProjectDocumentPage {
  documents: ProjectDocumentListing[];
  /** Live documents in scope. Not the page size. */
  total: number;
  /** `total - documents.length`: rows the limit left out. Zero means the page IS the scope. */
  withheld: number;
  /** Scope-wide, not page-wide: no catalog row, or extracted but never studied. */
  notYetStudied: number;
  /** Scope-wide: extraction recorded a failure, so there is no text to have read. */
  extractionFailed: number;
  /** Scope-wide: admitted to the vault with no filed location. */
  unfiled: number;
}

/**
 * Every eligible document across the caller's currently accessible programs, each with its filed location and catalog state. A document with no
 * catalog row is reported as 'uncataloged' — an honest "not assessed", never
 * hidden and never presented as assessed-and-empty.
 *
 * ── Why this returns a page and not an array ────────────────────────────────
 * It always applied `LIMIT` — 100 by default, 200 at most — and returned a
 * bare array, so every caller's only available answer to "how many files does
 * this client have?" was `rows.length`, which is the limit whenever the client
 * has more files than the limit. The AnA tool reported it as `count`, and
 * session recall took the newest twelve and listed them under a heading that
 * reads as the complete set. An organization with forty files was told it had
 * twelve, and the twenty-eight it was not told about were the OLDEST ones —
 * precisely the files nobody has looked at in a while, which is the recall
 * this catalog exists to provide.
 *
 * A truncated list rendered as a total is a fabricated count, so the totals
 * now come back with the page and the callers are obliged to handle them. They
 * are window aggregates over the same scan (`COUNT(*) OVER ()`), evaluated
 * before `LIMIT`, so honesty costs no extra round trip.
 */
export async function listProjectDocuments(
  db: Queryable,
  organizationId: number,
  opts: { userId: number | undefined; programId?: string | null; limit?: number },
  verifiedScope?: CurrentAccessibleProgramScope,
): Promise<ProjectDocumentPage> {
  const identity = {organizationId,userId:opts.userId,programId:opts.programId ?? null};
  if (verifiedScope) assertVerifiedProgramScope(db,identity,verifiedScope);
  const scope = verifiedScope ?? await getCurrentAccessibleProgramScope(db,identity);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const params: unknown[] = [organizationId, limit, scope.programIds];
  const res = await db.query(
    `SELECT d.id, d.program_id, rp.name AS program_name, d.document_code, d.document_title,
            d.document_type, d.file_name, d.folder_id, d.ctd_section, d.evidence_kind,
            d.placement_status, d.created_at,
            ${vaultDispositionChoiceSql('d')} AS disposition,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            c.catalog_status, c.document_kind, c.purpose, c.extraction_error, c.char_count,
            c.catalog_state,
            COUNT(*) OVER () AS scope_total,
            COUNT(*) FILTER (
              WHERE c.catalog_status IS NULL OR c.catalog_status = 'extracted'
            ) OVER () AS scope_not_studied,
            COUNT(*) FILTER (WHERE c.catalog_status = 'extraction_failed')
              OVER () AS scope_extraction_failed,
            COUNT(*) FILTER (WHERE d.placement_status = 'unfiled')
              OVER () AS scope_unfiled
       FROM vault.documents d
       JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = $1
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
      WHERE d.organization_id = $1 AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}
        AND d.program_id = ANY($3::uuid[])
      ORDER BY d.created_at DESC
      LIMIT $2`,
    params,
  );
  await requireProgramScopeStillCurrent(db,identity,scope);
  const documents = res.rows.map((r: any) => ({
    id: r.id,
    programId: r.program_id,
    programName: r.program_name,
    documentCode: r.document_code,
    documentTitle: r.document_title,
    documentType: r.document_type,
    fileName: r.file_name,
    disposition: r.disposition ?? null,
    originalFileAvailable: r.original_file_available ?? true,
    location: {
      folderId: r.folder_id,
      ctdSection: r.ctd_section,
      evidenceKind: r.evidence_kind,
      placementStatus: r.placement_status,
    },
    catalogStatus: (r.catalog_status ?? 'uncataloged') as CatalogStatus | 'uncataloged',
    documentKind: r.document_kind,
    purpose: r.purpose,
    catalogState: catalogStateOf(r),
    extractionError: r.extraction_error,
    charCount: r.char_count,
    createdAt: String(r.created_at),
  }));
  // With no matching rows there is no row to carry the window, so the scope is
  // empty — which is what an empty page means here, not an unknown total.
  const first = res.rows[0] as Record<string, unknown> | undefined;
  const count = (key: string): number => (first ? Number(first[key] ?? 0) : 0);
  const total = count('scope_total');
  return {
    documents,
    total,
    withheld: Math.max(0, total - documents.length),
    notYetStudied: count('scope_not_studied'),
    extractionFailed: count('scope_extraction_failed'),
    unfiled: count('scope_unfiled'),
  };
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
  catalogState: string | null;
}

/** A chat-uploaded file from the evidence spine, with the file_id that reopens it. */
export interface ChatUploadDigest {
  sourceId: number;
  fileId: string | null;
  fileName: string;
  version: string | null;
  extractionStatus: string;
  dossier: unknown;
  programId: string | null;
  uploadedAt: string;
}

/** A page of chat uploads, and whether the limit hid any. */
export interface ChatUploadPage {
  uploads: ChatUploadDigest[];
  /** True when the spine held more than `limit` — established by asking for one extra row. */
  hasMore: boolean;
}

/**
 * Current (non-superseded) chat uploads, via the canonical evidence-spine
 * listing. `fileId` comes from the source's recorded provenance — it is what
 * inspect_uploaded_document / read_uploaded_document take, so a file attached
 * in a past conversation is reachable again.
 *
 * Shared by the discovery tool and the session-start digest: two callers, one
 * definition of "the chat uploads this organization currently has".
 *
 * The spine's listing is a plain `LIMIT` with no total, so a saturated page is
 * indistinguishable from a complete one — the same lie `listProjectDocuments`
 * used to tell. One row beyond the limit is requested and dropped, which
 * settles "is there more" exactly rather than guessing from `rows.length`, and
 * needs nothing from the spine service.
 */
export async function listChatUploads(
  q: import('../../db/requestDb').RequestSqlClient,
  orgId: number,
  opts: {userId:number | undefined; programId?:string | null; limit?:number},
  verifiedScope?: import('../c2c/current-program-access').CurrentAccessibleProgramScope,
): Promise<ChatUploadPage> {
  const {assertVerifiedProgramScope,requireProgramScopeStillCurrent}=await import('../c2c/current-program-access');
  const identity={organizationId:orgId,userId:opts.userId,programId:opts.programId};
  if (verifiedScope) assertVerifiedProgramScope(q,identity,verifiedScope);
  const {listClientDocuments} = await import('../clinical-regulatory-evidence/evidence-spine.service.js');
  const want=Math.min(499,Math.max(1,opts.limit ?? 100));
  const sources=await listClientDocuments(q,orgId,{userId:opts.userId,programId:opts.programId,
    includeUnscoped:true,currentOnly:true,dataEligibleOnly:true,limit:want+1});
  const hasMore=sources.length>want;
  const uploads=sources.slice(0,want).map(s=>{
    const prov=(s.provenance ?? {}) as Record<string,unknown>;
    const meta=(s.metadata ?? {}) as Record<string,unknown>;
    return {sourceId:s.id,fileId:typeof prov.fileUploadId==='string' ? prov.fileUploadId : null,
      fileName:typeof meta.originalName==='string' ? meta.originalName : (s.title ?? 'document'),
      version:s.version ?? null,extractionStatus:s.extractionStatus,dossier:meta.dossier ?? null,
      programId:s.clientProgramId ?? null,uploadedAt:String(s.createdAt)};
  });
  if (verifiedScope) await requireProgramScopeStillCurrent(q,identity,verifiedScope);
  return {uploads,hasMore};
}

/**
 * What session recall needs: a bounded SAMPLE of the caller's accessible project files, and
 * the scope-wide numbers that say what the sample leaves out.
 *
 * Both halves matter. Without the sample AnA starts cold on a file the client
 * uploaded last week; without the counts she starts confident on twelve files
 * and answers "there is no such document" about the thirteenth.
 */
export interface CatalogBootstrapDigest {
  files: VaultDocDigest[];
  total: number;
  withheld: number;
  notYetStudied: number;
  extractionFailed: number;
  unfiled: number;
}

export async function getCatalogBootstrapDigest(
  db: Queryable,
  organizationId: number,
  opts: { userId: number | undefined; programId?: string | null; limit?: number },
  verifiedScope?: CurrentAccessibleProgramScope,
): Promise<CatalogBootstrapDigest> {
  const page = await listProjectDocuments(db, organizationId, { ...opts, limit: opts.limit ?? 12 },verifiedScope);
  return {
    files: page.documents.map(r => ({
      fileName: r.fileName,
      documentTitle: r.documentTitle,
      programName: r.programName,
      folderId: r.location.folderId,
      ctdSection: r.location.ctdSection,
      placementStatus: r.location.placementStatus,
      catalogStatus: r.catalogStatus,
      documentKind: r.documentKind,
      purpose: r.purpose,
      catalogState: r.catalogState,
    })),
    total: page.total,
    withheld: page.withheld,
    notYetStudied: page.notYetStudied,
    extractionFailed: page.extractionFailed,
    unfiled: page.unfiled,
  };
}
