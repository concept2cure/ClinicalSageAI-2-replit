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
  app = makeApp(router, { dbClient: db.pool });
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

/** Two late-cut reports remain two documents. These are synthetic saved jobs
 * and cut receipts, not a live clinical-source freeze, model run or approval. */
interface Cut {
  documentId: string;
  studyDataId: string;
  sourceDocumentId: string;
  sourceSha: string;
  dataCutDate: string;
  disposition: string;
  jobId: number;
}
const collaborator = { id: '9', email: 'collaborator@canvas.example', name: 'Casey Collaborator' };
let colleague: (r: request.Test) => request.Test;
let initial: Cut;
let later: Cut;

async function savedBuild(documentId: string, studyDataId: string, disposition: string): Promise<number> {
  const job = await one<{ id: number }>(`INSERT INTO csr_build_jobs
    (organization_id,project_id,study_id,status,progress,sections_to_generate,requested_by,study_info_snapshot)
    VALUES($1,42,'SYN-201','complete',100,ARRAY['10.1'],$2,$3) RETURNING id`,
  [ORG, Number(AUTHOR.id), JSON.stringify({ studyInfo: { title: 'SYN-201 Phase 2', protocolNumber: 'SYN-201' },
    evidenceSource: { programId: PROGRAM, runId: studyDataId, studyId: 'SYN-201' } })]);
  await db.pool.query(`INSERT INTO csr_section_outputs
    (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model,
     review_status,reviewer_id,reviewed_content_hash,review_decided_at)
    VALUES($1,42,$2,'10.1',$3,$4,true,NULL,'approved',$5,$4,'2026-11-05T09:00:00Z')`,
  [ORG, job.id, disposition, hash(disposition), REVIEWER]);
  const binding = await one<{ authoring_document_id: string }>(`SELECT s.authoring_document_id::text FROM csr_build_jobs j
    JOIN csr_study_data s ON s.study_data_id::text=j.source_run_id AND s.organization_id=j.organization_id
    WHERE j.id=$1 AND j.organization_id=$2`, [job.id, ORG]);
  expect(binding.authoring_document_id).toBe(documentId);
  return Number(job.id);
}

async function savedCut(label: string, dataCutDate: string, disposition: string): Promise<Cut> {
  const created = await author(request(app).post('/api/authoring/docs')).send({
    title: `SYN-201 CSR — ${label}`, module: 'M5', template_id: CSR_TEMPLATE, client_program_id: PROGRAM,
  });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const documentId = String(created.body.data?.id ?? created.body.document?.id ?? created.body.id);
  expect(documentId).toMatch(/^[0-9a-f-]{36}$/);
  const studyDataId = randomUUID();
  const sourceDocumentId = randomUUID();
  const sourceSha = hash(`SYNTHETIC ${dataCutDate}: ${disposition}`);
  const snapshot = { organizationId: ORG, programId: PROGRAM, authoringDocumentId: documentId,
    clinicalSourceReceipts: [{ documentId: sourceDocumentId, documentTitle: `SYN-201 source — ${label}`,
      version: label, sha256: sourceSha, dataCutDate, studyId: 'SYN-201', protocolNumber: 'SYN-201',
      clinicalVerification: 'not-established' }] };
  // The ordinary immutable table is used. This fixture does not pretend to
  // exercise the Vault-byte loader or manufacture a clinical source approval.
  await db.pool.query(`INSERT INTO csr_study_data
    (study_data_id,organization_id,program_id,authoring_document_id,input_snapshot,input_digest,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)`,
  [studyDataId, ORG, PROGRAM, documentId, JSON.stringify(snapshot), hash(JSON.stringify(snapshot)), Number(AUTHOR.id)]);
  return { documentId, studyDataId, sourceDocumentId, sourceSha, dataCutDate, disposition,
    jobId: await savedBuild(documentId, studyDataId, disposition) };
}

