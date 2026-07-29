/**
 * Citation search across a project.
 *
 * Filter the persisted sentence-citation array down to the rows a
 * reviewer actually wants to see — by status, gap rule, severity,
 * artifact, ctd-section prefix, and free-text query. Pulls the citations
 * JSONB column (one read per artifact in the project) and walks each
 * sentence in JS — no hot path through the column needs a fulltext
 * index, and the artifact set per project is bounded by the dossier
 * size (<<1000 typically).
 *
 * Pure helper `filterCitations()` is the testable core; live entry
 * `searchProjectCitations()` adds the SQL pull and tenant scope.
 *
 * @module server/services/ana/citation-search
 */
import { getPool } from '../../db/runtime.js';
import type {
  SentenceCitation,
  CitationStatus,
} from './citation-engine.js';
import type { GapSeverity } from './gap-classifier.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface CitationSearchFilters {
  /** Free-text query — case-insensitive substring match on sentence text. */
  query?: string;
  /** Restrict to citations with this status. */
  status?: CitationStatus;
  /** Match the gap classification's rule id (only meaningful with status='gap'). */
  rule?: string;
  /** Match the gap classification's severity. */
  severity?: GapSeverity;
  /** Restrict to one artifact. */
  artifactId?: string;
  /** Restrict to artifacts under a CTD-section prefix (e.g. "3.2.S"). */
  ctdSectionPrefix?: string;
  /** Restrict to citations whose primary (non-zero-source) source is in this artifact. */
  sourceArtifactId?: string;
}

export interface CitationSearchHit {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  sentenceIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
  status: CitationStatus;
  contentHash: string;
  sources: SentenceCitation['sources'];
  gap: SentenceCitation['gap'];
  flagsCount: number;
}

export interface CitationSearchInput {
  projectId: number;
  organizationId: number;
  filters: CitationSearchFilters;
  limit?: number;
  offset?: number;
}

export interface CitationSearchResult {
  projectId: number;
  organizationId: number;
  filters: CitationSearchFilters;
  total: number;
  limit: number;
  offset: number;
  hits: CitationSearchHit[];
}

export interface ArtifactCitationsBundle {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  citations: SentenceCitation[];
}

/**
 * Pure: filter a list of artifact citation bundles by the given criteria.
 * Returns hits in their natural order (artifact order, then sentence
 * order within an artifact). Caller paginates.
 *
 * Exported for unit tests and for callers that already have the data.
 */
export function filterCitations(
  bundles: ArtifactCitationsBundle[],
  filters: CitationSearchFilters
): CitationSearchHit[] {
  const queryLower = filters.query?.toLowerCase().trim() ?? '';
  const out: CitationSearchHit[] = [];

  for (const b of bundles) {
    if (filters.artifactId && b.artifactId !== filters.artifactId) continue;
    if (filters.ctdSectionPrefix) {
      const want = filters.ctdSectionPrefix;
      const have = b.ctdSection ?? '';
      if (have !== want && !have.startsWith(want + '.')) continue;
    }
    for (const c of b.citations) {
      if (filters.status && c.status !== filters.status) continue;
      if (filters.rule && c.gap?.rule !== filters.rule) continue;
      if (filters.severity && c.gap?.severity !== filters.severity) continue;
      if (queryLower && !c.text.toLowerCase().includes(queryLower)) continue;
      if (filters.sourceArtifactId) {
        const matches = c.sources.some(
          s => s.artifactId === filters.sourceArtifactId
        );
        if (!matches) continue;
      }
      out.push({
        artifactId: b.artifactId,
        ctdSection: b.ctdSection,
        title: b.title,
        sentenceIndex: c.sentenceIndex,
        paragraphIndex: c.paragraphIndex,
        charStart: c.charStart,
        charEnd: c.charEnd,
        text: c.text,
        status: c.status,
        contentHash: c.contentHash,
        sources: c.sources,
        gap: c.gap,
        flagsCount: c.flags.length,
      });
    }
  }
  return out;
}

/**
 * Live: pull the project's artifacts (with citations JSONB), filter, and
 * paginate. Tenant-scoped via organization_id.
 */
export async function searchProjectCitations(
  input: CitationSearchInput
): Promise<CitationSearchResult> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const offset = Math.max(0, input.offset ?? 0);

  // Pull just the artifacts that could match the artifact-level filters
  // (artifactId / ctdSectionPrefix). Sentence-level filters happen in JS.
  const where: string[] = [
    'project_id = $1',
    'organization_id = $2',
    `citations IS NOT NULL`,
  ];
  const params: any[] = [input.projectId, input.organizationId];
  if (input.filters.artifactId) {
    params.push(input.filters.artifactId);
    where.push(`artifact_id = $${params.length}`);
  }
  if (input.filters.ctdSectionPrefix) {
    const prefix = input.filters.ctdSectionPrefix;
    params.push(prefix, prefix + '.%');
    where.push(
      `(ctd_section = $${params.length - 1} OR ctd_section LIKE $${params.length})`
    );
  }

  const { rows } = await getPool().query(
    `SELECT artifact_id, ctd_section, title, citations
       FROM concept2cure_artifacts
      WHERE ${where.join(' AND ')}
      ORDER BY ctd_section NULLS LAST, updated_at DESC`,
    params
  );

  const bundles: ArtifactCitationsBundle[] = rows.map((r: any) => ({
    artifactId: r.artifact_id,
    ctdSection: r.ctd_section,
    title: r.title,
    citations: Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [],
  }));

  const allHits = filterCitations(bundles, input.filters);
  const paged = allHits.slice(offset, offset + limit);

  return {
    projectId: input.projectId,
    organizationId: input.organizationId,
    filters: input.filters,
    total: allHits.length,
    limit,
    offset,
    hits: paged,
  };
}
