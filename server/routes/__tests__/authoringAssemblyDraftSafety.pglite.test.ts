/** Real authoring HTTP + PGlite writes; only gateway and retrieval are synthetic.
 * Proves saved-base rejection before candidate consumption and fresh project
 * admission. It does not qualify a live model, native-PG scheduling or RLS. */
import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, PREREQ, PROGRAM, asToken, makeApp, mint } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';
import type { RecordedTemplateSource } from '../../../shared/authoring/recorded-template-source';
import { loadTurnRecord, verifyStoredTurnRecord } from '../../services/ana/turn-record-verify';

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
const TEMPLATE = 'a5510000-0000-4000-8000-000000000003';
const PARENT_TEMPLATE = 'a5510000-0000-4000-8000-000000000004';
const OTHER_PROGRAM = 'a5510000-0000-4000-8000-000000000005';
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
      'migrations/20260727_authoring_document_program_scope.sql',
      'migrations/20260921_authoring_document_provenance.sql',
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
    UPDATE project_visibility_settings SET visibility='org_public';
    UPDATE authoring_documents SET template_id=NULL,provenance=NULL;`);
  trace.failOn = null;
});

async function section(doc = DOC): Promise<string> {
  const id = randomUUID();
  sequence += 1;
  await jdb.pglite.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id)
    VALUES ($1,$2,$3,'Clinical overview','',$4,$5)`, [id, doc, `2.5.${sequence}`, sequence, ORG]);
  return id;
}
// These safety cases select FDA explicitly. Regional-derivation cases remove
// the preference with region: undefined, so the wire request truly omits it.
const generate = (id: string, body: Record<string, unknown> = {}) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft`)).send({ region: 'FDA', ...body });
const accept = (id: string, draftId: string) => author(request(app).post(`/api/authoring/sections/${id}/ai/draft/accept`)).send({ draftId });
const parked = async (draftId: string) => (await jdb.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE id=$1', [draftId])).rows.length;

const templateSource = (changes: Partial<RecordedTemplateSource> = {}): RecordedTemplateSource => ({
  id: TEMPLATE, entryId: 'registry:US_IND', version: 1, sha256: 'a'.repeat(64), kind: 'narrative',
  aiDraftable: true, authoringMode: 'ai_draft', originalFormat: 'docx', limitations: ['Use only verified study results.'],
  filingContext: { registryId: 'US_IND', region: 'US', agency: 'FDA' }, ...changes,
});
const regionalSource = (region: 'CA' | 'EU' | 'JP') => templateSource({ entryId: `registry:${region}_TEST`,
  filingContext: { registryId: `${region}_TEST`, region, agency: { CA: 'Health Canada', EU: 'EMA', JP: 'PMDA' }[region] } });
const assemblyMetadata = (source: RecordedTemplateSource, guide = 'Exact assembled section reference.') => ({
  templateSource: source, templateGuidance: { guidance_text: guide }, assembly: {
    version: 1, docId: DOC, programId: PROGRAM, templateId: source.id, templateSnapshot: source.sha256, fingerprint: 'b'.repeat(64),
  },
});

async function recordGuidance(id: string, metadata: unknown, source: RecordedTemplateSource | null = templateSource(), doc = DOC) {
  if (source) await jdb.pglite.query('UPDATE authoring_documents SET template_id=$1,provenance=$2::jsonb WHERE id=$3',
    [source.id, JSON.stringify({ source: 'template', templateSource: source }), doc]);
  await jdb.pglite.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,tenant_id,metadata)
    VALUES($1,$2,'CREATE',$3,$4,$5::jsonb)`, [doc, id, AUTHOR.email, ORG, JSON.stringify(metadata)]);
}
const savedMetadata = (source: unknown, guidance = 'Exact saved section instructions.') => ({
  templateSource: source, templateGuidance: { guidance_text: guidance, compliance_checklist: ['Keep the study identity.'] },
});

