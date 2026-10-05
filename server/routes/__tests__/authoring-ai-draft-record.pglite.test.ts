/**
 * The "Draft from sources" door files a turn record and checks the draft
 * against what the model was shown (AnA reasoning round 12, RT-6, 2026-10-05).
 * The REAL authoring router over HTTP, on PGlite with the authoring unit, the
 * audit chain, the AnA turn-record store and the draft-candidate store; only
 * the model and the Data Room search are stand-ins.
 *
 * POST /api/authoring/sections/:sectionId/ai/draft made one model call and
 * returned a section draft with no turn record and no check. Its accept filed
 * the text as AnA's (draftSource 'ana'), and the Part 11 row named the model
 * and a SHA-256 of a prompt the system never kept. A draft that said 45% where
 * the source says 31%, cited a regulation no source held and called the
 * section "fully compliant" reached the accept with nothing flagged, though
 * the same engine flags all of it under every AnA answer.
 *
 * The door now files one ana-turn-record with the prompt it sent, the model
 * that served it and the gateway request, and the engine's check of the draft
 * against the evidence the model was shown (after the 600-character cut). The
 * person's own words are never a source. Refusals and failures are filed as
 * failed turns. The draft carries the check and the record status to the
 * panel, and the parked candidate carries the record id and the request id to
 * the accept's trail row.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { loadTurnRecord, verifyStoredTurnRecord } from '../../services/ana/turn-record-verify';
import { RETRIEVAL_STATUS_MESSAGE } from '../../services/data-room-retrieval';
import { evidenceShown } from '../../services/ana/turn-record-draft';

type Hit = { id: string; content: string; title: string; sourceId: string | null; score: number };
const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  /** The model: what it returns, or throws, and when it was asked. */
  reply: null as null | (() => Promise<unknown>),
  calledAt: [] as number[],
  sent: [] as Array<{ messages: Array<{ content: string }> }>,
  /** The Data Room search. */
  hits: [] as Hit[],
  searchThrows: null as null | Error,
}));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../services/ai-gateway/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/gateway.js')>()),
  getGateway: () => ({
    getEnabledProviders: () => ['anthropic'],
    route: async (req: { messages: Array<{ content: string }> }) => {
      h.calledAt.push(Date.now());
      h.sent.push(req);
      return h.reply!();
    },
  }),
}));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({
    searchHybrid: async () => {
      if (h.searchThrows) throw h.searchThrows;
      return h.hits;
    },
  }),
}));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: async () => new Map(),
}));

const T = 180_000;
const DOC = 'e0c000ad-0000-4000-8000-0000000000ad';
/** What the Data Room holds: 31% and 24 months; a figure past the 600-character cut. */
const CHUNK =
  'In study ABC-301 the objective response rate was 31% (95% CI 22–41) in the 10 mg arm. ' +
  'The drug substance is stable for 24 months at 25 °C/60% RH. ' +
  'x'.repeat(520) +
  ' A late observation: the median duration of response was 14.2 months.';
const SOURCE: Hit = { id: 'a1', content: CHUNK, title: 'CSR ABC-301 Section 11', sourceId: null, score: 1 };
/** The draft: one claim found, one beyond what the model was shown, one only the person's, two unsupported, one verdict. */
const DRAFT =
  'In study ABC-301 the objective response rate was 31% in the 10 mg arm, and the median duration of response was 14.2 months. ' +
  'The target response rate was 45%. The drug substance is stable for 36 months, as 21 CFR 312.21 requires. ' +
  'This section is fully compliant.';
const envelope = (content: string) => ({
  content: JSON.stringify({ content, attributions: [] }),
  model: 'claude-opus-5-5',
  provider: 'anthropic',
  requestId: 'req-rt6-1',
});

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let seq = 0;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
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
      'migrations/20260926_ana_turn_records.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
      'db/migrations/20260809_source_attribution_draft_candidates.sql',
      'migrations/20260814i_draft_candidate_generator.sql',
      'migrations/20260906c_draft_candidate_assertions.sql',
    ],
    testOnlySql: `
      INSERT INTO authoring_documents (id, title, module, product_code, status, created_by, tenant_id) VALUES
        ('${DOC}', 'Module 2.5 — drafted from sources', 'M2', 'ABC', 'draft', '${AUTHOR.id}', ${ORG});
    `,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

