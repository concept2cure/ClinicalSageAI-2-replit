/**
 * Honesty envelope — pure confidence/freshness/gating, no I/O, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  confidenceFromEvidence,
  buildHonestyEnvelope,
  finalReadyGate,
} from '../honesty-envelope';

describe('confidenceFromEvidence', () => {
  it('scales with n and never overstates at zero', () => {
    expect(confidenceFromEvidence({ n: 0 })).toBe('low');
    expect(confidenceFromEvidence({ n: 4 })).toBe('low');
    expect(confidenceFromEvidence({ n: 5 })).toBe('medium');
    expect(confidenceFromEvidence({ n: 25 })).toBe('high');
  });

  it('downgrades one step when evidence is stale', () => {
    expect(confidenceFromEvidence({ n: 25, freshnessDays: 400, maxFreshnessDays: 180 })).toBe('medium');
    expect(confidenceFromEvidence({ n: 8, freshnessDays: 400, maxFreshnessDays: 180 })).toBe('low');
    // fresh -> not downgraded
    expect(confidenceFromEvidence({ n: 25, freshnessDays: 10 })).toBe('high');
  });
});

describe('buildHonestyEnvelope', () => {
  it('labels insufficient data explicitly at n=0', () => {
    const e = buildHonestyEnvelope({ n: 0 });
    expect(e.confidence).toBe('low');
    expect(e.label).toMatch(/insufficient data/i);
  });

  it('produces a denominator+freshness label', () => {
    const e = buildHonestyEnvelope({ n: 28, freshnessDays: 6 });
    expect(e.label).toBe('confidence: high (n=28, freshness: 6 days ago)');
    expect(e.stale).toBe(false);
  });

  it('marks stale evidence in the label and downgrades', () => {
    const e = buildHonestyEnvelope({ n: 28, freshnessDays: 400, maxFreshnessDays: 180 });
    expect(e.stale).toBe(true);
    expect(e.confidence).toBe('medium');
    expect(e.label).toContain('STALE');
  });

  it('says "today" for zero-day freshness', () => {
    expect(buildHonestyEnvelope({ n: 10, freshnessDays: 0 }).label).toContain('freshness: today');
  });
});

describe('finalReadyGate', () => {
  it('is ready when all dependencies are present and fresh', () => {
    const r = finalReadyGate([
      { name: 'CMC data', present: true, freshnessDays: 10 },
      { name: 'Clinical summary', present: true },
    ]);
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks and lists missing and stale dependencies', () => {
    const r = finalReadyGate(
      [
        { name: 'CMC data', present: false },
        { name: 'Stability', present: true, freshnessDays: 400 },
        { name: 'Clinical', present: true, freshnessDays: 5 },
      ],
      180
    );
    expect(r.ready).toBe(false);
    expect(r.blockers).toHaveLength(2);
    expect(r.blockers.join(' ')).toMatch(/CMC data: missing/);
    expect(r.blockers.join(' ')).toMatch(/Stability: stale/);
  });
});
