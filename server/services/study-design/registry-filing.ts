/**
 * Registry filing — what a trial-registry record NEEDS, and what it LACKS.
 *
 * `registration-projection.ts` renders the design object as a registry record.
 * That record is not a read-only curiosity: registering a trial is a statutory
 * obligation with a deadline (FDAAA 801 / 42 CFR Part 11 for
 * ClinicalTrials.gov, Regulation (EU) 536/2014 for the EU CTIS). This engine
 * takes the projected record plus what has been placed against it and reports
 * the filing's requirements, its gaps and its clocks.
 *
 * ── The rule that shapes every branch here ───────────────────────────────────
 *
 * The same asymmetry `server/services/irb/package-manifest.ts` was written
 * around: a requirement this platform does not record enough to judge is
 * `undetermined`, never `not_required`. It is counted separately, it blocks
 * readiness, and it names the field that would settle it.
 *
 * ── And one clock this platform does not own ─────────────────────────────────
 *
 * FDAAA 801's deadlines run from REAL-WORLD EVENTS — the first participant
 * enrolled, the primary completion date — that this platform does not observe.
 * So a deadline is computed ONLY from a date the caller supplies. There is no
 * `Date.now()` in this file and there must never be one: a deadline measured
 * against today, from an enrollment date nobody recorded, is a false clean
 * bill on a statutory obligation. Absent anchor ⇒ `undetermined`, with the
 * field that would settle it.
 *
 * ── And one thing it must never say ──────────────────────────────────────────
 *
 * This platform does not talk to ClinicalTrials.gov or to CTIS. There is no
 * gateway, no acknowledgement and no receipt. The engine reports what a record
 * CONTAINS and what it LACKS; it never reports that a record was submitted,
 * posted, accepted or transmitted, and `OBLIGATION_STATUSES` deliberately has
 * no value meaning "discharged". `docs/design/IRB_SUBMISSION.md` D3 states the
 * rule; `ci:action-overclaim` polices its surface form.
 *
 * Pure and total: no DB, no RNG, no clock, no LLM.
 *
 * @module server/services/study-design/registry-filing
 */

import {
  REGISTRY_MODULE_SLOTS,
  REGISTRY_SLOTS,
  type RegistrySlot,
} from '../../../shared/regulatory/placement-vocabulary';
import type { RegistrationRecord, RegistrationRegistry } from './registration-projection';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * How badly the registry wants it. Identical vocabulary to the IRB manifest,
 * for the same reason: `undetermined` is a first-class outcome, not a shrug.
 */
export type FilingRequirement = 'required' | 'conditional' | 'undetermined' | 'optional' | 'not_required';

/**
 * What can be said about a deadline.
 *
 * There is NO value meaning met, on-time, filed or discharged. That is not an
 * oversight: this platform never observes a registry posting, so any such
 * value could only ever be inferred from an absence, and inferring it is the
 * defect this engine exists to prevent.
 *
 *   • `undetermined`    — the anchoring event, or applicability, is not recorded.
 *   • `not_applicable`  — a RECORDED fact takes the obligation out of scope.
 *   • `deadline_known`  — an anchor was supplied and a deadline computed, but no
 *                          as-of date was supplied, so nothing is said about
 *                          whether it has passed.
 *   • `due`             — as-of date supplied and on or before the deadline.
 *   • `elapsed`         — as-of date supplied and after the deadline.
 */
export type ObligationStatus = 'undetermined' | 'not_applicable' | 'deadline_known' | 'due' | 'elapsed';

export const OBLIGATION_STATUSES: readonly ObligationStatus[] = [
  'undetermined', 'not_applicable', 'deadline_known', 'due', 'elapsed',
] as const;

/**
 * What the caller records about the trial. Every field is optional and an
 * ABSENT field stays absent — it is never read as a "no" and never replaced by
 * a default.
 */
