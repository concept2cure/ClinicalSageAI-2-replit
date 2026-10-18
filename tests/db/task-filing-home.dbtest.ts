/** Exact legacy filing handoff on the deployed schema and genuine authenticated
 * request connection. All data is disposable synthetic audit fixture data.
 * No role, policy, schema or regulated filing mutation is installed by this test.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import { isTaskFilingHome } from '../../shared/types/task-filing-home';
import { resolveNotificationRecordTarget, NotificationTargetRefusal } from '../../server/services/notifications/notification-record-target';
import { createNotification } from '../../server/services/notifications/notification-service';

const ORG = 94640;
const FOREIGN_ORG = 94641;
const PROGRAM = randomUUID();
const DELETED_PROGRAM = randomUUID();
const PREFIX = 'Synthetic native task filing audit';
const BASE = '/api/task-management/filings';
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let userId: number;
let otherUserId: number;
let token: string;
let projectId: number;
let privateProjectId: number;
let unanchoredProjectId: number;
let deletedProgramProjectId: number;
let foreignProjectId: number;
let filingId: string;
let privateFilingId: string;
let unattachedFilingId: string;
let unanchoredFilingId: string;
let deletedProgramFilingId: string;
let foreignFilingId: string;
let foreignProjectFilingId: string;
let missingProjectFilingId: string;
let ownTaskId: string;
let ownReportId: number;
let ownTaskNotice: number;
let ownReportNotice: number;
let privateTaskNotice: number;
let privateReportNotice: number;
let foreignTaskNotice: number;
let foreignReportNotice: number;
let foreignNotice: number;
let control: 'none' | 'remove-member' | 'deactivate-account' | 'filing-query-failure' = 'none';

const read = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const filing = (id: string) => read(`${BASE}/${id}`);
const target = (id: number) => read(`/native-notification-target/${id}`);

async function createNotificationFixtures() {
  for (const [organizationId, anchor] of [[ORG, privateProjectId], [FOREIGN_ORG, foreignProjectId]]) {
    const programId = randomUUID();
    await owner.query(`INSERT INTO regulatory_programs
      (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
      VALUES ($1,$2,$3,$4,'ind','small_molecule','FDA','Synthetic notice product',$5)`,
    [programId, organizationId, `${PREFIX} notification programme`, `SYN-NOTICE-${programId}`, otherUserId]);
    await owner.query('UPDATE projects SET regulatory_program_id=$1 WHERE organization_id=$2 AND id=$3', [programId, organizationId, anchor]);
  }
  const makeTask = async (organizationId: number, anchor: number) => {
    const taskId = `TASK-SYNTHETIC-FILING-${randomUUID()}`;
    await owner.query(`INSERT INTO unified_tasks (task_id,organization_id,project_id,module_type,title)
      VALUES ($1,$2,$3,'Vault',$4)`, [taskId, organizationId, anchor, `${PREFIX} notification task`]);
    return taskId;
  };
  const makeReport = async (organizationId: number, anchor: number) => Number((await owner.query(`INSERT INTO report_runs
    (organization_id,scope_type,scope_id,report_type_id,requested_by)
    VALUES ($1,'project',$2,'readiness.executive_digest',$3) RETURNING id`, [organizationId, String(anchor), otherUserId])).rows[0].id);
  const makeNotice = (kind: string, id: string | number, organizationId = ORG, recipientUserId = userId) => createNotification({
    organizationId, recipientUserId, category: 'system', severity: 'info', title: `${PREFIX} canonical target`, resourceType: kind, resourceId: String(id),
  }, owner);
  ownTaskId = await makeTask(ORG, projectId);
  ownReportId = await makeReport(ORG, projectId);
  ownTaskNotice = await makeNotice('unified_task', ownTaskId);
  ownReportNotice = await makeNotice('report_run', ownReportId);
  privateTaskNotice = await makeNotice('unified_task', await makeTask(ORG, privateProjectId));
  privateReportNotice = await makeNotice('report_run', await makeReport(ORG, privateProjectId));
  foreignTaskNotice = await makeNotice('unified_task', await makeTask(FOREIGN_ORG, foreignProjectId));
  foreignReportNotice = await makeNotice('report_run', await makeReport(FOREIGN_ORG, foreignProjectId));
  foreignNotice = await makeNotice('project', foreignProjectId, FOREIGN_ORG, otherUserId);
}

async function createProject(organizationId: number, workspaceId: number, name: string, actorId = userId) {
  const result = await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings)
    VALUES ($1,$2,$3,'regulatory','active',$4,$4,'{"projectSharing":{"visibility":"private","members":[]}}') RETURNING id`,
  [organizationId, workspaceId, name, actorId]);
  return Number(result.rows[0].id);
}

async function createFiling(organizationId: number, project: number | null, title: string) {
  const result = await owner.query(`INSERT INTO estar_submissions
    (organization_id,project_id,catalog_key,program_type,variant,title,status,fda_tracking_number,
      filed_at,review_goal_days,decision_due_at,notes,created_by)
    VALUES ($1,$2,'510k-original','510k','device',$3,'under_review','SYNTHETIC-NOT-FDA',
      '2026-10-01T12:00:00Z',90,'2026-12-30T12:00:00Z',$4,$5) RETURNING id`,
  [organizationId, project, title, 'Synthetic database proof; not an actual agency filing.', userId]);
  return String(result.rows[0].id);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for the native non-superuser filing handoff proof.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,$3,'synthetic-native-task-filing-audit','active'),
    ($2,$4,'synthetic-native-task-filing-foreign-audit','active') ON CONFLICT(id) DO NOTHING`,
  [ORG, FOREIGN_ORG, PREFIX, `${PREFIX} foreign`]);
  const organizations = await owner.query('SELECT id,name,status FROM organizations WHERE id=ANY($1::integer[]) ORDER BY id', [[ORG, FOREIGN_ORG]]);
  expect(organizations.rows).toEqual([
    { id: ORG, name: PREFIX, status: 'active' },
    { id: FOREIGN_ORG, name: `${PREFIX} foreign`, status: 'active' },
  ]);
  const passwordHash = await bcrypt.hash('Synthetic-native-task-filing-only!', 4);
  const account = await owner.query(`INSERT INTO users (email,name,status,password_hash)
    VALUES ('synthetic-native-task-filing@example.invalid','Synthetic filing reader','active',$1)
    ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`, [passwordHash]);
  userId = Number(account.rows[0].id);
  otherUserId = Number((await owner.query(`INSERT INTO users (email,name,status,password_hash)
    VALUES ('synthetic-native-task-filing-owner@example.invalid','Synthetic other project owner','active',$1)
    ON CONFLICT(email) DO UPDATE SET status='active' RETURNING id`, [passwordHash])).rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
    VALUES ($1,$2,'member',now()-interval '1 day'),($1,$3,'member',now()-interval '1 day'),($4,$3,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at`,
  [ORG, userId, otherUserId, FOREIGN_ORG]);
  const workspaceId = Number((await owner.query(`INSERT INTO client_workspaces (organization_id,name,slug)
    VALUES ($1,$2,'synthetic-task-filing-native') ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,
  [ORG, PREFIX])).rows[0].id);
  const foreignWorkspaceId = Number((await owner.query(`INSERT INTO client_workspaces (organization_id,name,slug)
    VALUES ($1,$2,'synthetic-task-filing-native-foreign') ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,
  [FOREIGN_ORG, `${PREFIX} foreign`])).rows[0].id);
  projectId = await createProject(ORG, workspaceId, `${PREFIX} anchored`);
  privateProjectId = await createProject(ORG, workspaceId, `${PREFIX} denied`, otherUserId);
  unanchoredProjectId = await createProject(ORG, workspaceId, `${PREFIX} unanchored`);
  deletedProgramProjectId = await createProject(ORG, workspaceId, `${PREFIX} deleted programme`);
  foreignProjectId = await createProject(FOREIGN_ORG, foreignWorkspaceId, `${PREFIX} foreign`, otherUserId);
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,deleted_at)
    VALUES ($1,$2,$3,$4,'ind','small_molecule','FDA','Synthetic filing product',$5,NULL),
      ($6,$2,$7,$8,'ind','small_molecule','FDA','Synthetic deleted product',$5,now())`,
  [PROGRAM, ORG, `${PREFIX} programme`, `SYN-FILING-${PROGRAM}`, userId,
    DELETED_PROGRAM, `${PREFIX} deleted programme`, `SYN-FILING-${DELETED_PROGRAM}`]);
  await owner.query('UPDATE projects SET regulatory_program_id=$1 WHERE organization_id=$2 AND id=$3', [PROGRAM, ORG, projectId]);
  await owner.query('UPDATE projects SET regulatory_program_id=$1 WHERE organization_id=$2 AND id=$3', [DELETED_PROGRAM, ORG, deletedProgramProjectId]);
  filingId = await createFiling(ORG, projectId, `${PREFIX} exact row`);
  privateFilingId = await createFiling(ORG, privateProjectId, `${PREFIX} private row`);
  unattachedFilingId = await createFiling(ORG, null, `${PREFIX} unattached row`);
  unanchoredFilingId = await createFiling(ORG, unanchoredProjectId, `${PREFIX} unanchored row`);
  deletedProgramFilingId = await createFiling(ORG, deletedProgramProjectId, `${PREFIX} deleted programme row`);
  foreignFilingId = await createFiling(FOREIGN_ORG, foreignProjectId, `${PREFIX} foreign row`);
  // These are legal legacy integer references; no schema constraint is removed
  // to synthesize an inconsistent record the deployed reader must refuse.
  foreignProjectFilingId = await createFiling(ORG, foreignProjectId, `${PREFIX} foreign project reference`);
  const missingProject = 2147483001;
  expect((await owner.query('SELECT id FROM projects WHERE id=$1', [missingProject])).rows).toEqual([]);
  missingProjectFilingId = await createFiling(ORG, missingProject, `${PREFIX} missing project reference`);
  await createNotificationFixtures();
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'member' }, activeJwtSecret(), { expiresIn: '1h' });
  const { authMiddleware } = await import('../../server/auth');
  app = express();
  app.get('/native-notification-target/:id', authMiddleware, async (req, res) => {
    try {
      const data = await resolveNotificationRecordTarget({ client: requestPgClient(req), organizationId: Number(req.tenantId),
        userId: Number(req.userId), email: req.userEmail ?? null, notificationId: Number(req.params.id) });
      res.json({ success: true, data });
    } catch (error) {
      res.status(error instanceof NotificationTargetRefusal ? error.status : 500).json({ success: false });
    }
  });
  app.get('/native-filing-scope', authMiddleware, async (req, res) => {
    const result = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_user_role',true) AS policy_role,
      current_setting('app.current_tenant_id',true) AS tenant_id`);
    res.json({ ...result.rows[0], alsTenantId: getTenantScope()?.tenantId,
      lazyRequestClient: req.dbClient instanceof LazyRequestDbClient });
  });
  const afterGenuineAdmission: express.RequestHandler = async (req, _res, next) => {
    try {
      if (control === 'remove-member') {
        await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, userId]);
      } else if (control === 'deactivate-account') {
        await owner.query("UPDATE users SET status='inactive' WHERE id=$1", [userId]);
      } else if (control === 'filing-query-failure') {
        const client = req.dbClient;
        if (!client) throw new Error('Genuine request client was not established');
        const query = client.query.bind(client);
        client.query = ((...args: unknown[]) => {
          const first = args[0];
          const sql = typeof first === 'string' ? first : first && typeof first === 'object' && 'text' in first ? String(first.text) : '';
          if (/estar_submissions/i.test(sql)) throw new Error('Synthetic pinned filing database verification failure');
          return Reflect.apply(query, client, args);
        }) as typeof client.query;
      }
      next();
    } catch (error) { next(error); }
  };
  app.use('/api/task-management', authMiddleware, afterGenuineAdmission,
    (await import('../../server/routes/taskBoard.routes')).default());
});

afterAll(async () => {
  control = 'none';
  if (owner) await owner.end();
  if (runtime) await runtime.end();
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end();
});

describe('exact native filing handoff under authenticated FORCE RLS', () => {
  it('uses canonical auth, async tenant scope and a lazy pinned non-superuser request connection', async () => {
    const who = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(who).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(who.role).not.toBe('postgres');
    const scope = await read('/native-filing-scope');
    expect(scope.status, JSON.stringify(scope.body)).toBe(200);
    expect(scope.body).toMatchObject({ role: who.role, policy_role: 'member', tenant_id: String(ORG), alsTenantId: String(ORG), lazyRequestClient: true });
    const policies = await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN
      ('estar_submissions'::regclass,'projects'::regclass,'regulatory_programs'::regclass,'organization_users'::regclass,'users'::regclass,
       'mdx_notifications'::regclass,'unified_tasks'::regclass,'report_runs'::regclass)`);
    expect(policies.rows).toHaveLength(8);
    expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    // This deliberately unscoped separate connection is only a fail-closed
    // control. It does not imply that the instrumented pool fails under ALS.
    expect((await runtime.query('SELECT id FROM estar_submissions WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });

  it('refreshes the exact retained record and separates its real integer project from its actual programme UUID', async () => {
    const before = (await owner.query('SELECT to_jsonb(f) AS row FROM estar_submissions f WHERE id=$1', [filingId])).rows[0].row;
    const response = await filing(filingId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
    expect(isTaskFilingHome(response.body.data, filingId)).toBe(true);
    expect(response.body.data.home).toEqual({ source: 'filing', nativeId: filingId, projectId, programId: PROGRAM, programTitle: `${PREFIX} programme` });
    expect(response.body.data.filing).toMatchObject({ id: filingId, title: `${PREFIX} exact row`, status: 'under_review',
      filedAt: '2026-10-01T12:00:00.000Z', reviewGoalDays: 90, decisionDueAt: '2026-12-30T12:00:00.000Z',
      fdaTrackingNumber: 'SYNTHETIC-NOT-FDA', filedArtifactDocumentId: null, filedArtifactSha256: null });
    expect(response.body.data.filing.organizationId).toBeUndefined();
    expect(response.body.data.filing.createdBy).toBeUndefined();
    expect(response.body.data.filing.projectId).toBeUndefined();
    expect((await filing(filingId)).body.data).toEqual(response.body.data);
    expect((await owner.query('SELECT to_jsonb(f) AS row FROM estar_submissions f WHERE id=$1', [filingId])).rows[0].row).toEqual(before);
  });

  it('retains unattached, unanchored and deleted-programme records without guessing a programme', async () => {
    for (const [id, recordedProject] of [[unattachedFilingId, null], [unanchoredFilingId, unanchoredProjectId],
      [deletedProgramFilingId, deletedProgramProjectId]] as const) {
      const response = await filing(id);
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.data.home).toEqual({ source: 'filing', nativeId: id, projectId: recordedProject, programId: null, programTitle: null });
    }
  });

  it('refuses malformed identifiers, foreign/missing filings and invalid recorded project ownership', async () => {
    for (const id of ['not-a-uuid', String(projectId)]) expect((await filing(id)).status).toBe(400);
    for (const id of [randomUUID(), foreignFilingId, foreignProjectFilingId, missingProjectFilingId]) {
      const response = await filing(id);
      expect(response.status, JSON.stringify(response.body)).toBe(404);
      expect(response.body).toMatchObject({ success: false, code: 'FILING_NOT_FOUND' });
      expect(response.body.data).toBeUndefined();
    }
    expect((await request(app).get(`${BASE}/${filingId}`)).status).toBe(401);
  });

  it('honors actual private-project grant, revocation and read recovery for a regular organization member', async () => {
    expect((await filing(privateFilingId)).status).toBe(403);
    await owner.query(`INSERT INTO project_members (organization_id,project_id,user_id,role,status,invited_by_id,accepted_at)
      VALUES ($1,$2,$3,'use','active',$4,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET status='active',role='use'`,
    [ORG, privateProjectId, userId, otherUserId]);
    try {
      expect((await filing(privateFilingId)).status).toBe(200);
      await owner.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3", [ORG, privateProjectId, userId]);
      const revoked = await filing(privateFilingId);
      expect(revoked.status).toBe(403); expect(revoked.body.code).toBe('FILING_ACCESS_DENIED');
      await owner.query("UPDATE project_members SET status='active' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3", [ORG, privateProjectId, userId]);
      expect((await filing(privateFilingId)).status).toBe(200);
    } finally {
      await owner.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3", [ORG, privateProjectId, userId]);
    }
  });

  it('rechecks persisted organization membership after genuine authentication and recovers after restoration', async () => {
    control = 'remove-member';
    try {
      const revoked = await filing(filingId);
      expect(revoked.status, JSON.stringify(revoked.body)).toBe(403);
      expect(revoked.body.code).toBe('FILING_ACCESS_DENIED');
    } finally {
      control = 'none';
      await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
        VALUES ($1,$2,'member',now()-interval '1 day') ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member'`, [ORG, userId]);
      (await import('../../server/middleware/orgMembership')).invalidateOrgMembershipCache(userId, ORG);
    }
    expect((await filing(filingId)).status).toBe(200);
  });

});

describe('native filing access failure and recovery', () => {
  it('resolves actual task and saved-report notifications through both programme helper callers with fresh sharing', async () => {
    const task = await target(ownTaskNotice);
    expect(task.status, JSON.stringify(task.body)).toBe(200);
    expect(task.body.data).toMatchObject({ surface: 'tasks', params: { taskId: ownTaskId }, programId: PROGRAM });
    const report = await target(ownReportNotice);
    expect(report.status, JSON.stringify(report.body)).toBe(200);
    expect(report.body.data).toMatchObject({ surface: 'insights', params: { reportRunId: String(ownReportId) }, programId: PROGRAM });
    for (const id of [privateTaskNotice, privateReportNotice, foreignTaskNotice, foreignReportNotice, foreignNotice]) {
      expect((await target(id)).status).toBe(404);
    }
    await owner.query(`INSERT INTO project_members (organization_id,project_id,user_id,role,status,invited_by_id,accepted_at)
      VALUES ($1,$2,$3,'use','active',$4,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET status='active',role='use'`,
    [ORG, privateProjectId, userId, otherUserId]);
    try {
      for (const id of [privateTaskNotice, privateReportNotice]) expect((await target(id)).status).toBe(200);
      await owner.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3", [ORG, privateProjectId, userId]);
      for (const id of [privateTaskNotice, privateReportNotice]) expect((await target(id)).status).toBe(404);
    } finally {
      await owner.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3", [ORG, privateProjectId, userId]);
    }
  });

  it('keeps the existing populated task board connected to the same canonical programme bridge', async () => {
    const board = await read('/api/task-management/board');
    expect(board.status, JSON.stringify(board.body)).toBe(200);
    expect(board.body.success).toBe(true);
    expect(board.body.meta.unreadSources).not.toContain('estar_submissions');
    const cards = board.body.data as Array<{ taskId: string; project: string; readOnly?: boolean; home?: Record<string, unknown> }>;
    const card = cards.find(row => row.taskId === `filing:${filingId}`);
    expect(card).toMatchObject({ project: String(projectId), readOnly: true, home: {
      surface: 'submission-center', source: 'filing', nativeId: filingId,
      projectId, programId: PROGRAM, programTitle: `${PREFIX} programme`,
    } });
    expect(cards.some(row => row.taskId === `filing:${foreignFilingId}`)).toBe(false);
  });

  it('rechecks active account status after genuine authentication and recovers after restoration', async () => {
    control = 'deactivate-account';
    try {
      const inactive = await filing(filingId);
      expect(inactive.status, JSON.stringify(inactive.body)).toBe(403);
      expect(inactive.body.code).toBe('FILING_ACCESS_DENIED');
    } finally { control = 'none'; await owner.query("UPDATE users SET status='active' WHERE id=$1", [userId]); }
    // Account deactivation canonically ends previous sessions. Restoration
    // does not revive that old bearer; a newly issued session must be used.
    expect((await filing(filingId)).status).toBe(401);
    const ended = (await owner.query('SELECT sessions_ended_at FROM users WHERE id=$1', [userId])).rows[0].sessions_ended_at;
    await (await import('../../server/services/account-standing')).untilStampHasBegun(ended);
    const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
    token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'member' }, activeJwtSecret(), { expiresIn: '1h' });
    expect((await filing(filingId)).status).toBe(200);
  });

  it('reports a failed pinned filing query as unavailable and recovers to the same exact record', async () => {
    control = 'filing-query-failure';
    try {
      const failed = await filing(filingId);
      expect(failed.status, JSON.stringify(failed.body)).toBe(503);
      expect(failed.body).toMatchObject({ success: false, code: 'FILING_READ_UNAVAILABLE' });
      expect(failed.body.data).toBeUndefined();
    } finally { control = 'none'; }
    expect((await filing(filingId)).body.data.filing.id).toBe(filingId);
  });
});
