/**
 * P-19 — every program a client can open has its project record.
 * (docs/LAUNCH_DEFINITION_OF_DONE.md; QA walk 2026-10-08.)
 *
 * POST /api/c2c/projects is the product's one program-creation path. The
 * program's PM-spine row (`projects.regulatory_program_id`, the "dossier
 * anchor") is what the schedule, unified work, AnA's project context and the
 * Vault read through resolveProgramProjectAnchor. Intake wrote it in the same
 * transaction, but where it could not choose a workspace it SKIPPED it and
 * still created the program: a program that answers "no record" on every one
 * of those surfaces, for good.
 *
 * Driven over HTTP through the real router against real SQL (PGlite: the
 * 0000 baseline tables, the program spine, the audit chain and the anchor
 * column as the migrations create them). The scaffold and the licence quota
 * are stubbed; both have their own contracts and neither touches the anchor.
 *
 *   - a created program resolves, strict, to its own projects row, with
 *     intake's values;
 *   - the organisation's own (marked) workspace is used when it has several;
 *   - where no workspace can be chosen, the program is refused and NOTHING is
 *     left behind: no program, no anchor, no audit row;
 *   - a failure writing the anchor rolls the program back with it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createJourneyDb,
  extractTableDdl,
  makeRequestDbClient,
  type JourneyDb,
} from '../../../../tests/golden-journeys/harness';
import type { RequestDb } from '../../../db/requestDb';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../../db.js', () => ({
  get pool() {
    return h.pool;
  },
}));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: async () => ({ documentId: null, sectionCount: 0 }),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));

const T = 120_000;
/** One unmarked workspace: the unambiguous case (QA's org 1). */
const ONE_WS = 1;
/** Two unmarked workspaces: no workspace can be chosen. */
const AMBIGUOUS = 2;
/** A client workspace plus the organisation's own, marked. */
const MARKED = 3;
/** No workspace at all. */
const NONE = 4;
const USER = 11;

