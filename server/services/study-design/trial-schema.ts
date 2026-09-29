/**
 * Trial Schema — ICH M11 §1.2, the design object drawn as a schematic.
 *
 * The ICH M11 harmonised protocol template opens the Protocol Summary with the
 * three things site staff read before anything else: the synopsis (§1.1), the
 * Trial Schema (§1.2) and the Schedule of Activities (§1.3). The schema is the
 * one-figure view of the design — epochs left to right (screening, run-in,
 * treatment, follow-up), the randomisation point, the arms with their
 * interventions as lanes, and the key visits as milestones in visit order.
 * The epochs and visits live on the design object (`ScheduleOfActivities`) and
 * the arms on `StudyDesign.arms`; this module draws them and nothing else.
 *
 * Two outputs from one deterministic pass over the design:
 *   - a structured {@link TrialSchemaModel}: what the figure asserts, as data;
 *   - a self-contained SVG rendered from that model by `trial-schema-svg.ts`:
 *     no external fonts or scripts, a `<title>` and a `<desc>` for assistive
 *     technology, byte-identical for the same design.
 *
 * Honesty contract (CLAUDE.md — fail closed, never fabricate):
 *   - Epochs, visits, study days and windows come only from the design's
 *     Schedule of Activities. None is invented. A visit without a recorded
 *     study day is drawn without a day label and reported as a gap; visits whose
 *     study days run backwards against their order are reported. Milestones
 *     are spaced by visit order and the figure says it is not to scale.
 *   - No Schedule of Activities → the epochs cannot be drawn. A recorded
 *     schedule with no drawable epoch is said to be exactly that, never "not
 *     recorded". If arms exist they are drawn alone (status `partial`); if
 *     nothing is drawable the status is `missing` and `svg` is null.
 *   - An epoch id shared by several epochs is reported, and no visit that
 *     references it is placed: a visit is never drawn in an epoch the design
 *     did not unambiguously assign it to.
 *   - Arm lanes are drawn only inside treatment epochs, never across screening,
 *     washout or follow-up. With no treatment epoch the arms are listed off the
 *     timeline. Arms carry no per-epoch or per-period assignment, so several
 *     treatment epochs, or a crossover design, is a named gap. Interventions
 *     are listed with a neutral separator, never " + " (co-administration).
 *   - An arm with no recorded intervention is drawn, labelled
 *     "(no intervention recorded)", and reported. A blank title, arm, epoch,
 *     visit or intervention name is reported and drawn as a placeholder.
 *   - The randomisation marker is placed only where the design supports it:
 *     after the last pre-treatment epoch, or at the start of treatment when
 *     none precedes it. A multi-arm design with no randomisation node, no ratio,
 *     a ratio of the wrong length or a non-positive weight is a gap.
 *   - Text is escaped with the repository's canonical XML escaper, which drops
 *     characters XML cannot carry; when it drops any, `notDrawn` says so.
 *   - `status` is `rendered` only when the gap list is empty.
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/trial-schema
 */

import { XML_ILLEGAL_CHARS } from '../submission-gateways/ectd-packager/paths';
import type { SectionStatus } from './protocol-projection';
import type {
  AllocationMethod,
  Arm,
  BlindingLevel,
  ControlType,
  InferentialFrame,
  Intervention,
  ScheduleOfActivities,
  SoaEpoch,
  SoaEpochKind,
  SoaVisit,
  StructuralDesign,
  StudyDesign,
} from './study-design-types';
import { renderTrialSchemaSvg } from './trial-schema-svg';

export const TRIAL_SCHEMA_BASIS =
  'ICH M11 (Clinical Electronic Structured Harmonised Protocol) §1.2 Trial Schema';

// ─── Model ──────────────────────────────────────────────────────────────────

/** A key visit drawn on the axis. `studyDay`/`windowDays` are absent when the design does not record them. */
export interface SchemaMilestone {
  name: string;
  studyDay?: number;
  windowDays?: number;
  isBaseline: boolean;
}

/** An epoch box, left to right, with the visits the schedule places in it. */
export interface SchemaEpoch {
  id: string;
  name: string;
  kind: SoaEpochKind;
  milestones: SchemaMilestone[];
}

