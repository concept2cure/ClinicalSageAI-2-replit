/** Evidence-only current native behavior. All rows/bytes are invented QA data,
 * owner-provisioned in the explicit disposable native recheck database. Actual
 * authenticated requests run as app_service with RLS. Preserve fixture history,
 * audits, roles/schema and login sessions; close only this process's pools. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { databaseUrl } from '../../../../../tests/setup.db';
import { getPool } from '../../../../../server/db/runtime';
import { runWithTenantScope } from '../../../../../server/db/tenantStore';
import { canAccessReportProject } from '../../../../../server/services/report-os/project-access';

const TAG = `native-parent-${randomUUID()}`;
const TERM = `parentqa${randomUUID().replaceAll('-', '')}`;
const SHA = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const EVIDENCE = path.resolve(__dirname);
type Actor = { id: number; email: string; token: string };
type Program = { id: string; project: number; title: string; document: string };
const actors = {} as Record<'ownerA' | 'ownerB' | 'unassigned' | 'member' | 'downgraded' | 'revoked', Actor>;
const programs = {} as Record<'privateA' | 'privateB' | 'public' | 'downgraded', Program>;
let orgId: number;
let orgUuid: string;
let owner: Pool;
let app: express.Express;
let privateUploadId: string;
let sourceId: number;

function scope<T>(actor: Actor, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'member',
    accountId: actor.id, source: 'test', caller: 'native-parent-access-probe' }, fn);
}
const get = (actor: Actor, url: string) => request(app).get(url).set('Authorization', `Bearer ${actor.token}`);
const post = (actor: Actor, url: string, body: unknown = {}) => request(app).post(url).set('Authorization', `Bearer ${actor.token}`).send(body);

async function seedProgram(key: keyof typeof programs, ownerActor: Actor, visibility: 'private' | 'org_public', age: number): Promise<void> {
  const id = randomUUID();
  const title = `${TAG} ${key} QA project`;
  const code = `NQA-${id.slice(0,8)}-${key}`;
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status,updated_at)
    VALUES($1,$2,$3,$6,'IND','drug','FDA','Invented QA product',$4,'active',now()+$5::int*interval '1 minute')`, [id,orgId,title,ownerActor.id,age,code]);
  const workspace = (await owner.query('SELECT id FROM client_workspaces WHERE organization_id=$1 AND slug=$2',[orgId,TAG])).rows[0].id;
  const project = (await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}'::jsonb) RETURNING id`, [orgId,workspace,title,ownerActor.id,id])).rows[0];
  await owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)',[orgId,project.id,visibility]);
  const document = randomUUID();
  const text = `${TERM} ${key}: invented parent access QA data, not clinical evidence.`;
  await owner.query(`INSERT INTO vault.documents
    (id,organization_id,program_id,document_title,document_code,document_type,file_name,content_hash,extracted_text,created_by,created_at)
    VALUES($1,$2,$3,$4,$4,'REPORT',$5,$6,$7,$8,now()+$9::int*interval '1 minute')`,
  [document,orgId,id,`${TAG} ${key} QA document`,`${key}.txt`,SHA(text),text,ownerActor.id,age]);
  programs[key] = {id,project:Number(project.id),title,document};
}

beforeAll(async () => {
  if (new URL(databaseUrl).pathname !== '/platform_ci_native_recheck_20261013') {
    throw new Error('This evidence probe is restricted to platform_ci_native_recheck_20261013.');
  }
  if (!process.env.APP_DATABASE_URL || new URL(process.env.APP_DATABASE_URL).pathname !== '/platform_ci_native_recheck_20261013') {
    throw new Error('APP_DATABASE_URL must name the same disposable database through app_service.');
  }
  owner = new Pool({connectionString:databaseUrl,max:3});
  const org = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid",[TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  const passwordHash = await bcrypt.hash('Native-Parent-QA-Only-2026!',4);
  for (const key of ['ownerA','ownerB','unassigned','member','downgraded','revoked'] as const) {
    const email = `${TAG}-${key}@example.invalid`;
    const user = (await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id",[email,`${TAG} ${key}`,passwordHash])).rows[0];
    await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')",[orgId,user.id]);
    actors[key] = {id:Number(user.id),email,token:jwt.sign({type:'access',id:String(user.id),userId:String(user.id),organizationId:String(orgId),role:'member',roles:['member','user'],email},process.env.JWT_SECRET_DEV || process.env.JWT_SECRET!,{expiresIn:'1h'})};
  }
  await owner.query("INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id) VALUES($1,$2,$2,'active',$3)",[orgId,TAG,actors.ownerA.id]);
  await seedProgram('public',actors.ownerA,'org_public',0);
  await seedProgram('privateA',actors.ownerA,'private',10);
  await seedProgram('privateB',actors.ownerB,'private',20);
  await seedProgram('downgraded',actors.downgraded,'private',5);
  await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active'),($1,$4,$5,'edit','active')",[orgId,programs.privateA.project,actors.member.id,programs.public.project,actors.ownerB.id]);

  privateUploadId = `file_${randomUUID()}`;
  const storage = `uploads/org-${orgId}/${privateUploadId}.txt`;
  const bytes = Buffer.from(`${TERM} privately captured QA source; not clinical evidence.\n`);
  await fs.mkdir(path.dirname(path.resolve(storage)),{recursive:true});
  await fs.writeFile(storage,bytes);
  await owner.query(`INSERT INTO file_uploads(id,user_id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,'private-qa-source.txt','text/plain',$4,$5,$6,'uploaded')`,[privateUploadId,actors.ownerB.id,orgId,bytes.length,storage,SHA(bytes)]);
  sourceId = Number((await owner.query(`INSERT INTO cre_evidence_sources
    (organization_id,visibility_class,source_type,client_program_id,title,stored_artifact_ref,checksum,provenance,ingestion_status,extraction_status,created_by)
    VALUES($1,'project_private','client_document',$2,'Privately captured native QA source',$3,$4,$5::jsonb,'ingested','pending',$6) RETURNING id`,
  [orgId,programs.privateB.id,storage,SHA(bytes),JSON.stringify({origin:'native_parent_access_qa',fileUploadId:privateUploadId}),actors.ownerB.id])).rows[0].id);

  const {authMiddleware} = await import('../../../../../server/auth');
  const {authenticateToken} = await import('../../../../../server/middleware/auth');
  app = express(); app.use(express.json());
  app.use('/api/c2c/projects',authMiddleware,(await import('../../../../../server/routes/c2c/document-data-dispositions')).default(),(await import('../../../../../server/routes/c2c/projects')).default);
  app.use('/api/c2c/project-vault',authenticateToken,(await import('../../../../../server/routes/c2c/project-vault')).default());
  const linked = await post(actors.ownerB,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/relationships`,{
    toDocumentId:programs.privateB.document,type:'references',note:'Native QA relationship; both source parents are available to this fixture actor.',
  });
  expect(linked.status,JSON.stringify(linked.body)).toBe(201);
  await fs.writeFile(path.join(EVIDENCE,'native-probe-fixtures.json'),JSON.stringify({tag:TAG,organizationId:orgId,organizationUuid:orgUuid,
    actors:Object.fromEntries(Object.entries(actors).map(([key,value])=>[key,{id:value.id,email:value.email}])),programs,privateUploadId,sourceId,
    retained:'QA records, source bytes and actual audit history; no login tokens included.'},null,2)+'\n');
},120_000);

afterAll(async () => {
  // No DROP, role/schema changes, audit deletion, session revocation or fixture
  // deletion. The parent may reuse these precisely identified native records.
  await getPool().end();
  await owner?.end();
});

describe('actual authenticated native controls',() => {
  it('proves actual runtime app_service, non-owner NOSUPERUSER/NOBYPASSRLS and FORCE RLS',async () => {
    const result = await scope(actors.unassigned,()=>getPool().query(`SELECT current_user AS who,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce') AS enforcement,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_roles CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='regulatory_programs'::regclass`));
    expect(result.rows[0]).toMatchObject({who:'app_service',rolsuper:false,rolbypassrls:false,enforcement:'on',relrowsecurity:true,relforcerowsecurity:true});
    expect(result.rows[0].who).not.toBe(result.rows[0].owner);
  });
  it('proves the same real sharing policy admits public/owner/member and refuses an unassigned private actor',async () => {
    for (const [actor,program,expected] of [[actors.unassigned,programs.public,true],[actors.ownerA,programs.privateA,true],
      [actors.member,programs.privateA,true],[actors.unassigned,programs.privateA,false]] as const) {
      expect(await scope(actor,()=>canAccessReportProject(orgId,{userId:actor.id,role:'member'},program.project,getPool()))).toBe(expected);
    }
  });
  it('serves authorized public, private owner and explicitly assigned member detail through real authentication',async () => {
    for (const [actor,program] of [[actors.unassigned,programs.public],[actors.ownerA,programs.privateA],[actors.member,programs.privateA]] as const) {
      const response = await get(actor,`/api/c2c/projects/${program.id}`);
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      expect(response.body.name).toBe(program.title);
    }
  });
  it('serves the authorized public document search and relationship to an actor with both parents',async () => {
    const search = await get(actors.unassigned,`/api/c2c/project-vault/${programs.public.id}/search?q=${TERM}`);
    expect(search.status,JSON.stringify(search.body)).toBe(200);
    expect(search.body.data.total).toBe(1);
    const relationships = await get(actors.ownerB,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/relationships`);
    expect(relationships.status,JSON.stringify(relationships.body)).toBe(200);
    expect(JSON.stringify(relationships.body)).toContain(programs.privateB.document);
  });
});

describe('expected parent privacy behavior — evidence baseline before repair',() => {
  it('refuses an unassigned actor before private project metadata',async () => {
    const response = await get(actors.unassigned,`/api/c2c/projects/${programs.privateA.id}`);
    expect(response.status,JSON.stringify(response.body)).toBe(404);
  });
  it('refuses an unassigned actor before private Vault snippets or identity',async () => {
    const response = await get(actors.unassigned,`/api/c2c/project-vault/${programs.privateA.id}/search?q=${TERM}`);
    expect(response.status,JSON.stringify(response.body)).toBe(404);
  });
  it('pages the accessible portfolio rather than a newer private project',async () => {
    const response = await get(actors.unassigned,'/api/c2c/projects?limit=1');
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body.data[0]?.id,JSON.stringify(response.body)).toBe(programs.public.id);
    expect(response.body.meta.hasMore).toBe(false);
  });
  it('counts and pages only accessible library documents',async () => {
    const response = await get(actors.unassigned,`/api/c2c/project-vault/search?q=${TERM}&limit=1`);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.total,JSON.stringify(response.body)).toBe(1);
    expect(response.body.data.results[0]?.id).toBe(programs.public.document);
  });
  it('rechecks current organization membership for a previously authenticated public reader',async () => {
    const before = await get(actors.revoked,`/api/c2c/projects/${programs.public.id}`);
    expect(before.status,JSON.stringify(before.body)).toBe(200);
    await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[orgId,actors.revoked.id]);
    const response = await get(actors.revoked,`/api/c2c/projects/${programs.public.id}`);
    // Canonical authentication already denies the vanished membership. Keep
    // its observed 401 contract; the mocked-auth baseline did not cover this.
    expect(response.status,JSON.stringify(response.body)).toBe(401);
  });
  it('denies a now-viewer lead mutation despite the retained member JWT and lead identity',async () => {
    await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[orgId,actors.downgraded.id]);
    const response = await post(actors.downgraded,`/api/c2c/projects/${programs.downgraded.id}/archive`);
    expect(response.status,JSON.stringify(response.body)).toBe(403);
  });
  it('does not return a private counterpart from an accessible public document relationship',async () => {
    const response = await get(actors.unassigned,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/relationships`);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(programs.privateB.document);
    expect(JSON.stringify(response.body)).not.toContain(programs.privateB.title);
  });
  it('refuses a privately bound source selected into an owned target through conversation adoption',async () => {
    const before = (await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n;
    const response = await post(actors.ownerA,`/api/c2c/projects/${programs.privateA.id}/adopt`,{fileUploadId:privateUploadId});
    const after = (await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n;
    expect([403,404,409],JSON.stringify({status:response.status,body:response.body,before,after})).toContain(response.status);
    expect(after).toBe(before);
  });
});
