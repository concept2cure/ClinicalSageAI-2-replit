/**
 * The clinical figure claims engine against its specification corpus.
 *
 * `fixtures/clinical-claims-corpus.json` is the specification: 431 adversarial
 * cases (220 curated, then 126 from hardening round 1, ids `r1-*`, then 85 from
 * hardening round 2, ids `r2-*`), each a pair of documents (CSR synopsis and body, Module 2.5 / 2.7.3 /
 * 2.7.4, ISS / ISE, USPI, SmPC) with the comparisons a reviewer expects —
 * consistent, conflict, or not_compared with a reason — and the outcome classes
 * the pair must never produce (`must_not`). It was written and curated before
 * any engine existed; nothing in it is derived from engine output.
 *
 * `fixtures/clinical-claims-corpus.pairs.json` is the machine reading of each
 * expected row, written from that row's own `why` text: the two values as
 * written (docA's, then docB's), the measure, the arm, and for not_compared rows
 * the values that must never be paired and the reasons the report may give.
 *
 * Every case asserts, per the corpus's "How a test reads a case":
 *   - every consistent / conflict row is reported, with both values as written;
 *   - every not_compared row is reported as not compared and never paired;
 *   - no comparison has an outcome in `must_not`;
 *   - every conflict the engine reports is one the corpus expects (no
 *     unannotated conflict: a false conflict is the defect this engine exists
 *     to prevent);
 *   - no measure is summarised as consistent unless a pair was compared, and the
 *     verdict is `nothing_compared` when nothing was;
 *   - every comparison cites both quotes at valid offsets, and two runs are
 *     identical.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  agreeAsWritten,
  compareClaims,
  extractClaims,
  readNumber,
  type ClaimReport,
  type ClaimSource,
  type Comparison,
  type DocRole,
} from '../clinical-claims';

interface CorpusCase {
  id: string;
  lens: string;
  docA: { type: DocRole; text: string };
  docB: { type: DocRole; text: string };
  expected: Array<{ measure: string; scope: string; outcome: 'consistent' | 'conflict' | 'not_compared'; why: string }>;
  must_not: Array<'consistent' | 'conflict' | 'not_compared'>;
  note: string;
}

interface CompareRow {
  m: string;
  a: string;
  b: string;
  c?: string;
  arm?: string;
  componentLevel?: boolean;
}
interface NotComparedRow {
  notPaired?: Array<[string, string]>;
  reported?: { a?: string[]; b?: string[] };
  reasons?: string[];
}
type Annotation = CompareRow | NotComparedRow;

const FIXTURES = join(__dirname, 'fixtures');
const CORPUS: CorpusCase[] = JSON.parse(readFileSync(join(FIXTURES, 'clinical-claims-corpus.json'), 'utf8'));
const PAIRS: Record<string, Annotation> = JSON.parse(readFileSync(join(FIXTURES, 'clinical-claims-corpus.pairs.json'), 'utf8'));

/**
 * The project's study record for the corpus: the sponsor study codes and the
 * registry numbers the corpus's own documents juxtapose (each pair is stated in
 * one source: lu-01 "Study DPL-301, NCT05551234", lu-05 "DPL-302 [NCT05551247]",
 * lu-10, lu-11, lu-14, lu-16, lu-29, pvs-19, pvs-39). A deterministic record,
 * never model input (convention C1). A bare "Trial 1" is never in it: lu-17,
 * pvs-18 and lu-04/06/07 must stay unbound.
 */
const STUDY_REGISTRY: ReadonlyArray<readonly string[]> = [
  ['DPL-301', 'NCT05551234'],
  ['DPL-302', 'NCT05551247'],
  ['LBR-301', 'NCT05012345'],
  ['CDB-202', 'NCT04987654'],
  ['CDB-301', 'NCT05112233'],
  ['RVX-301', 'NCT05334455'],
  ['PRX-301', 'NCT05230011'],
  ['JK-301', 'NCT04411111'],
  ['JK-302', 'NCT04422222'],
  ['LRN-301', 'NCT05011111'],
];

