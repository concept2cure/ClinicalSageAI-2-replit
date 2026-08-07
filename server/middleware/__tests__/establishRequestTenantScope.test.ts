/**
 * The central RLS scope lever, pinned in isolation.
 *
 * These tests use the REAL tenant store (AsyncLocalStorage) so the scope a
 * handler would actually observe is asserted from inside `next()`. Only
 * `getPool` is stubbed — the request DB client is lazy and never acquires a
 * connection unless a handler issues a query, so the stub is never touched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// getPool is only used to construct the lazy client; the client never acquires
// unless .query() runs, which these tests do not trigger.
vi.mock('../../db', () => ({ getPool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) }) }));

import {
  establishRequestTenantScope,
  establishRequestSystemScope,
  isSystemScopedPath,
  SYSTEM_SCOPE_PREFIXES,
} from '../establishRequestTenantScope';
import {
  getTenantScope,
  runWithTenantScope,
  runWithPreAuthScope,
  runWithSystemTenantScope,
} from '../../db/tenantStore';

function makeReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    baseUrl: '',
    path: '/api/widgets',
    user: { organizationId: '42', role: 'member' },
    tenantContext: {},
    ...overrides,
  };
}

/** Minimal res: EventEmitter with the two lifecycle events the helper hooks. */
function makeRes(): EventEmitter & { finish: () => void; close: () => void } {
  const res = new EventEmitter() as any;
  res.finish = () => res.emit('finish');
  res.close = () => res.emit('close');
  return res;
}

describe('establishRequestTenantScope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a per-user scope and attaches a request DB client', () => {
    const req = makeReq({ user: { organizationId: '42', role: 'editor' }, tenantContext: { organizationUuid: 'uuid-42' } });
    const res = makeRes();
    let scopeInside: ReturnType<typeof getTenantScope>;

    establishRequestTenantScope(req, res as any, () => {
      scopeInside = getTenantScope();
    });

    expect(scopeInside?.tenantId).toBe('42');
    expect(scopeInside?.role).toBe('editor');
    expect(scopeInside?.orgUuid).toBe('uuid-42');
    expect(scopeInside?.source).toBe('request');
    expect(req.dbClient).toBeTruthy();

    // Client is released and cleared when the response ends.
    res.finish();
    expect(req.dbClient).toBeNull();
  });

  it('is idempotent when a scope is already active (does not clobber)', () => {
    const req = makeReq({ user: { organizationId: '42', role: 'member' } });
    const res = makeRes();
    let scopeInside: any;

    // Simulate an upstream middleware having already opened a scope.
    runWithTenantScope(
      { tenantId: '99', role: 'admin', source: 'request', caller: 'upstream' },
      () => establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); }),
    );

    // The upstream scope stands; no second scope for org 42 was opened.
    expect(scopeInside?.tenantId).toBe('99');
    expect(req.dbClient).toBeUndefined();
  });

  it('is idempotent when req.dbClient is already set', () => {
    const sentinel = { query: vi.fn() };
    const req = makeReq({ dbClient: sentinel });
    const res = makeRes();
    let called = false;

    establishRequestTenantScope(req, res as any, () => { called = true; });

    expect(called).toBe(true);
    expect(req.dbClient).toBe(sentinel); // untouched
  });

  it('does NOT fabricate a scope for a tenant-less identity', () => {
    const req = makeReq({ user: { organizationId: undefined, role: 'member' } });
    const res = makeRes();
    let scopeInside: any = 'unset';

    establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); });

    expect(scopeInside).toBeUndefined();
    expect(req.dbClient).toBeUndefined();
  });

  it('rejects a non-integer org id rather than scoping to a garbage tenant', () => {
    const req = makeReq({ user: { organizationId: '42abc', role: 'member' } });
    const res = makeRes();
    let scopeInside: any = 'unset';

    establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); });

    expect(scopeInside).toBeUndefined();
    expect(req.dbClient).toBeUndefined();
  });

  it('routes a SYSTEM-prefixed path to the system scope, not the caller org', () => {
    const req = makeReq({ baseUrl: '/api/admin/master', path: '/orgs', user: { organizationId: '42', role: 'member' } });
    const res = makeRes();
    let scopeInside: any;

    establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); });

    expect(scopeInside?.tenantId).toBe('0');
    expect(scopeInside?.role).toBe('app_super_admin');
    expect(req.dbClient).toBeTruthy();
  });

  // ── Regression: P1 review findings on scope-KIND-aware idempotency ───────────

  it('REPLACES a pre-auth placeholder scope with the caller org once authenticated', () => {
    // The /api/auth/enterprise electronic-signature flow: the mount opens a
    // pre-auth scope (tenantId 0, no role), then authMiddleware succeeds and this
    // helper runs. The coarse "any active scope is idempotent" check left tenant
    // work running under tenantId 0 (RLS-denied). It must install the real scope.
    const req = makeReq({
      baseUrl: '/api/auth/enterprise',
      path: '/electronic-signature',
      user: { organizationId: '42', role: 'editor' },
    });
    const res = makeRes();
    let scopeInside: any;

    runWithPreAuthScope('auth:POST /api/auth/enterprise/electronic-signature', () =>
      establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); }),
    );

    expect(scopeInside?.tenantId).toBe('42'); // NOT '0' (the pre-auth placeholder)
    expect(scopeInside?.role).toBe('editor');
    expect(req.dbClient).toBeTruthy();
  });

  it('leaves the pre-auth placeholder untouched when there is no verified tenant yet', () => {
    // A genuinely pre-auth request (login/refresh): no numeric org on req.user.
    // We must NOT fabricate a per-user scope; the pre-auth placeholder stands.
    const req = makeReq({ baseUrl: '/api/auth', path: '/login', user: undefined });
    const res = makeRes();
    let scopeInside: any;

    runWithPreAuthScope('auth:POST /api/auth/login', () =>
      establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); }),
    );

    expect(scopeInside?.tenantId).toBe('0'); // pre-auth placeholder preserved
    expect(scopeInside?.role).toBeNull();
    expect(req.dbClient).toBeUndefined();
  });

  it('forces the system scope on a system path even when a per-user scope opened first', () => {
    // The global gate may open a per-user scope before a system-prefixed router
    // runs. The system carve-out must still win — a per-user scope would restrict
    // the cross-tenant admin console to the caller's org.
    const req = makeReq({ baseUrl: '/api/admin/master', path: '/orgs', user: { organizationId: '7', role: 'admin' } });
    const res = makeRes();
    let scopeInside: any;

    runWithTenantScope(
      { tenantId: '7', role: 'admin', source: 'request', caller: 'gate' },
      () => establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); }),
    );

    expect(scopeInside?.tenantId).toBe('0');
    expect(scopeInside?.role).toBe('app_super_admin');
    expect(req.dbClient).toBeTruthy();
  });

  it('is idempotent on a system path already under the system scope', () => {
    const req = makeReq({ baseUrl: '/api/tenant-export', path: '/', user: { organizationId: '7', role: 'admin' } });
    const res = makeRes();
    let scopeInside: any;

    runWithSystemTenantScope('system:GET /api/tenant-export', () =>
      establishRequestTenantScope(req, res as any, () => { scopeInside = getTenantScope(); }),
    );

    expect(scopeInside?.tenantId).toBe('0');
    expect(scopeInside?.role).toBe('app_super_admin');
    expect(req.dbClient).toBeUndefined(); // not re-attached — already system-scoped
  });
});

