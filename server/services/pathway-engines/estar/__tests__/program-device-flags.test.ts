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

/**
 * The two cases the pure expander cannot cover, because they are about the
 * SHAPE the database hands back and about scoping.
 *
 * Both were live defects in a parallel implementation of this reader that the
 * merge brought alongside this one: it returned `undefined` for an
 * answered-but-empty list — collapsing "none of the seven apply" back into
 * "never asked" — and it read the metadata as an object without allowing for a
 * driver that hands JSON columns back as text.
 */
describe('deviceFlagsFromMetadata — the shapes a driver actually returns', () => {
  it('an id the mapper does not know is not a question, and cannot answer one on its own', () => {
    const flags = deviceFlagsFromMetadata({ deviceFlags: ['sterile', 'notARealFlag'] });
    expect(flags).toMatchObject({ sterile: true });
    expect(flags).not.toHaveProperty('notARealFlag');
    // An unknown id alone still counts as an ANSWERED submission — the operator
    // saw the seven checkboxes — so the seven resolve to false, not undetermined.
    const only = deviceFlagsFromMetadata({ deviceFlags: ['notARealFlag'] });
    expect(only).toBeDefined();
    expect(Object.values(only!).every((v) => v === false)).toBe(true);
  });

  it('answers exactly the seven questions and no others', () => {
    const flags = deviceFlagsFromMetadata({ deviceFlags: [] });
    expect(Object.keys(flags!).sort()).toEqual(
      ['cliaWaived', 'clinicalData', 'combinationProduct', 'cyberDevice', 'implantable', 'softwareAiMl', 'sterile'].sort(),
    );
  });
});
