/** Real HTTP/JWT, canonical authoring writes and PGlite. No native PostgreSQL
 * concurrency, production RLS, provider or generated-content claim is made. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { getIndAuthoringTemplates, indTemplateSnapshot } from '../../services/authoring/ind-authoring-templates';
import type { IndAuthoringTemplate } from '../../services/authoring/ind-template-types';
import type { IndDocumentCatalog } from '../../../shared/authoring/ind-document-catalog';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_PROGRAM, PREREQ, PROGRAM, asToken, makeApp, mint } from './_authoring-canvas-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
let db: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
const templates = () => getIndAuthoringTemplates();
const selected = (entryId: string) => templates().find(template => template.entryId === entryId)!;
const payload = (template: IndAuthoringTemplate) => ({ title: `Working copy of ${template.name}`, module: template.module,
  template_id: template.id, client_program_id: PROGRAM });

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
  ], testOnlySql: `CREATE TABLE client_workspaces(id integer PRIMARY KEY, organization_id integer);
    CREATE SCHEMA intelligence;
    CREATE TABLE intelligence.document_templates(id uuid PRIMARY KEY,template_name text,document_type text,agency text,description text,created_at timestamptz DEFAULT now(),status text);
    CREATE TABLE intelligence.template_sections(template_id uuid,section_code text,section_title text,ordering integer);` });
  h.db = db.db; h.pool = db.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, 180_000);
afterAll(async () => { await db?.close(); });

interface Counts { docs: number; sections: number; revisions: number; audits: number; signatures: number }
async function counts(): Promise<Counts> {
  return (await db.pglite.query<Counts>(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
    (SELECT count(*) FROM authoring_sections)::int AS sections,(SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS audits,(SELECT count(*) FROM authoring_signatures)::int AS signatures`)).rows[0];
}
async function create(template: IndAuthoringTemplate, extra: Record<string, unknown> = {}) {
  return author(request(app).post('/api/authoring/docs')).send({ ...payload(template), ...extra });
}
async function sections(documentId: string) {
  const response = await author(request(app).get(`/api/authoring/docs/${documentId}/sections`));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.sections as Array<{ id: string; code: string; title: string; content: string; doc_id: string; tenant_id: number }>;
}
async function verifyCopy(template: IndAuthoringTemplate) {
  const created = await create(template);
  expect(created.status, `${template.entryId}: ${JSON.stringify(created.body)}`).toBe(201);
  const doc = created.body.document;
  expect(doc).toMatchObject({ title: payload(template).title, template_id: template.id, module: template.module,
    client_program_id: PROGRAM, c2c_document_id: null, status: 'draft', tenant_id: ORG,
    provenance: { source: 'template', governedWrite: 'unverified', templateSource: { id: template.id,
      entryId: template.entryId, version: 1, sha256: indTemplateSnapshot(template), kind: template.kind,
      limitations: template.limitations } } });
  expect(created.body.governance.bound).toBe(false);
  expect(created.body.sections_seeded).toBe(template.sections.length);
  const saved = await sections(doc.id);
  expect(saved.map(section => [section.code, section.title, section.content]))
    .toEqual(template.sections.map(section => [section.code, section.title, '']));
  expect(saved.every(section => section.doc_id === doc.id && section.tenant_id === ORG)).toBe(true);
  const audits = (await db.pglite.query<{ metadata: { templateGuidance: unknown; templateSource: { id: string } }; section_id: string }>(
    "SELECT metadata,section_id FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE'", [doc.id, ORG])).rows;
  expect(audits.length).toBe(saved.length);
  for (const section of saved) {
    const record = audits.find(audit => audit.section_id === section.id)!;
    expect(record.metadata.templateSource.id).toBe(template.id);
    expect(record.metadata.templateGuidance).toEqual(template.sections.find(row => row.code === section.code)!.guidance);
  }
  return { documentId: doc.id as string, sections: saved.length };
}

describe('every IND template reaches the existing saved document editor', () => {
  it('lists all 200 exact builtin identities and their complete catalogue/module coverage', async () => {
    const before = await counts();
    const expectedIds = new Set(templates().map(template => template.id));
    const response = await author(request(app).get('/api/authoring/templates'));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.templates).toHaveLength(200);
    expect(new Set(response.body.templates.map((template: { id: string }) => template.id)).size).toBe(200);
    expect(response.body.templates.map((template: { id: string }) => template.id).sort()).toEqual([...expectedIds].sort());
    const catalog = await author(request(app).get('/api/authoring/ind-document-catalog'));
    expect(catalog.status).toBe(200);
    const data = catalog.body.data as IndDocumentCatalog;
    expect(data.sections).toHaveLength(102);
    expect(data.deliverables).toHaveLength(93);
    expect(data.moduleTemplates).toHaveLength(5);
    const references = [...data.sections.map(entry => entry.template), ...data.deliverables.map(entry => entry.template), ...data.moduleTemplates!];
    expect(references).toHaveLength(200);
    expect(references.every(reference => reference && expectedIds.has(reference.id))).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it('creates and reopens every template with empty bodies, exact provenance and atomic section evidence', async () => {
    const before = await counts();
    const started = performance.now();
    const copies = [];
    for (const template of templates()) copies.push(await verifyCopy(template));
    const after = await counts();
    const sectionCount = copies.reduce((count, copy) => count + copy.sections, 0);
    expect(after).toEqual({ docs: before.docs + 200, sections: before.sections + sectionCount,
      revisions: before.revisions + sectionCount, audits: before.audits + sectionCount, signatures: before.signatures });
    const documents = await author(request(app).get(`/api/authoring/docs?status=all&programId=${PROGRAM}`));
    expect(documents.status).toBe(200);
    for (const copy of copies) expect(documents.body.documents).toContainEqual(expect.objectContaining({ id: copy.documentId }));
    console.info('IND template HTTP probe', { templates: copies.length, sections: sectionCount, elapsedMs: Math.round(performance.now() - started) });
  }, 180_000);
});

describe('saved template guidance follows actual identity and current access', () => {
  it.each(['section:m1.2', 'section:m2.3', 'section:m3.2.S.4', 'section:m4.2.3.2', 'section:m5.3.5.1'])('reads the %s saved guidance snapshot without unrelated code-matched instructions', async entryId => {
    const template = selected(entryId);
    const created = await create(template);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const saved = await sections(created.body.document.id);
    const unrelated = (await db.pglite.query<{ id: string }>(`INSERT INTO authoring_templates(template_name,template_type,tenant_id)
      VALUES($1,'reference',$2) RETURNING id`, [`Unrelated ${entryId}`, ORG])).rows[0].id;
    await db.pool.query(`INSERT INTO template_guidance(template_id,section_name,section_code,guidance_text,tenant_id)
      VALUES($1,'Unrelated source',$2,'Unrelated template instruction',$3)`, [unrelated, saved[0].code, ORG]);
    const response = await author(request(app).get(`/api/authoring/guidance/${saved[0].id}`));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.template_guidance).toContainEqual(expect.objectContaining(template.sections[0].guidance));
    expect(JSON.stringify(response.body.template_guidance)).not.toContain('Unrelated template instruction');
    const reopened = await author(request(app).get(`/api/authoring/docs/${created.body.document.id}`));
    expect(reopened.status).toBe(200);
    expect(reopened.body.document.template_id).toBe(template.id);
    expect(reopened.body.document.provenance.templateSource.sha256).toBe(indTemplateSnapshot(template));
  });

  it('refuses guidance after project access is withdrawn, even for a previously created owner copy', async () => {
    const created = await create(selected('section:m2.3'));
    expect(created.status).toBe(201);
    const saved = await sections(created.body.document.id);
    await db.pool.query('UPDATE projects SET owner_id=5,created_by_id=5 WHERE id=42');
    await db.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
    try {
      const denied = await author(request(app).get(`/api/authoring/guidance/${saved[0].id}`));
      expect(denied.status).toBe(403);
      expect(denied.body.template_guidance).toBeUndefined();
    } finally {
      await db.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
      await db.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
    }
  });
});

describe('IND template creation retains authority and failure boundaries', () => {
  it.each(['module', 'foreign-project', 'unknown-template'] as const)('refuses %s before any authoring evidence is created', async problem => {
    const before = await counts();
    const extra = problem === 'module' ? { module: 'M5' } : problem === 'foreign-project' ? { client_program_id: OTHER_PROGRAM }
      : { template_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    const response = await create(selected('section:m2.3'), extra);
    expect(response.status).toBe(problem === 'module' ? 400 : 404);
    expect(await counts()).toEqual(before);
  });

  it.each(['revoked', 'reader'] as const)('refuses a current %s membership despite the old authenticated token', async mode => {
    const before = await counts();
    if (mode === 'revoked') await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
    else await db.pool.query("UPDATE organization_users SET role='reader' WHERE organization_id=$1 AND user_id=$2", [ORG, Number(AUTHOR.id)]);
    try {
      expect((await create(selected('section:m2.3'))).status).toBe(403);
      expect(await counts()).toEqual(before);
    } finally {
      await db.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, Number(AUTHOR.id)]);
      await db.pool.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [ORG, Number(AUTHOR.id)]);
    }
  });

  it('rolls back the document, first section, revision and audit when a later section cannot be persisted', async () => {
    await db.pool.query(`CREATE FUNCTION fail_ind_template_section() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.order_index=1 AND EXISTS(SELECT 1 FROM authoring_documents WHERE id=NEW.doc_id AND title='Rollback IND template')
      THEN RAISE EXCEPTION 'Injected template section failure'; END IF; RETURN NEW; END $$`);
    await db.pool.query('CREATE TRIGGER fail_ind_template_section BEFORE INSERT ON authoring_sections FOR EACH ROW EXECUTE FUNCTION fail_ind_template_section()');
    const before = await counts();
    try {
      expect((await create(selected('section:m2.3'), { title: 'Rollback IND template' })).status).toBe(500);
      expect(await counts()).toEqual(before);
    } finally { await db.pool.query('DROP TRIGGER fail_ind_template_section ON authoring_sections'); }
  });

  it('refuses an inactive global template that has real saved sections, without creating a phantom document', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await db.pool.query("INSERT INTO intelligence.document_templates(id,template_name,document_type,agency,status) VALUES($1,'Saved global reference','section','fda','active')", [id]);
    await db.pool.query("INSERT INTO intelligence.template_sections VALUES($1,'2.2','Introduction',0)", [id]);
    const allowed = await create(selected('section:m2.2'), { template_id: id });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
    await db.pool.query("UPDATE intelligence.document_templates SET status='deprecated' WHERE id=$1", [id]);
    const before = await counts();
    expect((await create(selected('section:m2.2'), { template_id: id })).status).toBe(404);
    expect(await counts()).toEqual(before);
  });
});
