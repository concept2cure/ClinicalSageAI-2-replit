import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CORE_DB_PROVIDERS,
  registerCoreProviders,
} from '../db-providers';
import { getProvider, listProviders, clearProviders } from '../registry';

const EXPECTED_IDS = ['artifact_state', 'submission_readiness', 'compliance_audit'] as const;

describe('CORE_DB_PROVIDERS', () => {
  it('exposes exactly three providers with the expected ids', () => {
    expect(CORE_DB_PROVIDERS).toHaveLength(3);
    expect(CORE_DB_PROVIDERS.map(p => p.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });

  it('each provider has non-empty scopes, a positive freshness budget, and an async compute', () => {
    for (const provider of CORE_DB_PROVIDERS) {
      expect(provider.scopes.length).toBeGreaterThan(0);
      expect(provider.freshnessBudgetMs).toBeGreaterThan(0);
      expect(typeof provider.compute).toBe('function');
      expect(typeof provider.label).toBe('string');
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });
});

describe('registerCoreProviders', () => {
  beforeEach(() => {
    clearProviders();
  });

  afterEach(() => {
    clearProviders();
  });

  it('registers each core provider into the registry', () => {
    registerCoreProviders();
    for (const id of EXPECTED_IDS) {
      const provider = getProvider(id);
      expect(provider).toBeDefined();
      expect(provider!.id).toBe(id);
    }
    expect(listProviders().map(p => p.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });
});
