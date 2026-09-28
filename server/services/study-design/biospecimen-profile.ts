/**
 * Biospecimen profile — what the Schedule of Activities collects, whether each
 * collection is specified well enough to write a lab manual from, and how much
 * blood a participant gives, per visit, in total and in any 8-week window.
 *
 * ## The industry need
 * Every protocol with PK, PD or biomarker sampling ships a laboratory manual
 * derived from the specimen type, volume, processing and storage of each
 * collection, and every ethics committee asks how much blood a participant
 * gives. The SoA model had `pk` / `pd` / `biomarker` activities with no specimen
 * attributes at all, so neither could be derived. `SoaActivity.specimen` is the
 * additive attribute; this module is the profile over it.
 *
 * ## The reference points, and what they are not
 * OHRP's expedited-review category (2) (63 FR 60364, 1998; 45 CFR 46.110,
 * 21 CFR 56.110) admits blood samples by finger stick, heel stick, ear stick or
 * venipuncture: from healthy, non-pregnant adults who weigh at least 110 pounds
 * (about 50 kg), up to 550 mL in an 8-week period; from other adults and
 * children, the lesser of 50 mL or 3 mL/kg in an 8-week period; in both, no
 * more often than twice a week. These are ELIGIBILITY thresholds for expedited
 * review of minimal-risk research — not safety limits, and not a bar a drug
 * trial must clear (most are reviewed by the full board anyway). The design
 * does not record whether participants are healthy volunteers, so the profile
 * does not pick one: it reports the volumes against BOTH reference points, each
 * labelled with the population it applies to, and raises no gap for exceeding
 * either. The 3 mL/kg limb needs the minimum participant weight, which the
 * design does not carry: only exceeding its 50 mL cap can be shown, so a volume
 * at or under 50 mL is NOT KNOWN against it, never "within".
 *
 * ## How collections are counted (an engine rule, labelled in the output)
 * The model records a volume PER COLLECTION and no collection count, so each
 * activity × visit cell counts as ONE collection. Serial samples within one
 * visit (a PK profile: pre-dose, 0.5 h, 1 h …) are not counted unless each is
 * its own activity. `countingRule` states this, and every scheduled PK, PD or
 * biomarker draw carries a note saying so.
 *
 * ## The honesty contract
 *  - A sampling activity (pk, pd, biomarker) with no specimen is UNSPECIFIED,
 *    never assumed to be a blood draw of some usual volume.
 *  - ONE rule decides whether a volume is recorded: a finite number > 0. A
 *    string, zero, a negative or a non-finite value is not specified — it
 *    contributes 0 mL and makes the totals lower bounds; it is never summed.
 *  - A draw with no volume makes the totals it enters lower bounds (a
 *    performed draw at a scheduled visit: every figure; a conditional,
 *    optional or unscheduled one: the upper bound only). A lower bound can
 *    only prove a reference point "exceeded"; otherwise it is NOT KNOWN (null).
 *    A defined blood activity that no cell schedules affects no total.
 *  - The grid is read by the rules the other SoA consumers apply: a cell
 *    counts only when its activity and visit ids each resolve exactly once
 *    (`usdm-schedule.ts`), and a repeated activity × visit intersection counts
 *    once, in its first listing (`burden-model.ts`). Both are named in the
 *    gaps; a blood cell that cannot be placed makes the totals lower bounds.
 *  - Conditional and optional draws, and every draw at an UNSCHEDULED visit
 *    (flagged `unscheduled`, or in an epoch of kind `unscheduled` — early
 *    termination, as-needed), count only in the upper bound. An unscheduled
 *    visit cannot be placed in time: its draws are in no 8-week or weekly
 *    figure, so the upper-bound reference points can then only show
 *    "exceeded", and the upper-bound total counts each such visit once.
 *  - The twice-weekly frequency counts visits with a PERFORMED draw; the
 *    count with conditional and optional draws is a separate upper bound.
 *  - Windows are measured in consecutive calendar days under the design
 *    model's day-1 convention with no day 0 (the rule `usdm-schedule.ts`
 *    applies): day −1 is followed by day 1. A recorded day 0, a non-integer or
 *    an absent study day is not usable; a scheduled draw at such a visit makes
 *    the scheduled window figures null, any draw there the upper-bound ones,
 *    each with a gap.
 *  - Pure and total: no model, no clock, no DB; a malformed grid is reported,
 *    never thrown on.
 *
 * @module server/services/study-design/biospecimen-profile
 */

