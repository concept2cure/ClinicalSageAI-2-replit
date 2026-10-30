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

  it('maps features to their canonical core entitlement owner', () => {
    // Legacy rows stay historical; the live feature names its core owner.
    expect(appModuleId('cmc')).toBe('cmc');
    expect(appModuleId('study_protocol_design')).toBe('protocol-dev');
    expect(appModuleId('clinical_csr')).toBe('document-authoring');
    expect(appModuleId('cer')).toBe('device-cer');
    expect(appModuleId('submission_center')).toBe('submission-center');
    expect(appModuleId('substantial_equiv')).toBe('device-510k');
  });

  it('leaves always-available apps unmapped (no module id)', () => {
    expect(appModuleId('irb')).toBeUndefined();
    expect(appModuleId('risk')).toBeUndefined();
    expect(appModuleId('biostatistics')).toBeUndefined();
  });

  it('includes the IVD + biosimilar apps that close the claim-spine gaps', () => {
    expect(getApp('analytical_performance').discipline).toBe('diagnostics');
    expect(getApp('analytical_similarity').discipline).toBe('quality_cmc');
    // Neither is a separately-sold module yet — always available.
    expect(appModuleId('analytical_performance')).toBeUndefined();
    expect(appModuleId('analytical_similarity')).toBeUndefined();
  });

  it('getApp returns the full entry', () => {
    const a = getApp('cmc');
    expect(a.label).toBe('CMC (Module 3)');
    expect(a.discipline).toBe('quality_cmc');
    expect(a.moduleId).toBe('cmc');
  });
});
