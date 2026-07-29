/**
 * ICH guideline catalog — integrity + lookup / filter / search behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  ICH_GUIDELINES,
  getGuideline,
  guidelinesByCategory,
  searchGuidelines,
  listCategories,
  type GuidelineCategory,
} from '../ich-guideline-catalog';

const CATEGORIES: GuidelineCategory[] = ['Quality', 'Safety', 'Efficacy', 'Multidisciplinary'];

describe('ICH_GUIDELINES', () => {
  it('is non-empty with unique codes and valid categories', () => {
    expect(ICH_GUIDELINES.length).toBeGreaterThan(0);
    const codes = ICH_GUIDELINES.map((g) => g.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const g of ICH_GUIDELINES) {
      expect(CATEGORIES).toContain(g.category);
      expect(g.code).toBeTruthy();
      expect(g.title).toBeTruthy();
      expect(g.topic).toBeTruthy();
    }
  });
});

describe('listCategories', () => {
  it('returns exactly the 4 ICH categories', () => {
    expect(listCategories()).toEqual(CATEGORIES);
  });

  it('returns a fresh copy (not the internal array)', () => {
    const a = listCategories();
    a.pop();
    expect(listCategories()).toEqual(CATEGORIES);
  });
});

describe('getGuideline', () => {
  it("getGuideline('E6') returns Good Clinical Practice", () => {
    const g = getGuideline('E6');
    expect(g).toBeDefined();
    expect(g?.title).toBe('Good Clinical Practice');
    expect(g?.category).toBe('Efficacy');
  });

  it("is case-insensitive — getGuideline('e3') resolves", () => {
    const g = getGuideline('e3');
    expect(g).toBeDefined();
    expect(g?.code).toBe('E3');
  });

  it('returns undefined for an unknown code', () => {
    expect(getGuideline('Z99')).toBeUndefined();
  });
});

describe('guidelinesByCategory', () => {
  it('Efficacy results are all Efficacy and include E3 and E6', () => {
    const eff = guidelinesByCategory('Efficacy');
    expect(eff.length).toBeGreaterThan(0);
    for (const g of eff) expect(g.category).toBe('Efficacy');
    const codes = eff.map((g) => g.code);
    expect(codes).toContain('E3');
    expect(codes).toContain('E6');
  });

  it('every category is represented in the catalog', () => {
    for (const c of CATEGORIES) {
      expect(guidelinesByCategory(c).length).toBeGreaterThan(0);
    }
  });
});

describe('searchGuidelines', () => {
  it("'stability' finds Q1", () => {
    const codes = searchGuidelines('stability').map((g) => g.code);
    expect(codes).toContain('Q1');
  });

  it("'carcinogen' finds an S1 guideline", () => {
    const codes = searchGuidelines('carcinogen').map((g) => g.code);
    expect(codes.some((c) => c.startsWith('S1'))).toBe(true);
  });

  it('is case-insensitive and matches on code', () => {
    expect(searchGuidelines('e6').map((g) => g.code)).toContain('E6');
  });

  it('returns results ordered by code', () => {
    const results = searchGuidelines('impurit');
    const codes = results.map((g) => g.code);
    expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)));
  });

  it('returns an empty array for a blank query', () => {
    expect(searchGuidelines('   ')).toEqual([]);
  });
});

describe('determinism', () => {
  it('repeated calls return identical results', () => {
    expect(searchGuidelines('biotech')).toEqual(searchGuidelines('biotech'));
    expect(guidelinesByCategory('Quality')).toEqual(guidelinesByCategory('Quality'));
    expect(getGuideline('M4')).toEqual(getGuideline('m4'));
  });
});
