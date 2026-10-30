/** Real HTTP/JWT and canonical authoring writes over isolated PGlite. The
 * saved-design table is a minimal explicit source fixture; no source parser,
 * projection, current-access decision, importer or writer is mocked. */
import { createHash } from 'node:crypto';
import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_ORG, PROGRAM, PROGRAM_B, PREREQ, JWT_SECRET, asToken, makeApp } from './_authoring-canvas-fixture';
import { newTrace, tappedPool } from './_authoring-record-fixture';
import { projectCrfShell } from '../../services/study-design/crf-shell';
import { savedImportSource, verifySavedWorkflowImport } from '../../services/authoring/import-source-references';
import { materializeWorkflowSource } from '../../services/authoring/workflow-source-import';
import { invalidateOrgMembershipCache } from '../../middleware/orgMembership';
import type { StudyDesign } from '../../services/study-design/study-design-types';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, params?: unknown[]) => (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, params) }));

const STUDY = 'saved-crf-study';
const REASON = 'Prepare the saved blank CRF design for controlled review';
const trace = newTrace();
let db: JourneyDb;
let app: express.Express;
let author: (req: request.Test) => request.Test;
const design: StudyDesign = {
  id: STUDY, programId: PROGRAM, organizationId: ORG, title: 'Recorded CRF study', version: 2, status: 'draft',
  phase: '2', indication: 'Recorded indication', productType: 'drug', objectives: [], estimands: [],
  endpoints: [{ name: 'Recorded response', role: 'primary', type: 'continuous', definition: 'Recorded response measurement', measurementMethod: 'central laboratory', timepoint: 'Week 4' }],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
  population: { targetDescription: 'Adults', analysisPopulations: [], eligibility: [{ type: 'inclusion', text: 'Recorded eligibility criterion' }] },
  arms: [{ name: 'Treatment', interventions: [{ name: 'Recorded treatment', role: 'investigational' }] }],
  statisticalPlan: { alpha: 0.05, power: 0.8, plannedAnalyses: [] },
  scheduleOfActivities: { epochs: [{ id: 'screen', name: 'Screening', kind: 'screening', order: 0 },
    { id: 'treat', name: 'Treatment', kind: 'treatment', order: 1 }],
  visits: [{ id: 'V1', name: 'Screening', epochId: 'screen', order: 0 }, { id: 'V2', name: 'Week 4', epochId: 'treat', order: 1 }],
  activities: [{ id: 'A1', name: 'Recorded response assessment', category: 'efficacy', order: 0, endpointNames: ['Recorded response'] },
    { id: 'A2', name: 'Unlinked assessment', category: 'biomarker', order: 1 }],
  cells: [{ activityId: 'A1', visitId: 'V2', state: 'performed' }, { activityId: 'A2', visitId: 'V1', state: 'performed' }] },
};

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
  ], testOnlySql: `CREATE TABLE cdisc_prm_studies(study_id text,tenant_id integer,program_id uuid,
    protocol_version text,metadata jsonb,updated_at timestamptz);` });
  h.db = db.db;
  h.pool = tappedPool(db, trace);
  author = asToken(await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, organizationId: ORG, role: 'member' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(JWT_SECRET)));
  const requestRouter = express.Router();
  // Match production's existing request-client binding; router verifies real JWT.
  requestRouter.use((req, _res, next) => {
    Object.assign(req, { dbClient: { query: (sql: string, params?: unknown[]) =>
      (h.pool as { query: (text: string, args?: unknown[]) => Promise<unknown> }).query(sql, params) } });
    next();
  });
  requestRouter.use((await import('../authoring.router')).default);
  app = makeApp(requestRouter);
  await db.pool.query(`INSERT INTO cdisc_prm_studies VALUES($1,$2,$3,'2',$4,'2026-10-01')`,
    [STUDY, ORG, PROGRAM, { kind: 'c2c.studyDesign.v1', design }]);
}, 180_000);
afterAll(async () => { await db?.close(); });

const body = (studyId = STUDY, extra: Record<string, unknown> = {}) => ({ programId: PROGRAM, reason: REASON,
  source: { kind: 'study-design-crf', studyId }, ...extra });
