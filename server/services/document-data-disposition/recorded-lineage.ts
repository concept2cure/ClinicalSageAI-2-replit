/** Existing recorded workbook identity only. Capture provenance and the
 * canonical file_upload.derived event are the two existing edge stores. A
 * missing archived event is unknown history, not proof of independent origin.
 * SQL follows named identities inside one tenant; equal bytes do not add edges.
 */
import type { DispositionQueryable } from './types';

const MAX_RECORDED_DEPTH = 64;
export function lineageAlias(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid SQL alias');
  return value;
}

function integerIdentity(value: string): string {
  // Validate the text and PostgreSQL integer range before a cast. JSON values
  // and malformed IDs never reach an unconditional numeric conversion.
  return `(CASE WHEN ${value} ~ '^[1-9][0-9]{0,9}$'
    AND (length(${value}) < 10 OR ${value} <= '2147483647') THEN ${value}::integer END)`;
}

function hasCaptureEdgeSql(provenance: string): string {
  return `(${provenance} ? 'derivedFromFileId' OR ${provenance}->>'origin' = 'spreadsheet_edit'
    OR (${provenance} ? 'parentSourceIds' AND ${provenance}->'parentSourceIds' IS DISTINCT FROM '[]'::jsonb))`;
}

function recordedPayloadsSql(): string {
  return `SELECT w.provenance AS provenance, TRUE AS bound
    WHERE w.kind = 'captured'
    UNION ALL
    SELECT to_jsonb(c.provenance), c.checksum = w.checksum
    FROM public.cre_evidence_sources c
    WHERE w.kind = 'upload' AND c.organization_id = w.organization_id
      AND c.source_type = 'client_document' AND c.deleted_at IS NULL
      AND c.provenance->>'fileUploadId' = w.id
      AND ${hasCaptureEdgeSql('to_jsonb(c.provenance)')}
    UNION ALL
    SELECT jsonb_build_object('origin','spreadsheet_edit',
        'derivedFromFileId', a.details->'sourceFileId',
        'derivedFromSha256', a.details->'sourceSha256',
        'parentSourceIds', a.details->'parentSourceIds'),
      a.n = 1 AND a.table_name = 'file_upload' AND a.target = 'file_upload:' || w.id
        AND a.details->>'operation' = 'spreadsheet_edit'
        AND a.details->>'fileId' = w.id AND a.details->>'checksumSha256' = w.checksum
    FROM (SELECT al.table_name, al.target, to_jsonb(al.new_values) AS details, count(*) OVER () AS n
      FROM public.audit_logs al WHERE w.kind = 'upload' AND al.tenant_id = w.organization_id
        AND al.action = 'file_upload.derived' AND al.record_id = w.id) a`;
}

function recordedEdgesSql(): string {
  const auditEdge = `EXISTS (SELECT 1 FROM public.audit_logs known_audit
    WHERE known_audit.tenant_id = w.organization_id AND known_audit.action = 'file_upload.derived'
      AND known_audit.record_id = w.provenance->>'fileUploadId')`;
  const captureEdge = hasCaptureEdgeSql('w.provenance');
  const ownBridge = `(w.kind = 'captured' AND (${captureEdge} OR ${auditEdge})
    AND EXISTS (SELECT 1 FROM public.file_uploads own_f WHERE own_f.organization_id = w.organization_id
      AND own_f.id = w.provenance->>'fileUploadId'))`;
  return `WITH payloads AS (${recordedPayloadsSql()})
    SELECT DISTINCT 'captured'::text AS kind, p.value #>> '{}' AS id,
      r.provenance->>'derivedFromSha256' AS expected_hash,
      r.provenance->>'derivedFromFileId' AS expected_file,
      (r.bound AND jsonb_typeof(p.value) = 'number'
        AND (p.value #>> '{}') ~ '^[1-9][0-9]*$'
        AND r.provenance->>'derivedFromSha256' ~ '^[a-f0-9]{64}$') IS TRUE AS verified,
      1 AS depth_increment,
      (NOT ${ownBridge} AND NOT (r.provenance ? 'derivedFromFileId')) AS expand
    FROM payloads r CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(r.provenance->'parentSourceIds') = 'array'
        THEN r.provenance->'parentSourceIds' ELSE '[]'::jsonb END) p(value)
    UNION
    SELECT 'captured', r.provenance->>'parentSourceIds', r.provenance->>'derivedFromSha256', NULL::text, FALSE, 1, FALSE
    FROM payloads r WHERE jsonb_typeof(r.provenance->'parentSourceIds') IN ('number','string')
    UNION
    SELECT 'upload', r.provenance->>'derivedFromFileId', r.provenance->>'derivedFromSha256', NULL::text,
      (r.bound AND jsonb_typeof(r.provenance->'derivedFromFileId') = 'string'
        AND length(r.provenance->>'derivedFromFileId') > 0
        AND r.provenance->>'derivedFromSha256' ~ '^[a-f0-9]{64}$') IS TRUE, 1, NOT ${ownBridge}
    FROM payloads r WHERE r.provenance ? 'derivedFromFileId'
    UNION
    SELECT 'invalid', '', NULL::text, NULL::text, FALSE, 1, FALSE FROM payloads r
    WHERE r.bound IS NOT TRUE
      OR (r.provenance ? 'parentSourceIds' AND jsonb_typeof(r.provenance->'parentSourceIds') <> 'array')
      OR (r.provenance->>'origin' = 'spreadsheet_edit'
        AND (NOT (r.provenance ? 'derivedFromFileId') OR NOT (r.provenance ? 'parentSourceIds')))
    UNION
    SELECT 'invalid', '', NULL::text, NULL::text, FALSE, 1, FALSE
    WHERE (SELECT count(DISTINCT jsonb_build_array(r.provenance->'derivedFromFileId',r.provenance->'derivedFromSha256'))
      FROM payloads r WHERE r.provenance ? 'derivedFromFileId') > 1
    UNION
    -- An own-upload bridge imports its recorded audit/capture ancestry. It is
    -- not an ancestor and does not turn another program's same-byte decision
    -- into this capture's data disposition.
    SELECT 'upload', f.id, w.checksum, NULL::text, (f.checksum_sha256 = w.checksum) IS TRUE, 0, TRUE
    FROM public.file_uploads f WHERE w.kind = 'captured'
      AND f.organization_id = w.organization_id AND f.id = w.provenance->>'fileUploadId'
      AND (${captureEdge} OR ${auditEdge})`;
}

