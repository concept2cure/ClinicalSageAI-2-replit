/**
 * Participant burden and protocol complexity — a deterministic engine over the
 * Schedule of Activities (ICH M11 §1.3).
 *
 * WHAT THIS IS. Every figure here is a count, a span or a ratio read directly off
 * the (activity × visit) grid. There is no model, no estimate and no benchmark:
 * the same grid always yields the same profile. It answers "how many visits, how
 * many procedures, which visit is the heaviest, and what did this amendment do to
 * the participant" — and nothing else.
 *
 * WHAT IT TAKES. A plain {@link BurdenMatrix}: visits, activities and the sparse
 * cells that connect them. The repository has two Schedule-of-Activities models —
 * the study-design spine (`study-design-types.ts`, the primary input) and the
 * protocol read model (`../protocol-soa/protocol-soa-logic.ts`) — so the engine
 * takes neither of them directly and each reaches it through an adapter
 * ({@link burdenMatrixFromDesign}, {@link burdenMatrixFromProtocolSoaMatrix}).
 * One engine, two callers; there is deliberately no second implementation.
 *
 * WHAT IT REFUSES TO COMPUTE, AND WHY. A number this grid cannot support is
 * reported ABSENT — `status: 'not_computable'`, `value: null`, and a reason — and
 * never as zero, because a zero reads as "no burden" when the truth is "not
 * known". Concretely, against the study-design SoA today:
 *
 *   - **Participant time** needs a per-activity duration. `SoaActivity` carries
 *     none, so the total is absent. If a caller supplies `participantMinutes` the
 *     engine sums it; if even one scheduled activity lacks it the total goes
 *     absent rather than under-reporting.
 *   - **Invasive procedure count** needs a per-activity invasiveness attribute.
 *     `SoaActivity` carries none. The engine does NOT infer invasiveness from an
 *     activity's name or its category: "PK sampling" is usually a blood draw and
 *     sometimes urine, and a name-matched count presented as a measurement is a
 *     fabrication. Absent until the model carries the attribute.
 *   - **Site staff time** has no input at all, in either SoA model.
 *   - **A composite burden score** is not published. A 0–100 index would need
 *     weights this platform has no validated basis for, and a weighted number is
 *     read as a standard the moment it is displayed. The counts are reported
 *     instead; a caller that wants a composite must define and own its formula.
 *
 * Refusals are enumerated on the profile in `notComputed` so a UI can show the
 * absence as a fact rather than leaving a blank.
 *
 * FINDINGS are emitted in the repo's existing {@link DesignFinding} shape (same
 * severities, a stable `BRD-` code, a section label) so the surfaces that already
 * render design-gate findings render these with no new component. Findings that
 * `schedule-of-activities.ts` already raises (dangling cells, unscheduled
 * activities, duplicate ids) are NOT repeated here; dangling and duplicate cells
 * are simply dropped from the counts so a broken grid cannot inflate a burden
 * figure.
 *
 * Pure and deterministic: no DB, no clock, no RNG, no LLM.
 *
 * @module server/services/study-design/burden-model
 */

import type { DesignFinding } from './design-gates';

export const BURDEN_BASIS =
  'ICH M11 §1.3 Schedule of Activities — participant burden counted from the scheduled (activity × visit) grid';

/** Section label the findings carry, matching the §-prefixed labels design-gates uses. */
export const BURDEN_SECTION = '§7 Participant burden';
const BURDEN_STANDARD = 'ICH M11';

// ─── Input model (the plain matrix both SoA models adapt onto) ───────────────

/** Cell state. `undefined` means the source model does not distinguish states. */
export type BurdenCellState = 'performed' | 'conditional' | 'optional';

/** Invasiveness of a procedure. Supplied by the caller; never inferred here. */
export type BurdenInvasiveness = 'non_invasive' | 'minimally_invasive' | 'invasive';

