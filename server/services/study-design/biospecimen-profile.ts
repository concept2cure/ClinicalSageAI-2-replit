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
 * 21 CFR 56.110) admits blood by venipuncture from healthy non-pregnant adults
 * of ≥ 50 kg up to 550 mL in 8 weeks; from other adults and from children, the
 * lesser of 50 mL or 3 mL/kg in 8 weeks; in both, no more than twice a week.
 * These are ELIGIBILITY thresholds for expedited review of minimal-risk
 * research — not safety limits, and not a bar a drug trial must clear (most
 * are reviewed by the full board anyway). The design does not record whether
 * participants are healthy volunteers, so the profile does not pick one: it
 * reports the volumes against BOTH reference points, each labelled with the
 * population it applies to, and raises no gap for exceeding either. The
 * 3 mL/kg limb needs the minimum participant weight, which the design does not
 * carry; only its 50 mL cap is compared, and that is said.
 *
 * ## The honesty contract
 *  - A sampling activity (pk, pd, biomarker) with no specimen is UNSPECIFIED,
 *    never assumed to be a blood draw of some usual volume.
 *  - A blood draw with no volume makes every total a lower bound; a reference
 *    point is then reported exceeded only if the lower bound already exceeds
 *    it, and otherwise NOT KNOWN (null) — never "within".
 *  - Conditional and optional draws are totalled separately as an upper bound.
 *  - The 8-week window and the twice-a-week frequency need a study day on every
 *    visit with a draw; without them they are null with a gap.
 *  - Pure and total: no model, no clock, no DB.
 *
 * @module server/services/study-design/biospecimen-profile
 */

import type { ScheduleOfActivities, SoaActivity, SoaActivityCategory, SoaSpecimen, StudyDesign } from './study-design-types';

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

export type BiospecimenStatus = 'rendered' | 'partial' | 'missing';

export interface VolumeReferencePoint {
  appliesTo: string;
  eightWeekLimitMl: number;
  /** null = not known (a volume or a study day is missing), never "within". */
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
  studyDay: number | null;
  /** Performed (scheduled) blood draws at this visit, mL. */
  scheduledMl: number;
  /** Conditional or optional draws at this visit, mL — counted only in the upper bound. */
  conditionalMl: number;
  draws: number;
}