async function expectDraftRefusal(id: string, code: string, status = 409) {
  const mark = trace.stmts.length;
  // A malformed source selection would otherwise fail at the next boundary.
  const response = await generate(id, { sources: {} });
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.error.code).toBe(code);
  expect(h.prompts).toEqual([]);
  expect(h.searches).toEqual([]);
  expect(trace.stmts.slice(mark).some(row => /(?:FROM vault\.|INSERT INTO (?:ana_turn_records|authoring_ai_draft_candidates)|UPDATE authoring_sections)/i.test(row.sql))).toBe(false);
  expect((await jdb.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE section_id=$1', [id])).rows).toEqual([]);
  expect((await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content).toBe('');
}

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

describe('the existing section draft uses its admitted saved template reference', () => {
  it('sends earliest recorded guidance despite a renamed heading/current reference and seals the actual prompt', async () => {
    const id = await section();
    const source = templateSource();
    const guide = 'Retained guidance: distinguish the assay validation cohort from the clinical cohort.';
    await recordGuidance(id, savedMetadata(source, guide));
    await recordGuidance(id, savedMetadata(source, 'Later CREATE guidance must not replace the original.'));
    await jdb.pglite.query("UPDATE authoring_sections SET title='Renamed device worksheet' WHERE id=$1", [id]);
    await jdb.pglite.query(`INSERT INTO authoring_templates(id,template_name,template_type,tenant_id)
      VALUES($1,'Current template','regulatory',$2) ON CONFLICT DO NOTHING`, [TEMPLATE, ORG]);
    await jdb.pglite.query(`INSERT INTO template_guidance(template_id,section_name,section_code,guidance_text,tenant_id)
      SELECT $1,'Current reference',code,'Current reference must not replace saved guidance.',$2 FROM authoring_sections WHERE id=$3`, [TEMPLATE, ORG, id]);
    const inputs = { tone: 'concise', region: 'FDA', context: 'Validated diagnostic assay.', requirements: 'Keep uncertainty explicit.' };
    const response = await generate(id, inputs);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const prompt = h.prompts[0];
    expect(prompt).toContain(guide);
    expect(prompt).toContain(source.limitations[0]);
    expect(prompt).toContain('Renamed device worksheet');
    expect(prompt).toContain(inputs.context);
    expect(prompt).toContain(inputs.requirements);
    expect(prompt).not.toContain('Later CREATE guidance');
    expect(prompt).not.toContain('Current reference must');
    expect(prompt).toMatch(/reference[^\n]*(?:not|never)[^\n]*evidence/i);
    expect(prompt).not.toContain('compliance-ready');
    const candidate = (await jdb.pglite.query<{ generator: { promptSha256: string }; sources: unknown }>(
      'SELECT generator,sources FROM authoring_ai_draft_candidates WHERE id=$1', [response.body.draft.draftId])).rows[0];
    expect(candidate.generator.promptSha256).toBe(createHash('sha256').update(prompt).digest('hex'));
    expect(JSON.stringify(candidate.sources)).not.toContain(guide);
    const stored = await loadTurnRecord(jdb.pool as never, ORG, response.body.draft.turnRecord.id);
    expect(stored).toBeTruthy();
    expect(verifyStoredTurnRecord(stored!).ok).toBe(true);
    const body = JSON.parse(stored!.recordText) as { modelInput: Array<{ text: { sha256: string } }>; request: { typed: { sha256: string } } };
    expect(stored!.texts.get(body.modelInput[0].text.sha256)).toBe(prompt);
    expect(JSON.parse(stored!.texts.get(body.request.typed.sha256)!)).toMatchObject(inputs);
    expect(h.searches).toHaveLength(1);
    expect((await jdb.pglite.query<{ content: string }>('SELECT content FROM authoring_sections WHERE id=$1', [id])).rows[0].content).toBe('');
  }, T);

  it('uses the assembled section’s Japanese source rather than its different manual FDA parent', async () => {
    const id = await section();
    const source = regionalSource('JP');
    const parent = templateSource({ id: PARENT_TEMPLATE, aiDraftable: false, kind: 'preparation', authoringMode: 'manual', limitations: ['Parent-only official form limit.'] });
    await recordGuidance(id, assemblyMetadata(source, 'Japanese section-specific clinical evidence guidance.'), parent);
    const response = await generate(id, { region: undefined });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.draft.metadata.region).toBe('PMDA');
    expect(h.prompts[0]).toContain('Japanese section-specific clinical evidence guidance.');
    expect(h.prompts[0]).toContain(source.id);
    expect(h.prompts[0]).not.toContain(parent.limitations[0]);
    expect(h.prompts[0]).not.toContain(parent.id);
    // P-73 slice 2: the section's own recorded region governs; the program's US IND does not set its requirements.
    expect(h.prompts[0]).not.toContain('RECEIVING APPLICATION ON RECORD');
    expect(response.body.draft.metadata.submissionType).toBeNull();
  }, T);

  it.each([{ region: 'JP', writing: 'PMDA' }, { region: 'CA', writing: 'Health Canada' }, { region: 'EU', writing: 'EMA' }] as const)(
    'derives $writing only when the saved $region section request omits region', async ({ region, writing }) => {
      const id = await section(); const source = regionalSource(region);
      await recordGuidance(id, savedMetadata(source), source);
      const response = await generate(id, { region: undefined });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.draft.metadata.region).toBe(writing);
      expect(h.prompts[0]).toContain(source.filingContext!.registryId!);
      expect(h.prompts[0]).toContain(`Generate professional ${writing}`);
    }, T);

  it.each(['JP', 'CA', 'EU'] as const)('refuses an explicit FDA conflict with saved %s scope before retrieval/model', async region => {
    const id = await section(); const source = regionalSource(region);
    await recordGuidance(id, savedMetadata(source), source);
    const mark = trace.stmts.length;
    const response = await generate(id, { region: 'FDA' });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('TEMPLATE_REGION_MISMATCH');
    expect(h.searches).toEqual([]); expect(h.prompts).toEqual([]);
    expect(trace.stmts.slice(mark).some(row => /INSERT INTO (?:ana_turn_records|authoring_ai_draft_candidates)/i.test(row.sql))).toBe(false);
  }, T);
});

