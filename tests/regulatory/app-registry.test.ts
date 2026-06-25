import { describe, it, expect } from 'vitest';
import { APP_REGISTRY, getApp, appModuleId } from '../../shared/regulatory/app-registry';

describe('app-registry — single source of truth', () => {
  it('every entry id matches its key and carries a discipline', () => {
    for (const [key, entry] of Object.entries(APP_REGISTRY)) {
      expect(entry.id).toBe(key);
      expect(entry.discipline).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(Array.isArray(entry.produces)).toBe(true);
      expect(entry.landsAt).toBeTruthy();
    }
  });

  it('maps apps to the REAL entitlement module ids (verified against the catalog)', () => {
    // These are the actual module ids from available_modules / license enabledModules.
    expect(appModuleId('cmc')).toBe('cmc-wizard');
    expect(appModuleId('study_protocol_design')).toBe('protocol-designer');
    expect(appModuleId('clinical_csr')).toBe('csr-author');
    expect(appModuleId('cer')).toBe('cer-generator');
    expect(appModuleId('submission_center')).toBe('ectd-coauthor');
    expect(appModuleId('substantial_equiv')).toBe('510k-submission');
  });

  it('leaves always-available apps unmapped (no module id)', () => {
    expect(appModuleId('irb')).toBeUndefined();
    expect(appModuleId('risk')).toBeUndefined();
    expect(appModuleId('biostatistics')).toBeUndefined();
  });

  it('getApp returns the full entry', () => {
    const a = getApp('cmc');
    expect(a.label).toBe('CMC (Module 3)');
    expect(a.discipline).toBe('quality_cmc');
    expect(a.moduleId).toBe('cmc-wizard');
  });
});
