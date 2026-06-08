/**
 * Contract test for the SCIM 2.0 provisioning endpoint (server/routes/scim.ts).
 *
 * Covers the security-critical behaviours: bearer-token auth (reject missing /
 * wrong token), JIT create returns an active SCIM user, and PATCH active=false
 * deprovisions (the offboarding path). Data layer is mocked — no DB needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';

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
});
