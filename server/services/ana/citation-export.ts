/**
 * Citation export + project-level gap inventory.
 *
 * Two compliance-shaped surfaces over the persisted citations:
 *
 *   1. aggregateGapsByRule — bucket every citation with status='gap' and a
 *      classified rule into a per-rule report. Answers "where does rule X
 *      fire across the project?" so a reviewer can do "we need to add
 *      demographics to all 12 CSRs that match CSR-9.2-demographics".
 *
 *   2. formatCitationsCsv / formatCitationsJsonExport — flatten the
 *      per-artifact citations[] into a downloadable shape suitable for an
 *      audit / compliance package. CSV is one row per sentence with the
 *      primary source; JSON is the raw structured array.
 *
 * Both helpers are pure — they take the data shape produced by the
 * citation engine's read side and return aggregated / formatted output.
 * Live entries that pull from the DB live alongside.
 *
 * @module server/services/ana/citation-export
 */
import { getPool } from '../../db/runtime.js';
import {
  getCitationsForArtifact,
  type PersistedCitations,
  type SentenceCitation,
  type CitationStatus,
} from './citation-engine.js';
import {
  classifyGap,
  type GapSeverity,
} from './gap-classifier.js';

// ─── Per-rule project gap inventory ──────────────────────────────────

export interface GapRuleAffectedSentence {
  artifactId: string;
  ctdSection: string | null;
  title: string;
  sentenceIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
  contentHash: string;
  readinessDelta: number;
}

export interface GapRuleReport {
  ruleId: string;
  severity: GapSeverity;
  blockingFiling: boolean;
  message: string;
  guidance: string;
  artifactCount: number;
  sentenceCount: number;
  totalReadinessDelta: number;
  affected: GapRuleAffectedSentence[];
}

export interface ProjectGapsByRule {
  projectId: number;
  organizationId: number;
  asOf: string;
  artifactCount: number;
  artifactCountWithGaps: number;
  /** Aggregated severity counters for every gap (classified or not). */
  severityCounts: Record<GapSeverity | 'unclassified', number>;
  /** Total readiness delta across every gap in the project. */
  totalReadinessDelta: number;
  /** Set when at least one gap blocks filing somewhere in the project. */
  filingBlocked: boolean;
  /** Per-rule breakdown sorted critical → info, then by sentenceCount desc. */
  rules: GapRuleReport[];
  /**
   * Gaps that didn't match any rule (sectionCode + claim text didn't hit
   * the registry). Listed separately so reviewers can decide whether the
   * registry needs a new rule or whether the artifact's section is wrong.
   */
  unclassified: GapRuleAffectedSentence[];
}

interface ArtifactWithCitations extends PersistedCitations {
  /** Project-relative metadata pulled alongside for the report. */
  title: string;
}

const SEVERITY_ORDER: Record<GapSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

/**
 * Pure helper: aggregate gaps across artifacts by rule. Caller passes a
 * pre-fetched list of artifact citation snapshots; we don't touch the DB.
 *
 * Each citation with status='gap' is bucketed:
 *   - if `gap.rule` is set, into the matching rule bucket
 *   - if no rule matched, the engine left `gap=null`. Try classifyGap
 *     once more here against the artifact's ctd_section in case the
 *     persisted snapshot pre-dates a rule-registry change; otherwise
 *     surface as `unclassified`.
 */
