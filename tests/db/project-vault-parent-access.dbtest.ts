/** Current Project/Vault parent authorization through real authenticated native requests. All rows/bytes are invented QA data,
 * owner-provisioned in the explicit disposable native recheck database. Actual
 * authenticated requests run as app_service with RLS. Preserve fixture history,
 * audits, roles/schema and login sessions; close only this process's pools. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { canAccessReportProject } from '../../server/services/report-os/project-access';

const TAG = `native-parent-${randomUUID()}`;
const TERM = `parentqa${randomUUID().replaceAll('-', '')}`;
const SHA = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type Actor = { id: number; email: string; token: string };
type Program = { id: string; project: number; title: string; document: string; storage: string; bytes: Buffer; priorDocument?: string };
const actors = {} as Record<'ownerA' | 'ownerB' | 'unassigned' | 'member' | 'downgraded' | 'revoked' | 'reviewer', Actor>;
const programs = {} as Record<'privateA' | 'privateB' | 'public' | 'downgraded' | 'deletedAnchor' | 'archivedAnchor', Program>;
let orgId: number;
let orgUuid: string;
let owner: Pool;
let app: express.Express;
let privateUploadId: string;
let sourceId: number;
let readSpy: ReturnType<typeof vi.spyOn>;
let publicSourceId: number;
let nullPrivateSourceId: number;
let foreignGlobalSourceId: number;
let creatorUploadId: string;
let missingAnchorId: string;
const authoringDocuments = {whole:randomUUID(),sectionOnly:randomUUID()};
const misattributedDocuments: {id:string;title:string;storage:string}[]=[];

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
  const storage = `uploads/org-${orgId}/${TAG}-${key}-vault.txt`;
  const bytes = Buffer.from(text+'\n');
  await fs.mkdir(path.dirname(path.resolve(storage)),{recursive:true});
  await fs.writeFile(storage,bytes);
  const priorDocument=key==='privateA' ? randomUUID() : undefined;
  if (priorDocument) {
    const priorBytes=Buffer.from(`${TERM} prior invented QA version.\n`);
    const priorStorage=`uploads/org-${orgId}/${TAG}-${key}-prior-vault.txt`;
    await fs.writeFile(priorStorage,priorBytes);
    await owner.query(`INSERT INTO vault.documents
      (id,organization_id,program_id,document_title,document_code,document_type,file_name,content_hash,extracted_text,created_by,created_at,s3_key,mime_type,file_size,version)
      VALUES($1,$2,$3,$4,$4,'REPORT',$5,$6,$7,$8,now()+$9::int*interval '1 minute',$10,'text/plain',$11,'0.1')`,
    [priorDocument,orgId,id,`${TAG} ${key} QA document`,`${key}-prior.txt`,SHA(priorBytes),priorBytes.toString(),ownerActor.id,age-1,priorStorage,priorBytes.length]);
  }
  await owner.query(`INSERT INTO vault.documents
    (id,organization_id,program_id,document_title,document_code,document_type,file_name,content_hash,extracted_text,created_by,created_at,s3_key,mime_type,file_size,supersedes_id)
    VALUES($1,$2,$3,$4,$4,'REPORT',$5,$6,$7,$8,now()+$9::int*interval '1 minute',$10,'text/plain',$11,$12)`,
  [document,orgId,id,`${TAG} ${key} QA document`,`${key}.txt`,SHA(bytes),text,ownerActor.id,age,storage,bytes.length,priorDocument ?? null]);
  programs[key] = {id,project:Number(project.id),title,document,storage,bytes,priorDocument};
}

async function seedMisattributedDocuments(foreignOrgId:number):Promise<void> {
  for (const [kind,tenant] of [['unattributed',null],['foreign',foreignOrgId]] as const) {
    const id=randomUUID();const title=`${TAG} ${kind} recorded Vault QA`;
    const storage=`uploads/org-${orgId}/${TAG}-${kind}-tenant-guard.txt`;
    const bytes=Buffer.from(`${TERM} ${kind} invented Vault tenant refusal QA.\n`);
    await fs.writeFile(storage,bytes);
    await owner.query(`INSERT INTO vault.documents
      (id,organization_id,program_id,document_title,document_code,document_type,file_name,content_hash,extracted_text,created_by,s3_key,mime_type,file_size)
      VALUES($1,$2,$3,$4,$4,'REPORT',$5,$6,$7,$8,$9,'text/plain',$10)`,
    [id,tenant,programs.privateA.id,title,`${kind}.txt`,SHA(bytes),bytes.toString(),actors.ownerA.id,storage,bytes.length]);
    misattributedDocuments.push({id,title,storage});
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  owner = new Pool({connectionString:databaseUrl,max:3});
  const org = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid",[TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  const passwordHash = await bcrypt.hash('Native-Parent-QA-Only-2026!',4);
  for (const key of ['ownerA','ownerB','unassigned','member','downgraded','revoked','reviewer'] as const) {
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
  await seedProgram('deletedAnchor',actors.ownerA,'private',2);
  await seedProgram('archivedAnchor',actors.ownerA,'private',3);
  await owner.query("UPDATE projects SET status='deleted' WHERE id=$1",[programs.deletedAnchor.project]);
  await owner.query("UPDATE projects SET status='archived' WHERE id=$1",[programs.archivedAnchor.project]);
  await owner.query("UPDATE regulatory_programs SET status='archived' WHERE id=$1",[programs.archivedAnchor.id]);
  missingAnchorId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented QA product',$5,'active')`,
  [missingAnchorId,orgId,`${TAG} missing anchor QA`, `NQA-${missingAnchorId.slice(0,8)}`,actors.ownerA.id]);
  await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active'),($1,$4,$5,'edit','active')",[orgId,programs.privateA.project,actors.member.id,programs.public.project,actors.ownerB.id]);

  const reviewContent = 'Invented QA artifact for a genuine pending reviewer permission control.';
  const reviewArtifact = (await owner.query(`INSERT INTO concept2cure_artifacts
    (artifact_id,project_id,organization_id,type,category,title,content,content_hash,status,created_by_id)
    VALUES($1,$2,$3,'markdown','document',$4,$5,$6,'draft',$7) RETURNING id`,
  [`qa_${randomUUID()}`,programs.privateA.project,orgId,`${TAG} reviewer QA artifact`,reviewContent,SHA(reviewContent),actors.ownerA.id])).rows[0];
  await owner.query(`INSERT INTO concept2cure_review_assignments
    (assignment_id,artifact_id,organization_id,reviewer_id,assigned_by_id,status)
    VALUES($1,$2,$3,$4,$5,'pending')`,[`qa_${randomUUID()}`,reviewArtifact.id,orgId,actors.reviewer.id,actors.ownerA.id]);

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

  publicSourceId = Number((await owner.query(`INSERT INTO cre_evidence_sources
    (organization_id,visibility_class,source_type,title,provenance,ingestion_status,extraction_status,created_by)
    VALUES(NULL,'global_public','client_document',$1,'{}'::jsonb,'ingested','pending',$2) RETURNING id`,[`${TAG} explicitly public QA source`,actors.ownerA.id])).rows[0].id);
  nullPrivateSourceId = Number((await owner.query(`INSERT INTO cre_evidence_sources
    (organization_id,visibility_class,source_type,title,created_by)
    VALUES(NULL,'tenant_private','client_document',$1,$2) RETURNING id`,[`${TAG} unattributed private QA source`,actors.ownerA.id])).rows[0].id);
  const foreignOrg=Number((await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id",[`${TAG}-foreign`])).rows[0].id);
  await seedMisattributedDocuments(foreignOrg);
  foreignGlobalSourceId = Number((await owner.query(`INSERT INTO cre_evidence_sources
    (organization_id,visibility_class,source_type,title,created_by)
    VALUES($1,'global_public','client_document',$2,$3) RETURNING id`,[foreignOrg,`${TAG} foreign-tenant classified QA source`,actors.ownerA.id])).rows[0].id);
  creatorUploadId = `file_${randomUUID()}`;
  const ownStorage = `uploads/org-${orgId}/${creatorUploadId}.txt`;
  const ownBytes = Buffer.from(`${TERM} creator's unbound conversation QA upload.\n`);
  await fs.writeFile(ownStorage,ownBytes);
  await owner.query(`INSERT INTO file_uploads(id,user_id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,'conversation-qa.txt','text/plain',$4,$5,$6,'uploaded')`,[creatorUploadId,actors.ownerA.id,orgId,ownBytes.length,ownStorage,SHA(ownBytes)]);

  for (const [key,id] of Object.entries(authoringDocuments)) {
    const section=randomUUID();
    await owner.query(`INSERT INTO authoring_documents(id,title,status,created_by,tenant_id,client_program_id)
      VALUES($1,$2,'draft',$3,$4,$5)`,[id,`${TAG} ${key} restricted Authoring QA`,String(actors.ownerA.id),orgId,programs.public.id]);
    await owner.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
      VALUES($1,$2,'QA',$3,'Invented restricted Authoring prose.',$4)`,[section,id,`${TAG} section QA`,orgId]);
    await owner.query(`INSERT INTO doc_permissions(doc_id,section_id,role,tenant_id,principal_id,granted_by,grant_reason)
      VALUES($1,$2,'VIEWER',$3,$5,$4,'Invented QA read grant')`,
    [id,key==='sectionOnly'?section:null,orgId,String(actors.ownerA.id),String(actors.unassigned.id)]);
  }

  const {authMiddleware} = await import('../../server/auth');
  const {authenticateToken} = await import('../../server/middleware/auth');
  app = express(); app.use(express.json());
  app.use('/api/c2c/projects',authMiddleware,(await import('../../server/routes/c2c/document-data-dispositions')).default(),(await import('../../server/routes/c2c/projects')).default);
  app.use('/api/c2c/project-vault',authenticateToken,(await import('../../server/routes/c2c/project-vault')).default());
  const linked = await post(actors.ownerB,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/relationships`,{
    toDocumentId:programs.privateB.document,type:'references',note:'Native QA relationship; both source parents are available to this fixture actor.',
  });
  expect(linked.status,JSON.stringify(linked.body)).toBe(201);
  readSpy = vi.spyOn(fs, 'readFile'); // default call-through: no bytes or query responses are substituted.
},120_000);

afterAll(async () => {
  // No DROP, role/schema changes, audit deletion, session revocation or fixture
  // deletion. The parent may reuse these precisely identified native records.
  readSpy?.mockRestore();
  await getPool().end();
  await owner?.end();
});

describe('actual authenticated native controls',() => {
  it('proves actual runtime app_service, non-owner NOSUPERUSER/NOBYPASSRLS and FORCE RLS',async () => {
    const result = await scope(actors.unassigned,()=>getPool().query(`SELECT current_user AS who,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce') AS enforcement,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_roles CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='regulatory_programs'::regclass`));
    expect(result.rows[0]).toMatchObject({who:decodeURIComponent(new URL(process.env.APP_DATABASE_URL!).username),rolsuper:false,rolbypassrls:false,enforcement:'on',relrowsecurity:true,relforcerowsecurity:true});
    expect(result.rows[0].who).not.toBe(result.rows[0].owner);
  });
  it('has native FORCE RLS on Vault after canonical migration repair without changing table ownership', async () => {
    const row = (await scope(actors.unassigned,()=>getPool().query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='vault.documents'::regclass"))).rows[0];
    expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});
    expect(row.owner).not.toBe(decodeURIComponent(new URL(process.env.APP_DATABASE_URL!).username));
  });
  it('proves the same real sharing policy admits public/owner/member and refuses an unassigned private actor',async () => {
    for (const [actor,program,expected] of [[actors.unassigned,programs.public,true],[actors.ownerA,programs.privateA,true],
      [actors.member,programs.privateA,true],[actors.reviewer,programs.privateA,true],[actors.unassigned,programs.privateA,false]] as const) {
      expect(await scope(actor,()=>canAccessReportProject(orgId,{userId:actor.id,role:'member'},program.project,getPool()))).toBe(expected);
    }
  });
  it('serves authorized public, private owner and explicitly assigned member detail through real authentication',async () => {
    for (const [actor,program] of [[actors.unassigned,programs.public],[actors.ownerA,programs.privateA],[actors.member,programs.privateA],[actors.reviewer,programs.privateA]] as const) {
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

describe('all parent read families deny before content or download effects', () => {
  const projectPaths = ['', '/dossier', '/drafts', '/team', '/evidence', '/activity', '/records',
    '/conversation-files', '/sources', '/source-changes'];
  it.each(projectPaths)('protects the Project read %s', async suffix => {
    const denied = await get(actors.unassigned, `/api/c2c/projects/${programs.privateA.id}${suffix}`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(denied.body).toMatchObject({error:'PROJECT_NOT_FOUND'});
    expect(JSON.stringify(denied.body)).not.toContain(programs.privateA.title);
    expect(JSON.stringify(denied.body)).not.toContain(programs.privateA.id);
    const allowed = await get(actors.ownerA, `/api/c2c/projects/${programs.privateA.id}${suffix}`);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  });
  const documentPaths = ['/versions', '/compare', '/history', '/catalog', '/relationships', '/annotations', '/text'];
  it.each(documentPaths)('protects the Vault document read %s', async suffix => {
    const extra = suffix === '/compare' ? `?against=${programs.privateA.priorDocument}` : '';
    const denied = await get(actors.unassigned, `/api/c2c/project-vault/${programs.privateA.id}/documents/${programs.privateA.document}${suffix}${extra}`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(denied.body).toMatchObject({error:'PROJECT_NOT_FOUND'});
    expect(JSON.stringify(denied.body)).not.toContain(programs.privateA.document);
    const allowed = await get(actors.ownerA, `/api/c2c/project-vault/${programs.privateA.id}/documents/${programs.privateA.document}${suffix}${extra}`);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  });
  it('protects the Vault tree and separately mounted disposition preview', async () => {
    const p=programs.privateA;
    const previousEnabled=process.env.C2C_DOCUMENT_DISPOSITIONS_ENABLED;
    const previousSecret=process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET;
    process.env.C2C_DOCUMENT_DISPOSITIONS_ENABLED='1';
    process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET='native-parent-preview-test-only-secret-2026';
    try {
      for (const url of [`/api/c2c/project-vault/${p.id}`,
        `/api/c2c/projects/${p.id}/document-dispositions/preview?targetType=vault_document&targetId=${p.document}`]) {
        const denied=await get(actors.unassigned,url);
        expect(denied.status,JSON.stringify(denied.body)).toBe(404);
        expect(denied.body).toMatchObject({error:'PROJECT_NOT_FOUND'});
        expect(JSON.stringify(denied.body)).not.toContain(p.id);
        const allowed=await get(actors.ownerA,url);
        expect(allowed.status,JSON.stringify(allowed.body)).toBe(200);
      }
    } finally {
      if (previousEnabled===undefined) delete process.env.C2C_DOCUMENT_DISPOSITIONS_ENABLED;
      else process.env.C2C_DOCUMENT_DISPOSITIONS_ENABLED=previousEnabled;
      if (previousSecret===undefined) delete process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET;
      else process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET=previousSecret;
    }
  });
  it('denies private bytes before filesystem reads or a download audit, then serves the exact authorized bytes', async () => {
    const p = programs.privateA;
    const countAudit = async () => Number((await owner.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='vault.document.download' AND record_id=$2",[orgId,p.document])).rows[0].n);
    const countReads = () => readSpy.mock.calls.filter(([file]) => String(file) === path.resolve(p.storage)).length;
    const before = { audit: await countAudit(), reads: countReads() };
    const denied = await get(actors.unassigned, `/api/c2c/project-vault/${p.id}/documents/${p.document}/download`);
    expect(denied.status, JSON.stringify(denied.body)).toBe(404);
    expect(denied.body).toMatchObject({error:'PROJECT_NOT_FOUND'});
    expect(countReads()).toBe(before.reads);
    expect(await countAudit()).toBe(before.audit);
    const allowed = await get(actors.ownerA, `/api/c2c/project-vault/${p.id}/documents/${p.document}/download`);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(allowed.text).toBe(p.bytes.toString());
    expect(allowed.headers['x-content-sha256']).toBe(SHA(p.bytes));
    expect(countReads()).toBe(before.reads+1);
    expect(await countAudit()).toBe(before.audit+1);
  });
});

describe('source and Authoring admission positive boundaries', () => {
  it('retains a genuinely global_public source under restricted runtime RLS', async () => {
    const raw=await scope(actors.unassigned,()=>getPool().query(`SELECT id FROM cre_evidence_sources WHERE id=ANY($1::int[]) ORDER BY id`,
      [[publicSourceId,nullPrivateSourceId,foreignGlobalSourceId]]));
    expect(raw.rows).toEqual([{id:publicSourceId}]);
    const publicSources = await get(actors.unassigned, `/api/c2c/projects/${programs.public.id}/sources?includeUnscoped=true`);
    expect(publicSources.status, JSON.stringify(publicSources.body)).toBe(200);
    expect(publicSources.body.unscoped.map((row: {id:number})=>row.id)).toContain(publicSourceId);
    expect(JSON.stringify(publicSources.body)).not.toContain(`${TAG} unattributed private QA source`);
    expect(JSON.stringify(publicSources.body)).not.toContain(`${TAG} foreign-tenant classified QA source`);
  });
  it('admits public SELECT only and preserves recorded global rows on runtime INSERT UPDATE and DELETE attempts',async () => {
    const readOriginal=async () => (await owner.query('SELECT * FROM cre_evidence_sources WHERE id=ANY($1::int[]) ORDER BY id',
      [[publicSourceId,nullPrivateSourceId,foreignGlobalSourceId]])).rows;
    const originals=await readOriginal();
    await scope(actors.unassigned,async () => {
      const client=await getPool().connect();
      try {
        await client.query('BEGIN');
        await expect(client.query(`INSERT INTO cre_evidence_sources(organization_id,visibility_class,source_type,title,created_by)
          VALUES(NULL,'global_public','client_document',$1,$2)`,[`${TAG} refused runtime global insertion`,actors.unassigned.id]))
          .rejects.toMatchObject({code:'42501'});
      } finally {await client.query('ROLLBACK');client.release();}
      const updated=await getPool().query("UPDATE cre_evidence_sources SET title=$2 WHERE id=$1 RETURNING id",[publicSourceId,`${TAG} refused global update`]);
      expect(updated.rows).toEqual([]);
      const deleted=await getPool().query('DELETE FROM cre_evidence_sources WHERE id=$1 RETURNING id',[publicSourceId]);
      expect(deleted.rows).toEqual([]);
    });
    expect(await readOriginal()).toEqual(originals);
    expect((await owner.query('SELECT id FROM cre_evidence_sources WHERE title=$1',[`${TAG} refused runtime global insertion`])).rows).toEqual([]);
  });
  it('admits creator-only unbound conversation adoption and preserves same-target idempotence', async () => {
    const adopted = await post(actors.ownerA, `/api/c2c/projects/${programs.privateA.id}/adopt`, {fileUploadId:creatorUploadId});
    expect(adopted.status, JSON.stringify(adopted.body)).toBe(201);
    const replay = await post(actors.ownerA, `/api/c2c/projects/${programs.privateA.id}/adopt`, {fileUploadId:creatorUploadId});
    expect(replay.status, JSON.stringify(replay.body)).toBe(200);
    expect(replay.body).toMatchObject({adopted:false,sourceId:adopted.body.sourceId});
  });
  it('shows only Authoring documents with a whole-document grant in accessible project records',async () => {
    const response=await get(actors.unassigned,`/api/c2c/projects/${programs.public.id}/records`);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    const authoring=response.body.records.authoringDocuments;
    expect(authoring).toMatchObject({available:true,scope:'accessible-documents'});
    expect(authoring.rows.map((row:{id:string})=>row.id)).toEqual([authoringDocuments.whole]);
    expect(JSON.stringify(response.body)).not.toContain(authoringDocuments.sectionOnly);
    expect(JSON.stringify(response.body)).not.toContain(`${TAG} sectionOnly restricted Authoring QA`);
    const ownerResponse=await get(actors.ownerA,`/api/c2c/projects/${programs.public.id}/records`);
    expect(ownerResponse.status,JSON.stringify(ownerResponse.body)).toBe(200);
    expect(ownerResponse.body.records.authoringDocuments.rows.map((row:{id:string})=>row.id).sort())
      .toEqual(Object.values(authoringDocuments).sort());
  });
});

describe('native identity and retained anchor controls',() => {
  it('refuses unattributed409 or foreign404 Vault identity before bytes or audits',async () => {
    const originals=(await owner.query('SELECT * FROM vault.documents WHERE id=ANY($1::uuid[]) ORDER BY id',[misattributedDocuments.map(d=>d.id)])).rows;
    const auditCount=async () => Number((await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND record_id=ANY($2::text[])',[orgId,misattributedDocuments.map(d=>d.id)])).rows[0].n);
    const beforeAudit=await auditCount();
    const beforeReads=readSpy.mock.calls.filter(([file])=>misattributedDocuments.some(d=>String(file)===path.resolve(d.storage))).length;
    for (const [index,d] of misattributedDocuments.entries()) {
      const response=await get(actors.ownerA,`/api/c2c/project-vault/${programs.privateA.id}/documents/${d.id}/download`);
      expect(response.status,JSON.stringify(response.body)).toBe(index===0 ? 409 : 404);
      expect(response.body.error).toBe(index===0 ? 'VAULT_TENANT_RECONCILIATION_REQUIRED' : 'PROJECT_NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain(d.title);
    }
    expect(readSpy.mock.calls.filter(([file])=>misattributedDocuments.some(d=>String(file)===path.resolve(d.storage))).length).toBe(beforeReads);
    expect(await auditCount()).toBe(beforeAudit);
    expect((await owner.query('SELECT * FROM vault.documents WHERE id=ANY($1::uuid[]) ORDER BY id',[misattributedDocuments.map(d=>d.id)])).rows).toEqual(originals);
  });
  it('excludes unattributed and foreign Vault metadata before tree search and record-card projection',async () => {
    for (const url of [`/api/c2c/project-vault/${programs.privateA.id}`,
      `/api/c2c/project-vault/${programs.privateA.id}/search?q=${TERM}`,
      `/api/c2c/projects/${programs.privateA.id}/records`]) {
      const response=await get(actors.ownerA,url);
      expect(response.status,JSON.stringify(response.body)).toBe(200);
      const body=JSON.stringify(response.body);
      expect(body).toContain(programs.privateA.document);
      for (const d of misattributedDocuments) {expect(body).not.toContain(d.id);expect(body).not.toContain(d.title);}
    }
  });
  it('refuses malformed or nonexistent parent identities without exposing metadata',async () => {
    for (const identity of ['not-a-program',randomUUID()]) {
      const response=await get(actors.ownerA,`/api/c2c/projects/${identity}`);
      expect(response.status,JSON.stringify(response.body)).toBe(404);
      expect(response.body).toMatchObject({error:'PROJECT_NOT_FOUND'});
      expect(JSON.stringify(response.body)).not.toContain(identity);
    }
  });
  it('requires reconciliation for missing or deleted anchors and preserves archived retained reads',async () => {
    for (const id of [missingAnchorId,programs.deletedAnchor.id]) {
      const response=await get(actors.ownerA,`/api/c2c/projects/${id}`);
      expect(response.status,JSON.stringify(response.body)).toBe(409);
      expect(response.body).toMatchObject({error:'PROJECT_ANCHOR_UNRESOLVED'});
    }
    const retained=await get(actors.ownerA,`/api/c2c/projects/${programs.archivedAnchor.id}`);
    expect(retained.status,JSON.stringify(retained.body)).toBe(200);
    expect(retained.body.name).toBe(programs.archivedAnchor.title);
  });
  it('retains the canonical native uniqueness constraint rather than selecting a second anchor',async () => {
    await expect(owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      SELECT organization_id,client_workspace_id,$2,type,status,owner_id,created_by_id,regulatory_program_id,settings
      FROM projects WHERE id=$1`,[programs.privateA.project,`${TAG} refused duplicate anchor QA`])).rejects.toMatchObject({code:'23505',constraint:'projects_one_anchor_per_program'});
    const original=await owner.query('SELECT id FROM projects WHERE organization_id=$1 AND regulatory_program_id=$2',[orgId,programs.privateA.id]);
    expect(original.rows).toEqual([{id:programs.privateA.project}]);
  });
});

describe('current parent privacy through actual authenticated routes',() => {
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
    const auditBefore=Number((await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND record_id=$2',[orgId,programs.downgraded.id])).rows[0].n);
    await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[orgId,actors.downgraded.id]);
    const read=await get(actors.downgraded,`/api/c2c/projects/${programs.public.id}`);
    expect(read.status,JSON.stringify(read.body)).toBe(200);
    const response = await post(actors.downgraded,`/api/c2c/projects/${programs.downgraded.id}/archive`);
    expect(response.status,JSON.stringify(response.body)).toBe(403);
    expect((await owner.query('SELECT status FROM regulatory_programs WHERE id=$1',[programs.downgraded.id])).rows[0].status).toBe('active');
    expect(Number((await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND record_id=$2',[orgId,programs.downgraded.id])).rows[0].n)).toBe(auditBefore);
  });
  it('does not return a private counterpart from an accessible public document relationship',async () => {
    const auditBefore=(await owner.query("SELECT id::text AS id,new_values,sha256_chain FROM audit_logs WHERE tenant_id=$1 AND action='vault.document.relate' ORDER BY id",[orgId])).rows;
    const response = await get(actors.unassigned,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/relationships`);
    expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(programs.privateB.document);
    expect(JSON.stringify(response.body)).not.toContain(programs.privateB.title);
    const history=await get(actors.unassigned,`/api/c2c/project-vault/${programs.public.id}/documents/${programs.public.document}/history`);
    expect(history.status,JSON.stringify(history.body)).toBe(200);
    expect(JSON.stringify(history.body)).not.toContain(programs.privateB.document);
    expect(JSON.stringify(history.body)).not.toContain(`${TAG} privateB QA document`);
    expect((await owner.query("SELECT id::text AS id,new_values,sha256_chain FROM audit_logs WHERE tenant_id=$1 AND action='vault.document.relate' ORDER BY id",[orgId])).rows).toEqual(auditBefore);
  });
  it('rechecks current write eligibility after request admission and before the real adoption transaction', async () => {
    const pool = getPool();
    const before = Number((await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n);
    const originalConnect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool as unknown as {connect():Promise<PoolClient>},'connect');
    let changed = false;
    connectSpy.mockImplementation(async () => {
      if (!changed) {
        changed = true;
        await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[orgId,actors.ownerA.id]);
      }
      return originalConnect();
    });
    try {
      const response = await post(actors.ownerA,`/api/c2c/projects/${programs.privateA.id}/adopt`,{fileUploadId:creatorUploadId});
      expect(changed).toBe(true);
      expect(response.status,JSON.stringify(response.body)).toBe(403);
      expect(Number((await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n)).toBe(before);
    } finally {
      connectSpy.mockRestore();
      await owner.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2",[orgId,actors.ownerA.id]);
    }
  });
  it('refuses a privately bound source selected into an owned target through conversation adoption',async () => {
    const privatePath=(await owner.query('SELECT storage_path FROM file_uploads WHERE id=$1',[privateUploadId])).rows[0].storage_path;
    const readsBefore=readSpy.mock.calls.filter(([file])=>String(file)===path.resolve(privatePath)).length;
    const auditsBefore=Number((await owner.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='c2c.project.adopt'",[orgId])).rows[0].n);
    const before = (await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n;
    const response = await post(actors.ownerA,`/api/c2c/projects/${programs.privateA.id}/adopt`,{fileUploadId:privateUploadId});
    const after = (await owner.query('SELECT count(*)::int AS n FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2',[orgId,programs.privateA.id])).rows[0].n;
    expect(response.status,JSON.stringify({status:response.status,body:response.body,before,after})).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(programs.privateB.id);
    expect(JSON.stringify(response.body)).not.toContain('Privately captured native QA source');
    expect(after).toBe(before);
    expect(readSpy.mock.calls.filter(([file])=>String(file)===path.resolve(privatePath)).length).toBe(readsBefore);
    expect(Number((await owner.query("SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND action='c2c.project.adopt'",[orgId])).rows[0].n)).toBe(auditsBefore);
    expect((await owner.query('SELECT client_program_id FROM cre_evidence_sources WHERE id=$1',[sourceId])).rows[0].client_program_id).toBe(programs.privateB.id);
  });
});