/** seedSql supplies kind,id,organization_id,checksum,program_id,provenance.
 * The traversal is one set-based PostgreSQL statement, not a JS query per
 * ancestor. A cycle or depth limit is an unverified refusal, never truncation
 * represented as a complete lineage. Own-upload bridges consume no ancestry
 * depth; the visited identity path still detects their cycles. */
export function recordedLineageCtes(seedSql: string): string {
  return `WITH RECURSIVE rl_seed AS (${seedSql}),
    rl_walk(root_kind,root_id,organization_id,kind,id,checksum,program_id,provenance,depth,visited,invalid,is_cycle,expand) AS (
      SELECT kind,id,organization_id,kind,id,checksum,program_id,provenance,0,
        ARRAY[kind || ':' || id]::text[], FALSE, FALSE, TRUE FROM rl_seed
      UNION ALL
      SELECT w.root_kind,w.root_id,w.organization_id,e.kind,e.id,
        CASE WHEN e.kind = 'captured' THEN p.checksum ELSE f.checksum_sha256 END,
        p.client_program_id,to_jsonb(p.provenance),w.depth + e.depth_increment,
        w.visited || (e.kind || ':' || COALESCE(e.id,'')),
        (NOT e.verified OR e.id IS NULL OR e.kind = 'invalid'
          OR (e.kind = 'captured' AND (p.id IS NULL OR p.deleted_at IS NOT NULL OR p.checksum IS DISTINCT FROM e.expected_hash
            OR (e.expected_file IS NOT NULL AND p.provenance->>'fileUploadId' IS DISTINCT FROM e.expected_file)))
          OR (e.kind = 'upload' AND (f.id IS NULL OR f.checksum_sha256 IS DISTINCT FROM e.expected_hash
            OR (f.storage_path LIKE 'uploads/org-' || w.organization_id::text || '/%') IS NOT TRUE
            OR f.storage_path ~ '(^|/)[.]{1,2}(/|$)' OR f.storage_path ~ '/$'))) IS TRUE,
        (e.kind || ':' || COALESCE(e.id,'')) = ANY(w.visited),e.expand
      FROM rl_walk w CROSS JOIN LATERAL (${recordedEdgesSql()}) e
      LEFT JOIN public.cre_evidence_sources p ON e.kind = 'captured'
        AND p.id = ${integerIdentity('e.id')} AND p.organization_id = w.organization_id AND p.source_type = 'client_document'
      LEFT JOIN public.file_uploads f ON e.kind = 'upload' AND f.id = e.id AND f.organization_id = w.organization_id
      WHERE w.expand AND NOT w.invalid AND NOT w.is_cycle AND w.depth < ${MAX_RECORDED_DEPTH}
    )`;
}

export const recordedLineageInvalidSql = (a: string): string => {
  lineageAlias(a);
  return `${a}.invalid OR ${a}.is_cycle OR ${a}.depth >= ${MAX_RECORDED_DEPTH}`;
};

/** Only genuine ancestors are matched here. keep_data does not withdraw their
 * extracted data and therefore does not withdraw an edited descendant. */
