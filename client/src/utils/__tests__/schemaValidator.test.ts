/**
 * Pins the hand-rolled device profile validator that replaced Ajv.
 *
 * Ajv was removed from the client bundle because its `.compile()` calls
 * `new Function()` — blocked under our prod CSP (`script-src` drops
 * `'unsafe-eval'`). The replacement walks the JSON schema directly.
 * These tests cover the same surface DeviceProfileAPI.js consumes
 * (required fields, enum constraints, type checks) so a future refactor
 * can't silently regress validation behavior.
 */

import { describe, expect, it } from 'vitest';
import { validateDeviceProfile } from '../schemaValidator';

describe('validateDeviceProfile', () => {
  const valid = {
    deviceName: 'Acme Pacemaker',
    deviceClass: 'II',
    intendedUse: 'Treatment of cardiac arrhythmias',
  };

  it('accepts a profile with all required fields', () => {
    const res = validateDeviceProfile(valid);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it('flags a missing required field with the field name in the error', () => {
    const res = validateDeviceProfile({ deviceName: 'X', deviceClass: 'II' });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.field === 'intendedUse')).toBe(true);
  });

  it('treats empty string and null as missing for required fields', () => {
    const empty = validateDeviceProfile({ deviceName: '', deviceClass: 'II', intendedUse: 'x' });
    const nulled = validateDeviceProfile({ deviceName: null, deviceClass: 'II', intendedUse: 'x' });
    expect(empty.isValid).toBe(false);
    expect(nulled.isValid).toBe(false);
  });

  it('rejects enum values outside the allowed set', () => {
    const res = validateDeviceProfile({ ...valid, deviceClass: 'IV' });
    expect(res.isValid).toBe(false);
    const err = res.errors.find(e => e.field === 'deviceClass');
    expect(err?.params.allowedValues).toEqual(['I', 'II', 'III']);
  });

  it('rejects wrong types', () => {
    const res = validateDeviceProfile({ ...valid, deviceName: 42 });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.field === 'deviceName' && /string/.test(e.message))).toBe(true);
  });

  it('ignores unknown properties (schema is open by default)', () => {
    const res = validateDeviceProfile({ ...valid, somethingExtra: 'ok' });
    expect(res.isValid).toBe(true);
  });

  it('rejects bad ISO date format on nested predicateDevices[].clearanceDate', () => {
    const res = validateDeviceProfile({
      ...valid,
      predicateDevices: [{ deviceName: 'Pred A', clearanceDate: 'not-a-date' }],
    });
    expect(res.isValid).toBe(false);
    const err = res.errors.find(e => e.field === 'predicateDevices[0].clearanceDate');
    expect(err?.params.format).toBe('date');
  });

  it('accepts a valid ISO date in a nested array item', () => {
    const res = validateDeviceProfile({
      ...valid,
      predicateDevices: [{ deviceName: 'Pred A', clearanceDate: '2026-05-12' }],
    });
    expect(res.isValid).toBe(true);
  });

  it('reports multiple errors at once (allErrors-equivalent)', () => {
    const res = validateDeviceProfile({});
    expect(res.errors.length).toBeGreaterThanOrEqual(3); // 3 required fields missing
  });
});
