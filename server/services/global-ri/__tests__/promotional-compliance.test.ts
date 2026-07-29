/**
 * Promotional compliance expert — prescription-medicine promotion & advertising.
 * Validates FDA (FD&C Act §502(n); 21 CFR 202.1; OPDP) and EU (Directive
 * 2001/83/EC Title VIII/VIIIa) rule sets and the readiness assessor.
 */

import { describe, it, expect } from 'vitest';
import {
  getPromotionalRules,
  getPromotionalRuleIds,
  assessPromotionalReadiness,
  PROMO_REGIONS,
  type PromoRegion,
} from '../promotional-compliance';

describe('PROMO_REGIONS', () => {
  it('models exactly FDA and EU', () => {
    expect(PROMO_REGIONS).toEqual(['FDA', 'EU']);
  });
});

describe('getPromotionalRules', () => {
  it('returns >=5 rules with citations for every modeled region', () => {
    for (const region of PROMO_REGIONS) {
      const set = getPromotionalRules(region);
      expect(set.region).toBe(region);
      expect(set.rules.length).toBeGreaterThanOrEqual(5);
      expect(set.citation).toBeTruthy();
      expect(set.notes.length).toBeGreaterThan(0);
      for (const rule of set.rules) {
        expect(rule.id).toBeTruthy();
        expect(rule.title).toBeTruthy();
        expect(rule.requirement).toBeTruthy();
        expect(rule.citation).toBeTruthy();
      }
    }
  });

  it('FDA includes fair_balance and no_off_label', () => {
    const ids = getPromotionalRules('FDA').rules.map((r) => r.id);
    expect(ids).toContain('fair_balance');
    expect(ids).toContain('no_off_label');
  });

  it('EU includes no_public_pom_advertising and smpc_consistency', () => {
    const ids = getPromotionalRules('EU').rules.map((r) => r.id);
    expect(ids).toContain('no_public_pom_advertising');
    expect(ids).toContain('smpc_consistency');
  });

  it('throws for an unmodeled region', () => {
    expect(() => getPromotionalRules('JP' as PromoRegion)).toThrow();
  });
});

describe('getPromotionalRuleIds', () => {
  it('returns the rule ids for a modeled region', () => {
    const ids = getPromotionalRuleIds('FDA');
    expect(ids).toEqual(getPromotionalRules('FDA').rules.map((r) => r.id));
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });

  it('returns [] for an unmodeled region', () => {
    expect(getPromotionalRuleIds('XYZ' as PromoRegion)).toEqual([]);
  });
});

describe('assessPromotionalReadiness', () => {
  it('ready=false with correct missing when a control is omitted', () => {
    const all = getPromotionalRuleIds('FDA');
    const omitted = 'no_off_label';
    const provided = all.filter((id) => id !== omitted);
    const r = assessPromotionalReadiness({ region: 'FDA', providedControls: provided });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([omitted]);
    expect(r.provided).toEqual(provided);
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBeGreaterThan(0);
  });

  it('ready=true with coverage 1 when all controls provided', () => {
    const all = getPromotionalRuleIds('EU');
    const r = assessPromotionalReadiness({ region: 'EU', providedControls: all });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it('partial coverage strictly between 0 and 1', () => {
    const all = getPromotionalRuleIds('FDA');
    const half = all.slice(0, Math.floor(all.length / 2));
    const r = assessPromotionalReadiness({ region: 'FDA', providedControls: half });
    expect(r.ready).toBe(false);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBe(Math.round((half.length / all.length) * 100) / 100);
  });

  it('coverage 0 with empty controls', () => {
    const r = assessPromotionalReadiness({ region: 'EU', providedControls: [] });
    expect(r.ready).toBe(false);
    expect(r.coverage).toBe(0);
    expect(r.missing).toEqual(getPromotionalRuleIds('EU'));
  });

  it('ignores unknown provided controls (no spurious coverage)', () => {
    const r = assessPromotionalReadiness({ region: 'FDA', providedControls: ['not_a_rule'] });
    expect(r.coverage).toBe(0);
    expect(r.provided).toEqual([]);
  });

  it('throws for an unmodeled region', () => {
    expect(() =>
      assessPromotionalReadiness({ region: 'JP' as PromoRegion, providedControls: [] }),
    ).toThrow();
  });
});

describe('determinism', () => {
  it('getPromotionalRules is deterministic', () => {
    expect(getPromotionalRules('FDA')).toEqual(getPromotionalRules('FDA'));
  });

  it('assessPromotionalReadiness is deterministic', () => {
    const provided = getPromotionalRuleIds('EU').slice(0, 3);
    expect(assessPromotionalReadiness({ region: 'EU', providedControls: provided })).toEqual(
      assessPromotionalReadiness({ region: 'EU', providedControls: provided }),
    );
  });
});
