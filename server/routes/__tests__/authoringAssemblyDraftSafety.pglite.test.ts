/** Real authoring HTTP + PGlite writes; only gateway and retrieval are synthetic.
 * Proves saved-base rejection before candidate consumption and fresh project
 * admission. It does not qualify a live model, native-PG scheduling or RLS. */
import { randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, PREREQ, PROGRAM, asToken, makeApp, mint } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';

const h = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  searches: [] as Array<{ programId: unknown; userId: number; organizationId: number; organizationUuid: string | null }>,
  prompts: [] as string[],
}));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (sql: string, params?: unknown[]) => (h.pool as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(sql, params),
}));
vi.mock('../../services/ai-gateway/gateway.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/gateway.js')>()),
  getGateway: () => ({
    getEnabledProviders: () => ['synthetic'],
    route: async (input: { messages: Array<{ content: string }> }) => {
      h.prompts.push(input.messages[0].content);
      return { content: JSON.stringify({ content: 'Candidate for human review.', attributions: [] }), model: 'synthetic-test-model', provider: 'synthetic' };
    },
  }),
}));
vi.mock('../../services/authoring/authoring-draft-sources.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/authoring/authoring-draft-sources.js')>()),
  retrieveSectionDraftSources: async (args: Parameters<typeof import('../../services/authoring/authoring-draft-sources.js').retrieveSectionDraftSources>[0]) => {
    h.searches.push(args);
    return {
      chunks: [{ content: 'Project evidence.', title: 'Project CSR', sourceId: null }],
      receipt: { programId: String(args.programId), retrievedBy: args.userId, documents: [] },
    };
  },
}));

