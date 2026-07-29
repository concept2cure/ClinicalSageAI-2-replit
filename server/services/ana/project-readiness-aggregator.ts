/**
 * Project readiness aggregator.
 *
 * Synthesizes every signal AnA produces about a project into a single
 * 0–100 readiness score + breakdown + ranked next-action list:
 *
 *   - Section coverage         (40% weight) — required-section completion
 *   - Citation quality         (30% weight) — supported / contradicted / gap mix
 *   - Consistency              (10% weight) — open cross-artifact contradictions
 *   - Guidance compliance      (10% weight) — open guidance change alerts
 *   - Therapeutic context      (10% weight) — small bonus for a profile being set
 *
 * Score is clamped 0..100. `filingBlocking` is OR-ed across:
 *   - section coverage filingBlocking (required missing OR artifact gap blocks)
 *   - any open critical guidance / consistency alert
 *
 * `nextActions` is a ranked, deduplicated list of remediation steps the
 * UI / chat handler can surface verbatim. Top action gets the largest
 * scoreImpact (the points that would be added back if this action were
 * resolved) — gives an "if you fix this, you gain N points" hook.
 *
 * Pure helper deriveProjectReadinessAggregate(): testable without DB.
 * Live entry getProjectReadinessAggregate(): pulls all five signals in
 * parallel, derives.
 *
 * @module server/services/ana/project-readiness-aggregator
 */
import { getProjectSectionCoverage } from './citation-section-coverage.js';
import { getCitationReadinessImpact } from './citation-readiness-bridge.js';
import { getConsistencyAlertsSummary } from '../intelligence/cross-artifact-consistency-scanner.js';
import { getGuidanceAlertsSummary } from '../intelligence/guidance-impact-scanner.js';
import { getProjectTherapeuticContext } from './therapeutic-area-context.js';

import type { ProjectSectionCoverage } from './citation-section-coverage.js';
import type { CitationReadinessImpact } from './citation-readiness-bridge.js';
import type { ConsistencyAlertsSummary } from '../intelligence/cross-artifact-consistency-scanner.js';
import type { GuidanceAlertsSummary } from '../intelligence/guidance-impact-scanner.js';
import type { ProjectTherapeuticContextResult } from './therapeutic-area-context.js';

export interface ReadinessComponentScore {
  /** 0..1 — how much this component contributes to the final score. */
  weight: number;
  /** 0..100 — this component's local score. */
  score: number;
  /** weighted = score * weight. */
  weighted: number;
  /** Breadcrumb for the dashboard. */
  detail: string;
}

export interface ReadinessNextAction {
  /** Stable id keyed by source — useful for the UI to dismiss / ack. */
  id: string;
  category:
    | 'section_coverage'
    | 'citation_quality'
    | 'consistency'
    | 'guidance'
    | 'therapeutic_area';
  severity: 'critical' | 'major' | 'minor' | 'info';
  /** Short, imperative — "Resolve N filing-blocking gaps in section §11.4". */
  message: string;
  /** Estimated readiness points recovered if this action is resolved. */
  scoreImpact: number;
  /** Optional artifact / section / alert references for click-through. */
  references?: {
    artifactId?: string;
    ctdSection?: string;
    alertId?: string;
    guidanceCode?: string;
  };
}

export interface ProjectReadinessAggregate {
  projectId: number;
  organizationId: number;
  asOf: string;
  /** Final 0..100 score. */
  score: number;
  /** Whether filing is blocked (any source). */
  filingBlocking: boolean;
  components: {
    sectionCoverage: ReadinessComponentScore;
    citationQuality: ReadinessComponentScore;
    consistency: ReadinessComponentScore;
    guidance: ReadinessComponentScore;
    therapeuticContext: ReadinessComponentScore;
  };
  /** Ranked remediation list, top first. Capped at 10 entries. */
  nextActions: ReadinessNextAction[];
  /** Raw inputs surfaced for downstream consumers. */
  inputs: {
    sectionCoverage: ProjectSectionCoverage;
    citationImpact: CitationReadinessImpact;
    consistencySummary: ConsistencyAlertsSummary;
    guidanceSummary: GuidanceAlertsSummary;
    therapeuticContext: ProjectTherapeuticContextResult;
  };
}

