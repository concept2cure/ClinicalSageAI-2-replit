import { describe, it, expect, beforeEach } from 'vitest';
import {
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
  clampConfidence,
  confidenceFromBlockers,
  deriveLifecycleStatus,
  isFresh,
} from '../helpers';
import {
  registerProvider,
  getProvider,
  listProviders,
  clearProviders,
} from '../registry';
import type { InsightProvider, InsightProviderContext, InsightValue } from '../types';

describe('clampConfidence', () => {
  it('clamps below the floor', () => {
    expect(clampConfidence(-10)).toBe(CONFIDENCE_MIN);
    expect(clampConfidence(0)).toBe(CONFIDENCE_MIN);
  });

  it('clamps above the ceiling', () => {
    expect(clampConfidence(100)).toBe(CONFIDENCE_MAX);
    expect(clampConfidence(95.9)).toBe(CONFIDENCE_MAX);
  });

  it('rounds within the band', () => {
    expect(clampConfidence(50.4)).toBe(50);
    expect(clampConfidence(50.6)).toBe(51);
  });
});

describe('confidenceFromBlockers', () => {
  it('returns the ceiling for zero blockers without readiness', () => {
    expect(confidenceFromBlockers(0)).toBe(95);
  });

  it('clamps the floor when blockers drive the base below the minimum', () => {
    // 95 - 4*20 = 15 -> clamped to 25
    expect(confidenceFromBlockers(4)).toBe(25);
  });

  it('blends with readinessScore when provided', () => {
    // base = clamp(95 - 1*20) = 75; blend = round(75*0.55 + 80*0.45) = round(41.25 + 36) = 77
    expect(confidenceFromBlockers(1, 80)).toBe(77);
  });

  it('blends and clamps the floor when blockers and readiness are both low', () => {
    // base = clamp(15) = 25; blend = round(25*0.55 + 0*0.45) = round(13.75) = 14 -> clamped 25
    expect(confidenceFromBlockers(4, 0)).toBe(25);
  });
});

describe('deriveLifecycleStatus', () => {
  it('returns ready when approved/locked artifacts exist', () => {
    expect(deriveLifecycleStatus(2, 5)).toBe('ready');
  });

  it('returns partial when artifacts exist but none approved/locked', () => {
    expect(deriveLifecycleStatus(0, 5)).toBe('partial');
  });

  it('returns missing when there are no artifacts', () => {
    expect(deriveLifecycleStatus(0, 0)).toBe('missing');
  });
});

describe('isFresh', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('returns true within the freshness budget', () => {
    const observed = new Date('2026-06-15T11:59:30.000Z').toISOString();
    expect(isFresh(observed, 60_000, now)).toBe(true);
  });

  it('returns false outside the freshness budget', () => {
    const observed = new Date('2026-06-15T11:55:00.000Z').toISOString();
    expect(isFresh(observed, 60_000, now)).toBe(false);
  });

  it('returns false for an unparseable timestamp', () => {
    expect(isFresh('not-a-date', 60_000, now)).toBe(false);
  });
});

describe('registry', () => {
  const makeProvider = (overrides: Partial<InsightProvider> = {}): InsightProvider => ({
    id: 'fake_provider',
    label: 'Fake Provider',
    scopes: ['project'],
    freshnessBudgetMs: 60_000,
    compute: async (_ctx: InsightProviderContext): Promise<InsightValue> => ({
      value: 42,
      status: 'ready',
      confidence: 95,
      blockers: [],
      atoms: [],
      observedAt: new Date().toISOString(),
    }),
    ...overrides,
  });

  beforeEach(() => {
    clearProviders();
  });

  it('registers and retrieves a provider by id', () => {
    const provider = makeProvider();
    registerProvider(provider);
    expect(getProvider('fake_provider')).toBe(provider);
  });

  it('overwrites an existing id (idempotent registration)', () => {
    registerProvider(makeProvider({ label: 'First' }));
    registerProvider(makeProvider({ label: 'Second' }));
    expect(getProvider('fake_provider')?.label).toBe('Second');
    expect(listProviders()).toHaveLength(1);
  });

  it('returns undefined for an unknown id', () => {
    expect(getProvider('missing')).toBeUndefined();
  });

  it('lists all providers when no scope filter is given', () => {
    registerProvider(makeProvider({ id: 'a', scopes: ['project'] }));
    registerProvider(makeProvider({ id: 'b', scopes: ['submission'] }));
    expect(listProviders().map(p => p.id).sort()).toEqual(['a', 'b']);
  });

  it('filters providers by scope', () => {
    registerProvider(makeProvider({ id: 'a', scopes: ['project'] }));
    registerProvider(makeProvider({ id: 'b', scopes: ['submission', 'document'] }));
    expect(listProviders('submission').map(p => p.id)).toEqual(['b']);
    expect(listProviders('project').map(p => p.id)).toEqual(['a']);
    expect(listProviders('account')).toEqual([]);
  });

  it('clears all providers', () => {
    registerProvider(makeProvider());
    clearProviders();
    expect(listProviders()).toEqual([]);
    expect(getProvider('fake_provider')).toBeUndefined();
  });

  it('exposes an async compute on registered providers', async () => {
    registerProvider(makeProvider());
    const provider = getProvider('fake_provider');
    expect(provider).toBeDefined();
    const result = await provider!.compute({
      organizationId: 1,
      scopeType: 'project',
      scopeId: '123',
    });
    expect(result.value).toBe(42);
    expect(result.status).toBe('ready');
  });
});
