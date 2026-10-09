/**
 * A document's authoring record leaves the building only on the record — the
 * REAL authoring router over HTTP (supertest, real signed JWTs) on in-process
 * Postgres (PGlite) built from the authoring subsystem unit, the audit_logs
 * chain and the AnA turn-record store (row D5, 2026-09-26).
 *
 * GET /api/authoring/docs/:docId/audit/export
 *   (i)   exactly one chained audit_logs row 'authoring.record.exported' is
 *         written and COMMITTED before the response leaves (the statement
 *         trace carries a marker for the moment the response is sent);
 *   (ii)  every chained event in the package verifies OFFLINE, by the
 *         package's own howToVerify steps, using only node:crypto and
 *         shared/canonical-json stableStringify (_authoring-record-fixture.ts
 *         verifyOffline — not borrowed from the server) — and the same steps
 *         catch a row rewritten past the table's guard;
 *   (iii) when that row cannot be written: 503
 *         AUTHORING_RECORD_EXPORT_NOT_RECORDED, and no package in the body;
 *   (iv)  another tenant's document: 404, nothing written, nothing sent;
 *   (v)   when the tenant chain walk throws, tenantChain.ok is null — in the
 *         package and in the recorded export row — never true.
 *
 * ── What is replaced ──────────────────────────────────────────────────────────
 * Only two seams: the db module (pointed at PGlite, as every sibling harness
 * does) and services/audit/tenant-chain-verdict.js, whose production walk opens
 * a super-admin connection through db/runtime. It is replaced by the SAME
 * verifier (chain.ts verifyAuditChain) over the PGlite session, and by a throw
 * for (v). The pool is wrapped to record which executor each statement went
 * through (see _authoring-record-fixture.ts for why).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import {
  T, sha256, newTrace, head, tappedPool, responseMarker, rowsOf, countOf, verifyOffline,
  since as sinceIn, writesSince as writesSinceIn, type Pkg,
} from './_authoring-record-fixture';
import { TurnRecorder, writeTurnRecord } from '../../services/ana/turn-record';

const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  /** The PGlite session, for the tenant-chain walk below. */
  pglite: null as unknown,
  /** (v): the admin-scoped chain walk cannot run. */
  chainWalkThrows: false,
  chainWalkCalls: 0,
}));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
/* The production walk opens a super-admin scoped connection through
   db/runtime, which has no database under test. Replaced by the SAME verifier
   (services/audit/chain.ts verifyAuditChain) over the PGlite session, so the
   verdict in the package is a real walk of the real chain — and by a throw
   for (v). */
vi.mock('../../services/audit/tenant-chain-verdict.js', async () => {
  const { verifyAuditChain } = await import('../../services/audit/chain.js');
  return {
    verifyTenantChainOnAdminScope: async (orgId: number) => {
      h.chainWalkCalls += 1;
      if (h.chainWalkThrows) throw new Error('injected: no admin-scoped connection for the chain walk');
      return verifyAuditChain(h.pglite as Parameters<typeof verifyAuditChain>[0], { tenantId: orgId });
    },
  };
});

/** A member of the OTHER organization. */
const OUTSIDER = { id: '9', organizationId: OTHER_ORG, email: 'outsider@other.example', name: 'Iris Outsider' };

// The document exported, one to tamper with, one in another org.
const DOC_X = 'e0c0000a-0000-4000-8000-00000000000a';
const SEC_X = 'e5ec000a-0000-4000-8000-0000000000a1';
const SEC_X_CONTENT = '<p>The pivotal study met its primary endpoint with a hazard ratio of 0.71.</p>';
const DOC_T = 'e0c0000c-0000-4000-8000-00000000000c';
const SEC_T = 'e5ec000c-0000-4000-8000-0000000000c1';
const DOC_F = 'e0c0000f-0000-4000-8000-00000000000f';
const SEC_F = 'e5ec000f-0000-4000-8000-0000000000f1';

