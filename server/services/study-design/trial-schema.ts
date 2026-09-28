/**
 * Trial Schema — ICH M11 §1.2, the design object drawn as a schematic.
 *
 * The ICH M11 harmonised protocol template opens the Protocol Summary with the
 * three things site staff read before anything else: the synopsis (§1.1), the
 * Trial Schema (§1.2) and the Schedule of Activities (§1.3). The schema is the
 * one-figure view of the design — epochs left to right (screening, run-in,
 * treatment, follow-up), the randomisation point, the arms with their
 * interventions as parallel lanes, and the key visits as milestones on a
 * study-day axis. Every protocol authoring tool renders one; until this module
 * nothing in this repository did, although the epochs and visits already lived
 * on the design object (`ScheduleOfActivities`) and the arms on `StudyDesign.arms`.
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
 *     study day is drawn without a day label and reported as a gap.
 *   - No Schedule of Activities → the epochs cannot be drawn. If arms exist
 *     they are drawn alone and the figure says so (status `partial`); if
 *     nothing is drawable the status is `missing` and `svg` is null.
 *   - An arm with no recorded intervention is drawn, labelled
 *     "(no intervention recorded)", and reported — never omitted, never filled.
 *   - The randomisation marker is placed only where the design supports it:
 *     after the last pre-treatment epoch, before the first treatment epoch.
 *     A multi-arm design with no randomisation node is a gap, not an assumed 1:1.
 *   - `status` is `rendered` only when the gap list is empty.
 *
 * Pure: no model call, no RNG, no clock, no DB.
 *
 * @module server/services/study-design/trial-schema
 */

import type { SectionStatus } from './protocol-projection';
import type {
  AllocationMethod,
  Arm,
  BlindingLevel,
  ControlType,
  InferentialFrame,
  Intervention,
  ScheduleOfActivities,
  SoaEpochKind,
  SoaVisit,
  StructuralDesign,
  StudyDesign,
} from './study-design-types';
import { renderTrialSchemaSvg } from './trial-schema-svg';

export const TRIAL_SCHEMA_BASIS =
  'ICH M11 (Clinical Electronic Structured Harmonised Protocol) §1.2 Trial Schema';

// ─── Model ──────────────────────────────────────────────────────────────────

/** A key visit drawn on the day axis. `studyDay`/`windowDays` are absent when the design does not record them. */
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
  name: string;
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
  /** Drawn epochs in column order. Empty when the design carries no drawable schedule. */
  epochs: SchemaEpoch[];
  randomization: SchemaRandomization;
  arms: SchemaArm[];
  followUp?: SchemaFollowUp;
  /**
   * Parts of the design deliberately not drawn (unscheduled epochs and visits),
   * named so their absence from the figure is not mistaken for a gap.
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
export const NO_SOA_GAP = 'no Schedule of Activities: epochs and visit milestones cannot be drawn';

const PRE_TREATMENT_KINDS: ReadonlySet<SoaEpochKind> = new Set(['screening', 'run_in']);

// ─── Projection ─────────────────────────────────────────────────────────────

/**
 * Project a design into its ICH M11 §1.2 Trial Schema: a structured model plus a
 * deterministic SVG. Renders only what the design holds and lists every gap.
 */
export function projectTrialSchema(design: StudyDesign): TrialSchema {
  const gaps: string[] = [];
  const notDrawn: string[] = [];

  const epochs = collectEpochs(design.scheduleOfActivities, gaps, notDrawn);
  const arms = collectArms(design.arms ?? [], gaps);
  const randomization = collectRandomization(design, epochs, arms.length, gaps);
  const followUp = collectFollowUp(epochs);

  const model: TrialSchemaModel = {
    title: design.title,
    design: {
      phase: design.phase,
      structuralDesign: design.framework.structuralDesign,
      controlType: design.framework.controlType,
      inferentialFrame: design.framework.inferentialFrame,
    },
    epochs,
    randomization,
    arms,
    ...(followUp ? { followUp } : {}),
    notDrawn,
  };

  const drawable = epochs.length > 0 || arms.length > 0;
  const status: SectionStatus = !drawable ? 'missing' : gaps.length === 0 ? 'rendered' : 'partial';
  const svg = drawable ? renderTrialSchemaSvg(model, gaps) : null;

  return { status, gaps, model, svg, basis: TRIAL_SCHEMA_BASIS };
}

// ─── Epochs and milestones ──────────────────────────────────────────────────

