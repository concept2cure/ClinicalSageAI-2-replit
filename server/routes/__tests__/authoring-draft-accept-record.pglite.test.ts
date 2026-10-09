/**
 * An accepted AI draft lands with its revision and its record or not at all —
 * the REAL authoring router over HTTP (supertest, real signed JWTs) on
 * in-process Postgres (PGlite) built from the authoring subsystem unit, the
 * audit_logs chain, the span-lineage tables and the draft-candidate store's
 * own migrations (row D5, 2026-09-26).
 *
 * POST /api/authoring/sections/:sectionId/ai/draft/accept
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
 * the export this file also reads. The pool is wrapped to record which executor each statement went
 * through (see _authoring-record-fixture.ts for why).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import {
  T, sha256, newTrace, head, WRITE, tappedPool, responseMarker, rowsOf, countOf, verifyOffline,
  since as sinceIn, writesSince as writesSinceIn, type Pkg,
} from './_authoring-record-fixture';
import { stableStringify } from '../../../shared/canonical-json';
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

// One document; each case gets a fresh section.
const DOC_ACC = 'e0c000ac-0000-4000-8000-0000000000ac';
const PRIOR = 'The prior text of this section, written by hand.';
const GENERATED =
  'The pivotal study met its primary endpoint at week twelve. ' +
  'The hazard ratio for progression was 0.71 across every prespecified subgroup.';
const EDITED =
  'The pivotal study met its primary endpoint at week twelve. ' +
  'The hazard ratio for progression was 0.71, consistent across the prespecified subgroups in Table 14.2.1.';

const trace = newTrace();
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

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
      INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id) VALUES
        ('${DOC_ACC}', 'Module 2.5 — AI-drafted sections', 'M2', 'draft', '${AUTHOR.id}', ${ORG});
    `,
  });
  h.db = jdb.db;
  h.pglite = jdb.pglite;
  h.pool = tappedPool(jdb, trace);

  author = asToken(await mint(AUTHOR));
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

describe('the accept is one transaction', () => {
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
});

describe('what the record says about the draft', () => {
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
