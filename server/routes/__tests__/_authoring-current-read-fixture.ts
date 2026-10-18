import express from 'express';
import { SignJWT } from 'jose';
import { createJourneyDb, makeRequestDbClient, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { runWithTenantScope } from '../../db/tenantStore';
import type { RequestSqlClient } from '../../db/requestDb';

export const READ_SECRET = 'authoring-current-read-synthetic-test-secret';
export const PROGRAM = 'a0000000-0000-4000-8000-000000000001';
export const PRIVATE_PROGRAM = 'a0000000-0000-4000-8000-000000000002';
export const DOC = {
  full: 'd0000000-0000-4000-8000-000000000001', private: 'd0000000-0000-4000-8000-000000000002',
  partial: 'd0000000-0000-4000-8000-000000000003', historical: 'd0000000-0000-4000-8000-000000000004',
  empty: 'd0000000-0000-4000-8000-000000000005', foreign: 'd0000000-0000-4000-8000-000000000006',
  ungrantedHistorical: 'd0000000-0000-4000-8000-000000000007',
};
export const SECTION = {
  full: 'e0000000-0000-4000-8000-000000000001', private: 'e0000000-0000-4000-8000-000000000002',
  visible: 'e0000000-0000-4000-8000-000000000003', hidden: 'e0000000-0000-4000-8000-000000000004',
};
const PREREQUISITES = `
 CREATE TABLE organizations(id serial PRIMARY KEY,name text,uuid uuid DEFAULT gen_random_uuid(),
   status text NOT NULL DEFAULT 'active',payment_status text NOT NULL DEFAULT 'active');
 CREATE TABLE users(id serial PRIMARY KEY,name text,email text,status text NOT NULL DEFAULT 'active');
 CREATE TABLE organization_users(organization_id integer,user_id integer,role text,
   PRIMARY KEY(organization_id,user_id));
 CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,name text,
   deleted_at timestamptz);
 CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,name text,regulatory_program_id uuid,
   client_workspace_id integer,status text DEFAULT 'planning',owner_id integer,created_by_id integer,
   settings jsonb DEFAULT '{}');
 CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text);
 CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
 CREATE TABLE concept2cure_artifacts(id integer PRIMARY KEY,organization_id integer,project_id integer);
 CREATE TABLE concept2cure_review_assignments(artifact_id integer,organization_id integer,reviewer_id integer,status text);
 INSERT INTO organizations(id,name) VALUES(1,'Synthetic current-read QA'),(2,'Synthetic foreign QA');
 INSERT INTO users(id,name,email) VALUES(11,'Creator','creator@read.example'),(21,'Reader','reader@read.example'),
   (31,'Section reader','partial@read.example'),(41,'No grant','bystander@read.example');
 INSERT INTO organization_users VALUES(1,11,'member'),(1,21,'viewer'),(1,31,'viewer'),(1,41,'viewer');
 INSERT INTO regulatory_programs VALUES('${PROGRAM}',1,'Synthetic public program',NULL),
   ('${PRIVATE_PROGRAM}',1,'Synthetic private program',NULL);
 INSERT INTO projects(id,organization_id,name,regulatory_program_id,owner_id,created_by_id) VALUES
   (101,1,'Synthetic public anchor','${PROGRAM}',11,11),(102,1,'Synthetic private anchor','${PRIVATE_PROGRAM}',11,11);
 INSERT INTO project_visibility_settings VALUES(101,1,'org_public'),(102,1,'private');
`;

function documentFixtureValues(name:string,id:string) {
  const organizationMode=['historical','ungrantedHistorical','foreign'].includes(name);
  return [id,`Synthetic ${name} title`,name==='empty'?'M3':'M2',name==='empty'?'FROZEN':'draft',
    name==='foreign'?2:1,organizationMode?null:name==='private'?PRIVATE_PROGRAM:PROGRAM,
    name==='partial'?{source:'ana',conversationId:'hidden-conversation',projectSourceReferences:[{sectionCode:'2.5',excerpt:'HIDDEN_SOURCE_REFERENCE'}]}:null];
}
export async function createCurrentReadDb(): Promise<JourneyDb> {
  const jdb = await createJourneyDb({ prereqSql: PREREQUISITES, migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'db/migrations/20260725_authoring_signatures_and_workflow.sql',
    'db/migrations/20260725_authoring_signature_freeze_binding.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260921_authoring_document_provenance.sql',
  ] });
  for (const [name,id] of Object.entries(DOC)) {
    await jdb.pool.query(`INSERT INTO authoring_documents(id,title,module,status,tenant_id,created_by,client_program_id,provenance)
      VALUES($1,$2,$3,$4,$5,'11',$6,$7)`,documentFixtureValues(name,id));
  }
  for (const [name,id] of Object.entries(SECTION)) {
    const docId=name==='full'?DOC.full:name==='private'?DOC.private:DOC.partial;
    await jdb.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
      VALUES($1,$2,$3,$4,$5,$6,1)`,[id,docId,name==='hidden'?'2.5.2':'2.5.1',`Synthetic ${name} section`,name==='hidden'?'<p>HIDDEN_SIBLING_PROSE</p>':'<p>Visible saved content</p>',name==='hidden'?2:1]);
  }
  for (const id of [DOC.full,DOC.private,DOC.partial,DOC.historical,DOC.empty]) {
    await jdb.pool.query(`INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,role,granted_by)
      VALUES($1,1,'21','VIEWER','11')`,[id]);
  }
  await jdb.pool.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,role,granted_by)
    VALUES($1,$2,1,'31','VIEWER','11')`,[DOC.partial,SECTION.visible]);
  for (const id of [SECTION.visible,SECTION.hidden]) {
    await jdb.pool.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id)
      VALUES(gen_random_uuid(),$1,$2,'Synthetic comment',1)`,[DOC.partial,id]);
  }
  return jdb;
}

export async function readToken(userId = 21, claimsRole = 'admin'): Promise<string> {
  return new SignJWT({userId:String(userId),organizationId:1,email:`cached-${userId}@read.example`,role:claimsRole,roles:[claimsRole]})
    .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(READ_SECRET));
}

export interface ReadObservation {
  sql: string[];
  fault?: (sql: string) => boolean;
  afterRead?: () => Promise<void>;
  afterIdentity?: () => void;
}
export function observedReadClient(jdb: JourneyDb, observation: ReadObservation): RequestSqlClient {
  const client=makeRequestDbClient(jdb.pglite);
  return {query:async (...args:Parameters<typeof client.query>)=>{
    const sql=typeof args[0]==='string'?args[0]:String((args[0] as {text:string}).text);
    observation.sql.push(sql); // SQL only, never credentials or bind values.
    if (observation.fault?.(sql)) throw Object.assign(new Error('Synthetic QA read verification interruption'),{code:'08006'});
    const result=await client.query(...args);
    const rows=result.rows;
    if(!rows.every((row):row is Record<string,unknown>=>typeof row==='object'&&row!==null&&!Array.isArray(row))) {
      throw new Error('Current-read SQL fixture expected object rows.');
    }
    if(sql.includes('AS doc_id')&&observation.afterIdentity){
      const mutate=observation.afterIdentity;observation.afterIdentity=undefined;mutate();
    }
    const contentRead=sql.includes('FROM authoring_documents d')&&sql.includes('d.title') || sql.includes('FROM authoring_sections s')&&sql.includes('s.content');
    if (contentRead && observation.afterRead) {
      const mutation=observation.afterRead;observation.afterRead=undefined;await mutation();
    }
    return {...result,rows};
  }};
}
export function currentReadApp(router:express.Router,jdb:JourneyDb,observation:ReadObservation,withContext=true) {
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{
    if(withContext) Object.assign(req,{dbClient:observedReadClient(jdb,observation)});
    Object.assign(req,{userRole:'admin'});
    runWithTenantScope({tenantId:'1',role:'admin',source:'request',caller:'synthetic-current-read'},next);
  });
  app.use('/api/authoring',router);return app;
}
