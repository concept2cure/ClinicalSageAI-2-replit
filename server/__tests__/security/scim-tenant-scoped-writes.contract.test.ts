/**
 * Contract test: a SCIM tenant's writes stay inside its own membership
 * (SECURITY_AUDIT_2026-09-24 IAM-05, plan item P0-5).
 *
 * `users` is a global table; tenancy is the `organization_users` row. The rule
 * under test: a SCIM tenant may change `users.status` or `users.name` only when
 * it is the user's SOLE organisation. Otherwise
 *   - DELETE and an `active=false` PATCH/PUT remove the caller's membership row
 *     and leave `users.status` alone (the account stays active for its other
 *     organisations);
 *   - a rename is refused with 403 `mutability` (the name is printed on §11.50
 *     signature manifests, so one tenant's IdP must not rewrite it for another);
 *   - POST with an existing e-mail never writes `users.status` (an IdP cannot
 *     reactivate a platform-suspended account by re-provisioning it);
 *   - an `active=true` PATCH/PUT is a no-op on status and the response reflects
 *     what is stored.
 * For a sole-organisation user today's contract stands: DELETE issues the
 * global `UPDATE users SET status = 'inactive'` that
 * tests/db/account-standing.dbtest.ts:92-97 relies on.
 *
 * Assertions are on the SQL the fake pool received, not only on the response.
 * Data layer is mocked — no DB needed. Since P1-49 (2026-10-01) each write and
 * its audit event share a transaction; a transaction's statements reach the
 * same fake pool unless a test gives the transaction's client its own answers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';

const { queryMock, clientQueryMock, tenantEntitledMock, invalidateMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  tenantEntitledMock: vi.fn(async () => true),
  invalidateMock: vi.fn(),
}));

vi.mock('../../services/tenant/tenant-lifecycle.js', () => ({
  shouldProcessTenantInBackground: tenantEntitledMock,
}));

vi.mock('../../db', () => ({
  query: queryMock,
  transaction: async (cb: (client: unknown) => Promise<unknown>) =>
    cb({
      query: async (sql: string, params?: unknown[]) =>
        (await clientQueryMock(sql, params)) ?? queryMock(sql, params),
    }),
}));

vi.mock('../../middleware/orgMembership', () => ({
  invalidateOrgMembershipCache: invalidateMock,
}));

const TOKEN = 'test-scim-token-value';
const ORG = 7;
const USER_ID = 100;

interface FakeUser {
  id: number;
  email: string;
  name: string;
  status: string;
}

const JANE: FakeUser = { id: USER_ID, email: 'jane@acme.test', name: 'Jane Doe', status: 'active' };

/**
 * Install a fake pool. `orgCount` answers the membership-count query; `null`
 * leaves the count row out entirely (the fail-closed case). `user` is the row
 * the membership check and every read-back return.
 */
function fakePool(opts: { orgCount: number | null; user?: FakeUser }): void {
  const user = opts.user ?? JANE;
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM scim_tenants|FROM scim_ip_allowlist/i.test(sql)) return { rows: [] };
    if (/SELECT COUNT\(\*\)[\s\S]*FROM organization_users\s+WHERE user_id/i.test(sql)) {
      return opts.orgCount === null ? { rows: [] } : { rows: [{ count: opts.orgCount }] };
    }
    // membership check (JOIN organization_users ... WHERE u.id = $2)
    if (/JOIN organization_users ou [\s\S]* WHERE u\.id/i.test(sql)) return { rows: [{ ...user }] };
    if (/DELETE FROM organization_users/i.test(sql)) return { rows: [{ id: 1 }], rowCount: 1 };
    if (/UPDATE users SET/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/INSERT INTO audit_events/i.test(sql)) return { rows: [] };
    if (/SELECT id, email, name, status/i.test(sql)) return { rows: [{ ...user }] };
    return { rows: [] };
  });
}

type Call = [string, unknown[] | undefined];
const calls = (mock: { mock: { calls: unknown[][] } }): Call[] =>
  mock.mock.calls.map(c => [String(c[0]), c[1] as unknown[] | undefined]);
