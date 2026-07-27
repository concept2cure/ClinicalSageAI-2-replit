/**
 * Source usage — the link between an authored section and the sources it was
 * drafted from.
 *
 * The Data Room gave every uploaded document a canonical identity; the authoring
 * loop holds the sections. Nothing joined them, so the platform could not answer
 * the questions that make a source library more than a file list:
 *
 *   forward   "what is this section written from?"       → listSectionSources
 *   backward  "where is this source used?"               → next change
 *   change    "this source moved; what does it affect?"  → next change
 *
 * This change lands the record and the forward read. The back-reference and the
 * change report are the same rows queried the other way round; they follow
 * immediately, and the checksum captured here is what makes them possible.
 *
 * NO NEW TABLE. `authoring_citations` already is that link. It is read by the
 * document assembler, the freeze path and the citation APIs, so a second
 * section→source table would fragment exactly what the canonical source object
 * exists to unify. This module supplies the missing convention and the queries:
 *
 *   source         = 'cre_evidence_source'
 *   reference_id   = cre_evidence_sources.id, as text
 *   payload_sha256 = the source's checksum AT THE MOMENT IT WAS CITED
 *
 * That last column is what makes change propagation a fact rather than a guess.
 * A citation carrying a checksum the source no longer has was written against
 * content that has since been superseded — recorded durably, not recomputed in
 * whichever browser session happens to be open. See
 * migrations/20260726_authoring_citation_source_usage.sql.
 *
 * ── Honesty rules this module holds to ──────────────────────────────────────
 * • A citation whose source no longer resolves (deleted, or owned by another
 *   tenant) is RETURNED with a null source rather than filtered out. Dropping it
 *   would silently turn "this section cites something unavailable" into "this
 *   section cites nothing", which is the more dangerous of the two.
 * • A citation with no recorded checksum is `unverified`, never `current`. It
 *   predates the convention; claiming it is current would assert a check that
 *   never happened.
 * • Nothing is inferred from titles, filenames or text similarity. A usage exists
 *   because someone recorded it.
 *
 * ── Tenancy ─────────────────────────────────────────────────────────────────
 * Citations are filtered on `tenant_id`, sources through `visibleOrgClause`
 * (own org plus global-public), and sections/documents on their own `tenant_id`.
 * Source ids are validated as positive integers in JS and compared as
 * `sources.id::text = citations.reference_id`, so no caller-supplied text is ever
 * cast to an integer by Postgres — a non-numeric `reference_id` left by the
 * data-token flow cannot raise 22P02 and take the query down.
 *
 * @module server/services/clinical-regulatory-evidence/source-usage.service
 */

import { randomUUID } from 'node:crypto';

import { pool } from '../../db';
import { visibleOrgClause } from './evidence-spine.service';

/** The `authoring_citations.source` discriminator for a canonical-source citation. */
export const CRE_SOURCE_CITATION = 'cre_evidence_source';

export class SourceUsageError extends Error {}

/**
 * Whether a citation still stands against its source's current content.
 *
 *   current      the cited checksum matches the source's checksum today
 *   changed      the source's content identity moved after this citation
 *   unverified   no checksum was recorded (pre-convention citation), or the
 *                source itself carries none — nothing to compare, so nothing
 *                is claimed
 *   unresolved   the reference does not resolve to a source this caller can see
 */
export type UsageState = 'current' | 'changed' | 'unverified' | 'unresolved';

export interface SectionSourceUsage {
  citationId: string;
  sectionId: string;
  citedAt: string | null;
  citedBy: string | null;
  citationText: string | null;
  /** The checksum recorded when this citation was made. */
  citedChecksum: string | null;
  state: UsageState;
  source: {
    id: number;
    title: string | null;
    checksum: string | null;
    sourceType: string | null;
    ingestionStatus: string | null;
    extractionStatus: string | null;
    mimeType: string | null;
    fileUploadId: string | null;
    updatedAt: string | null;
  } | null;
}

