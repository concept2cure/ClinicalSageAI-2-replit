/**
 * P-122 (2026-11-10, Plan: R1): production serves the milestone writes the project page's Schedule calls, admitted as
 * writes on the project.
 *
 * `POST /api/project-sections/milestones` (record), `PATCH /api/project-sections/milestones/:id` (move its date, mark
 * it done) and `DELETE` on the same path. No launch surface claimed them, so production refused them (403
 * LAUNCH_SCOPE); project-home now claims `/api/project-sections/milestones`. The claim alone admitted a viewer: the
 * routes checked only that the person could open the project (the read policy), so a member shared the project to use,
 * not to edit, recorded and changed its milestones. They are now admitted as the project's tasks are
 * (`requireProjectAdmission`, write mode): a role that writes, edit permission on the project, not archived.
 *
 * Through the production router behind the production auth boundary and the launch-scope gate as production builds
 * it (launch scope on, unclaimed paths refused), as app_service with RLS enforcing (asserted below):
 *   - a project member with edit permission records a milestone on a private project, moves its date and marks it
 *     done, and the Schedule's timeline lists it;
 *   - a colleague not on the private project is answered as if it did not exist, and nothing is written or changed;
 *   - a member who may open the project but not edit it is refused 403, and nothing is written or changed;
 *   - another organisation's project is 404 both ways;
 *   - every project-sections route that is not claimed stays 403 LAUNCH_SCOPE.
 *
 * Evidence: docs/evidence/DESIGN/P-122/milestones/.
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
import { buildPrefixMap, moduleEntitlementGate } from '../../server/middleware/moduleEntitlementGate';
import projectSections from '../../server/routes/project-sections';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-mw-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
const user = { ownerA: 0, editorA: 0, viewerA: 0, colleagueA: 0, memberB: 0 };
const project = { open: 0, priv: 0, theirs: 0 };
const milestone = { priv: 0, theirs: 0 };

const one = async (sql: string, params: unknown[]) => Number((await owner.query(sql, params)).rows[0].id);

async function member(organizationId: number, label: string): Promise<number> {
  const id = await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,$2,'not-a-real-password',$3,'active') RETURNING id`, [`${TAG}-${label}@example.invalid`, `P122 ${label}`, organizationId]);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [organizationId, id]);
  return id;
}

async function projectIn(organizationId: number, workspace: number, ownerId: number, label: string, visibility: string) {
  const id = await one(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id)
    VALUES($1,$2,$3,'regulatory','active',$4,$4) RETURNING id`, [organizationId, workspace, `${TAG}-${label}`, ownerId]);
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)`,
    [organizationId, id, visibility]);
  return id;
}

async function share(organizationId: number, projectId: number, userId: number, role: 'owner' | 'edit' | 'use') {
  await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,$4,'active')`,
    [organizationId, projectId, userId, role]);
}

async function seedOrganization(key: 'A' | 'B') {
  org[key] = await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]);
  return one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]);
}

const seedMilestone = (organizationId: number, projectId: number, name: string) =>
  one(`INSERT INTO project_milestones(organization_id,project_id,name,target_date,linked_sections)
    VALUES($1,$2,$3,'2027-03-01','{m1.2}') RETURNING id`, [organizationId, projectId, name]);

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const workspaceA = await seedOrganization('A');
  const workspaceB = await seedOrganization('B');
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-milestone-writes' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  user.ownerA = await member(org.A, 'owner-a');
  user.editorA = await member(org.A, 'editor-a');
  user.viewerA = await member(org.A, 'viewer-a');
  user.colleagueA = await member(org.A, 'colleague-a');
  user.memberB = await member(org.B, 'member-b');
  project.open = await projectIn(org.A, workspaceA, user.ownerA, 'open', 'org_public');
  project.priv = await projectIn(org.A, workspaceA, user.ownerA, 'private', 'private');
  project.theirs = await projectIn(org.B, workspaceB, user.memberB, 'theirs', 'org_public');
  await share(org.A, project.priv, user.ownerA, 'owner');
  await share(org.A, project.priv, user.editorA, 'edit');
  await share(org.A, project.priv, user.viewerA, 'use');
  milestone.priv = await seedMilestone(org.A, project.priv, `${TAG} Seeded on the private project`);
  milestone.theirs = await seedMilestone(org.B, project.theirs, `${TAG} Seeded on theirs`);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  /* As production builds it: launch scope on, a path nothing claims refused. */
  app.use(moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' }));
  app.use('/api/project-sections', projectSections);
}, 120_000);

