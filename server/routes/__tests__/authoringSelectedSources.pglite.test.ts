/** Actual HTTP/JWT, current source admission and SQL rollback on PGlite.
 * Only the model and optional broad retrieval are synthetic. No live calls. */
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, VAULT_DDL, AUTHOR, ORG, PROGRAM, PROGRAM_B, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';
import { RECORDED_LINEAGE_STORES_DDL } from '../../services/document-data-disposition/__tests__/lineage-stores-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown,
  prompts: [] as string[], broad: vi.fn(), onReply: null as null | (() => Promise<void>),
  armed: false, commitFault: null as null | 'before' | 'after', rollbackFault: false,
  transactionOpen: false, acceptSql: [] as string[], releaseErrors: [] as boolean[] }));
vi.mock('../../db', () => ({
  get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, values?: unknown[]) => (h.pool as { query(s: string, p?: unknown[]): Promise<unknown> }).query(sql, values),
}));
vi.mock('../../services/ai-gateway/gateway.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ai-gateway/gateway.js')>()),
  getGateway: () => ({ getEnabledProviders: () => ['synthetic'], route: async (input: { messages: Array<{ content: string }> }) => {
    h.prompts.push(input.messages[0].content); await h.onReply?.();
    return { content: JSON.stringify({ content: 'Prepared candidate for human review.', attributions: [] }), model: 'synthetic-test-model', provider: 'synthetic' };
  } }),
}));
vi.mock('../../services/authoring/authoring-draft-sources.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/authoring/authoring-draft-sources.js')>()),
  retrieveSectionDraftSources: (...args: unknown[]) => h.broad(...args),
}));

const DOC = 'a5510000-0000-4000-8000-000000000011';
const T = 180_000;
const trace = newTrace();
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let sequence = 0;
function transportFaultPool() {
  const tapped = tappedPool(db, trace);
  return { query: tapped.query, connect: async () => {
    const client = await tapped.connect();
    return {
      query: async (sql: string, values?: unknown[]) => {
        const command = sql.trim().toUpperCase();
        if (h.armed) h.acceptSql.push(command);
        if (h.armed && command === 'COMMIT' && h.commitFault === 'before') throw new Error('Synthetic lost COMMIT reply before dispatch');
        if (h.armed && command === 'ROLLBACK' && h.rollbackFault) throw new Error('Synthetic lost ROLLBACK reply');
        const result = await client.query(sql, values);
        if (command.startsWith('BEGIN')) h.transactionOpen = true;
        if (command === 'COMMIT' || command === 'ROLLBACK') h.transactionOpen = false;
        if (h.armed && command === 'COMMIT' && h.commitFault === 'after') throw new Error('Synthetic lost COMMIT reply after commit');
        return result;
      },
      release: (error?: Error) => { if (h.armed) h.releaseErrors.push(error instanceof Error); client.release(); },
    };
  } };
}
/** PGlite has one connection. Direct fixture cleanup emulates disconnect of an
 * active transaction after the response; it is outside the application trace.
 * release(error) proves the requested eviction, not a native socket close. */
