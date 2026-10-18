/**
 * Project readiness aggregator.
 *
 * Synthesizes every signal AnA produces about a project into a single
 * 0–100 readiness score + breakdown + ranked next-action list:
 *
 *   - Section coverage         (40% weight) — required-section completion
 *   - Citation quality         (30% weight) — supported / contradicted / gap mix
 *   - Consistency              (10% weight) — this project's open cross-artifact contradiction alerts
 *   - Guidance changes         (10% weight) — this project's open guidance-change alerts
 *   - Therapeutic context      (10% weight) — small bonus for a profile being set
 *
 * Score is clamped 0..100 and covers only the components that were measured:
 * a component with no scan result on record, or whose store could not be
 * read, has no score, is listed in `notAssessed`, and the weights of the rest
 * are renormalised (`measuredWeight`). `filingBlocking` is OR-ed across the
 * measured sources:
 *   - section coverage filingBlocking (required missing OR artifact gap blocks)
 *   - any open critical guidance / consistency alert in this project
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
 * 2026-10-15: consistency and guidance were `100 − penalty` over the
 * organisation's alert summaries. A project nobody had scanned, and an
 * organisation whose alert tables did not exist, arrived as zeroed summaries
 * and scored 100 on both — 20 free points on every project — and another
 * project's alerts, resolved ones included, charged this one.
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

export type ReadinessComponentKey =
  | 'sectionCoverage'
  | 'citationQuality'
  | 'consistency'
  | 'guidance'
  | 'therapeuticContext';

export interface ReadinessComponentScore {
  /** 0..1 — this component's configured share of the 0–100 score. */
  weight: number;
  /** False when nothing was measured for it; it is then left out of the score. */
  assessed: boolean;
  /** 0..100 — this component's local score; null when not assessed. */
  score: number | null;
  /**
   * The points this component contributed to the final score: score × weight
   * rescaled by the measured weight. Null when not assessed.
   */
  weighted: number | null;
  /** Breadcrumb for the dashboard. */
  detail: string;
}

