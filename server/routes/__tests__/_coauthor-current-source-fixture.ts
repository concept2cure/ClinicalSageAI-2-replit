/** Test-only current source prerequisites; never an application admission rule. */
import type { PGlite } from '@electric-sql/pglite';
import { createIndPgliteDb } from '../../db/pglite-harness';

type QueryInput = string | { text: string; rowMode?: string };
export function snapshotRequestClient(pg:PGlite,afterQuery?:(sql:string)=>Promise<void>) {
  return {
    async query(input:QueryInput,params?:unknown[]) {
      const sql=typeof input==='string'?input:input.text;
      const result=await pg.query(sql,params,typeof input!=='string'&&input.rowMode==='array'?{rowMode:'array'}:undefined);
      if(afterQuery)await afterQuery(sql);
      return {...result,rowCount:result.rows.length||result.affectedRows||0};
    },
  };
}

export async function installCurrentSnapshotActor(pg:PGlite,args:{organizationId:number;userId:number;role:string;email:string}) {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS organizations(id int PRIMARY KEY,name text,status text);
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
    CREATE TABLE IF NOT EXISTS users(id int PRIMARY KEY,name text,email text,status text);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS name text,ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
    CREATE TABLE IF NOT EXISTS organization_users(organization_id int,user_id int,role text);
    ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS role text;
    CREATE TABLE IF NOT EXISTS projects(id serial PRIMARY KEY,organization_id int,regulatory_program_id uuid,status text,client_workspace_id int,owner_id int,created_by_id int,settings jsonb);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',ADD COLUMN IF NOT EXISTS owner_id int,
      ADD COLUMN IF NOT EXISTS created_by_id int,ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}',ADD COLUMN IF NOT EXISTS client_workspace_id int;
    CREATE TABLE IF NOT EXISTS project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE IF NOT EXISTS project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE IF NOT EXISTS concept2cure_artifacts(id int PRIMARY KEY,organization_id int,project_id int);
    CREATE TABLE IF NOT EXISTS concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE IF NOT EXISTS doc_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id int,doc_id uuid,section_id uuid,
      principal_id text,email text,role text,valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    ALTER TABLE doc_permissions ADD COLUMN IF NOT EXISTS principal_id text,ADD COLUMN IF NOT EXISTS valid_from timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS valid_until timestamptz,ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
    ALTER TABLE authoring_documents ADD COLUMN IF NOT EXISTS created_by text;
  `);
  await pg.query("INSERT INTO organizations(id,name,status) VALUES($1,$2,'active') ON CONFLICT(id) DO UPDATE SET status='active'",[args.organizationId,'Synthetic source writer tenant']);
  // tenant-isolation-safe: seeds a global identity row in this fixture's own in-memory PGlite; never runs against a shared database
  await pg.query("INSERT INTO users(id,name,email,status) VALUES($1,$2,$3,'active') ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,status='active'",[args.userId,'Synthetic filing author',args.email]);
  await pg.query('UPDATE organization_users SET role=$3 WHERE organization_id=$1 AND user_id=$2',[args.organizationId,args.userId,args.role]);
  await pg.query('INSERT INTO organization_users(organization_id,user_id,role) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2)',[args.organizationId,args.userId,args.role]);
}

export async function grantSnapshotDocumentView(pg:PGlite,args:{organizationId:number;userId:number;documentId:string}) {
  await pg.query(`INSERT INTO doc_permissions(tenant_id,doc_id,principal_id,email,role,valid_from)
    SELECT $1,$2,$3,u.email,'VIEWER',now()-interval '1 day' FROM users u WHERE u.id=$4`,
  [args.organizationId,args.documentId,String(args.userId),args.userId]);
}

export async function installSnapshotProgramAccess(pg:PGlite,args:{organizationId:number;userId:number;programId:string;projectId:number;visibility?:'private'|'org_public'}) {
  await pg.query(`INSERT INTO projects(id,organization_id,regulatory_program_id,status,owner_id,created_by_id,settings)
    VALUES($1,$2,$3,'active',$4,$4,'{}')`,[args.projectId,args.organizationId,args.programId,args.userId]);
  await pg.query('INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,$2,$3)',
    [args.projectId,args.organizationId,args.visibility??'private']);
}

export async function createCurrentSnapshotFixture() {
  const fixture=await createIndPgliteDb({submissionCore:true,leafSources:true,programSpine:true});
  await fixture.pglite.exec(`
    ALTER TABLE coauthor_documents ADD COLUMN IF NOT EXISTS sections jsonb,ADD COLUMN IF NOT EXISTS template_id int,
      ADD COLUMN IF NOT EXISTS created_by text,ADD COLUMN IF NOT EXISTS client_workspace text,ADD COLUMN IF NOT EXISTS completion_percentage int,
      ADD COLUMN IF NOT EXISTS regulatory_compliance_score int,ADD COLUMN IF NOT EXISTS ectd_module_id int,
      ADD COLUMN IF NOT EXISTS module_name text,ADD COLUMN IF NOT EXISTS embedding text;
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int NOT NULL,status text,title text,module text,
      created_by text,client_program_id uuid,provenance jsonb);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),doc_id uuid REFERENCES authoring_documents(id),
      tenant_id int,code text,title text,content text,order_index int,created_at timestamptz DEFAULT now());
    CREATE TABLE frozen_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid,tenant_id int,version text,
      frozen_content text,content_hash text,frozen_at timestamptz DEFAULT now());
    CREATE TABLE coauthor_document_versions(id serial PRIMARY KEY,document_id int REFERENCES coauthor_documents(id),version_number int,
      content text,created_by text,change_summary text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(document_id,version_number));
    CREATE TABLE audit_events(id serial PRIMARY KEY,organization_id int,event_type text,entity_type text,entity_id text,user_id int,
      user_name text,user_role text,ip_address text,timestamp timestamptz,reason text,metadata jsonb,regulatory_significant boolean,
      gxp_relevant boolean,created_at timestamptz);
  `);
  return fixture;
}
