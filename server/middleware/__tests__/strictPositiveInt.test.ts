import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => ({ db: { select: vi.fn() }, getPool: vi.fn() }));
vi.mock('../../db/tenantStore', () => ({ runWithTenantScope: vi.fn() }));
vi.mock('../../../shared/schema', () => ({ organizations: {}, organizationUsers: {} }));

import { strictPositiveInt } from '../tenantContext';

describe('strictPositiveInt', () => {
  it('accepts clean positive integer strings', () => {
    expect(strictPositiveInt('1')).toBe(1);
    expect(strictPositiveInt('42')).toBe(42);
    expect(strictPositiveInt('999999')).toBe(999999);
  });

  it('accepts integer number values too', () => {
    expect(strictPositiveInt(42)).toBe(42);
  });

  it('rejects zero', () => {
    // Regression: parseInt('0', 10) returns 0 → Number.isFinite(0) is true,
    // so the previous check would let a JWT with userId=0 through.
    expect(strictPositiveInt('0')).toBeNull();
    expect(strictPositiveInt(0)).toBeNull();
  });

  it('rejects values that parseInt would silently truncate', () => {
    // parseInt('42abc', 10) === 42 — a malformed JWT claim could otherwise
    // resolve to a real user/org id.
    expect(strictPositiveInt('42abc')).toBeNull();
    expect(strictPositiveInt('1.5')).toBeNull();
    expect(strictPositiveInt('1e3')).toBeNull();
    expect(strictPositiveInt(' 42 ')).toBeNull();
    expect(strictPositiveInt('+42')).toBeNull();
    expect(strictPositiveInt('-42')).toBeNull();
    expect(strictPositiveInt('042')).toBeNull(); // leading zero suggests non-canonical
  });

  it('rejects missing / non-numeric values', () => {
    expect(strictPositiveInt(undefined)).toBeNull();
    expect(strictPositiveInt(null)).toBeNull();
    expect(strictPositiveInt('')).toBeNull();
    expect(strictPositiveInt('abc')).toBeNull();
    expect(strictPositiveInt({})).toBeNull();
    expect(strictPositiveInt([])).toBeNull();
    expect(strictPositiveInt(true)).toBeNull();
  });

  it('rejects values beyond safe integer range', () => {
    expect(strictPositiveInt('99999999999999999999')).toBeNull();
  });
});
