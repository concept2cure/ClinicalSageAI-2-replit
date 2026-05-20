/**
 * Tests for pattern-decay math and contradiction-detection logic.
 */

import { describe, it, expect } from 'vitest';
import {
  timeDecay,
  computeDecayFactor,
  isContradiction,
  DEFAULT_HALF_LIFE_DAYS,
  DECAY_FACTOR_FLOOR,
} from '../pattern-maintenance';

describe('timeDecay', () => {
  it('is 1.0 at t=0', () => {
    expect(timeDecay(0)).toBe(1);
    expect(timeDecay(-5)).toBe(1);
  });

  it('halves at the half-life', () => {
    expect(timeDecay(DEFAULT_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 6);
  });

  it('falls to 0.25 at two half-lives', () => {
    expect(timeDecay(2 * DEFAULT_HALF_LIFE_DAYS)).toBeCloseTo(0.25, 6);
  });

  it('returns 0 for non-positive half-life', () => {
    expect(timeDecay(10, 0)).toBe(0);
    expect(timeDecay(10, -1)).toBe(0);
  });
});

describe('computeDecayFactor', () => {
  it('matches pure time-decay when no dismissals exist', () => {
    const factor = computeDecayFactor({ daysSinceLastSeen: DEFAULT_HALF_LIFE_DAYS, dismissedWarnings: 0 });
    expect(factor).toBeCloseTo(0.5, 6);
  });

  it('penalizes for each dismissed warning', () => {
    const noDismiss = computeDecayFactor({ daysSinceLastSeen: 30, dismissedWarnings: 0 });
    const dismissed = computeDecayFactor({ daysSinceLastSeen: 30, dismissedWarnings: 5 });
    expect(dismissed).toBeLessThan(noDismiss);
  });

  it('never falls below the floor', () => {
    const factor = computeDecayFactor({
      daysSinceLastSeen: 10000,
      dismissedWarnings: 1000,
    });
    expect(factor).toBeGreaterThanOrEqual(DECAY_FACTOR_FLOOR);
  });
});

describe('isContradiction', () => {
  const base = {
    pattern_fingerprint: 'abc',
    suggested_correction: 'Add PIP statement',
    last_seen_at: '2026-01-01T00:00:00Z',
    confidence: 0.7,
    tenant_count: 5,
    failure_count: 12,
  };

  it('flags when newer pattern carries different correction with ≥ tenant support', () => {
    const older = { id: 'A', ...base };
    const newer = {
      id: 'B',
      pattern_fingerprint: 'abc',
      suggested_correction: 'Remove PIP statement, file PIP waiver instead',
      last_seen_at: '2026-04-01T00:00:00Z',
      confidence: 0.8,
      tenant_count: 6,
      failure_count: 18,
    };
    expect(isContradiction(older, newer)).toBe(true);
  });

  it('does not flag when corrections normalize to the same content', () => {
    const older = { id: 'A', ...base };
    const newer = {
      id: 'B',
      pattern_fingerprint: 'abc',
      suggested_correction: 'Please add PIP statement',
      last_seen_at: '2026-04-01T00:00:00Z',
      confidence: 0.8,
      tenant_count: 6,
      failure_count: 18,
    };
    expect(isContradiction(older, newer)).toBe(false);
  });

  it('does not flag when newer has weaker tenant support', () => {
    const older = { id: 'A', ...base };
    const newer = {
      id: 'B',
      pattern_fingerprint: 'abc',
      suggested_correction: 'Remove PIP statement',
      last_seen_at: '2026-04-01T00:00:00Z',
      confidence: 0.5,
      tenant_count: 3,
      failure_count: 5,
    };
    expect(isContradiction(older, newer)).toBe(false);
  });

  it('does not flag across different fingerprints', () => {
    const older = { id: 'A', ...base };
    const newer = {
      id: 'B',
      pattern_fingerprint: 'def',
      suggested_correction: 'Different correction',
      last_seen_at: '2026-04-01T00:00:00Z',
      confidence: 0.8,
      tenant_count: 9,
      failure_count: 20,
    };
    expect(isContradiction(older, newer)).toBe(false);
  });
});