const WEIGHTS = {
  sectionCoverage: 0.4,
  citationQuality: 0.3,
  consistency: 0.1,
  guidance: 0.1,
  therapeuticContext: 0.1,
} as const;

const SEVERITY_TO_IMPACT_POINTS: Record<
  'critical' | 'major' | 'minor' | 'info',
  number
> = {
  critical: 8,
  major: 4,
  minor: 1,
  info: 0,
};

const MAX_NEXT_ACTIONS = 10;

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pure: derive the aggregate from already-fetched signals. Caller does
 * the DB pulls; we do the math + ranking. Exported for downstream
 * consumers (e.g. a future trend job) that already have the inputs.
 */
export function deriveProjectReadinessAggregate(
  inputs: ProjectReadinessAggregate['inputs'],
  options: {
    projectId: number;
    organizationId: number;
    now?: Date;
  }
): ProjectReadinessAggregate {
  const now = options.now ?? new Date();

  // 1. Section coverage component.
  const coverage = inputs.sectionCoverage;
  const coverageScore = clamp(coverage.rollup.completionPercent);
  const sectionCoverage: ReadinessComponentScore = {
    weight: WEIGHTS.sectionCoverage,
    score: coverageScore,
    weighted: round1(coverageScore * WEIGHTS.sectionCoverage),
    detail:
      `${coverage.rollup.requiredCompleted}/${coverage.rollup.requiredSections} required sections complete; ` +
      `${coverage.rollup.requiredMissing} missing.`,
  };

  // 2. Citation quality component.
  const impact = inputs.citationImpact;
  // Coverage from citation engine: 0..100. Penalty: gap penalty (0..100).
  // Score = coverage - gap_penalty, clamped 0..100.
  const citationScore = clamp(
    impact.citationCoverage - impact.citationGapPenalty
  );
  const citationQuality: ReadinessComponentScore = {
    weight: WEIGHTS.citationQuality,
    score: citationScore,
    weighted: round1(citationScore * WEIGHTS.citationQuality),
    detail:
      `Coverage ${impact.citationCoverage}% across ${impact.citedArtifactCount}/${impact.totalArtifactCount} artifacts; ` +
      `gap penalty ${impact.citationGapPenalty} pts (raw delta ${impact.rawReadinessDelta}).` +
      (impact.staleArtifactCount > 0
        ? ` ${impact.staleArtifactCount} artifacts stale.`
        : ''),
  };

  // 3. Consistency component. Each open critical alert costs 20 pts;
  // major 10; minor 3.
  const conSum = inputs.consistencySummary;
  const conPenalty =
    conSum.bySeverity.critical * 20 +
    conSum.bySeverity.major * 10 +
    conSum.bySeverity.minor * 3;
  const conScore = clamp(100 - conPenalty);
  const consistency: ReadinessComponentScore = {
    weight: WEIGHTS.consistency,
    score: conScore,
    weighted: round1(conScore * WEIGHTS.consistency),
    detail:
      `${conSum.totalOpen} open consistency alerts (${conSum.openCritical} critical).`,
  };

  // 4. Guidance compliance component. Same penalty model as consistency.
  const gSum = inputs.guidanceSummary;
  const gPenalty =
    gSum.bySeverity.critical * 20 +
    gSum.bySeverity.major * 10 +
    gSum.bySeverity.minor * 3;
  const gScore = clamp(100 - gPenalty);
  const guidance: ReadinessComponentScore = {
    weight: WEIGHTS.guidance,
    score: gScore,
    weighted: round1(gScore * WEIGHTS.guidance),
    detail:
      `${gSum.totalOpen} open guidance alerts (${gSum.openCritical} critical).`,
  };

  // 5. Therapeutic context. 100 if a profile resolved, 50 if a slug is
  // set but didn't resolve to a profile, 0 if none.
  const tc = inputs.therapeuticContext;
  let tcScore: number;
  let tcDetail: string;
  if (tc.profile) {
    tcScore = 100;
    tcDetail = `Profile active: ${tc.profile.displayName} (${tc.profile.id}).`;
  } else if (tc.therapeuticArea) {
    tcScore = 50;
    tcDetail =
      `Slug "${tc.therapeuticArea}" is set but doesn't resolve to a registered profile.`;
  } else {
    tcScore = 0;
    tcDetail =
      'No therapeutic area set — context injection (Feature 2.7) is dormant.';
  }
  const therapeuticContext: ReadinessComponentScore = {
    weight: WEIGHTS.therapeuticContext,
    score: tcScore,
    weighted: round1(tcScore * WEIGHTS.therapeuticContext),
    detail: tcDetail,
  };

  const score = clamp(
    Math.round(
      sectionCoverage.weighted +
        citationQuality.weighted +
        consistency.weighted +
        guidance.weighted +
        therapeuticContext.weighted
    )
  );

  // filingBlocking — OR across section coverage + open critical guidance/
  // consistency alerts.
  const filingBlocking =
    coverage.rollup.filingBlocking ||
    conSum.openCritical > 0 ||
    gSum.openCritical > 0 ||
    impact.filingBlocked;

  // 6. Ranked next-action list.
  const nextActions: ReadinessNextAction[] = [];

  // 6a. Filing-blocking issues bubble first.
  if (coverage.rollup.requiredMissing > 0) {
    nextActions.push({
      id: `coverage:missing-required:${coverage.rollup.requiredMissing}`,
      category: 'section_coverage',
      severity: 'critical',
      message:
        `Add ${coverage.rollup.requiredMissing} missing required CTD section${coverage.rollup.requiredMissing === 1 ? '' : 's'}.`,
      // Each missing required section restores up to (40% / requiredSections) * 100 points.
      scoreImpact: round1(
        coverage.rollup.requiredSections > 0
          ? (WEIGHTS.sectionCoverage * 100 * coverage.rollup.requiredMissing) /
              coverage.rollup.requiredSections
          : 0
      ),
    });
  }

  // 6b. Drafted-but-uncited sections.
  if (coverage.rollup.draftedCount > 0) {
    nextActions.push({
      id: `coverage:uncited-drafts:${coverage.rollup.draftedCount}`,
      category: 'citation_quality',
      severity: 'major',
      message:
        `Run citation engine on ${coverage.rollup.draftedCount} drafted-but-uncited section${coverage.rollup.draftedCount === 1 ? '' : 's'}.`,
      scoreImpact: round1(
        // Rough: each uncited draft swings citation coverage by 1/n of total.
        (WEIGHTS.citationQuality * 100 * coverage.rollup.draftedCount) /
          Math.max(1, coverage.rollup.registrySections)
      ),
    });
  }

  // 6c. Filing-blocked artifacts (gap.blockingFiling = true).
  for (const a of impact.artifactImpacts) {
    if (!a.filingBlocked) continue;
    nextActions.push({
      id: `citation:blocking:${a.artifactId}`,
      category: 'citation_quality',
      severity: 'critical',
      message:
        `Resolve filing-blocking gap in ${a.artifactId}` +
        (a.ctdSection ? ` (§${a.ctdSection})` : '') +
        ` — ${a.gapCount} open gap${a.gapCount === 1 ? '' : 's'}.`,
      scoreImpact: round1(
        (WEIGHTS.citationQuality * Math.abs(a.readinessDelta)) /
          Math.max(1, Math.abs(impact.rawReadinessDelta) || 1) *
          100
      ),
      references: {
        artifactId: a.artifactId,
        ctdSection: a.ctdSection ?? undefined,
      },
    });
  }

  // 6d. Open critical consistency alerts.
  for (const top of conSum.topArtifacts.slice(0, 3)) {
    if (top.openCount === 0) continue;
    nextActions.push({
      id: `consistency:artifact:${top.artifactId}`,
      category: 'consistency',
      severity: 'major',
      message:
        `Resolve ${top.openCount} cross-artifact consistency alert${top.openCount === 1 ? '' : 's'} on ${top.artifactId}.`,
      scoreImpact: round1(WEIGHTS.consistency * 100 * 0.2 * top.openCount),
      references: { artifactId: top.artifactId },
    });
  }

  // 6e. Open critical guidance alerts.
  for (const top of gSum.topGuidanceCodes.slice(0, 3)) {
    if (top.openCount === 0) continue;
    nextActions.push({
      id: `guidance:code:${top.guidanceCode}`,
      category: 'guidance',
      severity: top.severityHighest ?? 'major',
      message:
        `Address ${top.openCount} open alert${top.openCount === 1 ? '' : 's'} for ${top.guidanceCode} (${top.authority}).`,
      scoreImpact: round1(WEIGHTS.guidance * 100 * 0.2 * top.openCount),
      references: { guidanceCode: top.guidanceCode },
    });
  }

  // 6f. Therapeutic area not set.
  if (!tc.profile) {
    nextActions.push({
      id: `therapeutic_area:not_set`,
      category: 'therapeutic_area',
      severity: tc.therapeuticArea ? 'minor' : 'info',
      message: tc.therapeuticArea
        ? `Therapeutic area slug "${tc.therapeuticArea}" doesn't match a registered profile — set a recognized slug to enable context injection.`
        : 'Set the project therapeutic area to enable Feature 2.7 context injection.',
      scoreImpact: round1(WEIGHTS.therapeuticContext * 100),
    });
  }

  // Rank: critical first, then by scoreImpact desc, then by message.
  const SEVERITY_RANK: Record<ReadinessNextAction['severity'], number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };
  nextActions.sort((a, b) => {
    if (a.severity !== b.severity)
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (a.scoreImpact !== b.scoreImpact) return b.scoreImpact - a.scoreImpact;
    return a.message.localeCompare(b.message);
  });

  // Dedupe by id and cap.
  const seenIds = new Set<string>();
  const dedupedActions = nextActions
    .filter(a => {
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    })
    .slice(0, MAX_NEXT_ACTIONS);

  return {
    projectId: options.projectId,
    organizationId: options.organizationId,
    asOf: now.toISOString(),
    score,
    filingBlocking,
    components: {
      sectionCoverage,
      citationQuality,
      consistency,
      guidance,
      therapeuticContext,
    },
    nextActions: dedupedActions,
    inputs,
  };
}

/**
 * Live entry — fetch all five signals in parallel, derive the aggregate.
 * Tenant-scoped via every individual fetch.
 */
export async function getProjectReadinessAggregate(
  projectId: number,
  organizationId: number,
  options: { submissionType?: 'IND' | 'NDA' | 'BLA' | 'ALL' } = {}
): Promise<ProjectReadinessAggregate> {
  const submissionType = options.submissionType ?? 'IND';
  const [
    sectionCoverage,
    citationImpact,
    consistencySummary,
    guidanceSummary,
    therapeuticContext,
  ] = await Promise.all([
    getProjectSectionCoverage(projectId, organizationId, submissionType),
    getCitationReadinessImpact(projectId, organizationId),
    getConsistencyAlertsSummary(organizationId),
    getGuidanceAlertsSummary(organizationId),
    getProjectTherapeuticContext(projectId, organizationId),
  ]);
  return deriveProjectReadinessAggregate(
    {
      sectionCoverage,
      citationImpact,
      consistencySummary,
      guidanceSummary,
      therapeuticContext,
    },
    { projectId, organizationId }
  );
}
