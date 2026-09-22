/**
 * What actually changed between two versions of a study design.
 *
 * `classifyAmendmentImpact` (protocol-amendments-logic.ts) takes the sponsor's
 * DECLARED amendment type and echoes a review path back. That is the right
 * answer to a different question: it maps a declaration onto 45 CFR 46.110 /
 * 21 CFR 56.110, and it cannot tell whether the declaration is correct,
 * because nothing in this codebase compared the two protocol versions.
 *
 * This module does the comparison. It is the input `substantiality.ts` needs
 * to say anything about EU CTR 536/2014 Article 16, where "substantial" is
 * defined by the EFFECT of the change — on subject safety and rights, or on
 * the reliability and robustness of the data — not by what the sponsor called
 * it.
 *
 * Pure and total: no I/O, no clock, no randomness, no inference. Every field
 * is a structural comparison of two `StudyDesign` objects, and a field that
 * cannot be compared (because one side does not carry it) is reported as
 * `unknown`, never as `false`. "We did not look" and "nothing changed" are
 * different facts, and conflating them here would let an unexamined amendment
 * read as non-substantial downstream.
 *
 * @module server/services/protocol-amendments/design-delta
 */

import type { Endpoint, StudyDesign } from '../study-design/study-design-types';

/**
 * A three-valued comparison. `unknown` means neither side carried enough to
 * compare — it is NOT a "no".
 */
export type Changed = 'changed' | 'unchanged' | 'unknown';

/** A numeric field's before and after, where both are known. */
export interface NumericChange {
  before: number | null;
  after: number | null;
  /** Absolute difference, or null when either side is absent. */
  delta: number | null;
}

export interface DesignDelta {
  /** The primary endpoint's identity or definition changed. */
  primaryEndpoint: Changed;
  /** Any endpoint added, removed, or had its role changed. */
  endpointSet: Changed;
  /** Inclusion or exclusion criteria differ. */
  eligibility: Changed;
  /** Arms added, removed, or their interventions changed. */
  arms: Changed;
  /** Dose, regimen, route or duration of any intervention changed. */
  intervention: Changed;
  /** Blinding level or allocation changed. */
  randomization: Changed;
  /** Planned sample size, power, alpha or the analysis set changed. */
  statisticalPlan: Changed;
  /** Stopping rules, DLT definition or the DMC charter changed. */
  safety: Changed;
  /** Development phase changed. */
  phase: Changed;
  /** Target regions added or removed. */
  targetRegions: Changed;
  /** Planned sample size specifically, for the magnitude the rules need. */
  plannedSampleSize: NumericChange;
  /** Fields neither side carried, by name, so a caller can say what it could not compare. */
  notComparable: string[];
}

// ─── Comparison helpers ──────────────────────────────────────────────────────

/**
 * Canonical JSON: object keys sorted, ARRAY order preserved.
 *
 * Sorting keys is not cosmetic here. The "before" design is read back out of a
 * `jsonb` column, and jsonb does not preserve key order — it normalizes it. A
 * plain `JSON.stringify` comparison therefore reported an untouched design as
 * changed, and every indicator fired on an amendment where nothing had
 * happened. An engine that calls every amendment substantial is as useless as
 * one that calls none of them substantial, and more alarming.
 *
 * Array order stays significant, deliberately: reordering eligibility criteria
 * or arms IS a change to the protocol, and collapsing that would hide a real
 * edit.
 */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Structural equality, insensitive to object key order and to absent-vs-undefined. */
function same(a: unknown, b: unknown): boolean {
  return canonical(a ?? null) === canonical(b ?? null);
}

