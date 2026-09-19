/**
 * Vault placement — the ONE governed writer of a document's filing decision.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * vault-filing.service.ts PROPOSES a placement (its classifier runs at ingest
 * and leaves a document 'suggested' or 'unfiled'); vault-ingest.service.ts
 * writes that proposal once, at admission, and never again. Changing it
 * afterwards existed in exactly one place: 191 lines inside
 * `POST /api/c2c/project-vault/:id/file`, reachable only by a person clicking
 * in the Vault surface.
 *
 * That left the loop the document catalog exists to close still open. AnA can
 * now list a project's files, read one end to end, and record what it is — and
 * then could do nothing at all about a file the ingest classifier had left in
 * the Unfiled queue, because the only writer was an HTTP handler. "Catalog the
 * file and put it in the right place" stopped at the classifier's guess.
 *
 * So the write moves here, unchanged in behaviour, and both callers use it:
 * the route maps its result to HTTP, and the file_project_document tool maps
 * the same result to AnA's transcript. One implementation, one audit row, one
 * set of guards.
 *
 * ── The guards, all ported verbatim from the route ──────────────────────────
 *   • the program must belong to the acting organization (404 otherwise, never
 *     a distinguishable "exists but not yours");
 *   • the document must belong to that program, and is taken FOR UPDATE inside
 *     the transaction, so two concurrent filings cannot interleave;
 *   • a target folder must exist in the program's own vault taxonomy view — a
 *     folder from another modality's tree is refused, not stored;
 *   • the UPDATE and its §11 audit row commit together or not at all.
 *
 * Failures are RETURNED, not thrown, so both callers decide their own
 * presentation. Only an unexpected error escapes.
 *
 * @module server/services/vault/vault-placement.service
 */

import { pool } from '../../db.js';
import { writeChainedAuditRow } from '../auditService.js';
import { resolveVaultView, isFolderInView, folderLabel } from './vault-filing.service.js';
import type { VaultViewId } from '../../../shared/constants/domain/vault-taxonomy.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlaceVaultDocumentArgs {
  programId: string;
  documentId: string;
  organizationId: number;
  /** Who is filing. Null for an unattributed caller; recorded as such. */
  userId: number | null;
  /** Confirm the classifier's existing suggestion in place. */
  confirm?: boolean;
  /**
   * The target folder. A string files there; `null` UNFILES (an explicit
   * "I do not know where this belongs", which is a legitimate answer);
   * `undefined` means "not specified" and requires `confirm`.
   */
  folderId?: string | null;
  evidenceKind?: string | null;
  ctdSection?: string | null;
  /** The filer's own reason, recorded verbatim when given. */
  note?: string | null;
  /** Request provenance for the audit row; a tool call has neither. */
  ipAddress?: string;
  userAgent?: string;
}

/** The placement as it stands after the write — the shape the Vault renders. */
export interface VaultFilingRecord {
  folderId: string | null;
  folderLabel: string;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  confidence: string | null;
  rationale: string | null;
  needsReview: boolean;
}

export interface VaultPlacementBefore {
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string | null;
}

export type PlaceVaultDocumentResult =
  | {
      ok: true;
      view: VaultViewId;
      documentTitle: string | null;
      before: VaultPlacementBefore;
      filing: VaultFilingRecord;
    }
  | { ok: false; status: number; code: string; message: string };

function invalid(code: string, message: string, status = 400): PlaceVaultDocumentResult {
  return { ok: false, status, code, message };
}

/**
 * Resolve the folder this call is asking for, or the refusal that stops it.
 *
 * Kept separate because it is the only branchy part: confirm-in-place, an
 * explicit move, an explicit unfile, and "you named nothing" are four distinct
 * answers and each has its own message.
 */
function resolveTargetFolder(
  args: PlaceVaultDocumentArgs,
  view: VaultViewId,
  currentFolderId: string | null,
): { folderId: string | null } | { refusal: PlaceVaultDocumentResult } {
  const { confirm, folderId } = args;
  if (confirm && folderId === undefined) {
    if (!currentFolderId) {
      return {
        refusal: invalid(
          'NOTHING_TO_CONFIRM',
          'This document has no suggested folder — choose one to file it.',
        ),
      };
    }
    return { folderId: currentFolderId };
  }
  if (folderId === null) return { folderId: null };
  if (typeof folderId === 'string' && folderId.trim()) {
    const target = folderId.trim();
    if (!isFolderInView(view, target)) {
      return {
        refusal: invalid(
          'INVALID_FOLDER',
          `Folder '${target}' does not exist in this program's ${view} vault taxonomy.`,
        ),
      };
    }
    return { folderId: target };
  }
  return {
    refusal: invalid('NO_TARGET', 'Pass confirm:true, a folderId, or folderId:null to unfile.'),
  };
}

/** The rationale recorded on the row and in the audit trail. Never empty. */
function placementRationale(
  args: PlaceVaultDocumentArgs,
  targetFolder: string | null,
  priorRationale: string | null,
): string {
  if (args.note) return args.note;
  if (!targetFolder) return 'Unfiled by user — awaiting a filing decision.';
  return args.confirm
    ? `Suggested filing confirmed${priorRationale ? ` (${priorRationale})` : ''}.`
    : 'Filed by user.';
}

