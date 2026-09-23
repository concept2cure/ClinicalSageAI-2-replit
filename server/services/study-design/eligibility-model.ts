/**
 * Eligibility criteria as data — a structured layer over free-text criteria.
 *
 * WHAT THIS IS. `EligibilityCriterion` in `study-design-types.ts` is a string
 * plus a type. "HbA1c 7.0-10.5%" is a THRESHOLD ON A MEASUREMENT and the
 * platform cannot see that, so it cannot tell you two criteria contradict each
 * other, cannot fill a registry's structured eligibility module, and cannot tell
 * a site whether a candidate qualifies. This module turns the subset of criteria
 * that are written unambiguously into data, runs deterministic conflict checks
 * over that subset, and projects it to a registry-style block.
 *
 * WHAT THE PARSER ACCEPTS — exhaustively, and deliberately little:
 *
 *   1. `LABEL NUM (- | – | — | to) NUM UNIT`   e.g. "HbA1c 7.0-10.5%",
 *      "BMI 18.5 to 30 kg/m2", "Age 18-75 years". A written range is read as
 *      INCLUSIVE on both ends; that is the one reading convention this grammar
 *      assumes, and it is stated rather than hidden.
 *   2. `LABEL OP NUM UNIT` where OP is one of `<  <=  >  >=  =  ≤  ≥`
 *      e.g. "eGFR < 30 mL/min/1.73m2", "Platelet count ≥ 100 x10^9/L".
 *   3. `LABEL OP YYYY-MM-DD` — ISO-8601 only.
 *
 * A criterion whose concept label is exactly "age" and whose unit is an explicit
 * time unit becomes an `age` criterion; that is a literal reading of the word in
 * the text, not an inference about what the criterion means.
 *
 * WHAT IT REFUSES, AND WHY. Everything else becomes a `free_text` structure with
 * `unparsed: true` and a reason. A mis-parsed eligibility threshold is a
 * patient-safety defect, so the parser holds four lines absolutely:
 *
 *   - **No concept is guessed from wording.** The concept is the literal text
 *     before the comparator, matched against other criteria by exact
 *     case-folded equality and nothing else. "HbA1c" and "Hemoglobin A1c" are
 *     two concepts here. A coding is carried verbatim when the caller supplies
 *     one on `EligibilityCriterion.codes`, and is never invented — there is no
 *     term-to-code map in this repository and a wrong LOINC code is worse than
 *     none. Codings are also not used to merge or split concepts, because that
 *     would need a code-equivalence table this repository does not have.
 *   - **No unit is inferred.** "Age >= 18" is refused. A unit must be written,
 *     must be a single token, and must be the last thing in the criterion.
 *   - **No value is converted between units.** mg/dL is never rescaled to
 *     mmol/L. Two criteria on one concept in different units are reported NOT
 *     COMPARABLE (ELIG-005) and are excluded from every other check.
 *   - **No word comparator is read as an operator.** "at least 18 years" is
 *     refused; only the symbols above are operators.
 *
 * MEASURED COVERAGE. On the sixteen-criterion type-2 diabetes set in
 * `__tests__/eligibility-model.test.ts` — written the way such protocols write
 * them — the parser structures **8 of 16 (50%)**. That number is asserted as an
 * exact figure in the tests so it cannot drift upward unnoticed, and the grammar
 * is deliberately not widened to raise it.
 *
 * HONESTY OF THE ASSESSMENT. A check that could not run returns `not-assessed`,
 * never `met`. The result carries `counts.structured`, `counts.unstructured` and
 * `counts.checked`, and `verdict` can only be `clean` when nothing was left
 * unstructured — an 80%-unparsed set reporting "no conflicts found" is a lie.
 *
 * Pure and total: no I/O, no database, no clock, no randomness, no throw.
 *
 * @module server/services/study-design/eligibility-model
 */

import type { EligibilityCriterion } from './study-design-types';

export const ELIGIBILITY_BASIS =
  'ICH M11 §5 Trial Population — eligibility criteria read as structured constraints';
const CTGOV_BASIS = 'ClinicalTrials.gov PRS eligibility module (FDAAA 801)';

// ─── Structured criterion model ──────────────────────────────────────────────

export type ComparatorOp = '<' | '<=' | '>' | '>=' | '=';

/** A coding exactly as the caller supplied it on `EligibilityCriterion.codes`. Never derived from the text. */
export interface ConceptCoding { system: string; code: string; label?: string }

