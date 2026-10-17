/**
 * Native QMS request connection proof on the fully provisioned schema.
 * Actual authMiddleware establishes tenant ALS and LazyRequestDbClient; real
 * password re-verification and signature persistence are exercised. This is
 * synthetic local integration evidence, not live production/MFA qualification.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';

const TAG = `audit-qms-${Date.now().toString(36)}`;
const PASSWORD = 'Synthetic-Qms-Native-Proof-2026!';
const PROSE = 'Synthetic controlled text for the native QMS connection proof.';
const PROGRAM = randomUUID();
const OTHER_PROGRAM = randomUUID();
type Actor = { id: number; org: number; role: string; token: string };

let owner: Pool;
let rawRuntime: Pool;
let app: express.Express;
let missingContextApp: express.Express;
let org: number;
let otherOrg: number;
let author: Actor;
let signer: Actor;
let unshared: Actor;
let foreign: Actor;
let documentId: number;
let authoringId: string;
let trainingInput: { documentVersion: string; contentDigest: string; understood: true; method: 'attestation' };
const discardedBackendPids: number[] = [];
const observedScopes: Array<{ user: number; role: string; tenant: string; lazy: boolean }> = [];

function call(actor: Actor, method: 'get' | 'post' | 'patch', path: string, body?: Record<string,unknown>) {
  const invocation = request(app)[method](`/api/mdx/qms${path}`).set('Authorization', `Bearer ${actor.token}`);
  return body === undefined ? invocation : invocation.send(body);
}

async function makeActor(handle: string, organizationId: number, role: string): Promise<Actor> {
  const user = await owner.query<{ id: number }>(`INSERT INTO users (email,name,password_hash,status,mfa_enabled)
    VALUES ($1,$2,$3,'active',false) RETURNING id`, [`${TAG}-${handle}@example.invalid`, `${TAG} ${handle}`, await bcrypt.hash(PASSWORD, 4)]);
  const id = user.rows[0].id;
  await owner.query('INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,$3)', [organizationId,id,role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  // Deliberately claim admin for the unshared member too: middleware must use
  // persisted membership, and a token role cannot grant access to the prose.
  return { id, org:organizationId, role, token:jwt.sign({type:'access',userId:id,organizationId:String(organizationId),role:'admin'},activeJwtSecret(),{expiresIn:'15m'}) };
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must identify the non-superuser runtime connection.');
  owner = new Pool({ connectionString: databaseUrl, max:3 });
  rawRuntime = new Pool({connectionString:process.env.APP_DATABASE_URL,max:2,options:'-c app.rls_enforce=on'});
  const identity = await rawRuntime.query<{ user:string;super:boolean;bypass:boolean }>(
    'SELECT current_user AS user,rolsuper AS super,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user');
  expect(identity.rows[0]).toEqual({user:'app_service',super:false,bypass:false});
  // Local CI plaintext and explicitly required TLS are qualified separately.
  expect((await rawRuntime.query<{ssl:boolean}>('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  const guarded = await owner.query<{ relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean }>(
    `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace
     AND relname=ANY($1::text[])`,[['qms_documents','qms_document_versions','authoring_documents','authoring_sections','qms_training_records']]);
  expect(guarded.rows).toHaveLength(5);
  expect(guarded.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  const organizations = await owner.query<{id:number}>(`INSERT INTO organizations(name,slug,status)
    VALUES ($1,$1,'active'),($2,$2,'active') RETURNING id`,[`${TAG}-own`,`${TAG}-other`]);
  [org,otherOrg]=organizations.rows.map(row=>row.id);
  author=await makeActor('author',org,'admin');
  signer=await makeActor('signer',org,'admin');
  unshared=await makeActor('unshared',org,'member');
  foreign=await makeActor('foreign',otherOrg,'admin');
  for (const [organizationId,programId,actor] of [[org,PROGRAM,author],[otherOrg,OTHER_PROGRAM,foreign]] as const) {
    const workspace = await owner.query<{id:number}>('INSERT INTO client_workspaces (organization_id,name,slug) VALUES ($1,$2,$2) RETURNING id',[organizationId,TAG]);
    await owner.query(`INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
      VALUES ($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active')`,[programId,organizationId,`${TAG}-${organizationId}`,actor.id]);
    const project=await owner.query<{id:number}>(`INSERT INTO projects (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES ($1,$2,$3,'program','active',$4,$4,$5,$6::json) RETURNING id`,
      [organizationId,workspace.rows[0].id,TAG,actor.id,programId,JSON.stringify({projectSharing:{visibility:'private',members:[]}})]);
    await owner.query('INSERT INTO project_visibility_settings (organization_id,project_id,visibility) VALUES ($1,$2,$3)',[organizationId,project.rows[0].id,'private']);
  }
  const {authMiddleware}=await import('../../server/auth');
  const {getTenantScope,runWithTenantScope}=await import('../../server/db/tenantStore');
  const {LazyRequestDbClient}=await import('../../server/middleware/lazyRequestDbClient');
  const qms=(await import('../../server/routes/mdx-qms')).default;
  app=express();app.use(express.json());
  app.use('/api/mdx',authMiddleware,(req,_res,next)=>{
    const scope=getTenantScope();
    observedScopes.push({user:Number(req.user?.id),role:String(req.user?.role),tenant:scope?.tenantId??'',lazy:(req as express.Request&{dbClient?:unknown}).dbClient instanceof LazyRequestDbClient});
    const fault = req.get('x-qms-native-audit-fault');
    if(fault){
      const pinned=(req as express.Request&{dbClient?:{query:Pool['query']}}).dbClient;
      if(!pinned)throw new Error('Fault fixture requires the actual pinned request client');
      const original=pinned.query.bind(pinned);
      let acknowledged=false;
      pinned.query=(async(...args:unknown[])=>{
        const input=args[0] as string|{text?:string};
        const text=typeof input==='string'?input:input.text??'';
        if(fault==='retained-release-read'&&/FROM qms_document_versions/.test(text))throw new Error('Synthetic private retained version read diagnostic');
        if(fault==='after-ack'&&acknowledged&&/INSERT INTO audit_logs/.test(text))throw Object.assign(new Error('Synthetic post-commit audit-write fault'),{code:'42501'});
        if(fault==='after-commit'&&text==='COMMIT'){
          const identity=await original('SELECT pg_backend_pid() AS pid');
          discardedBackendPids.push(Number(identity.rows[0].pid));
        }
        const result=await (original as (...values:unknown[])=>Promise<unknown>)(...args);
        if(fault==='after-commit'&&text==='COMMIT')throw new Error('Synthetic private committed reply loss');
        if(/INSERT INTO qms_training_records/.test(text))acknowledged=true;
        return result;
      }) as Pool['query'];
    }
    next();
  },qms);
  // A contract-only negative: synthetic identity + ALS without the required
  // request client. This is deliberately not called an authenticated request.
  missingContextApp=express();missingContextApp.use(express.json());
  missingContextApp.use('/api/mdx',(req,_res,next)=>{
    req.user={id:author.id,organizationId:String(org),role:'admin'} as typeof req.user;
    return runWithTenantScope({tenantId:String(org),role:'admin',source:'test',caller:'qms-missing-request-client-control'},next);
  },qms);
},120_000);

afterAll(async () => {
  // Preserve this invocation's uniquely named synthetic signatures, versions
  // and audit evidence. No immutability trigger, RLS policy or guard is disabled.
  const {getPool}=await import('../../server/db/runtime');
  await getPool().end();await rawRuntime?.end();await owner?.end();
});

describe('QMS through authenticated native request scope',()=>{
  it('creates an owned draft, Authoring sections and durable grants through the actual request client',async()=>{
    const response=await call(author,'post','/documents',{title:TAG,docType:'sop',programId:PROGRAM,docNumber:`${TAG}-SOP`,reason:'Create native controlled-document proof'});
    expect(response.status,JSON.stringify(response.body)).toBe(201);
    documentId=response.body.data.id;authoringId=response.body.data.authoring_document_id;
    expect(documentId).toBeGreaterThan(0);expect(authoringId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.meta.auditTrail).toMatchObject({persisted:true,chained:true});
    const sections=await owner.query('SELECT id,content FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2 ORDER BY order_index',[authoringId,org]);
    expect(sections.rows.length).toBeGreaterThan(0);expect(sections.rows.every(row=>row.content==='')).toBe(true);
    const grants=await owner.query('SELECT role FROM doc_permissions WHERE doc_id=$1 AND tenant_id=$2 AND principal_id=$3 AND revoked_at IS NULL',[authoringId,org,String(author.id)]);
    expect(grants.rows.map(row=>row.role)).toEqual(expect.arrayContaining(['OWNER','AUTHOR']));
    // Trusted synthetic content fixture, not a claim about the editor-save API.
    await owner.query('UPDATE authoring_sections SET content=$3 WHERE id=$1 AND tenant_id=$2',[sections.rows[0].id,org,PROSE]);
  });

  it('reads register/editor using real auth ALS and LazyRequestDbClient',async()=>{
    const register=await call(author,'get','/documents');expect(register.status).toBe(200);
    expect(register.body.data.some((row:{id:number})=>row.id===documentId)).toBe(true);
    expect(JSON.stringify(register.body)).not.toContain(PROSE);
    const editor=await call(author,'get',`/documents/${documentId}/editor`);expect(editor.status,JSON.stringify(editor.body)).toBe(200);
    expect(editor.body.data.document.id).toBe(authoringId);
    expect(observedScopes).toContainEqual({user:author.id,role:'admin',tenant:String(org),lazy:true});
  });

  it('distinguishes raw unscoped denial from working canonical ALS global and pinned reads',async()=>{
    expect((await rawRuntime.query('SELECT id FROM qms_documents WHERE organization_id=$1',[org])).rows).toEqual([]);
    const {runWithTenantScope}=await import('../../server/db/tenantStore');
    const {getPool}=await import('../../server/db/runtime');
    const {LazyRequestDbClient}=await import('../../server/middleware/lazyRequestDbClient');
    const {applySessionScope}=await import('../../server/db/sessionScope');
    const scope={tenantId:String(org),role:'admin',source:'test' as const,caller:'native-qms-ambient-control'};
    await runWithTenantScope(scope,async()=>{
      const ambient=await getPool().query('SELECT id FROM qms_documents WHERE organization_id=$1',[org]);
      expect(ambient.rows).toContainEqual({id:documentId});
      const lazy=new LazyRequestDbClient(getPool(),client=>applySessionScope(client,scope));
      try {expect((await lazy.query('SELECT id FROM qms_documents WHERE organization_id=$1',[org])).rows).toContainEqual({id:documentId});}
      finally {await lazy.release();}
    });
  });

  it('reviews then approves saved text with real password re-verification and one bound signature',async()=>{
    const review=await call(author,'patch',`/documents/${documentId}`,{status:'in_review',reason:'Saved controlled text is ready for review'});
    expect(review.status,JSON.stringify(review.body)).toBe(200);
    const {runWithTenantScope}=await import('../../server/db/tenantStore');
    const {getPool}=await import('../../server/db/runtime');
    await runWithTenantScope({tenantId:String(org),role:'admin',source:'test',caller:'qms-native-review-lock'},async()=>{
      await expect(getPool().query('UPDATE authoring_sections SET content=$2 WHERE doc_id=$1 AND tenant_id=$3',[authoringId,'Refused synthetic replacement',org])).rejects.toThrow(/QMS_DOCUMENT_CONTROLLED/);
    });
    const approved=await call(signer,'post',`/documents/${documentId}/approve`,{password:PASSWORD,meaning:'APPROVED',reason:'Independent native review of saved controlled text'});
    expect(approved.status,JSON.stringify(approved.body)).toBe(200);expect(approved.body.data.status).toBe('effective');
    const records=await owner.query(`SELECT s.signature_type,s.signer_id,s.authentication_method,s.bound_payload_digest,v.sections,v.content_digest
      FROM qms_document_versions v JOIN electronic_signatures s ON s.id=v.signature_id
      WHERE v.organization_id=$1 AND v.document_id=$2`,[org,documentId]);
    expect(records.rows).toHaveLength(1);expect(records.rows[0]).toMatchObject({signature_type:'qms-document-approval',signer_id:signer.id,authentication_method:'password'});
    expect(records.rows[0].sections.some((section:{content:string})=>section.content===PROSE)).toBe(true);
    expect(records.rows[0].content_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(records.rows[0].bound_payload_digest).toBe(records.rows[0].content_digest);
    await runWithTenantScope({tenantId:String(org),role:'admin',source:'test',caller:'qms-native-version-immutability'},async()=>{
      await expect(getPool().query(`UPDATE qms_document_versions SET sections='[]'::jsonb WHERE organization_id=$1 AND document_id=$2`,[org,documentId])).rejects.toThrow(/immutable|permission denied/i);
    });
  });

});

describe('QMS bound released training and retained private access',()=>{
  it('reads retained versions and counts actual current-version training',async()=>{
    const versions=await call(author,'get',`/documents/${documentId}/versions`);
    expect(versions.status,JSON.stringify(versions.body)).toBe(200);expect(versions.body.data).toHaveLength(1);
    expect(JSON.stringify(versions.body.data)).toContain(PROSE);
    const read=await call(author,'get',`/documents/${documentId}`);
    expect(read.status,JSON.stringify(read.body)).toBe(200);
    expect(read.body.meta.training).toMatchObject({eligible:true,canEditControlledText:false});
    expect(read.body.meta.training.sections).toContainEqual(expect.objectContaining({body:PROSE}));
    trainingInput={documentVersion:read.body.meta.training.documentVersion,contentDigest:read.body.meta.training.contentDigest,understood:true,method:'attestation'};
    const ack=await call(author,'post',`/documents/${documentId}/training-ack`,trainingInput);
    expect(ack.status,JSON.stringify(ack.body)).toBe(201);expect(ack.body.data.documentVersion).toBe('1.0');
    expect(ack.body.meta.auditTrail).toMatchObject({persisted:true,chained:true});
    expect((await owner.query(`SELECT id FROM audit_logs WHERE tenant_id=$1 AND action='mdx.qms.training.acknowledge' AND record_id=$2`,[org,String(documentId)])).rows).toHaveLength(1);
    const training=await call(author,'get','/training/compliance');expect(training.status,JSON.stringify(training.body)).toBe(200);
    expect(training.body.data).toContainEqual(expect.objectContaining({id:documentId,current:1}));
    const readiness=await call(author,'get','/readiness');expect(readiness.status,JSON.stringify(readiness.body)).toBe(200);
    expect(readiness.body.data.training.available).toBe(true);
  });

  it('refuses training when the exact immutable snapshot cannot be read and recovers without a mutable-text fallback',async()=>{
    const unavailable=await request(app).get(`/api/mdx/qms/documents/${documentId}`).set('Authorization',`Bearer ${author.token}`).set('x-qms-native-audit-fault','retained-release-read');
    expect(unavailable.status,JSON.stringify(unavailable.body)).toBe(200);
    expect(unavailable.body.meta.training).toMatchObject({eligible:false,sections:[]});
    expect(unavailable.body.meta.training.unavailableReason).toMatch(/immutable signed content could not be read/i);
    expect(JSON.stringify(unavailable.body)).not.toContain(PROSE);
    expect(JSON.stringify(unavailable.body)).not.toContain('Synthetic private retained version read diagnostic');
    const refused=await request(app).post(`/api/mdx/qms/documents/${documentId}/training-ack`).set('Authorization',`Bearer ${signer.token}`).set('x-qms-native-audit-fault','retained-release-read').send(trainingInput);
    expect(refused.status).toBe(503);expect(refused.body.details.code).toBe('QMS_TRAINING_APPROVAL_UNAVAILABLE');
    const recovered=await call(author,'get',`/documents/${documentId}`);
    expect(recovered.body.meta.training).toMatchObject({eligible:true,contentDigest:trainingInput.contentDigest});
  });

  it('rolls back the personal receipt with its mandatory audit on failure and recovers on a fresh request',async()=>{
    const beforeAcks=await owner.query<{n:number}>('SELECT count(*)::int AS n FROM qms_training_records WHERE organization_id=$1 AND document_id=$2',[org,documentId]);
    const beforeAudit=await owner.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='mdx.qms.training.acknowledge' AND record_id=$2`,[org,String(documentId)]);
    const failedHistory=await request(app).post(`/api/mdx/qms/documents/${documentId}/training-ack`).set('Authorization',`Bearer ${signer.token}`).set('x-qms-native-audit-fault','after-ack').send(trainingInput);
    expect(failedHistory.status,JSON.stringify(failedHistory.body)).toBe(500);
    expect(JSON.stringify(failedHistory.body)).not.toContain('Synthetic post-commit audit-write fault');
    expect((await owner.query<{n:number}>('SELECT count(*)::int AS n FROM qms_training_records WHERE organization_id=$1 AND document_id=$2',[org,documentId])).rows[0].n).toBe(beforeAcks.rows[0].n);
    expect((await owner.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='mdx.qms.training.acknowledge' AND record_id=$2`,[org,String(documentId)])).rows[0].n).toBe(beforeAudit.rows[0].n);
    const recovered=await call(signer,'post',`/documents/${documentId}/training-ack`,trainingInput);
    expect(recovered.status,JSON.stringify(recovered.body)).toBe(201);expect(recovered.body.meta.auditTrail).toMatchObject({persisted:true,chained:true});
    const duplicate=await call(signer,'post',`/documents/${documentId}/training-ack`,trainingInput);
    expect(duplicate.status).toBe(200);expect(duplicate.body.meta.alreadyAcknowledged).toBe(true);
    expect((await owner.query<{n:number}>(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='mdx.qms.training.acknowledge' AND record_id=$2`,[org,String(documentId)])).rows[0].n).toBe(beforeAudit.rows[0].n+1);
  });

});

describe('QMS native current access and signature recovery',()=>{
  it('refuses exact foreign records, training acknowledgments and program claims without exposing prose',async()=>{
    for(const path of [`/documents/${documentId}`,`/documents/${documentId}/editor`,`/documents/${documentId}/versions`]){
      const response=await call(foreign,'get',path);expect(response.status,JSON.stringify(response.body)).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(PROSE);expect(JSON.stringify(response.body)).not.toContain(authoringId);
    }
    expect((await call(foreign,'post',`/documents/${documentId}/training-ack`,trainingInput)).status).toBe(404);
    const created=await call(foreign,'post','/documents',{title:`${TAG}-foreign`,docType:'sop',programId:PROGRAM,reason:'Refuse foreign program in native proof'});
    expect(created.status,JSON.stringify(created.body)).toBe(404);
    expect((await owner.query('SELECT id FROM qms_documents WHERE organization_id=$1',[otherOrg])).rows).toEqual([]);
  });

  it('uses fresh membership to refuse an unshared member despite an admin token claim',async()=>{
    for(const path of [`/documents/${documentId}`,`/documents/${documentId}/editor`,`/documents/${documentId}/versions`]){
      const response=await call(unshared,'get',path);expect(response.status,JSON.stringify(response.body)).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(PROSE);
    }
    expect(observedScopes).toContainEqual({user:unshared.id,role:'member',tenant:String(org),lazy:true});
  });

  it('fails closed on a missing request client even with synthetic ALS, without claiming an auth-production defect',async()=>{
    const response=await request(missingContextApp).get(`/api/mdx/qms/documents/${documentId}/editor`);
    expect(response.status).toBe(500);expect(JSON.stringify(response.body)).not.toContain(PROSE);
    expect((await owner.query('SELECT status FROM qms_documents WHERE id=$1',[documentId])).rows[0].status).toBe('effective');
  });
  it('recovers a genuinely committed legacy signature after lost COMMIT reply and discards its physical connection',async()=>{
    const row=(await owner.query(`INSERT INTO qms_documents(organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
      VALUES($1,$2,'Invented reply-loss procedure','sop','1.0','in_review',$3,$4::jsonb) RETURNING id`,
      [org,`${TAG}-commit-loss`,author.id,JSON.stringify({sections:[{key:'procedure',label:'Procedure',body:PROSE}]})])).rows[0];
    const response=await request(app).post(`/api/mdx/qms/documents/${row.id}/approve`).set('Authorization',`Bearer ${signer.token}`).set('x-qms-native-audit-fault','after-commit')
      .send({password:PASSWORD,meaning:'APPROVED',reason:'Independent real commit reply-loss proof'});
    expect(response.status,JSON.stringify(response.body)).toBe(503);
    expect(response.body.details).toMatchObject({code:'QMS_SIGNATURE_COMMIT_UNCONFIRMED',recordId:row.id,recoveryUrl:`/api/mdx/qms/documents/${row.id}`});
    expect(JSON.stringify(response.body)).not.toContain('Synthetic private committed reply loss');
    expect((await owner.query('SELECT status FROM qms_documents WHERE id=$1',[row.id])).rows[0].status).toBe('effective');
    expect((await owner.query('SELECT id FROM electronic_signatures WHERE organization_id=$1 AND signed_target=$2',[org,`qms-document:${row.id}`])).rows).toHaveLength(1);
    expect(discardedBackendPids).toHaveLength(1);
    expect((await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1',[discardedBackendPids[0]])).rows).toHaveLength(0);
    const recovered=await call(signer,'get',`/documents/${row.id}`);
    expect(recovered.status).toBe(200);expect(recovered.body.meta.training.eligible).toBe(true);
  });

});
