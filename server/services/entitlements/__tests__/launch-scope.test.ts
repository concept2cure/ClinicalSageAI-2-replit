/**
 * Launch scope — the release boundary the rail, catalog and deep links share.
 *
 * WHY THESE TESTS EXIST. `applyLaunchScope` is the one function that turns the
 * list in shared/constants/launch-scope.ts into verdicts. Both wrong
 * directions are real damage: widen, and a surface the release excludes
 * renders from a deep link with the rail silent about it; narrow, and a
 * launch app the customer is paying for goes dark. The mode reader is tested
 * because "unset means on in production" is the whole point of the flag —
 * an operator who forgets it must get the narrow product, not the wide one.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../module-grants.js', () => ({ writeModuleGrant: vi.fn() }));
vi.mock('../../license-manager.js', () => ({ getLicenseInfo: vi.fn(), getModuleCatalog: vi.fn() }));
vi.mock('../../../db', () => ({ query: vi.fn() }));

import { readLaunchScopeMode, launchScopeEnforced } from '../launch-scope.js';
import { applyLaunchScope, type NavSurfaceEntitlement } from '../navigation-entitlements.js';
import { LAUNCH_APPS, LAUNCH_SURFACE_IDS, isLaunchSurface } from '../../../../shared/constants/launch-scope';

const v = (id: string, over: Partial<NavSurfaceEntitlement> = {}): NavSurfaceEntitlement => ({
  id,
  label: id,
  entitled: true,
  source: 'included',
  requiredTier: null,
  ...over,
});

describe('readLaunchScopeMode', () => {
  it('unset ⇒ on in production, off elsewhere', () => {
    expect(readLaunchScopeMode({ NODE_ENV: 'production' })).toBe('on');
    expect(readLaunchScopeMode({ NODE_ENV: 'development' })).toBe('off');
    expect(readLaunchScopeMode({})).toBe('off');
  });
  it('explicit values win in either environment', () => {
    expect(readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' })).toBe('off');
    expect(readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'ON ' })).toBe('on');
    expect(launchScopeEnforced({ NODE_ENV: 'test', LAUNCH_SCOPE_ENFORCE: 'on' })).toBe(true);
  });
  it('a value that is neither on nor off refuses to boot in production, and is off elsewhere', () => {
    expect(() => readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'yes' })).toThrow(/on.*off/);
    expect(readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'yes' })).toBe('off');
  });
});

describe('the scope list itself', () => {
  it('has six apps and every app surface is in the id set', () => {
    expect(LAUNCH_APPS).toHaveLength(6);
    for (const a of LAUNCH_APPS) for (const s of a.surfaces) expect(isLaunchSurface(s)).toBe(true);
  });
  it('keeps the two Part 11 surfaces the catalog may never gate', () => {
    expect(LAUNCH_SURFACE_IDS.has('audit-trail')).toBe(true);
    expect(LAUNCH_SURFACE_IDS.has('part11-console')).toBe(true);
  });
});

describe('applyLaunchScope', () => {
  it('leaves a launch surface verdict untouched, whatever it said', () => {
    const locked = v('vault', { entitled: false, source: 'tier', requiredTier: 'standard' });
    const [out] = applyLaunchScope([locked]);
    expect(out).toEqual(locked);
  });
  it('locks a bought module outside the scope — the boundary never widens', () => {
    const [out] = applyLaunchScope([v('rbm', { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
    expect(out.requiredTier).toBeNull();
  });
  it('emits a verdict for every registered surface outside the scope that has no catalog row', () => {
    const out = applyLaunchScope([]);
    const ids = new Set(out.map((x) => x.id));
    // Both un-catalogued (contextual) and catalogued-but-absent surfaces appear.
    expect(ids.has('coverage')).toBe(true);
    expect(ids.has('client-portal')).toBe(true);
    expect(ids.has('rbm')).toBe(true);
    for (const x of out) {
      expect(x.entitled).toBe(false);
      expect(x.source).toBe('launch-scope');
      expect(isLaunchSurface(x.id)).toBe(false);
    }
  });
  it('never emits a launch-scope verdict for a launch surface', () => {
    const out = applyLaunchScope([]);
    for (const id of LAUNCH_SURFACE_IDS) expect(out.find((x) => x.id === id)).toBeUndefined();
  });
});