/**
 * The concept a criterion constrains: the literal text before the comparator.
 * `key` — case-folded, whitespace-collapsed — is the ONLY concept-matching key.
 * `codings` is carried verbatim when supplied and is never used to merge or
 * split concepts: that would need a code-equivalence table this repo lacks.
 */
export interface ConceptRef { label: string; key: string; codings?: ConceptCoding[] }

export interface NumericBound { op: ComparatorOp; value: number }
/** `date` is an ISO-8601 date, verbatim. */
export interface DateBound { op: ComparatorOp; date: string }

/** A numeric threshold or range. `unit` is verbatim: never inferred, normalised or converted. */
export interface StructuredThreshold { kind: 'threshold'; concept: ConceptRef; unit: string; bounds: NumericBound[] }

/** A threshold whose concept is literally "age" and whose unit is a written time unit. */
export interface StructuredAge { kind: 'age'; concept: ConceptRef; unit: string; bounds: NumericBound[] }

export interface StructuredDate { kind: 'date'; concept: ConceptRef; bounds: DateBound[] }

/**
 * A yes/no condition. Constructible by a caller that already holds the fact in
 * structured form; **the parser never produces one**, because deciding that
 * "Pregnancy or breastfeeding" is a boolean on a concept is exactly the guess
 * from wording this module refuses.
 */
export interface StructuredBoolean { kind: 'boolean'; concept: ConceptRef; expected: boolean }

/** An enumerated set. Constructible by a caller; the parser never produces one, for the same reason. */
export interface StructuredEnum { kind: 'enum'; concept: ConceptRef; values: string[] }

export type EligibilityUnparsedReason =
  | 'empty-text' | 'no-comparator-or-range' | 'word-comparator-not-accepted' | 'no-unit-written'
  | 'unit-not-recognised-as-a-unit-token' | 'trailing-text-after-unit' | 'value-not-numeric'
  | 'concept-label-absent' | 'concept-label-too-long' | 'concept-label-ends-in-a-connective'
  | 'ambiguous-date-format' | 'invalid-date';

/** The fallback. Everything the grammar does not accept unambiguously lands here, with a reason. */
export interface StructuredFreeText { kind: 'free_text'; unparsed: true; reason: EligibilityUnparsedReason }

export type EligibilityStructure =
  StructuredThreshold | StructuredAge | StructuredDate | StructuredBoolean | StructuredEnum | StructuredFreeText;

/** `index` is the position in the input array; findings cite it. `text` is verbatim. */
export interface StructuredEligibilityCriterion {
  index: number; type: 'inclusion' | 'exclusion'; text: string; structure: EligibilityStructure;
}

// ─── Findings (the shape protocol-rule-pack.ts uses) ─────────────────────────

export type EligibilityFindingStatus = 'met' | 'unmet' | 'attention' | 'not-assessed';
export type EligibilityFindingSeverity = 'critical' | 'warning' | 'info';

/** `criterionIndexes` names the criteria the finding concerns; empty when not-assessed. */
export interface EligibilityFinding {
  id: string; standard: string; clause: string; title: string;
  status: EligibilityFindingStatus; severity: EligibilityFindingSeverity;
  message: string; remediation: string; criterionIndexes: number[];
}

/** `checked` is the criteria actually subject to the conflict checks. It never includes free text. */
export interface EligibilityCounts {
  total: number; inclusion: number; exclusion: number;
  structured: number; unstructured: number; checked: number;
}

export type EligibilityVerdict = 'nothing-to-assess' | 'insufficiently-structured' | 'issues-found' | 'clean';

/** `coverage` is structured / total, or null when there is nothing to divide. */
export interface EligibilityAssessment {
  criteria: StructuredEligibilityCriterion[]; counts: EligibilityCounts; coverage: number | null;
  findings: EligibilityFinding[]; verdict: EligibilityVerdict; basis: string;
}

// ─── Grammar tables ──────────────────────────────────────────────────────────

const OPERATOR_RE = /(<=|>=|[<>=≤≥])/;
const SPLIT_RE = /^([\s\S]*?)(<=|>=|[<>=≤≥])([\s\S]*)$/;
const RANGE_RE = /^([\s\S]*?)\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(\S*)$/;
const NUMBER_HEAD_RE = /^([+-]?\d+(?:\.\d+)?)([\s\S]*)$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_SHAPED_RE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;
const UNIT_RE = /^[A-Za-z%µμ][A-Za-z0-9%^/.·µμ²³()-]*$/;

