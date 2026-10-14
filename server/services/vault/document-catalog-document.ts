/** Canonical document read: actor and recorded source parent precede metadata. */
import type { RequestSqlClient } from '../../db/requestDb.js';
import { MissingRequestDbContextError } from '../../db/requestDb.js';
import { ProgramReadAccessError, readCurrentProgramActor, requireCurrentProgramAccess } from '../c2c/current-program-access.js';
import { vaultDataEligibleSql, vaultDispositionChoiceSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { supersededSql } from './vault-version-family.js';
import { catalogStateOf } from './document-catalog-governance.service.js';
import type { CatalogStatus } from './document-catalog-core.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org-checked document row every tool call resolves through (see module header on tenancy). */
export interface CatalogDocumentRow {
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
  extractedText: string | null;
  folderId: string | null;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  catalog: {
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

async function admittedProgram(documentId: string, organizationId: number, opts: CatalogDocumentReadOptions): Promise<string | null> {
  const q = opts.executor;
  await readCurrentProgramActor(q, { organizationId, userId: opts.userId });
  if (!UUID.test(documentId) || (opts.programId !== undefined && !UUID.test(opts.programId))) return null;
  const currentClause = opts.currentOnly ? ` AND NOT ${supersededSql('d')}` : '';
  const source = await q.query(
    `SELECT d.id::text, d.program_id::text, d.organization_id FROM vault.documents d
      WHERE d.id = $1::uuid AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}${currentClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $2)
      LIMIT 1`, [documentId, organizationId],
  );
  const record = source.rows[0];
  if (!record) return null;
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
  const q = opts.executor;
  const programId = await admittedProgram(documentId, organizationId, opts);
  if (!programId) return null;
  const currentClause = opts.currentOnly ? ` AND NOT ${supersededSql('d')}` : '';
  const accessInput = { organizationId, userId: opts.userId, programId };
  const textCol = opts.includeText ? 'd.extracted_text' : 'NULL::text AS extracted_text';
  const res = await q.query(
    `SELECT d.id, d.program_id, d.document_code, d.document_title, d.document_type,
            d.file_name, d.mime_type, d.content_hash, ${textCol},
            ${vaultDispositionChoiceSql('d')} AS disposition,
            ${vaultBinaryAvailableSql('d')} AS original_file_available,
            d.folder_id, d.evidence_kind, d.ctd_section, d.placement_status,
            c.catalog_status, c.content_hash AS catalog_content_hash, c.extraction_method, c.extraction_confidence,
            c.extraction_error, c.char_count, c.word_count, c.page_count,
            c.document_kind, c.purpose, c.summary, c.key_data, c.cataloged_at,
            c.catalog_state, c.proposed_model
       FROM vault.documents d
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE d.id = $1::uuid AND d.program_id = $3::uuid AND d.organization_id = $2 AND d.deleted_at IS NULL
        AND ${vaultDataEligibleSql('d')}${currentClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $2)
      LIMIT 1`, [documentId, organizationId, programId],
  );
  const r = res.rows[0];
  if (!r) return null;
  await requireCurrentProgramAccess(q, accessInput);
  return projectDocumentRow(r, { documentId, programId });
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

function projectCatalogRow(r: Record<string, unknown>): CatalogDocumentRow['catalog'] {
  const status = r.catalog_status;
  if (status === null) return null;
  if (status !== 'extracted' && status !== 'extraction_failed' && status !== 'cataloged') return invalidDocumentRow();
  const charCount = nullableNumber(r.char_count);
  if (charCount === null || !Number.isSafeInteger(charCount) || charCount < 0) return invalidDocumentRow();
  return {
    status, contentHash: requiredText(r.catalog_content_hash),
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
  return {
    id, programId,
    documentCode: nullableText(r.document_code), documentTitle: nullableText(r.document_title),
    documentType: nullableText(r.document_type), fileName: nullableText(r.file_name),
    mimeType: nullableText(r.mime_type), contentHash: requiredText(r.content_hash),
    disposition, originalFileAvailable: r.original_file_available, extractedText: nullableText(r.extracted_text),
    folderId: nullableText(r.folder_id), evidenceKind: nullableText(r.evidence_kind), ctdSection: nullableText(r.ctd_section),
    placementStatus: requiredText(r.placement_status), catalog: projectCatalogRow(r),
  };
}