export function aggregateGapsByRule(
  artifacts: ArtifactWithCitations[],
  options: { projectId: number; organizationId: number; now?: Date } = {
    projectId: 0,
    organizationId: 0,
  }
): ProjectGapsByRule {
  const now = options.now ?? new Date();
  const ruleMap = new Map<string, GapRuleReport>();
  const unclassified: GapRuleAffectedSentence[] = [];
  const severityCounts: Record<GapSeverity | 'unclassified', number> = {
    critical: 0,
    major: 0,
    minor: 0,
    info: 0,
    unclassified: 0,
  };
  let totalReadinessDelta = 0;
  let filingBlocked = false;
  let artifactCountWithGaps = 0;

  for (const a of artifacts) {
    let artifactHasGap = false;
    for (const c of a.citations) {
      if (c.status !== 'gap') continue;
      artifactHasGap = true;

      // Re-resolve the gap classification on read so a registry change
      // (e.g. a rule added after the run) is reflected in the report.
      // We trust the persisted gap when one was recorded — the registry
      // resolution at run time produced authoritative severity.
      const gap = c.gap ?? classifyGap(a.ctdSection, c.text);
      const sentenceRow: GapRuleAffectedSentence = {
        artifactId: a.artifactId,
        ctdSection: a.ctdSection,
        title: a.title,
        sentenceIndex: c.sentenceIndex,
        paragraphIndex: c.paragraphIndex,
        charStart: c.charStart,
        charEnd: c.charEnd,
        text: c.text,
        contentHash: c.contentHash,
        readinessDelta: gap?.readinessDelta ?? 0,
      };

      if (!gap) {
        unclassified.push(sentenceRow);
        severityCounts.unclassified += 1;
        continue;
      }

      severityCounts[gap.severity] += 1;
      totalReadinessDelta += gap.readinessDelta;
      if (gap.blockingFiling) filingBlocked = true;

      let bucket = ruleMap.get(gap.rule);
      if (!bucket) {
        bucket = {
          ruleId: gap.rule,
          severity: gap.severity,
          blockingFiling: gap.blockingFiling,
          message: gap.message,
          guidance: gap.guidance,
          artifactCount: 0,
          sentenceCount: 0,
          totalReadinessDelta: 0,
          affected: [],
        };
        ruleMap.set(gap.rule, bucket);
      }
      bucket.affected.push(sentenceRow);
      bucket.sentenceCount += 1;
      bucket.totalReadinessDelta += gap.readinessDelta;
    }
    if (artifactHasGap) artifactCountWithGaps += 1;
  }

  // Compute per-rule artifactCount as distinct artifacts.
  for (const bucket of ruleMap.values()) {
    bucket.artifactCount = new Set(bucket.affected.map(s => s.artifactId)).size;
  }

  const rules = Array.from(ruleMap.values()).sort((a, b) => {
    if (a.severity !== b.severity) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    }
    if (a.sentenceCount !== b.sentenceCount) {
      return b.sentenceCount - a.sentenceCount;
    }
    return a.ruleId.localeCompare(b.ruleId);
  });

  return {
    projectId: options.projectId,
    organizationId: options.organizationId,
    asOf: now.toISOString(),
    artifactCount: artifacts.length,
    artifactCountWithGaps,
    severityCounts,
    totalReadinessDelta,
    filingBlocked,
    rules,
    unclassified,
  };
}

/**
 * Live entry: pull every artifact's citations + title for the project,
 * then aggregate. One SQL round-trip; aggregation is in-process.
 */
export async function getProjectGapsByRule(
  projectId: number,
  organizationId: number
): Promise<ProjectGapsByRule> {
  const { rows } = await getPool().query(
    `SELECT a.artifact_id, a.ctd_section, a.title, a.citations,
            a.citation_run_id, a.citations_at, a.content_hash AS current_content_hash,
            r.artifact_content_hash AS ran_against_content_hash
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.project_id = $1
        AND a.organization_id = $2`,
    [projectId, organizationId]
  );
  const artifacts: ArtifactWithCitations[] = rows.map((r: any) => ({
    artifactId: r.artifact_id,
    ctdSection: r.ctd_section,
    title: r.title,
    citationRunId: r.citation_run_id ?? null,
    citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
    citations: Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [],
    stats: null,
    isStale:
      r.ran_against_content_hash && r.current_content_hash
        ? r.ran_against_content_hash !== r.current_content_hash
        : null,
    ranAgainstContentHash: r.ran_against_content_hash ?? null,
    currentContentHash: r.current_content_hash ?? null,
  }));
  return aggregateGapsByRule(artifacts, { projectId, organizationId });
}

// ─── Export — flatten citations to CSV / JSON ───────────────────────

export interface CitationExportRow {
  artifactId: string;
  ctdSection: string | null;
  sentenceIndex: number;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  status: CitationStatus;
  text: string;
  contentHash: string;
  primarySourceArtifactId: string | null;
  primarySourceSection: string | null;
  primarySourcePageRef: string | null;
  primarySourceRelationship: string | null;
  primarySourceRelevance: number | null;
  sourceCount: number;
  contradictedSourceCount: number;
  gapSeverity: GapSeverity | null;
  gapRule: string | null;
  gapBlockingFiling: boolean | null;
  gapReadinessDelta: number | null;
  gapMessage: string | null;
  flagsCount: number;
}

