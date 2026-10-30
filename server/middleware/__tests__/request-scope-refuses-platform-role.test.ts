/**
 * A request's role string never opens the platform scope (D6, P-72 slice 1a;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/).
 *
 * establishRequestTenantScope opens the per-user scope of every authenticated
 * /api request and sends the request's role to app.current_user_role. In slice
 * 0 a request whose role was the string 'app_super_admin' read and updated
 * another tenant's rows through both the pool and the request's own client. The
 * request is now answered 403 before any scope is opened or client attached.
 * Real tenant store; only getPool is stubbed (the lazy client never connects).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../../db', () => ({ getPool: () => ({ connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) }) }));

import { establishRequestTenantScope } from '../establishRequestTenantScope';
import { getTenantScope } from '../../db/tenantStore';

function makeReq(role: string | null): any {
  return {
    method: 'GET',
    baseUrl: '',
    path: '/api/unified-tasks',
    user: { organizationId: '7', userId: 1, role },
    tenantContext: { organizationUuid: 'uuid-7' },
  };
}

function makeRes(): any {
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; res.emit('finish'); return res; });
  return res;
}

describe('establishRequestTenantScope and the platform role string', () => {
  for (const role of ['app_super_admin', 'APP_SUPER_ADMIN', ' app_super_admin ']) {
    it(`answers 403 for a request whose role is ${JSON.stringify(role)}, with no scope and no client`, () => {
      const req = makeReq(role);
      const res = makeRes();
      const next = vi.fn();
      establishRequestTenantScope(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({ error: { code: 'PLATFORM_SCOPE_ROLE_REFUSED' } });
      expect(req.dbClient).toBeUndefined();
      expect(req.tenantId).toBeUndefined();
      expect(getTenantScope()).toBeUndefined();
    });
  }

  it("opens the member's own scope for an ordinary role (control)", () => {
    const req = makeReq('admin');
    const res = makeRes();
    let inside: ReturnType<typeof getTenantScope>;
    establishRequestTenantScope(req, res, () => { inside = getTenantScope(); });
    expect(inside).toMatchObject({ tenantId: '7', role: 'admin', orgUuid: 'uuid-7', source: 'request' });
    expect(req.dbClient).toBeTruthy();
    res.emit('finish');
  });
});
