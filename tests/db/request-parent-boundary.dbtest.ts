/**
 * D3: a request cannot hang a row from another tenant's parent, or write a row
 * that is not the caller's (ledger L195).
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) under the
 * production posture that fixture asserts: `app_service`, not superuser, no
 * BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope middleware and the real
 * routers.
 *
 * Each case below is one RLS does not stop:
 *  - a foreign key is checked by Postgres without RLS, so naming another
 *    tenant's CRO client, parent task or GSPR program is accepted — and pins
 *    that tenant's row, whose delete then fails;
 *  - complaints and notification_preferences have no RLS policy at all;
 *  - an AnA profile planted onto a colleague is a same-org write.
 * So the negative assertion in each case is the leak itself, and it is read
 * through the OWNER pool, which is exempt from RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateToken } from '../../server/middleware/auth';
import { runWithPreAuthScope, runWithTenantScope } from '../../server/db/tenantStore';
import capaMdrRouter from '../../server/routes/capa-mdr';
import usersRouter from '../../server/routes/users';
import clientIntelligenceRouter from '../../server/routes/client-intelligence';
import taskRouter from '../../server/routes/c2c/tasks';
import croRouter from '../../server/routes/cro';
import { gsprMappingUpsert } from '../../server/services/ana-ri/mdx-command-handlers-phase2';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  userA,
  userB,
  ids,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(teardownTwoTenantFixture);

const count = async (sql: string, params: unknown[]) =>
  Number((await owner.query(`SELECT count(*)::int AS n FROM ${sql}`, params)).rows[0].n);

// One describe keeps the rows the cases share visibly one contract, as in the
// sibling suites.
// eslint-disable-next-line max-lines-per-function
describe("A request cannot name another tenant's parent, or write another user's row (D3, L195)", () => {
  let app: express.Express;
  let progA: string;
  let progB: string;
  let complaintB: string;
  let colleagueA: number;
  let taskB: number;
  let clientB: number;
  let requirementId: string;

  beforeAll(async () => {
    // Mounted as production mounts them. capa-mdr and c2c tasks authenticate
    // themselves; users verifies its own token behind the pre-auth scope
    // server/bootstrap/register-platform-routes.ts declares (reproduced here,
    // since it is a closure there); client-intelligence and cro sit behind
    // authenticateToken.
    const preAuthScope: express.RequestHandler = (req, _res, next) =>
      runWithPreAuthScope(`auth:${req.method} ${req.path}`, next);
    app = express();
    app.use(express.json());
    app.use('/api/capa-mdr', capaMdrRouter);
    app.use('/api/users', preAuthScope, usersRouter);
    app.use('/api/client-intelligence', authenticateToken, clientIntelligenceRouter);
    app.use('/api/concept2cure', authenticateToken, taskRouter);
    app.use('/api/cro', authenticateToken, croRouter);

    const programs = await owner.query(
      `INSERT INTO regulatory_programs
         (organization_id, name, code, program_type, product_type, primary_agency, product_name)
       VALUES ($1,$2,'WO3-PA','device','samd','FDA','fixture-A'),
              ($3,$4,'WO3-PB','device','samd','FDA','fixture-B')
       RETURNING id::text AS id`,
      [ORG_A, `${TAG}-program-A`, ORG_B, `${TAG}-program-B`]
    );
    [progA, progB] = programs.rows.map(r => r.id);

    complaintB = (
      await owner.query(
        `INSERT INTO complaints (program_id, complaint_code, source, channel, received_at, event_narrative)
         VALUES ($1,'CMP-B','customer','email',now(),$2) RETURNING id::text AS id`,
        [progB, `${TAG} fixture complaint B`]
      )
    ).rows[0].id;

    colleagueA = (
      await owner.query(
        `INSERT INTO users (email,name,password_hash,default_organization_id)
         VALUES ($1,'WO3 colleague A','not-a-real-password',$2) RETURNING id`,
        [`${TAG}-colleague-a@example.invalid`, ORG_A]
      )
    ).rows[0].id;
    await owner.query(
      `INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,'member')`,
      [ORG_A, colleagueA]
    );

    taskB = (
      await owner.query(
        `INSERT INTO project_tasks (organization_id, project_id, name) VALUES ($1,$2,$3) RETURNING id`,
        [ORG_B, ids.B.projects, `${TAG}-task-B`]
      )
    ).rows[0].id;

    clientB = (
      await owner.query(
        `INSERT INTO cro_clients (organization_id, name, company_type) VALUES ($1,$2,'sponsor') RETURNING id`,
        [ORG_B, `${TAG}-client-B`]
      )
    ).rows[0].id;

    requirementId = (
      await owner.query(
        `INSERT INTO gspr_requirements (regulation, clause, title) VALUES ('EU_MDR',$1,$2) RETURNING id::text AS id`,
        [`${TAG}`.slice(0, 32), `${TAG} fixture requirement`]
      )
    ).rows[0].id;
  });

  it("an MDR event cannot be sourced from another tenant's complaint", async () => {
    const res = await request(app)
      .post('/api/capa-mdr/mdr-events')
      .set(auth(tokenA))
      .send({
        programId: progA,
        sourceComplaintId: complaintB,
        // 'other' carries no reporting clock, so nothing but the link is exercised.
        jurisdiction: 'other',
        decisionDate: new Date().toISOString(),
        eventNarrative: `${TAG} planted MDR`,
      });
    const linked = (
      await owner.query('SELECT linked_mdr_event_id FROM complaints WHERE id=$1', [complaintB])
    ).rows[0].linked_mdr_event_id;
    expect(linked, "tenant B's complaint must not be linked to tenant A's MDR event").toBeNull();
    expect(
      await count('mdr_events WHERE source_complaint_id=$1', [complaintB]),
      "no MDR event may name tenant B's complaint"
    ).toBe(0);
    expect(res.status, "another tenant's complaint must read as not found").toBe(404);
  });

  it("an MDR event is still sourced from the caller's own complaint, under the complaint and MDR policies", async () => {
    // Positive control for the case above, and for ledger L201, which put
    // complaints and mdr_events under row security: the tenant's own flow must
    // still link.
    const own = (
      await owner.query(
        `INSERT INTO complaints (program_id, complaint_code, source, channel, received_at, event_narrative)
         VALUES ($1,'CMP-A','customer','email',now(),$2) RETURNING id::text AS id`,
        [progA, `${TAG} fixture complaint A`]
      )
    ).rows[0].id;
    const res = await request(app)
      .post('/api/capa-mdr/mdr-events')
      .set(auth(tokenA))
      .send({
        programId: progA,
        sourceComplaintId: own,
        jurisdiction: 'other',
        decisionDate: new Date().toISOString(),
        eventNarrative: `${TAG} own MDR`,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const linked = (await owner.query('SELECT linked_mdr_event_id FROM complaints WHERE id=$1', [own])).rows[0]
      .linked_mdr_event_id;
    expect(linked, "the caller's complaint must be linked to its MDR event").toBeTruthy();
  });

  it('notification preferences are written for the caller, whatever userId the body names', async () => {
    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set(auth(tokenA))
      .send({ userId: userB, emailDigest: 'weekly' });
    expect(
      await count('notification_preferences WHERE user_id=$1', [userB]),
      "no preference row may be written for tenant B's user"
    ).toBe(0);
    expect(res.status).toBe(200);
    const own = await owner.query('SELECT email_digest FROM notification_preferences WHERE user_id=$1', [
      userA,
    ]);
    expect(own.rows, "the caller's own preferences must be the ones written").toEqual([
      { email_digest: 'weekly' },
    ]);
  });

  it("an AnA profile edit writes the caller's profile, never a colleague's", async () => {
    const res = await request(app)
      .post('/api/client-intelligence/ana/user-profile')
      .set(auth(tokenA))
      .send({ userId: colleagueA, personalInstructions: `${TAG} planted instructions` });
    expect(
      await count('user_intelligence_profiles WHERE user_id=$1', [colleagueA]),
      "no profile may be planted onto a colleague's AnA"
    ).toBe(0);
    expect(res.status).toBe(200);
    const own = await owner.query(
      'SELECT personal_instructions FROM user_intelligence_profiles WHERE user_id=$1 AND organization_id=$2',
      [userA, ORG_A]
    );
    expect(own.rows).toEqual([{ personal_instructions: `${TAG} planted instructions` }]);
  });

  it("a task cannot be filed under another tenant's task", async () => {
    const res = await request(app)
      .post(`/api/concept2cure/projects/${ids.A.projects}/tasks`)
      .set(auth(tokenA))
      .send({ name: `${TAG}-subtask`, parentTaskId: taskB });
    expect(
      await count('project_tasks WHERE parent_task_id=$1', [taskB]),
      "no task may hang from tenant B's task"
    ).toBe(0);
    expect(res.status, "another tenant's task must read as not found").toBe(404);
  });

  it("a CRO study cannot be filed against another tenant's client", async () => {
    const res = await request(app)
      .post('/api/cro/studies')
      .set(auth(tokenA))
      .send({
        clientId: clientB,
        studyNumber: `${TAG}-S1`,
        studyTitle: `${TAG} study`,
        studyType: 'interventional',
        therapeuticArea: 'oncology',
        indication: 'fixture',
      });
    expect(
      await count('cro_studies WHERE client_id=$1 AND organization_id=$2', [clientB, ORG_A]),
      "no study of tenant A may name tenant B's client"
    ).toBe(0);
    expect(res.status, "another tenant's client must read as not found").toBe(404);
  });

  it("the GSPR mapping tool cannot write against another tenant's program", async () => {
    const result = await runWithTenantScope(
      { tenantId: String(ORG_A), role: 'member', source: 'test', caller: 'l195-gspr-tool' },
      () =>
        gsprMappingUpsert({ userId: userA, organizationId: ORG_A } as never, {
          programId: progB,
          requirementId,
          applicability: 'applicable',
          confirm: 'yes',
          reason: 'D3 contract: a program id from another tenant',
        })
    );
    expect(
      await count('gspr_program_mappings WHERE program_id=$1', [progB]),
      "no mapping may be written against tenant B's program"
    ).toBe(0);
    expect(result.success).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
  });
});