async function cleanFixtureTransaction() {
  if (h.transactionOpen) await db.pglite.exec('ROLLBACK');
  h.transactionOpen = false;
}
beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL + VAULT_DDL + RECORDED_LINEAGE_STORES_DDL,
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
      'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
      'migrations/20260726_cre_source_program_scope.sql',
      'migrations/20260829_cre_source_versioning.sql',
      'migrations/20261008c_data_room_source_text.sql',
      'migrations/20260905_document_catalog.sql',
      'migrations/20261008e_document_catalog_attribution.sql',
      'migrations/20261006_document_data_dispositions.sql',
    ], testOnlySql: `
      ALTER TABLE concept2cure_artifacts ADD COLUMN artifact_id text, ADD COLUMN metadata jsonb DEFAULT '{}';
      INSERT INTO authoring_documents(id,title,module,status,created_by,tenant_id,client_program_id)
        VALUES('${DOC}','Selected source target','M2','draft','${AUTHOR.id}',${ORG},'${PROGRAM}');
    ` });
  h.db = db.db; h.pool = transportFaultPool();
  author = asToken(await mint(AUTHOR));
  app = express();
  app.use((req, _res, next) => { Object.assign(req, { dbClient: h.pool }); next(); });
  app.use(makeApp((await import('../authoring.router')).default));
}, T);
afterAll(async () => { if (db) assertNoSchemaGaps(db); await db?.close(); });
beforeEach(async () => {
  await cleanFixtureTransaction();
  h.prompts = []; h.onReply = null; trace.failOn = null; trace.faultHits = 0;
  h.armed = false; h.commitFault = null; h.rollbackFault = false; h.acceptSql = []; h.releaseErrors = [];
  h.broad.mockReset(); h.broad.mockResolvedValue({ chunks: [], receipt: { programId: PROGRAM, retrievedBy: Number(AUTHOR.id), documents: [] } });
  await db.pglite.exec(`UPDATE users SET status='active'; UPDATE projects SET owner_id=${AUTHOR.id},created_by_id=${AUTHOR.id};
    UPDATE project_visibility_settings SET visibility='org_public';`);
});
async function section(): Promise<string> {
  const id = randomUUID(); sequence += 1;
  await db.pglite.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
    VALUES($1,$2,$3,'Selected source section','',$4,$5)`, [id, DOC, `2.5.${sequence}`, sequence, ORG]);
  return id;
}
async function sources() {
  const token = randomUUID();
  const creText = 'Unselected opening. '.repeat(4500) + 'needle_window 🧬 Exact unfiled Data Room excerpt. '.repeat(90) + ' Unselected ending.';
  const vaultText = 'Vault lead. '.repeat(8000) + 'needle_window 🔬 Exact Vault selected excerpt. '.repeat(90) + ' Vault ending.';
  const capture = (await db.pglite.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,version,ingestion_status,extraction_status,extracted_text)
    VALUES($1,$2,'client_document','Unfiled Data Room input',$3,'1','ingested','verified',$4) RETURNING id`, [ORG, PROGRAM, sha(`cre-${token}`), creText])).rows[0].id;
  const vault = randomUUID(); const hash = sha(`vault-${token}`);
  await db.pglite.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,content_hash,extracted_text)
    VALUES($1,$2,$3,$4,'Vault selected input','csr',$5,$6)`, [vault, PROGRAM, ORG, token, hash, vaultText]);
  await db.pglite.query(`INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES($1,$2,'extracted','plain-text',$3)`, [vault, hash, vaultText.length]);
  return { capture, vault, creText, vaultText, selectors: [{ kind: 'data-room', sourceId: capture }, { kind: 'vault', documentId: vault }] as AssemblySourceSelector[] };
}
async function selected(input: Awaited<ReturnType<typeof sources>>) {
  const { readSelectedAuthoringSources } = await import('../../services/authoring/authoring-assembly-sources');
  const q = { query: (sql: string, values?: unknown[]) => db.pglite.query<Record<string, unknown>>(sql, values) };
  return readSelectedAuthoringSources(q, { organizationId: ORG, userId: Number(AUTHOR.id), programId: PROGRAM }, input.selectors, { query: 'needle_window' });
}
const generate = (id: string, body: Record<string, unknown>) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft`)).send(body);
const accept = (id: string, draftId: string) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft/accept`)).send({ draftId });
const parked = async (id: string) => (await db.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE id=$1', [id])).rows.length;
const unchanged = async (id: string) => {
  const result = (await db.pglite.query<{ content: string; revisions: number; audits: number }>(`SELECT s.content,
    (SELECT count(*)::int FROM doc_revisions r WHERE r.section_id=s.id) AS revisions,
    (SELECT count(*)::int FROM authoring_audit_trail a WHERE a.section_id=s.id) AS audits
    FROM authoring_sections s WHERE s.id=$1`, [id])).rows[0];
  expect(result).toEqual({ content: '', revisions: 0, audits: 0 });
};

describe('explicit source requests fail closed before dispatch', () => {
  it.each([null, {}, { version: 1, entries: [] }])('a malformed sources request never falls back or calls the provider: %j', async raw => {
    const id = await section(); const response = await generate(id, { sources: raw });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error.code).toBe('ASSEMBLY_SOURCES_INVALID');
    expect(h.prompts).toEqual([]); expect(h.broad).not.toHaveBeenCalled(); await unchanged(id);
  }, T);
  it('refuses another program manifest before dispatch', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const response = await generate(id, { sources: { ...manifest, programId: PROGRAM_B } });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(h.prompts).toEqual([]); expect(h.broad).not.toHaveBeenCalled(); await unchanged(id);
  }, T);
  it('refuses a same-length extraction correction without fallback', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    await db.pglite.query('UPDATE cre_evidence_sources SET extracted_text=$1 WHERE id=$2', ['Z' + input.creText.slice(1), input.capture]);
    const response = await generate(id, { sources: manifest });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(h.prompts).toEqual([]); expect(h.broad).not.toHaveBeenCalled(); await unchanged(id);
  }, T);
});

describe('exact selected excerpts reach generation and remain retained', () => {
  it('uses both exact UTF-16 excerpts, including text past 600 characters, and parks the text-free receipt', async () => {
    const input = await sources(); const { manifest, chunks } = await selected(input); const id = await section();
    const response = await generate(id, { sources: manifest });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.prompts).toHaveLength(1); expect(h.broad).not.toHaveBeenCalled();
    for (const chunk of chunks) { expect(chunk.content.length).toBeGreaterThan(600); expect(h.prompts[0]).toContain(chunk.content); }
    const candidate = (await db.pglite.query<{ generator: Record<string, unknown>; sources: Array<{ evidenceSourceId: number }> }>(
      'SELECT generator,sources FROM authoring_ai_draft_candidates WHERE id=$1', [response.body.draft.draftId])).rows[0];
    expect(candidate.generator.assemblySources).toEqual(manifest);
    expect(candidate.sources.map(source => source.evidenceSourceId)).toEqual([input.capture]);
    expect(JSON.stringify(candidate.generator.assemblySources)).not.toContain('needle_window');
    await unchanged(id);
  }, T);
  it('rechecks after generation and refuses changed extraction without parking a candidate', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    h.onReply = async () => { await db.pglite.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2', ['Z' + input.vaultText.slice(1), input.vault]); };
    const response = await generate(id, { sources: manifest });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(h.prompts).toHaveLength(1); expect(h.broad).not.toHaveBeenCalled();
    expect((await db.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE section_id=$1', [id])).rows).toEqual([]);
    await unchanged(id);
  }, T);
});

describe('acceptance reserves the retained exact source receipt', () => {
  it('keeps the verified generation input in the canonical acceptance audit after consuming the candidate', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(200); expect(await parked(draftId)).toBe(0);
    const audit = (await db.pglite.query<{ metadata: Record<string, unknown> }>('SELECT metadata FROM authoring_audit_trail WHERE section_id=$1', [id])).rows[0];
    expect(audit.metadata).toMatchObject({ assemblySourceUse: 'verified_generation_input', assemblySources: manifest,
      generator: { assemblySources: manifest } });
  }, T);
  it('rolls back consumption if a source was retired before accept', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    await db.pglite.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [input.capture]);
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409); expect(await parked(draftId)).toBe(1); await unchanged(id);
  }, T);
  it('retains malformed stored manifests so acceptance refuses rather than dropping the control', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    await db.pglite.query(`UPDATE authoring_ai_draft_candidates SET generator=jsonb_set(generator,'{assemblySources}','null'::jsonb) WHERE id=$1`, [draftId]);
    const response = await accept(id, draftId);
    expect(response.status, JSON.stringify(response.body)).toBe(409); expect(response.body.error.code).toBe('ASSEMBLY_SOURCES_INVALID');
    expect(await parked(draftId)).toBe(1); await unchanged(id);
  }, T);
  it('rolls the source-bound acceptance and receipt back when the audit writer fails', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    trace.failOn = /^\s*INSERT INTO authoring_audit_trail/;
    const response = await accept(id, draftId);
    trace.failOn = null;
    expect(response.status, JSON.stringify(response.body)).toBe(500); expect(response.body.error.code).toBe('LINEAGE_REQUIRED');
    expect(await parked(draftId)).toBe(1); await unchanged(id);
    expect((await db.pglite.query('SELECT id FROM document_span_lineage WHERE document_id=$1', [id])).rows).toEqual([]);
  }, T);
});

describe('uncertain acceptance never claims a confirmed rollback', () => {
  it.each(['before', 'after'] as const)('holds a lost COMMIT reply %s actual commit and discards without a rollback or retry', async phase => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    h.armed = true; h.commitFault = phase;
    const response = await accept(id, draftId);
    await cleanFixtureTransaction();
    const content = (await db.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content;
    expect(content).toBe(phase === 'after' ? 'Prepared candidate for human review.' : '');
    expect(await parked(draftId)).toBe(phase === 'after' ? 0 : 1);
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(response.body).toMatchObject({ success: false, ok: false,
      code: 'AUTHORING_AI_ACCEPT_COMMIT_UNCONFIRMED', error: { code: 'AUTHORING_AI_ACCEPT_COMMIT_UNCONFIRMED' },
      writeOutcome: 'unconfirmed', retryAllowed: false,
      recovery: { organizationId: ORG, documentId: DOC, sectionId: id, draftId } });
    expect(response.body.section).toBeUndefined();
    expect(response.body.saved).toBeUndefined();
    expect(response.body.filing).toBeUndefined();
    expect(response.body.error.message).not.toMatch(/nothing (?:was )?(?:saved|accepted)|not saved/i);
    expect(h.acceptSql.filter(sql => sql === 'COMMIT')).toHaveLength(1);
    expect(h.acceptSql.filter(sql => sql === 'ROLLBACK')).toHaveLength(0);
    expect(h.releaseErrors).toEqual([true]);
  }, T);
  it('holds a failed precommit rollback and discards the uncertain client', async () => {
    const input = await sources(); const { manifest } = await selected(input); const id = await section();
    const generated = await generate(id, { sources: manifest }); const draftId: string = generated.body.draft.draftId;
    h.armed = true; h.rollbackFault = true; trace.failOn = /^\s*INSERT INTO authoring_audit_trail/;
    const response = await accept(id, draftId);
    trace.failOn = null; await cleanFixtureTransaction();
    expect(await parked(draftId)).toBe(1); await unchanged(id);
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(response.body.error.code).toBe('DRAFT_ACCEPT_UNCONFIRMED');
    expect(h.acceptSql.filter(sql => sql === 'COMMIT')).toHaveLength(0);
    expect(h.acceptSql.filter(sql => sql === 'ROLLBACK')).toHaveLength(1);
    expect(h.releaseErrors).toEqual([true]);
  }, T);
});