export function recordedAncestorWithdrawnSql(a: string): string {
  lineageAlias(a);
  return `(${a}.depth > 0 AND EXISTS (SELECT 1 FROM public.document_data_dispositions dd
    WHERE dd.organization_id = ${a}.organization_id AND dd.choice IN ('remove_data','supersede')
      AND (( ${a}.kind = 'captured' AND dd.program_id = ${a}.program_id
        AND (dd.captured_source_id::text = ${a}.id OR dd.linked_ids->'capturedSourceIds' @> jsonb_build_array(${integerIdentity(`${a}.id`)})
          OR dd.source_sha256 = ${a}.checksum))
        OR (${a}.kind = 'upload' AND (dd.linked_ids->'uploadIds' @> jsonb_build_array(${a}.id)
          OR dd.source_sha256 = ${a}.checksum)))))`;
}

export function recordedLineageSeedSql(kind: 'captured' | 'upload', a: string): string {
  lineageAlias(a);
  return `SELECT '${kind}'::text AS kind, ${a}.id::text AS id, ${a}.organization_id,
    ${a}.${kind === 'captured' ? 'checksum' : 'checksum_sha256'}::text AS checksum,
    ${kind === 'captured' ? `${a}.client_program_id` : 'NULL::uuid'} AS program_id,
    ${kind === 'captured' ? `to_jsonb(${a}.provenance)` : 'NULL::jsonb'} AS provenance`;
}

export function recordedLineageEligibleSql(kind: 'captured' | 'upload', a: string): string {
  return `NOT EXISTS (${recordedLineageCtes(recordedLineageSeedSql(kind, a))}
    SELECT 1 FROM rl_walk rw WHERE ${recordedLineageInvalidSql('rw')} OR ${recordedAncestorWithdrawnSql('rw')})`;
}

export interface RecordedUploadLineage {
  derivedFromFileId?: string;
  derivedFromSha256?: string;
  parentSourceIds: number[];
}
type LineageAdmissionRow = {
  invalid: boolean; withdrawn: boolean; parent_files: Array<{ id: string; checksum: string }>;
  parent_sources: Array<{ id: string; checksum: string }>;
};

function assertAdmissionRow(row: LineageAdmissionRow | undefined): asserts row is LineageAdmissionRow {
  if (!row || typeof row.invalid !== 'boolean' || typeof row.withdrawn !== 'boolean'
      || !Array.isArray(row.parent_files) || !Array.isArray(row.parent_sources)
      || row.invalid || row.withdrawn || row.parent_files.length > 1) {
    throw new Error('The recorded workbook ancestry is unavailable, inconsistent or withdrawn. Nothing was captured.');
  }
}

/** Caller holds the existing capture/upload reservation and verified byte
 * identity. This carries immediate ancestry only; eligibility separately
 * checks the full recorded chain. No capture is created for a conversation. */
export async function readRecordedUploadLineage(
  q: DispositionQueryable, organizationId: number, fileId: string, checksum: string,
): Promise<RecordedUploadLineage | null> {
  const result = await q.query(`${recordedLineageCtes(`SELECT 'upload'::text AS kind,
      $2::text AS id,$1::integer AS organization_id,$3::text AS checksum,NULL::uuid AS program_id,NULL::jsonb AS provenance`)}
    SELECT COALESCE(bool_or(${recordedLineageInvalidSql('rw')}),FALSE) AS invalid,
      COALESCE(bool_or(${recordedAncestorWithdrawnSql('rw')}),FALSE) AS withdrawn,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',rw.id,'checksum',rw.checksum))
        FILTER (WHERE rw.depth = 1 AND rw.kind = 'upload'),'[]'::jsonb) AS parent_files,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id',rw.id,'checksum',rw.checksum))
        FILTER (WHERE rw.depth = 1 AND rw.kind = 'captured'),'[]'::jsonb) AS parent_sources
    FROM rl_walk rw`, [organizationId,fileId,checksum]);
  const row = (Array.isArray(result.rows) && result.rows.length === 1 ? result.rows[0] : undefined) as LineageAdmissionRow | undefined;
  assertAdmissionRow(row);
  if (!row.parent_files.length && !row.parent_sources.length) return null;
  if ([...row.parent_files, ...row.parent_sources].some(parent => !parent || typeof parent.id !== 'string'
      || typeof parent.checksum !== 'string')) {
    throw new Error('The recorded workbook parent identities could not be verified. Nothing was captured.');
  }
  const hashes = [...row.parent_files, ...row.parent_sources].map(parent => parent.checksum);
  if (hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash)) || new Set(hashes).size !== 1
      || row.parent_sources.some(parent => !/^[1-9][0-9]*$/.test(parent.id) || !Number.isSafeInteger(Number(parent.id)))) {
    throw new Error('The recorded workbook parent identities could not be verified. Nothing was captured.');
  }
  return { ...(row.parent_files[0] ? { derivedFromFileId: row.parent_files[0].id } : {}),
    derivedFromSha256: hashes[0], parentSourceIds: row.parent_sources.map(parent => Number(parent.id)).sort((a,b) => a-b) };
}
