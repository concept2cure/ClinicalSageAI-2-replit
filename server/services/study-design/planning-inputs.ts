/**
 * Planning inputs — the one validated way to record, on a persisted study
 * design, the sponsor inputs the planning engines read.
 *
 * `docs/design/PROTOCOL_INDUSTRY_GAPS.md` Tier 2/3 added engines that read
 * inputs only a sponsor can supply — BOIN escalation rules, the site accrual
 * plan, MMRM assumptions, the external-control plan, the master-protocol
 * structure, and each SoA activity's location and specimen. Nothing on screen
 * could record them, and `POST /api/study-design/persist` passes those nodes
 * through unvalidated. This module validates ONE block at a time, strictly,
 * against exactly what its engine accepts, and applies it to a design without
 * touching anything else.
 *
 * Rules:
 *  - Strict: an unknown key is refused, not stored. A value outside what the
 *    engine accepts (a toxicity target of 1.2, a retention that rises, a
 *    power-prior plan with no a0, a per-dose stop smaller than one cohort, a
 *    BOIN neighbourhood the engine cannot compute boundaries for) is refused
 *    here with the path, rather than stored and reported as a gap later. The
 *    BOIN neighbourhood is checked by the canonical engine
 *    (`stats/dose-finding-boin.ts`), not re-derived.
 *  - List entries are one per line with "|" between fields in the form that
 *    records them, and a sub-study's arms are separated by ";". A value
 *    holding a separator or a line break could not be shown back for editing
 *    without changing it, so it is refused here instead of stored.
 *  - Bounded: the MMRM information computation runs on every read of the
 *    projection and grows with the cube of the visit count, so the modelled
 *    visits are capped ({@link MMRM_MAX_VISITS}).
 *  - `value: null` clears a block — a recorded act, audited like any write.
 *  - Nothing is defaulted: a field the author leaves out stays absent, and the
 *    engine reports it.
 *  - Pure: no DB, no clock. The route owns the transaction, the precondition
 *    check ({@link recordedBlock}) and the audit row.
 *
 * @module server/services/study-design/planning-inputs
 */

import { z } from 'zod';
import type { StudyDesign } from './study-design-types';
import { SOA_ACTIVITY_LOCATIONS } from './dct-profile';
import { boinBoundaries } from '../stats/dose-finding-boin';
import { stableStringify } from '../../../shared/canonical-json.js';

/**
 * Most post-baseline visits an MMRM plan may model. The GLS information
 * computation is cubic in the visit count and runs on every read (100 visits
 * ≈ 20 ms; 800 took 5.5 s), and no protocol schedule models more.
 */
export const MMRM_MAX_VISITS = 100;

/** The specimen types an SoA activity may record (study-design-types.ts `SoaSpecimen.type`). */
export const SPECIMEN_TYPES = ['blood', 'urine', 'tissue', 'csf', 'saliva', 'stool', 'swab', 'other'] as const;

const text = z.string().trim().min(1);
const listText = text.refine((s) => !/[|\r\n]/.test(s), 'must not contain "|" or a line break: list entries are one per line, fields separated by "|"');
const armName = text.refine((s) => !/[|;\r\n]/.test(s), 'must not contain "|", ";" or a line break: a sub-study\'s arms are separated by ";"');
const openUnit = z.number().gt(0).lt(1);
const positiveInt = z.number().int().min(1);

type Ctx = z.RefinementCtx;
const issue = (ctx: Ctx, path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

/** Each entry's key must be unique within its list, as a site id is. */
function unique<T>(ctx: Ctx, items: T[], key: (t: T) => string, path: (i: number) => (string | number)[], noun: string): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const k = key(item);
    if (seen.has(k)) issue(ctx, path(i), `${noun} ${k} is listed twice`);
    seen.add(k);
  });
}

const isOpenUnit = (n: unknown): n is number => typeof n === 'number' && n > 0 && n < 1;

type DoseEscalationValue = { targetToxicity: number; phi1?: number; phi2?: number };

/**
 * The neighbourhood, checked by the engine that computes from it. Only once
 * the target and every supplied φ are rates (their own range issue is already
 * reported); the issue is placed on the φ the author supplied, or on the
 * target when both are the engine's defaults.
 */
