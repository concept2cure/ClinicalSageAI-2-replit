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
 *   - the explicit active workspace is used even beside a marked default;
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
let failureMode: 'commit' | 'projection' | 'options' | 'rollback' | null = null;
const released: (Error | undefined)[] = [];
const transactionStatements: string[] = [];

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
    ],
  });
  h.db = jdb.db;
  h.pool = {
    query: async (sql: string, params?: unknown[]) => {
      if (failureMode === 'projection' && sql.includes('AS title')) throw new Error('projection unavailable after commit');
      return jdb.pool.query(sql, params);
    },
    connect: async () => {
      const owned = await jdb.pool.connect();
      return {
        query: async (sql: string, params?: unknown[]) => {
          transactionStatements.push(sql.trim());
          if (failureMode === 'rollback' && sql.includes('INSERT INTO projects')) throw new Error('forced anchor failure');
          const result = await owned.query(sql, params);
          if (failureMode === 'rollback' && sql === 'ROLLBACK') throw new Error('rollback acknowledgment lost');
          if (failureMode === 'commit' && sql === 'COMMIT') throw new Error('commit acknowledgment lost');
          return result;
        },
        release: (error?: Error) => { released.push(error); owned.release(); },
      };
    },
  };
  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       (${ONE_WS}, 'one', 'one', 'standard', 10), (${AMBIGUOUS}, 'two', 'two', 'standard', 10),
       (${MARKED}, 'marked', 'marked', 'standard', 10), (${NONE}, 'none', 'none', 'standard', 10)`,
  );
  await jdb.pool.query(`INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'lead@p19.example', 'Lead', 'x')`);
  // POST / admits only a current active member whose role may create a
  // program (requireProjectCreationAccess -> readCsrProjectActor): the lead is
  // a manager of every organisation it creates in, as the harness claims.
  await jdb.pool.query(
    `INSERT INTO organization_users (organization_id, user_id, role)
       SELECT o, ${USER}, 'manager' FROM unnest(ARRAY[${ONE_WS}, ${AMBIGUOUS}, ${MARKED}, ${NONE}]) AS o`,
  );
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
    const pinned = makeRequestDbClient(jdb.pglite);
    r.dbClient = { query: async (...args: Parameters<typeof pinned.query>) => {
      if (failureMode === 'options' && String(args[0]).includes('SELECT id, name, organization_id, status')) throw new Error('workspace read unavailable');
      const result = await pinned.query(...args);
      if (req.headers['x-revoke-after-options'] && String(args[0]).includes('SELECT id, name, organization_id, status')) {
        await jdb.pool.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [orgId, USER]);
      }
      return result;
    } };
    next();
  });
  app.use('/api/c2c/projects', router);
  const { default: clientsRouter } = await import('../../clients-routes');
  app.use('/api/clients', clientsRouter);
}, T);

afterAll(async () => {
  await jdb?.close();
});

const create = (orgId: number, name: string, clientWorkspaceId?: unknown) =>
  request(app).post('/api/c2c/projects').set('x-org', String(orgId)).send({
    name,
    productName: name,
    programType: '510k',
    primaryAgency: 'FDA',
    ...(clientWorkspaceId === undefined ? {} : { clientWorkspaceId }),
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
  it('returns the same client-aware card projection as GET', async () => {
    const created = await create(ONE_WS, 'P19 projection parity');
    expect(created.status,JSON.stringify(created.body)).toBe(201);
    const listed = await request(app).get('/api/c2c/projects').set('x-org',String(ONE_WS));
    expect(listed.status,JSON.stringify(listed.body)).toBe(200);
    const card = listed.body.data.find((row: {id:string}) => row.id===created.body.data.id);
    expect(card).toBeDefined();
    expect(Object.keys(created.body.data).sort()).toEqual(Object.keys(card).sort());
    expect(card).toMatchObject({client_workspace_id:1,client_name:'Default Workspace'});
    expect(created.body.data).toMatchObject({client_workspace_id:1,client_name:'Default Workspace'});
  });

  it.each([
    { programType: 'mdr', productType: 'device', submissionTypeId: 'eu_mdr_techdoc', field: 'euMdrClass', value: 'IIa', column: 'eu_mdr_class', other: 'eu_ivdr_class' },
    { programType: 'ivdr', productType: 'ivd', submissionTypeId: 'eu_ivdr', field: 'euIvdrClass', value: 'D', column: 'eu_ivdr_class', other: 'eu_mdr_class' },
  ] as const)('$programType keeps its stated class on the regional column with the anchored creation and audit record', async ({ programType, productType, submissionTypeId, field, value, column, other }) => {
    const res = await request(app).post('/api/c2c/projects').set('x-org', String(ONE_WS)).send({
      name: `P19 EU ${programType} file`, productName: 'Regional meter', programType, productType,
      primaryAgency: 'EU / Notified Body', submissionTypeId, [field]: value,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const programId = String(res.body.data.id);
    const [row] = await rows<{ eu_mdr_class: string | null; eu_ivdr_class: string | null; device_class: string | null }>(
      'SELECT eu_mdr_class, eu_ivdr_class, device_class FROM regulatory_programs WHERE id = $1 AND organization_id = $2',
      [programId, ONE_WS],
    );
    expect(row[column]).toBe(value); expect(row[other]).toBeNull(); expect(row.device_class).toBeNull();
    expect(await resolveStrict(programId, ONE_WS)).toBe(res.body.meta.projectAnchorId);
    const [audit] = await rows<{ details: Record<string, unknown> }>(
      "SELECT new_values AS details FROM audit_logs WHERE action = 'c2c.project.create' AND record_id = $1 AND tenant_id = $2", [programId, ONE_WS],
    );
    expect(audit.details[column]).toBe(value); expect(audit.details[other]).toBeNull();
  });

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

});

describe('POST /api/c2c/projects — explicit active client placement', () => {
  it('requires an explicit choice even when several workspaces include a marked default', async () => {
    const before = await holdings(MARKED);
    const res = await create(MARKED, 'PM05 Marked Omitted');
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.reason).toBe('AMBIGUOUS_CLIENT_WORKSPACE');
    expect(await holdings(MARKED)).toEqual(before);
  });

  it('places the actual saved anchor and audit in the explicitly selected client instead of the default', async () => {
    const res = await create(MARKED, 'PM05 Explicit Client', 4);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta).toMatchObject({ organizationId: MARKED, actorUserId: USER,
      clientWorkspaceId: 4, clientWorkspaceName: 'A client' });
    const [row] = await rows<{ client_workspace_id: number }>(
      'SELECT client_workspace_id FROM projects WHERE id=$1', [res.body.meta.projectAnchorId]);
    expect(row.client_workspace_id).toBe(4);
    const [audit] = await rows<{ details: { client_workspace_id: number } }>(
      "SELECT new_values AS details FROM audit_logs WHERE record_id=$1 AND action='c2c.project.create'", [res.body.data.id]);
    expect(audit.details.client_workspace_id).toBe(4);
  });

  it.each([null, 0, -1, 1.5, '4', 999, 1, 2_147_483_648, Number.MAX_SAFE_INTEGER])('refuses invalid or foreign explicit selection %s without falling back', async (id) => {
    const before = await holdings(MARKED);
    const res = await create(MARKED, 'PM05 Invalid Choice', id);
    expect(res.status).toBe(typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? 409 : 400);
    expect(await holdings(MARKED)).toEqual(before);
  });

  it('accepts each explicit sponsor and never treats a header alone as the choice', async () => {
    for (const id of [2, 3]) {
      const res = await create(AMBIGUOUS, `PM05 Sponsor ${id}`, id);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.meta.clientWorkspaceId).toBe(id);
      const [anchor] = await rows<{ client_workspace_id: number }>('SELECT client_workspace_id FROM projects WHERE id=$1', [res.body.meta.projectAnchorId]);
      expect(anchor.client_workspace_id).toBe(id);
    }
    const before = await holdings(AMBIGUOUS);
    const res = await request(app).post('/api/c2c/projects').set('x-org', String(AMBIGUOUS)).set('x-client-id', '2')
      .send({ name: 'Header is not a choice', productName: 'Meter', programType: '510k', primaryAgency: 'FDA' });
    expect(res.status).toBe(409); expect(res.body.reason).toBe('AMBIGUOUS_CLIENT_WORKSPACE');
    expect(await holdings(AMBIGUOUS)).toEqual(before);
  });

  it('omitted legacy intake uses the sole active workspace even beside an archived one', async () => {
    await jdb.pool.query("INSERT INTO client_workspaces (id,organization_id,name,slug,status) VALUES (7,$1,'Archived','archived','archived')", [ONE_WS]);
    const res = await create(ONE_WS, 'Sole active workspace');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta.clientWorkspaceId).toBe(1);
  });

  it('refuses out-of-range and malformed request claims before business SQL', async () => {
    const before = await holdings(ONE_WS);
    for (const claim of ['2147483648', '9007199254740991', '0', '1.5', '01']) {
      const res = await request(app).post('/api/c2c/projects').set('x-org', String(ONE_WS)).set('x-client-id', claim)
        .send({ name: 'Invalid claim', productName: 'Meter', programType: '510k', primaryAgency: 'FDA', clientWorkspaceId: 1 });
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toBe('INVALID_CLIENT_WORKSPACE');
    }
    expect(await holdings(ONE_WS)).toEqual(before);
  });

  it('refuses an inactive workspace and a contradictory workspace header without saving', async () => {
    await jdb.pool.query("INSERT INTO client_workspaces (id,organization_id,name,slug,status) VALUES (6,$1,'Inactive','inactive','inactive')", [MARKED]);
    const before = await holdings(MARKED);
    expect((await create(MARKED, 'PM05 Inactive', 6)).status).toBe(409);
    const res = await request(app).post('/api/c2c/projects').set('x-org', String(MARKED)).set('x-client-id', '5')
      .send({ name: 'PM05 Contradictory', productName: 'Meter', programType: '510k', primaryAgency: 'FDA', clientWorkspaceId: 4 });
    expect(res.status).toBe(409);
    expect(await holdings(MARKED)).toEqual(before);
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

});

describe('POST /api/c2c/projects — atomicity, legacy ensure and honest outcomes', () => {
  it('a failure writing the project record rolls the program back with it', async () => {
    const before = await holdings(ONE_WS);
    const res = await create(ONE_WS, 'Explode');
    expect(res.status).toBe(500);
    expect(await holdings(ONE_WS)).toEqual(before);
    expect(await rows(`SELECT 1 FROM regulatory_programs WHERE name = 'Explode'`)).toEqual([]);
  });

  it('preserves legacy default-marker ensure behavior and refuses contradictory explicit re-invocation', async () => {
    const { requireProgramProjectAnchor } = await import('../../../services/c2c/program-project-anchor');
    const created = await jdb.pool.query(`INSERT INTO regulatory_programs
      (organization_id,name,code,program_type,product_type,primary_agency,product_name)
      VALUES ($1,'Legacy ensure','LEGACY','510k','device','FDA','Legacy') RETURNING id`, [MARKED]);
    const programId = (created.rows[0] as { id: string }).id;
    const client = await jdb.pool.connect();
    const input = { client: client as never, orgId: MARKED, userId: USER, programId,
      name: 'Legacy ensure', code: 'LEGACY', priority: 'medium' };
    await client.query('BEGIN');
    try {
      const legacy = await requireProgramProjectAnchor(input);
      expect(legacy.clientWorkspaceId).toBe(5);
      await expect(requireProgramProjectAnchor({ ...input, clientWorkspaceId: 4 })).rejects.toMatchObject({ reason: 'CLIENT_WORKSPACE_MISMATCH' });
      const retained = await requireProgramProjectAnchor({ ...input, clientWorkspaceId: 5 });
      expect(retained).toMatchObject({ projectId: legacy.projectId, created: false, clientWorkspaceId: 5 });
      await client.query('COMMIT');
    } finally { client.release(); }
  });

  it('rolls back program and anchor if the actual creation audit write fails', async () => {
    await jdb.pglite.exec(`CREATE FUNCTION pm05_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN IF NEW.new_values->>'name' = 'Audit Explode' THEN RAISE EXCEPTION 'audit refused'; END IF; RETURN NEW; END $f$;
      CREATE TRIGGER pm05_refuse_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pm05_refuse_audit();`);
    const before = await holdings(ONE_WS);
    expect((await create(ONE_WS, 'Audit Explode', 1)).status).toBe(500);
    expect(await holdings(ONE_WS)).toEqual(before);
  });

  it('reports an uncertain commit honestly and discards its owned connection exactly once', async () => {
    const before = await holdings(ONE_WS);
    released.length = 0; transactionStatements.length = 0; failureMode = 'commit';
    let res;
    try { res = await create(ONE_WS, 'Lost commit acknowledgment', 1); }
    finally { failureMode = null; }
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_CREATE_OUTCOME_UNKNOWN');
    expect(res.body).not.toHaveProperty('created');
    expect(res.body.message).not.toMatch(/nothing|not created|rolled back/i);
    expect(released).toHaveLength(1); expect(released[0]).toBeInstanceOf(Error);
    expect(transactionStatements.at(-1)).toBe('COMMIT');
    const after = await holdings(ONE_WS);
    expect(after).toEqual({ programs: before.programs + 1, projects: before.projects + 1, auditRows: before.auditRows + 1 });
  });

  it('discards an unacknowledged rollback and does not claim nothing was saved', async () => {
    released.length = 0; transactionStatements.length = 0; failureMode = 'rollback';
    let res;
    try { res = await create(ONE_WS, 'Unknown rollback', 1); }
    finally { failureMode = null; }
    expect(res.status).toBe(503); expect(res.body.error).toBe('PROJECT_CREATE_OUTCOME_UNKNOWN');
    expect(res.body.message).not.toMatch(/nothing|not created|rolled back/i);
    expect(released).toHaveLength(1); expect(released[0]).toBeInstanceOf(Error);
    expect(transactionStatements.at(-1)).toBe('ROLLBACK');
    expect(transactionStatements).not.toContain('COMMIT');
  });

  it('reports confirmed creation when its post-commit details cannot be read', async () => {
    released.length = 0; failureMode = 'projection';
    let res;
    try { res = await create(ONE_WS, 'Confirmed creation unavailable', 1); }
    finally { failureMode = null; }
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'PROJECT_CREATED_DETAILS_UNAVAILABLE', created: true,
      organizationId: ONE_WS, actorUserId: USER, clientWorkspaceId: 1, clientWorkspaceName: 'Default Workspace' });
    expect(released).toEqual([undefined]);
    const [saved] = await rows<{ id: string }>('SELECT id FROM regulatory_programs WHERE id=$1', [res.body.programId]);
    expect(saved.id).toBe(res.body.programId);
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


describe('GET /api/clients?purpose=project-intake — current creator-bound active choices', () => {
  it('supplies only active same-organization IDs and names with the current actor receipt', async () => {
    const res = await request(app).get('/api/clients?purpose=project-intake&organizationId=1').set('x-org', String(MARKED));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ success: true, clients: [
      { id: '4', name: 'A client', organizationId: String(MARKED), status: 'active' },
      { id: '5', name: 'marked', organizationId: String(MARKED), status: 'active' },
    ], meta: { purpose: 'project-intake', organizationId: MARKED, actorUserId: USER } });
  });
  it('distinguishes an honestly empty active list from unavailable options', async () => {
    const res = await request(app).get('/api/clients?purpose=project-intake').set('x-org', String(NONE));
    expect(res.status).toBe(200); expect(res.body.clients).toEqual([]);
  });
  it('refuses a current viewer regardless of its stale request role', async () => {
    await jdb.pool.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [MARKED, USER]);
    try {
      const res = await request(app).get('/api/clients?purpose=project-intake').set('x-org', String(MARKED));
      expect(res.status).toBe(403); expect(res.body).not.toHaveProperty('clients');
    } finally { await jdb.pool.query("UPDATE organization_users SET role='manager' WHERE organization_id=$1 AND user_id=$2", [MARKED, USER]); }
  });
  it('refuses unverified stores instead of returning a fabricated empty list', async () => {
    failureMode = 'options';
    try {
      const res = await request(app).get('/api/clients?purpose=project-intake').set('x-org', String(MARKED));
      expect(res.status).toBe(503); expect(res.body).not.toHaveProperty('clients');
    } finally { failureMode = null; }
  });
  it('refuses inactive actors while the canonical store prevents duplicate membership', async () => {
    await jdb.pool.query("UPDATE users SET status='inactive' WHERE id=$1", [USER]);
    try {
      expect((await request(app).get('/api/clients?purpose=project-intake').set('x-org', String(MARKED))).status).toBe(403);
    } finally { await jdb.pool.query("UPDATE users SET status='active' WHERE id=$1", [USER]); }
    await expect(jdb.pool.query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'manager')", [MARKED, USER]))
      .rejects.toMatchObject({ code: '23505', constraint: 'unique_user_org' });
  });
  it('rechecks the current creator after reading options and suppresses a revoked result', async () => {
    try {
      const res = await request(app).get('/api/clients?purpose=project-intake').set('x-org', String(MARKED)).set('x-revoke-after-options', 'yes');
      expect(res.status).toBe(403); expect(res.body).not.toHaveProperty('clients');
    } finally { await jdb.pool.query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'manager')", [MARKED, USER]); }
  });
});
