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
import mdxAdminRoutes from '../../server/routes/mdx-admin';
import c2cProjectsRoutes from '../../server/routes/c2c/projects';
import concept2cureRoutes from '../../server/routes/concept2cure';
import authoringRouter from '../../server/routes/authoring.router';
import c2cDocumentsRoutes from '../../server/routes/c2c/documents';
import { assembleOrgDocJourney } from '../../server/services/authoring/doc-journey-view-assembler';
import { authenticateToken } from '../../server/middleware/auth';
import { getActivity, getProgramById } from '../../server/services/regulatory-programs.service';
import {
  TAG,
  ORG_A,
  owner,
  userA,
  ids,
  workspaceA,
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
let adminA = 0;
let sharedProject = 0; // the leaver is still on its ownership team
let revisedSection = ''; // revised by the leaver, and by a non-numeric author
const dossierDoc = `${CODE}-dossier`; // a dossier section the leaver revised

async function leave(user: number) {
  await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
    ORG_A,
    user,
  ]);
}

/** The leaver on a project ownership team, in a section's revision history,
 *  and as a dossier section's author — seeded while they are still a member. */
async function seedRecordsAcrossSurfaces() {
  const sp = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, settings)
     VALUES ($1, $2, $3, 'regulatory', 'active', $4, $5::jsonb) RETURNING id`,
    [
      ORG_A,
      workspaceA,
      `${TAG}-displays-shared`,
      userA,
      JSON.stringify({ ownership: { ownershipTeam: [{ userId: leaver, permission: 'can_edit' }] } }),
    ]
  );
  sharedProject = Number(sp.rows[0].id);
  // doc_revisions is an append-only ledger with no foreign key to the
  // organization, so these rows stay behind in the disposable database.
  const doc = await owner.query(
    `INSERT INTO authoring_documents (id, title, created_by, tenant_id, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now() + interval '1 day') RETURNING id`,
    [`${TAG}-displays-doc`, String(leaver), ORG_A]
  );
  const sec = await owner.query(
    `INSERT INTO authoring_sections (id, doc_id, tenant_id) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
    [doc.rows[0].id, ORG_A]
  );
  revisedSection = sec.rows[0].id;
  await owner.query(
    `INSERT INTO doc_revisions (id, section_id, tenant_id, created_by, content, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'by the leaver', now() - interval '1 minute'),
            (gen_random_uuid(), $1, $2, 'system', 'by a non-numeric author', now())`,
    [revisedSection, ORG_A, String(leaver)]
  );
  await owner.query(
    `INSERT INTO c2c_documents (id, org_id, doc_type, agency, rule_pack_version, title)
     VALUES ($1, $2, 'ind', 'fda', 'ich-m4-v2.0', 'Dossier')`,
    [dossierDoc, ORG_A]
  );
  const ds = await owner.query(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order)
     VALUES ($1, 'm2.5', 'Clinical overview', 1) RETURNING id`,
    [dossierDoc]
  );
  await owner.query(
    `INSERT INTO c2c_document_section_versions (section_id, version, content, author_id, reason)
     VALUES ($1, 1, '{}'::jsonb, $2, 'first draft by the leaver')`,
    [ds.rows[0].id, leaver]
  );
}

beforeAll(async () => {
  await provisionTwoTenantFixture();
  project = Number(ids.A.projects);
  adminA = await provisionMember(ORG_A, 'admin', 'displays-admin');
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
  await seedRecordsAcrossSurfaces();
  await leave(leaver);
  await leave(silentLeaver);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/project-sections', projectSections);
  app.use('/api/concept2cure', authenticateToken, projectKnowledgeRoutes);
  app.use('/api/mdx', mdxAuditRoutes);
  app.use('/api/mdx', mdxAdminRoutes);
  app.use('/api/c2c/projects', c2cProjectsRoutes);
  app.use('/api/concept2cure', concept2cureRoutes);
  app.use('/api/authoring', authoringRouter);
  app.use('/api/c2c/documents', authenticateToken, c2cDocumentsRoutes);
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
  if (owner && sharedProject) await owner.query('DELETE FROM projects WHERE id = $1', [sharedProject]);
  if (owner) await owner.query('DELETE FROM c2c_documents WHERE id = $1', [dossierDoc]);
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
    // The audit trail is read by organisation administrators and managers
    // (4f74b0f18, DP-18). What is measured here is the leaver's name, so the
    // reader is the org's admin, as in the admin-band case below.
    const res = await request(app).get('/api/mdx/audit?resource=project_section').set(auth(accessToken(adminA, ORG_A, 'admin')));
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const rows = (res.body.data?.events ?? res.body.events) as Array<{ actor: string; actorName: string }>;
    const mine = rows.filter(r => r.actor === `u-${leaver}`);
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map(r => r.actorName))).toEqual(new Set([leaverName]));
  });

  it("the MDx admin audit band names the leaver, not 'Unknown account'", async () => {
    const res = await request(app).get('/api/mdx/admin').set(auth(accessToken(adminA, ORG_A, 'admin')));
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const audit = (res.body.data?.audit ?? res.body.audit) as Array<{ actor: string }>;
    const actors = new Set(audit.map(a => a.actor));
    expect(actors.has(leaverName), JSON.stringify([...actors])).toBe(true);
    expect(actors.has('Unknown account')).toBe(false);
  });

  it('the c2c program portfolio names the lead who left', async () => {
    const res = await request(app).get('/api/c2c/projects?limit=200').set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    const rows = (res.body.data ?? res.body.programs ?? res.body) as Array<{ id: string; lead: string }>;
    expect(rows.find(r => String(r.id) === program)?.lead).toBe(leaverName);
  });

  it('the collaborator list names a collaborator who left, so they can be removed', async () => {
    const res = await request(app)
      .get(`/api/concept2cure/projects/proj_${sharedProject}/collaborators`)
      .set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect(res.body.data.collaborators).toEqual([
      expect.objectContaining({ userId: leaver, permission: 'can_edit', name: leaverName }),
    ]);
  });

  it("a section's revision history names a reviser who left, and a non-numeric author is no error", async () => {
    const res = await request(app).get(`/api/authoring/sections/${revisedSection}/history`).set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect(
      (res.body.revisions as Array<{ created_by: string; created_by_name: string | null }>).map(r => [
        r.created_by,
        r.created_by_name,
      ])
    ).toEqual([
      ['system', null],
      [String(leaver), leaverName],
    ]);
  });

  it("a dossier section's version history names the author who left", async () => {
    const res = await request(app).get(`/api/c2c/documents/${dossierDoc}/sections/m2.5/versions`).set(asA());
    expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
    expect((res.body.data as Array<{ authorId: number; authorName: string | null }>).map(v => [v.authorId, v.authorName])).toEqual([
      [leaver, leaverName],
    ]);
  });

  it("the document journey names the creator and reviser who left", async () => {
    const stages = await runWithTenantScope(
      { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'actor-displays.dbtest' },
      () => assembleOrgDocJourney(ORG_A)
    );
    expect(JSON.stringify(stages)).toContain(leaverName);
  });
});
