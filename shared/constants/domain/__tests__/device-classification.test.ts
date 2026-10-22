import { describe, it, expect } from 'vitest';
import { HALF_PREDICATE, normalizeDeviceClassification, devicePathFor } from '../device-classification';

describe('device classification', () => {
  it('accepts the AeroFlow set', () => {
    const { value, rejected } = normalizeDeviceClassification({
      productCode: 'bzh', regulationNumber: '21 CFR 868.1860', deviceClass: 'ii',
      reviewPanel: 'Anesthesiology', predicateK: 'k181234', predicateName: 'AeroCheck PF Meter',
      intendedUse: 'OTC home monitoring of peak expiratory flow.',
      flags: ['cyberDevice', 'softwareAiMl', 'nonsense'],
    });
    expect(rejected).toEqual([]);
    expect(value).toEqual({
      productCode: 'BZH', regulationNumber: '868.1860', deviceClass: 'II',
      reviewPanel: 'Anesthesiology', predicateK: 'K181234', predicateName: 'AeroCheck PF Meter',
      intendedUse: 'OTC home monitoring of peak expiratory flow.',
      flags: ['cyberDevice', 'softwareAiMl'],
    });
  });

  /**
   * The predicate of record is a claim of substantial equivalence the sponsor
   * makes to FDA (21 CFR 807.87(f)), and the official eSTAR prints BOTH its
   * submission number and its trade name out of `predicate_devices[0]`. The
   * governed write refuses a row with one and not the other
   * (`predicateDeviceSchema` requires id and name), and until 2026-10-19
   * `POST /api/c2c/projects` wrote exactly that row — `[{ kNumber }]`, no id,
   * no name — from a wizard that asked only for the number.
   */
  describe('the predicate pair', () => {
    const norm = (over: Record<string, unknown>) =>
      normalizeDeviceClassification({ productCode: 'BZH', ...over });

    it('takes both halves together', () => {
      const { value, rejected } = norm({ predicateK: 'K181234', predicateName: 'AeroCheck PF Meter' });
      expect(rejected).toEqual([]);
      expect(value.predicateK).toBe('K181234');
      expect(value.predicateName).toBe('AeroCheck PF Meter');
    });

    it('keeps neither half when only the number is given, and says which is missing', () => {
      const { value, rejected } = norm({ predicateK: 'K181234' });
      expect(value.predicateK, 'half a claim must not reach the record').toBeUndefined();
      expect(value.predicateName).toBeUndefined();
      expect(rejected).toEqual([HALF_PREDICATE.nameMissing]);
      expect(value.productCode, 'the rest of the classification still lands').toBe('BZH');
    });

    it('keeps neither half when only the trade name is given', () => {
      const { value, rejected } = norm({ predicateName: 'AeroCheck PF Meter' });
      expect(value.predicateName).toBeUndefined();
      expect(value.predicateK).toBeUndefined();
      expect(rejected).toEqual([HALF_PREDICATE.numberMissing]);
    });

    it('names a malformed number once, not twice', () => {
      /* A bad number with a good name is ONE mistake. Reporting the number as
         malformed AND the number as missing would be two complaints about it. */
      const { value, rejected } = norm({ predicateK: '181234', predicateName: 'AeroCheck PF Meter' });
      expect(value.predicateK).toBeUndefined();
      expect(value.predicateName, 'the name has no number to stand beside').toBeUndefined();
      expect(rejected).toEqual(['predicate must be a K number, e.g. K181234']);
    });

    it('says nothing about a predicate when neither half is given', () => {
      const { value, rejected } = norm({});
      expect(rejected).toEqual([]);
      expect(value.predicateK).toBeUndefined();
      expect(value.predicateName).toBeUndefined();
    });
  });
  it('drops malformed values and names them instead of coercing', () => {
    const { value, rejected } = normalizeDeviceClassification({
      productCode: 'BZHX', deviceClass: '2', predicateK: '181234', regulationNumber: '868',
    });
    expect(value).toEqual({});
    expect(rejected).toHaveLength(4);
  });
  it('derives the premarket route from the filing type', () => {
    expect(devicePathFor('510k')).toBe('510k');
    expect(devicePathFor('de_novo')).toBe('de_novo');
    expect(devicePathFor('cdx_pma')).toBe('pma');
    expect(devicePathFor('nda')).toBeNull();
  });
});