const DOC = 'a5510000-0000-4000-8000-000000000001';
const UNBOUND_DOC = 'a5510000-0000-4000-8000-000000000002';
const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let sequence = 0;
const trace = newTrace();

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL,
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
      ALTER TABLE authoring_documents ADD COLUMN IF NOT EXISTS client_program_id uuid;
      INSERT INTO authoring_documents (id,title,module,status,created_by,tenant_id,client_program_id) VALUES
        ('${DOC}','Assembly target','M2','draft','${AUTHOR.id}',${ORG},'${PROGRAM}'),
        ('${UNBOUND_DOC}','Standalone target','M2','draft','${AUTHOR.id}',${ORG},NULL);
    `,
  });
  h.db = jdb.db;
  h.pool = tappedPool(jdb, trace);
  author = asToken(await mint(AUTHOR));
  app = makeApp((await import('../authoring.router')).default);
}, T);
afterAll(async () => { if (jdb) assertNoSchemaGaps(jdb); await jdb?.close(); });
beforeEach(async () => {
  h.searches = [];
  h.prompts = [];
  await jdb.pglite.exec(`UPDATE users SET status='active'; UPDATE projects SET owner_id=${AUTHOR.id},created_by_id=${AUTHOR.id};
    UPDATE project_visibility_settings SET visibility='org_public';`);
});

async function section(doc = DOC): Promise<string> {
  const id = randomUUID();
  sequence += 1;
  await jdb.pglite.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id)
    VALUES ($1,$2,$3,'Clinical overview','',$4,$5)`, [id, doc, `2.5.${sequence}`, sequence, ORG]);
  return id;
}
const generate = (id: string, body: Record<string, unknown> = {}) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft`)).send(body);
const accept = (id: string, draftId: string) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft/accept`)).send({ draftId });
const parked = async (draftId: string) => (await jdb.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE id=$1', [draftId])).rows.length;

describe('assembly AnA candidates retain their exact saved base', () => {
  it('captures the saved section, ignores client base claims and scopes retrieval to its admitted project', async () => {
    const id = await section();
    const response = await generate(id, { expectedBase: { content: 'fabricated' }, projectId: 999 });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const candidate = (await jdb.pglite.query<{ generator: Record<string, unknown> }>(
      'SELECT generator FROM authoring_ai_draft_candidates WHERE id=$1', [response.body.draft.draftId])).rows[0];
    expect(candidate.generator.savedSectionBase).toMatchObject({ version: 1, sectionId: id, docId: DOC, title: 'Clinical overview' });
    expect(h.searches).toHaveLength(1);
    expect(h.searches[0]).toMatchObject({ programId: PROGRAM, userId: Number(AUTHOR.id), organizationId: ORG });
    expect(candidate.generator.vaultSources).toEqual({ programId: PROGRAM, retrievedBy: Number(AUTHOR.id), documents: [] });
    expect(h.prompts[0]).toContain('PROJECT DATA ROOM EVIDENCE');
  }, T);

  it('refuses a concurrent saved edit before consuming the candidate or writing lineage', async () => {
    const id = await section();
    const generated = await generate(id);
    expect(generated.status).toBe(200);
    const draftId: string = generated.body.draft.draftId;
    await jdb.pglite.query('UPDATE authoring_sections SET content=$1,updated_at=clock_timestamp() WHERE id=$2', ['A colleague saved this text.', id]);
    const mark = trace.stmts.length;
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('SECTION_BASE_CHANGED');
    expect(await parked(draftId)).toBe(1);
    expect((await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content).toBe('A colleague saved this text.');
    expect((await jdb.pglite.query('SELECT id FROM doc_revisions WHERE section_id=$1', [id])).rows).toEqual([]);
    const acceptSql = trace.stmts.slice(mark);
    expect(acceptSql.some(row => /FOR UPDATE OF c, s/.test(row.sql) && row.via === 'client' && row.inTx)).toBe(true);
    expect(acceptSql.some(row => /DELETE FROM authoring_ai_draft_candidates/.test(row.sql))).toBe(false);
  }, T);

  it.each(['title', 'code', 'updated_at'] as const)('also refuses a changed %s when the text itself remains empty', async field => {
    const id = await section();
    const generated = await generate(id);
    const draftId: string = generated.body.draft.draftId;
    const sql = field === 'updated_at' ? 'updated_at=updated_at+interval \'1 second\'' : `${field}='Changed saved heading'`;
    await jdb.pglite.query(`UPDATE authoring_sections SET ${sql} WHERE id=$1`, [id]);
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('SECTION_BASE_CHANGED');
    expect(await parked(draftId)).toBe(1);
  }, T);

  it('accepts the unchanged base once, then retains the existing 410 single-use contract', async () => {
    const id = await section();
    const generated = await generate(id);
    const draftId: string = generated.body.draft.draftId;
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.section.content).toBe('Candidate for human review.');
    expect(await parked(draftId)).toBe(0);
    const repeated = await accept(id, draftId);
    expect(repeated.status).toBe(410);
    expect(repeated.body.error.code).toBe('DRAFT_EXPIRED');
  }, T);

  it('refuses a legacy candidate without a saved base before consuming it', async () => {
    const id = await section();
    const draftId = randomUUID();
    await jdb.pglite.query(`INSERT INTO authoring_ai_draft_candidates
      (id,section_id,organization_id,content,sources,created_by,expires_at)
      VALUES ($1,$2,$3,'Legacy candidate','[]'::jsonb,$4,NOW()+interval '1 hour')`, [draftId, id, ORG, AUTHOR.id]);
    const mark = trace.stmts.length;
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('SECTION_BASE_CHANGED');
    expect(await parked(draftId)).toBe(1);
    expect(trace.stmts.slice(mark).some(row => /DELETE FROM authoring_ai_draft_candidates/.test(row.sql))).toBe(false);
    expect((await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content).toBe('');
  }, T);

  it('refuses newly private project access before retrieval or generation', async () => {
    const id = await section();
    await jdb.pglite.exec(`UPDATE projects SET owner_id=999,created_by_id=999 WHERE id=42;
      UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42;`);
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(403);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    expect(h.searches).toEqual([]);
    expect(h.prompts).toEqual([]);
  }, T);

  it('a standalone draft never searches across other projects and reports the missing retrieval scope', async () => {
    const id = await section(UNBOUND_DOC);
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.searches).toEqual([]);
    expect(response.body.draft.metadata.retrievalStatus).toBe('failed');
    expect(response.body.draft.metadata.retrievalScope).toEqual({ kind: 'unavailable', programId: null, projectId: null });
    expect(h.prompts[0]).not.toContain('Project evidence.');
  }, T);
});

describe('saved-base and Vault receipt controls coexist', () => {
  it('preserves a malformed recorded receipt for actual refusal and rolls candidate consumption back', async () => {
    const id = await section();
    const generated = await generate(id);
    expect(generated.status).toBe(200);
    const draftId: string = generated.body.draft.draftId;
    await jdb.pglite.query(`UPDATE authoring_ai_draft_candidates
      SET generator=jsonb_set(generator,'{vaultSources}','null'::jsonb) WHERE id=$1`, [draftId]);
    const mark = trace.stmts.length;
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('DRAFT_SOURCES_UNAVAILABLE');
    expect(await parked(draftId)).toBe(1);
    const statements = trace.stmts.slice(mark);
    expect(statements.some(row => /DELETE FROM authoring_ai_draft_candidates/.test(row.sql) && row.inTx)).toBe(true);
    expect(statements.some(row => /UPDATE authoring_sections/.test(row.sql))).toBe(false);
    expect(statements.some(row => row.sql === 'ROLLBACK')).toBe(true);
    expect((await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content).toBe('');
  }, T);
});
