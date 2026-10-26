/** The existing dossier-readiness artifact rollup, moved from its retired
 * HTTP route into the project dossier's request-scoped read. No bodies, AI or
 * writes. This basis never changes the governed-document readiness figure. */
import { compareSectionCode } from '../../../shared/regulatory/section-code';

interface Queryable { query(text: string, params?: unknown[]): Promise<{ rows: any[] }> }
export interface ArtifactReadinessSection {
  ctdSection: string;
  status: 'draft' | 'review' | 'approved' | 'locked' | 'unknown';
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  unknownCount: number;
  lastUpdated: string | null;
}
export interface ArtifactReadiness {
  state: 'read';
  sections: ArtifactReadinessSection[];
  summary: { totalSections: number; readySections: number; inProgressSections: number; draftSections: number; unknownSections: number };
}

export async function readArtifactReadiness(q: Queryable, input: {
  organizationId: number; projectId: number; programId: string; clientWorkspaceId: number | null;
}): Promise<ArtifactReadiness> {
  const { rows } = await q.query(`SELECT a.ctd_section, a.status, COUNT(*)::int AS count, MAX(a.updated_at) AS last_updated
    FROM concept2cure_artifacts a JOIN projects p ON p.id=a.project_id
    WHERE a.project_id=$1 AND a.organization_id=$2 AND p.organization_id=$2
      AND p.regulatory_program_id=$3 AND p.client_workspace_id IS NOT DISTINCT FROM $4
      AND p.status IS DISTINCT FROM 'archived' AND p.status IS DISTINCT FROM 'deleted'
      AND a.ctd_section IS NOT NULL AND a.ctd_section <> ''
    GROUP BY a.ctd_section,a.status`,
  [input.projectId, input.organizationId, input.programId, input.clientWorkspaceId]);
  const bySection = new Map<string, ArtifactReadinessSection>();
  for (const row of rows) {
    const key = String(row.ctd_section);
    const count = Number(row.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Artifact count could not be read');
    const entry = bySection.get(key) ?? { ctdSection: key, status: 'unknown', artifactCount: 0,
      draftCount: 0, reviewCount: 0, approvedCount: 0, lockedCount: 0, unknownCount: 0, lastUpdated: null };
    switch (row.status) {
      case 'draft': entry.draftCount += count; break;
      case 'review': entry.reviewCount += count; break;
      case 'approved': entry.approvedCount += count; break;
      case 'locked': entry.lockedCount += count; break;
      default: entry.unknownCount += count;
    }
    entry.artifactCount += count;
    const updated = row.last_updated == null ? null : new Date(row.last_updated).toISOString();
    if (updated && (!entry.lastUpdated || updated > entry.lastUpdated)) entry.lastUpdated = updated;
    bySection.set(key, entry);
  }
  const sections = [...bySection.values()].sort((a, b) => compareSectionCode(a.ctdSection, b.ctdSection));
  for (const section of sections) {
    // Weakest recorded artifact wins. An unknown state cannot establish ready.
    section.status = section.unknownCount ? 'unknown' : section.draftCount ? 'draft' : section.reviewCount ? 'review'
      : section.approvedCount ? 'approved' : section.lockedCount ? 'locked' : 'unknown';
  }
  return { state: 'read', sections, summary: {
    totalSections: sections.length,
    readySections: sections.filter(s => s.status === 'approved' || s.status === 'locked').length,
    inProgressSections: sections.filter(s => s.status === 'review').length,
    draftSections: sections.filter(s => s.status === 'draft').length,
    unknownSections: sections.filter(s => s.status === 'unknown').length,
  } };
}
