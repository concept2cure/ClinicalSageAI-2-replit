/**
 * Unit tests for the weekly-usage-limit engine. Targets the PURE core — window
 * math, effective-cap, the overage/block decision, and config validation — which
 * is where all the policy lives. DB wrappers are thin pass-throughs.
 */
import { describe, it, expect } from 'vitest';

import {
  currentWeekWindow,
  effectiveCap,
  evaluateLimit,
  validateLimitConfig,
  alertsForDecision,
  WEEKLY_METRICS,
  type WeeklyLimitConfig,
} from '../weekly-usage-limits';

const cfg = (over: Partial<WeeklyLimitConfig> = {}): WeeklyLimitConfig => ({
  metric: 'requests',
  weeklyLimit: 100,
  overageCapPct: 20,
  overageHardCap: null,
  warnThresholdPct: 80,
  weekStartDow: 1,
  enabled: true,
  ...over,
});

describe('currentWeekWindow', () => {
  it('returns a 7-day window starting on the configured reset day (UTC)', () => {
    // 2026-06-21 is a Sunday. Monday-start (dow=1) window should start 2026-06-15.
    const now = new Date('2026-06-21T12:00:00Z');
    const { start, end } = currentWeekWindow(1, now);
    expect(start.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-22T00:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 86_400_000).toBe(7);
    expect(now.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(now.getTime()).toBeLessThan(end.getTime());
  });

  it('honors a Sunday reset (dow=0)', () => {
    const now = new Date('2026-06-21T12:00:00Z'); // Sunday
    const { start } = currentWeekWindow(0, now);
    expect(start.toISOString()).toBe('2026-06-21T00:00:00.000Z');
  });
});

describe('effectiveCap', () => {
  it('grows the limit by the overage percentage', () => {
    expect(effectiveCap(100, 20, null)).toBe(120);
    expect(effectiveCap(100, 0, null)).toBe(100); // no overage → hard block at limit
    expect(effectiveCap(100, 33, null)).toBe(133); // floored
  });
  it('uses an absolute hard cap when set, never below the limit', () => {
    expect(effectiveCap(100, 20, 150)).toBe(150);
    expect(effectiveCap(100, 20, 80)).toBe(100); // clamped up to the limit
  });
});

describe('evaluateLimit — states', () => {
  const resetAt = new Date('2026-06-22T00:00:00Z');
  const decide = (used: number, increment = 1, over: Partial<WeeklyLimitConfig> = {}) =>
    evaluateLimit({ metric: 'requests', used, increment, config: cfg(over), resetAt });

  it('ok well under the limit', () => {
    const d = decide(10);
    expect(d.state).toBe('ok');
    expect(d.allowed).toBe(true);
    expect(d.overageUsed).toBe(0);
  });

  it('warn at/after the warn threshold', () => {
    expect(decide(80).state).toBe('warn'); // projected 81 ≥ 80% of 100
    expect(decide(78).state).toBe('ok'); // projected 79 < 80
  });

  it('overage (allowed, billable) between limit and cap', () => {
    const d = decide(105); // limit 100, cap 120
    expect(d.state).toBe('overage');
    expect(d.allowed).toBe(true);
    expect(d.overageUsed).toBe(5);
  });

  it('blocked once the projected usage exceeds the cap', () => {
    const d = decide(120, 1); // 120 + 1 > cap 120
    expect(d.state).toBe('blocked');
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
  });

  it('a 0% overage cap is a hard block exactly at the limit', () => {
    const d = decide(100, 1, { overageCapPct: 0 });
    expect(d.state).toBe('blocked');
    expect(d.allowed).toBe(false);
  });

  it('an absolute hard cap overrides the percentage', () => {
    const under = decide(140, 1, { overageHardCap: 150 }); // cap 150
    expect(under.state).toBe('overage');
    expect(under.allowed).toBe(true);
    const over = decide(150, 1, { overageHardCap: 150 });
    expect(over.state).toBe('blocked');
    expect(over.allowed).toBe(false);
  });

  it('disabled limits always pass', () => {
    const d = decide(10_000, 1, { enabled: false });
    expect(d.state).toBe('disabled');
    expect(d.allowed).toBe(true);
  });

  it('reports a current standing with increment 0 (monitoring)', () => {
    const d = evaluateLimit({ metric: 'requests', used: 105, increment: 0, config: cfg(), resetAt });
    expect(d.state).toBe('overage');
    expect(d.pct).toBe(105);
    expect(d.overageUsed).toBe(5);
  });
});

describe('alertsForDecision', () => {
  const resetAt = new Date('2026-06-22T00:00:00Z');
  const decide = (used: number, over: Partial<WeeklyLimitConfig> = {}) =>
    evaluateLimit({ metric: 'cost_cents', used, increment: 0, config: cfg(over), resetAt });

  it('emits nothing below the warn threshold', () => {
    expect(alertsForDecision(decide(50))).toEqual([]); // 50% < 80%
  });

  it('emits a warning at/after the warn threshold', () => {
    const kinds = alertsForDecision(decide(85)).map((a) => a.kind);
    expect(kinds).toEqual(['weekly_warning']);
  });

  it('escalates to warning + overage once the limit is reached', () => {
    const kinds = alertsForDecision(decide(110)).map((a) => a.kind); // limit 100, cap 120
    expect(kinds).toEqual(['weekly_warning', 'weekly_overage']);
  });

  it('emits the full trail (warning + overage + blocked) at the cap', () => {
    const kinds = alertsForDecision(decide(120)).map((a) => a.kind);
    expect(kinds).toEqual(['weekly_warning', 'weekly_overage', 'weekly_blocked']);
  });

  it('emits nothing when no real limit is set', () => {
    expect(alertsForDecision(decide(5, { weeklyLimit: 0 }))).toEqual([]);
  });
});

describe('validateLimitConfig', () => {
  it('accepts a well-formed config', () => {
    expect(validateLimitConfig(cfg())).toEqual([]);
  });
  it('rejects an unknown metric', () => {
    expect(validateLimitConfig(cfg({ metric: 'bogus' as any }))).toContain(
      `metric must be one of: ${WEEKLY_METRICS.join(', ')}`,
    );
  });
  it('rejects a negative limit', () => {
    expect(validateLimitConfig(cfg({ weeklyLimit: -1 })).length).toBeGreaterThan(0);
  });
  it('rejects a hard cap below the limit', () => {
    expect(validateLimitConfig(cfg({ overageHardCap: 50 }))).toContain('overageHardCap must be >= weeklyLimit');
  });
  it('rejects an out-of-range warn threshold and reset day', () => {
    expect(validateLimitConfig(cfg({ warnThresholdPct: 150 })).length).toBeGreaterThan(0);
    expect(validateLimitConfig(cfg({ weekStartDow: 9 })).length).toBeGreaterThan(0);
  });
});