const CSV_HEADERS: Array<keyof CitationExportRow> = [
  'artifactId',
  'ctdSection',
  'sentenceIndex',
  'paragraphIndex',
  'charStart',
  'charEnd',
  'status',
  'text',
  'contentHash',
  'primarySourceArtifactId',
  'primarySourceSection',
  'primarySourcePageRef',
  'primarySourceRelationship',
  'primarySourceRelevance',
  'sourceCount',
  'contradictedSourceCount',
  'gapSeverity',
  'gapRule',
  'gapBlockingFiling',
  'gapReadinessDelta',
  'gapMessage',
  'flagsCount',
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  // RFC 4180: wrap in quotes when value contains comma / quote / newline.
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Pure: flatten one artifact's citations into export rows. The
 * "primary source" is the highest-relevance support if any, otherwise
 * the first contradicts, otherwise none.
 */
export function flattenArtifactCitationsForExport(
  artifactId: string,
  ctdSection: string | null,
  citations: SentenceCitation[]
): CitationExportRow[] {
  return citations.map(c => {
    const supports = c.sources.filter(s => s.relationship === 'supports');
    const contradicts = c.sources.filter(s => s.relationship === 'contradicts');
    const primary =
      supports.sort((a, b) => b.relevanceScore - a.relevanceScore)[0] ??
      contradicts[0] ??
      null;
    return {
      artifactId,
      ctdSection,
      sentenceIndex: c.sentenceIndex,
      paragraphIndex: c.paragraphIndex,
      charStart: c.charStart,
      charEnd: c.charEnd,
      status: c.status,
      text: c.text,
      contentHash: c.contentHash,
      primarySourceArtifactId: primary?.artifactId ?? null,
      primarySourceSection: primary?.sectionCode ?? null,
      primarySourcePageRef: primary?.pageRef ?? null,
      primarySourceRelationship: primary?.relationship ?? null,
      primarySourceRelevance: primary?.relevanceScore ?? null,
      sourceCount: c.sources.length,
      contradictedSourceCount: contradicts.length,
      gapSeverity: c.gap?.severity ?? null,
      gapRule: c.gap?.rule ?? null,
      gapBlockingFiling: c.gap?.blockingFiling ?? null,
      gapReadinessDelta: c.gap?.readinessDelta ?? null,
      gapMessage: c.gap?.message ?? null,
      flagsCount: c.flags.length,
    };
  });
}

/** Pure: render flattened rows as CSV. Header row first. */
export function formatCitationsCsv(rows: CitationExportRow[]): string {
  const header = CSV_HEADERS.join(',');
  const body = rows
    .map(row => CSV_HEADERS.map(h => csvEscape(row[h])).join(','))
    .join('\n');
  return body ? `${header}\n${body}` : header;
}

/** Pure: render flattened rows as a JSON envelope. */
export function formatCitationsJsonExport(rows: CitationExportRow[]): {
  rows: CitationExportRow[];
  rowCount: number;
} {
  return { rows, rowCount: rows.length };
}

/** Live: export citations for one artifact. Returns null if missing. */
export async function exportArtifactCitations(
  artifactId: string,
  organizationId: number
): Promise<CitationExportRow[] | null> {
  const persisted = await getCitationsForArtifact(artifactId, organizationId);
  if (!persisted) return null;
  return flattenArtifactCitationsForExport(
    persisted.artifactId,
    persisted.ctdSection,
    persisted.citations
  );
}

/** Live: export citations for an entire project, one row per sentence. */
export async function exportProjectCitations(
  projectId: number,
  organizationId: number
): Promise<CitationExportRow[]> {
  const { rows } = await getPool().query(
    `SELECT artifact_id, ctd_section, citations
       FROM concept2cure_artifacts
      WHERE project_id = $1
        AND organization_id = $2
      ORDER BY ctd_section NULLS LAST, updated_at DESC`,
    [projectId, organizationId]
  );
  const out: CitationExportRow[] = [];
  for (const r of rows) {
    const citations = Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [];
    out.push(
      ...flattenArtifactCitationsForExport(r.artifact_id, r.ctd_section, citations)
    );
  }
  return out;
}