export interface RegistryFilingContext {
  /**
   * Whether this is an applicable clinical trial under 42 CFR 11.22. Absent
   * means not recorded, NOT "not applicable".
   */
  isApplicableClinicalTrial?: boolean | null;
  /** ISO `YYYY-MM-DD` date the first participant was enrolled. */
  firstEnrollmentDate?: string | null;
  /** ISO `YYYY-MM-DD` primary completion date (42 CFR 11.10(b)(40)). */
  primaryCompletionDate?: string | null;
  /** ISO `YYYY-MM-DD` end of the trial, for Regulation (EU) 536/2014 Article 37. */
  endOfTrialDate?: string | null;
  /**
   * The ONLY clock this engine has. Absent means no clock: a deadline may be
   * computed and reported, but nothing is said about whether it has passed.
   */
  asOfDate?: string | null;
}

/**
 * A document placed against a registry slot, as the submission's leaves record
 * it. `placed`, not `filed`: this platform knows a document was put at a slot,
 * and nothing more than that.
 */
export interface PlacedRecord {
  slot: string;
  leafId: number;
  title: string;
  /** True when the leaf names a document store and a key within it. */
  resolvable: boolean;
}

export interface FilingExpectation {
  slot: RegistrySlot;
  label: string;
  requirement: FilingRequirement;
  /** The instrument, or the recorded fact, behind the verdict. */
  basis: string;
  /** For `undetermined`: the context field that would settle it, by name. */
  settledBy?: string;
}

export interface FilingRow extends FilingExpectation {
  /** The projection modules that render into this slot, in record order. */
  modules: string[];
  /** Required fields of those modules the design object cannot fill. */
  contentGaps: string[];
  placed: PlacedRecord[];
  /** Every required field of every module at this slot is rendered. */
  contentComplete: boolean;
  /**
   * Needs BOTH: the content the projection owes this slot, and at least one
   * RESOLVABLE placement. A leaf that names no document is a placeholder, and
   * a placeholder is not a filing.
   */
  satisfied: boolean;
  unresolvable: number;
}

export interface TimelinessObligation {
  id: string;
  label: string;
  basis: string;
  status: ObligationStatus;
  /** The real-world event and the date supplied for it. Null when none was. */
  anchor: { event: string; date: string } | null;
  /** ISO `YYYY-MM-DD`, computed from the anchor only. Null when there is none. */
  deadline: string | null;
  /** For `undetermined`: the context field that would settle it. */
  settledBy?: string;
  detail: string;
}

export interface RegistryFilingCounts {
  required: number;
  requiredSatisfied: number;
  conditional: number;
  conditionalSatisfied: number;
  /** Requirements that could not be decided. Never folded into the others. */
  undetermined: number;
  /** Deadlines that could not be decided. Also never folded in. */
  undeterminedObligations: number;
  /** Required fields the projection cannot fill, across every slot. */
  contentGaps: number;
  /** Placements that name no resolvable document. */
  unresolvable: number;
  /** Placements at a slot no expectation covers. */
  unexpected: number;
}

export interface RegistryFiling {
  registry: RegistrationRegistry;
  standard: string;
  rows: FilingRow[];
  obligations: TimelinessObligation[];
  counts: RegistryFilingCounts;
  /**
   * True only when every `required` and `conditional` row is satisfied, the
   * projection leaves no required field unfilled, no placement is a
   * placeholder, and NOTHING — row or deadline — is undetermined.
   *
   * It means the record is ready to be filed by a human. It does not mean, and
   * must never be rendered as meaning, that anything reached a registry.
   */
  readyToFile: boolean;
  /** Placed at a slot no expectation covers, by code. */
  unexpectedSlots: string[];
  /** A projection module with no declared slot — a drift alarm, not a gap. */
  unexpectedModules: string[];
  /** Honesty marker: content and gaps only, never a transmission claim. */
  describesContentOnly: true;
}

// ─── Dates, with no clock ────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accept only an unambiguous ISO calendar date that survives a round trip, so
 * `2026-02-31` is refused rather than rolled into March. A value that is not a
 * date is treated exactly as an absent one: the obligation is undetermined and
 * the field is named.
 */
