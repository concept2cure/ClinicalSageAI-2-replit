/**
 * L184 (D3): Report OS takes the tenant from the session, never the request.
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) under the
 * production posture that fixture asserts: `app_service`, not superuser, no
 * BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope middleware and the real
 * router. Moved from two-tenant-application-rls.dbtest.ts on 2026-09-24,
 * cases unchanged, so each tenant contract has its own file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportOsRouter from '../../server/routes/report-os';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  tokenB,
  userA,
  userB,
  ids,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(teardownTwoTenantFixture);

/**
 * L184 (D3, 2026-09-24): Report OS took the tenant from the request.
 *
 * Seven request schemas in server/routes/report-os.ts carried an
 * `organizationId`, and every handler behind them used it: GET /runs listed the
 * org the query named; POST /runs computed a report over the named org's data
 * and returned it; program groups, snapshots, bundles, deliveries and
 * correspondence capture read and wrote under it. PATCH /program-groups/:id had
 * no org check at all.
 *
 * Under enforcing RLS the database refuses most of that, so — as with governed
 * decisions (two-tenant-application-rls.dbtest.ts) — the assertions that tell a fixed handler from a broken one
 * are POSITIVE controls. Every request below comes from tenant B and names
 * tenant A. A handler that uses the named org asks the database for A's rows
 * and RLS answers with nothing, or refuses the write with a 500; a handler that
 * uses the session's org is served B's own. The negative assertions (nothing of
 * A's is returned, nothing lands in A) are what hold if RLS is ever off, which
 * is what the evidence's mutation runs exercise.
 *
 * Row counts are read through the OWNER pool, which is exempt from RLS: counting
 * through the app role would be circular, since a row RLS hid from the app would
 * look exactly like a row that was never written.
 */
