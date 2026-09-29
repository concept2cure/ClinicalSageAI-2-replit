/**
 * WHO Trial Registration Data Set projection — the design object rendered as the
 * 24-item WHO ICTRP Trial Registration Data Set (TRDS), version 1.3.1.
 *
 * ── The need ──────────────────────────────────────────────────────────────────
 * The WHO International Clinical Trials Registry Platform (ICTRP) defines the
 * minimum data set every WHO primary registry (ISRCTN, ANZCTR, CTRI, jRCT, ChiCTR,
 * DRKS, …) collects, and the ICMJE clinical trial registration policy makes
 * prospective registration in a WHO primary registry (or ClinicalTrials.gov) a
 * condition of publication. The repository projected the design only as
 * ClinicalTrials.gov and EU CTIS records (`registration-projection.ts`); this is
 * the sibling projection for the WHO data set, rendered from the same object so it
 * cannot disagree with the protocol.
 *
 * WHICH registry a trial must use, and by when, is not decided here:
 * `server/services/global-ri/clinical-trial-disclosure.ts` (market `WHO_ICMJE`)
 * owns applicability and deadlines. This module renders what the design would
 * contribute to a TRDS record, and nothing more.
 *
 * ── Honesty contract (CLAUDE.md — fail closed, never fabricate) ──────────────
 *   - Items 1–8, 16, 18 and 21–24 (registry and secondary ids, registration date,
 *     funding, sponsors, contacts, first-enrollment date, recruitment status,
 *     ethics review, completion date, summary results, IPD statement) are not part
 *     of a study design. They are ALWAYS `missing` with the gap
 *     {@link NOT_CARRIED_BY_DESIGN}. Nothing on the design — its id, its programme
 *     id, an NCT number cited as evidence — is read into them.
 *   - Item 9 Public Title renders `StudyDesign.publicTitle`, the lay-language title
 *     a person recorded. `title` is the scientific title (item 10) and is never
 *     reused as the public one: without a public title, item 9 is missing and
 *     names the field that would settle it.
 *   - Item 10 asks for the trial acronym "if available": a recorded
 *     `StudyDesign.acronym` is appended to the scientific title. An absent acronym
 *     leaves item 10 rendered — the study may have none.
 *   - An item is `rendered` only when the design carries everything the TRDS item
 *     asks for. `partial` names what is absent (sex under item 14, purpose under
 *     item 15, a stated timepoint under 19/20, intervention detail under 13).
 *     `missing` carries a reason. Nothing is defaulted, mapped by guess, or converted.
 *   - Item 11 renders the countries of the planned recruiting sites
 *     (`accrualPlan.sites[].country`). `targetRegions` entries alone are only
 *     `partial`: the design does not say each one is a country of recruitment.
 *   - Items 13, 19 and 20 are rendered by `who-ictrp-arms-outcomes.ts`, whose header
 *     states their contract (intervention detail; a Schedule of Activities visit is
 *     never presented as a stated timepoint; an unresolved visit id is never shown).
 *   - Eligibility is read by `eligibility-model.ts` (`projectRegistryEligibility`):
 *     every inclusion or exclusion criterion with text is rendered verbatim; a blank
 *     criterion, or one whose type is neither, is named in the gap, never dropped
 *     silently. Age limits only when an inclusion criterion states them, in the
 *     criterion's own unit.
 *   - Vocabulary lookups (phase, allocation, blinding, structural design) read own
 *     properties only, so a persisted value outside the union — "constructor", "2/3"
 *     — is echoed in a gap, never rendered as an Object.prototype member. A
 *     single-arm structural design that records several arms or a randomization is
 *     a contradiction: neither allocation nor assignment is stated.
 *   - The item list is frozen to the element; the summary is counted from the
 *     items, so a dropped item cannot hide behind a constant.
 *
 * This is a projection, not a registration: nothing is submitted to any registry.
 * Pure: no DB, RNG, clock or model call.
 *
 * Basis: WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1; ICMJE clinical trial
 * registration policy.
 *
 * @module server/services/study-design/who-ictrp-registration
 */

import type { AllocationMethod, BlindingLevel, StudyDesign, StudyPhase } from './study-design-types';
import type { RegistrationFieldStatus } from './registration-projection';
import { projectRegistryEligibility, type RegistryAgeLimit, type RegistryEligibilityRow } from './eligibility-model';
import { present } from './usdm-types';
import {
  fromParts,
  interventions,
  missing,
  partial,
  primaryOutcomes,
  rendered,
  secondaryOutcomes,
  type Rendering,
} from './who-ictrp-arms-outcomes';

