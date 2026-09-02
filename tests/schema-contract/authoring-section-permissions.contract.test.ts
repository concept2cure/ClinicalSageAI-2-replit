/**
 * Security contract: object-level section-permission enforcement (G-01).
 *
 * canEditSection() shipped OPT-IN (off unless AUTH_ENFORCE_SECTION_PERMS=1),
 * queried a `doc_permissions` table NOTHING in the repo created (so turning it on
 * took the surface down with 42P01), and carried an unparenthesised OR whose
 * second branch never referenced the target section — a doc-level grant on ANY
 * document authorised a section of a DIFFERENT document, across tenants.
 *
 * This suite forces enforcement ON and drives the authoring surface over HTTP
 * exactly as production mounts it — the canonical permission router and the
 * mandatory object-authorization middleware on /api, then the authoring router
 * (server/bootstrap/register-inline-routes.ts) — against the canonical DDL
 * (loop-tables + the object-permissions migration) to prove:
 *   - the document creator can edit their own section (the DDL seeds the
 *     creator as OWNER + AUTHOR, and the router's own grant is idempotent
 *     against that);
 *   - an unrelated same-tenant user is denied (least privilege);
 *   - a grant on ANOTHER document does NOT authorise this section (OR-bug fix);
 *   - a bare QA role is NOT a grant (the legacy blanket override never ran in
 *     production; the canonical decision has no such rule);
 *   - an APPROVED document is read-only even to the author;
 *   - a cross-tenant caller cannot see the object at all;
 *   - commenting is gated by the same object permission as editing.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals, at the object (document/section) level.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../server/db/pglite-harness';

const JWT_SECRET = 'section-perms-contract-secret-0728';
process.env.JWT_SECRET = JWT_SECRET;
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

const AUTHOR = { id: '5a1c2a10-0000-4000-8000-000000000001', organizationId: 1, email: 'author@perms.example' };
const UNRELATED = { id: '5a1c2a10-0000-4000-8000-000000000002', organizationId: 1, email: 'unrelated@perms.example' };
const QA = { id: '5a1c2a10-0000-4000-8000-000000000003', organizationId: 1, email: 'qa@perms.example' };
const OUTSIDER = { id: '5a1c2a10-0000-4000-8000-000000000099', organizationId: 2, email: 'outsider@other.example' };

async function mint(u: { id: string; organizationId: number; email: string }, roles?: string[]) {
  const claims: Record<string, unknown> = {
    userId: u.id,
    email: u.email,
    organizationId: u.organizationId,
    tenant_id: u.organizationId,
    // What the login flow issues; the /api auth boundary admits only access tokens.
    type: 'access',
  };
  if (roles) claims.roles = roles;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

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
  INSERT INTO organizations (id, name) VALUES (1, 'org-a'), (2, 'org-b');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}', 'Author', '${AUTHOR.email}'),
    ('${UNRELATED.id}', 'Unrelated', '${UNRELATED.email}'),
    ('${QA.id}', 'Qa', '${QA.email}'),
    ('${OUTSIDER.id}', 'Outsider', '${OUTSIDER.email}');
`;

let jdb: JourneyDb;
let app: express.Express;
const tokens = new Map<string, string>();
let priorEnforce: string | undefined;

const asUser = (u: { id: string }) => (req: request.Test) =>
  req.set('Authorization', `Bearer ${tokens.get(u.id)!}`);

beforeAll(async () => {
  priorEnforce = process.env.AUTH_ENFORCE_SECTION_PERMS;
  process.env.AUTH_ENFORCE_SECTION_PERMS = '1'; // force enforcement ON for this suite

  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      // The canonical permission store: role/grant metadata on doc_permissions
      // and the SECURITY DEFINER trigger that seeds each creator as OWNER +
      // AUTHOR. Same position the durable applier uses.
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      // ALTERs doc_revisions above with the ledger columns the router now writes
      // (content/chain hashes, origin, input manifest) and installs the
      // append-only triggers. Same position the durable applier uses.
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      // The section create/save handlers now record span lineage in the same
      // transaction (source-attribution, landed via #1288), so document_span_lineage
      // is a hard prerequisite for exercising POST /sections and PATCH here.
      'db/migrations/20260803_document_span_lineage.sql',
      // The save-gate writes the authoritative authoring_audit_trail row on the
      // caller's transaction, and createAuditTrail now re-throws (rather than
      // swallowing) a failure when enlisted in that transaction — so the table is
      // a hard prerequisite for PATCH here; without it the mutation aborts (500).
      'db/migrations/20260725_authoring_audit_trail.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  tokens.set(AUTHOR.id, await mint(AUTHOR));
  tokens.set(UNRELATED.id, await mint(UNRELATED));
  tokens.set(QA.id, await mint(QA, ['QA']));
  tokens.set(OUTSIDER.id, await mint(OUTSIDER));

  // Mounted in the order server/bootstrap/register-inline-routes.ts mounts
  // them behind the /api auth boundary.
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
  if (priorEnforce === undefined) delete process.env.AUTH_ENFORCE_SECTION_PERMS;
  else process.env.AUTH_ENFORCE_SECTION_PERMS = priorEnforce;
  await jdb?.close();
});

describe('G-01: object-level section-permission enforcement', () => {
  it('enforces least privilege on section edits and closes the OR-branch over-grant', async () => {
    // Creator makes doc1 (auto-granted AUTHOR) + a section; doc2 exists for the
    // cross-document grant probe.
    const d1 = await asUser(AUTHOR)(request(app).post('/api/authoring/docs')).send({
      title: 'Perms doc 1', module: 'M2',
    });
    expect(d1.status).toBe(201);
    const docId1 = d1.body.document.id as string;

    const s1 = await asUser(AUTHOR)(request(app).post('/api/authoring/sections')).send({
      doc_id: docId1, code: '2.5.1', title: 'Sec', content: 'v1', order_index: 1,
    });
    expect(s1.status).toBe(201);
    const sectionId1 = s1.body.section.id as string;

    const d2 = await asUser(AUTHOR)(request(app).post('/api/authoring/docs')).send({
      title: 'Perms doc 2', module: 'M2',
    });
    expect(d2.status).toBe(201);
    const docId2 = d2.body.document.id as string;

    // 1. Creator can edit their own section. The DDL trigger seeded OWNER +
    //    AUTHOR on insert; the router's own creator grant is idempotent against
    //    it, so the creator holds exactly one active row per role — not the
    //    trigger's pair plus an unattributed email-only duplicate.
    const seeded = await jdb.pool.query(
      `SELECT role FROM doc_permissions
        WHERE doc_id = $1 AND principal_id = $2 AND revoked_at IS NULL ORDER BY role`,
      [docId1, AUTHOR.id],
    );
    expect((seeded.rows as { role: string }[]).map(r => r.role)).toEqual(['AUTHOR', 'OWNER']);
    const edit = await asUser(AUTHOR)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v2 by author' });
    expect(edit.status).toBe(200);

    // 2. Unrelated same-tenant user is denied.
    const denied = await asUser(UNRELATED)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v3 by unrelated' });
    expect(denied.status).toBe(403);

    // 3. A grant on ANOTHER document must NOT authorise this section (OR-bug fix).
    //    Granted by the creator, who is OWNER of doc2 by the same seed.
    const grant = await asUser(AUTHOR)(request(app).post(`/api/authoring/docs/${docId2}/permissions`))
      .send({ principalId: UNRELATED.id, email: UNRELATED.email, role: 'AUTHOR', reason: 'doc2 only' });
    expect(grant.status).toBe(201);
    expect(grant.body.permission).toMatchObject({ tenant_id: 1, principal_id: UNRELATED.id, section_id: null });
    const stillDenied = await asUser(UNRELATED)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v3 via cross-doc grant' });
    expect(stillDenied.status).toBe(403);

    // 4. A bare QA role is NOT a grant. The legacy gate let QA / RA_CMC edit any
    //    section of the tenant; the canonical middleware that production mounts
    //    in front of it never had that rule, so the override never decided a
    //    request. The gate now delegates to the same decision.
    const qaEdit = await asUser(QA)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v4 by qa' });
    expect(qaEdit.status).toBe(403);
    //    Neither may QA manage the access list: that is the owner's.
    const qaGrant = await asUser(QA)(request(app).post(`/api/authoring/docs/${docId1}/permissions`))
      .send({ principalId: QA.id, email: QA.email, role: 'AUTHOR', reason: 'self-grant' });
    expect(qaGrant.status).toBe(403);

    // 5. Commenting is gated by the SAME object permission as editing.
    //
    // This asserts the platform's actual (stricter) behaviour: a caller with no
    // grant on the section cannot annotate it either. Recorded here rather than
    // left implicit because it is a real product trade-off — a review workflow
    // where reviewers annotate without authoring rights would need a REVIEWER-level
    // carve-out on the comment route. Erring strict is the safe default for a
    // regulated record, so the behaviour is pinned, not "fixed", by this test.
    const comment = await asUser(UNRELATED)(request(app).post(`/api/authoring/sections/${sectionId1}/comment`))
      .send({ doc_id: docId1, body: 'A reviewer note' });
    expect(comment.status).toBe(403);

    // 6. A cross-tenant caller cannot even see the object.
    const crossTenant = await asUser(OUTSIDER)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v5 by outsider' });
    expect(crossTenant.status).toBe(404);

    // 7. An APPROVED document is read-only even to the author — and the
    //    refusal names the seal (409), not a missing permission.
    await jdb.pool.query(
      `UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1 AND tenant_id = 1`,
      [docId1],
    );
    const frozenEdit = await asUser(AUTHOR)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v6 after approval' });
    expect(frozenEdit.status).toBe(409);
    expect(frozenEdit.body.error.code).toBe('AUTHORING_DOCUMENT_IMMUTABLE');
    const finalContent = await jdb.pool.query(
      `SELECT content FROM authoring_sections WHERE id = $1`,
      [sectionId1],
    );
    expect((finalContent.rows[0] as { content: string }).content).toBe('v2 by author');
  }, T);
});