beforeEach(() => {
  h.reply = async () => envelope(DRAFT);
  h.calledAt = [];
  h.sent = [];
  h.hits = [SOURCE];
  h.searchThrows = null;
});

async function seedSection(title = 'Overview of Efficacy'): Promise<string> {
  const id = randomUUID();
  seq += 1;
  await jdb.pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
     VALUES ($1, $2, $3, $4, '', $5, $6)`,
    [id, DOC, `2.5.4.${seq}`, title, seq, ORG],
  );
  return id;
}

const draft = async (body: Record<string, unknown> = {}, title?: string) => {
  const sectionId = await seedSection(title);
  const res = await author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft`)).send({ region: 'FDA', ...body });
  return { sectionId, res };
};

/** The tenant's turn records, newest last. */
const records = async () =>
  (await jdb.pglite.query<{ id: string; outcome: string; started_at: string }>(
    'SELECT id, outcome, started_at FROM ana_turn_records WHERE organization_id = $1 ORDER BY created_at',
    [ORG],
  )).rows;

const bodyOf = async (id: string) => {
  const stored = await loadTurnRecord(jdb.pool as never, ORG, id);
  expect(stored, 'the record is in this tenant').toBeTruthy();
  expect(verifyStoredTurnRecord(stored!).ok, 'the record verifies whole').toBe(true);
  return { stored: stored!, body: JSON.parse(stored!.recordText) };
};

