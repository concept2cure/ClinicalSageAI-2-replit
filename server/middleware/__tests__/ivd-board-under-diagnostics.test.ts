/**
 * The IVDR readiness panel of device-diagnostics is served to an organization
 * entitled to device-diagnostics, under module enforcement.
 *
 * Since 1a6701ea6 device-diagnostics (mdx/surfaces/IvdSurface.tsx) draws the
 * IVDR readiness board and the IVD assessment workbench. Their reads,
 * /api/ivd-completeness and /api/ivd-assessments, were claimed only by the
 * ivd-completeness screen, so with MODULE_ENFORCEMENT=enforce an organization
 * entitled to device-diagnostics and not ivd-completeness was refused them
 * (403 MODULE_NOT_LICENSED). device-diagnostics now claims both too. The gate
 * admits a path when the organization holds ANY module that claims it, so an
 * organization holding only ivd-completeness keeps what it had. The fold that
 * would move the claims is founder decision 4, so ivd-completeness keeps its
 * own (docs/evidence/D2-ONE-ANA/2026-10-29/ivd-board-under-diagnostics/).
 *
 * Asked of the real registry, the panel's calls as the launch-scope walk reads
 * them from the screens' own code, and the gate production builds.
 *
 * 2026-10-29 (D2, fold F2, decision P-61 item 4): the fold is made.
 * ivd-completeness has no registry entry and its claims moved to
 * device-diagnostics, so device-diagnostics claims the panel's calls alone. A
 * holder of ivd-completeness keeps them: its grant carries to device-diagnostics
 * in the entitlement resolver, which this file stubs, so that is pinned with the
 * real resolver in
 * server/services/entitlements/__tests__/folded-module-grant-continuity.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The modules each test organization holds. */
const HOLDS: Record<number, ReadonlySet<string>> = {
  101: new Set(['device-diagnostics']),
  103: new Set(['projects']),
};
vi.mock('../../services/license-manager.js', () => ({
  canAccessModule: vi.fn(async (orgId: number, moduleId: string) =>
    HOLDS[orgId]?.has(moduleId)
      ? { allowed: true }
      : { allowed: false, reason: `Module '${moduleId}' requires standard tier or higher (current: free)` }),
}));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { getSurface } from '../../../shared/constants/ui-surface-registry';
import { checkLaunchScopeApi, REAL } from '../../../scripts/ci/check-launch-scope-api';
import { buildPrefixMap, modulesForPath, moduleEntitlementGate } from '../moduleEntitlementGate';

/** The walk records each file relative to the repository root. */
const PANEL = ['IvdReadinessBoard.tsx', 'IvdAssessmentWorkbench.tsx'].map((f) => `client/src/concept2cure/v2/surfaces/${f}`);

async function ask(orgId: number, p: string) {
  const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const res = { statusCode: 0, body: null as null | { code?: string }, status(c: number) { this.statusCode = c; return this; }, json(b: { code?: string }) { this.body = b; return this; } };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: orgId } } as never, res as never, next);
  return next.mock.calls.length === 1 ? 'served' : `${res.statusCode} ${res.body?.code ?? ''}`.trim();
}

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'enforce');
});

describe('the IVDR readiness panel of device-diagnostics, under module enforcement', () => {
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  /** Every call the board and the workbench name, as a request (`:p` filled). */
  const calls = [...walk.all]
    .filter(([, e]) => PANEL.some((f) => e.files.has(f)))
    .map(([p, e]) => ({ p, request: p.replace(/:p/g, '1'), surfaces: e.surfaces }));
  const verdicts = async (orgId: number) =>
    Object.fromEntries(await Promise.all(calls.map(async (c) => [c.request, await ask(orgId, c.request)] as const)));
  const all = (v: string) => Object.fromEntries(calls.map((c) => [c.request, v]));

  it('reads the panel\'s calls from the screen that mounts it', () => {
    // A walk that lost the board would make every assertion below pass over nothing.
    expect(calls.map((c) => c.request).sort()).toEqual(expect.arrayContaining([
      '/api/ivd-assessments', '/api/ivd-assessments/classification', '/api/ivd-assessments/documents',
      '/api/ivd-assessments/documents/fsn', '/api/ivd-completeness/completeness',
    ]));
    for (const c of calls) {
      expect([...c.surfaces], c.p).toContain('device-diagnostics');
      expect([...c.surfaces], c.p).not.toContain('ivd-completeness');
    }
  });

  it('serves them to an organization entitled to device-diagnostics only', async () => {
    expect(await verdicts(101)).toEqual(all('served'));
  });

  it('asks the gate for device-diagnostics alone: a folded module is no claimant', () => {
    const map = buildPrefixMap();
    for (const c of calls) expect([...(modulesForPath(c.request, map) ?? [])], c.request).toEqual(['device-diagnostics']);
  });

  it('refuses them to an organization entitled to neither', async () => {
    expect(await verdicts(103)).toEqual(all('403 MODULE_NOT_LICENSED'));
  });

  it('the fold moved the claims: no ivd-completeness entry, and device-diagnostics holds its four IVD claims', () => {
    expect(getSurface('ivd-completeness')).toBeUndefined();
    expect(getSurface('device-diagnostics')!.apiPrefixes).toEqual(expect.arrayContaining([
      '/api/validate-completeness', '/api/ivd-assessments', '/api/ivd-lifecycle', '/api/ivd-completeness',
    ]));
  });
});