const trace = newTrace();
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let outsider: (r: request.Test) => request.Test;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      // The authoring subsystem unit, in the durable applier's order
      // (scripts/db/authoring-subsystem.mjs AUTHORING_SUBSYSTEM_FILES) —
      // including the 2026-09-26 amendments: the trail's actor_id and
      // append-only triggers, and the comment's content-fixed trigger.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      // On the deploy set: comment threading columns.
      'migrations/20260728_authoring_comments_threading.sql',
      // The chain's order key, and the AnA turn records a suggestion names.
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260926_ana_turn_records.sql',
      // Span lineage, which the accept's gate writes (base + both wideners).
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      // The draft-candidate store: table, generator, assertions.
      'db/migrations/20260809_source_attribution_draft_candidates.sql',
      'migrations/20260814i_draft_candidate_generator.sql',
      'migrations/20260906c_draft_candidate_assertions.sql',
    ],
    testOnlySql: `
      INSERT INTO users (id, name, email) VALUES (${OUTSIDER.id}, '${OUTSIDER.name}', '${OUTSIDER.email}');
      INSERT INTO organization_users (organization_id, user_id, role) VALUES (${OTHER_ORG}, ${OUTSIDER.id}, 'member');
      INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id) VALUES
        ('${DOC_X}', 'Module 2.5 Clinical Overview', 'M2', 'draft', '${AUTHOR.id}', ${ORG}),
        ('${DOC_T}', 'Module 2.7 Clinical Summary', 'M2', 'draft', '${AUTHOR.id}', ${ORG}),
        ('${DOC_F}', 'Another organization''s overview', 'M2', 'draft', '${OUTSIDER.id}', ${OTHER_ORG});
      INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id) VALUES
        ('${SEC_X}', '${DOC_X}', '2.5.4', 'Overview of Efficacy', '${SEC_X_CONTENT}', 0, ${ORG}),
        ('${SEC_T}', '${DOC_T}', '2.7.3', 'Summary of Clinical Efficacy', '<p>Summary.</p>', 0, ${ORG}),
        ('${SEC_F}', '${DOC_F}', '2.5.1', 'Rationale', '<p>Another organization''s words.</p>', 0, ${OTHER_ORG});
    `,
  });
  h.db = jdb.db;
  h.pglite = jdb.pglite;
  h.pool = tappedPool(jdb, trace);

  author = asToken(await mint(AUTHOR));
  outsider = asToken(await mint(OUTSIDER));
  const { default: router } = await import('../authoring.router');
  app = express();
  app.use(responseMarker(trace));
  app.use(makeApp(router));
}, T);

afterAll(async () => {
  await jdb?.close();
});

beforeEach(() => {
  trace.failOn = null;
  trace.faultHits = 0;
  h.chainWalkThrows = false;
});

const since = (mark: number) => sinceIn(trace, mark);
const writesSince = (mark: number) => writesSinceIn(trace, mark);
const rows = <R,>(sql: string, params: unknown[] = []) => rowsOf<R>(jdb, sql, params);
const n = (sql: string, params: unknown[] = []) => countOf(jdb, sql, params);
const exportOf = (as: (r: request.Test) => request.Test, docId: string) =>
  as(request(app).get(`/api/authoring/docs/${docId}/audit/export`));
