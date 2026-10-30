/**
 * What the Vault says about legal holds on a project's documents (MR-08 Stage
 * 5 step 5, CAT1-15, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * A custodian has to know a document is under hold before they are asked to
 * withdraw, dispose of or replace it. The hold register lives in Admin
 * Settings and is read by the hold-authority roles only, so the Vault itself
 * said nothing. Every reader of a project now sees, on the document, that it
 * is held, under which matter reference, and since when.
 *
 * A hold's reason is not part of the notice: it can be privileged, and the
 * register shows it to the roles that place and lift holds. A hold covers what
 * the retention sweep and the disposition engine take it to cover: a project
 * hold covers every version in the project, a document hold the version it
 * names.
 */
import type { RequestSqlClient } from '../../db/requestDb.js';

export interface VaultHoldNotice {
  scope: 'program' | 'document';
  /** The version a document hold names; null for a project hold. */
  documentId: string | null;
  reference: string;
  placedAt: string;
}

/** The active holds that cover this project or a version in it, oldest first. */
export async function readActiveHoldNotices(
  q: RequestSqlClient,
  p: { organizationId: number; programId: string },
): Promise<VaultHoldNotice[]> {
  const { rows } = await q.query(
    `SELECT h.scope, h.document_id::text AS document_id, h.reference, h.placed_at
       FROM vault.legal_holds h
      WHERE h.organization_id = $1 AND h.lifted_at IS NULL
        AND (h.program_id = $2::uuid
          OR h.document_id IN (SELECT d.id FROM vault.documents d WHERE d.program_id = $2::uuid AND d.organization_id = $1))
      ORDER BY h.placed_at, h.id`,
    [p.organizationId, p.programId],
  );
  return rows.map((r) => ({
    scope: r.scope === 'document' ? 'document' : 'program',
    documentId: (r.document_id as string | null) ?? null,
    reference: String(r.reference),
    placedAt: new Date(r.placed_at as string).toISOString(),
  }));
}