import type { ScheduleOfActivities, SoaActivity, SoaActivityCategory, SoaCell, SoaSpecimen, SoaVisit, StudyDesign } from './study-design-types';
import { present } from './usdm-types';

export const BIOSPECIMEN_BASIS =
  'OHRP expedited review category (2), 63 FR 60364 (1998), under 45 CFR 46.110 / 21 CFR 56.110 — blood-draw volume and frequency ' +
  'thresholds for expedited review; ICH E6(R3) — specimen handling specified in the protocol';

export const ADULT_EIGHT_WEEK_ML = 550;
export const MINOR_EIGHT_WEEK_CAP_ML = 50;
export const MAX_DRAWS_PER_WEEK = 2;
const WINDOW_DAYS = 56;
const WEEK_DAYS = 7;

/** Activities that sample something and so must say what. */
const SAMPLING_CATEGORIES: ReadonlySet<SoaActivityCategory> = new Set(['pk', 'pd', 'biomarker']);
const CELL_STATES: ReadonlySet<unknown> = new Set(['performed', 'conditional', 'optional']);

export const COUNTING_RULE =
  'one collection per activity × visit cell, at the activity’s recorded volume per collection; serial samples within one visit ' +
  '(a PK profile, say) are not counted unless each is its own activity';

export type BiospecimenStatus = 'rendered' | 'partial' | 'missing';

export interface VolumeReferencePoint {
  appliesTo: string;
  eightWeekLimitMl: number;
  /** Why this reference point can never be shown "not exceeded" from the design, or null. */
  withinUnknownBecause: string | null;
  /** null = not known (a volume, a study day or a weight is missing), never "within". */
  exceededScheduled: boolean | null;
  exceededUpperBound: boolean | null;
}

export interface SpecimenRow {
  activityId: string;
  name: string;
  category: SoaActivityCategory;
  specimen: SoaSpecimen | null;
  /** What the lab manual needs and this row does not carry. */
  unspecified: string[];
}

export interface VisitBloodVolume {
  visitId: string;
  name: string;
  /** The recorded study day; null when none is recorded. Day 0 is shown as recorded but is not usable. */
  studyDay: number | null;
  /** Unscheduled / as-needed (flagged, or in an `unscheduled` epoch): its draws cannot be placed in time. */
  unscheduled: boolean;
  /** Performed blood draws at a scheduled visit, mL (0 at an unscheduled visit). */
  scheduledMl: number;
  /** Conditional or optional draws at a scheduled visit, and every draw at an unscheduled one, mL — upper bound only. */
  conditionalMl: number;
  scheduledDraws: number;
  conditionalDraws: number;
}

export interface BloodVolumeProfile {
  /** How collections are counted; see the module header. */
  countingRule: string;
  perVisit: VisitBloodVolume[];
  totalScheduledMl: number;
  /** Scheduled plus conditional, optional and unscheduled draws; each unscheduled visit counted once. */
  totalUpperBoundMl: number;
  /** Draws at unscheduled visits, each visit counted once. In no window figure. */
  unscheduledMl: number;
  /** Some placed draw records no volume or some blood cell cannot be placed: the upper-bound figures are lower bounds. */
  totalsAreLowerBounds: boolean;
  /** The same for the scheduled figures: a performed draw at a scheduled visit records no volume or cannot be placed. */
  scheduledIsLowerBound: boolean;
  maxEightWeekScheduledMl: number | null;
  /** Worst 8-week window over draws at scheduled visits, conditional and optional included. */
  maxEightWeekUpperBoundMl: number | null;
  /** Most visits with a performed draw in any 7 consecutive days. */
  maxDrawVisitsInAnyWeek: number | null;
  /** Most visits with any draw (conditional and optional included) in any 7 consecutive days. */
  maxDrawVisitsInAnyWeekUpperBound: number | null;
  /** OHRP expedited-review category (2) reference points; see the module header for what they are not. */
  referencePoints: VolumeReferencePoint[];
  /** More than twice-weekly performed-draw visits in some week; null when not computable or not known. */
  moreThanTwiceWeekly: boolean | null;
  meaning: string;
}

