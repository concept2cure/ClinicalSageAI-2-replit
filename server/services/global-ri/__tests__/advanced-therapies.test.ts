/**
 * Advanced-therapy (ATMP / cell & gene therapy / regenerative medicine) framework
 * & classification — tests.
 */

import { describe, it, expect } from 'vitest';
import {
  getAdvancedTherapyFramework,
  classifyAdvancedTherapy,
  ADVANCED_THERAPY_REGIONS,
  ATMP_MODALITIES,
  type AdvancedTherapyRegion,
  type AtmpModality,
} from '../advanced-therapies';

describe('getAdvancedTherapyFramework', () => {
  it('models every region with a truthy citation and classes', () => {
    for (const region of ADVANCED_THERAPY_REGIONS) {
      const f = getAdvancedTherapyFramework(region);
      expect(f.region).toBe(region);
      expect(f.citation).toBeTruthy();
      expect(f.category).toBeTruthy();
      expect(f.oversightBody).toBeTruthy();
      expect(f.marketingRoute).toBeTruthy();
      expect(f.expeditedOption).toBeTruthy();
      expect(f.classes.length).toBeGreaterThan(0);
      for (const c of f.classes) {
        expect(c.id).toBeTruthy();
        expect(c.name).toBeTruthy();
        expect(c.citation).toBeTruthy();
      }
      expect(f.notes.length).toBeGreaterThan(0);
    }
  });

  it('EU oversight mentions CAT and the route is centralised', () => {
    const f = getAdvancedTherapyFramework('EU');
    expect(f.oversightBody).toContain('CAT');
    expect(f.marketingRoute.toLowerCase()).toContain('centralised');
    expect(f.category).toContain('ATMP');
  });

  it('FDA framework mentions CBER and BLA', () => {
    const f = getAdvancedTherapyFramework('FDA');
    expect(f.oversightBody).toContain('CBER');
    expect(f.marketingRoute).toContain('BLA');
  });

  it('FDA expedited option is RMAT', () => {
    const f = getAdvancedTherapyFramework('FDA');
    expect(f.expeditedOption).toContain('RMAT');
  });

  it('JP framework mentions conditional approval', () => {
    const f = getAdvancedTherapyFramework('JP');
    expect(f.marketingRoute.toLowerCase()).toContain('conditional');
    expect(f.category.toLowerCase()).toContain('regenerative');
  });

  it('throws for an unmodeled region', () => {
    expect(() => getAdvancedTherapyFramework('XX' as AdvancedTherapyRegion)).toThrow();
  });
});

describe('classifyAdvancedTherapy — EU', () => {
  it('gene_therapy → GTMP via centralised + CAT', () => {
    const r = classifyAdvancedTherapy({ region: 'EU', modality: 'gene_therapy' });
    expect(r.classification).toContain('GTMP');
    expect(r.regulatoryRoute.toLowerCase()).toContain('centralised');
    expect(r.oversightBody).toContain('CAT');
    expect(r.citation).toBeTruthy();
  });

  it('cell_therapy → sCTMP', () => {
    const r = classifyAdvancedTherapy({ region: 'EU', modality: 'cell_therapy' });
    expect(r.classification).toContain('sCTMP');
  });

  it('tissue_engineered → TEP', () => {
    const r = classifyAdvancedTherapy({ region: 'EU', modality: 'tissue_engineered' });
    expect(r.classification).toContain('TEP');
  });

  it('combined → Combined ATMP', () => {
    const r = classifyAdvancedTherapy({ region: 'EU', modality: 'combined' });
    expect(r.classification).toContain('Combined ATMP');
  });
});

describe('classifyAdvancedTherapy — FDA', () => {
  it('every modality → Biologic (BLA) mentioning CBER', () => {
    for (const modality of ATMP_MODALITIES) {
      const r = classifyAdvancedTherapy({ region: 'FDA', modality });
      expect(r.classification).toContain('Biologic');
      expect(r.classification).toContain('BLA');
      expect(r.oversightBody).toContain('CBER');
      expect(r.regulatoryRoute).toContain('RMAT');
    }
  });

  it('cell_therapy notes the §361 HCT/P possibility', () => {
    const r = classifyAdvancedTherapy({ region: 'FDA', modality: 'cell_therapy' });
    expect(r.notes.some((n) => n.includes('361') || n.includes('HCT/P'))).toBe(true);
  });
});

describe('classifyAdvancedTherapy — JP', () => {
  it('every modality → regenerative medical product (conditional)', () => {
    for (const modality of ATMP_MODALITIES) {
      const r = classifyAdvancedTherapy({ region: 'JP', modality });
      expect(r.classification.toLowerCase()).toContain('regenerative medical product');
      expect(r.classification.toLowerCase()).toContain('conditional');
      expect(r.oversightBody).toContain('PMDA');
    }
  });
});

describe('classifyAdvancedTherapy — caveats present', () => {
  it('every result carries the agency-confirmation caveat', () => {
    for (const region of ADVANCED_THERAPY_REGIONS) {
      const r = classifyAdvancedTherapy({ region, modality: 'gene_therapy' });
      expect(r.notes.some((n) => n.includes('confirm with the agency'))).toBe(true);
    }
  });
});

describe('classifyAdvancedTherapy — errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() =>
      classifyAdvancedTherapy({ region: 'ZZ' as AdvancedTherapyRegion, modality: 'gene_therapy' }),
    ).toThrow();
  });

  it('throws for an unknown modality', () => {
    expect(() =>
      classifyAdvancedTherapy({ region: 'EU', modality: 'mrna' as AtmpModality }),
    ).toThrow();
  });

  it('is deterministic', () => {
    expect(classifyAdvancedTherapy({ region: 'EU', modality: 'gene_therapy' })).toEqual(
      classifyAdvancedTherapy({ region: 'EU', modality: 'gene_therapy' }),
    );
    expect(getAdvancedTherapyFramework('FDA')).toEqual(getAdvancedTherapyFramework('FDA'));
  });
});