const sourcesOf = (c: CorpusCase): ClaimSource[] => [
  { id: 'A', role: c.docA.type, text: c.docA.text },
  { id: 'B', role: c.docB.type, text: c.docB.text },
];
const run = (c: CorpusCase): ClaimReport => compareClaims(sourcesOf(c), { studyAliases: STUDY_REGISTRY });

const isCompareRow = (a: Annotation): a is CompareRow => 'm' in a;
const crossSource = (r: ClaimReport) => r.comparisons.filter((x) => x.a.sourceId !== x.b.sourceId);

/** A compared (agree/differ) component with docA value `a` and docB value `b`. */
function pairedComponent(r: ClaimReport, a: string, b: string) {
  for (const cmp of crossSource(r)) {
    const flip = cmp.a.sourceId === 'B';
    for (const comp of cmp.components) {
      const [va, vb] = flip ? [comp.b, comp.a] : [comp.a, comp.b];
      if (comp.result !== 'not_compared' && va === a && vb === b) return { cmp, comp };
    }
  }
  return null;
}

function rowFound(r: ClaimReport, row: CompareRow, outcome: 'consistent' | 'conflict'): Comparison | null {
  for (const cmp of crossSource(r)) {
    if (!cmp.measureLabel.startsWith(row.m)) continue;
    if (row.arm && !(cmp.arm ?? '').includes(row.arm)) continue;
    const flip = cmp.a.sourceId === 'B';
    const hit = cmp.components.some((comp) => {
      const [va, vb] = flip ? [comp.b, comp.a] : [comp.a, comp.b];
      if (va !== row.a || vb !== row.b) return false;
      if (row.c && comp.component !== row.c) return false;
      return comp.result === (outcome === 'consistent' ? 'agree' : 'differ');
    });
    if (!hit) continue;
    if (outcome === 'conflict' && cmp.outcome !== 'conflict') continue;
    if (outcome === 'consistent' && !row.componentLevel && cmp.outcome !== 'consistent') continue;
    return cmp;
  }
  return null;
}

/** Report entries (not-compared entries and not-compared components) that carry value `v` on `side`. */
function reportsOf(r: ClaimReport, side: 'A' | 'B', v: string): string[] {
  const reasons: string[] = [];
  for (const n of r.notCompared) {
    if (n.a.sourceId === side && n.a.values.includes(v)) reasons.push(n.reason);
    if (n.b && n.b.sourceId === side && n.b.values.includes(v)) reasons.push(n.reason);
  }
  for (const cmp of crossSource(r)) {
    for (const comp of cmp.components) {
      if (comp.result !== 'not_compared') continue;
      const mine = cmp.a.sourceId === side ? comp.a : comp.b;
      if (mine === v) reasons.push(comp.reason ?? 'not_compared');
    }
  }
  return reasons;
}

/** Whether `v` on `side` takes part in a compared component of a cross-source comparison. */
function compares(r: ClaimReport, side: 'A' | 'B', v: string): boolean {
  return crossSource(r).some((cmp) =>
    cmp.components.some((comp) => comp.result !== 'not_compared' && (cmp.a.sourceId === side ? comp.a : comp.b) === v),
  );
}