export interface BiospecimenProfile {
  status: BiospecimenStatus;
  gaps: string[];
  notes: string[];
  specimens: SpecimenRow[];
  bloodVolume: BloodVolumeProfile | null;
  basis: string;
}

const REFERENCE_MEANING =
  'OHRP expedited-review category (2) thresholds for minimal-risk research — not safety limits. Above them, review is by the full board with a justification of the volume.';

const REFERENCES: ReadonlyArray<Pick<VolumeReferencePoint, 'appliesTo' | 'eightWeekLimitMl' | 'withinUnknownBecause'>> = [
  { appliesTo: 'healthy, non-pregnant adults who weigh at least 110 lb (about 50 kg)', eightWeekLimitMl: ADULT_EIGHT_WEEK_ML, withinUnknownBecause: null },
  {
    appliesTo: 'other adults and children (the lesser of 50 mL or 3 mL/kg)',
    eightWeekLimitMl: MINOR_EIGHT_WEEK_CAP_ML,
    withinUnknownBecause: 'the limit is the lesser of 50 mL and 3 mL/kg, and the design records no minimum participant weight: only exceeding 50 mL can be shown',
  },
];

// ─── Reading the grid ────────────────────────────────────────────────────────

/** The one rule for a recorded volume: a finite number of mL above zero. */
function validVolume(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Study day → zero-based index under the no-day-0 convention (day 1 → 0,
 * day −1 → −1), the rule `usdm-schedule.ts` applies; null when the day is not
 * usable (absent, not an integer, or day 0).
 */
function dayIndexOf(studyDay: unknown): number | null {
  if (typeof studyDay !== 'number' || !Number.isInteger(studyDay) || studyDay === 0) return null;
  return studyDay > 0 ? studyDay - 1 : studyDay;
}

function listOf<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === 'object' && x !== null) as T[]) : [];
}

const byOrder = (a: { order: number; id: string }, b: { order: number; id: string }) =>
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const isBlood = (a: SoaActivity) => typeof a.specimen === 'object' && a.specimen !== null && a.specimen.type === 'blood';

function idCounts(items: Array<{ id: unknown }>): Map<unknown, number> {
  const counts = new Map<unknown, number>();
  for (const x of items) counts.set(x.id, (counts.get(x.id) ?? 0) + 1);
  return counts;
}

interface BloodCell {
  activity: SoaActivity;
  visit: SoaVisit;
  performed: boolean;
}

interface BloodGrid {
  /** Visits whose id resolves exactly once, in column order. */
  visits: SoaVisit[];
  /** Resolved blood cells, one per activity × visit (the first listing). */
  cells: BloodCell[];
  /** A blood cell could not be placed: every total may be short. */
  unplaced: boolean;
  /** A possibly-performed blood cell could not be placed or classified: the scheduled figures may be short. */
  scheduledUnsure: boolean;
  defects: string[];
}

function bloodGrid(soa: ScheduleOfActivities): BloodGrid {
  const activities = listOf<SoaActivity>(soa.activities);
  const visits = listOf<SoaVisit>(soa.visits);
  const aCount = idCounts(activities);
  const vCount = idCounts(visits);
  const blood = new Map(activities.filter(isBlood).map((a) => [a.id, a] as const));
  const visitById = new Map(visits.map((v) => [v.id, v] as const));
  const grid: BloodGrid = { visits: visits.filter((v) => vCount.get(v.id) === 1).sort(byOrder), cells: [], unplaced: false, scheduledUnsure: false, defects: [] };
  const seen = new Map<string, number>();
  for (const c of listOf<SoaCell>(soa.cells)) {
    const a = blood.get(c.activityId);
    if (!a) continue;
    const known = CELL_STATES.has(c.state);
    if (aCount.get(c.activityId) !== 1 || vCount.get(c.visitId) !== 1) {
      grid.defects.push(`${a.name} at visit "${String(c.visitId)}": the activity or visit id is not defined exactly once, so this draw is not counted and the totals are lower bounds`);
      grid.unplaced = true;
      grid.scheduledUnsure ||= c.state === 'performed' || !known;
      continue;
    }
    const key = `${c.activityId}\u0001${c.visitId}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) continue;
    if (!known) {
      grid.defects.push(`${a.name} at ${visitById.get(c.visitId)?.name}: cell state "${String(c.state)}" is not performed, conditional or optional, so it counts in the upper bound only and the scheduled figures are lower bounds`);
      grid.scheduledUnsure = true;
    }
    grid.cells.push({ activity: a, visit: visitById.get(c.visitId) as SoaVisit, performed: c.state === 'performed' });
  }
  for (const [key, n] of seen) {
    if (n < 2) continue;
    const [aId, vId] = key.split('\u0001');
    grid.defects.push(`${blood.get(aId)?.name} at ${visitById.get(vId)?.name} is listed ${n} times: counted once, in the first listing's state`);
  }
  return grid;
}

