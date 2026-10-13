/**
 * POST /api/authoring/docs/from-draft tells the truth about which model wrote
 * the draft (AnA reasoning round 15, SEC-A-7 door 2).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * `provenance.model` was CALLER INPUT, validated only as a string of at most
 * 2000 characters (authoring-from-draft.ts parseProvenance). Any authenticated
 * member of the organisation could name any model, and that string was written
 * — in ONE transaction, by insertDocumentTx — into three records an inspector
 * is shown and none of which can be amended afterwards:
 *
 *   • a doc_revisions genesis row carrying the full prose, append-only by
 *     trigger (db/migrations/20260817_doc_revisions_immutable_ledger.sql);
 *   • an authoring_audit_trail row whose after_content IS the prose and whose
 *     metadata carries the provenance verbatim, append-only by trigger
 *     (db/migrations/20260725_authoring_audit_trail.sql);
 *   • document_span_lineage spans saying a machine drafted it.
 *
 * `provenance.turnId` was never looked up at all, so nothing connected the
 * document to the turn that produced it, and RULE 2 — only an approved,
 * performance-qualified model may write regulatory text — was never applied.
 *
 * ── What this round does, and does NOT do ───────────────────────────────────
 * It makes the record TRUE: the model is read from the named turn record, every
 * model that served that turn is recorded with RULE 2's verdict, and a turn
 * that cannot be resolved is recorded as unverified rather than guessed at.
 *
 * It does NOT refuse the create. That is this lane's decision and its reasoning
 * is in r14/README.md: refusing pushes the person to paste the same prose by
 * hand, which carries no mark, so lineage-gate records it as the PERSON's own
 * work — the same words in the same immutable tables, relabelled from "a
 * machine drafted this" to "a person authored this". `governedWrite: 'refused'`
 * therefore means "RULE 2 does not admit this prose as governed content", not
 * "the document was not created". The document exists and is marked; the
 * governed boundaries are where it is stopped.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, PROGRAM, ORG, mint, makeApp, asToken, M25_SECTIONS } from './_authoring-canvas-fixture';
import { openTurnRecorder, writeTurnRecordSafely } from '../../services/ana/turn-record';
import { createDocumentFromDraft } from '../../services/authoring/authoring-from-draft';

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

const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20260814d_document_alias_map.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260921_authoring_document_provenance.sql',
      // The turn record the provenance is now read FROM.
      'migrations/20260926_ana_turn_records.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => { await jdb?.close(); });

/** A filed turn served by these models, and the record id it was filed under. */
async function filedTurn(served: Array<{ provider: string; model: string }>, runId?: string): Promise<string> {
  const r = openTurnRecorder({ orgId: ORG, userId: Number(AUTHOR.id), typed: 'Draft 2.5 for the IND', runId })!;
  r.setAnswer({ streamed: 'The primary endpoint was met.', stored: 'The primary endpoint was met.' });
  if (served[0]) r.setModel(served[0]);
  served.forEach((s, i) => r.addServed(i + 1, s));
  const status = await writeTurnRecordSafely(jdb.pool as never, r, 'answered');
  if (status.status !== 'recorded') throw new Error('fixture turn not filed: ' + status.status);
  return status.id;
}

const draftBody = (provenance: Record<string, unknown>) => ({
  programId: PROGRAM,
  title: 'Module 2.5 Clinical Overview — round 15',
  module: 'M2',
  documentType: 'clinical_overview',
  sections: M25_SECTIONS,
  provenance,
});

/** Create, and return the provenance the server STORED (not the one sent). */
async function created(provenance: Record<string, unknown>) {
  const res = await author(request(app).post('/api/authoring/docs/from-draft')).send(draftBody(provenance));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const docId = res.body.data.doc.id;
  const row = await (jdb.pool as { query: (t: string, p: unknown[]) => Promise<{ rows: any[] }> })
    .query(`SELECT provenance FROM authoring_documents WHERE id = $1`, [docId]);
  return { docId, provenance: row.rows[0].provenance as Record<string, unknown> };
}

