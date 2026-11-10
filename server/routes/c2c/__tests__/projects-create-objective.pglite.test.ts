/**
 * S1: New project asks for the objective (docs/design/ONE_DESIGN_PLAN.md §1a,
 * "S1: where the project's objective lives", item 3).
 *
 * POST /api/c2c/projects is the product's one creation path. A stated objective
 * is recorded as version 1 of the project charter's `objectives` section (the
 * objective of record, P-80/P-82) through server/services/c2c/charter-objectives.ts,
 * the module the charter route's PUT writes through, inside the creation's own
 * transaction. The creation's audit row names it. No objective, nothing
 * recorded: no charter, no section, no placeholder.
 *
 * Driven over HTTP through the real router against real SQL (PGlite): the 0000
 * baseline tables, the program spine, the audit chain, the anchor column, and
 * the charter tables with their append-only audit triggers, as the migrations
 * create them. The scaffold and the licence quota are stubbed, as in
 * projects-create-anchor.pglite.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJourneyDb, extractTableDdl, makeRequestDbClient, type JourneyDb } from '../../../../tests/golden-journeys/harness';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown }));
vi.mock('../../../db.js', () => ({
  get pool() { return h.pool; },
  get db() { return h.db; },
}));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: async () => ({ documentId: null, sectionCount: 0 }),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));

const T = 120_000;
const ORG = 1;
const USER = 11;
const REASON = 'Stated when the project was created.';

let jdb: JourneyDb;
let app: express.Express;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: [extractTableDdl('migrations/0000_sweet_joseph.sql', [
      'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs', 'concept2cure_artifacts',
    ]),
    extractTableDdl('db/migrations/20260401_project_sharing_visibility.sql', ['project_visibility_settings', 'project_members']),
    extractTableDdl('db/migrations/20260314_phase12_multi_user_review.sql', ['concept2cure_review_assignments'])].join('\n'),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20261012b_regulatory_programs_eu_device_classes.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
      // The charter: project_charters, its sections and audit trail, the
      // append-only triggers, and the declared columns.
      'migrations/0012_project_charter_timeline.sql',
      'migrations/20260629_charter_tables_rebuild.sql',
      'migrations/20260911_charter_audit_immutability.sql',
      'migrations/20260917_project_charters_declared_columns.sql',
    ],
  });
  h.db = jdb.db;
  // The creation's own client: BEGIN, every write and COMMIT go through it.
  h.pool = jdb.pool;
  await jdb.pool.query(`INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES (${ORG}, 'one', 'one', 'standard', 10)`);
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'lead@s1.example', 'Lead', 'x')`);
  await jdb.pool.query(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${USER}, 'manager')`);
  await jdb.pool.query(`INSERT INTO client_workspaces (id, organization_id, name, slug, metadata) VALUES (1, ${ORG}, 'Default Workspace', 'default', NULL)`);
  // An objectives section that says EXPLODE cannot be written: the rollback case.
  await jdb.pglite.exec(`
    CREATE FUNCTION s1_refuse_explode() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF NEW.content LIKE '%EXPLODE%' THEN RAISE EXCEPTION 's1: objectives write refused'; END IF;
      RETURN NEW;
    END $f$;
    CREATE TRIGGER s1_refuse_explode BEFORE INSERT ON charter_sections
      FOR EACH ROW EXECUTE FUNCTION s1_refuse_explode();`);

  const { default: router } = await import('../projects');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.user = { id: USER, userId: USER, organizationId: ORG, role: 'manager' };
    r.userId = USER;
    r.userRole = 'manager';
    r.tenantId = ORG;
    r.dbClient = makeRequestDbClient(jdb.pglite);
    next();
  });
  app.use('/api/c2c/projects', router);
}, T);

afterAll(async () => { await jdb?.close(); });

let made = 0;
const create = (body: Record<string, unknown>) => request(app).post('/api/c2c/projects').send({
  name: 'S1 Glucose Sensor', productName: `GS-${++made}`, programType: '510k', primaryAgency: 'FDA', ...body,
});

const rows = async <R>(sql: string, params: unknown[] = []) => (await jdb.pool.query(sql, params)).rows as R[];

async function holdings() {
  const [n] = await rows<{ programs: number; projects: number; audit: number; charters: number; sections: number; events: number }>(
    `SELECT (SELECT count(*)::int FROM regulatory_programs WHERE organization_id = $1) AS programs,
            (SELECT count(*)::int FROM projects WHERE organization_id = $1) AS projects,
            (SELECT count(*)::int FROM audit_logs WHERE action = 'c2c.project.create' AND tenant_id = $1) AS audit,
            (SELECT count(*)::int FROM project_charters WHERE organization_id = $1) AS charters,
            (SELECT count(*)::int FROM charter_sections) AS sections,
            (SELECT count(*)::int FROM charter_audit_events WHERE organization_id = $1) AS events`, [ORG]);
  return n;
}

async function charterOf(projectId: number) {
  const charters = await rows<{ id: number; submission_type: string; regulatory_region: string; product_name: string }>(
    'SELECT id, submission_type, regulatory_region, product_name FROM project_charters WHERE project_id = $1 AND organization_id = $2',
    [projectId, ORG]);
  const sections = charters.length ? await rows<{ id: number; version: number; content: string; content_hash: string; previous_version_hash: string | null; created_by: number }>(
    "SELECT id, version, content, content_hash, previous_version_hash, created_by FROM charter_sections WHERE charter_id = $1 AND section_key = 'objectives'",
    [charters[0].id]) : [];
  return { charters, sections };
}

async function creationAudit(programId: string) {
  const [row] = await rows<{ details: Record<string, unknown> }>(
    "SELECT new_values AS details FROM audit_logs WHERE action = 'c2c.project.create' AND record_id = $1 AND tenant_id = $2", [programId, ORG]);
  return row.details;
}

const OBJECTIVE = 'Show that GS-1 is substantially equivalent to its predicate, and clear the 510(k).';

describe('POST /api/c2c/projects records the objective it is given', () => {
  it('records a stated objective as version 1 of the charter objectives section, in the creation, and its audit row names it', async () => {
    const res = await create({
      productName: 'GS-1',
      objective: `  ${OBJECTIVE}  `,
      objectiveSources: [{ kind: 'protocol', title: 'Bench protocol GS-1-BT-01', locator: 'Section 1.2' }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const projectId = res.body.meta.projectAnchorId as number;
    const programId = String(res.body.data.id);

    const { charters, sections } = await charterOf(projectId);
    expect(charters).toEqual([{ id: expect.any(Number), submission_type: '510K', regulatory_region: 'FDA', product_name: 'GS-1' }]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ version: 1, previous_version_hash: null, created_by: USER });
    expect(JSON.parse(sections[0].content)).toEqual({
      objective: OBJECTIVE,
      sources: [{ kind: 'protocol', locator: 'Section 1.2', title: 'Bench protocol GS-1-BT-01', url: null }],
      successCriteria: null,
    });

    // The charter's own append-only trail: the charter started, the section created, each with the reason.
    const events = await rows<{ entity_type: string; event_type: string; actor_user_id: number; reason: string }>(
      'SELECT entity_type, event_type, actor_user_id, reason FROM charter_audit_events WHERE charter_id = $1 ORDER BY id', [charters[0].id]);
    expect(events).toEqual([
      { entity_type: 'charter', event_type: 'created', actor_user_id: USER, reason: REASON },
      { entity_type: 'section', event_type: 'created', actor_user_id: USER, reason: REASON },
    ]);

    // The creation's audit row covers it: same transaction, same record.
    expect(await creationAudit(programId)).toMatchObject({
      objective_charter_id: charters[0].id,
      objective_section_id: sections[0].id,
      objective_version: 1,
      objective_content_hash: sections[0].content_hash,
    });
    expect(res.body.meta.objective).toEqual({ charterId: charters[0].id, sectionId: sections[0].id, version: 1 });

    // The charter route's read finds it: one store, one write path.
    const { readProjectObjectives } = await import('../../../services/c2c/charter-objectives');
    const read = await readProjectObjectives(jdb.db as never, { orgId: ORG, projectId });
    expect(read.current?.content.objective).toBe(OBJECTIVE);
    expect(read.history.map((e) => [e.version, e.reason, e.actorUserId])).toEqual([[1, REASON, USER]]);
  }, T);

  it.each([
    ['absent', {}],
    ['empty', { objective: '' }],
    ['only whitespace', { objective: '   \n ' }],
    ['null', { objective: null }],
  ])('records nothing when the objective is %s: no charter, no section, no placeholder', async (_label, extra) => {
    const res = await create({ name: `S1 none ${_label}`, ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { charters, sections } = await charterOf(res.body.meta.projectAnchorId);
    expect(charters).toEqual([]);
    expect(sections).toEqual([]);
    const details = await creationAudit(String(res.body.data.id));
    expect(Object.keys(details).filter((k) => k.startsWith('objective'))).toEqual([]);
    expect(res.body.meta.objective).toBeUndefined();
  }, T);

  it.each([
    ['not text', { objective: 42 }],
    ['longer than the objective field allows', { objective: `SECRET-AIM ${'x'.repeat(4001)}` }],
    ['citing a source address that is not http', { objective: 'SECRET-AIM', objectiveSources: [{ kind: 'registry', title: 'Registry', url: 'javascript:alert(1)' }] }],
    ['citing a source with no title', { objective: 'SECRET-AIM', objectiveSources: [{ kind: 'protocol' }] }],
    ['sources sent with no objective', { objectiveSources: [{ kind: 'protocol', title: 'Protocol' }] }],
  ])('refuses an objective %s before anything is written, without echoing it', async (_label, extra) => {
    const before = await holdings();
    const res = await create({ name: 'S1 refused', ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('SECRET-AIM');
    expect(await holdings()).toEqual(before);
  }, T);

  it('rolls the whole creation back when the objective cannot be recorded: no program, no record, no charter', async () => {
    const before = await holdings();
    const res = await create({ name: 'S1 rollback', objective: 'EXPLODE on write' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await holdings()).toEqual(before);
  }, T);

  it.each([
    { label: 'an EU MDR technical file at a Notified Body', body: { name: 'S1 EU meter', productName: 'Regional meter', programType: 'mdr', productType: 'device', primaryAgency: 'EU / Notified Body', submissionTypeId: 'eu_mdr_techdoc', euMdrClass: 'IIa' }, charter: { submission_type: 'MDR', regulatory_region: 'EMA' } },
    { label: 'a clinical study report under ICH', body: { name: 'S1 CSR', productName: 'BX-204', productType: 'drug', programType: 'csr', primaryAgency: 'ICH / Global', submissionTypeId: 'ich_csr' }, charter: { submission_type: 'CSR', regulatory_region: 'ICH' } },
  ])('starts the charter for $label, a filing the charter did not classify before', async ({ body, charter }) => {
    const res = await create({ ...body, objective: 'File what the program needs, from its own data.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { charters, sections } = await charterOf(res.body.meta.projectAnchorId);
    expect(charters).toEqual([expect.objectContaining(charter)]);
    expect(sections.map((s) => s.version)).toEqual([1]);
  }, T);

  // The charter's tables are verified only on canonically provisioned databases
  // (ONE_DESIGN_PLAN.md §1a S1 item 4, unverified on every applier). Where one is
  // missing, the objective's write fails inside drizzle, which wraps the 42P01 in
  // its own error: the creation must still say which store is not provisioned
  // (the route's PENDING_STORE), not answer a bare 500, and leave nothing behind.
  it('answers PENDING_STORE and rolls back when a charter table is not provisioned on this database', async () => {
    const before = await holdings();
    await jdb.pglite.exec('ALTER TABLE charter_sections RENAME TO s1_charter_sections_unprovisioned');
    let res: request.Response;
    try {
      res = await create({ name: 'S1 no charter store', objective: 'Clear the 510(k).' });
    } finally {
      await jdb.pglite.exec('ALTER TABLE s1_charter_sections_unprovisioned RENAME TO charter_sections');
    }
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body).toMatchObject({ error: 'PENDING_STORE' });
    expect(await holdings()).toEqual(before);
  }, T);
});