export const WHO_TRDS_VERSION = '1.3.1' as const;

export const WHO_ICTRP_BASIS =
  'WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1 — 24 items; ICMJE clinical trial registration policy';

/** The gap every registration-only item carries, verbatim. */
export const NOT_CARRIED_BY_DESIGN = 'not carried by the study design; supplied at registration';

export interface WhoTrdsItemDefinition {
  readonly number: number;
  readonly name: string;
}

/** The 24 TRDS items in official order, with their official names. Frozen to the element. */
export const WHO_TRDS_ITEMS: readonly Readonly<WhoTrdsItemDefinition>[] = Object.freeze(
  ([
    { number: 1, name: 'Primary Registry and Trial Identifying Number' },
    { number: 2, name: 'Date of Registration in Primary Registry' },
    { number: 3, name: 'Secondary Identifying Numbers' },
    { number: 4, name: 'Source(s) of Monetary or Material Support' },
    { number: 5, name: 'Primary Sponsor' },
    { number: 6, name: 'Secondary Sponsor(s)' },
    { number: 7, name: 'Contact for Public Queries' },
    { number: 8, name: 'Contact for Scientific Queries' },
    { number: 9, name: 'Public Title' },
    { number: 10, name: 'Scientific Title' },
    { number: 11, name: 'Countries of Recruitment' },
    { number: 12, name: 'Health Condition(s) or Problem(s) Studied' },
    { number: 13, name: 'Intervention(s)' },
    { number: 14, name: 'Key Inclusion and Exclusion Criteria' },
    { number: 15, name: 'Study Type' },
    { number: 16, name: 'Date of First Enrollment' },
    { number: 17, name: 'Sample Size' },
    { number: 18, name: 'Recruitment Status' },
    { number: 19, name: 'Primary Outcome(s)' },
    { number: 20, name: 'Key Secondary Outcomes' },
    { number: 21, name: 'Ethics Review' },
    { number: 22, name: 'Completion Date' },
    { number: 23, name: 'Summary Results' },
    { number: 24, name: 'IPD Sharing Statement' },
  ] as WhoTrdsItemDefinition[]).map(def => Object.freeze(def)),
);

/** Same vocabulary as the ClinicalTrials.gov / CTIS projection. */
export type WhoTrdsItemStatus = RegistrationFieldStatus;

export interface WhoTrdsItem {
  number: number;
  name: string;
  status: WhoTrdsItemStatus;
  /** The rendered value, or null when the design does not carry the item. */
  value: string | string[] | null;
  /** What is absent, whenever status is not 'rendered'. */
  gap?: string;
  /** The design path(s) the value was read from, whenever a value is rendered. */
  source?: string;
}

export interface WhoIctrpSummary {
  rendered: number;
  partial: number;
  missing: number;
  /** Counted from the items (24 for a well-formed record), never asserted. */
  total: number;
}

export interface WhoIctrpRecord {
  registry: 'WHO ICTRP (TRDS)';
  version: typeof WHO_TRDS_VERSION;
  items: WhoTrdsItem[];
  summary: WhoIctrpSummary;
  basis: string;
}

/** An own-property lookup: a persisted value outside the vocabulary finds nothing, never an Object.prototype member. */
function lookup(table: Readonly<Record<string, string>>, key: unknown): string | undefined {
  return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined;
}

function distinctTrimmed(list: readonly unknown[] | undefined): string[] {
  return [...new Set((list ?? []).filter(present).map(s => s.trim()))];
}

// ─── Items 9–12: titles, countries, condition ────────────────────────────────

const PUBLIC_TITLE_GAP =
  'StudyDesign.publicTitle is empty: the design records no public (lay-language) title, and the scientific ' +
  'title is not reused as the public one (it is item 10). A public title recorded on the study design would settle this item.';

function publicTitle(d: StudyDesign): Rendering {
  return present(d.publicTitle) ? rendered(d.publicTitle.trim(), 'StudyDesign.publicTitle') : missing(PUBLIC_TITLE_GAP);
}

const COUNTRIES_GAP =
  'Rendered verbatim from StudyDesign.targetRegions, which records planned target regions. The design does not ' +
  'state that each entry is a country of recruitment, and this projection neither checks that an entry is a ' +
  'country nor expands a region (e.g. "EU") into its countries.';

function scientificTitle(d: StudyDesign): Rendering {
  if (!present(d.title)) return missing('StudyDesign.title is empty; the design records no scientific title.');
  return present(d.acronym)
    ? rendered(`${d.title} (${d.acronym.trim()})`, 'StudyDesign.title; StudyDesign.acronym')
    : rendered(d.title, 'StudyDesign.title');
}

