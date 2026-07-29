/**
 * CMC specifications expert tests — ICH Q6A (chemical) & Q6B (biological).
 */

import { describe, it, expect } from 'vitest';
import {
  getUniversalTests,
  getSpecificationTests,
  SPEC_PRODUCT_TYPES,
  SPEC_DOSAGE_FORMS,
  type SpecProductType,
  type SpecDosageForm,
} from '../cmc-specifications';

const ids = (tests: { id: string }[]) => tests.map((t) => t.id);

describe('getUniversalTests', () => {
  it('small_molecule includes assay, impurities, identification (Q6A)', () => {
    const r = getUniversalTests('small_molecule');
    const got = ids(r.tests);
    expect(got).toContain('assay');
    expect(got).toContain('impurities');
    expect(got).toContain('identification');
    expect(got).toContain('description');
    expect(r.citation).toBe('ICH Q6A');
    for (const t of r.tests) expect(t.citation).toBe('ICH Q6A');
  });

  it('biologic includes potency and identity (Q6B) with citation', () => {
    const r = getUniversalTests('biologic');
    const got = ids(r.tests);
    expect(got).toContain('potency');
    expect(got).toContain('identity');
    expect(got).toContain('purity_and_impurities');
    expect(r.citation).toBe('ICH Q6B');
    for (const t of r.tests) {
      expect(t.citation).toBe('ICH Q6B');
      expect(t.title).toBeTruthy();
    }
  });

  it('every modeled product type yields tests + notes', () => {
    for (const pt of SPEC_PRODUCT_TYPES) {
      const r = getUniversalTests(pt);
      expect(r.tests.length).toBeGreaterThan(0);
      expect(r.notes.length).toBeGreaterThan(0);
      expect(r.productType).toBe(pt);
    }
  });

  it('throws for an unmodeled product type', () => {
    expect(() => getUniversalTests('herbal' as SpecProductType)).toThrow();
  });
});

describe('getSpecificationTests — small_molecule dosage forms', () => {
  it('solid_oral includes dissolution + uniformity of dosage units', () => {
    const r = getSpecificationTests({ productType: 'small_molecule', dosageForm: 'solid_oral' });
    const dfIds = ids(r.dosageFormTests);
    expect(dfIds).toContain('dissolution');
    expect(dfIds).toContain('uniformity_of_dosage_units');
    expect(r.dosageForm).toBe('solid_oral');
    // universal tests still present
    expect(ids(r.universalTests)).toContain('assay');
  });

  it('parenteral includes sterility + endotoxins', () => {
    const r = getSpecificationTests({ productType: 'small_molecule', dosageForm: 'parenteral' });
    const dfIds = ids(r.dosageFormTests);
    expect(dfIds).toContain('sterility');
    expect(dfIds).toContain('endotoxins_pyrogens');
  });

  it('oral_liquid includes pH + antimicrobial preservative content', () => {
    const r = getSpecificationTests({ productType: 'small_molecule', dosageForm: 'oral_liquid' });
    const dfIds = ids(r.dosageFormTests);
    expect(dfIds).toContain('ph');
    expect(dfIds).toContain('antimicrobial_preservative_content');
  });

  it('no dosageForm → empty dosage-form list (drug-substance view) and null dosageForm', () => {
    const r = getSpecificationTests({ productType: 'small_molecule' });
    expect(r.dosageFormTests).toEqual([]);
    expect(r.dosageForm).toBeNull();
    expect(ids(r.universalTests)).toContain('impurities');
  });
});

describe('getSpecificationTests — biologic', () => {
  it('returns Q6B-based universal tests (potency)', () => {
    const r = getSpecificationTests({ productType: 'biologic' });
    expect(ids(r.universalTests)).toContain('potency');
    expect(r.citation).toBe('ICH Q6B');
    expect(r.dosageFormTests).toEqual([]);
  });

  it('parenteral biologic gets the parenteral (sterility) test set', () => {
    const r = getSpecificationTests({ productType: 'biologic', dosageForm: 'parenteral' });
    expect(ids(r.dosageFormTests)).toContain('sterility');
  });

  it('non-parenteral biologic form yields empty dosage-form set + a clarifying note', () => {
    const r = getSpecificationTests({ productType: 'biologic', dosageForm: 'solid_oral' });
    expect(r.dosageFormTests).toEqual([]);
    expect(r.notes.some((n) => n.toLowerCase().includes('parenteral'))).toBe(true);
  });
});

describe('getSpecificationTests — errors + determinism', () => {
  it('throws for an unmodeled product type', () => {
    expect(() =>
      getSpecificationTests({ productType: 'device' as SpecProductType }),
    ).toThrow();
  });

  it('throws for an unknown dosage form', () => {
    expect(() =>
      getSpecificationTests({
        productType: 'small_molecule',
        dosageForm: 'topical' as SpecDosageForm,
      }),
    ).toThrow();
  });

  it('models the documented dosage-form constants', () => {
    expect(SPEC_DOSAGE_FORMS).toEqual(['solid_oral', 'oral_liquid', 'parenteral']);
    expect(SPEC_PRODUCT_TYPES).toEqual(['small_molecule', 'biologic']);
  });

  it('is deterministic', () => {
    expect(getSpecificationTests({ productType: 'small_molecule', dosageForm: 'solid_oral' })).toEqual(
      getSpecificationTests({ productType: 'small_molecule', dosageForm: 'solid_oral' }),
    );
  });
});