const sqlMatching = (mock: { mock: { calls: unknown[][] } }, re: RegExp): Call[] =>
  calls(mock).filter(([sql]) => re.test(sql));

const USERS_STATUS_WRITE = /UPDATE users SET[\s\S]*status/i;
const USERS_NAME_WRITE = /UPDATE users SET[\s\S]*name\s*=/i;
const MEMBERSHIP_DELETE = /DELETE FROM organization_users/i;
const AUDIT_INSERT = /INSERT INTO audit_events/i;

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  clientQueryMock.mockReset();
  tenantEntitledMock.mockResolvedValue(true);
  const router = (await import('../../routes/scim')).default;
  app = express();
  app.use('/scim/v2', router);
});

// ─────────────────────────────────────────────────────────────────────────────
// A user who belongs to TWO organisations: the caller (7) and another one.
// ─────────────────────────────────────────────────────────────────────────────

describe('SCIM tenant-scoped writes — user in more than one organisation', () => {
  beforeEach(() => fakePool({ orgCount: 2 }));

  it('DELETE removes the caller\'s membership row and never touches users.status (204)', async () => {
    const res = await request(app)
      .delete(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(204);

    const del = sqlMatching(queryMock, MEMBERSHIP_DELETE);
    expect(del).toHaveLength(1);
    expect(del[0][1]).toEqual([USER_ID, ORG]);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);

    expect(invalidateMock).toHaveBeenCalledWith(USER_ID, ORG);

    const audit = sqlMatching(queryMock, AUDIT_INSERT).find(c => c[1]?.[1] === 'scim.user.deactivated');
    expect(audit).toBeTruthy();
    expect(String(audit?.[1]?.[4])).toMatch(/other organi[sz]ations/i);
  });

  it('PATCH active=false removes the caller\'s membership row and never touches users.status (200, active=false)', async () => {
    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);

    const del = sqlMatching(queryMock, MEMBERSHIP_DELETE);
    expect(del).toHaveLength(1);
    expect(del[0][1]).toEqual([USER_ID, ORG]);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(invalidateMock).toHaveBeenCalledWith(USER_ID, ORG);

    const audit = sqlMatching(queryMock, AUDIT_INSERT).find(c => c[1]?.[1] === 'scim.user.deactivated');
    expect(audit).toBeTruthy();
  });

  it('PUT with a new displayName is refused: 403, scimType mutability, no write', async () => {
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: JANE.email,
        displayName: 'Jane Renamed',
        active: true,
      });

    expect(res.status).toBe(403);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
    expect(res.body.scimType).toBe('mutability');
    expect(String(res.body.detail)).toMatch(/owning organi[sz]ation/i);

    expect(sqlMatching(queryMock, USERS_NAME_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(0);
  });

  it('PATCH replace displayName is refused: 403, scimType mutability, no write', async () => {
    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'displayName', value: 'Jane Renamed' }],
      });

    expect(res.status).toBe(403);
    expect(res.body.scimType).toBe('mutability');
    expect(sqlMatching(queryMock, USERS_NAME_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
  });

  it('PUT with the SAME name and active=false still deprovisions (membership removed, not 403)', async () => {
    // Okta replaces the whole profile on deactivation; an unchanged name must
    // not turn an offboarding into a refusal.
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: JANE.email,
        name: { formatted: JANE.name },
        active: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(1);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_NAME_WRITE)).toHaveLength(0);
    expect(invalidateMock).toHaveBeenCalledWith(USER_ID, ORG);
  });

  it('PATCH active=true on a platform-suspended shared account is a no-op on status; response reflects the stored status', async () => {
    fakePool({ orgCount: 2, user: { ...JANE, status: 'suspended' } });

    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: true }],
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(0);
    // Nothing happened, so nothing claims to have: no "activated" audit row.
    const activated = sqlMatching(queryMock, AUDIT_INSERT).find(c => c[1]?.[1] === 'scim.user.activated');
    expect(activated).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST with an e-mail that already has an account (in another organisation).
// ─────────────────────────────────────────────────────────────────────────────

