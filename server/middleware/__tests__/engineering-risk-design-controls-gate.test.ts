/**
 * The risk register and the design-control trace in device-engineering are
 * served to an organization entitled to device-engineering, under module
 * enforcement.
 *
 * Since 79d00b348 (F1 slice B) device-engineering
 * (mdx/surfaces/EngineeringSurface.tsx) mounts RiskRegister.tsx and
 * DesignControlsTrace.tsx. Their reads and writes, /api/mdx/risk-items and
 * /api/design-controls, were claimed only by the `risk` and `design-controls`
 * screens. So with MODULE_ENFORCEMENT=enforce an organization entitled to
 * device-engineering and to neither of those was refused them (403
 * MODULE_NOT_LICENSED): the mirror case a86ed04ed fixed for the IVD panel.
 * device-engineering now claims both too. The gate admits a path when the
 * organization holds ANY module that claims it, so a risk-only or
 * design-controls-only organization keeps what it had. Moving the claims is
 * the fold, founder decision 4, so risk and design-controls keep their own
 * (docs/evidence/D2-ONE-ANA/2026-10-29/core-project-record-gating/, item 3).
 *
 * Asked of the real registry, the panels' calls as the launch-scope walk reads
 * them from the screens' own code, and the gate production builds.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The modules each test organization holds. */
const HOLDS: Record<number, ReadonlySet<string>> = {
  401: new Set(['device-engineering']),
  402: new Set(['risk']),
  403: new Set(['design-controls']),
  404: new Set(['projects']),
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
import { buildPrefixMap, moduleEntitlementGate } from '../moduleEntitlementGate';

/** The walk records each file relative to the repository root. */
const PANELS = ['RiskRegister.tsx', 'DesignControlsTrace.tsx'].map((f) => `client/src/concept2cure/v2/surfaces/${f}`);
const RISK = '/api/mdx/risk-items';
const DC = '/api/design-controls';

/**
 * Every request the two panels make. The walk reads the literal roots; the
 * sub-paths are built by concatenation (RiskRegister.tsx: PATCH
 * '/api/mdx/risk-items/' + dbId to accept a residual, POST '…/' + dbId +
 * '/controls'), which the walk does not expand, so they are named here.
 */
const REQUESTS = [RISK, `${RISK}/7`, `${RISK}/7/controls`, DC];

async function ask(orgId: number, p: string) {
  const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const res = { statusCode: 0, body: null as null | { code?: string }, status(c: number) { this.statusCode = c; return this; }, json(b: { code?: string }) { this.body = b; return this; } };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: orgId } } as never, res as never, next);
  return next.mock.calls.length === 1 ? 'served' : `${res.statusCode} ${res.body?.code ?? ''}`.trim();
}
const verdicts = async (orgId: number, requests: readonly string[] = REQUESTS) =>
  Object.fromEntries(await Promise.all(requests.map(async (r) => [r, await ask(orgId, r)] as const)));
const each = (requests: readonly string[], v: string) => Object.fromEntries(requests.map((r) => [r, v]));

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'enforce');
});

describe('the risk register and design-control trace in device-engineering, under module enforcement', () => {
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  const named = [...walk.all].filter(([, e]) => PANELS.some((f) => e.files.has(f)));

  it('reads the panels\' calls from the screens that mount them', () => {
    // A walk that lost the panels would make every assertion below pass over nothing.
    expect(named.map(([p]) => p).sort()).toEqual(expect.arrayContaining([DC, RISK]));
    for (const [p, e] of named) expect([...e.surfaces], p).toContain('device-engineering');
    for (const r of REQUESTS) expect(named.some(([p]) => r === p || r.startsWith(`${p}/`)), r).toBe(true);
  });

  it('serves them to an organization entitled to device-engineering only', async () => {
    expect(await verdicts(401)).toEqual(each(REQUESTS, 'served'));
  });

  it('a risk-only organization keeps the risk register, as before', async () => {
    const risk = REQUESTS.filter((r) => r.startsWith(RISK));
    expect(await verdicts(402, risk)).toEqual(each(risk, 'served'));
  });

  it('a design-controls-only organization keeps the design-control register, as before', async () => {
    expect(await verdicts(403, [DC])).toEqual(each([DC], 'served'));
  });

  it('refuses them to an organization entitled to none of the three', async () => {
    expect(await verdicts(404)).toEqual(each(REQUESTS, '403 MODULE_NOT_LICENSED'));
  });

  it('leaves the risk and design-controls claims whole: moving them is founder decision 4', () => {
    expect(getSurface('risk')!.apiPrefixes).toEqual([RISK]);
    expect(getSurface('design-controls')!.apiPrefixes).toEqual([DC]);
  });
});
