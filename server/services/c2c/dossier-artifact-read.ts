/**
 * The existing dossier artifact rollup, carried by the project's core dossier.
 * These are recorded ARTIFACT stages,
 * not c2c_document_sections readiness or a filing-completion percentage.
 * The caller supplies its already-admitted exact integer project anchor.
 */
import { compareSectionCode } from '../../../shared/regulatory/section-code.js';
import { artifactSectionStateOf, artifactReadinessSummaryOf,
  type ArtifactReadiness, type ArtifactSectionReadiness } from '../../../shared/types/dossier-artifact-readiness.js';

interface Queryable { query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }

const UNAVAILABLE_REASON = 'The governed artifact store is not provisioned in this environment.';

/** Keep the latest recorded date; a malformed date is a failed source read. */
function latestArtifactUpdate(previous: string | null, value: unknown): string | null {
  if (value == null) return previous;
  const date = new Date(value as string | Date);
  if (!Number.isFinite(date.getTime())) throw new Error('The recorded artifact update time could not be read.');
  const updated = date.toISOString();
  return previous === null || updated > previous ? updated : previous;
}

/** Accumulate one SQL status bucket, preserving unsupported stages as unknown. */
function addArtifactBucket(bySection: Map<string, ArtifactSectionReadiness>, row: Record<string, unknown>): void {
  if (typeof row.ctd_section !== 'string' || !row.ctd_section || !Number.isSafeInteger(row.count) || Number(row.count) <= 0) {
    throw new Error('The recorded artifact-stage counts could not be read.');
  }
  const n = Number(row.count);
  const section: ArtifactSectionReadiness = bySection.get(row.ctd_section) ?? {
    ctdSection: row.ctd_section, artifactCount: 0,
    draftCount: 0, reviewCount: 0, approvedCount: 0, lockedCount: 0, unknownCount: 0,
    status: 'not_assessed', lastUpdated: null,
  };
  section.artifactCount += n;
  // A switch cannot mistake object prototype names for supported stages.
  switch (row.status) {
    case 'draft': section.draftCount += n; break;
    case 'review': section.reviewCount += n; break;
    case 'approved': section.approvedCount += n; break;
    case 'locked': section.lockedCount += n; break;
    default: section.unknownCount += n;
  }
  section.lastUpdated = latestArtifactUpdate(section.lastUpdated, row.last_updated);
  bySection.set(row.ctd_section, section);
}

/** No anchor lookup or fallback belongs here: admission owns that decision. */
export async function readDossierArtifactReadiness(
  db: Queryable,
  orgId: number,
  projectId: number | null,
  admitted?: { programId: string; clientWorkspaceId: number | null },
): Promise<ArtifactReadiness> {
  if (!Number.isSafeInteger(orgId) || orgId <= 0) throw new Error('A verified organization is required for artifact status.');
  if (projectId === null || !Number.isSafeInteger(projectId) || projectId <= 0 || !admitted) {
    return { basis: 'governed_artifacts', state: 'unanchored', sections: null, summary: null,
      reason: 'This project has no verified tracking record, so its artifact status cannot be read.' };
  }

  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await db.query(
      `SELECT a.ctd_section, a.status, COUNT(*)::int AS count, MAX(a.updated_at) AS last_updated
         FROM concept2cure_artifacts a JOIN projects p ON p.id=a.project_id
        WHERE a.project_id=$1 AND a.organization_id=$2 AND p.organization_id=$2
          AND p.regulatory_program_id=$3 AND p.client_workspace_id IS NOT DISTINCT FROM $4
          AND p.status IS DISTINCT FROM 'archived' AND p.status IS DISTINCT FROM 'deleted'
          AND a.ctd_section IS NOT NULL AND a.ctd_section <> ''
        GROUP BY a.ctd_section,a.status`,
      [projectId, orgId, admitted.programId, admitted.clientWorkspaceId],
    ));
  } catch (error) {
    if (['42P01', '42703'].includes(String((error as { code?: string })?.code))) {
      return { basis: 'governed_artifacts', state: 'unavailable', code: 'STORE_UNAVAILABLE', reason: UNAVAILABLE_REASON, sections: null, summary: null };
    }
    return { basis: 'governed_artifacts', state: 'unavailable', code: 'READ_FAILED',
      reason: 'Artifact status could not be read.', sections: null, summary: null };
  }

  const bySection = new Map<string, ArtifactSectionReadiness>();
  try { for (const row of rows) addArtifactBucket(bySection, row); }
  catch {
    return { basis: 'governed_artifacts', state: 'unavailable', code: 'READ_FAILED',
      reason: 'Artifact status could not be read.', sections: null, summary: null };
  }

  const sections = [...bySection.values()].sort((a, b) => compareSectionCode(a.ctdSection, b.ctdSection));
  for (const section of sections) section.status = artifactSectionStateOf(section);
  return {
    basis: 'governed_artifacts', state: sections.length ? 'measured' : 'no_artifacts', sections,
    summary: artifactReadinessSummaryOf(sections),
  };
}
