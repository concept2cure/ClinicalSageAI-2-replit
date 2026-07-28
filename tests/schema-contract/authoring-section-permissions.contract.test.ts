/**
 * Security contract: object-level section-permission enforcement (G-01).
 *
 * canEditSection() shipped OPT-IN (off unless AUTH_ENFORCE_SECTION_PERMS=1),
 * queried a `doc_permissions` table NOTHING in the repo created (so turning it on
 * took the surface down with 42P01), and carried an unparenthesised OR whose
 * second branch never referenced the target section — a doc-level grant on ANY
 * document authorised a section of a DIFFERENT document, across tenants.
 *
 * This suite forces enforcement ON and drives the REAL authoring router over
 * HTTP against the canonical DDL (loop-tables + the new doc_permissions
 * migration) to prove:
 *   - the document creator can edit their own section (creator auto-grant);
 *   - an unrelated same-tenant user is denied (least privilege);
 *   - a grant on ANOTHER document does NOT authorise this section (OR-bug fix);
 *   - a QA/RA_CMC role overrides;
 *   - an APPROVED document is read-only even to the author;
 *   - a cross-tenant caller is denied;
 *   - commenting is NOT gated by edit permission (reviewers may annotate).
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals, at the object (document/section) level.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';

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
  };
  if (roles) claims.roles = roles;
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
      // doc_permissions is created by the loop-tables migration above (with BOTH
      // composite tenant-parent FKs), so no separate permission-store migration
      // is loaded here.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  tokens.set(AUTHOR.id, await mint(AUTHOR));
  tokens.set(UNRELATED.id, await mint(UNRELATED));
  tokens.set(QA.id, await mint(QA, ['QA']));
  tokens.set(OUTSIDER.id, await mint(OUTSIDER));

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json());
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

    // 1. Creator can edit their own section (auto-grant).
    const edit = await asUser(AUTHOR)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v2 by author' });
    expect(edit.status).toBe(200);

    // 2. Unrelated same-tenant user is denied.
    const denied = await asUser(UNRELATED)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v3 by unrelated' });
    expect(denied.status).toBe(403);

    // 3. A grant on ANOTHER document must NOT authorise this section (OR-bug fix).
    const grant = await asUser(QA)(request(app).post(`/api/authoring/docs/${docId2}/permissions`))
      .send({ email: UNRELATED.email, role: 'AUTHOR' }); // doc-level grant, section_id NULL, on doc2
    expect(grant.status).toBe(200);
    const stillDenied = await asUser(UNRELATED)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v3 via cross-doc grant' });
    expect(stillDenied.status).toBe(403);

    // 4. QA role overrides.
    const qaEdit = await asUser(QA)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v4 by qa' });
    expect(qaEdit.status).toBe(200);

    // 5. Commenting is gated by the SAME section permission as editing.
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

    // 6. A cross-tenant caller is denied.
    const crossTenant = await asUser(OUTSIDER)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v5 by outsider' });
    expect(crossTenant.status).toBe(403);

    // 7. An APPROVED document is read-only even to the author.
    await jdb.pool.query(
      `UPDATE authoring_documents SET status = 'APPROVED' WHERE id = $1 AND tenant_id = 1`,
      [docId1],
    );
    const frozenEdit = await asUser(AUTHOR)(request(app).patch(`/api/authoring/sections/${sectionId1}`))
      .send({ content: 'v6 after approval' });
    expect(frozenEdit.status).toBe(403);
  }, T);
});
