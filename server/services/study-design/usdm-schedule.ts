/**
 * USDM export, schedule half — the design's Schedule of Activities as USDM
 * StudyEpoch, Encounter, Activity, the main ScheduleTimeline with its
 * ScheduledActivityInstances and Timings, and the arm × epoch StudyCell grid.
 *
 * Split from `usdm-projection.ts` (the entry point, `projectUsdm`) for the file
 * size cap; it is not called on its own. The industry need, the basis and the
 * honesty contract are stated there and hold here:
 *   - Epochs, visits and activities are exported in their recorded `order`;
 *     ids are positional. Each visit (SoA column) becomes ONE instance that
 *     lists the activities its cells schedule.
 *   - A cell whose activity or visit id does not resolve exactly once is NOT
 *     placed; it is reported. A visit whose epoch does not resolve gets a null
 *     `epochId`, reported. Conditional/optional cell state is reported as
 *     unmapped: the activity is listed without its condition.
 *   - Timings are built only from recorded study days, relative to ONE anchor:
 *     the unique dated visit marked baseline, else the unique study-day-1 visit.
 *     The design model defines study days against day 1 with no day 0, so the
 *     offset from day a to day b is idx(b) − idx(a) with idx(d) = d − 1 for
 *     d > 0 and d for d < 0. A recorded day 0, an ambiguous or missing anchor,
 *     or an undated visit yields no timing — never a guessed one.
 *   - No Schedule of Activities → every schedule-derived entity is named in
 *     `unfilledUsdmEntities` and no timeline is emitted.
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/usdm-schedule
 */

import type { ScheduleOfActivities, SoaEpoch, SoaVisit } from './study-design-types';
import {
  humanize,
  nextId,
  uniqueIndex,
  usdmCode,
  type UsdmActivity,
  type UsdmContext,
  type UsdmEncounter,
  type UsdmScheduledActivityInstance,
  type UsdmScheduleTimeline,
  type UsdmStudyArm,
  type UsdmStudyCell,
  type UsdmStudyEpoch,
  type UsdmTiming,
  type UsdmTimingType,
} from './usdm-types';

export const USDM_NO_SOA = 'the design carries no Schedule of Activities';

/** The schedule-derived USDM entities; each is named as unfilled when the design has no SoA. */
export const SOA_DERIVED_ENTITIES: readonly string[] = [
  'StudyEpoch',
  'Encounter',
  'Activity',
  'ScheduleTimeline / ScheduledActivityInstance',
  'StudyCell',
  'Timing',
];

export interface ScheduleResult {
  epochs: UsdmStudyEpoch[];
  encounters: UsdmEncounter[];
  activities: UsdmActivity[];
  cells: UsdmStudyCell[];
  timelines: UsdmScheduleTimeline[];
  /** True when at least one Timing was built: study days, windows and the baseline flag are then carried. */
  timed: boolean;
}

const TIMING_DECODE: Record<UsdmTimingType, string> = {
  fixed_reference: 'Fixed Reference',
  before: 'Before',
  after: 'After',
};

interface Sorted {
  epochsIn: SoaEpoch[];
  visitsIn: SoaVisit[];
  epochs: UsdmStudyEpoch[];
  encounters: UsdmEncounter[];
  activities: UsdmActivity[];
  activityIndex: ReturnType<typeof uniqueIndex>;
}

/** A visit with its column position. */
interface Placed {
  v: SoaVisit;
  i: number;
}

