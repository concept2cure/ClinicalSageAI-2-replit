/**
 * Contract: document review, the audit read-back, and comment attribution work.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * authoring.router.ts addressed EIGHT tables that exist in no migration, no
 * schema file, and no runtime DDL helper. PostgreSQL rejects an unknown relation
 * at plan time, so every endpoint touching one was an unconditional 42P01 — not
 * a degraded feature, a 500 on every request since the day it was written.
 * tests/schema-contract/authoring-router-columns.contract.test.ts recorded them
 * as a shrink-only ratchet; this file is the behavioural proof for the three
 * that were resolved by making something WORK rather than by deletion.
 *
 *   authoring_reviews           created. Review-and-approve is the control that
 *                               makes an approval attributable, and the handler
 *                               code was already correct — reviewer identity from
 *                               the verified JWT, every statement tenant-scoped.
 *                               Only the DDL was missing.
 *
 *   authoring_audit_events      never existed and never had a writer. Every
 *                               writer targets authoring_audit_trail, which does
 *                               exist and is on the durable migration path. So
 *                               the only Part 11 read-back surface in the
 *                               authoring stack 500'd while a complete audit
 *                               record accumulated in the table beside it.
 *
 *   authoring_comment_activity  a SECOND activity ledger, parallel to the audit
 *                               trail. Comment resolve/reopen/delete INSERTed
 *                               into it AFTER updating the comment, so the change
 *                               landed and the caller was told it had failed.
 *                               Comment events now go to the one ledger.
 *
 * The other five were deleted with their endpoints — nothing called them, and
 * two of them persisted "regulatory compliance scores" computed from keyword
 * regexes. The route-fence at the bottom of this file keeps them gone.
 *
 * ── How it is driven ──────────────────────────────────────────────────────────
 * The REAL router over HTTP with REAL signed JWTs, against the REAL migrations,
 * on an in-process PostgreSQL. The router's own jose verification stays active,
 * so attribution assertions are about the verified claim rather than a stub.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';
import { AUDIT_LOGS_PGLITE_DDL } from '../../server/db/pglite-harness';
import { stripComments } from '../ui/_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER_SRC = path.join(REPO_ROOT, 'server/routes/authoring.router.ts');

const JWT_SECRET = randomBytes(32).toString('hex');
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = {
  id: '5a1c2a10-0000-4000-8000-000000000001',
  organizationId: 1,
  email: 'author@contract.example',
  name: 'Avery Author',
};
const REVIEWER = {
  id: '5a1c2a10-0000-4000-8000-000000000002',
  organizationId: 1,
  email: 'reviewer@contract.example',
  name: 'Robin Reviewer',
};
const OUTSIDER = {
  id: '5a1c2a10-0000-4000-8000-000000000099',
  organizationId: 2,
  email: 'outsider@other.example',
  name: 'Iris Intruder',
};

const PREREQ = `
  /* Governed authoring writes land a hash-chained, HMAC-sealed §11.10(e) row,
     and that write is fail-closed — the audit row and the mutation it records
     commit together or neither does. Without this table the handler under test
     500s on a save that is otherwise correct. Imported rather than restated so
     it cannot drift from what writeChainedAuditRow writes; the CI gate
     scripts/ci/check-audit-logs-fixture.mjs enforces that agreement. */
  ${AUDIT_LOGS_PGLITE_DDL}
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'contract-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}',   '${AUTHOR.name}',   '${AUTHOR.email}'),
    ('${REVIEWER.id}', '${REVIEWER.name}', '${REVIEWER.email}'),
    ('${OUTSIDER.id}', '${OUTSIDER.name}', '${OUTSIDER.email}');
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

async function mint(u: typeof AUTHOR) {
  return new SignJWT({
    userId: u.id, email: u.email, name: u.name,
    organizationId: u.organizationId, tenant_id: u.organizationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
const tokens = new Map<string, string>();
const as = (u: typeof AUTHOR) => (r: request.Test) => r.set('Authorization', `Bearer ${tokens.get(u.id)!}`);

let docId = '';
let sectionId = '';

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      // ALTERs doc_revisions above with the ledger columns the router now writes
      // (content/chain hashes, origin, input manifest) and installs the
      // append-only triggers. Same position the durable applier uses.
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      // The router's own tables (templates/tokens/export_history/…), moved out
      // of retired runtime DDL into this migration by the canonical-spine
      // refactor — so it is now their only definition.
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      // The section save writes content and its span lineage in one
      // transaction and refuses to commit one without the other, so this table
      // is a prerequisite for the authoring spine rather than an optional extra.
      'db/migrations/20260803_document_span_lineage.sql',
      // The subject of this file. Applied from the SAME path production uses,
      // so a column that exists here exists there.
      'migrations/20260728_authoring_reviews.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  for (const u of [AUTHOR, REVIEWER, OUTSIDER]) tokens.set(u.id, await mint(u));

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);

  const doc = await as(AUTHOR)(request(app).post('/api/authoring/docs')).send({
    title: 'IND 12345 — Module 2.5 Clinical Overview', module: 'M2',
  });
  expect(doc.status).toBe(201);
  docId = doc.body.document.id;

  const sec = await as(AUTHOR)(request(app).post('/api/authoring/sections')).send({
    doc_id: docId, code: '2.5.1', title: 'Rationale', content: 'First draft.', order_index: 1,
  });
  expect(sec.status).toBe(201);
  sectionId = sec.body.section.id;
}, T);

