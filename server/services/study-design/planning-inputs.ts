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
 *    power-prior plan with no a0) is refused here with the path, rather than
 *    stored and reported as a gap later.
 *  - `value: null` clears a block — a recorded act, audited like any write.
 *  - Nothing is defaulted: a field the author leaves out stays absent, and the
 *    engine reports it.
 *  - Pure: no DB, no clock. The route owns the transaction and the audit row.
 *
 * @module server/services/study-design/planning-inputs
 */

import { z } from 'zod';
import type { StudyDesign } from './study-design-types';
import { SOA_ACTIVITY_LOCATIONS } from './dct-profile';

const text = z.string().trim().min(1);
const openUnit = z.number().gt(0).lt(1);
const positiveInt = z.number().int().min(1);

const doseEscalation = z
  .object({
    method: z.literal('boin'),
    targetToxicity: openUnit,
    doseLevels: z.array(z.object({ label: text, dose: text.optional() }).strict()).min(2),
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
    if (v.maxSampleSize < v.cohortSize) ctx.addIssue({ code: 'custom', path: ['maxSampleSize'], message: 'is smaller than one cohort' });
    if (v.startingDoseIndex !== undefined && v.startingDoseIndex >= v.doseLevels.length) {
      ctx.addIssue({ code: 'custom', path: ['startingDoseIndex'], message: 'does not name a recorded dose level' });
    }
    const phi1 = v.phi1 ?? 0.6 * v.targetToxicity;
    const phi2 = v.phi2 ?? 1.4 * v.targetToxicity;
    if (!(phi1 < v.targetToxicity && v.targetToxicity < phi2 && phi2 < 1)) {
      ctx.addIssue({ code: 'custom', path: ['phi1'], message: 'the BOIN neighbourhood needs phi1 < target < phi2 < 1' });
    }
  });

const accrualPlan = z
  .object({
    timeUnit: z.enum(['week', 'month']),
    sites: z
      .array(
        z
          .object({
            id: text,
            country: text.optional(),
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
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.sites.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: 'custom', path: ['sites', i, 'id'], message: `site ${s.id} is listed twice` });
      seen.add(s.id);
    });
  });

const mmrmAssumptions = z
  .object({
    endpointName: text,
    visits: positiveInt,
    covariance: z.enum(['compound_symmetry', 'ar1']),
    rho: z.number().min(0).lt(1),
    sigma: z.number().finite().gt(0),
    delta: z.number().finite().refine((d) => d !== 0, 'must be non-zero'),
    retention: z.array(z.number().gt(0).max(1)).min(1),
    targetVisit: positiveInt.optional(),
    allocationRatio: z.number().finite().gt(0).optional(),
    source: text.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.retention.length !== v.visits) ctx.addIssue({ code: 'custom', path: ['retention'], message: `has ${v.retention.length} values for ${v.visits} visits` });
    if (v.retention.some((r, i) => i > 0 && r > v.retention[i - 1])) ctx.addIssue({ code: 'custom', path: ['retention'], message: 'must never increase from one visit to the next' });
    if (v.targetVisit !== undefined && v.targetVisit > v.visits) ctx.addIssue({ code: 'custom', path: ['targetVisit'], message: 'is not one of the modelled visits' });
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
    if (v.method === 'power_prior' && v.a0 === undefined) ctx.addIssue({ code: 'custom', path: ['a0'], message: 'is required for a power prior' });
    if (v.method === 'commensurate' && v.tau2 === undefined) ctx.addIssue({ code: 'custom', path: ['tau2'], message: 'is required for a commensurate prior' });
  });

const masterProtocol = z
  .object({
    subStudies: z
      .array(
        z
          .object({
            id: text,
            name: text,
            population: text,
            biomarker: text.optional(),
            biomarkerAssay: text.optional(),
            arms: z.array(text).min(1),
            decisionRule: text.optional(),
          })
          .strict(),
      )
      .min(1),
    sharedControlArm: text.nullable().optional(),
    nonConcurrentControls: z.enum(['not_used', 'used_with_time_adjustment', 'used']).optional(),
    armAdditionProcedure: text.optional(),
    armDroppingRules: text.optional(),
    multiplicityAcrossSubStudies: text.optional(),
  })
  .strict();

const specimen = z
  .object({
    type: z.enum(['blood', 'urine', 'tissue', 'csf', 'saliva', 'stool', 'swab', 'other']),
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

export const PLANNING_BLOCKS = ['doseEscalation', 'accrualPlan', 'mmrmAssumptions', 'externalControlPlan', 'masterProtocol', 'activityAttributes'] as const;
export type PlanningBlock = (typeof PLANNING_BLOCKS)[number];

const planningInput = z.discriminatedUnion('block', [
  z.object({ block: z.literal('doseEscalation'), value: doseEscalation.nullable() }).strict(),
  z.object({ block: z.literal('accrualPlan'), value: accrualPlan.nullable() }).strict(),
  z.object({ block: z.literal('mmrmAssumptions'), value: mmrmAssumptions.nullable() }).strict(),
  z.object({ block: z.literal('externalControlPlan'), value: externalControlPlan.nullable() }).strict(),
  z.object({ block: z.literal('masterProtocol'), value: masterProtocol.nullable() }).strict(),
  z.object({ block: z.literal('activityAttributes'), value: activityAttributes }).strict(),
]);

export type PlanningInput = z.infer<typeof planningInput>;

/** Validate a request body's `{ block, value }`. Issues carry the path, so the author sees which field. */
export function parsePlanningInput(body: unknown): { ok: true; input: PlanningInput } | { ok: false; issues: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  const parsed = planningInput.safeParse({ block: b.block, value: b.value });
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => `${['value', ...i.path.slice(1)].join('.')}: ${i.message}`) };
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
    case 'activityAttributes':
      return applyActivity(design, input.value);
  }
}