let jdb: JourneyDb;
let app: express.Express;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: extractTableDdl('migrations/0000_sweet_joseph.sql', [
      'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs',
    ]),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260903_regulatory_programs_estar_device_fields.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
    ],
  });
  h.pool = jdb.pool;
  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       (${ONE_WS}, 'one', 'one', 'standard', 10), (${AMBIGUOUS}, 'two', 'two', 'standard', 10),
       (${MARKED}, 'marked', 'marked', 'standard', 10), (${NONE}, 'none', 'none', 'standard', 10)`,
  );
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'lead@p19.example', 'Lead', 'x')`);
  await jdb.pool.query(
    `INSERT INTO client_workspaces (id, organization_id, name, slug, metadata) VALUES
       (1, ${ONE_WS}, 'Default Workspace', 'default', NULL),
       (2, ${AMBIGUOUS}, 'Alpha', 'alpha', NULL),
       (3, ${AMBIGUOUS}, 'Beta', 'beta', NULL),
       (4, ${MARKED}, 'A client', 'client', NULL),
       (5, ${MARKED}, 'marked', 'marked', '{"defaultForOrganization": true}')`,
  );
  // A projects row named 'Explode' cannot be written: the failure case below.
  await jdb.pglite.exec(`
    CREATE FUNCTION p19_refuse_explode() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN
      IF NEW.name = 'Explode' THEN RAISE EXCEPTION 'p19: anchor write refused'; END IF;
      RETURN NEW;
    END $f$;
    CREATE TRIGGER p19_refuse_explode BEFORE INSERT ON projects
      FOR EACH ROW EXECUTE FUNCTION p19_refuse_explode();`);

  const { default: router } = await import('../projects');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const orgId = Number(req.headers['x-org']);
    const r = req as unknown as Record<string, unknown>;
    r.user = { id: USER, userId: USER, organizationId: orgId, role: 'manager' };
    r.userId = USER;
    r.userRole = 'manager';
    r.tenantId = orgId;
    r.dbClient = makeRequestDbClient(jdb.pglite);
    next();
  });
  app.use('/api/c2c/projects', router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

const create = (orgId: number, name: string) =>
  request(app).post('/api/c2c/projects').set('x-org', String(orgId)).send({
    name,
    productName: name,
    programType: '510k',
    primaryAgency: 'FDA',
  });

const rows = async <R>(sql: string, params: unknown[] = []) =>
  (await jdb.pool.query(sql, params)).rows as R[];

async function resolveStrict(programId: string, orgId: number) {
  const { resolveProgramProjectAnchor } = await import('../../../services/c2c/program-project-anchor');
  return resolveProgramProjectAnchor(jdb.db as RequestDb, { programId, orgId, context: 'p19-test', strict: true });
}

/** Everything this organisation holds: programs, anchors, creation audit rows. */
async function holdings(orgId: number) {
  const [p] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM regulatory_programs WHERE organization_id = $1`, [orgId]);
  const [a] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM projects WHERE organization_id = $1`, [orgId]);
  const [l] = await rows<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'c2c.project.create' AND tenant_id = $1`, [orgId],
  );
  return { programs: p.n, projects: a.n, auditRows: l.n };
}

describe('POST /api/c2c/projects — the program and its project record are one creation', () => {
  it('a created program resolves, strict, to its own projects row with intake\'s values', async () => {
    const res = await create(ONE_WS, 'P19 Glucose Sensor');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const programId = String(res.body.data.id);

    const projectId = await resolveStrict(programId, ONE_WS);
    expect(projectId).toEqual(expect.any(Number));
    expect(res.body.meta.projectAnchorId).toBe(projectId);

    const [row] = await rows<Record<string, unknown>>(
      `SELECT organization_id, client_workspace_id, name, type, status, priority,
              created_by_id, owner_id, regulatory_program_id::text AS program
         FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(row).toEqual({
      organization_id: ONE_WS, client_workspace_id: 1, name: 'P19 Glucose Sensor', type: 'regulatory',
      status: 'active', priority: 'medium', created_by_id: USER, owner_id: USER, program: programId,
    });
    // The anchor is org-scoped: another organisation does not resolve it.
    expect(await resolveStrict(programId, MARKED)).toBeNull();
  });

  it('with several workspaces, the organisation\'s own (marked) workspace holds the record', async () => {
    const res = await create(MARKED, 'P19 Marked Org Device');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const projectId = await resolveStrict(String(res.body.data.id), MARKED);
    const [row] = await rows<{ client_workspace_id: number }>(`SELECT client_workspace_id FROM projects WHERE id = $1`, [projectId]);
    expect(row.client_workspace_id).toBe(5);
  });

  it('where no workspace can be chosen (several, none marked), the program is refused and nothing is left behind', async () => {
    const before = await holdings(AMBIGUOUS);
    const res = await create(AMBIGUOUS, 'P19 Ambiguous Org Device');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('PROJECT_RECORD_UNAVAILABLE');
    expect(res.body.reason).toBe('AMBIGUOUS_CLIENT_WORKSPACE');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message).not.toMatch(/projects\.|client_workspace_id|regulatory_program_id|migrations\//);
    expect(await holdings(AMBIGUOUS)).toEqual(before);
  });

  it('an organisation with no workspace: refused, nothing left behind', async () => {
    const before = await holdings(NONE);
    const res = await create(NONE, 'P19 No Workspace Device');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('PROJECT_RECORD_UNAVAILABLE');
    expect(res.body.reason).toBe('NO_CLIENT_WORKSPACE');
    expect(await holdings(NONE)).toEqual(before);
  });

  it('a failure writing the project record rolls the program back with it', async () => {
    const before = await holdings(ONE_WS);
    const res = await create(ONE_WS, 'Explode');
    expect(res.status).toBe(500);
    expect(await holdings(ONE_WS)).toEqual(before);
    expect(await rows(`SELECT 1 FROM regulatory_programs WHERE name = 'Explode'`)).toEqual([]);
  });

  it('every program the route created is anchored in its own organisation', async () => {
    const unanchored = await rows<{ id: string }>(
      `SELECT g.id::text AS id FROM regulatory_programs g
        WHERE NOT EXISTS (SELECT 1 FROM projects p
                           WHERE p.regulatory_program_id = g.id AND p.organization_id = g.organization_id)`,
    );
    expect(unanchored).toEqual([]);
  });
});
