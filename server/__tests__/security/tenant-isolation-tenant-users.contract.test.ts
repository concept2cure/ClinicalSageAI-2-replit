/**
 * Tenant-isolation / authZ contract test — tenant-users management.
 *
 * The tenant-users handlers trusted organizationId from the request body/params
 * with no check that the caller administers that org, so any authenticated user
 * could list, create, re-role, or remove users in any organization. Access is
 * now authorized against the *target* org: platform super_admin standing (a
 * platform_role_grants row, never the request role — D6, 2026-10-05) anywhere;
 * otherwise the caller must belong to the target org (membership for reads,
 * admin/owner for mutations).
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

const { authState, dbState, emailState } = vi.hoisted(() => ({
  // callerRole = the request role (req.userRole / req.user.role) — behind
  // server/auth.ts that is the TENANT membership role, never platform standing;
  // membershipRole = caller's role in the TARGET org;
  // sessionOrgId = the tenant the caller's session carries (body may omit it);
  // platformGrant = the platform role an active platform_role_grants row names
  // for the caller (user 1), null = none. Added 2026-10-05 (D6,
  // docs/evidence/D6/2026-10-05-cross-tenant-staff/): staff standing is that row.
  authState: {
    callerRole: 'member' as string | null,
    membershipRole: null as string | null,
    sessionOrgId: null as number | null,
    platformGrant: null as string | null,
  },
  emailState: { configured: false, sent: [] as unknown[][] },
  dbState: {
    // id of an existing user found by email (null = email not registered)
    existingUserIdByEmail: null as number | null,
    // is that user already a member of the target org?
    invitedUserInTargetOrg: false,
    // a stored organization_invitations row (null = none)
    invitation: null as Record<string, unknown> | null,
    // make the activation-token UPDATE fail (the account is already committed)
    tokenStoreFails: false,
    // a member of the target org who never redeemed their setup link (null = none)
    unredeemedInvitee: null as { id: number; name: string; role: string } | null,
    // every SQL statement executed through the mocked pool/client
    executed: [] as Array<{ sql: string; params: unknown[] }>,
  },
}));

function executedMatching(re: RegExp) {
  return dbState.executed.filter(q => re.test(q.sql));
}

async function fakeQuery(sql: string, params: unknown[] = []) {
  dbState.executed.push({ sql, params });

  // authorizeOrgAccess: platform staff standing (requirePlatformAdmin.ts
  // holdsPlatformRole, via `query` from server/db) — the caller's grant row
  if (/FROM platform_role_grants/i.test(sql)) {
    const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
    const granted = authState.platformGrant;
    return { rows: granted && Number(params[0]) === 1 && asked.includes(granted) ? [{ '?column?': 1 }] : [] };
  }
  // authorizeOrgAccess: caller's role in the target org
  if (/SELECT role FROM organization_users WHERE user_id/i.test(sql)) {
    return { rows: authState.membershipRole ? [{ role: authState.membershipRole }] : [] };
  }
  // atomic quota service: the organization row lock (the member ceiling is
  // organizations.max_users — there is no organization-keyed licence row)
  if (/FROM organizations WHERE id = \$1 FOR UPDATE/i.test(sql)) {
    return { rows: [{ max_projects: 10, max_users: 100 }] };
  }
  // atomic quota service: current member count
  if (/SELECT COUNT\(\*\) as count FROM organization_users WHERE organization_id/i.test(sql)) {
    return { rows: [{ count: '1' }] };
  }
  // re-issue: a member of the target org whose password hash is still the invitation's
  if (/password_hash LIKE \$3/i.test(sql)) {
    return { rows: dbState.unredeemedInvitee ? [dbState.unredeemedInvitee] : [] };
  }
  // invite dedupe: does this address already have an account? One row, the id
  // or null (public.user_id_for_email — the id is all that crosses tenants).
  if (/SELECT public\.user_id_for_email\(\$1\) AS id/i.test(sql)) {
    return { rows: [{ id: dbState.existingUserIdByEmail ?? null }] };
  }
  // invite dedupe: is the invited user already in the target org?
  if (/SELECT id FROM organization_users WHERE user_id/i.test(sql)) {
    return { rows: dbState.invitedUserInTargetOrg ? [{ id: 77 }] : [] };
  }
  // pending-invitation idempotency probe
  if (/SELECT id FROM organization_invitations/i.test(sql)) {
    return { rows: [] };
  }
  // the invitee's own invitations, whichever organization issued them
  // (public.invitations_for_member: the named user's only, and in SQL only for
  // a member of the calling scope's organization); optionally one by id
  if (/FROM public\.invitations_for_member\(\$1\)/i.test(sql)) {
    const inv = dbState.invitation;
    const mine = inv && Number(inv.user_id) === Number(params[0]) ? [inv] : [];
    return {
      rows: params.length > 1 ? mine.filter(i => Number(i.id) === Number(params[1])) : mine,
    };
  }
  // the decline, written in the inviting organization's scope, reaches its row
  if (/UPDATE organization_invitations\s+SET status = 'declined'/i.test(sql)) {
    return { rows: [], rowCount: 1 };
  }
  // load an invitation by id (the accept transaction, in the inviting org's scope)
  if (/FROM organization_invitations\s+WHERE id = \$1/i.test(sql)) {
    return { rows: dbState.invitation ? [dbState.invitation] : [] };
  }
  if (/INSERT INTO organization_invitations/i.test(sql)) {
    return { rows: [{ id: 501 }] };
  }
  // new-user creation path: the id is drawn from the sequence first (RETURNING
  // is held to the users SELECT policy), then inserted explicitly
  if (/SELECT nextval\(pg_get_serial_sequence\('public\.users', 'id'\)\)/i.test(sql)) {
    return { rows: [{ id: 88 }] };
  }
  if (/INSERT INTO users/i.test(sql)) {
    return { rows: [], rowCount: 1 };
  }
  // invitation issuance: storing the activation token hash on the user row
  if (/UPDATE users SET reset_token/i.test(sql)) {
    if (dbState.tokenStoreFails) throw new Error('connection terminated');
    return { rows: [], rowCount: 1 };
  }
  // invitation issuance: the organization's display name for the email
  if (/SELECT name FROM organizations WHERE id/i.test(sql)) {
    return { rows: [{ name: 'Target Org' }] };
  }
  return { rows: [] };
}

/** server/db/runtime.ts transaction(): BEGIN, the callback, COMMIT (ROLLBACK on throw), recorded. */
async function fakeTransaction(cb: (client: unknown) => Promise<unknown>) {
  const client = { query: vi.fn(fakeQuery), release: vi.fn() };
  await client.query('BEGIN');
  try {
    const out = await cb(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

vi.mock('../../services/emailService', () => ({
  isEmailConfigured: () => emailState.configured,
  sendInvitationEmail: vi.fn(async (...args: unknown[]) => {
    emailState.sent.push(args);
    return emailState.configured;
  }),
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  // A role change or removal writes its chained row on the change's transaction (P1-41).
  writeChainedAuditRow: vi.fn(async () => undefined),
}));

// `query` answers the platform-grant lookup (holdsPlatformRole); added 2026-10-05 (D6).
vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(fakeQuery),
    connect: vi.fn(async () => ({
      query: vi.fn(fakeQuery),
      release: vi.fn(),
    })),
  },
  query: vi.fn(fakeQuery),
  transaction: vi.fn(fakeTransaction),
}));

