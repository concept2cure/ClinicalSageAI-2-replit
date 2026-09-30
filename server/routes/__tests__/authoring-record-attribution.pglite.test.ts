/**
 * Who did it, and why they said they did — on every authoring act the record
 * keeps, including the ones a legacy wrapper used to write (row D5, 2026-09-29).
 *
 * The REAL authoring router over HTTP (supertest, real signed JWTs) on
 * in-process Postgres (PGlite) built from the authoring subsystem unit and the
 * audit_logs chain.
 *
 *   1. A tracked-change decision on a document this tenant does not have —
 *      an id that names nothing, or another tenant's document — is 404, and
 *      nothing is written. Only FROZEN used to refuse: the decision was
 *      upserted, trailed and chained against a document that is not there.
 *   2. The acts the router's legacy wrapper wrote (it rebuilt a request from
 *      an email, so the rows had no actor id and the invented reason "Legacy
 *      audit event") are recorded with the real actor, on both paths:
 *        - a section reorder, on the caller's transaction (the chained row);
 *        - a document review, standalone (the index row, which named the actor
 *          by email — Number(email) is NaN, so it had none).
 *      A review that states a reason records it as the reason; nothing else
 *      gets one it was not given.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

async function seedDoc(tenantId = ORG): Promise<{ docId: string; sectionIds: string[] }> {
  const docId = randomUUID();
  const sectionIds = [randomUUID(), randomUUID()];
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M2', 'draft', $3, $4)`,
    [docId, `Module 2.5 — attribution ${docId.slice(0, 8)}`, AUTHOR.id, tenantId],
  );
  for (const [i, id] of sectionIds.entries()) {
    await jdb.pool.query(
      `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
       VALUES ($1, $2, $3, 'Section', '<p>Text.</p>', $4, $5)`,
      [id, docId, `2.5.${i + 1}`, i, tenantId],
    );
  }
  return { docId, sectionIds };
}

/** Every row either store holds about `docId`, in any tenant. */
async function everythingAbout(docId: string) {
  return {
    decisions: await rows('SELECT 1 FROM authoring_tracked_change_decisions WHERE artifact_id = $1', [docId]),
    trail: await rows('SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1', [docId]),
    chain: await rows(`SELECT 1 FROM audit_logs WHERE record_id = $1 OR new_values->>'docId' = $1`, [docId]),
  };
}

/** The one trail row of `operation` on `docId`, and the audit_logs row naming it. */
async function recordOf(docId: string, operation: string) {
  const [trail] = await rows<{ id: string; actor_id: string | null; change_reason: string | null }>(
    `SELECT id, actor_id, change_reason FROM authoring_audit_trail
      WHERE doc_id = $1 AND operation_type = $2`,
    [docId, operation],
  );
  const chain = await rows<{ actor_id: number | null; user_id: number | null; reason: string | null }>(
    `SELECT actor_id, user_id, reason FROM audit_logs
      WHERE action = $1 AND new_values->>'docId' = $2`,
    [`authoring.section.${operation}`, docId],
  );
  return { trail, chain };
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      // The authoring subsystem unit, in the durable applier's order.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      // The standalone path's logAction also writes the tamper-proof log.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('1 — a decision on a document this tenant does not have', () => {
  it.each([
    ['an id that names no document', async () => randomUUID()],
    ['another tenant’s document', async () => (await seedDoc(OTHER_ORG)).docId],
  ])('%s: 404 for single and bulk, and nothing is written', async (_label, docOf) => {
    const docId = await docOf();
    const one = await author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions`)).send({
      changeId: 'c-1', decision: 'accept', changeType: 'insertion', text: 'Proposed text.',
    });
    expect(one.status, JSON.stringify(one.body)).toBe(404);
    expect(one.body.error).toBe('DOCUMENT_NOT_FOUND');

    const many = await author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions/bulk`)).send({
      decision: 'reject', changeIds: ['c-2', 'c-3'], changes: [{ changeId: 'c-2', text: 'a' }, { changeId: 'c-3', text: 'b' }],
    });
    expect(many.status, JSON.stringify(many.body)).toBe(404);

    expect(await everythingAbout(docId)).toEqual({ decisions: [], trail: [], chain: [] });
  }, T);

  it('the same decision on this tenant’s own document is recorded (the control)', async () => {
    const { docId } = await seedDoc();
    const res = await author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions`)).send({
      changeId: 'c-1', decision: 'accept', changeType: 'insertion', text: 'Proposed text.',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await everythingAbout(docId)).trail).toHaveLength(1);
  }, T);
});

describe('2 — the acts the legacy wrapper wrote carry the real actor, and no invented reason', () => {
  it('a section reorder (on the transaction): actor on the trail row and the chained row; no reason', async () => {
    const { docId, sectionIds } = await seedDoc();
    const res = await author(request(app).post(`/api/authoring/docs/${docId}/sections/reorder`)).send({
      section_ids: [...sectionIds].reverse(),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { trail, chain } = await recordOf(docId, 'REORDER_SECTIONS');
    expect(trail).toMatchObject({ actor_id: AUTHOR.id, change_reason: null });
    expect(chain).toEqual([{ actor_id: Number(AUTHOR.id), user_id: Number(AUTHOR.id), reason: null }]);
  }, T);

  it('a review stating why (standalone): the actor on both rows, and the reviewer’s words as the reason', async () => {
    const { docId } = await seedDoc();
    const why = 'Section 2.5.4 cites the wrong SAP version.';
    const res = await author(request(app).post(`/api/authoring/documents/${docId}/review`)).send({
      review_status: 'changes_requested',
      review_comments: why,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { trail, chain } = await recordOf(docId, 'document_reviewed');
    expect(trail).toMatchObject({ actor_id: AUTHOR.id, change_reason: why });
    expect(chain).toEqual([{ actor_id: Number(AUTHOR.id), user_id: Number(AUTHOR.id), reason: why }]);
  }, T);

  it('an approval with no comment: the actor, and no reason at all', async () => {
    const { docId } = await seedDoc();
    const res = await author(request(app).post(`/api/authoring/documents/${docId}/review`)).send({
      review_status: 'approved',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { trail, chain } = await recordOf(docId, 'document_reviewed');
    expect(trail).toMatchObject({ actor_id: AUTHOR.id, change_reason: null });
    expect(chain).toEqual([{ actor_id: Number(AUTHOR.id), user_id: Number(AUTHOR.id), reason: null }]);
  }, T);

  it('no row anywhere carries the reason "Legacy audit event"', async () => {
    expect(await rows(`SELECT 1 FROM authoring_audit_trail WHERE change_reason = 'Legacy audit event'`)).toEqual([]);
    expect(await rows(`SELECT 1 FROM audit_logs WHERE reason = 'Legacy audit event'`)).toEqual([]);
  });
});

describe('the database this ran on', () => {
  it('had every table and column the routes under test asked for', () => {
    assertNoSchemaGaps(jdb);
  });
});
