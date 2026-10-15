/**
 * The two ends of a citation, read for citeSource: the section it is written
 * in, and the Data Room source it cites, each with its project (PF-11).
 *
 * A section cites only its own project's sources (founder decision
 * 2026-09-26: a cross-project reference is refused by default). Both ends were
 * checked by organization alone, so a project A section could cite project
 * B's source, and the citation reached neither project's source-change list.
 * A source with no project (organization-wide or global) and a document with
 * none are not judged.
 */
import { visibleOrgClause } from './evidence-spine.service';
import type { Queryable } from './span-lineage.service';

export interface CitationEnds {
  /** The section, with its document's project; null when not in this organization. */
  section: { id: string; programId: string | null } | null;
  /** The source the caller can see, with its project; null when not visible. */
  source: { id: number; checksum: string | null; programId: string | null } | null;
}

export async function readCitationEnds(
  executor: Queryable,
  orgId: number,
  sectionId: string,
  sourceId: number,
): Promise<CitationEnds> {
  const section = await executor.query<{ id: string; program_id: string | null }>(
    `SELECT s.id, d.client_program_id AS program_id
       FROM authoring_sections s
       LEFT JOIN authoring_documents d ON d.id = s.doc_id AND d.tenant_id = s.tenant_id
      WHERE s.id = $1 AND s.tenant_id = $2 LIMIT 1`,
    [sectionId, orgId],
  );
  const c = visibleOrgClause(orgId, 2);
  const source = await executor.query<{ id: number; checksum: string | null; program_id: string | null }>(
    `SELECT id, checksum, client_program_id AS program_id FROM cre_evidence_sources
      WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL LIMIT 1`,
    [sourceId, c.param],
  );
  const s = section.rows[0];
  const src = source.rows[0];
  return {
    section: s ? { id: String(s.id), programId: s.program_id ?? null } : null,
    source: src ? { id: Number(src.id), checksum: src.checksum ?? null, programId: src.program_id ?? null } : null,
  };
}

/** True only when both ends record a project and they differ. */
export function citesAcrossProjects(ends: CitationEnds): boolean {
  const a = ends.section?.programId;
  const b = ends.source?.programId;
  return Boolean(a && b && a.toLowerCase() !== b.toLowerCase());
}
