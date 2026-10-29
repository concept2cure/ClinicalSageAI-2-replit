/**
 * The governed artifact registry's one read (fold F3 slice A, D2, 2026-10-29).
 *
 * Two screens list concept2cure_artifacts with their governance state: the
 * organization's Artifacts center (GET /api/artifacts-center) and each
 * project's Vault, whose "Governed artifacts" branch lists every artifact of
 * the project (GET /api/c2c/project-vault/:id). This query was the Artifacts
 * center's own (artifacts-center-routes.ts:187-298 at 8b3ee4b57). It moved
 * here so both read the same rows the same way, never a second copy of the
 * signature, review and source sub-reads.
 *
 * Scope, all bound, nothing interpolated:
 *   $1 organization: the caller's integer organization. Repeated on projects,
 *      so an artifact written under another organization's project id never
 *      shows that project (PF-03).
 *   $2 program: a regulatory_programs.id the caller has been admitted to, or
 *      null for the organization. With a program, archived artifacts are left
 *      out and the row must reach the program through
 *      projects.regulatory_program_id on a project of the same organization.
 *   $3 limit: a window. `total_rows` is counted before the limit, so a window
 *      can say how much it did not list.
 *
 * Field sources (concept2cure_artifacts a):
 *   kind_source ← COALESCE(metadata->>'documentType', type)
 *   model       ← metadata->>'model' | 'modelTier' | 'aiModel', else null (never invented)
 *   is_signed   ← an active concept2cure_signatures row of this organization (any version)
 *   signed_version ← the version the newest active signature covers
 *   is_reviewed ← an 'approve' review decision on the CURRENT version
 *   source_count ← metadata.sourceArtifactIds when it is an array, else 0
 *   compiled_from / recorded_source ← metadata, for the recorded origin
 *   author_name ← public.actor_name(created_by_id), which still names a person who has left
 *
 * metadata is `json`, not jsonb, so only json operators and functions are used
 * on it (scripts/ci/check-json-operator-types.mjs).
 */
import { pool } from '../db.js';
import { normalizeCtdCode } from '../../shared/regulatory/section-code.js';
import {
  artifactOrigin,
  artifactSignatureFacts,
  artifactSignatureState,
  type ArtifactOrigin,
  type ArtifactSignatureState,
} from '../../shared/artifact-governance.js';

/** One registry row as the read projects it. */
export interface ArtifactRegistryRow {
  id: number | string;
  artifact_id: string;
  title: string | null;
  type: string | null;
  category: string | null;
  ctd_section: string | null;
  status: string | null;
  version: number | string | null;
  updated_at: Date | string | null;
  project_id: number | string | null;
  content_hash: string | null;
  kind_source: string | null;
  content_bytes: number | string | null;
  model: string | null;
  compiled_from: string | null;
  recorded_source: string | null;
  program: string | null;
  author_name: string | null;
  is_signed: boolean;
  is_reviewed: boolean;
  source_count: number | string | null;
  signed_version: number | string | null;
  /** Every row the scope matches, counted before the limit. */
  total_rows: number | string | null;
}

export interface ArtifactRegistryScope {
  organizationId: number;
  /** A program the caller has been admitted to, or null for the organization. */
  programId: string | null;
  limit: number;
}

