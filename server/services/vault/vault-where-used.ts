/**
 * Where a Vault version is placed: the submission sequences whose leaves name
 * it (VR-14's "Placed in", plan critique 15, rows D2 and D7).
 *
 * Veeva shows, for each version, where it is used, so a person revising a
 * document knows the next sequence needs a replace and not a new. Here a leaf
 * names a Vault version by `submission_leaves.document_uuid` under
 * `document_table = 'vault_documents'`. `upsertLeaf` is its only writer, and it
 * checks the version is live, the organisation's, and in the submission's
 * project before it pins the version's SHA-256. Nothing read that column back
 * for the Vault.
 *
 * This is a read and nothing else. Whether a version may be transmitted is
 * VR-14's gate, which waits on FD5. A removed leaf, or a leaf in a removed
 * sequence or submission, is not a placement. Every table is filtered to the
 * organisation.
 *
 * Not listed, by design. An eSTAR export records its attachments by file name
 * and SHA-256, not by Vault version, so a match would be inferred, not
 * recorded (handed on to the eSTAR lane). `vault.evidence_citations` holds
 * search hits, not uses.
 */

export interface VaultPlacement {
  leafId: number;
  submissionId: number;
  submissionTitle: string | null;
  applicationType: string | null;
  sequenceId: number;
  sequenceNumber: string | null;
  region: string | null;
  /** The sequence's own status: draft, assembling, validated, frozen or dispatched. */
  sequenceStatus: string | null;
  sectionCode: string;
  leafTitle: string;
  /** The eCTD lifecycle operation: new, replace, append or delete. */
  operation: string;
}

export interface PlacementQueryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/** Each version's live placements, by version id; a version with none is absent from the map. */
export async function readVaultPlacements(
  q: PlacementQueryable,
  organizationId: number,
  vaultIds: string[],
): Promise<Map<string, VaultPlacement[]>> {
  const out = new Map<string, VaultPlacement[]>();
  if (vaultIds.length === 0) return out;
  const { rows } = await q.query(
    `SELECT l.document_uuid::text AS vault_id, l.id AS leaf_id, l.section_code, l.title AS leaf_title, l.lifecycle_op,
            s.id AS sequence_id, s.sequence_number, s.region, s.status AS sequence_status,
            sub.id AS submission_id, sub.title AS submission_title, sub.application_type
       FROM submission_leaves l
       JOIN ectd_sequences s
         ON s.id = l.sequence_id AND s.organization_id = $1 AND s.deleted_at IS NULL
       JOIN submissions sub
         ON sub.id = s.submission_id AND sub.organization_id = $1 AND sub.deleted_at IS NULL
      WHERE l.organization_id = $1
        AND l.document_table = 'vault_documents'
        AND l.document_uuid = ANY($2::uuid[])
        AND l.deleted_at IS NULL
      ORDER BY sub.id, s.sequence_number, l.section_code, l.id`,
    [organizationId, vaultIds],
  );
  for (const r of rows) {
    const list = out.get(r.vault_id) ?? [];
    list.push({
      leafId: Number(r.leaf_id),
      submissionId: Number(r.submission_id),
      submissionTitle: r.submission_title ?? null,
      applicationType: r.application_type ?? null,
      sequenceId: Number(r.sequence_id),
      sequenceNumber: r.sequence_number ?? null,
      region: r.region ?? null,
      sequenceStatus: r.sequence_status ?? null,
      sectionCode: String(r.section_code),
      leafTitle: String(r.leaf_title),
      operation: String(r.lifecycle_op),
    });
    out.set(r.vault_id, list);
  }
  return out;
}
