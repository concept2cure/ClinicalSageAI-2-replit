/** Actual HTTP/JWT and canonical authoring transactions; no live model or
 * native PostgreSQL concurrency/RLS claim is made by this PGlite fixture. */
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, PROGRAM_B, ORG, JWT_SECRET, makeApp, asToken } from './_authoring-canvas-fixture';
import { readWorkflowImportResult } from '../../../client/src/concept2cure/v2/authoringHandoff';
import type { WorkflowImportSource } from '../../../shared/authoring/source-import';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let jobId: number;
const sourceText = 'Participants received study treatment. Impurity B was <LOQ in all batches.';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const reason = 'Review the retained workflow output in the project editor';

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations: [
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
    'migrations/20260628_csr_job_state.sql',
  ], testOnlySql: `ALTER TABLE projects ADD COLUMN status text DEFAULT 'active';
    CREATE TABLE client_workspaces(id integer PRIMARY KEY,organization_id integer);` });
  h.db = db.db; h.pool = db.pool;
  author = asToken(await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'member' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
  jobId = (await db.pglite.query<{ id: number }>(`INSERT INTO csr_build_jobs(organization_id,project_id,study_id,status,progress,sections_to_generate,requested_by)
    VALUES($1,42,'STUDY-COPY','complete',100,ARRAY['11.1'],$2) RETURNING id`, [ORG, Number(AUTHOR.id)])).rows[0].id;
  await db.pool.query(`INSERT INTO csr_section_outputs(organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model)
    VALUES($1,42,$2,'11.1',$3,$4,true,NULL)`, [ORG, jobId, sourceText, hash(sourceText)]);
}, 180_000);
afterAll(async () => { await db?.close(); });

