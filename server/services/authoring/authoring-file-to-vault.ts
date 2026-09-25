/**
 * File an authoring document into its project's vault (WM, 2026-09-21,
 * docs/design/ANA_DOCUMENT_CANVAS.md "The editor is project-scoped and
 * vault-connected").
 *
 * ── Composition, not a new path ─────────────────────────────────────────────
 *   1. render   — renderAuthoringExport, the export route's own renderer
 *   2. ingest   — ingestVaultDocument, the ONE admission into vault.documents
 *                 (magic bytes, storage, extraction, its own chained audit row)
 *   3. file     — placeVaultDocument, the ONE writer of a filing decision, when
 *                 a target folder is known (explicit, or derived from the CTD
 *                 module); otherwise the classifier's proposal stands
 *   4. record   — ONE transaction: the export-history row the Exports rail
 *                 lists, the EXPORT audit-trail row, and one governed chained
 *                 audit row (`authoring.document.file_to_vault`) that names the
 *                 document, the vault row, the bytes' SHA-256 and the folder.
 *
 * ── Refusals ────────────────────────────────────────────────────────────────
 *   • no program           409 DOCUMENT_HAS_NO_PROGRAM — a vault is a project's
 *   • mid-freeze           409 DOCUMENT_MID_FREEZE — a freeze transaction holds
 *                          the document row (FOR UPDATE NOWAIT refused), or the
 *                          row carries a lock without a sealed status
 *   • unsealed documents are filed — as WORKING DRAFTS, said so on page one of
 *     the rendered file and in the vault version label. The export route's
 *     Part 11 filing-artifact gate stays where it is; the project vault holds
 *     working files as well as sealed ones, and lying about which is which is
 *     the only thing refused.
 *
 * ── Never a partial write ───────────────────────────────────────────────────
 * Rendering writes nothing. Ingest is atomic in itself. If the filing or the
 * final record transaction fails after ingest committed, the vault row is
 * soft-deleted (compensation) and the caller is told nothing was filed. The
 * compensation is exercised by the route test, which forces the final
 * transaction to fail and asserts the vault row is no longer visible.
 */

import crypto from 'crypto';
import { writeChainedAuditRow } from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { LOCKED_DOCUMENT_STATUSES } from './document-lock';
import { columnState, writeAuthoringAuditTrail, type AuthoringAuditContext } from './authoring-evidence';
import { renderAuthoringExport, logExport, computeDocHash, type RenderedExport } from './authoring-export';
import type { AuthoringPool, AuthoringActor } from './authoring-documents';
import { ingestVaultDocument } from '../vault/vault-ingest.service';
import { placeVaultDocument, type VaultFilingRecord } from '../vault/vault-placement.service';
import { resolveVaultView, isFolderInView, folderLabel } from '../vault/vault-filing.service';
import { VAULT_INGEST_DOCUMENT_TYPES } from '../../../shared/constants/domain/vault-taxonomy';

const logger = createScopedLogger('authoring-file-to-vault');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VaultFileFormat = 'pdf' | 'docx';
export const VAULT_FILE_FORMATS: readonly VaultFileFormat[] = ['pdf', 'docx'];

