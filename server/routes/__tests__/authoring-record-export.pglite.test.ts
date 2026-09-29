/**
 * A document's authoring record leaves the building only on the record, and
 * an accepted AI draft lands with its revision and its record or not at all —
 * the REAL authoring router over HTTP (supertest, real signed JWTs) on
 * in-process Postgres (PGlite) built from the authoring subsystem unit, the
 * audit_logs chain, the AnA turn-record store, the span-lineage tables and the
 * draft-candidate store's own migrations (row D5, 2026-09-26).
 *
 * Part A — GET /api/authoring/docs/:docId/audit/export
 *   (i)   exactly one chained audit_logs row 'authoring.record.exported' is
 *         written and COMMITTED before the response leaves (the statement
 *         trace below carries a marker for the moment the response is sent);
 *   (ii)  every chained event in the package verifies OFFLINE, by the
 *         package's own howToVerify steps, using only node:crypto and
 *         shared/canonical-json stableStringify — implemented in this file,
 *         not borrowed from the server — and the same steps catch a row
 *         rewritten past the table's guard;
 *   (iii) when that row cannot be written: 503
 *         AUTHORING_RECORD_EXPORT_NOT_RECORDED, and no package in the body;
 *   (iv)  another tenant's document: 404, nothing written, nothing sent;
 *   (v)   when the tenant chain walk throws, tenantChain.ok is null — in the
 *         package and in the recorded export row — never true.
 *
 * Part B — POST /api/authoring/sections/:sectionId/ai/draft/accept
 *   The draft candidate is parked with the REAL createDraftCandidate into the
 *   table its migrations create; consumeDraftCandidate,
 *   enforceSourceAndAuthorLineage and commitSectionToFiling all run for real
 *   (nothing in that path is mocked). The c2c filing store is not provisioned
 *   here, so commitSectionToFiling answers "not provisioned" (asserted) and
 *   the governed-filing write itself is NOT exercised by this file. Shown:
 *   - the content UPDATE, the doc_revisions row, the trail row and its chained
 *     row all go through the transaction's client, between BEGIN and COMMIT;
 *   - with the trail INSERT (or the revision INSERT) failing: 500, the
 *     section content unchanged, no revision/trail/chain/lineage row, and the
 *     candidate still claimable — a retry with the same draftId succeeds;
 *   - body.content differing from the candidate: metadata.generated_draft is
 *     the candidate text and generated_draft_sha256 its hash; equal (or
 *     omitted): generated_draft is absent and the hash is still recorded.
 *
 * ── What is replaced ──────────────────────────────────────────────────────────
 * Only two seams: the db module (pointed at PGlite, as every sibling harness
 * does) and services/audit/tenant-chain-verdict.js, whose production walk opens
 * a super-admin connection through db/runtime. It is replaced by the SAME
 * verifier (chain.ts verifyAuditChain) over the PGlite session, and by a throw
 * for (v).
 *
 * ── Why the pool is wrapped ──────────────────────────────────────────────────
 * PGlite is ONE session. A statement a handler sends on the pool while its
 * transaction client is open runs INSIDE that transaction here, whereas on a
 * real pg Pool it would run on another connection and commit on its own. So a
 * write that escaped the transaction would still roll back in this harness and
 * an atomicity claim would pass for the wrong reason. The wrapper records
 * which executor each statement went through and whether a transaction was
 * open, and injects the faults.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { stableStringify } from '../../../shared/canonical-json';
import { TurnRecorder, writeTurnRecord } from '../../services/ana/turn-record';
import { createDraftCandidate } from '../../services/clinical-regulatory-evidence/draft-candidate-store';

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

const T = 180_000;
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

/** A member of the OTHER organization. */
const OUTSIDER = { id: '9', organizationId: OTHER_ORG, email: 'outsider@other.example', name: 'Iris Outsider' };

// Part A documents: the one exported, one to tamper with, one in another org.
const DOC_X = 'e0c0000a-0000-4000-8000-00000000000a';
const SEC_X = 'e5ec000a-0000-4000-8000-0000000000a1';
const SEC_X_CONTENT = '<p>The pivotal study met its primary endpoint with a hazard ratio of 0.71.</p>';
const DOC_T = 'e0c0000c-0000-4000-8000-00000000000c';
const SEC_T = 'e5ec000c-0000-4000-8000-0000000000c1';
const DOC_F = 'e0c0000f-0000-4000-8000-00000000000f';
const SEC_F = 'e5ec000f-0000-4000-8000-0000000000f1';
// Part B: one document; each case gets a fresh section.
const DOC_ACC = 'e0c000ac-0000-4000-8000-0000000000ac';
const PRIOR = 'The prior text of this section, written by hand.';
const GENERATED =
  'The pivotal study met its primary endpoint at week twelve. ' +
  'The hazard ratio for progression was 0.71 across every prespecified subgroup.';
