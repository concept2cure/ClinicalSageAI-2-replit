/**
 * Security contract (C2C-DEVICE-002): /api/field-sync must authenticate every
 * handler and scope every project reference to the caller's organization.
 *
 * Before this fix the router was mounted bare —
 * server/bootstrap/register-inline-routes.ts does
 * `app.use('/api/field-sync', fieldSyncRoutes)` with no auth middleware — and
 * /api/field-sync is not on the authBoundary allowlist. Since that global
 * boundary enforces only in production and runs in `warn` mode everywhere else,
 * POST /update-field was reachable with NO credential at all outside
 * production, and it writes 510(k) document content. The project lookup also
 * had no organization predicate, and the SSE stream verified a token then
 * discarded its claims, filtering on the caller-supplied :projectId alone.
 *
 * The unauthenticated cases below FAIL on the parent commit (they returned 2xx).
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

// >= 32 chars: server/config/environment.ts enforces a minimum secret length.
const JWT_SECRET = 'field-sync-auth-contract-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// Canonical verifyJwtWithRotation reads JWT_SECRET_DEV ?? JWT_SECRET in test env.
process.env.JWT_SECRET_DEV = JWT_SECRET;

const T = 120_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../server/db', () => ({
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

// The field-sync write path is not under test here — the AUTHORIZATION contract
// is. Stub the service so a permitted call cannot touch real storage.
vi.mock('../server/services/SmartFieldLinking.js', () => ({
  smartFieldLinking: {
    updateField: vi.fn(async () => undefined),
    checkFieldCompleteness: vi.fn(async () => ({ complete: 0, total: 0, missing: [] })),
    getFieldLinksForSection: vi.fn(() => []),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

const ORG_A = 1;
const ORG_B = 2;
const PROJECT_A = 10; // owned by ORG_A
const PROJECT_B = 20; // owned by ORG_B

const PREREQ = `
  -- The tenant lifecycle guard reads the organization's posture on every
  -- authenticated request and answers 503 TENANT_STATE_UNVERIFIED when it cannot
  -- read one — "never assume active: a suspension must not lapse because a
  -- lookup failed". With only (id, name) that read errored, so every request
  -- 503'd before reaching the tenant-scoping this file exists to test. These are
  -- the columns the posture read selects; both orgs are seeded active so the
  -- cross-tenant cases fail on SCOPE rather than on posture. The rows are
  -- seeded further down; status defaults to active, so that seed is enough.
  CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    -- queryTenantPosture selects status AND paymentStatus together; omitting
    -- this column made the whole select fail, which the guard reads as an
    -- unreadable posture and refuses.
    payment_status TEXT,
    deletion_requested_at TIMESTAMPTZ,
    deletion_requested_by INTEGER,
    deletion_reason TEXT,
    purge_eligible_at TIMESTAMPTZ,
    purged_at TIMESTAMPTZ,
    final_export_digest TEXT
  );
  -- The live org-membership re-check (enforceOrgMembership) runs on every
  -- authenticated request and answers 503 when it cannot DETERMINE membership —
  -- which is what an absent table is. That is correct fail-closed behaviour:
  -- "we could not establish that you belong here" is not "you may proceed".
  -- Without these rows every request 503'd before reaching the tenant-scoping
  -- this file exists to test. Only ORG_A is seeded: the caller belongs to A, and
  -- the cross-tenant cases below assert that A's token cannot reach B's project.
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 7, 'member');
  CREATE TABLE fda_510k_projects (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    project_id INTEGER,
    device_name TEXT
  );
  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'org-a'), (${ORG_B}, 'org-b');
  INSERT INTO fda_510k_projects (id, organization_id, device_name) VALUES
    (${PROJECT_A}, ${ORG_A}, 'device-a'),
    (${PROJECT_B}, ${ORG_B}, 'device-b');
`;

let jdb: JourneyDb;
let app: express.Express;

async function tokenFor(orgId: number) {
  // `type: 'access'` is required, not decorative: requireAccessTokenReason
  // refuses a token whose type is anything other than 'access' — INCLUDING
  // absent (missing_token_type). That is deliberate, and it is what the
  // refresh-token case below relies on: a token cannot be used as an access
  // token merely by declining to say what it is. Without this claim every
  // request here 401'd before reaching the tenant-scoping this file exists to
  // test.
  return new SignJWT({ userId: 7, id: 7, email: 'u@fieldsync.example', organizationId: orgId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ, migrations: [] });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const { default: fieldSyncRoutes } = await import('../server/routes/fieldSync.routes');
  app = express();
  app.use(express.json());
  // Mounted bare, exactly as register-inline-routes.ts does — the router must
  // defend itself rather than rely on a boundary that is off outside production.
  app.use('/api/field-sync', fieldSyncRoutes);
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('C2C-DEVICE-002: /api/field-sync authenticates and tenant-scopes every handler', () => {
  it('POST /update-field with NO credential is rejected (401), not executed', async () => {
    const res = await request(app)
      .post('/api/field-sync/update-field')
      .send({ projectId: PROJECT_A, source: 'workflow', field: 'device.deviceName', value: 'x' });
    expect(res.status).toBe(401);
  }, T);

  it('GET /completeness with NO credential is rejected (401)', async () => {
    const res = await request(app).get(`/api/field-sync/completeness/${PROJECT_A}`);
    expect(res.status).toBe(401);
  }, T);

  it('GET /subscribe with NO credential is rejected (401)', async () => {
    const res = await request(app).get(`/api/field-sync/subscribe/${PROJECT_A}`);
    expect(res.status).toBe(401);
  }, T);

  it('POST /update-field against ANOTHER org\'s project returns 404, not a write', async () => {
    const res = await request(app)
      .post('/api/field-sync/update-field')
      .set('Authorization', `Bearer ${await tokenFor(ORG_A)}`)
      .send({ projectId: PROJECT_B, source: 'workflow', field: 'device.deviceName', value: 'x' });
    expect(res.status).toBe(404);
  }, T);

  it('GET /completeness for ANOTHER org\'s project returns 404', async () => {
    const res = await request(app)
      .get(`/api/field-sync/completeness/${PROJECT_B}`)
      .set('Authorization', `Bearer ${await tokenFor(ORG_A)}`);
    expect(res.status).toBe(404);
  }, T);

  it('GET /subscribe for ANOTHER org\'s project returns 403 before any stream opens', async () => {
    const res = await request(app)
      .get(`/api/field-sync/subscribe/${PROJECT_B}`)
      .set('Authorization', `Bearer ${await tokenFor(ORG_A)}`);
    expect(res.status).toBe(403);
  }, T);

  it('a refresh token cannot open the SSE stream (non-access token rejected)', async () => {
    const refresh = await new SignJWT({
      userId: 7, id: 7, organizationId: ORG_A, type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));
    const res = await request(app)
      .get(`/api/field-sync/subscribe/${PROJECT_A}`)
      .set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
  }, T);

  it('the caller\'s OWN project is still permitted (the fix is not a blanket deny)', async () => {
    const res = await request(app)
      .post('/api/field-sync/update-field')
      .set('Authorization', `Bearer ${await tokenFor(ORG_A)}`)
      .send({ projectId: PROJECT_A, source: 'workflow', field: 'device.deviceName', value: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, T);
});