const exportRowCount = (docId: string) =>
  n(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'authoring.record.exported' AND record_id = $1`, [docId]);
const tenantChainRows = (tenantId: number) =>
  n('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND sha256_chain IS NOT NULL', [tenantId]);

const LONG_PROPOSAL =
  'The primary endpoint, progression-free survival at 12 months, was met with a hazard ratio of 0.62. '.repeat(8) +
  '[END-OF-PROPOSAL]';
const made = { commentId: '', turnId: '', turnSha: '' };

/* What the export carries: a comment quoting a passage and a decision on an
   AnA suggestion, both through the routes, the decision naming a real turn. */
beforeAll(async () => {
  // An AnA turn in this tenant, which the suggestion below names.
  const r = new TurnRecorder();
  r.setTurn({ organizationId: ORG, threadId: `th_${ORG}`, runId: randomUUID(), actorUserId: Number(AUTHOR.id), surface: 'conversation' });
  r.setRequest('Draft the efficacy overview for 2.5.4', 'Draft the efficacy overview for 2.5.4');
  r.setModel({ provider: 'anthropic', model: 'model-x', effort: 'balanced' });
  r.setAnswer({ streamed: LONG_PROPOSAL, stored: LONG_PROPOSAL });
  const turn = await writeTurnRecord(jdb.pool, r.seal('answered'));
  made.turnId = turn.id;
  made.turnSha = turn.sha256;

  // A comment quoting a passage, through the route.
  const c = await author(request(app).post(`/api/authoring/sections/${SEC_X}/comment`)).send({
    body: 'Cite the SAP section that pre-specifies this endpoint.',
    anchor: { quote: 'met its primary endpoint', from: 21, to: 45 },
  });
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  made.commentId = c.body.comment.id;

  // A decision on an AnA suggestion, through the route, with its whole text,
  // the turn record it came from and a stated reason.
  const d = await author(request(app).post(`/api/authoring/documents/${DOC_X}/tracked-change-decisions`)).send({
    changeId: 'ana-ins-1',
    decision: 'accept',
    changeType: 'insertion',
    text: LONG_PROPOSAL,
    authorId: 'ana',
    authorName: 'AnA',
    at: '2026-09-26T10:00:00.000Z',
    sectionId: SEC_X,
    sourceRecord: made.turnId,
    reason: 'Matches CSR Table 14.2.1',
  });
  expect(d.status, JSON.stringify(d.body)).toBe(200);
}, T);

describe('(i) the export is recorded before it leaves', () => {
  it('(i) writes exactly one chained "authoring.record.exported" row, committed before the response is sent', async () => {
    const before = await exportRowCount(DOC_X);
    const chainBefore = await tenantChainRows(ORG);
    const mark = trace.stmts.length;

    const res = await exportOf(author, DOC_X);
    expect(res.status, res.text).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="authoring-record-${DOC_X}.json"`);

    // Exactly one row, for this document, on the tenant chain.
    expect(await exportRowCount(DOC_X)).toBe(before + 1);
    const [row] = await rows<{
      tenant_id: number; actor_id: number; user_id: number; table_name: string; record_id: string;
      sha256_chain: string | null; chain_seq: string | null; new_values: unknown;
    }>(
      `SELECT tenant_id, actor_id, user_id, table_name, record_id, sha256_chain, chain_seq::text AS chain_seq, new_values
         FROM audit_logs WHERE action = 'authoring.record.exported' AND record_id = $1
        ORDER BY chain_seq DESC LIMIT 1`,
      [DOC_X],
    );
    const details = (typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values) as Record<string, unknown>;
    expect(row).toMatchObject({ tenant_id: ORG, actor_id: Number(AUTHOR.id), user_id: Number(AUTHOR.id), table_name: 'authoring_document', record_id: DOC_X });
    expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(row.chain_seq).not.toBeNull();
    expect(details).toMatchObject({ format: 'authoring-record-export/1', events: 2, intact: 2, broken: 0, tenantChainOk: true });

    // BEFORE: the INSERT and its COMMIT, on the export's own client and
    // transaction, precede the moment the response is sent — and nothing else
    // was written by the export.
    const s = since(mark);
    const insertAt = s.findIndex((x) => x.via === 'client' && /^\s*INSERT INTO audit_logs\b/i.test(x.sql) && x.params.includes('authoring.record.exported'));
    const commitAt = s.findIndex((x, i) => i > insertAt && x.via === 'client' && head(x.sql) === 'COMMIT');
    const responseAt = s.findIndex((x) => x.via === 'response');
    expect(insertAt, 'the export row was not written').toBeGreaterThanOrEqual(0);
    expect(s[insertAt].inTx).toBe(true);
    expect(commitAt).toBeGreaterThan(insertAt);
    expect(responseAt).toBeGreaterThan(commitAt);
    expect(s[responseAt].sql).toBe(`GET /api/authoring/docs/${DOC_X}/audit/export -> 200`);
    expect(writesSince(mark)).toEqual([['audit_logs', 'client', true]]);

    // And the chain still verifies with the new row on it.
    const { verifyAuditChain } = await import('../../services/audit/chain');
    const walk = await verifyAuditChain(jdb.pglite as unknown as Parameters<typeof verifyAuditChain>[0], { tenantId: ORG });
    expect(walk.ok).toBe(true);
    expect(walk.rowsChecked).toBe(chainBefore + 1);
  }, T);
});

