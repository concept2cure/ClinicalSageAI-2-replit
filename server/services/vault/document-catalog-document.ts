/** Canonical document read: actor and recorded source parent precede metadata. */
import type { Queryable } from './document-catalog.service.js';
import type { CompleteCatalogArgs } from './document-catalog-operation-types.js';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { catalogableExpectedProgram, CatalogSourceScopeError } from './document-catalog-source-scope.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { MissingRequestDbContextError } from '../../db/requestDb.js';
import { ProgramReadAccessError, readCurrentProgramActor, requireCurrentProgramAccess } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql, vaultDispositionChoiceSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import { catalogStateOf } from './document-catalog-governance.service.js';
import type { CatalogStatus } from './document-catalog-core.js';

const SHA256 = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org-checked document row every tool call resolves through (see module header on tenancy). */
export interface CatalogDocumentRow {
  organizationId?: number;
  isCurrent?: boolean;
  disposition?: 'keep_data' | 'remove_data' | 'supersede' | null;
  originalFileAvailable?: boolean;
  id: string;
  programId: string;
  documentCode: string | null;
  documentTitle: string | null;
  documentType: string | null;
  fileName: string | null;
  mimeType: string | null;
  contentHash: string;
  /** Recorded version label of the exact Vault document row. */
  version?: string | null;
  extractedText: string | null;
  folderId: string | null;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  catalog: {
    /** 'other': the record describes other bytes. Only its hash and status
     * are carried; every extraction and comprehension field is withheld. */
    version?: 'current' | 'other';
    contentHash?: string;
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
    /** suggested (AnA's, unconfirmed) | confirmed | corrected; null before a description. */
    state?: string | null;
    proposedModel?: string | null;
  } | null;
}

export interface CatalogDocumentReadOptions {
  executor: RequestSqlClient;
  userId: number | undefined;
  includeText?: boolean;
  programId?: string;
  currentOnly?: boolean;
}

/** Only canonical admitted coordinators may use this primitive. Its executor
 * and selected program set belong to the same current actor admission. */
export interface AdmittedCatalogDocumentReadOptions {
  executor: Queryable;
  includeText?: boolean;
  programId?: string;
  currentOnly?: boolean;
  allowedProgramIds?: readonly string[];
}

async function admittedProgram(documentId: string, organizationId: number, opts: CatalogDocumentReadOptions): Promise<string | null> {
  const q = opts.executor;
  await readCurrentProgramActor(q, { organizationId, userId: opts.userId });
  if (!UUID.test(documentId) || (opts.programId !== undefined && !UUID.test(opts.programId))) return null;
  const currentClause = opts.currentOnly ? ` AND NOT ${supersededSql('d')}` : '';
  const source = await q.query(
    `SELECT d.id::text, d.program_id::text, d.organization_id FROM vault.documents d
      WHERE d.id = $1::uuid AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}${currentClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)
      LIMIT 1`, [documentId, organizationId],
  );
  const record = source.rows[0];
  if (!record) return null;
  if (source.rows.length !== 1 || requiredText(record.id).toLowerCase() !== documentId.toLowerCase()) return invalidDocumentRow();
  const programId = requiredText(record.program_id);
  if (!UUID.test(programId)) return invalidDocumentRow();
  const recordedTenant = documentTenant(record.organization_id);
  if (recordedTenant !== null && recordedTenant !== organizationId) return null;
  if (opts.programId !== undefined && programId.toLowerCase() !== opts.programId.toLowerCase()) return null;
  await requireCurrentProgramAccess(q, { organizationId, userId: opts.userId, programId });
  if (recordedTenant === null) throw new ProgramReadAccessError(409, 'VAULT_TENANT_RECONCILIATION_REQUIRED', 'The stored document needs a verified organization relationship before its data can be supplied.');
  return programId;
}

