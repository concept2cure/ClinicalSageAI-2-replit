import { isWorkflowSourceKind, studyDesignImportId } from '../../../shared/authoring/source-import';
/**
 * Pull an exact source into the existing authoring store. Source identities,
 * bytes and provenance come from the server; no pasted source receipt is
 * trusted. The original is never changed. Creation uses the same transaction,
 * lineage and revision writer as the editor and AnA drafts.
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthoringImportOrigin, AuthoringSourceImportData, AuthoringSourceImportPreviewData, BinaryImportOrigin, BinaryImportSource, WorkflowImportSource } from '../../../shared/authoring/source-import';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { isInlineFigureImage } from '../../../shared/authoring/figure-refs';
import { requireGovernedReason } from '../../routes/governed-reason';
import { supersededSql } from '../vault/vault-version-family';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { capturedBinaryAvailableSql, capturedDataEligibleSql, vaultBinaryAvailableSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility';
import { decideAuthoringPermission, type AuthoringPrincipal } from './authoring-permissions';
import { createDocumentFromDraft, type CreateDocumentFromDraftInput } from './authoring-from-draft';
import { allocateImportedSectionCodes } from './authoring-source-conversion';
import type { CreateContext } from './authoring-documents';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { materializeWorkflowSource, WorkflowSourceImportError, type MaterializedWorkflowSource } from './workflow-source-import';
import type { Queryable } from './authoring-evidence';
import type { DocxImportResult } from '../../import/docx-to-authoring';
import type { ExtractedDocumentText, classifyDocumentFormat } from '../ocr/extractDocumentText';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_CHARS = 2_000_000;
const MAX_SECTIONS = 200;

export interface SourceImportInput { programId: string; source: BinaryImportSource; reason: string }
export type SourceImportRefusal = { ok: false; status: number; code: string; message: string };
export type SourceImportOutcome = SourceImportRefusal | { ok: true; data: AuthoringSourceImportData | AuthoringSourceImportPreviewData };
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
  record: SourceRecord; origin: BinaryImportOrigin;
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

async function authorizedImportPrincipal(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, input: SourceImportInput): Promise<AuthoringPrincipal> {
  try {
    return (await authorizeAuthoringProgram(q, { tenantId: ctx.tenantId, actor: ctx.actor, principal, programId: input.programId })).principal;
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) return abort(error.status, error.code, error.message);
    throw error;
  }
}

async function requireCurrentVaultSource(q: Queryable, tenantId: number, programId: string, documentId: string): Promise<void> {
  // Run after sourceRecord acquires the original row's FOR SHARE. A check-in
  // holds that same predecessor FOR UPDATE while inserting its successor. A
  // fresh statement sees a successor committed while we waited for the row;
  // the transaction keeps the row lock until authoring creation/reuse ends.
  const result = await q.query(
    `SELECT NOT ${supersededSql('d')} AS current FROM vault.documents d
      WHERE d.id = $1 AND d.program_id = $2 AND d.organization_id = $3 AND d.deleted_at IS NULL`,
    [documentId, programId, tenantId],
  );
  if (result.rows.length !== 1 || result.rows[0].current !== true) {
    abort(409, 'SOURCE_CHANGED', 'This Vault source is no longer the current version. Refresh the source list and choose its current version. Nothing was imported.');
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
    const record = result.rows[0] ?? null;
    if (record) await requireCurrentVaultSource(q, tenantId, input.programId, input.source.documentId);
    return record;
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

async function convert(bytes: Buffer, origin: BinaryImportOrigin, deps: SourceImportDeps): Promise<ConvertedSource> {
  if (deps.classify(origin.mimeType, origin.fileName) === 'docx') {
    const parsed = await deps.importDocx(bytes);
    if (!parsed.sections.length || !parsed.sections.some(s => s.html.trim() || s.title.trim())) {
      return abort(409, 'SOURCE_TEXT_UNREADABLE', 'The Word file produced no editable content. Nothing was imported.');
    }
    if (parsed.sections.length > MAX_SECTIONS) return abort(409, 'SOURCE_TOO_MANY_SECTIONS', 'This source has more than 200 sections; split it before importing. Nothing was imported.');
    const allocation = allocateImportedSectionCodes(parsed.sections, origin.sectionCode);
    const warnings = [...parsed.warnings, ...allocation.warnings];
    if (parsed.sections.some(s => !s.code)) warnings.push('Sections without source codes use working identifiers (import.1, import.2, …). These are not CTD filing locations.');
    let omittedImages = 0;
    const sections = parsed.sections.map((section, i) => ({
      code: allocation.codes[i],
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

function sourceOrigin(input: SourceImportInput, record: SourceRecord, file: OriginalSourceFile, deps: SourceImportDeps): BinaryImportOrigin {
  const fileName = file.fileName || record.file_name || record.title || 'Source document';
  const mimeType = file.mimeType || record.mime_type || 'application/octet-stream';
  return { kind: input.source.kind, id: String(record.id), programId: input.programId,
    title: record.title || fileName, fileName, mimeType, sha256: file.sha256,
    documentType: record.document_type || null, sectionCode: record.ctd_section || null,
    conversion: deps.classify(mimeType, fileName) === 'docx' ? 'docx-structure' : 'extracted-text' };
}

function importedDraft(input: SourceImportInput, origin: BinaryImportOrigin, converted: ConvertedSource): CreateDocumentFromDraftInput {
  const ctdCode = normalizeCtdCode(origin.sectionCode) || converted.sections.map(s => normalizeCtdCode(s.code)).find(Boolean);
  return { programId: input.programId, title: origin.title, module: ctdCode ? `M${ctdCode[0]}` : null,
    documentType: origin.documentType, sections: converted.sections, provenance: { source: 'import', note: input.reason } };
}

async function existingWorkingCopy(work: { ctx: CreateContext; origin: AuthoringImportOrigin; converted: ConvertedSource }, document: Record<string, unknown>): Promise<SourceImportOutcome> {
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

interface WorkflowInput { programId: string; source: WorkflowImportSource; previewOnly: boolean; expectedFingerprint?: string; reason?: string; associationReason?: string }
const workflowInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647;

function csrWorkflowSelector(selected: Record<string, unknown>): WorkflowImportSource {
  if (selected.kind !== 'csr' || !workflowInteger(selected.jobId)) return abort(400, 'SOURCE_REQUIRED', 'Choose an exact saved workflow source.');
  const selection = selected.sectionNumbers;
  if (selection === undefined) return { kind: 'csr', jobId: Number(selected.jobId) };
  if (!Array.isArray(selection) || !selection.length || selection.length > MAX_SECTIONS
    || selection.some(v => typeof v !== 'string' || !/^\d+(?:\.\d+)*$/.test(v))) return abort(400, 'SOURCE_REQUIRED', 'Choose valid saved CSR section numbers.');
  return { kind: 'csr', jobId: Number(selected.jobId), sectionNumbers: [...new Set(selection as string[])].sort() };
}

function workflowSelector(selected: Record<string, unknown>): WorkflowImportSource {
  if (selected.kind === 'protocol' && workflowInteger(selected.documentId)) return { kind: 'protocol', documentId: Number(selected.documentId) };
  const studyId = studyDesignImportId(selected.studyId);
  if (selected.kind === 'study-design-crf' && studyId) return { kind: 'study-design-crf', studyId };
  if ((selected.kind === 'ivd-assessment' || selected.kind === 'ivd-document') && typeof selected.documentId === 'string' && UUID.test(selected.documentId)) return { kind: selected.kind, documentId: selected.documentId.toLowerCase() };
  return csrWorkflowSelector(selected);
}

function workflowReason(value: unknown, code: string): string {
  const checked = requireGovernedReason(value);
  if (!checked.ok) return abort(400, code, checked.error);
  return checked.reason;
}

function parseWorkflowInput(raw: Record<string, unknown>): WorkflowInput | SourceImportRefusal {
  const programId = str(raw.programId);
  if (!programId || !UUID.test(programId)) return refused(400, 'PROJECT_REQUIRED', 'A valid open project is required.');
  const source = workflowSelector(raw.source as Record<string, unknown>);
  const previewOnly = raw.previewOnly === true;
  const reason = previewOnly ? undefined : workflowReason(raw.reason, 'REASON_REQUIRED');
  const associationReason = raw.associationReason === undefined ? undefined : workflowReason(raw.associationReason, 'ASSOCIATION_REASON_REQUIRED');
  const expectedFingerprint = str(raw.expectedFingerprint);
  if (!previewOnly && (!expectedFingerprint || !HASH.test(expectedFingerprint))) return refused(400, 'SOURCE_PREVIEW_REQUIRED', 'Preview this exact saved source before creating its working copy.');
  return { programId: programId.toLowerCase(), source, previewOnly, reason, associationReason, expectedFingerprint: expectedFingerprint?.toLowerCase() };
}

async function coherentWorkflowSnapshot(ctx: CreateContext, principal: AuthoringPrincipal, input: WorkflowInput) {
  const client = await ctx.pool.connect();
  let discardConnection: Error | undefined;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const target = await authorizeAuthoringProgram(client, { tenantId: ctx.tenantId, actor: ctx.actor, principal, programId: input.programId });
    const materialized = await materializeWorkflowSource({ organizationId: ctx.tenantId, userId: Number(ctx.actor.id),
      target: { programId: input.programId, projectId: target.projectId }, source: input.source, associationReason: input.associationReason }, client);
    await client.query('COMMIT');
    return { target, materialized };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { discardConnection = new Error('Workflow snapshot rollback failed'); });
    throw error;
  } finally { client.release(discardConnection); }
}

async function reserveWorkflow(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, input: WorkflowInput, original: MaterializedWorkflowSource): Promise<void> {
  const target = await authorizeAuthoringProgram(q, { tenantId: ctx.tenantId, actor: ctx.actor, principal, programId: input.programId });
  const current = await materializeWorkflowSource({ organizationId: ctx.tenantId, userId: Number(ctx.actor.id),
    target: { programId: input.programId, projectId: target.projectId }, source: input.source, associationReason: input.associationReason }, q);
  if (current.fingerprint !== original.fingerprint || current.fingerprint !== input.expectedFingerprint) abort(409, 'SOURCE_CHANGED', 'The saved workflow source changed. Preview it again. Nothing was imported.');
  const key = `${ctx.tenantId}:${input.programId}:${original.origin.kind}:${original.origin.id}:${original.fingerprint}:${ctx.actor.id}`;
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
  const existing = await q.query(`SELECT d.* FROM authoring_documents d
    WHERE d.tenant_id=$1 AND d.client_program_id=$2 AND d.created_by=$3 AND upper(d.status)='DRAFT'
      AND d.provenance->'importSource'->>'kind'=$4 AND d.provenance->'importSource'->>'id'=$5
      AND d.provenance->'importSource'->>'fingerprint'=$6 ORDER BY d.created_at LIMIT 1`,
    [ctx.tenantId, input.programId, ctx.actor.id, original.origin.kind, original.origin.id, original.fingerprint]);
  if (existing.rows[0]) {
    const document = existing.rows[0];
    const permission = await decideAuthoringPermission({ pool: q as Pool, principal: target.principal,
      scope: { tenantId: ctx.tenantId, docId: document.id, sectionId: null, documentStatus: document.status, createdBy: document.created_by }, action: 'edit' });
    if (!permission.allowed) abort(403, 'WORKING_COPY_PERMISSION_DENIED', 'Your current permissions cannot edit the existing working copy.');
    throw new ExistingImport(document);
  }
}

async function createWorkflowCopy(ctx: CreateContext, principal: AuthoringPrincipal, input: WorkflowInput, materialized: MaterializedWorkflowSource): Promise<SourceImportOutcome> {
  try {
    const outcome = await createDocumentFromDraft(ctx, { programId: input.programId, title: materialized.origin.title, module: null, documentType: null,
      sections: materialized.sections, provenance: { source: 'import', note: input.reason } }, { verifiedImport: {
        origin: materialized.origin, warnings: [...materialized.warnings, ...materialized.gaps], reason: input.reason!, forceUnbound: true,
        reserve: q => reserveWorkflow(q, ctx, principal, input, materialized),
      } });
    if (outcome.kind === 'refused') return refused(outcome.status, outcome.code ?? 'SOURCE_IMPORT_REFUSED', outcome.error);
    if (typeof outcome.document.id !== 'string' || typeof outcome.document.title !== 'string') throw new Error('Working copy identity unavailable');
    return { ok: true, data: { doc: { ...outcome.document, id: outcome.document.id, title: outcome.document.title, provenance: outcome.provenance },
      sections: outcome.sections, origin: materialized.origin, warnings: [...materialized.warnings, ...materialized.gaps], reused: false } };
  } catch (error) {
    if (error instanceof ExistingImport) return existingWorkingCopy({ ctx, origin: materialized.origin, converted: { sections: materialized.sections, warnings: [...materialized.warnings, ...materialized.gaps] } }, error.document);
    throw error;
  }
}

async function importWorkflow(ctx: CreateContext, principal: AuthoringPrincipal, input: WorkflowInput): Promise<SourceImportOutcome> {
  const { target, materialized } = await coherentWorkflowSnapshot(ctx, principal, input);
  if (input.previewOnly) return { ok: true, data: { preview: true, origin: materialized.origin, fingerprint: materialized.fingerprint,
    sections: materialized.sections.map(s => ({ code: s.code, title: s.title, contentSha256: createHash('sha256').update(s.content).digest('hex') })),
    gaps: materialized.gaps, warnings: materialized.warnings, target: { programId: input.programId, projectId: target.projectId }, association: materialized.association } };
  if (materialized.association.required && !input.associationReason) return refused(400, 'ASSOCIATION_REASON_REQUIRED', 'State why this organization-scoped source belongs in the selected project.');
  if (materialized.fingerprint !== input.expectedFingerprint) return refused(409, 'SOURCE_CHANGED', 'The workflow source changed. Preview it again. Nothing was imported.');
  if (!materialized.sections.length || materialized.sections.length > MAX_SECTIONS || materialized.sections.reduce((n, s) => n + s.content.length, 0) > MAX_CHARS) return refused(409, 'SOURCE_SIZE_REFUSED', 'The saved workflow output is empty or exceeds the editor limits.');
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await createWorkflowCopy(ctx, target.principal, input, materialized); }
    catch (error) {
      if ((error as { code?: string }).code !== '40001') throw error;
      if (attempt) return refused(409, 'IMPORT_RETRY_REQUIRED', 'The source or working copy changed concurrently. Retry the import. Nothing was overwritten.');
    }
  }
  throw new Error('Workflow import retry exhausted');
}

export async function importSourceDocument(ctx: CreateContext, principal: AuthoringPrincipal, raw: unknown, suppliedDeps?: SourceImportDeps): Promise<SourceImportOutcome> {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const source = body.source && typeof body.source === 'object' ? body.source as Record<string, unknown> : {};
  try {
    if (isWorkflowSourceKind(source.kind)) {
      const input = parseWorkflowInput(body);
      return 'ok' in input ? input : await importWorkflow(ctx, principal, input);
    }
    const input = parseSourceImportInput(raw);
    if ('ok' in input) return input;
    const currentPrincipal = await authorizedImportPrincipal(ctx.pool, ctx, principal, input);
    const record = await verifiedSourceRecord(ctx, input);
    const deps = suppliedDeps ?? await defaultDeps();
    const file = await originalSourceFile(ctx, input, record, deps);
    const origin = sourceOrigin(input, record, file, deps);
    const converted = await convert(file.buffer, origin, deps);
    return await saveWorkingCopy({ ctx, principal: currentPrincipal, input, record, origin, converted, deps });
  } catch (error) {
    if (error instanceof SourceImportError) return error.refusal;
    if (error instanceof AuthoringProgramAccessError || error instanceof WorkflowSourceImportError) return refused(error.status, error.code, error.message);
    throw error;
  }
}
