/** Real workspace writes remain distinguishable from a lost post-write regulatory audit record. */
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {getTableConfig} from 'drizzle-orm/pg-core';
import express from 'express';
import request from 'supertest';
import {beforeAll,beforeEach,afterAll,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({db:null as any,pg:null as any}));
vi.mock('../../db',()=>({get db(){return h.db;},pool:{query:(sql:string,args?:unknown[])=>h.pg?h.pg.query(sql,args):Promise.resolve({rows:[]})},
  getPool:()=>({query:(sql:string,args?:unknown[])=>h.pg.query(sql,args)})}));
vi.mock('../../auth',()=>({authMiddleware:(_req:any,_res:any,next:any)=>next()}));
vi.mock('../../middleware/tenantContext',()=>({tenantContextMiddleware:(_q:any,_s:any,n:any)=>n(),requireOrganizationContext:(_q:any,_s:any,n:any)=>n()}));
vi.mock('../../middleware/redisRateLimiter',()=>({createRedisRateLimiter:()=> (_q:any,_s:any,n:any)=>n()}));
vi.mock('../../middleware/enterprise-performance',()=>({cacheResponse:()=> (_q:any,_s:any,n:any)=>n()}));
vi.mock('../../utils/tenantContext',()=>({getSecureOrgId:(req:any)=>req.user.organizationId}));
import {projects,organizations,users,organizationUsers,clientWorkspaces,concept2cureConversations,concept2cureMessages,concept2cureArtifacts,concept2cureArtifactVersions,regulatoryAuditLogs} from '../../../shared/schema';
import conversationRoutes from '../c2c/conversations';
import knowledgeRoutes from '../c2c/knowledge-sources';
import projectKnowledgeRoutes from '../c2c/project-knowledge';
import communicationRoutes from '../c2c/communication-center';
import exportRoutes from '../c2c/exports';
import {readCsrProjectActor} from '../../services/csr/project-scope';
let pg:PGlite;
const filename=`o01-audit-${randomUUID()}.docx`,file=`generated_documents/org-9/${filename}`,bytes=Buffer.from('Existing generated document bytes.');
function app(orgId=9,userId=7,claimedRole='admin'){const a=express();a.use(express.json());a.use((req,_res,next)=>{
  Object.assign(req,{userId,userRole:claimedRole,userEmail:'author@example.test',user:{id:userId,role:claimedRole,organizationId:orgId},
    tenantContext:{organizationId:orgId,clientWorkspaceId:orgId===9?1:2},tenantId:orgId});next();
});for(const r of [conversationRoutes,knowledgeRoutes,projectKnowledgeRoutes,communicationRoutes,exportRoutes])a.use('/api/c2c',r);return a;}
beforeAll(async()=>{
  pg=new PGlite();h.pg=pg;h.db=drizzle(pg);
  const base=await readFile('migrations/0000_sweet_joseph.sql','utf8');
  for(const table of [organizations,users,organizationUsers,clientWorkspaces,projects,concept2cureConversations,concept2cureMessages,concept2cureArtifacts,concept2cureArtifactVersions,regulatoryAuditLogs]){
    const cfg=getTableConfig(table);const ddl=base.match(new RegExp(`CREATE TABLE "${cfg.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if(!ddl)throw new Error(`Actual core DDL missing for ${cfg.name}`);await pg.exec(ddl);
    // Later canonical migrations/push add nullable columns selected by current Drizzle.
    const known=new Set((await pg.query<{column_name:string}>('SELECT column_name FROM information_schema.columns WHERE table_name=$1',[cfg.name])).rows.map(r=>r.column_name));
    for(const c of cfg.columns)if(!known.has(c.name))await pg.exec(`ALTER TABLE "${cfg.name}" ADD COLUMN "${c.name}" ${c.getSQLType()}`);
  }
  await pg.exec("INSERT INTO organizations(id,name,slug) VALUES(9,'Organization nine','o-nine'),(10,'Organization ten','o-ten');");
  for(const id of [7,8,9,10,11,12,13])await pg.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Actual member',$2,'fixture-hash')",[id,`member${id}@example.test`]);
  await pg.exec("INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,9,'Workspace nine','w-nine'),(2,10,'Workspace ten','w-ten');");
  for(const path of ['db/migrations/20260314_phase12_multi_user_review.sql','db/migrations/20260401_project_sharing_visibility.sql','db/migrations/20260331_communication_center_scaffold.sql','db/migrations/20260401_submission_center_items.sql','migrations/20260527_concept2cure_project_links.sql','db/migrations/20260727_industry_context_profiles.sql'])await pg.exec(await readFile(path,'utf8'));
  await pg.exec(`INSERT INTO projects(id,organization_id,client_workspace_id,name,type,settings) VALUES(3,9,1,'Actual workspace','IND','{}'),(4,9,1,'Other private workspace','IND','{}');
    INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(3,9,'private'),(4,9,'private');
    INSERT INTO project_members(project_id,organization_id,user_id,role) VALUES(3,9,9,'edit'),(4,9,10,'use'),(4,9,12,'edit');`);
  await mkdir('generated_documents/org-9',{recursive:true});await writeFile(file,bytes);
});
beforeEach(async()=>{await pg.exec(`ALTER TABLE regulatory_audit_logs DROP CONSTRAINT IF EXISTS o01_audit_unavailable;
  ALTER TABLE concept2cure_conversations DROP CONSTRAINT IF EXISTS o01_save_refused;
  DELETE FROM regulatory_audit_logs;DELETE FROM concept2cure_messages;DELETE FROM concept2cure_conversations;
  DELETE FROM concept2cure_artifact_versions;DELETE FROM concept2cure_artifacts;DELETE FROM concept2cure_submission_center_items;
  DELETE FROM concept2cure_project_links;
  UPDATE organizations SET status='active';
  DELETE FROM concept2cure_authority_profiles;DELETE FROM concept2cure_agency_communications;
  DELETE FROM concept2cure_publishops_services;UPDATE projects SET settings='{}',status='active';DELETE FROM organization_users;
  INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,7,'admin'),(9,8,'member'),(9,9,'member'),(9,10,'member'),(9,11,'member'),(9,12,'viewer'),(10,13,'admin');`);});
afterAll(async()=>{await rm(file,{force:true});await pg?.close();});
const auditRows=async()=> (await pg.query('SELECT * FROM regulatory_audit_logs')).rows;
const missingAudit=async()=>{await pg.exec('ALTER TABLE regulatory_audit_logs ADD CONSTRAINT o01_audit_unavailable CHECK(false) NOT VALID');};
const expected=(failed:boolean)=>failed?{persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'}:{persisted:true,chained:false};
describe('workspace saves and post-commit audit outcomes',()=>{
  it.each([true,false])('conversation creation audit unavailable=%s keeps actual saved state and discloses the audit result',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).post('/api/c2c/projects/3/conversations').send({title:'Saved conversation'});
    expect(res.status,JSON.stringify(res.body)).toBe(201);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query('SELECT title FROM concept2cure_conversations')).rows).toEqual([{title:'Saved conversation'}]);
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it.each([true,false])('project knowledge save audit unavailable=%s persists the exact requested knowledge',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).patch('/api/c2c/projects/3/knowledge').send({context:'Verified program context.'});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=3')).rows[0].settings.knowledge.context).toBe('Verified program context.');
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it.each([true,false])('knowledge-source selection audit unavailable=%s persists the app selection rather than falsely refusing it',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).post('/api/c2c/projects/3/apps').send({appId:'deep-research'});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=3')).rows[0].settings.connectedApps[0].appId).toBe('deep-research');
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it.each([true,false])('authority-profile save audit unavailable=%s remains a real saved profile and reports lost history',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).post('/api/c2c/projects/3/authority-profiles').send({authority:'FDA',centerOrDivision:'CDER',channelType:'gateway',submissionTransport:'ESG',acknowledgmentModel:'ACK',messageReceiptModel:'receipt'});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query('SELECT authority,organization_id,project_id FROM concept2cure_authority_profiles')).rows).toEqual([{authority:'FDA',organization_id:9,project_id:3}]);
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it.each([true,false])('binary download audit unavailable=%s retains the file bytes and exposes the canonical warning headers',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).get(`/api/c2c/documents/download/${filename}`).buffer(true).parse((response,callback)=>{
      const chunks:Buffer[]=[];response.on('data',(chunk:Buffer)=>chunks.push(chunk));
      response.on('end',()=>callback(null,Buffer.concat(chunks)));response.on('error',callback);
    });
    expect(res.status).toBe(200);expect(res.body).toEqual(bytes);expect(res.headers['x-audit-row-persisted']).toBe(failed?'false':'true');
    if(failed)expect(res.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it.each([true,false])('manifest read audit unavailable=%s preserves the actual manifest outcome',async failed=>{
    if(failed)await missingAudit();const res=await request(app()).post('/api/c2c/projects/3/submission-package').send({});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.data.projectId).toBe(3);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it('a failed business save creates no row and no successful audit receipt',async()=>{
    await pg.exec("ALTER TABLE concept2cure_conversations ADD CONSTRAINT o01_save_refused CHECK(title<>'Refused conversation')");
    const res=await request(app()).post('/api/c2c/projects/3/conversations').send({title:'Refused conversation'});
    expect(res.status).toBe(500);expect((await pg.query('SELECT * FROM concept2cure_conversations')).rows).toHaveLength(0);
    expect(await auditRows()).toHaveLength(0);expect(res.body.meta?.auditTrail).toBeUndefined();
  });
});
describe('conversation content stays inside the authorized URL project',()=>{
  beforeEach(async()=>{
    await pg.exec("INSERT INTO projects(id,organization_id,client_workspace_id,name,type,settings) VALUES(4,9,1,'Other private workspace','IND','{}') ON CONFLICT(id) DO NOTHING;");
    await pg.exec("INSERT INTO concept2cure_conversations(id,conversation_id,project_id,organization_id,title,status,created_by_id) VALUES(41,'private-parent',4,9,'Private conversation','active',8);");
    await pg.exec("INSERT INTO concept2cure_messages(conversation_id,organization_id,message_id,role,content,content_hash) VALUES(41,9,'private-message','user','Private clinical context.','retained-hash');");
  });
  it('cannot append to a conversation from another project through an authorized project URL',async()=>{
    const res=await request(app()).post('/api/c2c/projects/3/conversations/private-parent/messages').send({role:'user',content:'Unexpected append.'});
    expect(res.status).toBe(404);expect((await pg.query('SELECT content FROM concept2cure_messages ORDER BY id')).rows).toEqual([{content:'Private clinical context.'}]);
    expect(await auditRows()).toHaveLength(0);
  });
  it('cannot fork private conversation content into an authorized project',async()=>{
    const res=await request(app()).post('/api/c2c/projects/3/conversations').send({title:'Leaked fork',parentConversationId:'private-parent',forkMessageIndex:0});
    expect(res.status).toBe(404);expect((await pg.query('SELECT conversation_id FROM concept2cure_conversations')).rows).toEqual([{conversation_id:'private-parent'}]);
    expect(await auditRows()).toHaveLength(0);
  });
  it('cannot fork an archived parent even in the authorized project',async()=>{
    await pg.exec("UPDATE concept2cure_conversations SET project_id=3,status='archived' WHERE id=41");
    const res=await request(app()).post('/api/c2c/projects/3/conversations').send({title:'Stale fork',parentConversationId:'private-parent',forkMessageIndex:0});
    expect(res.status).toBe(404);expect((await pg.query('SELECT conversation_id FROM concept2cure_conversations')).rows).toEqual([{conversation_id:'private-parent'}]);
    expect(await auditRows()).toHaveLength(0);
  });
  it.each([true,false])('authorized fork, append, rename and archive retain actual results when audit unavailable=%s',async failed=>{
    await pg.exec("UPDATE concept2cure_conversations SET project_id=3 WHERE id=41");
    if(failed)await missingAudit();
    const fork=await request(app()).post('/api/c2c/projects/3/conversations').send({title:'Authorized fork',parentConversationId:'private-parent',forkMessageIndex:0});
    expect(fork.status,JSON.stringify(fork.body)).toBe(201);expect(fork.body.data.messages[0].content).toBe('Private clinical context.');
    const conversationId=fork.body.data.id;
    const append=await request(app()).post(`/api/c2c/projects/3/conversations/${conversationId}/messages`).send({role:'user',content:'Saved follow-up.'});
    expect(append.status,JSON.stringify(append.body)).toBe(201);
    const rename=await request(app()).patch(`/api/c2c/projects/3/conversations/${conversationId}`).send({title:'Renamed fork'});
    expect(rename.status).toBe(200);
    const archive=await request(app()).delete(`/api/c2c/projects/3/conversations/${conversationId}`);
    expect(archive.status).toBe(200);
    for(const res of [fork,append,rename,archive])expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query('SELECT title,status FROM concept2cure_conversations WHERE conversation_id=$1',[conversationId])).rows).toEqual([{title:'Renamed fork',status:'archived'}]);
    expect((await pg.query('SELECT content FROM concept2cure_messages WHERE conversation_id=(SELECT id FROM concept2cure_conversations WHERE conversation_id=$1) ORDER BY id',[conversationId])).rows).toEqual([{content:'Private clinical context.'},{content:'Saved follow-up.'}]);
    expect(await auditRows()).toHaveLength(failed?0:4);
  });
});
describe('current project read access and edit authority',()=>{
  it.each(['apps','authority-profiles','agency-communications','publishops/services','submission-center/items','knowledge'])('does not disclose private %s through a stale administrator claim',async route=>{
    const res=await request(app(9,11,'admin')).get(`/api/c2c/projects/4/${route}`);
    expect(res.status,JSON.stringify(res.body)).toBe(404);expect(res.body.data).toBeUndefined();expect(await auditRows()).toHaveLength(0);
  });
  it.each([
    ['apps',{appId:'deep-research'}],
    ['authority-profiles',{authority:'FDA',centerOrDivision:'CDER',channelType:'gateway',submissionTransport:'ESG',acknowledgmentModel:'ACK',messageReceiptModel:'receipt'}],
    ['conversations',{title:'Unauthorized conversation'}],
  ])('does not write private %s through a stale administrator claim',async(route,body)=>{
    const res=await request(app(9,11,'admin')).post(`/api/c2c/projects/4/${route}`).send(body);
    expect(res.status,JSON.stringify(res.body)).toBe(404);expect(await auditRows()).toHaveLength(0);
    expect((await pg.query('SELECT settings FROM projects WHERE id=4')).rows).toEqual([{settings:{}}]);
    expect((await pg.query('SELECT * FROM concept2cure_authority_profiles')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM concept2cure_conversations')).rows).toHaveLength(0);
  });
  it('a private project use grant permits reads but does not permit metadata writes',async()=>{
    const read=await request(app(9,10,'admin')).get('/api/c2c/projects/4/apps');expect(read.status).toBe(200);
    const write=await request(app(9,10,'admin')).post('/api/c2c/projects/4/apps').send({appId:'deep-research'});
    expect(write.status).toBe(403);expect((await pg.query('SELECT settings FROM projects WHERE id=4')).rows).toEqual([{settings:{}}]);
    expect(await auditRows()).toHaveLength(0);
  });
  it('a viewer with project edit sharing cannot write governed records',async()=>{
    const res=await request(app(9,12,'admin')).patch('/api/c2c/projects/4/knowledge').send({context:'Unauthorized viewer context'});
    expect(res.status).toBe(403);expect((await pg.query('SELECT settings FROM projects WHERE id=4')).rows).toEqual([{settings:{}}]);
    expect(await auditRows()).toHaveLength(0);
  });
  it('revoked membership refuses reads despite retained project grants and a stale token',async()=>{
    await pg.exec('DELETE FROM organization_users WHERE organization_id=9 AND user_id=9');
    const res=await request(app(9,9,'admin')).get('/api/c2c/projects/3/knowledge');expect(res.status).toBe(403);expect(res.body.data).toBeUndefined();
  });
  it('a valid member in another organization cannot read the same integer project',async()=>{
    const res=await request(app(10,13,'admin')).get('/api/c2c/projects/4/authority-profiles');expect(res.status).toBe(404);expect(res.body.data).toBeUndefined();
  });
  it('an actual editor of a private project can read and save with a stale viewer claim',async()=>{
    const read=await request(app(9,9,'viewer')).get('/api/c2c/projects/3/apps');expect(read.status).toBe(200);
    const save=await request(app(9,9,'viewer')).patch('/api/c2c/projects/3/knowledge').send({context:'Authorized private context'});
    expect(save.status,JSON.stringify(save.body)).toBe(200);expect(save.body.meta?.auditTrail.persisted).toBe(true);
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=3')).rows[0].settings.knowledge.context).toBe('Authorized private context');
  });
});
describe('project linkage, export and offboarding access',()=>{
  it('a retained link does not disclose another private project after its access has been revoked',async()=>{
    await pg.exec("INSERT INTO concept2cure_project_links(org_id,source_id,target_id,kind,direction) VALUES(9,3,4,'cross_ref','out')");
    const res=await request(app(9,9,'admin')).get('/api/c2c/projects/3/linked');
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.data).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain('Other private workspace');
  });
  it('a link remains visible to an actual member who can read both projects',async()=>{
    await pg.exec("INSERT INTO concept2cure_project_links(org_id,source_id,target_id,kind,direction) VALUES(9,3,4,'cross_ref','out')");
    const res=await request(app(9,7,'viewer')).get('/api/c2c/projects/3/linked');
    expect(res.status).toBe(200);expect(res.body.data).toEqual([expect.objectContaining({name:'Other private workspace',kind:'cross_ref'})]);
  });
  it('download permissions use the current canonical organization role',async()=>{
    expect((await request(app(9,9,'viewer')).get(`/api/c2c/documents/download/${filename}`)).status).toBe(200);
    const viewer=await request(app(9,12,'admin')).get(`/api/c2c/documents/download/${filename}`);
    expect(viewer.status).toBe(403);expect(await auditRows()).toHaveLength(1);
  });
  it('pending-deletion records remain readable and exportable while writes and default CSR admission stay refused',async()=>{
    await pg.exec("UPDATE organizations SET status='pending_deletion' WHERE id=9");
    const read=await request(app(9,9,'viewer')).get('/api/c2c/projects/3/knowledge');
    expect(read.status,JSON.stringify(read.body)).toBe(200);
    const download=await request(app(9,9,'viewer')).get(`/api/c2c/documents/download/${filename}`);
    expect(download.status).toBe(200);
    const write=await request(app(9,9,'admin')).patch('/api/c2c/projects/3/knowledge').send({context:'Disallowed offboarding edit'});
    expect(write.status).toBe(403);expect((await pg.query('SELECT settings FROM projects WHERE id=3')).rows).toEqual([{settings:{}}]);
    await expect(readCsrProjectActor({query:(sql,args)=>pg.query(sql,args)},9,9)).rejects.toMatchObject({status:403});
    expect(await auditRows()).toHaveLength(1);
  });
  it.each(['suspended','purged','inactive'])('a %s organization cannot use the read-only recovery path',async status=>{
    await pg.query('UPDATE organizations SET status=$1 WHERE id=9',[status]);
    const res=await request(app(9,9,'admin')).get('/api/c2c/projects/3/knowledge');
    expect(res.status).toBe(403);expect(res.body.data).toBeUndefined();expect(await auditRows()).toHaveLength(0);
  });
  it.each([[11,404],[10,403],[12,403]])('a private-project upload refuses actor %s before producing knowledge or an artifact',async(userId,status)=>{
    const res=await request(app(9,userId,'admin')).post('/api/c2c/documents/upload')
      .field('projectId','4').attach('file',Buffer.from('Private clinical upload.'),{filename:'source.txt',contentType:'text/plain'});
    expect(res.status,JSON.stringify(res.body)).toBe(status);
    expect((await pg.query('SELECT settings FROM projects WHERE id=4')).rows).toEqual([{settings:{}}]);
    expect((await pg.query('SELECT * FROM concept2cure_artifacts')).rows).toHaveLength(0);expect(await auditRows()).toHaveLength(0);
  });
  it.each([true,false])('an authorized private-project upload saves actual imported content with audit unavailable=%s',async failed=>{
    if(failed)await missingAudit();
    const content='Uploaded study methods. These are the original human-authored source bytes.';
    const res=await request(app(9,9,'viewer')).post('/api/c2c/documents/upload')
      .field('projectId','3').attach('file',Buffer.from(content),{filename:'source.txt',contentType:'text/plain'});
    expect(res.status,JSON.stringify(res.body)).toBe(201);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=3')).rows[0].settings.knowledge.documents).toHaveLength(1);
    const artifacts=(await pg.query<{content:string;metadata:any}>('SELECT content,metadata FROM concept2cure_artifacts')).rows;
    expect(artifacts).toHaveLength(1);expect(artifacts[0].content).toBe(content);
    expect(artifacts[0].metadata.uploadSource).toBe('knowledge_upload');expect(artifacts[0].metadata.harness.originSurface).toBe('api_route');
    expect((await pg.query('SELECT content FROM concept2cure_artifact_versions')).rows).toEqual([{content}]);
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
});
describe('archived writes and linked communication changes',()=>{
  it('archived projects retain readable knowledge but refuse new writes',async()=>{
    await pg.exec("UPDATE projects SET status='archived' WHERE id=3");
    expect((await request(app()).get('/api/c2c/projects/3/knowledge')).status).toBe(200);
    const res=await request(app()).patch('/api/c2c/projects/3/knowledge').send({context:'Archived overwrite'});
    expect(res.status).toBe(409);expect(res.body.error.code).toBe('PROJECT_ARCHIVED');
    expect((await pg.query('SELECT settings FROM projects WHERE id=3')).rows).toEqual([{settings:{}}]);expect(await auditRows()).toHaveLength(0);
  });
  it('membership store failures are unavailable checks rather than false denials',async()=>{
    await pg.exec('ALTER TABLE organization_users RENAME TO o01_membership_unavailable');
    try {
      const res=await request(app()).get('/api/c2c/projects/3/knowledge');
      expect(res.status).toBe(503);expect(res.body.error.code).toBe('PROJECT_ACCESS_UNAVAILABLE');expect(res.body.data).toBeUndefined();
      expect(await auditRows()).toHaveLength(0);
    } finally { await pg.exec('ALTER TABLE o01_membership_unavailable RENAME TO organization_users'); }
  });
  it('unbound activation cannot bypass a private project relationship',async()=>{
    await pg.exec(`UPDATE projects SET settings='{"knowledge":{"documents":[{"id":"private-source","name":"Private source","isActive":false}]}}' WHERE id=4`);
    const res=await request(app(9,11,'admin')).patch('/api/c2c/documents/private-source/activation').send({isActive:true});
    expect(res.status).toBe(404);
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=4')).rows[0].settings.knowledge.documents[0].isActive).toBe(false);
    expect(await auditRows()).toHaveLength(0);
  });
  it('ambiguous activation refuses to guess a project even for its administrator',async()=>{
    await pg.exec(`UPDATE projects SET settings='{"knowledge":{"documents":[{"id":"shared-id","name":"Retained source","isActive":false}]}}'`);
    const res=await request(app()).patch('/api/c2c/documents/shared-id/activation').send({isActive:true});
    expect(res.status).toBe(409);expect(res.body.error.code).toBe('DOCUMENT_PROJECT_AMBIGUOUS');expect(await auditRows()).toHaveLength(0);
  });
  it.each([true,false])('a uniquely scoped activation saves for an actual editor with audit unavailable=%s',async failed=>{
    await pg.exec(`UPDATE projects SET settings='{"knowledge":{"documents":[{"id":"owned-source","name":"Retained source","isActive":false}]}}' WHERE id=3`);
    if(failed)await missingAudit();
    const res=await request(app(9,9,'viewer')).patch('/api/c2c/documents/owned-source/activation').send({isActive:true});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query<{settings:any}>('SELECT settings FROM projects WHERE id=3')).rows[0].settings.knowledge.documents[0].isActive).toBe(true);
    expect(await auditRows()).toHaveLength(failed?0:1);
  });
  it('an editor cannot advance a communication they cannot view through a stale administrator claim',async()=>{
    const created=await request(app()).post('/api/c2c/projects/3/agency-communications').send({sourceType:'manual_logged_event',communicationType:'Legal correspondence',sourceChannel:'Recorded letter',urgency:'medium',visibilityTier:'restricted_legal_sensitive'});
    expect(created.status,JSON.stringify(created.body)).toBe(200);
    const res=await request(app(9,9,'admin')).patch(`/api/c2c/projects/3/agency-communications/${created.body.data.id}/advance`).send({});
    expect(res.status).toBe(404);
    expect((await pg.query('SELECT human_review_status,closure_status FROM concept2cure_agency_communications')).rows).toEqual([{human_review_status:'pending_review',closure_status:'open'}]);
    expect(await auditRows()).toHaveLength(1);
  });
  it.each([true,false])('a permitted communication transition remains saved with audit unavailable=%s',async failed=>{
    const created=await request(app()).post('/api/c2c/projects/3/agency-communications').send({sourceType:'manual_logged_event',communicationType:'Agency correspondence',sourceChannel:'Recorded letter',urgency:'medium',visibilityTier:'shared_client_c2c'});
    expect(created.status,JSON.stringify(created.body)).toBe(200);if(failed)await missingAudit();
    const res=await request(app(9,9,'viewer')).patch(`/api/c2c/projects/3/agency-communications/${created.body.data.id}/advance`).send({});
    expect(res.status,JSON.stringify(res.body)).toBe(200);expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
    expect((await pg.query('SELECT human_review_status,closure_status FROM concept2cure_agency_communications')).rows).toEqual([{human_review_status:'triaged',closure_status:'in_progress'}]);
    expect(await auditRows()).toHaveLength(failed?1:2);
  });
});