const post = (payload: Record<string, unknown>) => author(request(app).post('/api/authoring/import/source')).send(payload);
const preview = (studyId = STUDY) => post(body(studyId, { previewOnly: true }));
async function checkedPreview(studyId = STUDY) {
  const response = await preview(studyId);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type SourceRow = { row: { study_id: string; metadata: unknown; updated_at: string } };
type StoredDoc = { provenance: unknown; client_program_id: string };
type Revision = { content_sha256: string; inputs: { importSource: { fingerprint: string }; contributors: Array<{ id: string }> } };
type Span = { provenance_kind: string; machine_author_id: string; asserted_by: string | null };
type Audit = { change_reason: string; metadata: { provenance: { importSource: unknown } } };
const sourceRows = async () => (await db.pglite.query<SourceRow>('SELECT to_jsonb(s) AS row FROM cdisc_prm_studies s ORDER BY study_id')).rows;
async function counts() {
  return (await db.pool.query(`SELECT (SELECT COUNT(*) FROM authoring_documents)::int AS docs,
    (SELECT COUNT(*) FROM authoring_sections)::int AS sections,(SELECT COUNT(*) FROM doc_revisions)::int AS revisions,
    (SELECT COUNT(*) FROM authoring_audit_trail)::int AS audits,(SELECT COUNT(*) FROM document_span_lineage)::int AS spans,
    (SELECT COUNT(*) FROM doc_permissions)::int AS permissions`)).rows[0];
}
async function seedStudy(id: string, programId: string | null = PROGRAM, tenant = ORG, savedDesign?: unknown) {
  await db.pool.query(`INSERT INTO cdisc_prm_studies VALUES($1,$2,$3,'2',$4,'2026-10-01')`,
    [id, tenant, programId, { kind: 'c2c.studyDesign.v1', design: savedDesign ?? { ...design, id, organizationId: tenant, programId: programId ?? undefined } }]);
}

describe('exact saved-study CRF working copy through the existing authoring route', () => {
  it('previews every projected blank form and preserves exact saved source identity', async () => {
    const response = await preview();
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const result = response.body.data;
    expect(result).toMatchObject({ preview: true, origin: { kind: 'study-design-crf', id: STUDY,
      selection: { kind: 'study-design-crf', studyId: STUDY }, conversion: 'study-design-crf-projection',
      sourceScope: { level: 'program', programId: PROGRAM, projectId: 42 } } });
    expect(result.sections.map((section: { code: string }) => section.code)).toEqual([
      'crf.identification', 'crf.gaps', ...projectCrfShell(design).forms.map((_form, index) => `crf.form.${String(index + 1).padStart(3, '0')}`),
    ]);
    expect((await db.pglite.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM authoring_documents')).rows[0].n).toBe(0);
  });

  it('creates every editable form with honest gaps and canonical source-copy evidence', async () => {
    const original = await sourceRows();
    const p = await checkedPreview();
    const response = await post(body(STUDY, { expectedFingerprint: p.fingerprint,
      title: 'FORGED title', content: 'FORGED patient result', status: 'APPROVED', model: 'FORGED qualified model' }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const { doc, sections, origin, warnings } = response.body.data;
    expect(doc).toMatchObject({ status: 'draft', module: null, c2c_document_id: null,
      client_program_id: PROGRAM, provenance: { source: 'import', governedWrite: 'unverified' } });
    expect(doc.title).not.toBe('FORGED title');
    expect(origin.fingerprint).toBe(p.fingerprint);
    expect(origin.sectionOrigins).toHaveLength(sections.length);
    expect(origin.sectionOrigins.every((s: { originalAuthorship: string; model: string | null }) => s.originalAuthorship === 'unknown' && s.model === null)).toBe(true);
    const shell = projectCrfShell(design);
    expect(sections).toHaveLength(shell.forms.length + 2);
    expect(sections[0].code).toBe('crf.identification');
    expect(sections[0].content).toContain(STUDY);
    expect(sections[1].content).toContain('Unlinked assessment');
    for (const [index, form] of shell.forms.entries()) {
      const section = sections[index + 2];
      expect(section.title).toContain(form.name);
      expect(section.content).toContain(form.origin);
      for (const visit of form.visitIds) expect(section.content).toContain(visit);
      for (const item of form.items) {
        expect(section.content).toContain(item.prompt);
        expect(section.content).toContain(item.type);
        expect(section.content).toContain(item.derivedFrom);
        if (item.cdashVar) expect(section.content).toContain(item.cdashVar);
        if (item.units) expect(section.content).toContain(item.units);
        if (item.placeholder) expect(section.content.toLowerCase()).toContain('placeholder');
      }
      expect(section.content).not.toContain('FORGED');
      expect(section.content).not.toMatch(/<input|<script|<iframe/i);
      const revision = (await db.pglite.query<Revision>('SELECT content_sha256,inputs FROM doc_revisions WHERE section_id=$1', [section.id])).rows[0];
      expect(revision.content_sha256).toBe(hash(section.content));
      expect(revision.inputs.importSource.fingerprint).toBe(p.fingerprint);
      expect(revision.inputs.contributors).toEqual([expect.objectContaining({ id: 'workflow_import' })]);
      const spans = (await db.pglite.query<Span>(`SELECT provenance_kind,machine_author_id,asserted_by FROM document_span_lineage
        WHERE document_table='authoring_sections' AND document_id=$1 AND deleted_at IS NULL`, [section.id])).rows;
      expect(spans.length).toBeGreaterThan(0);
      expect(spans.every(s => s.provenance_kind === 'machine_draft' && s.machine_author_id === 'workflow_import' && s.asserted_by === null)).toBe(true);
    }
    expect(warnings.join(' ').toLowerCase()).toContain('blank');
    expect(warnings.join(' ')).not.toContain('CDASH certified');
    const audits = (await db.pglite.query<Audit>('SELECT change_reason,metadata FROM authoring_audit_trail WHERE doc_id=$1', [doc.id])).rows;
    expect(audits).toHaveLength(sections.length);
    for (const audit of audits) {
      expect(audit.change_reason).toBe(REASON);
      expect(audit.metadata.provenance.importSource).toMatchObject({ kind: 'study-design-crf', id: STUDY, fingerprint: p.fingerprint });
    }
    expect((await db.pglite.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM authoring_signatures WHERE doc_id=$1', [doc.id])).rows[0].n).toBe(0);
    expect(await sourceRows()).toEqual(original);
  });

});

describe('literal saved CRF values remain plain editable content', () => {
  it('preserves hostile-looking title, item and eligibility text with escaped markup and independently checked hashes', async () => {
    const id = 'literal-crf-study';
    const title = 'Literal <b>saved title</b> & **unformatted**';
    const endpointName = 'Literal <img src=x onerror=alert(1)> & **item** | [field](https://example.invalid)';
    const eligibility = 'Criterion <LOQ & <script>alert(1)</script> with _literal_ tokens';
    const literalDesign: StudyDesign = { ...design, id, title,
      endpoints: [{ ...design.endpoints[0], name: endpointName }],
      population: { ...design.population, eligibility: [{ type: 'inclusion', text: eligibility }] },
      scheduleOfActivities: { ...design.scheduleOfActivities!, activities: [
        { ...design.scheduleOfActivities!.activities[0], endpointNames: [endpointName] },
        design.scheduleOfActivities!.activities[1],
      ] } };
    await seedStudy(id, PROGRAM, ORG, literalDesign);
    const original = await sourceRows();
    const p = await checkedPreview(id);
    const response = await post(body(id, { expectedFingerprint: p.fingerprint }));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const { doc, sections, origin } = response.body.data;
    expect(doc.title).toContain(title);
    const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(sections[0].content).toContain(escaped(title));
    expect(sections.find((s: { title: string }) => s.title === 'Eligibility').content).toContain(escaped(eligibility));
    expect(sections.find((s: { title: string }) => s.title === 'Recorded response assessment').content).toContain(escaped(endpointName));
    const current = await verifySavedWorkflowImport(doc, db.pool, { organizationId: ORG, actor: AUTHOR });
    expect(current?.fingerprint).toBe(p.fingerprint);
    for (const section of sections) {
      expect(section.content).not.toMatch(/<(?:script|img|b|strong|a)\b/i);
      const source = current!.sections.find(s => s.code === section.code)!;
      expect(origin.sectionOrigins.find((s: { code: string }) => s.code === section.code).contentSha256).toBe(hash(source.content));
      const saved = (await db.pglite.query<Revision>('SELECT content_sha256,inputs FROM doc_revisions WHERE section_id=$1', [section.id])).rows[0];
      expect(saved.content_sha256).toBe(hash(section.content));
      expect(saved.inputs.importSource.fingerprint).toBe(current!.fingerprint);
    }
    expect(await sourceRows()).toEqual(original);
  });
});

describe('saved CRF working copies remain independently editable and verifiable', () => {
  it('reopens, saves a real editor amendment, and reuses the copy without replacing the amendment', async () => {
    const original = await sourceRows();
    const p = await checkedPreview();
    const first = await post(body(STUDY, { expectedFingerprint: p.fingerprint }));
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const { doc, sections } = first.body.data;
    const header = await author(request(app).get(`/api/authoring/docs/${doc.id}`));
    expect(header.status, JSON.stringify(header.body)).toBe(200);
    expect(header.body.document.provenance.importSource).toMatchObject({ kind: 'study-design-crf', id: STUDY, fingerprint: p.fingerprint });
    const opened = await author(request(app).get(`/api/authoring/docs/${doc.id}/sections`));
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    expect(opened.body.sections.map((s: { code: string }) => s.code)).toEqual(sections.map((s: { code: string }) => s.code));
    const target = opened.body.sections.find((s: { code: string }) => s.code === 'crf.form.001');
    const amended = '<p>Recorded blank-form specification amended by the author.</p>';
    const edit = await author(request(app).patch(`/api/authoring/sections/${target.id}`)).send({ content: amended,
      expectedUpdatedAt: target.updated_at, changeReason: 'Clarify this blank-form specification for review' });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const before = await counts();
    const reused = await post(body(STUDY, { expectedFingerprint: p.fingerprint }));
    expect(reused.status, JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data).toMatchObject({ reused: true, doc: { id: doc.id } });
    expect(reused.body.data.sections.find((s: { id: string }) => s.id === target.id).content).toBe(amended);
    expect(await counts()).toEqual(before);
    const stored = (await db.pglite.query<StoredDoc>('SELECT provenance,client_program_id FROM authoring_documents WHERE id=$1', [doc.id])).rows[0];
    expect(savedImportSource(stored)).toMatchObject({ kind: 'study-design-crf', id: STUDY });
    expect((await verifySavedWorkflowImport(stored, db.pool, { organizationId: ORG, actor: AUTHOR }))?.fingerprint).toBe(p.fingerprint);
    expect(await sourceRows()).toEqual(original);
  });

  it.each(['design', 'source-metadata', 'timestamp'])('rejects %s drift after preview without writing or replacing a working copy', async change => {
    const original = await sourceRows();
    const p = await checkedPreview();
    const before = await counts();
    if (change === 'design') await db.pool.query(`UPDATE cdisc_prm_studies SET metadata=jsonb_set(metadata,'{design,title}','"Changed saved title"') WHERE study_id=$1`, [STUDY]);
    if (change === 'source-metadata') await db.pool.query(`UPDATE cdisc_prm_studies SET metadata=metadata || '{"recordedNote":"outside projected forms"}'::jsonb WHERE study_id=$1`, [STUDY]);
    if (change === 'timestamp') await db.pool.query("UPDATE cdisc_prm_studies SET updated_at='2026-10-02' WHERE study_id=$1", [STUDY]);
    try {
      const rejected = await post(body(STUDY, { expectedFingerprint: p.fingerprint }));
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
      expect(rejected.body.error).toBe('SOURCE_CHANGED');
      expect(await counts()).toEqual(before);
      const doc = (await db.pglite.query<StoredDoc>("SELECT provenance,client_program_id FROM authoring_documents WHERE provenance->'importSource'->>'id'=$1", [STUDY])).rows[0];
      await expect(verifySavedWorkflowImport(doc, db.pool, { organizationId: ORG, actor: AUTHOR })).rejects.toThrow(/changed|unavailable/i);
    } finally {
      const row = original.find(r => r.row.study_id === STUDY)!.row;
      await db.pool.query('UPDATE cdisc_prm_studies SET metadata=$1,updated_at=$2 WHERE study_id=$3', [row.metadata, row.updated_at, STUDY]);
    }
  });
});

describe('current source scope, association and exact selector boundaries', () => {
  it('refuses a foreign source and a different target before reading the full saved design', async () => {
    await seedStudy('foreign-crf', PROGRAM, OTHER_ORG);
    const before = await counts();
    const requests = [{ payload: body('foreign-crf', { previewOnly: true }), status: 404 },
      { payload: body(STUDY, { programId: PROGRAM_B, previewOnly: true }), status: 409 }];
    for (const { payload, status } of requests) {
      const mark = trace.stmts.length;
      const response = await post(payload);
      expect(response.status, JSON.stringify(response.body)).toBe(status);
      expect(response.body.data).toBeUndefined();
      expect(trace.stmts.slice(mark).some(s => /SELECT\s+to_jsonb\(s\)\s+AS\s+snapshot/i.test(s.sql))).toBe(false);
    }
    expect(await counts()).toEqual(before);
  });

  it('refuses current private-project access and revoked membership without full-source reads or writes', async () => {
    const before = await counts();
    await db.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    try {
      const mark = trace.stmts.length;
      const denied = await preview();
      expect(denied.status, JSON.stringify(denied.body)).toBe(403);
      expect(denied.body.data).toBeUndefined();
      expect(trace.stmts.slice(mark).some(s => /FROM\s+cdisc_prm_studies/i.test(s.sql))).toBe(false);
    } finally {
      await db.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
    await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
    invalidateOrgMembershipCache();
    try {
      const mark = trace.stmts.length;
      const denied = await preview();
      expect(denied.status, JSON.stringify(denied.body)).toBe(403);
      expect(trace.stmts.slice(mark).some(s => /FROM\s+cdisc_prm_studies/i.test(s.sql))).toBe(false);
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]);
      invalidateOrgMembershipCache();
    }
  });

  it('requires explicit association for an organization source and never associates the saved source implicitly', async () => {
    await seedStudy('organization-crf', null);
    const original = await sourceRows();
    const p = await checkedPreview('organization-crf');
    expect(p.association).toMatchObject({ mode: 'explicit', required: true, reasonRequired: true });
    const before = await counts();
    const refused = await post(body('organization-crf', { expectedFingerprint: p.fingerprint }));
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.error).toBe('ASSOCIATION_REASON_REQUIRED');
    expect(await counts()).toEqual(before);
    const associationReason = 'Review this organization study within the recorded project';
    const created = await post(body('organization-crf', { expectedFingerprint: p.fingerprint, associationReason }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.origin).toMatchObject({ sourceScope: { level: 'organization', programId: null, projectId: null }, association: { mode: 'explicit', reason: associationReason } });
    expect(await sourceRows()).toEqual(original);
  });

  it('refuses a disabled current actor before reading or projecting their saved study', async () => {
    const before = await counts();
    await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [Number(AUTHOR.id)]);
    try {
      const mark = trace.stmts.length;
      const response = await preview();
      expect(response.status, JSON.stringify(response.body)).toBe(403);
      expect(trace.stmts.slice(mark).some(s => /FROM\s+cdisc_prm_studies/i.test(s.sql))).toBe(false);
      expect(await counts()).toEqual(before);
    } finally { await db.pool.query("UPDATE users SET status='active' WHERE id=$1", [Number(AUTHOR.id)]); }
  });
});

describe('exact saved CRF selector and source identity', () => {
  it.each([undefined, null, 17, '', '   ', 'a'.repeat(101), 'saved\u0000study', 'saved\nstudy'])('rejects malformed saved-study selector %j without reading content', async studyId => {
    const before = await counts();
    const mark = trace.stmts.length;
    const rejected = await post(body(STUDY, { source: { kind: 'study-design-crf', studyId }, previewOnly: true }));
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(400);
    expect(trace.stmts.slice(mark).some(s => /FROM\s+cdisc_prm_studies/i.test(s.sql))).toBe(false);
    expect(await counts()).toEqual(before);
  });

  it('refuses creation without a preview and cannot import client-pasted design content', async () => {
    const before = await counts();
    const noPreview = await post(body());
    expect(noPreview.status, JSON.stringify(noPreview.body)).toBe(400);
    expect(noPreview.body.error).toBe('SOURCE_PREVIEW_REQUIRED');
    const missing = await post(body('not-saved', { previewOnly: true, design, crfShell: projectCrfShell(design) }));
    expect(missing.status, JSON.stringify(missing.body)).toBe(404);
    expect(await counts()).toEqual(before);
  });

  it.each(['id', 'programId', 'organizationId'])('refuses contradictory saved design %s identity', async key => {
    const id = `identity-${key}`;
    await seedStudy(id, PROGRAM, ORG, { ...design, id,
      [key]: key === 'id' ? 'different-study' : key === 'programId' ? PROGRAM_B : OTHER_ORG });
    const before = await counts();
    const response = await preview(id);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.data).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it.each([null, '', 'not-a-program-uuid'])('refuses present invalid saved design programId %j', async programId => {
    const id = `invalid-program-${String(programId)}`;
    await seedStudy(id, PROGRAM, ORG, { ...design, id, programId });
    const before = await counts();
    const response = await preview(id);
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.error).toBe('CRF_SOURCE_SCOPE_MISMATCH');
    expect(response.body.data).toBeUndefined();
    expect(await counts()).toEqual(before);
  });

  it('refuses a direct null study identity before any SQL and refuses a malformed saved null identity', async () => {
    const mark = trace.stmts.length;
    const input = { organizationId: ORG, userId: Number(AUTHOR.id), target: { programId: PROGRAM, projectId: 42 },
      source: { kind: 'study-design-crf' as const, studyId: null } };
    await expect(materializeWorkflowSource(
      // @ts-expect-error Deliberately malformed runtime input tests admission before SQL.
      input, h.pool as ReturnType<typeof tappedPool>,
    )).rejects.toMatchObject({ status: 400, code: 'WORKFLOW_SOURCE_INVALID' });
    expect(trace.stmts).toHaveLength(mark);
    const doc = (await db.pglite.query<StoredDoc>("SELECT provenance,client_program_id FROM authoring_documents WHERE provenance->'importSource'->>'id'=$1", [STUDY])).rows[0];
    const origin = savedImportSource(doc)!;
    expect(() => savedImportSource({ client_program_id: PROGRAM, provenance: {
      importSource: { ...origin, id: null, selection: { kind: 'study-design-crf', studyId: null } },
    } })).toThrow('Invalid saved import identity or version');
  });
});

describe('recorded safety assessments reach the existing editor working copy', () => {
  it('previews, creates and reopens exact safety fields and rejects changed safety source before writing', async () => {
    const id = 'recorded-safety-crf-study';
    const saved: StudyDesign = { ...design, id, safety: { aeDefinitions: 'Recorded independent event review' },
      endpoints: [...design.endpoints, { name: 'Recorded QTc change', role: 'safety', type: 'continuous',
        definition: 'Change in corrected QT interval', measurementMethod: 'Recorded central ECG reading', timepoint: 'Week 4' }],
      scheduleOfActivities: { ...design.scheduleOfActivities!, activities: [...design.scheduleOfActivities!.activities,
        { id: 'S_ECG', name: 'Recorded ECG safety assessment', category: 'safety', endpointNames: ['Recorded QTc change'], order: 2 },
        { id: 'S_LABS', name: 'Recorded laboratory safety assessment', category: 'safety', order: 3 },
        { id: 'S_VITALS', name: 'Recorded vital-sign safety assessment', category: 'safety', order: 4 }],
      cells: [...design.scheduleOfActivities!.cells, { activityId: 'S_ECG', visitId: 'V2', state: 'performed' },
        { activityId: 'S_LABS', visitId: 'V1', state: 'performed' }, { activityId: 'S_VITALS', visitId: 'V2', state: 'conditional' }] } };
    await seedStudy(id, PROGRAM, ORG, saved);
    const original = await sourceRows();
    const beforePreview = await counts();
    const p = await checkedPreview(id);
    const expected = [
      { title: 'Recorded ECG safety assessment', activityId: 'S_ECG', visit: 'V2 (Week 4)',
        prompt: 'Recorded QTc change: value (Recorded central ECG reading)', type: 'number', derivedFrom: 'endpoint:Recorded QTc change' },
      { title: 'Recorded laboratory safety assessment', activityId: 'S_LABS', visit: 'V1 (Screening)',
        prompt: 'Recorded laboratory safety assessment: result', type: 'text', derivedFrom: 'activity:S_LABS' },
      { title: 'Recorded vital-sign safety assessment', activityId: 'S_VITALS', visit: 'V2 (Week 4)',
        prompt: 'Recorded vital-sign safety assessment: result', type: 'text', derivedFrom: 'activity:S_VITALS' },
    ];
    type WorkingSection = { id?: string; title: string; content: string };
    const assertSafety = (sections: WorkingSection[]) => {
      for (const target of expected) {
        const section = sections.find(row => row.title === target.title);
        expect(section, `Missing recorded safety form ${target.activityId}`).toBeDefined();
        expect(section!.content).toContain(`Source activity: ${target.activityId}`);
        expect(section!.content).toContain(`Visit IDs: ${target.visit}`);
        expect(section!.content).toContain(target.prompt);
        expect(section!.content).toContain(`Type: ${target.type}`);
        expect(section!.content).toContain(`Derived from: ${target.derivedFrom}`);
        if (target.activityId !== 'S_ECG') expect(section!.content).toContain('yes — complete from supported design evidence');
      }
      const events = sections.filter(row => row.title === 'Adverse events');
      expect(events).toHaveLength(1);
      expect(events[0].content).toContain('CDASH domain hint: AE');
      expect(events[0].content).toContain('Adverse event term');
      expect(events[0].content).not.toContain('Source activity: S_');
      const gaps = sections.find(row => row.title === 'Recorded CRF gaps and specification review')!;
      expect(gaps.content).toContain('Recorded laboratory safety assessment');
      expect(gaps.content).toContain('Recorded vital-sign safety assessment');
      expect(gaps.content).toContain('placeholder');
    };
    for (const target of expected) {
      const previewed = p.sections.find((section: { title: string }) => section.title === target.title);
      expect(previewed, `Missing recorded safety preview ${target.activityId}`).toMatchObject({ title: target.title });
      expect(previewed.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(p.gaps.join(' ')).toContain('Recorded laboratory safety assessment');
    expect(p.gaps.join(' ')).toContain('Recorded vital-sign safety assessment');
    expect(await counts()).toEqual(beforePreview);
    const created = await post(body(id, { expectedFingerprint: p.fingerprint }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    assertSafety(created.body.data.sections);
    const docId = created.body.data.doc.id;
    const reopened = await author(request(app).get(`/api/authoring/docs/${docId}/sections`));
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    assertSafety(reopened.body.sections);
    for (const target of expected) {
      const section = reopened.body.sections.find((row: WorkingSection) => row.title === target.title);
      const revision = (await db.pglite.query<Revision>('SELECT content_sha256,inputs FROM doc_revisions WHERE section_id=$1', [section.id])).rows[0];
      expect(revision.content_sha256).toBe(hash(section.content));
      expect(p.sections.find((row: { title: string }) => row.title === target.title).contentSha256).toBe(hash(section.content));
      expect(revision.inputs.importSource.fingerprint).toBe(p.fingerprint);
    }
    expect(await sourceRows()).toEqual(original);
    const before = await counts();
    const changed: StudyDesign = JSON.parse(JSON.stringify(saved));
    changed.endpoints.find(endpoint => endpoint.name === 'Recorded QTc change')!.measurementMethod = 'Changed central ECG reading';
    await db.pool.query('UPDATE cdisc_prm_studies SET metadata=$1 WHERE study_id=$2 AND tenant_id=$3',
      [{ kind: 'c2c.studyDesign.v1', design: changed }, id, ORG]);
    try {
      const refused = await post(body(id, { expectedFingerprint: p.fingerprint }));
      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.error).toBe('SOURCE_CHANGED');
      expect(await counts()).toEqual(before);
      const retained = await author(request(app).get(`/api/authoring/docs/${docId}/sections`));
      expect(retained.status, JSON.stringify(retained.body)).toBe(200);
      assertSafety(retained.body.sections);
    } finally {
      const row = original.find(source => source.row.study_id === id)!.row;
      await db.pool.query('UPDATE cdisc_prm_studies SET metadata=$1,updated_at=$2 WHERE study_id=$3', [row.metadata, row.updated_at, id]);
    }
  });
});
