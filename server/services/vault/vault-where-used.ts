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
 * eSTAR exports (critique 15): since 2026-10-01 each attachment in an official
 * eSTAR's record names its source, the Vault version (estar-fill.ts). The record
 * is the artifact's metadata when the export was placed in the registry, or
 * the export's EXPORT_GENERATED audit row when it was not; both are read here.
 * Exports made before then name no source and are not inferred from a hash.
 * `vault.evidence_citations` holds search hits, not uses, and is not listed.
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
  /** Its dispatch status (pending, sent, acknowledged …), or null. 'sent' and 'acknowledged' mean the agency holds it. */
  dispatchStatus: string | null;
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
            s.id AS sequence_id, s.sequence_number, s.region, s.status AS sequence_status, s.dispatch_status,
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
      dispatchStatus: r.dispatch_status ?? null,
      sectionCode: String(r.section_code),
      leafTitle: String(r.leaf_title),
      operation: String(r.lifecycle_op),
    });
    out.set(r.vault_id, list);
  }
  return out;
}

/** An official eSTAR export that attached a Vault version. */
export interface VaultEstarUse {
  /** Where the export's record is kept: the artifact registry, or the audit row of an unplaced export. */
  record: 'artifact' | 'audit';
  recordId: string;
  exportedAt: string;
  slot: string | null;
  chapter: string | null;
  fileName: string | null;
  /** The Vault version the exported eSTAR itself was retained as, when it was. */
  retainedAs: { documentId: string; documentCode: string | null; version: string | null } | null;
}

/** The attachments of an export record that name one of `wanted` as their Vault source. */
const ESTAR_ATTACHMENT_MATCH = (rec: string) => `EXISTS (
         SELECT 1 FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(${rec} -> 'attachments') = 'array' THEN ${rec} -> 'attachments' ELSE '[]'::jsonb END) att
          WHERE att -> 'source' ->> 'kind' = 'vault_document' AND att -> 'source' ->> 'documentId' = ANY($2::text[]))`;

function usesFrom(record: VaultEstarUse['record'], recordId: string, at: unknown, rec: any, wanted: Set<string>) {
  const kept = rec?.retention?.retained === true && rec.retention.documentId
    ? { documentId: String(rec.retention.documentId), documentCode: rec.retention.documentCode ?? null, version: rec.retention.version ?? null }
    : null;
  const atts: any[] = Array.isArray(rec?.attachments) ? rec.attachments : [];
  return atts
    .filter((a) => a?.source?.kind === 'vault_document' && wanted.has(String(a.source.documentId)))
    .map((a) => ({
      vaultId: String(a.source.documentId),
      use: {
        record, recordId, exportedAt: new Date(at as string).toISOString(),
        slot: a.slot ?? null, chapter: a.chapter ?? null, fileName: a.fileName ?? null, retainedAs: kept,
      } satisfies VaultEstarUse,
    }));
}

/** Each version's official eSTAR exports, by version id, oldest first; a version with none is absent. */
export async function readVaultEstarUses(
  q: PlacementQueryable,
  organizationId: number,
  vaultIds: string[],
): Promise<Map<string, VaultEstarUse[]>> {
  const out = new Map<string, VaultEstarUse[]>();
  if (vaultIds.length === 0) return out;
  const { rows } = await q.query(
    `SELECT 'artifact' AS record, c.artifact_id AS record_id, c.created_at AS at, c.metadata::jsonb AS rec
       FROM concept2cure_artifacts c
      WHERE c.organization_id = $1 AND c.metadata::jsonb ->> 'source' = 'export_estar_pdf'
        AND ${ESTAR_ATTACHMENT_MATCH('c.metadata::jsonb')}
     UNION ALL
     SELECT 'audit', a.id::text, a.created_at, a.new_values::jsonb
       FROM audit_logs a
      WHERE a.tenant_id = $1 AND a.action = 'EXPORT_GENERATED'
        AND a.new_values::jsonb ->> 'sourceType' = 'export_estar_pdf'
        AND ${ESTAR_ATTACHMENT_MATCH('a.new_values::jsonb')}
      ORDER BY at, record_id`,
    [organizationId, vaultIds],
  );
  const wanted = new Set(vaultIds);
  for (const r of rows) {
    for (const { vaultId, use } of usesFrom(r.record, String(r.record_id), r.at, r.rec, wanted)) {
      out.set(vaultId, [...(out.get(vaultId) ?? []), use]);
    }
  }
  return out;
}

/** A CMC record that cites a version as the document it was taken from (cmc_source_evidence). */
export interface VaultCmcEvidenceUse {
  linkId: string;
  sourceType: string;
  sourceKey: string;
  /** The Module 3 sections whose compile read that record, by key; empty when none has been compiled from it. */
  sections: string[];
}

/**
 * Each version's live CMC evidence links, by version id (row D2; the Data Room
 * and Vault were blind to a Module 3 use, discovery map 2026-10-04,
 * data-room-usage-blind-to-module3). A removed link is not a use. The sections
 * are those whose recorded lineage reads the record, so superseding the version
 * names what it holds (services/cmc/source-evidence.ts).
 */
export async function readVaultCmcEvidenceUses(
  q: PlacementQueryable,
  organizationId: number,
  vaultIds: string[],
): Promise<Map<string, VaultCmcEvidenceUse[]>> {
  const out = new Map<string, VaultCmcEvidenceUse[]>();
  if (vaultIds.length === 0) return out;
  const { rows } = await q.query(
    `SELECT e.vault_document_id::text AS vault_id, e.id::text AS link_id, e.source_type, e.source_key,
            COALESCE(array_agg(DISTINCT s.section_key) FILTER (WHERE s.section_key IS NOT NULL), '{}') AS sections
       FROM public.cmc_source_evidence e
       LEFT JOIN cmc_source_objects o
         ON o.organization_id = e.organization_id AND o.project_id = e.program_id::text AND o.source_key = e.source_key
       LEFT JOIN cmc_section_lineage l ON l.source_object_id = o.id AND l.organization_id = e.organization_id
       LEFT JOIN cmc_module3_sections s ON s.id = l.section_id AND s.organization_id = e.organization_id
      WHERE e.organization_id = $1 AND e.vault_document_id = ANY($2::uuid[]) AND e.unlinked_at IS NULL
      GROUP BY e.vault_document_id, e.id, e.source_type, e.source_key
      ORDER BY e.vault_document_id, e.source_key, e.id`,
    [organizationId, vaultIds],
  );
  for (const r of rows) {
    const sections = (Array.isArray(r.sections) ? r.sections.map(String) : []).sort();
    out.set(r.vault_id, [
      ...(out.get(r.vault_id) ?? []),
      { linkId: String(r.link_id), sourceType: String(r.source_type), sourceKey: String(r.source_key), sections },
    ]);
  }
  return out;
}
