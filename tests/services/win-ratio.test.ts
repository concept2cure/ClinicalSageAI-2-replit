/**
 * Tests for win ratio / Finkelstein–Schoenfeld (server/services/stats/win-ratio.ts).
 *
 * Validated by a fully hand-computed example (wins/losses, net benefit, and the
 * FS z and p-value), the Pocock time-to-event win rule with censoring,
 * hierarchy fall-through, arm-swap symmetry, and confidence-interval behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  winRatioAnalysis,
  compareSubjects,
  type Subject,
  type LevelSpec,
} from '../../server/services/stats/win-ratio';

const cont: LevelSpec = { type: 'continuous', direction: 'higher-better' };
const sub = (...vals: number[]): Subject => ({ levels: vals.map(value => ({ value })) });

describe('win counting and the Finkelstein–Schoenfeld statistic — hand-checked', () => {
  // treatment {3,1} vs control {2,4}, single continuous higher-better level:
  // pairs (3,2)+ (3,4)- (1,2)- (1,4)- ⇒ W=1, L=3, T=0.
  const r = winRatioAnalysis([sub(3), sub(1)], [sub(2), sub(4)], [cont]);

  it('counts wins, losses and ties correctly', () => {
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(3);
    expect(r.ties).toBe(0);
    expect(r.pairs).toBe(4);
  });

  it('computes the win ratio, win odds and net benefit', () => {
    expect(r.winRatio).toBeCloseTo(1 / 3, 10);
    expect(r.winOdds).toBeCloseTo(1 / 3, 10); // no ties ⇒ equals WR
    expect(r.netBenefit).toBeCloseTo(-0.5, 10);
  });

  it('computes the FS z and two-sided p exactly', () => {
    // Per-subject mean kernels: R_i=[0,-1], C_j=[0,-1]; var=0.5 each;
    // Var(Δ)=0.5/2+0.5/2=0.5; z=-0.5/√0.5=-0.70711; p=0.47950.
    expect(r.z).toBeCloseTo(-0.70711, 4);
    expect(r.pValue).toBeCloseTo(0.47950, 4);
  });
});

describe('arm-swap symmetry', () => {
  it('inverts the win ratio, flips the net benefit, preserves the p-value', () => {
    const a = winRatioAnalysis([sub(3), sub(1)], [sub(2), sub(4)], [cont]);
    const b = winRatioAnalysis([sub(2), sub(4)], [sub(3), sub(1)], [cont]);
    expect(b.winRatio).toBeCloseTo(1 / a.winRatio, 10);
    expect(b.netBenefit).toBeCloseTo(-a.netBenefit, 10);
    expect(b.z).toBeCloseTo(-a.z, 8);
    expect(b.pValue).toBeCloseTo(a.pValue, 8);
  });
});

describe('time-to-event Pocock win rule with censoring', () => {
  const tte: LevelSpec = { type: 'tte', direction: 'higher-better' };
  const tteSub = (value: number, event: boolean): Subject => ({ levels: [{ value, event }] });

  it('treats an early censoring before the comparator’s event as indeterminate (tie)', () => {
    // trt {10,event},{5,censored}; ctrl {8,event},{12,event}.
    // (10e,8e)+ (10e,12e)- (5c,8e)tie (5c,12e)tie ⇒ W=1,L=1,T=2.
    const r = winRatioAnalysis(
      [tteSub(10, true), tteSub(5, false)],
      [tteSub(8, true), tteSub(12, true)],
      [tte],
    );
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.ties).toBe(2);
    expect(r.winRatio).toBeCloseTo(1, 10);
    expect(r.netBenefit).toBeCloseTo(0, 10);
  });

  it('a subject censored after the comparator’s event still loses to the survivor', () => {
    // trt {12,censored}; ctrl {8,event}: control had its event at 8, treatment
    // event-free past 8 ⇒ treatment wins.
    const r = winRatioAnalysis(
      [tteSub(12, false), tteSub(20, false)],
      [tteSub(8, true), tteSub(5, true)],
      [tte],
    );
    expect(r.wins).toBe(4); // both treatment subjects beat both control events
    expect(r.losses).toBe(0);
  });
});

describe('hierarchy fall-through', () => {
  it('uses the next level only when the prior level ties', () => {
    const hierarchy: LevelSpec[] = [
      { type: 'tte', direction: 'higher-better' },
      { type: 'continuous', direction: 'higher-better' },
    ];
    // Level 1 both censored (tie); level 2 decides: 9 > 3 ⇒ treatment wins.
    const a: Subject = { levels: [{ value: 5, event: false }, { value: 9 }] };
    const b: Subject = { levels: [{ value: 6, event: false }, { value: 3 }] };
    expect(compareSubjects(a, b, hierarchy)).toBe(1);

    // Level 1 decisive (a has event later than b's event) ⇒ ignores level 2.
    const c: Subject = { levels: [{ value: 10, event: true }, { value: 0 }] };
    const d: Subject = { levels: [{ value: 4, event: true }, { value: 100 }] };
    expect(compareSubjects(c, d, hierarchy)).toBe(1);
  });
});

describe('confidence interval and significance behavior', () => {
  function replicate(arm: Subject[], k: number): Subject[] {
    const out: Subject[] = [];
    for (let i = 0; i < k; i++) out.push(...arm.map(s => ({ levels: s.levels.map(l => ({ ...l })) })));
    return out;
  }
  const trt = [sub(3), sub(1)];
  const ctr = [sub(2), sub(4)];

  it('the CI contains the point estimate and narrows with more data', () => {
    const small = winRatioAnalysis(replicate(trt, 3), replicate(ctr, 3), [cont]);
    const large = winRatioAnalysis(replicate(trt, 30), replicate(ctr, 30), [cont]);
    // Same win ratio (1/3) regardless of replication.
    expect(small.winRatio).toBeCloseTo(1 / 3, 8);
    expect(large.winRatio).toBeCloseTo(1 / 3, 8);
    expect(small.ciLower).toBeLessThan(small.winRatio);
    expect(small.ciUpper).toBeGreaterThan(small.winRatio);
    const widthSmall = small.ciUpper - small.ciLower;
    const widthLarge = large.ciUpper - large.ciLower;
    expect(widthLarge).toBeLessThan(widthSmall);
    // More data ⇒ the WR<1 result becomes significant.
    expect(large.pValue).toBeLessThan(small.pValue);
    expect(large.pValue).toBeLessThan(0.05);
  });

  it('reports Infinity and a NaN CI when there are no losses', () => {
    const r = winRatioAnalysis([sub(3), sub(4)], [sub(1), sub(2)], [cont]);
    expect(r.losses).toBe(0);
    expect(r.winRatio).toBe(Infinity);
    expect(Number.isNaN(r.ciLower)).toBe(true);
  });

  it('is deterministic with stable provenance', () => {
    const a = winRatioAnalysis(trt, ctr, [cont]);
    const b = winRatioAnalysis(trt, ctr, [cont]);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.method).toBe('winRatio:analysis');
  });
});
