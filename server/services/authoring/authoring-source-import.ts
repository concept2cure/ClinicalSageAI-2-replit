/**
 * Pull an exact source into the existing authoring store. Source identities,
 * bytes and provenance come from the server; no pasted source receipt is
 * trusted. The original is never changed. Creation uses the same transaction,
 * lineage and revision writer as the editor and AnA drafts.
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthoringImportOrigin, AuthoringImportSource, AuthoringSourceImportData } from '../../../shared/authoring/source-import';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { isInlineFigureImage } from '../../../shared/authoring/figure-refs';
import { requireGovernedReason } from '../../routes/governed-reason';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { capturedBinaryAvailableSql, capturedDataEligibleSql, vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility';
import { decideAuthoringPermission, type AuthoringPrincipal } from './authoring-permissions';
import { createDocumentFromDraft, type CreateDocumentFromDraftInput } from './authoring-from-draft';
import type { CreateContext } from './authoring-documents';
import type { Queryable } from './authoring-evidence';
import type { DocxImportResult } from '../../import/docx-to-authoring';
import type { ExtractedDocumentText, classifyDocumentFormat } from '../ocr/extractDocumentText';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_CHARS = 2_000_000;
const MAX_SECTIONS = 200;

export interface SourceImportInput { programId: string; source: AuthoringImportSource; reason: string }
export type SourceImportRefusal = { ok: false; status: number; code: string; message: string };
export type SourceImportOutcome = SourceImportRefusal | { ok: true; data: AuthoringSourceImportData };
type SourceRecord = {
  id: string; title: string | null; file_name: string | null; mime_type: string | null;
  content_hash: string | null; document_type: string | null; ctd_section: string | null;
  storage_version_id: string | null; storage_provider: string | null; s3_key: string | null;
  file_upload_id: string | null;
};
type VerifiedSourceRecord = SourceRecord & { content_hash: string };
type OriginalSourceFile = Awaited<ReturnType<SourceImportDeps['readUpload']>> & { sha256: string };
type ConvertedSource = { sections: CreateDocumentFromDraftInput['sections']; warnings: string[] };
interface ImportReservation {
  ctx: CreateContext; principal: AuthoringPrincipal; input: SourceImportInput;
  record: SourceRecord; origin: AuthoringImportOrigin;
}
interface ImportWork extends ImportReservation {
  deps: SourceImportDeps; converted: ConvertedSource;
}

export interface SourceImportDeps {
  readVaultBytes: (record: SourceRecord, tenantId: number) => Promise<Buffer>;
  readUpload: (fileId: string, tenantId: number) => Promise<{ buffer: Buffer; fileName: string; mimeType: string }>;
  classify: typeof classifyDocumentFormat;
  importDocx: (buffer: Buffer) => Promise<DocxImportResult>;
  extractText: (buffer: Buffer, mimeType: string, fileName: string) => Promise<ExtractedDocumentText>;
  create: typeof createDocumentFromDraft;
}

class SourceImportError extends Error {
  constructor(readonly refusal: SourceImportRefusal) { super(refusal.message); }
}
class ExistingImport extends Error {
  constructor(readonly document: Record<string, unknown>) { super('Existing working copy'); }
}
const refused = (status: number, code: string, message: string): SourceImportRefusal => ({ ok: false, status, code, message });
const abort = (status: number, code: string, message: string): never => { throw new SourceImportError(refused(status, code, message)); };
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;

export function parseSourceImportInput(raw: unknown): SourceImportInput | SourceImportRefusal {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const programId = str(body.programId);
  if (!programId || !UUID.test(programId)) return refused(400, 'PROJECT_REQUIRED', 'A valid open project is required.');
  const reason = requireGovernedReason(body.reason);
  if (!reason.ok) return refused(400, 'REASON_REQUIRED', reason.error);
  const source = body.source && typeof body.source === 'object' ? body.source as Record<string, unknown> : {};
  if (source.kind === 'vault' && typeof source.documentId === 'string' && UUID.test(source.documentId)) {
    return { programId: programId.toLowerCase(), source: { kind: 'vault', documentId: source.documentId.toLowerCase() }, reason: reason.reason };
  }
  if (source.kind === 'data-room' && Number.isSafeInteger(source.sourceId) && Number(source.sourceId) > 0) {
    return { programId: programId.toLowerCase(), source: { kind: 'data-room', sourceId: Number(source.sourceId) }, reason: reason.reason };
  }
  return refused(400, 'SOURCE_REQUIRED', 'Choose an exact Vault document or data-room source from this project.');
}

/** Program ownership is tenancy, not a grant to another team's private
 * project. Check the live actor and canonical sharing policy before reading
 * the source, and repeat on the creation transaction before any writes. */