export interface SchemaRandomization {
  /** True when the design carries a randomisation node whose allocation method is not `none`. */
  present: boolean;
  /** The last pre-treatment epoch; the marker sits at its right edge. Absent when no epoch precedes treatment. */
  afterEpochId?: string;
  /** The first treatment epoch; the arm lanes begin here. */
  beforeEpochId?: string;
  ratio?: number[];
  blinding?: BlindingLevel;
  allocationMethod?: AllocationMethod;
  stratificationFactors?: string[];
}

export interface SchemaIntervention {
  /** Absent when the design records no name for the intervention. */
  name?: string;
  role: Intervention['role'];
  dose?: string;
  route?: string;
  regimen?: string;
}

export interface SchemaArm {
  name: string;
  interventions: SchemaIntervention[];
  /** The lane label: arm name plus its interventions, or the explicit no-intervention marker. */
  label: string;
}

/** The follow-up period: every `follow_up` epoch, merged into one post-treatment band. */
export interface SchemaFollowUp {
  epochIds: string[];
  name: string;
  milestones: SchemaMilestone[];
}

export interface TrialSchemaModel {
  title: string;
  design: {
    phase: StudyDesign['phase'];
    structuralDesign: StructuralDesign;
    controlType: ControlType;
    inferentialFrame: InferentialFrame;
  };
  /** True when the design carries a Schedule of Activities, even one with nothing drawable. */
  scheduleRecorded: boolean;
  /** Drawn epochs in column order. Empty when the design carries no drawable schedule. */
  epochs: SchemaEpoch[];
  randomization: SchemaRandomization;
  arms: SchemaArm[];
  followUp?: SchemaFollowUp;
  /**
   * Parts of the design deliberately not drawn (unscheduled epochs and visits,
   * characters XML cannot carry), named so their absence is not mistaken for a gap.
   */
  notDrawn: string[];
}

export interface TrialSchema {
  status: SectionStatus;
  /** Exactly what the figure needs and the design does not carry. Empty ⇒ `rendered`. */
  gaps: string[];
  model: TrialSchemaModel;
  /** Self-contained SVG, or null when nothing is drawable. */
  svg: string | null;
  basis: string;
}

export const NO_INTERVENTION_LABEL = '(no intervention recorded)';
export const UNNAMED_INTERVENTION_LABEL = '(unnamed intervention)';
export const NO_SOA_GAP = 'no Schedule of Activities: epochs and visit milestones cannot be drawn';
export const EMPTY_SOA_GAP = 'Schedule of Activities has no epochs: epochs and visit milestones cannot be drawn';
export const NO_TREATMENT_EPOCH_GAP = 'no treatment epoch recorded: arm lanes cannot be placed on the timeline';
export const CROSSOVER_GAP =
  'crossover design: the per-period treatment sequence is not modelled (arms carry no period assignment), ' +
  'so lanes show each sequence arm with its interventions, not the treatment given in each period';

const PRE_TREATMENT_KINDS: ReadonlySet<SoaEpochKind> = new Set(['screening', 'run_in']);

/** Where the collectors write: gaps make the figure partial, notDrawn items do not. */
interface Sink {
  gaps: string[];
  notDrawn: string[];
}

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Project a design into its ICH M11 §1.2 Trial Schema: a structured model plus a
 * deterministic SVG. Renders only what the design holds and lists every gap.
 */
export function projectTrialSchema(design: StudyDesign): TrialSchema {
  const sink: Sink = { gaps: [], notDrawn: [] };
  const title = named(design.title, '(study title not recorded)', 'study title not recorded', sink.gaps);
  const soa = design.scheduleOfActivities;
  const { epochs, sharedIds } = collectEpochs(soa, sink);
  const arms = collectArms(design.arms ?? [], sink.gaps);
  reportLaneLimits(design.framework.structuralDesign, epochs, arms.length, sink.gaps);
  const randomization = collectRandomization(design, epochs, sharedIds, arms.length, sink.gaps);
  const followUp = collectFollowUp(epochs);

  const model: TrialSchemaModel = {
    title,
    design: {
      phase: design.phase,
      structuralDesign: design.framework.structuralDesign,
      controlType: design.framework.controlType,
      inferentialFrame: design.framework.inferentialFrame,
    },
    scheduleRecorded: soa !== undefined && soa !== null,
    epochs,
    randomization,
    arms,
    ...(followUp ? { followUp } : {}),
    notDrawn: sink.notDrawn,
  };
  const stripped = strippedTextNote(model);
  if (stripped) sink.notDrawn.push(stripped);

  const { gaps } = sink;
  const drawable = epochs.length > 0 || arms.length > 0;
  const status: SectionStatus = !drawable ? 'missing' : gaps.length === 0 ? 'rendered' : 'partial';
  const svg = drawable ? renderTrialSchemaSvg(model, gaps) : null;

  return { status, gaps, model, svg, basis: TRIAL_SCHEMA_BASIS };
}

