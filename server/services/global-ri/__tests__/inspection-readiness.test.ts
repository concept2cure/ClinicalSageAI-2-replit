/**
 * Pre-approval / GMP / clinical inspection readiness expert — per market.
 */

import { describe, it, expect } from 'vitest';
import {
  getInspectionProfile,
  getReadinessDomains,
  assessInspectionReadiness,
  INSPECTION_MARKETS,
  type InspectionMarket,
} from '../inspection-readiness';

describe('inspection profile catalog', () => {
  it('is complete for all 4 markets', () => {
    expect(INSPECTION_MARKETS).toEqual(['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA']);
    for (const m of INSPECTION_MARKETS) {
      const profile = getInspectionProfile(m);
      expect(profile.market).toBe(m);
      expect(profile.inspectionTypes.length).toBeGreaterThan(0);
      for (const t of profile.inspectionTypes) {
        expect(t.name).toBeTruthy();
        expect(t.scope).toBeTruthy();
        expect(t.citation).toBeTruthy();
      }
      expect(profile.readinessDomains.length).toBeGreaterThan(0);
      for (const d of profile.readinessDomains) {
        expect(d.id).toBeTruthy();
        expect(d.title).toBeTruthy();
        expect(d.description).toBeTruthy();
        expect(d.citation).toBeTruthy();
      }
    }
  });

  it('FDA includes a PAI inspection type and bimo_gcp / data_integrity domains', () => {
    const profile = getInspectionProfile('FDA');
    expect(profile.inspectionTypes.some((t) => t.name.includes('PAI'))).toBe(true);
    const ids = profile.readinessDomains.map((d) => d.id);
    expect(ids).toContain('bimo_gcp');
    expect(ids).toContain('data_integrity');
  });

  it('the data_integrity domain description mentions ALCOA', () => {
    for (const m of INSPECTION_MARKETS) {
      const di = getInspectionProfile(m).readinessDomains.find((d) => d.id === 'data_integrity')!;
      expect(di.description).toContain('ALCOA');
    }
  });
});

describe('getReadinessDomains', () => {
  it('returns the domain ids for a modeled market', () => {
    const ids = getReadinessDomains('FDA');
    expect(ids).toContain('facility_gmp');
    expect(ids).toContain('supplier_qualification');
    expect(ids).toContain('process_validation');
  });

  it('returns [] for an unmodeled market', () => {
    expect(getReadinessDomains('XYZ' as InspectionMarket)).toEqual([]);
  });
});

describe('assessInspectionReadiness', () => {
  it('ready=false with correct missing[] when a domain is omitted', () => {
    const all = getReadinessDomains('FDA');
    const provided = all.filter((id) => id !== 'data_integrity');
    const r = assessInspectionReadiness({ market: 'FDA', providedDomains: provided });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['data_integrity']);
    expect(r.provided).toEqual(provided);
    expect(r.coverage).toBeLessThan(1);
  });

  it('ready=true and coverage=1 when all domains provided', () => {
    const all = getReadinessDomains('EMA');
    const r = assessInspectionReadiness({ market: 'EMA', providedDomains: all });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it('partial coverage is strictly between 0 and 1', () => {
    const all = getReadinessDomains('PMDA');
    const half = all.slice(0, Math.floor(all.length / 2));
    const r = assessInspectionReadiness({ market: 'PMDA', providedDomains: half });
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
    // 2-decimal rounded
    expect(Number(r.coverage.toFixed(2))).toBe(r.coverage);
  });

  it('coverage=0 when nothing provided', () => {
    const r = assessInspectionReadiness({ market: 'HEALTH_CANADA', providedDomains: [] });
    expect(r.coverage).toBe(0);
    expect(r.ready).toBe(false);
  });

  it('carries the honest caveat in notes', () => {
    const r = assessInspectionReadiness({ market: 'FDA', providedDomains: getReadinessDomains('FDA') });
    expect(r.notes.some((n) => n.toLowerCase().includes('authoritative'))).toBe(true);
  });
});

describe('errors + determinism', () => {
  it('getInspectionProfile throws for an unmodeled market', () => {
    expect(() => getInspectionProfile('XYZ' as InspectionMarket)).toThrow();
  });

  it('assessInspectionReadiness throws for an unmodeled market', () => {
    expect(() =>
      assessInspectionReadiness({ market: 'XYZ' as InspectionMarket, providedDomains: [] }),
    ).toThrow();
  });

  it('is deterministic', () => {
    const all = getReadinessDomains('FDA');
    expect(assessInspectionReadiness({ market: 'FDA', providedDomains: all })).toEqual(
      assessInspectionReadiness({ market: 'FDA', providedDomains: all }),
    );
    expect(getInspectionProfile('EMA')).toEqual(getInspectionProfile('EMA'));
  });
});
