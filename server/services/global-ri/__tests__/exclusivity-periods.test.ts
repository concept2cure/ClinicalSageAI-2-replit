/**
 * Regulatory exclusivity & loss-of-exclusivity (LOE) expert — validity tests.
 *
 * Audits the statutory exclusivity periods, orphan/pediatric extensions, binding
 * selection, and the deterministic LOE date projection (incl. month-overflow
 * clamp) across FDA / EMA / PMDA.
 */

import { describe, it, expect } from 'vitest';
import {
  computeExclusivity,
  getExclusivityRules,
  PRODUCT_CLASSES,
  type ExclusivityMarket,
  type ProductClass,
} from '../exclusivity-periods';

describe('exclusivity rule catalog', () => {
  it('models every product class for every market', () => {
    const markets: ExclusivityMarket[] = ['FDA', 'EMA', 'PMDA'];
    for (const m of markets) {
      const rules = getExclusivityRules(m)!;
      expect(rules).toBeTruthy();
      for (const c of PRODUCT_CLASSES) {
        expect(rules.byClass[c]).toBeTruthy();
        expect(rules.byClass[c].type).toBeTruthy();
        expect(rules.byClass[c].citation).toBeTruthy();
        expect(typeof rules.byClass[c].baseMonths).toBe('number');
      }
      expect(rules.orphan.baseMonths).toBeGreaterThan(0);
    }
  });

  it('exposes the four modeled product classes', () => {
    expect(PRODUCT_CLASSES).toEqual([
      'new_chemical_entity',
      'biologic',
      'new_indication',
      'generic_or_biosimilar',
    ]);
  });

  it('returns null for an unmodeled market', () => {
    expect(getExclusivityRules('XYZ' as ExclusivityMarket)).toBeNull();
  });
});

describe('FDA exclusivity', () => {
  it('NCE binding is 60 months (5-year)', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'new_chemical_entity' });
    expect(r.bindingMonths).toBe(60);
    expect(r.bindingType).toContain('NCE');
    expect(r.components).toHaveLength(1);
  });

  it('NCE + orphan: binding becomes 84 months (7-year orphan) and orphan component present', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'new_chemical_entity', orphan: true });
    expect(r.bindingMonths).toBe(84);
    expect(r.bindingType).toContain('Orphan');
    expect(r.components.some((c) => c.type.includes('Orphan') && c.months === 84)).toBe(true);
  });

  it('biologic reference-product exclusivity is 144 months (12-year)', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'biologic' });
    expect(r.bindingMonths).toBe(144);
    expect(r.bindingType).toContain('Reference Product');
  });

  it('NCE + pediatric extension = 66 months (60 + 6)', () => {
    const r = computeExclusivity({
      market: 'FDA',
      productClass: 'new_chemical_entity',
      pediatricExtension: true,
    });
    expect(r.bindingMonths).toBe(66);
    expect(r.bindingType).toContain('pediatric extension');
    expect(r.components.some((c) => c.type === 'Pediatric extension' && c.months === 6)).toBe(true);
  });

  it('orphan + pediatric extension = 90 months (84 + 6, FDA applies to both)', () => {
    const r = computeExclusivity({
      market: 'FDA',
      productClass: 'new_chemical_entity',
      orphan: true,
      pediatricExtension: true,
    });
    expect(r.bindingMonths).toBe(90);
  });

  it('generic/biosimilar earns no originator exclusivity (baseMonths 0) with an explanatory note', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'generic_or_biosimilar' });
    expect(r.bindingMonths).toBe(0);
    expect(r.components[0].months).toBe(0);
    expect(r.notes.some((n) => n.toLowerCase().includes('does not earn originator exclusivity'))).toBe(true);
  });

  it('generic/biosimilar with no approval date yields a null LOE date', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'generic_or_biosimilar' });
    expect(r.lossOfExclusivityDate).toBeNull();
    expect(r.approvalDate).toBeNull();
  });
});

describe('EU (EMA) exclusivity', () => {
  it('NCE "8+2" binding is 120 months', () => {
    const r = computeExclusivity({ market: 'EMA', productClass: 'new_chemical_entity' });
    expect(r.bindingMonths).toBe(120);
    expect(r.bindingType).toContain('8+2');
  });

  it('NCE + orphan: still 120 months (tie) and orphan component present', () => {
    const r = computeExclusivity({ market: 'EMA', productClass: 'new_chemical_entity', orphan: true });
    expect(r.bindingMonths).toBe(120);
    expect(r.components.some((c) => c.type.includes('Orphan') && c.months === 120)).toBe(true);
  });

  it('orphan + pediatric extension = 144 months (120 + 24 PIP, orphan-only)', () => {
    const r = computeExclusivity({
      market: 'EMA',
      productClass: 'new_chemical_entity',
      orphan: true,
      pediatricExtension: true,
    });
    expect(r.bindingMonths).toBe(144);
    expect(r.components.some((c) => c.type === 'Pediatric extension' && c.months === 24)).toBe(true);
  });

  it('non-orphan + pediatric extension does NOT add to the binding (orphan-only in EU) but notes it', () => {
    const r = computeExclusivity({
      market: 'EMA',
      productClass: 'new_chemical_entity',
      pediatricExtension: true,
    });
    expect(r.bindingMonths).toBe(120);
    expect(r.notes.some((n) => n.includes('PIP') || n.includes('SPC'))).toBe(true);
  });

  it('biologic follows the same 8+2 regime (120 months)', () => {
    const r = computeExclusivity({ market: 'EMA', productClass: 'biologic' });
    expect(r.bindingMonths).toBe(120);
  });
});

