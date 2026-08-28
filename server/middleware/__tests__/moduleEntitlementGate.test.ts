/**
 * Module entitlement gate — the enforcement rules, tested as the outage risks
 * they are.
 *
 * This middleware is the first thing in the stack that can DENY a real
 * customer's request, so each test below names the production failure it
 * exists to prevent rather than the branch it covers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/license-manager.js', () => ({
  canAccessModule: vi.fn(),
}));

/* The settings store is stubbed, not the resolver. The gate's contract is that
   the mode an operator STORED reaches the request path without a restart, so
   the real resolver — precedence, cache, fail-safe — has to run for these tests
   to mean anything. */
const dbQuery = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => dbQuery(...(a as [])) } }));

import { canAccessModule } from '../../services/license-manager.js';
import {
  MODE_CACHE_TTL_MS,
  invalidateEnforcementModeCache,
  peekEnforcementMode,
} from '../../services/entitlements/enforcement-mode';
import {
  NEVER_GATED,
  buildPrefixMap,
  moduleEntitlementGate,
  modulesForPath,
} from '../moduleEntitlementGate';

const mockAccess = canAccessModule as unknown as ReturnType<typeof vi.fn>;

/** The settings row the platform_settings read returns, or none. */
function storeHolds(mode: string | null) {
  dbQuery.mockImplementation(async () => ({
    rows: mode == null
      ? []
      : [{ setting_value: mode, updated_at: new Date('2026-08-24T09:00:00.000Z'), updated_by: 4, reason: 'rollout' }],
  }));
}

const SURFACES = [
  { id: 'projects', apiPrefixes: ['/api/projects', '/api/programs'] },
  { id: 'project-home', apiPrefixes: ['/api/projects'] },
  { id: 'pv-cockpit', apiPrefixes: ['/api/pv'] },
  { id: 'risk', apiPrefixes: ['/api/risk'] },
  { id: 'apps', apiPrefixes: ['/api/module-subscriptions'] },
  { id: 'billing', apiPrefixes: ['/api/billing/invoices'] },
];

function reqFor(path: string, orgId: number | null = 42) {
  return {
    path,
    originalUrl: path,
    tenantContext: orgId == null ? undefined : { organizationId: orgId },
  } as any;
}
function resSpy() {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
}

beforeEach(() => {
  dbQuery.mockReset();
  storeHolds(null); // nothing stored: the deployment value decides, as before
  invalidateEnforcementModeCache();
});

afterEach(() => {
  mockAccess.mockReset();
  invalidateEnforcementModeCache();
  vi.useRealTimers();
  delete process.env.MODULE_ENFORCEMENT;
});

describe('buildPrefixMap', () => {
  it('maps a shared prefix to EVERY module that declares it', () => {
    // The outage this prevents: /api/projects serves both `projects` and
    // `project-home`. Mapping it to one module would deny a customer who is
    // entitled through the other.
    const map = buildPrefixMap(SURFACES);
    expect([...(map.get('/api/projects') ?? [])].sort()).toEqual(['project-home', 'projects']);
  });

  it('never maps a protected prefix, even when a surface declares it', () => {
    // /api/module-subscriptions is how the rail LEARNS what is locked. Gating
    // it produces a customer who sees a full menu where every entry 403s.
    const map = buildPrefixMap(SURFACES);
    expect(map.has('/api/module-subscriptions')).toBe(false);
    expect(map.has('/api/billing/invoices')).toBe(false);
  });

  it('protects every NEVER_GATED entry and its subpaths', () => {
    const map = buildPrefixMap(
      NEVER_GATED.flatMap((p, i) => [
        { id: `s${i}`, apiPrefixes: [p] },
        { id: `s${i}sub`, apiPrefixes: [`${p}/deep/path`] },
      ]),
    );
    expect(map.size).toBe(0);
  });
});

describe('modulesForPath', () => {
  const map = buildPrefixMap(SURFACES);

  it('matches only at a segment boundary', () => {
    // /api/risk must not gate an unrelated /api/risk-assessment-external.
    expect(modulesForPath('/api/risk', map)).not.toBeNull();
    expect(modulesForPath('/api/risk/123', map)).not.toBeNull();
    expect(modulesForPath('/api/risk-assessment-external', map)).toBeNull();
  });

  it('returns null for a path no surface claims', () => {
    expect(modulesForPath('/api/something-else', map)).toBeNull();
  });

  it('prefers the longest matching prefix', () => {
    const m = buildPrefixMap([
      { id: 'broad', apiPrefixes: ['/api/x'] },
      { id: 'specific', apiPrefixes: ['/api/x/deep'] },
    ]);
    expect([...(modulesForPath('/api/x/deep/thing', m) ?? [])]).toEqual(['specific']);
  });
});

