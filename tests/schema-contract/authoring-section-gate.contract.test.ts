/**
 * Security contract (C2C-AUTHOR-001 / C2C-AUTHOR-002): section-level write
 * authorization for the authoring surface, exercised through the stack
 * PRODUCTION mounts — not through one router in isolation.
 *
 * FOUR DEFECTS THIS PINS
 * ----------------------
 * 1. DEFAULT ALLOW-ALL. `canEditSection` opened with
 *      `if (process.env.AUTH_ENFORCE_SECTION_PERMS !== '1') return true;`
 *    and that flag is set nowhere in the repository, so the real-world default
 *    authorised every section write by any authenticated caller before
 *    establishing anything — not the tenant, not the section's existence, not
 *    the document's state.
 *
 * 2. FLAG-GATED RECORD IMMUTABILITY. The document-status check lived INSIDE
 *    that short-circuit, so a signed, FROZEN IND document's sections stayed
 *    editable in the deployed configuration. FROZEN was never checked at all,
 *    at any flag setting — only APPROVED was, and only when the flag was on.
 *    Record immutability is 21 CFR Part 11 §11.10(c)/(e), not a feature flag.
 *
 * 3. AN UNUSABLE, UNANCHORED, UNSCOPED MATRIX. With the flag on, the gate
 *    queried `doc_permissions` — a table nothing in the repo created — carried
 *    no tenant predicate, and its `A AND B OR C` precedence left the doc-level
 *    branch unanchored from the requested section, so a grant on ANY document
 *    satisfied a write to ANY other.
 *
 * 4. A PROOF OF A PATH PRODUCTION NEVER RAN. The first version of this file
 *    mounted `authoring.router.ts` alone and drove permission grants through
 *    that router's own POST/GET `/docs/:docId/permissions`. In production those
 *    handlers were unreachable: `register-inline-routes.ts` mounts the canonical
 *    permission router (server/routes/authoring-permissions.ts) and the
 *    mandatory object-authorization middleware
 *    (server/middleware/authoringObjectAuthorization.ts) on `/api` AHEAD of it,
 *    and the canonical router owns the same path. The legacy handlers were
 *    deleted in 3eb7306, which turned this suite red — and revealed that the
 *    gate it proved (email-only, AUTHOR/REVIEWER, blind to revocation and
 *    expiry, QA/RA_CMC blanket override) was a second rule set that production
 *    had already superseded at the gateway. The gate now delegates to the one
 *    canonical decision, and this file mounts the three layers in production
 *    order so every status code below is the one a customer actually receives.
 *
 * @compliance 21 CFR Part 11 §11.10(c) protection of records, §11.10(d)
 *             limiting system access to authorized individuals, §11.10(e)
 *             audit-trailed operator entries against a closed record.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../server/db/pglite-harness';

// >= 32 chars: server/config/environment.ts enforces a minimum secret length.
const JWT_SECRET = 'authoring-section-gate-contract-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// The router verifies via canonical verifyJwtWithRotation, which under
// NODE_ENV=test reads JWT_SECRET_DEV ?? JWT_SECRET. Overriding only JWT_SECRET
// would 401 every token in this file.
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

const ORG_A = 1;
const ORG_B = 2;

/** These subjects must skip the live organization_users re-check so that
 *  authorization — not membership — is what this contract exercises. The skip
 *  fires only when parseFiniteInt(userId) === null (enforceOrgMembership), and
 *  Number.parseInt reads leading digits, so the UUID's FIRST hex nibble has to
 *  be a letter (a–f): 'fa1c2a10…' → NaN → null → skipped. A digit-leading UUID
 *  like '7a1c2a10…' parses to 7, runs the re-check, and 503s with no seeded
 *  membership row. Keep the leading nibble non-numeric. */
type Principal = { id: string; email: string; organizationId: number; roles?: string[] };

const MEMBER: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000a001',
  email: 'member@authoring.example',
  organizationId: ORG_A,
};
const GRANTEE: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000a002',
  email: 'grantee@authoring.example',
  organizationId: ORG_A,
};
/** Carries the QA role and NOTHING else — no grant on any document. Under the
 *  legacy gate this role edited every section of the tenant; the canonical
 *  decision has no such override, and neither does production. */