const cutSource = (cut: Pick<Cut, 'jobId'>) => ({ kind: 'csr', jobId: cut.jobId, sectionNumbers: ['10.1'], approvedOnly: true });
const requestImport = (cut: Pick<Cut, 'jobId'>, targetDocumentId: string, extra: Record<string, unknown>) =>
  importInto({ source: cutSource(cut), targetDocumentId, ...extra });

async function retained(documentId: string) {
  return one(`SELECT
    (SELECT to_jsonb(d) FROM authoring_documents d WHERE d.id=$1 AND d.tenant_id=$2) AS document,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM authoring_sections s WHERE s.doc_id=$1 AND s.tenant_id=$2) AS sections,
    (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM doc_revisions r JOIN authoring_sections s ON s.id=r.section_id AND s.tenant_id=r.tenant_id
      WHERE s.doc_id=$1 AND s.tenant_id=$2) AS revisions,
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM authoring_audit_trail a WHERE a.doc_id=$1 AND a.tenant_id=$2) AS receipts,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM document_span_lineage l JOIN authoring_sections s
      ON s.id::text=l.document_id AND s.tenant_id=l.organization_id
      WHERE l.document_table='authoring_sections' AND s.doc_id=$1 AND s.tenant_id=$2) AS lineage,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.study_data_id) FROM csr_study_data c
      WHERE c.authoring_document_id=$1 AND c.organization_id=$2) AS cuts`, [documentId, ORG]);
}

