/** Additional real canonical Authoring stores for legacy QMS tool harnesses. */
import type { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const QMS_TEST_PROGRAM = '00000000-0000-4000-8000-000000000012';

/** The actual membership, anchor and project-sharing inputs of canonical program authorization. */
export async function installQmsProgramAccessHarness(db: PGlite, orgId: number, actorId: number, programId: string): Promise<void> {
  await db.exec(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
    CREATE TABLE IF NOT EXISTS users (id int PRIMARY KEY,status text);
    CREATE TABLE IF NOT EXISTS organization_users (organization_id int,user_id int,role text);
    CREATE TABLE IF NOT EXISTS projects (id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,client_workspace_id int,
      owner_id int,created_by_id int,settings jsonb);
    CREATE TABLE IF NOT EXISTS project_visibility_settings (project_id int,organization_id int,visibility text);
    CREATE TABLE IF NOT EXISTS project_members (project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE IF NOT EXISTS concept2cure_artifacts (id int,organization_id int,project_id int);
    ALTER TABLE concept2cure_artifacts ADD COLUMN IF NOT EXISTS project_id int;
    CREATE TABLE IF NOT EXISTS concept2cure_review_assignments (artifact_id int,organization_id int,reviewer_id int,status text);`);
  await db.query(`INSERT INTO users VALUES ($1,'active') ON CONFLICT DO NOTHING`,[actorId]);
  await db.query(`INSERT INTO organization_users VALUES ($1,$2,'admin')`,[orgId,actorId]);
  await db.query(`INSERT INTO projects VALUES ($1,$1,$2,NULL,$3,$3,'{}') ON CONFLICT DO NOTHING`,[orgId,programId,actorId]);
}

export async function installQmsAuthoringHarness(db: PGlite): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS organizations (id int PRIMARY KEY,name text);
    INSERT INTO organizations (id,name) VALUES (1,'Test organization') ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS regulatory_programs (id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    INSERT INTO regulatory_programs VALUES ('${QMS_TEST_PROGRAM}',1,NULL) ON CONFLICT DO NOTHING;
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY,title text,module text,product_code text,locale text,status text,created_by text,created_at timestamptz,updated_at timestamptz,
      tenant_id int,template_id uuid,client_program_id uuid,approved_at timestamptz,frozen_at timestamptz,locked_at timestamptz,locked_by text);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY,doc_id uuid REFERENCES authoring_documents(id),code text,title text,content text,order_index int,created_at timestamptz,updated_at timestamptz,tenant_id int);
    CREATE TABLE doc_revisions (id uuid PRIMARY KEY,section_id uuid,content text,created_by text,created_at timestamptz,tenant_id int,
      content_sha256 text,prev_chain_sha256 text,chain_sha256 text,origin text,inputs jsonb);
    CREATE TABLE authoring_citations (id uuid,section_id uuid,source text,reference_id text,payload_sha256 text,created_at timestamptz,tenant_id int);
    CREATE TABLE authoring_audit_trail (id serial PRIMARY KEY,doc_id uuid,section_id uuid,operation_type text,actor_email text,actor_role text,
      before_content text,after_content text,content_hash_before text,content_hash_after text,change_reason text,metadata jsonb,ip_address text,user_agent text,session_id uuid,tenant_id int,actor_id text);
    CREATE TABLE c2c_document_aliases (organization_id int, canonical_id uuid, store text, native_id text, created_by int, created_at timestamptz, UNIQUE(store,native_id), UNIQUE(canonical_id,store));
    CREATE TABLE doc_permissions (id uuid DEFAULT gen_random_uuid(),tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,
      valid_from timestamptz DEFAULT NOW(),valid_until timestamptz,revoked_at timestamptz,revoked_by text,revoke_reason text,granted_by text,grant_reason text,
      created_at timestamptz DEFAULT NOW(),updated_at timestamptz DEFAULT NOW());
    ALTER TABLE qms_documents ADD COLUMN IF NOT EXISTS artifact_id int;`);
  await installQmsProgramAccessHarness(db,1,10,QMS_TEST_PROGRAM);
  await db.exec(await readFile('db/migrations/20261014_qms_controlled_authoring_content.sql','utf8'));
}

/** Existing legacy effective fixtures acquire explicitly seeded content, never invented by the production service. */
export async function seedQmsEditingCopy(db: PGlite, id: number, orgId = 1): Promise<string> {
  const doc = await db.query<{id:string}>(`INSERT INTO authoring_documents (id,title,status,created_by,tenant_id,client_program_id)
    VALUES (gen_random_uuid(),'Procedure','draft','10',$1,$2) RETURNING id`,[orgId,QMS_TEST_PROGRAM]);
  const docId = doc.rows[0].id;
  await db.query(`INSERT INTO authoring_sections (id,doc_id,code,title,content,order_index,tenant_id) VALUES (gen_random_uuid(),$1,'qms-purpose','Purpose','Verified procedure text',1,$2)`,[docId,orgId]);
  // Seed drafts before linking so the production guard observes the final controlled state.
  await db.query(`UPDATE qms_documents SET authoring_document_id=$3,metadata=metadata||$4::jsonb WHERE id=$1 AND organization_id=$2`,[id,orgId,docId,JSON.stringify({programId:QMS_TEST_PROGRAM})]);
  await db.query(`INSERT INTO doc_permissions (tenant_id,doc_id,principal_id,role) VALUES ($1,$2,'10','OWNER')`,[orgId,docId]);
  return docId;
}
