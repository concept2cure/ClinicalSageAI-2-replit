import { describe, expect, it } from 'vitest';
import { isModuleEnabledByEntitlements } from './useAnaEntitlements';

describe('isModuleEnabledByEntitlements', () => {
  it('fails open when entitlement payload is not available yet', () => {
    expect(isModuleEnabledByEntitlements('ana_cortex', false, [])).toBe(true);
  });

  it('fails closed when entitlement payload exists and module is not enabled', () => {
    expect(isModuleEnabledByEntitlements('ana_cortex', true, [])).toBe(false);
    expect(isModuleEnabledByEntitlements('ana_cortex', true, ['dashboard'])).toBe(false);
  });

  it('allows modules that are explicitly enabled', () => {
    expect(isModuleEnabledByEntitlements('ana_cortex', true, ['ana_cortex'])).toBe(true);
  });
});