export interface BloodVolumeProfile {
  perVisit: VisitBloodVolume[];
  totalScheduledMl: number;
  totalUpperBoundMl: number;
  /** True when some blood draw records no volume: every total is then a lower bound. */
  totalsAreLowerBounds: boolean;
  maxEightWeekScheduledMl: number | null;
  maxEightWeekUpperBoundMl: number | null;
  maxDrawVisitsInAnyWeek: number | null;
  /** OHRP expedited-review category (2) reference points; see the module header for what they are not. */
  referencePoints: VolumeReferencePoint[];
  /** More than twice-weekly draw visits in some week; null when not computable. */
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

function unspecifiedOf(a: SoaActivity): string[] {
  const s = a.specimen;
  if (!s) return SAMPLING_CATEGORIES.has(a.category) ? ['specimen type, volume, processing and storage'] : [];
  const out: string[] = [];
  if (s.type === 'blood' && !(typeof s.volumeMl === 'number' && s.volumeMl > 0)) out.push('volume');
  if (!s.processing?.trim()) out.push('processing');
  if (!s.storage?.trim()) out.push('storage');
  return out;
}

function specimenRows(soa: ScheduleOfActivities): SpecimenRow[] {
  return [...soa.activities]
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((a) => a.specimen || SAMPLING_CATEGORIES.has(a.category))
    .map((a) => ({ activityId: a.id, name: a.name, category: a.category, specimen: a.specimen ?? null, unspecified: unspecifiedOf(a) }));
}

function perVisitVolumes(soa: ScheduleOfActivities): VisitBloodVolume[] {
  const blood = new Map(soa.activities.filter((a) => a.specimen?.type === 'blood').map((a) => [a.id, a.specimen?.volumeMl ?? 0]));
  return [...soa.visits]
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((v) => {
      const cells = soa.cells.filter((c) => c.visitId === v.id && blood.has(c.activityId));
      const sum = (state: (s: string) => boolean) => cells.filter((c) => state(c.state)).reduce((n, c) => n + (blood.get(c.activityId) ?? 0), 0);
      return {
        visitId: v.id,
        name: v.name,
        studyDay: typeof v.studyDay === 'number' ? v.studyDay : null,
        scheduledMl: sum((s) => s === 'performed'),
        conditionalMl: sum((s) => s !== 'performed'),
        draws: cells.length,
      };
    });
}

/** The largest total over any window of `days` consecutive study days, or null when a draw visit has no study day. */
function maxInWindow(visits: VisitBloodVolume[], days: number, value: (v: VisitBloodVolume) => number): number | null {
  const withDraws = visits.filter((v) => v.draws > 0);
  if (withDraws.some((v) => v.studyDay === null)) return null;
  let max = 0;
  for (const start of withDraws) {
    const total = withDraws
      .filter((v) => (v.studyDay as number) >= (start.studyDay as number) && (v.studyDay as number) < (start.studyDay as number) + days)
      .reduce((n, v) => n + value(v), 0);
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

function bloodVolumeOf(soa: ScheduleOfActivities): BloodVolumeProfile {
  const perVisit = perVisitVolumes(soa);
  const lowerBound = soa.activities.some((a) => a.specimen?.type === 'blood' && !(typeof a.specimen.volumeMl === 'number' && a.specimen.volumeMl > 0));
  const eightScheduled = maxInWindow(perVisit, WINDOW_DAYS, (v) => v.scheduledMl);
  const eightUpper = maxInWindow(perVisit, WINDOW_DAYS, (v) => v.scheduledMl + v.conditionalMl);
  const weekDraws = maxInWindow(perVisit, WEEK_DAYS, (v) => (v.draws > 0 ? 1 : 0));
  return {
    perVisit,
    totalScheduledMl: perVisit.reduce((n, v) => n + v.scheduledMl, 0),
    totalUpperBoundMl: perVisit.reduce((n, v) => n + v.scheduledMl + v.conditionalMl, 0),
    totalsAreLowerBounds: lowerBound,
    maxEightWeekScheduledMl: eightScheduled,
    maxEightWeekUpperBoundMl: eightUpper,
    maxDrawVisitsInAnyWeek: weekDraws,
    referencePoints: [
      { appliesTo: 'healthy, non-pregnant adults of at least 50 kg', eightWeekLimitMl: ADULT_EIGHT_WEEK_ML },
      { appliesTo: 'other adults and children (the 50 mL cap; the 3 mL/kg limb needs a weight the design does not record)', eightWeekLimitMl: MINOR_EIGHT_WEEK_CAP_ML },
    ].map((r) => ({
      ...r,
      exceededScheduled: exceeded(eightScheduled, r.eightWeekLimitMl, lowerBound),
      exceededUpperBound: exceeded(eightUpper, r.eightWeekLimitMl, lowerBound),
    })),
    moreThanTwiceWeekly: weekDraws === null ? null : weekDraws > MAX_DRAWS_PER_WEEK,
    meaning: REFERENCE_MEANING,
  };
}

function bloodGaps(b: BloodVolumeProfile): { gaps: string[]; notes: string[] } {
  const gaps: string[] = [];
  const notes: string[] = [];
  if (b.totalsAreLowerBounds) gaps.push('a blood draw records no volume: every blood total is a lower bound, and a reference point not already exceeded is not known');
  if (b.maxEightWeekScheduledMl === null) gaps.push('a visit with a blood draw has no study day: the 8-week and weekly figures cannot be computed');
  for (const r of b.referencePoints) {
    if (r.exceededScheduled) notes.push(`scheduled draws reach ${b.maxEightWeekScheduledMl} mL in an 8-week window, above the ${r.eightWeekLimitMl} mL reference for ${r.appliesTo}`);
  }
  if (b.moreThanTwiceWeekly) notes.push(`${b.maxDrawVisitsInAnyWeek} draw visits fall within one week, more than the twice-weekly reference`);
  return { gaps, notes };
}

/** Profile the design's specimens and blood volume. Every figure is arithmetic on recorded volumes. */
export function profileBiospecimens(design: StudyDesign): BiospecimenProfile {
  const soa = design.scheduleOfActivities;
  if (!soa) {
    return { status: 'missing', gaps: ['no Schedule of Activities: nothing collected can be profiled'], notes: [], specimens: [], bloodVolume: null, basis: BIOSPECIMEN_BASIS };
  }
  const specimens = specimenRows(soa);
  const gaps = specimens.filter((s) => s.unspecified.length).map((s) => `${s.name}: ${s.unspecified.join(', ')} not specified`);
  const hasBlood = soa.activities.some((a) => a.specimen?.type === 'blood');
  const bloodVolume = hasBlood ? bloodVolumeOf(soa) : null;
  const blood = bloodVolume ? bloodGaps(bloodVolume) : { gaps: [], notes: [] };
  const all = [...gaps, ...blood.gaps];
  return { status: all.length ? 'partial' : 'rendered', gaps: all, notes: blood.notes, specimens, bloodVolume, basis: BIOSPECIMEN_BASIS };
}