/**
 * Record a filing decision for a vault document.
 *
 * Returns the refusal rather than throwing it, so the HTTP route and the AnA
 * tool present the same outcome in their own idiom. An unexpected database
 * error still escapes; the callers translate 42P01/42703 into STORE_PENDING.
 */
export async function placeVaultDocument(
  args: PlaceVaultDocumentArgs,
): Promise<PlaceVaultDocumentResult> {
  const { programId, documentId, organizationId } = args;
  if (!UUID_RE.test(programId)) {
    return invalid('NOT_FOUND', 'No such project.', 404);
  }
  if (!UUID_RE.test(documentId)) {
    return invalid('INVALID_DOCUMENT_ID', 'documentId (uuid) is required.');
  }

  // Program ownership — the same guard as the read path. A program in another
  // organization is reported as absent, not as forbidden.
  const projRes = await pool.query(
    `SELECT id FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [programId, organizationId],
  );
  if (projRes.rows.length === 0) {
    return invalid('NOT_FOUND', 'No such project.', 404);
  }
  const view = await resolveVaultView(programId, organizationId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const docRes = await client.query(
      `SELECT id, document_title, folder_id, evidence_kind, ctd_section,
              placement_status, placement_rationale
         FROM vault.documents
        WHERE id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = vault.documents.program_id
               AND rp.organization_id = $3
               AND rp.deleted_at IS NULL
          )
        FOR UPDATE`,
      [documentId, programId, organizationId],
    );
    if (docRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return invalid('DOCUMENT_NOT_FOUND', 'No such document in this project.', 404);
    }
    const before = docRes.rows[0] as {
      id: string;
      document_title: string | null;
      folder_id: string | null;
      evidence_kind: string | null;
      ctd_section: string | null;
      placement_status: string | null;
      placement_rationale: string | null;
    };

    const target = resolveTargetFolder(args, view, before.folder_id);
    if ('refusal' in target) {
      await client.query('ROLLBACK');
      return target.refusal;
    }
    const result = await writePlacement(client, args, view, before, target.folderId);
    await client.query('COMMIT');
    return result;
  } catch (txErr) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw txErr;
  } finally {
    client.release();
  }
}

/** The row this write is about, as it stood when the transaction took it. */
interface PlacementRow {
  document_title: string | null;
  folder_id: string | null;
  evidence_kind: string | null;
  ctd_section: string | null;
  placement_status: string | null;
  placement_rationale: string | null;
}

/**
 * The write itself: the UPDATE and its §11 audit row, on the caller's client
 * and inside the caller's transaction, so the two land together or not at all.
 */
async function writePlacement(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  args: PlaceVaultDocumentArgs,
  view: VaultViewId,
  before: PlacementRow,
  targetFolder: string | null,
): Promise<PlaceVaultDocumentResult> {
    const { programId, documentId, organizationId, userId } = args;
    const newStatus = targetFolder ? 'confirmed' : 'unfiled';
    const rationale = placementRationale(args, targetFolder, before.placement_rationale);

    const upd = await client.query(
      `UPDATE vault.documents SET
         folder_id = $1,
         evidence_kind = COALESCE($2, evidence_kind),
         ctd_section = $3,
         placement_status = $4,
         placement_confidence = NULL,
         placement_rationale = $5,
         placed_by = $6,
         placed_at = NOW(),
         updated_at = NOW()
       WHERE id = $7 AND program_id = $8
         AND EXISTS (
           SELECT 1 FROM regulatory_programs rp
            WHERE rp.id = vault.documents.program_id
              AND rp.organization_id = $9
              AND rp.deleted_at IS NULL
         )
       RETURNING folder_id, evidence_kind, ctd_section, placement_status,
                 placement_confidence, placement_rationale`,
      [
        targetFolder,
        args.evidenceKind ?? null,
        // An explicit move to a non-CTD folder clears a stale CTD section;
        // confirming keeps what the classifier read.
        args.ctdSection ?? (args.confirm ? before.ctd_section : null),
        newStatus,
        rationale,
        userId,
        documentId,
        programId,
        organizationId,
      ],
    );
    const after = upd.rows[0] as {
      folder_id: string | null;
      evidence_kind: string | null;
      ctd_section: string | null;
      placement_status: string;
      placement_rationale: string | null;
    };

    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      userId: userId ?? undefined,
      action: 'vault.document.file',
      resourceType: 'vault_document',
      resourceId: documentId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      details: {
        programId,
        documentTitle: before.document_title,
        view,
        from: {
          folderId: before.folder_id,
          placementStatus: before.placement_status,
          ctdSection: before.ctd_section,
        },
        to: {
          folderId: after.folder_id,
          placementStatus: after.placement_status,
          ctdSection: after.ctd_section,
        },
        rationale,
      },
    });

    return {
      ok: true,
      view,
      documentTitle: before.document_title,
      before: {
        folderId: before.folder_id,
        ctdSection: before.ctd_section,
        placementStatus: before.placement_status,
      },
      filing: {
        folderId: after.folder_id,
        folderLabel: folderLabel(view, after.folder_id),
        evidenceKind: after.evidence_kind,
        ctdSection: after.ctd_section,
        placementStatus: after.placement_status,
        confidence: null,
        rationale: after.placement_rationale,
        needsReview: after.placement_status === 'unfiled',
      },
    };
}