export async function loadDocumentForOrg(
  documentId: string,
  organizationId: number,
  opts: CatalogDocumentReadOptions,
): Promise<CatalogDocumentRow | null> {
  if (!opts?.executor) throw new MissingRequestDbContextError();
  // Preserve request identity and selection before either admission can yield.
  opts = Object.freeze({ executor: opts.executor, userId: opts.userId,
    includeText: opts.includeText === true, currentOnly: opts.currentOnly === true, programId: opts.programId });
  const q = opts.executor;
  const programId = await admittedProgram(documentId, organizationId, opts);
  if (!programId) return null;
  const currentClause = opts.currentOnly ? ` AND NOT ${supersededSql('d')}` : '';
  const accessInput = { organizationId, userId: opts.userId, programId };
  const textCol = opts.includeText ? 'd.extracted_text' : 'NULL::text AS extracted_text';
  const res = await q.query(
    `SELECT d.id, d.program_id, d.document_code, d.document_title, d.document_type,
            d.file_name, d.mime_type, d.content_hash, to_jsonb(d)->>'version' AS version, ${textCol},
            ${vaultDispositionChoiceSql('d')} AS disposition,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
            c.catalog_status, c.content_hash AS catalog_content_hash, c.extraction_method, c.extraction_confidence,
            c.extraction_error, c.char_count, c.word_count, c.page_count,
            c.document_kind, c.purpose, c.summary, c.key_data, c.cataloged_at,
            c.catalog_state, c.proposed_model,
            cv.content_hash AS recorded_catalog_content_hash, cv.catalog_status AS recorded_catalog_status
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
       -- Only the identity of a record for other bytes: its content never leaves the database.
       LEFT JOIN vault.document_catalog cv ON cv.document_id = d.id
      WHERE d.id = $1::uuid AND d.program_id = $3::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL
        AND ${vaultDataEligibleSql('d')}${currentClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)
      LIMIT 1`, [documentId, organizationId, programId],
  );
  const r = res.rows[0];
  if (!r) return null;
  // Snapshot the private row before the final permission await; a successful
  // guard attests only this already checked projection.
  const projected = globalThis.structuredClone(projectDocumentRow(r, { documentId, programId }));
  await requireCurrentProgramAccess(q, accessInput);
  return projected;
}

function invalidDocumentRow(): never {
  throw new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'The stored document record could not be verified. No document data was supplied.');
}

function documentTenant(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalidDocumentRow();
  return value;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string') return invalidDocumentRow();
  return value;
}

function sourceHash(value: unknown): string {
  const text = requiredText(value);
  return SHA256.test(text) ? text.toLowerCase() : invalidDocumentRow();
}

function nullableText(value: unknown): string | null {
  return value === null ? null : requiredText(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidDocumentRow();
  return value;
}

function catalogDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string' || (value instanceof Date && Number.isFinite(value.getTime()))) return String(value);
  return invalidDocumentRow();
}

const isCatalogStatus = (v: unknown): v is CatalogStatus => v === 'extracted' || v === 'extraction_failed' || v === 'extraction_pending' || v === 'cataloged';

/** A record for other bytes: its identity, so a reader can say the source
 * changed rather than "no record", and nothing it says about those bytes. */
function otherVersionCatalog(status: CatalogStatus, contentHash: string | undefined): NonNullable<CatalogDocumentRow['catalog']> {
  return {
    version: 'other', status, contentHash,
    extractionMethod: null, extractionConfidence: null, extractionError: null, charCount: 0,
    wordCount: null, pageCount: null, documentKind: null, purpose: null, summary: null,
    keyData: null, catalogedAt: null, state: null, proposedModel: null,
  };
}

/** c.* is joined on the current bytes; cv.* names the bytes the document's one
 * record describes, whichever they are. */