/** Word comparators. Used ONLY to label a refusal; never to accept anything. */
const WORD_COMPARATORS = [
  'at least', 'at most', 'no more than', 'no less than', 'not more than', 'greater than',
  'less than', 'more than', 'fewer than', 'up to', 'between', 'exceeding', 'minimum of', 'maximum of',
];

/** A label ending in one of these is prose with a number after it, not a concept. */
const CONNECTIVES = new Set([
  'for', 'within', 'of', 'in', 'on', 'at', 'to', 'prior', 'after', 'since', 'over',
  'during', 'with', 'by', 'than', 'and', 'or', 'from', 'before', 'per',
]);

const TIME_UNITS = new Set(['year', 'years', 'yr', 'yrs', 'month', 'months', 'mo', 'week', 'weeks', 'wk', 'day', 'days']);

/** Longest concept label the parser will accept, in words. Beyond this the text is prose. */
const MAX_LABEL_WORDS = 6;

// ─── Parser ──────────────────────────────────────────────────────────────────

function refuse(reason: EligibilityUnparsedReason): StructuredFreeText {
  return { kind: 'free_text', unparsed: true, reason };
}

function normaliseOp(raw: string): ComparatorOp {
  if (raw === '≤') return '<=';
  if (raw === '≥') return '>=';
  return raw as ComparatorOp;
}

function conceptOf(label: string, codes?: EligibilityCriterion['codes']): ConceptRef {
  const codings = (codes ?? []).map((c) => ({ system: c.system, code: c.code, ...(c.label === undefined ? {} : { label: c.label }) }));
  const base = { label, key: label.toLowerCase() };
  return codings.length ? { ...base, codings } : base;
}

/** Rejects a label that is prose rather than a concept. Returns a reason or null. */
function labelProblem(label: string): EligibilityUnparsedReason | null {
  if (label.length === 0) return 'concept-label-absent';
  const words = label.split(' ');
  if (words.length > MAX_LABEL_WORDS) return 'concept-label-too-long';
  if (CONNECTIVES.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) return 'concept-label-ends-in-a-connective';
  return null;
}

/** The unit token, or the reason the tail is not one. Never invents a unit. */
function unitOf(tail: string): { unit: string } | { reason: EligibilityUnparsedReason } {
  const t = tail.trim();
  if (t.length === 0) return { reason: 'no-unit-written' };
  if (t.includes(' ')) return { reason: 'trailing-text-after-unit' };
  if (!UNIT_RE.test(t)) return { reason: 'unit-not-recognised-as-a-unit-token' };
  return { unit: t };
}

/** An `age` criterion is one whose concept is literally "age" and whose unit is a written time unit. */
function numericStructure(label: string, unit: string, bounds: NumericBound[], codes?: EligibilityCriterion['codes']): StructuredThreshold | StructuredAge {
  const concept = conceptOf(label, codes);
  const kind = concept.key === 'age' && TIME_UNITS.has(unit.toLowerCase()) ? 'age' : 'threshold';
  return { kind, concept, unit, bounds } as StructuredThreshold | StructuredAge;
}

function dateStructure(label: string, op: ComparatorOp, rest: string, codes?: EligibilityCriterion['codes']): EligibilityStructure {
  if (!ISO_DATE_RE.test(rest)) return refuse('ambiguous-date-format');
  if (isoDayOrdinal(rest) === null) return refuse('invalid-date');
  return { kind: 'date', concept: conceptOf(label, codes), bounds: [{ op, date: rest }] };
}

/** Shape 2 and shape 3: `LABEL OP NUM UNIT` and `LABEL OP YYYY-MM-DD`. */
function parseComparison(text: string, codes?: EligibilityCriterion['codes']): EligibilityStructure {
  const m = SPLIT_RE.exec(text);
  if (!m) return refuse('no-comparator-or-range');
  const label = m[1].trim();
  const problem = labelProblem(label);
  if (problem) return refuse(problem);
  const op = normaliseOp(m[2]);
  const rest = m[3].trim();
  if (DATE_SHAPED_RE.test(rest)) return dateStructure(label, op, rest, codes);
  const n = NUMBER_HEAD_RE.exec(rest);
  if (!n) return refuse('value-not-numeric');
  const u = unitOf(n[2]);
  if ('reason' in u) return refuse(u.reason);
  return numericStructure(label, u.unit, [{ op, value: Number(n[1]) }], codes);
}