// ─── Epochs and milestones ──────────────────────────────────────────────────

function collectEpochs(
  soa: ScheduleOfActivities | undefined,
  sink: Sink,
): { epochs: SchemaEpoch[]; sharedIds: ReadonlySet<string> } {
  if (!soa) {
    sink.gaps.push(NO_SOA_GAP);
    return { epochs: [], sharedIds: new Set() };
  }
  const allEpochs = [...(soa.epochs ?? [])].sort((a, b) => a.order - b.order);
  const sharedIds = reportSharedEpochIds(allEpochs, sink.gaps);
  const drawn = allEpochs.filter(e => e.kind !== 'unscheduled');
  for (const e of allEpochs.filter(x => x.kind === 'unscheduled')) {
    sink.notDrawn.push(`unscheduled epoch "${e.name}" is not a timeline period and is not drawn`);
  }
  if (drawn.length === 0) {
    sink.gaps.push(EMPTY_SOA_GAP);
    return { epochs: [], sharedIds };
  }

  // Visits referencing a shared id are never placed, so matching by id below is unambiguous.
  const placed = placeVisits(soa.visits ?? [], allEpochs, sharedIds, sink);
  const epochs: SchemaEpoch[] = drawn.map(e => ({
    id: e.id,
    name: named(e.name, `(epoch ${e.id} name not recorded)`, `epoch "${e.id}" has no recorded name`, sink.gaps),
    kind: e.kind,
    milestones: placed.filter(v => v.epochId === e.id).map(v => toMilestone(v, sink.gaps)),
  }));

  for (const e of epochs) {
    if (e.milestones.length === 0 && !sharedIds.has(e.id)) {
      sink.gaps.push(`epoch "${e.name}" has no scheduled visits: no milestones can be drawn for it`);
    }
  }
  const undated = placed.filter(v => !Number.isFinite(v.studyDay)).map(v => `"${visitName(v)}"`);
  if (undated.length > 0) {
    sink.gaps.push(`visit(s) without a recorded study day, drawn without a day label: ${undated.join(', ')}`);
  }
  reportDayOrder(epochs, sink.gaps);
  if (!epochs.some(e => e.kind === 'treatment')) sink.gaps.push(NO_TREATMENT_EPOCH_GAP);
  return { epochs, sharedIds };
}

/** Each epoch id that more than one epoch carries is a gap; returns the set of such ids. */
function reportSharedEpochIds(epochs: SoaEpoch[], gaps: string[]): ReadonlySet<string> {
  const namesById = new Map<string, string[]>();
  for (const e of epochs) namesById.set(e.id, [...(namesById.get(e.id) ?? []), e.name]);
  const shared = new Set<string>();
  for (const [id, names] of namesById) {
    if (names.length < 2) continue;
    shared.add(id);
    gaps.push(
      `epoch id "${id}" is shared by ${names.length} epochs (${names.map(n => `"${n}"`).join(', ')}): ` +
        'visits referencing it cannot be placed',
    );
  }
  return shared;
}

/** Visits in `order`, minus the ones the figure cannot or deliberately does not place. */
function placeVisits(
  visits: SoaVisit[],
  allEpochs: SoaEpoch[],
  sharedIds: ReadonlySet<string>,
  sink: Sink,
): SoaVisit[] {
  const kindById = new Map(allEpochs.map(e => [e.id, e.kind] as const));
  const placed: SoaVisit[] = [];
  const ambiguous: string[] = [];
  for (const v of [...visits].sort((a, b) => a.order - b.order)) {
    const name = visitName(v);
    if (v.unscheduled) {
      sink.notDrawn.push(`unscheduled visit "${name}" has no planned timepoint and is not drawn`);
    } else if (sharedIds.has(v.epochId)) {
      ambiguous.push(`"${name}"`);
    } else if (!kindById.has(v.epochId)) {
      sink.gaps.push(`visit "${name}" references undefined epoch "${v.epochId}" and is not drawn`);
    } else if (kindById.get(v.epochId) === 'unscheduled') {
      sink.notDrawn.push(`visit "${name}" belongs to an unscheduled epoch and is not drawn`);
    } else {
      placed.push(v);
    }
  }
  if (ambiguous.length > 0) {
    sink.gaps.push(`visit(s) whose epoch id is shared by more than one epoch, not drawn: ${ambiguous.join(', ')}`);
  }
  return placed;
}