function neighbourhood(v: DoseEscalationValue, ctx: Ctx): void {
  if (!isOpenUnit(v.targetToxicity)) return;
  if ((v.phi1 !== undefined && !isOpenUnit(v.phi1)) || (v.phi2 !== undefined && !isOpenUnit(v.phi2))) return;
  try {
    boinBoundaries(v.targetToxicity, v.phi1, v.phi2);
  } catch {
    const supplied = (['phi1', 'phi2'] as const).filter((k) => v[k] !== undefined);
    const message = 'the BOIN boundaries cannot be computed: the neighbourhood must satisfy φ1 < target < φ2 < 1 (an unstated φ1 or φ2 is the engine default)';
    for (const k of supplied.length ? supplied : ['targetToxicity']) issue(ctx, [k], message);
  }
}

const doseEscalation = z
  .object({
    method: z.literal('boin'),
    targetToxicity: openUnit,
    doseLevels: z.array(z.object({ label: listText, dose: listText.optional() }).strict()).min(2),
    cohortSize: positiveInt,
    maxSampleSize: positiveInt,
    startingDoseIndex: z.number().int().min(0).optional(),
    stopWhenAtDoseN: positiveInt.optional(),
    phi1: openUnit.optional(),
    phi2: openUnit.optional(),
    eliminationThreshold: openUnit.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.maxSampleSize < v.cohortSize) issue(ctx, ['maxSampleSize'], 'is smaller than one cohort');
    if (v.stopWhenAtDoseN !== undefined && v.stopWhenAtDoseN < v.cohortSize) {
      issue(ctx, ['stopWhenAtDoseN'], 'is smaller than one cohort: no cohort completes at a dose');
    }
    if (v.startingDoseIndex !== undefined && v.startingDoseIndex >= v.doseLevels.length) {
      issue(ctx, ['startingDoseIndex'], 'does not name a recorded dose level');
    }
    unique(ctx, v.doseLevels, (l) => l.label, (i) => ['doseLevels', i, 'label'], 'dose level');
    neighbourhood(v, ctx);
  });

const accrualPlan = z
  .object({
    timeUnit: z.enum(['week', 'month']),
    sites: z
      .array(
        z
          .object({
            id: listText,
            country: listText.optional(),
            meanRate: z.number().finite().min(0),
            rateCv: z.number().finite().min(0).optional(),
            activationTime: z.number().finite().min(0).optional(),
          })
          .strict(),
      )
      .min(1),
    rateSource: text.optional(),
    seed: z.number().int().optional(),
  })
  .strict()
  .superRefine((v, ctx) => unique(ctx, v.sites, (s) => s.id, (i) => ['sites', i, 'id'], 'site'));

const mmrmAssumptions = z
  .object({
    endpointName: text,
    visits: positiveInt.max(MMRM_MAX_VISITS),
    covariance: z.enum(['compound_symmetry', 'ar1']),
    rho: z.number().min(0).lt(1),
    sigma: z.number().finite().gt(0),
    delta: z.number().finite().refine((d) => d !== 0, 'must be non-zero'),
    retention: z.array(z.number().gt(0).max(1)).min(1).max(MMRM_MAX_VISITS),
    targetVisit: positiveInt.optional(),
    allocationRatio: z.number().finite().gt(0).optional(),
    source: text.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.retention.length !== v.visits) issue(ctx, ['retention'], `has ${v.retention.length} values for ${v.visits} visits`);
    if (v.retention.some((r, i) => i > 0 && r > v.retention[i - 1])) issue(ctx, ['retention'], 'must never increase from one visit to the next');
    if (v.targetVisit !== undefined && v.targetVisit > v.visits) issue(ctx, ['targetVisit'], 'is not one of the modelled visits');
  });

