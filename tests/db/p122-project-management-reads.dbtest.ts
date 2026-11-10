/**
 * P-122 §3.5 (2026-11-10, Plan: R1): production serves the project-management reads the project page's Plan step and
 * the Projects page's "at risk" answer need, behind the same tenant and project access checks as the rest of Projects.
 *
 * Through the production routers behind the production auth boundary and the launch-scope gate as production runs it
 * (`LAUNCH_SCOPE_ENFORCE` on, unclaimed paths refused), as app_service with RLS enforcing (asserted below):
 *   - each admitted read answers 200 for a member of the organization and is refused for another organization;
 *   - the organization-wide reads (Sentinel's findings, submission-ops' blockers and work due soon) list only the
 *     projects the person can open, so a private project's finding, blocker or work never reaches a colleague who is
 *     not on it, and a finding on it cannot be changed by them;
 *   - what was not admitted is still refused: the section list, milestone writes, Sentinel's status and scans,
 *     submission-ops' workload, and a section route reached under an admitted path ("/timeline/comments").
 *
 * Evidence: docs/evidence/DESIGN/P-122/project-page/.
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
import { authenticateToken } from '../../server/middleware/auth';
import { buildPrefixMap, moduleEntitlementGate } from '../../server/middleware/moduleEntitlementGate';
import projectSections from '../../server/routes/project-sections';
import sentinelRoutes from '../../server/routes/sentinel-routes';
import submissionOps from '../../server/routes/submission-ops';
import projectHierarchy from '../../server/routes/project-hierarchy';
import taskRoutes from '../../server/routes/c2c/tasks';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-pm-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
const user = { ownerA: 0, memberA: 0, memberB: 0 };
const project = { open: 0, priv: 0, theirs: 0 };
const finding = { open: `${TAG}-f-open`, priv: `${TAG}-f-priv`, cross: `${TAG}-f-cross`, theirs: `${TAG}-f-theirs` };
const blocker = { open: `${TAG}-b-open`, priv: `${TAG}-b-priv`, theirs: `${TAG}-b-theirs` };
const work = { open: `${TAG}-w-open`, priv: `${TAG}-w-priv`, theirs: `${TAG}-w-theirs` };

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
  if (visibility === 'private') {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'owner','active')`,
      [organizationId, id, ownerId]);
  }
  return id;
}

async function seedOrganization(key: 'A' | 'B') {
  org[key] = await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]);
  const workspace = await one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]);
  return workspace;
}

async function seedRiskRecords(organizationId: number, projectId: number, keys: { f: string; b: string; w: string }, affected: number[]) {
  const { f, b, w } = keys;
  await owner.query(`INSERT INTO sentinel_findings(finding_id,organization_id,project_id,analyzer_type,severity,title,summary,affected_items,status)
    VALUES($1,$2,$3,'deadline_risk','high',$4,'A deadline is at risk.',$5::json,'open')`,
    [f, organizationId, projectId, `${f} title`, JSON.stringify(affected.map((id) => ({ type: 'project', id, label: `project ${id}` })))]);
  await owner.query(`INSERT INTO c2c_blockers(blocker_id,org_id,project_id,blocker_type,severity,title,status)
    VALUES($1,$2,$3,'missing_document','high',$4,'open')`, [b, organizationId, projectId, `${b} title`]);
  await owner.query(`INSERT INTO c2c_project_work_items(work_item_id,org_id,project_id,source_type,source_id,title,status,due_at)
    VALUES($1,$2,$3,'review_thread',$3,$4,'open',now() + interval '2 days')`, [w, organizationId, projectId, `${w} title`]);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const workspaceA = await seedOrganization('A');
  const workspaceB = await seedOrganization('B');
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-pm-reads' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  user.ownerA = await member(org.A, 'owner-a');
  user.memberA = await member(org.A, 'member-a');
  user.memberB = await member(org.B, 'member-b');
  project.open = await projectIn(org.A, workspaceA, user.ownerA, 'open', 'org_public');
  project.priv = await projectIn(org.A, workspaceA, user.ownerA, 'private', 'private');
  project.theirs = await projectIn(org.B, workspaceB, user.memberB, 'theirs', 'org_public');

  await owner.query(`INSERT INTO project_sections(organization_id,project_id,section_code,module,title,status,assigned_to,deadline)
    VALUES($1,$2,'m2.5','m2','Clinical overview','drafting',$3,now() + interval '10 days'),
          ($1,$2,'m2.7','m2','Clinical summary','not_started',NULL,NULL)`, [org.A, project.open, user.ownerA]);
  /* No project_milestones row here: recording one, and the timeline listing it, is
     tests/db/p122-project-milestones.dbtest.ts (its key named cer_projects until the P-122 defects fix). */
  await owner.query(`INSERT INTO project_tasks(organization_id,project_id,name,status,priority,due_date)
    VALUES($1,$2,'Module 2 Summaries','todo','medium',now() + interval '20 days')`, [org.A, project.open]);

  await seedRiskRecords(org.A, project.open, { f: finding.open, b: blocker.open, w: work.open }, [project.open]);
  await seedRiskRecords(org.A, project.priv, { f: finding.priv, b: blocker.priv, w: work.priv }, [project.priv]);
  await seedRiskRecords(org.B, project.theirs, { f: finding.theirs, b: blocker.theirs, w: work.theirs }, [project.theirs]);
  /* A cross-project finding on the open project that names the private one too. */
  await owner.query(`INSERT INTO sentinel_findings(finding_id,organization_id,project_id,analyzer_type,severity,title,summary,affected_items,status)
    VALUES($1,$2,$3,'cross_project','medium','Timeline overlap','Two projects overlap.',$4::json,'open')`,
    [finding.cross, org.A, project.open, JSON.stringify([{ type: 'project', id: project.open }, { type: 'project', id: project.priv }])]);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  /* As production builds it: launch scope on, a path nothing claims refused. */
  app.use(moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' }));
  app.use('/api/project-sections', projectSections);
  app.use('/api/sentinel', sentinelRoutes);
  app.use('/api/submission-ops', submissionOps);
  app.use('/api/project-hierarchy', projectHierarchy);
  app.use('/api/concept2cure', authenticateToken, taskRoutes);
}, 120_000);

