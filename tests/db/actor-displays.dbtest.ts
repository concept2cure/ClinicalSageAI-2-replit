/**
 * Records made by someone who has left the organization stay visible, and
 * name them where the organization's own audit trail knows them (D3,
 * 2026-09-29; evidence docs/evidence/D3/2026-09-29-actor-names/).
 *
 * Since public.users took row-level security (2026-09-28), a tenant scope reads
 * only its current members' accounts. Display queries that joined users for a
 * name therefore lost the name of anyone who had left — and where the join was
 * INNER, the record itself disappeared: a section comment by a former member
 * vanished from the thread, and their assigned sections from the team
 * workload. These go through public.actor_name (migrations/20260929_actor_names.sql)
 * with a LEFT JOIN, so the record always shows, named when the person was a
 * member or acted in this organization's audit trail.
 *
 * Through the production project-sections router behind the production auth
 * boundary, as app_service with RLS enforcing (asserted by the fixture).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { runWithTenantScope } from '../../server/db/tenantStore';
import auditService from '../../server/services/auditService';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import projectSections from '../../server/routes/project-sections';
import projectKnowledgeRoutes from '../../server/routes/c2c/project-knowledge';
import mdxAuditRoutes from '../../server/routes/mdx-audit';
import { authenticateToken } from '../../server/middleware/auth';
import { getActivity, getProgramById } from '../../server/services/regulatory-programs.service';
import {
  ORG_A,
  owner,
  userA,
  ids,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const CODE = 'm2.5-actor-displays';
let app: express.Express;
let project = 0;
let leaver = 0; // acted in A's audit trail, then left
let silentLeaver = 0; // never in A's audit trail, then left
let leaverName = '';
let program = ''; // led by the leaver

async function leave(user: number) {
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_A,
    user,
  ]);
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  project = Number(ids.A.projects);
  leaver = await provisionMember(ORG_A, 'member', 'displays-leaver');
  silentLeaver = await provisionMember(ORG_A, 'member', 'displays-silent');
  leaverName = (await owner.query('SELECT name FROM users WHERE id = $1', [leaver])).rows[0].name;

  const res = await runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-displays.dbtest' },
    () =>
      auditService.logAction({
        tenantId: ORG_A,
        userId: leaver,
        action: 'data_modify',
        resourceType: 'project_section',
        resourceId: `${project}:${CODE}`,
        details: { description: 'worked on the section while a member' },
      })
  );
  expect(res.persisted).toBe(true);

  await owner.query(
    `INSERT INTO project_sections (organization_id, project_id, section_code, module, title, status, assigned_to)
     VALUES ($1, $2, $3, 'm2', 'Clinical overview', 'drafting', $4),
            ($1, $2, $5, 'm2', 'Clinical summary', 'drafting', $6)`,
    [ORG_A, project, CODE, leaver, `${CODE}-2`, silentLeaver]
  );
  await owner.query(
    `INSERT INTO section_comments (organization_id, project_id, section_code, author_id, content)
     VALUES ($1, $2, $3, $4, 'comment by the leaver'), ($1, $2, $3, $5, 'comment by the silent leaver')`,
    [ORG_A, project, CODE, leaver, silentLeaver]
  );
  await owner.query(
    `INSERT INTO section_status_log (organization_id, project_id, section_code, new_status, changed_by)
     VALUES ($1, $2, $3, 'drafting', $4)`,
    [ORG_A, project, CODE, leaver]
  );
  const p = await owner.query(
    `INSERT INTO regulatory_programs
       (organization_id, name, code, program_type, product_type, primary_agency, product_name, lead_user_id)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', $2, $4) RETURNING id::text AS id`,
    [ORG_A, `${CODE}-program`, `${CODE}-program`, leaver]
  );
  program = p.rows[0].id;
  const edit = await runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-displays.dbtest' },
    () =>
      auditService.logAction({
        tenantId: ORG_A,
        userId: leaver,
        action: 'data_modify',
        resourceType: 'regulatory_programs',
        resourceId: program,
        details: { description: 'edited the program while a member' },
      })
  );
  expect(edit.persisted).toBe(true);
  // A row naming a user by user_id alone, not as an actor A's trail can name.
  await owner.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, created_at)
     VALUES ($1, $2, 'data_modify', 'regulatory_programs', $3, now() - interval '1 minute')`,
    [ORG_A, silentLeaver, program]
  );
  await leave(leaver);
  await leave(silentLeaver);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/project-sections', projectSections);
  app.use('/api/concept2cure', authenticateToken, projectKnowledgeRoutes);
  app.use('/api/mdx', mdxAuditRoutes);
}, 60_000);

afterAll(async () => {
  if (owner && project) {
    for (const t of ['section_comments', 'section_status_log', 'project_sections']) {
      await owner.query(`DELETE FROM ${t} WHERE project_id = $1 AND section_code LIKE $2`, [
        project,
        `${CODE}%`,
      ]);
    }
  }
  await teardownTwoTenantFixture();
});

const asA = () => auth(accessToken(userA, ORG_A, 'member'));

describe('project sections keep the records of people who left (D3)', () => {
  it('the comment thread keeps every comment, named where A knows the author', async () => {
    const res = await request(app)
      .get(`/api/project-sections/${CODE}/comments?project_id=${project}`)
      .set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const byAuthor = Object.fromEntries(
      (res.body.comments as Array<{ author_id: number; author_name: string | null }>).map(c => [
        c.author_id,
        c.author_name,
      ])
    );
    expect(byAuthor, 'a comment by a former member vanished').toEqual({
      [leaver]: leaverName,
      [silentLeaver]: null,
    });
  });

  it("the section's history names who changed it", async () => {
    const res = await request(app)
      .get(`/api/project-sections/${CODE}/history?project_id=${project}`)
      .set(asA());
    expect(res.status).toBe(200);
    expect(res.body.history.map((h: { changed_by_name: string | null }) => h.changed_by_name)).toEqual([
      leaverName,
    ]);
  });

  it("the team workload keeps sections assigned to people who left", async () => {
    const res = await request(app)
      .get(`/api/project-sections/summary?project_id=${project}`)
      .set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const people = (res.body.teamWorkload as Array<{ user_id: number; user_name: string | null }>)
      .map(w => [Number(w.user_id), w.user_name])
      .filter(([id]) => id === leaver || id === silentLeaver)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(people, "a former member's assigned work vanished from the workload").toEqual(
      [
        [leaver, leaverName],
        [silentLeaver, null],
      ].sort((a, b) => Number(a[0]) - Number(b[0]))
    );
  });

  it('the section list names the leaver as assignee', async () => {
    const res = await request(app)
      .get(`/api/project-sections?project_id=${project}`)
      .set(asA());
    expect(res.status).toBe(200);
    const rows = (res.body.sections ?? res.body) as Array<{ section_code: string; assigned_to_name: string | null }>;
    const mine = rows.find(r => r.section_code === CODE);
    expect(mine?.assigned_to_name).toBe(leaverName);
  });
});

describe("a program keeps its lead's and editors' names (D3)", () => {
  const inA = <T>(fn: () => Promise<T>) =>
    runWithTenantScope(
      { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-displays.dbtest' },
      fn
    );

  it('the lead who left is still named on the program', async () => {
    const row = await inA(() => getProgramById(ORG_A, program));
    expect(row?.leadUserName).toBe(leaverName);
  });

  it('activity names the editor, and never calls a person "System"', async () => {
    const events = (await inA(() => getActivity(ORG_A, program, 20))) ?? [];
    expect(events.map(e => e.who).sort()).toEqual([leaverName, `user ${silentLeaver}`].sort());
  });
});

describe('activity feeds and the MDx audit list name people who left (D3)', () => {
  // project_activities.project_id references cer_projects, so this project
  // has no activity rows; what is measured is that the feed answers at all —
  // it selected u.full_name, a column users does not have.
  it('the project activity feed answers', async () => {
    const res = await request(app)
      .get(`/api/concept2cure/projects/${project}/activity`)
      .set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
  });

  it("the MDx audit list names the leaver's audit entries", async () => {
    const res = await request(app).get('/api/mdx/audit?resource=project_section').set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const rows = (res.body.data?.events ?? res.body.events) as Array<{ actor: string; actorName: string }>;
    const mine = rows.filter(r => r.actor === `u-${leaver}`);
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map(r => r.actorName))).toEqual(new Set([leaverName]));
  });
});
