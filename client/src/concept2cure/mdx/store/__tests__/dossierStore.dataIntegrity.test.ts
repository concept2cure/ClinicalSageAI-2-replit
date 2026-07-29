import { afterEach, describe, expect, it } from 'vitest';
import { DossierStore } from '../dossierStore';

afterEach(() => DossierStore.clearAllPathways());

describe('dossierStore live-data integrity', () => {
  it('does not seed fictional evidence merely by importing the store', () => {
    expect(DossierStore.fs.size).toBe(0);
    expect(DossierStore.listDir(DossierStore.rootFor('k510'))).toEqual([]);
  });

  it('installs kit evidence only through the explicit sample boundary', () => {
    DossierStore.enableSampleFixtures();
    expect(DossierStore.fs.size).toBeGreaterThan(0);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toContain('BX-204');
  });

  it('empty backend hydration removes prior sample evidence', () => {
    DossierStore.enableSampleFixtures();
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).not.toBe('');
    DossierStore.hydratePathway('k510', 'doc-empty', []);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toBe('');
    expect(DossierStore.getBackendDocId('k510')).toBeUndefined();
  });

  it('live hydration replaces sample evidence rather than merging it', () => {
    DossierStore.enableSampleFixtures();
    DossierStore.hydratePathway('k510', 'doc-live', [{ key: 99, label: 'Tenant section', body: 'tenant evidence' }]);
    expect(DossierStore.readSectionBody('k510', 1, 'Medical Device User Fee Cover Sheet')).toBe('');
    expect(DossierStore.readSectionBody('k510', 99, 'Tenant section')).toBe('tenant evidence');
    expect(DossierStore.getBackendDocId('k510')).toBe('doc-live');
  });
});
