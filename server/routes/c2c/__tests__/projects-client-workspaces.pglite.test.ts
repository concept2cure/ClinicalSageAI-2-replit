/** A2.2: real list SQL and canonical current access, with measured readiness
 * isolated from this client-projection contract. PGlite does not claim native
 * runtime-role RLS; this proves HTTP filtering, sharing and anchor revalidation. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { assertNoSchemaGaps, createJourneyDb, extractTableDdl, makeRequestDbClient, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import type { ProgramAccessExecutor } from '../../../services/c2c/current-program-access';

const h = vi.hoisted(() => ({ pool: null as unknown, db: null as unknown, figureReads: [] as string[][] }));
vi.mock('../../../db.js', () => ({ get pool() { return h.pool; }, get db() { return h.db; } }));
vi.mock('../../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../../services/c2c/dossier-read.js', async original => ({
  ...(await original<typeof import('../../../services/c2c/dossier-read.js')>()),
  readDossierFigures: async (_q: unknown, _org: number, ids: string[]) => {
    h.figureReads.push([...ids]);
    return new Map(ids.map(id => [id, { state: 'no_sections', pct: null }]));
  },
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
let reanchorAfterCounts = false;
let failCounts = false;
let failCountsCode: string | undefined;

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
      if (failCounts && /AS portfolio_counts/.test(sql)) throw Object.assign(new Error('count read failed'), {code:failCountsCode});
      const result = await jdb.pool.query(sql, params);
      if (reanchorAfterCounts && /AS portfolio_counts/.test(sql)) {
        reanchorAfterCounts = false;
        await jdb.pool.query('UPDATE projects SET client_workspace_id=$1 WHERE regulatory_program_id=$2', [B, program(1)]);
      }
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
  reanchorAfterCounts = false;
  failCounts = false;
  failCountsCode = undefined;
  h.figureReads = [];
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


/** The same real access/anchor harness, now with more pathways than a page. */
async function seedPathwayPortfolio() {
    await jdb.pglite.exec(`
      UPDATE regulatory_programs SET
        program_type=CASE
          WHEN name ~ '^Project ([1-9]|1[0-9]|20)$' THEN 'PMA'
          WHEN name ~ '^Project (2[1-9]|30)$' THEN 'CER'
          WHEN name ~ '^Project (3[1-9]|40)$' THEN 'IDE'
          WHEN name ~ '^Project (4[1-9]|50)$' THEN 'IND'
          WHEN name ~ '^Project (5[1-5])$' THEN 'IVDR'
          WHEN name ~ '^Project (5[6-9])$' THEN 'mdl'
          ELSE 'mystery' END,
        product_type=CASE WHEN name ~ '^Project (4[1-9]|50)$' THEN 'biologic' ELSE 'device' END,
        regulatory_path=NULL,
        target_submission_date=CASE
          WHEN name ~ '^Project ([1-9]|10)$' THEN current_date
          WHEN name ~ '^Project (1[1-9]|20)$' THEN current_date+59
          WHEN name='Project 21' THEN current_date-1
          WHEN name='Project 22' THEN current_date+60
          ELSE NULL END;`);
}

