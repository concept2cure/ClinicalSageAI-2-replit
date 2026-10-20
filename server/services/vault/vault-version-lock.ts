/**
 * A live Vault version of this organisation, as a record that names it reads
 * it (moved here from vault-relationships.ts on 2026-10-19, unchanged in what
 * it admits, so a commitment's fulfilment and a document relationship decide
 * "is this a version I may name" the same way).
 *
 * The version must be live (not removed), in a program of this organisation
 * the person can currently open (requireCurrentProgramAccess), and, when
 * `programId` is given, in that program. A row whose organisation was never
 * reconciled is refused with VAULT_TENANT_RECONCILIATION_REQUIRED rather than
 * read as this organisation's. With `lock` (the default) the version and the
 * program admission are held FOR SHARE to the end of the caller's transaction;
 * without it the same checks run as a read, for a refusal given before a
 * password is asked for (the commitment fulfilment's pre-check).
 *
 * Callers: vault-relationships.ts (relate, unrelate) and
 * ha-interactions/commitment-fulfilment.ts (the Vault version that met a
 * commitment). vault-annotations-core.ts keeps a lockVersion of its own with
 * different semantics: it is scoped to the program the annotation route has
 * already admitted, reads the page and text columns an annotation anchors to,
 * and does no reconciliation check. Folding it in is owed (README of
 * docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/).
 *
 * @module server/services/vault/vault-version-lock
 */
import { requireCurrentProgramAccess, ProgramReadAccessError, type ProgramAccessExecutor } from '../c2c/current-program-access';

export interface LiveVaultVersion {
  id: string;
  title: string | null;
  version: string | null;
  program_id: string;
  /** vault.documents.content_hash, trimmed of char(64) padding and lower-cased. */
  content_hash: string;
  document_code: string | null;
}

/** A live version in this organisation, locked for the transaction unless `lock` is false; null when there is none. */
export async function lockLiveVaultVersion(
  client: ProgramAccessExecutor,
  input: { documentId: string; organizationId: number; userId: number | null; programId?: string; lock?: boolean },
): Promise<LiveVaultVersion | null> {
  const { documentId, organizationId, userId, programId } = input;
  const lock = input.lock !== false;
  const identity = lock
    ? await client.query(
        `SELECT d.id::text AS id, d.organization_id, d.program_id::text AS program_id
           FROM vault.documents d WHERE d.id=$1 AND d.deleted_at IS NULL
            AND ($3::uuid IS NULL OR d.program_id=$3::uuid)
            AND EXISTS(SELECT 1 FROM regulatory_programs rp WHERE rp.id=d.program_id AND rp.organization_id=$2 AND rp.deleted_at IS NULL)
          FOR SHARE OF d`,
        [documentId, organizationId, programId ?? null],
      )
    : await client.query(
        `SELECT d.id::text AS id, d.organization_id, d.program_id::text AS program_id
           FROM vault.documents d WHERE d.id=$1 AND d.deleted_at IS NULL
            AND ($3::uuid IS NULL OR d.program_id=$3::uuid)
            AND EXISTS(SELECT 1 FROM regulatory_programs rp WHERE rp.id=d.program_id AND rp.organization_id=$2 AND rp.deleted_at IS NULL)`,
        [documentId, organizationId, programId ?? null],
      );
  if (identity.rows.length !== 1) return null;
  const parent = await requireCurrentProgramAccess(client, {
    organizationId, userId: userId ?? undefined, programId: String(identity.rows[0].program_id), forShare: lock,
  });
  if (identity.rows[0].organization_id == null) {
    throw new ProgramReadAccessError(409, 'VAULT_TENANT_RECONCILIATION_REQUIRED', 'This Vault record needs a verified organization relationship.');
  }
  if (Number(identity.rows[0].organization_id) !== organizationId) return null;
  const { rows } = lock
    ? await client.query(
        `SELECT d.id::text AS id, d.document_title AS title, d.version, d.program_id::text AS program_id,
                lower(btrim(d.content_hash)) AS content_hash, d.document_code
           FROM vault.documents d JOIN regulatory_programs rp ON rp.id=d.program_id AND rp.organization_id=$2 AND rp.deleted_at IS NULL
          WHERE d.id=$1 AND d.program_id=$3 AND d.organization_id=$2 AND d.deleted_at IS NULL FOR SHARE OF d`,
        [documentId, organizationId, parent.programId],
      )
    : await client.query(
        `SELECT d.id::text AS id, d.document_title AS title, d.version, d.program_id::text AS program_id,
                lower(btrim(d.content_hash)) AS content_hash, d.document_code
           FROM vault.documents d JOIN regulatory_programs rp ON rp.id=d.program_id AND rp.organization_id=$2 AND rp.deleted_at IS NULL
          WHERE d.id=$1 AND d.program_id=$3 AND d.organization_id=$2 AND d.deleted_at IS NULL`,
        [documentId, organizationId, parent.programId],
      );
  return (rows[0] as unknown as LiveVaultVersion | undefined) ?? null;
}
