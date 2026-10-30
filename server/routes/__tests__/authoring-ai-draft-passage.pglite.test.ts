/**
 * Alternatives for a selected passage (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4).
 * The REAL authoring router over HTTP, on PGlite with the authoring unit, the AnA turn-record
 * store and the draft-candidate store; only the model and the Data Room search are stand-ins.
 *
 * POST …/ai/draft with `passage: { quote, prefix, suffix }` drafts a replacement for that passage
 * of the SAVED section, with the saved section as context. Each answer has its own check and turn
 * record. It is never parked as a candidate: the only consumer of a parked candidate is the
 * whole-section accept, which must never take a passage. The passage lands in the editor as AnA's
 * tracked replacement through the proposal door, and its words verify on save against the turn
 * record. A passage the saved section does not hold, or holds more than once without context that
 * picks one, is refused before the model is asked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, AUTHOR, ORG, PROGRAM, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { loadTurnRecord, verifyStoredTurnRecord } from '../../services/ana/turn-record-verify';

type Hit = { id: string; content: string; title: string; sourceId: string | null; score: number };
const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  replies: [] as string[],
  sent: [] as Array<{ messages: Array<{ content: string }> }>,
  hits: [] as Hit[],
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
      h.sent.push(req);
      const content = h.replies.shift() ?? 'Unscripted reply.';
      return { content: JSON.stringify({ content, attributions: [] }), model: 'claude-opus-5-5', provider: 'anthropic',
        requestId: `req-passage-${h.sent.length}` };
    },
  }),
}));
vi.mock('../../services/vault/document-passage-search.js', () => ({
  searchDocumentPassages: async () => ({ hits: h.hits.map(hit => ({ documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    documentTitle: hit.title, text: hit.content, locator: null })), coverage: null, ranking: 'text' }),
}));
vi.mock('../../services/vault/document-catalog.service.js', () => ({ loadDocumentForOrg: async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: '11111111-1111-4111-8111-111111111111', contentHash: 'a'.repeat(64), version: '1', catalog: { contentHash: 'a'.repeat(64), status: 'extracted' } }) }));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: async () => new Map(),
  resolveEvidenceSourceIdsByVaultDocuments: async () => new Map(),
}));

const T = 180_000;
const DOC = 'e0c000ad-0000-4000-8000-0000000000bf';
const SOURCE: Hit = { id: 'a1', title: 'CSR ABC-301 Section 11', sourceId: null, score: 1,
  content: 'In study ABC-301 the objective response rate was 31% (95% CI 22–41) in the 10 mg arm.' };
/** The saved section: one sentence twice, in different places. */
const SAVED = '<p>The objective response rate was 31% in the 10 mg arm.</p>'
  + '<p>The objective response rate was 31% in the 10 mg arm, as the protocol required.</p>';
const QUOTE = 'The objective response rate was 31%';
/** The second occurrence, named by its context. */
const PASSAGE = { quote: QUOTE, prefix: 'in the 10 mg arm. ', suffix: ' in the 10 mg arm, as the protocol' };
/** A replacement that adds a figure no source holds. */
const REPLACEMENT = 'Objective response was 31% (95% CI 22–41), with a median duration of 9.2 months';

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let seq = 0;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260905_document_catalog.sql',
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
      INSERT INTO authoring_documents (id, title, module, product_code, status, created_by, tenant_id, client_program_id) VALUES
        ('${DOC}', 'Clinical study report — alternatives for a passage', 'M5', 'ABC', 'draft', '${AUTHOR.id}', ${ORG}, '${PROGRAM}');
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
  h.replies = [];
  h.sent = [];
  h.hits = [SOURCE];
});

async function seedSection(content = SAVED): Promise<string> {
  const id = randomUUID();
  seq += 1;
  await jdb.pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
     VALUES ($1, $2, $3, 'Efficacy Results', $4, $5, $6)`,
    [id, DOC, `11.4.${seq}`, content, seq, ORG],
  );
  return id;
}

const post = (sectionId: string, body: Record<string, unknown>) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft`)).send({ region: 'FDA', ...body });
const candidates = async () => (await jdb.pglite.query<{ id: string }>(
  'SELECT id FROM authoring_ai_draft_candidates WHERE organization_id=$1', [ORG])).rows.length;
const turns = async () => (await jdb.pglite.query<{ id: string }>(
  'SELECT id FROM ana_turn_records WHERE organization_id=$1', [ORG])).rows.length;