describe('a draft from sources is a recorded turn', () => {
  it('files one record holding the prompt sent, the draft returned, the model and the gateway request', async () => {
    const before = (await records()).length;
    const { res } = await draft({ context: 'Target response rate 45%.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = await records();
    expect(after).toHaveLength(before + 1);
    const turnRecord = res.body.draft.turnRecord;
    expect(turnRecord).toMatchObject({ status: 'recorded', id: after.at(-1)!.id });
    const { stored, body } = await bodyOf(turnRecord.id);
    expect(stored.outcome).toBe('answered');
    expect(stored.texts.get(body.modelInput[0].text.sha256)).toBe(h.sent[0].messages[0].content);
    expect(body.model.calls).toEqual([
      expect.objectContaining({ provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-rt6-1' }),
    ]);
    expect(stored.texts.get(body.outputs.drafts[0].content.sha256)).toBe(DRAFT);
    // The answer exactly as the model returned it, envelope and all.
    expect(stored.texts.get(body.answer.streamed.sha256)).toBe(JSON.stringify({ content: DRAFT, attributions: [] }));
    // The labels reading it seals is void here, and the record says so.
    expect(body.warnings.join('\n')).toMatch(/evidence-label reading is void/);
  }, T);

  it('opens the record before the model is asked, so the turn starts when it did', async () => {
    const { res } = await draft();
    expect(res.status).toBe(200);
    const startedAt = Date.parse((await records()).at(-1)!.started_at);
    expect(startedAt).toBeLessThanOrEqual(h.calledAt[0]);
  }, T);

  it('a gateway refusal is filed as a failed turn', async () => {
    const { GatewayPolicyError } = await import('../../services/ai-gateway/gateway.js');
    h.reply = async () => { throw new GatewayPolicyError('refused for the test'); };
    const before = (await records()).length;
    const { res } = await draft();
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await records();
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)!.outcome).toBe('failed');
  }, T);

  it('a provider that answers with no draft is filed as a failed turn holding the prompt it was sent', async () => {
    // Nothing at all: an empty envelope would be read as prose (parseDraftEnvelope's fallback).
    h.reply = async () => ({ content: '', model: 'claude-opus-5-5', provider: 'anthropic', requestId: 'req-rt6-empty' });
    const { res } = await draft();
    expect(res.body.error?.code).toBe('INVALID_AI_RESPONSE');
    const last = (await records()).at(-1)!;
    expect(last.outcome).toBe('failed');
    const { stored, body } = await bodyOf(last.id);
    expect(stored.texts.get(body.modelInput[0].text.sha256)).toBe(h.sent[0].messages[0].content);
  }, T);

  it('a fault of ours, in the model call or after it, is filed as a failed turn in a fixed sentence', async () => {
    const faults: Array<[() => Promise<unknown>, string]> = [
      [async () => { throw new Error('socket hang up at 10.0.0.9'); }, 'The model call failed on the server.'],
      [async () => null, 'Drafting failed on the server.'],
    ];
    for (const [reply, said] of faults) {
      h.reply = reply;
      const { res } = await draft();
      expect(res.status).toBe(500);
      const last = (await records()).at(-1)!;
      expect(last.outcome).toBe('failed');
      const { body } = await bodyOf(last.id);
      expect(body.warnings).toContain(said);
      expect(JSON.stringify(body)).not.toContain('10.0.0.9');
    }
  }, T);
});

describe('the draft is checked against what the model was shown', () => {
  it('names the claims no source holds and the verdict it states; the person’s words are theirs, not a source', async () => {
    const { res } = await draft({ context: 'Target response rate 45%.' });
    const check = res.body.draft.check;
    expect(check.engine).toMatch(/^answer-check\//);
    expect(check.basis).toBe('sources');
    const texts = (list: Array<{ text: string }>) => list.map((c) => c.text).join(' | ');
    expect(texts(check.notFound)).toMatch(/36 months/);
    expect(texts(check.notFound)).toMatch(/21 CFR 312\.21/);
    expect(texts(check.fromPerson)).toMatch(/45%/);
    expect(check.verdicts.length).toBeGreaterThan(0);
    // The record keeps the same check the panel is shown.
    const { body } = await bodyOf(res.body.draft.turnRecord.id);
    expect(body.verification.check).toEqual(check);
  }, T);

  it('the evidence the model was shown is the block without its instructions to the model', () => {
    const block =
      '\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n[SRC-1] "CSR"\nORR 31%.\n--- END EVIDENCE ---\n\n' +
      'Record which sources you used ONLY through the structured "attributions" field, e.g. 21 CFR 314.126.';
    expect(evidenceShown(block)).toContain('ORR 31%.');
    expect(evidenceShown(block)).not.toMatch(/Record which sources|314\.126/);
  });

  it('a citation the section’s own heading gave the model is found there, never “not found”', async () => {
    h.reply = async () => envelope('The analysis follows ICH E9; the objective response rate was 31% in the 10 mg arm.');
    const { res } = await draft({}, 'Overview of Efficacy (ICH E9)');
    const check = res.body.draft.check;
    expect(check.notFound.map((c: { text: string }) => c.text).join(' | ')).not.toMatch(/ICH E9/);
    expect(check.sources).toEqual(['Data Room', 'context']);
  }, T);

  it('a figure past the 600-character cut is not found: the model was never shown it', async () => {
    const { res } = await draft();
    const texts = res.body.draft.check.notFound.map((c: { text: string }) => c.text).join(' | ');
    expect(texts).toMatch(/14\.2 months/);
  }, T);

  it('a failed retrieval consulted nothing: every claim unchecked, none not found, and the record says why in the fixed sentence', async () => {
    h.searchThrows = new Error('connect ECONNREFUSED 10.0.0.1:5432');
    const { res } = await draft();
    const check = res.body.draft.check;
    expect(check.basis).toBe('no_sources');
    expect(check.notFound).toEqual([]);
    expect(check.unchecked.length).toBeGreaterThan(0);
    const { body } = await bodyOf(res.body.draft.turnRecord.id);
    expect(body.warnings.join('\n')).toContain(RETRIEVAL_STATUS_MESSAGE.failed);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  }, T);
});

describe('the record follows the draft to its accept', () => {
  it('the accept’s trail row names the turn record and the gateway request the draft came from', async () => {
    const { sectionId, res } = await draft();
    const draftId = res.body.draft.draftId;
    expect(draftId).toBeTruthy();
    const accepted = await author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({
      draftId,
      content: DRAFT,
      reason: 'Reviewed against the CSR.',
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const trail = (await jdb.pglite.query<{ metadata: Record<string, any> }>(
      `SELECT metadata FROM authoring_audit_trail WHERE section_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [sectionId, ORG],
    )).rows[0];
    expect(trail.metadata.generator).toMatchObject({ requestId: 'req-rt6-1', turnRecordId: res.body.draft.turnRecord.id });
  }, T);
});