/** A component left out of the score, and why. */
export interface ReadinessNotAssessed {
  component: ReadinessComponentKey;
  /** no_scan_on_record: no scan result exists. unavailable: its store could not be read. */
  reason: 'no_scan_on_record' | 'unavailable';
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
  /** Final 0..100 score over the measured components (see measuredWeight). */
  score: number;
  /** Sum of the weights of the components in the score; 1 when all were measured. */
  measuredWeight: number;
  /** Components with no score, named, with the reason. */
  notAssessed: ReadinessNotAssessed[];
  /** Whether a measured source blocks filing; a component in notAssessed could not. */
  filingBlocking: boolean;
  components: Record<ReadinessComponentKey, ReadinessComponentScore>;
  /** Ranked remediation list, top first. Capped at 10 entries. */
  nextActions: ReadinessNextAction[];
  /** Raw inputs surfaced for downstream consumers. */
  inputs: {
    sectionCoverage: ProjectSectionCoverage;
    citationImpact: CitationReadinessImpact;
    /** Null when the alert store could not be read; the error is in `unavailable`. */
    consistencySummary: ConsistencyAlertsSummary | null;
    guidanceSummary: GuidanceAlertsSummary | null;
    therapeuticContext: ProjectTherapeuticContextResult;
    /** The read error behind a null summary. */
    unavailable?: { consistency?: string; guidance?: string };
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

type AlertSummaryInput = Pick<
  ConsistencyAlertsSummary,
  'assessed' | 'lastScanAt' | 'openBySeverity' | 'totalOpen' | 'openCritical'
>;

/**
 * An alert-store component: `100 − penalty` over this project's OPEN alerts
 * (critical 20, major 10, minor 3) when a scan result is on record; no score,
 * and a stated reason, when none is or the store could not be read.
 * `assessed` is the summary when it was scored, else null; `blocksFiling`
 * is true only for a scored summary with an open critical alert.
 */
function alertComponent<T extends AlertSummaryInput>(
  key: 'consistency' | 'guidance',
  summary: T | null,
  unavailable: ProjectReadinessAggregate['inputs']['unavailable'],
  noun: string,
  scanName: string
): {
  component: ReadinessComponentScore;
  notAssessed: ReadinessNotAssessed | null;
  assessed: T | null;
  blocksFiling: boolean;
} {
  const weight = WEIGHTS[key];
  if (summary === null || !summary.assessed) {
    const notAssessed: ReadinessNotAssessed =
      summary === null
        ? {
            component: key,
            reason: 'unavailable',
            detail: `Not assessed: the ${noun} store could not be read (${unavailable?.[key] ?? 'no summary returned'}).`,
          }
        : {
            component: key,
            reason: 'no_scan_on_record',
            detail: `Not assessed: no ${scanName} result is on record for this project.`,
          };
    return {
      component: { weight, assessed: false, score: null, weighted: null, detail: notAssessed.detail },
      notAssessed,
      assessed: null,
      blocksFiling: false,
    };
  }
  const open = summary.openBySeverity;
  const score = clamp(100 - (open.critical * 20 + open.major * 10 + open.minor * 3));
  return {
    component: {
      weight,
      assessed: true,
      score,
      weighted: null, // set once the measured weight is known
      detail:
        `${summary.totalOpen} open ${noun}${summary.totalOpen === 1 ? '' : 's'} (${summary.openCritical} critical) ` +
        `as of the last scan on record (${summary.lastScanAt}).`,
    },
    notAssessed: null,
    assessed: summary,
    blocksFiling: summary.openCritical > 0,
  };
}

/** The first three entries of a scored summary's list; none for an unscored one. */
function topOf<T, X>(summary: T | null, list: (s: T) => X[]): X[] {
  return summary ? list(summary).slice(0, 3) : [];
}

/**
 * The score over the measured components, renormalised over their weights;
 * fills each measured component's `weighted`. Section coverage is always
 * measured, so measuredWeight > 0.
 */
function scoreMeasured(components: Record<ReadinessComponentKey, ReadinessComponentScore>): {
  score: number;
  measuredWeight: number;
} {
  let weight = 0;
  let points = 0;
  for (const c of Object.values(components)) {
    if (c.score === null) continue;
    weight += c.weight;
    points += c.score * c.weight;
  }
  const measuredWeight = Math.round(weight * 100) / 100;
  for (const c of Object.values(components)) {
    if (c.score !== null) c.weighted = round1((c.score * c.weight) / measuredWeight);
  }
  return { score: clamp(Math.round(points / measuredWeight)), measuredWeight };
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
    assessed: true,
    score: coverageScore,
    weighted: null,
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
    assessed: true,
    score: citationScore,
    weighted: null,
    detail:
      `Coverage ${impact.citationCoverage}% across ${impact.citedArtifactCount}/${impact.totalArtifactCount} artifacts; ` +
      `gap penalty ${impact.citationGapPenalty} pts (raw delta ${impact.rawReadinessDelta}).` +
      (impact.staleArtifactCount > 0
        ? ` ${impact.staleArtifactCount} artifacts stale.`
        : ''),
  };

  // 3. Consistency and 4. guidance-change components: this project's open
  // alerts, scored only when a scan result is on record.
  const con = alertComponent(
    'consistency',
    inputs.consistencySummary,
    inputs.unavailable,
    'consistency alert',
    'cross-artifact consistency scan'
  );
  const gui = alertComponent(
    'guidance',
    inputs.guidanceSummary,
    inputs.unavailable,
    'guidance-change alert',
    'guidance-change scan'
  );
  const consistency = con.component;
  const guidance = gui.component;

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
    assessed: true,
    score: tcScore,
    weighted: null,
    detail: tcDetail,
  };

  // The score covers the measured components only (see scoreMeasured).
  const components: Record<ReadinessComponentKey, ReadinessComponentScore> = {
    sectionCoverage,
    citationQuality,
    consistency,
    guidance,
    therapeuticContext,
  };
  const { score, measuredWeight } = scoreMeasured(components);
  const notAssessed = [con.notAssessed, gui.notAssessed].filter(
    (n): n is ReadinessNotAssessed => n !== null
  );
  // Only an assessed summary is read below; an unassessed one has nothing to say.
  const conTop = topOf(con.assessed, s => s.topArtifacts);
  const gTop = topOf(gui.assessed, s => s.topGuidanceCodes);