afterAll(async () => {
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

const as = (who: keyof typeof user) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const get = (who: keyof typeof user, path: string) => request(app).get(path).set(as(who));
const ids = (rows: Array<Record<string, unknown>>, key: string) => rows.map((r) => String(r[key])).filter((v) => v.startsWith(TAG)).sort();

describe('the Plan step\'s reads are served for a member and refused for another organization', () => {
  it('section owners and deadlines (/api/project-sections/summary)', async () => {
    const res = await get('memberA', `/api/project-sections/summary?project_id=${project.open}`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.overall).toMatchObject({ total: 2, assigned: 1, completed: 0 });
    expect(res.body.teamWorkload.map((w: { user_name: string }) => w.user_name)).toEqual(['P122 owner-a']);
    expect((await get('memberB', `/api/project-sections/summary?project_id=${project.open}`)).status).toBe(404);
    expect((await get('memberA', `/api/project-sections/summary?project_id=${project.priv}`)).status).toBe(404);
  });

  it('section deadlines and milestones in date order (/api/project-sections/timeline)', async () => {
    const res = await get('memberA', `/api/project-sections/timeline?project_id=${project.open}`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.events.map((e: { type: string; title: string }) => [e.type, e.title])).toEqual([
      ['section_deadline', 'm2.5: Clinical overview'],
    ]);
    expect(res.body).toMatchObject({ totalSectionDeadlines: 1, totalMilestones: 0 });
    expect(res.body.events[0].metadata.assignedTo).toBe('P122 owner-a');
    expect((await get('memberB', `/api/project-sections/timeline?project_id=${project.open}`)).status).toBe(404);
  });

  it('the project task list and its summary, and the milestone catalogue', async () => {
    const list = await get('memberA', `/api/concept2cure/projects/${project.open}/tasks`);
    expect(list.status, JSON.stringify(list.body).slice(0, 300)).toBe(200);
    expect(list.body.data.map((t: { name: string }) => t.name)).toEqual(['Module 2 Summaries']);
    const summary = await get('memberA', `/api/concept2cure/projects/${project.open}/tasks/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ total: 1, completed: 0, overdue: 0 });
    expect((await get('memberB', `/api/concept2cure/projects/${project.open}/tasks`)).status).toBe(404);
    const catalogue = await get('memberA', '/api/concept2cure/submission-milestones/IND');
    expect(catalogue.status).toBe(200);
    expect(catalogue.body.data[0]).toMatchObject({ name: 'Pre-IND Meeting Request', order: 1 });
  });

  it('the project hierarchy\'s roll-up, admitted by the sharing policy', async () => {
    const res = await get('memberA', `/api/project-hierarchy/${project.open}/rollup`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.rollup).toMatchObject({ childCount: 0, totalTasks: 1, completedTasks: 0 });
    expect((await get('memberB', `/api/project-hierarchy/${project.open}/rollup`)).status).toBe(404);
    expect((await get('memberA', `/api/project-hierarchy/${project.priv}/rollup`)).status).toBe(404);
    expect((await get('ownerA', `/api/project-hierarchy/${project.priv}/rollup`)).status).toBe(200);
  });
});

describe('the "at risk" reads list only the projects the person can open', () => {
  it('Sentinel\'s findings: a colleague not on the private project sees neither its finding nor one naming it', async () => {
    const colleague = await get('memberA', '/api/sentinel/findings?status=open');
    expect(colleague.status, JSON.stringify(colleague.body).slice(0, 300)).toBe(200);
    expect(ids(colleague.body.findings, 'finding_id')).toEqual([finding.open]);
    const ownerRead = await get('ownerA', '/api/sentinel/findings?status=open');
    expect(ids(ownerRead.body.findings, 'finding_id')).toEqual([finding.cross, finding.open, finding.priv].sort());
    const theirs = await get('memberB', '/api/sentinel/findings?status=open');
    expect(theirs.status).toBe(200);
    expect(ids(theirs.body.findings, 'finding_id')).toEqual([finding.theirs]);
  });

  it('a finding on a project the person cannot open is not changed by them', async () => {
    const res = await request(app).patch(`/api/sentinel/findings/${finding.priv}`).set(as('memberA')).send({ status: 'acknowledged' });
    expect(res.status).toBe(404);
    expect((await owner.query('SELECT status FROM sentinel_findings WHERE finding_id = $1', [finding.priv])).rows).toEqual([{ status: 'open' }]);
    expect((await request(app).patch(`/api/sentinel/findings/${finding.open}`).set(as('memberB')).send({ status: 'acknowledged' })).status).toBe(404);
  });

  it('submission-ops\' open blockers', async () => {
    const colleague = await get('memberA', '/api/submission-ops/blockers');
    expect(colleague.status, JSON.stringify(colleague.body).slice(0, 300)).toBe(200);
    expect(ids(colleague.body.data, 'blockerId')).toEqual([blocker.open]);
    expect(ids((await get('ownerA', '/api/submission-ops/blockers')).body.data, 'blockerId')).toEqual([blocker.open, blocker.priv].sort());
    expect(ids((await get('memberB', '/api/submission-ops/blockers')).body.data, 'blockerId')).toEqual([blocker.theirs]);
  });

  it('submission-ops\' work due within seven days', async () => {
    const colleague = await get('memberA', '/api/submission-ops/due-soon');
    expect(colleague.status, JSON.stringify(colleague.body).slice(0, 300)).toBe(200);
    expect(ids(colleague.body.data.canonicalTasks, 'work_item_id')).toEqual([work.open]);
    expect(ids((await get('ownerA', '/api/submission-ops/due-soon')).body.data.canonicalTasks, 'work_item_id')).toEqual([work.open, work.priv].sort());
    expect(ids((await get('memberB', '/api/submission-ops/due-soon')).body.data.canonicalTasks, 'work_item_id')).toEqual([work.theirs]);
    expect((await get('memberA', `/api/submission-ops/due-soon?projectId=${project.priv}`)).status).toBe(404);
  });
});

describe('what was not admitted is still refused in production', () => {
  it.each([
    ['the section list', '/api/project-sections?project_id=PROJECT'],
    ['the milestone list (writes share its path)', '/api/project-sections/milestones?project_id=PROJECT'],
    ['Sentinel\'s status', '/api/sentinel/status'],
    ['submission-ops\' workload', '/api/submission-ops/workload'],
    ['the project cockpit read model', '/api/project-home/PROJECT'],
    ['the unified task dashboard', '/api/unified-tasks/all'],
  ])('%s', async (_name, path) => {
    const res = await get('memberA', path.replace('PROJECT', String(project.open)));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('LAUNCH_SCOPE');
  });

  it('a section route reached under an admitted path answers as no section, and writes nothing', async () => {
    const res = await request(app).post('/api/project-sections/timeline/comments').set(as('memberA'))
      .send({ project_id: project.open, content: 'a comment on a section named timeline' });
    expect(res.status).toBe(404);
    expect((await owner.query(`SELECT count(*)::int AS n FROM section_comments WHERE project_id = $1`, [project.open])).rows).toEqual([{ n: 0 }]);
    expect((await request(app).post('/api/sentinel/scan').set(as('memberA'))).status).toBe(403);
  });
});