export interface BurdenVisitInput {
  id: string;
  name: string;
  /** Planned study day. `null` when the source carries no numeric day. */
  studyDay?: number | null;
  /** Unscheduled / as-needed visit. `null` when the source has no such flag. */
  unscheduled?: boolean | null;
}

export interface BurdenActivityInput {
  id: string;
  name: string;
  /** Assessment category. `null` when the source carries none. */
  category?: string | null;
  /** Participant minutes for one performance. `null`/absent ⇒ time measures absent. */
  participantMinutes?: number | null;
  /** Invasiveness. `null`/absent ⇒ the invasive count is absent. Never inferred. */
  invasiveness?: BurdenInvasiveness | null;
}

export interface BurdenCellInput {
  activityId: string;
  visitId: string;
  state?: BurdenCellState;
}

/** The engine's one input shape. Both SoA models adapt onto it. */
export interface BurdenMatrix {
  visits: BurdenVisitInput[];
  activities: BurdenActivityInput[];
  /** Sparse: only scheduled intersections. Duplicates and dangling refs are dropped. */
  cells: BurdenCellInput[];
  /** Number of arms, when the source knows it. `null` ⇒ the indicator is absent. */
  armCount?: number | null;
  /** Where this matrix came from; carried onto the profile for provenance. */
  source: string;
}

// ─── Output model ─────────────────────────────────────────────────────────────

/**
 * One measure, with whether it could be computed at all. A profile where a figure
 * is unknown is distinguishable from one where the figure is genuinely zero.
 */
export interface Measure<T> {
  status: 'computed' | 'not_computable';
  value: T | null;
  /** The exact input this measure is read from. */
  basis: string;
  /** Present only when `not_computable`: which input was missing. */
  absentReason?: string;
}

/** A measure this engine deliberately does not produce, and why. */
export interface NotComputedNote {
  measure: string;
  reason: string;
}

export interface BurdenPeakVisit {
  visitId: string;
  visitName: string;
  procedureCount: number;
}

export interface BurdenVisitLoad {
  visitId: string;
  visitName: string;
  studyDay: number | null;
  unscheduled: boolean | null;
  /** Scheduled activities at this visit, all states counted. */
  procedureCount: number;
  byState: { performed: number; conditional: number; optional: number; unstated: number };
  participantMinutes: Measure<number>;
}

export interface BurdenAssessmentLoad {
  activityId: string;
  name: string;
  category: string | null;
  /** Number of visits this assessment is scheduled at. */
  scheduledVisitCount: number;
}

export interface BurdenComplexity {
  distinctAssessmentCategories: Measure<number>;
  armCount: Measure<number>;
  hasUnscheduledVisits: Measure<boolean>;
  hasConditionalActivities: Measure<boolean>;
  proceduresPerVisit: Measure<number>;
}

export interface BurdenProfile {
  /** False when there is no schedule to measure. Every measure is then absent. */
  present: boolean;
  source: string;
  visitCount: Measure<number>;
  scheduledVisitCount: Measure<number>;
  durationDays: Measure<number>;
  procedureCount: Measure<number>;
  activityCount: Measure<number>;
  peakVisitLoad: Measure<BurdenPeakVisit>;
  medianVisitLoad: Measure<number>;
  participantTimeMinutes: Measure<number>;
  invasiveProcedureCount: Measure<number>;
  complexity: BurdenComplexity;
  visits: BurdenVisitLoad[];
  assessments: BurdenAssessmentLoad[];
  /** Scheduled activities carrying no duration — what to fill in to unlock the time measures. */
  activitiesMissingParticipantMinutes: string[];
  /** Scheduled activities carrying no invasiveness attribute. */
  activitiesMissingInvasiveness: string[];
  findings: DesignFinding[];
  notComputed: NotComputedNote[];
  basis: string;
  /** Honesty marker: counted from the grid, not generated. */
  computedFromMatrix: true;
}

// ─── Thresholds (stated, not tuned) ──────────────────────────────────────────