// ─── Specimens ───────────────────────────────────────────────────────────────

function unspecifiedOf(a: SoaActivity): string[] {
  const s = typeof a.specimen === 'object' && a.specimen !== null ? a.specimen : null;
  if (!s) return SAMPLING_CATEGORIES.has(a.category) ? ['specimen type, volume, processing and storage'] : [];
  const out: string[] = [];
  if (s.type === 'blood' && !validVolume(s.volumeMl)) out.push('volume');
  if (!present(s.processing)) out.push('processing');
  if (!present(s.storage)) out.push('storage');
  return out;
}

function specimenRows(soa: ScheduleOfActivities): SpecimenRow[] {
  return listOf<SoaActivity>(soa.activities)
    .sort(byOrder)
    .filter((a) => a.specimen || SAMPLING_CATEGORIES.has(a.category))
    .map((a) => ({ activityId: a.id, name: a.name, category: a.category, specimen: a.specimen ?? null, unspecified: unspecifiedOf(a) }));
}

// ─── Blood volume ────────────────────────────────────────────────────────────

function unscheduledVisits(soa: ScheduleOfActivities): (v: SoaVisit) => boolean {
  const unscheduledEpochs = new Set(listOf<{ id: string; kind: string }>(soa.epochs).filter((e) => e.kind === 'unscheduled').map((e) => e.id));
  return (v) => v.unscheduled === true || unscheduledEpochs.has(v.epochId);
}

const mlOf = (cells: BloodCell[]) => cells.reduce((n, c) => n + (validVolume(c.activity.specimen?.volumeMl) ? (c.activity.specimen?.volumeMl as number) : 0), 0);

function perVisitVolumes(grid: BloodGrid, isUnscheduled: (v: SoaVisit) => boolean): VisitBloodVolume[] {
  return grid.visits.map((v) => {
    const unscheduled = isUnscheduled(v);
    const here = grid.cells.filter((c) => c.visit === v);
    const scheduled = unscheduled ? [] : here.filter((c) => c.performed);
    const other = here.filter((c) => !scheduled.includes(c));
    return {
      visitId: v.id,
      name: v.name,
      studyDay: typeof v.studyDay === 'number' && Number.isFinite(v.studyDay) ? v.studyDay : null,
      unscheduled,
      scheduledMl: mlOf(scheduled),
      conditionalMl: mlOf(other),
      scheduledDraws: scheduled.length,
      conditionalDraws: other.length,
    };
  });
}

/** The largest total over any `days` consecutive days (no day 0), or null when a contributing visit has no usable day. */
function maxInWindow(rows: VisitBloodVolume[], days: number, value: (v: VisitBloodVolume) => number): number | null {
  const placed = rows.map((v) => ({ v, idx: dayIndexOf(v.studyDay) }));
  if (placed.some((p) => p.idx === null)) return null;
  let max = 0;
  for (const start of placed) {
    const s = start.idx as number;
    const total = placed.filter((p) => (p.idx as number) >= s && (p.idx as number) < s + days).reduce((n, p) => n + value(p.v), 0);
    max = Math.max(max, total);
  }
  return max;
}

/** Exceeded, not exceeded, or not known — a lower bound can only ever prove "exceeded". */
function exceeded(value: number | null, limit: number, lowerBound: boolean): boolean | null {
  if (value === null) return null;
  if (value > limit) return true;
  return lowerBound ? null : false;
}