/** Shape 1: `LABEL NUM (- | – | — | to) NUM UNIT`, read as inclusive on both ends. */
function parseRange(text: string, codes?: EligibilityCriterion['codes']): EligibilityStructure {
  const m = RANGE_RE.exec(text);
  if (!m) return refuse(wordComparatorPresent(text) ? 'word-comparator-not-accepted' : 'no-comparator-or-range');
  const label = m[1].trim();
  const problem = labelProblem(label);
  if (problem) return refuse(problem);
  const u = unitOf(m[4]);
  if ('reason' in u) return refuse(u.reason);
  return numericStructure(label, u.unit, [{ op: '>=', value: Number(m[2]) }, { op: '<=', value: Number(m[3]) }], codes);
}

function wordComparatorPresent(text: string): boolean {
  const lower = text.toLowerCase();
  return WORD_COMPARATORS.some((w) => lower.includes(w));
}

/** Parse one criterion. Total: never throws, always returns a structure. */
export function parseEligibilityCriterion(criterion: EligibilityCriterion, index: number): StructuredEligibilityCriterion {
  const text = criterion.text ?? '';
  const normalised = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '').trim();
  let structure: EligibilityStructure;
  if (normalised.length === 0) structure = refuse('empty-text');
  else if (OPERATOR_RE.test(normalised)) structure = parseComparison(normalised, criterion.codes);
  else structure = parseRange(normalised, criterion.codes);
  return { index, type: criterion.type, text, structure };
}

export function structureEligibility(criteria: EligibilityCriterion[]): StructuredEligibilityCriterion[] {
  return criteria.map((c, i) => parseEligibilityCriterion(c, i));
}

// ─── Interval algebra ────────────────────────────────────────────────────────

interface Interval { lo: number; loInc: boolean; hi: number; hiInc: boolean }

/** Days from 1970-01-01, or null when the date is not a real calendar date. Pure: no clock is read. */
function isoDayOrdinal(iso: string): number | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 86400000;
}

function applyBound(iv: Interval, b: NumericBound): void {
  if (b.op === '>=' || b.op === '>') {
    if (b.value > iv.lo || (b.value === iv.lo && b.op === '>')) { iv.lo = b.value; iv.loInc = b.op === '>='; }
  } else if (b.op === '<=' || b.op === '<') {
    if (b.value < iv.hi || (b.value === iv.hi && b.op === '<')) { iv.hi = b.value; iv.hiInc = b.op === '<='; }
  } else {
    iv.lo = b.value; iv.loInc = true; iv.hi = b.value; iv.hiInc = true;
  }
}

function intervalOf(bounds: NumericBound[]): Interval {
  const iv: Interval = { lo: -Infinity, loInc: false, hi: Infinity, hiInc: false };
  for (const b of bounds) applyBound(iv, b);
  return iv;
}

function isEmpty(iv: Interval): boolean {
  return iv.lo > iv.hi || (iv.lo === iv.hi && !(iv.loInc && iv.hiInc));
}

function intersect(a: Interval, b: Interval): Interval {
  const iv: Interval = { lo: a.lo, loInc: a.loInc, hi: a.hi, hiInc: a.hiInc };
  applyBound(iv, { op: b.loInc ? '>=' : '>', value: b.lo });
  applyBound(iv, { op: b.hiInc ? '<=' : '<', value: b.hi });
  return iv;
}

/** True when every point of `inner` is a point of `outer`. */
function contains(outer: Interval, inner: Interval): boolean {
  const loOk = outer.lo < inner.lo || (outer.lo === inner.lo && (outer.loInc || !inner.loInc));
  const hiOk = outer.hi > inner.hi || (outer.hi === inner.hi && (outer.hiInc || !inner.hiInc));
  return loOk && hiOk;
}

// ─── Comparable view over the structured set ─────────────────────────────────

/** `ranged` is true when both a lower and an upper bound were written. */
interface Comparable {
  index: number; type: 'inclusion' | 'exclusion'; label: string; key: string;
  unit: string; bounds: NumericBound[]; interval: Interval; ranged: boolean;
}

const DATE_UNIT = 'ISO-8601 date';

