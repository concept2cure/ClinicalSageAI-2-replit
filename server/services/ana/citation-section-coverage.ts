/**
 * Project section coverage.
 *
 * "Is this dossier even well-formed?" — walks the IND section registry
 * against the project's artifacts and returns a per-section coverage
 * report. Complements:
 *   - the gap classifier (gaps WITHIN existing artifacts)
 *   - the citation engine (per-sentence support / contradicted / gap)
 * by answering the orthogonal question: which CTD sections have no
 * artifact at all?
 *
 * Coverage states per section (one row per IND_SECTION entry, plus
 * 'extra' rows for artifacts at sections not in the registry):
 *   - covered:   ≥1 artifact at this section AND its citations show
 *                ≥1 supported sentence (well-grounded draft)
 *   - drafted:   ≥1 artifact at this section but no supported
 *                citations (uncited draft)
 *   - missing:   no artifact at this section
 *   - extra:     artifact present at a CTD section not in the registry
 *                (informational; no required state)
 *
 * Roll-up:
 *   - requiredSections:    count of registry sections marked required
 *   - requiredCovered:     covered + drafted satisfy "started"
 *   - requiredCompleted:   covered only
 *   - requiredMissing:     missing required
 *   - completionPercent:   (covered required / required) * 100
 *   - filingBlocking:      requiredMissing > 0 OR any artifact has
 *                          gap.blockingFiling
 *
 * Pure helper deriveProjectSectionCoverage(): testable without DB.
 * Live entry getProjectSectionCoverage(): pulls the project's artifacts
 * + their citations + the registry rows for the submission type.
 *
 * @module server/services/ana/citation-section-coverage
 */
import { getPool } from '../../db/runtime.js';
import {
  IND_SECTIONS,
  getSectionsForSubmissionType,
  type INDSection,
} from '../ind/ind-section-registry.js';
import type {
  SentenceCitation,
  CitationRunStats,
} from './citation-engine.js';

export type CoverageState = 'covered' | 'drafted' | 'missing' | 'extra';

export type SubmissionTypeFilter = 'IND' | 'NDA' | 'BLA' | 'ALL';

export interface SectionCoverageRow {
  ctdSection: string;
  state: CoverageState;
  /** Section title from the registry (null for 'extra' rows). */
  title: string | null;
  /** Module 1..5 from the registry (null for 'extra' rows). */
  module: 1 | 2 | 3 | 4 | 5 | null;
  /** Required per the registry (null for 'extra' rows). */
  required: boolean | null;
  /** ICH/FDA guidance reference (null for 'extra' rows). */
  guidance: string | null;
  /** Artifact summaries at this section. Multiple = multiple drafts. */
  artifacts: Array<{
    artifactId: string;
    artifactPk: number;
    title: string;
    status: string;
    version: number;
    citationsAt: string | null;
    citationStats: CitationRunStats | null;
    /** True if any citation in this artifact is filing-blocked. */
    artifactFilingBlocked: boolean;
  }>;
}

export interface ProjectSectionCoverage {
  projectId: number;
  organizationId: number;
  submissionType: SubmissionTypeFilter;
  asOf: string;
  rollup: {
    registrySections: number;
    requiredSections: number;
    artifactsConsidered: number;
    coveredCount: number;
    draftedCount: number;
    missingCount: number;
    extraCount: number;
    requiredCovered: number;       // covered + drafted (started)
    requiredCompleted: number;     // covered only
    requiredMissing: number;
    completionPercent: number;
    filingBlocking: boolean;
  };
  sections: SectionCoverageRow[];
}

/**
 * Internal alias for citation-engine's exported CitationRunStats. We
 * re-export here so our SectionCoverageRow shape doesn't force a wide
 * import surface on consumers.
 */
type CitationStatsAlias = CitationRunStats;

interface ArtifactBundle {
  artifactId: string;
  artifactPk: number;
  ctdSection: string | null;
  title: string;
  status: string;
  version: number;
  citationsAt: string | null;
  citationStats: CitationStatsAlias | null;
  /** Subset of citations[].gap.blockingFiling — true iff any sentence blocks. */
  artifactFilingBlocked: boolean;
}

const MODULE_VALUES: Array<INDSection['module']> = [1, 2, 3, 4, 5];

function pickRegistrySections(
  submissionType: SubmissionTypeFilter
): INDSection[] {
  if (submissionType === 'ALL') return [...IND_SECTIONS];
  return getSectionsForSubmissionType(submissionType);
}

/**
 * Pure: derive a project's section coverage from a registry slice +
 * artifact bundles. Caller gathers the inputs (registry + DB pull).
 */
