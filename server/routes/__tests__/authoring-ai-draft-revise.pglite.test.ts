/**
 * Revise by instruction (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 3).
 * The REAL authoring router over HTTP, on PGlite with the authoring unit, the audit
 * chain, the AnA turn-record store and the draft-candidate store; only the model and
 * the Data Room search are stand-ins.
 *
 * POST …/ai/draft with `revise: { fromDraftId, instruction }` drafts a NEW candidate
 * from a live one the person is looking at. The base is read, never consumed, so it
 * still accepts. The new candidate's generator, and so its accept's audit row, names
 * `derivedFrom`. The instruction is the person's words, in the turn record and in the
 * check; the base text is model input and never a source, so a figure it carried that
 * no source holds is still not found. A base that is gone, of another section, or
 * drafted against a saved section that has since changed is refused before the model
 * is asked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type express from 'express';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';

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
        requestId: `req-revise-${h.sent.length}` };
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
const DOC = 'e0c000ad-0000-4000-8000-0000000000be';
/** What the Data Room holds. */
const SOURCE: Hit = { id: 'a1', title: 'CSR ABC-301 Section 11', sourceId: null, score: 1,
  content: 'In study ABC-301 the objective response rate was 31% (95% CI 22–41) in the 10 mg arm.' };
/** The base draft: one found figure, one no source holds (36 months). */
const BASE = 'In study ABC-301 the objective response rate was 31% in the 10 mg arm. The drug substance is stable for 36 months.';
/** The revision: shorter, keeps the unsupported 36 months, adds a per-protocol figure nobody gave, and states the person's 42%. */
const REVISED = 'The objective response rate was 31% in the 10 mg arm; stable for 36 months. The per-protocol response rate was 38%, against a target of 42%.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

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
        ('${DOC}', 'Clinical study report — revised by instruction', 'M5', 'ABC', 'draft', '${AUTHOR.id}', ${ORG}, '${PROGRAM}');
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

async function seedSection(): Promise<string> {
  const id = randomUUID();
  seq += 1;
  await jdb.pglite.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
     VALUES ($1, $2, $3, 'Efficacy Results', '', $4, $5)`,
    [id, DOC, `11.4.${seq}`, seq, ORG],
  );
  return id;
}

const post = (sectionId: string, body: Record<string, unknown>) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft`)).send({ region: 'FDA', ...body });
const accept = (sectionId: string, draftId: string, content: string) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId, content });

/** A section with a live base candidate, and a revision of it. */
async function revised(instruction = 'Shorter. Add the per-protocol result; the target was 42%.') {
  const sectionId = await seedSection();
  h.replies.push(BASE, REVISED);
  const base = await post(sectionId, { tone: 'concise' });
  expect(base.status, JSON.stringify(base.body)).toBe(200);
  const baseId: string = base.body.draft.draftId;
  const res = await post(sectionId, { tone: 'concise', revise: { fromDraftId: baseId, instruction } });
  return { sectionId, baseId, res, instruction };
}

const generatorOf = async (draftId: string) => (await jdb.pglite.query<{ generator: Record<string, unknown> }>(
  'SELECT generator FROM authoring_ai_draft_candidates WHERE id=$1 AND organization_id=$2', [draftId, ORG])).rows[0]?.generator;
const candidates = async () => (await jdb.pglite.query<{ id: string }>(
  'SELECT id FROM authoring_ai_draft_candidates WHERE organization_id=$1 ORDER BY id', [ORG])).rows;
const turns = async () => (await jdb.pglite.query<{ id: string }>(
  'SELECT id FROM ana_turn_records WHERE organization_id=$1', [ORG])).rows.length;