export interface FileToVaultArgs {
  pool: AuthoringPool;
  tenantId: number;
  actor: AuthoringActor;
  audit: AuthoringAuditContext;
  docId: string;
  format: VaultFileFormat;
  folderId?: string | null;
  documentType?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

export type FileToVaultOutcome =
  | { kind: 'refused'; status: number; code: string; error: string }
  | {
      kind: 'filed';
      vaultDocumentId: string;
      folder: VaultFilingRecord;
      sha256: string;
      format: VaultFileFormat;
      fileName: string;
      programId: string;
      sealed: boolean;
    };

interface DocRow {
  id: string;
  title: string;
  module: string | null;
  status: string | null;
  locked_at: string | Date | null;
  client_program_id: string | null;
  version: string | null;
  created_at: unknown;
}

const refuse = (status: number, code: string, error: string): FileToVaultOutcome => ({ kind: 'refused', status, code, error });

/** Postgres: lock_not_available — another transaction holds the row FOR UPDATE. */
const LOCK_NOT_AVAILABLE = '55P03';

/**
 * The document row, taken FOR UPDATE NOWAIT in its own short transaction: a
 * freeze in flight holds this row for the length of its transaction, so a
 * refused lock IS the "mid-freeze" signal, observed rather than inferred.
 */
async function readDocumentForFiling(
  pool: AuthoringPool,
  docId: string,
  tenantId: number,
): Promise<DocRow | FileToVaultOutcome> {
  if ((await columnState(pool, 'client_program_id')) !== 'present') {
    return refuse(409, 'DOCUMENT_HAS_NO_PROGRAM',
      'This deployment cannot scope an authoring document to a project (no client_program_id column), so nothing can be filed into a project vault.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // provenance carries `moduleDefaulted` when the draft's module was assumed
    // rather than chosen; read it only where the column exists.
    const hasProvenance = (await columnState(pool, 'provenance')) === 'present';
    const r = await client.query(
      `SELECT id, title, module, status, locked_at, client_program_id, version, created_at${hasProvenance ? ', provenance' : ''}
         FROM authoring_documents WHERE id = $1 AND tenant_id = $2
         FOR UPDATE NOWAIT`,
      [docId, tenantId],
    );
    await client.query('COMMIT');
    const doc = r.rows[0] as DocRow | undefined;
    if (!doc) return refuse(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    return doc;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if ((err as { code?: string })?.code === LOCK_NOT_AVAILABLE) {
      return refuse(409, 'DOCUMENT_MID_FREEZE',
        'This document is being frozen right now; its content is changing state. Nothing was filed — try again once the freeze has completed.');
    }
    throw err;
  } finally {
    client.release();
  }
}

/** `M2` → `module-2` when the program's vault view has that folder. */
async function derivedFolder(module: string | null, programId: string, tenantId: number): Promise<string | null> {
  const m = /^M([1-5])$/i.exec(String(module ?? '').trim());
  if (!m) return null;
  const candidate = `module-${m[1]}`;
  const view = await resolveVaultView(programId, tenantId);
  return isFolderInView(view, candidate) ? candidate : null;
}

/** The ingest document type: the caller's, else the CTD module's, else OTHER. */
function ingestDocumentType(requested: string | null | undefined, module: string | null): string {
  const types = VAULT_INGEST_DOCUMENT_TYPES as readonly string[];
  const req = String(requested ?? '').trim().toUpperCase();
  if (req && types.includes(req)) return req;
  const m = /^M([2-5])$/i.exec(String(module ?? '').trim());
  return m ? `MODULE_${m[1]}` : 'OTHER';
}

/**
 * Compensation: a filing that could not be completed must not leave an
 * admitted vault row behind. Soft-delete (the vault reads filter deleted_at)
 * rather than DELETE — the ingest's own chained audit row says the bytes were
 * admitted, and the reversal is recorded beside it, best effort.
 */
interface RevertIngestArgs {
  pool: AuthoringPool;
  tenantId: number;
  actorId: string;
  vaultDocumentId: string;
  programId: string;
  why: string;
}

async function revertIngest(args: RevertIngestArgs): Promise<void> {
  const { pool, tenantId, actorId, vaultDocumentId, programId, why } = args;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // tenant-isolation-safe: vault.documents is program-scoped; the program's
    // ownership by this tenant was proven by ingestVaultDocument moments ago,
    // and the predicate pins the row to that program.
    await client.query(
      `UPDATE vault.documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND program_id = $2`,
      [vaultDocumentId, programId],
    );
    await writeChainedAuditRow(client, {
      tenantId,
      userId: actorId,
      action: 'authoring.document.file_to_vault.reverted',
      resourceType: 'vault_document',
      resourceId: vaultDocumentId,
      details: { programId, reason: why },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('file-to-vault compensation failed; an admitted vault row may remain', {
      vaultDocumentId, programId, err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    client.release();
  }
}

/**
 * Step 4: the record, in one transaction. Re-takes the document row NOWAIT so
 * a freeze that started after step 1 is seen here instead of recorded over.
 */
async function recordFiling(
  args: FileToVaultArgs,
  doc: DocRow,
  rendered: RenderedExport,
  vault: { id: string; folder: VaultFilingRecord; exportId: string },
): Promise<void> {
  const { pool, tenantId, actor, docId } = args;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const again = await client.query(
      `SELECT status FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT`,
      [docId, tenantId],
    );
    if (String(again.rows[0]?.status ?? '') !== String(doc.status ?? '')) {
      throw Object.assign(new Error('document changed state during filing'), { code: LOCK_NOT_AVAILABLE });
    }
    const details = {
      format: args.format,
      exportId: vault.exportId,
      artifactSha256: rendered.artifactSha256,
      fileName: rendered.fileName,
      vaultDocumentId: vault.id,
      programId: doc.client_program_id,
      folderId: vault.folder.folderId,
      placementStatus: vault.folder.placementStatus,
      documentStatus: doc.status,
    };
    await logExport(client, {
      docId,
      format: args.format,
      docSha256: await computeDocHash(client, docId, tenantId),
      exportedBy: actor.email ?? actor.id,
      fileName: rendered.fileName,
      fileSize: rendered.fileContent.length,
      metadata: { ...details, filedToVault: true },
      tenantId,
    });
    await writeAuthoringAuditTrail(args.audit, {
      docId,
      sectionId: null,
      operationType: 'EXPORT',
      beforeContent: null,
      afterContent: null,
      changeReason: 'Filed to the project vault',
      metadata: details,
      executor: client,
      // This function writes its own richer chained row below: one act, one entry.
      auditOpts: { chainedRowWrittenByCaller: true },
    });
    await writeChainedAuditRow(client, {
      tenantId,
      userId: actor.id,
      action: 'authoring.document.file_to_vault',
      resourceType: 'authoring_document',
      resourceId: docId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      details,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Where the filing goes. The caller's folder wins; otherwise the CTD module
 * derives one — but only when someone chose the module. A module the draft
 * assumed ('M2' when AnA was given none, recorded as provenance.moduleDefaulted)
 * is not a filing decision, and yields no target (2026-09-22 review, #13).
 */
async function filingTarget(args: FileToVaultArgs, doc: DocRow, programId: string): Promise<string | null> {
  const explicit = args.folderId?.trim();
  if (explicit) return explicit;
  const moduleDefaulted = (doc as { provenance?: { moduleDefaulted?: unknown } | null }).provenance?.moduleDefaulted === true;
  return moduleDefaulted ? null : derivedFolder(doc.module, programId, args.tenantId);
}

/**
 * Place a document the ingest has just admitted. A placement that THROWS (not
 * refuses) reverts the admitted row before the error propagates; it used to
 * leave the row behind while the route answered 500 — an orphan the vault then
 * listed as a document nobody filed (2026-09-22 review, #9). A refusal is the
 * caller's to handle: it carries a status and a code the caller reports.
 */
async function placeAdmittedDocument(p: {
  args: FileToVaultArgs;
  doc: DocRow;
  programId: string;
  target: string;
  vaultDocumentId: string;
  userId: number | null;
}): Promise<Awaited<ReturnType<typeof placeVaultDocument>>> {
  const { args, doc, programId, target, vaultDocumentId, userId } = p;
  const { tenantId, actor } = args;
  try {
    return await placeVaultDocument({
      programId,
      documentId: vaultDocumentId,
      organizationId: tenantId,
      userId,
      folderId: target,
      ctdSection: doc.module ? String(doc.module) : null,
      note: args.folderId?.trim()
        ? 'Filed from the authoring editor into the folder the author chose.'
        : `Filed from the authoring editor by its CTD module (${doc.module} → ${folderLabel(await resolveVaultView(programId, tenantId), target)}).`,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
  } catch (err) {
    await revertIngest({
      pool: args.pool, tenantId, actorId: actor.id, vaultDocumentId, programId,
      why: `filing threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}

/** Steps 2–3: admit the bytes, then file them where a target is known. */
async function ingestAndFile(
  args: FileToVaultArgs,
  doc: DocRow,
  rendered: RenderedExport,
  programId: string,
): Promise<{ id: string; folder: VaultFilingRecord } | FileToVaultOutcome> {
  const { tenantId, actor } = args;
  const sealed = LOCKED_DOCUMENT_STATUSES.has(String(doc.status ?? '').toUpperCase());
  const userId = /^\d+$/.test(actor.id) ? Number(actor.id) : null;
  const ingested = await ingestVaultDocument({
    organizationId: tenantId,
    userId,
    programId,
    documentCode: `authoring-${doc.id}`,
    documentTitle: doc.title,
    documentType: ingestDocumentType(args.documentType, doc.module),
    version: `${sealed ? String(doc.version ?? '1.0') : 'draft'}-${rendered.artifactSha256.slice(0, 8)}`,
    classification: 'INTERNAL',
    fileBuffer: rendered.fileContent,
    fileName: rendered.fileName,
    mimeType: rendered.contentType,
    origin: 'platform-generated',
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });
  if (!ingested.ok) return refuse(ingested.status, ingested.code, ingested.message);

  const target = await filingTarget(args, doc, programId);
  if (!target) {
    return { id: ingested.document.id, folder: { ...ingested.filing, folderLabel: ingested.filing.folderLabel ?? '' } };
  }
  const placed = await placeAdmittedDocument({ args, doc, programId, target, vaultDocumentId: ingested.document.id, userId });
  if (!placed.ok) {
    await revertIngest({
      pool: args.pool, tenantId, actorId: actor.id, vaultDocumentId: ingested.document.id, programId,
      why: `filing refused: ${placed.code}`,
    });
    return refuse(placed.status, placed.code, `${placed.message} Nothing was filed.`);
  }
  return { id: ingested.document.id, folder: placed.filing };
}

/** File one authoring document into its project's vault. */
export async function fileAuthoringDocumentToVault(args: FileToVaultArgs): Promise<FileToVaultOutcome> {
  const { pool, tenantId, docId } = args;
  if (!VAULT_FILE_FORMATS.includes(args.format)) {
    return refuse(400, 'INVALID_FORMAT', `format must be one of: ${VAULT_FILE_FORMATS.join(', ')}`);
  }
  if (!UUID_RE.test(docId)) return refuse(404, 'DOCUMENT_NOT_FOUND', 'Document not found');

  const read = await readDocumentForFiling(pool, docId, tenantId);
  if ('kind' in read) return read;
  const doc = read;
  const programId = doc.client_program_id;
  if (!programId) {
    return refuse(409, 'DOCUMENT_HAS_NO_PROGRAM',
      'This document is not scoped to a project, and a vault belongs to a project. Assign it to a program first; nothing was filed.');
  }
  const sealed = LOCKED_DOCUMENT_STATUSES.has(String(doc.status ?? '').toUpperCase());
  if (!sealed && doc.locked_at != null) {
    return refuse(409, 'DOCUMENT_MID_FREEZE',
      'This document carries a lock but no sealed status — a freeze is in progress or was interrupted. Nothing was filed.');
  }

  const sectionsRes = await pool.query(
    `SELECT id, code, title, content FROM authoring_sections
      WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index`,
    [docId, tenantId],
  );
  const rendered = await renderAuthoringExport({
    executor: pool,
    tenantId,
    doc,
    sections: sectionsRes.rows,
    format: args.format,
    notice: sealed
      ? null
      : `WORKING DRAFT — not a sealed 21 CFR Part 11 record (status: ${doc.status ?? 'unknown'}). ` +
        'No frozen snapshot or signature manifest certifies this content.',
  });

  const admitted = await ingestAndFile(args, doc, rendered, programId);
  if ('kind' in admitted) return admitted;

  const exportId = crypto.randomUUID();
  try {
    await recordFiling(args, doc, rendered, { id: admitted.id, folder: admitted.folder, exportId });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    logger.error('file-to-vault record transaction failed; reverting the ingested vault row', { docId, why });
    await revertIngest({ pool, tenantId, actorId: args.actor.id, vaultDocumentId: admitted.id, programId, why: `record failed: ${why}` });
    return (err as { code?: string })?.code === LOCK_NOT_AVAILABLE
      ? refuse(409, 'DOCUMENT_MID_FREEZE', 'The document changed state while it was being filed. Nothing was filed — try again.')
      : refuse(500, 'FILE_TO_VAULT_FAILED', 'The filing could not be recorded, so the document was not filed. Nothing was kept in the vault.');
  }

  return {
    kind: 'filed',
    vaultDocumentId: admitted.id,
    folder: admitted.folder,
    sha256: rendered.artifactSha256,
    format: args.format,
    fileName: rendered.fileName,
    programId,
    sealed,
  };
}

/** Exposed for the route: a well-formed folder id is a short slug, never a path. */
export const isPlausibleFolderId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(v);
