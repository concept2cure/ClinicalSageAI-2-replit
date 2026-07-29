/**
 * AI provider preference — resolver precedence, validation, catalog default, store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLATFORM_DEFAULT_PROVIDER,
  PROVIDER_CATALOG,
  isClientSelectableProvider,
  resolveEffectiveProvider,
  resolveProviderForOrg,
  getProviderCatalog,
  getTenantProviderResolver,
  resetTenantProviderResolver,
} from '../provider-preference';

beforeEach(() => resetTenantProviderResolver());

describe('provider catalog', () => {
  it('is Claude-first: anthropic is the default and only one default', () => {
    expect(PLATFORM_DEFAULT_PROVIDER).toBe('anthropic');
    const defaults = PROVIDER_CATALOG.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe('anthropic');
  });

  it('exposes Claude private-cloud substrates as selectable', () => {
    const selectable = new Set(PROVIDER_CATALOG.filter((p) => p.clientSelectable).map((p) => p.id));
    for (const id of ['anthropic', 'bedrock', 'vertex', 'openai']) expect(selectable.has(id as any)).toBe(true);
  });

  it('getProviderCatalog returns the default + tenant default passthrough', () => {
    expect(getProviderCatalog().defaultProvider).toBe('anthropic');
    expect(getProviderCatalog('openai').tenantDefault).toBe('openai');
    expect(getProviderCatalog().tenantDefault).toBeNull();
  });
});

describe('resolveEffectiveProvider precedence', () => {
  it('request override wins', () => {
    const r = resolveEffectiveProvider({ requestOverride: 'openai', tenantDefault: 'bedrock' });
    expect(r.provider).toBe('openai');
    expect(r.source).toBe('request');
  });

  it('falls back to tenant default, then platform default', () => {
    expect(resolveEffectiveProvider({ tenantDefault: 'bedrock' })).toMatchObject({ provider: 'bedrock', source: 'tenant' });
    expect(resolveEffectiveProvider({})).toMatchObject({ provider: 'anthropic', source: 'platform_default' });
  });

  it('ignores an invalid/non-selectable value and degrades with a note', () => {
    const r = resolveEffectiveProvider({ requestOverride: 'not_a_provider', tenantDefault: 'anthropic' });
    expect(r.provider).toBe('anthropic');
    expect(r.source).toBe('tenant');
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(resolveEffectiveProvider({ tenantDefault: 'openai' })).toEqual(resolveEffectiveProvider({ tenantDefault: 'openai' }));
  });
});

describe('tenant store + resolveProviderForOrg', () => {
  it('defaults to platform default when no tenant preference', async () => {
    expect(await resolveProviderForOrg(42)).toMatchObject({ provider: 'anthropic', source: 'platform_default' });
  });

  it('honors a stored tenant default; request override still wins', async () => {
    await getTenantProviderResolver().setPreference!(42, 'bedrock');
    expect(await resolveProviderForOrg(42)).toMatchObject({ provider: 'bedrock', source: 'tenant' });
    expect(await resolveProviderForOrg(42, 'openai')).toMatchObject({ provider: 'openai', source: 'request' });
  });
});

describe('isClientSelectableProvider', () => {
  it('true for anthropic/openai; false for unknown and internal-only local', () => {
    expect(isClientSelectableProvider('anthropic')).toBe(true);
    expect(isClientSelectableProvider('openai')).toBe(true);
    expect(isClientSelectableProvider('local')).toBe(false);
    expect(isClientSelectableProvider('nope')).toBe(false);
  });
});