function visitName(v: SoaVisit): string {
  return present(v.name) ? v.name : `(visit ${v.id} name not recorded)`;
}

function toMilestone(v: SoaVisit, gaps: string[]): SchemaMilestone {
  return {
    name: named(v.name, visitName(v), `visit "${v.id}" has no recorded name`, gaps),
    ...(Number.isFinite(v.studyDay) ? { studyDay: v.studyDay } : {}),
    ...(Number.isFinite(v.windowDays) ? { windowDays: v.windowDays } : {}),
    isBaseline: v.isBaseline === true,
  };
}

/** Milestones are drawn in visit order; a study day that runs backwards along it is a contradiction to report. */
function reportDayOrder(epochs: SchemaEpoch[], gaps: string[]): void {
  let prev: { name: string; day: number } | null = null;
  for (const m of epochs.flatMap(e => e.milestones)) {
    if (m.studyDay === undefined) continue;
    if (prev && m.studyDay < prev.day) {
      gaps.push(
        `visit "${m.name}" (Day ${m.studyDay}) is ordered after "${prev.name}" (Day ${prev.day}) ` +
          'but has an earlier study day: the visit order and the study days disagree',
      );
    }
    prev = { name: m.name, day: m.studyDay };
  }
}

function collectFollowUp(epochs: SchemaEpoch[]): SchemaFollowUp | undefined {
  const fu = epochs.filter(e => e.kind === 'follow_up');
  if (fu.length === 0) return undefined;
  return {
    epochIds: fu.map(e => e.id),
    name: fu.map(e => e.name).join(' / '),
    milestones: fu.flatMap(e => e.milestones),
  };
}

// ─── Arms ───────────────────────────────────────────────────────────────────

function collectArms(arms: Arm[], gaps: string[]): SchemaArm[] {
  if (arms.length === 0) {
    gaps.push('no arms recorded: arm lanes cannot be drawn');
    return [];
  }
  return arms.map((arm, index) => {
    const name = named(arm.name, `(arm ${index + 1} name not recorded)`, `arm ${index + 1} has no recorded name`, gaps);
    const interventions = (arm.interventions ?? []).map(i => toIntervention(i, name, gaps));
    if (interventions.length === 0) {
      gaps.push(`arm "${name}" has no intervention recorded`);
    }
    // "; " lists; " + " would assert co-administration, which the design does not record.
    const summary = interventions.length === 0 ? NO_INTERVENTION_LABEL : interventions.map(describeIntervention).join('; ');
    return { name, interventions, label: `${name}: ${summary}` };
  });
}

function toIntervention(i: Intervention, armName: string, gaps: string[]): SchemaIntervention {
  if (!present(i.name)) gaps.push(`arm "${armName}" has an intervention with no recorded name`);
  return {
    ...(present(i.name) ? { name: i.name } : {}),
    role: i.role,
    ...(present(i.dose) ? { dose: i.dose } : {}),
    ...(present(i.route) ? { route: i.route } : {}),
    ...(present(i.regimen) ? { regimen: i.regimen } : {}),
  };
}

/**
 * "Drug X 10 mg oral once daily" — only the parts the design records, in a fixed
 * order. A missing name is printed as "(unnamed intervention)", never dropped,
 * so a dose is never shown as if it were the intervention.
 */
export function describeIntervention(i: SchemaIntervention): string {
  const name = present(i.name) ? i.name : UNNAMED_INTERVENTION_LABEL;
  return [name, i.dose, i.route, i.regimen].filter(present).join(' ');
}

