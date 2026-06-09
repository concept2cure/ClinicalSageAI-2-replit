/**
 * ICH Guideline Corpus — the citable index must be internally consistent
 * (unique codes, valid categories, lookups resolve), searchable by topic and by
 * code, cover all four ICH families, and every rendered block must carry the
 * "verify the current revision on ich.org" honesty caveat (no fabricated
 * currency of revision status).
 */

import { describe, it, expect } from 'vitest';
import {
  ICH_GUIDELINES,
  ICH_IMPLEMENTING_REGULATORS,
  getGuideline,
  guidelinesByCategory,
  guidelinesForSegment,
  searchGuidelines,
  buildIchGuidelineBlock,
  ichCorpusSummary,
  type IchCategory,
} from '../ich-guideline-corpus';

const CATEGORIES: IchCategory[] = ['quality', 'safety', 'efficacy', 'multidisciplinary'];

describe('ICH guideline corpus — integrity', () => {
  it('has a meaningful number of guidelines across all four families', () => {
    expect(ICH_GUIDELINES.length).toBeGreaterThanOrEqual(40);
    for (const c of CATEGORIES) {
      expect(guidelinesByCategory(c).length).toBeGreaterThan(0);
    }
  });

  it('every code is unique', () => {
    const codes = ICH_GUIDELINES.map(g => g.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every entry is well-formed (code, title, summary, valid category, keywords)', () => {
    for (const g of ICH_GUIDELINES) {
      expect(g.code.trim().length).toBeGreaterThan(0);
      expect(g.title.trim().length).toBeGreaterThan(0);
      expect(g.summary.trim().length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(g.category);
      expect(g.keywords.length).toBeGreaterThan(0);
      expect(g.appliesTo.length).toBeGreaterThan(0);
    }
  });

  it('summary reflects global, multi-regulator adoption', () => {
    expect(ICH_IMPLEMENTING_REGULATORS.length).toBeGreaterThanOrEqual(10);
    const codes = ICH_IMPLEMENTING_REGULATORS.map(r => r.code);
    expect(codes).toContain('FDA');
    expect(codes).toContain('EMA');
    expect(codes).toContain('PMDA/MHLW');
  });
});

describe('ICH guideline corpus — lookups', () => {
  it('resolves a known code exactly (case-insensitive)', () => {
    expect(getGuideline('E6(R3)')?.topic).toBe('GCP');
    expect(getGuideline('e6(r3)')?.code).toBe('E6(R3)');
    expect(getGuideline('M4')?.title).toMatch(/Common Technical Document/i);
  });

  it('returns undefined for an unknown code (no fabrication)', () => {
    expect(getGuideline('Z99(R9)')).toBeUndefined();
  });

  it('searches by topic keyword', () => {
    const stability = searchGuidelines('stability');
    expect(stability.some(g => g.code.startsWith('Q1'))).toBe(true);

    const estimand = searchGuidelines('estimand');
    expect(estimand.some(g => g.code === 'E9(R1)')).toBe(true);

    const nitros = searchGuidelines('nitrosamine');
    expect(nitros.some(g => g.code === 'M7(R2)')).toBe(true);
  });

  it('searches by a bare family-code prefix', () => {
    const e6 = searchGuidelines('E6');
    expect(e6[0].code).toBe('E6(R3)');
  });

  it('filters by segment', () => {
    const biotech = guidelinesForSegment('biotech');
    expect(biotech.some(g => g.code === 'Q5E')).toBe(true); // comparability
    expect(biotech.every(g => g.appliesTo.includes('biotech'))).toBe(true);
  });
});

describe('ICH guideline corpus — rendered block', () => {
  it('renders specific matches with codes and the verify caveat', () => {
    const block = buildIchGuidelineBlock({ message: 'comparability after a manufacturing change' });
    expect(block).toMatch(/ICH Q5E/);
    expect(block).toMatch(/ich\.org/);
  });

  it('renders a family overview when nothing matches, still with the caveat', () => {
    const block = buildIchGuidelineBlock({ message: 'zzzznomatch' });
    expect(block).toMatch(/Quality \(Q1–Q14\)/);
    expect(block).toMatch(/Efficacy/);
    expect(block).toMatch(/ich\.org/);
  });

  it('never omits the honesty caveat', () => {
    for (const msg of ['stability', 'gcp', '', 'qt prolongation', 'random']) {
      expect(buildIchGuidelineBlock({ message: msg })).toContain('ich.org');
    }
  });
});

describe('ICH guideline corpus — summary', () => {
  it('reports totals consistent with the corpus', () => {
    const s = ichCorpusSummary();
    expect(s.total).toBe(ICH_GUIDELINES.length);
    expect(s.byCategory.quality + s.byCategory.safety + s.byCategory.efficacy + s.byCategory.multidisciplinary).toBe(s.total);
    expect(s.implementingRegulators).toBe(ICH_IMPLEMENTING_REGULATORS.length);
  });
});
