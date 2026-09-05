/**
 * Source usage — the link between an authored section and the sources it was
 * drafted from, in both directions.
 *
 * The Data Room gave every uploaded document a canonical identity; the authoring
 * loop holds the sections. Nothing joined them, so the platform could not answer
 * either direction of the questions that make a source library more than a file
 * list:
 *
 *   forward   "what is this section written from?"       → listSectionSources
 *   backward  "where is this source used?"               → summarizeSourceUsage
 *   change    "this source moved; what does it affect?"  → listChangedSourceUsages
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
import type { CitationSource } from '@shared/authoring/citations';

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
export type UsageState = 'current' | 'changed' | 'superseded' | 'unverified' | 'unresolved';

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

export interface SourceUsageSummary {
  sourceId: number;
  /** Distinct sections citing this source. */
  sections: number;
  /** Distinct documents those sections belong to. */
  documents: number;
  /** Sections whose citation is against superseded content. */
  changedSections: number;
}

export interface ChangedSourceUsage {
  citationId: string;
  sectionId: string;
  sectionCode: string | null;
  sectionTitle: string | null;
  documentId: string | null;
  documentTitle: string | null;
  sourceId: number;
  sourceTitle: string | null;
  citedChecksum: string;
  currentChecksum: string;
  citedAt: string | null;
  sourceUpdatedAt: string | null;
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

function usageState(
  citedChecksum: string | null,
  currentChecksum: string | null,
  resolved: boolean,
  sourceIsCurrent: boolean | null,
): UsageState {
  if (!resolved) return 'unresolved';
  // SUPERSEDED OUTRANKS THE CHECKSUM COMPARISON, and has to.
  //
  // A source's checksum is never rewritten: a revised document is ingested as a
  // NEW row and the old row keeps its bytes and its hash forever. So the cited
  // and current checksums still MATCH on a source that has been replaced, and
  // this would report 'current' — "content unchanged since cited" — for exactly
  // the citation a reviewer most needs to look at.
  //
  // `is_current = FALSE` is the fact that says otherwise, recorded by the ingest
  // path when it links a successor. NULL means the column was not read, or no
  // successor is known; neither is evidence of supersession, so both fall
  // through rather than being treated as one.
  if (sourceIsCurrent === false) return 'superseded';
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
            src.provenance->>'fileUploadId' AS file_upload_id,
            -- is_current comes from migrations/20260829_cre_source_versioning.sql,
            -- which is separate from the spine that creates this table. Read
            -- through to_jsonb so a database that has the spine but not that
            -- migration yields NULL here instead of failing the whole query:
            -- naming the column directly would turn every Source Tracer read
            -- into a 500 mid-deploy. NULL means "not read", which usageState
            -- treats as no evidence of supersession rather than as false.
            (to_jsonb(src) ->> 'is_current')::boolean AS source_is_current
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

/**
 * The bibliographic facts behind a set of source ids, for a document EXPORT.
 *
 * An in-text citation stores the source's id and nothing else — the number a
 * reviewer reads is derived from position at render time, and the reference-list
 * entry is assembled here, from the registry, at export time. So the export asks
 * this for exactly the sources its content actually cites.
 *
 * Resolved against what this caller can see (`visibleOrgClause`, plus the
 * global-public rows), so a citation of another tenant's source resolves to
 * NOTHING and the export states it as unresolved rather than printing a title
 * this organization is not entitled to read. Ids that do not resolve are simply
 * absent from the result — that absence IS the unresolved state, and the
 * renderers say so in the filed document rather than skipping the citation.
 *
 * `deleted_at IS NULL`: a source withdrawn from the library cannot go on
 * lending its name to a claim in a document filed after the withdrawal.
 */
/** A DATE column as `YYYY-MM-DD`. `pg` parses DATE into a JS Date, whose
 *  default string form does not start with the year — and the reference entry
 *  prints only a year, read off the front. Anything unparseable yields null
 *  rather than a guess. */
function isoDay(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s || null;
}

export async function listCitationSources(
  orgId: number,
  sourceIds: Array<number | string>,
): Promise<CitationSource[]> {
  const ids = numericIds(sourceIds);
  if (ids.length === 0) return [];
  const c = visibleOrgClause(orgId, 2);
  const { rows } = await pool.query(
    `SELECT id, title, sponsor, source_type, document_date,
            COALESCE(NULLIF(source_record_identifier, ''),
                     NULLIF(trial_registry_identifier, ''),
                     NULLIF(application_number, '')) AS identifier
       FROM cre_evidence_sources
      WHERE id = ANY($1::int[]) AND ${c.sql} AND deleted_at IS NULL`,
    [ids, c.param],
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: (r.title as string) ?? null,
    sponsor: (r.sponsor as string) ?? null,
    sourceType: (r.source_type as string) ?? null,
    date: isoDay(r.document_date),
    identifier: (r.identifier as string) ?? null,
  }));
}