describe('recorded section reference refusals precede source selection', () => {
  it.each([undefined, 'narrative'])('keeps historical recorded E3 patient CRFs manual despite drafting mode %s', async draftingMode => {
    const id = await section(); const metadata = savedMetadata(templateSource());
    await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance,
      source_reference: 'server/services/ind/ctd/csr-e3-guidance.ts#16.3.1',
      ...(draftingMode ? { drafting_mode: draftingMode } : {}) } });
    await expectDraftRefusal(id, 'TEMPLATE_NOT_DRAFTABLE');
  }, T);

  it('keeps historical recorded E3 synopsis drafting available without a new mode field', async () => {
    const id = await section(); const metadata = savedMetadata(templateSource());
    await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance,
      source_reference: 'server/services/ind/ctd/csr-e3-guidance.ts#2' } });
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.prompts[0]).toContain('server/services/ind/ctd/csr-e3-guidance.ts#2');
  }, T);

  it.each(['other/csr-e3-guidance.ts#16.3.1', 'server/services/ind/ctd/csr-e3-guidance.ts#17'])(
    'does not infer a historical E3 policy from an unrelated or unknown reference %s', async reference => {
      const id = await section(); const metadata = savedMetadata(templateSource());
      await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance, source_reference: reference } });
      const response = await generate(id);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
    }, T);
});

describe('explicit saved section drafting modes precede source selection', () => {
  it('refuses a saved manual section policy even when the parent is narrative', async () => {
    const id = await section(); const metadata = savedMetadata(templateSource());
    await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance, drafting_mode: 'manual' } });
    await expectDraftRefusal(id, 'TEMPLATE_NOT_DRAFTABLE');
  }, T);

  it('refuses an unknown present saved drafting mode instead of losing its restriction', async () => {
    const id = await section(); const metadata = savedMetadata(templateSource());
    await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance, drafting_mode: 'anything' } });
    const guide = await author(request(app).get(`/api/authoring/guidance/${id}`));
    expect(guide.status, JSON.stringify(guide.body)).toBe(503);
    await expectDraftRefusal(id, 'TEMPLATE_REFERENCE_UNAVAILABLE', 503);
  }, T);

  it('retains an explicit narrative section mode in the exact prompt without upgrading it to evidence', async () => {
    const id = await section(); const metadata = savedMetadata(templateSource());
    await recordGuidance(id, { ...metadata, templateGuidance: { ...metadata.templateGuidance, drafting_mode: 'narrative' } });
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.prompts[0]).toMatch(/"drafting_mode"\s*:\s*"narrative"/);
  }, T);

  it.each([{ aiDraftable: false }, { kind: 'preparation' }, { authoringMode: 'manual' }] as const)(
    'honors a recorded automatic-drafting limit %j before selected-source reads', async limit => {
      const id = await section(); const source = templateSource(limit);
      await recordGuidance(id, savedMetadata(source), source);
      await expectDraftRefusal(id, 'TEMPLATE_NOT_DRAFTABLE');
    }, T);

  it('refuses an otherwise well-formed assembly receipt for a different saved program', async () => {
    const id = await section(); const metadata = assemblyMetadata(templateSource()); metadata.assembly.programId = OTHER_PROGRAM;
    await recordGuidance(id, metadata, null);
    await expectDraftRefusal(id, 'TEMPLATE_REFERENCE_UNAVAILABLE', 503);
  }, T);

  it('refuses an assembly receipt on a standalone section instead of inventing a program', async () => {
    const id = await section(UNBOUND_DOC); const metadata = assemblyMetadata(templateSource()); metadata.assembly.docId = UNBOUND_DOC;
    await recordGuidance(id, metadata, null, UNBOUND_DOC);
    await expectDraftRefusal(id, 'TEMPLATE_REFERENCE_UNAVAILABLE', 503);
  }, T);

  it.each([{ templateGuidance: null }, { templateGuidance: { guidance_text: 17 } }, { templateSource: { id: OTHER_PROGRAM } }])(
    'refuses malformed present saved metadata %j rather than dropping its reference', async change => {
      const id = await section(); await recordGuidance(id, { ...savedMetadata(templateSource()), ...change });
      await expectDraftRefusal(id, 'TEMPLATE_REFERENCE_UNAVAILABLE', 503);
    }, T);
});

