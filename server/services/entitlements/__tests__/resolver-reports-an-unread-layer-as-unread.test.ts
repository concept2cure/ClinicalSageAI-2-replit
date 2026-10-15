/**
 * The capability resolver reports a layer it could not read as unread (2026-10-15).
 *
 * What the code used to do: resolveCapabilities turned a failed, empty,
 * duplicated or unrecognized organizations.tier read into tier 'standard' — a
 * plan nobody read — and composed `features` from it, so the four
 * standard-tier features came back enabled with source 'tier'. 'standard' is
 * not the floor: 'free' ranks below it, so for a free organization that was a
 * grant made by a failed read. A failed feature_toggles or module_subscriptions
 * read came back as `toggles: []` / `modules: []`, indistinguishable from
 * "none granted".
 *
 * Now an unread plan is `tier: null`, it enables nothing (only a toggle grant
 * that WAS read still counts), and each layer carries whether it was read.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveCapabilities, type ResolvedFeature } from '../resolver';
import type { RequestSqlClient } from '../../../db/requestDb';

type Layer = 'tier' | 'toggles' | 'modules';

function client(opts: { tierRows?: Array<Record<string, unknown>>; fail?: Layer[] } = {}) {
  const fail = new Set<Layer>(opts.fail ?? []);
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM organizations')) {
        if (fail.has('tier')) throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
        return { rows: opts.tierRows ?? [{ tier: 'standard' }] };
      }
      if (sql.includes('FROM feature_toggles')) {
        if (fail.has('toggles')) throw new Error('relation "feature_toggles" does not exist');
        return { rows: [{ feature_key: 'prediction_forecast_report', enabled: false, enabled_for_organization_ids: [7] }] };
      }
      if (sql.includes('FROM module_subscriptions')) {
        if (fail.has('modules')) throw new Error('relation "module_subscriptions" does not exist');
        return { rows: [{ module_id: 'reporting', enabled: true, name: 'Reporting', category: 'analytics' }] };
      }
      throw new Error(`Unexpected capability query: ${sql}`);
    }),
  } satisfies RequestSqlClient;
}

const enabledFeatures = (features: ResolvedFeature[]) =>
  features.filter(f => f.enabled).map(f => `${f.feature}:${f.source}`).sort();

describe('an unread plan is not the standard plan', () => {
  it.each([
    { label: 'the tier query fails', make: () => client({ fail: ['tier'] }) },
    { label: 'there is no organization row', make: () => client({ tierRows: [] }) },
    { label: 'the recorded tier is not a real tier', make: () => client({ tierRows: [{ tier: 'platinum' }] }) },
    { label: 'two organization rows answer', make: () => client({ tierRows: [{ tier: 'enterprise' }, { tier: 'enterprise' }] }) },
  ])('names no plan when $label', async ({ make }) => {
    const caps = await resolveCapabilities(7, make());
    expect(caps.tier, 'an unread plan was reported as a plan').toBeNull();
    expect(caps.tierResolved).toBe(false);
  });

  it('enables nothing by the unread plan; only the toggle grant that was read', async () => {
    const caps = await resolveCapabilities(7, client({ fail: ['tier'] }));
    expect(enabledFeatures(caps.features), 'a failed tier read enabled tier features')
      .toEqual(['prediction_forecast_report:toggle']);
    for (const f of caps.features.filter(row => !row.enabled)) {
      expect(f.source, `${f.feature} claimed a plan nobody read decided it`).toBe('unresolved');
    }
  });

  it('never grants more than the lowest real plan (free) with the same toggles', async () => {
    const unread = await resolveCapabilities(7, client({ fail: ['tier'] }));
    const free = await resolveCapabilities(7, client({ tierRows: [{ tier: 'free' }] }));
    expect(enabledFeatures(unread.features), 'a failed read granted more than a free plan')
      .toEqual(enabledFeatures(free.features));
  });

  it('control: a read standard plan still enables the standard features, attributed to the tier', async () => {
    const caps = await resolveCapabilities(7, client({ tierRows: [{ tier: 'standard' }] }));
    expect(caps).toMatchObject({ tier: 'standard', tierResolved: true });
    expect(enabledFeatures(caps.features)).toEqual([
      'ana_advisory:tier',
      'device_assembly_readiness:tier',
      'global_market_planner:tier',
      'prediction_forecast_report:toggle',
      'report_families:tier',
    ]);
  });
});

describe('a capability layer that could not be read says so', () => {
  it('marks failed toggle and module reads as unread rather than "none granted"', async () => {
    const caps = await resolveCapabilities(7, client({ fail: ['toggles', 'modules'] }));
    expect(caps).toMatchObject({ tier: 'standard', tierResolved: true, toggles: [], modules: [] });
    expect(caps.togglesResolved, 'a failed feature_toggles read looked like "no flags"').toBe(false);
    expect(caps.modulesResolved, 'a failed module_subscriptions read looked like "no modules"').toBe(false);
  });

  it('control: layers that were read are marked read', async () => {
    const caps = await resolveCapabilities(7, client({ tierRows: [{ tier: 'professional' }] }));
    expect(caps).toMatchObject({
      tier: 'professional', tierResolved: true, togglesResolved: true, modulesResolved: true,
    });
  });
});
