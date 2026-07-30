/**
 * Security contract (C2C-AUTHOR-001 / C2C-AUTHOR-002): section-level write
 * authorization in server/routes/authoring.router.ts.
 *
 * THREE DEFECTS THIS PINS
 * -----------------------
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
 * WHICH CASES FAIL ON THE PARENT COMMIT
 *   - every FROZEN/APPROVED case (they returned 200 — the Part 11 violation);
 *   - the cross-tenant case (the gate allowed it; only the handler's own
 *     tenant-scoped UPDATE missed, yielding 404 rather than a refusal);
 *   - every flag-on case (the phantom table made the whole path deny, so a
 *     legitimately granted author could not edit either).
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
const MEMBER = {
  id: 'fa1c2a10-0000-4000-8000-00000000a001',
  email: 'member@authoring.example',
  organizationId: ORG_A,
};
const GRANTEE = {
  id: 'fa1c2a10-0000-4000-8000-00000000a002',
  email: 'grantee@authoring.example',
  organizationId: ORG_A,
};
const QA_USER = {
  id: 'fa1c2a10-0000-4000-8000-00000000a003',
  email: 'qa@authoring.example',
  organizationId: ORG_A,
  roles: ['QA'],
};
const OUTSIDER = {
  id: 'fa1c2a10-0000-4000-8000-00000000b001',
  email: 'outsider@other.example',
  organizationId: ORG_B,
};

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
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (${ORG_A}, 'org-a'), (${ORG_B}, 'org-b');
`;

/** status values are seeded in BOTH cases on purpose: this router writes
 *  'draft' lower-case on create and 'FROZEN'/'APPROVED' upper-case on
 *  freeze/approve, so the lock has to be case-insensitive to be real. */
const SEED = `
  INSERT INTO authoring_documents (id, title, status, created_by, tenant_id) VALUES
    ('${DOC_DRAFT}',    'draft doc',    'draft',    'seed', ${ORG_A}),
    ('${DOC_FROZEN}',   'frozen doc',   'FROZEN',   'seed', ${ORG_A}),
    ('${DOC_APPROVED}', 'approved doc', 'approved', 'seed', ${ORG_A}),
    ('${DOC_OTHER}',    'other doc',    'draft',    'seed', ${ORG_A}),
    ('${DOC_B}',        'tenant-b doc', 'draft',    'seed', ${ORG_B});

  INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id) VALUES
    ('${SEC_DRAFT}',    '${DOC_DRAFT}',    '3.2.S.1', 'Draft',    'ORIGINAL', ${ORG_A}),
    ('${SEC_FROZEN}',   '${DOC_FROZEN}',   '3.2.S.1', 'Frozen',   'ORIGINAL', ${ORG_A}),
    ('${SEC_APPROVED}', '${DOC_APPROVED}', '3.2.S.1', 'Approved', 'ORIGINAL', ${ORG_A}),
    ('${SEC_OTHER}',    '${DOC_OTHER}',    '3.2.S.1', 'Other',    'ORIGINAL', ${ORG_A}),
    ('${SEC_B}',        '${DOC_B}',        '3.2.S.1', 'TenantB',  'ORIGINAL', ${ORG_B});
`;

let jdb: JourneyDb;
let app: express.Express;

type Principal = { id: string; email: string; organizationId: number; roles?: string[] };

async function mint(u: Principal) {
  const claims: Record<string, unknown> = {
    userId: u.id,
    id: u.id,
    email: u.email,
    organizationId: u.organizationId,
    tenant_id: u.organizationId,
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

async function contentOf(sectionId: string): Promise<string | null> {
  const r = await jdb.pool.query(`SELECT content FROM authoring_sections WHERE id = $1`, [
    sectionId,
  ]);
  const row = r.rows[0] as { content: string | null } | undefined;
  return row ? row.content : null;
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: ['db/migrations/20260725_authoring_document_loop_tables.sql'],
  });
  // exec, not the pool shim: the shim prepares a single statement.
  await jdb.pglite.exec(SEED);
  h.db = jdb.db;
  h.pool = jdb.pool;

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json());
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  delete process.env.AUTH_ENFORCE_SECTION_PERMS;
  await jdb?.close();
});

describe('the permission store is REAL, not a phantom', () => {
  it('doc_permissions exists with the tenant-keyed shape the gate queries', async () => {
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
    // so turning the gate on could only ever deny.
    expect([...cols.keys()].sort()).toEqual(
      ['created_at', 'doc_id', 'email', 'id', 'role', 'section_id', 'tenant_id'].sort(),
    );
    // INTEGER tenant key — the app RLS policy casts to ::INT.
    expect(cols.get('tenant_id')).toBe('integer');
  }, T);
});