describe('a revision is a new candidate drafted from the one shown', () => {
  it('sends the model the base as parked and the instruction, and parks a new candidate naming derivedFrom', async () => {
    const { baseId, res, instruction } = await revised();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const prompt = h.sent[1].messages[0].content;
    expect(prompt).toContain(`BEGIN_DRAFT_TO_REVISE\n${BASE}\nEND_DRAFT_TO_REVISE`);
    expect(prompt).toContain(`BEGIN_PERSON_INSTRUCTION\n${instruction}\nEND_PERSON_INSTRUCTION`);
    expect(prompt).toMatch(/Never supply a number, result or statistic that the evidence above does not state, even when the instruction asks for one/);
    // The first draft was not a revision, and its prompt says nothing of one.
    expect(h.sent[0].messages[0].content).not.toContain('DRAFT_TO_REVISE');
    expect(res.body.draft.draftId).toEqual(expect.any(String));
    expect(res.body.draft.draftId).not.toBe(baseId);
    expect(res.body.draft.content).toBe(REVISED);
    const derivedFrom = { draftId: baseId, contentSha256: sha(BASE), instruction };
    expect(res.body.draft.derivedFrom).toEqual(derivedFrom);
    expect(await generatorOf(res.body.draft.draftId)).toMatchObject({ derivedFrom });
    expect(await generatorOf(baseId)).not.toHaveProperty('derivedFrom');
  }, T);

  it('reads the base and never consumes it: the base still accepts after it was revised', async () => {
    const { sectionId, baseId, res } = await revised();
    expect(res.status).toBe(200);
    expect((await candidates()).map(c => c.id)).toEqual(expect.arrayContaining([baseId, res.body.draft.draftId]));
    const accepted = await accept(sectionId, baseId, BASE);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.section.content).toBe(BASE);
  }, T);

  it('accepting the revision records derivedFrom on the audit row, with the generator', async () => {
    const { sectionId, baseId, res, instruction } = await revised();
    const accepted = await accept(sectionId, res.body.draft.draftId, REVISED);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const trail = (await jdb.pglite.query<{ metadata: Record<string, any> }>(
      `SELECT metadata FROM authoring_audit_trail WHERE section_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [sectionId, ORG])).rows[0];
    expect(trail.metadata.source).toBe('ai-draft-accept');
    expect(trail.metadata.generator.derivedFrom).toEqual({ draftId: baseId, contentSha256: sha(BASE), instruction });
    expect(trail.metadata.generator.turnRecordId).toBe(res.body.draft.turnRecord.id);
  }, T);
});

describe('the revision’s record and check', () => {
  it('records the instruction as asked and the base text as model input', async () => {
    const { baseId, res, instruction } = await revised();
    const id = res.body.draft.turnRecord.id;
    const stored = await loadTurnRecord(jdb.pool as never, ORG, id);
    expect(verifyStoredTurnRecord(stored!).ok).toBe(true);
    const body = JSON.parse(stored!.recordText);
    const typed = JSON.parse(stored!.texts.get(body.request.typed.sha256)!);
    expect(typed.revise).toEqual({ fromDraftId: baseId, instruction, baseContentSha256: sha(BASE) });
    expect(stored!.texts.get(body.modelInput[0].text.sha256)).toContain(BASE);
    expect(stored!.texts.get(body.outputs.drafts[0].content.sha256)).toBe(REVISED);
  }, T);

  it('re-runs the check against the sources: the base is not one, and the instruction is the person’s', async () => {
    const { res } = await revised();
    const check = res.body.draft.check;
    const texts = (list: Array<{ text: string }>) => list.map((c) => c.text).join(' | ');
    // Carried from the base, held by no source: still not found, because the base is not evidence.
    expect(texts(check.notFound)).toMatch(/36 months/);
    // Asked for by the instruction and supplied by the model: not found. The model does not answer for a figure.
    expect(texts(check.notFound)).toMatch(/38%/);
    // Given by the person in the instruction: theirs, never found.
    expect(texts(check.fromPerson)).toMatch(/42%/);
    expect(texts(check.notFound)).not.toMatch(/42%/);
  }, T);
});

describe('a revision is refused before the model is asked', () => {
  const refused = async (sectionId: string, body: Record<string, unknown>, status: number, code: string) => {
    const before = { calls: h.sent.length, turns: await turns(), candidates: (await candidates()).length };
    const res = await post(sectionId, body);
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    expect(res.body).toMatchObject({ success: false, error: { code } });
    expect(res.body.error.message).toMatch(/nothing was drafted/i);
    expect(res.body).not.toHaveProperty('draft');
    expect(h.sent.length).toBe(before.calls);
    expect(await turns()).toBe(before.turns);
    expect((await candidates()).length).toBe(before.candidates);
  };

  it('when the instruction is empty or too long, or the draft named is not a draft id', async () => {
    const sectionId = await seedSection();
    const id = randomUUID();
    for (const revise of [{ fromDraftId: id, instruction: '  ' }, { fromDraftId: id, instruction: 'x'.repeat(1001) },
      { fromDraftId: 'DC-1', instruction: 'Shorter' }, { instruction: 'Shorter' }, null, 'Shorter']) {
      await refused(sectionId, { revise }, 400, 'REVISION_INVALID');
    }
  }, T);

  it('when the base is unknown, already accepted, or a candidate of another section', async () => {
    const { sectionId, baseId } = await revised();
    await refused(sectionId, { revise: { fromDraftId: randomUUID(), instruction: 'Shorter' } }, 409, 'REVISION_BASE_UNAVAILABLE');
    const other = await seedSection();
    await refused(other, { revise: { fromDraftId: baseId, instruction: 'Shorter' } }, 409, 'REVISION_BASE_UNAVAILABLE');
    expect((await accept(sectionId, baseId, BASE)).status).toBe(200);
    await refused(sectionId, { revise: { fromDraftId: baseId, instruction: 'Shorter' } }, 409, 'REVISION_BASE_UNAVAILABLE');
  }, T);

  it('when the saved section changed after the base was drafted', async () => {
    const sectionId = await seedSection();
    h.replies.push(BASE);
    const base = await post(sectionId, {});
    await jdb.pglite.query(`UPDATE authoring_sections SET content = '<p>Saved since.</p>', updated_at = NOW() + INTERVAL '1 second' WHERE id = $1`, [sectionId]);
    await refused(sectionId, { revise: { fromDraftId: base.body.draft.draftId, instruction: 'Shorter' } }, 409, 'SECTION_BASE_CHANGED');
  }, T);
});