export async function readArtifactRegistry(scope: ArtifactRegistryScope): Promise<ArtifactRegistryRow[]> {
  const { rows } = await pool.query(
    `SELECT
       a.id                                            AS id,
       a.artifact_id                                   AS artifact_id,
       a.title                                         AS title,
       a.type                                          AS type,
       a.category                                      AS category,
       a.ctd_section                                   AS ctd_section,
       a.status                                        AS status,
       a.version                                       AS version,
       a.updated_at                                    AS updated_at,
       a.project_id                                    AS project_id,
       a.content_hash                                  AS content_hash,
       COALESCE(a.metadata ->> 'documentType', a.type) AS kind_source,
       octet_length(a.content)                         AS content_bytes,
       COALESCE(
         a.metadata ->> 'model',
         a.metadata ->> 'modelTier',
         a.metadata ->> 'aiModel'
       )                                               AS model,
       a.metadata ->> 'compiledFrom'                   AS compiled_from,
       a.metadata ->> 'source'                         AS recorded_source,
       COALESCE(p.code, p.name)                        AS program,
       COALESCE(au.name, au.email)                     AS author_name,
       EXISTS (
         SELECT 1
           FROM concept2cure_signatures s
          WHERE s.artifact_id = a.id
            AND s.organization_id = a.organization_id
            AND s.status = 'active'
       )                                               AS is_signed,
       EXISTS (
         SELECT 1 FROM concept2cure_review_decisions d
          WHERE d.artifact_id = a.id
            AND d.organization_id = a.organization_id
            AND d.decision = 'approve'
            AND d.version_reviewed = a.version
       )                                               AS is_reviewed,
       CASE
         WHEN json_typeof(a.metadata -> 'sourceArtifactIds') = 'array'
         THEN json_array_length(a.metadata -> 'sourceArtifactIds')
         ELSE 0
       END                                             AS source_count,
       /* Which version the newest active signature covers. is_signed above
          is EXISTS-any: it says a signature exists, not that it covers what
          is on file now. Version content is immutable (an edit mints a new
          version), so an older signature is not invalid; it covers earlier
          bytes, and the number is what lets a reader say so. */
       (
         SELECT v.version
           FROM concept2cure_signatures s
           JOIN concept2cure_artifact_versions v ON v.id = s.artifact_version_id
          WHERE s.artifact_id = a.id
            AND s.organization_id = a.organization_id
            AND s.status = 'active'
          ORDER BY s.id DESC
          LIMIT 1
       )                                               AS signed_version,
       (COUNT(*) OVER ())::int                         AS total_rows
     FROM concept2cure_artifacts a
     LEFT JOIN projects p ON p.id = a.project_id AND p.organization_id = a.organization_id
     LEFT JOIN LATERAL public.actor_name(a.created_by_id) au ON TRUE
     WHERE a.organization_id = $1
       AND ($2::uuid IS NULL OR (a.status <> 'archived' AND p.regulatory_program_id = $2::uuid))
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT $3`,
    [scope.organizationId, scope.programId, scope.limit],
  );
  return rows as ArtifactRegistryRow[];
}

/** 'regulatory_document' → 'Regulatory document'; an explicit documentType passes through. */
export function humanizeArtifactKind(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Document';
  const normalized = s.replace(/[_-]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * The format key from the real category. These artifacts are editable text
 * (no rendered file is stored); the writeback paths produce
 * category='document', which opens to edit as 'docx'. A derivation from the
 * column, not a per-row format the data cannot support.
 */
export function deriveArtifactFormat(category: string | null | undefined): string {
  const c = (category ?? '').toLowerCase().trim();
  if (!c || c === 'document') return 'docx';
  return c;
}

/*
 * One row's section, status and size, said the same way on both screens (fold
 * F3 slice B, 2026-10-29). Both screens export one CSV manifest of these rows
 * (client artifactManifest.ts), so a row must not read one way in the Vault and
 * another in the Artifacts center. Moved here, not copied: the size formatter
 * was the Artifacts center's (formatBytes), the status mapping the Vault
 * branch's (artifactLeafStatus), the section rule the Vault leaf's.
 */

/** The row's CTD section in canonical form, or the recorded text when it is not a code; null when none. */
export function artifactCtdSection(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() || null;
  return normalizeCtdCode(trimmed) ?? trimmed;
}

/**
 * The registry's status in the Vault chip's vocabulary. An unrecognised value
 * is passed through, and the chip says "Status unavailable" rather than a
 * status nobody recorded.
 */
export function artifactRegistryStatus(raw: string | null | undefined): string {
  switch (raw) {
    case 'draft': return 'draft';
    case 'review': return 'review';
    case 'approved': return 'approved';
    case 'locked': return 'final';
    default: return raw || 'unknown';
  }
}

/** Human byte size of the STORED content (octet_length), not of a rendered file: '182 KB', '1.4 MB'. */
export function formatContentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What both screens show of one row's governance. */
export interface ArtifactGovernance {
  kind: string;
  fmt: string;
  model: string | null;
  sig: boolean;
  sigVersion: number | null;
  sigStale: boolean | null;
  signature: ArtifactSignatureState;
  reviewed: boolean;
  sourceCount: number;
  origin: ArtifactOrigin | null;
}

export function artifactGovernance(row: ArtifactRegistryRow): ArtifactGovernance {
  const facts = artifactSignatureFacts({ isSigned: row.is_signed, signedVersion: row.signed_version, version: row.version });
  const model = row.model ?? null;
  return {
    kind: humanizeArtifactKind(row.kind_source ?? row.type),
    fmt: deriveArtifactFormat(row.category),
    model,
    ...facts,
    signature: artifactSignatureState(facts),
    reviewed: row.is_reviewed === true,
    sourceCount: Number(row.source_count) || 0,
    origin: artifactOrigin({
      compiledFrom: row.compiled_from,
      type: row.type,
      category: row.category,
      recordedSource: row.recorded_source,
      model,
    }),
  };
}