describe('record immutability is UNCONDITIONAL (flag OFF — the deployed default)', () => {
  beforeEach(() => {
    delete process.env.AUTH_ENFORCE_SECTION_PERMS;
  });

  it('a same-tenant member can still edit a DRAFT section (this is not a blanket deny)', async () => {
    const res = await patchAs(MEMBER, SEC_DRAFT, 'EDITED-BY-MEMBER');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-MEMBER');
  }, T);

  it('a FROZEN document\'s section cannot be edited, flag off', async () => {
    const res = await patchAs(MEMBER, SEC_FROZEN, 'TAMPERED');
    expect(res.status).toBe(403);
    // The record itself is what matters, not the status code.
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it('an APPROVED document\'s section cannot be edited, flag off (status matched case-insensitively)', async () => {
    const res = await patchAs(MEMBER, SEC_APPROVED, 'TAMPERED');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_APPROVED)).toBe('ORIGINAL');
  }, T);

  it('not even a QA principal may edit a FROZEN record', async () => {
    const res = await patchAs(QA_USER, SEC_FROZEN, 'TAMPERED-BY-QA');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it('the lock covers every guarded section sub-route, not just content PATCH', async () => {
    const token = await mint(MEMBER);
    const comment = await request(app)
      .post(`/api/authoring/sections/${SEC_FROZEN}/comment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_id: DOC_FROZEN, body: 'post-freeze annotation' });
    expect(comment.status).toBe(403);
  }, T);

  it('a section in ANOTHER tenant is REFUSED by the gate, not merely missed by the handler', async () => {
    const res = await patchAs(MEMBER, SEC_B, 'CROSS-TENANT');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_B)).toBe('ORIGINAL');
  }, T);

  it('an unknown section id is refused rather than passed through', async () => {
    const res = await patchAs(MEMBER, '99999999-0000-4000-8000-000000000999', 'GHOST');
    expect(res.status).toBe(403);
  }, T);

  it('a NEW section cannot be added to a FROZEN document either', async () => {
    // POST /sections sits outside the /sections/:sectionId guard, but adding a
    // section alters the record set a signature attests to just as surely as
    // editing one.
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ doc_id: DOC_FROZEN, code: '3.2.S.9', title: 'Smuggled', content: 'NEW' });
    expect(res.status).toBe(403);
    const rows = await jdb.pool.query(
      `SELECT id FROM authoring_sections WHERE doc_id = $1 AND code = '3.2.S.9'`,
      [DOC_FROZEN],
    );
    expect(rows.rows).toHaveLength(0);
  }, T);

  it('a NEW section on a DRAFT document is still permitted', async () => {
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ doc_id: DOC_DRAFT, code: '3.2.S.8', title: 'Legitimate', content: 'NEW' });
    expect(res.status).toBe(201);
  }, T);

  it('a NEW section against ANOTHER tenant\'s document is a 404, not an FK 500', async () => {
    const res = await request(app)
      .post('/api/authoring/sections')
      .set('Authorization', `Bearer ${await mint(MEMBER)}`)
      .send({ doc_id: DOC_B, code: '3.2.S.7', title: 'Cross tenant', content: 'NEW' });
    expect(res.status).toBe(404);
  }, T);

  it('an unauthenticated section write is rejected before the gate runs', async () => {
    const res = await request(app)
      .patch(`/api/authoring/sections/${SEC_DRAFT}`)
      .send({ content: 'ANONYMOUS' });
    expect(res.status).toBe(401);
  }, T);
});

describe('the fine-grained matrix WORKS when enabled (flag ON)', () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCE_SECTION_PERMS = '1';
  });

  it('a same-tenant member with no grant is DENIED 403 — not 500, not a hang', async () => {
    const res = await patchAs(MEMBER, SEC_DRAFT, 'UNGRANTED');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('No edit permission for this section');
    // Enforcement-on used to be unusable: the gate queried a table nothing
    // created and joined a column that does not exist.
    expect(JSON.stringify(res.body)).not.toMatch(/does not exist/i);
  }, T);

  it('a QA principal is authorised by role', async () => {
    const res = await patchAs(QA_USER, SEC_DRAFT, 'EDITED-BY-QA');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-QA');
  }, T);

  it('an AUTHOR granted on the document CAN edit its section', async () => {
    const grant = await request(app)
      .post(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: GRANTEE.email, role: 'AUTHOR' });
    expect(grant.status).toBe(200);
    // The grant must be written with the granter's VERIFIED tenant, or the
    // tenant-scoped gate could never match it.
    expect(grant.body.tenant_id).toBe(ORG_A);

    const res = await patchAs(GRANTEE, SEC_DRAFT, 'EDITED-BY-GRANTED-AUTHOR');
    expect(res.status).toBe(200);
    expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-GRANTED-AUTHOR');
  }, T);

  it('a grant on a DIFFERENT document does NOT authorise this section', async () => {
    // GRANTEE already holds AUTHOR on DOC_DRAFT from the previous case; give
    // MEMBER a doc-level grant on an unrelated document instead.
    const grant = await request(app)
      .post(`/api/authoring/docs/${DOC_OTHER}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: MEMBER.email, role: 'AUTHOR' });
    expect(grant.status).toBe(200);

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
    // Seeded directly, so the ONLY thing under test is the gate's predicate —
    // not the writer. `roamer` holds a document-level grant on DOC_OTHER and
    // nothing else, correctly tenant-keyed.
    const roamer: Principal = {
      id: 'fa1c2a10-0000-4000-8000-00000000a005',
      email: 'roamer@authoring.example',
      organizationId: ORG_A,
    };
    await jdb.pool.query(
      `INSERT INTO doc_permissions (doc_id, section_id, email, role, tenant_id)
       VALUES ($1, NULL, $2, 'AUTHOR', $3)`,
      [DOC_OTHER, roamer.email, ORG_A],
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
    const grant = await request(app)
      .post(`/api/authoring/docs/${DOC_OTHER}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: 'narrow@authoring.example', role: 'REVIEWER', section_id: extra });
    expect(grant.status).toBe(200);

    const narrow: Principal = {
      id: 'fa1c2a10-0000-4000-8000-00000000a004',
      email: 'narrow@authoring.example',
      organizationId: ORG_A,
    };
    expect((await patchAs(narrow, extra, 'NARROW-OK')).status).toBe(200);
    expect((await patchAs(narrow, SEC_OTHER, 'NARROW-LEAK')).status).toBe(403);
  }, T);

  it('a grant naming a document in ANOTHER tenant is refused at the writer', async () => {
    const res = await request(app)
      .post(`/api/authoring/docs/${DOC_B}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: MEMBER.email, role: 'AUTHOR' });
    expect(res.status).toBe(404);
    const rows = await jdb.pool.query(`SELECT id FROM doc_permissions WHERE doc_id = $1`, [DOC_B]);
    expect(rows.rows).toHaveLength(0);
  }, T);

  it('an ungrantable role is rejected rather than stored as an inert row', async () => {
    const res = await request(app)
      .post(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: MEMBER.email, role: 'ADMIN' });
    expect(res.status).toBe(400);
  }, T);

  it('a valid grant still cannot edit a FROZEN record', async () => {
    const grant = await request(app)
      .post(`/api/authoring/docs/${DOC_FROZEN}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`)
      .send({ email: GRANTEE.email, role: 'AUTHOR' });
    expect(grant.status).toBe(200);

    const res = await patchAs(GRANTEE, SEC_FROZEN, 'TAMPERED-WITH-GRANT');
    expect(res.status).toBe(403);
    expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
  }, T);

  it('the permission listing is tenant-scoped', async () => {
    const mine = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(QA_USER)}`);
    expect(mine.status).toBe(200);
    expect(Array.isArray(mine.body)).toBe(true);
    expect(mine.body.length).toBeGreaterThan(0);

    // Same document id, a caller from another tenant: no rows, ever.
    const theirs = await request(app)
      .get(`/api/authoring/docs/${DOC_DRAFT}/permissions`)
      .set('Authorization', `Bearer ${await mint(OUTSIDER)}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body).toHaveLength(0);
  }, T);
});

