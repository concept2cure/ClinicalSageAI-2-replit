/**
 * GET /api/users/:id looks a person up inside the caller's organization, by
 * membership, and not in the pre-auth scope (D3, 2026-09-29; evidence
 * docs/evidence/D3/2026-09-29-pre-auth-scope/).
 *
 * /api/users is mounted in the pre-auth scope (register-platform-routes.ts),
 * which reads every row of public.users, credentials included. This handler
 * verifies the caller's token and then loaded ANY user's full row by the id in
 * the path; what stood between that row and the caller was an application
 * check on users.default_organization_id — a preference, not tenancy. So a
 * person removed from the caller's organization whose default still named it
 * stayed visible, and a current member whose default named another
 * organization was hidden.
 *
 * Routes are production's own registration (registerPlatformRoutes, the
 * pre-auth mount); the database is app_service with RLS enforcing, asserted by
 * the fixture.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import {
  ORG_A,
  ORG_B,
  owner,
  userA,
  userB,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let platform: express.Express;
let leaver = 0; // default organization A, no longer a member of A
let memberDefaultB = 0; // a current member of A whose default organization is B

beforeAll(async () => {
  await provisionTwoTenantFixture();
  leaver = await provisionMember(ORG_A, 'member', 'lookup-leaver');
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_A,
    leaver,
  ]);
  memberDefaultB = await provisionMember(ORG_B, 'member', 'lookup-default-b');
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')`,
    [ORG_A, memberDefaultB]
  );

  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  platform = express();
  platform.use(express.json());
  await registerPlatformRoutes({
    app: platform,
    pool: getPool(),
    authMiddleware: (_req: unknown, res: express.Response) => {
      res.status(401).json({ error: 'the global gate was reached' });
    },
  });
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM organization_users WHERE user_id = $1', [memberDefaultB]);
  }
  await teardownTwoTenantFixture();
});

const lookup = (id: number) =>
  request(platform)
    .get(`/api/users/${id}`)
    .set(auth(accessToken(userA, ORG_A, 'member')));

describe('GET /api/users/:id answers by membership in the caller organization (D3)', () => {
  it('positive control: a member of A finds another member of A', async () => {
    const res = await lookup(userA);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: String(userA), organizationId: String(ORG_A) });
  });

  it("a person removed from A is not found, whatever their default organization says", async () => {
    const res = await lookup(leaver);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
  });

  it('a current member of A is found, even with another default organization', async () => {
    const res = await lookup(memberDefaultB);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ id: String(memberDefaultB), organizationId: String(ORG_A) });
  });

  it("B's member is not found from A", async () => {
    const res = await lookup(userB);
    expect(res.status).toBe(404);
  });

  it('the response carries no credential field', async () => {
    const res = await lookup(userA);
    expect(Object.keys(res.body).sort()).toEqual(
      ['displayName', 'email', 'firstName', 'id', 'lastName', 'organizationId', 'roles'].sort()
    );
  });
});