function absent(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * Compare one field. Absent on BOTH sides is `unknown`, not `unchanged`: two
 * designs that both fail to record a stopping rule have not told us the
 * stopping rules are the same, only that nobody wrote them down.
 */
function compare(beforeValue: unknown, afterValue: unknown, field: string, notComparable: string[]): Changed {
  if (absent(beforeValue) && absent(afterValue)) {
    notComparable.push(field);
    return 'unknown';
  }
  return same(beforeValue, afterValue) ? 'unchanged' : 'changed';
}

/** The identifying shape of an endpoint, for comparison. Excludes free-text evidence. */
function endpointIdentity(e: Endpoint): unknown {
  return {
    name: e.name.trim(),
    role: e.role,
    type: e.type,
    definition: (e.definition ?? '').trim(),
    timepoint: (e.timepoint ?? '').trim(),
  };
}

function primaryEndpointIdentities(d: StudyDesign): unknown[] {
  return (d.endpoints ?? []).filter((e) => e.role === 'primary').map(endpointIdentity);
}

function endpointSetIdentities(d: StudyDesign): unknown[] {
  return (d.endpoints ?? [])
    .map(endpointIdentity)
    .slice()
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
}

function interventionIdentities(d: StudyDesign): unknown[] {
  return (d.arms ?? []).flatMap((a) =>
    (a.interventions ?? []).map((i) => ({
      arm: a.name.trim(),
      name: i.name.trim(),
      role: i.role,
      dose: (i.dose ?? '').trim(),
      regimen: (i.regimen ?? '').trim(),
      route: (i.route ?? '').trim(),
      duration: (i.duration ?? '').trim(),
    })),
  );
}

function armIdentities(d: StudyDesign): unknown[] {
  return (d.arms ?? []).map((a) => ({
    name: a.name.trim(),
    interventions: (a.interventions ?? []).map((i) => i.name.trim()).sort((x, y) => x.localeCompare(y)),
  }));
}

/** The statistical fields whose change bears on data reliability and robustness. */
function statisticalIdentity(d: StudyDesign): unknown {
  const p = d.statisticalPlan;
  if (!p) return null;
  return {
    alpha: p.alpha ?? null,
    oneSided: p.oneSided ?? null,
    power: p.power ?? null,
    plannedSampleSize: p.plannedSampleSize ?? null,
    dropoutRate: p.dropoutRate ?? null,
    multiplicity: p.multiplicity ?? null,
    missingDataStrategy: (p.missingDataStrategy ?? '').trim(),
    analyses: (p.plannedAnalyses ?? []).map((a) => ({ endpointName: a.endpointName, method: a.method })),
  };
}

function numericChange(before: number | null | undefined, after: number | null | undefined): NumericChange {
  const b = typeof before === 'number' && Number.isFinite(before) ? before : null;
  const a = typeof after === 'number' && Number.isFinite(after) ? after : null;
  return { before: b, after: a, delta: b === null || a === null ? null : Math.abs(a - b) };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Compare two versions of a design. Pure; the same pair twice gives
 * byte-identical output.
 */
export function diffDesigns(before: StudyDesign, after: StudyDesign): DesignDelta {
  const notComparable: string[] = [];
  return {
    primaryEndpoint: compare(primaryEndpointIdentities(before), primaryEndpointIdentities(after), 'endpoints[role=primary]', notComparable),
    endpointSet: compare(endpointSetIdentities(before), endpointSetIdentities(after), 'endpoints', notComparable),
    eligibility: compare(before.population?.eligibility, after.population?.eligibility, 'population.eligibility', notComparable),
    arms: compare(armIdentities(before), armIdentities(after), 'arms', notComparable),
    intervention: compare(interventionIdentities(before), interventionIdentities(after), 'arms[].interventions', notComparable),
    randomization: compare(before.randomization, after.randomization, 'randomization', notComparable),
    statisticalPlan: compare(statisticalIdentity(before), statisticalIdentity(after), 'statisticalPlan', notComparable),
    safety: compare(before.safety, after.safety, 'safety', notComparable),
    phase: compare(before.phase, after.phase, 'phase', notComparable),
    targetRegions: compare(
      [...(before.targetRegions ?? [])].sort((a, b) => a.localeCompare(b)),
      [...(after.targetRegions ?? [])].sort((a, b) => a.localeCompare(b)),
      'targetRegions',
      notComparable,
    ),
    plannedSampleSize: numericChange(before.statisticalPlan?.plannedSampleSize, after.statisticalPlan?.plannedSampleSize),
    notComparable: notComparable.sort((a, b) => a.localeCompare(b)),
  };
}

/** True when every comparable field is `unchanged` and nothing is `unknown`. */
export function deltaIsFullyComparedAndClean(delta: DesignDelta): boolean {
  if (delta.notComparable.length > 0) return false;
  const fields: Changed[] = [
    delta.primaryEndpoint, delta.endpointSet, delta.eligibility, delta.arms,
    delta.intervention, delta.randomization, delta.statisticalPlan, delta.safety,
    delta.phase, delta.targetRegions,
  ];
  return fields.every((f) => f === 'unchanged');
}

/** The comparable fields that changed, by name — for a caller to display. */
export function changedFields(delta: DesignDelta): string[] {
  const named: Array<[string, Changed]> = [
    ['primary endpoint', delta.primaryEndpoint],
    ['endpoint set', delta.endpointSet],
    ['eligibility criteria', delta.eligibility],
    ['arms', delta.arms],
    ['intervention', delta.intervention],
    ['randomization or blinding', delta.randomization],
    ['statistical plan', delta.statisticalPlan],
    ['safety design', delta.safety],
    ['phase', delta.phase],
    ['target regions', delta.targetRegions],
  ];
  return named.filter(([, v]) => v === 'changed').map(([n]) => n);
}