/** The planned recruiting sites' countries; target regions only when no site records a country. */
function countries(d: StudyDesign): Rendering {
  const sites = d.accrualPlan?.sites ?? [];
  const siteCountries = distinctTrimmed(sites.map(s => s?.country));
  const regions = distinctTrimmed(d.targetRegions);
  if (siteCountries.length === 0) {
    if (regions.length === 0) {
      return missing('Neither StudyDesign.accrualPlan.sites[].country nor StudyDesign.targetRegions records a country or region.');
    }
    return partial(regions, COUNTRIES_GAP, 'StudyDesign.targetRegions');
  }
  const gaps: string[] = [];
  const unplaced = sites.filter(s => !present(s?.country)).length;
  if (unplaced) {
    gaps.push(`${unplaced} of ${sites.length} planned site(s) in StudyDesign.accrualPlan.sites record no country, so the countries of recruitment may be incomplete.`);
  }
  const unmatched = regions.filter(r => !siteCountries.includes(r));
  if (unmatched.length) {
    gaps.push(`StudyDesign.targetRegions also records ${unmatched.map(r => `"${r}"`).join(', ')}, which no planned site's country matches; not rendered as a country of recruitment.`);
  }
  return fromParts(siteCountries, gaps, 'StudyDesign.accrualPlan.sites[].country', '');
}

function condition(d: StudyDesign): Rendering {
  return present(d.indication)
    ? rendered(d.indication, 'StudyDesign.indication')
    : missing('StudyDesign.indication is empty; the design records no health condition or problem studied.');
}

// ─── Item 14: eligibility, via eligibility-model.ts ──────────────────────────

const SEX_SETTLED_BY =
  'TRDS item 14 asks for eligibility sex, and StudyDesign.population declares no field that records it.';

/** The bound in the criterion's own unit and sense. Nothing is converted or rounded. */
function ageText(limit: RegistryAgeLimit): string {
  return `${limit.value} ${limit.unit} (${limit.inclusive ? 'inclusive' : 'exclusive'})`;
}

interface CriteriaSplit {
  inclusion: string[];
  exclusion: string[];
  blank: number;
  unrecognised: string[];
}

function splitCriteria(rows: RegistryEligibilityRow[]): CriteriaSplit {
  const split: CriteriaSplit = { inclusion: [], exclusion: [], blank: 0, unrecognised: [] };
  for (const r of rows) {
    const type: unknown = r.type;
    if (!present(r.text)) split.blank += 1;
    else if (type === 'inclusion') split.inclusion.push(`Inclusion: ${r.text}`);
    else if (type === 'exclusion') split.exclusion.push(`Exclusion: ${r.text}`);
    else split.unrecognised.push(`criterion "${r.text}" has unrecognised type "${String(type)}"`);
  }
  return split;
}

function droppedCriteriaGaps(s: CriteriaSplit): string[] {
  const gaps: string[] = [];
  if (s.unrecognised.length) {
    gaps.push(`Not rendered: ${s.unrecognised.join('; ')} (the recognised types are "inclusion" and "exclusion").`);
  }
  if (s.blank) {
    gaps.push(s.blank === 1
      ? '1 recorded eligibility criterion with empty text is not rendered.'
      : `${s.blank} recorded eligibility criteria with empty text are not rendered.`);
  }
  return gaps;
}

function eligibility(d: StudyDesign): Rendering {
  const block = projectRegistryEligibility(d.population?.eligibility ?? []);
  const reasons = new Map(block.absent.map(a => [a.field, a.reason] as const));
  if (block.criteria.length === 0) return missing(reasons.get('Eligibility criteria') ?? 'The design records no eligibility criteria.');
  const split = splitCriteria(block.criteria);
  const values = [...split.inclusion, ...split.exclusion];
  if (values.length === 0) {
    return missing(split.unrecognised.length ? droppedCriteriaGaps(split).join(' ') : 'Every recorded eligibility criterion is empty.');
  }
  const gaps: string[] = droppedCriteriaGaps(split);
  if (split.inclusion.length === 0) gaps.push('No inclusion criterion is recorded.');
  if (split.exclusion.length === 0) gaps.push('No exclusion criterion is recorded.');
  if (block.minimumAge) values.push(`Minimum age: ${ageText(block.minimumAge)}`);
  else gaps.push(`Minimum age: ${reasons.get('Minimum age') ?? 'no lower age bound is stated.'}`);
  if (block.maximumAge) values.push(`Maximum age: ${ageText(block.maximumAge)}`);
  else gaps.push(`Maximum age: ${reasons.get('Maximum age') ?? 'no upper age bound is stated.'}`);
  gaps.push(`Sex: ${reasons.get('Sex') ?? 'eligibility sex is not recorded.'} ${SEX_SETTLED_BY}`);
  return fromParts(values, gaps, 'StudyDesign.population.eligibility (read by eligibility-model.ts)', '');
}