function lowerBoundsOf(grid: BloodGrid, perVisit: VisitBloodVolume[]) {
  const unscheduledIds = new Set(perVisit.filter((v) => v.unscheduled).map((v) => v.visitId));
  const noVolume = grid.cells.filter((c) => !validVolume(c.activity.specimen?.volumeMl));
  const noVolumeScheduled = noVolume.some((c) => c.performed && !unscheduledIds.has(c.visit.id));
  return {
    noVolumeScheduled,
    noVolumeOther: noVolume.length > 0 && !noVolumeScheduled,
    scheduledIsLowerBound: noVolumeScheduled || grid.scheduledUnsure,
    totalsAreLowerBounds: noVolume.length > 0 || grid.unplaced,
  };
}

function bloodVolumeOf(grid: BloodGrid, perVisit: VisitBloodVolume[]): BloodVolumeProfile {
  const placeable = perVisit.filter((v) => !v.unscheduled);
  const withScheduled = placeable.filter((v) => v.scheduledDraws > 0);
  const withAny = placeable.filter((v) => v.scheduledDraws + v.conditionalDraws > 0);
  const lb = lowerBoundsOf(grid, perVisit);
  const unscheduledDraws = perVisit.some((v) => v.unscheduled && v.conditionalDraws > 0);
  const eightScheduled = maxInWindow(withScheduled, WINDOW_DAYS, (v) => v.scheduledMl);
  const eightUpper = maxInWindow(withAny, WINDOW_DAYS, (v) => v.scheduledMl + v.conditionalMl);
  const weekScheduled = maxInWindow(withScheduled, WEEK_DAYS, () => 1);
  return {
    countingRule: COUNTING_RULE,
    perVisit,
    totalScheduledMl: perVisit.reduce((n, v) => n + v.scheduledMl, 0),
    totalUpperBoundMl: perVisit.reduce((n, v) => n + v.scheduledMl + v.conditionalMl, 0),
    unscheduledMl: perVisit.filter((v) => v.unscheduled).reduce((n, v) => n + v.conditionalMl, 0),
    totalsAreLowerBounds: lb.totalsAreLowerBounds,
    scheduledIsLowerBound: lb.scheduledIsLowerBound,
    maxEightWeekScheduledMl: eightScheduled,
    maxEightWeekUpperBoundMl: eightUpper,
    maxDrawVisitsInAnyWeek: weekScheduled,
    maxDrawVisitsInAnyWeekUpperBound: maxInWindow(withAny, WEEK_DAYS, () => 1),
    referencePoints: REFERENCES.map((r) => ({
      ...r,
      exceededScheduled: exceeded(eightScheduled, r.eightWeekLimitMl, lb.scheduledIsLowerBound || r.withinUnknownBecause !== null),
      exceededUpperBound: exceeded(eightUpper, r.eightWeekLimitMl, lb.totalsAreLowerBounds || unscheduledDraws || r.withinUnknownBecause !== null),
    })),
    moreThanTwiceWeekly: exceeded(weekScheduled, MAX_DRAWS_PER_WEEK, grid.scheduledUnsure),
    meaning: REFERENCE_MEANING,
  };
}

// ─── Gaps and notes ──────────────────────────────────────────────────────────

const names = (rows: VisitBloodVolume[]) => rows.map((v) => v.name).join(', ');

function timingGaps(perVisit: VisitBloodVolume[]): string[] {
  const placeable = perVisit.filter((v) => !v.unscheduled);
  const undated = (v: VisitBloodVolume) => dayIndexOf(v.studyDay) === null;
  const scheduled = placeable.filter((v) => v.scheduledDraws > 0 && undated(v));
  const other = placeable.filter((v) => v.scheduledDraws === 0 && v.conditionalDraws > 0 && undated(v));
  const gaps = placeable
    .filter((v) => v.studyDay === 0 && v.scheduledDraws + v.conditionalDraws > 0)
    .map((v) => `${v.name} records study day 0, which the design model's day-1 convention (no day 0) does not define: it is treated as having no study day`);
  if (scheduled.length) gaps.push(`a visit with a scheduled blood draw has no usable study day (${names(scheduled)}): the 8-week and weekly figures cannot be computed`);
  else if (other.length) gaps.push(`a visit with only conditional or optional blood draws has no usable study day (${names(other)}): the upper-bound 8-week and weekly figures cannot be computed`);
  return gaps;
}