describe('from-draft records the model from the turn, never from the caller', () => {
  it('a caller cannot name the model: the stored model is the turn record’s', async () => {
    const turnId = await filedTurn([SONNET]);
    const { provenance } = await created({
      source: 'ana', conversationId: 'thread_abc', turnId,
      // The forgery: a caller asserting an approved model for prose Sonnet wrote.
      model: 'claude-opus-5-5',
    });
    expect(provenance.model).toBe('claude-sonnet-5');
    expect(provenance.turnId).toBe(turnId);
  });

  it('records every model that served the turn, with RULE 2’s verdict', async () => {
    const turnId = await filedTurn([OPUS, SONNET]);
    const { provenance } = await created({ source: 'ana', turnId });
    expect(provenance.servedBy).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' },
      { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' },
    ]);
    /* One model the rule does not admit is enough: the prose is not governed
       content, and the document says so instead of looking clean. */
    expect(provenance.governedWrite).toBe('refused');
  });

  it('says the rule admits a turn every model of which it admits', async () => {
    const turnId = await filedTurn([OPUS]);
    const { provenance } = await created({ source: 'ana', turnId });
    expect(provenance.governedWrite).toBe('allowed');
  });

  it('a turn whose record names NO model is not admitted', async () => {
    /* The trap servedModelsForTurn's own tests pin: an empty list is not a
       list of approved models, and `.some(unqualified)` is false for it. */
    const turnId = await filedTurn([]);
    const { provenance } = await created({ source: 'ana', turnId });
    expect(provenance.servedBy).toEqual([]);
    expect(provenance.governedWrite).toBe('refused');
  });

  it('a turn that cannot be resolved is unverified, with the reason, and no model', async () => {
    for (const [turnId, why] of [
      ['turn_7', 'not a record id'],
      ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'no such turn record in this organization'],
    ] as const) {
      const { provenance } = await created({ source: 'ana', turnId, model: 'claude-opus-5-5' });
      expect(provenance.governedWrite).toBe('unverified');
      expect(provenance.governedWriteWhy).toBe(why);
      /* The caller's model string is gone either way: unverified is honest,
         a model nobody checked is not. */
      expect(provenance.model).toBeUndefined();
      expect(provenance.servedBy).toBeUndefined();
    }
  });

  it('resolves the AnA tool’s turnId, which is a RUN id, not a record id', async () => {
    /* stream.ts passes `turnId: runId` into the tool context (:2385, :2503,
       :2619), so the in-process tool caller names a run. Without this the
       tool's own documents would all read 'unverified'. */
    const runId = 'run_2f7c1b90';
    const recordId = await filedTurn([SONNET], runId);
    const { provenance } = await created({ source: 'ana', turnId: runId });
    expect(provenance.governedWrite).toBe('refused');
    expect(provenance.model).toBe('claude-sonnet-5');
    /* And the stored reference is rewritten to the RECORD it resolved to, not
       left as the run: the canonical verifiers (verifyMachineText,
       resolveTurnRecordSources) take record ids, so a document whose
       provenance named only a run could not be re-checked by them later. */
    expect(provenance.turnId).toBe(recordId);
    expect(provenance.turnId).not.toBe(runId);
  });

});

describe('from-draft: what carries a verdict, and what a caller may still not name', () => {
  it('a seed or an import is not a machine draft and carries no verdict', async () => {
    for (const source of ['seed', 'import'] as const) {
      const { provenance } = await created({ source, note: 'a person placed this' });
      expect(provenance.source).toBe(source);
      expect(provenance.governedWrite).toBeUndefined();
      expect(provenance.servedBy).toBeUndefined();
    }
  });

  it('a seed or an import cannot name a model either', async () => {
    /* Neither is a machine draft, so no turn is resolved and nothing overrides
       what the caller sent — which is exactly why the PARSER has to drop it.
       Without that, an unchecked model string would sit in the append-only
       audit row of a document a person placed. */
    for (const source of ['seed', 'import'] as const) {
      const { provenance } = await created({ source, model: 'claude-opus-5-5', note: 'a person placed this' });
      expect(provenance.model).toBeUndefined();
    }
  });

  it('a run named by more than one record is refused, not guessed at', async () => {
    /* Attributing a document's prose to the models of whichever record sorted
       first would be a fact nobody checked. */
    const runId = 'run_two_turns_7a1';
    await filedTurn([OPUS], runId);
    await filedTurn([SONNET], runId);
    const { provenance } = await created({ source: 'ana', turnId: runId });
    expect(provenance.governedWrite).toBe('unverified');
    expect(provenance.governedWriteWhy).toBe('more than one turn record names this run');
    expect(provenance.model).toBeUndefined();
  });

  it('the in-process caller’s model is dropped too when the turn does not resolve', async () => {
    /* The AnA drafting tool is in-process and sets provenance.model itself,
       from ctx.model — so it never passes through parseProvenance and the
       parser's drop cannot reach it. When its turn reference resolves, the
       record overrides it; when it does not, the model has to go, or a
       permanent record would name a model nothing checked beside the word
       'unverified'. */
    const outcome = await createDocumentFromDraft(
      {
        pool: jdb.pool as never,
        tenantId: ORG,
        actor: { id: AUTHOR.id, email: AUTHOR.email },
        audit: {
          tenantId: ORG, actorId: AUTHOR.id, actorEmail: AUTHOR.email, actorRole: 'author',
          ipAddress: 'ana-tool', userAgent: 'ana-tool', pool: jdb.pool as never,
        },
      } as never,
      {
        programId: PROGRAM,
        title: 'A tool draft whose run was never filed',
        module: 'M2',
        documentType: 'clinical_overview',
        sections: M25_SECTIONS,
        provenance: { source: 'ana', turnId: 'run_never_filed_0001', model: 'claude-opus-5-5' },
      } as never,
    );
    expect(outcome.kind).toBe('created');
    const p = outcome.kind === 'created' ? outcome.provenance : null;
    expect(p?.governedWrite).toBe('unverified');
    expect(p?.model).toBeUndefined();
  });

  it('the immutable audit row carries the same verdict as the document', async () => {
    /* metadata.provenance is written into authoring_audit_trail inside the
       create's transaction and can never be amended, so the verdict has to be
       right at write time — there is no later pass that could fix it. */
    const turnId = await filedTurn([SONNET]);
    const { docId } = await created({ source: 'ana', turnId });
    const rows = await (jdb.pool as { query: (t: string, p: unknown[]) => Promise<{ rows: any[] }> })
      .query(`SELECT metadata FROM authoring_audit_trail WHERE doc_id = $1 LIMIT 1`, [docId]);
    const meta = rows.rows[0]?.metadata;
    expect(JSON.stringify(meta)).toContain('claude-sonnet-5');
    expect(JSON.stringify(meta)).toContain('"governedWrite":"refused"');
  });
});