describe('legacy and reference-only scope stays honest in the same draft route', () => {
  it('keeps legacy identity-only guidance useful without inventing complete source fields', async () => {
    const id = await section();
    await jdb.pglite.query('UPDATE authoring_documents SET template_id=$1 WHERE id=$2', [TEMPLATE, DOC]);
    await recordGuidance(id, savedMetadata({ id: TEMPLATE }, 'Historical section reference.'), null);
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.draft.metadata.region).toBe('FDA');
    expect(h.prompts[0]).toContain('Historical section reference.');
    expect(h.prompts[0]).toContain('identity-only');
    expect(h.prompts[0]).not.toContain('registry:US_IND');
    expect(h.prompts[0]).not.toMatch(/"aiDraftable"\s*:\s*true/);
  }, T);

  it('honors an explicit legacy partial-source limit without upgrading its verification', async () => {
    const id = await section();
    await jdb.pglite.query('UPDATE authoring_documents SET template_id=$1 WHERE id=$2', [TEMPLATE, DOC]);
    await recordGuidance(id, savedMetadata({ id: TEMPLATE, aiDraftable: false }), null);
    await expectDraftRefusal(id, 'TEMPLATE_NOT_DRAFTABLE');
  }, T);

  it.each(['FDA', 'EMA'])('keeps GLOBAL guidance separate from the explicit %s writing preference', async region => {
    const id = await section(); const source = templateSource({ entryId: 'component:shared-plan',
      filingContext: { registryId: null, region: 'GLOBAL', agency: 'Reference standards' } });
    await recordGuidance(id, savedMetadata(source, 'Shared laboratory plan guidance.'), source);
    const response = await generate(id, { region });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.draft.metadata.region).toBe(region);
    expect(h.prompts[0]).toContain('Shared laboratory plan guidance.');
    expect(h.prompts[0]).toMatch(/GLOBAL[\s\S]*(?:not|no)[\s\S]*jurisdiction/i);
  }, T);

  it('requires a writing region for GLOBAL guidance without choosing FDA implicitly', async () => {
    const id = await section(); const source = templateSource({ entryId: 'component:shared-plan',
      filingContext: { registryId: null, region: 'GLOBAL', agency: 'Reference standards' } });
    await recordGuidance(id, savedMetadata(source, 'Shared laboratory plan guidance.'), source);
    const response = await generate(id, { region: undefined });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error.code).toBe('DRAFT_REGION_REQUIRED');
    expect(h.prompts).toEqual([]);
    expect(h.searches).toEqual([]);
    expect((await jdb.pglite.query('SELECT id FROM authoring_ai_draft_candidates WHERE section_id=$1', [id])).rows).toEqual([]);
  }, T);

  it('allows ad-hoc drafting with an honest unverified reference state', async () => {
    const response = await generate(await section());
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.draft.metadata.region).toBe('FDA');
    expect(h.prompts[0]).toMatch(/not-recorded|unverified|unconfirmed/i);
  }, T);

  it('retains an empty exact guidance gap without substituting another section', async () => {
    const id = await section(); await recordGuidance(id, savedMetadata(templateSource(), ''));
    const response = await generate(id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.prompts[0]).toMatch(/not-recorded|unavailable|missing|no recorded/i);
  }, T);

  it('refuses a mandatory non-ASCII reference exceeding 16 KiB instead of clipping limits', async () => {
    const id = await section(); const source = templateSource({ limitations: ['資料'.repeat(4000)] });
    await recordGuidance(id, savedMetadata(source), source);
    await expectDraftRefusal(id, 'TEMPLATE_REFERENCE_TOO_LARGE');
  }, T);
});