const externalControlPlan = z
  .object({
    source: text,
    endpointName: text,
    historical: z.object({ n: positiveInt, mean: z.number().finite(), se: z.number().finite().gt(0) }).strict(),
    method: z.enum(['power_prior', 'commensurate']),
    a0: z.number().min(0).max(1).optional(),
    tau2: z.number().finite().min(0).optional(),
    plannedConcurrentControlN: z.number().int().min(0),
    assumedSd: z.number().finite().gt(0).optional(),
    tippingPointAnalysisPlanned: z.boolean().optional(),
    covariateBalancePlanned: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Each method reads exactly one discount; the other would sit unused
    // until a later switch of method silently put it back in force.
    if (v.method === 'power_prior' && v.a0 === undefined) issue(ctx, ['a0'], 'is required for a power prior');
    if (v.method === 'power_prior' && v.tau2 !== undefined) issue(ctx, ['tau2'], 'applies only to a commensurate prior; a power-prior plan does not use it');
    if (v.method === 'commensurate' && v.tau2 === undefined) issue(ctx, ['tau2'], 'is required for a commensurate prior');
    if (v.method === 'commensurate' && v.a0 !== undefined) issue(ctx, ['a0'], 'applies only to a power prior; a commensurate plan does not use it');
  });

const masterProtocol = z
  .object({
    subStudies: z
      .array(
        z
          .object({
            id: listText,
            name: listText,
            population: listText,
            // null states the population is not biomarker-defined; absent, that the plan does not say.
            biomarker: listText.nullable().optional(),
            biomarkerAssay: listText.optional(),
            arms: z.array(armName).min(1),
            decisionRule: listText.optional(),
          })
          .strict(),
      )
      .min(1),
    sharedControlArm: text.nullable().optional(),
    nonConcurrentControls: z.enum(['not_used', 'used_with_time_adjustment', 'used']).optional(),
    nonConcurrentControlsJustification: text.optional(),
    armAdditionProcedure: text.optional(),
    armDroppingRules: text.optional(),
    multiplicityAcrossSubStudies: text.optional(),
  })
  .strict()
  .superRefine((v, ctx) => unique(ctx, v.subStudies, (s) => s.id, (i) => ['subStudies', i, 'id'], 'sub-study'));

const specimen = z
  .object({
    type: z.enum(SPECIMEN_TYPES),
    volumeMl: z.number().finite().gt(0).optional(),
    processing: text.optional(),
    storage: text.optional(),
    retention: text.optional(),
  })
  .strict();

const activityAttributes = z
  .object({
    activityId: text,
    location: z.enum(SOA_ACTIVITY_LOCATIONS as unknown as [string, ...string[]]).nullable().optional(),
    specimen: specimen.nullable().optional(),
  })
  .strict()
  .refine((v) => 'location' in v || 'specimen' in v, 'name a location or a specimen to record or clear');

/**
 * The titles a registry publishes beside the official one: the lay-language
 * public title (ClinicalTrials.gov Brief Title, WHO TRDS item 9, EU CTIS public
 * title) and the acronym. One line each. Registry length limits are not refused
 * here: the registration projection reports a title longer than a registry
 * accepts, with its length, so the author sees which registry it fails.
 */
const titleLine = text.refine((s) => !/[\r\n]/.test(s), 'must be one line');
const registrationTitles = z
  .object({ publicTitle: titleLine.optional(), acronym: titleLine.optional() })
  .strict()
  .refine((v) => v.publicTitle !== undefined || v.acronym !== undefined, 'record a public title or an acronym, or clear the block');

export const PLANNING_BLOCKS = ['doseEscalation', 'accrualPlan', 'mmrmAssumptions', 'externalControlPlan', 'masterProtocol', 'registrationTitles', 'activityAttributes'] as const;
export type PlanningBlock = (typeof PLANNING_BLOCKS)[number];

const planningInput = z.discriminatedUnion('block', [
  z.object({ block: z.literal('doseEscalation'), value: doseEscalation.nullable() }).strict(),
  z.object({ block: z.literal('accrualPlan'), value: accrualPlan.nullable() }).strict(),
  z.object({ block: z.literal('mmrmAssumptions'), value: mmrmAssumptions.nullable() }).strict(),
  z.object({ block: z.literal('externalControlPlan'), value: externalControlPlan.nullable() }).strict(),
  z.object({ block: z.literal('masterProtocol'), value: masterProtocol.nullable() }).strict(),
  z.object({ block: z.literal('registrationTitles'), value: registrationTitles.nullable() }).strict(),
  z.object({ block: z.literal('activityAttributes'), value: activityAttributes }).strict(),
]);

