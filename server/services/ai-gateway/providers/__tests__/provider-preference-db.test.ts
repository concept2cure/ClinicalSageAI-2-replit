/**
 * DB-backed tenant provider resolver — guards (no live DB needed for these paths).
 */

import { describe, it, expect } from 'vitest';
import { DbTenantProviderResolver } from '../provider-preference-db';

describe('DbTenantProviderResolver', () => {
  const r = new DbTenantProviderResolver();

  it('resolves null for no / non-integer org (no DB hit)', async () => {
    expect(await r.resolve(undefined)).toBeNull();
    expect(await r.resolve('not-a-number')).toBeNull();
  });

  it('setPreference validates before touching the DB', async () => {
    await expect(r.setPreference('abc' as any, 'anthropic')).rejects.toThrow();
    await expect(r.setPreference(1, 'not_a_provider' as any)).rejects.toThrow();
  });

  it('invalidate is safe to call', () => {
    expect(() => r.invalidate(1)).not.toThrow();
    expect(() => r.invalidate()).not.toThrow();
  });
});
