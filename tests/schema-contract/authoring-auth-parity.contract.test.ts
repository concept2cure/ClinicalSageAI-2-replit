/**
 * Security contract (C2C-SEC-001): the authoring router enforces the CANONICAL
 * access-token semantics in EVERY environment — not only where the /api boundary
 * happens to run in enforce mode.
 *
 * The router previously ran its own jose verifier that omitted two controls that
 * live in server/middleware/auth.ts authenticateToken:
 *   - AUTH_008: a non-access token (refresh / MFA challenge / MFA partial) is
 *     signed with the same secret and must be rejected on the access path;
 *   - AUTH_009: a live organization_users membership re-check, so a user removed
 *     from the org loses access within the cache TTL, not the full token life.
 *
 * These are proven IN the router (mounted with no boundary, as the harness does)
 * because the router now composes twin-safe canonical primitives
 * (verifyJwtWithRotation, nonAccessTokenReason, enforceOrgMembership). Importing
 * enforceOrgMembership via '../middleware/auth' would bind to the stale auth.js
 * twin under vitest and silently skip AUTH_009 — this file would catch that.
 *
 * @compliance 21 CFR Part 11 §11.10(d) / §11.10(g)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';
import { invalidateOrgMembershipCache } from '../../server/middleware/orgMembership';

const JWT_SECRET = 'auth-parity-contract-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// Canonical verifyJwtWithRotation reads JWT_SECRET_DEV ?? JWT_SECRET in test env.
process.env.JWT_SECRET_DEV = JWT_SECRET;

const T = 120_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

// A member with an INTEGER user id so enforceOrgMembership's parseFiniteInt maps
// cleanly onto the seeded organization_users row.
const MEMBER_USER_ID = 42;
const ORG_ID = 1;

async function mint(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/** Base claims for a valid, seeded-member access token. */
const memberClaims = () => ({
  userId: MEMBER_USER_ID,
  email: 'member@parity.example',
  organizationId: ORG_ID,
  tenant_id: ORG_ID,
  roles: ['QA'],
});

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  INSERT INTO organizations (id, name) VALUES (1, 'org-a');
  INSERT INTO users (id, name, email) VALUES (${MEMBER_USER_ID}, 'Member', 'member@parity.example');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG_ID}, ${MEMBER_USER_ID}, 'member');
`;

let jdb: JourneyDb;
let app: express.Express;

async function post(token: string) {
  return request(app)
    .post('/api/authoring/templates')
    .set('Authorization', `Bearer ${token}`)
    .send({ template_name: `parity ${Math.abs(token.length)}`, template_type: 'm3', category: 'quality' });
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      // Everything the durable applier ships that ALTERs the tables above, so
      // this harness models the deploy rather than a subset of it.
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json());
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  invalidateOrgMembershipCache();
  await jdb?.close();
});

describe('C2C-SEC-001: authoring router enforces canonical access-token semantics', () => {
  it('AUTH_008: a refresh token is rejected (401), not accepted as an access credential', async () => {
    const res = await post(await mint({ ...memberClaims(), type: 'refresh' }));
    expect(res.status).toBe(401);
  }, T);

  it('AUTH_008: an MFA-partial token (mfaPending) is rejected (401)', async () => {
    const res = await post(await mint({ ...memberClaims(), mfaPending: true }));
    expect(res.status).toBe(401);
  }, T);

  it('AUTH_008: a pending_mfa-role token is rejected (401)', async () => {
    const res = await post(await mint({ ...memberClaims(), role: 'pending_mfa' }));
    expect(res.status).toBe(401);
  }, T);

  it('a token signed with the wrong secret is rejected (401)', async () => {
    const forged = await new SignJWT(memberClaims())
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('not-the-server-secret'));
    const res = await post(forged);
    expect(res.status).toBe(401);
  }, T);

  it('a valid access token for a seeded member is accepted by auth (not 401)', async () => {
    invalidateOrgMembershipCache();
    const res = await post(await mint(memberClaims()));
    expect(res.status).not.toBe(401);
  }, T);

  it('AUTH_009: revoking the organization_users row rejects the same token (403)', async () => {
    // Prove the live membership re-check runs IN the router (would be silently
    // skipped if enforceOrgMembership had bound to the stale auth.js twin).
    invalidateOrgMembershipCache();
    const before = await post(await mint(memberClaims()));
    expect(before.status).not.toBe(403); // member: not blocked by AUTH_009

    await jdb.pool.query(`DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2`, [
      MEMBER_USER_ID,
      ORG_ID,
    ]);
    invalidateOrgMembershipCache(MEMBER_USER_ID, ORG_ID); // else the 60s cache still says "member"

    const after = await post(await mint(memberClaims()));
    expect(after.status).toBe(403);
    expect(after.body?.error?.code).toBe('AUTH_009');
  }, T);

  it('AUTH_009: a degraded-enrichment membership is NOT cached, so revocation is immediate', async () => {
    // This fixture's `organizations` has no `uuid` column, so the orgUuid LEFT
    // JOIN throws on every lookup and the membership-only fallback answers. That
    // answer is sound for MEMBERSHIP but carries orgUuid = null because
    // enrichment failed — not because the org has no uuid.
    //
    // Caching it was wrong twice over. The null would be served for the whole
    // 60s TTL, dropping uuid-keyed routes to numeric scoping and returning empty
    // tenant data from a transient JOIN error; and a revocation inside that
    // window would keep being answered "member" from cache.
    //
    // So this case deliberately does NOT invalidate after revoking. It passes
    // only if the degraded result was never cached in the first place — which is
    // the fix. The case above still invalidates explicitly, so the two together
    // distinguish "revocation works" from "revocation works WITHOUT help".
    invalidateOrgMembershipCache();

    await jdb.pool.query(
      `INSERT INTO organization_users (user_id, organization_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [MEMBER_USER_ID, ORG_ID],
    );
    const asMember = await post(await mint(memberClaims()));
    expect(asMember.status).not.toBe(403);

    await jdb.pool.query(
      `DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2`,
      [MEMBER_USER_ID, ORG_ID],
    );
    // No invalidateOrgMembershipCache() here — that is the point.

    const afterRevoke = await post(await mint(memberClaims()));
    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body?.error?.code).toBe('AUTH_009');
  }, T);
});