async function authorizedImportPrincipal(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, input: SourceImportInput): Promise<AuthoringPrincipal> {
  const actorId = ctx.actor.id;
  if (typeof actorId !== 'string' || !/^[1-9]\d*$/.test(actorId) || !Number.isSafeInteger(Number(actorId))
    || Number(actorId) > 2_147_483_647 || principal.id !== actorId) {
    return abort(403, 'IMPORT_ACTOR_REQUIRED', 'A verified organization member is required to import this source.');
  }
  try {
    if (!(await programInOrganization(q, input.programId, ctx.tenantId))) return abort(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    const membership = await q.query(
      `SELECT ou.role FROM organization_users ou
        JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
       WHERE ou.user_id = $1 AND ou.organization_id = $2 AND u.status = 'active' AND o.status = 'active'
       FOR SHARE OF ou, u, o`,
      [Number(actorId), ctx.tenantId],
    );
    const role = membership.rows.length === 1 && typeof membership.rows[0].role === 'string'
      ? membership.rows[0].role.trim().toLowerCase() : null;
    if (!role || !GOVERNED_WRITE_ROLES.has(role)) return abort(403, 'IMPORT_WRITE_PERMISSION_DENIED', 'Your current organization role cannot import a working copy.');
    const anchor = await readProgramAnchorRow(q, {
      programId: input.programId, orgId: ctx.tenantId, context: 'authoring-source-import', requireUnique: true,
    });
    if (!anchor) return abort(409, 'PROJECT_ANCHOR_UNRESOLVED', 'This program needs one verified project relationship before sources can be imported.');
    if (!(await canAccessReportProject(ctx.tenantId, { userId: Number(actorId), role }, anchor.id, q))) {
      return abort(403, 'PROJECT_PERMISSION_DENIED', 'You cannot import sources from this project with your current access.');
    }
    // Reuse authorization also uses the fresh role, never a stale token's
    // administrator claim. The actor identity has already been matched above.
    return { ...principal, roles: [role.toUpperCase()] };
  } catch (error) {
    if (error instanceof SourceImportError) throw error;
    return abort(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was imported.');
  }
}

/** Both tenant and project are bound, and dispositions apply before any bytes
 * are read. The metadata below describes the file, never model input. */
async function sourceRecord(q: Queryable, tenantId: number, input: SourceImportInput): Promise<SourceRecord | null> {
  if (input.source.kind === 'vault') {
    const result = await q.query(
      `SELECT d.id::text, d.document_title AS title, d.file_name, d.mime_type, d.content_hash,
              d.document_type, d.ctd_section, d.s3_key,
              to_jsonb(d)->>'storage_version_id' AS storage_version_id,
              to_jsonb(d)->>'storage_provider' AS storage_provider, NULL::text AS file_upload_id
         FROM vault.documents d
        WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
          AND to_jsonb(d)->>'organization_id' = $3::text
          AND ${vaultDataEligibleSql('d')} AND ${vaultBinaryAvailableSql('d')}
        LIMIT 1 FOR SHARE OF d`,
      [input.source.documentId, input.programId, tenantId],
    );
    return result.rows[0] ?? null;
  }
  const result = await q.query(
    `SELECT s.id::text, s.title, f.original_name AS file_name, f.mime_type, s.checksum AS content_hash,
            COALESCE(s.metadata->>'documentType', s.metadata->'dossier'->>'documentType') AS document_type,
            COALESCE(s.metadata->>'ctdSection', s.metadata->'dossier'->>'ctdSection') AS ctd_section,
            NULL::text AS s3_key, NULL::text AS storage_version_id, NULL::text AS storage_provider,
            s.provenance->>'fileUploadId' AS file_upload_id
       FROM cre_evidence_sources s
       LEFT JOIN file_uploads f ON f.id = s.provenance->>'fileUploadId' AND f.organization_id = s.organization_id
      WHERE s.id = $1 AND s.client_program_id = $2 AND s.organization_id = $3
        AND s.source_type = 'client_document' AND s.is_current IS NOT FALSE AND s.deleted_at IS NULL
        AND ${capturedDataEligibleSql('s')} AND ${capturedBinaryAvailableSql('s')}
      LIMIT 1 FOR SHARE OF s`,
    [input.source.sourceId, input.programId, tenantId],
  );
  return result.rows[0] ?? null;
}

async function defaultDeps(): Promise<SourceImportDeps> {
  const [vault, uploads, docx, extraction] = await Promise.all([
    import('../../routes/c2c/project-vault'), import('../ana/uploaded-file-access'),
    import('../../import/docx-to-authoring'), import('../ocr/extractDocumentText'),
  ]);
  return {
    readVaultBytes: async (record, tenantId) => {
      const result = await vault.readVerifiedVaultBytes({ storageVersionId: record.storage_version_id,
        storageKey: record.s3_key, storageProvider: record.storage_provider, organizationId: tenantId },
      record.content_hash, record.id);
      if (!result.ok) return abort(result.status, result.error, result.message ?? 'The stored source file is unavailable. Nothing was imported.');
      return result.bytes;
    },
    readUpload: async (id, tenantId) => {
      try { return await uploads.loadUploadedFile(id, tenantId); }
      catch (error) {
        if (error instanceof uploads.UploadedFileError) return abort(409, 'SOURCE_FILE_UNAVAILABLE', 'The captured file is missing, withdrawn, or failed its integrity check. Nothing was imported.');
        // An infrastructure failure is not proof that the original is missing.
        throw error;
      }
    },
    classify: extraction.classifyDocumentFormat, importDocx: docx.importDocx,
    extractText: extraction.extractDocumentText, create: createDocumentFromDraft,
  };
}

const escaped = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function convert(bytes: Buffer, origin: AuthoringImportOrigin, deps: SourceImportDeps): Promise<ConvertedSource> {
  if (deps.classify(origin.mimeType, origin.fileName) === 'docx') {
    const parsed = await deps.importDocx(bytes);
    if (!parsed.sections.length || !parsed.sections.some(s => s.html.trim() || s.title.trim())) {
      return abort(409, 'SOURCE_TEXT_UNREADABLE', 'The Word file produced no editable content. Nothing was imported.');
    }
    if (parsed.sections.length > MAX_SECTIONS) return abort(409, 'SOURCE_TOO_MANY_SECTIONS', 'This source has more than 200 sections; split it before importing. Nothing was imported.');
    const warnings = [...parsed.warnings];
    if (parsed.sections.some(s => !s.code)) warnings.push('Sections without source codes use working identifiers (import.1, import.2, …). These are not CTD filing locations.');
    let omittedImages = 0;
    const sections = parsed.sections.map((section, i) => ({
      code: section.code || (parsed.sections.length === 1 && origin.sectionCode ? origin.sectionCode : `import.${i + 1}`),
      title: section.title || origin.title,
      content: section.html.replace(/<img\b[^>]*>/gi, tag => {
        const src = /\bsrc=["']([^"']*)["']/i.exec(tag)?.[1];
        if (isInlineFigureImage(src)) return tag;
        omittedImages++;
        const alt = /\balt=["']([^"']*)["']/i.exec(tag)?.[1];
        return `<p>[Embedded figure from source${alt ? ': ' + escaped(alt) : ''}; add the verified figure in the editor.]</p>`;
      }),
    }));
    if (omittedImages) warnings.push(`${omittedImages} unsupported embedded image(s) were retained as named gaps. The original figures remain in the source file; add supported PNG, JPEG or GIF figures in the editor.`);
    if (sections.reduce((n, s) => n + s.content.length, 0) > MAX_CHARS) return abort(409, 'SOURCE_TOO_LARGE', 'This source exceeds the editor import size limit. Nothing was imported.');
    return { sections, warnings };
  }
  if (deps.classify(origin.mimeType, origin.fileName) === 'unknown') return abort(409, 'SOURCE_FORMAT_UNSUPPORTED', 'This file format has no editable conversion. Save a Word (.docx) or readable text/PDF copy, then import it. Nothing was imported.');
  const extracted = await deps.extractText(bytes, origin.mimeType, origin.fileName);
  if (!extracted.text.trim() || extracted.method === 'none') return abort(409, 'SOURCE_TEXT_UNREADABLE', 'The original file produced no readable text. Review the source or provide a readable copy. Nothing was imported.');
  if (extracted.text.length > MAX_CHARS) return abort(409, 'SOURCE_TOO_LARGE', 'This source exceeds the editor import size limit. Nothing was imported.');
  const warnings = ['Imported as extracted text. Page layout, table structure, images, spreadsheet formulas and official form controls are not preserved. Compare the working copy with the original before review or filing.'];
  if (extracted.method.includes('ocr')) warnings.push('OCR supplied this text and may misread words or numbers. Check it against the original source.');
  if (!origin.sectionCode) warnings.push('The section uses working identifier import.1; choose its CTD filing location separately.');
  return { sections: [{ code: origin.sectionCode || 'import.1', title: origin.title,
    content: extracted.text.split(/\r?\n\s*\r?\n/).map(paragraph => `<p>${escaped(paragraph).replace(/\r?\n/g, '<br>')}</p>`).join('') }], warnings };
}

/** Reserve the source/version and exact creator's working copy. Concurrent
 * clicks serialize without replacing anybody's existing edited content. */
async function reserve(q: Queryable, { ctx, principal, input, record: original, origin }: ImportReservation): Promise<void> {
  const currentPrincipal = await authorizedImportPrincipal(q, ctx, principal, input);
  await lockDocumentDispositionProgram(q, ctx.tenantId, input.programId);
  if (input.source.kind === 'data-room' && original.file_upload_id) {
    await q.query('SELECT id FROM file_uploads WHERE id = $1 AND organization_id = $2 FOR SHARE', [original.file_upload_id, ctx.tenantId]);
  }
  const current = await sourceRecord(q, ctx.tenantId, input);
  if (!current || JSON.stringify(current) !== JSON.stringify(original)) abort(409, 'SOURCE_CHANGED', 'The source changed or became unavailable while it was being imported. Refresh and try again. Nothing was imported.');
  const key = `${ctx.tenantId}:${input.programId}:${origin.kind}:${origin.id}:${origin.sha256}:${ctx.actor.id}`;
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  const existing = await q.query(
    `SELECT d.* FROM authoring_documents d
      WHERE d.tenant_id = $1 AND d.client_program_id = $2 AND d.created_by = $3
        AND upper(d.status) = 'DRAFT'
        AND d.provenance->'importSource'->>'kind' = $4
        AND d.provenance->'importSource'->>'id' = $5
        AND d.provenance->'importSource'->>'sha256' = $6
      ORDER BY d.created_at LIMIT 1`,
    [ctx.tenantId, input.programId, ctx.actor.id, origin.kind, origin.id, origin.sha256],
  );
  const document = existing.rows[0];
  if (document) {
    const permission = await decideAuthoringPermission({ pool: q as Pool, principal: currentPrincipal,
      scope: { tenantId: ctx.tenantId, docId: document.id, sectionId: null, documentStatus: document.status, createdBy: document.created_by }, action: 'edit' });
    if (!permission.allowed) abort(403, 'WORKING_COPY_PERMISSION_DENIED', 'Your existing working copy is not editable with your current permissions. Nothing was imported.');
    throw new ExistingImport(document);
  }
}

async function verifiedSourceRecord(ctx: CreateContext, input: SourceImportInput): Promise<VerifiedSourceRecord> {
  const record = await sourceRecord(ctx.pool, ctx.tenantId, input);
  if (!record) return abort(404, 'SOURCE_NOT_FOUND', 'This source is not available in this project.');
  if (!record.content_hash || !HASH.test(record.content_hash.trim())) return abort(409, 'SOURCE_HASH_UNAVAILABLE', 'This source has no verifiable SHA-256 record. Nothing was imported.');
  return { ...record, content_hash: record.content_hash };
}

async function capturedSourceFile(record: SourceRecord, tenantId: number, deps: SourceImportDeps): ReturnType<SourceImportDeps['readUpload']> {
  if (!record.file_upload_id) return abort(409, 'NO_STORED_FILE', 'This captured source has no original file to import.');
  return deps.readUpload(record.file_upload_id, tenantId);
}

async function originalSourceFile(ctx: CreateContext, input: SourceImportInput, record: VerifiedSourceRecord, deps: SourceImportDeps): Promise<OriginalSourceFile> {
  const file = input.source.kind === 'data-room'
    ? await capturedSourceFile(record, ctx.tenantId, deps)
    : { buffer: await deps.readVaultBytes(record, ctx.tenantId), fileName: record.file_name || '', mimeType: record.mime_type || '' };
  if (!file.buffer.length || file.buffer.length > MAX_BYTES) return abort(409, 'SOURCE_SIZE_REFUSED', 'The original source is empty or larger than 25 MB. Nothing was imported.');
  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  if (sha256 !== record.content_hash.trim().toLowerCase()) return abort(409, 'SOURCE_HASH_MISMATCH', 'The original file differs from this source version’s recorded SHA-256. Nothing was imported.');
  return { ...file, sha256 };
}

function sourceOrigin(input: SourceImportInput, record: SourceRecord, file: OriginalSourceFile, deps: SourceImportDeps): AuthoringImportOrigin {
  const fileName = file.fileName || record.file_name || record.title || 'Source document';
  const mimeType = file.mimeType || record.mime_type || 'application/octet-stream';
  return { kind: input.source.kind, id: String(record.id), programId: input.programId,
    title: record.title || fileName, fileName, mimeType, sha256: file.sha256,
    documentType: record.document_type || null, sectionCode: record.ctd_section || null,
    conversion: deps.classify(mimeType, fileName) === 'docx' ? 'docx-structure' : 'extracted-text' };
}

function importedDraft(input: SourceImportInput, origin: AuthoringImportOrigin, converted: ConvertedSource): CreateDocumentFromDraftInput {
  const ctdCode = normalizeCtdCode(origin.sectionCode) || converted.sections.map(s => normalizeCtdCode(s.code)).find(Boolean);
  return { programId: input.programId, title: origin.title, module: ctdCode ? `M${ctdCode[0]}` : null,
    documentType: origin.documentType, sections: converted.sections, provenance: { source: 'import', note: input.reason } };
}

async function existingWorkingCopy(work: ImportWork, document: Record<string, unknown>): Promise<SourceImportOutcome> {
  const sections = await work.ctx.pool.query('SELECT * FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at', [document.id, work.ctx.tenantId]);
  const savedOrigin = (document.provenance as { importSource?: AuthoringImportOrigin & { warnings?: string[] } } | undefined)?.importSource;
  return { ok: true, data: { doc: document as AuthoringSourceImportData['doc'], sections: sections.rows,
    origin: savedOrigin ?? work.origin, warnings: savedOrigin?.warnings ?? work.converted.warnings, reused: true } };
}

async function saveWorkingCopy(work: ImportWork): Promise<SourceImportOutcome> {
  const { ctx, input, origin, converted, deps } = work;
  try {
    const outcome = await deps.create(ctx, importedDraft(input, origin, converted), { verifiedImport: { origin, warnings: converted.warnings,
      reason: input.reason, reserve: q => reserve(q, work) } });
    if (outcome.kind === 'refused') return refused(outcome.status, outcome.code ?? 'SOURCE_IMPORT_REFUSED', outcome.error);
    if (typeof outcome.document.id !== 'string' || typeof outcome.document.title !== 'string') throw new Error('Saved working copy lacks document identity');
    return { ok: true, data: { doc: { ...outcome.document, id: outcome.document.id, title: outcome.document.title, provenance: outcome.provenance },
      sections: outcome.sections, origin, warnings: converted.warnings, reused: false } };
  } catch (error) {
    if (!(error instanceof ExistingImport)) throw error;
    return existingWorkingCopy(work, error.document);
  }
}

export async function importSourceDocument(ctx: CreateContext, principal: AuthoringPrincipal, raw: unknown, suppliedDeps?: SourceImportDeps): Promise<SourceImportOutcome> {
  const input = parseSourceImportInput(raw);
  if ('ok' in input) return input;
  try {
    const currentPrincipal = await authorizedImportPrincipal(ctx.pool, ctx, principal, input);
    const record = await verifiedSourceRecord(ctx, input);
    const deps = suppliedDeps ?? await defaultDeps();
    const file = await originalSourceFile(ctx, input, record, deps);
    const origin = sourceOrigin(input, record, file, deps);
    const converted = await convert(file.buffer, origin, deps);
    return await saveWorkingCopy({ ctx, principal: currentPrincipal, input, record, origin, converted, deps });
  } catch (error) {
    if (error instanceof SourceImportError) return error.refusal;
    throw error;
  }
}
