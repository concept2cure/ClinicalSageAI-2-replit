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
 *   - Item 9 Public Title: `StudyDesign` records one title. It is the scientific
 *     title (item 10) and is never reused as the public one, so item 9 is missing
 *     and names the field that would settle it.
 *   - An item is `rendered` only when the design carries everything the TRDS item
 *     asks for. `partial` names what is absent (sex under item 14, purpose under
 *     item 15, a timepoint under 19/20). `missing` carries a reason. Nothing is
 *     defaulted, mapped by guess, or converted.
 *   - Eligibility is read by `eligibility-model.ts` (`projectRegistryEligibility`):
 *     every criterion is rendered verbatim, age limits only when an inclusion
 *     criterion states them, in the criterion's own unit.
 *   - The summary is counted from the items, so a dropped item cannot hide behind
 *     a constant.
 *
 * This is a projection, not a registration: nothing is submitted to any registry.
 * Pure: no DB, RNG, clock or model call.
 *
 * Basis: WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1; ICMJE clinical trial
 * registration policy.
 *
 * @module server/services/study-design/who-ictrp-registration
 */

import type {
  BlindingLevel,
  Endpoint,
  Intervention,
  StructuralDesign,
  StudyDesign,
  StudyPhase,
} from './study-design-types';
import type { RegistrationFieldStatus } from './registration-projection';
import { endpointTimeFrameFromSoa } from './schedule-of-activities';
import { projectRegistryEligibility, type RegistryAgeLimit, type RegistryEligibilityBlock } from './eligibility-model';
import { describeIntervention, NO_INTERVENTION_LABEL } from './trial-schema';

export const WHO_TRDS_VERSION = '1.3.1' as const;

export const WHO_ICTRP_BASIS =
  'WHO ICTRP Trial Registration Data Set (TRDS) v1.3.1 — 24 items; ICMJE clinical trial registration policy';

/** The gap every registration-only item carries, verbatim. */
export const NOT_CARRIED_BY_DESIGN = 'not carried by the study design; supplied at registration';

export interface WhoTrdsItemDefinition {
  number: number;
  name: string;
}

/** The 24 TRDS items in official order, with their official names. */
export const WHO_TRDS_ITEMS: readonly WhoTrdsItemDefinition[] = Object.freeze([
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
]);

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

type Rendering = Pick<WhoTrdsItem, 'status' | 'value' | 'gap' | 'source'>;

// ─── Constructors ────────────────────────────────────────────────────────────

function present(s: unknown): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function rendered(value: string | string[], source: string): Rendering {
  return { status: 'rendered', value, source };
}

function partial(value: string[], gap: string, source: string): Rendering {
  return { status: 'partial', value, gap, source };
}

function missing(gap: string): Rendering {
  return { status: 'missing', value: null, gap };
}

/** Rendered when nothing is absent, partial when something is, missing when nothing is present. */
function fromParts(values: string[], gaps: string[], source: string, emptyGap: string): Rendering {
  if (values.length === 0) return missing(gaps.length ? gaps.join(' ') : emptyGap);
  return gaps.length ? partial(values, gaps.join(' '), source) : rendered(values, source);
}

// ─── Items 9–12: titles, countries, condition ────────────────────────────────

const PUBLIC_TITLE_GAP =
  'StudyDesign records a single title, which is rendered as the scientific title (item 10); it declares no ' +
  'public (lay) title, and the scientific title is not reused as the public one. A public title recorded on ' +
  'the study design would settle this item.';

const COUNTRIES_GAP =
  'Rendered verbatim from StudyDesign.targetRegions, which records planned target regions. The design does not ' +
  'state that each entry is a country of recruitment, and this projection neither checks that an entry is a ' +
  'country nor expands a region (e.g. "EU") into its countries.';

function scientificTitle(d: StudyDesign): Rendering {
  return present(d.title)
    ? rendered(d.title, 'StudyDesign.title')
    : missing('StudyDesign.title is empty; the design records no scientific title.');
}

function countries(d: StudyDesign): Rendering {
  const entries = [...new Set((d.targetRegions ?? []).filter(present).map(r => r.trim()))];
  if (entries.length === 0) return missing('StudyDesign.targetRegions records no country or region.');
  return partial(entries, COUNTRIES_GAP, 'StudyDesign.targetRegions');
}

function condition(d: StudyDesign): Rendering {
  return present(d.indication)
    ? rendered(d.indication, 'StudyDesign.indication')
    : missing('StudyDesign.indication is empty; the design records no health condition or problem studied.');
}

// ─── Item 13: interventions ──────────────────────────────────────────────────

/** trial-schema's "name dose route regimen", plus the duration and the role the arm gives it. */
function interventionText(i: Intervention): string {
  const duration = present(i.duration) ? `; duration ${i.duration}` : '';
  return `${describeIntervention(i)}${duration} (${i.role.replace(/_/g, ' ')})`;
}