function projectCatalogRow(r: Record<string, unknown>, contentHash: string): CatalogDocumentRow['catalog'] {
  const joined = r.catalog_status !== null;
  const status = joined ? r.catalog_status : r.recorded_catalog_status ?? null;
  if (status === null) return null;
  if (!isCatalogStatus(status)) return invalidDocumentRow();
  const recordedHash = sourceHash(joined ? r.catalog_content_hash : r.recorded_catalog_content_hash);
  if (!joined || recordedHash !== contentHash) {
    // The join refused it; equal after case folding means its bytes cannot be verified.
    return recordedHash === contentHash ? invalidDocumentRow() : otherVersionCatalog(status, recordedHash);
  }
  const charCount = nullableNumber(r.char_count);
  if (charCount === null || !Number.isSafeInteger(charCount) || charCount < 0) return invalidDocumentRow();
  return {
    version: 'current', status, contentHash: recordedHash,
    extractionMethod: nullableText(r.extraction_method), extractionConfidence: nullableNumber(r.extraction_confidence),
    extractionError: nullableText(r.extraction_error), charCount,
    wordCount: nullableNumber(r.word_count), pageCount: nullableNumber(r.page_count),
    documentKind: nullableText(r.document_kind), purpose: nullableText(r.purpose), summary: nullableText(r.summary),
    keyData: r.key_data, catalogedAt: catalogDate(r.cataloged_at),
    state: catalogStateOf({ catalog_state: r.catalog_state, document_kind: r.document_kind }),
    proposedModel: nullableText(r.proposed_model),
  };
}

function projectDocumentRow(r: Record<string, unknown>, bound: { documentId: string; programId: string }): CatalogDocumentRow {
  const id = requiredText(r.id), programId = requiredText(r.program_id);
  if (id.toLowerCase() !== bound.documentId.toLowerCase() || programId.toLowerCase() !== bound.programId.toLowerCase()) return invalidDocumentRow();
  const disposition = r.disposition;
  if (disposition !== null && disposition !== 'keep_data' && disposition !== 'remove_data' && disposition !== 'supersede') return invalidDocumentRow();
  if (typeof r.original_file_available !== 'boolean') return invalidDocumentRow();
  const contentHash = sourceHash(r.content_hash);
  return {
    id, programId,
    documentCode: nullableText(r.document_code), documentTitle: nullableText(r.document_title),
    documentType: nullableText(r.document_type), fileName: nullableText(r.file_name),
    mimeType: nullableText(r.mime_type), contentHash,
    version: r.version == null ? null : requiredText(r.version),
    disposition, originalFileAvailable: r.original_file_available, extractedText: nullableText(r.extracted_text),
    folderId: nullableText(r.folder_id), evidenceKind: nullableText(r.evidence_kind), ctdSection: nullableText(r.ctd_section),
    placementStatus: requiredText(r.placement_status), catalog: projectCatalogRow(r, contentHash),
  };
}

/** Trusted internal read. The calling actor/source facade owns canonical
 * admission and a pinned allowed-program set before and after this query. */
