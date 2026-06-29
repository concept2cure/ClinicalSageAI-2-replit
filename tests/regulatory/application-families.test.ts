import { describe, it, expect } from 'vitest';
import {
  APPLICATION_FAMILY_METADATA,
  getFamilyMetadata,
  getFamiliesByDossierStandard,
  getCTDFamilies,
  getAllFamiliesSorted,
} from '../../shared/regulatory/application-families';

describe('application-families — metadata catalog', () => {
  it('catalogs at least 15 application families', () => {
    expect(APPLICATION_FAMILY_METADATA.length).toBeGreaterThanOrEqual(15);
  });

  it('every family has the required fields', () => {
    for (const f of APPLICATION_FAMILY_METADATA) {
      expect(f.id).toBeTruthy();
      expect(f.displayName).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.typicalDossierStandards.length).toBeGreaterThan(0);
      expect(f.typicalStages.length).toBeGreaterThan(0);
      expect(typeof f.usesCTDStructure).toBe('boolean');
      expect(typeof f.requiresClinicalData).toBe('boolean');
      expect(typeof f.requiresQualityData).toBe('boolean');
      expect(typeof f.sortOrder).toBe('number');
      expect(f.iconHint).toBeTruthy();
    }
  });

  it('every family id is unique', () => {
    const ids = APPLICATION_FAMILY_METADATA.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('application-families — query functions', () => {
  it('getFamilyMetadata returns clinical_trial', () => {
    const ct = getFamilyMetadata('clinical_trial');
    expect(ct).toBeDefined();
    expect(ct!.displayName).toContain('Clinical Trial');
    expect(ct!.requiresClinicalData).toBe(true);
  });

  it('getFamilyMetadata returns undefined for unknown family', () => {
    expect(getFamilyMetadata('nonexistent' as any)).toBeUndefined();
  });

  it('getCTDFamilies includes clinical_trial and marketing_authorization', () => {
    const ctdIds = getCTDFamilies().map((f) => f.id);
    expect(ctdIds).toContain('clinical_trial');
    expect(ctdIds).toContain('marketing_authorization');
  });

  it('getCTDFamilies does NOT include quality_system or post_market', () => {
    const ctdIds = getCTDFamilies().map((f) => f.id);
    expect(ctdIds).not.toContain('quality_system');
    expect(ctdIds).not.toContain('post_market');
  });

  it('getFamiliesByDossierStandard eCTD includes clinical_trial', () => {
    const ectdIds = getFamiliesByDossierStandard('eCTD').map((f) => f.id);
    expect(ectdIds).toContain('clinical_trial');
    expect(ectdIds).toContain('marketing_authorization');
  });

  it('getFamiliesByDossierStandard eSTAR includes device families', () => {
    const estarIds = getFamiliesByDossierStandard('eSTAR').map((f) => f.id);
    expect(estarIds).toContain('device_clearance');
  });

  it('getAllFamiliesSorted returns families in ascending sortOrder', () => {
    const sorted = getAllFamiliesSorted();
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].sortOrder).toBeGreaterThanOrEqual(sorted[i - 1].sortOrder);
    }
  });

  it('marketing_authorization requires both clinical and quality data', () => {
    const ma = getFamilyMetadata('marketing_authorization')!;
    expect(ma.requiresClinicalData).toBe(true);
    expect(ma.requiresQualityData).toBe(true);
  });

  it('companion_diagnostic requires clinical data', () => {
    const cdx = getFamilyMetadata('companion_diagnostic')!;
    expect(cdx.requiresClinicalData).toBe(true);
    expect(cdx.requiresQualityData).toBe(true);
  });
});
