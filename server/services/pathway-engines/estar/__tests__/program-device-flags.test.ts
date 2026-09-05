import { describe, it, expect } from 'vitest';
import { deviceFlagsFromMetadata } from '../program-device-flags';

describe('deviceFlagsFromMetadata', () => {
  it('expands an answered list to every question, false where not listed', () => {
    const f = deviceFlagsFromMetadata({ deviceFlags: ['sterile', 'cyberDevice'] });
    expect(f).toMatchObject({ sterile: true, cyberDevice: true, softwareAiMl: false, implantable: false, combinationProduct: false, cliaWaived: false, clinicalData: false });
  });
  it('an answered-but-empty list means none apply — every question false, none undetermined', () => {
    const f = deviceFlagsFromMetadata({ deviceFlags: [] });
    expect(f).toBeDefined();
    expect(Object.values(f as object).every((v) => v === false)).toBe(true);
  });
  it('never asked stays undefined: no deviceFlags key, a non-array, or no metadata at all', () => {
    expect(deviceFlagsFromMetadata({ createdVia: 'wizard' })).toBeUndefined();
    expect(deviceFlagsFromMetadata({ deviceFlags: 'sterile' })).toBeUndefined();
    expect(deviceFlagsFromMetadata(null)).toBeUndefined();
  });
});