describe('SCIM tenant-scoped writes — POST for an existing account', () => {
  it('adds the membership only, never writes users.status; 201 reflects the stored (suspended) status', async () => {
    const suspended = { ...JANE, status: 'suspended' };
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (/SELECT id FROM users WHERE lower\(email\)/i.test(sql)) return { rows: [{ id: USER_ID }] };
      if (/SELECT 1 FROM organization_users WHERE user_id/i.test(sql)) return { rows: [] }; // not yet a member here
      if (/UPDATE users SET/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/INSERT INTO organization_users/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    fakePool({ orgCount: 1, user: suspended }); // read-back + audit

    const res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: JANE.email,
        name: { givenName: 'Jane', familyName: 'Doe' },
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(String(USER_ID));
    expect(res.body.active).toBe(false);

    // The membership was added for the caller's org …
    const member = sqlMatching(clientQueryMock, /INSERT INTO organization_users/i);
    expect(member).toHaveLength(1);
    expect(member[0][1]).toEqual([ORG, USER_ID]);
    // … and the global identity row was not touched, on either handle.
    expect(sqlMatching(clientQueryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(clientQueryMock, /INSERT INTO users/i)).toHaveLength(0);
  });

  it('active:false in the body for an existing account deactivates nobody', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (/SELECT id FROM users WHERE lower\(email\)/i.test(sql)) return { rows: [{ id: USER_ID }] };
      if (/SELECT 1 FROM organization_users WHERE user_id/i.test(sql)) return { rows: [] };
      if (/UPDATE users SET/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/INSERT INTO organization_users/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    fakePool({ orgCount: 1 });

    const res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ userName: JANE.email, active: false });

    expect(res.status).toBe(201);
    expect(res.body.active).toBe(true); // stored status, not the body's
    expect(sqlMatching(clientQueryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A user whose ONLY organisation is the caller: today's global contract stands.
// ─────────────────────────────────────────────────────────────────────────────

describe('SCIM tenant-scoped writes — sole-organisation user keeps today\'s contract', () => {
  beforeEach(() => fakePool({ orgCount: 1 }));

  it('DELETE still issues the global UPDATE users SET status = \'inactive\' (204)', async () => {
    const res = await request(app)
      .delete(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(204);
    const upd = sqlMatching(queryMock, /UPDATE users SET status = 'inactive'/i);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual([USER_ID]);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(0);
    expect(invalidateMock).toHaveBeenCalledWith(USER_ID, ORG);
    const audit = sqlMatching(queryMock, AUDIT_INSERT).find(c => c[1]?.[1] === 'scim.user.deactivated');
    expect(audit).toBeTruthy();
  });

  it('PATCH active=false still deactivates globally (200, active=false)', async () => {
    fakePool({ orgCount: 1, user: { ...JANE, status: 'inactive' } });
    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ Operations: [{ op: 'replace', path: 'active', value: false }] });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    const upd = sqlMatching(queryMock, USERS_STATUS_WRITE);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual(['inactive', USER_ID]);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(0);
  });

  it('PUT with a new displayName renames as before (200)', async () => {
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ userName: JANE.email, displayName: 'Jane Renamed', active: true });

    expect(res.status).toBe(200);
    const upd = sqlMatching(queryMock, USERS_NAME_WRITE);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual(['Jane Renamed', 'active', USER_ID]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IAM-27 (2026-10-01): a sole-organisation account a platform administrator
// suspended. SCIM owns `active` and `inactive`; `suspended` is the platform's
// hold (routes/admin/master-admin.ts PATCH /users/:id/status). An IdP that
// sent active=true, or a replace that left `active` out, used to write
// 'active' over it. A held account is now treated as a shared one is for its
// status: activation is a no-op, deactivation removes this tenant's
// membership and leaves the hold in place. The name is still the sole
// organisation's to change.
// ─────────────────────────────────────────────────────────────────────────────

describe('SCIM tenant-scoped writes — a suspended sole-organisation account (IAM-27)', () => {
  const HELD: FakeUser = { ...JANE, status: 'suspended' };
  beforeEach(() => fakePool({ orgCount: 1, user: HELD }));

  it('PATCH active=true does not lift the suspension: no status write, no activation row, active=false', async () => {
    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ Operations: [{ op: 'replace', path: 'active', value: true }] });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, AUDIT_INSERT).some(c => c[1]?.[1] === 'scim.user.activated')).toBe(false);
  });

  it.each([
    ['active: true', { userName: JANE.email, displayName: JANE.name, active: true }],
    ['no active at all', { userName: JANE.email, displayName: JANE.name }],
  ])('PUT with %s does not lift the suspension', async (_label, body) => {
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
  });

  it('PUT still renames: the name is the sole organisation\'s, the status is not', async () => {
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ userName: JANE.email, displayName: 'Jane Renamed', active: true });

    expect(res.status).toBe(200);
    const upd = sqlMatching(queryMock, USERS_NAME_WRITE);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual(['Jane Renamed', USER_ID]);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
  });

  it.each([
    ['PATCH active=false', (r: ReturnType<typeof request>) =>
      r.patch(`/scim/v2/Users/${USER_ID}`).set('Authorization', `Bearer ${TOKEN}`)
        .send({ Operations: [{ op: 'replace', path: 'active', value: false }] })],
    ['PUT active=false', (r: ReturnType<typeof request>) =>
      r.put(`/scim/v2/Users/${USER_ID}`).set('Authorization', `Bearer ${TOKEN}`)
        .send({ userName: JANE.email, displayName: JANE.name, active: false })],
    ['DELETE', (r: ReturnType<typeof request>) =>
      r.delete(`/scim/v2/Users/${USER_ID}`).set('Authorization', `Bearer ${TOKEN}`)],
  ])('%s removes this organisation\'s membership and leaves the suspension in place', async (_label, send) => {
    const res = await send(request(app));

    expect([200, 204]).toContain(res.status);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    const del = sqlMatching(queryMock, MEMBERSHIP_DELETE);
    expect(del).toHaveLength(1);
    expect(del[0][1]).toEqual([USER_ID, ORG]);
    expect(invalidateMock).toHaveBeenCalledWith(USER_ID, ORG);
    expect(sqlMatching(queryMock, AUDIT_INSERT).some(c => c[1]?.[1] === 'scim.user.deactivated')).toBe(true);
  });
});

describe('SCIM tenant-scoped writes — a replace that leaves `active` out changes no status (IAM-27)', () => {
  it('a deactivated sole-organisation account stays inactive', async () => {
    fakePool({ orgCount: 1, user: { ...JANE, status: 'inactive' } });
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ userName: JANE.email, displayName: JANE.name });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
    const upd = sqlMatching(queryMock, USERS_STATUS_WRITE);
    expect(upd.every(([, params]) => !params?.includes('active'))).toBe(true);
  });

  it('a shared account: a replace with no `active` removes no membership and writes no status', async () => {
    fakePool({ orgCount: 2, user: { ...JANE, status: 'inactive' } });
    const res = await request(app)
      .put(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ userName: JANE.email, displayName: JANE.name });

    expect(res.status).toBe(200);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(0);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
  });

  it('control: PATCH active=true still reactivates an account SCIM deactivated', async () => {
    fakePool({ orgCount: 1, user: { ...JANE, status: 'inactive' } });
    const res = await request(app)
      .patch(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ Operations: [{ op: 'replace', path: 'active', value: true }] });

    expect(res.status).toBe(200);
    const upd = sqlMatching(queryMock, USERS_STATUS_WRITE);
    expect(upd).toHaveLength(1);
    expect(upd[0][1]).toEqual(['active', USER_ID]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fail closed: when the membership count cannot be established, the tenant is
// NOT assumed to own the account.
// ─────────────────────────────────────────────────────────────────────────────

describe('SCIM tenant-scoped writes — unknown membership count fails closed', () => {
  it('DELETE with no count row removes only the membership and never writes users.status', async () => {
    fakePool({ orgCount: null });
    const res = await request(app)
      .delete(`/scim/v2/Users/${USER_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(204);
    expect(sqlMatching(queryMock, USERS_STATUS_WRITE)).toHaveLength(0);
    expect(sqlMatching(queryMock, MEMBERSHIP_DELETE)).toHaveLength(1);
  });
});