// ─── Item 15: study type and design ──────────────────────────────────────────

/** TRDS phase options are whole phases; a sub-phase keeps its recorded label beside the mapping. */
const TRDS_PHASE: Readonly<Record<StudyPhase, string>> = Object.freeze({
  FIH: '1', '1': '1', '1b': '1', '2': '2', '2b': '2', '3': '3', '3b': '3', '4': '4',
});

/** Only the structural designs that ARE a TRDS assignment category. Nothing else is mapped. */
const TRDS_ASSIGNMENT: Readonly<Record<string, string>> = Object.freeze({
  single_arm: 'Single arm',
  parallel_group: 'Parallel',
  crossover: 'Crossover',
  factorial: 'Factorial',
});

/** Minimization is not called randomized: the design does not record whether it has a random element. */
const TRDS_ALLOCATION: Readonly<Record<AllocationMethod, string>> = Object.freeze({
  simple: 'Randomized (simple)',
  block: 'Randomized (block)',
  stratified: 'Randomized (stratified)',
  minimization: 'Minimization',
  none: 'Non-randomized',
});

const TRDS_MASKING: Readonly<Record<BlindingLevel, string>> = Object.freeze({
  open: 'None (open label)',
  single: 'Single blind',
  double: 'Double blind',
  triple: 'Triple blind',
});

const PURPOSE_GAP =
  'Purpose (treatment, prevention, diagnostic, …) is not recorded on the study design.';

const MINIMIZATION_GAP =
  'Whether the minimization includes a random element is not recorded, so randomized versus non-randomized allocation is not stated.';

interface Parts {
  values: string[];
  gaps: string[];
  sources: string[];
}

function studyTypePart(d: StudyDesign, p: Parts): void {
  if ((d.arms ?? []).some(a => (a.interventions ?? []).length > 0)) {
    p.values.push('Study type: Interventional');
    p.sources.push('StudyDesign.arms[].interventions (protocol-assigned interventions)');
    return;
  }
  p.gaps.push('Study type is not stated: no arm assigns an intervention, so interventional versus observational cannot be read from the design.');
}

/** A single-arm structural design that records several arms or a randomization contradicts itself. */
function singleArmConflict(d: StudyDesign): string | null {
  if (d.framework?.structuralDesign !== 'single_arm') return null;
  const conflicts: string[] = [];
  const armCount = (d.arms ?? []).length;
  if (armCount > 1) conflicts.push(`${armCount} arms are recorded`);
  const method = d.randomization?.allocationMethod;
  if (present(method) && method !== 'none') conflicts.push(`randomization.allocationMethod is "${method}"`);
  if (conflicts.length === 0) return null;
  return `Allocation and assignment are not stated: the structural design is "single_arm" but ${conflicts.join(' and ')}; the design contradicts itself, and this projection does not choose a side.`;
}

function allocationPart(d: StudyDesign, p: Parts): void {
  if (d.framework?.structuralDesign === 'single_arm') {
    p.values.push('Allocation: N/A (single arm)');
    p.sources.push('StudyDesign.framework.structuralDesign');
    return;
  }
  const method = d.randomization?.allocationMethod;
  const label = lookup(TRDS_ALLOCATION, method);
  if (!label) {
    p.gaps.push(present(method)
      ? `Allocation is not stated: "${method}" is not a recognised allocation method.`
      : 'Allocation is not stated: the design records no randomization.');
    return;
  }
  p.values.push(`Allocation: ${label}`);
  p.sources.push('StudyDesign.randomization.allocationMethod');
  if (method === 'minimization') p.gaps.push(MINIMIZATION_GAP);
}

function maskingPart(d: StudyDesign, p: Parts): void {
  const level = d.randomization?.blinding;
  const label = lookup(TRDS_MASKING, level);
  if (!label) {
    p.gaps.push(present(level)
      ? `Masking is not stated: "${level}" is not a recognised blinding level.`
      : 'Masking is not stated: the design records no blinding level.');
    return;
  }
  p.values.push(`Masking: ${label}`);
  p.sources.push('StudyDesign.randomization.blinding');
  if (level !== 'open') {
    p.gaps.push(`Who is masked is not recorded: the design states the blinding level (${level}) but not which parties are masked.`);
  }
}

