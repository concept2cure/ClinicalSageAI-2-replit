/**
 * F6 of the 2026-11-02 CSR demo walk: a CSR build's approved headings are imported into the CSR document the build
 * was started from, by ICH E3 number, and no second document is created (csr-import-into-document.ts). The CSR
 * document is made the way the editor makes it (POST /api/authoring/docs from the CSR template), its study data is
 * frozen for it, and the build is bound to that study data. Real migrations in PGlite; SYNTHETIC data.
 */
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHORING_ACCESS_DDL, AUTHOR, PROGRAM, PROGRAM_B, ORG, OTHER_ORG, JWT_SECRET, makeApp, asToken } from './_authoring-canvas-fixture';
import { builtinAuthoringTemplateId } from '../../services/authoring/builtin-authoring-templates';

/** The CSR template's id, as the editor's New document sends it (builtin-authoring-templates.ts). */
const CSR_TEMPLATE = builtinAuthoringTemplateId('component:clinical_study_report');

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));

let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let csrDoc: string;
let jobId: number;
const STUDY_DATA = randomUUID();
const REVIEWER = 6;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const reason = 'Bring the approved CSR headings into this document';
const DISPOSITION = 'Of 23 randomized participants, 21 completed the study.';
const EFFICACY = 'Global cure occurred in 10 of 12 participants on study treatment.';
const CHANGES = '[DATA TO BE INSERTED]\n\nChanges to the conduct of the study after it began: [list each protocol amendment].';

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
    'migrations/20261031_csr_study_data.sql',
  ], testOnlySql: `CREATE TABLE client_workspaces(id integer PRIMARY KEY,organization_id integer);` });
  h.db = db.db; h.pool = db.pool;
  author = asToken(await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'member' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
  // The CSR document, from the CSR template, as Project → New document makes it.
  const created = await author(request(app).post('/api/authoring/docs')).send({ title: 'SYN-201 Clinical Study Report', module: 'M5',
    template_id: CSR_TEMPLATE, client_program_id: PROGRAM });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  csrDoc = created.body.data?.id ?? created.body.document?.id ?? created.body.id;
  expect(csrDoc).toMatch(/^[0-9a-f-]{36}$/);
  // Its study data, frozen for it; the build is drafted over that study data.
  await db.pool.query(`INSERT INTO csr_study_data (study_data_id, organization_id, program_id, authoring_document_id, input_snapshot, input_digest, created_by)
    VALUES ($1, $2, $3, $4, '{"clinicalSourceReceipts": []}', $5, $6)`, [STUDY_DATA, ORG, PROGRAM, csrDoc, 'f'.repeat(64), Number(AUTHOR.id)]);
  await db.pglite.query(`INSERT INTO users(id,name,email) VALUES(${REVIEWER},'Rhea Reviewer','rhea@example.test') ON CONFLICT(id) DO NOTHING`);
  jobId = (await db.pglite.query<{ id: number }>(`INSERT INTO csr_build_jobs(organization_id,project_id,study_id,status,progress,sections_to_generate,requested_by,study_info_snapshot)
    VALUES($1,42,'SYN-201','complete',100,ARRAY['9.8','10.1','11.4.1'],$2,$3) RETURNING id`, [ORG, Number(AUTHOR.id),
    JSON.stringify({ studyInfo: { title: 'SYN-201 Phase 2', protocolNumber: 'SYN-201' }, evidenceSource: { programId: PROGRAM, runId: STUDY_DATA, studyId: 'SYN-201' } })])).rows[0].id;
  for (const [code, content, ai] of [['9.8', CHANGES, false], ['10.1', DISPOSITION, true], ['11.4.1', EFFICACY, true]] as const) {
    await db.pool.query(`INSERT INTO csr_section_outputs(organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model,
        review_status,reviewer_id,reviewed_content_hash,review_decided_at)
      VALUES($1,42,$2,$3,$4,$5,$6,NULL,'approved',$7,$5,'2026-11-05T09:00:00Z')`, [ORG, jobId, code, content, hash(content), ai, REVIEWER]);
  }
}, 180_000);
afterAll(async () => { await db?.close(); });

