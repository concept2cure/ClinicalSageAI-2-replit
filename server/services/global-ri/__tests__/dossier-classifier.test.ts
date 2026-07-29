/**
 * Marketing-application legal-basis / dossier-type classifier — FDA & EU.
 *
 * Validates that classifyDossier maps a product's situation to the correct
 * legal basis per region, that every classification carries a usable data
 * package, and that the reference catalog (getLegalBases) is complete.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDossier,
  getLegalBases,
  type DossierClassifierInput,
  type DossierRegion,
} from '../dossier-classifier';

function classify(extra: Omit<DossierClassifierInput, 'region'>, region: DossierRegion) {
  return classifyDossier({ region, ...extra });
}

describe('classifyDossier — FDA', () => {
  it('{} → 505(b)(1) full NDA', () => {
    const r = classify({}, 'FDA');
    expect(r.legalBasis).toBe('505(b)(1)');
    expect(r.dossierType).toContain('New Drug Application');
  });

  it('{reliesOnOthersData} → 505(b)(2)', () => {
    expect(classify({ reliesOnOthersData: true }, 'FDA').legalBasis).toBe('505(b)(2)');
  });

  it('{referencesApprovedProduct} → 505(j) ANDA', () => {
    expect(classify({ referencesApprovedProduct: true }, 'FDA').legalBasis).toBe('505(j)');
  });

  it('{referencesApprovedProduct, differsFromReference} → 505(b)(2)', () => {
    expect(
      classify({ referencesApprovedProduct: true, differsFromReference: true }, 'FDA').legalBasis,
    ).toBe('505(b)(2)');
  });

  it('{isBiologic} → 351(a) standalone BLA', () => {
    const r = classify({ isBiologic: true }, 'FDA');
    expect(r.legalBasis).toBe('351(a)');
    expect(r.dossierType).toContain('Biologics License Application');
  });

  it('{isBiologic, referencesApprovedProduct} → 351(k) biosimilar', () => {
    const r = classify({ isBiologic: true, referencesApprovedProduct: true }, 'FDA');
    expect(r.legalBasis).toBe('351(k)');
    expect(r.dossierType).toContain('Biosimilar');
  });

  it('biologic route takes precedence over generic/505(b)(2) flags', () => {
    // A biologic referencing an approved product is 351(k), never 505(j).
    expect(
      classify({ isBiologic: true, referencesApprovedProduct: true, differsFromReference: true }, 'FDA')
        .legalBasis,
    ).toBe('351(k)');
  });
});

describe('classifyDossier — EU', () => {
  it('{} → Article 8(3) full', () => {
    expect(classify({}, 'EU').legalBasis).toBe('Article 8(3)');
  });

  it('{referencesApprovedProduct} → Article 10(1) generic', () => {
    expect(classify({ referencesApprovedProduct: true }, 'EU').legalBasis).toBe('Article 10(1)');
  });

  it('{referencesApprovedProduct, differsFromReference} → Article 10(3) hybrid', () => {
    expect(
      classify({ referencesApprovedProduct: true, differsFromReference: true }, 'EU').legalBasis,
    ).toBe('Article 10(3)');
  });

  it('{isBiologic, referencesApprovedProduct} → Article 10(4) biosimilar', () => {
    expect(
      classify({ isBiologic: true, referencesApprovedProduct: true }, 'EU').legalBasis,
    ).toBe('Article 10(4)');
  });

  it('{wellEstablishedUse} → Article 10a', () => {
    expect(classify({ wellEstablishedUse: true }, 'EU').legalBasis).toBe('Article 10a');
  });

  it('{fixedCombination} → Article 10b', () => {
    expect(classify({ fixedCombination: true }, 'EU').legalBasis).toBe('Article 10b');
  });

  it('{informedConsent} → Article 10c', () => {
    expect(classify({ informedConsent: true }, 'EU').legalBasis).toBe('Article 10c');
  });
});

describe('every classification is complete', () => {
  const cases: Array<[DossierRegion, Omit<DossierClassifierInput, 'region'>]> = [
    ['FDA', {}],
    ['FDA', { reliesOnOthersData: true }],
    ['FDA', { referencesApprovedProduct: true }],
    ['FDA', { referencesApprovedProduct: true, differsFromReference: true }],
    ['FDA', { isBiologic: true }],
    ['FDA', { isBiologic: true, referencesApprovedProduct: true }],
    ['EU', {}],
    ['EU', { referencesApprovedProduct: true }],
    ['EU', { referencesApprovedProduct: true, differsFromReference: true }],
    ['EU', { isBiologic: true, referencesApprovedProduct: true }],
    ['EU', { wellEstablishedUse: true }],
    ['EU', { fixedCombination: true }],
    ['EU', { informedConsent: true }],
  ];

  it.each(cases)('%s %o has citation, dossierType, permits, and data requirements', (region, extra) => {
    const r = classify(extra, region);
    expect(r.region).toBe(region);
    expect(r.legalBasis).toBeTruthy();
    expect(r.dossierType).toBeTruthy();
    expect(r.permits).toBeTruthy();
    expect(r.citation).toBeTruthy();
    expect(Array.isArray(r.dataRequirements)).toBe(true);
    expect(r.dataRequirements.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(r.notes)).toBe(true);
    expect(r.notes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getLegalBases — reference catalog', () => {
  it('FDA catalog is non-empty and well-formed', () => {
    const bases = getLegalBases('FDA');
    expect(bases).not.toBeNull();
    expect(bases!.length).toBeGreaterThan(0);
    for (const b of bases!) {
      expect(b.legalBasis).toBeTruthy();
      expect(b.dossierType).toBeTruthy();
      expect(b.citation).toBeTruthy();
    }
  });

  it('EU catalog is non-empty and well-formed', () => {
    const bases = getLegalBases('EU');
    expect(bases).not.toBeNull();
    expect(bases!.length).toBeGreaterThan(0);
    for (const b of bases!) {
      expect(b.legalBasis).toBeTruthy();
      expect(b.dossierType).toBeTruthy();
      expect(b.citation).toBeTruthy();
    }
  });

  it('returns null for an unmodeled region', () => {
    expect(getLegalBases('XX' as DossierRegion)).toBeNull();
  });

  it("FDA catalog covers the routes the classifier can return", () => {
    const codes = getLegalBases('FDA')!.map((b) => b.legalBasis);
    for (const code of ['505(b)(1)', '505(b)(2)', '505(j)', '351(a)', '351(k)']) {
      expect(codes).toContain(code);
    }
  });

  it('EU catalog covers the routes the classifier can return', () => {
    const codes = getLegalBases('EU')!.map((b) => b.legalBasis);
    for (const code of [
      'Article 8(3)',
      'Article 10(1)',
      'Article 10(3)',
      'Article 10(4)',
      'Article 10a',
      'Article 10b',
      'Article 10c',
    ]) {
      expect(codes).toContain(code);
    }
  });
});

describe('classifyDossier — errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() => classifyDossier({ region: 'PMDA' as DossierRegion })).toThrow();
  });

  it('is deterministic', () => {
    const input: DossierClassifierInput = {
      region: 'FDA',
      referencesApprovedProduct: true,
      differsFromReference: true,
    };
    expect(classifyDossier(input)).toEqual(classifyDossier(input));
  });
});