const EDITED =
  'The pivotal study met its primary endpoint at week twelve. ' +
  'The hazard ratio for progression was 0.71, consistent across the prespecified subgroups in Table 14.2.1.';

// ── The executor trace, the faults and the response marker (see header) ──────
type Via = 'pool' | 'client' | 'response';
interface Stmt { via: Via; sql: string; params: unknown[]; inTx: boolean }
const trace = { stmts: [] as Stmt[], txOpen: false, failOn: null as RegExp | null, faultHits: 0 };

const head = (sql: string) => sql.trim().toUpperCase();
const WRITE = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(authoring_sections|doc_revisions|authoring_audit_trail|audit_logs|authoring_ai_draft_candidates|authoring_comments|authoring_tracked_change_decisions|document_span_lineage)\b/i;
const since = (mark: number) => trace.stmts.slice(mark);
/** The governed writes since `mark`: table, executor, inside a transaction. */
const writesSince = (mark: number) =>
  since(mark)
    .filter((s) => s.via !== 'response' && WRITE.test(s.sql))
    .map((s) => [WRITE.exec(s.sql)![1].toLowerCase(), s.via, s.inTx] as const);

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
        ('${DOC_ACC}', 'Module 2.5 — AI-drafted sections', 'M2', 'draft', '${AUTHOR.id}', ${ORG}),
        ('${DOC_F}', 'Another organization''s overview', 'M2', 'draft', '${OUTSIDER.id}', ${OTHER_ORG});
      INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id) VALUES
        ('${SEC_X}', '${DOC_X}', '2.5.4', 'Overview of Efficacy', '${SEC_X_CONTENT}', 0, ${ORG}),
        ('${SEC_T}', '${DOC_T}', '2.7.3', 'Summary of Clinical Efficacy', '<p>Summary.</p>', 0, ${ORG}),
        ('${SEC_F}', '${DOC_F}', '2.5.1', 'Rationale', '<p>Another organization''s words.</p>', 0, ${OTHER_ORG});
    `,
  });

  const tap = (via: Exclude<Via, 'response'>) => async (textOrConfig: unknown, params?: unknown[]) => {
    const sql = typeof textOrConfig === 'string' ? textOrConfig : String((textOrConfig as { text?: unknown })?.text ?? '');
    trace.stmts.push({ via, sql, params: params ?? [], inTx: trace.txOpen });
    if (via === 'client') {
      if (head(sql) === 'BEGIN') trace.txOpen = true;
      if (head(sql) === 'COMMIT' || head(sql) === 'ROLLBACK') trace.txOpen = false;
    }
    if (trace.failOn && trace.failOn.test(sql)) {
      trace.faultHits += 1;
      throw new Error(`injected: ${sql.trim().split('\n')[0]} failed`);
    }
    return jdb.pool.query(textOrConfig as string, params);
  };
  h.db = jdb.db;
  h.pglite = jdb.pglite;
  h.pool = { query: tap('pool'), connect: async () => ({ query: tap('client'), release: () => {} }) };

  author = asToken(await mint(AUTHOR));
  outsider = asToken(await mint(OUTSIDER));
  const { default: router } = await import('../authoring.router');
  app = express();
  // The moment the response leaves, on the same trace as the statements.
  app.use((req, res, next) => {
    const end = res.end.bind(res) as (...a: unknown[]) => express.Response;
    (res as unknown as { end: (...a: unknown[]) => express.Response }).end = (...args: unknown[]) => {
      trace.stmts.push({ via: 'response', sql: `${req.method} ${req.originalUrl} -> ${res.statusCode}`, params: [], inTx: trace.txOpen });
      return end(...args);
    };
    next();
  });
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

// ── Reading back ─────────────────────────────────────────────────────────────
async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pglite.query<R>(sql, params)).rows;
}
async function n(sql: string, params: unknown[] = []): Promise<number> {
  const [r] = await rows<{ n: number }>(sql, params);
  return Number(r.n);
}
const exportRowCount = (docId: string) =>
  n(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'authoring.record.exported' AND record_id = $1`, [docId]);
