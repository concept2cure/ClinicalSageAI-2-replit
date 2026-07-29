import { describe, expect, it } from 'vitest';
import { deriveKitPathway } from '../useMdxPrograms';
import { MDX_DIAGNOSTICS_SURFACE_ID, resolveMdxSurfaceId } from '../../../../../../shared/constants/mdx';
import { resolveDeviceWorkstreamSurface } from '../../../v2/surfaces/DeviceWorkstream';

describe('MDx diagnostics identity', () => {
  it('resolves legacy aliases only at the compatibility boundary', () => {
    expect(resolveMdxSurfaceId('ivd')).toBe(MDX_DIAGNOSTICS_SURFACE_ID);
    expect(resolveMdxSurfaceId('ivdr')).toBe(MDX_DIAGNOSTICS_SURFACE_ID);
    expect(resolveMdxSurfaceId('unknown')).toBe('unknown');
  });

  it.each([
    ['IVDR', null], ['IVD', null], ['anything', 'ivdr'], ['anything', 'ivd'],
  ])('classifies %s/%s as IVDR', (type, path) => {
    expect(deriveKitPathway(type, path)).toBe('ivdr');
  });

  it('does not coerce unknown or 510(k) programs into IVDR', () => {
    expect(deriveKitPathway('UNKNOWN', null)).toBeNull();
    expect(deriveKitPathway('510K', '510k')).toBe('k510');
  });

  it('preserves an unknown V2 surface so the MDx not-found state handles it', () => {
    expect(resolveDeviceWorkstreamSurface('device-unknown')).toBe('device-unknown');
    expect(resolveDeviceWorkstreamSurface()).toBe('overview');
  });
});