function interventions(d: StudyDesign): Rendering {
  const arms = d.arms ?? [];
  if (arms.length === 0) return missing('StudyDesign.arms records no arm, so no intervention is recorded.');
  const empty = arms.filter(a => (a.interventions ?? []).length === 0).map(a => a.name);
  if (empty.length === arms.length) return missing('No arm in StudyDesign.arms records an intervention.');
  const values = arms.map(a => {
    const list = a.interventions ?? [];
    return `${a.name}: ${list.length ? list.map(interventionText).join(' + ') : NO_INTERVENTION_LABEL}`;
  });
  const gaps = empty.length ? [`No intervention is recorded for arm(s): ${empty.join(', ')}.`] : [];
  return fromParts(values, gaps, 'StudyDesign.arms[].interventions', '');
}

// ─── Item 14: eligibility, via eligibility-model.ts ──────────────────────────

const SEX_SETTLED_BY =
  'TRDS item 14 asks for eligibility sex, and StudyDesign.population declares no field that records it.';

function absentReason(block: RegistryEligibilityBlock, fieldName: string, fallback: string): string {
  return block.absent.find(a => a.field === fieldName)?.reason ?? fallback;
}

/** The bound in the criterion's own unit and sense. Nothing is converted or rounded. */
function ageText(limit: RegistryAgeLimit): string {
  return `${limit.value} ${limit.unit} (${limit.inclusive ? 'inclusive' : 'exclusive'})`;
}

function ageParts(block: RegistryEligibilityBlock, values: string[], gaps: string[]): void {
  if (block.minimumAge) values.push(`Minimum age: ${ageText(block.minimumAge)}`);
  else gaps.push(`Minimum age: ${absentReason(block, 'Minimum age', 'no lower age bound is stated.')}`);
  if (block.maximumAge) values.push(`Maximum age: ${ageText(block.maximumAge)}`);
  else gaps.push(`Maximum age: ${absentReason(block, 'Maximum age', 'no upper age bound is stated.')}`);
}

function eligibility(d: StudyDesign): Rendering {
  const block = projectRegistryEligibility(d.population?.eligibility ?? []);
  if (block.criteria.length === 0) {
    return missing(absentReason(block, 'Eligibility criteria', 'The design records no eligibility criteria.'));
  }
  const inclusion = block.criteria.filter(r => r.type === 'inclusion' && present(r.text)).map(r => `Inclusion: ${r.text}`);
  const exclusion = block.criteria.filter(r => r.type === 'exclusion' && present(r.text)).map(r => `Exclusion: ${r.text}`);
  if (inclusion.length + exclusion.length === 0) return missing('Every recorded eligibility criterion is empty.');
  const values = [...inclusion, ...exclusion];
  const gaps: string[] = [];
  if (inclusion.length === 0) gaps.push('No inclusion criterion is recorded.');
  if (exclusion.length === 0) gaps.push('No exclusion criterion is recorded.');
  ageParts(block, values, gaps);
  gaps.push(`Sex: ${absentReason(block, 'Sex', 'eligibility sex is not recorded.')} ${SEX_SETTLED_BY}`);
  return fromParts(values, gaps, 'StudyDesign.population.eligibility (read by eligibility-model.ts)', '');
}

// ─── Item 15: study type and design ──────────────────────────────────────────

/** TRDS phase options are whole phases; a sub-phase keeps its recorded label beside the mapping. */
const TRDS_PHASE: Record<StudyPhase, string> = {
  FIH: '1', '1': '1', '1b': '1', '2': '2', '2b': '2', '3': '3', '3b': '3', '4': '4',
};

/** Only the structural designs that ARE a TRDS assignment category. Nothing else is mapped. */
const TRDS_ASSIGNMENT: Partial<Record<StructuralDesign, string>> = {
  single_arm: 'Single arm',
  parallel_group: 'Parallel',
  crossover: 'Crossover',
  factorial: 'Factorial',
};

const TRDS_MASKING: Record<BlindingLevel, string> = {
  open: 'None (open label)',
  single: 'Single blind',
  double: 'Double blind',
  triple: 'Triple blind',
};

const PURPOSE_GAP =
  'Purpose (treatment, prevention, diagnostic, …) is not recorded on the study design.';

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

function allocationPart(d: StudyDesign, p: Parts): void {
  if (d.framework?.structuralDesign === 'single_arm') {
    p.values.push('Allocation: N/A (single arm)');
    p.sources.push('StudyDesign.framework.structuralDesign');
    return;
  }
  const method = d.randomization?.allocationMethod;
  if (!method) {
    p.gaps.push('Allocation is not stated: the design records no randomization.');
    return;
  }
  p.values.push(method === 'none' ? 'Allocation: Non-randomized' : `Allocation: Randomized (${method})`);
  p.sources.push('StudyDesign.randomization.allocationMethod');
}

