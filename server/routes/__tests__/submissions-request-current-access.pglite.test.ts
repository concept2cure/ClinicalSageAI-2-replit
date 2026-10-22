/** Real in-process SQL at existing HTTP readers. This is not native RLS proof. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { expandRoleClaims } from '../../middleware/auth';
import { readSubmissionSequenceForRequest, readSubmissionLeavesForRequest } from '../../services/submission-service/submission-request-read';

const h = vi.hoisted(() => ({ db: null as any, q: null as any, userId: 2, withContext: true, statements: [] as string[],
  afterQuery: null as null | ((text: string) => Promise<void>) }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.q; }, getPool: () => h.q }));

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PUBLIC = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const AUTHORING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let harness: IndPgliteDb;
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true }); h.db = harness.db;
  h.q = { query: async (input: string | { text: string; rowMode?: string }, params?: unknown[]) => {
    const text = typeof input === 'string' ? input : input.text;
    h.statements.push(text);
    const result = await harness.pglite.query<Record<string, unknown>>(text, params);
    if (h.afterQuery) await h.afterQuery(text);
    return { ...result, rows: typeof input !== 'string' && input.rowMode === 'array'
      ? result.rows.map(row => result.fields.map(field => row[field.name])) : result.rows };
  } };
  await harness.pglite.exec(`
    ALTER TABLE organizations ADD COLUMN status text;
    CREATE TABLE users(id int PRIMARY KEY,status text,email text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,organization_id int,project_id int);
    ALTER TABLE regulatory_programs ADD COLUMN status text DEFAULT 'active',ADD COLUMN metadata json;
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,status text,
      client_workspace_id int,owner_id int,created_by_id int,settings jsonb DEFAULT '{}');
    CREATE TABLE submission_regions(id serial PRIMARY KEY,submission_id int,organization_id int,region text,pathway text,deleted_at timestamptz);
    CREATE TABLE c2c_document_aliases(organization_id int,canonical_id uuid,store text,native_id text);
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int,client_program_id uuid,status text,created_by text);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,tenant_id int,code text);
    CREATE TABLE doc_permissions(tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
    INSERT INTO organizations(id,name,status) VALUES(7,'Invented QA tenant','active'),(8,'Foreign QA tenant','active');
    INSERT INTO users VALUES(1,'active','owner@example.invalid'),(2,'active','unassigned@example.invalid'),(3,'active','member@example.invalid'),(4,'active','manager@example.invalid');
    INSERT INTO organization_users VALUES(7,1,'member'),(7,2,'member'),(7,3,'member'),(7,4,'manager');
  `);
  await harness.pglite.query(`INSERT INTO regulatory_programs(id,organization_id,code,name,program_type,product_type,product_name,primary_agency,status)
    VALUES($1,7,'PRIVATE','Invented private QA','US_510K','device','Invented QA device','FDA','active'),($2,7,'PUBLIC','Invented public QA','US_510K','device','Invented QA device','FDA','active'),($3,8,'FOREIGN','Invented foreign QA','US_510K','device','Invented QA device','FDA','active')`, [PROGRAM, PUBLIC, FOREIGN]);
  await harness.pglite.query(`INSERT INTO projects(id,organization_id,regulatory_program_id,status,owner_id,created_by_id)
    VALUES(71,7,$1,'active',1,1),(72,7,$2,'active',1,1),(73,7,NULL,'active',1,1),(81,8,$3,'active',1,1)`, [PROGRAM, PUBLIC, FOREIGN]);
  await harness.pglite.exec(`INSERT INTO project_visibility_settings VALUES(71,7,'private'),(72,7,'org_public'),(73,7,'org_public'),(81,8,'org_public');
    INSERT INTO project_members VALUES(71,7,3,'use','active');`);
  await harness.pglite.query(`INSERT INTO submissions(id,title,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES(1,'Private filing QA','US_510K','mdx','fda',7,1,$1),(2,'Public filing QA','US_510K','mdx','fda',7,1,$2),(3,'Unanchored filing QA','US_510K','mdx','fda',7,1,NULL),(8,'Foreign filing QA','US_510K','mdx','fda',8,1,$3)`, [PROGRAM, PUBLIC, FOREIGN]);
  await harness.pglite.exec(`INSERT INTO ectd_sequences(id,submission_id,region,sequence_number,organization_id,created_by)
    VALUES(11,1,'fda','0000',7,1),(12,2,'fda','0000',7,1),(13,3,'fda','0000',7,1),(18,8,'fda','0000',8,1);
    INSERT INTO submission_leaves(id,sequence_id,section_code,title,lifecycle_op,organization_id,created_by)
    VALUES(111,11,'estar.device-description','Private source label QA','new',7,1),(112,12,'estar.device-description','Public empty placement QA','new',7,1);
    INSERT INTO submission_regions(submission_id,organization_id,region,pathway) VALUES(1,7,'fda','estar'),(2,7,'fda','estar');`);
  app = express(); app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: h.userId, organizationId: 7, role: 'manager', roles: expandRoleClaims('manager', undefined) };
    if (h.withContext) req.dbClient = h.q;
    next();
  });
  app.use('/api/submissions', (await import('../submissions')).default);
}, 90_000);
afterAll(async () => { await harness?.close(); });
beforeEach(async () => {
  h.userId = 2; h.withContext = true; h.statements.length = 0; h.afterQuery = null;
  await harness.pglite.exec("UPDATE users SET status='active'; UPDATE organization_users SET role='member' WHERE user_id<>4; UPDATE project_members SET status='active'; UPDATE submissions SET deleted_at=NULL; UPDATE ectd_sequences SET deleted_at=NULL");
  await harness.pglite.exec("UPDATE regulatory_programs SET program_type='US_510K',metadata=NULL; UPDATE submissions SET application_type='US_510K'; UPDATE submission_regions SET pathway='estar',deleted_at=NULL; UPDATE ectd_sequences SET region='fda'; UPDATE submission_leaves SET document_content_sha256=NULL,lifecycle_op='new'");
  await harness.pglite.exec('TRUNCATE c2c_document_aliases,authoring_documents,authoring_sections,doc_permissions,coauthor_documents; UPDATE submission_leaves SET document_table=NULL,document_id=NULL,document_uuid=NULL');
  await harness.pglite.exec('UPDATE projects SET regulatory_program_id=NULL WHERE id=73');
  await harness.pglite.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=72',[PUBLIC]);
});

async function placeAuthoringCopy() {
  await harness.pglite.query('INSERT INTO authoring_documents VALUES($1,7,$2,$3,$4)',[AUTHORING,PUBLIC,'DRAFT','1']);
  await harness.pglite.query('INSERT INTO c2c_document_aliases VALUES(7,$1,$2,$3)',[AUTHORING,'coauthor_documents','201']);
  await harness.pglite.query('INSERT INTO coauthor_documents(id,organization_id,title,content,status,metadata) VALUES(201,7,$1,$2,$3,$4)',
    ['Protected source title QA','Protected retained source prose QA','draft',JSON.stringify({docId:AUTHORING})]);
  await harness.pglite.exec("UPDATE submission_leaves SET document_table='coauthor_documents',document_id=201 WHERE id=112");
  h.statements.length=0;
}

describe('current request-owned Submission Center reads', () => {
  it('lists only accessible anchored filings, without private-row counts', async () => {
    const res = await request(app).get('/api/submissions');
    expect(res.status).toBe(200); expect(res.body.map((row: { id: number }) => row.id)).toEqual([2]);
    expect(JSON.stringify(res.body)).not.toContain('Private filing QA');
  });
  it('scoped list excludes inaccessible projects without querying an organization notOffered count', async () => {
    const res = await request(app).get(`/api/submissions?programId=${PUBLIC}`);
    expect(res.status).toBe(200); expect(res.body.data.map((row: { id: number }) => row.id)).toEqual([2]);
    expect(res.body.meta?.notOffered).toBeUndefined();
  });
  it.each(['/1', '/1/sequences', '/sequences/11/leaves', '/sequences/11/pathway-manifest?pathway=estar_510k'])('refuses same-org unassigned private read %s before leaf metadata', async suffix => {
    const res = await request(app).get(`/api/submissions${suffix}`);
    expect(res.status).toBe(403); expect(JSON.stringify(res.body)).not.toContain('Private');
    expect(h.statements.some(statement => statement.includes('submission_leaves'))).toBe(false);
  });
  it('returns genuine public/owner/member controls', async () => {
    h.userId = 1; expect((await request(app).get('/api/submissions/1')).status).toBe(200);
    h.userId = 3; expect((await request(app).get('/api/submissions/1/sequences')).status).toBe(200);
    h.userId = 2; expect((await request(app).get('/api/submissions/2')).status).toBe(200);
  });
  it('supplies exact server-derived available framework metadata', async () => {
    h.userId = 3; const res = await request(app).get('/api/submissions/1/sequences');
    expect(res.status).toBe(200); expect(res.body[0].deliverables).toMatchObject({ available: true, compatiblePathways: ['estar_510k'], recordedPathway: 'estar_510k' });
  });
  it('retains manager metadata-only unanchored anchor remedy, but refuses sequence/source reads', async () => {
    h.userId = 4;
    expect((await request(app).get('/api/submissions')).body.map((row: { id: number }) => row.id)).toContain(3);
    expect((await request(app).get('/api/submissions/3')).status).toBe(200);
    const res = await request(app).get('/api/submissions/3/sequences');
    expect(res.status).toBe(409); expect(res.body.error.code).toBe('UNANCHORED_SUBMISSION');
  });
  it('refuses fresh role demotion despite old request manager claims', async () => {
    h.userId = 3; await harness.pglite.exec("UPDATE organization_users SET role='viewer' WHERE user_id=3");
    expect((await request(app).get('/api/submissions/1')).status).toBe(403);
  });
  it('refuses disabled actors and does not turn missing request context into a pooled read', async () => {
    h.userId = 3; await harness.pglite.exec("UPDATE users SET status='inactive' WHERE id=3");
    expect((await request(app).get('/api/submissions/1')).status).toBe(403);
    h.withContext = false; h.statements.length = 0;
    expect((await request(app).get('/api/submissions/2')).status).toBeGreaterThanOrEqual(500);
    expect(h.statements).toHaveLength(0);
  });
  it('refuses a live sequence whose actual parent was deleted', async () => {
    h.userId = 1; await harness.pglite.exec('UPDATE submissions SET deleted_at=now() WHERE id=1');
    expect((await request(app).get('/api/submissions/sequences/11/leaves')).status).toBe(404);
  });
  it('refuses foreign parent/sequence identities and selected programme conflicts', async () => {
    expect((await request(app).get('/api/submissions/8')).status).toBe(404);
    expect((await request(app).get('/api/submissions/sequences/18/leaves')).status).toBe(404);
    const res = await request(app).get(`/api/submissions/sequences/12/pathway-manifest?pathway=estar_510k&programId=${PROGRAM}&submissionId=1`);
    expect(res.status).toBe(404);
  });
  it.each([
    {unavailable:false,status:404,code:'AUTHORING_DOCUMENT_NOT_FOUND'},
    {unavailable:true,status:503,code:'AUTHORING_READ_ACCESS_UNAVAILABLE'},
  ])('preserves initial Authoring refusal $status before retained source prose',async ({unavailable,status,code})=>{
    await placeAuthoringCopy();
    if(unavailable)await harness.pglite.exec('ALTER TABLE doc_permissions RENAME TO unavailable_doc_permissions');
    try {
      const res=await request(app).get('/api/submissions/sequences/12/pathway-manifest');
      expect(h.statements.some(sql=>sql.includes('FROM doc_permissions p'))).toBe(true);
      expect(res.status).toBe(status);expect(res.body.error.code).toBe(code);
      expect(h.statements.some(sql=>sql.includes('SELECT c.title AS source_label,c.content,c.status'))).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/Protected|doc_permissions|relation|SELECT/);
      expect(res.body.entries).toBeUndefined();expect(res.body.scope).toBeUndefined();
    }finally {
      if(unavailable)await harness.pglite.exec('ALTER TABLE unavailable_doc_permissions RENAME TO doc_permissions');
    }
  });
});
describe('retained scope and evaluation remain current through completion', () => {
  it('refuses a committed transfer to a different accessible unique anchor at the final parent check',async()=>{
    let parentReads=0;let changed=false;
    h.afterQuery=async text=>{
      if(text.includes('SELECT s.id AS "submissionId"')&&++parentReads===2) {
        await harness.pglite.exec('UPDATE projects SET regulatory_program_id=NULL WHERE id=72');
        await harness.pglite.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=73',[PUBLIC]);changed=true;
      }
    };
    const res=await request(app).get(`/api/submissions/sequences/12/pathway-manifest?programId=${PUBLIC}&submissionId=2`);
    expect(changed).toBe(true);expect(res.status).toBe(503);expect(res.body.error.code).toBe('SUBMISSION_ACCESS_CHANGED');
    expect(res.body.scope).toBeUndefined();expect(res.body.entries).toBeUndefined();
    expect((await harness.pglite.query('SELECT id FROM projects WHERE regulatory_program_id=$1',[PUBLIC])).rows).toEqual([{id:73}]);
  });
  it.each([
    ['current programme filing type', "UPDATE regulatory_programs SET program_type='US_NDA' WHERE code='PUBLIC'", 'SELECT program_type,product_type,metadata,code,name'],
    ['recorded device flags', "UPDATE regulatory_programs SET metadata='{\"deviceFlags\":[\"sterile\"]}' WHERE code='PUBLIC'", 'SELECT program_type,product_type,metadata,code,name'],
    ['recorded framework', "UPDATE submission_regions SET pathway='ctis' WHERE submission_id=2", 'SELECT id,region,pathway'],
    ['retained leaf pin', "UPDATE submission_leaves SET document_content_sha256=repeat('a',64) WHERE id=112", 'from "submission_leaves"'],
  ])('refuses a deferred change to %s before supplying the combined pane', async (_label, mutation, boundary) => {
    let changed = false;
    h.afterQuery = async text => {
      if (!changed && text.includes(boundary)) { changed = true; await harness.pglite.exec(mutation); }
    };
    const res = await request(app).get(`/api/submissions/sequences/12/pathway-manifest?programId=${PUBLIC}&submissionId=2`);
    expect(changed).toBe(true); expect(res.status).toBe(503);
    expect(res.body.scope).toBeUndefined(); expect(res.body.entries).toBeUndefined();
  });
  it('refuses current project membership withdrawal after the retained leaves were read', async () => {
    h.userId = 3; let changed = false;
    h.afterQuery = async text => {
      if (!changed && text.includes('from "submission_leaves"')) { changed = true; await harness.pglite.exec("UPDATE project_members SET status='inactive' WHERE user_id=3"); }
    };
    const res = await request(app).get('/api/submissions/sequences/11/leaves');
    expect(changed).toBe(true); expect(res.status).toBeGreaterThanOrEqual(403);
    expect(JSON.stringify(res.body)).not.toContain('Private source label QA');
  });
  it('keeps unsupported IND coverage unavailable without inventing a framework', async () => {
    await harness.pglite.exec("UPDATE regulatory_programs SET program_type='IND' WHERE code='PUBLIC'; UPDATE submissions SET application_type='IND' WHERE id=2; UPDATE submission_regions SET pathway='ectd_v322' WHERE submission_id=2");
    const list = await request(app).get('/api/submissions/2/sequences');
    expect(list.status).toBe(200); expect(list.body[0].deliverables).toMatchObject({ available: false, compatiblePathways: [], reasonCode: 'PATHWAY_COVERAGE_UNAVAILABLE' });
    const pane = await request(app).get('/api/submissions/sequences/12/pathway-manifest?pathway=estar_510k');
    expect(pane.status).toBe(422); expect(pane.body.error.code).toBe('PATHWAY_COVERAGE_UNAVAILABLE');
  });
  it('requires an explicit compatible choice when no live framework is recorded', async () => {
    await harness.pglite.exec('UPDATE submission_regions SET deleted_at=now() WHERE submission_id=2');
    const absent = await request(app).get('/api/submissions/sequences/12/pathway-manifest');
    expect(absent.status).toBe(409); expect(absent.body.error.code).toBe('PATHWAY_SELECTION_REQUIRED');
    const explicit = await request(app).get('/api/submissions/sequences/12/pathway-manifest?pathway=estar_510k');
    expect(explicit.status).toBe(200); expect(explicit.body.scope.inputOrigin).toBe('explicit-compatible');
    await harness.pglite.exec('UPDATE submission_regions SET deleted_at=NULL WHERE submission_id=2');
  });
  it('does not evaluate another region or an incompatible explicit framework', async () => {
    expect((await request(app).get('/api/submissions/sequences/12/pathway-manifest?pathway=ctis')).status).toBe(409);
    await harness.pglite.exec("UPDATE ectd_sequences SET region='jp' WHERE id=12");
    expect((await request(app).get('/api/submissions/2/sequences')).status).toBe(409);
    await harness.pglite.exec("UPDATE ectd_sequences SET region='fda' WHERE id=12");
  });
  it('binds the admitted sequence to this exact request executor and object', async () => {
    const admitted = await readSubmissionSequenceForRequest(h.q, { organizationId: 7, userId: 2 }, 12);
    h.statements.length = 0;
    await expect(readSubmissionLeavesForRequest({ query: h.q.query }, admitted)).rejects.toMatchObject({ status: 403, code: 'SUBMISSION_SCOPE_UNVERIFIED' });
    await expect(readSubmissionLeavesForRequest(h.q, { ...admitted })).rejects.toMatchObject({ status: 403, code: 'SUBMISSION_SCOPE_UNVERIFIED' });
    expect(h.statements).toHaveLength(0);
  });
});
