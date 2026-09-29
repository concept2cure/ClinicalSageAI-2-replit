/**
 * The multiplicity designer's Holm and Hochberg designs are rank procedures,
 * displayed from the canonical engine's own decision rule.
 *
 * POST /api/biostat/multiplicity/design → designMultiplicityStrategy. Until
 * 2026-09-28, for approach 'holm' and 'hochberg':
 *   - alphaAllocation keyed each hypothesis, in the order it was LISTED, to a
 *     step threshold (holm α/(m − i), hochberg α(i + 1)/m), and the description
 *     called them "adjusted significance levels". Step thresholds belong to the
 *     RANKS of the ordered p-values, not to hypotheses: read as levels, a
 *     hypothesis listed last was "tested" at the full α whatever its p-value,
 *     and the allocation summed to more than α. The meaning the design spine
 *     gives alphaAllocation (study-design/multiplicity-check.ts) is each
 *     hypothesis's INITIAL level (Bretz et al. 2009).
 *   - hochberg's thresholds were the Simes / Benjamini–Hochberg iα/m, not
 *     Hochberg's α/(m − k + 1): for m = 3, α = 0.05 it showed 0.0333 at the
 *     second step where stats/multiplicity.ts `hochbergReject` applies 0.025.
 *   - an input it could not honour (α of 1.5 or "0.05", a repeated id, an
 *     unknown approach, a weight Holm/Hochberg ignore) produced a design or a
 *     500 with the refusal wrapped away.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { holmReject, hochbergReject } from '../stats/multiplicity';
import { createRng } from '../stats/rng';

const S = vi.hoisted(() => ({ inserts: [] as Array<Record<string, unknown>> }));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        S.inserts.push(v);
        return { returning: async () => [{ id: 41 }] };
      },
    }),
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: vi.fn() } }));

import { estimandEngineService } from '../estimand-engine-service';

type Approach = 'graphical' | 'fixed_sequence' | 'fallback' | 'gatekeeping' | 'holm' | 'hochberg';
type RankThreshold = { rank: number; threshold: number };

const hyps = (m: number, weight?: number) =>
  Array.from({ length: m }, (_, i) => ({
    id: `H${i + 1}`,
    description: `Hypothesis ${i + 1}`,
    endpoint: `Endpoint ${i + 1}`,
    ...(weight === undefined ? {} : { weight }),
  }));

const design = (approach: Approach, m: number, overallAlpha?: number) =>
  estimandEngineService.designMultiplicityStrategy({ hypotheses: hyps(m), overallAlpha, approach }, 9);

/** The rank thresholds as the result carries them; undefined on the old shape. */
const thresholdsOf = (r: unknown): RankThreshold[] | undefined =>
  (r as { rankThresholds?: RankThreshold[] | null }).rankThresholds ?? undefined;

/**
 * Apply the design as its description says to read it: order the p-values,
 * compare p(k) with the rank-k threshold, step down (holm) or up (hochberg).
 */
function applyDesign(procedure: 'holm' | 'hochberg', t: RankThreshold[], p: number[]): boolean[] {
  const order = [...p.keys()].sort((a, b) => p[a] - p[b]);
  const at = (k: number) => t.find((x) => x.rank === k)!.threshold;
  const rejected = new Array<boolean>(p.length).fill(false);
  if (procedure === 'holm') {
    for (let k = 1; k <= p.length && p[order[k - 1]] <= at(k); k++) rejected[order[k - 1]] = true;
  } else {
    let k = p.length;
    while (k >= 1 && p[order[k - 1]] > at(k)) k--;
    for (let j = 0; j < k; j++) rejected[order[j]] = true;
  }
  return rejected;
}

beforeEach(() => {
  S.inserts.length = 0;
});