describe('(ii) the package verifies offline', () => {
  it('(ii) every chained event in the package verifies offline by the package’s own steps', async () => {
    const chainRowsAtExport = await tenantChainRows(ORG);
    const res = await exportOf(author, DOC_X);
    expect(res.status, res.text).toBe(200);
    // The downloaded file, parsed as an inspector would.
    const pkg = JSON.parse(res.text) as Pkg;

    expect(pkg.format).toBe('authoring-record-export/1');
    expect(pkg.document).toEqual({ id: DOC_X, title: 'Module 2.5 Clinical Overview', status: 'draft', module: 'M2' });
    expect(pkg.exportedBy).toEqual({ userId: AUTHOR.id });
    // The steps the verifier below implements are the ones the package states.
    const steps = pkg.howToVerify.join('\n');
    for (const term of [
      'details.trailId', 'contentHashBefore', 'contentHashAfter', 'canonical JSON (keys sorted, no whitespace)',
      'details.metadataSha256', 'details.changeReason', 'details.operationType', 'JSON.stringify(details)', 'payloadHash',
    ]) {
      expect(steps, `howToVerify no longer states "${term}"`).toContain(term);
    }
    // The server's own walk of the tenant chain, run BEFORE its export row was written.
    expect(pkg.tenantChain).toEqual({ ok: true, rowsChecked: chainRowsAtExport });

    // The two acts, whole: the comment's words and quoted passage, the
    // proposal's full text and the turn record it came from.
    expect(pkg.events.map((e) => e.operation_type)).toEqual(['comment_added', 'tracked_change_decision']);
    const [comment, decision] = pkg.events;
    expect(comment.after_content).toBe('Cite the SAP section that pre-specifies this endpoint.');
    expect(comment.metadata).toMatchObject({
      comment_id: made.commentId,
      quote: 'met its primary endpoint',
      quoteSha256: sha256('met its primary endpoint'),
      sectionContentSha256: sha256(SEC_X_CONTENT),
    });
    expect(decision.change_reason).toBe('Matches CSR Table 14.2.1');
    expect(decision.metadata).toMatchObject({
      decision: 'accept',
      changeId: 'ana-ins-1',
      text: LONG_PROPOSAL,
      textSha256: sha256(LONG_PROPOSAL),
      proposedBy: 'AnA (AI draft)',
      proposedByVerified: true,
      source: { verified: true, turnRecordId: made.turnId, turnRecordSha256: made.turnSha },
    });

    // THE CHECK: every event has a chain entry, and every step holds.
    const results = verifyOffline(pkg);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.chained, `event ${r.id} has no chain entry`).toBe(true);
      expect(r.failures, `event ${r.id}`).toEqual([]);
    }
    // The server's verdicts and summary say the same.
    for (const e of pkg.events) {
      expect(pkg.verdicts[e.id]).toEqual({ chained: true, intact: true, mismatches: [], chainPayloadIntact: true });
      expect(pkg.chain[e.id].sha256Chain).toMatch(/^[0-9a-f]{64}$/);
      expect(pkg.chain[e.id].chainSeq).not.toBeNull();
    }
    expect(pkg.summary).toEqual({ events: 2, intact: 2, broken: 0, notChained: 0 });

    // The payload hash each entry carries is the one on the chain row itself.
    for (const e of pkg.events) {
      const [c] = await rows<{ payload_hash: string; sha256_chain: string }>(
        `SELECT payload_hash, sha256_chain FROM audit_logs WHERE new_values::jsonb->>'trailId' = $1`,
        [e.id],
      );
      expect(c).toEqual({ payload_hash: pkg.chain[e.id].payloadHash, sha256_chain: pkg.chain[e.id].sha256Chain });
    }
  }, T);
});

describe('(ii) the same steps catch a rewrite', () => {
  it('(ii) the same offline steps catch a quoted passage rewritten past the table’s guard', async () => {
    // Not vacuous: a verifier that has only ever passed has not been tested.
    const c = await author(request(app).post(`/api/authoring/sections/${SEC_T}/comment`)).send({
      body: 'Name the analysis population.',
      anchor: { quote: 'Summary' },
    });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const [t] = await rows<{ id: string }>(
      `SELECT id FROM authoring_audit_trail WHERE metadata->>'comment_id' = $1`,
      [c.body.comment.id],
    );
    await jdb.pglite.exec('ALTER TABLE authoring_audit_trail DISABLE TRIGGER trg_authoring_audit_trail_append_only');
    try {
      await jdb.pglite.query(
        `UPDATE authoring_audit_trail SET metadata = jsonb_set(metadata, '{quote}', '"Summary of a different study"') WHERE id = $1`,
        [t.id],
      );
    } finally {
      await jdb.pglite.exec('ALTER TABLE authoring_audit_trail ENABLE TRIGGER trg_authoring_audit_trail_append_only');
    }

    const res = await exportOf(author, DOC_T);
    expect(res.status, res.text).toBe(200);
    const pkg = JSON.parse(res.text) as Pkg;
    expect(pkg.events).toHaveLength(1);
    expect((pkg.events[0].metadata as { quote: string }).quote).toBe('Summary of a different study');
    expect(verifyOffline(pkg)).toEqual([{ id: t.id, chained: true, failures: ['metadata'] }]);
    expect(pkg.verdicts[t.id]).toEqual({ chained: true, intact: false, mismatches: ['metadata'], chainPayloadIntact: true });
    expect(pkg.summary).toEqual({ events: 1, intact: 0, broken: 1, notChained: 0 });
  }, T);
});

