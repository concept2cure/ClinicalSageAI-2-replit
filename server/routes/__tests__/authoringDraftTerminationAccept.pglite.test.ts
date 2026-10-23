/** Real HTTP/JWT acceptance over PGlite and the deployed authoring/filing
 * migrations. Only the db module is redirected to the in-process database.
 * This proves server-candidate termination authority and rollback, not native
 * PostgreSQL concurrency, live-provider behavior or agency acceptance. */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, FILING, ORG, PREREQ, PROGRAM, asToken, makeApp, mint } from './_authoring-canvas-fixture';
import { T, head, newTrace, responseMarker, sha256, tappedPool, writesSince } from './_authoring-record-fixture';
import { createDraftCandidate, savedSectionDraftBase } from '../../services/clinical-regulatory-evidence/draft-candidate-store';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (sql: string, params?: unknown[]) =>
    (h.pool as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(sql, params),
}));

const DOC = 'a551ffff-0000-4000-8000-000000000001';
const PRIOR = 'The existing reviewed section text.';
const GENERATED = 'The generated candidate is awaiting human review.';
const EDITED = 'The author edited the generated candidate before accepting.';
const GENERATOR = {
  model: 'synthetic-test-model', provider: 'synthetic',
  promptSha256: sha256('Test fixture prompt; no provider was invoked.'),
  generatedAt: '2026-10-18T10:00:00.000Z',
};
const trace = newTrace();
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let sequence = 0;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ + AUTHORING_ACCESS_DDL + `
      -- The shared fixture already seeds a minimal filing document. These
      -- phase-9 document columns permit its real indexes/readiness trigger.
      ALTER TABLE c2c_documents ADD COLUMN owner_id integer;
      ALTER TABLE c2c_documents ADD COLUMN readiness integer NOT NULL DEFAULT 0;
      ALTER TABLE c2c_documents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      -- The section-parent repair joins a document to its own rule pack.
      ALTER TABLE c2c_documents ADD COLUMN rule_pack_version text;
      -- Every writer of the filing reads whether it is locked or submitted.
      ALTER TABLE c2c_documents ADD COLUMN status text NOT NULL DEFAULT 'draft';
      ALTER TABLE c2c_documents ADD COLUMN locked_at timestamptz;
    `,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
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
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260728_c2c_document_sections_timestamps.sql',
      'migrations/20260728_c2c_section_version_author_kind.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
    ],
    testOnlySql: `
      INSERT INTO authoring_documents (id,title,module,status,created_by,tenant_id,client_program_id,c2c_document_id)
      VALUES ('${DOC}','Termination accept target','M2','draft','${AUTHOR.id}',${ORG},'${PROGRAM}','${FILING}');
    `,
  });
  h.db = jdb.db;
  h.pool = tappedPool(jdb, trace);
  author = asToken(await mint(AUTHOR));
  app = express();
  app.use(responseMarker(trace));
  app.use(makeApp((await import('../authoring.router')).default));
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

