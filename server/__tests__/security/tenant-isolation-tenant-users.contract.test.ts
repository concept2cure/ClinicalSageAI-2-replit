/**
 * Tenant-isolation / authZ contract test — tenant-users management.
 *
 * The tenant-users handlers trusted organizationId from the request body/params
 * with no check that the caller administers that org, so any authenticated user
 * could list, create, re-role, or remove users in any organization. Access is
 * now authorized against the *target* org: super_admin anywhere; otherwise the
 * caller must belong to the target org (membership for reads, admin/owner for
 * mutations).
 *
 * Also covers invite-by-email consent for EXISTING cross-org users
 * (decision-register item 12, issue #727): inviting an email that already
 * belongs to a user in another organization must create a PENDING invitation
 * (organization_invitations) instead of silently inserting an
 * organization_users membership. Membership is only created when the invited
 * user accepts; accept/decline are self-only.
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

const { authState, dbState } = vi.hoisted(() => ({
  // callerRole = global JWT role; membershipRole = caller's role in the TARGET org
  authState: { callerRole: 'member' as string | null, membershipRole: null as string | null },
  dbState: {
    // id of an existing user found by email (null = email not registered)
    existingUserIdByEmail: null as number | null,
    // is that user already a member of the target org?
    invitedUserInTargetOrg: false,
    // a stored organization_invitations row (null = none)
    invitation: null as Record<string, unknown> | null,
    // every SQL statement executed through the mocked pool/client
    executed: [] as Array<{ sql: string; params: unknown[] }>,
  },
}));

function executedMatching(re: RegExp) {
  return dbState.executed.filter(q => re.test(q.sql));
}

async function fakeQuery(sql: string, params: unknown[] = []) {
  dbState.executed.push({ sql, params });

  // authorizeOrgAccess: caller's role in the target org
  if (/SELECT role FROM organization_users WHERE user_id/i.test(sql)) {
    return { rows: authState.membershipRole ? [{ role: authState.membershipRole }] : [] };
  }
  // atomic quota service: active license lock
  if (/FROM licenses/i.test(sql)) {
    return { rows: [{ id: 10, organization_id: 999, max_users: 100, status: 'active' }] };
  }
  // atomic quota service: license seat count
  if (/SELECT COUNT\(\*\) as count\s+FROM license_users/i.test(sql)) {
    return { rows: [{ count: '1' }] };
  }
  // invite dedupe: look up an existing user by email
  if (/SELECT id FROM users WHERE email/i.test(sql)) {
    return {
      rows: dbState.existingUserIdByEmail ? [{ id: dbState.existingUserIdByEmail }] : [],
    };
  }
  // invite dedupe: is the invited user already in the target org?
  if (/SELECT id FROM organization_users WHERE user_id/i.test(sql)) {
    return { rows: dbState.invitedUserInTargetOrg ? [{ id: 77 }] : [] };
  }
  // pending-invitation idempotency probe
  if (/SELECT id FROM organization_invitations/i.test(sql)) {
    return { rows: [] };
  }
  // load an invitation by id (accept/decline paths)
  if (/FROM organization_invitations\s+WHERE id = \$1/i.test(sql)) {
    return { rows: dbState.invitation ? [dbState.invitation] : [] };
  }
  if (/INSERT INTO organization_invitations/i.test(sql)) {
    return { rows: [{ id: 501 }] };
  }
  // new-user creation path returns the created id
  if (/INSERT INTO users/i.test(sql)) {
    return { rows: [{ id: 88 }] };
  }
  return { rows: [] };
}

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(fakeQuery),
    connect: vi.fn(async () => ({
      query: vi.fn(fakeQuery),
      release: vi.fn(),
    })),
  },
}));

// atomicQuotaService.js imports the pool via '../db.js'
vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(fakeQuery),
    connect: vi.fn(async () => ({
      query: vi.fn(fakeQuery),
      release: vi.fn(),
    })),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.callerRole = 'member';
  authState.membershipRole = null;
  dbState.existingUserIdByEmail = null;
  dbState.invitedUserInTargetOrg = false;
  dbState.invitation = null;
  dbState.executed = [];

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

describe('Cross-org invite consent (decision-register #12, issue #727)', () => {
  const pendingInvitation = () => ({
    id: 5,
    organization_id: 999,
    user_id: 1, // caller in these tests is user id 1
    email: 'existing@other-org.com',
    role: 'member',
    status: 'pending',
  });

  it('POST / — inviting an EXISTING user from another org creates a PENDING invitation, not a membership (202)', async () => {
    authState.membershipRole = 'admin';
    dbState.existingUserIdByEmail = 42; // email already registered to another org's user
    dbState.invitedUserInTargetOrg = false;

    const res = await request(app)
      .post('/api/tenant-users')
      .send({
        email: 'existing@other-org.com',
        name: 'Existing User',
        role: 'member',
        organizationId: 999,
      })
      .expect(202);

    expect(res.body.pendingInvitation).toBe(true);
    expect(res.body.data?.status).toBe('pending');

    // A pending invitation row was written…
    expect(executedMatching(/INSERT INTO organization_invitations/i).length).toBe(1);
    // …and NO membership was silently created.
    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(0);
    expect(executedMatching(/INSERT INTO license_users/i).length).toBe(0);
  });

  it('POST / — inviting a NEW (unregistered) email keeps the current flow: user + membership created (201)', async () => {
    authState.membershipRole = 'admin';
    dbState.existingUserIdByEmail = null; // email not registered anywhere

    await request(app)
      .post('/api/tenant-users')
      .send({
        email: 'brand-new@example.com',
        name: 'Brand New',
        role: 'member',
        organizationId: 999,
      })
      .expect(201);

    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(1);
    expect(executedMatching(/INSERT INTO organization_invitations/i).length).toBe(0);
  });

  it('GET /invitations/mine — lists only the caller-scoped pending invitations (200)', async () => {
    await request(app).get('/api/tenant-users/invitations/mine').expect(200);

    const selects = executedMatching(/FROM organization_invitations/i);
    expect(selects.length).toBe(1);
    // self-only: scoped to the session user's id
    expect(selects[0].sql).toMatch(/user_id = \$1/i);
    expect(selects[0].params).toEqual([1]);
  });

  it('POST /invitations/:id/accept — the invited user accepting creates the membership and marks accepted (200)', async () => {
    dbState.invitation = pendingInvitation();

    const res = await request(app).post('/api/tenant-users/invitations/5/accept').expect(200);
    expect(res.body.success).toBe(true);

    const membershipInserts = executedMatching(/INSERT INTO organization_users/i);
    expect(membershipInserts.length).toBe(1);
    // org-scoped write: organization_id is carried explicitly
    expect(membershipInserts[0].sql).toMatch(/organization_id/);
    expect(membershipInserts[0].params).toEqual([999, 1, 'member']);

    const statusUpdates = executedMatching(
      /UPDATE organization_invitations\s+SET status = 'accepted'/i
    );
    expect(statusUpdates.length).toBe(1);
  });

  it("POST /invitations/:id/decline — declining marks declined and does NOT create a membership (200)", async () => {
    dbState.invitation = pendingInvitation();

    await request(app).post('/api/tenant-users/invitations/5/decline').expect(200);

    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(0);
    expect(
      executedMatching(/UPDATE organization_invitations\s+SET status = 'declined'/i).length
    ).toBe(1);
  });

  it("POST /invitations/:id/accept — a stranger cannot accept someone else's invitation (403)", async () => {
    dbState.invitation = { ...pendingInvitation(), user_id: 2 }; // invited user is NOT the caller

    await request(app).post('/api/tenant-users/invitations/5/accept').expect(403);

    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(0);
    expect(
      executedMatching(/UPDATE organization_invitations\s+SET status = 'accepted'/i).length
    ).toBe(0);
  });

  it("POST /invitations/:id/decline — a stranger cannot decline someone else's invitation (403)", async () => {
    dbState.invitation = { ...pendingInvitation(), user_id: 2 };

    await request(app).post('/api/tenant-users/invitations/5/decline').expect(403);

    expect(
      executedMatching(/UPDATE organization_invitations\s+SET status = 'declined'/i).length
    ).toBe(0);
  });

  it('POST /invitations/:id/accept — already-responded invitation is rejected (409)', async () => {
    dbState.invitation = { ...pendingInvitation(), status: 'declined' };

    await request(app).post('/api/tenant-users/invitations/5/accept').expect(409);
    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(0);
  });
});