export type PlanningInput = z.infer<typeof planningInput>;

/** Validate a request body's `{ block, value }`. Issues carry the path (`block`, `value.…`), so the author sees which field. */
export function parsePlanningInput(body: unknown): { ok: true; input: PlanningInput } | { ok: false; issues: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const parsed = planningInput.safeParse({ block: b.block, value: b.value });
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) };
}

export class PlanningInputError extends Error {
  constructor(public code: 'NO_SCHEDULE' | 'UNKNOWN_ACTIVITY', message: string) {
    super(message);
    this.name = 'PlanningInputError';
  }
}

/** `value === null` removes the key; anything else sets it. */
function setOrClear<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | null): T {
  const next = { ...target };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

function applyActivity(design: StudyDesign, v: z.infer<typeof activityAttributes>): StudyDesign {
  const soa = design.scheduleOfActivities;
  if (!soa) throw new PlanningInputError('NO_SCHEDULE', 'This design records no Schedule of Activities, so no activity can carry a location or a specimen.');
  const idx = soa.activities.findIndex((a) => a.id === v.activityId);
  if (idx < 0) throw new PlanningInputError('UNKNOWN_ACTIVITY', `Activity "${v.activityId}" is not in this design's Schedule of Activities.`);
  let activity = { ...soa.activities[idx] };
  if ('location' in v) activity = setOrClear(activity, 'location', (v.location ?? null) as typeof activity.location | null);
  if ('specimen' in v) activity = setOrClear(activity, 'specimen', v.specimen ?? null);
  const activities = soa.activities.map((a, i) => (i === idx ? activity : a));
  return { ...design, scheduleOfActivities: { ...soa, activities } };
}

/** Apply one validated block to a design. Returns a new design; every other node is untouched. */
export function applyPlanningInput(design: StudyDesign, input: PlanningInput): StudyDesign {
  switch (input.block) {
    case 'doseEscalation':
      return { ...design, safety: setOrClear(design.safety ?? {}, 'doseEscalation', input.value) };
    case 'mmrmAssumptions':
      return { ...design, statisticalPlan: setOrClear(design.statisticalPlan, 'mmrmAssumptions', input.value) };
    case 'accrualPlan':
      return setOrClear(design, 'accrualPlan', input.value);
    case 'externalControlPlan':
      return setOrClear(design, 'externalControlPlan', input.value);
    case 'masterProtocol':
      return setOrClear(design, 'masterProtocol', input.value);
    case 'registrationTitles':
      // The block is both titles: one left out of the value is removed, as a cleared block removes both.
      return setOrClear(setOrClear(design, 'publicTitle', input.value?.publicTitle ?? null), 'acronym', input.value?.acronym ?? null);
    case 'activityAttributes':
      return applyActivity(design, input.value);
  }
}

/**
 * The block as the design records it now — what a writer's `expected` (the
 * block as it read it) is compared with, so a write made from a stale read is
 * refused rather than silently replacing another author's. `null` when the
 * block is not recorded; for an activity, its location and specimen, each
 * `null` when absent.
 */
export function recordedBlock(design: StudyDesign, input: PlanningInput): unknown {
  if (input.block !== 'activityAttributes') return BLOCK_READERS[input.block](design) ?? null;
  const a = design.scheduleOfActivities?.activities.find((x) => x.id === input.value.activityId);
  return a ? { location: a.location ?? null, specimen: a.specimen ?? null } : null;
}

/** Where each block lives on the design — the same places {@link applyPlanningInput} writes. */
const BLOCK_READERS: Record<Exclude<PlanningBlock, 'activityAttributes'>, (d: StudyDesign) => unknown> = {
  doseEscalation: (d) => d.safety?.doseEscalation,
  mmrmAssumptions: (d) => d.statisticalPlan?.mmrmAssumptions,
  accrualPlan: (d) => d.accrualPlan,
  externalControlPlan: (d) => d.externalControlPlan,
  masterProtocol: (d) => d.masterProtocol,
  registrationTitles: (d) => (d.publicTitle === undefined && d.acronym === undefined ? undefined : { publicTitle: d.publicTitle, acronym: d.acronym }),
};

/** Same recorded content, whatever the key order (the one canonical serializer). */
export function sameRecorded(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
