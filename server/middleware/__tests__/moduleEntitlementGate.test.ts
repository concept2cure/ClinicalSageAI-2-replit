/**
 * Module entitlement gate — the enforcement rules, tested as the outage risks
 * they are.
 *
 * This middleware is the first thing in the stack that can DENY a real
 * customer's request, so each test below names the production failure it
 * exists to prevent rather than the branch it covers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/license-manager.js', () => ({
  canAccessModule: vi.fn(),
}));

import { canAccessModule } from '../../services/license-manager.js';
import {
  NEVER_GATED,
  buildPrefixMap,
  enforcementMode,
  moduleEntitlementGate,
  modulesForPath,
} from '../moduleEntitlementGate';

const mockAccess = canAccessModule as unknown as ReturnType<typeof vi.fn>;

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

afterEach(() => {
  mockAccess.mockReset();
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

describe('enforcementMode', () => {
  it('defaults to off — enforcement is opt-in', () => {
    // Shipping this on by default would deny requests nobody has measured.
    expect(enforcementMode()).toBe('off');
    process.env.MODULE_ENFORCEMENT = '';
    expect(enforcementMode()).toBe('off');
    process.env.MODULE_ENFORCEMENT = 'nonsense';
    expect(enforcementMode()).toBe('off');
  });

  it('reads report and enforce', () => {
    process.env.MODULE_ENFORCEMENT = 'report';
    expect(enforcementMode()).toBe('report');
    process.env.MODULE_ENFORCEMENT = 'ENFORCE';
    expect(enforcementMode()).toBe('enforce');
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