async function seed(termination: Record<string, unknown> = {}, extras: Record<string, unknown> = {}) {
  const sectionId = randomUUID();
  const code = `2.5.${++sequence}`;
  await jdb.pglite.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id)
    VALUES ($1,$2,$3,'Overview',$4,$5,$6)`, [sectionId, DOC, code, PRIOR, sequence, ORG]);
  await jdb.pglite.query(`INSERT INTO c2c_document_sections
    (document_id,section_key,label,path_order,status,content,draft_source)
    VALUES ($1,$2,'Overview',$3,'drafted',jsonb_build_object('text',$4::text),'human')`,
  [FILING, code, sequence, PRIOR]);
  const saved = (await jdb.pglite.query<Record<string, unknown>>(
    'SELECT id,doc_id,code,title,content,updated_at::text AS base_updated_at FROM authoring_sections WHERE id=$1',
    [sectionId],
  )).rows[0];
  const generator = {
    ...GENERATOR,
    savedSectionBase: savedSectionDraftBase(saved),
    vaultSources: { programId: PROGRAM, retrievedBy: Number(AUTHOR.id), documents: [] },
    ...termination, ...extras,
  };
  const candidate = await createDraftCandidate(ORG, sectionId, GENERATED, [], AUTHOR.id,
    jdb.pool as unknown as Parameters<typeof createDraftCandidate>[5], generator);
  return { sectionId, draftId: candidate.id, code };
}

const accept = (sectionId: string, draftId: string, body: Record<string, unknown> = {}) =>
  author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId, ...body });

async function stateOf(sectionId: string, draftId: string, code: string) {
  const query = async (sql: string, params: unknown[]) => (await jdb.pglite.query(sql, params)).rows;
  return {
    section: await query('SELECT * FROM authoring_sections WHERE id=$1', [sectionId]),
    candidate: await query('SELECT * FROM authoring_ai_draft_candidates WHERE id=$1', [draftId]),
    revisions: await query('SELECT * FROM doc_revisions WHERE section_id=$1 ORDER BY id', [sectionId]),
    trail: await query('SELECT * FROM authoring_audit_trail WHERE section_id=$1 ORDER BY id', [sectionId]),
    chain: await query('SELECT * FROM audit_logs WHERE record_id=$1 ORDER BY id', [sectionId]),
    lineage: await query("SELECT * FROM document_span_lineage WHERE document_table='authoring_sections' AND document_id=$1 ORDER BY id", [sectionId]),
    filing: await query('SELECT * FROM c2c_document_sections WHERE document_id=$1 AND section_key=$2', [FILING, code]),
    filingVersions: await query(`SELECT v.* FROM c2c_document_section_versions v
      JOIN c2c_document_sections s ON s.id=v.section_id WHERE s.document_id=$1 AND s.section_key=$2 ORDER BY v.id`, [FILING, code]),
    filingDocument: await query('SELECT * FROM c2c_documents WHERE id=$1', [FILING]),
    actions: await query('SELECT * FROM c2c_ana_actions ORDER BY id', []),
  };
}

describe('server-owned termination controls actual candidate acceptance', () => {
  it.each(['max_tokens', 'length', 'chunk_timeout', ' max_tokens ', '\tlength\n', '\n chunk_timeout\t'])(
    'refuses stored cutoff %j even with stored false and caller complete/false claims', async finishReason => {
      const seeded = await seed({ finishReason, truncated: false });
      const before = await stateOf(seeded.sectionId, seeded.draftId, seeded.code);
      const mark = trace.stmts.length;
      const response = await accept(seeded.sectionId, seeded.draftId, {
        content: EDITED, finishReason: 'end_turn', finish_reason: 'stop', truncated: false,
      });
      expect(response.status, JSON.stringify(response.body)).toBe(422);
      expect(response.body).toMatchObject({ success: false, error: { code: 'DRAFT_TRUNCATED' } });
      expect(response.body.error.message).toMatch(/shorten|split/i);
      expect(response.body.error.message).toMatch(/regenerate/i);
      expect(response.body).not.toHaveProperty('section');
      expect(response.body).not.toHaveProperty('draft');
      expect(JSON.stringify(response.body)).not.toContain(GENERATED);
      expect(JSON.stringify(response.body)).not.toContain(EDITED);
      expect(await stateOf(seeded.sectionId, seeded.draftId, seeded.code)).toEqual(before);
      const statements = trace.stmts.slice(mark);
      expect(statements.some(row => /DELETE FROM authoring_ai_draft_candidates/.test(row.sql)
        && row.via === 'client' && row.inTx)).toBe(true);
      expect(writesSince(trace, mark)).toEqual([['authoring_ai_draft_candidates', 'client', true]]);
      const rollback = statements.findIndex(row => row.via === 'client' && head(row.sql) === 'ROLLBACK');
      const reply = statements.findIndex(row => row.via === 'response');
      expect(rollback).toBeGreaterThanOrEqual(0);
      expect(reply).toBeGreaterThan(rollback);
      expect(statements.some(row => row.via === 'client' && head(row.sql) === 'COMMIT')).toBe(false);
    }, T,
  );

  it('refuses stored true even when the stored reason is unknown and caller claims false', async () => {
    const seeded = await seed({ finishReason: 'provider_future_reason', truncated: true });
    const before = await stateOf(seeded.sectionId, seeded.draftId, seeded.code);
    const response = await accept(seeded.sectionId, seeded.draftId, { content: EDITED, finish_reason: 'stop', truncated: false });
    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(response.body.error.code).toBe('DRAFT_TRUNCATED');
    expect(await stateOf(seeded.sectionId, seeded.draftId, seeded.code)).toEqual(before);
  }, T);

  it.each([
    { label: 'normal', fields: { finishReason: 'end_turn', truncated: false } },
    { label: 'unknown', fields: { finishReason: 'provider_future_reason', truncated: false } },
    { label: 'null', fields: { finishReason: null, truncated: false } },
    { label: 'absent legacy termination', fields: {} },
  ])('$label with a valid saved base accepts once and preserves the existing 410 replay refusal', async ({ fields }) => {
    const seeded = await seed(fields);
    const response = await accept(seeded.sectionId, seeded.draftId, { content: EDITED });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.section.content).toBe(EDITED);
    expect(response.body.filing).toMatchObject({ committed: true, documentId: FILING, sectionKey: seeded.code });
    const state = await stateOf(seeded.sectionId, seeded.draftId, seeded.code);
    expect(state.candidate).toEqual([]);
    expect(state.revisions).toHaveLength(1);
    expect(state.trail).toHaveLength(1);
    expect(state.chain).toHaveLength(1);
    expect(state.lineage.length).toBeGreaterThan(0);
    expect(state.filing[0]).toMatchObject({ content: { text: EDITED }, draft_source: 'ana' });
    expect(state.filingVersions).toHaveLength(1);
    const replay = await accept(seeded.sectionId, seeded.draftId);
    expect(replay.status, JSON.stringify(replay.body)).toBe(410);
    expect(replay.body.error.code).toBe('DRAFT_EXPIRED');
    expect(await stateOf(seeded.sectionId, seeded.draftId, seeded.code)).toEqual(state);
  }, T);
});

describe('termination protection preserves earlier fail-closed contracts', () => {
  it.each([
    { label: 'legacy no base', fields: { savedSectionBase: null }, expected: 'SECTION_BASE_CHANGED', consumed: false },
    { label: 'malformed saved base', fields: { savedSectionBase: { version: 1, sectionId: 'fabricated' } }, expected: 'SECTION_BASE_CHANGED', consumed: false },
    { label: 'malformed source receipt', fields: { vaultSources: null }, expected: 'DRAFT_SOURCES_UNAVAILABLE', consumed: true },
  ])('$label remains refused with no committed changes', async ({ fields, expected, consumed }) => {
    const seeded = await seed({}, fields);
    const before = await stateOf(seeded.sectionId, seeded.draftId, seeded.code);
    const mark = trace.stmts.length;
    const response = await accept(seeded.sectionId, seeded.draftId, { finish_reason: 'stop', truncated: false });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe(expected);
    expect(await stateOf(seeded.sectionId, seeded.draftId, seeded.code)).toEqual(before);
    const statements = trace.stmts.slice(mark);
    expect(statements.some(row => /DELETE FROM authoring_ai_draft_candidates/.test(row.sql))).toBe(consumed);
    expect(statements.some(row => row.via === 'client' && head(row.sql) === 'ROLLBACK')).toBe(true);
    expect(statements.some(row => /UPDATE authoring_sections/.test(row.sql))).toBe(false);
  }, T);
});