export function deriveProjectSectionCoverage(
  registry: INDSection[],
  artifacts: ArtifactBundle[],
  options: {
    projectId: number;
    organizationId: number;
    submissionType: SubmissionTypeFilter;
    now?: Date;
  }
): ProjectSectionCoverage {
  const now = options.now ?? new Date();
  const registryByCode = new Map<string, INDSection>();
  for (const s of registry) registryByCode.set(s.code, s);

  // Group artifacts by ctd_section. Untagged artifacts (no ctd_section)
  // become 'extra' rows under the synthetic '(unsectioned)' bucket so
  // they're surfaced; not counted against required sections.
  const artifactsBySection = new Map<string, ArtifactBundle[]>();
  for (const a of artifacts) {
    const key = a.ctdSection ?? '(unsectioned)';
    let bucket = artifactsBySection.get(key);
    if (!bucket) {
      bucket = [];
      artifactsBySection.set(key, bucket);
    }
    bucket.push(a);
  }

  const sections: SectionCoverageRow[] = [];
  let coveredCount = 0;
  let draftedCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  let requiredCovered = 0;
  let requiredCompleted = 0;
  let requiredMissing = 0;
  let filingBlocking = false;

  for (const reg of registry) {
    const matched = artifactsBySection.get(reg.code) ?? [];
    let state: CoverageState;
    if (matched.length === 0) {
      state = 'missing';
      missingCount += 1;
      if (reg.required) requiredMissing += 1;
    } else {
      // covered iff at least one matched artifact has supportedCount > 0.
      const anySupported = matched.some(
        a => (a.citationStats?.supportedCount ?? 0) > 0
      );
      state = anySupported ? 'covered' : 'drafted';
      if (state === 'covered') {
        coveredCount += 1;
        if (reg.required) {
          requiredCovered += 1;
          requiredCompleted += 1;
        }
      } else {
        draftedCount += 1;
        if (reg.required) requiredCovered += 1;
      }
      // Bubble up any artifact-level filing-blocked flag.
      if (matched.some(a => a.artifactFilingBlocked)) filingBlocking = true;
    }

    sections.push({
      ctdSection: reg.code,
      state,
      title: reg.title,
      module: reg.module,
      required: reg.required,
      guidance: reg.guidance,
      artifacts: matched.map(a => ({
        artifactId: a.artifactId,
        artifactPk: a.artifactPk,
        title: a.title,
        status: a.status,
        version: a.version,
        citationsAt: a.citationsAt,
        citationStats: a.citationStats,
        artifactFilingBlocked: a.artifactFilingBlocked,
      })),
    });
  }

  // 'extra' rows: artifacts whose ctd_section isn't in the registry slice.
  for (const [section, bundles] of artifactsBySection) {
    if (registryByCode.has(section)) continue;
    extraCount += bundles.length;
    sections.push({
      ctdSection: section,
      state: 'extra',
      title: null,
      module: null,
      required: null,
      guidance: null,
      artifacts: bundles.map(a => ({
        artifactId: a.artifactId,
        artifactPk: a.artifactPk,
        title: a.title,
        status: a.status,
        version: a.version,
        citationsAt: a.citationsAt,
        citationStats: a.citationStats,
        artifactFilingBlocked: a.artifactFilingBlocked,
      })),
    });
    if (bundles.some(a => a.artifactFilingBlocked)) filingBlocking = true;
  }

  const requiredSections = registry.filter(r => r.required).length;
  const completionPercent =
    requiredSections === 0
      ? 100
      : Math.round((requiredCompleted / requiredSections) * 100);

  if (requiredMissing > 0) filingBlocking = true;

  // Sort: registry order first (Module 1 → 5, then ctdSection ascending),
  // then 'extra' rows alphabetical at the end.
  sections.sort((a, b) => {
    if (a.state === 'extra' && b.state !== 'extra') return 1;
    if (b.state === 'extra' && a.state !== 'extra') return -1;
    if (a.state === 'extra' && b.state === 'extra') {
      return a.ctdSection.localeCompare(b.ctdSection);
    }
    const aMod = a.module ?? 99;
    const bMod = b.module ?? 99;
    if (aMod !== bMod) return aMod - bMod;
    return a.ctdSection.localeCompare(b.ctdSection);
  });

  return {
    projectId: options.projectId,
    organizationId: options.organizationId,
    submissionType: options.submissionType,
    asOf: now.toISOString(),
    rollup: {
      registrySections: registry.length,
      requiredSections,
      artifactsConsidered: artifacts.length,
      coveredCount,
      draftedCount,
      missingCount,
      extraCount,
      requiredCovered,
      requiredCompleted,
      requiredMissing,
      completionPercent,
      filingBlocking,
    },
    sections,
  };
}

/**
 * Live entry: pull artifacts + citation rollup for a project, then
 * derive coverage. Tenant-scoped via organization_id.
 */
export async function getProjectSectionCoverage(
  projectId: number,
  organizationId: number,
  submissionType: SubmissionTypeFilter = 'IND'
): Promise<ProjectSectionCoverage> {
  const registry = pickRegistrySections(submissionType);
  const { rows } = await getPool().query(
    `SELECT a.id            AS artifact_pk,
            a.artifact_id,
            a.ctd_section,
            a.title,
            a.status,
            a.version,
            a.citations_at,
            a.citations,
            r.total_sentences,
            r.supported_count,
            r.contradicted_count,
            r.gap_count,
            r.total_readiness_delta,
            r.filing_blocked
       FROM concept2cure_artifacts a
       LEFT JOIN ana_artifact_citation_runs r ON r.id = a.citation_run_id
      WHERE a.project_id = $1
        AND a.organization_id = $2`,
    [projectId, organizationId]
  );
  const artifacts: ArtifactBundle[] = rows.map((r: any) => {
    const citationStats: CitationStatsAlias | null =
      r.total_sentences === null || r.total_sentences === undefined
        ? null
        : {
            totalSentences: Number(r.total_sentences) || 0,
            supportedCount: Number(r.supported_count) || 0,
            contradictedCount: Number(r.contradicted_count) || 0,
            gapCount: Number(r.gap_count) || 0,
            totalReadinessDelta: Number(r.total_readiness_delta) || 0,
            filingBlocked: !!r.filing_blocked,
          };
    return {
      artifactId: r.artifact_id,
      artifactPk: r.artifact_pk,
      ctdSection: r.ctd_section,
      title: r.title,
      status: r.status,
      version: r.version,
      citationsAt: r.citations_at ? new Date(r.citations_at).toISOString() : null,
      citationStats,
      artifactFilingBlocked: !!(citationStats?.filingBlocked),
    };
  });
  return deriveProjectSectionCoverage(registry, artifacts, {
    projectId,
    organizationId,
    submissionType,
  });
}