describe('two CSR documents in one project retain their own cuts and imports', () => {
  beforeAll(async () => {
    await db.pool.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)', [Number(collaborator.id), collaborator.name, collaborator.email]);
    await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(collaborator.id)]);
    await db.pool.query("INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(42,$1,$2,'use','active')", [ORG, Number(collaborator.id)]);
    colleague = asToken(await new SignJWT({ userId: collaborator.id, email: collaborator.email, organizationId: ORG, role: 'member' })
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
    initial = await savedCut('initial cut', '2026-09-30', 'At the initial data cut, 21 of 23 randomized participants completed the study.');
    later = await savedCut('later cut', '2026-10-31', 'At the later data cut, 22 of 23 randomized participants completed the study.');
  }, 60_000);

  it('imports each approved job into its own CSR-template document with a distinct frozen cut and retained origin', async () => {
    expect(initial.documentId).not.toBe(later.documentId);
    expect(initial.studyDataId).not.toBe(later.studyDataId);
    expect(initial.jobId).not.toBe(later.jobId);
    const before = await counts();
    for (const cut of [initial, later]) {
      const p = await requestImport(cut, cut.documentId, { previewOnly: true });
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      const written = await requestImport(cut, cut.documentId, { expectedFingerprint: p.body.data.fingerprint, reason });
      expect(written.status, JSON.stringify(written.body)).toBe(200);
      expect(outcomes(written.body)).toEqual({ '10.1': 'written' });
      const doc = await one<{ client_program_id: string; template_id: string; provenance: { importSource: { id: string } } }>(
        'SELECT client_program_id::text,template_id::text,provenance FROM authoring_documents WHERE id=$1 AND tenant_id=$2', [cut.documentId, ORG]);
      expect(doc).toMatchObject({ client_program_id: PROGRAM, template_id: CSR_TEMPLATE,
        provenance: { importSource: { kind: 'csr', id: String(cut.jobId) } } });
      const saved = await section('10.1', cut.documentId);
      expect(saved.content).toContain(cut.disposition);
      const receipts = (await db.pglite.query<{ imported: { jobId: number | string } }>(`SELECT metadata->'csrBuildImport' AS imported FROM authoring_audit_trail
        WHERE doc_id=$1 AND tenant_id=$2 AND operation_type IN ('UPDATE','CSR_IMPORT') AND metadata ? 'csrBuildImport'`, [cut.documentId, ORG])).rows;
      expect(receipts).toHaveLength(2);
      expect(receipts.every(row => Number(row.imported.jobId) === cut.jobId)).toBe(true);
      const { listCsrStudyData } = await import('../../services/csr/csr-study-data');
      const cuts = await listCsrStudyData(db.pool as never, { organizationId: ORG, programId: PROGRAM, userId: Number(AUTHOR.id) }, cut.documentId);
      expect(cuts).toHaveLength(1);
      expect(cuts[0]).toMatchObject({ studyDataId: cut.studyDataId, via: 'this-document', sources: [{ documentId: cut.sourceDocumentId,
        sha256: cut.sourceSha, dataCutDate: cut.dataCutDate, clinicalVerification: 'not-established' }] });
    }
    expect((await counts()).docs).toBe(before.docs);
    expect((await counts()).revisions).toBe(before.revisions + 2);
    expect((await section('10.1', initial.documentId)).id).not.toBe((await section('10.1', later.documentId)).id);
  });

  it('refuses either cut in the other CSR and retains both documents, revisions, lineage, snapshots and receipts exactly', async () => {
    const before = [await retained(initial.documentId), await retained(later.documentId)];
    const countBefore = await counts();
    for (const [cut, wrongDocumentId] of [[initial, later.documentId], [later, initial.documentId]] as const) {
      const valid = await requestImport(cut, cut.documentId, { previewOnly: true });
      expect(valid.status).toBe(200);
      for (const extra of [{ previewOnly: true }, { expectedFingerprint: valid.body.data.fingerprint, reason }]) {
        const refused = await requestImport(cut, wrongDocumentId, extra);
        expect(refused.status, JSON.stringify(refused.body)).toBe(409);
        expect(refused.body.error).toBe('IMPORT_TARGET_STUDY_DATA_MISMATCH');
        expect([await retained(initial.documentId), await retained(later.documentId)]).toEqual(before);
      }
    }
    expect(await counts()).toEqual(countBefore);
  });

  it('refuses a second build of the same frozen cut after the first import, without replacing the original origin', async () => {
    const secondBuild = { jobId: await savedBuild(initial.documentId, initial.studyDataId,
      'A second synthetic build of the initial cut must not replace its retained report.') };
    // A source-only preview is a read; it supplies the exact second build's
    // fingerprint without creating a copy or bypassing target admission.
    const sourcePreview = await importInto({ source: cutSource(secondBuild), previewOnly: true });
    expect(sourcePreview.status, JSON.stringify(sourcePreview.body)).toBe(200);
    const before = [await retained(initial.documentId), await retained(later.documentId)];
    const countBefore = await counts();
    for (const extra of [{ previewOnly: true }, { expectedFingerprint: sourcePreview.body.data.fingerprint, reason }]) {
      const refused = await requestImport(secondBuild, initial.documentId, extra);
      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.error).toBe('IMPORT_TARGET_BOUND_TO_OTHER_BUILD');
      expect([await retained(initial.documentId), await retained(later.documentId)]).toEqual(before);
    }
    expect(await counts()).toEqual(countBefore);
  });

  it('says which build a document holds imported sections from, so the build section can open on it', async () => {
    const { csrBuildOfDocument } = await import('../../services/authoring/csr-import-into-document');
    expect(await csrBuildOfDocument(db.pool as never, ORG, PROGRAM, initial.documentId)).toBe(initial.jobId);
    expect(await csrBuildOfDocument(db.pool as never, ORG, PROGRAM, later.documentId)).toBe(later.jobId);
    // Another organization, another project, and a document that holds no imported section: none.
    expect(await csrBuildOfDocument(db.pool as never, ORG + 1, PROGRAM, initial.documentId)).toBeNull();
    expect(await csrBuildOfDocument(db.pool as never, ORG, randomUUID(), initial.documentId)).toBeNull();
    const blank = await author(request(app).post('/api/authoring/docs')).send({ title: 'A CSR nothing was imported into', module: 'M5',
      template_id: CSR_TEMPLATE, client_program_id: PROGRAM });
    expect(await csrBuildOfDocument(db.pool as never, ORG, PROGRAM, String(blank.body.data?.id ?? blank.body.document?.id ?? blank.body.id))).toBeNull();
  });

});