describe('Projects pathway and workstream facets over the admitted portfolio', () => {
  beforeEach(seedPathwayPortfolio);

  it('counts all 60 admitted programs while measuring only the 50 returned rows', async () => {
    const res = await list('?limit=50');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta).toMatchObject({ count: 50, hasMore: true, counts: {
      total: 60, byWorkstream: { MDX: 49, Biotech: 10, Mystery: 1 },
      byPathway: { pma: 20, cer: 10, ide: 10, ivdr: 5, mdl: 4, other: 11 }, filingWithin60Days: 20,
    } });
    expect(Object.values(res.body.meta.counts.byPathway).reduce((sum, n) => Number(sum)+Number(n), 0)).toBe(60);
    expect(h.figureReads).toHaveLength(1);
    expect(h.figureReads[0]).toHaveLength(50);
    const second = await list('?limit=50&offset=50');
    expect(second.body.meta.counts).toEqual(res.body.meta.counts);
    expect(second.body.data.some((row: {pathway: string}) => row.pathway==='other')).toBe(true);
  });

  it('filters pathways before paging and preserves independent usable facets', async () => {
    const res = await list('?pathway=pma&limit=7&offset=7');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(7);
    expect(res.body.data.every((row: {pathway: string}) => row.pathway==='pma')).toBe(true);
    expect(res.body.data[0].id).toBe(program(8));
    expect(res.body.meta).toMatchObject({ count: 7, hasMore: true, counts: {
      total: 20, byWorkstream: { MDX: 49, Biotech: 10, Mystery: 1 },
      byPathway: { pma: 20, cer: 10, ide: 10, ivdr: 5, mdl: 4, other: 11 }, filingWithin60Days: 20,
    } });
  });

  it('classifies CER and IDE from program type with no regulatory path', async () => {
    for (const pathway of ['cer', 'ide']) {
      const res = await list(`?pathway=${pathway}&limit=20`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.data).toHaveLength(10);
      expect(res.body.data.every((row: {pathway: string}) => row.pathway===pathway)).toBe(true);
    }
  });

  it('combines Client, workstream and pathway filters before paging and counts', async () => {
    const res = await list(`?clientWorkspaceId=${B}&ws=MDX&pathway=ide&limit=4`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.every((row: {pathway: string; ws: string; client_workspace_id: number}) =>
      row.pathway==='ide' && row.ws==='MDX' && row.client_workspace_id===B)).toBe(true);
    expect(res.body.meta.counts).toEqual({ total:10,
      byWorkstream:{MDX:19,Biotech:10,Mystery:1}, byPathway:{ide:10,ivdr:5,mdl:4}, filingWithin60Days:0 });
    expect(res.body.meta.clients).toEqual([{ id:A,name:'Client Alpha' },{ id:B,name:'Client Beta' }]);
  });

  it('keeps Other rows visible and countable rather than dropping unknown filing types', async () => {
    const res = await list('?pathway=other');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(11);
    expect(res.body.data.some((row: {id: string}) => row.id===program(60))).toBe(true);
    expect(res.body.meta.counts.total).toBe(11);
  });

  it('does not count private, deleted or archived rows without admission', async () => {
    await jdb.pglite.exec(`
      UPDATE project_visibility_settings SET visibility='private' WHERE project_id=1;
      UPDATE regulatory_programs SET deleted_at=now() WHERE id='${program(2)}';
      UPDATE regulatory_programs SET status='archived' WHERE id='${program(3)}';`);
    const res = await list('?pathway=pma');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.counts.total).toBe(17);
    expect(res.body.meta.counts.byPathway.pma).toBe(17);
    expect(res.body.meta.counts.filingWithin60Days).toBe(17);
    const archived = await list('?pathway=pma&includeArchived=true');
    expect(archived.body.meta.counts.total).toBe(18);
  });

  it('excludes another organization from both aggregate and row reads', async () => {
    await jdb.pglite.exec(`
      INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,status,lead_user_id)
        VALUES ('${program(61)}',${OTHER},'Foreign project','FOREIGN','pma','device','FDA','Foreign product','active',${OWNER});
      INSERT INTO projects (id,organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
        VALUES (61,${OTHER},${FOREIGN},'Foreign project','regulatory','active',${OWNER},${OWNER},'${program(61)}','{}');
      INSERT INTO project_visibility_settings (project_id,organization_id,visibility) VALUES (61,${OTHER},'org_public');`);
    const res = await list('?limit=200');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.counts.total).toBe(60);
    expect(res.body.meta.counts.byPathway.pma).toBe(20);
    expect(JSON.stringify(res.body)).not.toMatch(/Foreign|FOREIGN/);
  });

  it('returns exact zero counts and empty selected results without removing facet choices', async () => {
    const res = await list('?ws=Pharma&pathway=pma');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({count:0,hasMore:false,counts:{total:0,
      byWorkstream:{MDX:49,Biotech:10,Mystery:1},byPathway:{},filingWithin60Days:0}});
  });

});

describe('Projects pathway filter validation and complete-count failures', () => {
  beforeEach(seedPathwayPortfolio);

  it.each(['ws=unknown', 'ws=mdx', 'ws=', 'ws=MDX&ws=Biotech', 'pathway=unknown', 'pathway=', 'pathway=pma&pathway=cer'])('refuses invalid closed vocabulary filters %s', async query => {
      expect((await list(`?${query}`)).status).toBe(400);
    });

  it('treats explicit all as the unfiltered portfolio', async () => {
    const res = await list('?ws=all&pathway=all&limit=1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.counts.total).toBe(60);
  });

  it.each(['08006', '42P01'])('fails the read if counts cannot be read (%s) instead of presenting page length as a total', async code => {
    failCounts = true;
    failCountsCode = code;
    const res = await list('?limit=1');
    expect(res.status, JSON.stringify(res.body)).toBe(500);
    expect(res.body.data).toBeUndefined();
  });

  it('revalidates accepted anchor mappings after the count read too', async () => {
    reanchorAfterCounts = true;
    const res = await list('?limit=1');
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_CHANGED');
    expect(res.body.data).toBeUndefined();
  });
});
