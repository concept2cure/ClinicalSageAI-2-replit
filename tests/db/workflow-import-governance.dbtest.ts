/** Native PostgreSQL, real runtime role, real JWT/password review/signature paths.
 * Fixtures have unique organization/program/source identities; no shared app row
 * is altered. No model, scientific qualification or original signature is minted. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import type { WorkflowImportSource } from '../../shared/authoring/source-import';

const TAG = `workflowqa-${process.pid}-${Date.now().toString(36)}`;
const PASSWORD = 'Workflow-Native-QA-Only-2026!';
const REASON = 'Review this retained workflow snapshot for the isolated native governance proof.';
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let projectId: number;
let programId: string;
let studyId: string;
type Actor = { id: number; email: string; token: string };
const actors = {} as Record<'author' | 'reviewer' | 'unassigned', Actor>;
const copiedIds: string[] = [];
const additionalOrganizations: number[] = [];

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const codeOf = (result: request.Response) => result.body?.error?.code ?? result.body?.code ?? result.body?.error;
function call(actor: Actor, method: 'post' | 'patch', path: string, body: unknown) {
  return request(app)[method](`/api/authoring${path}`).set('Authorization', `Bearer ${actor.token}`).send(body);
}
async function protocol(): Promise<WorkflowImportSource> {
  const row = (await owner.query(`INSERT INTO protocol_documents
    (organization_id,protocol_kind,title,version,synopsis,study_design_id,created_by)
    VALUES ($1,'clinical',$2,'1.0','A stored native synopsis.',$3,$4) RETURNING id`, [orgId,`${TAG} stored protocol`,studyId,actors.author.id])).rows[0];
  await owner.query(`INSERT INTO protocol_sections
    (organization_id,protocol_document_id,section_key,title,content,required,order_index,created_by)
    VALUES ($1,$2,'protocol.population','Population','Adults with the recorded condition.',true,1,$3)`, [orgId,row.id,actors.author.id]);
  return { kind: 'protocol', documentId: Number(row.id) };
}
async function csr(model: string | null = null): Promise<WorkflowImportSource> {
  const row = (await owner.query(`INSERT INTO csr_build_jobs
    (organization_id,project_id,study_id,status,progress,sections_to_generate,study_info_snapshot,requested_by)
    VALUES ($1,$2,$3,'complete',100,ARRAY['1'],$4::jsonb,$5) RETURNING id`,
  [orgId,projectId,`${TAG}-${randomUUID()}`,JSON.stringify({title:`${TAG} known machine CSR`}),actors.author.id])).rows[0];
  const content = '<p>Automated retained narrative states the trial summary supplied by the worker.</p>';
  await owner.query(`INSERT INTO csr_section_outputs
    (organization_id,project_id,job_id,section_number,content,content_hash,ai_generated,model,lineage)
    VALUES ($1,$2,$3,'1',$4,$5,true,$6,'{}'::jsonb)`, [orgId,projectId,row.id,content,sha(content),model]);
  return { kind: 'csr', jobId: Number(row.id), sectionNumbers: ['1'] };
}
async function preview(source: WorkflowImportSource, actor = actors.author) {
  const response = await call(actor,'post','/import/source',{programId,source,previewOnly:true});
  expect(response.status,JSON.stringify(response.body)).toBe(200);
  expect(response.body.data.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  return response.body.data;
}
async function pull(source: WorkflowImportSource, extra: Record<string,unknown> = {}) {
  const seen = await preview(source);
  const response = await call(actors.author,'post','/import/source',{programId,source,expectedFingerprint:seen.fingerprint,reason:REASON,...extra});
  expect([200,201],JSON.stringify(response.body)).toContain(response.status);
  const data = response.body.data;
  copiedIds.push(data.doc.id);
  return data;
}
async function effects(docId: string) {
  return (await owner.query(`SELECT
    (SELECT count(*)::int FROM authoring_signatures WHERE doc_id=$1::uuid) AS signatures,
    (SELECT count(*)::int FROM frozen_documents WHERE document_id=$1::uuid) AS frozen,
    (SELECT count(*)::int FROM authoring_exports WHERE doc_id=$1::text) AS exports`,[docId])).rows[0];
}
async function approveAssignedReview(docId: string) {
  const asked = await call(actors.author,'post',`/documents/${docId}/request-review`,{
    reviewers:[{id:String(actors.reviewer.id),name:'Native independent reviewer',email:actors.reviewer.email}],reason:REASON,
  });
  expect(asked.status,JSON.stringify(asked.body)).toBe(200);
  const reviewed = await call(actors.reviewer,'post',`/documents/${docId}/review`,{review_status:'approved',review_comments:REASON});
  expect(reviewed.status,JSON.stringify(reviewed.body)).toBe(200);
}
async function adopt(docId: string) {
  await approveAssignedReview(docId);
  const signature = await call(actors.reviewer,'post',`/docs/${docId}/e-sign`,{
    meaning:'REVIEWER',intent:REASON,password:PASSWORD,adoptWorkflowSource:true,
  });
  expect(signature.status,JSON.stringify(signature.body)).toBe(200);
  expect(signature.body.workflowSourceAdoption).toMatchObject({scope:'full-document',originalAuthorshipDisclosed:true});
  return signature;
}
const freeze = (id: string) => call(actors.author,'post',`/docs/${id}/freeze`,{meaning:'AUTHOR',reason:REASON,password:PASSWORD});

/** Observe real PostgreSQL lock waits, rather than infer overlap from a timer. */
async function waitForParentWait(holderPid: number, signing: boolean, behindEarlierWait = false): Promise<void> {
  const deadline = Date.now()+10_000;
  const queryPattern = signing ? '%SELECT d.%authoring_documents%FOR UPDATE%' : '%SELECT status%FROM authoring_documents%FOR UPDATE%';
  while(Date.now()<deadline) {
    const blocked = await owner.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE $2
        AND ($1::int=ANY(pg_blocking_pids(pid)) OR $3)`,[holderPid,queryPattern,signing || behindEarlierWait]);
    if(blocked.rows[0].n>0) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error(`The real ${signing?'freeze':'section insert'} did not reach its parent-row lock wait.`);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the native non-superuser runtime role.');
  owner = new Pool({connectionString:databaseUrl,max:4});
  runtime = new Pool({connectionString:process.env.APP_DATABASE_URL,max:4});
  const organization = (await owner.query(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid`,[TAG])).rows[0];
  orgId = Number(organization.id); orgUuid = String(organization.uuid);
  const secret = process.env.JWT_SECRET_DEV || process.env.JWT_SECRET!;
  for (const key of ['author','reviewer','unassigned'] as const) {
    const email = `${TAG}-${key}@example.invalid`;
    const person = (await owner.query(`INSERT INTO users(email,name,password_hash,status)
      VALUES($1,$2,$3,'active') RETURNING id`,[email,`Native ${key}`,await bcrypt.hash(PASSWORD,4)])).rows[0];
    const role = key === 'unassigned' ? 'member' : 'admin';
    await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)',[orgId,person.id,role]);
    actors[key] = {id:Number(person.id),email,token:jwt.sign({type:'access',id:String(person.id),userId:String(person.id),organizationId:String(orgId),role,roles:['RA_CMC','QA'],email},secret,{expiresIn:'1h'})};
  }
  const workspace = (await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id)
    VALUES($1,$2,$2,'active',$3) RETURNING id`,[orgId,TAG,actors.author.id])).rows[0];
  programId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name)
    VALUES($1,$2,$3::text,$3::text,'IND','drug','FDA',$3::text)`,[programId,orgId,TAG]);
  const project = (await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,created_by_id,owner_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}') RETURNING id`,[orgId,workspace.id,TAG,actors.author.id,programId])).rows[0];
  projectId = Number(project.id);
  await owner.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,$2,'private')`,[projectId,orgId]);
  studyId = `${TAG}-study`;
  await owner.query(`INSERT INTO cdisc_prm_studies(tenant_id,study_id,program_id,protocol_id,protocol_title,protocol_version)
    VALUES($1,$2,$3,$2,$4,'1.0')`,[orgId,studyId,programId,TAG]);
  const {authMiddleware} = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/authoring',authMiddleware,(await import('../../server/routes/authoring.router')).default);
},120_000);

afterAll(async () => {
  // Immutable signature/revision/audit ledgers retain their QA record. Retire
  // only our isolated organization, rather than delete another fixture's data.
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1 AND slug=$2",[orgId,TAG]);
  if (owner && additionalOrganizations.length) await owner.query("UPDATE organizations SET status='inactive' WHERE id=ANY($1::int[]) AND slug LIKE $2",[additionalOrganizations,`${TAG}-%`]);
  await runtime?.end();
  const {getPool} = await import('../../server/db/runtime');
  await getPool().end().catch(() => undefined);
  await owner?.end();
});

describe('workflow bridge through the actual native runtime role', () => {
  it('opens a real non-owner NOSUPERUSER NOBYPASSRLS connection',async () => {
    const client = await runtime.connect();
    try {
      const row = (await client.query('SELECT current_user AS who,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      expect(row).toMatchObject({rolsuper:false,rolbypassrls:false});
      expect(row.who).not.toBe('postgres');
      const {getPool} = await import('../../server/db/runtime');
      const {runWithTenantScope} = await import('../../server/db/tenantStore');
      const configuredRole = await runWithTenantScope({tenantId:String(orgId),orgUuid,role:'admin',source:'test',caller:'workflow-native-role-proof'},()=>getPool().query('SELECT current_user AS who'));
      expect(configuredRole.rows[0].who).toBe(row.who);
      expect((await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='protocol_documents'::regclass")).rows[0]).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});
    } finally {client.release();}
  });

  it('refuses an active unassigned organization member before private target/source import',async () => {
    const source = await protocol();
    const response = await call(actors.unassigned,'post','/import/source',{programId,source,previewOnly:true});
    expect(response.status,JSON.stringify(response.body)).toBe(403);
    expect(codeOf(response)).toBe('PROJECT_PERMISSION_DENIED');
  });
});

describe('workflow source snapshots and current sharing use real native data',() => {

  it('rechecks an explicit project grant after preview rather than trusting the stale member JWT',async () => {
    const source = await protocol();
    const membership = (await owner.query(`INSERT INTO project_members
      (organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'edit','active') RETURNING id`,[orgId,projectId,actors.unassigned.id])).rows[0];
    try {
      const seen = await preview(source,actors.unassigned);
      await owner.query("UPDATE project_members SET status='revoked' WHERE id=$1 AND organization_id=$2",[membership.id,orgId]);
      const before = (await owner.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId])).rows[0].n;
      const response = await call(actors.unassigned,'post','/import/source',{programId,source,expectedFingerprint:seen.fingerprint,reason:REASON});
      expect(response.status,JSON.stringify(response.body)).toBe(403);
      expect(codeOf(response)).toBe('PROJECT_PERMISSION_DENIED');
      expect((await owner.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId])).rows[0].n).toBe(before);
    } finally {
      await owner.query("UPDATE project_members SET status='revoked' WHERE id=$1 AND organization_id=$2",[membership.id,orgId]);
    }
  });

  it('hides an existing foreign-organization source under actual forced RLS and the import route',async () => {
    const other = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id",[`${TAG}-foreign`])).rows[0];
    additionalOrganizations.push(Number(other.id));
    const source = (await owner.query(`INSERT INTO protocol_documents
      (organization_id,protocol_kind,title,version,synopsis,created_by)
      VALUES($1,'clinical',$2,'1.0',$2,$3) RETURNING id`,[other.id,`${TAG}-foreign-retained-prose`,actors.author.id])).rows[0];
    const client = await runtime.connect();
    try {
      const {setTenantContextTx} = await import('../../server/services/tenant/governed-tenant-context');
      await client.query('BEGIN');
      await setTenantContextTx(client,orgId,'admin');
      expect((await client.query('SELECT id FROM protocol_documents WHERE id=$1',[source.id])).rows).toEqual([]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    const response = await call(actors.author,'post','/import/source',{programId,source:{kind:'protocol',documentId:Number(source.id)},previewOnly:true});
    expect(response.status,JSON.stringify(response.body)).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain(`${TAG}-foreign-retained-prose`);
  });

  it('retains a coherent source snapshot across a committed concurrent child insertion',async () => {
    const source = await protocol();
    const {materializeWorkflowSource} = await import('../../server/services/authoring/workflow-source-import');
    const {setTenantContextTx} = await import('../../server/services/tenant/governed-tenant-context');
    const client: PoolClient = await runtime.connect();
    const input = {organizationId:orgId,userId:actors.author.id,target:{programId,projectId},source};
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await setTenantContextTx(client,orgId,'manager');
      await client.query("SELECT set_config('app.current_org_id',$1,true)",[orgUuid]);
      const before = await materializeWorkflowSource(input,client);
      await owner.query(`INSERT INTO protocol_sections
        (organization_id,protocol_document_id,section_key,title,content,order_index,created_by)
        VALUES($1,$2,'protocol.concurrent','Concurrent child','Committed after the original snapshot.',2,$3)`,[orgId,source.kind==='protocol'?source.documentId:0,actors.author.id]);
      const same = await materializeWorkflowSource(input,client);
      expect(same.fingerprint).toBe(before.fingerprint);
      expect(same.sections.some(s=>s.code==='protocol.concurrent')).toBe(false);
      await client.query('COMMIT');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await setTenantContextTx(client,orgId,'manager');
      const current = await materializeWorkflowSource(input,client);
      expect(current.fingerprint).not.toBe(before.fingerprint);
      expect(current.sections.some(s=>s.code==='protocol.concurrent')).toBe(true);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });

  it('refuses a preview made stale by a new child row before any authoring evidence',async () => {
    const source = await protocol();
    const seen = await preview(source);
    const count = await owner.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId]);
    await owner.query(`INSERT INTO protocol_sections
      (organization_id,protocol_document_id,section_key,title,content,created_by)
      VALUES($1,$2,'protocol.new','New section','New committed content.',$3)`,[orgId,source.kind==='protocol'?source.documentId:0,actors.author.id]);
    const response = await call(actors.author,'post','/import/source',{programId,source,expectedFingerprint:seen.fingerprint,reason:REASON});
    expect(response.status,JSON.stringify(response.body)).toBe(409);
    expect(codeOf(response)).toBe('SOURCE_CHANGED');
    expect((await owner.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId])).rows).toEqual(count.rows);
  });

  it('converges concurrent identical imports on one actual draft and preserves later edits',async () => {
    const source = await protocol();
    const seen = await preview(source);
    const body = {programId,source,expectedFingerprint:seen.fingerprint,reason:REASON};
    const responses = await Promise.all([call(actors.author,'post','/import/source',body),call(actors.author,'post','/import/source',body)]);
    expect(responses.map(r=>r.status).sort(),JSON.stringify(responses.map(r=>r.body))).toEqual([200,201]);
    const id = responses[0].body.data.doc.id;
    copiedIds.push(id);
    expect(responses[1].body.data.doc.id).toBe(id);
    const section = responses[0].body.data.sections[0];
    const edited = await call(actors.author,'patch',`/sections/${section.id}`,{content:'<p>Distinct deliberate human correction.</p>',changeReason:REASON});
    expect(edited.status,JSON.stringify(edited.body)).toBe(200);
    const reused = await call(actors.author,'post','/import/source',body);
    expect(reused.status,JSON.stringify(reused.body)).toBe(200);
    expect(reused.body.data.reused).toBe(true);
    expect((await owner.query('SELECT content FROM authoring_sections WHERE id=$1',[section.id])).rows[0].content).toContain('Distinct deliberate human correction');
  });
});

describe('workflow identity never substitutes for canonical human adoption or qualification',() => {
  it('creates an unbound unknown-origin copy, rejects fingerprint-only release, then permits actual assigned reviewer adoption',async () => {
    const data = await pull(await protocol(),{title:'Forged title',signatureId:randomUUID(),status:'APPROVED',provenance:{model:'qualified-model',governedWrite:'allowed'}});
    const id = data.doc.id;
    expect(data.doc.title).not.toBe('Forged title');
    expect(String(data.doc.status).toUpperCase()).toBe('DRAFT');
    expect(data.doc.c2c_document_id).toBeNull();
    expect(data.origin.sectionOrigins.every((s:{originalAuthorship:string})=>s.originalAuthorship==='unknown')).toBe(true);
    expect(await effects(id)).toEqual({signatures:0,frozen:0,exports:0});
    const refused = await freeze(id);
    expect(refused.status,JSON.stringify(refused.body)).toBe(409);
    expect(String(codeOf(refused))).toMatch(/^WORKFLOW_/);
    expect(await effects(id)).toEqual({signatures:0,frozen:0,exports:0});
    const unassigned = await call(actors.reviewer,'post',`/docs/${id}/e-sign`,{meaning:'REVIEWER',intent:REASON,password:PASSWORD,adoptWorkflowSource:true});
    expect(unassigned.status,JSON.stringify(unassigned.body)).toBe(409);
    expect(await effects(id)).toEqual({signatures:0,frozen:0,exports:0});
    await adopt(id);
    const frozen = await freeze(id);
    expect(frozen.status,JSON.stringify(frozen.body)).toBe(200);
    const exported = await call(actors.author,'post',`/docs/${id}/export`,{format:'xml'});
    expect(exported.status,JSON.stringify(exported.body)).toBe(200);
    const kept = (await owner.query('SELECT provenance FROM authoring_documents WHERE id=$1',[id])).rows[0].provenance;
    expect(kept.importSource.sectionOrigins.every((s:{originalAuthorship:string})=>s.originalAuthorship==='unknown')).toBe(true);
    expect(kept.importSource.kind).toBe('protocol');
    expect(kept.servedBy).toBeUndefined();
  });

  it('holds positively machine-authored CSR without qualified generation evidence even after actual reviewer adoption',async () => {
    const data = await pull(await csr('recorded-name-without-generation-proof'));
    const id = data.doc.id;
    expect(data.origin.sectionOrigins[0]).toMatchObject({originalAuthorship:'machine',modelEvidence:'recorded-name-only'});
    await adopt(id);
    const before = await effects(id);
    const actions = [
      () => freeze(id),
      () => call(actors.author,'post',`/docs/${id}/e-sign`,{meaning:'APPROVER',intent:REASON,password:PASSWORD}),
      () => call(actors.author,'post',`/docs/${id}/sign`,{meaning:'APPROVER',reason:REASON,password:PASSWORD}),
      () => call(actors.author,'post',`/docs/${id}/file-to-vault`,{format:'docx',documentType:'clinical-study-report'}),
    ];
    for(const action of actions) {
      const response = await action();
      expect(response.status,JSON.stringify(response.body)).toBe(409);
      expect(codeOf(response)).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
    }
    expect(await effects(id)).toEqual(before);
    // A working draft already fails the existing sealed-state export gate.
    const draftExport = await call(actors.author,'post',`/docs/${id}/export`,{format:'xml'});
    expect(draftExport.status,JSON.stringify(draftExport.body)).toBe(409);
    // A corrupt displayed lifecycle flag must not bypass the independent
    // workflow qualification check before the renderer or export ledger.
    await owner.query("UPDATE authoring_documents SET status='APPROVED' WHERE id=$1 AND tenant_id=$2",[id,orgId]);
    const forgedStateExport = await call(actors.author,'post',`/docs/${id}/export`,{format:'xml'});
    expect(forgedStateExport.status,JSON.stringify(forgedStateExport.body)).toBe(409);
    expect(codeOf(forgedStateExport)).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
    expect(await effects(id)).toEqual(before);
  });

  it('does not let a full-hash adoption cover content added after that human signature',async () => {
    const data = await pull(await protocol());
    await adopt(data.doc.id);
    const section = await call(actors.author,'post','/sections',{doc_id:data.doc.id,code:'99',title:'Added after review',content:'<p>Additional clinical assertions.</p>'});
    expect(section.status,JSON.stringify(section.body)).toBe(201);
    const response = await freeze(data.doc.id);
    expect(response.status,JSON.stringify(response.body)).toBe(409);
    expect(String(codeOf(response))).toMatch(/^WORKFLOW_/);
    expect((await effects(data.doc.id)).frozen).toBe(0);
  });
});

describe('full visible review and known machine qualification remain distinct',() => {

  it('requires new full-document adoption after an actual section-title edit even when its prose hash stays the same',async () => {
    const data = await pull(await protocol());
    await adopt(data.doc.id);
    const section = data.sections[0];
    const edited = await call(actors.author,'patch',`/sections/${section.id}`,{title:'New current visible scientific title',changeReason:REASON});
    expect(edited.status,JSON.stringify(edited.body)).toBe(200);
    const response = await freeze(data.doc.id);
    expect(response.status,JSON.stringify(response.body)).toBe(409);
    expect(codeOf(response)).toBe('WORKFLOW_HUMAN_ADOPTION_REQUIRED');
    expect((await effects(data.doc.id)).frozen).toBe(0);
  });

  it('records a real reviewer signature without releasing known machine text when it clears the last workflow step',async () => {
    const data = await pull(await csr());
    const id = data.doc.id;
    const submitted = await call(actors.author,'post',`/docs/${id}/submit`,{
      reason:REASON,workflow_steps:[{role:'REVIEWER',approver_email:actors.reviewer.email}],
    });
    expect(submitted.status,JSON.stringify(submitted.body)).toBe(200);
    await approveAssignedReview(id);
    const reviewed = await call(actors.reviewer,'post',`/docs/${id}/sign`,{
      meaning:'REVIEWER',reason:REASON,password:PASSWORD,adoptWorkflowSource:true,
    });
    expect(reviewed.status,JSON.stringify(reviewed.body)).toBe(200);
    expect(reviewed.body.workflowSourceAdoption).toMatchObject({scope:'full-document',originalAuthorshipDisclosed:true});
    expect(await effects(id)).toEqual({signatures:1,frozen:0,exports:0});
    expect((await owner.query('SELECT status FROM authoring_documents WHERE id=$1 AND tenant_id=$2',[id,orgId])).rows[0].status.toUpperCase()).not.toBe('APPROVED');
    expect((await owner.query('SELECT status FROM authoring_workflow_steps WHERE doc_id=$1 AND tenant_id=$2',[id,orgId])).rows).toEqual([{status:'APPROVED'}]);
    expect(codeOf(await freeze(id))).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
  });

  it('retains an accepted protocol machine span as machine origin without transferring its prior acceptance or inventing qualification',async () => {
    const source = await protocol();
    const section = (await owner.query('SELECT id,content FROM protocol_sections WHERE protocol_document_id=$1 AND organization_id=$2',[source.kind==='protocol'?source.documentId:0,orgId])).rows[0];
    await owner.query(`INSERT INTO document_span_lineage
      (organization_id,document_table,document_id,char_start,char_end,span_text_sha256,provenance_kind,machine_author_id,asserted_by,asserted_at,usage,created_by)
      VALUES($1,'protocol_sections',$2,0,$3,$4,'accepted_machine_draft','ana',$5,NOW(),'asserted',$5)`,
    [orgId,String(section.id),section.content.length,sha(section.content),String(actors.author.id)]);
    const data = await pull(source);
    expect(data.origin.sectionOrigins.find((s:{code:string})=>s.code==='protocol.population')).toMatchObject({originalAuthorship:'machine',model:null,modelEvidence:'unrecorded'});
    expect(await effects(data.doc.id)).toEqual({signatures:0,frozen:0,exports:0});
    await adopt(data.doc.id);
    const response = await freeze(data.doc.id);
    expect(response.status,JSON.stringify(response.body)).toBe(409);
    expect(codeOf(response)).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
    expect((await effects(data.doc.id)).frozen).toBe(0);
  });
});

describe('retained workflow identity and lifecycle changes fail closed',() => {

  it('allows real DOCX working bytes for held machine text with an explicit uncontrolled notice and no controlled export or seal',async () => {
    const data = await pull(await csr());
    const id = data.doc.id;
    const response = await request(app).post(`/api/authoring/docs/${id}/working-copy`)
      .set('Authorization',`Bearer ${actors.author.token}`).send({format:'docx'}).buffer(true)
      .parse((stream,done)=>{
        const chunks: Buffer[]=[];
        stream.on('data',chunk=>chunks.push(chunk));
        stream.on('end',()=>done(null,Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('working_copy');
    const bytes = response.body as Buffer;
    expect(bytes.subarray(0,4)).toEqual(Buffer.from([0x50,0x4b,0x03,0x04]));
    const {default:JSZip} = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('NOT FINAL');
    expect(xml).toContain('Model qualification');
    expect(xml).toContain('release hold');
    expect(await effects(id)).toEqual({signatures:0,frozen:0,exports:0});
    expect((await owner.query("SELECT count(*)::int AS n FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='WORKING_COPY'",[id,orgId])).rows[0].n).toBe(1);
    expect(codeOf(await freeze(id))).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
  });

  it('does not lift a known-machine hold when displayed workflow provenance is removed',async () => {
    const data = await pull(await csr());
    expect(data.origin.sectionOrigins[0]).toMatchObject({originalAuthorship:'machine',model:null,modelEvidence:'unrecorded'});
    // Simulated corrupt display metadata on this fixture only. The immutable
    // CREATE receipt and original source still exist and are authoritative.
    await owner.query('UPDATE authoring_documents SET provenance=NULL WHERE id=$1 AND tenant_id=$2',[data.doc.id,orgId]);
    const response = await freeze(data.doc.id);
    expect(response.status,JSON.stringify(response.body)).toBe(409);
    expect(codeOf(response)).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
    expect(await effects(data.doc.id)).toEqual({signatures:0,frozen:0,exports:0});
  });

  it('cannot freeze a snapshot that misses an actual section insertion queued ahead of its parent lock',async () => {
    const data = await pull(await protocol());
    const id = data.doc.id;
    await adopt(id);
    const holder = await owner.connect();
    let insertion: Promise<request.Response> | undefined;
    let signing: Promise<request.Response> | undefined;
    try {
      await holder.query('BEGIN');
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query('SELECT id FROM authoring_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,orgId]);
      insertion = call(actors.author,'post','/sections',{doc_id:id,code:'98',title:'Concurrent clinical assertion',content:'<p>New clinical content saved before the freeze obtains its parent lock.</p>'}).then(result=>result);
      await waitForParentWait(holderPid,false);
      signing = freeze(id).then(result=>result);
      await waitForParentWait(holderPid,true);
      await holder.query('COMMIT');
      const [created,frozen] = await Promise.all([insertion,signing]);
      expect(created.status,JSON.stringify(created.body)).toBe(201);
      expect(frozen.status,JSON.stringify(frozen.body)).toBe(409);
      expect(String(codeOf(frozen))).toMatch(/^WORKFLOW_|^DOCUMENT_CHANGED_DURING_GOVERNANCE$/);
      expect((await effects(id)).frozen).toBe(0);
    } finally {
      await holder.query('ROLLBACK').catch(()=>undefined);
      holder.release();
      await Promise.allSettled([insertion,signing].filter(Boolean));
    }
  });
});

describe('current sealed records and later renditions retain their exact reviewed text',() => {

  it('refuses a PATCH that passed its editable preflight but waited behind the actual committed freeze without changing text, lineage or revisions',async () => {
    const data = await pull(await protocol());
    const id = data.doc.id;
    const sectionId = data.sections[0].id;
    await adopt(id);
    const savedState = async () => (await owner.query(`SELECT
      (SELECT to_jsonb(s) FROM authoring_sections s WHERE s.id=$1::uuid AND s.tenant_id=$2) AS section,
      (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM document_span_lineage l
        WHERE l.document_table='authoring_sections' AND l.document_id=$1::text AND l.organization_id=$2) AS lineage,
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM doc_revisions r
        WHERE r.section_id=$1::uuid AND r.tenant_id=$2) AS revisions`,[sectionId,orgId])).rows[0];
    const before = await savedState();
    const holder = await owner.connect();
    let signing: Promise<request.Response> | undefined;
    let patch: Promise<request.Response> | undefined;
    try {
      await holder.query('BEGIN');
      const holderPid = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query('SELECT id FROM authoring_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,orgId]);
      signing = freeze(id).then(result=>result);
      await waitForParentWait(holderPid,true);
      patch = call(actors.author,'patch',`/sections/${sectionId}`,{content:'<p>This late write must not reach the sealed record.</p>',changeReason:REASON}).then(result=>result);
      await waitForParentWait(holderPid,false,true);
      await holder.query('COMMIT');
      const [frozen,refused] = await Promise.all([signing,patch]);
      expect(frozen.status,JSON.stringify(frozen.body)).toBe(200);
      expect(refused.status,JSON.stringify(refused.body)).toBe(403);
      expect(codeOf(refused)).toBe('DOCUMENT_FROZEN');
      expect(await savedState()).toEqual(before);
      expect((await effects(id)).frozen).toBe(1);
    } finally {
      await holder.query('ROLLBACK').catch(()=>undefined);
      holder.release();
      await Promise.allSettled([signing,patch].filter(Boolean));
    }
  });

  it('permits an actual human replacement after current review without erasing original machine origin or fabricating PQ',async () => {
    const data = await pull(await csr());
    const id = data.doc.id;
    expect(codeOf(await freeze(id))).toBe('WORKFLOW_MODEL_QUALIFICATION_REQUIRED');
    const section = data.sections[0];
    const replacement = await call(actors.author,'patch',`/sections/${section.id}`,{
      content:'<p>Independent medical oversight established the authorized enrollment criteria through documented clinical review.</p>',changeReason:REASON,
    });
    expect(replacement.status,JSON.stringify(replacement.body)).toBe(200);
    const unadopted = await freeze(id);
    expect(unadopted.status,JSON.stringify(unadopted.body)).toBe(409);
    expect(codeOf(unadopted)).toBe('WORKFLOW_HUMAN_ADOPTION_REQUIRED');
    await adopt(id);
    const released = await freeze(id);
    expect(released.status,JSON.stringify(released.body)).toBe(200);
    const kept = (await owner.query('SELECT provenance FROM authoring_documents WHERE id=$1',[id])).rows[0].provenance;
    expect(kept.importSource.sectionOrigins[0]).toMatchObject({originalAuthorship:'machine',model:null,modelEvidence:'unrecorded'});
    expect(kept.servedBy).toBeUndefined();
  });

  it('refuses re-signing and new controlled output when a source child changes after reviewed freeze',async () => {
    const source = await protocol();
    const data = await pull(source);
    await adopt(data.doc.id);
    expect((await freeze(data.doc.id)).status).toBe(200);
    const before = await effects(data.doc.id);
    await owner.query(`INSERT INTO protocol_sections
      (organization_id,protocol_document_id,section_key,title,content,created_by)
      VALUES($1,$2,'protocol.afterfreeze','Changed after adoption','Additional source requirements.',$3)`,[orgId,source.kind==='protocol'?source.documentId:0,actors.author.id]);
    for(const response of await Promise.all([
      call(actors.author,'post',`/docs/${data.doc.id}/e-sign`,{meaning:'AUTHOR',intent:REASON,password:PASSWORD}),
      call(actors.author,'post',`/docs/${data.doc.id}/export`,{format:'xml'}),
    ])) {
      expect(response.status,JSON.stringify(response.body)).toBe(409);
      expect(String(codeOf(response))).toMatch(/SOURCE|WORKFLOW/);
    }
    expect(await effects(data.doc.id)).toEqual(before);
  });
});