const QA_USER: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000a003',
  email: 'qa@authoring.example',
  organizationId: ORG_A,
  roles: ['QA'],
};
/** The document creator. The canonical DDL seeds the creator as OWNER + AUTHOR
 *  in the same database operation that inserts the document, so ownership is a
 *  fact of the record, not of a request. */
const OWNER_USER: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000a006',
  email: 'owner@authoring.example',
  organizationId: ORG_A,
};
/** A platform administrator — the only role-based bypass the canonical
 *  decision recognises (GLOBAL_ADMIN_ROLES). */
const ADMIN_USER: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000a007',
  email: 'admin@authoring.example',
  organizationId: ORG_A,
  roles: ['ADMIN'],
};
const OUTSIDER: Principal = {
  id: 'fa1c2a10-0000-4000-8000-00000000b001',
  email: 'outsider@other.example',
  organizationId: ORG_B,
};
const ALL_PRINCIPALS = [MEMBER, GRANTEE, QA_USER, OWNER_USER, ADMIN_USER, OUTSIDER];

// doc / section fixtures — one document per document-state so no test depends
// on another having run first.
const DOC_DRAFT = '11111111-0000-4000-8000-000000000001';
const SEC_DRAFT = '11111111-0000-4000-8000-0000000000a1';
const DOC_FROZEN = '11111111-0000-4000-8000-000000000002';
const SEC_FROZEN = '11111111-0000-4000-8000-0000000000a2';
const DOC_APPROVED = '11111111-0000-4000-8000-000000000003';
const SEC_APPROVED = '11111111-0000-4000-8000-0000000000a3';
const DOC_OTHER = '11111111-0000-4000-8000-000000000004';
const SEC_OTHER = '11111111-0000-4000-8000-0000000000a4';
const DOC_B = '22222222-0000-4000-8000-000000000001';
const SEC_B = '22222222-0000-4000-8000-0000000000a1';

const PREREQ = `
  /* Governed authoring writes land a hash-chained, HMAC-sealed §11.10(e) row,
     and that write is fail-closed — the audit row and the mutation it records
     commit together or neither does. Without this table the handler under test
     500s on a save that is otherwise correct. Imported rather than restated so
     it cannot drift from what writeChainedAuditRow writes; the CI gate
     scripts/ci/check-audit-logs-fixture.mjs enforces that agreement. */
  ${AUDIT_LOGS_PGLITE_DDL}
  /* The /api auth boundary this file mounts (authenticateToken) runs the
     tenant-lifecycle and storage-quota guards on every request, and both read
     the organization row — status + payment_status for the posture, max_storage
     for the quota — failing CLOSED (503) when they cannot. These are the columns
     production carries; a fixture without them proves nothing past the 503. */
  CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    payment_status TEXT NOT NULL DEFAULT 'active',
    max_storage INTEGER
  );
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'org-a'), (${ORG_B}, 'org-b');
  INSERT INTO users (id, name, email) VALUES
    ${ALL_PRINCIPALS.map(p => `('${p.id}', '${p.email.split('@')[0]}', '${p.email}')`).join(',\n    ')};
`;

/** status values are seeded in BOTH cases on purpose: this router writes
 *  'draft' lower-case on create and 'FROZEN'/'APPROVED' upper-case on
 *  freeze/approve, so the lock has to be case-insensitive to be real.
 *  created_by is the OWNER principal: the canonical seed trigger keys the
 *  creator's OWNER + AUTHOR grants on exactly that value. */