// One describe keeps the fourteen cases and the fixture rows they share visibly
// one contract, as in the sibling suite.
// eslint-disable-next-line max-lines-per-function
describe('Report OS takes the tenant from the session, never the request (L184, D3)', () => {
  const TYPE_ID = `${TAG}.fixture_status`;
  let ro: express.Express;
  let runA: number;
  let runB: number;
  let groupA: number;
  let submissionA: string;
  let submissionB: string;

  const count = async (table: string, org: number) =>
    Number(
      (await owner.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id=$1`, [org]))
        .rows[0].n
    );

  beforeAll(async () => {
    // Mounted exactly as server/bootstrap/register-inline-routes.ts mounts it:
    // no outer middleware. The router applies server/auth's authMiddleware,
    // which establishes the request's tenant scope itself.
    ro = express();
    ro.use(express.json());
    ro.use('/api/report-os', reportOsRouter);

    /* A deployed database has no report types: no migration seeds
       report_type_registry, so POST /runs answers 404 there until someone seeds
       it through the dev-gated /taxonomy/seed route. The fixture type is the
       smallest row that route would write. */
    await owner.query(
      `INSERT INTO report_type_registry (type_id,label,family,allowed_scopes)
       VALUES ($1,$2,'readiness','["project","program"]'::json)`,
      [TYPE_ID, `${TAG} fixture status`]
    );
    for (const [side, org] of [
      ['A', ORG_A],
      ['B', ORG_B],
    ] as const) {
      const run = await owner.query(
        `INSERT INTO report_runs (organization_id,scope_type,scope_id,report_type_id,status,dependency_summary)
         VALUES ($1,'project',$2,$3,'completed',$4::json) RETURNING id`,
        [org, ids[side].projects, TYPE_ID, JSON.stringify({ summary: { fixture: `fixture-body-${side}` } })]
      );
      const submission = await owner.query(
        `INSERT INTO c2c_submissions (organization_id,project_id,submission_type,regulator,lifecycle_state)
         VALUES ($1,$2,'NDA','FDA','drafting') RETURNING id::text AS id`,
        [org, ids[side].projects]
      );
      if (side === 'A') {
        runA = run.rows[0].id;
        submissionA = submission.rows[0].id;
      } else {
        runB = run.rows[0].id;
        submissionB = submission.rows[0].id;
      }
    }
    const group = await owner.query(
      `INSERT INTO report_program_groups (organization_id,name) VALUES ($1,$2) RETURNING id`,
      [ORG_A, `${TAG}-group-A`]
    );
    groupA = group.rows[0].id;
    await owner.query(
      `INSERT INTO report_program_group_projects (program_group_id,project_id) VALUES ($1,$2)`,
      [groupA, ids.A.projects]
    );
  });

  /* One behaviour per case, so that no failure hides another: a leak and the
     positive control beside it report separately in every run, including the
     mutation runs filed as evidence. Every request is also valid under the old
     request schemas (which REQUIRED organizationId), so a red run fails on the
     handler's behaviour, never on a 400 from validation. */

  it("GET /runs never lists another tenant's run, whatever org the query names", async () => {
    const list = await request(ro)
      .get(`/api/report-os/runs?organizationId=${ORG_A}`)
      .set(auth(tokenB));
    expect(list.status).toBe(200);
    const listed = (list.body.data as Array<{ id: number }>).map(r => r.id);
    expect(listed, "tenant A's run must never be listed to tenant B").not.toContain(runA);
    expect(JSON.stringify(list.body)).not.toContain('fixture-body-A');
  });

  it("GET /runs lists the session tenant's own runs", async () => {
    const list = await request(ro)
      .get(`/api/report-os/runs?organizationId=${ORG_A}`)
      .set(auth(tokenB));
    expect(list.status).toBe(200);
    const listed = (list.body.data as Array<{ id: number }>).map(r => r.id);
    expect(listed, "tenant B's own run must be listed: the org is the session's").toContain(runB);
  });

  it('POST /runs records for the session tenant and user, whatever the body names', async () => {
    const runsInA = await count('report_runs', ORG_A);
    const created = await request(ro)
      .post('/api/report-os/runs')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        scopeType: 'project',
        scopeId: ids.B.projects,
        reportTypeId: TYPE_ID,
        requestedBy: userA,
      });
    expect(
      created.status,
      'a run request naming another org must run for the caller, not reach the database as that org'
    ).toBe(201);
    expect(created.body.data.run.organizationId).toBe(ORG_B);
    expect(created.body.data.run.requestedBy, 'the requester is the session user, not the body').toBe(
      userB
    );
    expect(await count('report_runs', ORG_A), 'nothing may land in tenant A').toBe(runsInA);
  });

  it("POST /runs over another tenant's project is not found and computes nothing", async () => {
    const runsInA = await count('report_runs', ORG_A);
    const overForeign = await request(ro)
      .post('/api/report-os/runs')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        scopeType: 'project',
        scopeId: ids.A.projects,
        reportTypeId: TYPE_ID,
      });
    expect(await count('report_runs', ORG_A), 'nothing may land in tenant A').toBe(runsInA);
    expect(JSON.stringify(overForeign.body)).not.toContain('fixture-body-A');
    expect(overForeign.status, "another tenant's project must read as not found").toBe(404);
  });

  it('a program group is made in the session tenant by the session user, whatever the body names', async () => {
    const groupsInA = await count('report_program_groups', ORG_A);
    const made = await request(ro)
      .post('/api/report-os/program-groups')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        name: `${TAG}-group-B`,
        projectIds: [Number(ids.B.projects)],
        createdBy: userA,
      });
    expect(made.status, 'a group request naming another org must be made for the caller').toBe(201);
    expect(made.body.data.organizationId).toBe(ORG_B);
    expect(made.body.data.createdBy, 'the creator is the session user, not the body').toBe(userB);
    expect(await count('report_program_groups', ORG_A)).toBe(groupsInA);
  });

  it("a program group over another tenant's project is refused", async () => {
    // Naming its OWN org: the request is legitimate in every respect but the
    // member. report_program_group_projects has no RLS, so this is the one
    // check here the database cannot make.
    const groupsInB = await count('report_program_groups', ORG_B);
    const overForeign = await request(ro)
      .post('/api/report-os/program-groups')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_B,
        name: `${TAG}-group-B-foreign`,
        projectIds: [Number(ids.A.projects)],
      });
    const crossMembers = await owner.query(
      `SELECT count(*)::int AS n
         FROM report_program_group_projects m
         JOIN report_program_groups g ON g.id = m.program_group_id
        WHERE g.organization_id = $1 AND m.project_id = $2`,
      [ORG_B, ids.A.projects]
    );
    expect(crossMembers.rows[0].n, "no group of tenant B may hold tenant A's project").toBe(0);
    expect(await count('report_program_groups', ORG_B)).toBe(groupsInB);
    expect(overForeign.status, "a group over another tenant's project must be refused").toBe(400);
  });

  it("another tenant's program group cannot be changed", async () => {
    const patched = await request(ro)
      .patch(`/api/report-os/program-groups/${groupA}`)
      .set(auth(tokenB))
      .send({ name: `${TAG}-TAMPERED`, projectIds: [Number(ids.B.projects)] });
    const stillA = await owner.query(
      `SELECT g.name, array_agg(m.project_id::text) AS members
         FROM report_program_groups g
         LEFT JOIN report_program_group_projects m ON m.program_group_id = g.id
        WHERE g.id = $1 GROUP BY g.name`,
      [groupA]
    );
    expect(stillA.rows[0], "tenant A's group must be exactly as tenant A left it").toEqual({
      name: `${TAG}-group-A`,
      members: [ids.A.projects],
    });
    expect(patched.status, "another tenant's group must read as not found").toBe(404);
  });

  it("another tenant's program group cannot be snapshotted", async () => {
    const snapshotsOfA = async () =>
      Number(
        (
          await owner.query(
            'SELECT count(*)::int AS n FROM report_program_group_snapshots WHERE program_group_id=$1',
            [groupA]
          )
        ).rows[0].n
      );
    const before = await snapshotsOfA();
    const snap = await request(ro)
      .post(`/api/report-os/program-groups/${groupA}/snapshots`)
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, snapshotLabel: `${TAG}-snap` });
    expect(
      snap.body?.data?.projectIds ?? [],
      "tenant A's group membership must not be returned to tenant B"
    ).not.toContain(Number(ids.A.projects));
    expect(await snapshotsOfA(), "no snapshot of tenant A's group may be written").toBe(before);
    expect(snap.status, "another tenant's group must read as not found").toBe(404);
  });

  it("a bundle cannot take another tenant's run", async () => {
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/bundles')
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, name: `${TAG}-bundle-foreign`, runIds: [runA] });
    expect(
      foreign.body?.data?.runIds ?? [],
      "tenant A's run must not be bundled for tenant B"
    ).not.toContain(runA);
    expect(await count('project_memory_entries', ORG_A), 'nothing may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's run must read as not found").toBe(400);
  });

  it("a bundle of the session tenant's own run is stored and records the session user", async () => {
    const bundle = await request(ro)
      .post('/api/report-os/bundles')
      .set(auth(tokenB))
      .send({ organizationId: ORG_A, name: `${TAG}-bundle-B`, runIds: [runB], createdBy: userA });
    expect(bundle.status, 'tenant B must be able to bundle its own run whatever org the body names').toBe(
      201
    );
    expect(bundle.body.data.organizationId).toBe(ORG_B);
    expect(bundle.body.data.createdBy, 'the creator is the session user, not the body').toBe(userB);
    const bundlesB = await request(ro).get('/api/report-os/bundles').set(auth(tokenB));
    expect(
      (bundlesB.body.data as Array<{ bundleId: string }>).map(b => b.bundleId),
      'a bundle answered 201 must be one that was stored'
    ).toContain(bundle.body.data.bundleId);
    const bundlesA = await request(ro).get('/api/report-os/bundles').set(auth(tokenA));
    expect(JSON.stringify(bundlesA.body)).not.toContain(bundle.body.data.bundleId);
  });

  it("a delivery cannot take another tenant's run", async () => {
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        runId: runA,
        channel: 'external_pdf_export',
        subject: `${TAG} foreign delivery`,
      });
    expect(
      foreign.body?.data?.organizationId,
      "a delivery of tenant A's run must not be recorded in tenant A"
    ).not.toBe(ORG_A);
    expect(await count('project_memory_entries', ORG_A), 'nothing may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's run must read as not found").toBe(404);
  });

  it("a delivery of the session tenant's own run records the session user", async () => {
    const delivery = await request(ro)
      .post('/api/report-os/deliveries')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        runId: runB,
        channel: 'external_pdf_export',
        subject: `${TAG} own delivery`,
        requestedBy: userA,
      });
    expect(delivery.status, 'tenant B must be able to deliver its own run').toBe(201);
    expect(delivery.body.data.organizationId).toBe(ORG_B);
    expect(delivery.body.data.requestedBy, 'the requester is the session user, not the body').toBe(
      userB
    );
  });

  it("correspondence cannot be captured into another tenant's project", async () => {
    const inA = await count('c2c_correspondence', ORG_A);
    const memoryInA = await count('project_memory_entries', ORG_A);
    const foreign = await request(ro)
      .post('/api/report-os/correspondence/capture')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        projectId: Number(ids.A.projects),
        submissionId: submissionA,
        subject: `${TAG} planted deficiency`,
        body: 'Refuse to file: planted by another tenant.',
      });
    expect(await count('c2c_correspondence', ORG_A), 'no letter may land in tenant A').toBe(inA);
    expect(await count('project_memory_entries', ORG_A), 'no memory may land in tenant A').toBe(
      memoryInA
    );
    expect(foreign.status, "another tenant's project must read as not found").toBe(404);
  });

  it("correspondence is captured into the session tenant's own project and submission", async () => {
    const inB = await count('c2c_correspondence', ORG_B);
    const own = await request(ro)
      .post('/api/report-os/correspondence/capture')
      .set(auth(tokenB))
      .send({
        organizationId: ORG_A,
        projectId: Number(ids.B.projects),
        submissionId: submissionB,
        subject: `${TAG} own correspondence`,
        body: 'Deficiency letter: clarification requested on the stability section.',
      });
    expect(own.status, 'tenant B must be able to capture into its own project').toBe(201);
    expect(own.body.data.persistedToPlatform).toBe(true);
    expect(await count('c2c_correspondence', ORG_B)).toBe(inB + 1);
  });
});
