/**
 * Tenant-isolation / authZ contract test — tenant-users management.
 *
 * The tenant-users handlers trusted organizationId from the request body/params
 * with no check that the caller administers that org, so any authenticated user
 * could list, create, re-role, or remove users in any organization. Access is
 * now authorized against the *target* org: super_admin anywhere; otherwise the
 * caller must belong to the target org (membership for reads, admin/owner for
 * mutations).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState } = vi.hoisted(() => ({
  // callerRole = global JWT role; membershipRole = caller's role in the TARGET org
  authState: { callerRole: 'member' as string | null, membershipRole: null as string | null },
}));

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, _params: any[] = []) => {
      if (/SELECT role FROM organization_users WHERE user_id/i.test(sql)) {
        return { rows: authState.membershipRole ? [{ role: authState.membershipRole }] : [] };
      }
      return { rows: [] };
    }),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.callerRole = 'member';
  authState.membershipRole = null;

  const mod = await import('../../routes/tenant-users');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, role: authState.callerRole };
    (req as any).userRole = authState.callerRole;
    next();
  });
  app.use('/api/tenant-users', (mod as any).default);
});

describe('Tenant-users authorization', () => {
  it('GET /:tenantId — non-member of the target org is denied (403)', async () => {
    authState.membershipRole = null; // not a member of org 999
    await request(app).get('/api/tenant-users/999').expect(403);
  });

  it('GET /:tenantId — a member of the target org may list (200)', async () => {
    authState.membershipRole = 'member';
    await request(app).get('/api/tenant-users/999').expect(200);
  });

  it('GET /:tenantId — super_admin may list any org (200)', async () => {
    authState.callerRole = 'super_admin';
    authState.membershipRole = null;
    await request(app).get('/api/tenant-users/999').expect(200);
  });

  it('POST / — non-admin of the target org cannot create users (403)', async () => {
    authState.membershipRole = 'member';
    await request(app)
      .post('/api/tenant-users')
      .send({ email: 'x@y.com', name: 'New User', role: 'admin', organizationId: 999 })
      .expect(403);
  });

  it('DELETE /:org/:userId — non-admin of the target org cannot remove users (403)', async () => {
    authState.membershipRole = 'member';
    await request(app).delete('/api/tenant-users/999/42').expect(403);
  });

  it('PATCH /:org/:userId — non-member of the target org cannot re-role (403)', async () => {
    authState.membershipRole = null;
    await request(app).patch('/api/tenant-users/999/42').send({ role: 'admin' }).expect(403);
  });
});