function comparableBounds(s: EligibilityStructure): { unit: string; bounds: NumericBound[] } | null {
  if (s.kind === 'threshold' || s.kind === 'age') return { unit: s.unit, bounds: s.bounds };
  if (s.kind !== 'date') return null;
  const bounds: NumericBound[] = [];
  for (const b of s.bounds) {
    const ord = isoDayOrdinal(b.date);
    if (ord === null) return null;
    bounds.push({ op: b.op, value: ord });
  }
  return { unit: DATE_UNIT, bounds };
}

function comparablesOf(rows: StructuredEligibilityCriterion[]): Comparable[] {
  const out: Comparable[] = [];
  for (const r of rows) {
    const cb = comparableBounds(r.structure);
    if (!cb) continue;
    const { label, key } = (r.structure as StructuredThreshold).concept;
    const interval = intervalOf(cb.bounds);
    const ranged = interval.lo > -Infinity && interval.hi < Infinity;
    out.push({ index: r.index, type: r.type, label, key, unit: cb.unit, bounds: cb.bounds, interval, ranged });
  }
  return out;
}

/** Buckets keyed `conceptKey\u0000unit`. Concept identity is exact key equality and nothing else. */
function groupByConceptAndUnit(list: Comparable[]): Map<string, Comparable[]> {
  return bucketBy(list, (c) => `${c.key}\u0000${c.unit}`);
}