function collectEpochs(
  soa: ScheduleOfActivities | undefined,
  gaps: string[],
  notDrawn: string[],
): SchemaEpoch[] {
  if (!soa) {
    gaps.push(NO_SOA_GAP);
    return [];
  }
  const allEpochs = [...(soa.epochs ?? [])].sort((a, b) => a.order - b.order);
  const drawn = allEpochs.filter(e => e.kind !== 'unscheduled');
  for (const e of allEpochs.filter(e => e.kind === 'unscheduled')) {
    notDrawn.push(`unscheduled epoch "${e.name}" is not a timeline period and is not drawn`);
  }
  if (drawn.length === 0) {
    gaps.push('Schedule of Activities has no epochs: epochs and visit milestones cannot be drawn');
    return [];
  }

  const epochIds = new Set(drawn.map(e => e.id));
  const visits = [...(soa.visits ?? [])].sort((a, b) => a.order - b.order);
  const placed: SoaVisit[] = [];
  for (const v of visits) {
    if (v.unscheduled) {
      notDrawn.push(`unscheduled visit "${v.name}" has no planned timepoint and is not drawn`);
    } else if (!epochIds.has(v.epochId)) {
      if (allEpochs.some(e => e.id === v.epochId)) {
        notDrawn.push(`visit "${v.name}" belongs to an unscheduled epoch and is not drawn`);
      } else {
        gaps.push(`visit "${v.name}" references undefined epoch "${v.epochId}" and is not drawn`);
      }
    } else {
      placed.push(v);
    }
  }

  const epochs: SchemaEpoch[] = drawn.map(e => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    milestones: placed.filter(v => v.epochId === e.id).map(toMilestone),
  }));

  for (const e of epochs) {
    if (e.milestones.length === 0) {
      gaps.push(`epoch "${e.name}" has no scheduled visits: no milestones can be drawn for it`);
    }
  }
  const undated = placed.filter(v => typeof v.studyDay !== 'number').map(v => `"${v.name}"`);
  if (undated.length > 0) {
    gaps.push(`visit(s) without a recorded study day, drawn without a day label: ${undated.join(', ')}`);
  }
  return epochs;
}

function toMilestone(v: SoaVisit): SchemaMilestone {
  return {
    name: v.name,
    ...(typeof v.studyDay === 'number' ? { studyDay: v.studyDay } : {}),
    ...(typeof v.windowDays === 'number' ? { windowDays: v.windowDays } : {}),
    isBaseline: v.isBaseline === true,
  };
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
  return arms.map(arm => {
    const interventions: SchemaIntervention[] = (arm.interventions ?? []).map(i => ({
      name: i.name,
      role: i.role,
      ...(present(i.dose) ? { dose: i.dose } : {}),
      ...(present(i.route) ? { route: i.route } : {}),
      ...(present(i.regimen) ? { regimen: i.regimen } : {}),
    }));
    if (interventions.length === 0) {
      gaps.push(`arm "${arm.name}" has no intervention recorded`);
    }
    const summary = interventions.length === 0 ? NO_INTERVENTION_LABEL : interventions.map(describeIntervention).join(' + ');
    return { name: arm.name, interventions, label: `${arm.name}: ${summary}` };
  });
}

/** "Drug X 10 mg oral once daily" — only the parts the design records, in a fixed order. */
export function describeIntervention(i: SchemaIntervention): string {
  return [i.name, i.dose, i.route, i.regimen].filter(present).join(' ');
}

// ─── Randomisation point ────────────────────────────────────────────────────

function collectRandomization(
  design: StudyDesign,
  epochs: SchemaEpoch[],
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

  if (out.ratio && armCount > 0 && out.ratio.length !== armCount) {
    gaps.push(`randomization ratio [${out.ratio.join(', ')}] has ${out.ratio.length} entries but the design has ${armCount} arms`);
  }
  if (epochs.length === 0) return out;

  const firstTreatment = epochs.findIndex(e => e.kind === 'treatment');
  if (firstTreatment === -1) {
    gaps.push('no treatment epoch: the randomization point cannot be placed after a pre-treatment epoch');
    return out;
  }
  out.beforeEpochId = epochs[firstTreatment].id;
  // The marker follows the last pre-treatment epoch that precedes the first treatment epoch.
  for (let i = firstTreatment - 1; i >= 0; i -= 1) {
    if (PRE_TREATMENT_KINDS.has(epochs[i].kind)) {
      out.afterEpochId = epochs[i].id;
      break;
    }
  }
  return out;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}
