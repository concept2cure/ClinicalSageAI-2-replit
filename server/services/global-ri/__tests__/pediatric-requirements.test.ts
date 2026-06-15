/**
 * Pediatric study-plan obligations expert — iPSP / PIP duty per market.
 */

import { describe, it, expect } from 'vitest';
import {
  getPediatricObligation,
  assessPediatricPlan,
  PEDIATRIC_MARKETS,
  type PediatricMarket,
} from '../pediatric-requirements';

describe('pediatric obligation catalog', () => {
  it('models program + citation for every market', () => {
    for (const m of PEDIATRIC_MARKETS) {
      const ref = getPediatricObligation(m);
      expect(ref.program).toBeTruthy();
      expect(ref.instrument).toBeTruthy();
      expect(ref.timing).toBeTruthy();
      expect(ref.planName).toBeTruthy();
      expect(ref.citation).toBeTruthy();
      expect(Array.isArray(ref.waiverOptions)).toBe(true);
      expect(typeof ref.deferralAvailable).toBe('boolean');
    }
  });

  it('exposes exactly the three modeled markets', () => {
    expect(PEDIATRIC_MARKETS).toEqual(['FDA', 'EMA', 'PMDA']);
  });

  it('throws for an unmodeled market in getPediatricObligation', () => {
    expect(() => getPediatricObligation('XYZ' as PediatricMarket)).toThrow();
  });
});

describe('assessPediatricPlan — FDA (PREA / iPSP)', () => {
  it('plan outstanding when nothing has been submitted', () => {
    const r = assessPediatricPlan({ market: 'FDA' });
    expect(r.required).toBe(true);
    expect(r.status).toBe('plan_outstanding');
    expect(r.planName).toContain('iPSP');
    expect(r.dueTiming).toContain('end-of-Phase-2');
    expect(r.actions.length).toBeGreaterThan(0);
  });

  it('satisfied when the iPSP has been submitted', () => {
    const r = assessPediatricPlan({ market: 'FDA', planSubmitted: true });
    expect(r.status).toBe('satisfied');
    expect(r.required).toBe(true);
  });

  it('waiver/deferral pending when a waiver is requested', () => {
    const r = assessPediatricPlan({ market: 'FDA', waiverRequested: true });
    expect(r.status).toBe('waiver_or_deferral_pending');
  });

  it('waiver/deferral pending when a deferral is requested', () => {
    const r = assessPediatricPlan({ market: 'FDA', deferralRequested: true });
    expect(r.status).toBe('waiver_or_deferral_pending');
  });

  it('not_applicable when the application does not trigger the requirement', () => {
    const r = assessPediatricPlan({ market: 'FDA', triggersRequirement: false });
    expect(r.required).toBe(false);
    expect(r.status).toBe('not_applicable');
  });
});

describe('assessPediatricPlan — EMA (PIP)', () => {
  it('PIP required with timing referencing pharmacokinetic / Phase 1', () => {
    const r = assessPediatricPlan({ market: 'EMA' });
    expect(r.required).toBe(true);
    expect(r.status).toBe('plan_outstanding');
    expect(r.planName).toContain('PIP');
    expect(r.dueTiming.toLowerCase()).toContain('pharmacokinetic');
    expect(r.dueTiming).toContain('Phase 1');
  });

  it('satisfied when the PIP has been agreed/submitted', () => {
    const r = assessPediatricPlan({ market: 'EMA', planSubmitted: true });
    expect(r.status).toBe('satisfied');
  });
});

describe('assessPediatricPlan — PMDA', () => {
  it('not required / not_applicable with an explanatory note', () => {
    const r = assessPediatricPlan({ market: 'PMDA' });
    expect(r.required).toBe(false);
    expect(r.status).toBe('not_applicable');
    expect(r.notes.some((n) => /encouraged/i.test(n))).toBe(true);
  });
});

describe('assessPediatricPlan — errors + determinism', () => {
  it('throws for an unmodeled market', () => {
    expect(() => assessPediatricPlan({ market: 'XYZ' as PediatricMarket })).toThrow();
  });

  it('is deterministic for the same input', () => {
    const input = { market: 'FDA' as PediatricMarket, waiverRequested: true };
    expect(assessPediatricPlan(input)).toEqual(assessPediatricPlan(input));
  });

  it('produces sorted actions and notes', () => {
    const r = assessPediatricPlan({ market: 'EMA' });
    const sortedActions = [...r.actions].sort((a, b) => a.localeCompare(b));
    const sortedNotes = [...r.notes].sort((a, b) => a.localeCompare(b));
    expect(r.actions).toEqual(sortedActions);
    expect(r.notes).toEqual(sortedNotes);
  });
});
