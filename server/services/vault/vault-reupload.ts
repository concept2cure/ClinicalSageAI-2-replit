/**
 * A re-upload of bytes the Vault already records at the same program, code
 * and version: what it may change, and the record of what it did change.
 *
 * The ingest's ON CONFLICT … DO UPDATE refuses different bytes (409
 * VERSION_CONTENT_CONFLICT), but for the SAME bytes it rewrote the governed
 * row: classification fell back to 'INTERNAL' when the retry omitted it,
 * retention policy and lineage were nulled, the storage pointer moved to the
 * retry's fresh copy (orphaning the admitted one), and the only trace was a
 * second ingest row carrying the new values, never the old ones. Under
 * §11.10(e) a change must not obscure what was recorded (VR-05 in
 * docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md; handed to this lane in
 * 49293661).
 *
 * What a same-bytes retry does now:
 *   - a field the retry does not state keeps its recorded value;
 *   - retention policy, lineage and file name are write-once (NULL → value
 *     only), and the storage pointer moves only when the record has none —
 *     the transitions VR-06's planned trigger allows;
 *   - a field it does change (title, type, classification, a proposed
 *     placement) is recorded as one chained `vault.document.reupload` row
 *     with each field's before and after;
 *   - a retry that changes nothing writes no audit row, and the fresh copy it
 *     stored is removed through the ingest's one discard path.
 *
 * Changing a title or type by re-uploading is still possible, and is now
 * audited. Replacing it with a governed Edit details is VR-05's remaining
 * half, with the Vault surface's lane.
 */
import type { PoolClient } from 'pg';

/** The recorded fields a re-upload is judged against. */
export interface RecordedVersion {
  id: string;
  content_hash: string;
  document_title: string | null;
  document_type: string | null;
  classification: string | null;
  retention_policy: string | null;
  parent_document_id: string | null;
  supersedes_id: string | null;
  storage_version_id: string | null;
  folder_id: string | null;
  evidence_kind: string | null;
  ctd_section: string | null;
  placement_status: string | null;
}

/** The fields whose change a re-upload records, before and after. */
export const REUPLOAD_AUDITED_FIELDS = [
  'document_title',
  'document_type',
  'classification',
  'retention_policy',
  'parent_document_id',
  'supersedes_id',
  'storage_version_id',
  'folder_id',
  'evidence_kind',
  'ctd_section',
  'placement_status',
] as const satisfies ReadonlyArray<keyof RecordedVersion>;

export interface ReuploadChange {
  field: (typeof REUPLOAD_AUDITED_FIELDS)[number];
  from: string | null;
  to: string | null;
}

/**
 * The row already recorded at (program, code, version), locked for the rest
 * of the admission's transaction so the comparison and the write see the same
 * row. Null when nothing is recorded there.
 */
export async function readRecordedVersion(
  client: Pick<PoolClient, 'query'>,
  programId: string,
  documentCode: string,
  version: string,
): Promise<RecordedVersion | null> {
  // tenant-isolation-safe: vault.documents is program-scoped; the admission
  // has already refused a caller whose organization does not own programId.
  const { rows } = await client.query(
    `SELECT id, content_hash, document_title, document_type, classification, retention_policy,
            parent_document_id, supersedes_id, storage_version_id,
            folder_id, evidence_kind, ctd_section, placement_status
       FROM vault.documents
      WHERE program_id = $1 AND document_code = $2 AND version = $3
      FOR UPDATE`,
    [programId, documentCode, version],
  );
  return (rows[0] as RecordedVersion | undefined) ?? null;
}

const asText = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Each audited field whose value the re-upload changed, before and after. */
export function reuploadChanges(before: RecordedVersion, after: Record<string, unknown>): ReuploadChange[] {
  const changes: ReuploadChange[] = [];
  for (const field of REUPLOAD_AUDITED_FIELDS) {
    const from = asText(before[field]);
    const to = asText(after[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}
