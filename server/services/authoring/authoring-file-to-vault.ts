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
 *   • no PDF engine      503 PDF_RENDERER_UNAVAILABLE — 2026-10-08 (QA walk 2,
 *                          j4): where Puppeteer is absent the PDF renderer falls
 *                          back to a plain-text stand-in whose first line says
 *                          not to file it, and this filed it as the governed
 *                          Vault copy, silently. No decision allows filing it
 *                          with an acknowledgement (docs/LAUNCH_DEFINITION_OF_DONE.md,
 *                          docs/design), so it fails closed before ingest. DOCX
 *                          does not use that engine and is unaffected.
 *
 * Rendering writes nothing. Only a proven new admission may be placed or
 * recorded. A failed filing compensates that row with a scoped tombstone and
 * audit transaction; unconfirmed cleanup requires review of current Vault
 * records. A reused or unverified admission is never compensated here.
 */

import crypto from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { writeChainedAuditRow } from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { LOCKED_DOCUMENT_STATUSES } from './document-lock';
import { columnState, writeAuthoringAuditTrail, type AuthoringAuditContext } from './authoring-evidence';
import { renderAuthoringExport, logExport, sectionsDigest, type RenderedExport, type ExportSectionRow } from './authoring-export';
import { filingAgreesWithEditing } from '../c2c/filing-section-target.js';
import { SavedDraftSourceError, reserveSavedDraftSourceReferences, withSavedDraftSourceReservation } from './draft-source-references';
import { assertWorkflowImportRelease, WorkflowImportGovernanceError } from './workflow-import-governance';
import { savedImportSource } from './import-source-references';
import type { AuthoringPool, AuthoringActor } from './authoring-documents';
import { ingestVaultDocument } from '../vault/vault-ingest.service';
import { placeVaultDocument, type VaultFilingRecord } from '../vault/vault-placement.service';
import { resolveVaultView, isFolderInView, folderLabel } from '../vault/vault-filing.service';
import { VAULT_INGEST_DOCUMENT_TYPES } from '../../../shared/constants/domain/vault-taxonomy';
import {
  carryAuthoringApproval,
  readAuthoringSignatures,
  type CarryOutcome,
} from '../regulatory/authoring-approval-carryover';
import type { CanonicalStoreDb } from '../regulatory/canonicalDocumentStore';

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
  /** The Drizzle handle the Vault lifecycle record is written on. Defaults to the runtime db. */
  lifecycleDb?: CanonicalStoreDb;
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
      /** Whether the Authoring approval carried to the Vault version (FD5 (c)), and why not when it did not. */
      approval: CarryOutcome;
    };

interface DocRow {
  id: string;
  title: string;
  module: string | null;
  status: string | null;
  locked_at: string | Date | null;
  client_program_id: string | null;
  version: string | null;
  created_by: string | null;
  created_at: unknown;
  provenance?: unknown;
  locale: string | null;
  product_code: string | null;
  template_id: string | null;
  c2c_document_id: string | null;
}

const refuse = (status: number, code: string, error: string): FileToVaultOutcome => ({ kind: 'refused', status, code, error });

/** The refusal of a plain-text PDF fallback (see the header). */
const PDF_FALLBACK_REFUSAL =
  'The PDF renderer is not available here; this would file a plain-text rendering. Nothing was filed. ' +
  'Word (.docx) is filed with its formatting.';

/** Postgres: lock_not_available — another transaction holds the row FOR UPDATE. */
const LOCK_NOT_AVAILABLE = '55P03';
const DOCUMENT_CHANGED_DURING_FILING = 'DOCUMENT_CHANGED_DURING_FILING';

// The identical fixed projection is locked at capture and recording. Optional
// schema keys are read through to_jsonb; timestamp columns retain Date values.
const LOCKED_DOCUMENT_HEADER = `SELECT id, title, module,
  to_jsonb(authoring_documents)->>'locale' AS locale,
  to_jsonb(authoring_documents)->>'product_code' AS product_code,
  to_jsonb(authoring_documents)->'provenance' AS provenance,
  to_jsonb(authoring_documents)->>'template_id' AS template_id,
  to_jsonb(authoring_documents)->>'c2c_document_id' AS c2c_document_id,
  status, locked_at, client_program_id, version, created_by, created_at
  FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT`;

