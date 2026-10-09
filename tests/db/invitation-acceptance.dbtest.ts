/**
 * An invitation to another organization can be seen, accepted and declined by
 * the person it invites, and by nobody else (D3, 2026-09-28; evidence
 * docs/evidence/D3/2026-09-28-invitation-acceptance/).
 *
 * An administrator of organization B adding an account that already belongs to
 * organization A creates a PENDING invitation, not a membership: membership
 * needs the invitee's consent (decision-register item 12, #727). The invitee,
 * signed into A, lists it, then accepts or declines it
 * (server/routes/tenant-users.ts, /invitations/*).
 *
 * organization_invitations carries the FORCEd tenant isolation policy, so in
 * A's request scope the invitation to B is invisible: the list is empty and
 * accept and decline answer 404. Under the production posture a person could
 * be invited and never join.
 *
 * Every statement runs through the application pool (app_service, RLS
 * enforcing, asserted by the fixture); the routes are production's, behind the
 * production auth boundary.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import organizationsRoutes from '../../server/routes/organizations-routes';
import tenantUsers from '../../server/routes/tenant-users';
import {
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  userA,
  userB,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;
let adminB = 0; // an administrator of B
let otherA = 0; // a second member of A, not invited
let emailA = '';

beforeAll(async () => {
  await provisionTwoTenantFixture();
  adminB = await provisionMember(ORG_B, 'admin', 'inv-admin-b');
  otherA = await provisionMember(ORG_A, 'member', 'inv-other-a');
  emailA = (await owner.query('SELECT email FROM users WHERE id = $1', [userA])).rows[0].email;
  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/tenant-users', tenantUsers);
}, 60_000);

/** Invitations and any membership an accept wrote, back to the fixture's. */
async function reset(): Promise<void> {
  await owner.query('DELETE FROM organization_invitations WHERE organization_id = ANY($1::int[])', [
    FIXTURE_ORGS,
  ]);
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_B,
    userA,
  ]);
}

afterAll(async () => {
  if (owner) await reset();
  await teardownTwoTenantFixture();
});

const asUserA = () => auth(accessToken(userA, ORG_A, 'member'));

/** B's administrator adds A's user: an existing account, so a pending invitation. */
async function inviteUserAToB(role = 'member'): Promise<number> {
  const res = await request(app)
    .post('/api/tenant-users')
    .set(auth(accessToken(adminB, ORG_B, 'admin')))
    .send({ organizationId: ORG_B, email: emailA, name: 'Invitee', role });
  expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(202);
  return Number(res.body.data.invitationId);
}

const invitationStatus = async (id: number) =>
  (await owner.query('SELECT status FROM organization_invitations WHERE id = $1', [id])).rows[0]
    ?.status ?? null;
const membershipInB = async (user: number) =>
  (
    await owner.query(
      'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [ORG_B, user]
    )
  ).rows[0]?.role ?? null;

describe('the invitee, signed into their own organization (D3)', () => {
  it('sees the invitation to the other organization', async () => {
    try {
      const id = await inviteUserAToB();
      const res = await request(app).get('/api/tenant-users/invitations/mine').set(asUserA());
      expect(res.status).toBe(200);
      expect(res.body, 'the invitee was shown no invitation').toEqual([
        expect.objectContaining({ id, organizationId: ORG_B, status: 'pending' }),
      ]);
    } finally {
      await reset();
    }
  });

  it('accepts it: the membership is written, and the token for B is then admitted', async () => {
    try {
      const id = await inviteUserAToB('viewer');
      const res = await request(app)
        .post(`/api/tenant-users/invitations/${id}/accept`)
        .set(asUserA());
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
      expect(await membershipInB(userA)).toBe('viewer');
      expect(await invitationStatus(id)).toBe('accepted');
      const intoB = await request(app)
        .get(`/api/organizations/${ORG_B}`)
        .set(auth(accessToken(userA, ORG_B, 'viewer')));
      expect(intoB.status).toBe(200);
    } finally {
      await reset();
    }
  });

  it('declines it: no membership, the invitation kept as declined', async () => {
    try {
      const id = await inviteUserAToB();
      const res = await request(app)
        .post(`/api/tenant-users/invitations/${id}/decline`)
        .set(asUserA());
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
      expect(await invitationStatus(id)).toBe('declined');
      expect(await membershipInB(userA)).toBeNull();
    } finally {
      await reset();
    }
  });
});

describe('nobody else can see or answer it (D3)', () => {
  it('another member of A cannot see, accept or decline an invitation that is not theirs', async () => {
    try {
      const id = await inviteUserAToB();
      const asOther = auth(accessToken(otherA, ORG_A, 'member'));
      const mine = await request(app).get('/api/tenant-users/invitations/mine').set(asOther);
      expect(mine.body).toEqual([]);
      for (const action of ['accept', 'decline']) {
        const res = await request(app)
          .post(`/api/tenant-users/invitations/${id}/${action}`)
          .set(asOther);
        expect([403, 404], `${action}: ${res.status}`).toContain(res.status);
      }
      expect(await invitationStatus(id)).toBe('pending');
      expect(await membershipInB(otherA)).toBeNull();
      expect(await membershipInB(userA)).toBeNull();
    } finally {
      await reset();
    }
  });

  it("the lookup answers only about the calling organization's own members", async () => {
    try {
      const id = await inviteUserAToB();
      const ask = (org: number) =>
        runWithTenantScope(
          { tenantId: String(org), role: 'member', source: 'request', caller: 'invitation.dbtest' },
          () => getPool().query('SELECT id FROM public.invitations_for_member($1)', [userA])
        );
      // A asks about its own member: found. B, which issued it, asks about a
      // person who is not B's member: nothing, whatever B's own rows hold.
      expect((await ask(ORG_A)).rows).toEqual([{ id }]);
      expect((await ask(ORG_B)).rows, 'the lookup answered about a non-member').toEqual([]);
    } finally {
      await reset();
    }
  });

  it("B's scope reads none of A's invitations directly (the table's own policy, unchanged)", async () => {
    await owner.query(
      `INSERT INTO organization_invitations (organization_id, user_id, email, role, status, created_at)
       VALUES ($1, $2, 'b-member@example.invalid', 'member', 'pending', now())`,
      [ORG_A, userB]
    );
    try {
      const direct = await runWithTenantScope(
        { tenantId: String(ORG_B), role: 'member', source: 'request', caller: 'invitation.dbtest' },
        () =>
          getPool().query('SELECT id FROM organization_invitations WHERE organization_id = $1', [
            ORG_A,
          ])
      );
      expect(direct.rows, "B's scope read A's invitation table").toEqual([]);
    } finally {
      await reset();
    }
  });
});
