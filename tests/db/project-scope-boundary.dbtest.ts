/**
 * D3: a project-scoped request acts on the caller's project, the caller's plan
 * and the caller's session, never on what the request names (ledger L195).
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) under the
 * production posture that fixture asserts: `app_service`, not superuser, no
 * BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope middleware and the real
 * routers.
 *
 * Some of these RLS already contains: a read of another tenant's profile, the
 * archive and verify of another tenant's memory entry, a plan link, a project
 * moved to another org, a corpus ingest taking over another org's report. For
 * those the handler is the second wall, and the
 * evidence runs this file again with RLS disabled on the tables involved, to
 * show the handler holds on its own. Others RLS cannot see at all: a profile
 * filed against another tenant's project and a project re-parented onto
 * another tenant's project or workspace are foreign keys, and a password-only
 * token is not a tenant question. Each leak is read through the OWNER pool,
 * which is exempt from RLS, and asserted before the status.
 *
 * Every case uses rows no other case touches, so a leak in one cannot mask the
 * next.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../server/middleware/auth';
import { runWithPreAuthScope, runWithTenantScope } from '../../server/db/tenantStore';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import clientIntelligenceRouter from '../../server/routes/client-intelligence';
import anaPlatformRouter from '../../server/routes/ana-platform-control';
import resolutionRouter from '../../server/routes/resolution';
import usersRouter from '../../server/routes/users';
import { DrizzleCorpusWriter } from '../../server/services/corpus/drizzle-corpus-writer';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  userA,
  userB,
  workspaceA,
  workspaceB,
  ids,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

/** Tenant A's payment status before this file set it; undefined until read. */
let paymentStatusA: string | null | undefined;

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(async () => {
  if (owner && paymentStatusA !== undefined) {
    await owner.query('UPDATE organizations SET payment_status=$2 WHERE id=$1', [ORG_A, paymentStatusA]);
  }
  await teardownTwoTenantFixture();
});

const one = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0];
const count = async (sql: string, params: unknown[]) =>
  Number((await owner.query(`SELECT count(*)::int AS n FROM ${sql}`, params)).rows[0].n);