function bucketBy(list: Comparable[], keyOf: (c: Comparable) => string): Map<string, Comparable[]> {
  const m = new Map<string, Comparable[]>();
  for (const c of list) {
    const bucket = m.get(keyOf(c));
    if (bucket) bucket.push(c);
    else m.set(keyOf(c), [c]);
  }
  return m;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

interface CheckSpec { clause: string; title: string; severity: EligibilityFindingSeverity; remediation: string }

const M11_POP = 'ICH M11 §5 — trial population';
const M11_INC = 'ICH M11 §5.2 — inclusion criteria';

const SPECS: Record<string, CheckSpec> = {
  'ELIG-001': { clause: 'ICH M11 §5.2 / §5.3 — inclusion and exclusion criteria', title: 'No inclusion/exclusion pair is mutually unsatisfiable', severity: 'critical', remediation: 'Narrow the exclusion, or widen the inclusion range, so a participant can satisfy both.' },
  'ELIG-002': { clause: 'ICH M11 §5.3 — exclusion criteria', title: 'No exclusion criterion is dead', severity: 'warning', remediation: 'Remove the exclusion, or correct its bound, so it changes who may enrol.' },
  'ELIG-003': { clause: M11_INC, title: 'No inclusion criterion states an empty range', severity: 'critical', remediation: 'Correct the range so the lower bound is below the upper bound.' },
  'ELIG-004': { clause: M11_INC, title: 'One concept is not constrained twice with incompatible bounds', severity: 'critical', remediation: 'Merge the two criteria into one range, or correct the bound that contradicts the other.' },
  'ELIG-005': { clause: M11_POP, title: 'Criteria on one concept are expressed in one unit', severity: 'warning', remediation: 'Restate both criteria in the same unit. This engine will not convert between units, so the pair stays unchecked until it is.' },
  'ELIG-006': { clause: M11_POP, title: 'Every criterion could be read as a structured constraint', severity: 'info', remediation: 'Restate the listed criteria as a labelled measurement with a symbolic comparator and a written unit, or record them as coded data, if they are to be checked.' },
};

function makeFinding(id: string, status: EligibilityFindingStatus, message: string, criterionIndexes: number[]): EligibilityFinding {
  const spec = SPECS[id];
  return {
    id, standard: ELIGIBILITY_BASIS, clause: spec.clause, title: spec.title, status,
    severity: status === 'not-assessed' ? 'info' : spec.severity,
    message, remediation: spec.remediation, criterionIndexes,
  };
}

const NOT_ASSESSED = (id: string, why: string): EligibilityFinding => makeFinding(id, 'not-assessed', why, []);

function describeCriterion(c: Comparable): string {
  return `[${c.index}] ${c.label} ${c.bounds.map((b) => `${b.op} ${b.value}`).join(' and ')} ${c.unit}`;
}

interface PairScan { unsat: string[]; dead: string[]; unsatIdx: number[]; deadIdx: number[]; pairs: number }

function scanInclusionExclusion(groups: Map<string, Comparable[]>): PairScan {
  const s: PairScan = { unsat: [], dead: [], unsatIdx: [], deadIdx: [], pairs: 0 };
  for (const bucket of groups.values()) {
    const incs = bucket.filter((c) => c.type === 'inclusion');
    const excs = bucket.filter((c) => c.type === 'exclusion');
    for (const i of incs) {
      for (const e of excs) {
        s.pairs += 1;
        if (contains(e.interval, i.interval)) {
          s.unsat.push(`${describeCriterion(i)} vs ${describeCriterion(e)}`);
          s.unsatIdx.push(i.index, e.index);
        } else if (isEmpty(intersect(e.interval, i.interval))) {
          s.dead.push(`${describeCriterion(e)} against ${describeCriterion(i)}`);
          s.deadIdx.push(i.index, e.index);
        }
      }
    }
  }
  return s;
}

/** ELIG-001 and ELIG-002 — inclusion vs exclusion on one concept in one unit. */
function checkInclusionExclusion(groups: Map<string, Comparable[]>): EligibilityFinding[] {
  const s = scanInclusionExclusion(groups);
  if (s.pairs === 0) {
    const why = 'No concept carries both an inclusion and an exclusion criterion in a comparable unit, so this could not be checked.';
    return [NOT_ASSESSED('ELIG-001', why), NOT_ASSESSED('ELIG-002', why)];
  }
  return [
    s.unsat.length
      ? makeFinding('ELIG-001', 'unmet', `An exclusion criterion covers the whole inclusion range, so no participant can satisfy both: ${s.unsat.join('; ')}.`, s.unsatIdx)
      : makeFinding('ELIG-001', 'met', `${s.pairs} inclusion/exclusion pair(s) on a shared concept were checked; none is mutually unsatisfiable.`, []),
    s.dead.length
      ? makeFinding('ELIG-002', 'unmet', `An exclusion criterion excludes nobody the inclusion criteria admit: ${s.dead.join('; ')}.`, s.deadIdx)
      : makeFinding('ELIG-002', 'met', `${s.pairs} inclusion/exclusion pair(s) on a shared concept were checked; each can change who enrols.`, []),
  ];
}

/** ELIG-003 — an inclusion range whose lower bound is above its upper bound. */
function checkEmptyRanges(list: Comparable[]): EligibilityFinding {
  const ranged = list.filter((c) => c.type === 'inclusion' && c.ranged);
  if (ranged.length === 0) return NOT_ASSESSED('ELIG-003', 'No inclusion criterion states both a lower and an upper bound, so this could not be checked.');
  const bad = ranged.filter((c) => isEmpty(c.interval));
  if (bad.length === 0) return makeFinding('ELIG-003', 'met', `${ranged.length} bounded inclusion range(s) were checked; each admits at least one value.`, []);
  return makeFinding('ELIG-003', 'unmet', `An inclusion range is empty — its lower bound is above its upper bound: ${bad.map(describeCriterion).join('; ')}.`, bad.map((c) => c.index));
}

/** ELIG-004 — one concept constrained twice by inclusions with no common value. */
function checkRepeatedConcepts(groups: Map<string, Comparable[]>): EligibilityFinding {
  let pairs = 0;
  const bad: string[] = [];
  const idx: number[] = [];
  for (const bucket of groups.values()) {
    const incs = bucket.filter((c) => c.type === 'inclusion');
    for (let a = 0; a < incs.length; a += 1) {
      for (let b = a + 1; b < incs.length; b += 1) {
        pairs += 1;
        if (!isEmpty(intersect(incs[a].interval, incs[b].interval))) continue;
        bad.push(`${describeCriterion(incs[a])} vs ${describeCriterion(incs[b])}`);
        idx.push(incs[a].index, incs[b].index);
      }
    }
  }
  if (pairs === 0) return NOT_ASSESSED('ELIG-004', 'No concept is constrained by two inclusion criteria in a comparable unit, so this could not be checked.');
  if (bad.length === 0) return makeFinding('ELIG-004', 'met', `${pairs} repeated-concept inclusion pair(s) were checked; each pair has a common satisfying value.`, []);
  return makeFinding('ELIG-004', 'unmet', `One concept is constrained twice with bounds no value satisfies: ${bad.join('; ')}.`, idx);
}

/** ELIG-005 — one concept expressed in two units. Reported NOT COMPARABLE, never converted. */
function checkUnitMismatch(list: Comparable[]): EligibilityFinding {
  const repeated = [...bucketBy(list, (c) => c.key).values()].filter((b) => b.length > 1);
  if (repeated.length === 0) return NOT_ASSESSED('ELIG-005', 'No concept carries more than one structured criterion, so this could not be checked.');
  const clashes = repeated.filter((b) => new Set(b.map((c) => c.unit)).size > 1);
  if (clashes.length === 0) return makeFinding('ELIG-005', 'met', `${repeated.length} concept(s) carry more than one criterion; each uses a single unit.`, []);
  const detail = clashes.map((b) => `${b[0].label} (${[...new Set(b.map((c) => c.unit))].join(' vs ')})`).join('; ');
  return makeFinding('ELIG-005', 'attention', `One concept is constrained in two different units, so the criteria are not comparable and were excluded from every conflict check: ${detail}. No value was converted.`, clashes.flatMap((b) => b.map((c) => c.index)));
}

/** ELIG-006 — how much of the set could be structured at all, so a caller knows what was checked. */
function checkCoverage(rows: StructuredEligibilityCriterion[], counts: EligibilityCounts): EligibilityFinding {
  if (counts.total === 0) return NOT_ASSESSED('ELIG-006', 'The design records no eligibility criteria, so there is nothing to structure.');
  if (counts.unstructured === 0) return makeFinding('ELIG-006', 'met', `All ${counts.total} criteria were read as structured constraints.`, []);
  const unparsed = rows.filter((r) => r.structure.kind === 'free_text');
  const detail = unparsed.map((r) => `[${r.index}] ${(r.structure as StructuredFreeText).reason}`).join(', ');
  return makeFinding('ELIG-006', 'attention', `Structured ${counts.structured} of ${counts.total} criteria; ${counts.unstructured} could not be structured and were NOT checked by ELIG-001..ELIG-005. Unstructured: ${detail}.`, unparsed.map((r) => r.index));
}

// ─── Assessment ──────────────────────────────────────────────────────────────

function countsOf(rows: StructuredEligibilityCriterion[], checked: number): EligibilityCounts {
  const structured = rows.filter((r) => r.structure.kind !== 'free_text').length;
  return {
    total: rows.length,
    inclusion: rows.filter((r) => r.type === 'inclusion').length,
    exclusion: rows.filter((r) => r.type === 'exclusion').length,
    structured, unstructured: rows.length - structured, checked,
  };
}

function verdictOf(counts: EligibilityCounts, findings: EligibilityFinding[]): EligibilityVerdict {
  if (counts.total === 0) return 'nothing-to-assess';
  const conflicts = findings.filter((f) => f.id !== 'ELIG-006');
  if (conflicts.some((f) => f.status === 'unmet' || f.status === 'attention')) return 'issues-found';
  if (counts.unstructured > 0) return 'insufficiently-structured';
  return 'clean';
}

/**
 * Structure the criteria, run every check over the structured subset, and report
 * how much of the set that subset was. A check that could not run is
 * `not-assessed`, never `met`; the verdict reaches `clean` only when nothing was
 * left unstructured, so a mostly-unparsed set can never read as conflict-free.
 */
export function assessEligibility(criteria: EligibilityCriterion[]): EligibilityAssessment {
  const rows = structureEligibility(criteria);
  const comparables = comparablesOf(rows);
  const mismatch = checkUnitMismatch(comparables);
  const mismatchedKeys = new Set(
    mismatch.status === 'attention'
      ? comparables.filter((c) => mismatch.criterionIndexes.includes(c.index)).map((c) => c.key)
      : [],
  );
  const checkable = comparables.filter((c) => !mismatchedKeys.has(c.key));
  const groups = groupByConceptAndUnit(checkable);
  const counts = countsOf(rows, comparables.length);
  const findings: EligibilityFinding[] = [
    ...checkInclusionExclusion(groups),
    checkEmptyRanges(checkable),
    checkRepeatedConcepts(groups),
    mismatch,
    checkCoverage(rows, counts),
  ];
  return {
    criteria: rows, counts, coverage: counts.total === 0 ? null : counts.structured / counts.total,
    findings, verdict: verdictOf(counts, findings), basis: ELIGIBILITY_BASIS,
  };
}

// ─── Registry projection ─────────────────────────────────────────────────────

/** `inclusive` is false when the criterion used a strict comparator. Nothing is rounded. */
export interface RegistryAgeLimit { value: number; unit: string; inclusive: boolean }

export interface RegistryAbsentField { field: string; reason: string }

export interface RegistryEligibilityRow { type: 'inclusion' | 'exclusion'; text: string; structure: EligibilityStructure }

/** `absent` names every field this projection did not emit, and why. Never a default value. */
export interface RegistryEligibilityBlock {
  minimumAge: RegistryAgeLimit | null; maximumAge: RegistryAgeLimit | null;
  sex: 'all' | 'female' | 'male' | null; healthyVolunteers: boolean | null;
  criteria: RegistryEligibilityRow[]; absent: RegistryAbsentField[]; basis: string;
}

/** Facts no criterion text carries. Supplied by the caller, or reported absent. */
export interface EligibilityRecordedFacts { sex?: 'all' | 'female' | 'male' | null; healthyVolunteers?: boolean | null }

interface AgeLimits { minimum: RegistryAgeLimit | null; maximum: RegistryAgeLimit | null; mixedUnits: boolean }

function ageLimitsOf(rows: StructuredEligibilityCriterion[]): AgeLimits {
  const ages = rows.filter((r) => r.type === 'inclusion' && r.structure.kind === 'age').map((r) => r.structure as StructuredAge);
  if (ages.length === 0) return { minimum: null, maximum: null, mixedUnits: false };
  if (new Set(ages.map((a) => a.unit.toLowerCase())).size > 1) return { minimum: null, maximum: null, mixedUnits: true };
  const unit = ages[0].unit;
  let minimum: RegistryAgeLimit | null = null;
  let maximum: RegistryAgeLimit | null = null;
  for (const b of ages.flatMap((a) => a.bounds)) {
    if ((b.op === '>=' || b.op === '>') && (minimum === null || b.value > minimum.value)) minimum = { value: b.value, unit, inclusive: b.op === '>=' };
    if ((b.op === '<=' || b.op === '<') && (maximum === null || b.value < maximum.value)) maximum = { value: b.value, unit, inclusive: b.op === '<=' };
  }
  return { minimum, maximum, mixedUnits: false };
}

function ageAbsenceReason(rows: StructuredEligibilityCriterion[], limits: AgeLimits, bound: 'lower' | 'upper'): string {
  if (limits.mixedUnits) return 'Age criteria are written in more than one time unit; this engine does not convert between units.';
  if (rows.some((r) => r.type === 'exclusion' && r.structure.kind === 'age')) {
    return `No inclusion criterion states an ${bound} age bound. An exclusion criterion constrains age, and is deliberately not folded into the registry age limits.`;
  }
  return `No inclusion criterion states an ${bound} age bound in a written time unit.`;
}

function absentFields(rows: StructuredEligibilityCriterion[], limits: AgeLimits, sex: unknown, hv: unknown): RegistryAbsentField[] {
  const absent: RegistryAbsentField[] = [];
  if (limits.minimum === null) absent.push({ field: 'Minimum age', reason: ageAbsenceReason(rows, limits, 'lower') });
  if (limits.maximum === null) absent.push({ field: 'Maximum age', reason: ageAbsenceReason(rows, limits, 'upper') });
  if (sex === null) absent.push({ field: 'Sex', reason: 'Eligibility sex is not carried by the criterion text and was not recorded by the caller.' });
  if (hv === null) absent.push({ field: 'Accepts healthy volunteers', reason: 'Healthy-volunteer eligibility is not carried by the criterion text and was not recorded by the caller.' });
  if (rows.length === 0) absent.push({ field: 'Eligibility criteria', reason: 'The design records no eligibility criteria.' });
  return absent;
}

/**
 * Project the criteria to a registry-style structured eligibility block. A field
 * no criterion records is ABSENT and named in `absent` — never defaulted. In
 * particular nothing emits a minimum age because most trials use one, and
 * `healthyVolunteers` stays null until a caller records it.
 */
export function projectRegistryEligibility(criteria: EligibilityCriterion[], recorded?: EligibilityRecordedFacts): RegistryEligibilityBlock {
  const rows = structureEligibility(criteria);
  const limits = ageLimitsOf(rows);
  const sex = recorded?.sex ?? null;
  const healthyVolunteers = recorded?.healthyVolunteers ?? null;
  return {
    minimumAge: limits.minimum, maximumAge: limits.maximum, sex, healthyVolunteers,
    criteria: rows.map((r) => ({ type: r.type, text: r.text, structure: r.structure })),
    absent: absentFields(rows, limits, sex, healthyVolunteers),
    basis: CTGOV_BASIS,
  };
}
