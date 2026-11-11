/**
 * P-122 defects, item 2 (2026-11-10, Plan: F1): the project hierarchy's roll-up is a read, and says only the risk
 * that is recorded.
 *
 * `GET /api/project-hierarchy/:id/rollup` and `/tree` (server/routes/project-hierarchy.ts) computed the roll-up through
 * ProjectRollupService.getTree, which then wrote every node's roll-up into `projects.metadata` and moved its
 * `updated_at`: opening the project page's Plan step changed the project and its work projects, and Projects then said
 * each was "updated" at the moment someone looked at it. And where no risk was recorded the engine said "medium": a
 * node's missing or unknown risk level read as medium, and a project created without one was given 'medium' by the
 * column's default (shared/schema.ts projects.riskLevel).
 *
 * On the deploy-shaped database, through the router behind the production auth boundary, as app_service with RLS
 * enforcing (asserted below):
 *   - reading the roll-up and the tree changes no row: metadata and updated_at are as they were;
 *   - a project whose risk is not recorded has none in the roll-up, and a project created without naming one has none
 *     recorded;
 *   - a risk recorded on a work project is the roll-up's worst risk, as the engine computes it.
 *
 * Evidence: docs/evidence/DESIGN/P-122/defects/2-rollup/.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import projectHierarchy from '../../server/routes/project-hierarchy';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-ru-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
let org = 0;
let member = 0;
let workspace = 0;
const project = { unrecorded: 0, defaulted: 0, parent: 0, child: 0 };

const one = async (sql: string, params: unknown[]) => Number((await owner.query(sql, params)).rows[0].id);

/** A regulatory project, its risk as given: a level, NULL (none recorded), or undefined (not named on create). */
async function projectWith(label: string, risk: string | null | undefined, parent?: number): Promise<number> {
  const columns = ['organization_id', 'client_workspace_id', 'name', 'type', 'status', 'owner_id', 'created_by_id'];
  const values: unknown[] = [org, workspace, `${TAG}-${label}`, 'regulatory', 'active', member, member];
  if (risk !== undefined) { columns.push('risk_level'); values.push(risk); }
  if (parent) { columns.push('parent_project_id', 'depth', 'path'); values.push(parent, 1, String(parent)); }
  const id = await one(`INSERT INTO projects(${columns.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')})
    RETURNING id`, values);
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'org_public')`, [org, id]);
  /* Written long ago, so a write by the read cannot hide inside the test's own second. */
  await owner.query(`UPDATE projects SET updated_at = '2026-01-02T03:04:05Z' WHERE id = $1`, [id]);
  return id;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  org = await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [TAG]);
  workspace = await one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org, `${TAG}-workspace`]);
  member = await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,'P122 roll-up','not-a-real-password',$2,'active') RETURNING id`, [`${TAG}@example.invalid`, org]);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [org, member]);
  const posture = await runWithTenantScope({ tenantId: String(org), role: 'member', source: 'test', caller: 'p122-rollup' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  project.unrecorded = await projectWith('unrecorded', null);
  project.defaulted = await projectWith('defaulted', undefined);
  project.parent = await projectWith('parent', null);
  project.child = await projectWith('child', 'high', project.parent);
  await owner.query(`INSERT INTO project_tasks(organization_id,project_id,name,status,priority,due_date)
    VALUES($1,$2,'Module 3 Quality (CMC)','todo','medium',now() + interval '20 days')`, [org, project.child]);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/project-hierarchy', projectHierarchy);
}, 120_000);

afterAll(async () => {
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

const get = (path: string) => request(app).get(path).set(auth(accessToken(member, org, 'member')));
const rows = async () => (await owner.query(
  `SELECT id, metadata::text AS metadata, updated_at FROM projects WHERE organization_id = $1 ORDER BY id`, [org])).rows;

describe('the roll-up is a read', () => {
  it('reading the roll-up and the tree changes no project, the work project under it included', async () => {
    const before = await rows();
    const rollup = await get(`/api/project-hierarchy/${project.parent}/rollup`);
    expect(rollup.status, JSON.stringify(rollup.body).slice(0, 300)).toBe(200);
    expect(rollup.body.rollup).toMatchObject({ childCount: 1, totalTasks: 1, completedTasks: 0 });
    const tree = await get(`/api/project-hierarchy/${project.parent}/tree`);
    expect(tree.status).toBe(200);
    expect(tree.body.children.map((c: { id: number }) => c.id)).toEqual([project.child]);
    expect(await rows()).toEqual(before);
  });
});

describe('the roll-up says only the risk that is recorded', () => {
  it('a project with no risk recorded has none in its roll-up', async () => {
    const res = await get(`/api/project-hierarchy/${project.unrecorded}/tree`);
    expect(res.status).toBe(200);
    expect({ riskLevel: res.body.riskLevel, worstRiskLevel: res.body.rollup.worstRiskLevel }).toEqual({ riskLevel: null, worstRiskLevel: null });
  });

  it('a project created without naming a risk has none recorded', async () => {
    expect((await owner.query('SELECT risk_level FROM projects WHERE id = $1', [project.defaulted])).rows).toEqual([{ risk_level: null }]);
    const res = await get(`/api/project-hierarchy/${project.defaulted}/rollup`);
    expect(res.body.rollup.worstRiskLevel).toBeNull();
  });

  it('a risk recorded on a work project is the worst risk of the project above it', async () => {
    const res = await get(`/api/project-hierarchy/${project.parent}/tree`);
    expect({ parent: res.body.riskLevel, child: res.body.children[0].riskLevel, worst: res.body.rollup.worstRiskLevel })
      .toEqual({ parent: null, child: 'high', worst: 'high' });
  });
});
