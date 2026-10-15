/**
 * The consistency check's verdicts, from the deterministic reconciliation
 * engine instead of a model.
 *
 * runConsistencyCheck asked a model to label each claim/source pair `match` or
 * `conflict` and persisted its JSON as findings (CLAUDE.md Rule 2: a verdict
 * comes from an engine; the model narrates). This compares the labelled
 * figures reconcileDossierNumbers extracts — enrolled N, sample size, sites,
 * events, alpha, power, hazard ratio, primary p-value — between the claim and
 * each source.
 *
 * A verdict needs one value on each side, read as written:
 * - a text that states a figure more than once (two p-values, PFS and OS
 *   hazard ratios, events and deaths) gets no verdict for it;
 * - "p<0.001" is a bound: a stated value at or above it is a conflict, one
 *   below it is consistent but not a match;
 * - values are compared at the coarser precision of the two (0.71 ≡ 0.712);
 * - alphas differing by exactly two may differ only by sidedness: no verdict;
 * - "randomized 120 patients to drug …" is one arm, not the total: no verdict.
 * Every figure of the claim that got no verdict for a source is returned in
 * `notCompared` with why. Nothing here is a finding of consistency.
 *
 * @module server/services/truth-engine/figure-consistency
 */

import { reconcileDossierNumbers, type ExtractedFact } from '../ana/dossierReconciliation';

export interface FigureFinding {
  leftRef: string;
  rightRef: string;
  status: 'match' | 'conflict';
  label: string;
  detail: string;
}

export interface FigureNotCompared {
  rightRef: string;
  label: string;
  reason: string;
}

export interface FigureComparison {
  findings: FigureFinding[];
  /** Each figure of the claim that got no verdict against a source, and why. */
  notCompared: FigureNotCompared[];
}

interface Reading {
  value: number;
  /** Stated as an upper bound ("p<0.001"). */
  bound: boolean;
}

const P_VALUE_AT = /p\s*(?:-?\s*value)?\s*([=<])\s*(0?\.\d{1,5})/gi;
const ARM_LEVEL = /(?:patients|subjects|participants)\s+(?:to|in|per)\b/i;

function readingOf(fact: ExtractedFact): Reading {
  if (fact.label !== 'primary_p_value') return { value: fact.value, bound: false };
  for (const m of fact.snippet.matchAll(P_VALUE_AT)) {
    if (Number(m[2]) === fact.value) return { value: fact.value, bound: m[1] === '<' };
  }
  return { value: fact.value, bound: false };
}

function distinct(readings: Reading[]): Reading[] {
  const seen = new Map<string, Reading>();
  for (const r of readings) seen.set(`${r.bound ? '<' : '='}${r.value}`, r);
  return [...seen.values()];
}

function decimals(n: number): number {
  return (String(n).split('.')[1] ?? '').length;
}

function show(r: Reading): string {
  return `${r.bound ? '<' : ''}${r.value}`;
}

/** match | conflict, or why there is no verdict. */
function verdict(label: string, l: Reading, r: Reading): 'match' | 'conflict' | { reason: string } {
  if (l.bound && r.bound) return { reason: 'both texts state only a bound' };
  if (l.bound || r.bound) {
    const [bound, exact] = l.bound ? [l, r] : [r, l];
    return exact.value >= bound.value
      ? 'conflict'
      : { reason: 'consistent with the stated bound, which is not an equality' };
  }
  if (label === 'alpha' && l.value !== r.value && Math.max(l.value, r.value) === 2 * Math.min(l.value, r.value)) {
    return { reason: 'the two alphas may differ only by one- versus two-sided testing' };
  }
  const dp = Math.min(decimals(l.value), decimals(r.value));
  const round = (n: number) => Math.round(n * 10 ** dp) / 10 ** dp;
  return round(l.value) === round(r.value) ? 'match' : 'conflict';
}

/** The one reading a side states for a label, or why there is none to compare. */
function sideReading(facts: ExtractedFact[]): Reading | { reason: string } {
  if (facts.some((f) => f.label === 'enrolled_n' && ARM_LEVEL.test(f.snippet))) {
    return { reason: 'an arm-level count, not the total' };
  }
  const readings = distinct(facts.map(readingOf));
  return readings.length === 1 ? readings[0] : { reason: 'a text states more than one value for it' };
}

export function compareLabelledFigures(
  left: { ref: string; text: string },
  right: ReadonlyArray<{ ref: string; text: string }>,
): FigureComparison {
  const findings: FigureFinding[] = [];
  const notCompared: FigureNotCompared[] = [];

  for (const source of right) {
    const { facts } = reconcileDossierNumbers([
      { id: 'left', title: left.ref, text: left.text },
      { id: 'right', title: source.ref, text: source.text },
    ]);
    const claimLabels = [...new Set(facts.filter((f) => f.docId === 'left').map((f) => f.label))].sort();
    for (const label of claimLabels) {
      const sourceFacts = facts.filter((f) => f.docId === 'right' && f.label === label);
      if (sourceFacts.length === 0) {
        notCompared.push({ rightRef: source.ref, label, reason: 'not stated in the source' });
        continue;
      }
      const l = sideReading(facts.filter((f) => f.docId === 'left' && f.label === label));
      const r = sideReading(sourceFacts);
      if ('reason' in l || 'reason' in r) {
        notCompared.push({ rightRef: source.ref, label, reason: ('reason' in l ? l : (r as { reason: string })).reason });
        continue;
      }
      const v = verdict(label, l, r);
      if (typeof v !== 'string') {
        notCompared.push({ rightRef: source.ref, label, reason: v.reason });
        continue;
      }
      findings.push({
        leftRef: left.ref,
        rightRef: source.ref,
        status: v,
        label,
        detail: `${label}: ${left.ref} gives ${show(l)}; ${source.ref} gives ${show(r)}.`,
      });
    }
  }
  return { findings, notCompared };
}