const outcomeUnknown = (): FileToVaultOutcome => refuse(503, 'OUTCOME_UNKNOWN',
  'The filing outcome could not be confirmed. Review the current Vault records before trying again.');

/** Compare every rendered field and its order; the canonical section digest
 * deliberately omits titles, which can also change the delivered file. */
function sectionRenderState(sections: ReadonlyArray<ExportSectionRow>): string {
  return JSON.stringify(sections.map(({ id, code, title, content }) => [id, code, title, content]));
}

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
    const r = await client.query(LOCKED_DOCUMENT_HEADER, [docId, tenantId]);
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
 * operation-created vault row behind. Soft-delete (Vault reads filter
 * deleted_at) and audit together. A failed or unmatched reversal is unknown;
 * this does not qualify every third-party use race after admission.
 */
interface RevertIngestArgs {
  pool: AuthoringPool;
  tenantId: number;
  actorId: string;
  vaultDocumentId: string;
  programId: string;
  why: string;
}

async function revertIngest(args: RevertIngestArgs): Promise<boolean> {
  const { pool, tenantId, actorId, vaultDocumentId, programId, why } = args;
  let client: Awaited<ReturnType<AuthoringPool['connect']>> | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const reverted = await client.query(
      `UPDATE vault.documents SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND program_id = $2 AND organization_id = $3 AND deleted_at IS NULL RETURNING id`,
      [vaultDocumentId, programId, tenantId],
    );
    if (reverted.rows.length !== 1 || reverted.rows[0]?.id !== vaultDocumentId) {
      throw new Error('The operation-created Vault row could not be confirmed for compensation');
    }
    await writeChainedAuditRow(client, {
      tenantId,
      userId: actorId,
      action: 'authoring.document.file_to_vault.reverted',
      resourceType: 'vault_document',
      resourceId: vaultDocumentId,
      details: { programId, reason: why },
    });
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    logger.error('file-to-vault compensation failed; an admitted vault row may remain', {
      vaultDocumentId, programId, err: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    client?.release();
  }
}

/**
 * Step 4: the record, in one transaction. Re-takes the document row NOWAIT so
 * a freeze that started after step 1 is seen here instead of recorded over.
 */
async function recordFiling(
  args: FileToVaultArgs,
  doc: DocRow,
  snapshot: { rendered: RenderedExport; sections: ExportSectionRow[] },
  vault: { id: string; folder: VaultFilingRecord; exportId: string },
): Promise<void> {
  const { pool, tenantId, actor, docId } = args;
  const { rendered, sections } = snapshot;
  const client = await pool.connect();
  let commitAttempted = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    // Same order as withdrawal and source-linked save: program before row locks.
    await reserveSavedDraftSourceReferences(doc, client, tenantId, actor);
    const again = await client.query(LOCKED_DOCUMENT_HEADER, [docId, tenantId]);
    if (String(again.rows[0]?.status ?? '') !== String(doc.status ?? '')) {
      throw Object.assign(new Error('document changed state during filing'), { code: LOCK_NOT_AVAILABLE });
    }
    if (!isDeepStrictEqual(again.rows[0], doc)) {
      throw Object.assign(new Error('document header changed during filing'), { code: DOCUMENT_CHANGED_DURING_FILING });
    }
    // Admission can take time, and working drafts remain editable. Reserve
    // inserts as well as updates before comparing the exact rendered snapshot.
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('LOCK TABLE authoring_sections IN SHARE MODE');
    const currentSections = await client.query(
      `SELECT id, code, title, content FROM authoring_sections
        WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
      [docId, tenantId],
    );
    if (sectionRenderState(currentSections.rows) !== sectionRenderState(sections)) {
      throw Object.assign(new Error('document sections changed during filing'), { code: DOCUMENT_CHANGED_DURING_FILING });
    }
    await assertWorkflowImportRelease(client, { organizationId: tenantId, doc,
      sections: currentSections.rows, actor });
    /* P-29.2 — RECORDED, NOT REFUSED, and the distinction is the decision
       (docs/EXIT_ATTESTATION_DECISION_2026-10-18.md).
       Filing to the Vault is the one exit outside the seal cone: it takes
       working drafts BY DESIGN and stamps "WORKING DRAFT — not a sealed 21 CFR
       Part 11 record" on page one. Refusing here would dead-end a draft for no
       gain — the draft attests only to itself and its own gates stop it being
       transmitted. But a filed rendition whose source sections' filed copies
       are not this document's text is a fact about THIS artefact, so it goes on
       the artefact's own record rather than being discovered later from two
       stores.
       Read on the filing client, inside the LOCK TABLE above, so the answer is
       the one these bytes were rendered from. It cannot throw the export: an
       absent store or an unbound document answers "nothing to compare". */
    const agreement = await filingAgreesWithEditing(client, { authoringDocId: docId, tenantId });
    const filingDiverged = agreement.diverged.map((d) => ({ key: d.key, filed: d.filed, section: d.section.code }));
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
      ...(filingDiverged.length > 0 ? { filingDiverged } : {}),
      // The exact original dependency survives the new bytes' identity. This
      // receipt is how withdrawal finds a source-derived Vault rendition.
      ...(savedImportSource(doc) ? { importSource: savedImportSource(doc) } : {}),
    };
    await logExport(client, {
      docId,
      format: args.format,
      docSha256: sectionsDigest(sections),
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
    commitAttempted = true;
    await client.query('COMMIT');
  } catch (err) {
    const rollbackConfirmed = await client.query('ROLLBACK').then(() => true, () => false);
    if (commitAttempted || !rollbackConfirmed) {
      throw Object.assign(new Error('The filing recording transaction outcome is unconfirmed'), { code: 'OUTCOME_UNKNOWN', cause: err });
    }
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
}): Promise<Awaited<ReturnType<typeof placeVaultDocument>> | FileToVaultOutcome> {
  const { args, doc, programId, target, vaultDocumentId, userId } = p;
  const { tenantId, actor } = args;
  try {
    return await placeVaultDocument({
      programId,
      documentId: vaultDocumentId,
      organizationId: tenantId,
      userId,
      folderId: target,
      // The draft's module ('M2') is the folder, not a CTD section: it was
      // stored as ctd_section until the vocabulary check refused it (VR-04).
      ctdSection: null,
      note: args.folderId?.trim()
        ? 'Filed from the authoring editor into the folder the author chose.'
        : `Filed from the authoring editor by its CTD module (${doc.module} → ${folderLabel(await resolveVaultView(programId, tenantId), target)}).`,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
  } catch (err) {
    const reverted = await revertIngest({
      pool: args.pool, tenantId, actorId: actor.id, vaultDocumentId, programId,
      why: `filing threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    if (!reverted) return outcomeUnknown();
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
  if (ingested.admission?.created === false) return refuse(409, 'VAULT_VERSION_ALREADY_RECORDED',
    'This document version is already recorded in the Vault. Review the existing Vault record before filing again.');
  if (ingested.admission?.created !== true) return outcomeUnknown();

  const target = await filingTarget(args, doc, programId);
  if (!target) {
    return { id: ingested.document.id, folder: { ...ingested.filing, folderLabel: ingested.filing.folderLabel ?? '' } };
  }
  const placed = await placeAdmittedDocument({ args, doc, programId, target, vaultDocumentId: ingested.document.id, userId });
  if ('kind' in placed) return placed;
  if (!placed.ok) {
    const reverted = await revertIngest({
      pool: args.pool, tenantId, actorId: actor.id, vaultDocumentId: ingested.document.id, programId,
      why: `filing refused: ${placed.code}`,
    });
    return reverted ? refuse(placed.status, placed.code, `${placed.message} Nothing was filed.`) : outcomeUnknown();
  }
  return { id: ingested.document.id, folder: placed.filing };
}

async function renderForVaultFiling(args: FileToVaultArgs, doc: DocRow, sections: ExportSectionRow[]): Promise<RenderedExport | FileToVaultOutcome> {
  const sealed = LOCKED_DOCUMENT_STATUSES.has(String(doc.status ?? '').toUpperCase());
  try {
    return await withSavedDraftSourceReservation(doc, args.pool, args.tenantId, executor => renderAuthoringExport({
      executor, tenantId: args.tenantId, doc, sections, format: args.format, actor: args.actor,
      notice: sealed ? null
        : `WORKING DRAFT — not a sealed 21 CFR Part 11 record (status: ${doc.status ?? 'unknown'}). ` +
          'No frozen snapshot or signature manifest certifies this content.',
    }), args.actor);
  } catch (err) {
    if (err instanceof SavedDraftSourceError) return refuse(409, err.code, err.message);
    if (err instanceof WorkflowImportGovernanceError) return refuse(err.status, err.code, err.message);
    throw err;
  }
}

async function recordingFailure(err: unknown, compensation: RevertIngestArgs): Promise<FileToVaultOutcome> {
  if ((err as { code?: string })?.code === 'OUTCOME_UNKNOWN') return outcomeUnknown();
  if (!await revertIngest(compensation)) return outcomeUnknown();
  if (err instanceof SavedDraftSourceError) return refuse(409, err.code, err.message);
  if ((err as { code?: string })?.code === DOCUMENT_CHANGED_DURING_FILING) {
    return refuse(409, DOCUMENT_CHANGED_DURING_FILING,
      'The document content changed while it was being filed. Nothing was filed — review the current draft and try again.');
  }
  return (err as { code?: string })?.code === LOCK_NOT_AVAILABLE
    ? refuse(409, 'DOCUMENT_MID_FREEZE', 'The document changed state while it was being filed. Nothing was filed — try again.')
    : refuse(500, 'FILE_TO_VAULT_FAILED', 'The filing could not be recorded, so the document was not filed. Nothing was kept in the vault.');
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
      WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
    [docId, tenantId],
  );
  const rendered = await renderForVaultFiling(args, doc, sectionsRes.rows);
  if ('kind' in rendered) return rendered;
  if (rendered.rendering === 'plain-text-fallback') return refuse(503, 'PDF_RENDERER_UNAVAILABLE', PDF_FALLBACK_REFUSAL);

  const admitted = await ingestAndFile(args, doc, rendered, programId);
  if ('kind' in admitted) return admitted;

  const exportId = crypto.randomUUID();
  try {
    await recordFiling(args, doc, { rendered, sections: sectionsRes.rows }, { id: admitted.id, folder: admitted.folder, exportId });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    logger.error('file-to-vault record transaction failed', { docId, why });
    return recordingFailure(err, { pool, tenantId, actorId: args.actor.id, vaultDocumentId: admitted.id, programId, why: `record failed: ${why}` });
  }

  const approval = await carryApprovalToVault(args, doc, sectionsRes.rows, admitted.id, rendered.artifactSha256);

  return {
    kind: 'filed',
    vaultDocumentId: admitted.id,
    folder: admitted.folder,
    sha256: rendered.artifactSha256,
    format: args.format,
    fileName: rendered.fileName,
    programId,
    sealed,
    approval,
  };
}

/**
 * Step 5, after the filing has committed: carry the Authoring approval to the
 * Vault version when it is bound to these bytes (FD5 (c),
 * authoring-approval-carryover.ts). Its own transaction; a failure leaves the
 * version filed and unapproved, and says so.
 */
async function carryApprovalToVault(
  args: FileToVaultArgs,
  doc: DocRow,
  renderedSections: Array<{ code: string; content: string | null }>,
  vaultDocumentId: string,
  artifactSha256: string,
): Promise<CarryOutcome> {
  const filerId = /^\d+$/.test(args.actor.id) ? Number(args.actor.id) : null;
  if (filerId === null) {
    return { carried: false, reason: 'The filer is not a user on record, so nothing can be recorded on their behalf.' };
  }
  try {
    const db = args.lifecycleDb ?? ((await import('../../db')) as unknown as { db: CanonicalStoreDb }).db;
    return await carryAuthoringApproval(db, {
      organizationId: args.tenantId,
      filerId,
      vaultDocumentId,
      artifactSha256,
      authoringDocumentId: doc.id,
      authoringAuthor: doc.created_by,
      status: doc.status,
      renderedDigest: sectionsDigest(renderedSections),
      signatures: await readAuthoringSignatures(args.pool, doc.id, args.tenantId),
    });
  } catch (err) {
    logger.error('the Authoring approval could not be carried to the Vault version; it stays unapproved', {
      docId: doc.id, vaultDocumentId, err: err instanceof Error ? err.message : String(err),
    });
    return {
      carried: false,
      reason: 'The approval could not be recorded in the Vault, so this version needs its review and approval there.',
    };
  }
}

/** Exposed for the route: a well-formed folder id is a short slug, never a path. */
export const isPlausibleFolderId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(v);