const SEED = `
  INSERT INTO authoring_documents (id, title, status, created_by, tenant_id) VALUES
    ('${DOC_DRAFT}',    'draft doc',    'draft',    '${OWNER_USER.id}', ${ORG_A}),
    ('${DOC_FROZEN}',   'frozen doc',   'FROZEN',   '${OWNER_USER.id}', ${ORG_A}),
    ('${DOC_APPROVED}', 'approved doc', 'approved', '${OWNER_USER.id}', ${ORG_A}),
    ('${DOC_OTHER}',    'other doc',    'draft',    '${OWNER_USER.id}', ${ORG_A}),
    ('${DOC_B}',        'tenant-b doc', 'draft',    '${OUTSIDER.id}',   ${ORG_B});

  INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id) VALUES
    ('${SEC_DRAFT}',    '${DOC_DRAFT}',    '3.2.S.1', 'Draft',    'ORIGINAL', ${ORG_A}),
    ('${SEC_FROZEN}',   '${DOC_FROZEN}',   '3.2.S.1', 'Frozen',   'ORIGINAL', ${ORG_A}),
    ('${SEC_APPROVED}', '${DOC_APPROVED}', '3.2.S.1', 'Approved', 'ORIGINAL', ${ORG_A}),
    ('${SEC_OTHER}',    '${DOC_OTHER}',    '3.2.S.1', 'Other',    'ORIGINAL', ${ORG_A}),
    ('${SEC_B}',        '${DOC_B}',        '3.2.S.1', 'TenantB',  'ORIGINAL', ${ORG_B});
`;

let jdb: JourneyDb;
let app: express.Express;

async function mint(u: Principal) {
  const claims: Record<string, unknown> = {
    userId: u.id,
    id: u.id,
    email: u.email,
    organizationId: u.organizationId,
    tenant_id: u.organizationId,
    // What the login flow issues. The /api auth boundary (authenticateToken)
    // admits ONLY access tokens; the authoring router's own middleware merely
    // refuses known non-access kinds, which is why the old single-router mount
    // never noticed the claim was missing.
    type: 'access',
  };
  if (u.roles) claims.roles = u.roles;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/** PATCH a section's content as `u`. */
async function patchAs(u: Principal, sectionId: string, content: string) {
  return request(app)
    .patch(`/api/authoring/sections/${sectionId}`)
    .set('Authorization', `Bearer ${await mint(u)}`)
    .send({ content });
}

/** Grant through the canonical router, as `granter`. */
async function grantAs(granter: Principal, docId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/authoring/docs/${docId}/permissions`)
    .set('Authorization', `Bearer ${await mint(granter)}`)
    .send(body);
}

async function contentOf(sectionId: string): Promise<string | null> {
  const r = await jdb.pool.query(`SELECT content FROM authoring_sections WHERE id = $1`, [
    sectionId,
  ]);
  const row = r.rows[0] as { content: string | null } | undefined;
  return row ? row.content : null;
}

async function activeGrants(docId: string, principalId: string): Promise<string[]> {
  const r = await jdb.pool.query(
    `SELECT role FROM doc_permissions
      WHERE doc_id = $1 AND principal_id = $2 AND revoked_at IS NULL
      ORDER BY role`,
    [docId, principalId],
  );
  return (r.rows as { role: string }[]).map(x => x.role);
}

beforeAll(async () => {
  // Every case in this file runs with the per-user matrix ON. Production forces
  // it on (sectionPermsEnforced), and the canonical middleware in front of the
  // router enforces object authorization regardless of the flag — the last
  // describe below proves the flag cannot re-open the gate.
  process.env.AUTH_ENFORCE_SECTION_PERMS = '1';

  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    // The section-save handler writes revision + section + span lineage +
    // audit in ONE transaction, so both the span-lineage table and the
    // authoring_audit_trail table are prerequisites for exercising the save
    // path: a missing table's INSERT aborts the transaction and the section
    // UPDATE rolls back. Provision both alongside the loop tables.
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      // The canonical permission store: role/grant metadata on doc_permissions
      // and the SECURITY DEFINER trigger that seeds each document creator as
      // OWNER + AUTHOR. Same position the durable applier uses
      // (scripts/db/authoring-subsystem.mjs).
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      // ALTERs doc_revisions above with the ledger columns the router now writes
      // (content/chain hashes, origin, input manifest) and installs the
      // append-only triggers. Same position the durable applier uses.
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
    ],
  });
  // exec, not the pool shim: the shim prepares a single statement.
  await jdb.pglite.exec(SEED);
  h.db = jdb.db;
  h.pool = jdb.pool;

  // Mounted in the order server/bootstrap/register-inline-routes.ts mounts
  // them behind the /api auth boundary: the canonical permission router, then
  // the mandatory object-authorization middleware, then the authoring router.
  const { authenticateToken } = await import('../../server/middleware/auth');
  const { default: authoringPermissionsRouter } = await import(
    '../../server/routes/authoring-permissions'
  );
  const { default: authoringObjectAuthorization } = await import(
    '../../server/middleware/authoringObjectAuthorization'
  );
  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json());
  app.use('/api', authenticateToken);
  app.use('/api', authoringPermissionsRouter);
  app.use('/api', authoringObjectAuthorization);
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  delete process.env.AUTH_ENFORCE_SECTION_PERMS;
  await jdb?.close();
});

describe('the permission store is REAL, not a phantom', () => {
  it('doc_permissions exists with the canonical, tenant-keyed, revocable shape the decision queries', async () => {
    const r = await jdb.pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'doc_permissions' ORDER BY column_name`,
    );
    const cols = new Map(
      (r.rows as { column_name: string; data_type: string }[]).map(c => [
        c.column_name,
        c.data_type,
      ]),
    );
    // Before the fix this table had no CREATE statement anywhere in the repo,
    // so turning the gate on could only ever deny. The canonical shape carries
    // the principal, the grantor, a reason, validity and revocation — the
    // columns decideAuthoringPermission filters on.
    expect([...cols.keys()].sort()).toEqual(
      [
        'created_at', 'doc_id', 'email', 'grant_reason', 'granted_by', 'id', 'principal_id',
        'revoke_reason', 'revoked_at', 'revoked_by', 'role', 'section_id', 'tenant_id',
        'updated_at', 'valid_from', 'valid_until',
      ].sort(),
    );
    // INTEGER tenant key — the app RLS policy casts to ::INT.
    expect(cols.get('tenant_id')).toBe('integer');
  }, T);

  it('the creator of every seeded document holds OWNER and AUTHOR, seeded by the DDL itself', async () => {
    for (const doc of [DOC_DRAFT, DOC_FROZEN, DOC_APPROVED, DOC_OTHER]) {
      expect(await activeGrants(doc, OWNER_USER.id)).toEqual(['AUTHOR', 'OWNER']);
    }
    expect(await activeGrants(DOC_B, OUTSIDER.id)).toEqual(['AUTHOR', 'OWNER']);
    expect(await activeGrants(DOC_DRAFT, MEMBER.id)).toEqual([]);
  }, T);
});

