/**
 * Pathway identity for the device kit.
 *
 * A fourth case here used to assert `resolveDeviceWorkstreamSurface`, which
 * mapped a v2 surface id onto the kit's own nav vocabulary. That indirection is
 * gone on purpose, not by accident: when the kit stopped being a second shell,
 * its destinations became v2 surface ids directly — `device-510k` IS the nav —
 * so there is nothing left to translate. Do not restore the mapping; adding one
 * back would reintroduce a private id-space beside the registry's.
 *
 * What is asserted below is unchanged and still live: the legacy `ivd`/`ivdr`
 * aliases resolve only at the compatibility boundary, and program-type
 * classification does not over-reach into IVDR.
 */
import { describe, expect, it } from 'vitest';
import { deriveKitPathway } from '../useMdxPrograms';
import { MDX_DIAGNOSTICS_SURFACE_ID, resolveMdxSurfaceId } from '../../../../../../shared/constants/mdx';

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
});