/** What lanes cannot say: per-period sequence (crossover) and per-epoch assignment (several treatment epochs). */
function reportLaneLimits(
  structural: StructuralDesign,
  epochs: SchemaEpoch[],
  armCount: number,
  gaps: string[],
): void {
  if (armCount === 0) return;
  if (structural === 'crossover') gaps.push(CROSSOVER_GAP);
  const treatment = epochs.filter(e => e.kind === 'treatment');
  if (treatment.length > 1) {
    gaps.push(
      `${treatment.length} treatment epochs recorded (${treatment.map(e => `"${e.name}"`).join(', ')}) but arms carry ` +
        "no per-epoch intervention assignment: each lane shows the arm's full intervention list in every treatment epoch",
    );
  }
}

// ─── Randomisation point ────────────────────────────────────────────────────

function collectRandomization(
  design: StudyDesign,
  epochs: SchemaEpoch[],
  sharedIds: ReadonlySet<string>,
  armCount: number,
  gaps: string[],
): SchemaRandomization {
  const r = design.randomization;
  if (!r) {
    if (armCount > 1) {
      gaps.push(`no randomization recorded: the allocation point cannot be marked for ${armCount} arms`);
    }
    return { present: false };
  }
  const present = r.allocationMethod !== 'none';
  const out: SchemaRandomization = {
    present,
    allocationMethod: r.allocationMethod,
    blinding: r.blinding,
    ...(Array.isArray(r.ratio) && r.ratio.length > 0 ? { ratio: [...r.ratio] } : {}),
    ...(r.stratificationFactors?.length ? { stratificationFactors: [...r.stratificationFactors] } : {}),
  };
  if (!present) return out;
  reportRatio(out.ratio, armCount, gaps);
  if (epochs.length > 0) placeRandomization(out, epochs, sharedIds, gaps);
  return out;
}

function reportRatio(ratio: number[] | undefined, armCount: number, gaps: string[]): void {
  if (!ratio) {
    if (armCount > 1) gaps.push(`randomization ratio not recorded for ${armCount} arms`);
    return;
  }
  if (armCount > 0 && ratio.length !== armCount) {
    gaps.push(`randomization ratio [${ratio.join(', ')}] has ${ratio.length} entries but the design has ${armCount} arms`);
  }
  if (ratio.some(w => !(typeof w === 'number' && Number.isFinite(w) && w > 0))) {
    gaps.push(`randomization ratio [${ratio.join(', ')}] has an entry that is not a positive number`);
  }
}

/** The marker follows the last pre-treatment epoch preceding the first treatment epoch. */
function placeRandomization(
  out: SchemaRandomization,
  epochs: SchemaEpoch[],
  sharedIds: ReadonlySet<string>,
  gaps: string[],
): void {
  const firstTreatment = epochs.findIndex(e => e.kind === 'treatment');
  if (firstTreatment === -1) {
    gaps.push('no treatment epoch: the randomization point cannot be placed after a pre-treatment epoch');
    return;
  }
  const before = epochs[firstTreatment];
  const after = epochs.slice(0, firstTreatment).reverse().find(e => PRE_TREATMENT_KINDS.has(e.kind));
  const shared = [before, after].find(e => e !== undefined && sharedIds.has(e.id));
  if (shared) {
    gaps.push(`the randomization point cannot be placed: epoch id "${shared.id}" is shared by more than one epoch`);
    return;
  }
  out.beforeEpochId = before.id;
  if (after) out.afterEpochId = after.id;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/** The recorded name, or the placeholder with the gap reported — never a blank drawn as if it were a name. */
function named(value: unknown, placeholder: string, gap: string, gaps: string[]): string {
  if (present(value)) return value;
  gaps.push(gap);
  return placeholder;
}

/** The canonical XML escaper drops characters XML cannot carry; say so rather than drop them silently. */
function strippedTextNote(model: TrialSchemaModel): string | null {
  const texts = [
    model.title,
    ...model.epochs.flatMap(e => [e.id, e.name, ...e.milestones.map(m => m.name)]),
    ...model.arms.map(a => a.label),
    ...(model.randomization.stratificationFactors ?? []),
  ];
  const n = texts.filter(t => t.match(XML_ILLEGAL_CHARS) !== null).length;
  if (n === 0) return null;
  return `${n} text field(s) contain control characters XML cannot carry; the figure draws them with those characters removed`;
}