const source = (codes = ['10.1', '11.4.1', '9.8']) => ({ kind: 'csr' as const, jobId, sectionNumbers: codes, approvedOnly: true as const });
const importInto = (body: Record<string, unknown>) => author(request(app).post('/api/authoring/import/source')).send({ programId: PROGRAM, ...body });
async function preview(targetDocumentId = csrDoc, codes?: string[]) {
  return importInto({ source: source(codes), targetDocumentId, previewOnly: true });
}
async function write(targetDocumentId = csrDoc, codes?: string[]) {
  const p = await preview(targetDocumentId, codes);
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  return importInto({ source: source(codes), targetDocumentId, expectedFingerprint: p.body.data.fingerprint, reason });
}
/** One row of a fixture read, typed by the caller. */
async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.pool.query(sql, params)).rows[0] as T;
}
async function counts() {
  return one<{ docs: number; revisions: number; audits: number }>(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
    (SELECT count(*) FROM doc_revisions)::int AS revisions, (SELECT count(*) FROM authoring_audit_trail)::int AS audits`);
}
const section = async (code: string, doc = csrDoc) => one<{ id: string; content: string }>(
  'SELECT id::text, content FROM authoring_sections WHERE doc_id = $1 AND code = $2', [doc, code]);
const outcomes = (body: { data: { sections: Array<{ code: string; outcome: string; placeholder: boolean }> } }) =>
  Object.fromEntries(body.data.sections.map(s => [s.code, s.outcome]));

describe('a CSR build’s approved headings, imported into the CSR document it was started from', () => {
  it('previews, then writes each heading into the matching section of this document, and creates no document', async () => {
    const before = await counts();
    const p = await preview();
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.body.data).toMatchObject({ preview: true, into: { documentId: csrDoc } });
    expect(outcomes(p.body)).toEqual({ '9.8': 'will-write', '10.1': 'will-write', '11.4.1': 'will-write' });
    expect(await counts()).toEqual(before);

    const written = await importInto({ source: source(), targetDocumentId: csrDoc, expectedFingerprint: p.body.data.fingerprint, reason });
    expect(written.status, JSON.stringify(written.body)).toBe(200);
    expect(outcomes(written.body)).toEqual({ '9.8': 'written', '10.1': 'written', '11.4.1': 'written' });
    expect(written.body.data.sections.find((s: { code: string }) => s.code === '9.8').placeholder).toBe(true);
    const after = await counts();
    expect(after.docs).toBe(before.docs);
    expect(after.revisions).toBe(before.revisions + 3);
    expect((await section('10.1')).content).toContain(DISPOSITION);

    // The editor's revision path: a ledger revision, a Part 11 row with the reason and the approval, machine lineage.
    const disposition = await section('10.1');
    const revision = await one<{ id: string; origin: string; content_sha256: string }>(`SELECT id::text, origin, content_sha256 FROM doc_revisions WHERE section_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [disposition.id]);
    expect(revision).toMatchObject({ origin: 'ai-draft-accept', content_sha256: hash(disposition.content) });
    const audit = await one<{ change_reason: string; metadata: { csrBuildImport: unknown } }>(`SELECT change_reason, metadata FROM authoring_audit_trail WHERE section_id = $1 AND operation_type = 'UPDATE' ORDER BY created_at DESC LIMIT 1`, [disposition.id]);
    expect(audit.change_reason).toBe(reason);
    expect(audit.metadata.csrBuildImport).toMatchObject({ jobId, sectionNumber: '10.1', revisionId: revision.id, reviewer: 'Rhea Reviewer',
      statement: `Imported from CSR build ${jobId}, §10.1, heading approved by Rhea Reviewer at 2026-11-05T09:00:00.000Z.` });
    const spans = await one<{ n: number }>(`SELECT count(*)::int AS n FROM document_span_lineage WHERE document_table = 'authoring_sections' AND document_id = $1
      AND machine_author_id = 'workflow_import'`, [disposition.id]);
    expect(spans.n).toBeGreaterThan(0);
    // The document names the import as a working copy does, so the CSR readers that follow importSource find the build.
    const doc = await one<{ provenance: { importSource: unknown } }>('SELECT provenance FROM authoring_documents WHERE id = $1', [csrDoc]);
    expect(doc.provenance.importSource).toMatchObject({ kind: 'csr', id: String(jobId), reason });

    // Importing again changes nothing: each section already holds its approved text.
    const again = await write();
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(outcomes(again.body)).toEqual({ '9.8': 'unchanged', '10.1': 'unchanged', '11.4.1': 'unchanged' });
    expect((await counts()).revisions).toBe(after.revisions);
  });

  it('leaves a section a person edited untouched, and says so', async () => {
    const efficacy = await section('11.4.1');
    const edited = await author(request(app).patch(`/api/authoring/sections/${efficacy.id}`)).send({
      content: '<p>Global cure occurred in 10 of 12 participants; the medical writer added the analysis set.</p>', changeReason: 'Medical writer clarified the analysis set' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    // The build's §11.4.1 is redrafted and approved again: its new text would replace the template, never this edit.
    const redraft = 'Global cure occurred in 10 of 12 participants (83.3%).';
    await db.pool.query(`UPDATE csr_section_outputs SET content = $1, content_hash = $2, reviewed_content_hash = $2 WHERE job_id = $3 AND section_number = '11.4.1'`,
      [redraft, hash(redraft), jobId]);
    const result = await write();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(outcomes(result.body)['11.4.1']).toBe('edited');
    expect((await section('11.4.1')).content).toContain('the medical writer added the analysis set');
  });

  it('refuses a heading whose approval was revoked, or whose saved text changed after its approval, and writes nothing', async () => {
    const p = await preview();
    expect(p.status).toBe(200);
    const before = await counts();
    await db.pool.query(`UPDATE csr_section_outputs SET review_status = 'in_review' WHERE job_id = $1 AND section_number = '10.1'`, [jobId]);
    try {
      const revoked = await importInto({ source: source(), targetDocumentId: csrDoc, expectedFingerprint: p.body.data.fingerprint, reason });
      expect(revoked.status).toBe(409);
      expect(revoked.body.error).toBe('WORKFLOW_CSR_APPROVAL_REQUIRED');
    } finally {
      await db.pool.query(`UPDATE csr_section_outputs SET review_status = 'approved' WHERE job_id = $1 AND section_number = '10.1'`, [jobId]);
    }
    const changed = 'Of 23 randomized participants, 20 completed the study.';
    await db.pool.query(`UPDATE csr_section_outputs SET content = $1, content_hash = $2 WHERE job_id = $3 AND section_number = '10.1'`, [changed, hash(changed), jobId]);
    try {
      const stale = await importInto({ source: source(), targetDocumentId: csrDoc, expectedFingerprint: p.body.data.fingerprint, reason });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('WORKFLOW_CSR_APPROVAL_REQUIRED');
    } finally {
      await db.pool.query(`UPDATE csr_section_outputs SET content = $1, content_hash = $2 WHERE job_id = $3 AND section_number = '10.1'`, [DISPOSITION, hash(DISPOSITION), jobId]);
    }
    expect(await counts()).toEqual(before);
  });

  it('refuses, by name, a target in another organization, in another project, or whose study data is not the build’s', async () => {
    const foreign = randomUUID();
    await db.pool.query(`INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id, locale)
      VALUES ($1, 'Other organization CSR', 'M5', 'draft', $2, $3, $4, 'en-US')`, [foreign, AUTHOR.id, OTHER_ORG, PROGRAM]);
    const other = await author(request(app).post('/api/authoring/docs')).send({ title: 'Another project CSR', module: 'M5',
      template_id: CSR_TEMPLATE, client_program_id: PROGRAM_B });
    const otherProject = other.body.data?.id ?? other.body.document?.id ?? other.body.id;
    const unbound = await author(request(app).post('/api/authoring/docs')).send({ title: 'A second CSR in this project', module: 'M5',
      template_id: CSR_TEMPLATE, client_program_id: PROGRAM });
    const unboundDoc = unbound.body.data?.id ?? unbound.body.document?.id ?? unbound.body.id;
    const before = await counts();
    for (const [target, status, code] of [[foreign, 404, 'IMPORT_TARGET_NOT_FOUND'], [otherProject, 409, 'IMPORT_TARGET_OTHER_PROJECT'],
      [unboundDoc, 409, 'IMPORT_TARGET_STUDY_DATA_MISMATCH']] as const) {
      const refused = await preview(target);
      expect(refused.status, `${code}: ${JSON.stringify(refused.body)}`).toBe(status);
      expect(refused.body.error).toBe(code);
    }
    expect(await counts()).toEqual(before);
  });

  it('keeps the CSR scientific review’s study data, and puts the imported text under the release controls of an import', async () => {
    const { listCsrStudyData } = await import('../../services/csr/csr-study-data');
    const offered = await listCsrStudyData(db.pool as never, { organizationId: ORG, programId: PROGRAM, userId: Number(AUTHOR.id) } as never, csrDoc);
    expect(offered.map(entry => [entry.studyDataId, entry.via])).toEqual([[STUDY_DATA, 'this-document']]);

    const { verifyWorkflowImportWorkingCopy } = await import('../../services/authoring/workflow-import-governance');
    const doc = await one<{ id: string; provenance: unknown; client_program_id: string }>('SELECT id::text, provenance, client_program_id::text, created_by, title, module, locale, product_code FROM authoring_documents WHERE id = $1', [csrDoc]);
    const sections = (await db.pool.query('SELECT id::text, code, content, title FROM authoring_sections WHERE doc_id = $1 ORDER BY order_index', [csrDoc])).rows as Array<{ id: string; code: string; content: string | null }>;
    const verified = await verifyWorkflowImportWorkingCopy(db.pool, { organizationId: ORG, doc, sections, actor: { id: AUTHOR.id, email: AUTHOR.email } });
    // Machine-drafted text from the build remains: the same hold a working copy has applies to this document.
    expect(verified).toMatchObject({ origin: { kind: 'csr', id: String(jobId) }, knownMachineRemains: true });
  });
});