const tenantChainRows = (tenantId: number) =>
  n('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND sha256_chain IS NOT NULL', [tenantId]);

const exportOf = (as: (r: request.Test) => request.Test, docId: string) =>
  as(request(app).get(`/api/authoring/docs/${docId}/audit/export`));

// ── The offline verifier (Part A (ii)) ───────────────────────────────────────
/* The package as an inspector holds it: the downloaded JSON, nothing else.
   Each check below is one of the package's howToVerify steps, implemented
   here with node:crypto and stableStringify only — no server module. */
interface PkgEvent {
  id: string; operation_type: string; before_content: string | null; after_content: string | null;
  change_reason: string | null; metadata: unknown;
}
interface PkgChainEntry { payloadHash: string | null; sha256Chain: string | null; chainSeq: string | null; details: Record<string, unknown> }
interface Pkg {
  format: string;
  document: Record<string, unknown>;
  events: PkgEvent[];
  chain: Record<string, PkgChainEntry>;
  verdicts: Record<string, { chained: boolean; intact: boolean | null; mismatches: string[]; chainPayloadIntact: boolean | null }>;
  summary: { events: number; intact: number; broken: number; notChained: number };
  tenantChain: { ok: boolean | null; rowsChecked?: number; reason?: string };
  howToVerify: string[];
  exportedBy: { userId: string | null };
}

