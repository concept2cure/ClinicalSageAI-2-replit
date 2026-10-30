import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ query: vi.fn(), actor: 1, roleClaim: 'super_admin', fail: false }));
vi.mock('../../db', () => ({ pool: { query: state.query }, getPool: () => ({ query: state.query }) }));
import notifications from '../mdx-notifications';
let database: PGlite;
const PROGRAM = '10000000-0000-4000-8000-000000000001';
const OTHER_PROGRAM = '20000000-0000-4000-8000-000000000002';
const DOC = '30000000-0000-4000-8000-000000000003';
const SECTION = '40000000-0000-4000-8000-000000000004';
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { user: { id: state.actor, organizationId: 7, email: `user${state.actor}@example.test`, role: state.roleClaim }, dbClient: { query: state.query } });
  next();
});
app.use('/api/mdx', notifications);
const target = (id: number) => request(app).get(`/api/mdx/notifications/${id}/target`);
async function notice(kind: string | null, id: string | null, url: string | null = null, recipient = 1) {
  const result = await database.query<{ id: number }>(`INSERT INTO mdx_notifications
    (organization_id,recipient_user_id,category,severity,title,body,resource_type,resource_id,action_url,metadata)
    VALUES (7,$1,'collaboration','info','Private notice prose','Do not return this prose',$2,$3,$4,$5::jsonb) RETURNING id`,
  [recipient,kind,id,url,JSON.stringify({ programId: OTHER_PROGRAM, documentId: 'untrusted' })]);
  return result.rows[0].id;
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE users (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE organizations (id integer PRIMARY KEY, status text DEFAULT 'active');
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text, persona text);
    CREATE TABLE mdx_notifications (id serial PRIMARY KEY,organization_id integer,recipient_user_id integer,recipient_role text,
      category text,severity text,title text,body text,resource_type text,resource_id text,action_url text,metadata jsonb,
      read_at timestamptz,archived_at timestamptz,expires_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE mdx_notification_receipts (organization_id integer,notification_id integer,user_id integer,read_at timestamptz,archived_at timestamptz);
    CREATE TABLE mdx_notification_subscriptions (organization_id integer,user_id integer,category text,in_app_enabled boolean);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, name text, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid, client_workspace_id integer, owner_id integer,created_by_id integer,settings jsonb);
    CREATE TABLE project_visibility_settings (project_id integer,organization_id integer,visibility text);
    CREATE TABLE project_members (project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_artifacts (id integer,organization_id integer,project_id integer,artifact_id text);
    CREATE TABLE c2c_submissions (id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer,reviewer_id integer,organization_id integer,status text);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY,tenant_id integer,client_program_id uuid,status text,created_by text);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY,doc_id uuid,tenant_id integer,code text);
    CREATE TABLE doc_permissions (doc_id uuid,section_id uuid,tenant_id integer,principal_id text,email text,role text,
      valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    CREATE TABLE unified_tasks (task_id text,organization_id integer,project_id integer,deleted_at timestamptz,review_route_id uuid,source_entity_type text,source_entity_id text);
    CREATE TABLE submissions (id integer,organization_id integer,program_id uuid,deleted_at timestamptz);
    CREATE TABLE ectd_sequences (id integer,organization_id integer,submission_id integer,deleted_at timestamptz);
    CREATE TABLE submission_transmittals (id integer,organization_id integer,program_id uuid,package_id integer);
    CREATE TABLE protocol_documents (id integer,organization_id integer,program_id uuid,deleted_at timestamptz);
    CREATE TABLE qms_documents (id integer,organization_id integer,authoring_document_id uuid,deleted_at timestamptz);
    CREATE TABLE report_runs (id integer,organization_id integer,scope_type text,scope_id text,dependency_summary jsonb);
  `);
  state.query.mockImplementation(async (text: string, values?: unknown[]) => {
    if (state.fail) throw new Error('fixture database unavailable');
    const result = await database.query(text, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  });
}, 60_000);
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  state.actor = 1; state.roleClaim = 'super_admin'; state.fail = false;
  await database.exec(`
    TRUNCATE users,organizations,organization_users,mdx_notifications,mdx_notification_receipts,mdx_notification_subscriptions,
      regulatory_programs,projects,project_visibility_settings,project_members,authoring_documents,authoring_sections,
      doc_permissions,unified_tasks,submissions,ectd_sequences,submission_transmittals,protocol_documents,qms_documents,report_runs,
      concept2cure_artifacts,c2c_submissions RESTART IDENTITY;
    INSERT INTO users VALUES (1,'active'),(2,'active'); INSERT INTO organizations VALUES (7,'active'),(8,'active');
    INSERT INTO organization_users VALUES (7,1,'member',null),(7,2,'viewer',null);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,'Private program name',null),('${OTHER_PROGRAM}',8,'Foreign program name',null);
    INSERT INTO projects VALUES (11,7,'${PROGRAM}',1,1,1,'{}'),(22,8,'${OTHER_PROGRAM}',2,9,9,'{}');
    INSERT INTO project_visibility_settings VALUES (11,7,'org_public');
    INSERT INTO authoring_documents VALUES ('${DOC}',7,'${PROGRAM}','DRAFT','1');
    INSERT INTO authoring_sections VALUES ('${SECTION}','${DOC}',7,'3.2.P.8');
    INSERT INTO doc_permissions (doc_id,tenant_id,principal_id,role) VALUES ('${DOC}',7,'1','VIEWER');
    INSERT INTO unified_tasks VALUES ('TASK-real',7,11,null,null,null,null);
    INSERT INTO submissions VALUES (42,7,'${PROGRAM}',null); INSERT INTO ectd_sequences VALUES (6,7,42,null);
    INSERT INTO submission_transmittals VALUES (1001,7,'${PROGRAM}',null);
    INSERT INTO protocol_documents VALUES (21,7,'${PROGRAM}',null),(22,7,null,null);
    INSERT INTO qms_documents VALUES (8,7,'${DOC}',null),(9,7,null,null);
    INSERT INTO report_runs VALUES (41,7,'account','7','{}');
    INSERT INTO concept2cure_artifacts VALUES (31,7,11,'artifact-native');
    INSERT INTO c2c_submissions VALUES (32,7,11);
  `);
});

describe('F19 actual recipient-to-record resolver', () => {
  it.each([
    ['unified_task','TASK-real','tasks',{taskId:'TASK-real'}],
    ['submission','42','submission-center',{submissionId:'42'}],
    ['ectd_sequence','6','submission-center',{submissionId:'42',sequenceId:'6'}],
    ['gateway_transmittal','1001','gateway-transmittals',{transmittalId:'1001'}],
    ['protocol_document','21','protocol-dev',{protocol:'21'}],
    ['qms_document','8','quality',{qmsDocumentId:'8'}],
  ] as const)('opens the exact authorized %s with its record-owned UUID program', async (kind,id,surface,params) => {
    const response = await target(await notice(kind,id));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ surface,params,programId:PROGRAM });
    expect(JSON.stringify(response.body)).not.toMatch(/Private notice prose|Do not return|Private program name|Foreign program name|untrusted/);
  });
  it('opens an authored section only through its canonical document, section permission and exact section code', async () => {
    const response = await target(await notice('authoring_document',`${DOC}:${SECTION}`));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ surface:'document-authoring',params:{documentId:DOC,sectionCode:'3.2.P.8'},programId:PROGRAM });
  });
  it('opens the exact saved report through existing report scope authorization without borrowing metadata program', async () => {
    const response = await target(await notice('report_run','41'));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ surface:'insights',params:{reportRunId:'41'},programId:null });
  });
  it('unfiled protocol and unbound QMS targets remain explicitly unfiled instead of adopting the open program', async () => {
    const protocol = await target(await notice('protocol_document','22'));
    const qms = await target(await notice('qms_document','9'));
    expect(protocol.status).toBe(200);
    expect(protocol.body.data).toMatchObject({ surface:'protocol-dev',params:{protocol:'22',protocolScope:'unfiled'},programId:null });
    expect(qms.status).toBe(200);
    expect(qms.body.data).toMatchObject({ surface:'quality',params:{qmsDocumentId:'9'},programId:null });
  });
});

describe('F19 refusal and isolation', () => {
  it('archived, expired, preference-disabled and inactive membership notices cannot resolve destinations', async () => {
    const id = await notice('submission','42');
    await database.exec(`UPDATE mdx_notifications SET expires_at=now()-interval '1 minute' WHERE id=${id}`);
    expect((await target(id)).status).toBe(404);
    await database.exec(`UPDATE mdx_notifications SET expires_at=null; INSERT INTO mdx_notification_receipts VALUES (7,${id},1,null,now())`);
    expect((await target(id)).status).toBe(404);
    await database.exec(`TRUNCATE mdx_notification_receipts; INSERT INTO mdx_notification_subscriptions VALUES (7,1,'collaboration',false)`);
    expect((await target(id)).status).toBe(404);
    await database.exec(`TRUNCATE mdx_notification_subscriptions; DELETE FROM organization_users WHERE user_id=1`);
    expect((await target(id)).status).toBe(404);
  });
  it('a same-tenant nonrecipient, role audience mismatch and stale privileged claim grant no target access', async () => {
    const privateNotice = await notice('authoring_document',DOC);
    state.actor = 2;
    expect((await target(privateNotice)).status).toBe(404);
    const noPermission = await notice('authoring_document',DOC,null,2);
    expect((await target(noPermission)).status).toBe(404);
    await database.exec(`UPDATE mdx_notifications SET recipient_user_id=null,recipient_role='approver' WHERE id=${noPermission}`);
    expect((await target(noPermission)).status).toBe(404);
  });
  it('notification receipt is no access grant to a foreign/deleted record or a private program', async () => {
    const id = await notice('authoring_document',DOC);
    await database.exec(`UPDATE authoring_documents SET tenant_id=8 WHERE id='${DOC}'`);
    expect((await target(id)).status).toBe(404);
    await database.exec(`UPDATE authoring_documents SET tenant_id=7 WHERE id='${DOC}'; UPDATE project_visibility_settings SET visibility='private'; UPDATE projects SET owner_id=9,created_by_id=9`);
    expect((await target(id)).status).toBe(404);
    await database.exec(`UPDATE regulatory_programs SET deleted_at=now() WHERE id='${PROGRAM}'`);
    expect((await target(id)).status).toBe(404);
  });
  it('safe legacy action URL IDs are reread, and a mismatched sequence parent cannot redirect into another submission', async () => {
    const good = await target(await notice(null,null,'/concept2cure/submission-center?submissionId=42&sequenceId=6&program='+OTHER_PROGRAM));
    expect(good.status).toBe(200);
    expect(good.body.data.programId).toBe(PROGRAM);
    await database.exec(`UPDATE ectd_sequences SET submission_id=99 WHERE id=6`);
    expect((await target(await notice(null,null,'/concept2cure/submission-center?submissionId=42&sequenceId=6'))).status).toBe(404);
  });
  it.each([
    ['artifact',DOC,'/concept2cure/document-authoring?documentId='+DOC],
    ['authoring_document','22','/concept2cure/document-authoring'],
    [null,null,'https://evil.test/concept2cure/tasks?taskId=TASK-real'],
    [null,null,'/concept2cure/not-a-surface?documentId='+DOC],
    [null,null,'/concept2cure/document-authoring?documentId='+DOC+'&sectionCode=3.2.P.8'],
  ])('an unmappable or contradictory legacy reference is explicit without a fallback record', async (kind,id,url) => {
    const response = await target(await notice(kind,id,url));
    expect(response.status).toBe(422);
    expect(response.body.data).toBeUndefined();
  });
  it('a failed ownership read is retryable and never becomes missing/clean/authorized', async () => {
    const id = await notice('authoring_document',DOC); state.fail = true;
    expect((await target(id)).status).toBe(503);
    state.fail = false;
    expect((await target(id)).status).toBe(200);
  });
});

describe('F19 saved report owning context', () => {
  it.each([['document','artifact-native'],['submission','32']] as const)('a saved %s report preserves the canonical parent program without converting its source to an authoring document', async (scopeType, scopeId) => {
    await database.query('UPDATE report_runs SET scope_type=$1,scope_id=$2 WHERE id=41',[scopeType,scopeId]);
    const response = await target(await notice('report_run','41'));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({surface:'insights',params:{reportRunId:'41'},programId:PROGRAM});
    expect(response.body.data.params.documentId).toBeUndefined();
  });
});