describe('PMDA re-examination', () => {
  it('new active ingredient is 96 months (8-year)', () => {
    const r = computeExclusivity({ market: 'PMDA', productClass: 'new_chemical_entity' });
    expect(r.bindingMonths).toBe(96);
  });

  it('orphan re-examination is 120 months (10-year)', () => {
    const r = computeExclusivity({ market: 'PMDA', productClass: 'new_chemical_entity', orphan: true });
    expect(r.bindingMonths).toBe(120);
  });

  it('has no standardized pediatric extension (0 months) — binding unchanged', () => {
    const r = computeExclusivity({
      market: 'PMDA',
      productClass: 'new_chemical_entity',
      pediatricExtension: true,
    });
    expect(r.bindingMonths).toBe(96);
    expect(r.bindingType).not.toContain('pediatric');
  });
});

describe('LOE date projection (addMonths)', () => {
  it('approval 2026-01-15 + 60 months => 2031-01-15', () => {
    const r = computeExclusivity({
      market: 'FDA',
      productClass: 'new_chemical_entity',
      approvalDate: '2026-01-15',
    });
    expect(r.lossOfExclusivityDate).toBe('2031-01-15');
    expect(r.approvalDate).toBe('2026-01-15');
  });

  it('clamps month overflow: 2024-01-31 + 36 months stays at month end (2027-01-31)', () => {
    // new_indication FDA = 36 months; Jan 31 + 36 months = Jan 31 (no overflow).
    const r = computeExclusivity({
      market: 'FDA',
      productClass: 'new_indication',
      approvalDate: '2024-01-31',
    });
    expect(r.lossOfExclusivityDate).toBe('2027-01-31');
  });

  it('clamps month overflow when target month is shorter: 2024-01-31 + 12 months (EU +1 indication) => 2025-01-31', () => {
    const r = computeExclusivity({
      market: 'EMA',
      productClass: 'new_indication',
      approvalDate: '2024-01-31',
    });
    expect(r.lossOfExclusivityDate).toBe('2025-01-31');
  });

  it('clamps to a short month: PMDA new_indication 48mo from a Feb-29 leap date does not roll over', () => {
    // 2024-02-29 + 48 months = 2028-02 (also a leap year) => 2028-02-29.
    const r = computeExclusivity({
      market: 'PMDA',
      productClass: 'new_indication',
      approvalDate: '2024-02-29',
    });
    expect(r.lossOfExclusivityDate).toBe('2028-02-29');
  });

  it('clamps a leap-day approval into a non-leap target year (2024-02-29 + 12 => 2025-02-28)', () => {
    // EU +1 indication = 12 months; Feb 29 2024 + 12 months => Feb 2025 (28 days) => clamp to 28.
    const r = computeExclusivity({
      market: 'EMA',
      productClass: 'new_indication',
      approvalDate: '2024-02-29',
    });
    expect(r.lossOfExclusivityDate).toBe('2025-02-28');
  });

  it('zero-month class with an approval date returns the approval date as LOE', () => {
    const r = computeExclusivity({
      market: 'FDA',
      productClass: 'generic_or_biosimilar',
      approvalDate: '2026-03-10',
    });
    expect(r.lossOfExclusivityDate).toBe('2026-03-10');
  });

  it('rejects an invalid approval date', () => {
    expect(() =>
      computeExclusivity({
        market: 'FDA',
        productClass: 'new_chemical_entity',
        approvalDate: 'not-a-date',
      }),
    ).toThrow();
  });
});

describe('errors + determinism', () => {
  it('throws for an unmodeled market', () => {
    expect(() =>
      computeExclusivity({ market: 'XYZ' as ExclusivityMarket, productClass: 'new_chemical_entity' }),
    ).toThrow();
  });

  it('throws for an unknown product class', () => {
    expect(() =>
      computeExclusivity({ market: 'FDA', productClass: 'gizmo' as ProductClass }),
    ).toThrow();
  });

  it('is deterministic (same input twice => deep equal)', () => {
    const input = {
      market: 'EMA' as ExclusivityMarket,
      productClass: 'new_chemical_entity' as ProductClass,
      orphan: true,
      pediatricExtension: true,
      approvalDate: '2026-01-15',
    };
    expect(computeExclusivity(input)).toEqual(computeExclusivity(input));
  });
});