// atomicQuotaService.js imports the pool via '../db.js' (the same module as '../db')
vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(fakeQuery),
    connect: vi.fn(async () => ({
      query: vi.fn(fakeQuery),
      release: vi.fn(),
    })),
  },
  query: vi.fn(fakeQuery),
  transaction: vi.fn(fakeTransaction),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.callerRole = 'member';
  authState.membershipRole = null;
  authState.sessionOrgId = null;
  authState.platformGrant = null;
  emailState.configured = false;
  emailState.sent = [];
  dbState.existingUserIdByEmail = null;
  dbState.invitedUserInTargetOrg = false;
  dbState.invitation = null;
  dbState.tokenStoreFails = false;
  dbState.unredeemedInvitee = null;
  dbState.executed = [];

  const mod = await import('../../routes/tenant-users');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, role: authState.callerRole, organizationId: authState.sessionOrgId };
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

  // Inverted 2026-10-05 (D6): the request role is the tenant membership role; standing is a platform grant — docs/evidence/D6/2026-10-05-cross-tenant-staff/
  it('GET /:tenantId — a request role of super_admin with no platform grant may not list another org (403)', async () => {
    authState.callerRole = 'super_admin';
    authState.membershipRole = null;
    await request(app).get('/api/tenant-users/999').expect(403);
  });

  it('GET /:tenantId — a super_admin platform grant holder may list any org (200)', async () => {
    authState.platformGrant = 'super_admin';
    authState.membershipRole = null;
    await request(app).get('/api/tenant-users/999').expect(200);
    // Staff standing answered; the target org's membership was never consulted.
    expect(executedMatching(/SELECT role FROM organization_users WHERE user_id/i)).toEqual([]);
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

  // D6, 2026-10-05 (docs/evidence/D6/2026-10-05-cross-tenant-staff/): behind
  // server/auth.ts req.userRole is organization_users.role (no CHECK). A
  // membership row naming super_admin administered every organization's users.
  it('a membership role of super_admin with no platform grant cannot administer another org\'s users (403, nothing written)', async () => {
    authState.callerRole = 'super_admin';
    authState.membershipRole = null; // not a member of org 999
    await request(app)
      .post('/api/tenant-users')
      .send({ email: 'x@y.com', name: 'New User', role: 'admin', organizationId: 999 })
      .expect(403);
    await request(app).patch('/api/tenant-users/999/42').send({ role: 'admin', reason: 'Promotion' }).expect(403);
    await request(app).delete('/api/tenant-users/999/42').send({ reason: 'Left the company' }).expect(403);
    expect(executedMatching(/INSERT INTO|UPDATE organization_users|DELETE FROM organization_users/i)).toEqual([]);
  });

  it('a super_admin platform grant holder administers another org\'s users (membership role member, not a member of the target)', async () => {
    authState.platformGrant = 'super_admin';
    authState.membershipRole = null;
    await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member', organizationId: 999 })
      .expect(201);
    expect(executedMatching(/INSERT INTO organization_users/i)).toHaveLength(1);
    await request(app).delete('/api/tenant-users/999/42').send({ reason: 'Left the company' });
    expect(executedMatching(/DELETE FROM organization_users/i)).toHaveLength(1);
  });

  it.each(['platform_admin', 'support'])('a %s platform grant is not super_admin standing for tenant users (403)', async (granted) => {
    authState.platformGrant = granted;
    authState.membershipRole = null;
    await request(app).get('/api/tenant-users/999').expect(403);
    await request(app).delete('/api/tenant-users/999/42').send({ reason: 'Left the company' }).expect(403);
    expect(executedMatching(/DELETE FROM organization_users/i)).toEqual([]);
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
    // …and the quota was decided from the organization row, never a licence.
    expect(executedMatching(/licenses|license_users/i).length).toBe(0);
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

  it('POST / — a body with no organizationId targets the caller’s session organization', async () => {
    authState.membershipRole = 'admin';
    authState.sessionOrgId = 999;

    await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member' })
      .expect(201);

    // The admin check, the quota lock and the membership all name org 999.
    const membershipCheck = executedMatching(/SELECT role FROM organization_users WHERE user_id/i);
    expect(membershipCheck[0].params).toEqual([1, 999]);
    expect(executedMatching(/FROM organizations WHERE id = \$1 FOR UPDATE/i)[0].params).toEqual([999]);
    expect(executedMatching(/INSERT INTO organization_users/i)[0].params).toContain(999);
  });

  it('POST / — with no session organization and no body organizationId, 400 (never a guessed tenant)', async () => {
    authState.membershipRole = 'admin';
    authState.sessionOrgId = null;
    await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member' })
      .expect(400);
    expect(executedMatching(/INSERT INTO/i).length).toBe(0);
  });

  it('POST / — a NEW account cannot sign in until it redeems the setup link; without SMTP the admin gets the link', async () => {
    authState.membershipRole = 'admin';
    emailState.configured = false;

    const res = await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member', organizationId: 999 })
      .expect(201);

    // The users row carries an UNUSABLE password hash and must_change_password.
    const insert = executedMatching(/INSERT INTO users/i);
    expect(insert.length).toBe(1);
    expect(insert[0].sql).toMatch(/password_hash/);
    expect(insert[0].sql).toMatch(/must_change_password/);
    expect(String(insert[0].params[5])).toMatch(/^invite:[0-9a-f-]{36}$/);

    // A setup token was stored HASHED, with an expiry ~21 days out …
    const stored = executedMatching(/UPDATE users SET reset_token = \$1, reset_token_expires_at = \$2/i);
    expect(stored.length).toBe(1);
    const [tokenHash, expiresAt, userId] = stored[0].params as [string, Date, number];
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(userId).toBe(88);
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(20.9);
    expect(days).toBeLessThan(21.1);

    // … and the response tells the truth: nothing was emailed, here is the link,
    // and the link's raw token is the one whose hash was stored.
    expect(res.body.invitation).toMatchObject({ delivery: 'link', emailSent: false });
    expect(res.body.invitation.expiresAt).toBe(expiresAt.toISOString());
    const url = new URL(res.body.invitation.setupUrl);
    expect(url.pathname).toBe('/concept2cure/password-reset');
    const rawToken = url.searchParams.get('token') as string;
    const { hashPasswordSetupToken } = await import('../../services/password-setup-token');
    expect(hashPasswordSetupToken(rawToken)).toBe(tokenHash);
    expect(emailState.sent.length).toBe(0);
  });

  it('POST / — when the activation link cannot be issued, the 201 says so instead of claiming a 500', async () => {
    authState.membershipRole = 'admin';
    dbState.tokenStoreFails = true;

    const res = await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member', organizationId: 999 })
      .expect(201);

    // The membership was committed before the token step …
    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(1);
    // … and the admin is told the account cannot sign in yet, with no link to hand over.
    expect(res.body.invitation).toMatchObject({ delivery: 'failed', emailSent: false, expiresAt: null });
    expect(res.body.invitation.setupUrl).toBeUndefined();
    expect(emailState.sent.length).toBe(0);
  });

  it('POST / — in production with no public origin, nothing is created and the admin is told why (503)', async () => {
    // A new member's activation link is built on APP_URL only in production,
    // never the Host header (D6). Creating the account and then failing to
    // link it left a member who could neither sign in, reset, nor be re-invited.
    const saved = { NODE_ENV: process.env.NODE_ENV, APP_URL: process.env.APP_URL };
    process.env.NODE_ENV = 'production';
    delete process.env.APP_URL;
    try {
      authState.membershipRole = 'admin';
      const res = await request(app)
        .post('/api/tenant-users')
        .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member', organizationId: 999 })
        .expect(503);
      expect(res.body.error).toBe('PUBLIC_ORIGIN_NOT_CONFIGURED');
      expect(executedMatching(/INSERT INTO (users|organization_users|organization_invitations)/i)).toEqual([]);
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.APP_URL === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = saved.APP_URL;
    }
  });

  it('POST / — with SMTP configured the invitation is emailed and the link is NOT echoed back', async () => {
    authState.membershipRole = 'admin';
    emailState.configured = true;

    const res = await request(app)
      .post('/api/tenant-users')
      .send({ email: 'brand-new@example.com', name: 'Brand New', role: 'member', organizationId: 999 })
      .expect(201);

    expect(res.body.invitation).toMatchObject({ delivery: 'email', emailSent: true });
    expect(res.body.invitation.setupUrl).toBeUndefined();
    expect(emailState.sent.length).toBe(1);
    const [to, , orgName, setupUrl, expiresAt] = emailState.sent[0] as [string, string, string, string, Date];
    expect(to).toBe('brand-new@example.com');
    expect(orgName).toBe('Target Org');
    expect(setupUrl).toMatch(/\/concept2cure\/password-reset\?token=[0-9a-f]{64}$/);
    expect(expiresAt).toBeInstanceOf(Date);
  });

  it('GET /invitations/mine — lists only the caller-scoped pending invitations (200)', async () => {
    await request(app).get('/api/tenant-users/invitations/mine').expect(200);

    // The invitations live in the inviting organizations' rows, so they are
    // read through invitations_for_member, keyed on the session user's id.
    const selects = executedMatching(/FROM public\.invitations_for_member\(\$1\)/i);
    expect(selects.length).toBe(1);
    expect(selects[0].params).toEqual([1]);
    expect(executedMatching(/FROM organization_invitations/i)).toEqual([]);
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

  // 404, not 403: the lookup finds only the caller's own invitations, so
  // another person's is not disclosed to exist (D3, 2026-09-28).
  it("POST /invitations/:id/accept — a stranger cannot accept someone else's invitation (404)", async () => {
    dbState.invitation = { ...pendingInvitation(), user_id: 2 }; // invited user is NOT the caller

    await request(app).post('/api/tenant-users/invitations/5/accept').expect(404);

    expect(executedMatching(/INSERT INTO organization_users/i).length).toBe(0);
    expect(
      executedMatching(/UPDATE organization_invitations\s+SET status = 'accepted'/i).length
    ).toBe(0);
  });

  it("POST /invitations/:id/decline — a stranger cannot decline someone else's invitation (404)", async () => {
    dbState.invitation = { ...pendingInvitation(), user_id: 2 };

    await request(app).post('/api/tenant-users/invitations/5/decline').expect(404);

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

/**
 * Ported from abandoned PR #973 (hunk b). An admin could demote or remove
 * THEMSELVES — the last admin of an org could lock every administrator out of
 * it with one request, and no one would be left who could undo it. Self
 * role-change and self-removal are refused; the same admin acting on someone
 * else is unaffected. The caller in these tests is user id 1.
 */
describe('Tenant-users self-modification (#973 port)', () => {
  it('PATCH /:org/:self — an admin cannot change their own role (400, no UPDATE)', async () => {
    authState.membershipRole = 'admin';
    const res = await request(app).patch('/api/tenant-users/999/1').send({ role: 'viewer' }).expect(400);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
    expect(executedMatching(/UPDATE organization_users/i).length).toBe(0);
  });

  it('DELETE /:org/:self — an admin cannot remove themselves (400, no DELETE)', async () => {
    authState.membershipRole = 'admin';
    const res = await request(app).delete('/api/tenant-users/999/1').expect(400);
    expect(res.body.code).toBe('SELF_REMOVAL');
    expect(executedMatching(/DELETE FROM organization_users/i).length).toBe(0);
  });

  it('super_admin is refused on self too — the guard is about the caller, not the role', async () => {
    // Platform staff standing is a super_admin grant row (was callerRole =
    // 'super_admin', a request role; D6, 2026-10-05).
    authState.platformGrant = 'super_admin';
    await request(app).delete('/api/tenant-users/999/1').expect(400);
    expect(executedMatching(/DELETE FROM organization_users/i).length).toBe(0);
  });

  it('a non-member is still told 403 first — the self check never discloses past authZ', async () => {
    authState.membershipRole = null;
    await request(app).patch('/api/tenant-users/999/1').send({ role: 'admin' }).expect(403);
  });

  it('an admin acting on ANOTHER user still reaches the write', async () => {
    authState.membershipRole = 'admin';
    // A removal states its reason (P1-41); without one it is refused before the write.
    await request(app).delete('/api/tenant-users/999/42').send({ reason: 'Left the company' });
    expect(executedMatching(/DELETE FROM organization_users/i).length).toBe(1);
  });
});

/**
 * QA 2026-10-08 (j9, finding 5): an invitation's setup link was handed to the
 * administrator once (toast / clipboard) and could not be had again; the
 * invitee's only way in was "Forgot password". Inviting the same address again
 * through the invitation route now re-issues the link for a member of the
 * target organization who never set a password: a new token replaces the old
 * one (the old link stops working), delivered the way the first was. An
 * activated member is still refused, so no administrator can reset another
 * person's password by re-inviting them. No seat or quota is consumed.
 */
describe('Re-issuing an invitation (POST / for a member who never activated)', () => {
  const reinvite = (body: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/tenant-users')
      .send({ email: 'pat.pending@example.com', name: 'Pat Pending', role: 'admin', organizationId: 999, ...body });

  it('replaces the setup token, returns the new link, keeps the stored role, creates nothing (200)', async () => {
    authState.membershipRole = 'admin';
    dbState.unredeemedInvitee = { id: 20, name: 'Pat Pending', role: 'manager' };

    const res = await reinvite().expect(200);

    expect(res.body).toMatchObject({ reissued: true, id: 20, role: 'manager' });
    expect(res.body.invitation).toMatchObject({ delivery: 'link', emailSent: false });
    const stored = executedMatching(/UPDATE users SET reset_token = \$1, reset_token_expires_at = \$2/i);
    expect(stored).toHaveLength(1);
    expect(stored[0].params[2]).toBe(20);
    const rawToken = new URL(res.body.invitation.setupUrl).searchParams.get('token') as string;
    const { hashPasswordSetupToken } = await import('../../services/password-setup-token');
    expect(hashPasswordSetupToken(rawToken)).toBe(stored[0].params[0]);
    expect(executedMatching(/INSERT INTO|FOR UPDATE/i)).toEqual([]);
    const auditService = (await import('../../services/auditService')).default as unknown as { logAction: ReturnType<typeof vi.fn> };
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_invited', resourceId: '20', details: expect.objectContaining({ reissued: true, role: 'manager' }) }),
    );
  });

  it('looks only in the target organization, and only at an unredeemed invitation hash', async () => {
    authState.membershipRole = 'admin';
    await reinvite();
    const lookup = executedMatching(/password_hash LIKE \$3/i);
    expect(lookup).toHaveLength(1);
    expect(lookup[0].params).toEqual([999, 'pat.pending@example.com', 'invite:%']);
  });

  it('an activated member is still refused (400 USER_EXISTS), and no token is written', async () => {
    authState.membershipRole = 'admin';
    dbState.existingUserIdByEmail = 42;
    dbState.invitedUserInTargetOrg = true;
    const res = await reinvite().expect(400);
    expect(res.body.error).toBe('USER_EXISTS');
    expect(executedMatching(/UPDATE users SET reset_token/i)).toEqual([]);
  });

  it('a non-admin of the target organization is refused before any lookup (403)', async () => {
    authState.membershipRole = 'member';
    dbState.unredeemedInvitee = { id: 20, name: 'Pat Pending', role: 'manager' };
    await reinvite().expect(403);
    expect(executedMatching(/password_hash LIKE|UPDATE users SET reset_token/i)).toEqual([]);
  });

  it('with SMTP configured the new link is emailed and not echoed back', async () => {
    authState.membershipRole = 'admin';
    emailState.configured = true;
    dbState.unredeemedInvitee = { id: 20, name: 'Pat Pending', role: 'manager' };
    const res = await reinvite().expect(200);
    expect(res.body.invitation).toMatchObject({ delivery: 'email', emailSent: true });
    expect(res.body.invitation.setupUrl).toBeUndefined();
    expect(emailState.sent).toHaveLength(1);
  });
});