describe('collaborators share the existing CSR with current document and project grants', () => {
  it('lets two authorized collaborators open the same CSR and exact sections, without importing another copy', async () => {
    await db.pool.query(`INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,email,role,granted_by,grant_reason)
      VALUES($1,$2,$3,$4,'AUTHOR',$5,'Collaborate on this existing synthetic CSR')`,
    [initial.documentId, ORG, collaborator.id, collaborator.email, AUTHOR.id]);
    const before = await retained(initial.documentId);
    const countBefore = await counts();
    const opened: Array<{ id: string; sections: Array<{ id: string; doc_id: string; code: string; content: string }> }> = [];
    for (const actor of [author, colleague]) {
      const doc = await actor(request(app).get(`/api/authoring/docs/${initial.documentId}`)).query({ programId: PROGRAM });
      expect(doc.status, JSON.stringify(doc.body)).toBe(200);
      expect(doc.body.document).toMatchObject({ id: initial.documentId, client_program_id: PROGRAM,
        provenance: { importSource: { kind: 'csr', id: String(initial.jobId) } } });
      const sections = await actor(request(app).get(`/api/authoring/docs/${initial.documentId}/sections`)).query({ programId: PROGRAM });
      expect(sections.status, JSON.stringify(sections.body)).toBe(200);
      expect(sections.body.sections.find((s: { code: string }) => s.code === '10.1').content).toContain(initial.disposition);
      expect(sections.body.sections.every((s: { doc_id: string }) => s.doc_id === initial.documentId)).toBe(true);
      opened.push({ id: doc.body.document.id, sections: sections.body.sections });
    }
    expect(opened[1]).toEqual(opened[0]);
    // Project 'use' permits the read above, but a document AUTHOR grant does
    // not elevate it into project editing. The current native edit grant is
    // required even for the source preview of a planned import.
    const previewBody = { programId: PROGRAM, source: cutSource(initial), targetDocumentId: initial.documentId, previewOnly: true };
    const readOnlyProject = await colleague(request(app).post('/api/authoring/import/source')).send(previewBody);
    expect(readOnlyProject.status, JSON.stringify(readOnlyProject.body)).toBe(403);
    expect(readOnlyProject.body.error).toBe('PROJECT_PERMISSION_DENIED');
    expect(await retained(initial.documentId)).toEqual(before);
    await db.pool.query("UPDATE project_members SET role='edit' WHERE project_id=42 AND organization_id=$1 AND user_id=$2", [ORG, Number(collaborator.id)]);
    const previewByColleague = await colleague(request(app).post('/api/authoring/import/source')).send({
      programId: PROGRAM, source: cutSource(initial), targetDocumentId: initial.documentId, previewOnly: true });
    expect(previewByColleague.status, JSON.stringify(previewByColleague.body)).toBe(200);
    expect(outcomes(previewByColleague.body)).toEqual({ '10.1': 'unchanged' });
    expect(await retained(initial.documentId)).toEqual(before);
    expect(await counts()).toEqual(countBefore);
  });

  it('does not turn a shared CSR into access to another report, and rechecks a revoked document grant', async () => {
    const before = [await retained(initial.documentId), await retained(later.documentId)];
    const hidden = await colleague(request(app).get(`/api/authoring/docs/${later.documentId}`)).query({ programId: PROGRAM });
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(404);
    expect(hidden.body.document).toBeUndefined();
    await db.pool.query(`UPDATE doc_permissions SET revoked_at=NOW(),revoked_by=$3,revoke_reason='Synthetic collaboration ended'
      WHERE doc_id=$1 AND tenant_id=$2 AND principal_id=$4`, [initial.documentId, ORG, AUTHOR.id, collaborator.id]);
    for (const suffix of ['', '/sections']) {
      const revoked = await colleague(request(app).get(`/api/authoring/docs/${initial.documentId}${suffix}`)).query({ programId: PROGRAM });
      expect(revoked.status, JSON.stringify(revoked.body)).toBe(404);
      expect(revoked.body.document).toBeUndefined();
      expect(revoked.body.sections).toBeUndefined();
    }
    expect([await retained(initial.documentId), await retained(later.documentId)]).toEqual(before);
  });
});