function problemsOf(c: CorpusCase, r: ClaimReport): string[] {
  const problems: string[] = [];
  c.expected.forEach((row, i) => {
    const key = `${c.id}#${i}`;
    const ann = PAIRS[key];
    if (!ann) return void problems.push(`${key}: no annotation`);
    if (row.outcome !== 'not_compared') {
      if (!isCompareRow(ann)) return void problems.push(`${key}: annotation is not a compare row`);
      if (!rowFound(r, ann, row.outcome)) {
        problems.push(`${key} ${row.outcome} not reported: ${ann.m} ${ann.a} vs ${ann.b}${ann.arm ? ` (${ann.arm})` : ''} — ${row.measure}`);
      }
      return;
    }
    if (isCompareRow(ann)) return void problems.push(`${key}: not_compared row annotated as a compare row`);
    for (const [a, b] of ann.notPaired ?? []) {
      const p = pairedComponent(r, a, b);
      if (p) problems.push(`${key} paired ${a} with ${b} (${p.cmp.outcome}, ${p.cmp.measureLabel}) — must not be compared`);
    }
    for (const side of ['a', 'b'] as const) {
      for (const v of ann.reported?.[side] ?? []) {
        const S = side === 'a' ? 'A' : 'B';
        const reasons = reportsOf(r, S, v);
        if (reasons.length === 0) problems.push(`${key}: doc${S} ${v} is not reported as not compared`);
        else if (ann.reasons && !reasons.some((x) => ann.reasons!.includes(x))) {
          problems.push(`${key}: doc${S} ${v} reported with [${reasons.join(', ')}], expected one of [${ann.reasons.join(', ')}]`);
        }
        if (compares(r, S, v)) problems.push(`${key}: doc${S} ${v} is compared, but the row says it is not`);
      }
    }
  });

  const all = [...crossSource(r), ...r.withinSource];
  for (const outcome of c.must_not) {
    for (const cmp of all.filter((x) => x.outcome === outcome)) {
      problems.push(`must_not ${outcome}: ${cmp.detail}`);
    }
  }

  // Every conflict the engine reports must be one the corpus expects.
  const conflictRows = c.expected
    .map((row, i) => ({ row, ann: PAIRS[`${c.id}#${i}`] }))
    .filter((x): x is { row: (typeof c.expected)[number]; ann: CompareRow } => x.row.outcome === 'conflict' && isCompareRow(x.ann));
  for (const cmp of crossSource(r).filter((x) => x.outcome === 'conflict')) {
    const flip = cmp.a.sourceId === 'B';
    const expected = cmp.components.some(
      (comp) =>
        comp.result === 'differ' &&
        conflictRows.some(({ ann }) => (flip ? [comp.b, comp.a] : [comp.a, comp.b]).join('|') === `${ann.a}|${ann.b}`),
    );
    if (!expected) problems.push(`unexpected conflict: ${cmp.detail}`);
  }

  // A measure is never summarised as consistent without a comparison (failure-spec item 17).
  for (const s of r.summaries) {
    if (s.compared === 0 && s.status !== 'not_compared') problems.push(`summary ${s.measureLabel}: ${s.status} with nothing compared`);
    if (s.status === 'consistent_where_compared' && s.conflicts > 0) problems.push(`summary ${s.measureLabel}: consistent with conflicts`);
  }
  const compared = all.length;
  const conflicts = all.filter((x) => x.outcome === 'conflict').length;
  const verdict = conflicts > 0 ? 'conflicts_found' : compared > 0 ? 'no_conflict_among_compared' : 'nothing_compared';
  if (r.verdict !== verdict) problems.push(`verdict ${r.verdict}, expected ${verdict}`);

  // Every comparison and not-compared entry cites its quotes at valid offsets.
  const texts: Record<string, string> = { A: c.docA.text, B: c.docB.text };
  const checkLoc = (where: string, side: { sourceId: string; quote: string; loc: { start: number; end: number } }) => {
    const t = texts[side.sourceId];
    if (!t || side.loc.start < 0 || side.loc.end > t.length || side.loc.start >= side.loc.end || !side.quote.trim()) {
      problems.push(`${where}: bad citation ${JSON.stringify(side)}`);
    }
  };
  for (const cmp of all) {
    checkLoc(`comparison ${cmp.measureLabel}`, cmp.a);
    checkLoc(`comparison ${cmp.measureLabel}`, cmp.b);
  }
  for (const n of r.notCompared) {
    checkLoc(`not_compared ${n.reason}`, n.a);
    if (n.b) checkLoc(`not_compared ${n.reason}`, n.b);
  }
  return problems;
}