/**
 * Backward direction — for each requested source, how many sections and documents
 * cite it, and how many of those citations are against superseded content.
 *
 * Sources with no usage are simply ABSENT from the map. The caller reports that as
 * "not cited yet", which is a real and useful state: an uploaded document nothing
 * was written from is exactly what a reviewer wants to notice.
 *
 * One query for a whole page of sources rather than one per row.
 */
export async function summarizeSourceUsage(
  orgId: number,
  sourceIds: Array<number | string>,
): Promise<Map<number, SourceUsageSummary>> {
  const ids = numericIds(sourceIds);
  const out = new Map<number, SourceUsageSummary>();
  if (ids.length === 0) return out;

  const { rows } = await pool.query(
    `SELECT src.id AS source_id,
            COUNT(DISTINCT c.section_id)                        AS sections,
            COUNT(DISTINCT sec.doc_id)                          AS documents,
            COUNT(DISTINCT CASE
              WHEN c.payload_sha256 IS NOT NULL
               AND src.checksum IS NOT NULL
               AND src.checksum <> c.payload_sha256
              THEN c.section_id END)                            AS changed_sections
       FROM cre_evidence_sources src
       JOIN authoring_citations c
              ON c.reference_id = src.id::text
             AND c.tenant_id = $2
             AND c.source = $3
       LEFT JOIN authoring_sections sec
              ON sec.id = c.section_id AND sec.tenant_id = c.tenant_id
      WHERE src.id = ANY($1::int[])
        AND (src.organization_id IS NULL OR src.organization_id = $2)
        AND src.deleted_at IS NULL
      GROUP BY src.id`,
    [ids, orgId, CRE_SOURCE_CITATION],
  );

  for (const r of rows as Array<Record<string, unknown>>) {
    out.set(Number(r.source_id), {
      sourceId: Number(r.source_id),
      sections: Number(r.sections) || 0,
      documents: Number(r.documents) || 0,
      changedSections: Number(r.changed_sections) || 0,
    });
  }
  return out;
}

/**
 * Change propagation — every citation written against content its source no longer
 * has.
 *
 * Deliberately a REPORT, not a rewrite. A source moving does not tell us how the
 * section that cited it should now read, and silently regenerating regulated text
 * is not something a platform should do. What was missing is that the affected
 * sections were not discoverable at all, so a superseded protocol left no trace in
 * the documents written from it.
 *
 * Scope to a project with `programId` to answer "what in this project is stale?".
 */
