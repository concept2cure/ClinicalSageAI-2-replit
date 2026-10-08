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
const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => log }));

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
  it('an explicit off in production is said once, as an error; off elsewhere and on are quiet', async () => {
    vi.resetModules(); // a fresh module: the line is logged once per process
    const fresh = await import('../launch-scope.js');
    log.error.mockClear();
    fresh.readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'off' });
    fresh.readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'on' });
    fresh.readLaunchScopeMode({ NODE_ENV: 'production' });
    expect(log.error).not.toHaveBeenCalled();
    fresh.readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' });
    fresh.launchScopeEnforced({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'off' });
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(String(log.error.mock.calls[0][0])).toMatch(/LAUNCH_SCOPE_ENFORCE=off in production/);
  });
  it('a value that is neither on nor off refuses to boot in production, and is off elsewhere', () => {
    expect(() => readLaunchScopeMode({ NODE_ENV: 'production', LAUNCH_SCOPE_ENFORCE: 'yes' })).toThrow(/on.*off/);
    expect(readLaunchScopeMode({ NODE_ENV: 'development', LAUNCH_SCOPE_ENFORCE: 'yes' })).toBe('off');
  });
});

describe('the scope list itself', () => {
  it('has seven apps and every app surface is in the id set', () => {
    expect(LAUNCH_APPS).toHaveLength(7);
    for (const a of LAUNCH_APPS) for (const s of a.surfaces) expect(isLaunchSurface(s)).toBe(true);
  });
  it('Reporting & analytics is a launch app — founder decision, 2026-09-26', () => {
    const reporting = LAUNCH_APPS.find((a) => a.id === 'reporting');
    expect(reporting?.label).toBe('Reporting & analytics');
    expect(reporting?.surfaces).toEqual(expect.arrayContaining(['insights', 'compliance-reports']));
    expect(reporting?.modules).toContain('insights');
    expect(isLaunchSurface('insights')).toBe(true);
    expect(isLaunchSurface('compliance-reports')).toBe(true);
    // The verdict the rail reads for the canvas: a grant is kept, never overwritten to launch-scope.
    const [out] = applyLaunchScope([v('insights', { source: 'subscribed' })]);
    expect(out.entitled).toBe(true);
    expect(out.source).toBe('subscribed');
  });
  it('protocol development is in the Authoring app — founder decision, 2026-09-21', () => {
    const authoring = LAUNCH_APPS.find((a) => a.id === 'authoring')!;
    expect(authoring.surfaces).toContain('protocol-dev');
    expect(authoring.modules).toContain('protocol-dev');
    // The verdict the rail and deep link read: never overwritten to launch-scope.
    const [out] = applyLaunchScope([v('protocol-dev', { source: 'master_admin' })]);
    expect(out.entitled).toBe(true);
    expect(out.source).toBe('master_admin');
  });
  it('the authoring engine explainer is outside the scope — swapped out for protocol development', () => {
    expect(isLaunchSurface('authoring-engine')).toBe(false);
    const authoring = LAUNCH_APPS.find((a) => a.id === 'authoring')!;
    expect(authoring.modules).not.toContain('authoring-engine');
    // A bought row is still not in this release.
    const [out] = applyLaunchScope([v('authoring-engine', { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
  });
  it('keeps the two Part 11 surfaces the catalog may never gate', () => {
    expect(LAUNCH_SURFACE_IDS.has('audit-trail')).toBe(true);
    expect(LAUNCH_SURFACE_IDS.has('part11-console')).toBe(true);
  });
  // docs/SURFACE_DECISIONS_2026-10-08.md: each was assessed and checked by a
  // skeptic, and none does what its place promises for a real organisation.
  // The seven apps stay; these screens leave them, and their code stays
  // behind the flag.
  it.each([
    ['program-journey', 'projects', 'fixture-demo: empty for every program a client creates'],
    ['filings-catalog', 'projects', 'explainer: its Start drops the choice; the New project wizard keeps it'],
    ['regulatory-workspace', 'authoring', 'a fixed paragraph where the editor should be'],
    ['template-library', 'authoring', 'a saved template formats no document'],
    ['ectd-coauthor', 'submission-center', 'a second editor whose checks report a fixed failure'],
    ['dossier-map', 'submission-center', 'reads a store no program writes: always empty'],
    ['ectd-publishing', 'submission-center', 'a reference page that publishes nothing'],
    ['qmp', 'qms', 'a plan cannot be given its gates, and nothing reads them'],
  ])('%s is out of the %s app — %s', (surface, app) => {
    const a = LAUNCH_APPS.find((x) => x.id === app)!;
    expect(a.surfaces).not.toContain(surface);
    expect(a.modules).not.toContain(surface);
    expect(isLaunchSurface(surface)).toBe(false);
    // A bought row is still not in this release.
    const [out] = applyLaunchScope([v(surface, { source: 'subscribed' })]);
    expect(out.entitled).toBe(false);
    expect(out.source).toBe('launch-scope');
  });
  it.each([
    ['ana-command', 'enterprise-only, and says runs are recorded that are not'],
    ['ana-memory', 'shows a store nothing writes, not the memory AnA loads'],
    ['training', 'no path, lesson or certification exists'],
  ])('the shell no longer carries %s — %s', (surface) => {
    expect(isLaunchSurface(surface)).toBe(false);
  });
  it('every app keeps a screen a client can work in', () => {
    for (const a of LAUNCH_APPS) expect(a.surfaces.length).toBeGreaterThan(0);
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