afterAll(async () => { await jdb?.close(); });

describe('document review', () => {
  it('request → list → submit → list, all 200 rather than 42P01', async () => {
    const req1 = await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docId}/request-review`))
      .send({ reviewers: [{ id: REVIEWER.id, name: REVIEWER.name, email: REVIEWER.email }] });
    expect(req1.status).toBe(200);
    expect(req1.body.reviews).toHaveLength(1);

    const list1 = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(list1.status).toBe(200);
    expect(list1.body.stats).toMatchObject({ total: 1, pending: 1, approved: 0 });
    // One outstanding request means the document is not approvable yet — the
    // whole point of the endpoint.
    expect(list1.body.canApprove).toBe(false);

    const submit = await as(REVIEWER)(request(app).post(`/api/authoring/documents/${docId}/review`))
      .send({ review_status: 'approved', review_comments: 'Section 2.5 reads correctly.' });
    expect(submit.status).toBe(200);

    const list2 = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(list2.body.stats).toMatchObject({ total: 1, pending: 0, approved: 1 });
    expect(list2.body.canApprove).toBe(true);
    expect(list2.body.reviews[0].review_comments).toBe('Section 2.5 reads correctly.');
    // The verdict is attributed to the verified reviewer, not to whoever asked.
    expect(list2.body.reviews[0].reviewer_id).toBe(REVIEWER.id);
    expect(list2.body.reviews[0].reviewed_at).toBeTruthy();
  }, T);

  it('re-requesting the same reviewer updates the row instead of duplicating it', async () => {
    // Proves the ON CONFLICT target actually exists. Without the unique index
    // this is 42P10, "no unique or exclusion constraint matching the ON CONFLICT
    // specification" — a different unconditional failure, not a passing test.
    const before = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    const n = before.body.reviews.length;

    const again = await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docId}/request-review`))
      .send({ reviewers: [{ id: REVIEWER.id, name: REVIEWER.name, email: REVIEWER.email }] });
    expect(again.status).toBe(200);

    const after = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    expect(after.body.reviews).toHaveLength(n);
  }, T);

  it('who requested the review comes from the JWT, not from x-user-name', async () => {
    // The header was trusted here while the sibling submit handler had already
    // been hardened. It only stayed harmless because the table did not exist.
    const res = await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docId}/request-review`))
      .set('x-user-name', 'Someone Else Entirely')
      .send({ reviewers: [{ id: OUTSIDER.id, name: 'Named', email: 'named@x.example' }] });
    expect(res.status).toBe(200);

    const row = res.body.reviews[0];
    expect(row.requested_by).toBe(AUTHOR.email);
    expect(row.requested_by).not.toBe('Someone Else Entirely');
  }, T);

  it('an empty reviewer list is refused rather than silently doing nothing', async () => {
    const res = await as(AUTHOR)(request(app).post(`/api/authoring/documents/${docId}/request-review`))
      .send({ reviewers: [] });
    expect(res.status).toBe(400);
  }, T);

  it("another tenant cannot read this document's reviews", async () => {
    const res = await as(OUTSIDER)(request(app).get(`/api/authoring/documents/${docId}/reviews`));
    // Tenant-scoped SELECT: an outsider sees an empty list, never the verdicts.
    expect(res.body.reviews ?? []).toHaveLength(0);
  }, T);
});

describe('the Part 11 audit read-back returns what the writers write', () => {
  it('GET /docs/:docId/audit surfaces the ledger the mutations populate', async () => {
    // Before the repoint this SELECTed authoring_audit_events — a table with no
    // CREATE statement and no writer anywhere in the repository.
    const res = await as(AUTHOR)(request(app).get(`/api/authoring/docs/${docId}/audit`));
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);

    // Creating the section wrote a CREATE record with the author's verified
    // email; the response keeps the field names callers were coded against.
    const create = res.body.events.find((e: any) => e.event_type === 'CREATE');
    expect(create, 'section creation should be in the audit trail').toBeTruthy();
    expect(create.actor).toBe(AUTHOR.email);
    expect(create.content_hash_after).toBeTruthy();
  }, T);

  it("another tenant's audit read returns nothing", async () => {
    const res = await as(OUTSIDER)(request(app).get(`/api/authoring/docs/${docId}/audit`));
    expect(res.body.events ?? []).toHaveLength(0);
  }, T);
});

describe('comments: one write path, attributed, and in the one ledger', () => {
  it('a comment carries its author, so the read path shows a person', async () => {
    const post = await as(REVIEWER)(request(app).post(`/api/authoring/sections/${sectionId}/comment`))
      .send({ body: 'Please cite the stability data here.', doc_id: docId });
    expect(post.status).toBe(201);

    const list = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/comments`));
    expect(list.status).toBe(200);
    const c = list.body.comments.find((x: any) => x.body === 'Please cite the stability data here.');
    expect(c).toBeTruthy();
    // author_name is COALESCE(user_name, created_by). With only the thin write
    // that shipped, user_name was always NULL and every comment in the UI was
    // attributed to a raw actor id.
    expect(c.author_name).toBe(REVIEWER.email);
    expect(c.author_email).toBe(REVIEWER.email);
    expect(c.created_by).toBe(REVIEWER.id);
  }, T);

  it('a reply threads to its parent', async () => {
    const list = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/comments`));
    const parent = list.body.comments[0];

    const reply = await as(AUTHOR)(request(app).post(`/api/authoring/sections/${sectionId}/comment`))
      .send({ body: 'Added in revision 3.', doc_id: docId, parent_comment_id: parent.id });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.parent_comment_id).toBe(parent.id);
  }, T);

  it('the comment lands in the audit trail, not a second activity table', async () => {
    const audit = await as(AUTHOR)(request(app).get(`/api/authoring/docs/${docId}/audit`));
    const actorsFor = (type: string) =>
      audit.body.events.filter((e: any) => e.event_type === type).map((e: any) => e.actor);

    // Asserted as sets, not by index: the ledger orders created_at DESC and
    // these two land in the same clock tick, so position is not a fact.
    expect(actorsFor('comment_added')).toContain(REVIEWER.email);
    expect(actorsFor('reply_added')).toContain(AUTHOR.email);
  }, T);

  it('resolving a comment returns 200 — it used to 500 after saving the change', async () => {
    const list = await as(AUTHOR)(request(app).get(`/api/authoring/documents/${docId}/comments`));
    const target = list.body.comments[0];

    const res = await as(AUTHOR)(request(app).patch(`/api/authoring/comments/${target.id}`))
      .send({ status: 'resolved', resolution_note: 'Citation added.' });
    // The comment UPDATE committed and the activity INSERT then threw 42P01, so
    // the caller was told the resolve failed while it had in fact happened.
    expect(res.status).toBe(200);
    expect(res.body.comment.status).toBe('resolved');

    const audit = await as(AUTHOR)(request(app).get(`/api/authoring/docs/${docId}/audit`));
    expect(audit.body.events.some((e: any) => e.event_type === 'comment_resolved')).toBe(true);
  }, T);
});

describe('the deleted orphan surfaces stay deleted', () => {
  it('no handler is registered for any of them', async () => {
    // Every one of these was an unconditional 42P01 with no caller anywhere in
    // client/ or server/. Two persisted "regulatory compliance scores" derived
    // from keyword regexes; one served hardcoded FDA/EMA guidance updates as
    // live regulatory intelligence; the checklist and change-request statements
    // carried no tenant predicate at all, so creating their tables would have
    // turned a 500 into a working cross-tenant read.
    const GONE: Array<[string, string]> = [
      ['post', `/api/authoring/comments`],
      ['get', `/api/authoring/documents/${docId}/comment-activity`],
      ['post', `/api/authoring/docs/${docId}/checklist/compose`],
      ['get', `/api/authoring/docs/${docId}/checklist`],
      ['get', `/api/authoring/docs/${docId}/checklist/summary`],
      ['post', `/api/authoring/docs/${docId}/cr`],
      ['get', `/api/authoring/docs/${docId}/cr`],
      ['post', `/api/authoring/ai/analyze`],
      ['post', `/api/authoring/ai/feedback`],
      ['get', `/api/authoring/ai/suggestions/${docId}`],
      ['get', `/api/authoring/ai/compliance-scores/${docId}`],
      ['get', `/api/authoring/ai/regulatory-updates`],
    ];

    for (const [method, url] of GONE) {
      const res = await as(AUTHOR)((request(app) as any)[method](url)).send({});
      expect(res.status, `${method.toUpperCase()} ${url} should not be routed`).toBe(404);
    }
  }, T);

  it('and their tables are named nowhere in the router', () => {
    // Comments stripped: this file and the router both DESCRIBE the removal, and
    // a guard that trips on its own explanation is the failure mode
    // tests/ui/_strip-comments.ts exists for.
    const src = stripComments(fs.readFileSync(ROUTER_SRC, 'utf8'));
    for (const t of [
      'authoring_ai_suggestions',
      'authoring_compliance_scores',
      'authoring_suggestion_feedback',
      'authoring_comment_activity',
      'authoring_audit_events',
      'doc_change_requests',
      'doc_checklist',
    ]) {
      expect(src.includes(t), `${t} should no longer be referenced`).toBe(false);
    }
  });
});
