/**
 * Effort-certification deterministic logic (add-on) — pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { validateEffort, computeEffortContentHash, RECERT_DEVIATION_PCT, type EffortLineView } from '../effort-logic';

const ok: EffortLineView[] = [
  { awardId: 1, activityLabel: 'R01', committedPct: 40, actualPct: 40 },
  { awardId: 2, activityLabel: 'U01', committedPct: 30, actualPct: 30 },
  { awardId: null, activityLabel: 'Teaching', committedPct: 30, actualPct: 30 },
];

describe('validateEffort', () => {
  it('passes a 100%-balanced statement (low risk)', () => {
    const r = validateEffort(ok);
    expect(r.totalCommitted).toBe(100);
    expect(r.totalActual).toBe(100);
    expect(r.riskLevel).toBe('low');
    expect(r.needsRecertification).toBe(false);
  });
  it('flags total committed > 100% as critical', () => {
    const r = validateEffort([{ awardId: 1, activityLabel: 'A', committedPct: 70, actualPct: 70 }, { awardId: 2, activityLabel: 'B', committedPct: 50, actualPct: 50 }]);
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => /exceeds 100%/.test(f.message))).toBe(true);
  });
  it('flags a line over 100% as critical', () => {
    const r = validateEffort([{ awardId: 1, activityLabel: 'A', committedPct: 120, actualPct: 50 }]);
    expect(r.riskLevel).toBe('high');
  });
  it('triggers recertification on a material committed↔actual deviation (sponsored)', () => {
    const r = validateEffort([{ awardId: 1, activityLabel: 'R01', committedPct: 40, actualPct: 10 }, { awardId: null, activityLabel: 'Teaching', committedPct: 60, actualPct: 90 }]);
    expect(r.needsRecertification).toBe(true);
    expect(r.findings.some((f) => new RegExp(`>${RECERT_DEVIATION_PCT}%`).test(f.message))).toBe(true);
  });
  it('does not trigger recert for non-sponsored deviation', () => {
    const r = validateEffort([{ awardId: 1, activityLabel: 'R01', committedPct: 50, actualPct: 50 }, { awardId: null, activityLabel: 'Teaching', committedPct: 50, actualPct: 10 }]);
    expect(r.needsRecertification).toBe(false);
  });
  it('flags an empty statement', () => {
    expect(validateEffort([]).findings.some((f) => /No effort/.test(f.message))).toBe(true);
  });
});

describe('computeEffortContentHash', () => {
  it('is order-independent and changes on edit', () => {
    const a = computeEffortContentHash(ok, '2026-01-01', '2026-06-30');
    const b = computeEffortContentHash([ok[2], ok[0], ok[1]], '2026-01-01', '2026-06-30');
    expect(a).toBe(b);
    const c = computeEffortContentHash([{ ...ok[0], actualPct: 99 }, ok[1], ok[2]], '2026-01-01', '2026-06-30');
    expect(c).not.toBe(a);
  });
});