function bloodGaps(grid: BloodGrid, b: BloodVolumeProfile): string[] {
  const lb = lowerBoundsOf(grid, b.perVisit);
  const gaps = [...grid.defects];
  if (lb.noVolumeScheduled) gaps.push('a scheduled blood draw records no volume: the scheduled and upper-bound figures are lower bounds, and a reference point they do not already exceed is not known');
  if (lb.noVolumeOther) gaps.push('a conditional, optional or unscheduled blood draw records no volume: the upper-bound figures are lower bounds');
  return [...gaps, ...timingGaps(b.perVisit)];
}

function referenceNotes(b: BloodVolumeProfile): string[] {
  const notes: string[] = [];
  for (const r of b.referencePoints) {
    if (r.exceededScheduled) notes.push(`scheduled draws reach ${b.maxEightWeekScheduledMl} mL in an 8-week window, above the ${r.eightWeekLimitMl} mL reference for ${r.appliesTo}`);
    else if (r.exceededUpperBound) notes.push(`with conditional and optional draws, up to ${b.maxEightWeekUpperBoundMl} mL could fall in an 8-week window, above the ${r.eightWeekLimitMl} mL reference for ${r.appliesTo}`);
  }
  if (b.moreThanTwiceWeekly) notes.push(`${b.maxDrawVisitsInAnyWeek} visits with a scheduled draw fall within one week, more than the twice-weekly reference`);
  else if ((b.maxDrawVisitsInAnyWeekUpperBound ?? 0) > MAX_DRAWS_PER_WEEK) {
    notes.push(`with conditional and optional draws, up to ${b.maxDrawVisitsInAnyWeekUpperBound} draw visits could fall within one week, more than the twice-weekly reference`);
  }
  return notes;
}

function bloodNotes(grid: BloodGrid, b: BloodVolumeProfile): string[] {
  const notes = referenceNotes(b);
  const unscheduled = b.perVisit.filter((v) => v.unscheduled && v.conditionalDraws > 0);
  if (unscheduled.length) {
    notes.push(
      `draws at unscheduled visits (${names(unscheduled)}) cannot be placed in time: they are in no 8-week or weekly figure, so the upper-bound ` +
        `reference points can show only "exceeded"; the upper-bound total counts each unscheduled visit once (${b.unscheduledMl} mL)`,
    );
  }
  const serial = [...new Set(grid.cells.filter((c) => SAMPLING_CATEGORIES.has(c.activity.category)).map((c) => c.activity))].sort(byOrder);
  for (const a of serial) notes.push(`${a.name}: counted as one collection per visit; serial samples within a visit are not in the totals`);
  return notes;
}

/** Profile the design's specimens and blood volume. Every figure is arithmetic on recorded volumes. */
export function profileBiospecimens(design: StudyDesign): BiospecimenProfile {
  const soa = design.scheduleOfActivities;
  if (!soa) {
    return { status: 'missing', gaps: ['no Schedule of Activities: nothing collected can be profiled'], notes: [], specimens: [], bloodVolume: null, basis: BIOSPECIMEN_BASIS };
  }
  const specimens = specimenRows(soa);
  const gaps = specimens.filter((s) => s.unspecified.length).map((s) => `${s.name}: ${s.unspecified.join(', ')} not specified`);
  const hasBlood = listOf<SoaActivity>(soa.activities).some(isBlood);
  const grid = hasBlood ? bloodGrid(soa) : null;
  const bloodVolume = grid ? bloodVolumeOf(grid, perVisitVolumes(grid, unscheduledVisits(soa))) : null;
  const all = grid && bloodVolume ? [...gaps, ...bloodGaps(grid, bloodVolume)] : gaps;
  const notes = grid && bloodVolume ? bloodNotes(grid, bloodVolume) : [];
  return { status: all.length ? 'partial' : 'rendered', gaps: all, notes, specimens, bloodVolume, basis: BIOSPECIMEN_BASIS };
}