/** Positive-integer source ids only; anything else is dropped rather than cast. */
function numericIds(ids: Array<number | string>): number[] {
  const out: number[] = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

function usageState(citedChecksum: string | null, currentChecksum: string | null, resolved: boolean): UsageState {
  if (!resolved) return 'unresolved';
  if (!citedChecksum || !currentChecksum) return 'unverified';
  return citedChecksum === currentChecksum ? 'current' : 'changed';
}

/**
 * Record that a section was drafted from a source.
 *
 * Both ends are verified against the caller before anything is written: the
 * section must belong to this tenant and the source must be visible to it.
 * Without the section check the existing `POST /cite` shape lets a caller attach
 * a row keyed on another tenant's `section_id` — stamped with their own
 * tenant_id, so it never surfaces, but written all the same.
 *
 * The source's CURRENT checksum is captured here. That is the whole mechanism:
 * the citation asserts "drafted from this content", and the assertion stays
 * checkable after the source moves.
 *
 * Idempotent per (section, source): citing the same source twice re-resolves the
 * existing row to the current checksum instead of accumulating duplicates, so a
 * section's source list is a set of sources, not a log of clicks.
 */
export async function citeSource(
  orgId: number,
  p: {
    sectionId: string;
    sourceId: number | string;
    citationText?: string | null;
    anchor?: unknown;
    createdBy: string;
  },
): Promise<{ citationId: string; citedChecksum: string | null; created: boolean }> {
  const [sourceId] = numericIds([p.sourceId]);
  if (!sourceId) throw new SourceUsageError('sourceId must be a positive integer');
  if (!p.sectionId) throw new SourceUsageError('sectionId is required');

  const section = await pool.query(
    `SELECT id FROM authoring_sections WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [p.sectionId, orgId],
  );
  if (section.rows.length === 0) {
    throw new SourceUsageError('section not found in this organization');
  }

  const c = visibleOrgClause(orgId, 2);
  const source = await pool.query<{ id: number; checksum: string | null }>(
    `SELECT id, checksum FROM cre_evidence_sources
      WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL LIMIT 1`,
    [sourceId, c.param],
  );
  if (source.rows.length === 0) {
    throw new SourceUsageError('source not found in this organization');
  }
  const checksum = source.rows[0].checksum ?? null;

  // Re-resolve an existing citation of the same source rather than duplicating.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM authoring_citations
      WHERE section_id = $1 AND tenant_id = $2 AND source = $3 AND reference_id = $4
      ORDER BY created_at ASC LIMIT 1`,
    [p.sectionId, orgId, CRE_SOURCE_CITATION, String(sourceId)],
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE authoring_citations
          SET payload_sha256 = $1,
              citation_text = COALESCE($2, citation_text)
        WHERE id = $3 AND tenant_id = $4 AND frozen_at IS NULL`,
      [checksum, p.citationText ?? null, existing.rows[0].id, orgId],
    );
    return { citationId: existing.rows[0].id, citedChecksum: checksum, created: false };
  }

  // The column is UUID, like every other id the authoring router mints.
  const citationId = randomUUID();
  await pool.query(
    `INSERT INTO authoring_citations
       (id, section_id, source, anchor, citation_text, reference_id, created_by, created_at, tenant_id, payload_sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9)`,
    [
      citationId,
      p.sectionId,
      CRE_SOURCE_CITATION,
      p.anchor == null ? null : JSON.stringify(p.anchor),
      p.citationText ?? null,
      String(sourceId),
      p.createdBy,
      orgId,
      checksum,
    ],
  );
  return { citationId, citedChecksum: checksum, created: true };
}

/** Stop citing a source from a section. Frozen citations are immutable. */
export async function removeSourceCitation(
  orgId: number,
  sectionId: string,
  sourceId: number | string,
): Promise<boolean> {
  const [id] = numericIds([sourceId]);
  if (!id || !sectionId) return false;
  const { rowCount } = await pool.query(
    `DELETE FROM authoring_citations
      WHERE section_id = $1 AND tenant_id = $2 AND source = $3 AND reference_id = $4
        AND frozen_at IS NULL`,
    [sectionId, orgId, CRE_SOURCE_CITATION, String(id)],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Forward direction — the sources this section is written from, with each
 * citation's standing against the source's content today.
 */
export async function listSectionSources(orgId: number, sectionId: string): Promise<SectionSourceUsage[]> {
  if (!sectionId) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.section_id, c.created_at, c.created_by, c.citation_text, c.payload_sha256,
            src.id AS source_id, src.title, src.checksum, src.source_type,
            src.ingestion_status, src.extraction_status, src.updated_at AS source_updated_at,
            src.metadata->>'mimeType'      AS mime_type,
            src.provenance->>'fileUploadId' AS file_upload_id
       FROM authoring_citations c
       LEFT JOIN cre_evidence_sources src
              ON src.id::text = c.reference_id
             AND (src.organization_id IS NULL OR src.organization_id = $2)
             AND src.deleted_at IS NULL
      WHERE c.section_id = $1 AND c.tenant_id = $2 AND c.source = $3
      ORDER BY c.created_at ASC`,
    [sectionId, orgId, CRE_SOURCE_CITATION],
  );

  return (rows as Array<Record<string, unknown>>).map(adaptUsageRow);
}

/** The joined source, or null when the reference did not resolve for this caller. */
function adaptUsageSource(r: Record<string, unknown>): SectionSourceUsage['source'] {
  if (r.source_id == null) return null;
  return {
    id: Number(r.source_id),
    title: (r.title as string) ?? null,
    checksum: (r.checksum as string) ?? null,
    sourceType: (r.source_type as string) ?? null,
    ingestionStatus: (r.ingestion_status as string) ?? null,
    extractionStatus: (r.extraction_status as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    fileUploadId: (r.file_upload_id as string) ?? null,
    updatedAt: r.source_updated_at ? new Date(r.source_updated_at as string).toISOString() : null,
  };
}

function adaptUsageRow(r: Record<string, unknown>): SectionSourceUsage {
  return {
    citationId: String(r.id),
    sectionId: String(r.section_id),
    citedAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    citedBy: (r.created_by as string) ?? null,
    citationText: (r.citation_text as string) ?? null,
    citedChecksum: (r.payload_sha256 as string) ?? null,
    state: usageState(
      (r.payload_sha256 as string) ?? null,
      (r.checksum as string) ?? null,
      r.source_id != null,
    ),
    source: adaptUsageSource(r),
  };
}
