import { afterEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../../../lib/queryClient';
import { deriveDossierStatus } from '../../hooks/useDossier';
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

  it('distinguishes authorization failures, outages, and empty live data', () => {
    const base = { hasSections: false, sampleOn: false, isLoading: false };
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Forbidden', 403) })).toBe(
      'permission-denied',
    );
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Unauthorized', 401) })).toBe(
      'permission-denied',
    );
    expect(deriveDossierStatus({ ...base, error: new ApiRequestError('Unavailable', 503) })).toBe('unavailable');
    expect(deriveDossierStatus({ ...base, error: null })).toBe('empty');
  });

  it('uses live and explicit sample states without masking loading implicitly', () => {
    expect(deriveDossierStatus({ hasSections: true, sampleOn: false, isLoading: false, error: null })).toBe(
      'live-data',
    );
    expect(deriveDossierStatus({ hasSections: false, sampleOn: true, isLoading: false, error: null })).toBe(
      'sample',
    );
    expect(deriveDossierStatus({ hasSections: false, sampleOn: false, isLoading: true, error: null })).toBe(
      'loading',
    );
  });
});