describe('establishRequestSystemScope', () => {
  it('opens the cross-tenant system scope and attaches a client', () => {
    const req = makeReq({ baseUrl: '/scim/v2', path: '/Users', user: undefined });
    const res = makeRes();
    let scopeInside: any;

    establishRequestSystemScope(req, res as any, () => { scopeInside = getTenantScope(); });

    expect(scopeInside?.tenantId).toBe('0');
    expect(scopeInside?.role).toBe('app_super_admin');
    expect(req.dbClient).toBeTruthy();
    res.finish();
    expect(req.dbClient).toBeNull();
  });
});

describe('isSystemScopedPath', () => {
  it('matches exact and sub-path, not sibling prefixes', () => {
    expect(isSystemScopedPath({ baseUrl: '/api/admin/master', path: '' } as any)).toBe(true);
    expect(isSystemScopedPath({ baseUrl: '/api/admin/master', path: '/orgs' } as any)).toBe(true);
    expect(isSystemScopedPath({ baseUrl: '/api/tenants', path: '/' } as any)).toBe(true);
    // The sibling tenant-* family is NOT system-scoped.
    expect(isSystemScopedPath({ baseUrl: '/api/tenant-users', path: '/' } as any)).toBe(false);
    expect(isSystemScopedPath({ baseUrl: '/api/widgets', path: '/x' } as any)).toBe(false);
  });

  it('every declared prefix is recognized', () => {
    for (const p of SYSTEM_SCOPE_PREFIXES) {
      expect(isSystemScopedPath({ baseUrl: p, path: '' } as any)).toBe(true);
    }
  });
});