describe('hochberg: the thresholds are Hochberg\'s α/(m − k + 1), not the Simes kα/m', () => {
  it('m = 3, α = 0.05 → 0.0167, 0.025, 0.05 by rank (the old service showed 0.0333 second)', async () => {
    const r = await design('hochberg', 3, 0.05);
    const t = thresholdsOf(r);
    expect(t).toBeDefined();
    expect(t!.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(t![0].threshold).toBeCloseTo(0.05 / 3, 15);
    expect(t![1].threshold).toBeCloseTo(0.025, 15);
    expect(t![2].threshold).toBeCloseTo(0.05, 15);
    expect(Object.values(r.alphaAllocation)).not.toContain(0.0333);
  });

  it('p = (0.01, 0.03, 0.2): the canonical engine rejects H1 only, and so does the design read as described', async () => {
    const r = await design('hochberg', 3, 0.05);
    const p = [0.01, 0.03, 0.2];
    expect(hochbergReject(p, 0.05)).toEqual([true, false, false]);
    expect(applyDesign('hochberg', thresholdsOf(r)!, p)).toEqual([true, false, false]);
  });
});

describe('holm and hochberg: thresholds belong to ranks, the allocation is the initial level', () => {
  it.each(['holm', 'hochberg'] as const)('%s: alphaAllocation is α/m for every hypothesis and sums to α', async (approach) => {
    const r = await design(approach, 3, 0.05);
    expect(Object.keys(r.alphaAllocation)).toEqual(['H1', 'H2', 'H3']);
    for (const level of Object.values(r.alphaAllocation)) expect(level).toBeCloseTo(0.05 / 3, 15);
    const total = Object.values(r.alphaAllocation).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(0.05 + 1e-12);
  });

  it.each(['holm', 'hochberg'] as const)('%s: no fixed testing order is claimed (the order is the observed p-values\')', async (approach) => {
    const r = await design(approach, 3, 0.05);
    expect(r.testingOrder).toBeNull();
    expect(S.inserts[0]).toMatchObject({ testingOrder: null, alphaAllocation: r.alphaAllocation });
  });

  it('holm, p = (0.04, 0.001, 0.03): the allocation read as levels rejects nothing the canonical engine keeps', async () => {
    // Old: {H1: 0.0167, H2: 0.025, H3: 0.05} by listed position → H3 (0.03 ≤ 0.05) "rejected",
    // while holmReject stops at the second-smallest p-value (0.03 > 0.025).
    const r = await design('holm', 3, 0.05);
    const p = [0.04, 0.001, 0.03];
    const canonical = holmReject(p, 0.05);
    expect(canonical).toEqual([false, true, false]);
    const byLevel = ['H1', 'H2', 'H3'].map((id, i) => p[i] <= r.alphaAllocation[id]);
    byLevel.forEach((rej, i) => { if (rej) expect(canonical[i]).toBe(true); });
    expect(applyDesign('holm', thresholdsOf(r)!, p)).toEqual(canonical);
  });

  it.each(['holm', 'hochberg'] as const)('%s: the description names rank thresholds, not per-hypothesis adjusted levels', async (approach) => {
    const r = await design(approach, 3, 0.05);
    expect(r.description).not.toMatch(/Adjusted significance levels/i);
    expect(r.description).not.toMatch(/H\d=0\.\d+/);
    expect(r.description).toMatch(/rank/i);
    expect(r.description).toMatch(/not initial levels/);
    expect(r.description).toMatch(approach === 'holm' ? /step-down/ : /step-up/);
  });

  it('hochberg says what its error control assumes; holm does not need to', async () => {
    expect((await design('hochberg', 2, 0.05)).description).toMatch(/positive regression dependence/);
    expect((await design('holm', 2, 0.05)).description).toMatch(/any dependence/);
  });
});

describe('one source: the displayed thresholds are the canonical holmReject / hochbergReject boundaries', () => {
  const probe = (m: number, rank: number, at: number) =>
    Array.from({ length: m }, (_, i) => (i < rank - 1 ? 0 : i === rank - 1 ? at : 1));

  it.each([
    ['holm', holmReject], ['hochberg', hochbergReject],
  ] as const)('%s: rejects p(k) at its threshold and not just above, every rank, m = 1…8 and 25, four alphas', async (approach, reject) => {
    for (const alpha of [0.01, 0.025, 0.05, 0.2]) {
      for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 25]) {
        const t = thresholdsOf(await design(approach, m, alpha))!;
        expect(t).toHaveLength(m);
        for (const { rank, threshold } of t) {
          expect(reject(probe(m, rank, threshold), alpha)[rank - 1]).toBe(true);
          expect(reject(probe(m, rank, threshold * (1 + 1e-6)), alpha)[rank - 1]).toBe(false);
        }
      }
    }
  });

  it.each([
    ['holm', holmReject], ['hochberg', hochbergReject],
  ] as const)('%s: the design read as described decides exactly as the canonical engine on 2000 seeded p-vectors', async (approach, reject) => {
    const rng = createRng(20260928);
    for (const m of [2, 3, 5]) {
      const t = thresholdsOf(await design(approach, m, 0.05))!;
      for (let s = 0; s < 2000 / 3; s++) {
        const p = Array.from({ length: m }, () => rng.uniform() * 0.08);
        expect(applyDesign(approach, t, p)).toEqual(reject(p, 0.05));
      }
    }
  });

  it('a canonical rule that disagrees with alpha/(m − k + 1) refuses the design instead of displaying it', async () => {
    vi.resetModules();
    // A canonical Holm that had become single-step Bonferroni: rank 2 of 3 is no longer rejected at α/2.
    vi.doMock('../stats/multiplicity', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../stats/multiplicity')>()),
      holmReject: (p: number[], alpha: number) => p.map((x) => x <= alpha / p.length),
    }));
    try {
      const { estimandEngineService: fresh } = await import('../estimand-engine-service');
      await expect(
        fresh.designMultiplicityStrategy({ hypotheses: hyps(3), overallAlpha: 0.05, approach: 'holm' }, 9),
      ).rejects.toThrow(/holm rank 2 of 3 .* is not the canonical holmReject boundary/);
      expect(S.inserts).toHaveLength(0);
    } finally {
      vi.doUnmock('../stats/multiplicity');
      vi.resetModules();
    }
  });

  it('a canonical rule MORE lenient than alpha/(m − k + 1) is refused too — the direction of the Simes-for-Hochberg defect', async () => {
    vi.resetModules();
    // A canonical "Hochberg" that had become Simes / Benjamini–Hochberg: rank k rejected at kα/m.
    vi.doMock('../stats/multiplicity', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../stats/multiplicity')>()),
      hochbergReject: (p: number[], alpha: number) => {
        const order = p.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
        let last = -1;
        order.forEach(([x], k) => { if (x <= ((k + 1) * alpha) / p.length) last = k; });
        const out = p.map(() => false);
        for (let k = 0; k <= last; k++) out[order[k][1]] = true;
        return out;
      },
    }));
    try {
      const { estimandEngineService: fresh } = await import('../estimand-engine-service');
      await expect(
        fresh.designMultiplicityStrategy({ hypotheses: hyps(3), overallAlpha: 0.05, approach: 'hochberg' }, 9),
      ).rejects.toThrow(/hochberg rank 2 of 3 .* is not the canonical hochbergReject boundary/);
      expect(S.inserts).toHaveLength(0);
    } finally {
      vi.doUnmock('../stats/multiplicity');
      vi.resetModules();
    }
  });

  it('other approaches carry no rank thresholds', async () => {
    for (const approach of ['graphical', 'fixed_sequence', 'fallback', 'gatekeeping'] as const) {
      expect(thresholdsOf(await design(approach, 3, 0.05))).toBeUndefined();
    }
  });
});