export async function listChangedSourceUsages(
  orgId: number,
  opts: { programId?: string | null; sourceId?: number | string | null; limit?: number } = {},
): Promise<ChangedSourceUsage[]> {
  const args: unknown[] = [orgId, CRE_SOURCE_CITATION];
  let scope = '';
  if (opts.programId) {
    args.push(opts.programId);
    scope += ` AND src.client_program_id = $${args.length}`;
  }
  const [only] = numericIds(opts.sourceId == null ? [] : [opts.sourceId]);
  if (only) {
    args.push(only);
    scope += ` AND src.id = $${args.length}`;
  }
  args.push(Math.min(Math.max(opts.limit ?? 100, 1), 500));

  const { rows } = await pool.query(
    `SELECT c.id, c.section_id, c.payload_sha256, c.created_at,
            sec.code AS section_code, sec.title AS section_title, sec.doc_id,
            doc.title AS document_title,
            src.id AS source_id, src.title AS source_title, src.checksum,
            src.updated_at AS source_updated_at
       FROM authoring_citations c
       JOIN cre_evidence_sources src
              ON src.id::text = c.reference_id
             AND (src.organization_id IS NULL OR src.organization_id = $1)
             AND src.deleted_at IS NULL
       LEFT JOIN authoring_sections sec
              ON sec.id = c.section_id AND sec.tenant_id = c.tenant_id
       LEFT JOIN authoring_documents doc
              ON doc.id = sec.doc_id AND doc.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
        AND c.source = $2
        AND c.payload_sha256 IS NOT NULL
        AND src.checksum IS NOT NULL
        AND src.checksum <> c.payload_sha256
        ${scope}
      ORDER BY src.updated_at DESC NULLS LAST, c.created_at ASC
      LIMIT $${args.length}`,
    args,
  );

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    citationId: String(r.id),
    sectionId: String(r.section_id),
    sectionCode: (r.section_code as string) ?? null,
    sectionTitle: (r.section_title as string) ?? null,
    documentId: r.doc_id ? String(r.doc_id) : null,
    documentTitle: (r.document_title as string) ?? null,
    sourceId: Number(r.source_id),
    sourceTitle: (r.source_title as string) ?? null,
    citedChecksum: String(r.payload_sha256),
    currentChecksum: String(r.checksum),
    citedAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    sourceUpdatedAt: r.source_updated_at ? new Date(r.source_updated_at as string).toISOString() : null,
  }));
}

/**
 * Re-resolve one citation against its source's content today.
 *
 * This replaces a simulated refresh that bumped `created_at` to NOW() and returned
 * `sha256(cite_id + Date.now())` as the refreshed hash — a manufactured content
 * identity on a regulated surface, and a `created_at` that then claimed the
 * citation had just been made. Nothing was ever re-read.
 *
 * Here the checksum comes from the source row, `created_at` is left alone (a
 * citation was made when it was made), and the result reports plainly whether the
 * content moved. A frozen citation is immutable and is reported as such rather than
 * quietly skipped.
 */
export async function refreshSourceCitation(
  orgId: number,
  citationId: string,
): Promise<
  | { ok: true; changed: boolean; previousChecksum: string | null; currentChecksum: string | null; sourceId: number }
  | { ok: false; reason: 'not_found' | 'not_a_source_citation' | 'unresolved_source' | 'frozen' }
