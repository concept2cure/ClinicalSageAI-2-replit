/**
 * Import/export licensing expert — authorisation per region/category/direction.
 */

import { describe, it, expect } from 'vitest';
import {
  getImportExportRequirements,
  getImportExportMatrix,
  IE_REGIONS,
  IE_CATEGORIES,
  type IERegion,
  type IECategory,
} from '../import-export-licensing';

describe('import/export catalog', () => {
  it('models every category for every region with an authorisation + citation', () => {
    for (const region of IE_REGIONS) {
      for (const category of IE_CATEGORIES) {
        const r = getImportExportRequirements({ region, category });
        expect(r.authorisation).toBeTruthy();
        expect(r.requirements.length).toBeGreaterThan(0);
        expect(r.citation).toBeTruthy();
        expect(r.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it('exports the modeled region and category sets', () => {
    expect(IE_REGIONS).toEqual(['US', 'EU']);
    expect(IE_CATEGORIES).toEqual([
      'finished_drug',
      'controlled_substance',
      'investigational',
      'biological',
    ]);
  });
});

describe('getImportExportRequirements — US', () => {
  it('controlled_substance import → DEA permit', () => {
    const r = getImportExportRequirements({
      region: 'US',
      category: 'controlled_substance',
      direction: 'import',
    });
    expect(r.authorisation).toContain('DEA');
    expect(r.authorisation.toLowerCase()).toContain('permit');
    expect(r.citation).toContain('1312');
  });

  it('controlled_substance export → DEA export permit, different from import', () => {
    const imp = getImportExportRequirements({ region: 'US', category: 'controlled_substance', direction: 'import' });
    const exp = getImportExportRequirements({ region: 'US', category: 'controlled_substance', direction: 'export' });
    expect(exp.authorisation).toContain('export');
    expect(exp.authorisation).not.toBe(imp.authorisation);
  });

  it('finished_drug import → prior notice + importer', () => {
    const r = getImportExportRequirements({ region: 'US', category: 'finished_drug' });
    expect(r.authorisation.toLowerCase()).toContain('importer');
    const text = (r.authorisation + ' ' + r.requirements.join(' ')).toLowerCase();
    expect(text).toContain('prior notice');
  });

  it('investigational → IND / import for export (§801(d))', () => {
    const r = getImportExportRequirements({ region: 'US', category: 'investigational' });
    expect(r.authorisation).toContain('IND');
    expect(r.citation).toContain('801(d)');
  });

  it('defaults direction to import when omitted', () => {
    const r = getImportExportRequirements({ region: 'US', category: 'finished_drug' });
    expect(r.direction).toBe('import');
  });
});

describe('getImportExportRequirements — EU', () => {
  it('finished_drug import → MIA + QP', () => {
    const r = getImportExportRequirements({ region: 'EU', category: 'finished_drug' });
    expect(r.authorisation).toContain('MIA');
    expect(r.authorisation).toContain('QP');
    expect(r.citation).toContain('Art 40');
  });

  it('investigational → MIA(IMP) + QP', () => {
    const r = getImportExportRequirements({ region: 'EU', category: 'investigational' });
    expect(r.authorisation).toContain('MIA(IMP)');
    expect(r.authorisation).toContain('QP');
    expect(r.citation).toContain('536/2014');
  });

  it('controlled_substance → national competent authority import/export authorisation', () => {
    const imp = getImportExportRequirements({ region: 'EU', category: 'controlled_substance', direction: 'import' });
    const exp = getImportExportRequirements({ region: 'EU', category: 'controlled_substance', direction: 'export' });
    expect(imp.authorisation).toContain('IMPORT');
    expect(exp.authorisation).toContain('EXPORT');
    expect(imp.authorisation).not.toBe(exp.authorisation);
  });
});

describe('getImportExportMatrix', () => {
  it('US returns all 4 categories with citations', () => {
    const m = getImportExportMatrix('US');
    expect(m.region).toBe('US');
    expect(m.categories).toHaveLength(4);
    expect(m.categories.map((c) => c.category)).toEqual(IE_CATEGORIES);
    for (const row of m.categories) {
      expect(row.authorisation).toBeTruthy();
      expect(row.citation).toBeTruthy();
    }
    expect(m.citation).toBeTruthy();
    expect(m.notes.length).toBeGreaterThan(0);
  });

  it('EU returns all 4 categories', () => {
    const m = getImportExportMatrix('EU');
    expect(m.categories).toHaveLength(4);
  });
});

describe('errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() =>
      getImportExportRequirements({ region: 'JP' as IERegion, category: 'finished_drug' }),
    ).toThrow();
    expect(() => getImportExportMatrix('JP' as IERegion)).toThrow();
  });

  it('throws for an unmodeled category', () => {
    expect(() =>
      getImportExportRequirements({ region: 'US', category: 'device' as IECategory }),
    ).toThrow();
  });

  it('is deterministic', () => {
    expect(
      getImportExportRequirements({ region: 'EU', category: 'finished_drug' }),
    ).toEqual(getImportExportRequirements({ region: 'EU', category: 'finished_drug' }));
    expect(getImportExportMatrix('US')).toEqual(getImportExportMatrix('US'));
  });
});