describe('the gate', () => {
  const gate = moduleEntitlementGate(buildPrefixMap(SURFACES));

  it('does nothing at all when the mode is off', async () => {
    const next = vi.fn();
    await gate(reqFor('/api/pv/signals'), resSpy(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it('allows when the org is entitled through ANY module claiming the prefix', async () => {
    // The shared-prefix outage, end to end: unentitled to `projects`, entitled
    // to `project-home`, must be served.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    mockAccess.mockImplementation(async (_org: number, moduleId: string) =>
      moduleId === 'project-home' ? { allowed: true } : { allowed: false, reason: 'tier' },
    );
    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/projects/7'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('denies with MODULE_NOT_LICENSED when entitled to none of them', async () => {
    process.env.MODULE_ENFORCEMENT = 'enforce';
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });
    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('MODULE_NOT_LICENSED');
    expect(res.body.reason).toContain('professional');
  });

  it('report mode resolves the verdict and serves the request anyway', async () => {
    // This is the whole point of the mode: measure the blast radius without
    // being the outage.
    process.env.MODULE_ENFORCEMENT = 'report';
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });
    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);
    expect(mockAccess).toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('FAILS OPEN when entitlement resolution throws', async () => {
    // The availability outage this prevents: canAccessModule fails closed on a
    // null license lookup, so a database blip would otherwise 403 every paying
    // customer on every gated route simultaneously.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    mockAccess.mockRejectedValue(new Error('connection terminated'));
    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('leaves an unauthenticated request to whoever owns the 401', async () => {
    process.env.MODULE_ENFORCEMENT = 'enforce';
    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals', null), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it('never denies a protected path', async () => {
    process.env.MODULE_ENFORCEMENT = 'enforce';
    mockAccess.mockResolvedValue({ allowed: false, reason: 'tier' });
    for (const p of ['/api/module-subscriptions/navigation', '/api/billing/invoices', '/api/audit/x']) {
      const next = vi.fn();
      const res = resSpy();
      await gate(reqFor(p), res, next);
      expect(next, `${p} must never be gated`).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(0);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Where the mode comes from

   The gate used to read the deployment's configuration directly, so the one
   conclusion the Master Licensing console produces — "it is safe to start
   refusing" — could only be executed by an engineer and a redeploy. It now
   reads the governed setting through the shared resolver. Three properties of
   that have to hold at THIS layer, because getting any of them wrong here is
   invisible from the resolver's own tests:

     1. A stored decision actually changes what the gate does.
     2. It arrives without a restart.
     3. It does not cost a settings query per request.
   ══════════════════════════════════════════════════════════════════════════ */

describe('the gate takes its mode from the governed setting', () => {
  const gate = moduleEntitlementGate(buildPrefixMap(SURFACES));

  it('refuses because the STORED mode says so, over a deployment that says off', async () => {
    // The defect this catches: the console reports the change as applied and
    // the gate goes on reading the deployment value, so enforcement never
    // actually moves and nobody finds out until a customer is not refused.
    process.env.MODULE_ENFORCEMENT = 'off';
    storeHolds('enforce');
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });

    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('serves because the STORED mode says off, over a deployment that says enforce', async () => {
    // The same defect in the direction that breaks customers: an operator
    // stands enforcement down on the console and the gate keeps refusing.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    storeHolds('off');
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });

    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    expect(mockAccess).not.toHaveBeenCalled();
  });

  it('picks up a change without a restart, once the staleness window passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
    process.env.MODULE_ENFORCEMENT = 'off';
    storeHolds('report');
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });

    const first = vi.fn();
    const firstRes = resSpy();
    await gate(reqFor('/api/pv/signals'), firstRes, first);
    expect(first).toHaveBeenCalledOnce(); // report: measured, served

    storeHolds('enforce');
    vi.setSystemTime(new Date(Date.now() + MODE_CACHE_TTL_MS + 1_000));
    // The stale value is served without waiting; the refresh happens behind it.
    await gate(reqFor('/api/pv/signals'), resSpy(), vi.fn());
    await vi.waitFor(() => expect(peekEnforcementMode()?.mode).toBe('enforce'));

    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not read the settings store on every request', async () => {
    // A configuration query per API request is a worse defect than the one the
    // stored mode exists to fix.
    process.env.MODULE_ENFORCEMENT = 'off';
    storeHolds('enforce');
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });

    for (let i = 0; i < 30; i += 1) await gate(reqFor('/api/pv/signals'), resSpy(), vi.fn());
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it('does not start refusing when the setting cannot be read at all', async () => {
    // The outage this prevents: the settings store hiccups on a freshly started
    // process and a deployment configured to refuse begins 403ing paying
    // customers on the strength of a fault rather than a decision.
    process.env.MODULE_ENFORCEMENT = 'enforce';
    dbQuery.mockRejectedValue(new Error('connection terminated'));
    mockAccess.mockResolvedValue({ allowed: false, reason: 'requires professional' });

    const next = vi.fn();
    const res = resSpy();
    await gate(reqFor('/api/pv/signals'), res, next);

    expect(res.statusCode).toBe(0);
    expect(next).toHaveBeenCalledOnce();
    // Still measured — the denial is recorded even though it was not applied.
    expect(mockAccess).toHaveBeenCalled();
  });
});
