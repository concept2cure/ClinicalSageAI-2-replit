/** A2.2: real list SQL and canonical current access, with measured readiness
 * isolated from this client-projection contract. PGlite does not claim native
 * runtime-role RLS; this proves HTTP filtering, sharing and anchor revalidation. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { assertNoSchemaGaps, createJourneyDb, extractTableDdl, makeRequestDbClient, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import type { ProgramAccessExecutor } from '../../../services/c2c/current-program-access';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown }));
vi.mock('../../../db.js', () => ({ get pool() { return h.pool; }, get db() { return h.db; } }));
vi.mock('../../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../../services/c2c/dossier-read.js', async original => ({
  ...(await original<typeof import('../../../services/c2c/dossier-read.js')>()),
  readDossierFigures: async (_q: unknown, _org: number, ids: string[]) => new Map(ids.map(id => [id, { state: 'no_sections', pct: null }])),
}));

const ORG = 7;
const OTHER = 8;
const USER = 41;
const OWNER = 42;
const A = 71;
const B = 72;
const PRIVATE = 73;
const INACTIVE = 74;
const FOREIGN = 81;
const program = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let jdb: JourneyDb;
let app: express.Express;
let reanchorAfterCard = false;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: [
      extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'concept2cure_artifacts', 'audit_logs']),
      extractTableDdl('db/migrations/20260401_project_sharing_visibility.sql', ['project_visibility_settings', 'project_members']),
      extractTableDdl('db/migrations/20260314_phase12_multi_user_review.sql', ['concept2cure_review_assignments']),
    ].join('\n'),
    migrations: [
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260929_actor_names.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260907_regulatory_programs_application_number.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
      'migrations/20261001b_projects_one_anchor_per_program.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = {
    ...jdb.pool,
    query: async (sql: string, params?: unknown[]) => {
      const result = await jdb.pool.query(sql, params);
      if (reanchorAfterCard && /AS\s+title/.test(sql)) {
        reanchorAfterCard = false;
        await jdb.pool.query('UPDATE projects SET client_workspace_id=$1 WHERE regulatory_program_id=$2', [B, program(1)]);
      }
      return result;
    },
  };
  await jdb.pglite.exec(`
    INSERT INTO organizations (id,name,slug,status) VALUES (${ORG},'CRO organisation','cro','active'),(${OTHER},'Other organisation','other','active');
    INSERT INTO users (id,email,name,password_hash,status) VALUES (${USER},'reader@example.invalid','Reader','x','active'),(${OWNER},'owner@example.invalid','Owner','x','active');
    INSERT INTO organization_users (organization_id,user_id,role) VALUES (${ORG},${USER},'member');
    INSERT INTO client_workspaces (id,organization_id,name,slug,status) VALUES
      (${A},${ORG},'Client Alpha','alpha','active'),(${B},${ORG},'Client Beta','beta','active'),
      (${PRIVATE},${ORG},'Private client name','private','active'),(${INACTIVE},${ORG},'Inactive client name','inactive','inactive'),
      (${FOREIGN},${OTHER},'Foreign client name','foreign','active');`);
  const router = (await import('../projects')).default;
  app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { userId: USER, tenantId: ORG, user: { id: USER, userId: USER, organizationId: ORG, role: 'member' }, dbClient: makeRequestDbClient(jdb.pglite) });
    next();
  });
  app.use('/api/c2c/projects', router);
}, 120_000);

beforeEach(async () => {
  reanchorAfterCard = false;
  await jdb.pglite.exec('TRUNCATE projects,regulatory_programs CASCADE; DELETE FROM client_workspaces WHERE id>=100');
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);
  await jdb.pglite.exec(`
    INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,status,lead_user_id,updated_at)
    VALUES ${rows.map(n => `('${program(n)}',${ORG},'Project ${n}','P-${n}','ind','drug','FDA','Product ${n}','active',${OWNER},now()-interval '${n} minutes')`).join(',')};
    INSERT INTO projects (id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES ${rows.map(n => `(${n},${ORG},${n <= 30 ? A : B},'Project ${n}','regulatory','active',${OWNER},${OWNER},'${program(n)}','{}')`).join(',')};
    INSERT INTO project_visibility_settings (project_id,organization_id,visibility)
      SELECT id,${ORG},'org_public' FROM projects;`);
});
afterAll(async () => {
  try { if (jdb) assertNoSchemaGaps(jdb); }
  finally { await jdb?.close(); }
});

const list = (query = '') => request(app).get(`/api/c2c/projects${query}`);

describe('Projects client-workspace projection and filtering', () => {
  it('projects the recorded client on cards and retains page count over 60 programs', async () => {
    const first = await list('?limit=50');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toHaveLength(50);
    expect(first.body.meta).toMatchObject({ count: 50, hasMore: true });
    expect(first.body.data[0]).toMatchObject({ id: program(1), client_workspace_id: A, client_name: 'Client Alpha' });
    const second = await list('?limit=50&offset=50');
    expect(second.body.data).toHaveLength(10);
    expect(second.body.meta).toMatchObject({ count: 10, hasMore: false });
    expect(new Set([...first.body.data, ...second.body.data].map((r: { id: string }) => r.id)).size).toBe(60);
  });

  it('supplies the recorded client separately from the retained organisation sponsor identity', async () => {
    const res = await request(app).get(`/api/c2c/projects/${program(1)}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ client_workspace_id: A, client_name: 'Client Alpha', sponsor_name: 'CRO organisation' });
  });

  it('filters inside current access before LIMIT/OFFSET rather than filtering a page', async () => {
    const first = await list(`?clientWorkspaceId=${B}&limit=20`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data).toHaveLength(20);
    expect(first.body.data.every((r: { client_workspace_id: number }) => r.client_workspace_id === B)).toBe(true);
    expect(first.body.meta).toMatchObject({ count: 20, hasMore: true });
    const second = await list(`?clientWorkspaceId=${B}&limit=20&offset=20`);
    expect(second.body.data).toHaveLength(10);
    expect(second.body.meta).toMatchObject({ count: 10, hasMore: false });
  });

  it.each(['0', '-1', '71junk', '1.5', '2147483648', '9007199254740992', ''])('refuses malformed explicit workspace %j', async value => {
    const res = await list(`?clientWorkspaceId=${encodeURIComponent(value)}`);
    expect(res.status).toBe(400);
  });

  it('conceals another organisation workspace and an unknown workspace', async () => {
    expect((await list(`?clientWorkspaceId=${FOREIGN}`)).status).toBe(404);
    expect((await list('?clientWorkspaceId=9999')).status).toBe(404);
  });

  it('offers minimal active client options across the accessible set, outside the selected page/filter', async () => {
    await jdb.pglite.exec(`
      UPDATE projects SET client_workspace_id=${PRIVATE} WHERE id=59;
      UPDATE project_visibility_settings SET visibility='private' WHERE project_id=59;
      UPDATE projects SET client_workspace_id=${INACTIVE} WHERE id=60;`);
    const res = await list(`?clientWorkspaceId=${A}&limit=1`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.clients).toEqual([{ id: A, name: 'Client Alpha' }, { id: B, name: 'Client Beta' }]);
    expect(JSON.stringify(res.body)).not.toMatch(/Private client name|Inactive client name|Foreign client name/);
  });

  it('refuses a same-program reanchor observed between card read and response', async () => {
    reanchorAfterCard = true;
    const res = await list('?limit=1');
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(res.body.data).toBeUndefined();
  });

  it('keeps accepted anchors immutable and bound to the evaluated actor and executor', async () => {
    const { getCurrentAccessibleProgramScope, verifiedProgramAnchors } = await import('../../../services/c2c/current-program-access');
    const q = h.pool as ProgramAccessExecutor;
    const identity = { organizationId: ORG, userId: USER };
    const scope = await getCurrentAccessibleProgramScope(q, identity);
    const anchors = verifiedProgramAnchors(q, identity, scope);
    expect(anchors[0]).toEqual({ programId: program(1), projectId: 1, clientWorkspaceId: A });
    expect(Object.isFrozen(anchors)).toBe(true);
    expect(Object.isFrozen(anchors[0])).toBe(true);
    expect(Reflect.set(anchors[0], 'clientWorkspaceId', FOREIGN)).toBe(false);
    expect(anchors[0].clientWorkspaceId).toBe(A);
    expect(() => verifiedProgramAnchors({ query: q.query }, identity, scope)).toThrow('A verified current project scope is required.');
    expect(() => verifiedProgramAnchors(q, { ...identity, userId: OWNER }, scope)).toThrow('A verified current project scope is required.');
    expect(() => verifiedProgramAnchors(q, identity, { ...scope })).toThrow('A verified current project scope is required.');
  });

  it('bounds client options and reports further authorized active choices honestly', async () => {
    const extra = Array.from({ length: 201 }, (_, i) => i + 100);
    await jdb.pglite.exec(`
      INSERT INTO client_workspaces (id,organization_id,name,slug,status)
      VALUES ${extra.map(n => `(${n},${ORG},'Bounded client ${n}','bounded-${n}','active')`).join(',')};
      INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,status,lead_user_id)
      VALUES ${extra.map(n => `('${program(n)}',${ORG},'Extra ${n}','E-${n}','ind','drug','FDA','Extra ${n}','active',${OWNER})`).join(',')};
      INSERT INTO projects (id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES ${extra.map(n => `(${n},${ORG},${n},'Extra ${n}','regulatory','active',${OWNER},${OWNER},'${program(n)}','{}')`).join(',')};
      INSERT INTO project_visibility_settings (project_id,organization_id,visibility)
        SELECT id,${ORG},'org_public' FROM projects WHERE id>=100;`);
    const res = await list('?limit=1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.clients).toHaveLength(200);
    expect(res.body.meta.clientsHasMore).toBe(true);
    expect(res.body.meta.clients.every((client: Record<string, unknown>) => Object.keys(client).sort().join(',') === 'id,name')).toBe(true);
  });
});
