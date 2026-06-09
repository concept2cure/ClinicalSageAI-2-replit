/**
 * Contract test for the SCIM 2.0 provisioning endpoint (server/routes/scim.ts).
 *
 * Covers the security-critical behaviours: bearer-token auth (reject missing /
 * wrong token), JIT create returns an active SCIM user, and PATCH active=false
 * deprovisions (the offboarding path). Data layer is mocked — no DB needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';
import { createHash } from 'crypto';
import { __resetScimDbTenantCache } from '../../routes/scim';

const { queryMock, clientQueryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
}));

vi.mock('../../db', () => ({
  query: queryMock,
  transaction: async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: clientQueryMock }),
}));

let app: express.Express;
const TOKEN = 'test-scim-token-value';

beforeEach(async () => {
  vi.clearAllMocks();
  const router = (await import('../../routes/scim')).default;
  app = express();
  app.use('/scim/v2', router);
});

describe('SCIM provisioning — auth', () => {
  it('rejects requests with no bearer token (401)', async () => {
    const res = await request(app).get('/scim/v2/Users');
    expect(res.status).toBe(401);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
  });

  it('rejects requests with the wrong bearer token (401)', async () => {
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer not-the-token');
    expect(res.status).toBe(401);
  });
});

describe('SCIM provisioning — lifecycle', () => {
  it('JIT-creates a new user and returns an active SCIM resource (201)', async () => {
    // transaction(): new user → insert user → insert membership
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (/SELECT id FROM users WHERE lower\(email\)/i.test(sql)) return { rows: [] };
      if (/INSERT INTO users/i.test(sql)) return { rows: [{ id: 100 }] };
      if (/INSERT INTO organization_users/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    // post-create read-back
    queryMock.mockResolvedValue({
      rows: [{ id: 100, email: 'jane@acme.test', name: 'Jane Doe', status: 'active' }],
    });

    const res = await request(app)
      .post('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'jane@acme.test',
        name: { givenName: 'Jane', familyName: 'Doe' },
        active: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.userName).toBe('jane@acme.test');
    expect(res.body.active).toBe(true);
    expect(res.body.id).toBe('100');
  });

  it('PATCH active=false deprovisions the user (200, active=false)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      // membership check
      if (/JOIN organization_users ou .* WHERE u\.id/is.test(sql)) return { rows: [{ '?column?': 1 }] };
      // UPDATE deactivate
      if (/UPDATE users SET/i.test(sql)) return { rows: [] };
      // read-back → now inactive
      if (/SELECT id, email, name, status/i.test(sql)) {
        return { rows: [{ id: 100, email: 'jane@acme.test', name: 'Jane Doe', status: 'inactive' }] };
      }
      return { rows: [] };
    });

    const res = await request(app)
      .patch('/scim/v2/Users/100')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('returns 404 for a deactivate (DELETE) on a non-member user', async () => {
    queryMock.mockResolvedValue({ rows: [] }); // membership check → not found
    const res = await request(app)
      .delete('/scim/v2/Users/999')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('DELETE deactivates a member and writes a deprovision audit event (204)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 100 }] }); // member found; UPDATE/audit ok
    const res = await request(app)
      .delete('/scim/v2/Users/100')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(204);
    const audit = queryMock.mock.calls.find(
      c =>
        /INSERT INTO audit_events/i.test(String(c[0])) &&
        Array.isArray(c[1]) &&
        c[1][1] === 'scim.user.deactivated'
    );
    expect(audit).toBeTruthy();
  });
});

describe('SCIM provisioning — Groups (RBAC roles)', () => {
  it('lists the four role-groups (200, ListResponse)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, email: 'a@acme.test', name: 'A' }] });
    const res = await request(app).get('/scim/v2/Groups').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res.body.totalResults).toBe(4);
    const ids = (res.body.Resources as Array<{ id: string }>).map(g => g.id).sort();
    expect(ids).toEqual(['admin', 'manager', 'member', 'viewer']);
  });

  it('gets a single role-group with members (200)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, email: 'a@acme.test', name: 'A' }] });
    const res = await request(app)
      .get('/scim/v2/Groups/admin')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('admin');
    expect(res.body.displayName).toBe('Admin');
    expect(res.body.members[0].value).toBe('1');
  });

  it('404 for an unknown group (not a valid role)', async () => {
    const res = await request(app)
      .get('/scim/v2/Groups/superuser')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('PATCH add assigns the group role to a member (org-scoped UPDATE)', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 100, email: 'jane@acme.test', name: 'Jane' }] });
    const res = await request(app)
      .patch('/scim/v2/Groups/admin')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'add', path: 'members', value: [{ value: '100' }] }],
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('admin');
    const update = queryMock.mock.calls.find(c => /UPDATE organization_users SET role = \$1/.test(c[0]));
    expect(update).toBeTruthy();
    expect(update?.[1]).toEqual(['admin', 7, 100]); // role, orgId, userId
  });
});

describe('SCIM provisioning — multi-tenant tokens', () => {
  const ORIGINAL = process.env.SCIM_TENANTS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SCIM_TENANTS;
    else process.env.SCIM_TENANTS = ORIGINAL;
  });

  it('resolves a second tenant token to its own org (org-scoped queries)', async () => {
    process.env.SCIM_TENANTS = JSON.stringify([{ token: 'tenant-two-token', orgId: 42 }]);
    queryMock.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer tenant-two-token');
    expect(res.status).toBe(200);
    // every users query for this request must be scoped to org 42
    const scoped = queryMock.mock.calls.find(c => Array.isArray(c[1]) && c[1][0] === 42);
    expect(scoped).toBeTruthy();
  });

  it('still rejects an unknown token under multi-tenant config (401)', async () => {
    process.env.SCIM_TENANTS = JSON.stringify([{ token: 'tenant-two-token', orgId: 42 }]);
    const res = await request(app).get('/scim/v2/Users').set('Authorization', 'Bearer nope-not-valid');
    expect(res.status).toBe(401);
  });
});

describe('SCIM provisioning — discovery', () => {
  it('exposes ResourceTypes (User + Group)', async () => {
    const res = await request(app)
      .get('/scim/v2/ResourceTypes')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    const ids = (res.body.Resources as Array<{ id: string }>).map(r => r.id);
    expect(ids).toContain('User');
    expect(ids).toContain('Group');
  });

  it('exposes Schemas (User + Group)', async () => {
    const res = await request(app).get('/scim/v2/Schemas').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(2);
  });

  it('discovery still requires the bearer token (401)', async () => {
    const res = await request(app).get('/scim/v2/ResourceTypes');
    expect(res.status).toBe(401);
  });
});

describe('SCIM provisioning — DB-backed tenant tokens', () => {
  beforeEach(() => __resetScimDbTenantCache());
  afterEach(() => __resetScimDbTenantCache());

  it('resolves a DB token (matched by SHA-256 hash) to its org', async () => {
    const dbToken = 'db-secret-token-abc';
    const tokenHash = createHash('sha256').update(dbToken).digest('hex');
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM scim_tenants/i.test(sql)) {
        return { rows: [{ organization_id: 99, token_hash: tokenHash }] };
      }
      return { rows: [] }; // count + list users
    });

    const res = await request(app).get('/scim/v2/Users').set('Authorization', `Bearer ${dbToken}`);
    expect(res.status).toBe(200);
    // the users queries for this request must be scoped to the DB tenant's org (99)
    const scoped = queryMock.mock.calls.find(
      c =>
        /FROM users u JOIN organization_users/i.test(String(c[0])) &&
        Array.isArray(c[1]) &&
        c[1][0] === 99
    );
    expect(scoped).toBeTruthy();
  });

  it('rejects a token present in neither env nor DB (401)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM scim_tenants/i.test(sql)) {
        return { rows: [{ organization_id: 99, token_hash: 'abc123' }] };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer not-in-env-or-db');
    expect(res.status).toBe(401);
  });
});