function verifyOffline(pkg: Pkg): Array<{ id: string; chained: boolean; failures: string[] }> {
  const hashOrNull = (v: string | null) => (v ? sha256(v) : null);
  return pkg.events.map((e) => {
    // Step 1: chain[event.id], whose details.trailId is event.id.
    const entry = pkg.chain[e.id];
    if (!entry) return { id: e.id, chained: false, failures: [] };
    const d = entry.details;
    const failures: string[] = [];
    if (d.trailId !== e.id) failures.push('trailId');
    // Step 2: SHA-256 of before/after content (null when empty).
    if (hashOrNull(e.before_content) !== (d.contentHashBefore ?? null)) failures.push('before_content');
    if (hashOrNull(e.after_content) !== (d.contentHashAfter ?? null)) failures.push('after_content');
    // Step 3: SHA-256 of the canonical JSON of the metadata.
    if (sha256(stableStringify(e.metadata)) !== d.metadataSha256) failures.push('metadata');
    // Step 4: reason and operation.
    if ((e.change_reason ?? null) !== (d.changeReason ?? null)) failures.push('change_reason');
    if (e.operation_type !== d.operationType) failures.push('operation_type');
    // Step 5: SHA-256 of JSON.stringify(details) is the chain link's payload hash.
    if (sha256(JSON.stringify(d)) !== entry.payloadHash) failures.push('payload_hash');
    return { id: e.id, chained: true, failures };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A
// ─────────────────────────────────────────────────────────────────────────────

const LONG_PROPOSAL =
  'The primary endpoint, progression-free survival at 12 months, was met with a hazard ratio of 0.62. '.repeat(8) +
  '[END-OF-PROPOSAL]';
const made = { commentId: '', turnId: '', turnSha: '' };

describe('Part A — GET /docs/:docId/audit/export', () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// PART B
// ─────────────────────────────────────────────────────────────────────────────

const GENERATOR = {
  model: 'model-x',
  provider: 'anthropic',
  promptSha256: sha256('Draft 2.5.4 from the retrieved CSR tables.'),
  generatedAt: '2026-09-26T09:00:00.000Z',
};

/** A fresh section of DOC_ACC holding PRIOR (no revision yet). */
let sectionSeq = 0;
async function seedSection(): Promise<string> {
  const id = randomUUID();
  sectionSeq += 1;
  await jdb.pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
     VALUES ($1, $2, $3, 'Overview of Efficacy', $4, $5, $6)`,
    [id, DOC_ACC, `2.5.4.${sectionSeq}`, PRIOR, sectionSeq, ORG],
  );
  return id;
}

/** Park a candidate the way POST …/ai/draft does: the real store, its real table. */
async function parkCandidate(sectionId: string, content = GENERATED): Promise<string> {
  const { id } = await createDraftCandidate(
    ORG,
    sectionId,
    content,
    [],
    AUTHOR.id,
    jdb.pool as unknown as Parameters<typeof createDraftCandidate>[5],
    GENERATOR,
    [],
  );
  return id;
}

const accept = (sectionId: string, body: Record<string, unknown>) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send(body);

/** Everything an accept can have written for a section. */
async function stateOf(sectionId: string) {
  const [section] = await rows<{ content: string }>('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
  return {
    content: section.content,
    revisions: await rows<{ content: string; origin: string; created_by: string }>(
      'SELECT content, origin, created_by FROM doc_revisions WHERE section_id = $1 ORDER BY created_at',
      [sectionId],
    ),
    trail: await rows<{
      id: string; operation_type: string; before_content: string | null; after_content: string | null;
      change_reason: string | null; actor_id: string | null; metadata: Record<string, unknown>;
    }>(
      `SELECT id, operation_type, before_content, after_content, change_reason, actor_id, metadata
         FROM authoring_audit_trail WHERE section_id = $1 ORDER BY created_at`,
      [sectionId],
    ),
    chain: await n(`SELECT count(*)::int AS n FROM audit_logs WHERE record_id = $1`, [sectionId]),
    spans: await n(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = 'authoring_sections' AND document_id = $1 AND deleted_at IS NULL`,
      [sectionId],
    ),
  };
}
const candidateExists = async (draftId: string) =>
  (await n('SELECT count(*)::int AS n FROM authoring_ai_draft_candidates WHERE id = $1', [draftId])) === 1;

describe('Part B — POST /sections/:sectionId/ai/draft/accept', () => {
  it('the content, its revision, its trail row and the chained row are written on the transaction’s client, between BEGIN and COMMIT', async () => {
    const sectionId = await seedSection();
    const draftId = await parkCandidate(sectionId);
    const mark = trace.stmts.length;

    const res = await accept(sectionId, { draftId, content: EDITED });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // commitSectionToFiling ran for real and said, honestly, that this
    // database has no filing store — the governed-filing write is not
    // exercised here (see header).
    expect(res.body.filing).toEqual({
      committed: false,
      reason: 'The governed document store is not provisioned here, so there is no filing to update.',
    });

    const s = since(mark);
    const begin = s.findIndex((x) => x.via === 'client' && head(x.sql) === 'BEGIN');
    const commit = s.findIndex((x) => x.via === 'client' && head(x.sql) === 'COMMIT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    const inside = writesSince(mark);
    // Every governed write of the accept: on the client, inside the transaction.
    for (const table of ['authoring_ai_draft_candidates', 'authoring_sections', 'doc_revisions', 'authoring_audit_trail', 'audit_logs']) {
      expect(inside, `${table} was not written`).toContainEqual([table, 'client', true]);
    }
    expect(inside.filter(([, via, inTx]) => via !== 'client' || !inTx), 'a write escaped the transaction').toEqual([]);
    // And all of them before the COMMIT.
    const lastWrite = Math.max(...s.map((x, i) => (x.via !== 'response' && WRITE.test(x.sql) ? i : -1)));
    expect(lastWrite).toBeLessThan(commit);

    const st = await stateOf(sectionId);
    expect(st.content).toBe(EDITED);
    expect(st.revisions).toEqual([{ content: EDITED, origin: 'ai-draft-accept', created_by: AUTHOR.id }]);
    expect(st.trail).toHaveLength(1);
    expect(st.trail[0]).toMatchObject({ operation_type: 'UPDATE', before_content: PRIOR, after_content: EDITED, change_reason: null, actor_id: AUTHOR.id });
    expect(st.chain).toBe(1);
    expect(st.spans).toBeGreaterThan(0);
    expect(await candidateExists(draftId)).toBe(false);
  }, T);

  it.each(['authoring_audit_trail', 'doc_revisions'])(
    'with the %s INSERT failing: 500, the section content unchanged, nothing recorded — and the draft still claimable',
    async (table) => {
      const sectionId = await seedSection();
      const draftId = await parkCandidate(sectionId);
      const before = await stateOf(sectionId);
      const mark = trace.stmts.length;

      trace.failOn = new RegExp(`^\\s*INSERT INTO ${table}\\b`, 'i');
      const res = await accept(sectionId, { draftId, content: EDITED });
      trace.failOn = null;

      expect(trace.faultHits).toBe(1);
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('LINEAGE_REQUIRED');
      expect(res.body.section).toBeUndefined();

      // The content WAS updated, on the transaction's client, before the
      // failing write — and was rolled back with it.
      const w = writesSince(mark);
      expect(w).toContainEqual(['authoring_sections', 'client', true]);
      expect(w.findIndex(([t]) => t === 'authoring_sections')).toBeLessThan(w.findIndex(([t]) => t === table));
      expect(since(mark).some((x) => x.via === 'client' && head(x.sql) === 'ROLLBACK')).toBe(true);
      expect(trace.txOpen).toBe(false);

      const after = await stateOf(sectionId);
      expect(after.content).toBe(PRIOR);
      expect(after).toEqual(before);
      expect(await candidateExists(draftId)).toBe(true);

      // The claim rolled back with the rest, so the same draft is accepted on retry.
      const retry = await accept(sectionId, { draftId, content: EDITED });
      expect(retry.status, JSON.stringify(retry.body)).toBe(200);
      const done = await stateOf(sectionId);
      expect(done.content).toBe(EDITED);
      expect(done.revisions).toHaveLength(before.revisions.length + 1);
      expect(done.trail).toHaveLength(before.trail.length + 1);
      expect(await candidateExists(draftId)).toBe(false);
    },
    T,
  );

  it('an edited draft: generated_draft is the candidate text and generated_draft_sha256 its hash; the row verifies against its chain', async () => {
    const sectionId = await seedSection();
    const draftId = await parkCandidate(sectionId);

    const res = await accept(sectionId, { draftId, content: EDITED, changeReason: 'Subgroup wording aligned to the CSR.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { trail } = await stateOf(sectionId);
    expect(trail).toHaveLength(1);
    const t = trail[0];
    expect(t.after_content).toBe(EDITED);
    expect(t.change_reason).toBe('Subgroup wording aligned to the CSR.');
    expect(t.metadata).toMatchObject({
      source: 'ai-draft-accept',
      generator: { ...GENERATOR, promptVersion: null },
      draft_modified_on_accept: true,
      generated_draft: GENERATED,
      generated_draft_sha256: sha256(GENERATED),
    });
    expect(t.metadata.generated_draft).not.toBe(EDITED);

    // The chained row names the trail row and covers the draft text through
    // the metadata hash — the model's words are on the chain, not only in the row.
    const [c] = await rows<{ new_values: unknown; reason: string | null }>(
      `SELECT new_values, reason FROM audit_logs WHERE new_values::jsonb->>'trailId' = $1`,
      [t.id],
    );
    const d = (typeof c.new_values === 'string' ? JSON.parse(c.new_values) : c.new_values) as Record<string, unknown>;
    expect(d.metadataSha256).toBe(sha256(stableStringify(t.metadata)));
    expect(d.contentHashAfter).toBe(sha256(EDITED));
    expect(c.reason).toBe('Subgroup wording aligned to the CSR.');

    // And it reaches an inspector's package whole, verifying offline.
    const exp = await exportOf(author, DOC_ACC);
    expect(exp.status, exp.text).toBe(200);
    const pkg = JSON.parse(exp.text) as Pkg;
    const ev = pkg.events.find((e) => e.id === t.id)!;
    expect((ev.metadata as Record<string, unknown>).generated_draft).toBe(GENERATED);
    for (const r of verifyOffline(pkg)) {
      expect(r.chained).toBe(true);
      expect(r.failures, r.id).toEqual([]);
    }
  }, T);

  it.each([
    ['sent equal to the candidate', (draftId: string) => ({ draftId, content: GENERATED })],
    ['omitted', (draftId: string) => ({ draftId })],
  ])('an unedited draft (content %s): generated_draft is absent, its hash is recorded', async (_label, body) => {
    const sectionId = await seedSection();
    const draftId = await parkCandidate(sectionId);

    const res = await accept(sectionId, body(draftId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const { content, trail } = await stateOf(sectionId);
    expect(content).toBe(GENERATED);
    expect(trail).toHaveLength(1);
    expect(trail[0].after_content).toBe(GENERATED);
    expect(trail[0].metadata).toMatchObject({
      source: 'ai-draft-accept',
      draft_modified_on_accept: false,
      generated_draft_sha256: sha256(GENERATED),
    });
    // Absent — not null, not an empty string: the saved content IS the draft.
    expect(Object.keys(trail[0].metadata)).not.toContain('generated_draft');
    // The reason is not invented when none was stated.
    expect(trail[0].change_reason).toBeNull();
  }, T);
});

describe('the database this ran on', () => {
  it('had every table and column the routes under test asked for', () => {
    assertNoSchemaGaps(jdb);
  });
});