describe('an input the designer cannot honour is refused, naming it, before anything is stored', () => {
  const call = (params: Record<string, unknown>) =>
    estimandEngineService.designMultiplicityStrategy(
      { hypotheses: hyps(3), approach: 'holm', ...params } as never,
      9,
    );

  it.each([
    ['overallAlpha 1.5', { overallAlpha: 1.5 }, RangeError, /overallAlpha/],
    ['overallAlpha 1 (the bound is exclusive)', { overallAlpha: 1 }, RangeError, /overallAlpha/],
    ['overallAlpha 0', { overallAlpha: 0 }, RangeError, /overallAlpha/],
    ['overallAlpha NaN', { overallAlpha: Number.NaN }, RangeError, /overallAlpha/],
    ['overallAlpha "0.05"', { overallAlpha: '0.05' }, TypeError, /overallAlpha/],
    ['an unknown approach', { approach: 'bonferroni' }, RangeError, /approach/],
    ['no hypotheses', { hypotheses: [] }, RangeError, /hypotheses/],
    ['hypotheses that are not an array', { hypotheses: 'H1,H2' }, TypeError, /hypotheses/],
    ['a hypothesis with no id', { hypotheses: [{ description: 'd', endpoint: 'e' }] }, TypeError, /hypotheses\[0\]\.id/],
    ['a repeated id', { hypotheses: [...hyps(2), { ...hyps(1)[0] }] }, RangeError, /hypotheses\[2\]\.id/],
    ['holm with unequal weights', { hypotheses: [{ ...hyps(1)[0], weight: 0.8 }, { ...hyps(2)[1], weight: 0.2 }] }, RangeError, /weight/],
    ['hochberg with one weight given', { approach: 'hochberg', hypotheses: [{ ...hyps(1)[0], weight: 0.5 }, hyps(2)[1]] }, RangeError, /weight/],
    ['holm over more hypotheses than the designer confirms', { hypotheses: hyps(101) }, RangeError, /101/],
  ])('%s', async (_what, params, Kind, message) => {
    const err = await call(params).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(Kind);
    expect((err as Error).message).toMatch(message);
    expect(S.inserts).toHaveLength(0);
  });

  it('equal weights change nothing for holm and pass', async () => {
    const r = await estimandEngineService.designMultiplicityStrategy(
      { hypotheses: hyps(3, 0.4), overallAlpha: 0.05, approach: 'holm' }, 9,
    );
    for (const level of Object.values(r.alphaAllocation)) expect(level).toBeCloseTo(0.05 / 3, 15);
  });

  it('the default alpha is visible in the result', async () => {
    const r = await design('hochberg', 2);
    expect(r.overallAlpha).toBe(0.05);
    expect(thresholdsOf(r)!.map((x) => x.threshold)).toEqual([0.025, 0.05]);
  });
});

describe('the other approaches\' figures are untouched by this change', () => {
  it('graphical, fixed_sequence, fallback and gatekeeping allocations at m = 3, α = 0.05', async () => {
    expect((await design('graphical', 3, 0.05)).alphaAllocation).toEqual({ H1: 0.0167, H2: 0.0167, H3: 0.0167 });
    expect((await design('fixed_sequence', 3, 0.05)).alphaAllocation).toEqual({ H1: 0.05, H2: 0, H3: 0 });
    expect((await design('fallback', 3, 0.05)).alphaAllocation).toEqual({ H1: 0.0167, H2: 0.0167, H3: 0.0167 });
    expect((await design('gatekeeping', 3, 0.05)).alphaAllocation).toEqual({ H1: 0.025, H2: 0.025, H3: 0 });
  });
});