describe('record immutability is UNCONDITIONAL', () => {
  it('the owner can edit a DRAFT section (this is not a blanket deny)', async () => {
    const res = await patchAs(OWNER_USER, SEC_DRAFT, 'EDITED-BY-OWNER');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-OWNER');
  }, T);

  it("a FROZEN document's section cannot be edited, even by its owner", async () => {
    const res = await patchAs(OWNER_USER, SEC_FROZEN, 'TAMPERED');
    // The canonical middleware names the seal: a closed record is a conflict
    // with the document's state, not a missing permission.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTHORING_DOCUMENT_IMMUTABLE');
    // The record itself is what matters, not the status code.
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it("an APPROVED document's section cannot be edited (status matched case-insensitively)", async () => {
    const res = await patchAs(OWNER_USER, SEC_APPROVED, 'TAMPERED');
    expect(res.status).toBe(409);
    expect(await contentOf(SEC_APPROVED)).toBe('ORIGINAL');
  }, T);

  it('not even a QA principal may edit a FROZEN record', async () => {
    const res = await patchAs(QA_USER, SEC_FROZEN, 'TAMPERED-BY-QA');
    expect(res.status).not.toBe(200);
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it('a caller with no grant cannot annotate a FROZEN record through a section sub-route', async () => {
    const token = await mint(MEMBER);
    const comment = await request(app)
      .post(`/api/authoring/sections/${SEC_FROZEN}/comment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_id: DOC_FROZEN, body: 'post-freeze annotation' });
    expect(comment.status).toBe(403);
  }, T);

  it("a section in ANOTHER tenant is not even visible to the caller — 404, never a cross-tenant write", async () => {
    const res = await patchAs(MEMBER, SEC_B, 'CROSS-TENANT');
    expect(res.status).toBe(404);
    expect(await contentOf(SEC_B)).toBe('ORIGINAL');
  }, T);

  it('an unknown section id is refused rather than passed through', async () => {
    const res = await patchAs(OWNER_USER, '99999999-0000-4000-8000-000000000999', 'GHOST');
    expect(res.status).toBe(404);
  }, T);

  it('a NEW section cannot be added to a FROZEN document either', async () => {
    // POST /sections sits outside the /sections/:sectionId guard, but adding a
    // section alters the record set a signature attests to just as surely as
    // editing one.
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`)
      .send({ doc_id: DOC_FROZEN, code: '3.2.S.9', title: 'Smuggled', content: 'NEW' });
    expect(res.status).toBe(409);
    const rows = await jdb.pool.query(
      `SELECT id FROM authoring_sections WHERE doc_id = $1 AND code = '3.2.S.9'`,
      [DOC_FROZEN],
    );
    expect(rows.rows).toHaveLength(0);
  }, T);

  it('a NEW section on a DRAFT document is still permitted for its owner', async () => {
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`)
      .send({ doc_id: DOC_DRAFT, code: '3.2.S.8', title: 'Legitimate', content: 'NEW' });
    expect(res.status).toBe(201);
  }, T);

  it("a NEW section against ANOTHER tenant's document is a 404, not an FK 500", async () => {
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(MEMBER)}`)
      .send({ doc_id: DOC_B, code: '3.2.S.7', title: 'Cross tenant', content: 'NEW' });
    expect(res.status).toBe(404);
  }, T);

  it('an unauthenticated section write is rejected before any gate runs', async () => {
    const res = await request(app)
      .patch(`/api/authoring/sections/${SEC_DRAFT}`)
      .send({ content: 'ANONYMOUS' });
    expect(res.status).toBe(401);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-OWNER');
  }, T);
});

describe('the fine-grained matrix — one decision, decided by the canonical service', () => {
  it('a same-tenant member with no grant is DENIED 403 — not 500, not a hang', async () => {
    const res = await patchAs(MEMBER, SEC_DRAFT, 'UNGRANTED');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORING_OBJECT_FORBIDDEN');
    // Enforcement-on used to be unusable: the gate queried a table nothing
    // created and joined a column that does not exist.
    expect(JSON.stringify(res.body)).not.toMatch(/does not exist/i);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-OWNER');
  }, T);

  it('a bare QA role is NOT a grant — the legacy blanket override is gone, as it was in production', async () => {
    const res = await patchAs(QA_USER, SEC_DRAFT, 'EDITED-BY-QA');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-OWNER');
  }, T);

  it('a platform administrator edits without a grant — the one role-based bypass', async () => {
    const res = await patchAs(ADMIN_USER, SEC_DRAFT, 'EDITED-BY-ADMIN');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-ADMIN');
  }, T);

  it('only an owner (or administrator) may grant — a QA principal is refused and nothing is written', async () => {
    const res = await grantAs(QA_USER, DOC_DRAFT, {
      principalId: GRANTEE.id,
      email: GRANTEE.email,
      role: 'AUTHOR',
      reason: 'should not land',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTHORING_PERMISSION_ADMIN_FORBIDDEN');
    expect(await activeGrants(DOC_DRAFT, GRANTEE.id)).toEqual([]);
  }, T);

  it('a grant needs a principal, not just an address', async () => {
    const res = await grantAs(OWNER_USER, DOC_DRAFT, { email: GRANTEE.email, role: 'AUTHOR' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUTHORING_PERMISSION_INVALID');
    expect(await activeGrants(DOC_DRAFT, GRANTEE.id)).toEqual([]);
  }, T);

  it('an AUTHOR granted on the document by its owner CAN edit its section', async () => {
    const grant = await grantAs(OWNER_USER, DOC_DRAFT, {
      principalId: GRANTEE.id,
      email: GRANTEE.email,
      role: 'AUTHOR',
      reason: 'Assigned to draft 3.2.S',
    });
    expect(grant.status).toBe(201);
    // The grant must be written with the granter's VERIFIED tenant, or the
    // tenant-scoped decision could never match it — and it records who
    // granted it and why.
    expect(grant.body.permission).toMatchObject({
      tenant_id: ORG_A,
      principal_id: GRANTEE.id,
      role: 'AUTHOR',
      granted_by: OWNER_USER.id,
      grant_reason: 'Assigned to draft 3.2.S',
    });

    const res = await patchAs(GRANTEE, SEC_DRAFT, 'EDITED-BY-GRANTED-AUTHOR');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-GRANTED-AUTHOR');
  }, T);

  it('a grant on a DIFFERENT document does NOT authorise this section', async () => {
    // GRANTEE already holds AUTHOR on DOC_DRAFT from the previous case; give
    // MEMBER a doc-level grant on an unrelated document instead.
    const grant = await grantAs(OWNER_USER, DOC_OTHER, {
      principalId: MEMBER.id,
      email: MEMBER.email,
      role: 'AUTHOR',
      reason: 'Assigned to the other document',
    });
    expect(grant.status).toBe(201);

    // Permitted on the document it was granted for …
    const allowed = await patchAs(MEMBER, SEC_OTHER, 'EDITED-ON-GRANTED-DOC');
    expect(allowed.status).toBe(200);

    // … and NOT on any other. The old predicate was
    //   WHERE s.id = $1 AND … OR (p.section_id IS NULL AND …)
    // where AND binds tighter than OR, so this doc-level grant escaped the
    // `s.id = $1` anchor entirely and authorised every section in the tenant.
    const denied = await patchAs(MEMBER, SEC_DRAFT, 'LEAKED-ACROSS-DOCUMENTS');
    expect(denied.status).toBe(403);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-GRANTED-AUTHOR');
  }, T);

  it('the doc-level branch stays anchored to the requested section (AND/OR precedence)', async () => {
    // Seeded directly, so the ONLY thing under test is the decision's predicate
    // — not the writer. `roamer` holds a document-level grant on DOC_OTHER and
    // nothing else, correctly tenant-keyed.
    const roamer: Principal = {
      id: 'fa1c2a10-0000-4000-8000-00000000a005',
      email: 'roamer@authoring.example',
      organizationId: ORG_A,
    };
    await jdb.pool.query(
      `INSERT INTO doc_permissions (doc_id, section_id, principal_id, email, role, tenant_id, granted_by)
       VALUES ($1, NULL, $2, $3, 'AUTHOR', $4, $5)`,
      [DOC_OTHER, roamer.id, roamer.email, ORG_A, OWNER_USER.id],
    );

    // The old predicate read
    //   WHERE s.id = $1 AND p.email = $2 AND p.role IN (…)
    //      OR (p.section_id IS NULL AND p.doc_id = s.doc_id AND p.email = $2 AND …)
    // and AND binds tighter than OR, so this row satisfied the second branch
    // for a section of a COMPLETELY DIFFERENT document.
    const leak = await patchAs(roamer, SEC_DRAFT, 'PRECEDENCE-LEAK');
    expect(leak.status).toBe(403);
    expect(await contentOf(SEC_DRAFT)).not.toBe('PRECEDENCE-LEAK');

    // …while the document the grant actually names is still editable.
    expect((await patchAs(roamer, SEC_OTHER, 'ROAMER-ON-OWN-DOC')).status).toBe(200);
  }, T);

  it('a section-scoped grant authorises ONLY the section it names', async () => {
    // A second section on the granted document, addressed specifically.
    const extra = '11111111-0000-4000-8000-0000000000a5';
    await jdb.pool.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
       VALUES ($1, $2, '3.2.S.2', 'Second', 'ORIGINAL', $3)
       ON CONFLICT (id) DO NOTHING`,
      [extra, DOC_OTHER, ORG_A],
    );
    const narrow: Principal = {
      id: 'fa1c2a10-0000-4000-8000-00000000a004',
      email: 'narrow@authoring.example',
      organizationId: ORG_A,
    };
    const grant = await grantAs(OWNER_USER, DOC_OTHER, {
      principalId: narrow.id,
      email: narrow.email,
      role: 'AUTHOR',
      sectionId: extra,
      reason: 'Section 3.2.S.2 only',
    });
    expect(grant.status).toBe(201);
    expect(grant.body.permission.section_id).toBe(extra);

    expect((await patchAs(narrow, extra, 'NARROW-OK')).status).toBe(200);
    expect((await patchAs(narrow, SEC_OTHER, 'NARROW-LEAK')).status).toBe(403);
  }, T);

  it('a REVIEWER may not edit — review is not authorship', async () => {
    const reviewer: Principal = {
      id: 'fa1c2a10-0000-4000-8000-00000000a008',
      email: 'reviewer@authoring.example',
      organizationId: ORG_A,
    };
    const grant = await grantAs(OWNER_USER, DOC_OTHER, {
      principalId: reviewer.id,
      email: reviewer.email,
      role: 'REVIEWER',
      reason: 'Quality review',
    });
    expect(grant.status).toBe(201);
    const res = await patchAs(reviewer, SEC_OTHER, 'EDITED-BY-REVIEWER');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_OTHER)).not.toBe('EDITED-BY-REVIEWER');
  }, T);

  it('a grant naming a document in ANOTHER tenant is refused at the writer', async () => {
    const res = await grantAs(OWNER_USER, DOC_B, {
      principalId: MEMBER.id,
      email: MEMBER.email,
      role: 'AUTHOR',
      reason: 'cross-tenant',
    });
    expect(res.status).toBe(404);
    const rows = await jdb.pool.query(
      `SELECT id FROM doc_permissions WHERE doc_id = $1 AND principal_id = $2`,
      [DOC_B, MEMBER.id],
    );
    expect(rows.rows).toHaveLength(0);
  }, T);

  it('an ungrantable role is rejected rather than stored as an inert row', async () => {
    const res = await grantAs(OWNER_USER, DOC_DRAFT, {
      principalId: MEMBER.id,
      email: MEMBER.email,
      role: 'ADMIN',
      reason: 'not a document role',
    });
    expect(res.status).toBe(400);
    expect(await activeGrants(DOC_DRAFT, MEMBER.id)).toEqual([]);
  }, T);

  it("a FROZEN record's access list is closed too, and a grant cannot reopen its content", async () => {
    // Managing permissions is a mutation of a sealed record's governance and is
    // refused like any other; the seeded OWNER + AUTHOR rows remain the only
    // active grants.
    const grant = await grantAs(OWNER_USER, DOC_FROZEN, {
      principalId: GRANTEE.id,
      email: GRANTEE.email,
      role: 'AUTHOR',
      reason: 'late assignment',
    });
    expect(grant.status).toBe(403);
    expect(await activeGrants(DOC_FROZEN, GRANTEE.id)).toEqual([]);

    const res = await patchAs(GRANTEE, SEC_FROZEN, 'TAMPERED-WITH-GRANT');
    expect(res.status).not.toBe(200);
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it('a revoked grant stops authorising on the very next request', async () => {
    // GRANTEE holds AUTHOR on DOC_DRAFT (granted above) and can edit …
    expect((await patchAs(GRANTEE, SEC_DRAFT, 'BEFORE-REVOKE')).status).toBe(200);

    const listing = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`);
    expect(listing.status).toBe(200);
    const granteeRow = (listing.body.permissions as { id: string; principal_id: string; role: string; revoked_at: string | null }[])
      .find(p => p.principal_id === GRANTEE.id && p.role === 'AUTHOR' && p.revoked_at === null);
    expect(granteeRow).toBeDefined();

    const revoke = await request(app)
      .delete(`/api/authoring/docs/${DOC_DRAFT}/permissions/${granteeRow!.id}`)
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`)
      .send({ reason: 'Assignment ended' });
    expect(revoke.status).toBe(200);
    expect(revoke.body.permission.revoked_at).not.toBeNull();

    // … and is refused the moment the grant is revoked. The legacy gate never
    // read revoked_at, so a revocation changed nothing at the section save.
    const after = await patchAs(GRANTEE, SEC_DRAFT, 'AFTER-REVOKE');
    expect(after.status).toBe(403);
    expect(await contentOf(SEC_DRAFT)).toBe('BEFORE-REVOKE');
  }, T);

  it('the last owner cannot be revoked — a document never becomes unmanageable', async () => {
    const listing = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`);
    const ownerRow = (listing.body.permissions as { id: string; principal_id: string; role: string; revoked_at: string | null }[])
      .find(p => p.principal_id === OWNER_USER.id && p.role === 'OWNER' && p.revoked_at === null);
    expect(ownerRow).toBeDefined();
    const revoke = await request(app)
      .delete(`/api/authoring/docs/${DOC_DRAFT}/permissions/${ownerRow!.id}`)
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`)
      .send({ reason: 'oops' });
    expect(revoke.status).toBe(409);
    expect(revoke.body.error.code).toBe('AUTHORING_LAST_OWNER_REQUIRED');
    expect(await activeGrants(DOC_DRAFT, OWNER_USER.id)).toContain('OWNER');
  }, T);

  it('the permission listing is tenant-scoped and owner-only', async () => {
    const mine = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(OWNER_USER)}`);
    expect(mine.status).toBe(200);
    expect(Array.isArray(mine.body.permissions)).toBe(true);
    expect(mine.body.permissions.length).toBeGreaterThan(0);
    for (const p of mine.body.permissions as { tenant_id: number }[]) {
      expect(p.tenant_id).toBe(ORG_A);
    }

    // Same document id, a caller from another tenant: the document does not
    // exist for them — no rows, no confirmation that the id is real.
    const theirs = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(OUTSIDER)}`);
    expect(theirs.status).toBe(404);
    expect(theirs.body.permissions).toBeUndefined();

    // Same tenant, not an owner: the access list is not theirs to read.
    const member = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(MEMBER)}`);
    expect(member.status).toBe(403);
  }, T);
});

describe('a permission store that cannot be consulted DENIES', () => {
  it('a store error is a fail-closed 503 with no mutation — never a 500, a hang, or a pass-through', async () => {
    // OWNER_USER genuinely may edit SEC_DRAFT at this point, so a pass-through
    // would be indistinguishable from success unless the store is unreachable.
    const before = await contentOf(SEC_DRAFT);
    await jdb.pool.query(`ALTER TABLE doc_permissions RENAME TO doc_permissions_hidden`);
    try {
      const res = await patchAs(OWNER_USER, SEC_DRAFT, 'EDITED-WITH-BROKEN-STORE');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AUTHORING_AUTHORIZATION_UNAVAILABLE');
      expect(await contentOf(SEC_DRAFT)).toBe(before);
    } finally {
      await jdb.pool.query(`ALTER TABLE doc_permissions_hidden RENAME TO doc_permissions`);
    }
  }, T);
});

describe('the legacy kill-switch cannot re-open the gate', () => {
  beforeEach(() => {
    // '0' disables the per-user matrix inside canEditSection outside production.
    // The canonical middleware in front of the router does not read the flag.
    process.env.AUTH_ENFORCE_SECTION_PERMS = '0';
  });

  it('with AUTH_ENFORCE_SECTION_PERMS=0 a member with no grant is still refused', async () => {
    const before = await contentOf(SEC_DRAFT);
    const res = await patchAs(MEMBER, SEC_DRAFT, 'FLAG-OFF-LEAK');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_DRAFT)).toBe(before);
  }, T);

  it('with AUTH_ENFORCE_SECTION_PERMS=0 a FROZEN record is still closed', async () => {
    const res = await patchAs(OWNER_USER, SEC_FROZEN, 'FLAG-OFF-TAMPER');
    expect(res.status).toBe(409);
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);
});