function parseIsoDate(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const iso = value.trim();
  if (!ISO_DATE.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === iso ? iso : null;
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Calendar years. 29 February plus one year lands on 1 March, which is the
 * conservative direction for a filing deadline only if it moves it EARLIER —
 * it does not, so the one-day drift is recorded here rather than hidden: a
 * deadline this engine reports is a computed guide, and the registry's own
 * determination governs.
 */
function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

// ─── Obligations ─────────────────────────────────────────────────────────────

const B_11_24 =
  'FDAAA 801 §402(j)(2)(C) / 42 CFR 11.24(a) — clinical trial registration information is due not later than 21 days after the first participant is enrolled';
const B_11_44 =
  '42 CFR 11.44(a) — clinical trial results information is due not later than one year after the primary completion date';
const B_EU_37 =
  'Regulation (EU) 536/2014 Article 37(4) — a summary of the results is due within one year of the end of the clinical trial';

const APPLICABILITY_FIELD = 'isApplicableClinicalTrial';

interface ObligationSpec {
  id: string;
  label: string;
  basis: string;
  anchorEvent: string;
  anchorField: 'firstEnrollmentDate' | 'primaryCompletionDate' | 'endOfTrialDate';
  deadlineFrom: (anchor: string) => string;
  /** Whether 42 CFR 11.22 applicability gates this obligation. */
  gatedOnApplicability: boolean;
}

const CTGOV_OBLIGATIONS: readonly ObligationSpec[] = [
  {
    id: 'ctgov-registration',
    label: 'Register the trial with ClinicalTrials.gov',
    basis: B_11_24,
    anchorEvent: 'First participant enrolled',
    anchorField: 'firstEnrollmentDate',
    deadlineFrom: (a) => addDays(a, 21),
    gatedOnApplicability: true,
  },
  {
    id: 'ctgov-results',
    label: 'Provide results information to ClinicalTrials.gov',
    basis: B_11_44,
    anchorEvent: 'Primary completion',
    anchorField: 'primaryCompletionDate',
    deadlineFrom: (a) => addYears(a, 1),
    gatedOnApplicability: true,
  },
];

const CTIS_OBLIGATIONS: readonly ObligationSpec[] = [
  {
    id: 'ctis-results-summary',
    label: 'Provide the summary of results to the EU CTIS',
    basis: B_EU_37,
    anchorEvent: 'End of the clinical trial',
    anchorField: 'endOfTrialDate',
    deadlineFrom: (a) => addYears(a, 1),
    gatedOnApplicability: false,
  },
];

function specsFor(registry: RegistrationRegistry): readonly ObligationSpec[] {
  return registry === 'EU CTIS' ? CTIS_OBLIGATIONS : CTGOV_OBLIGATIONS;
}

function undeterminedObligation(spec: ObligationSpec, settledBy: string, detail: string): TimelinessObligation {
  return {
    id: spec.id,
    label: spec.label,
    basis: spec.basis,
    status: 'undetermined',
    anchor: null,
    deadline: null,
    settledBy,
    detail,
  };
}

/** The applicability gate, or null when it does not decide the obligation. */
function applicabilityVerdict(spec: ObligationSpec, ctx: RegistryFilingContext): TimelinessObligation | null {
  if (!spec.gatedOnApplicability) return null;
  const applicable = ctx.isApplicableClinicalTrial;
  if (applicable === true) return null;
  if (applicable === false) {
    return {
      id: spec.id,
      label: spec.label,
      basis: spec.basis,
      status: 'not_applicable',
      anchor: null,
      deadline: null,
      detail: 'This trial is recorded as not an applicable clinical trial under 42 CFR 11.22.',
    };
  }
  return undeterminedObligation(
    spec,
    APPLICABILITY_FIELD,
    'Whether this is an applicable clinical trial under 42 CFR 11.22 is not recorded, so the obligation could not be decided. An unrecorded field is not a record that it does not apply.',
  );
}

function resolveObligation(spec: ObligationSpec, ctx: RegistryFilingContext): TimelinessObligation {
  const gate = applicabilityVerdict(spec, ctx);
  if (gate) return gate;

  const anchor = parseIsoDate(ctx[spec.anchorField]);
  if (anchor === null) {
    return undeterminedObligation(
      spec,
      spec.anchorField,
      `${spec.anchorEvent} is a real-world event this platform does not observe, and no date for it was supplied, so no deadline was computed. It is NOT recorded that the deadline has not arrived.`,
    );
  }

  const deadline = spec.deadlineFrom(anchor);
  const asOf = parseIsoDate(ctx.asOfDate);
  const common = { id: spec.id, label: spec.label, basis: spec.basis, anchor: { event: spec.anchorEvent, date: anchor }, deadline };
  if (asOf === null) {
    return {
      ...common,
      status: 'deadline_known',
      detail: `The deadline falls on ${deadline}. No as-of date was supplied, so nothing is said about whether it has passed; this platform never observes the registry, so it cannot report the obligation discharged either way.`,
    };
  }
  return {
    ...common,
    status: asOf > deadline ? 'elapsed' : 'due',
    detail:
      asOf > deadline
        ? `The deadline fell on ${deadline}, which is before the supplied as-of date ${asOf}. Whether the record reached the registry is not something this platform observes.`
        : `The deadline falls on ${deadline}, on or after the supplied as-of date ${asOf}.`,
  };
}

/** The deadlines a registry attaches to this trial. Pure; order is stable. */
export function timelinessObligations(
  registry: RegistrationRegistry,
  ctx: RegistryFilingContext,
): TimelinessObligation[] {
  return specsFor(registry).map((spec) => resolveObligation(spec, ctx));
}

// ─── The expectation table ───────────────────────────────────────────────────

/** Row order: the shape of the record, then the obligation-driven slots. */
const ROW_ORDER: readonly RegistrySlot[] = [
  'registry.identification',
  'registry.status',
  'registry.sponsor',
  'registry.conditions',
  'registry.design',
  'registry.arms-and-interventions',
  'registry.outcome-measures',
  'registry.eligibility',
  'registry.member-states',
  'registry.results',
  'registry.other',
];

/**
 * Slots considered whatever the record emits: the EU-only one (so a
 * ClinicalTrials.gov record says WHY it is out of scope rather than omitting
 * it), results (an obligation the projection does not model), and the
 * supporting-material escape hatch.
 */
const ALWAYS_CONSIDERED: ReadonlySet<RegistrySlot> = new Set<RegistrySlot>([
  'registry.member-states',
  'registry.results',
  'registry.other',
]);

const CTGOV_BASIS: Readonly<Partial<Record<RegistrySlot, string>>> = {
  'registry.identification': '42 CFR 11.28(a)(2)(i) — descriptive information: the brief title and the official title',
  'registry.status': '42 CFR 11.28(a)(2)(i) and (a)(2)(ii) — study start date, primary completion date and overall recruitment status; 42 CFR 11.64(a) requires they be kept current',
  'registry.sponsor': '42 CFR 11.28(a)(2)(iv) — administrative data: the responsible party, the sponsor and human-subjects oversight',
  'registry.conditions': '42 CFR 11.28(a)(2)(i) — the condition or conditions studied',
  'registry.design': '42 CFR 11.28(a)(2)(i) — study type, phase, primary purpose, allocation, intervention model and masking',
  'registry.arms-and-interventions': '42 CFR 11.28(a)(2)(i) — the arms and the name and type of each intervention',
  'registry.outcome-measures': '42 CFR 11.28(a)(2)(i) — the primary and secondary outcome measures, each with its time frame',
  'registry.eligibility': '42 CFR 11.28(a)(2)(ii) — eligibility criteria, sex, age limits, whether healthy volunteers are eligible, and enrollment',
};

const CTIS_BASIS: Readonly<Partial<Record<RegistrySlot, string>>> = {
  'registry.identification': 'Regulation (EU) 536/2014 Annex I — the full title of the clinical trial',
  'registry.status': 'Regulation (EU) 536/2014 Articles 36 and 37 — notification of the start of recruitment and of the start and end of the trial',
  'registry.sponsor': 'Regulation (EU) 536/2014 Article 25 and Annex I — the sponsor and its legal representative in the Union',
  'registry.conditions': 'Regulation (EU) 536/2014 Annex I — the medical condition or conditions investigated',
  'registry.design': 'Regulation (EU) 536/2014 Annex I — the design of the trial, including control, randomisation and blinding',
  'registry.arms-and-interventions': 'Regulation (EU) 536/2014 Annex I — the investigational and auxiliary medicinal products',
  'registry.outcome-measures': 'Regulation (EU) 536/2014 Annex I — the objectives and the primary and secondary endpoints',
  'registry.eligibility': 'Regulation (EU) 536/2014 Annex I — the inclusion and exclusion criteria and the number of subjects planned',
  'registry.member-states': 'Regulation (EU) 536/2014 Article 5(1) — the application names the Member States concerned',
};

function contentBasis(registry: RegistrationRegistry, slot: RegistrySlot): string {
  const table = registry === 'EU CTIS' ? CTIS_BASIS : CTGOV_BASIS;
  return table[slot] ?? `The ${registry} record renders this section of the registration.`;
}

/** What the projection puts at each slot, and what it cannot fill. */
interface SlotContent {
  modules: string[];
  gaps: string[];
}

function contentBySlot(record: RegistrationRecord): { bySlot: Map<RegistrySlot, SlotContent>; unexpectedModules: string[] } {
  const bySlot = new Map<RegistrySlot, SlotContent>();
  const unexpectedModules: string[] = [];
  for (const module of record.modules) {
    const slot = REGISTRY_MODULE_SLOTS[module.name];
    if (!slot) {
      unexpectedModules.push(module.name);
      continue;
    }
    const entry = bySlot.get(slot) ?? { modules: [], gaps: [] };
    entry.modules.push(module.name);
    for (const f of module.fields) {
      if (f.required && f.status !== 'rendered') {
        entry.gaps.push(f.gap ?? `${f.name} is required but not rendered.`);
      }
    }
    bySlot.set(slot, entry);
  }
  return { bySlot, unexpectedModules: unexpectedModules.sort() };
}

/**
 * The results slot. Gated twice, and undetermined at either gate: results
 * information is owed only by an applicable clinical trial, and its clock runs
 * from a primary completion date this platform does not observe.
 */
function resultsExpectation(ctx: RegistryFilingContext): FilingExpectation {
  const label = REGISTRY_SLOTS['registry.results'];
  const base = { slot: 'registry.results' as const, label };
  if (ctx.isApplicableClinicalTrial === false) {
    return { ...base, requirement: 'not_required', basis: 'This trial is recorded as not an applicable clinical trial under 42 CFR 11.22.' };
  }
  if (ctx.isApplicableClinicalTrial !== true) {
    return {
      ...base,
      requirement: 'undetermined',
      basis: `${B_11_44}. Whether 42 CFR Part 11 applies to this trial is not recorded, so the requirement could not be decided. An unrecorded field is not a record that it does not apply.`,
      settledBy: APPLICABILITY_FIELD,
    };
  }
  if (parseIsoDate(ctx.primaryCompletionDate) === null) {
    return {
      ...base,
      requirement: 'undetermined',
      basis: `${B_11_44}. No primary completion date is recorded, so the requirement could not be decided. An unrecorded field is not a record that it does not apply.`,
      settledBy: 'primaryCompletionDate',
    };
  }
  return { ...base, requirement: 'conditional', basis: `${B_11_44}. A primary completion date is recorded for this trial.` };
}

function memberStatesExpectation(registry: RegistrationRegistry, hasContent: boolean): FilingExpectation {
  const label = REGISTRY_SLOTS['registry.member-states'];
  if (hasContent) {
    return { slot: 'registry.member-states', label, requirement: 'required', basis: contentBasis(registry, 'registry.member-states') };
  }
  return {
    slot: 'registry.member-states',
    label,
    requirement: 'not_required',
    basis: `This record names ${registry}. Concerned Member States are an EU CTIS field under Regulation (EU) 536/2014 Article 5(1), and this is a recorded fact about the record, not an absence.`,
  };
}

function expectationFor(
  slot: RegistrySlot,
  registry: RegistrationRegistry,
  hasContent: boolean,
  ctx: RegistryFilingContext,
): FilingExpectation | null {
  if (slot === 'registry.results') return resultsExpectation(ctx);
  if (slot === 'registry.member-states') return memberStatesExpectation(registry, hasContent);
  if (slot === 'registry.other') {
    return { slot, label: REGISTRY_SLOTS[slot], requirement: 'optional', basis: 'Supporting material a registry accepts but does not demand.' };
  }
  if (!hasContent) return null;
  return { slot, label: REGISTRY_SLOTS[slot], requirement: 'required', basis: contentBasis(registry, slot) };
}

/**
 * What this record's registry expects of THIS trial. A slot the record's
 * projector emits nothing for is omitted rather than invented — except the
 * three in `ALWAYS_CONSIDERED`, which say why they are out of scope.
 */
export function filingExpectations(record: RegistrationRecord, ctx: RegistryFilingContext): FilingExpectation[] {
  const { bySlot } = contentBySlot(record);
  const out: FilingExpectation[] = [];
  for (const slot of ROW_ORDER) {
    const hasContent = bySlot.has(slot);
    if (!hasContent && !ALWAYS_CONSIDERED.has(slot)) continue;
    const e = expectationFor(slot, record.registry, hasContent, ctx);
    if (e) out.push(e);
  }
  return out;
}

// ─── The filing ──────────────────────────────────────────────────────────────

function groupPlaced(placed: readonly PlacedRecord[]): Map<string, PlacedRecord[]> {
  const bySlot = new Map<string, PlacedRecord[]>();
  for (const p of placed) {
    const list = bySlot.get(p.slot) ?? [];
    list.push(p);
    bySlot.set(p.slot, list);
  }
  for (const list of bySlot.values()) list.sort((a, b) => a.leafId - b.leafId);
  return bySlot;
}

function countRows(rows: readonly FilingRow[], requirement: FilingRequirement): { total: number; satisfied: number } {
  const mine = rows.filter((r) => r.requirement === requirement);
  return { total: mine.length, satisfied: mine.filter((r) => r.satisfied).length };
}

function tally(
  rows: readonly FilingRow[],
  obligations: readonly TimelinessObligation[],
  extraUnresolvable: number,
  unexpected: number,
): RegistryFilingCounts {
  const req = countRows(rows, 'required');
  const cond = countRows(rows, 'conditional');
  return {
    required: req.total,
    requiredSatisfied: req.satisfied,
    conditional: cond.total,
    conditionalSatisfied: cond.satisfied,
    undetermined: rows.filter((r) => r.requirement === 'undetermined').length,
    undeterminedObligations: obligations.filter((o) => o.status === 'undetermined').length,
    contentGaps: rows.reduce((n, r) => n + r.contentGaps.length, 0),
    unresolvable: rows.reduce((n, r) => n + r.unresolvable, 0) + extraUnresolvable,
    unexpected,
  };
}

function isReady(counts: RegistryFilingCounts): boolean {
  return (
    counts.required === counts.requiredSatisfied &&
    counts.conditional === counts.conditionalSatisfied &&
    counts.undetermined === 0 &&
    counts.undeterminedObligations === 0 &&
    counts.contentGaps === 0 &&
    counts.unresolvable === 0
  );
}

/**
 * What a registry filing needs, and what is missing. Deterministic: the same
 * record, context and placements always give the same filing, and the order
 * placements arrive in does not matter.
 */
export function buildRegistryFiling(
  record: RegistrationRecord,
  ctx: RegistryFilingContext,
  placed: readonly PlacedRecord[],
): RegistryFiling {
  const { bySlot, unexpectedModules } = contentBySlot(record);
  const placedBySlot = groupPlaced(placed);
  const expectations = filingExpectations(record, ctx);

  const rows: FilingRow[] = expectations.map((e) => {
    const content = bySlot.get(e.slot) ?? { modules: [], gaps: [] };
    const mine = placedBySlot.get(e.slot) ?? [];
    const contentComplete = content.gaps.length === 0;
    return {
      ...e,
      modules: [...content.modules],
      contentGaps: [...content.gaps],
      placed: [...mine],
      contentComplete,
      satisfied: contentComplete && mine.some((p) => p.resolvable),
      unresolvable: mine.filter((p) => !p.resolvable).length,
    };
  });

  const covered = new Set<string>(expectations.map((e) => e.slot));
  const unexpectedSlots = [...placedBySlot.keys()].filter((s) => !covered.has(s)).sort();
  const strays = unexpectedSlots.flatMap((s) => placedBySlot.get(s) ?? []);
  const obligations = timelinessObligations(record.registry, ctx);
  const counts = tally(rows, obligations, strays.filter((p) => !p.resolvable).length, strays.length);

  return {
    registry: record.registry,
    standard: record.standard,
    rows,
    obligations,
    counts,
    readyToFile: isReady(counts),
    unexpectedSlots,
    unexpectedModules,
    describesContentOnly: true,
  };
}
