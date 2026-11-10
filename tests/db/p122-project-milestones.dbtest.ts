/**
 * P-122 defects, item 1 (2026-11-10, Plan: F1): a milestone can be recorded on a project.
 *
 * `project_milestones.project_id` referenced `cer_projects`, not `projects` (shared/schema.ts projectMilestones, laid
 * down by push), and the route wrote `linked_sections` as a JSON string into the reconciled `text[]` column. So no
 * milestone could be recorded on any project through `/api/project-sections/milestones`, and the project page's
 * Schedule ("Section owners and deadlines") could never list one.
 *
 * On the deploy-shaped database (install-fresh + deploy-migrate), through the router behind the production auth
 * boundary, as app_service with RLS enforcing (asserted below):
 *   - the key names `projects`;
 *   - a member records a milestone on a regulatory project of their organization, with its linked sections, and the
 *     timeline the Schedule reads lists it;
 *   - another organization's project is refused as a project that does not exist, and nothing is written for it.
 *
 * Production's launch scope still refuses milestone writes (`/api/project-sections/milestones` is not claimed by a
 * launch surface; tests/db/p122-project-management-reads.dbtest.ts). This test mounts the router without that gate:
 * it proves the store and the route, not the admission.
 *
 * Evidence: docs/evidence/DESIGN/P-122/defects/1-milestones/.
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
import projectSections from '../../server/routes/project-sections';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-ms-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
const user = { memberA: 0, memberB: 0 };
const project = { ours: 0, theirs: 0 };

const one = async (sql: string, params: unknown[]) => Number((await owner.query(sql, params)).rows[0].id);

async function seedOrganization(key: 'A' | 'B'): Promise<{ workspace: number; member: number }> {
  org[key] = await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]);
  const workspace = await one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]);
  const member = await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,$2,'not-a-real-password',$3,'active') RETURNING id`, [`${TAG}-${key}@example.invalid`, `P122 ${key}`, org[key]]);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [org[key], member]);
  return { workspace, member };
}

async function regulatoryProject(organizationId: number, workspace: number, ownerId: number, label: string): Promise<number> {
  const id = await one(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id)
    VALUES($1,$2,$3,'regulatory','active',$4,$4) RETURNING id`, [organizationId, workspace, `${TAG}-${label}`, ownerId]);
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'org_public')`,
    [organizationId, id]);
  return id;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const a = await seedOrganization('A');
  const b = await seedOrganization('B');
  user.memberA = a.member;
  user.memberB = b.member;
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-milestones' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);
  project.ours = await regulatoryProject(org.A, a.workspace, a.member, 'ours');
  project.theirs = await regulatoryProject(org.B, b.workspace, b.member, 'theirs');

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/project-sections', projectSections);
}, 120_000);

afterAll(async () => {
  await owner?.query('DELETE FROM project_milestones WHERE organization_id = ANY($1)', [[org.A, org.B]]).catch(() => {});
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

const as = (who: keyof typeof user) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const milestonesNamed = async (name: string) =>
  (await owner.query('SELECT organization_id, project_id, linked_sections FROM project_milestones WHERE name = $1', [name])).rows;

describe('a milestone is recorded on a project', () => {
  it('project_milestones.project_id references projects', async () => {
    const { rows } = await owner.query(`SELECT c.confrelid::regclass::text AS target
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'public.project_milestones'::regclass AND c.contype = 'f' AND a.attname = 'project_id'`);
    expect(rows.map((r) => r.target)).toEqual(['projects']);
  });

  it('a member records one on a regulatory project of their organization, and the Schedule\'s timeline lists it', async () => {
    const name = `${TAG} Pre-IND meeting request`;
    const res = await request(app).post('/api/project-sections/milestones').set(as('memberA'))
      .send({ project_id: project.ours, name, target_date: '2027-02-15', linked_sections: ['m2.5', 'm2.7'] });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.milestone).toMatchObject({ project_id: project.ours, organization_id: org.A, name });
    expect(await milestonesNamed(name)).toEqual([{ organization_id: org.A, project_id: project.ours, linked_sections: ['m2.5', 'm2.7'] }]);

    const timeline = await request(app).get(`/api/project-sections/timeline?project_id=${project.ours}`).set(as('memberA'));
    expect(timeline.status).toBe(200);
    expect(timeline.body.events.map((e: { type: string; title: string }) => [e.type, e.title])).toEqual([['milestone', name]]);
    expect(timeline.body).toMatchObject({ totalMilestones: 1 });
  });

  it('another organization\'s project is refused as one that does not exist, and nothing is written', async () => {
    const name = `${TAG} Not ours`;
    const res = await request(app).post('/api/project-sections/milestones').set(as('memberA'))
      .send({ project_id: project.theirs, name, target_date: '2027-03-01' });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
    const reverse = await request(app).post('/api/project-sections/milestones').set(as('memberB'))
      .send({ project_id: project.ours, name, target_date: '2027-03-01' });
    expect({ status: reverse.status, code: reverse.body.code }).toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(await milestonesNamed(name)).toEqual([]);
  });
});