function maskingPart(d: StudyDesign, p: Parts): void {
  const level = d.randomization?.blinding;
  const label = level ? TRDS_MASKING[level] : undefined;
  if (!level || !label) {
    p.gaps.push('Masking is not stated: the design records no recognised blinding level.');
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
  const label = structural ? TRDS_ASSIGNMENT[structural] : undefined;
  if (label) {
    p.values.push(`Assignment: ${label}`);
    p.sources.push('StudyDesign.framework.structuralDesign');
    return;
  }
  p.gaps.push(
    structural
      ? `Assignment is not mapped: the structural design "${structural}" is not one of the TRDS assignment categories (single arm, parallel, crossover, factorial), and this projection does not choose one for it.`
      : 'Assignment is not stated: the design records no structural design.',
  );
}

function phasePart(d: StudyDesign, p: Parts): void {
  const mapped = d.phase ? TRDS_PHASE[d.phase] : undefined;
  if (!mapped) {
    p.gaps.push('Phase is not stated: the design records no recognised phase.');
    return;
  }
  p.values.push(mapped === d.phase ? `Phase: ${mapped}` : `Phase: ${mapped} (recorded as ${d.phase})`);
  p.sources.push('StudyDesign.phase');
}

function studyType(d: StudyDesign): Rendering {
  const p: Parts = { values: [], gaps: [], sources: [] };
  studyTypePart(d, p);
  allocationPart(d, p);
  maskingPart(d, p);
  assignmentPart(d, p);
  phasePart(d, p);
  p.gaps.push(PURPOSE_GAP);
  return fromParts(p.values, p.gaps, p.sources.join('; '), '');
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

// ─── Items 19–20: outcomes by endpoint role ──────────────────────────────────

type OutcomeRole = Extract<Endpoint['role'], 'primary' | 'key_secondary'>;

interface OutcomeLine {
  line: string;
  timed: boolean;
  measured: boolean;
}

/** Name, metric/method and timepoint — each only as the endpoint records it. */
function outcomeLine(d: StudyDesign, e: Endpoint): OutcomeLine {
  const timepoint = present(e.timepoint) ? e.timepoint : endpointTimeFrameFromSoa(d, e.name);
  const parts = [present(e.definition) ? `${e.name}: ${e.definition}` : e.name];
  if (present(e.measurementMethod)) parts.push(`method: ${e.measurementMethod}`);
  if (timepoint) parts.push(`timepoint: ${timepoint}`);
  return { line: parts.join('; '), timed: Boolean(timepoint), measured: present(e.definition) || present(e.measurementMethod) };
}

function noOutcomeGap(d: StudyDesign, role: OutcomeRole): string {
  const base = `No endpoint has role "${role}".`;
  if (role === 'primary') return base;
  const secondary = (d.endpoints ?? []).filter(e => e.role === 'secondary').length;
  return secondary
    ? `${base} ${secondary} endpoint(s) with role "secondary" are not promoted to key secondary outcomes.`
    : base;
}

function outcomes(d: StudyDesign, role: OutcomeRole): Rendering {
  const endpoints = (d.endpoints ?? []).filter(e => e.role === role);
  if (endpoints.length === 0) return missing(noOutcomeGap(d, role));
  const lines = endpoints.map(e => ({ name: e.name, ...outcomeLine(d, e) }));
  const gaps: string[] = [];
  const untimed = lines.filter(l => !l.timed).map(l => l.name);
  const unmeasured = lines.filter(l => !l.measured).map(l => l.name);
  if (untimed.length) gaps.push(`Timepoint is not recorded for: ${untimed.join(', ')}.`);
  if (unmeasured.length) gaps.push(`Metric or method of measurement is not recorded for: ${unmeasured.join(', ')}.`);
  const source = `StudyDesign.endpoints (role "${role}"); timepoint from the endpoint or its Schedule of Activities`;
  return fromParts(lines.map(l => l.line), gaps, source, '');
}

// ─── Assembly ────────────────────────────────────────────────────────────────

type Renderer = (d: StudyDesign) => Rendering;

/** The items a study design can contribute to. Every other item is registration-only. */
const DESIGN_RENDERERS: Readonly<Record<number, Renderer>> = {
  9: () => missing(PUBLIC_TITLE_GAP),
  10: scientificTitle,
  11: countries,
  12: condition,
  13: interventions,
  14: eligibility,
  15: studyType,
  17: sampleSize,
  19: d => outcomes(d, 'primary'),
  20: d => outcomes(d, 'key_secondary'),
};

/** The item numbers that are always missing with {@link NOT_CARRIED_BY_DESIGN}. */
export const WHO_TRDS_REGISTRATION_ONLY_ITEMS: readonly number[] = Object.freeze(
  WHO_TRDS_ITEMS.map(i => i.number).filter(n => !(n in DESIGN_RENDERERS)),
);

function renderItem(def: WhoTrdsItemDefinition, d: StudyDesign): WhoTrdsItem {
  const render = DESIGN_RENDERERS[def.number];
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