describe('a passage is drafted from the saved section, as a replacement of the passage only', () => {
  it('shows the model the saved section and the passage, and answers with the passage it drafted for', async () => {
    const sectionId = await seedSection();
    h.replies.push(REPLACEMENT);
    const res = await post(sectionId, { tone: 'concise', passage: PASSAGE });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const prompt = h.sent[0].messages[0].content;
    expect(prompt).toContain(`BEGIN_PASSAGE\n${QUOTE}\nEND_PASSAGE`);
    expect(prompt).toMatch(/BEGIN_SAVED_SECTION\nThe objective response rate was 31% in the 10 mg arm\.\n\nThe objective response rate was 31% in the 10 mg arm, as the protocol required\.\nEND_SAVED_SECTION/);
    expect(prompt).toMatch(/"content" holds only the text that replaces the passage/);
    expect(res.body.draft.content).toBe(REPLACEMENT);
    expect(res.body.draft.passage).toEqual(PASSAGE);
  }, T);

  it('parks no candidate, so the whole-section accept can never take a passage', async () => {
    const sectionId = await seedSection();
    const before = await candidates();
    h.replies.push(REPLACEMENT);
    const res = await post(sectionId, { passage: PASSAGE });
    expect(res.status).toBe(200);
    expect(res.body.draft).not.toHaveProperty('draftId');
    expect(await candidates()).toBe(before);
    // An ordinary draft of the same section is still parked: the passage path alone skips it.
    h.replies.push('A whole section.');
    const whole = await post(sectionId, {});
    expect(whole.body.draft.draftId).toEqual(expect.any(String));
    expect(await candidates()).toBe(before + 1);
  }, T);

  it('records the passage as asked, and re-runs the check on the replacement', async () => {
    const sectionId = await seedSection();
    h.replies.push(REPLACEMENT);
    const res = await post(sectionId, { passage: PASSAGE });
    const stored = await loadTurnRecord(jdb.pool as never, ORG, res.body.draft.turnRecord.id);
    expect(verifyStoredTurnRecord(stored!).ok).toBe(true);
    const body = JSON.parse(stored!.recordText);
    expect(JSON.parse(stored!.texts.get(body.request.typed.sha256)!).passage).toEqual(PASSAGE);
    expect(stored!.texts.get(body.outputs.drafts[0].content.sha256)).toBe(REPLACEMENT);
    const texts = (list: Array<{ text: string }>) => list.map(c => c.text).join(' | ');
    // Held by the source shown: found. Supplied by the model: not found. The saved section is not evidence.
    expect(texts(res.body.draft.check.notFound)).toMatch(/9\.2 months/);
    expect(texts(res.body.draft.check.notFound)).not.toMatch(/31%/);
  }, T);
});

describe('a passage is refused before the model is asked', () => {
  const refused = async (sectionId: string, body: Record<string, unknown>, status: number, code: string) => {
    const before = { calls: h.sent.length, turns: await turns(), candidates: await candidates() };
    const res = await post(sectionId, body);
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    expect(res.body).toMatchObject({ success: false, error: { code } });
    expect(res.body.error.message).toMatch(/nothing was drafted/i);
    expect(res.body).not.toHaveProperty('draft');
    expect(h.sent.length).toBe(before.calls);
    expect(await turns()).toBe(before.turns);
    expect(await candidates()).toBe(before.candidates);
  };

  it('when the saved section does not hold it', async () => {
    const sectionId = await seedSection();
    await refused(sectionId, { passage: { quote: 'The response rate was 40%' } }, 409, 'PASSAGE_NOT_IN_SAVED_SECTION');
  }, T);

  it('when it occurs more than once and its context does not pick one', async () => {
    const sectionId = await seedSection();
    await refused(sectionId, { passage: { quote: QUOTE } }, 409, 'PASSAGE_AMBIGUOUS');
  }, T);

  it('when it is malformed, or also asks to revise a draft', async () => {
    const sectionId = await seedSection();
    for (const passage of [{ quote: '' }, 'quote', { quote: 'x'.repeat(2001) }]) {
      await refused(sectionId, { passage }, 400, 'PASSAGE_INVALID');
    }
    await refused(sectionId, { passage: PASSAGE, revise: { fromDraftId: randomUUID(), instruction: 'Shorter' } }, 400, 'PASSAGE_INVALID');
  }, T);
});
