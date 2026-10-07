import type { DocumentDispositionLinkedIds } from '../../../shared/document-data-disposition';
import { capturedDataEligibleSql } from './eligibility';
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

/** Direct captured descendants only. The target's identity/upload links have
 * already been proved by readLinks. A child in another program is a dependency
 * when it names that identity, never merely because it has matching bytes.
 *
 * No descendant is withdrawn or rewritten here. The disposition service uses
 * the result to require review before remove_data/supersede and to detect a
 * child created or changed since preview. keep_data keeps extracted data usable.
 * Conversation-only derivation is audit-only and is outside this projection. */
export async function readDerivedCaptureImpact(
  q: DispositionQueryable,
  organizationId: number,
  linkedIds: DocumentDispositionLinkedIds,
  sourceSha256: string,
): Promise<DerivedCaptureImpact> {
  const namedParents = `EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(s.provenance->'parentSourceIds') = 'array'
        THEN s.provenance->'parentSourceIds' ELSE '[]'::jsonb END
    ) p(value)
    WHERE jsonb_typeof(p.value) IN ('number','string')
      AND p.value #>> '{}' = ANY($2::text[])
  )`;
  const namedFile = `(s.provenance->>'derivedFromFileId' = ANY($3::text[]))`;
  const canonicalParentArray = `(jsonb_typeof(s.provenance->'parentSourceIds') = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.provenance->'parentSourceIds') = 'array'
          THEN s.provenance->'parentSourceIds' ELSE '[]'::jsonb END
      ) p(value)
      WHERE jsonb_typeof(p.value) <> 'number' OR (p.value #>> '{}') !~ '^[1-9][0-9]*$'
    ))`;
  const result = await q.query(`SELECT s.*,
      (${canonicalParentArray}
        AND s.provenance->>'derivedFromSha256' = $4
        AND (${namedParents} OR ${namedFile})) IS TRUE AS parent_edge_verified
    FROM public.cre_evidence_sources s
    WHERE s.organization_id = $1 AND s.source_type = 'client_document'
      AND s.deleted_at IS NULL AND ${capturedDataEligibleSql('s')}
      AND NOT (s.id::text = ANY($2::text[]))
      AND (${namedParents} OR ${namedFile}
        OR (jsonb_typeof(s.provenance->'parentSourceIds') IN ('number','string')
          AND s.provenance->>'parentSourceIds' = ANY($2::text[])))
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
