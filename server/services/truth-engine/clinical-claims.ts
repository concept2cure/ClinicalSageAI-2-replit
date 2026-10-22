/**
 * The clinical figure claims engine (design: D2 launch catalog, 2026-10-05).
 *
 * A figure in a clinical document — a randomized N, an adverse-event incidence,
 * a hazard ratio, a p-value — becomes a *claim* only when a canonical form
 * named what it is AND every slot of its frame is identified: study or pool,
 * population, arm, measure, scope (subgroup, period, timepoint, part), analysis
 * and, for effects, endpoint, type, scale and interval. Two claims are compared
 * only when their frames are identical, with a small set of slots allowed to
 * be unstated on one side under the single-candidate rule (C13). Values are
 * compared exactly as written (`agreeAsWritten`): never as floats, trailing
 * zeros kept, bounds and approximations not values.
 *
 * Everything else is reported as not compared, with a reason code and both
 * quotes — never dropped, never guessed. A measure is never summarised as
 * consistent unless at least one pair was actually compared, and the report's
 * verdict says "no conflict among compared", never "consistent".
 *
 * Pure and deterministic: no I/O, no Date, no randomness, no model. Numbers,
 * verdicts and governed content come from this engine; a model only narrates.
 */
import { compareWithin, comparePair, summariesOf, verdictOf, type SourceClaims } from './clinical-claims/compare';
import { extract } from './clinical-claims/extract';
import { finalize, isClaim, markNonPrimary } from './clinical-claims/frame';
import type { Claim, ClaimReport, ClaimSource, Comparison, ExtractOptions, ExtractResult, NotCompared, Unframed } from './clinical-claims/types';

export { agreeAsWritten, canonical, readNumber, shown, type WrittenNumber, type NumberConvention } from './clinical-claims/number';
export type {
  ArmRef,
  CI,
  Claim,
  ClaimFrame,
  ClaimReport,
  ClaimSource,
  ClaimValue,
  Comparison,
  Component,
  ComponentResult,
  DocRole,
  ExtractOptions,
  ExtractResult,
  Loc,
  MeasureSummary,
  NotCompared,
  Outcome,
  ClaimPopulation,
  Scope,
  SlotName,
  StudyRef,
  Unframed,
} from './clinical-claims/types';

function sourceClaims(source: ClaimSource, opts: ExtractOptions): SourceClaims & { numberConvention: ExtractResult['numberConvention'] } {
  const ex = extract(source, opts);
  const claims: Claim[] = [];
  const unframed: Unframed[] = [];
  ex.drafts
    .slice()
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end)
    .forEach((d, i) => {
      const r = finalize(d, ex.doc, i);
      if (isClaim(r)) claims.push(r);
      else unframed.push(r);
    });
  markNonPrimary(claims);
  // Figures no form read: reported as not compared, never silently dropped (F13).
  for (const u of ex.unread) {
    const text = ex.doc.text;
    const qs = Math.max(0, text.lastIndexOf('\n', u.span.start) + 1, u.span.start - 90);
    const nl = text.indexOf('\n', u.span.end);
    const qe = Math.min(nl < 0 ? text.length : nl, u.span.end + 90);
    unframed.push({
      form: 'sweep',
      loc: { sourceId: source.id, start: qs, end: Math.max(qe, u.span.end), quote: text.slice(qs, Math.max(qe, u.span.end)).replace(/\s+/g, ' ').trim(), slotFrom: {} },
      missing: ['measure'],
      // C9: an approximation or a bound is not a value, whatever it measures.
      reason: u.value.startsWith('~') ? 'approximate_value' : /^[<>]/.test(u.value) ? 'bound_not_value' : 'figure_not_read',
      detail: `"${text.slice(u.span.start, u.span.end)}" matched no canonical form, so what it measures is not identified${/^[~<>]/.test(u.value) ? '; it is also an approximation or a bound, not a value (C9)' : ''}.`,
      partial: {},
      values: [u.value],
    });
  }
  return { doc: ex.doc, claims, unframed, numberConvention: ex.doc.convention };
}

/** The claims of one source, and the figures it could not frame. */
export function extractClaims(source: ClaimSource, opts: ExtractOptions = {}): ExtractResult {
  const s = sourceClaims(source, opts);
  return { claims: s.claims, unframed: s.unframed, numberConvention: s.numberConvention };
}

/** Compare every pair of sources (or the given pairs), and each source with itself across sections. */
export function compareClaims(
  sources: readonly ClaimSource[],
  opts: ExtractOptions & { pairs?: ReadonlyArray<readonly [string, string]>; withinSource?: boolean } = {},
): ClaimReport {
  const read = sources.map((s) => sourceClaims(s, opts));
  const byId = new Map(read.map((r) => [r.doc.id, r]));
  const pairs: Array<readonly [string, string]> = opts.pairs
    ? [...opts.pairs]
    : read.flatMap((a, i) => read.slice(i + 1).map((b) => [a.doc.id, b.doc.id] as const));
  const comparisons: Comparison[] = [];
  const notCompared: NotCompared[] = [];
  const seenUnframed = new Set<string>();
  for (const [x, y] of pairs) {
    const A = byId.get(x);
    const B = byId.get(y);
    if (!A || !B) continue;
    const r = comparePair(A, B);
    comparisons.push(...r.comparisons);
    for (const n of r.notCompared) {
      // A one-sided entry (an unframed figure) is reported once, however many pairs its source is in.
      if (!n.b) {
        const k = `${n.a.sourceId}:${n.a.loc.start}:${n.a.values.join('|')}:${n.reason}`;
        if (seenUnframed.has(k)) continue;
        seenUnframed.add(k);
      }
      notCompared.push(n);
    }
  }
  const withinSource = opts.withinSource === false ? [] : read.flatMap((r) => compareWithin(r));
  const all = [...comparisons, ...withinSource];
  return {
    sources: read.map((r) => ({ sourceId: r.doc.id, role: r.doc.role, claims: r.claims.length, unframed: r.unframed.length, numberConvention: r.numberConvention })),
    comparisons,
    notCompared,
    withinSource,
    summaries: summariesOf(all, notCompared),
    verdict: verdictOf(all),
  };
}
