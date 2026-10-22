/** Genuine JWT/ALS/FORCE-RLS requests against the canonical provisioned schema.
 * Providers return controlled test drafts; no live model or agency is invoked.
 * Fault controls lose an acknowledged COMMIT response only after real COMMIT,
 * or refuse actual lineage SQL inside its real transaction. */
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';
const h=vi.hoisted(()=>({chat:vi.fn()}));
vi.mock('../../server/lib/unified-ai-client',()=>({ai:{chat:h.chat}}));
const TAG=`synthetic-content-${randomUUID().slice(0,16)}`;
const PROGRAM=randomUUID();
type Actor={id:number;org:number;token:string};
let owner:Pool, runtime:Pool, app:express.Express, org:number, foreignOrg:number;
let author:Actor, viewer:Actor, privateMember:Actor, foreign:Actor;
let projectId:number, privateProjectId:number, foreignProjectId:number, sourceId:string, sourceNativeId:number, dataCenterId:number, deviceId:number, foreignDeviceId:number;
const sourceText='Primary endpoint: objective response rate. ICH E6 and randomized study design.';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
let control:'none'|'lineage-refusal'|'commit-response-loss'|'audit-loss'='none';
let auditSpy:{mockRestore:()=>void}|undefined;
let lostCommitPid:number|undefined;
let lostCommitClient:LazyRequestDbClient|undefined;
const post=(path:string,body:unknown,actor=author)=>request(app).post(path).set('Authorization',`Bearer ${actor.token}`).send(body);
const get=(path:string,actor=author)=>request(app).get(path).set('Authorization',`Bearer ${actor.token}`);
const figureBody=()=>({projectId,figureType:'bar_chart',title:`${TAG} figure`,description:'Controlled recorded observations',rawData:[{arm:'Synthetic arm',response:2}]});
async function actor(name:string,organizationId:number,role:string):Promise<Actor>{
  const id=Number((await owner.query("INSERT INTO users(email,name,password_hash,status,mfa_enabled) VALUES($1,$2,'unused-synthetic-hash','active',false) RETURNING id",[`${TAG}-${name}@example.invalid`,`${TAG} ${name}`])).rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES($1,$2,$3,now()-interval '1 day')",[organizationId,id,role]);
  const {activeJwtSecret}=await import('../../server/utils/jwtVerify');
  return {id,org:organizationId,token:jwt.sign({type:'access',userId:id,organizationId:String(organizationId),role:'admin'},activeJwtSecret(),{expiresIn:'30m'})};
}
async function project(organizationId:number,workspaceId:number,actorId:number,programId:string|null){
  const id=Number((await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{"projectSharing":{"visibility":"private","members":[]}}') RETURNING id`,[organizationId,workspaceId,TAG,actorId,programId])).rows[0].id);
  await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')",[organizationId,id]);return id;
}
async function artifact(project:number,organizationId:number,text=sourceText){
  const external=`artifact_${randomUUID()}`;
  const row=(await owner.query(`INSERT INTO concept2cure_artifacts(artifact_id,project_id,organization_id,created_by_id,title,content,content_hash,type,category,status,metadata,version)
    VALUES($1,$2,$3,$4,$5,$6,$7,'table','extracted','draft',$8,1) RETURNING id`,[external,project,organizationId,organizationId===org?author.id:foreign.id,TAG,text,hash(text),JSON.stringify({extractedData:[{arm:'Synthetic arm',response:2}]})])).rows[0];
  return {id:Number(row.id),external};
}
beforeAll(async()=>{
  if(!process.env.APP_DATABASE_URL)throw new Error('APP_DATABASE_URL must identify the non-superuser runtime.');
  owner=new Pool({connectionString:databaseUrl,max:3});runtime=new Pool({connectionString:process.env.APP_DATABASE_URL,max:2,options:'-c app.rls_enforce=on'});
  const who=(await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  expect(who).toMatchObject({role:'app_service',rolsuper:false,rolbypassrls:false});
  expect((await runtime.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  [org,foreignOrg]=(await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active'),($2,$2,'active') RETURNING id",[TAG,`${TAG}-foreign`])).rows.map(row=>Number(row.id));
  author=await actor('author',org,'member');viewer=await actor('viewer',org,'viewer');privateMember=await actor('unshared',org,'member');foreign=await actor('foreign',foreignOrg,'member');
  const workspace=Number((await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id',[org,TAG])).rows[0].id);
  const foreignWorkspace=Number((await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id',[foreignOrg,TAG])).rows[0].id);
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4)`,[PROGRAM,org,TAG,author.id]);
  projectId=await project(org,workspace,author.id,PROGRAM);privateProjectId=await project(org,workspace,privateMember.id,null);foreignProjectId=await project(foreignOrg,foreignWorkspace,foreign.id,null);
  await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')",[org,projectId,viewer.id]);
  const source=await artifact(projectId,org);sourceId=source.external;sourceNativeId=source.id;
  dataCenterId=Number((await owner.query("INSERT INTO device_data_center(organization_id,file_name,file_type,category,uploaded_by,tags,metadata) VALUES($1,'Synthetic.txt','txt','uncategorized',$2,'{}','{}') RETURNING id",[org,String(author.id)])).rows[0].id);
  deviceId=Number((await owner.query("INSERT INTO device_profiles(organization_id,device_name,classification) VALUES($1,$2,'IIa') RETURNING id",[org,TAG])).rows[0].id);
  foreignDeviceId=Number((await owner.query("INSERT INTO device_profiles(organization_id,device_name,classification) VALUES($1,$2,'IIa') RETURNING id",[foreignOrg,TAG])).rows[0].id);
  const {authMiddleware}=await import('../../server/auth');
  app=express();app.use(express.json());
  const fault:express.RequestHandler=(req,_res,next)=>{
    const pinned=req.dbClient;
    if(!pinned)throw new Error('Native fault control requires genuine request client');
    const delegate=pinned.query.bind(pinned);
    pinned.query=(async(...args:unknown[])=>{
      const first=args[0];const sql=typeof first==='string'?first:first&&typeof first==='object'&&'text'in first?String(first.text):'';
      if(control==='lineage-refusal'&&/INSERT INTO concept2cure_provenance_events/.test(sql))throw Object.assign(new Error('Synthetic mandatory lineage refusal'),{code:'42501'});
      const result=await Reflect.apply(delegate,pinned,args);
      if(control==='commit-response-loss'&&sql==='COMMIT'){
        const pid=await Reflect.apply(delegate,pinned,['SELECT pg_backend_pid() AS pid']);
        lostCommitPid=Number(pid.rows[0].pid);lostCommitClient=pinned instanceof LazyRequestDbClient?pinned:undefined;
        throw new Error('Synthetic loss after real successful COMMIT');
      }
      return result;
    }) as typeof pinned.query;
    next();
  };
  app.get('/native-content-scope',authMiddleware,async(req,res)=>{
    const row=(await requestPgClient(req).query("SELECT current_user AS role,current_setting('app.current_tenant_id',true) AS tenant_id")).rows[0];
    res.json({...row,als:getTenantScope()?.tenantId,lazy:req.dbClient instanceof LazyRequestDbClient});
  });
  app.use('/api/audit-services',authMiddleware,fault,(await import('../../server/routes/audit-services')).default);
  app.use('/api/device-data-center',authMiddleware,(await import('../../server/routes/document-data-center')).default);
  app.use('/api/cer',authMiddleware,(await import('../../server/routes/cer-routes')).default);
  const audit=(await import('../../server/services/auditService')).default;const realAudit=audit.logAction.bind(audit);
  auditSpy=vi.spyOn(audit,'logAction').mockImplementation(async(...args:Parameters<typeof audit.logAction>)=>control==='audit-loss'
    ?{persisted:false,chained:false,tamperProof:false,error:'Private synthetic audit outage'}:realAudit(...args));
});
beforeEach(()=>{control='none';h.chat.mockReset();h.chat.mockImplementation(async(input:{callerModule?:string})=>({content:input.callerModule?.startsWith('keywordExtraction')?'{"keywords":[]}':'{"type":"bar","data":{"datasets":[{"data":[2]}]}}',model:'controlled-test-provider'}));});
afterAll(async()=>{control='none';auditSpy?.mockRestore();await owner?.end();await runtime?.end();const {getPool}=await import('../../server/db/runtime');await getPool().end();});
function registerContentAdmissionCases1() {
  it('uses actual auth/ALS/lazy request connection and installed FORCE RLS',async()=>{
    const scope=await get('/native-content-scope');expect(scope.status,JSON.stringify(scope.body)).toBe(200);
    expect(scope.body).toEqual({role:'app_service',tenant_id:String(org),als:String(org),lazy:true});
    const policies=(await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('concept2cure_artifacts'::regclass,'cer_reports'::regclass,'device_data_center'::regclass,'audit_logs'::regclass)")).rows;
    expect(policies).toHaveLength(4);expect(policies.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  });
  it.each(['none','audit-loss'] as const)('figure draft and mandatory lineage really persist with ancillary audit=%s',async mode=>{
    control=mode;const res=await post('/api/audit-services/figures/generate',figureBody());
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.figure.storage.status).toBe('saved');
    expect(res.body.meta.auditTrail).toMatchObject({persisted:mode==='none'});
    const stored=(await owner.query('SELECT id,content,created_by_id,organization_id FROM concept2cure_artifacts WHERE artifact_id=$1',[res.body.figure.storage.artifactId])).rows[0];
    expect(stored).toMatchObject({content:res.body.figure.figure.generatedContent,created_by_id:author.id,organization_id:org});
    expect((await owner.query('SELECT actor_id FROM concept2cure_provenance_events WHERE artifact_id=$1',[stored.id])).rows).toEqual([{actor_id:author.id}]);
    if(mode==='none')expect((await owner.query("SELECT tenant_id,user_id FROM audit_logs WHERE tenant_id=$1 AND action='figure_generated' AND record_id=$2",[org,res.body.figure.figure.id])).rows).toEqual([{tenant_id:org,user_id:author.id}]);
    expect(h.chat).toHaveBeenCalledTimes(1);expect(JSON.stringify(res.body)).not.toContain('Private synthetic');
  });
  it('mandatory lineage failure rolls back its artifact and preserves the generated draft',async()=>{
    control='lineage-refusal';const res=await post('/api/audit-services/figures/generate',figureBody());
    expect(res.status).toBe(500);expect(res.body.figure.failure).toBe('internal');expect(res.body.figure.storage.status).toBe('not_saved');expect(res.body.figure.figure.generatedContent).toContain('datasets');
    expect((await owner.query('SELECT id FROM concept2cure_artifacts WHERE artifact_id=$1',[res.body.figure.storage.artifactId])).rows).toEqual([]);expect(h.chat).toHaveBeenCalledTimes(1);
    control='none';const recovery=await post('/api/audit-services/figures/generate',figureBody());expect(recovery.status).toBe(200);
  });
  it('loss after actual COMMIT is explicitly unconfirmed and never claims rollback or regenerates',async()=>{
    control='commit-response-loss';const res=await post('/api/audit-services/figures/generate',figureBody());
    expect(res.status).toBe(503);expect(res.body.figure.storage).toMatchObject({status:'unconfirmed',code:'FIGURE_SAVE_UNCONFIRMED'});
    expect(res.body.figure.figure.generatedContent).toContain('datasets');expect(h.chat).toHaveBeenCalledTimes(1);
    expect((await owner.query('SELECT id FROM concept2cure_artifacts WHERE artifact_id=$1',[res.body.figure.storage.artifactId])).rows).toHaveLength(1);
    expect(res.body.meta).toBeUndefined();
    expect(lostCommitClient).toBeInstanceOf(LazyRequestDbClient);
    await expect(lostCommitClient!.query('SELECT 1')).rejects.toThrow(/Cannot query a (discarded|released) request DB client/);
    expect(lostCommitPid).toBeGreaterThan(0);
    await vi.waitFor(async()=>expect((await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1',[lostCommitPid])).rows).toEqual([]));
  });
  it('private project, stale viewer and foreign source refusals precede model execution',async()=>{
    expect((await post('/api/audit-services/figures/generate',{...figureBody(),projectId:privateProjectId})).status).toBe(404);
    expect((await post('/api/audit-services/figures/generate',figureBody(),viewer)).status).toBe(403);
    const source=await artifact(foreignProjectId,foreignOrg);
    expect((await post('/api/audit-services/figures/generate',{...figureBody(),rawData:undefined,sourceDataRefs:[String(source.id)]})).status).toBe(422);expect(h.chat).not.toHaveBeenCalled();
  });
  it.each(['none','audit-loss'] as const)('keyword extraction uses actual source bytes, real parameters and audit=%s',async mode=>{
    control=mode;const res=await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:sourceText,linkSources:false});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.keywords.source).toEqual({artifactId:sourceId,nativeId:sourceNativeId,version:1,sha256:hash(sourceText)});
    expect(res.body.meta.auditTrail).toMatchObject({persisted:mode==='none'});expect(h.chat.mock.calls[0][0]).toMatchObject({organizationId:org,projectId,userId:author.id});
    if(mode==='none')expect((await owner.query("SELECT tenant_id,user_id,new_values->>'projectId' AS project_id FROM audit_logs WHERE tenant_id=$1 AND action='keywords_extracted' AND record_id=$2 ORDER BY chain_seq DESC LIMIT 1",[org,sourceId])).rows).toEqual([{tenant_id:org,user_id:author.id,project_id:String(projectId)}]);
  });
  it('model unavailability is disclosed while actual pattern extraction remains available',async()=>{
    h.chat.mockRejectedValue(new Error('Controlled unavailable keyword model'));
    const result=await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:sourceText,linkSources:false});
    expect(result.status).toBe(200);expect(result.body.keywords.extractionMethods).toEqual({model:'unavailable',patterns:'completed'});
    expect(result.body.keywords.keywords.length).toBeGreaterThan(0);expect(result.body.keywords.source.sha256).toBe(hash(sourceText));
  });
  it('keyword source and submitted text mismatches refuse before any model call',async()=>{
    expect((await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:'Stale changed input',linkSources:false})).status).toBe(409);
    expect((await post('/api/audit-services/keywords/extract',{projectId:privateProjectId,documentId:sourceId,content:sourceText})).status).toBe(404);
    expect((await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:sourceText},foreign)).status).toBe(404);expect(h.chat).not.toHaveBeenCalled();
  });
  it('Data Center tag mutation survives audit outage while refusing foreign tenant and viewer',async()=>{
    control='audit-loss';const res=await request(app).patch(`/api/device-data-center/files/${dataCenterId}/tags`).set('Authorization',`Bearer ${author.token}`).send({tags:['actual-native-save'],userId:'forged'});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta.auditTrail.persisted).toBe(false);
    expect((await owner.query('SELECT tags,metadata FROM device_data_center WHERE id=$1',[dataCenterId])).rows[0]).toMatchObject({tags:['actual-native-save'],metadata:{updatedBy:String(author.id)}});
    expect((await request(app).patch(`/api/device-data-center/files/${dataCenterId}/tags`).set('Authorization',`Bearer ${viewer.token}`).send({tags:['forbidden']})).status).toBe(403);
    expect((await request(app).patch(`/api/device-data-center/files/${dataCenterId}/tags`).set('Authorization',`Bearer ${foreign.token}`).send({tags:['foreign']})).status).toBe(404);
    expect((await request(app).post('/api/device-data-center/upload').set('Authorization',`Bearer ${viewer.token}`).attach('file',Buffer.from('Must not receive bytes'),'blocked.txt')).status).toBe(403);
  });
}

function registerContentAdmissionCases2() {
  it('two tenants create native CER identities independently and a viewer/foreign device is refused',async()=>{
    const body={deviceId,regulatoryFramework:'MDR_2017_745'};
    const first=await post('/api/cer/mdr/generate',body);expect(first.status,JSON.stringify(first.body)).toBe(201);expect(first.body.meta.auditTrail.persisted).toBe(true);
    const second=await post('/api/cer/mdr/generate',{...body,deviceId:foreignDeviceId},foreign);expect(second.status,JSON.stringify(second.body)).toBe(201);expect(second.body.reportId).not.toBe(first.body.reportId);
    expect((await post('/api/cer/mdr/generate',body,viewer)).status).toBe(403);
    expect((await post('/api/cer/mdr/generate',{...body,deviceId:foreignDeviceId})).status).toBe(422);
  });
  it('keyword links use actual scoped source queries and unavailable reads never become empty successful extraction',async()=>{
    const linked=await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:sourceText,linkSources:true});
    expect(linked.status,JSON.stringify(linked.body)).toBe(200);expect(linked.body.keywords.sourceLinkage).toBe('completed');
    expect(linked.body.keywords.keywords.some((keyword:{linkedSources:unknown[]})=>keyword.linkedSources.length>0)).toBe(true);
    const {getPool}=await import('../../server/db/runtime');const pool=getPool();const real=pool.query.bind(pool);
    const query=vi.spyOn(pool,'query').mockImplementation(((...args:unknown[])=>{
      if(typeof args[0]==='string'&&/FROM evidence_objects e/.test(args[0]))throw new Error('Private synthetic source read failure');
      return Reflect.apply(real,pool,args);
    }) as typeof pool.query);
    try{
      const unavailable=await post('/api/audit-services/keywords/extract',{projectId,documentId:sourceId,content:sourceText,linkSources:true});
      expect(unavailable.status).toBe(503);expect(unavailable.body.keywords).toBeUndefined();expect(JSON.stringify(unavailable.body)).not.toContain('Private synthetic');
    }finally{query.mockRestore();}
  });
  it('compares only supplied document usage without inventing a semantic or persisted-source assessment',async()=>{
    const documents=[{id:sourceId,content:sourceText},{id:`${TAG}-submitted-comparison`,content:sourceText}];
    const modelCalls=h.chat.mock.calls.length;
    const result=await post('/api/audit-services/keywords/consistency',{documents});
    expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.consistency.assessed).toBe(false);
    expect(result.body.consistency.terms.length).toBeGreaterThan(0);
    expect(result.body.consistency.terms.every((row:{isConsistent:unknown;documents:Array<{documentId:string}>})=>row.isConsistent===null&&row.documents.length===2)).toBe(true);
    expect(JSON.stringify(result.body)).toContain(sourceId);expect(h.chat).toHaveBeenCalledTimes(modelCalls);
    expect(result.body.consistency.note).toMatch(/not compared|not assessed/i);
  });
  it('valid extraction computation reaches the existing governance fence and never reports a completed import',async()=>{
    h.chat.mockImplementation(async(input:{callerModule?:string})=>({content:input.callerModule==='autoExtraction.extractTables'?'{"tables":[]}':'{"metadata":{"documentType":"CSR"},"sections":[],"entities":[]}',model:'controlled-test-provider'}));
    const queued=await post('/api/audit-services/extraction/queue',{projectId,fileId:sourceId,fileName:'recorded-source.txt',fileSize:sourceText.length});
    expect(queued.status,JSON.stringify(queued.body)).toBe(200);
    let status:Awaited<ReturnType<typeof get>>|undefined;
    await vi.waitFor(async()=>{status=await get(`/api/audit-services/extraction/status/${queued.body.jobId}`);expect(['completed','failed']).toContain(status.body.job.status);});
    expect(status!.body.job.status,JSON.stringify(status!.body.job)).toBe('failed');
    expect(status!.body.job.error).toContain('originSurface import_pipeline is not allowed for documentClass evidence_memo');
    expect(status!.body.job.result).toBeUndefined();expect(status!.body.meta.auditTrail.persisted).toBe(true);
    expect((await owner.query("SELECT id FROM concept2cure_artifacts WHERE organization_id=$1 AND metadata->>'extractionJobId'=$2",[org,queued.body.jobId])).rows).toEqual([]);
  });
  it('processes queued work after HTTP completion in each tenant scope and rechecks a revoked creator',async()=>{
    const foreignSource=await artifact(foreignProjectId,foreignOrg);const privateSource=await artifact(privateProjectId,org);
    let releaseFirst:()=>void=()=>undefined;const blocked=new Promise<void>(resolve=>{releaseFirst=resolve;});let paused=false;
    const scopes:Array<{expected:number;actual:string|undefined;source:string|undefined}>=[];
    h.chat.mockImplementation(async(input:{callerModule?:string;organizationId:number;userId:number;projectId:number})=>{
      scopes.push({expected:input.organizationId,actual:getTenantScope()?.tenantId,source:getTenantScope()?.source});
      if(input.callerModule==='autoExtraction.extractTables'&&input.projectId===projectId&&!paused){paused=true;await blocked;}
      return {content:input.callerModule==='autoExtraction.extractTables'?'{"tables":[]}':'{"metadata":{"documentType":"CSR"},"sections":[],"entities":[]}',model:'controlled-test-provider'};
    });
    const first=await post('/api/audit-services/extraction/queue',{projectId,fileId:sourceId,fileName:'first.txt',fileSize:sourceText.length});
    await vi.waitFor(()=>expect(paused).toBe(true));
    const second=await post('/api/audit-services/extraction/queue',{projectId:foreignProjectId,fileId:foreignSource.external,fileName:'second.txt',fileSize:sourceText.length},foreign);
    const revoked=await post('/api/audit-services/extraction/queue',{projectId:privateProjectId,fileId:privateSource.external,fileName:'revoked.txt',fileSize:sourceText.length},privateMember);
    expect(second.status).toBe(200);expect(revoked.status).toBe(200);
    await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[org,privateMember.id]);
    releaseFirst();
    try{
      const svc=await import('../../server/services/autoExtractionPipeline');
      await vi.waitFor(async()=>{
        const a=await get(`/api/audit-services/extraction/status/${first.body.jobId}`);const b=await get(`/api/audit-services/extraction/status/${second.body.jobId}`,foreign);
        expect(a.body.job.status).toBe('failed');expect(b.body.job.status).toBe('failed');
        expect(svc.getExtractionStatus(revoked.body.jobId,org)?.status).toBe('failed');
      });
      expect(scopes.some(scope=>scope.expected===foreignOrg)).toBe(true);expect(scopes.every(scope=>scope.actual===String(scope.expected)&&scope.source==='job')).toBe(true);
      expect(h.chat.mock.calls.some(([input])=>input.userId===privateMember.id)).toBe(false);
      expect(svc.getExtractionStatus(revoked.body.jobId,org)?.error).toContain('active organization membership');
      expect((await owner.query("SELECT id FROM concept2cure_artifacts WHERE organization_id=$1 AND metadata->>'extractionJobId'=$2",[org,revoked.body.jobId])).rows).toEqual([]);
    }finally{releaseFirst();await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES($1,$2,'member',now()-interval '1 day') ON CONFLICT(user_id,organization_id) DO NOTHING",[org,privateMember.id]);}
  });
}

function registerContentAdmissionCases3() {
  it('rechecks current writer authority after provider work before attempting artifact storage',async()=>{
    let release:()=>void=()=>undefined;const blocked=new Promise<void>(resolve=>{release=resolve;});let paused=false;
    h.chat.mockImplementation(async(input:{callerModule?:string})=>{
      if(input.callerModule==='autoExtraction.extractTables'){paused=true;await blocked;return {content:'{"tables":[]}',model:'controlled-test-provider'};}
      return {content:'{"metadata":{"documentType":"CSR"},"sections":[],"entities":[]}',model:'controlled-test-provider'};
    });
    const queued=await post('/api/audit-services/extraction/queue',{projectId,fileId:sourceId,fileName:'running.txt',fileSize:sourceText.length});
    await vi.waitFor(()=>expect(paused).toBe(true));
    await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[org,author.id]);release();
    try{
      await vi.waitFor(async()=>{const status=await get(`/api/audit-services/extraction/status/${queued.body.jobId}`);expect(status.body.job.status).toBe('failed');expect(status.body.job.error).toContain('current organization role');});
      expect((await owner.query("SELECT id FROM concept2cure_artifacts WHERE organization_id=$1 AND metadata->>'extractionJobId'=$2",[org,queued.body.jobId])).rows).toEqual([]);
    }finally{release();await owner.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2",[org,author.id]);}
  });
  it.each(['keep_data','remove_data'] as const)('canonical %s disposition governs all three source readers before model access',async choice=>{
    const text=`${sourceText} ${choice} ${randomUUID()}`;const item=await artifact(projectId,org,text);
    const vaultId=randomUUID();const dispositionId=randomUUID();const sha256=hash(text);
    await owner.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,version,file_name,file_size,mime_type,content_hash,created_by)
      VALUES($1,$2,$3,$4,$4,'DATASET','1.0','synthetic.txt',$5,'text/plain',$6,$7)`,[vaultId,PROGRAM,org,`${TAG}-${choice}`,text.length,sha256,author.id]);
    const client=await owner.connect();
    try{
      await client.query('BEGIN');
      const {writeChainedAuditRow}=await import('../../server/services/auditService');
      await writeChainedAuditRow(client,{tenantId:org,userId:author.id,action:'document_data.disposition',resourceType:'document_data_dispositions',resourceId:dispositionId,
        details:{syntheticFixture:TAG,choice,sourceSha256:sha256,physicalErasure:false}});
      const audit=(await client.query('SELECT id::text,sha256_chain FROM audit_logs WHERE tenant_id=$1 AND target=$2 ORDER BY chain_seq DESC LIMIT 1',[org,`document_data_dispositions:${dispositionId}`])).rows[0];
      await client.query(`INSERT INTO document_data_dispositions(id,organization_id,program_id,vault_document_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
        VALUES($1,$2,$3,$4,$5,'Synthetic content reader disposition proof',$6,$7,$7,$8,$9,$10)`,[dispositionId,org,PROGRAM,vaultId,choice,author.id,sha256,
          JSON.stringify({capturedSourceIds:[],vaultDocumentIds:[vaultId],artifactIds:[String(item.id),item.external],uploadIds:[]}),JSON.stringify({syntheticFixture:TAG}),JSON.stringify({id:audit.id,sha256Chain:audit.sha256_chain})]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    const keywords=await post('/api/audit-services/keywords/extract',{projectId,documentId:item.external,content:text,linkSources:false});
    expect(keywords.status,JSON.stringify(keywords.body)).toBe(choice==='keep_data'?200:404);
    const figure=await post('/api/audit-services/figures/generate',{...figureBody(),rawData:undefined,sourceDataRefs:[String(item.id)]});
    expect(figure.status,JSON.stringify(figure.body)).toBe(choice==='keep_data'?200:422);
    if(choice==='remove_data'){
      expect(h.chat).not.toHaveBeenCalled();
      const queued=await post('/api/audit-services/extraction/queue',{projectId,fileId:item.external,fileName:'withdrawn.txt',fileSize:text.length});
      expect(queued.status).toBe(200);
      await vi.waitFor(async()=>{const status=await get(`/api/audit-services/extraction/status/${queued.body.jobId}`);expect(status.body.job.status).toBe('failed');expect(status.body.job.error).toContain('source unavailable');});
      expect(h.chat).not.toHaveBeenCalled();
    }
  });
  it('queue returns the actual process-local job identity and status/list retain its audit warning',async()=>{
    control='audit-loss';h.chat.mockRejectedValue(new Error('Controlled model refusal'));
    const queued=await post('/api/audit-services/extraction/queue',{projectId,fileId:sourceId,fileName:'source.txt',fileSize:sourceText.length});
    expect(queued.status,JSON.stringify(queued.body)).toBe(200);expect(typeof queued.body.jobId).toBe('string');expect(queued.body.job.id).toBe(queued.body.jobId);expect(queued.body.persistence).toBe('process-local');
    let status:request.Response;
    await vi.waitFor(async()=>{status=await get(`/api/audit-services/extraction/status/${queued.body.jobId}`);expect(status.body.job.status).toBe('failed');});
    expect(status!.body.meta.auditTrail.persisted).toBe(false);expect(status!.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
    const list=await get(`/api/audit-services/extraction/project/${projectId}`);expect(list.body.jobs.some((job:{id:string})=>job.id===queued.body.jobId)).toBe(true);expect(list.body.meta.auditTrail.persisted).toBe(false);
    expect((await get(`/api/audit-services/extraction/status/${queued.body.jobId}`,privateMember)).status).toBe(404);
  });
}

describe('native content consumers and current source admission',()=> {
  registerContentAdmissionCases1();
  registerContentAdmissionCases2();
  registerContentAdmissionCases3();
});