// One describe keeps the rows the cases share visibly one contract, as in the
// sibling suites.
// eslint-disable-next-line max-lines-per-function
describe("A project-scoped request acts on the caller's own project, plan and session (D3, L195)", () => {
  let app: express.Express;
  let projectB2: number;
  let projectA2: number;
  let memoryA: number;
  let memoryB1: number;
  let memoryB2: number;
  let planA: string;
  let planB: string;
  let emailA: string;
  let reportA: number;
  let reportB: number;
  const secretB = `${TAG} tenant B strategy`;
  // Registry ids no real study has; csr_reports keys NCT ids globally.
  const nctA = `NCT8${Date.now().toString().slice(-7)}`;
  const nctB = `NCT9${Date.now().toString().slice(-7)}`;

  beforeAll(async () => {
    // Mounted as production mounts them: client-intelligence and resolution
    // behind authenticateToken; /api/ana/platform behind the global /api
    // boundary, reproduced by authenticateToken; users verifies its own token
    // behind the pre-auth scope server/bootstrap/register-platform-routes.ts
    // declares (a closure there, so reproduced here).
    const preAuthScope: express.RequestHandler = (req, _res, next) =>
      runWithPreAuthScope(`auth:${req.method} ${req.path}`, next);
    app = express();
    app.use(express.json());
    app.use('/api/client-intelligence', authenticateToken, clientIntelligenceRouter);
    app.use('/api/ana/platform', authenticateToken, anaPlatformRouter);
    app.use('/api/resolution', authenticateToken, resolutionRouter);
    app.use('/api/users', preAuthScope, usersRouter);

    // AnA platform control serves paying organizations only.
    paymentStatusA = (await one('SELECT payment_status FROM organizations WHERE id=$1', [ORG_A]))
      .payment_status;
    await owner.query("UPDATE organizations SET payment_status='active' WHERE id=$1", [ORG_A]);

    // A second project on each side, so the read case and the org-move case
    // have rows of their own. Named with TAG: the fixture teardown deletes
    // projects by name.
    projectB2 = (
      await one(
        `INSERT INTO projects (organization_id,client_workspace_id,name,type,description,created_by_id)
         VALUES ($1,$2,$3,'device','fixture',$4) RETURNING id`,
        [ORG_B, workspaceB, `${TAG}-project-B2`, userB]
      )
    ).id;
    projectA2 = (
      await one(
        `INSERT INTO projects (organization_id,client_workspace_id,name,type,description,created_by_id)
         VALUES ($1,$2,$3,'device','fixture',$4) RETURNING id`,
        [ORG_A, workspaceA, `${TAG}-project-A2`, userA]
      )
    ).id;
    await owner.query(
      `INSERT INTO project_intelligence_profiles (project_id, organization_id, regulatory_strategy)
       VALUES ($1,$2,$3)`,
      [projectB2, ORG_B, secretB]
    );

    const profiles = await owner.query(
      `INSERT INTO client_intelligence_profiles (organization_id, company_name)
       VALUES ($1,$2),($3,$4) RETURNING id, organization_id`,
      [ORG_A, `${TAG}-company-A`, ORG_B, `${TAG}-company-B`]
    );
    const profileOf = (org: number) => profiles.rows.find(r => r.organization_id === org).id;
    const entries = await owner.query(
      `INSERT INTO client_memory_entries (profile_id, organization_id, category, title, content)
       VALUES ($1,$2,'fact','A-own','fixture'),
              ($3,$4,'fact','B-archive','fixture'),
              ($3,$4,'fact','B-verify','fixture')
       RETURNING id, title`,
      [profileOf(ORG_A), ORG_A, profileOf(ORG_B), ORG_B]
    );
    const entry = (title: string) => entries.rows.find(r => r.title === title).id;
    [memoryA, memoryB1, memoryB2] = [entry('A-own'), entry('B-archive'), entry('B-verify')];

    const plans = await owner.query(
      `INSERT INTO resolution_plans
         (organization_id, project_id, trigger_type, trigger_id, trigger_description,
          recommended_path, confidence, rationale, created_by_id)
       VALUES ($1,$2,'manual',$3,'fixture','review_only','moderate','fixture',$4),
              ($5,$6,'manual',$3,'fixture','review_only','moderate','fixture',$4)
       RETURNING id::text AS id, organization_id`,
      [ORG_A, ids.A.projects, TAG, userA, ORG_B, ids.B.projects]
    );
    [planA, planB] = [ORG_A, ORG_B].map(org => plans.rows.find(r => r.organization_id === org).id);

    emailA = (await one('SELECT email FROM users WHERE id=$1', [userA])).email;

    [reportA, reportB] = await Promise.all(
      [
        [ORG_A, nctA, 'A'],
        [ORG_B, nctB, 'B'],
      ].map(async ([org, nct, side]) => {
        const id = (
          await one(
            `INSERT INTO csr_reports (organization_id, report_id, report_title, nct_id)
             VALUES ($1,$2,$3,$2) RETURNING id`,
            [org, nct, `${TAG} tenant ${side} report`]
          )
        ).id;
        await owner.query('INSERT INTO csr_details (report_id, primary_objective) VALUES ($1,$2)', [
          id,
          `${TAG} tenant ${side} objective`,
        ]);
        return id as number;
      })
    );
  });

  /** A study as the registry fetch normalizes it, re-ingested by tenant A. */
  const ingestAsA = (nctId: string) =>
    runWithTenantScope(
      { tenantId: String(ORG_A), role: 'member', source: 'test', caller: 'l195-corpus-ingest' },
      () =>
        new DrizzleCorpusWriter(ORG_A).upsert({
          nctId,
          report: {
            title: `${TAG} re-ingested by A`,
            sponsor: 'fixture',
            indication: 'fixture',
            phase: 'Phase 2',
            status: 'COMPLETED',
            date: null,
            summary: null,
          },
          details: {
            studyDesign: null,
            primaryObjective: `${TAG} A objective`,
            endpoints: null,
            treatmentArms: null,
            inclusionCriteria: null,
            exclusionCriteria: null,
            sampleSize: null,
            statisticalMethods: null,
            studyDuration: null,
            results: null,
          },
          successHint: 1,
        })
    ).then(
      result => result,
      () => 'refused' as const
    );
  const reportRow = (id: number) =>
    one(
      `SELECT r.organization_id, r.report_title, d.primary_objective
         FROM csr_reports r LEFT JOIN csr_details d ON d.report_id = r.id WHERE r.id=$1`,
      [id]
    );

  const bundle = (planId: string) => ({
    projectId: Number(ids.A.projects),
    title: `${TAG} bundle`,
    planId,
    items: [
      {
        objectType: 'document',
        objectId: `${TAG}-object`,
        actionType: 'review',
        actionDescription: 'D3 contract fixture item',
      },
    ],
  });

  it("a project intelligence profile cannot be filed against another tenant's project", async () => {
    const res = await request(app)
      .post(`/api/client-intelligence/project/${ids.B.projects}/profile`)
      .set(auth(tokenA))
      .send({ regulatoryStrategy: `${TAG} planted by A` });
    expect(
      await count('project_intelligence_profiles WHERE project_id=$1 AND organization_id=$2', [
        ids.B.projects,
        ORG_A,
      ]),
      "no profile of tenant A may hang from tenant B's project"
    ).toBe(0);
    expect(res.status, "another tenant's project must read as not found").toBe(404);
  });

  it("another tenant's project intelligence profile cannot be read", async () => {
    const res = await request(app)
      .get(`/api/client-intelligence/project/${projectB2}/profile`)
      .set(auth(tokenA));
    expect(JSON.stringify(res.body), "tenant B's profile must not be served to tenant A").not.toContain(
      secretB
    );
    expect(res.status, "another tenant's project must read as not found").toBe(404);
  });

  it("the caller's own project profile is still written and read", async () => {
    const write = await request(app)
      .post(`/api/client-intelligence/project/${ids.A.projects}/profile`)
      .set(auth(tokenA))
      .send({ regulatoryStrategy: `${TAG} A strategy` });
    expect(write.status).toBe(200);
    const read = await request(app)
      .get(`/api/client-intelligence/project/${ids.A.projects}/profile`)
      .set(auth(tokenA));
    expect(read.status).toBe(200);
    expect(read.body.profile?.regulatoryStrategy).toBe(`${TAG} A strategy`);
  });

  it("another tenant's client memory entry cannot be archived", async () => {
    const res = await request(app)
      .delete(`/api/client-intelligence/memory/${memoryB1}`)
      .set(auth(tokenA));
    expect(
      (await one('SELECT status FROM client_memory_entries WHERE id=$1', [memoryB1])).status,
      "tenant B's memory entry must stay active"
    ).toBe('active');
    expect(res.status, "another tenant's entry must read as not found").toBe(404);
  });

  it("another tenant's client memory entry cannot be marked verified", async () => {
    const res = await request(app)
      .post(`/api/client-intelligence/memory/${memoryB2}/verify`)
      .set(auth(tokenA));
    expect(
      await one('SELECT is_verified_by_user, verified_by FROM client_memory_entries WHERE id=$1', [
        memoryB2,
      ]),
      "tenant B's memory entry must not be verified by tenant A's user"
    ).toEqual({ is_verified_by_user: false, verified_by: null });
    expect(res.status, "another tenant's entry must read as not found").toBe(404);
  });

  it("the caller's own memory entry is still archived", async () => {
    const res = await request(app)
      .delete(`/api/client-intelligence/memory/${memoryA}`)
      .set(auth(tokenA));
    expect(res.status).toBe(200);
    expect((await one('SELECT status FROM client_memory_entries WHERE id=$1', [memoryA])).status).toBe(
      'archived'
    );
  });

  it("AnA's project update cannot hang a project from another tenant's project or workspace", async () => {
    const res = await request(app)
      .patch(`/api/ana/platform/projects/${ids.A.projects}`)
      .set(auth(tokenA))
      .send({
        description: `${TAG} reconfigured`,
        clientWorkspaceId: workspaceB,
        parentProjectId: Number(ids.B.projects),
      });
    const row = await one(
      'SELECT client_workspace_id, parent_project_id, description FROM projects WHERE id=$1',
      [ids.A.projects]
    );
    expect(
      { client_workspace_id: row.client_workspace_id, parent_project_id: row.parent_project_id },
      "tenant A's project must not point at tenant B's workspace or project"
    ).toEqual({ client_workspace_id: workspaceA, parent_project_id: null });
    expect(res.status).toBe(200);
    expect(row.description, 'the configuration the update may write is still written').toBe(
      `${TAG} reconfigured`
    );
  });

  it("AnA's project update cannot move a project to another tenant", async () => {
    const res = await request(app)
      .patch(`/api/ana/platform/projects/${projectA2}`)
      .set(auth(tokenA))
      .send({ description: `${TAG} moved?`, organizationId: ORG_B });
    const row = await one('SELECT organization_id, description FROM projects WHERE id=$1', [projectA2]);
    expect(row.organization_id, "tenant A's project must stay in tenant A").toBe(ORG_A);
    expect(res.status).toBe(200);
    expect(row.description).toBe(`${TAG} moved?`);
  });

  it("a resolution bundle cannot be linked to another tenant's plan", async () => {
    const res = await request(app)
      .post('/api/resolution/bundles')
      .set(auth(tokenA))
      .send(bundle(planB));
    expect(
      (await one('SELECT bundle_id FROM resolution_plans WHERE id=$1', [planB])).bundle_id,
      "tenant B's plan must not be linked to tenant A's bundle"
    ).toBeNull();
    expect(
      await count('resolution_bundles WHERE plan_id=$1', [planB]),
      "no bundle may name tenant B's plan"
    ).toBe(0);
    expect(res.status, "another tenant's plan must be refused").toBe(400);
  });

  it("a resolution bundle is still linked to the caller's own plan", async () => {
    const res = await request(app)
      .post('/api/resolution/bundles')
      .set(auth(tokenA))
      .send(bundle(planA));
    expect(res.status).toBe(201);
    expect((await one('SELECT bundle_id::text AS id FROM resolution_plans WHERE id=$1', [planA])).id).toBe(
      res.body.bundle.id
    );
  });

  it("a corpus ingest cannot take over another org's report of the same study", async () => {
    // The ingest route hands the caller's org to this writer
    // (server/routes/corpus-routes.ts → ingestCtgovToCorpus); the study is the
    // one tenant B already holds.
    const outcome = await ingestAsA(nctB);
    expect(await reportRow(reportB), "tenant B's report and its details must stay tenant B's").toEqual({
      organization_id: ORG_B,
      report_title: `${TAG} tenant B report`,
      primary_objective: `${TAG} tenant B objective`,
    });
    // The corpus keys a study globally (csr_reports.nct_id and report_id are
    // unique across orgs), so a second org cannot hold its own copy: the write
    // is refused, and the ingest summary counts it as an error.
    expect(outcome).toBe('refused');
  });

  it("a corpus re-ingest still updates the org's own report in place", async () => {
    expect(await ingestAsA(nctA)).toBe('updated');
    expect(await reportRow(reportA)).toEqual({
      organization_id: ORG_A,
      report_title: `${TAG} re-ingested by A`,
      primary_objective: `${TAG} A objective`,
    });
  });

  it('/api/users/me refuses a password-only token awaiting its second factor', async () => {
    // The token authEnterprise issues between the password and the second
    // factor, claim for claim.
    const partial = jwt.sign(
      {
        userId: String(userA),
        email: emailA,
        organizationId: String(ORG_A),
        role: 'pending_mfa',
        mfaPending: true,
      },
      activeJwtSecret(),
      { expiresIn: '5m' }
    );
    const res = await request(app).get('/api/users/me').set(auth(partial));
    expect(JSON.stringify(res.body), 'a password-only session must not read the account').not.toContain(
      emailA
    );
    expect(res.status).toBe(401);
  });

  it('/api/users/me still answers an access token', async () => {
    const res = await request(app).get('/api/users/me').set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(emailA);
  });
});