> {
  const cite = await pool.query<{
    id: string;
    source: string | null;
    reference_id: string | null;
    payload_sha256: string | null;
    frozen_at: string | null;
  }>(
    `SELECT id, source, reference_id, payload_sha256, frozen_at
       FROM authoring_citations WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [citationId, orgId],
  );
  if (cite.rows.length === 0) return { ok: false, reason: 'not_found' };
  const row = cite.rows[0];
  if (row.frozen_at) return { ok: false, reason: 'frozen' };
  if (row.source !== CRE_SOURCE_CITATION) return { ok: false, reason: 'not_a_source_citation' };

  const [sourceId] = numericIds([row.reference_id ?? '']);
  if (!sourceId) return { ok: false, reason: 'unresolved_source' };

  const c = visibleOrgClause(orgId, 2);
  const src = await pool.query<{ checksum: string | null }>(
    `SELECT checksum FROM cre_evidence_sources
      WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL LIMIT 1`,
    [sourceId, c.param],
  );
  if (src.rows.length === 0) return { ok: false, reason: 'unresolved_source' };

  const currentChecksum = src.rows[0].checksum ?? null;
  const previousChecksum = row.payload_sha256 ?? null;
  if (currentChecksum !== previousChecksum) {
    await pool.query(`UPDATE authoring_citations SET payload_sha256 = $1 WHERE id = $2 AND tenant_id = $3`, [
      currentChecksum,
      citationId,
      orgId,
    ]);
  }
  return { ok: true, changed: currentChecksum !== previousChecksum, previousChecksum, currentChecksum, sourceId };
}

/** A section with recorded source citations, grouped for the Source Tracer. */
export interface CitedSection {
  sectionId: string;
  sectionCode: string | null;
  sectionTitle: string | null;
  documentId: string;
  documentTitle: string | null;
  module: string | null;
  documentStatus: string | null;
  sources: SectionSourceUsage[];
}

/**
 * The Source Tracer read — every authored section in the org that carries at
 * least one RECORDED canonical-source citation, grouped per section, each
 * citation with its standing against the source's content today.
 *
 * This is the read that replaced `source_citations`, a sentence-level provenance
 * table that never had DDL anywhere in the repo and whose writer and reader
 * disagreed about what `document_id` meant (the writer inserted
 * concept2cure_artifacts ids; the reader joined documents ids). A provenance
 * surface fed by that join would, at best, show nothing — and at worst render
 * one document's sentences under another document's title. Lineage shown to a
 * regulated user must be a recorded fact, so the tracer now reads the same rows
 * the authoring Sources rail writes: human-recorded citations carrying the
 * source's checksum at cite time. Nothing here is inferred from text similarity,
 * and there is no confidence score because nothing is being guessed.
 *
 * Sections with no recorded citations are simply absent — the tracer states that
 * as its contract rather than padding the list.
 */
export async function listCitedSections(
  orgId: number,
  opts: { documentId?: string | null; limit?: number } = {},
): Promise<CitedSection[]> {
  const args: unknown[] = [orgId, CRE_SOURCE_CITATION];
  let scope = '';
  if (opts.documentId) {
    args.push(opts.documentId);
    scope = ` AND doc.id = $${args.length}`;
  }
  args.push(Math.min(Math.max(opts.limit ?? 500, 1), 2000));

  const { rows } = await pool.query(
    `SELECT c.id, c.section_id, c.created_at, c.created_by, c.citation_text, c.payload_sha256,
            sec.code AS section_code, sec.title AS section_title,
            doc.id AS document_id, doc.title AS document_title,
            doc.module, doc.status AS document_status,
            src.id AS source_id, src.title, src.checksum, src.source_type,
            src.ingestion_status, src.extraction_status, src.updated_at AS source_updated_at,
            src.metadata->>'mimeType'      AS mime_type,
            src.provenance->>'fileUploadId' AS file_upload_id
       FROM authoring_citations c
       JOIN authoring_sections sec ON sec.id = c.section_id AND sec.tenant_id = c.tenant_id
       JOIN authoring_documents doc ON doc.id = sec.doc_id AND doc.tenant_id = c.tenant_id
       LEFT JOIN cre_evidence_sources src
              ON src.id::text = c.reference_id
             AND (src.organization_id IS NULL OR src.organization_id = $1)
             AND src.deleted_at IS NULL
      WHERE c.tenant_id = $1 AND c.source = $2${scope}
      ORDER BY doc.title ASC NULLS LAST, sec.code ASC NULLS LAST, c.created_at ASC
      LIMIT $${args.length}`,
    args,
  );

  const bySection = new Map<string, CitedSection>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const sectionId = String(r.section_id);
    let entry = bySection.get(sectionId);
    if (!entry) {
      entry = {
        sectionId,
        sectionCode: (r.section_code as string) ?? null,
        sectionTitle: (r.section_title as string) ?? null,
        documentId: String(r.document_id),
        documentTitle: (r.document_title as string) ?? null,
        module: (r.module as string) ?? null,
        documentStatus: (r.document_status as string) ?? null,
        sources: [],
      };
      bySection.set(sectionId, entry);
    }
    entry.sources.push(adaptUsageRow(r));
  }
  return [...bySection.values()];
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
      r.source_is_current == null ? null : Boolean(r.source_is_current),
    ),
    source: adaptUsageSource(r),
  };
}