export async function loadDocumentForAdmittedScope(
  documentId: string, organizationId: number,
  opts: AdmittedCatalogDocumentReadOptions,
): Promise<CatalogDocumentRow | null> {
  if (!opts?.executor) throw new MissingRequestDbContextError();
  if (!opts.programId && opts.allowedProgramIds === undefined) throw new CatalogSourceScopeError();
  const textCol = opts.includeText ? 'd.extracted_text' : 'NULL::text AS extracted_text';
  const params: unknown[] = [documentId, organizationId];
  let programClause = '';
  if (opts.programId) { params.push(opts.programId); programClause += ` AND d.program_id = $${params.length}::uuid`; }
  if (opts.allowedProgramIds !== undefined) { params.push([...opts.allowedProgramIds]); programClause += ` AND d.program_id = ANY($${params.length}::uuid[])`; }
  // Newly admitted sources require both recorded tenant consistency and a
  // current version. Programme ownership alone cannot repair legacy conflicts.
  const currentClause = opts.currentOnly ? ` AND NOT ${supersededSql('d')}` : '';
  const res = await opts.executor.query(
    `SELECT d.id, d.organization_id, d.program_id, d.document_code, d.document_title, d.document_type,
            d.file_name, d.mime_type, d.content_hash, to_jsonb(d)->>'version' AS version, ${textCol},
            ${vaultDispositionChoiceSql('d')} AS disposition,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            NOT ${supersededSql('d')} AS is_current,
            d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
            c.catalog_status, c.content_hash AS catalog_content_hash, c.extraction_method, c.extraction_confidence,
            c.extraction_error, c.char_count, c.word_count, c.page_count,
            c.document_kind, c.purpose, c.summary, c.key_data, c.cataloged_at,
            c.catalog_state, c.proposed_model,
            cv.content_hash AS recorded_catalog_content_hash, cv.catalog_status AS recorded_catalog_status
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id AND c.content_hash = d.content_hash
       -- Only the identity of a record for other bytes: its content never leaves the database.
       LEFT JOIN vault.document_catalog cv ON cv.document_id = d.id
      WHERE d.id = $1 AND d.organization_id = $2 AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}${programClause}${currentClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)
      LIMIT 1`,
    params,
  );
  const r = res.rows[0];
  if (!r || r.organization_id !== organizationId) return null;
  return projectAdmittedDocumentRow(r);
}

function projectAdmittedDocumentRow(r: Record<string, any>): CatalogDocumentRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    isCurrent: r.is_current,
    programId: r.program_id,
    documentCode: r.document_code,
    documentTitle: r.document_title,
    documentType: r.document_type,
    fileName: r.file_name,
    mimeType: r.mime_type,
    contentHash: r.content_hash,
    version: r.version == null ? null : requiredText(r.version),
    disposition: r.disposition ?? null,
    originalFileAvailable: r.original_file_available ?? true,
    extractedText: r.extracted_text,
    folderId: r.folder_id,
    evidenceKind: r.evidence_kind,
    ctdSection: r.ctd_section,
    placementStatus: r.placement_status,
    catalog: admittedCatalog(r),
  };
}

/** As projectCatalogRow, for trusted callers that validate the row themselves.
 * A legacy in-memory shape without a recorded hash keeps that hash unknown. */
function admittedCatalog(r: Record<string, any>): CatalogDocumentRow['catalog'] {
  const joined = Boolean(r.catalog_status);
  const status = joined ? r.catalog_status : r.recorded_catalog_status;
  if (!status) return null;
  const recordedHash = joined ? r.catalog_content_hash : r.recorded_catalog_content_hash;
  if (!joined || (recordedHash !== undefined && recordedHash !== r.content_hash)) return otherVersionCatalog(status, recordedHash);
  return {
    ...(recordedHash === undefined ? {} : { version: 'current' as const }),
    status,
    contentHash: recordedHash,
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
    state: catalogStateOf(r),
    proposedModel: r.proposed_model ?? null,
  };
}

/** Current interactive actor/source admission before proposal embedding. The
 * final guarded writer independently pins its exact source under held locks. */
export async function loadCatalogProposalSource(args: CompleteCatalogArgs & { executor?: RequestSqlClient; programId?: string }) {
  if (!args.executor) return { ok: false as const, code: 'REQUEST_DB_CONTEXT_REQUIRED', refusal: 'A current actor request connection is required before reading this source or proposing a catalog description. Nothing was saved.' };
  const source = await loadDocumentForOrg(args.documentId, args.organizationId, { includeText: true, executor: args.executor, userId: args.userId ?? undefined, programId: args.programId });
  const availability = catalogableExpectedProgram(source, args.expectedProgramId ?? args.programId);
  if (!availability.ok) return availability;
  const access = await requireCurrentProgramAccess(args.executor, { organizationId: args.organizationId, userId: args.userId ?? undefined, programId: availability.document.programId });
  const refusal = vaultWriteRefusal(access.actor.role);
  return refusal ? { ok: false as const, refusal: refusal.message } : availability;
}
