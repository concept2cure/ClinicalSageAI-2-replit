/**
 * Citation → readiness bridge.
 *
 * Translates the citation engine's output (per-artifact gap counts +
 * readinessDelta) into a readiness-shaped impact a scoring engine can fold
 * into its overall score, without coupling either side to the other.
 *
 * The contract is deliberately small:
 *   - citationCoverage: 0–100. Fraction of meaningful sentences in the
 *     project's artifacts that have at least one supporting citation.
 *     A natural completeness signal — high coverage = the dossier is
 *     well-grounded.
 *   - citationGapPenalty: 0–100. Sum of |readinessDelta| across all gap
 *     citations, clamped to 100. The bigger this is, the more the
 *     dossier needs to address.
 *   - filingBlocked: whether any artifact has a critical gap that blocks
 *     filing per ICH M4 / 21 CFR rules in gap-classifier.
 *   - artifactImpacts: per-artifact breakdown so the consumer can show
 *     "this section pulls 18 points off your readiness score".
 *
 * The bridge is read-only. It pulls from concept2cure_artifacts +
 * ana_artifact_citation_runs via the citation-engine's project rollup
 * helper — no separate SQL path, single source of truth.
 *
 * Stale handling: an artifact whose citations are stale (content_hash
 * changed since the last run) contributes an "uncertain" status and
 * its readinessDelta is included with a configurable confidence factor
 * (default: full impact, since the gap was real at last run, even if
 * the current draft might have addressed it).
 *
 * @module server/services/ana/citation-readiness-bridge
 */
import {
  getProjectCitationsRollup,
  type ProjectArtifactCitationStatus,
} from './citation-engine.js';

const STALE_CONFIDENCE_FACTOR = parseFloat(
  process.env.ANA_CITATION_READINESS_STALE_FACTOR ?? '1.0'
);

export interface CitationReadinessImpact {
  projectId: number;
  organizationId: number;
  asOf: string;

  /** 0–100. Fraction of meaningful sentences with supporting citations. */
  citationCoverage: number;

  /**
   * 0–100. Sum of |readinessDelta| across gaps, clamped — converts the
   * raw negative deltas (which scale with project size) into a
   * dashboardable "this many points are at risk".
   */
  citationGapPenalty: number;

  /** Raw negative number from the citation engine (no clamp / sign flip). */
  rawReadinessDelta: number;

  /** Critical gap blocks filing on at least one artifact. */
  filingBlocked: boolean;

  /** How many artifacts contributed stale data. */
  staleArtifactCount: number;

  /** Total artifacts that have been cited. */
  citedArtifactCount: number;

  /** Total artifacts in the project (cited + uncited). */
  totalArtifactCount: number;

  /**
   * Suggestion for the readiness engine: subtract this from the
   * `compliance` dimension (0–100). Reflects citation-grounded gaps,
   * which are the primary compliance signal a dossier carries.
   */
  complianceDelta: number;

  /**
   * Suggestion for the readiness engine: subtract this from the
   * `completeness` dimension. Tracks coverage of the dossier (lots of
   * uncited sentences = incomplete in the audit sense).
   */
  completenessDelta: number;

  artifactImpacts: Array<{
    artifactId: string;
    ctdSection: string | null;
    title: string;
    isStale: boolean | null;
    gapCount: number;
    readinessDelta: number;
    filingBlocked: boolean;
  }>;
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/**
 * Pure helper: compute a CitationReadinessImpact from a list of artifact
 * statuses. Extracted so it's unit-testable without touching the database.
 */
export function deriveCitationReadinessImpact(
  projectId: number,
  organizationId: number,
  artifacts: ProjectArtifactCitationStatus[],
  options: { now?: Date } = {}
): CitationReadinessImpact {
  const now = options.now ?? new Date();
  let totalSentences = 0;
  let supportedSentences = 0;
  let rawReadinessDelta = 0;
  let filingBlocked = false;
  let staleArtifactCount = 0;
  let citedArtifactCount = 0;

  const artifactImpacts: CitationReadinessImpact['artifactImpacts'] = [];

  for (const a of artifacts) {
    if (a.hasCitations) citedArtifactCount += 1;
    if (a.isStale === true) staleArtifactCount += 1;

    const isStaleish = a.isStale === true;
    const factor = isStaleish ? STALE_CONFIDENCE_FACTOR : 1;

    const sentences = a.totalSentences ?? 0;
    const supported = a.supportedCount ?? 0;
    totalSentences += sentences;
    supportedSentences += supported;

    const delta = a.totalReadinessDelta ?? 0;
    rawReadinessDelta += delta * factor;

    if (a.filingBlocked) filingBlocked = true;

    if (a.hasCitations) {
      artifactImpacts.push({
        artifactId: a.artifactId,
        ctdSection: a.ctdSection,
        title: a.title,
        isStale: a.isStale,
        gapCount: a.gapCount ?? 0,
        readinessDelta: delta,
        filingBlocked: !!a.filingBlocked,
      });
    }
  }

  // Coverage: supported / totalMeaningful. When no sentences yet, treat
  // as 0% — an uncited dossier scores lowest, not unknown.
  const citationCoverage =
    totalSentences === 0
      ? 0
      : clampPercent((supportedSentences / totalSentences) * 100);

  // Gap penalty: |rawDelta| clamped to 100. Big projects can rack up a
  // -200 raw delta; clamping keeps the dashboard number bounded.
  const citationGapPenalty = clampPercent(Math.abs(rawReadinessDelta));

  // Compliance + completeness deltas are suggestions for the readiness
  // engine; the engine is free to apply weighting.
  // - Compliance maps to gap penalty (the 21 CFR / ICH M4 missing
  //   element framing).
  // - Completeness maps to (100 - coverage) (uncited sentences are
  //   incompleteness in the audit sense).
  const complianceDelta = citationGapPenalty;
  const completenessDelta = clampPercent(100 - citationCoverage);

  // Sort artifact impacts so the worst (most negative readinessDelta or
  // filingBlocked) bubble to the top.
  artifactImpacts.sort((a, b) => {
    if (a.filingBlocked !== b.filingBlocked) return a.filingBlocked ? -1 : 1;
    return a.readinessDelta - b.readinessDelta;
  });

  return {
    projectId,
    organizationId,
    asOf: now.toISOString(),
    citationCoverage,
    citationGapPenalty,
    rawReadinessDelta: Math.round(rawReadinessDelta),
    filingBlocked,
    staleArtifactCount,
    citedArtifactCount,
    totalArtifactCount: artifacts.length,
    complianceDelta,
    completenessDelta,
    artifactImpacts,
  };
}

/**
 * Live entry point — pulls the project rollup, derives the impact.
 * Tenant-scoped via getProjectCitationsRollup.
 */
export async function getCitationReadinessImpact(
  projectId: number,
  organizationId: number
): Promise<CitationReadinessImpact> {
  const rollup = await getProjectCitationsRollup(projectId, organizationId);
  return deriveCitationReadinessImpact(
    rollup.projectId,
    rollup.organizationId,
    rollup.artifacts
  );
}