describe('(iii) no record, no export', () => {
  it('(iii) when the export row cannot be written: 503 AUTHORING_RECORD_EXPORT_NOT_RECORDED, and no package leaves', async () => {
    const before = await exportRowCount(DOC_X);
    const mark = trace.stmts.length;

    trace.failOn = /^\s*INSERT INTO audit_logs\b/i;
    const res = await exportOf(author, DOC_X);
    trace.failOn = null;

    // The fault was reached — not an earlier failure passing for it.
    expect(trace.faultHits).toBe(1);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'AUTHORING_RECORD_EXPORT_NOT_RECORDED',
        message: 'The export was refused because it could not be recorded in the audit trail. Nothing was exported.',
      },
    });
    // Nothing of the record is in what was sent.
    expect(res.headers['content-disposition']).toBeUndefined();
    for (const leaked of ['format', 'events', 'chain', 'document', 'verdicts', 'summary', 'tenantChain']) {
      expect(res.body).not.toHaveProperty(leaked);
    }
    expect(res.text).not.toContain('Cite the SAP section');
    expect(res.text).not.toContain('[END-OF-PROPOSAL]');

    // The attempt was rolled back and nothing was recorded as exported.
    expect(since(mark).some((x) => x.via === 'client' && head(x.sql) === 'ROLLBACK')).toBe(true);
    expect(trace.txOpen).toBe(false);
    expect(await exportRowCount(DOC_X)).toBe(before);

    // And the next export, with the store back, is recorded and sent.
    const again = await exportOf(author, DOC_X);
    expect(again.status).toBe(200);
    expect(await exportRowCount(DOC_X)).toBe(before + 1);
  }, T);
});

describe('(iv) tenancy', () => {
  it('(iv) another tenant’s document is 404 in both directions — nothing written, nothing sent', async () => {
    const mark = trace.stmts.length;
    const beforeX = await exportRowCount(DOC_X);
    const beforeF = await exportRowCount(DOC_F);

    const intoOther = await exportOf(author, DOC_F);
    expect(intoOther.status).toBe(404);
    expect(intoOther.body).toEqual({ success: false, error: 'Document not found' });
    expect(intoOther.text).not.toContain('Another organization');

    const fromOther = await exportOf(outsider, DOC_X);
    expect(fromOther.status).toBe(404);
    expect(fromOther.body).toEqual({ success: false, error: 'Document not found' });
    expect(fromOther.text).not.toContain('Cite the SAP section');

    expect(await exportRowCount(DOC_F)).toBe(beforeF);
    expect(await exportRowCount(DOC_X)).toBe(beforeX);
    expect(writesSince(mark)).toEqual([]);
  }, T);
});

describe('(iv) an id that is not a document id', () => {
  it('is 404 on the read and the export — not the uuid cast\'s 500 — and nothing is written', async () => {
    const mark = trace.stmts.length;
    for (const path of ['audit', 'audit/export']) {
      const res = await author(request(app).get(`/api/authoring/docs/not-a-document/${path}`));
      expect(res.status, `${path}: ${res.text}`).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Document not found' });
    }
    expect(writesSince(mark)).toEqual([]);
  }, T);
});

describe('(v) a chain walk that could not run', () => {
  it('(v) when the tenant chain walk throws, tenantChain.ok is null in the package and in the recorded row — never true', async () => {
    const calls = h.chainWalkCalls;
    h.chainWalkThrows = true;
    const res = await exportOf(author, DOC_X);
    h.chainWalkThrows = false;

    expect(h.chainWalkCalls).toBe(calls + 1);
    expect(res.status, res.text).toBe(200);
    const pkg = JSON.parse(res.text) as Pkg;
    expect(pkg.tenantChain).toEqual({ ok: null, reason: 'The audit chain could not be walked at export time.' });
    // The per-event checks do not depend on the walk, and still hold.
    for (const r of verifyOffline(pkg)) expect(r.failures).toEqual([]);

    const [row] = await rows<{ new_values: unknown }>(
      `SELECT new_values FROM audit_logs WHERE action = 'authoring.record.exported' AND record_id = $1
        ORDER BY chain_seq DESC LIMIT 1`,
      [DOC_X],
    );
    const details = (typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values) as Record<string, unknown>;
    expect(details).toHaveProperty('tenantChainOk', null);
  }, T);
});

describe('the database this ran on', () => {
  it('had every table and column the routes under test asked for', () => {
    assertNoSchemaGaps(jdb);
  });
});