function assignmentPart(d: StudyDesign, p: Parts): void {
  const structural = d.framework?.structuralDesign;
  const label = lookup(TRDS_ASSIGNMENT, structural);
  if (label) {
    p.values.push(`Assignment: ${label}`);
    p.sources.push('StudyDesign.framework.structuralDesign');
    return;
  }
  p.gaps.push(
    present(structural)
      ? `Assignment is not mapped: the structural design "${structural}" is not one of the TRDS assignment categories (single arm, parallel, crossover, factorial), and this projection does not choose one for it.`
      : 'Assignment is not stated: the design records no structural design.',
  );
}

function phasePart(d: StudyDesign, p: Parts): void {
  const phase: unknown = d.phase;
  const mapped = lookup(TRDS_PHASE, phase);
  if (!mapped) {
    p.gaps.push(present(phase)
      ? `Phase is not stated: "${phase}" is not a recognised StudyPhase.`
      : 'Phase is not stated: the design records no phase.');
    return;
  }
  p.values.push(mapped === phase ? `Phase: ${mapped}` : `Phase: ${mapped} (recorded as ${String(phase)})`);
  p.sources.push('StudyDesign.phase');
}

function studyType(d: StudyDesign): Rendering {
  const p: Parts = { values: [], gaps: [], sources: [] };
  const conflict = singleArmConflict(d);
  studyTypePart(d, p);
  if (conflict) p.gaps.push(conflict);
  else allocationPart(d, p);
  maskingPart(d, p);
  if (!conflict) assignmentPart(d, p);
  phasePart(d, p);
  p.gaps.push(PURPOSE_GAP);
  return fromParts(p.values, p.gaps, [...new Set(p.sources)].join('; '), '');
}

// ─── Item 17: sample size ────────────────────────────────────────────────────

function sampleSize(d: StudyDesign): Rendering {
  const n = d.statisticalPlan?.plannedSampleSize;
  if (n === undefined || n === null) return missing('StudyDesign.statisticalPlan.plannedSampleSize is not recorded.');
  if (!Number.isInteger(n) || n <= 0) {
    return missing(`StudyDesign.statisticalPlan.plannedSampleSize (${String(n)}) is not a positive whole number of participants; it is not rendered.`);
  }
  return rendered(String(n), 'StudyDesign.statisticalPlan.plannedSampleSize');
}

// ─── Assembly ────────────────────────────────────────────────────────────────

type Renderer = (d: StudyDesign) => Rendering;

/** The items a study design can contribute to. Every other item is registration-only. */
const DESIGN_RENDERERS: Readonly<Record<number, Renderer>> = Object.freeze({
  9: publicTitle,
  10: scientificTitle,
  11: countries,
  12: condition,
  13: interventions,
  14: eligibility,
  15: studyType,
  17: sampleSize,
  19: primaryOutcomes,
  20: secondaryOutcomes,
});

/** The item numbers that are always missing with {@link NOT_CARRIED_BY_DESIGN}. */
export const WHO_TRDS_REGISTRATION_ONLY_ITEMS: readonly number[] = Object.freeze(
  WHO_TRDS_ITEMS.map(i => i.number).filter(n => !Object.hasOwn(DESIGN_RENDERERS, n)),
);

function renderItem(def: Readonly<WhoTrdsItemDefinition>, d: StudyDesign): WhoTrdsItem {
  const render = Object.hasOwn(DESIGN_RENDERERS, def.number) ? DESIGN_RENDERERS[def.number] : undefined;
  const r = render ? render(d) : missing(NOT_CARRIED_BY_DESIGN);
  const item: WhoTrdsItem = { number: def.number, name: def.name, status: r.status, value: r.value };
  if (r.gap !== undefined) item.gap = r.gap;
  if (r.source !== undefined) item.source = r.source;
  return item;
}

function summarise(items: WhoTrdsItem[]): WhoIctrpSummary {
  const count = (s: WhoTrdsItemStatus): number => items.filter(i => i.status === s).length;
  return { rendered: count('rendered'), partial: count('partial'), missing: count('missing'), total: items.length };
}

/**
 * Project a design as the WHO ICTRP Trial Registration Data Set. Deterministic;
 * never reads a registry id, date, sponsor, funder, contact or status from the
 * design, because the design does not carry them.
 */
export function projectWhoIctrp(design: StudyDesign): WhoIctrpRecord {
  const items = WHO_TRDS_ITEMS.map(def => renderItem(def, design));
  return {
    registry: 'WHO ICTRP (TRDS)',
    version: WHO_TRDS_VERSION,
    items,
    summary: summarise(items),
    basis: WHO_ICTRP_BASIS,
  };
}