describe('clinical claims corpus', () => {
  it('annotates every expected row of every case, and nothing else', () => {
    const keys = CORPUS.flatMap((c) => c.expected.map((_, i) => `${c.id}#${i}`));
    expect(keys).toHaveLength(968);
    expect(Object.keys(PAIRS).filter((k) => !k.startsWith('_')).sort()).toEqual([...keys].sort());
  });

  it.each(CORPUS.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const r = run(c);
    expect(problemsOf(c, r)).toEqual([]);
    // Deterministic: the same input gives the same report.
    expect(run(c)).toEqual(r);
  });
});

describe('agreeAsWritten: precision as written (C10)', () => {
  const w = (raw: string) => {
    const n = readNumber(raw);
    if (!n) throw new Error(`unreadable ${raw}`);
    return n;
  };
  it.each([
    ['4.0', '4.4', 'differ'],
    ['2.0', '2.4', 'differ'],
    ['8', '8.2', 'agree'],
    ['8', '8.6', 'differ'],
    ['7.5', '8', 'agree'],
    ['8.5', '8', 'agree'],
    ['0.72', '0.723', 'agree'],
    ['0.10', '0.14', 'differ'],
    ['0.00', '-0.40', 'differ'],
    ['0.00', '-0.01', 'differ'],
    ['-0.8', '-0.80', 'agree'],
    ['-1.0', '-0.98', 'agree'],
    ['612', '621', 'differ'],
    ['0', '0.0', 'agree'],
    ['<0.001', '<0.001', 'agree'],
  ])('%s vs %s: %s', (a, b, expected) => {
    expect(agreeAsWritten(w(a), w(b))).toBe(expected);
    expect(agreeAsWritten(w(b), w(a))).toBe(expected);
  });

  it.each([
    ['<0.001', '0.0004', 'bound_not_value'],
    ['<0.001', '<0.0001', 'bounds_differ'],
    ['approximately 600', '612', 'approximate_value'],
    ['0%', '0.3%', 'zero_precision_ambiguous'],
  ])('%s vs %s is not compared (%s)', (a, b, reason) => {
    expect(agreeAsWritten(w(a), w(b))).toEqual({ notCompared: reason });
  });
});

describe('readNumber: a number exactly as written (C19)', () => {
  it.each([
    ['4.0', { digits: '4.0', dp: 1, sign: 1 }],
    ['0.00', { digits: '0.00', dp: 2, sign: 1 }],
    ['−0.62', { digits: '0.62', dp: 2, sign: -1 }],
    ['1 227', { digits: '1227', dp: 0 }],
    ['1,227', { digits: '1227', dp: 0 }],
    ['Six hundred and twelve', { digits: '612', dp: 0, word: true }],
    ['<0.001', { digits: '0.001', kind: 'bound', op: '<' }],
    ['4.6 per cent', { digits: '4.6', pct: 'per cent' }],
  ])('%s', (raw, expected) => {
    expect(readNumber(raw)).toMatchObject(expected);
  });

  it('reads a decimal comma in a comma-convention source and a period thousands separator in a count slot', () => {
    expect(readNumber('0,72', { convention: 'comma' })).toMatchObject({ digits: '0.72', dp: 2 });
    expect(readNumber('99,3 %', { convention: 'comma' })).toMatchObject({ digits: '99.3', dp: 1 });
    expect(readNumber('1.227', { convention: 'comma', countSlot: true })).toMatchObject({ digits: '1227', dp: 0 });
  });
});

