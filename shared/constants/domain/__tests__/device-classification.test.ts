import { describe, it, expect } from 'vitest';
import { normalizeDeviceClassification, devicePathFor } from '../device-classification';

describe('device classification', () => {
  it('accepts the AeroFlow set', () => {
    const { value, rejected } = normalizeDeviceClassification({
      productCode: 'bzh', regulationNumber: '21 CFR 868.1860', deviceClass: 'ii',
      reviewPanel: 'Anesthesiology', predicateK: 'k181234',
      intendedUse: 'OTC home monitoring of peak expiratory flow.',
      flags: ['cyberDevice', 'softwareAiMl', 'nonsense'],
    });
    expect(rejected).toEqual([]);
    expect(value).toEqual({
      productCode: 'BZH', regulationNumber: '868.1860', deviceClass: 'II',
      reviewPanel: 'Anesthesiology', predicateK: 'K181234',
      intendedUse: 'OTC home monitoring of peak expiratory flow.',
      flags: ['cyberDevice', 'softwareAiMl'],
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
