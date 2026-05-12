import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/environment', () => ({
  config: { jwt: { secret: 'unit-test-secret-unit-test-secret-unit-test', expiresIn: '1d' } },
}));

import { extractBearerToken } from '../auth';

describe('extractBearerToken', () => {
  it('extracts the token from a canonical Bearer header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('BEARER abc')).toBe('abc');
    expect(extractBearerToken('BeArEr abc')).toBe('abc');
  });

  it('returns null for missing or empty headers', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });

  it('rejects shapes other than `<scheme> <token>`', () => {
    // Previously `.replace('Bearer ', '')` would mangle these into garbage
    // tokens that were then passed to jwt.verify.
    expect(extractBearerToken('Foo Bearer realtoken')).toBeNull();
    expect(extractBearerToken('Bearer abc def')).toBeNull();
    expect(extractBearerToken('BearerToken abc')).toBeNull();
    expect(extractBearerToken('Basic xyz')).toBeNull();
  });
});