const body = (): { programId: string; source: WorkflowImportSource } => ({ programId: PROGRAM, source: { kind: 'csr', jobId, sectionNumbers: ['11.1'] } });
async function preview() {
  const response = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), previewOnly: true });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data;
}
async function counts() {
  return (await db.pool.query(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
    (SELECT count(*) FROM authoring_sections)::int AS sections,(SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS audits,(SELECT count(*) FROM document_span_lineage)::int AS spans`)).rows[0];
}

describe('stored CSR output through canonical verified source intake', () => {
  it('previews exact saved selection/model-knownness without creating authoring evidence', async () => {
    const before = await counts();
    const p = await preview();
    expect(p).toMatchObject({ preview: true, origin: { kind: 'csr', id: String(jobId), selection: body().source,
      sectionOrigins: [expect.objectContaining({ originalAuthorship: 'machine', model: null, modelEvidence: 'unrecorded' })] } });
    expect(p.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await counts()).toEqual(before);
  });

  it('creates an unbound draft with machine compositor lineage and unknown original model retained', async () => {
    const p = await preview();
    const response = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason,
      content: 'FORGED PROSE', model: 'forged-qualified-model', status: 'APPROVED', signatureId: 'forged-signature' });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const { doc, sections, origin } = response.body.data;
    expect(doc).toMatchObject({ status: 'draft', module: null, c2c_document_id: null, provenance: { source: 'import', governedWrite: 'unverified' } });
    expect(doc.provenance.moduleDefaulted).toBeUndefined();
    expect(origin.sectionOrigins[0]).toMatchObject({ originalAuthorship: 'machine', model: null });
    expect(sections[0].content).toContain('&lt;LOQ');
    expect(sections[0].content).not.toContain('FORGED');
    const spans = (await db.pglite.query<{ provenance_kind: string; machine_author_id: string; asserted_by: string | null }>(`SELECT provenance_kind,machine_author_id,asserted_by FROM document_span_lineage
      WHERE document_table='authoring_sections' AND document_id=$1 AND organization_id=$2 AND deleted_at IS NULL`, [sections[0].id, ORG])).rows;
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every(s => s.provenance_kind === 'machine_draft' && s.machine_author_id === 'workflow_import' && s.asserted_by === null)).toBe(true);
    const revisions = (await db.pglite.query<{ content_sha256: string; inputs: { contributors: Array<{ id: string }>; importSource: { fingerprint: string; sectionOrigins: Array<{ contentSha256: string; model: string | null }> } } }>('SELECT inputs,content_sha256 FROM doc_revisions WHERE section_id=$1 AND tenant_id=$2', [sections[0].id, ORG])).rows;
    expect(revisions[0].inputs.contributors).toEqual([expect.objectContaining({ id: 'workflow_import' })]);
    expect(revisions[0].inputs.importSource).toMatchObject({ fingerprint: p.fingerprint, sectionOrigins: [expect.objectContaining({ contentSha256: hash(sourceText), model: null })] });
    expect(revisions[0].content_sha256).toBe(hash(sections[0].content));
    expect(revisions[0].content_sha256).not.toBe(hash(sourceText));
    const audits = (await db.pglite.query<{ metadata: { provenance: { importSource: { fingerprint: string } }; workflowSourceOrigin: { model: string | null } } }>('SELECT metadata FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2', [doc.id, ORG])).rows;
    expect(audits[0].metadata.provenance.importSource.fingerprint).toBe(p.fingerprint);
    expect(audits[0].metadata.workflowSourceOrigin.model).toBeNull();
    expect((await db.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM authoring_signatures WHERE doc_id=$1', [doc.id])).rows[0].n).toBe(0);
  });

  it('reopens the exact actor draft without replacing edits', async () => {
    const p = await preview();
    const first = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason });
    expect(first.status).toBe(200);
    const section = first.body.data.sections[0];
    await db.pool.query('UPDATE authoring_sections SET content=$1 WHERE id=$2', ['<p>Existing editor work.</p>', section.id]);
    const before = await counts();
    const reused = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason });
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: first.body.data.doc.id }, sections: [expect.objectContaining({ content: '<p>Existing editor work.</p>' })] });
    expect(await counts()).toEqual(before);
  });

  it('refuses a source changed after preview and preserves all authoring evidence', async () => {
    const p = await preview();
    const before = await counts();
    const changed = 'A different retained source version.';
    await db.pool.query('UPDATE csr_section_outputs SET content=$1,content_hash=$2 WHERE job_id=$3', [changed, hash(changed), jobId]);
    try {
      const response = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('SOURCE_CHANGED');
      expect(await counts()).toEqual(before);
    } finally { await db.pool.query('UPDATE csr_section_outputs SET content=$1,content_hash=$2 WHERE job_id=$3', [sourceText, hash(sourceText), jobId]); }
  });

  it('refuses private-source previews and a different target program before prose/create', async () => {
    const before = await counts();
    const mismatch = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), programId: PROGRAM_B, previewOnly: true });
    expect(mismatch.status).toBe(409);
    await db.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    try {
      const denied = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), previewOnly: true });
      expect(denied.status).toBe(403);
      expect(denied.body.data).toBeUndefined();
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
  });

  it('rolls back workflow copy, origin, genesis, lineage and audits together on a real audit failure', async () => {
    const other = (await db.pglite.query<{ id: number }>(`INSERT INTO csr_build_jobs(organization_id,project_id,study_id,status,progress,sections_to_generate,requested_by)
      VALUES($1,42,'ATOMIC-COPY','complete',100,ARRAY['11.1'],$2) RETURNING id`, [ORG, Number(AUTHOR.id)])).rows[0].id;
    await db.pool.query(`INSERT INTO csr_section_outputs(organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model)
      VALUES($1,42,$2,'11.1',$3,$4,false,NULL)`, [ORG, other, sourceText, hash(sourceText)]);
    const selection = { ...body(), source: { kind: 'csr', jobId: other, sectionNumbers: ['11.1'] } };
    const p = await author(request(app).post('/api/authoring/import/source')).send({ ...selection, previewOnly: true });
    expect(p.status).toBe(200);
    const before = await counts();
    await db.pool.query(`CREATE FUNCTION workflow_import_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.change_reason='Exercise the workflow atomic rollback' THEN RAISE EXCEPTION 'Injected workflow audit failure'; END IF; RETURN NEW; END $$`);
    await db.pool.query('CREATE TRIGGER workflow_import_fail_audit BEFORE INSERT ON authoring_audit_trail FOR EACH ROW EXECUTE FUNCTION workflow_import_fail_audit()');
    try {
      const failed = await author(request(app).post('/api/authoring/import/source')).send({ ...selection, expectedFingerprint: p.body.data.fingerprint, reason: 'Exercise the workflow atomic rollback' });
      expect(failed.status).toBe(500);
      expect(await counts()).toEqual(before);
      expect((await db.pool.query('SELECT content,content_hash FROM csr_section_outputs WHERE job_id=$1', [other])).rows).toEqual([{ content: sourceText, content_hash: hash(sourceText) }]);
    } finally { await db.pool.query('DROP TRIGGER workflow_import_fail_audit ON authoring_audit_trail'); }
  });
});

describe('saved workflow structure can evolve in the existing unbound editor', () => {
  it('reopens the exact reused working copy after a governed section addition and code rename', async () => {
    const p = await preview();
    const first = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const docId = first.body.data.doc.id;
    const original = first.body.data.sections[0];
    const renamed = await author(request(app).patch(`/api/authoring/sections/${original.id}`)).send({ code: 'reviewed.efficacy', title: 'Reviewed efficacy' });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    const added = await author(request(app).post('/api/authoring/sections')).send({ doc_id: docId, code: 'review.notes',
      title: 'Independent review notes', content: '<p>Saved independent reviewer work.</p>' });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const before = await counts();
    const reused = await author(request(app).post('/api/authoring/import/source')).send({ ...body(), expectedFingerprint: p.fingerprint, reason });
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: docId, client_program_id: PROGRAM } });
    const accepted = readWorkflowImportResult(reused.body, PROGRAM, body().source, p);
    expect(accepted).not.toBeNull();
    expect(accepted!.sections.map(section => section.code)).toContain('reviewed.efficacy');
    expect(accepted!.sections).toContainEqual(expect.objectContaining({ code: 'review.notes', content: '<p>Saved independent reviewer work.</p>' }));
    expect(await counts()).toEqual(before);
    expect((await db.pool.query('SELECT content,content_hash FROM csr_section_outputs WHERE job_id=$1', [jobId])).rows)
      .toEqual([{ content: sourceText, content_hash: hash(sourceText) }]);
  });
});
