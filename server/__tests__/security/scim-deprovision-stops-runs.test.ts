/**
 * Every SCIM deprovisioning stops the person's live AnA runs in that
 * organisation, now, with `session_ended` (AnA detach DT3, design §2.9) — not
 * at the run's next round boundary. The first DT3 build hooked only the
 * sole-organisation status writes; a shared account's membership removal
 * (PUT or PATCH active=false) and SCIM DELETE (the offboarding path) were
 * missed, so a departed employee's detached turn ran on until its next round.
 *
 * The data layer is mocked as in scim-provisioning.contract.test.ts; what is
 * read is the stop the route asks for (account-standing.ts stopPersonsRuns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';

const { queryMock, clientQueryMock, stopsMock, memberships } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(async () => ({ rows: [] })),
  stopsMock: vi.fn(async () => undefined),
  memberships: { count: 1, status: 'active' },
}));

vi.mock('../../services/tenant/tenant-lifecycle.js', () => ({ shouldProcessTenantInBackground: async () => true }));
vi.mock('../../db', () => ({
  query: queryMock,
  transaction: async (cb: (client: unknown) => Promise<unknown>) => cb({ query: clientQueryMock }),
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn(async () => undefined) }));
vi.mock('../../services/account-standing', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  stopPersonsRuns: stopsMock,
}));

const TOKEN = 'test-scim-token-value';
let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  queryMock.mockImplementation(async (sql: string) => {
    if (/COUNT\(\*\)::int AS count FROM organization_users/i.test(sql)) return { rows: [{ count: memberships.count }] };
    if (/FROM users u JOIN organization_users ou/i.test(sql)) {
      return { rows: [{ email: 'jane@acme.test', name: 'Jane Doe', status: memberships.status }] };
    }
    if (/SELECT id, email, name, status/i.test(sql)) {
      return { rows: [{ id: 100, email: 'jane@acme.test', name: 'Jane Doe', status: 'inactive' }] };
    }
    return { rows: [] };
  });
  const router = (await import('../../routes/scim')).default;
  app = express();
  app.use(express.json());
  app.use('/scim/v2', router);
});

const deactivatePatch = {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
  Operations: [{ op: 'replace', path: 'active', value: false }],
};

describe("SCIM deprovisioning stops the person's live AnA runs in that organisation", () => {
  it.each([
    ['a sole-organisation account', 1],
    ['an account in other organisations too', 2],
  ])('DELETE (offboarding), %s', async (_name, count) => {
    memberships.count = count;
    const res = await request(app).delete('/scim/v2/Users/100').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(204);
    expect(stopsMock).toHaveBeenCalledWith(100, { cause: 'deprovisioned', byUserId: null }, { organizationId: 7 });
  });

  it.each([
    ['a sole-organisation account', 1],
    ['an account in other organisations too', 2],
  ])('PATCH active=false, %s', async (_name, count) => {
    memberships.count = count;
    const res = await request(app).patch('/scim/v2/Users/100').set('Authorization', `Bearer ${TOKEN}`).send(deactivatePatch);
    expect(res.status).toBe(200);
    expect(stopsMock).toHaveBeenCalledWith(100, { cause: 'deprovisioned', byUserId: null }, { organizationId: 7 });
  });

  it('PUT active=false on an account in other organisations too', async () => {
    memberships.count = 2;
    const res = await request(app)
      .put('/scim/v2/Users/100')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'jane@acme.test', displayName: 'Jane Doe', active: false });
    expect(res.status).toBe(200);
    expect(stopsMock).toHaveBeenCalledWith(100, { cause: 'deprovisioned', byUserId: null }, { organizationId: 7 });
  });

  it('an activating patch stops nothing', async () => {
    memberships.count = 2;
    await request(app)
      .patch('/scim/v2/Users/100')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...deactivatePatch, Operations: [{ op: 'replace', path: 'active', value: true }] });
    expect(stopsMock).not.toHaveBeenCalled();
  });
});
