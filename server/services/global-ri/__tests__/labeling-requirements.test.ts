/**
 * Cross-market product-labeling requirements expert — per-market required
 * sections and the readiness assessment (missing/extra sections, unknown market).
 */

import { describe, it, expect } from 'vitest';
import {
  assessLabeling,
  getLabelingRequirements,
  LABELING_REQUIREMENTS,
  type LabelMarket,
} from '../labeling-requirements';

const ALL_MARKETS: LabelMarket[] = ['FDA', 'EMA', 'PMDA'];

/** All required section codes for a market. */
const allCodes = (m: LabelMarket) => LABELING_REQUIREMENTS[m].map((s) => s.code);

describe('LABELING_REQUIREMENTS', () => {
  it('models every market with a non-empty, well-formed section set', () => {
    for (const m of ALL_MARKETS) {
      const reqs = getLabelingRequirements(m);
      expect(reqs.length).toBeGreaterThan(0);
      for (const s of reqs) {
        expect(s.code).toBeTruthy();
        expect(s.title).toBeTruthy();
      }
    }
  });

  it('uses unique section codes within each market', () => {
    for (const m of ALL_MARKETS) {
      const codes = allCodes(m);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('models the expected core sections per market', () => {
    expect(allCodes('FDA')).toContain('us_indications_usage');
    expect(allCodes('FDA')).toContain('us_patient_counseling');
    expect(allCodes('EMA')).toContain('eu_4_1_indications');
    expect(allCodes('EMA')).toContain('eu_10_date_revision');
    expect(allCodes('PMDA')).toContain('jp_warnings');
    expect(allCodes('PMDA')).toContain('jp_approval_conditions');
  });
});

describe('assessLabeling', () => {
  it('ready when all required sections are provided (every market)', () => {
    for (const m of ALL_MARKETS) {
      const res = assessLabeling({ market: m, providedSections: allCodes(m) });
      expect(res.ready).toBe(true);
      expect(res.missing).toEqual([]);
      expect(res.counts.errors).toBe(0);
    }
  });

  it('flags a missing required FDA section (Indications and Usage) as a blocking error', () => {
    const provided = allCodes('FDA').filter((c) => c !== 'us_indications_usage');
    const res = assessLabeling({ market: 'FDA', providedSections: provided });
    expect(res.ready).toBe(false);
    expect(res.missing).toContain('us_indications_usage');
    expect(res.findings.some((f) => f.code === 'MISSING_SECTION' && f.section === 'us_indications_usage')).toBe(true);
    expect(res.counts.errors).toBe(1);
  });

  it('warns (non-blocking) on an unrecognized provided section', () => {
    const res = assessLabeling({ market: 'EMA', providedSections: [...allCodes('EMA'), 'eu_made_up'] });
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'EXTRA_SECTION' && f.section === 'eu_made_up')).toBe(true);
    expect(res.counts.errors).toBe(0);
  });

  it('errors on an unknown market', () => {
    const res = assessLabeling({ market: 'XYZ' as LabelMarket, providedSections: [] });
    expect(res.ready).toBe(false);
    expect(res.findings[0].code).toBe('UNKNOWN_MARKET');
    expect(res.required).toEqual([]);
  });

  it('sorts findings by section then severity (errors before warnings)', () => {
    const res = assessLabeling({ market: 'PMDA', providedSections: ['zzz_extra'] });
    const sections = res.findings.map((f) => f.section ?? '');
    const sorted = [...sections].sort((a, b) => a.localeCompare(b));
    expect(sections).toEqual(sorted);
    // every required section missing + one extra
    expect(res.counts.errors).toBe(allCodes('PMDA').length);
    expect(res.counts.warnings).toBe(1);
  });
});
