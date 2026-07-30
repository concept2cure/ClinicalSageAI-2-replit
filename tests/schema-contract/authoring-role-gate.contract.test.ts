/**
 * Security contract: the authoring router's role gates must derive roles from the
 * VERIFIED token, never from a client-supplied header (ledger C-18).
 *
 * server/routes/authoring.router.ts:164 `requireAny` reads roles from the
 * `x-roles` HTTP header. The router's own JWT middleware overwrites that header
 * from verified claims — but only inside `if (claims.roles)`. A token that
 * carries no `roles` claim leaves the CLIENT's `x-roles` header untouched, and
 * `requireAny` then trusts it.
 *
 * Eight routes are gated this way, including POST /templates, POST /guidance,
 * the change-request approve/reject/apply trio and POST /docs/:docId/permissions.
 *
 * The same conditional applies to `x-user-email` (attribution) and `x-tenant-id`
 * (tenant isolation) — a token without those claims lets the client name itself
 * and pick its own tenant. This test file pins all three.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals. A role gate that a request can assert for itself is
 *             not access control.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';

const JWT_SECRET = 'role-gate-contract-secret-0725';
process.env.JWT_SECRET = JWT_SECRET;
// The authoring router now verifies via the CANONICAL verifyJwtWithRotation,
// which in test env (NODE_ENV=test → suffix DEV) reads JWT_SECRET_DEV ?? JWT_SECRET.
// This file overrides JWT_SECRET for isolation, so it must override the
// env-suffixed secret the verifier actually reads, or every token 401s.
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

// The leading hex nibble is a letter on purpose: enforceOrgMembership skips the
// live organization_users re-check only when parseFiniteInt(userId) === null,
// and Number.parseInt reads leading digits — so 'fa1c2a10…' → NaN → null →
// skipped, while a digit-leading UUID would parse to an int, run the re-check,
// and 503. This contract tests role gating, not membership; keep it letter-led.
const USER = {
  id: 'fa1c2a10-0000-4000-8000-0000000000a1',
  email: 'unprivileged@journey.example',
  organizationId: 1,
};

/** Mint a token with an explicit claim set — `roles` deliberately optional. */
async function mint(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'org-a'), (2, 'org-b');
  INSERT INTO users (id, name, email) VALUES ('${USER.id}', 'Una Privileged', '${USER.email}');
`;

let jdb: JourneyDb;
let app: express.Express;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: ['db/migrations/20260725_authoring_document_loop_tables.sql'],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json());
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('C-18: role gates must not trust the x-roles header', () => {
  it('a token WITHOUT a roles claim cannot self-assert ADMIN via the header', async () => {
    const token = await mint({
      userId: USER.id,
      email: USER.email,
      organizationId: USER.organizationId,
      tenant_id: USER.organizationId,
      // no `roles` claim — this is the shape Journey A's tokens have
    });

    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-roles', 'ADMIN,QA,RA_CMC') // forged by the caller
      .send({ template_name: 'escalation probe', template_type: 'm3', category: 'quality' });

    // requireAny(['ADMIN','RA_CMC','QA']) must reject: the token grants no roles.
    expect(res.status).toBe(403);
  }, T);

  it('a NON-Bearer Authorization header cannot smuggle roles past the gate', async () => {
    // The claim-derivation block runs only inside
    //   if (auth && auth.startsWith('Bearer ') && jose) { … }
    // while the middleware calls next() unconditionally afterwards. A non-Bearer
    // Authorization header therefore satisfies the "is authentication present?"
    // check without ever being verified — and, before the fix, left the caller's
    // x-roles header untouched all the way to requireAny.
    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .set('x-roles', 'ADMIN')
      .send({ template_name: 'non-bearer probe', template_type: 'm3', category: 'quality' });

    expect(res.status).toBe(401);

    const rows = await jdb.pool.query(
      `SELECT id FROM authoring_templates WHERE template_name = $1`,
      ['non-bearer probe'],
    );
    expect(rows.rows).toHaveLength(0);
  }, T);

  it('a token WITH a roles claim is still honoured', async () => {
    const token = await mint({
      userId: USER.id,
      email: USER.email,
      organizationId: USER.organizationId,
      tenant_id: USER.organizationId,
      roles: ['QA'],
    });

    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({ template_name: 'legitimate template', template_type: 'm3', category: 'quality' });

    expect(res.status).not.toBe(403);
  }, T);

  it('a forged x-roles header cannot WIDEN the roles a token does grant', async () => {
    const token = await mint({
      userId: USER.id,
      email: USER.email,
      organizationId: USER.organizationId,
      tenant_id: USER.organizationId,
      roles: ['AUTHOR'], // not in the gate's allowed set
    });

    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-roles', 'ADMIN')
      .send({ template_name: 'widening probe', template_type: 'm3', category: 'quality' });

    expect(res.status).toBe(403);
  }, T);

  it('a token without an email claim attributes to the JWT subject, never to a forged x-user-email', async () => {
    const token = await mint({
      userId: USER.id,
      organizationId: USER.organizationId,
      tenant_id: USER.organizationId,
      roles: ['QA'],
      // no `email` claim
    });

    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-user-email', 'ceo@journey.example') // forged identity
      .send({ template_name: 'attribution probe', template_type: 'm3', category: 'quality' });

    // The request is legitimately authorized (roles: QA), so it may succeed —
    // what must NOT happen is the record being attributed to the address the
    // caller named. getActorEmail falls back to the verified JWT subject.
    const rows = await jdb.pool.query(
      `SELECT created_by FROM authoring_templates WHERE template_name = $1`,
      ['attribution probe'],
    );
    if (res.status < 400) {
      expect(rows.rows).toHaveLength(1);
      const createdBy = String((rows.rows[0] as { created_by: string }).created_by);
      expect(createdBy).not.toBe('ceo@journey.example');
      expect(createdBy).toBe(USER.id); // the verified subject
    } else {
      expect(rows.rows).toHaveLength(0);
    }
  }, T);

  it('a token without a tenant claim cannot choose its tenant via x-tenant-id', async () => {
    const token = await mint({
      userId: USER.id,
      email: USER.email,
      roles: ['QA'],
      // no organizationId / tenant_id claim
    });

    const res = await request(app)
      .post('/api/authoring/templates')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', '2') // forged tenant
      .send({ template_name: 'tenant probe', template_type: 'm3', category: 'quality' });

    // getTenantId throws without a verified org claim; the handler must not
    // create anything in the tenant the caller named.
    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await jdb.pool.query(
      `SELECT tenant_id FROM authoring_templates WHERE template_name = $1`,
      ['tenant probe'],
    );
    expect(rows.rows).toHaveLength(0);
  }, T);
});
