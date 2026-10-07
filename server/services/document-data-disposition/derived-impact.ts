import type { DocumentDispositionLinkedIds } from '../../../shared/document-data-disposition';
import { capturedOwnDataEligibleSql } from './eligibility';
import { recordedLineageCtes, recordedLineageInvalidSql } from './recorded-lineage';
import { hashSnapshot } from './tokens';
import { DispositionError, type DispositionQueryable } from './types';

export interface DerivedCaptureDependency {
  id: number;
  client_program_id: string | null;
  checksum: string | null;
  provenance: Record<string, unknown> | null;
  extraction_status: string | null;
  ingestion_status: string | null;
  is_current: boolean | null;
  updated_at: unknown;
  /** An exact named parent is still a review dependency when its digest or
   * lineage shape is inconsistent. It must not disappear through validation. */
  parent_edge_verified: boolean;
}

export interface DerivedCaptureImpact {
  rows: DerivedCaptureDependency[];
  count: number;
  unverifiedCount: number;
  fingerprint: string;
}

function validProjectionRow(value: unknown, organizationId: number): value is DerivedCaptureDependency {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'number' && Number.isSafeInteger(row.id) && row.id > 0
    && row.organization_id === organizationId && row.source_type === 'client_document'
    && row.deleted_at === null && typeof row.parent_edge_verified === 'boolean'
    && Boolean(row.provenance) && typeof row.provenance === 'object' && !Array.isArray(row.provenance);
}

/** Recorded captured descendants only. The target's identity/upload links have
 * already been proved by readLinks. A child in another program is a dependency
 * when it names that identity, never merely because it has matching bytes.
 *
 * No descendant is withdrawn or rewritten here. The disposition service uses
 * the result to require review before remove_data/supersede and to detect a
 * child created or changed since preview. keep_data keeps extracted data usable.
 * Canonical upload audit edges can preserve conversation-only derivation when
 * the upload is adopted. Uncaptured conversation files are not claimed as
 * qualified captured data by this projection. */
export async function readDerivedCaptureImpact(
  q: DispositionQueryable,
  organizationId: number,
  linkedIds: DocumentDispositionLinkedIds,
  sourceSha256: string,
): Promise<DerivedCaptureImpact> {
  const result = await q.query(`${recordedLineageCtes(`SELECT 'captured'::text AS kind,
      s.id::text AS id,s.organization_id,s.checksum,s.client_program_id AS program_id,to_jsonb(s.provenance) AS provenance
      FROM public.cre_evidence_sources s WHERE s.organization_id = $1 AND s.source_type = 'client_document'
        AND s.deleted_at IS NULL AND ${capturedOwnDataEligibleSql('s')}
        AND NOT (s.id::text = ANY($2::text[]))`)}
    SELECT s.*, (NOT EXISTS (SELECT 1 FROM rl_walk invalid_path
      WHERE invalid_path.root_id = s.id::text AND (${recordedLineageInvalidSql('invalid_path')}
        OR (invalid_path.depth > 0 AND ((invalid_path.kind = 'captured' AND invalid_path.id = ANY($2::text[]))
          OR (invalid_path.kind = 'upload' AND invalid_path.id = ANY($3::text[])))
          AND invalid_path.checksum IS DISTINCT FROM $4)))) AS parent_edge_verified
    FROM public.cre_evidence_sources s
    WHERE s.organization_id = $1 AND EXISTS (SELECT 1 FROM rl_walk ancestry
      WHERE ancestry.root_id = s.id::text AND ancestry.depth > 0
        AND ((ancestry.kind = 'captured' AND ancestry.id = ANY($2::text[]))
          OR (ancestry.kind = 'upload' AND ancestry.id = ANY($3::text[]))))
    ORDER BY s.id`, [organizationId, linkedIds.capturedSourceIds.map(String), linkedIds.uploadIds, sourceSha256]);
  if (!Array.isArray(result.rows) || !result.rows.every(row => validProjectionRow(row, organizationId))
      || new Set(result.rows.map(row => row.id)).size !== result.rows.length) {
    throw new DispositionError(503, 'IMPACT_UNAVAILABLE', 'The derived source impact could not be verified. Nothing was changed.');
  }
  const rows = result.rows as DerivedCaptureDependency[];
  return {
    rows,
    count: rows.length,
    unverifiedCount: rows.filter(row => !row.parent_edge_verified).length,
    fingerprint: hashSnapshot(rows),
  };
}