  // filingBlocking — OR across the measured sources: section coverage, the
  // citation gaps, and this project's open critical guidance / consistency
  // alerts. A source in notAssessed cannot contribute.
  const filingBlocking =
    coverage.rollup.filingBlocking ||
    con.blocksFiling ||
    gui.blocksFiling ||
    impact.filingBlocked;

  // 6. Ranked next-action list. A point of a component's local score is worth
  // weight × 100 / measuredWeight final points (identical to weight × 100 when
  // every component was measured).
  const pointsPerUnitWeight = 100 / measuredWeight;
  const nextActions: ReadinessNextAction[] = [];

  // 6a. Filing-blocking issues bubble first.
  if (coverage.rollup.requiredMissing > 0) {
    nextActions.push({
      id: `coverage:missing-required:${coverage.rollup.requiredMissing}`,
      category: 'section_coverage',
      severity: 'critical',
      message:
        `Add ${coverage.rollup.requiredMissing} missing required CTD section${coverage.rollup.requiredMissing === 1 ? '' : 's'}.`,
      // Each missing required section restores up to (40% / requiredSections) × pointsPerUnitWeight points.
      scoreImpact: round1(
        coverage.rollup.requiredSections > 0
          ? (WEIGHTS.sectionCoverage * pointsPerUnitWeight * coverage.rollup.requiredMissing) /
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
        (WEIGHTS.citationQuality * pointsPerUnitWeight * coverage.rollup.draftedCount) /
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
          pointsPerUnitWeight
      ),
      references: {
        artifactId: a.artifactId,
        ctdSection: a.ctdSection ?? undefined,
      },
    });
  }

  // 6d. Open consistency alerts (this project's, when a scan is on record).
  for (const top of conTop) {
    if (top.openCount === 0) continue;
    nextActions.push({
      id: `consistency:artifact:${top.artifactId}`,
      category: 'consistency',
      severity: 'major',
      message:
        `Resolve ${top.openCount} cross-artifact consistency alert${top.openCount === 1 ? '' : 's'} on ${top.artifactId}.`,
      scoreImpact: round1(WEIGHTS.consistency * pointsPerUnitWeight * 0.2 * top.openCount),
      references: { artifactId: top.artifactId },
    });
  }

  // 6e. Open guidance-change alerts (this project's, when a scan is on record).
  for (const top of gTop) {
    if (top.openCount === 0) continue;
    nextActions.push({
      id: `guidance:code:${top.guidanceCode}`,
      category: 'guidance',
      severity: top.severityHighest ?? 'major',
      message:
        `Address ${top.openCount} open alert${top.openCount === 1 ? '' : 's'} for ${top.guidanceCode} (${top.authority}).`,
      scoreImpact: round1(WEIGHTS.guidance * pointsPerUnitWeight * 0.2 * top.openCount),
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
      scoreImpact: round1(WEIGHTS.therapeuticContext * pointsPerUnitWeight),
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
    measuredWeight,
    notAssessed,
    filingBlocking,
    components,
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
  const unavailable: { consistency?: string; guidance?: string } = {};
  // The two alert stores are provisioned by drizzle push, not by the deploy
  // migration set, so one may be absent: its component is then named
  // unavailable and left out of the score rather than failing the whole
  // aggregate, and never scored as clean.
  const readOrName = <T,>(read: Promise<T>, key: 'consistency' | 'guidance'): Promise<T | null> =>
    read.catch((err: unknown) => {
      unavailable[key] = err instanceof Error ? err.message : String(err);
      return null;
    });
  const [
    sectionCoverage,
    citationImpact,
    consistencySummary,
    guidanceSummary,
    therapeuticContext,
  ] = await Promise.all([
    getProjectSectionCoverage(projectId, organizationId, submissionType),
    getCitationReadinessImpact(projectId, organizationId),
    readOrName(getConsistencyAlertsSummary(organizationId, { projectId }), 'consistency'),
    readOrName(getGuidanceAlertsSummary(organizationId, { projectId }), 'guidance'),
    getProjectTherapeuticContext(projectId, organizationId),
  ]);
  return deriveProjectReadinessAggregate(
    {
      sectionCoverage,
      citationImpact,
      consistencySummary,
      guidanceSummary,
      therapeuticContext,
      ...(Object.keys(unavailable).length > 0 ? { unavailable } : {}),
    },
    { projectId, organizationId }
  );
}