/** An outlier visit is ≥ this multiple of the median load … */
const OUTLIER_RATIO = 2;
/** … and at least this many procedures above it, so 1-vs-2 is not "an outlier". */
const OUTLIER_ABSOLUTE_MARGIN = 3;
/** Below this many scheduled visits there is no distribution to be an outlier in. */
const OUTLIER_MIN_VISITS = 3;
/** Below this many scheduled visits, "at every visit" is not yet a question. */
const EVERY_VISIT_MIN_VISITS = 4;
/**
 * Categories where scheduling at every visit is expected (consent, dosing,
 * eligibility, safety review) and therefore not worth asking about.
 */
const EVERY_VISIT_EXPECTED_CATEGORIES = new Set([
  'administrative',
  'eligibility',
  'drug_administration',
  'safety',
]);

// ─── Measure constructors ────────────────────────────────────────────────────
//
// Exported for the sibling burden modules (`burden-adapters.ts`, `burden-delta.ts`)
// so the three share one construction of a measure and one finding shape. They are
// internal to this slice, not part of the module's product surface.

export function computedMeasure<T>(value: T, basis: string): Measure<T> {
  return { status: 'computed', value, basis };
}

export function absentMeasure<T>(basis: string, absentReason: string): Measure<T> {
  return { status: 'not_computable', value: null, basis, absentReason };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Normalization ───────────────────────────────────────────────────────────

interface NormalizedMatrix {
  visits: BurdenVisitInput[];
  activities: BurdenActivityInput[];
  activityById: Map<string, BurdenActivityInput>;
  cells: BurdenCellInput[];
}

/**
 * Drop cells that reference an undefined activity or visit, and cells that repeat
 * an intersection. Both are grid defects `schedule-of-activities.ts` already
 * reports; here they are simply not allowed to inflate a count.
 */
function normalizeMatrix(matrix: BurdenMatrix): NormalizedMatrix {
  const visits = matrix.visits ?? [];
  const activities = matrix.activities ?? [];
  const activityById = new Map(activities.map(a => [a.id, a] as const));
  const visitIds = new Set(visits.map(v => v.id));
  const seen = new Set<string>();
  const cells: BurdenCellInput[] = [];
  for (const cell of matrix.cells ?? []) {
    if (!activityById.has(cell.activityId) || !visitIds.has(cell.visitId)) continue;
    const key = `${cell.activityId}\u0001${cell.visitId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(cell);
  }
  return { visits, activities, activityById, cells };
}

// ─── Per-visit load ──────────────────────────────────────────────────────────

const PARTICIPANT_TIME_BASIS = 'sum of BurdenActivityInput.participantMinutes over the scheduled cells';

function hasMinutes(activity: BurdenActivityInput | undefined): boolean {
  return typeof activity?.participantMinutes === 'number' && Number.isFinite(activity.participantMinutes);
}

function visitMinutes(activities: BurdenActivityInput[]): Measure<number> {
  const missing = activities.filter(a => !hasMinutes(a)).map(a => a.name);
  if (missing.length > 0) {
    return absentMeasure(
      PARTICIPANT_TIME_BASIS,
      `${missing.length} of ${activities.length} activities at this visit carry no participant ` +
        `duration: ${missing.join(', ')}.`,
    );
  }
  const total = activities.reduce((sum, a) => sum + (a.participantMinutes as number), 0);
  return computedMeasure(round2(total), PARTICIPANT_TIME_BASIS);
}

function buildVisitLoads(norm: NormalizedMatrix): BurdenVisitLoad[] {
  const cellsByVisit = new Map<string, BurdenCellInput[]>();
  for (const cell of norm.cells) {
    const list = cellsByVisit.get(cell.visitId);
    if (list) list.push(cell);
    else cellsByVisit.set(cell.visitId, [cell]);
  }
  return norm.visits.map(visit => {
    const cells = cellsByVisit.get(visit.id) ?? [];
    const byState = { performed: 0, conditional: 0, optional: 0, unstated: 0 };
    for (const cell of cells) {
      if (cell.state === 'performed') byState.performed += 1;
      else if (cell.state === 'conditional') byState.conditional += 1;
      else if (cell.state === 'optional') byState.optional += 1;
      else byState.unstated += 1;
    }
    const activities = cells
      .map(c => norm.activityById.get(c.activityId))
      .filter((a): a is BurdenActivityInput => a !== undefined);
    return {
      visitId: visit.id,
      visitName: visit.name,
      studyDay: typeof visit.studyDay === 'number' ? visit.studyDay : null,
      unscheduled: typeof visit.unscheduled === 'boolean' ? visit.unscheduled : null,
      procedureCount: cells.length,
      byState,
      participantMinutes: visitMinutes(activities),
    };
  });
}

// ─── Individual measures ─────────────────────────────────────────────────────

const DURATION_BASIS =
  'span in days between the earliest and latest planned study day across the scheduled visits (SoaVisit.studyDay)';

function durationMeasure(scheduled: BurdenVisitInput[]): Measure<number> {
  if (scheduled.length === 0) {
    return absentMeasure(DURATION_BASIS, 'The schedule has no scheduled visits.');
  }
  const missing = scheduled.filter(v => typeof v.studyDay !== 'number').map(v => v.name);
  if (missing.length > 0) {
    return absentMeasure(
      DURATION_BASIS,
      `${missing.length} scheduled visit(s) carry no planned study day: ${missing.join(', ')}. ` +
        'The span across the remaining visits would understate the study duration.',
    );
  }
  const days = scheduled.map(v => v.studyDay as number);
  return computedMeasure(Math.max(...days) - Math.min(...days), DURATION_BASIS);
}

function peakMeasure(loads: BurdenVisitLoad[]): Measure<BurdenPeakVisit> {
  const basis = 'the scheduled visit with the most scheduled cells (ties resolve to the earlier column)';
  if (loads.length === 0) return absentMeasure(basis, 'The schedule has no scheduled visits.');
  let peak = loads[0];
  for (const load of loads) if (load.procedureCount > peak.procedureCount) peak = load;
  return computedMeasure(
    { visitId: peak.visitId, visitName: peak.visitName, procedureCount: peak.procedureCount },
    basis,
  );
}

function medianMeasure(loads: BurdenVisitLoad[]): Measure<number> {
  const basis = 'median of the per-visit scheduled-cell counts across the scheduled visits';
  if (loads.length === 0) return absentMeasure(basis, 'The schedule has no scheduled visits.');
  return computedMeasure(round2(median(loads.map(l => l.procedureCount))), basis);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function totalMinutesMeasure(
  scheduledActivities: BurdenActivityInput[],
  cells: BurdenCellInput[],
  activityById: Map<string, BurdenActivityInput>,
): Measure<number> {
  if (cells.length === 0) return computedMeasure(0, PARTICIPANT_TIME_BASIS);
  const missing = scheduledActivities.filter(a => !hasMinutes(a));
  if (missing.length > 0) {
    return absentMeasure(
      PARTICIPANT_TIME_BASIS,
      `${missing.length} of ${scheduledActivities.length} scheduled activities carry no participant ` +
        'duration, so a total would understate the time asked of a participant. The study-design ' +
        'Schedule of Activities carries no duration attribute today.',
    );
  }
  const total = cells.reduce(
    (sum, cell) => sum + (activityById.get(cell.activityId)?.participantMinutes ?? 0),
    0,
  );
  return computedMeasure(round2(total), PARTICIPANT_TIME_BASIS);
}

function invasiveMeasure(
  scheduledActivities: BurdenActivityInput[],
  cells: BurdenCellInput[],
  activityById: Map<string, BurdenActivityInput>,
): Measure<number> {
  const basis = 'scheduled cells whose activity is marked invasive or minimally invasive';
  if (cells.length === 0) return computedMeasure(0, basis);
  const missing = scheduledActivities.filter(a => !a.invasiveness);
  if (missing.length > 0) {
    return absentMeasure(
      basis,
      `${missing.length} of ${scheduledActivities.length} scheduled activities carry no invasiveness ` +
        'attribute. This engine does not infer invasiveness from an activity name or category — a ' +
        'name-matched count presented as a measurement would be a guess.',
    );
  }
  const count = cells.filter(cell => {
    const level = activityById.get(cell.activityId)?.invasiveness;
    return level === 'invasive' || level === 'minimally_invasive';
  }).length;
  return computedMeasure(count, basis);
}

function complexityMeasures(
  matrix: BurdenMatrix,
  norm: NormalizedMatrix,
  scheduledActivities: BurdenActivityInput[],
  scheduledVisits: BurdenVisitInput[],
): BurdenComplexity {
  const catBasis = 'distinct BurdenActivityInput.category values across the scheduled activities';
  const uncategorized = scheduledActivities.filter(a => !a.category);
  const categories = new Set(scheduledActivities.map(a => a.category));

  const ppvBasis = 'scheduled cells ÷ scheduled visits';
  const stateless = norm.cells.some(c => c.state === undefined);
  const flagless = norm.visits.some(v => typeof v.unscheduled !== 'boolean');

  return {
    distinctAssessmentCategories:
      uncategorized.length > 0
        ? absentMeasure(catBasis, `${uncategorized.length} scheduled activity/activities carry no category.`)
        : computedMeasure(categories.size, catBasis),
    armCount:
      typeof matrix.armCount === 'number'
        ? computedMeasure(matrix.armCount, 'number of arms on the design object')
        : absentMeasure('number of arms on the design object', 'The source carries no arm count.'),
    hasUnscheduledVisits: flagless
      ? absentMeasure('SoaVisit.unscheduled', 'The source carries no unscheduled/as-needed flag on its visits.')
      : computedMeasure(norm.visits.some(v => v.unscheduled === true), 'SoaVisit.unscheduled'),
    hasConditionalActivities: stateless
      ? absentMeasure('SoaCell.state', 'The source carries no per-cell state, so conditional cells cannot be told apart.')
      : computedMeasure(norm.cells.some(c => c.state === 'conditional'), 'SoaCell.state'),
    proceduresPerVisit:
      scheduledVisits.length === 0
        ? absentMeasure(ppvBasis, 'The schedule has no scheduled visits.')
        : computedMeasure(round2(norm.cells.length / scheduledVisits.length), ppvBasis),
  };
}

// ─── Findings ────────────────────────────────────────────────────────────────

export function burdenFinding(
  code: string,
  severity: DesignFinding['severity'],
  title: string,
  detail: string,
  suggestedFix: string,
): DesignFinding {
  return { code, section: BURDEN_SECTION, severity, standard: BURDEN_STANDARD, title, detail, suggestedFix };
}

function outlierFindings(scheduledLoads: BurdenVisitLoad[]): DesignFinding[] {
  if (scheduledLoads.length < OUTLIER_MIN_VISITS) return [];
  const mid = median(scheduledLoads.map(l => l.procedureCount));
  if (mid < 1) return [];
  return scheduledLoads
    .filter(l => l.procedureCount >= OUTLIER_RATIO * mid && l.procedureCount - mid >= OUTLIER_ABSOLUTE_MARGIN)
    .map(l =>
      burdenFinding(
        'BRD-010',
        'minor',
        'Visit load far above the rest of the schedule',
        `Visit "${l.visitName}" has ${l.procedureCount} scheduled activities against a median of ` +
          `${round2(mid)} across the ${scheduledLoads.length} scheduled visits. The heaviest single ` +
          'visit is what a participant weighs when deciding whether to continue.',
        'Move assessments that do not have to occur at this visit to an adjacent one, or split the visit.',
      ),
    );
}

function emptyVisitFindings(loads: BurdenVisitLoad[]): DesignFinding[] {
  return loads
    .filter(l => l.procedureCount === 0)
    .map(l =>
      burdenFinding(
        'BRD-011',
        'major',
        'Visit with nothing scheduled',
        `Visit "${l.visitName}" is defined as a column of the schedule but has no activity scheduled at it.`,
        'Schedule the activities this visit exists for, or remove the visit from the schedule.',
      ),
    );
}

function everyVisitFindings(
  assessments: BurdenAssessmentLoad[],
  scheduledVisitCount: number,
): DesignFinding[] {
  if (scheduledVisitCount < EVERY_VISIT_MIN_VISITS) return [];
  return assessments
    .filter(
      a =>
        a.scheduledVisitCount >= scheduledVisitCount &&
        a.category !== null &&
        !EVERY_VISIT_EXPECTED_CATEGORIES.has(a.category),
    )
    .map(a =>
      burdenFinding(
        'BRD-012',
        'info',
        'Assessment scheduled at every visit',
        `"${a.name}" (${a.category}) is scheduled at all ${scheduledVisitCount} scheduled visits. ` +
          'Assessments in this category are not always needed at every visit, and each repetition is ' +
          'participant and site time.',
        'Confirm each timepoint is required by an endpoint or a safety obligation; drop the ones that are not.',
      ),
    );
}

// ─── The profile ─────────────────────────────────────────────────────────────

const SITE_STAFF_NOTE: NotComputedNote = {
  measure: 'siteStaffTime',
  reason:
    'Not computed. Neither Schedule-of-Activities model carries staff effort per activity, so any ' +
    'figure would be invented. A per-activity staff-minutes attribute would make it computable.',
};

const COMPOSITE_NOTE: NotComputedNote = {
  measure: 'compositeBurdenScore',
  reason:
    'Not published. A single 0–100 burden index would need weights across visits, procedures, ' +
    'invasiveness and time that this platform has no validated or published basis for, and a ' +
    'weighted number is read as a standard the moment it is displayed. The individual counts above ' +
    'are reported instead.',
};

function collectNotComputed(profile: Omit<BurdenProfile, 'notComputed'>): NotComputedNote[] {
  const candidates: Array<[string, Measure<unknown>]> = [
    ['durationDays', profile.durationDays],
    ['peakVisitLoad', profile.peakVisitLoad],
    ['participantTimeMinutes', profile.participantTimeMinutes],
    ['invasiveProcedureCount', profile.invasiveProcedureCount],
    ['complexity.distinctAssessmentCategories', profile.complexity.distinctAssessmentCategories],
    ['complexity.armCount', profile.complexity.armCount],
    ['complexity.hasUnscheduledVisits', profile.complexity.hasUnscheduledVisits],
    ['complexity.hasConditionalActivities', profile.complexity.hasConditionalActivities],
  ];
  const notes = candidates
    .filter(([, m]) => m.status === 'not_computable')
    .map(([measure, m]) => ({ measure, reason: m.absentReason ?? 'Not computable from this schedule.' }));
  return [...notes, SITE_STAFF_NOTE, COMPOSITE_NOTE];
}

/** Compute the burden profile for a schedule. Pure; the only entry point that counts. */
export function computeBurdenProfile(matrix: BurdenMatrix): BurdenProfile {
  const norm = normalizeMatrix(matrix);
  if (norm.visits.length === 0 && norm.activities.length === 0) {
    return absentBurdenProfile(matrix.source, 'The schedule has no visits and no activities.');
  }

  const loads = buildVisitLoads(norm);
  const scheduledVisits = norm.visits.filter(v => v.unscheduled !== true);
  const scheduledIds = new Set(scheduledVisits.map(v => v.id));
  const scheduledLoads = loads.filter(l => scheduledIds.has(l.visitId));

  const scheduledActivityIds = new Set(norm.cells.map(c => c.activityId));
  const scheduledActivities = norm.activities.filter(a => scheduledActivityIds.has(a.id));
  const visitsPerActivity = countVisitsPerActivity(norm.cells);

  const base: Omit<BurdenProfile, 'notComputed'> = {
    present: true,
    source: matrix.source,
    visitCount: computedMeasure(norm.visits.length, 'number of visit columns on the schedule'),
    scheduledVisitCount: computedMeasure(scheduledVisits.length, 'visit columns not flagged unscheduled'),
    durationDays: durationMeasure(scheduledVisits),
    procedureCount: computedMeasure(norm.cells.length, 'number of scheduled cells (activity × visit intersections)'),
    activityCount: computedMeasure(norm.activities.length, 'number of activity rows on the schedule'),
    peakVisitLoad: peakMeasure(scheduledLoads),
    medianVisitLoad: medianMeasure(scheduledLoads),
    participantTimeMinutes: totalMinutesMeasure(scheduledActivities, norm.cells, norm.activityById),
    invasiveProcedureCount: invasiveMeasure(scheduledActivities, norm.cells, norm.activityById),
    complexity: complexityMeasures(matrix, norm, scheduledActivities, scheduledVisits),
    visits: loads,
    assessments: norm.activities.map(a => ({
      activityId: a.id,
      name: a.name,
      category: a.category ?? null,
      scheduledVisitCount: visitsPerActivity.get(a.id) ?? 0,
    })),
    activitiesMissingParticipantMinutes: scheduledActivities.filter(a => !hasMinutes(a)).map(a => a.name),
    activitiesMissingInvasiveness: scheduledActivities.filter(a => !a.invasiveness).map(a => a.name),
    findings: [],
    basis: BURDEN_BASIS,
    computedFromMatrix: true,
  };

  base.findings = [
    ...outlierFindings(scheduledLoads),
    ...emptyVisitFindings(loads),
    ...everyVisitFindings(base.assessments, scheduledVisits.length),
  ];

  return { ...base, notComputed: collectNotComputed(base) };
}

function countVisitsPerActivity(cells: BurdenCellInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cell of cells) counts.set(cell.activityId, (counts.get(cell.activityId) ?? 0) + 1);
  return counts;
}

/** The honest empty profile: present false, every measure absent with the reason. */
export function absentBurdenProfile(source: string, reason: string): BurdenProfile {
  const gone = <T>(basis: string): Measure<T> => absentMeasure<T>(basis, reason);
  return {
    present: false,
    source,
    visitCount: gone('number of visit columns on the schedule'),
    scheduledVisitCount: gone('visit columns not flagged unscheduled'),
    durationDays: gone(DURATION_BASIS),
    procedureCount: gone('number of scheduled cells (activity × visit intersections)'),
    activityCount: gone('number of activity rows on the schedule'),
    peakVisitLoad: gone('the scheduled visit with the most scheduled cells'),
    medianVisitLoad: gone('median of the per-visit scheduled-cell counts'),
    participantTimeMinutes: gone(PARTICIPANT_TIME_BASIS),
    invasiveProcedureCount: gone('scheduled cells whose activity is marked invasive or minimally invasive'),
    complexity: {
      distinctAssessmentCategories: gone('distinct BurdenActivityInput.category values'),
      armCount: gone('number of arms on the design object'),
      hasUnscheduledVisits: gone('SoaVisit.unscheduled'),
      hasConditionalActivities: gone('SoaCell.state'),
      proceduresPerVisit: gone('scheduled cells ÷ scheduled visits'),
    },
    visits: [],
    assessments: [],
    activitiesMissingParticipantMinutes: [],
    activitiesMissingInvasiveness: [],
    findings: [],
    notComputed: [{ measure: 'all', reason }, SITE_STAFF_NOTE, COMPOSITE_NOTE],
    basis: BURDEN_BASIS,
    computedFromMatrix: true,
  };
}