function byOrder<T extends { order: number }>(items: readonly T[] | undefined): T[] {
  return [...(items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Link an ordered list through previousId / nextId. */
function chain<T extends { id: string; previousId: string | null; nextId: string | null }>(items: T[]): T[] {
  items.forEach((item, i) => {
    item.previousId = i > 0 ? items[i - 1].id : null;
    item.nextId = i < items.length - 1 ? items[i + 1].id : null;
  });
  return items;
}

/** Map the Schedule of Activities onto USDM schedule entities. */
export function mapSchedule(
  soa: ScheduleOfActivities | undefined,
  arms: UsdmStudyArm[],
  elementByArm: Array<string | null>,
  ctx: UsdmContext,
): ScheduleResult {
  if (!soa) {
    ctx.unfilled.push(...SOA_DERIVED_ENTITIES.map(e => `${e}: ${USDM_NO_SOA}`));
    return { epochs: [], encounters: [], activities: [], cells: [], timelines: [], timed: false };
  }
  const epochsIn = byOrder(soa.epochs);
  const visitsIn = byOrder(soa.visits);
  const activitiesIn = byOrder(soa.activities);
  const epochs = chain(epochsIn.map(e => ({
    id: nextId(ctx, 'StudyEpoch'),
    instanceType: 'StudyEpoch' as const,
    name: e.name,
    type: usdmCode(e.kind, humanize(e.kind)),
    previousId: null,
    nextId: null,
  })));
  const encounters: UsdmEncounter[] = chain(visitsIn.map(v => ({
    id: nextId(ctx, 'Encounter'),
    instanceType: 'Encounter' as const,
    name: v.name,
    type: null,
    previousId: null,
    nextId: null,
    scheduledAtId: null,
  })));
  const activities: UsdmActivity[] = chain(activitiesIn.map(a => ({
    id: nextId(ctx, 'Activity'),
    instanceType: 'Activity' as const,
    name: a.name,
    previousId: null,
    nextId: null,
    childIds: [],
    definedProcedures: [] as [],
    biomedicalConceptIds: [] as [],
  })));
  const sorted: Sorted = { epochsIn, visitsIn, epochs, encounters, activities, activityIndex: uniqueIndex(activitiesIn, a => a.id) };
  const instances = mapInstances(soa, sorted, ctx);
  const timings = mapTimings(visitsIn, instances, encounters, ctx);
  const cells = mapCells(arms, sorted, elementByArm, ctx);
  reportEmpty(sorted, instances.length, ctx);
  const timelines: UsdmScheduleTimeline[] = [];
  if (instances.length > 0) {
    const id = nextId(ctx, 'ScheduleTimeline');
    timelines.push({ id, instanceType: 'ScheduleTimeline', name: id, mainTimeline: true, entryId: instances[0].id, instances, timings });
  }
  return { epochs, encounters, activities, cells, timelines, timed: timings.length > 0 };
}

function reportEmpty(s: Sorted, instanceCount: number, ctx: UsdmContext): void {
  if (s.epochs.length === 0) ctx.unfilled.push('StudyEpoch: the Schedule of Activities defines no epochs');
  if (s.encounters.length === 0) ctx.unfilled.push('Encounter: the Schedule of Activities defines no visits');
  if (s.activities.length === 0) ctx.unfilled.push('Activity: the Schedule of Activities defines no activities');
  if (instanceCount === 0) ctx.unfilled.push('ScheduleTimeline / ScheduledActivityInstance: the Schedule of Activities defines no visits to schedule');
  if (s.encounters.length > 0) ctx.unfilled.push('Encounter.type / contactModes / environmentalSettings: not recorded');
  if (s.activities.length > 0) {
    ctx.unfilled.push('Activity.definedProcedures / biomedicalConceptIds: the design records no procedures or biomedical concepts');
  }
}

/** One instance per visit, listing the activities its cells schedule. Unresolvable cells are reported, not placed. */
function mapInstances(soa: ScheduleOfActivities, s: Sorted, ctx: UsdmContext): UsdmScheduledActivityInstance[] {
  const epochIndex = uniqueIndex(s.epochsIn, e => e.id);
  const visitIndex = uniqueIndex(s.visitsIn, v => v.id);
  const perVisit: Array<Set<number>> = s.visitsIn.map(() => new Set<number>());
  const cells = soa.cells ?? [];
  const dangling: string[] = [];
  for (const c of cells) {
    const a = s.activityIndex.get(c.activityId);
    const v = visitIndex.get(c.visitId);
    if (a === undefined || v === undefined) dangling.push(`${c.activityId} × ${c.visitId}`);
    else perVisit[v].add(a);
  }
  if (dangling.length > 0) {
    ctx.unmapped.push(
      `scheduleOfActivities.cells (${dangling.length} of ${cells.length}): reference an activity or visit id the schedule does not define exactly once, so they are not placed: ${dangling.join(', ')}`,
    );
  }
  const conditional = cells.filter(c => c.state !== 'performed').length;
  if (conditional > 0) {
    ctx.unmapped.push(
      `scheduleOfActivities.cells[].state (${conditional} of ${cells.length}): conditional/optional scheduling has no home in this mapping; the activity is listed on its instance without the condition`,
    );
  }
  const badEpoch: string[] = [];
  const instances = s.visitsIn.map((v, i) => {
    const id = nextId(ctx, 'ScheduledActivityInstance');
    const ep = epochIndex.get(v.epochId);
    if (ep === undefined) badEpoch.push(`${id} (visit "${v.name}", epoch "${v.epochId}")`);
    return {
      id,
      instanceType: 'ScheduledActivityInstance' as const,
      name: id,
      encounterId: s.encounters[i].id,
      epochId: ep === undefined ? null : s.epochs[ep].id,
      activityIds: [...perVisit[i]].sort((x, y) => x - y).map(a => s.activities[a].id),
    };
  });
  if (badEpoch.length > 0) {
    ctx.unfilled.push(`ScheduledActivityInstance.epochId: ${badEpoch.join('; ')} names an epoch the schedule does not define exactly once`);
  }
  return instances;
}

// ─── Timings ────────────────────────────────────────────────────────────────

/** Study day → zero-based day index under the no-day-0 convention (day 1 → 0, day −1 → −1). */
function dayIndex(d: number): number {
  return d > 0 ? d - 1 : d;
}

function pickAnchor(dated: Placed[], ctx: UsdmContext): Placed | null {
  const baseline = dated.filter(x => x.v.isBaseline === true);
  if (baseline.length === 1) return baseline[0];
  if (baseline.length > 1) {
    ctx.unfilled.push(`Timing: ${baseline.length} dated visits are marked baseline, so the anchor is ambiguous; no timing is computed`);
    return null;
  }
  const day1 = dated.filter(x => x.v.studyDay === 1);
  if (day1.length === 1) return day1[0];
  ctx.unfilled.push('Timing: no dated visit is marked baseline and no single visit falls on study day 1, so there is no anchor; no timing is computed');
  return null;
}

function buildTiming(x: Placed, anchor: Placed, instances: UsdmScheduledActivityInstance[], ctx: UsdmContext): UsdmTiming {
  const id = nextId(ctx, 'Timing');
  const day = x.v.studyDay as number;
  const offset = dayIndex(day) - dayIndex(anchor.v.studyDay as number);
  const kind: UsdmTimingType = x === anchor ? 'fixed_reference' : offset < 0 ? 'before' : 'after';
  const w = x.v.windowDays;
  const window = typeof w === 'number' && Number.isInteger(w) && w >= 0 ? w : null;
  return {
    id,
    instanceType: 'Timing',
    name: id,
    type: usdmCode(kind, TIMING_DECODE[kind]),
    value: `P${Math.abs(offset)}D`,
    valueLabel: `Day ${day}`,
    relativeFromScheduledInstanceId: instances[x.i].id,
    relativeToScheduledInstanceId: instances[anchor.i].id,
    windowLower: window === null ? null : `P${window}D`,
    windowUpper: window === null ? null : `P${window}D`,
    windowLabel: window === null ? null : `±${window} days`,
  };
}

function mapTimings(
  visits: SoaVisit[],
  instances: UsdmScheduledActivityInstance[],
  encounters: UsdmEncounter[],
  ctx: UsdmContext,
): UsdmTiming[] {
  const scheduled = visits.map((v, i) => ({ v, i })).filter(x => x.v.unscheduled !== true);
  const dated = scheduled.filter(x => Number.isInteger(x.v.studyDay));
  if (dated.length === 0) {
    ctx.unfilled.push('Timing: no scheduled visit records a study day; no timing is invented');
    return [];
  }
  if (dated.some(x => x.v.studyDay === 0)) {
    ctx.unfilled.push("Timing: a visit records study day 0, which the design model's day-1 convention does not define; no offsets are computed");
    return [];
  }
  const anchor = pickAnchor(dated, ctx);
  if (!anchor) return [];
  const undated = scheduled.filter(x => !Number.isInteger(x.v.studyDay)).map(x => encounters[x.i].id);
  if (undated.length > 0) {
    ctx.unfilled.push(`Timing: ${undated.join(', ')} carry no usable study day; no timing is invented for them`);
  }
  const timings = dated.map(x => buildTiming(x, anchor, instances, ctx));
  const byVisit = new Map<number, UsdmTiming>();
  dated.forEach((x, k) => {
    encounters[x.i].scheduledAtId = timings[k].id;
    byVisit.set(x.i, timings[k]);
  });
  ctx.unfilled.push('Timing.relativeToFrom: the design does not record start/end anchoring of visit timings');
  reportTimingLeftovers(visits, byVisit, anchor, ctx);
  return timings;
}

/** Once timings exist, report the per-visit day, window and baseline values no Timing carries. */
function reportTimingLeftovers(visits: SoaVisit[], byVisit: Map<number, UsdmTiming>, anchor: Placed, ctx: UsdmContext): void {
  const n = visits.length;
  const days = visits.filter((v, i) => typeof v.studyDay === 'number' && !byVisit.has(i)).length;
  const windows = visits.filter((v, i) => typeof v.windowDays === 'number' && byVisit.get(i)?.windowLower == null).length;
  const baselines = visits.filter((v, i) => v.isBaseline === true && i !== anchor.i).length;
  if (days > 0) {
    ctx.unmapped.push(`scheduleOfActivities.visits[].studyDay (${days} of ${n}): unscheduled or non-integer, so no Timing carries it`);
  }
  if (windows > 0) {
    ctx.unmapped.push(`scheduleOfActivities.visits[].windowDays (${windows} of ${n}): the visit has no Timing, or the window is not a non-negative integer`);
  }
  if (baselines > 0) {
    ctx.unmapped.push(`scheduleOfActivities.visits[].isBaseline (${baselines} of ${n}): marked baseline but not the timing anchor`);
  }
}

// ─── Cells ──────────────────────────────────────────────────────────────────

/** The full arm × epoch grid (the schedule is common to all arms); an arm's element sits in its treatment-epoch cells. */
function mapCells(arms: UsdmStudyArm[], s: Sorted, elementByArm: Array<string | null>, ctx: UsdmContext): UsdmStudyCell[] {
  const cells = arms.flatMap((arm, ai) =>
    s.epochs.map((ep, ei) => {
      const element = elementByArm[ai];
      return {
        id: nextId(ctx, 'StudyCell'),
        instanceType: 'StudyCell' as const,
        armId: arm.id,
        epochId: ep.id,
        elementIds: s.epochsIn[ei].kind === 'treatment' && element ? [element] : [],
      };
    }),
  );
  if (cells.length === 0) {
    ctx.unfilled.push(`StudyCell: no arm × epoch grid (${arms.length} arms, ${s.epochs.length} epochs)`);
    return cells;
  }
  if (!s.epochsIn.some(e => e.kind === 'treatment')) {
    ctx.unfilled.push('StudyCell.elementIds: no epoch is of kind treatment, so no cell carries an element');
  }
  if (s.epochsIn.some(e => e.kind !== 'treatment')) {
    ctx.unfilled.push('StudyElement (non-treatment epochs): the design records no screening, run-in or follow-up element; those cells carry none');
  }
  return cells;
}
