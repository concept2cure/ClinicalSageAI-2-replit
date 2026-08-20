/**
 * Regional Module 1 requirements expert — per-market required components and the
 * readiness assessment (missing/extra components, unknown market).
 */

import { describe, it, expect } from 'vitest';
import {
  assessRegionalModule1,
  getRegionalModule1Requirements,
  REGIONAL_MODULE1_REQUIREMENTS,
  type RegulatoryMarket,
} from '../regional-module1-requirements';

const ALL_MARKETS: RegulatoryMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA', 'TGA', 'SWISSMEDIC', 'NMPA'];

/** All required component codes for a market. */
const allCodes = (m: RegulatoryMarket) => REGIONAL_MODULE1_REQUIREMENTS[m].map((c) => c.code);

describe('REGIONAL_MODULE1_REQUIREMENTS', () => {
  it('models every market with a non-empty, well-formed component set', () => {
    for (const m of ALL_MARKETS) {
      const reqs = getRegionalModule1Requirements(m);
      expect(reqs.length).toBeGreaterThan(0);
      for (const c of reqs) {
        expect(c.code).toBeTruthy();
        expect(c.label).toBeTruthy();
        expect(c.section.startsWith('m1')).toBe(true);
      }
    }
  });

  it('uses unique component codes within each market', () => {
    for (const m of ALL_MARKETS) {
      const codes = allCodes(m);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe('assessRegionalModule1', () => {
  it('ready when all required components are provided (every market)', () => {
    for (const m of ALL_MARKETS) {
      const res = assessRegionalModule1({ market: m, providedComponents: allCodes(m) });
      expect(res.ready).toBe(true);
      expect(res.missing).toEqual([]);
      expect(res.counts.errors).toBe(0);
    }
  });

  it('flags each missing required component as a blocking error', () => {
    const codes = allCodes('FDA');
    const res = assessRegionalModule1({ market: 'FDA', providedComponents: codes.slice(1) }); // drop one
    expect(res.ready).toBe(false);
    expect(res.missing).toContain(codes[0]);
    expect(res.findings.some((f) => f.code === 'MISSING_COMPONENT' && f.component === codes[0])).toBe(true);
  });

  it('warns (non-blocking) on an unrecognized provided component', () => {
    const res = assessRegionalModule1({ market: 'EMA', providedComponents: [...allCodes('EMA'), 'eu_made_up'] });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'EXTRA_COMPONENT' && f.component === 'eu_made_up')).toBe(true);
  });

  it('errors on an unknown market', () => {
    const res = assessRegionalModule1({ market: 'XYZ' as RegulatoryMarket, providedComponents: [] });
    expect(res.ready).toBe(false);
    expect(res.findings[0].code).toBe('UNKNOWN_MARKET');
  });

  it('the FDA set requires the 356h application form and the 3674 certification', () => {
    const codes = allCodes('FDA');
    expect(codes).toContain('us_356h');
    expect(codes).toContain('us_3674');
  });

  it('the EMA set requires the eAF and the environmental risk assessment', () => {
    const codes = allCodes('EMA');
    expect(codes).toContain('eu_eaf');
    expect(codes).toContain('eu_era');
  });
});
