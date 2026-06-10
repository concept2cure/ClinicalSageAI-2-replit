/**
 * Tests for the UDI validator — proves the GS1 mod-10 check-digit math, GTIN-14
 * validation, and AI parsing (UDI-DI + UDI-PI) are exact and deterministic.
 */
import { describe, it, expect } from 'vitest';
import { gs1CheckDigit, isValidGtin14, parseGs1Udi, validateUdi } from '../udi-validator';

describe('GS1 mod-10 check digit', () => {
  it('computes the canonical check digit', () => {
    // GTIN-14 00012345678905 → data 0001234567890, check 5.
    expect(gs1CheckDigit('0001234567890')).toBe(5);
  });
  it('throws on non-digit input', () => {
    expect(() => gs1CheckDigit('12a4')).toThrow();
  });
});

describe('GTIN-14 validation', () => {
  it('accepts a valid GTIN-14 and rejects a bad check digit', () => {
    expect(isValidGtin14('00012345678905')).toBe(true);
    expect(isValidGtin14('00012345678900')).toBe(false);
  });
  it('rejects wrong length / non-numeric', () => {
    expect(isValidGtin14('1234')).toBe(false);
    expect(isValidGtin14('0001234567890X')).toBe(false);
  });
});

describe('GS1 UDI parsing (parenthesised AI form)', () => {
  it('splits UDI-DI (01) and UDI-PI (17 expiry, 10 lot, 21 serial)', () => {
    const p = parseGs1Udi('(01)00012345678905(17)241231(10)LOT123(21)SER456');
    expect(p.issuingAgency).toBe('gs1');
    expect(p.udiDi).toBe('00012345678905');
    expect(p.udiDiValid).toBe(true);
    expect(p.productionIdentifiers.expiryDate).toBe('241231');
    expect(p.productionIdentifiers.lot).toBe('LOT123');
    expect(p.productionIdentifiers.serial).toBe('SER456');
    expect(p.warnings).toHaveLength(0);
  });

  it('warns on an invalid GTIN check digit', () => {
    const p = parseGs1Udi('(01)00012345678900');
    expect(p.udiDiValid).toBe(false);
    expect(p.warnings.some((w) => /not a valid 14-digit GTIN/.test(w))).toBe(true);
  });

  it('warns on a malformed date AI', () => {
    const p = parseGs1Udi('(01)00012345678905(17)241350'); // month 13
    expect(p.warnings.some((w) => /not a valid YYMMDD/.test(w))).toBe(true);
  });

  it('flags a missing UDI-DI', () => {
    const p = parseGs1Udi('(10)LOT123(21)SER456');
    expect(p.udiDi).toBeUndefined();
    expect(p.warnings.some((w) => /No UDI-DI/.test(w))).toBe(true);
  });

  it('detects HIBCC / ICCBBA carriers without parsing them', () => {
    expect(parseGs1Udi('+A99912345678').issuingAgency).toBe('hibcc');
    expect(parseGs1Udi('=A123').issuingAgency).toBe('iccbba');
  });

  it('collects unknown AIs separately', () => {
    const p = parseGs1Udi('(01)00012345678905(240)EXTRA');
    expect(p.otherAis).toEqual([{ ai: '240', value: 'EXTRA' }]);
  });
});

describe('validateUdi', () => {
  it('annotates GUDID + EUDAMED registration and the DI status', () => {
    const v = validateUdi('(01)00012345678905(10)LOT1');
    expect(v.udiDiOk).toBe(true);
    expect(v.registration.fda).toMatch(/GUDID/);
    expect(v.registration.eu).toMatch(/EUDAMED/);
  });
  it('udiDiOk is false when the GS1 check digit fails', () => {
    expect(validateUdi('(01)00012345678900').udiDiOk).toBe(false);
  });
});