describe('a permission store that cannot be consulted DENIES', () => {
  beforeEach(() => {
    process.env.AUTH_ENFORCE_SECTION_PERMS = '1';
  });

  it('a store error is a 403, never a 500, a hang, or a pass-through', async () => {
    // GRANTEE genuinely holds AUTHOR on DOC_DRAFT at this point, so a pass-through
    // would be indistinguishable from success unless the store is unreachable.
    await jdb.pool.query(`ALTER TABLE doc_permissions RENAME TO doc_permissions_hidden`);
    try {
      const res = await patchAs(GRANTEE, SEC_DRAFT, 'EDITED-WITH-BROKEN-STORE');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('No edit permission for this section');
      expect(await contentOf(SEC_DRAFT)).toBe('EDITED-BY-GRANTED-AUTHOR');
    } finally {
      await jdb.pool.query(`ALTER TABLE doc_permissions_hidden RENAME TO doc_permissions`);
    }
  }, T);

  it('the immutability lock still holds while the store is unreachable', async () => {
    await jdb.pool.query(`ALTER TABLE doc_permissions RENAME TO doc_permissions_hidden`);
    try {
      const res = await patchAs(QA_USER, SEC_FROZEN, 'TAMPERED-STORE-DOWN');
      expect(res.status).toBe(403);
      expect(await contentOf(SEC_FROZEN)).toBe('ORIGINAL');
    } finally {
      await jdb.pool.query(`ALTER TABLE doc_permissions_hidden RENAME TO doc_permissions`);
    }
  }, T);
});