afterAll(async () => {
  await owner?.query('DELETE FROM project_milestones WHERE organization_id = ANY($1)', [[org.A, org.B]]).catch(() => {});
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

const as = (who: keyof typeof user) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const post = (who: keyof typeof user, body: Record<string, unknown>) =>
  request(app).post('/api/project-sections/milestones').set(as(who)).send(body);
const patch = (who: keyof typeof user, id: number, body: Record<string, unknown>) =>
  request(app).patch(`/api/project-sections/milestones/${id}`).set(as(who)).send(body);
const named = async (name: string) => (await owner.query(
  `SELECT project_id, linked_sections, to_char(target_date, 'YYYY-MM-DD') AS target, completed_at IS NOT NULL AS done
     FROM project_milestones WHERE name = $1`, [name])).rows;
const seeded = async (id: number) => (await owner.query(
  `SELECT name, to_char(target_date, 'YYYY-MM-DD') AS target, completed_at IS NOT NULL AS done FROM project_milestones WHERE id = $1`, [id])).rows;
const outcome = (res: request.Response) => ({ status: res.status, code: res.body?.code ?? res.body?.error?.code ?? res.body?.error });

describe('a project member records a milestone from the Schedule, in production', () => {
  const name = `${TAG} Pre-IND briefing package sent`;
  let recorded = 0;

  it('records it on a private project, with its linked sections, and the Schedule\'s timeline lists it', async () => {
    const res = await post('editorA', { project_id: project.priv, name, target_date: '2027-01-08', linked_sections: ['m1.2', 'm2.5'] });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    recorded = Number(res.body.milestone.id);
    expect(await named(name)).toEqual([{ project_id: project.priv, linked_sections: ['m1.2', 'm2.5'], target: '2027-01-08', done: false }]);
    const timeline = await request(app).get(`/api/project-sections/timeline?project_id=${project.priv}`).set(as('editorA'));
    expect(timeline.status).toBe(200);
    const event = timeline.body.events.find((e: { title: string }) => e.title === name);
    expect(event).toMatchObject({ type: 'milestone', metadata: { milestoneId: recorded, linkedSections: ['m1.2', 'm2.5'] } });
  });

  it('moves its date, then marks it done', async () => {
    const moved = await patch('editorA', recorded, { target_date: '2027-01-22' });
    expect(moved.status, JSON.stringify(moved.body).slice(0, 300)).toBe(200);
    expect(await named(name)).toMatchObject([{ target: '2027-01-22', done: false }]);
    const done = await patch('editorA', recorded, { status: 'completed' });
    expect(done.status).toBe(200);
    expect(await named(name)).toMatchObject([{ target: '2027-01-22', done: true }]);
    const timeline = await request(app).get(`/api/project-sections/timeline?project_id=${project.priv}`).set(as('editorA'));
    expect(timeline.body.events.find((e: { title: string }) => e.title === name)).toMatchObject({ status: 'completed' });
  });

  it('refuses a date that is not one, before anything is written', async () => {
    expect(outcome(await post('editorA', { project_id: project.priv, name: `${TAG} No date`, target_date: 'next spring' })).status).toBe(400);
    expect(await named(`${TAG} No date`)).toEqual([]);
    expect(outcome(await patch('editorA', milestone.priv, { target_date: 'next spring' })).status).toBe(400);
    expect(await seeded(milestone.priv)).toEqual([{ name: `${TAG} Seeded on the private project`, target: '2027-03-01', done: false }]);
  });

  it('the milestone list shares the path: it is read only on a project the person can open', async () => {
    const list = await request(app).get(`/api/project-sections/milestones?project_id=${project.priv}`).set(as('editorA'));
    expect(list.status).toBe(200);
    expect(list.body.milestones.map((m: { name: string }) => m.name)).toContain(name);
    expect(outcome(await request(app).get(`/api/project-sections/milestones?project_id=${project.priv}`).set(as('colleagueA'))))
      .toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
  });
});

describe('who may not', () => {
  it('a colleague not on the private project is answered as if it did not exist, and nothing is written or changed', async () => {
    const name = `${TAG} Not on it`;
    expect(outcome(await post('colleagueA', { project_id: project.priv, name, target_date: '2027-02-01' })))
      .toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(outcome(await patch('colleagueA', milestone.priv, { target_date: '2027-02-01', status: 'completed' })))
      .toEqual({ status: 404, code: 'Milestone not found' });
    expect(outcome(await request(app).delete(`/api/project-sections/milestones/${milestone.priv}`).set(as('colleagueA'))).status).toBe(404);
    expect(await named(name)).toEqual([]);
    expect(await seeded(milestone.priv)).toEqual([{ name: `${TAG} Seeded on the private project`, target: '2027-03-01', done: false }]);
  });

  it('a member who may open the project but not edit it is refused, and nothing is written or changed', async () => {
    const name = `${TAG} Viewer`;
    expect(outcome(await post('viewerA', { project_id: project.priv, name, target_date: '2027-02-01' })))
      .toEqual({ status: 403, code: 'PROJECT_WRITE_PERMISSION_DENIED' });
    expect(outcome(await patch('viewerA', milestone.priv, { target_date: '2027-02-01', status: 'completed' })))
      .toEqual({ status: 403, code: 'PROJECT_WRITE_PERMISSION_DENIED' });
    expect(outcome(await request(app).delete(`/api/project-sections/milestones/${milestone.priv}`).set(as('viewerA'))))
      .toEqual({ status: 403, code: 'PROJECT_WRITE_PERMISSION_DENIED' });
    /* On a project open to the whole organisation, a member with no edit permission on it, likewise. */
    expect(outcome(await post('colleagueA', { project_id: project.open, name, target_date: '2027-02-01' })))
      .toEqual({ status: 403, code: 'PROJECT_WRITE_PERMISSION_DENIED' });
    expect(await named(name)).toEqual([]);
    expect(await seeded(milestone.priv)).toEqual([{ name: `${TAG} Seeded on the private project`, target: '2027-03-01', done: false }]);
  });

  it('another organisation\'s project is 404 both ways, and nothing is written or changed', async () => {
    const name = `${TAG} Not ours`;
    expect(outcome(await post('editorA', { project_id: project.theirs, name, target_date: '2027-02-01' })))
      .toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(outcome(await patch('editorA', milestone.theirs, { status: 'completed' }))).toEqual({ status: 404, code: 'Milestone not found' });
    expect(outcome(await post('memberB', { project_id: project.priv, name, target_date: '2027-02-01' })))
      .toEqual({ status: 404, code: 'PROJECT_NOT_FOUND' });
    expect(outcome(await patch('memberB', milestone.priv, { status: 'completed' }))).toEqual({ status: 404, code: 'Milestone not found' });
    expect(await named(name)).toEqual([]);
    expect(await seeded(milestone.theirs)).toEqual([{ name: `${TAG} Seeded on theirs`, target: '2027-03-01', done: false }]);
  });

  /* DELETE shares the claimed path, so the claim admits it. A milestone is a project record: it is moved or marked
     done, and a hard delete leaves no history. No screen, seed or AnA tool calls this route. So while launch scope
     is on (production) the route refuses itself, as /api/cmc-changes does, and the row stays. */
  describe('deleting a milestone', () => {
    const prior = process.env.LAUNCH_SCOPE_ENFORCE;
    const restore = () => { if (prior === undefined) delete process.env.LAUNCH_SCOPE_ENFORCE; else process.env.LAUNCH_SCOPE_ENFORCE = prior; };

    it('is refused while launch scope is on, with the reason, and the milestone stays', async () => {
      const id = await seedMilestone(org.A, project.priv, `${TAG} Not deleted`);
      process.env.LAUNCH_SCOPE_ENFORCE = 'on';
      try {
        const res = await request(app).delete(`/api/project-sections/milestones/${id}`).set(as('ownerA'));
        expect(outcome(res)).toEqual({ status: 409, code: 'MILESTONE_NOT_DELETED' });
        expect(String(res.body?.error?.message)).toMatch(/move its date or mark it done/i);
      } finally { restore(); }
      expect(await seeded(id)).toEqual([{ name: `${TAG} Not deleted`, target: '2027-03-01', done: false }]);
    });

    it('outside launch scope the project owner still deletes one (admitted as a write)', async () => {
      const id = await seedMilestone(org.A, project.priv, `${TAG} To delete`);
      process.env.LAUNCH_SCOPE_ENFORCE = 'off';
      try {
        expect((await request(app).delete(`/api/project-sections/milestones/${id}`).set(as('ownerA'))).status).toBe(200);
      } finally { restore(); }
      expect(await seeded(id)).toEqual([]);
    });
  });
});

describe('every project-sections route that is not claimed is still refused in production', () => {
  it.each([
    ['GET', '/api/project-sections?project_id=PROJECT'],
    ['POST', '/api/project-sections/initialize'],
    ['GET', '/api/project-sections/m2.5?project_id=PROJECT'],
    ['PATCH', '/api/project-sections/m2.5'],
    ['PATCH', '/api/project-sections/m2.5/status'],
    ['PATCH', '/api/project-sections/m2.5/assign'],
    ['PATCH', '/api/project-sections/m2.5/deadline'],
    ['POST', '/api/project-sections/m2.5/comments'],
    ['GET', '/api/project-sections/m2.5/comments?project_id=PROJECT'],
    ['GET', '/api/project-sections/m2.5/history?project_id=PROJECT'],
    ['POST', '/api/project-sections/dependencies'],
    ['GET', '/api/project-sections/dependencies?project_id=PROJECT'],
    ['GET', '/api/project-sections/notifications'],
    ['PATCH', '/api/project-sections/notifications/1/read'],
    ['POST', '/api/project-sections/notifications/read-all'],
  ])('%s %s', async (method, path) => {
    const url = path.replace('PROJECT', String(project.priv));
    const call = request(app)[method.toLowerCase() as 'get' | 'post' | 'patch'](url).set(as('editorA'));
    const res = await (method === 'GET' ? call : call.send({ project_id: project.priv, deadline: '2027-01-01', new_status: 'drafting' }));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('LAUNCH_SCOPE');
  });

  it('a section route reached under the claimed path answers as no section or milestone, and writes nothing', async () => {
    const comment = await request(app).post('/api/project-sections/milestones/comments').set(as('editorA'))
      .send({ project_id: project.priv, content: 'a comment on a section named milestones' });
    expect(comment.status).toBe(404);
    const status = await request(app).patch('/api/project-sections/milestones/status').set(as('editorA'))
      .send({ project_id: project.priv, new_status: 'drafting' });
    expect(status.status).toBe(404);
    expect((await owner.query(`SELECT count(*)::int AS n FROM section_comments WHERE project_id = $1`, [project.priv])).rows).toEqual([{ n: 0 }]);
  });
});
