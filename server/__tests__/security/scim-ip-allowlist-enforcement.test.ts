/**
 * Enforcement test for the SCIM source-IP allowlist (server/routes/scim.ts).
 *
 * Confirms the opt-in / fail-closed network policy: no rows = unrestricted; an
 * enabled rule rejects a valid token from outside its CIDR (403) and admits one
 * inside it (200). req.ip is driven via X-Forwarded-For with production's hop
 * count (server/config/trust-proxy.ts): the load balancer's appended entry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';
import { __resetScimDbTenantCache, __resetScimIpAllowlistCache } from '../../routes/scim';
import { resolveTrustProxy } from '../../config/trust-proxy';

const { queryMock, state } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  state: { allowRows: [] as Array<{ organization_id: number; cidr: string }> },
}));

vi.mock('../../db', () => ({
  query: queryMock,
  transaction: async (cb: (client: unknown) => Promise<unknown>) => cb({ query: queryMock }),
}));

const TOKEN = 'test-scim-token-value';
let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  __resetScimDbTenantCache();
  __resetScimIpAllowlistCache();
  state.allowRows = [];
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM scim_tenants/i.test(sql)) return { rows: [] }; // env token used
    if (/FROM scim_ip_allowlist/i.test(sql)) return { rows: state.allowRows };
    return { rows: [] }; // user list / count
  });
  const router = (await import('../../routes/scim')).default;
  app = express();
  // Production's posture: one trusted hop, so req.ip is the entry the load
  // balancer appended — never the left-most one, which the client writes.
  app.set('trust proxy', resolveTrustProxy({ NODE_ENV: 'production' }).hops);
  app.use('/scim/v2', router);
});

afterEach(() => {
  __resetScimIpAllowlistCache();
});

describe('SCIM IP allowlist enforcement', () => {
  it('no rules → unrestricted (200)', async () => {
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
  });

  it('valid token from outside the allowlist is rejected (403)', async () => {
    state.allowRows = [{ organization_id: 7, cidr: '10.0.0.0/8' }];
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/not permitted/i);
  });

  it('valid token from inside the allowlist is admitted (200)', async () => {
    state.allowRows = [{ organization_id: 7, cidr: '8.8.8.0/24' }];
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
  });

  it('a leaked token cannot claim an allowlisted address: the load balancer\'s entry decides (403)', async () => {
    // The client writes "10.1.2.3" itself; the load balancer appends the
    // address it actually received the connection from, 8.8.8.8.
    state.allowRows = [{ organization_id: 7, cidr: '10.0.0.0/8' }];
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Forwarded-For', '10.1.2.3, 8.8.8.8');
    expect(res.status).toBe(403);
  });

  it("another org's rule does not restrict this org (200)", async () => {
    state.allowRows = [{ organization_id: 999, cidr: '10.0.0.0/8' }];
    const res = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
  });
});