describe('extractClaims: a figure is a claim only with its whole frame', () => {
  const claims = (text: string, role: DocRole = 'csr') => extractClaims({ id: 'S', role, text }, { studyAliases: STUDY_REGISTRY });

  it('reads the verb-first and the passive randomized total as the same measure (F5, F19)', () => {
    const verbFirst = claims('Study NRX-301 Synopsis. The study randomized a total of 612 patients (nerantib 306; placebo 306).');
    const passive = claims('Study NRX-301. A total of 621 patients were randomized (1:1) to nerantib (n=311) or placebo (n=310).');
    const total = (r: ReturnType<typeof claims>) => r.claims.find((x) => x.measureLabel === 'n:randomized' && x.frame.arm?.kind === 'total');
    expect(total(verbFirst)?.value.count?.digits).toBe('612');
    expect(total(passive)?.value.count?.digits).toBe('621');
    expect(verbFirst.claims.filter((x) => x.measureLabel === 'n:randomized' && x.frame.arm?.kind === 'arm')).toHaveLength(2);
  });

  it('never reads rescue-medication "treated" as the treated population (F2)', () => {
    const r = claims('Study ZT-301. 50 patients were treated with rescue medication during the double-blind period (Drug X 18; placebo 32).');
    expect(r.claims.filter((x) => x.measureLabel === 'n:treated')).toEqual([]);
  });

  it('keeps a subgroup qualifier in the frame, never the overall figure (F15, F18)', () => {
    const r = claims('Study DX-301. Safety (Safety Population): In Japanese patients, SAEs were reported in 6.0% vs 2.0% (Drug X vs placebo).');
    const sae = r.claims.filter((x) => x.measureLabel === 'incidence:serious');
    expect(sae).toHaveLength(2);
    expect(sae.every((x) => x.frame.scope.subgroups.length === 1)).toBe(true);
  });

  it('reads per-arm deaths as per-arm, never as the total (F14)', () => {
    const r = claims('Study DX-303. Deaths (Safety Population): 2 deaths occurred in the Drug X group and 1 in the placebo group.');
    const deaths = r.claims.filter((x) => x.measureLabel === 'deaths');
    expect(deaths.map((x) => x.value.count?.digits).sort()).toEqual(['1', '2']);
    expect(deaths.some((x) => x.frame.arm?.kind === 'total')).toBe(false);
  });

  it('keeps sub-rates as preferred-term claims, never as more arm rates (F6)', () => {
    const r = claims(
      'Study DX-303 Synopsis. Safety (Safety Population): TEAEs occurred in 58.4% vs 51.2% of patients (Drug X vs placebo), the most common being headache (8.2% vs 4.0%).',
    );
    expect(r.claims.filter((x) => x.measureLabel === 'incidence:any').map((x) => x.value.percent?.digits)).toEqual(['58.4', '51.2']);
    expect(r.claims.filter((x) => x.measureLabel === 'incidence:any:pt:headache').map((x) => x.value.percent?.digits)).toEqual(['8.2', '4.0']);
  });

  it('frames an effect by type, endpoint, population, timepoint and CI, and cuts a p-value from the interval (F12, F13)', () => {
    const r = claims(
      'Study DX-305 (FAS). Primary endpoint, change from baseline to Week 26 in HbA1c (%): The treatment difference was -0.62 (95% CI -0.78 to -0.46, P<0.001).',
    );
    const effect = r.claims.find((x) => x.frame.measure.family === 'effect');
    expect(effect?.measureLabel).toBe('effect:mean_difference:hba1c');
    expect(effect?.frame.population?.set).toBe('fas');
    expect(effect?.frame.scope.timepoint).toBe('week-26');
    expect(effect?.frame.ci).toMatchObject({ level: '95', sided: 'two' });
    expect([effect?.value.estimate?.digits, effect?.value.lower?.digits, effect?.value.upper?.digits, effect?.value.p?.digits]).toEqual([
      '0.62',
      '0.78',
      '0.46',
      '0.001',
    ]);
  });

  it('reports a figure it cannot frame as not compared, with the missing slot, never drops it (F13)', () => {
    const r = claims('Serious adverse events were reported in 4.6% and 3.3%.');
    expect(r.claims).toEqual([]);
    expect(r.unframed.length).toBeGreaterThan(0);
    expect(r.unframed.some((u) => u.missing.includes('study'))).toBe(true);
  });
});
