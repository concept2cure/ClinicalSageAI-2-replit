/**
 * Work held by someone who has left stays visible, and stays theirs (D3,
 * 2026-09-29; evidence docs/evidence/D3/2026-09-29-actor-names/).
 *
 * Since public.users took row-level security (2026-09-28), an INNER join on
 * users drops every row whose person is no longer a member: the sentinel
 * stopped reporting a leaver's over-allocation, the CRO portfolio promoted the
 * next assignee to engagement lead, and the project home lost them from its
 * team and its lead. These go through public.actor_name with a LEFT JOIN.
 *
 * Real entry points (AISentinel's cross-project analyzer, assembleOrgCroPortfolio,
 * the project-home router behind the production auth boundary), in tenant A's
 * scope, as app_service with RLS enforcing (asserted by the fixture).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import auditService from '../../server/services/auditService';
import { AISentinel } from '../../server/services/sentinel/sentinel';
import { assembleOrgCroPortfolio } from '../../server/services/cro/cro-portfolio-view-assembler';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { authenticateToken } from '../../server/middleware/auth';
import createProjectHomeRoutes from '../../server/routes/project-home-routes';
import {
  TAG,
  ORG_A,
  owner,
  userA,
  workspaceA,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let leaver = 0;
let leaverName = '';
let userAName = '';
const projects: number[] = [];
let client = 0;
let app: express.Express;

const inA = <T>(fn: () => Promise<T>) =>
  runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-vanishing.dbtest' },
    fn
  );

beforeAll(async () => {
  await provisionTwoTenantFixture();
  leaver = await provisionMember(ORG_A, 'member', 'vanishing-leaver');
  leaverName = (await owner.query('SELECT name FROM users WHERE id = $1', [leaver])).rows[0].name;
  userAName = (await owner.query('SELECT name FROM users WHERE id = $1', [userA])).rows[0].name;
  const acted = await inA(() =>
    auditService.logAction({
      tenantId: ORG_A,
      userId: leaver,
      action: 'data_modify',
      resourceType: 'actor_vanishing_contract',
      resourceId: TAG,
      details: { description: 'worked here while a member' },
    })
  );
  expect(acted.persisted).toBe(true);

  // Four active projects, each with an open task held by the leaver, and the
  // leaver as owner and team member of the first.
  for (let i = 0; i < 4; i++) {
    const p = await owner.query(
      `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id)
       VALUES ($1, $2, $3, 'regulatory', 'active', $4) RETURNING id`,
      [ORG_A, workspaceA, `${TAG}-vanishing-${i}`, leaver]
    );
    projects.push(Number(p.rows[0].id));
    await owner.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, project_id, assignee_id, status)
       VALUES ($1, $2, 'project', 'held work', $3, $4, 'in_progress')`,
      [`${TAG}-vanishing-task-${i}`, ORG_A, projects[i], leaver]
    );
  }
  await owner.query(
    `INSERT INTO project_members (organization_id, project_id, user_id, role, status)
     VALUES ($1, $2, $3, 'author', 'active')`,
    [ORG_A, projects[0], leaver]
  );

  // A CRO client whose lead of record is the leaver; a current member is secondary.
  const c = await owner.query(
    `INSERT INTO cro_clients (organization_id, name, company_type) VALUES ($1, $2, 'sponsor') RETURNING id`,
    [ORG_A, `${TAG}-vanishing-client`]
  );
  client = Number(c.rows[0].id);
  await owner.query(
    `INSERT INTO cro_team_assignments (organization_id, client_id, user_id, role, assignment_type, status, start_date)
     VALUES ($1, $2, $3, 'lead', 'primary', 'active', now() - interval '30 days'),
            ($1, $2, $4, 'support', 'secondary', 'active', now())`,
    [ORG_A, client, leaver, userA]
  );

  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_A,
    leaver,
  ]);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/project-home', authenticateToken, createProjectHomeRoutes());
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM cro_team_assignments WHERE client_id = $1', [client]);
    await owner.query('DELETE FROM cro_clients WHERE id = $1', [client]);
    await owner.query('DELETE FROM project_members WHERE project_id = ANY($1::int[])', [projects]);
    await owner.query('DELETE FROM unified_tasks WHERE project_id = ANY($1::int[])', [projects]);
    await owner.query('DELETE FROM projects WHERE id = ANY($1::int[])', [projects]);
  }
  await teardownTwoTenantFixture();
});

describe('work held by someone who left stays visible, and theirs (D3)', () => {
  it("the sentinel still reports the leaver's over-allocation, by name", async () => {
    const sentinel = new AISentinel(getPool());
    const result = await inA(() =>
      (sentinel as unknown as {
        analyzeCrossProject: (o: number, c: unknown) => Promise<{ findings: Array<{ title: string; details: { userId: number } }> }>;
      }).analyzeCrossProject(ORG_A, {})
    );
    const mine = result.findings.filter(f => Number(f.details?.userId) === leaver);
    expect(mine.length, "the leaver's over-allocation was not reported").toBe(1);
    expect(mine[0].title).toContain(leaverName);
  });

  it('the CRO portfolio keeps the leaver as lead of record, not the next assignee', async () => {
    const rows = await inA(() => assembleOrgCroPortfolio(ORG_A));
    const row = rows.find(r => Number(r.id) === client);
    expect(row?.lead, 'the next assignee was promoted to lead').toBe(leaverName);
    expect(row?.lead).not.toBe(userAName);
  });

  it("the project home keeps the leaver on the team and as the project's lead", async () => {
    const res = await request(app)
      .get(`/api/project-home/${projects[0]}`)
      .set(auth(accessToken(userA, ORG_A, 'member')));
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect(res.body.data.team.map((m: { name: string | null }) => m.name)).toContain(leaverName);
    expect(res.body.data.program.lead).toBe(leaverName);
  });
});
