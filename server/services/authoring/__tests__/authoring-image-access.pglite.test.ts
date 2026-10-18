/** Actual PostgreSQL capture, permission decisions, retained audit and rollback.
 * Disk I/O is the explicit seam; this fixture does not qualify live RLS or
 * concurrent lock behavior. Production capture/audit services remain real. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringImagePool } from '../authoring-image-import';
import { createDispositionHarness, type DispositionHarness } from '../../document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ db: null as AuthoringImagePool | null, readFile: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
const db = () => { if (!h.db) throw new Error('fixture not ready'); return h.db; };
vi.mock('../../../db.js', () => ({ getPool: () => {
  if (!h.db) throw new Error('fixture not ready'); return h.db;
}, pool: { query: (sql: string, args?: unknown[]) => {
  if (!h.db) throw new Error('fixture not ready'); return h.db.query(sql,args);
} } }));
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, promises: { ...fs.promises, readFile: h.readFile, writeFile: h.writeFile, unlink: h.unlink, mkdir: async () => undefined } };
});

import { saveAuthoringImage } from '../authoring-image-import';
import { loadUploadedFile, sha256Hex } from '../../ana/uploaded-file-access';
import { admitAnaSelectedSources, assertAnaUploadAccess } from '../../ana/source-context-admission';
import { writeAuthoringAuditTrail } from '../authoring-evidence';
import { resolveAuthoringImages } from '../../../export/authoring-images';

let harness: DispositionHarness;
let org = 2000;
let program: string;
let documentId: string;
let sectionId: string;
let projectId: number;
const bytes = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
const author = (id = 42, pool = db()) => ({ pool, tenantId: org, actor: { id: String(id), email: 'stale@example.test' },
  principal: { id: String(id), email: 'stale@example.test', roles: ['ADMIN'] } });
const upload = (id = 42, target: unknown = documentId, pool = db()) => saveAuthoringImage(author(id,pool),
  { documentId: target, file: { buffer: bytes, mimetype: 'image/gif', originalname: 'trial-figure.gif' } });
const read = (fileId: string, userId = 45) => loadUploadedFile(fileId,org,{userId});
const count = async (table: 'file_uploads'|'cre_evidence_sources'|'audit_logs') =>
  (await harness.pg.query<{count:number}>(`SELECT count(*)::int AS count FROM ${table} WHERE ${table==='audit_logs'?'tenant_id':'organization_id'}=$1`,[org])).rows[0]?.count;

beforeAll(async () => {
  harness = await createDispositionHarness();
  const query = (sql: string, params?: unknown[]) => harness.pg.query<Record<string, unknown>>(sql,params);
  h.db = { query, connect: async () => ({ query, release: () => undefined }) };
  /* Since 14362ef00 the shared disposition harness itself creates users,
     organizations, organization_users, project_visibility_settings,
     project_members, concept2cure_review_assignments and the projects access
     columns (and seats users 42 and 99). This adds only what it lacks. */
  await harness.pg.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE authoring_documents ADD COLUMN created_by text, ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE doc_permissions(id uuid DEFAULT gen_random_uuid(),tenant_id int,doc_id uuid,section_id uuid,
      principal_id text,email text,role text,valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    ALTER TABLE file_uploads ADD COLUMN user_id int, ADD COLUMN original_name text, ADD COLUMN mime_type text,
      ADD COLUMN file_size bigint, ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE cre_evidence_sources ADD COLUMN visibility_class text DEFAULT 'project_private', ADD COLUMN client_workspace_id int,
      ADD COLUMN agency text, ADD COLUMN source_record_identifier text, ADD COLUMN sponsor text, ADD COLUMN product text,
      ADD COLUMN indication text, ADD COLUMN therapeutic_area text, ADD COLUMN phase text, ADD COLUMN application_type text,
      ADD COLUMN application_number text, ADD COLUMN trial_registry_identifier text, ADD COLUMN document_date date,
      ADD COLUMN official_url text, ADD COLUMN stored_artifact_ref text, ADD COLUMN version text,
      ADD COLUMN linked_csr_report_id int, ADD COLUMN linked_precedent_id text, ADD COLUMN created_by int,
      ADD COLUMN created_at timestamptz DEFAULT now();
    INSERT INTO users (id,status,email) VALUES (42,'active','author@example.test'),(43,'active','coauthor@example.test'),
      (44,'active','outsider@example.test'),(45,'active','reviewer@example.test')
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, email=EXCLUDED.email;
  `);
  await harness.pg.exec(readFileSync(new URL('../../../../db/migrations/20260725_authoring_audit_trail.sql',import.meta.url),'utf8'));
  await harness.pg.exec(readFileSync(new URL('../../../../migrations/20260921_audit_logs_chain_seq.sql',import.meta.url),'utf8'));
  vi.stubEnv('AUDIT_HMAC_KEY','authoring-figure-test-seal-at-least-32-characters');
},90_000);
afterAll(async () => { vi.unstubAllEnvs(); await harness?.close(); });
beforeEach(async () => {
  org++; program=randomUUID(); documentId=randomUUID(); sectionId=randomUUID();
  h.readFile.mockReset().mockResolvedValue(bytes); h.writeFile.mockReset().mockResolvedValue(undefined); h.unlink.mockReset().mockResolvedValue(undefined);
  await harness.pg.exec("UPDATE users SET status='active'");
  await harness.pg.query("INSERT INTO organizations VALUES ($1,'active')",[org]);
  await harness.pg.query("INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,42,'manager'),($1,43,'member'),($1,44,'member'),($1,45,'readonly')",[org]);
  await harness.pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)',[program,org]);
  projectId=(await harness.pg.query<{id:number}>(`INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id)
    VALUES($1,$2,42,42) RETURNING id`,[org,program])).rows[0]!.id;
  await harness.pg.query("INSERT INTO project_visibility_settings (project_id,organization_id,visibility) VALUES ($1,$2,'private')",[projectId,org]);
  await harness.pg.query(`INSERT INTO project_members (project_id,organization_id,user_id,role,status)
    VALUES ($1,$2,43,'use','active'),($1,$2,45,'use','active')`,[projectId,org]);
  await harness.pg.query("INSERT INTO authoring_documents(id,tenant_id,status,client_program_id,created_by) VALUES($1,$2,'draft',$3,'42')",[documentId,org,program]);
  await harness.pg.query('INSERT INTO authoring_sections(id,doc_id,tenant_id) VALUES($1,$2,$3)',[sectionId,documentId,org]);
  await harness.pg.query(`INSERT INTO doc_permissions(tenant_id,doc_id,principal_id,role) VALUES
    ($1,$2,'42','OWNER'),($1,$2,'43','AUTHOR'),($1,$2,'45','REVIEWER')`,[org,documentId]);
});

async function unbound() {
  const fileId=`file_${org}_legacy`;
  await harness.pg.query(`INSERT INTO file_uploads(id,organization_id,user_id,checksum_sha256,storage_path,status,mime_type,original_name,file_size)
    VALUES($1,$2,42,$3,$4,'uploaded','image/gif','legacy.gif',$5)`,[fileId,org,sha256Hex(bytes),`uploads/org-${org}/${fileId}`,bytes.length]);
  return fileId;
}
async function retainInsertion(fileId:string, actorId=42, target=documentId) {
  const client=await db().connect();
  await client.query('BEGIN');
  try {
    await writeAuthoringAuditTrail({pool:db(),tenantId:org,actorId:String(actorId),actorEmail:'author@example.test',actorRole:'author',
      ipAddress:'127.0.0.1',userAgent:'pglite-authoring-image-access'},
      {executor:client,docId:target,sectionId,operationType:'update',beforeContent:'<p>Before</p>',
        afterContent:`<figure><img src="/api/authoring/images/${fileId}" alt="Trial figure"></figure>`,
        changeReason:'Add the original study figure',metadata:{figureAdded:true}});
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
}

describe('figures are captured against the actual current authoring parent', () => {
  it('atomically captures upload + exact document/program source + both real chained audit records',async()=>{
    const result=await upload(43);
    expect(result.captureStatus).toBe('captured'); expect(result.sourceId).toBeTypeOf('number');
    expect(await count('file_uploads')).toBe(1); expect(await count('cre_evidence_sources')).toBe(1); expect(await count('audit_logs')).toBe(2);
    const row=(await harness.pg.query<{client_program_id:string;provenance:Record<string,unknown>;extraction_status:string;created_by:number;metadata:Record<string,unknown>}>
      ('SELECT client_program_id,provenance,extraction_status,created_by,metadata FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2',[result.sourceId,org])).rows[0];
    expect(row).toMatchObject({client_program_id:program,created_by:43,extraction_status:'pending',
      provenance:{origin:'authoring_image_upload',authoringDocumentId:documentId,fileUploadId:result.fileId},metadata:{scientificQualification:'unassessed'}});
    expect(await read(result.fileId)).toMatchObject({buffer:bytes,integrity:'verified'});
    expect((await harness.pg.query<{status:string}>('SELECT status FROM authoring_documents WHERE id=$1 AND tenant_id=$2',[documentId,org])).rows[0]?.status).toBe('draft');
  });
  it.each([undefined,'bad-id',randomUUID()])('rejects missing/malformed/foreign document %s before bytes',async target=>{
    await expect(saveAuthoringImage(author(),{documentId:target,file:{buffer:bytes,mimetype:'image/gif'}})).rejects.toMatchObject({status:target===undefined||target==='bad-id'?400:404});
    expect(h.writeFile).not.toHaveBeenCalled(); expect(await count('file_uploads')).toBe(0);
  });
  it('ignores browser admin claims and rejects an unassigned private-project member',async()=>{
    await expect(upload(44)).rejects.toMatchObject({status:403}); expect(h.writeFile).not.toHaveBeenCalled();
  });
  it('rejects readonly upload and immutable document despite project membership',async()=>{
    await expect(upload(45)).rejects.toMatchObject({status:403});
    await harness.pg.query("UPDATE authoring_documents SET status='APPROVED' WHERE id=$1 AND tenant_id=$2",[documentId,org]);
    await expect(upload()).rejects.toMatchObject({status:403});
    await harness.pg.query("UPDATE authoring_documents SET status='draft',locked_at=now() WHERE id=$1 AND tenant_id=$2",[documentId,org]);
    await expect(upload()).rejects.toMatchObject({status:403,code:'DOCUMENT_FROZEN'}); expect(h.writeFile).not.toHaveBeenCalled();
  });
  it('rechecks revocation after preflight on the actual capture transaction before filesystem writes',async()=>{
    const pool:AuthoringImagePool={query:db().query,connect:async()=>{
      await harness.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND user_id=43",[org]);
      return db().connect();
    }};
    await expect(upload(43,documentId,pool)).rejects.toMatchObject({status:403});
    expect(h.writeFile).not.toHaveBeenCalled(); expect(await count('cre_evidence_sources')).toBe(0);
  });
  it('rolls back all rows and compensates only the new bytes when the final chained audit INSERT fails',async()=>{
    await harness.pg.exec(`CREATE OR REPLACE FUNCTION test_figure_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='authoring.image.upload' THEN RAISE EXCEPTION 'test chained audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_figure_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_figure_audit_failure();`);
    try { await expect(upload()).rejects.toThrow('test chained audit unavailable'); }
    finally {await harness.pg.exec('DROP TRIGGER test_figure_audit_failure ON audit_logs');}
    expect(await count('file_uploads')).toBe(0); expect(await count('cre_evidence_sources')).toBe(0); expect(await count('audit_logs')).toBe(0);
    expect(h.writeFile).toHaveBeenCalledOnce(); expect(h.unlink).toHaveBeenCalledOnce();
  });
  it('retains document-object permission as well as project access on every captured-image read',async()=>{
    const result=await upload();
    expect(await read(result.fileId)).toMatchObject({buffer:bytes,integrity:'verified'});
    h.readFile.mockClear();
    await harness.pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE tenant_id=$1 AND principal_id='45'",[org]);
    // Since 14362ef00 the recorded-parent admission (admitRecordedCreSourceScope,
    // source-context-admission.ts admitRecordedScope) answers every non-503/409
    // refusal with the one undisclosing ANA_SOURCE_ACCESS_DENIED; the control
    // read above proves the revocation is what refuses it.
    await expect(read(result.fileId)).rejects.toMatchObject({status:403,code:'ANA_SOURCE_ACCESS_DENIED'});
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('selected source IDs also retain the captured document object permission',async()=>{
    const result=await upload();
    await expect(admitAnaSelectedSources(db(),{organizationId:org,userId:45,sourceIds:[result.sourceId]})).resolves.toBeUndefined();
    await harness.pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE tenant_id=$1 AND principal_id='45'",[org]);
    // Since 14362ef00 the recorded-parent admission (admitRecordedCreSourceScope,
    // source-context-admission.ts admitRecordedScope) answers every non-503/409
    // refusal with the one undisclosing ANA_SOURCE_ACCESS_DENIED; the control
    // read above proves the revocation is what refuses it.
    await expect(admitAnaSelectedSources(db(),{organizationId:org,userId:45,sourceIds:[result.sourceId]}))
      .rejects.toMatchObject({status:403,code:'ANA_SOURCE_ACCESS_DENIED'});
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('rechecks revoked authoring grants on the actual transaction, without trusting request roles/email',async()=>{
    const pool:AuthoringImagePool={query:db().query,connect:async()=>{
      await harness.pg.query("UPDATE doc_permissions SET revoked_at=now() WHERE tenant_id=$1 AND principal_id='43'",[org]);
      return db().connect();
    }};
    await expect(upload(43,documentId,pool)).rejects.toMatchObject({status:403,code:'ANA_IMAGE_DOCUMENT_PERMISSION_DENIED'});
    expect(h.writeFile).not.toHaveBeenCalled(); expect(await count('file_uploads')).toBe(0);
  });
  it('fails closed when document/project permission cannot be read before capture',async()=>{
    const pool:AuthoringImagePool={query:async()=>{throw new Error('connection unavailable');},connect:db().connect};
    await expect(upload(42,documentId,pool)).rejects.toMatchObject({status:503,code:'ANA_IMAGE_ACCESS_UNAVAILABLE'});
    expect(h.writeFile).not.toHaveBeenCalled(); expect(await count('file_uploads')).toBe(0);
  });
  it('refuses creator bytes after project revocation or actor suspension; ownership cannot override captured scope',async()=>{
    const result=await upload(43);
    await harness.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND user_id=43",[org]);
    await expect(read(result.fileId,43)).rejects.toMatchObject({status:403});
    await harness.pg.query("UPDATE users SET status='suspended' WHERE id=42");
    await expect(read(result.fileId,42)).rejects.toMatchObject({status:403}); expect(h.readFile).not.toHaveBeenCalled();
  });
  it('exports the same reader-accessible bytes, and prints a placeholder when the actor is absent or denied',async()=>{
    const result=await upload(); const reference=`/api/authoring/images/${result.fileId}`;
    expect((await resolveAuthoringImages([`<img src="${reference}">`],org,{userId:45})).get(reference)?.buffer).toEqual(bytes);
    h.readFile.mockClear();
    expect((await resolveAuthoringImages([`<img src="${reference}">`],org)).size).toBe(0);
    expect((await resolveAuthoringImages([`<img src="${reference}">`],org,{userId:44})).size).toBe(0);
    expect(h.readFile).not.toHaveBeenCalled();
  });
});

describe('legacy sharing rests on retained original-uploader evidence',()=>{
  it('permits an authorized current reviewer only after a real immutable insertion and audit-chain verification',async()=>{
    const fileId=await unbound(); await retainInsertion(fileId);
    expect(await read(fileId)).toMatchObject({buffer:bytes,integrity:'verified'});
    await expect(harness.pg.query('UPDATE authoring_audit_trail SET after_content=$1 WHERE tenant_id=$2',['forged',org])).rejects.toThrow('IMMUTABILITY_VIOLATION');
    await harness.pg.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND user_id=45",[org]);
    h.readFile.mockClear(); await expect(read(fileId)).rejects.toMatchObject({status:403}); expect(h.readFile).not.toHaveBeenCalled();
  });
  it('a mutable/new reference inserted by another editor never grants access to someone else’s unbound image',async()=>{
    const fileId=await unbound(); await retainInsertion(fileId,43);
    await expect(read(fileId)).rejects.toMatchObject({status:403,code:'ANA_SOURCE_ACCESS_DENIED'}); expect(h.readFile).not.toHaveBeenCalled();
  });
  it('refuses a retained uploader insertion whose chained proof is missing, while the uploader can repair through existing upload',async()=>{
    const fileId=await unbound();
    await harness.pg.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,actor_id,actor_email,operation_type,after_content)
      VALUES($1,$2,$3,'42','author@example.test','update',$4)`,[documentId,sectionId,org,`<img src="/api/authoring/images/${fileId}">`]);
    await expect(read(fileId)).rejects.toMatchObject({status:409,code:'ANA_LEGACY_FIGURE_ASSOCIATION_UNVERIFIED'});
    expect(await read(fileId,42)).toMatchObject({buffer:bytes});
    const repaired=await upload(); expect(repaired.fileId).not.toBe(fileId); expect(repaired.captureStatus).toBe('captured');
    expect(await count('file_uploads')).toBe(2); expect(await read(repaired.fileId)).toMatchObject({buffer:bytes});
  });
  it('refuses tampered chain details, even if the mutable current document would display the image',async()=>{
    const fileId=await unbound(); await retainInsertion(fileId);
    await harness.pg.query("UPDATE audit_logs SET new_values=json_build_object('trailId',new_values->>'trailId','docId',$1::text) WHERE tenant_id=$2",[documentId,org]);
    await expect(read(fileId)).rejects.toMatchObject({status:409,code:'ANA_LEGACY_FIGURE_ASSOCIATION_UNVERIFIED'}); expect(h.readFile).not.toHaveBeenCalled();
  });
  it.each(['sha256_chain','hmac_seal'] as const)('refuses invalid retained %s proof, rather than trusting trail content alone',async column=>{
    const fileId=await unbound(); await retainInsertion(fileId);
    if(column==='sha256_chain') await harness.pg.query("UPDATE audit_logs SET sha256_chain=$1 WHERE tenant_id=$2",['0'.repeat(64),org]);
    else await harness.pg.query('UPDATE audit_logs SET hmac_seal=NULL WHERE tenant_id=$1',[org]);
    await expect(read(fileId)).rejects.toMatchObject({status:409,code:'ANA_LEGACY_FIGURE_ASSOCIATION_UNVERIFIED'});
    expect(h.readFile).not.toHaveBeenCalled();
  });
  it('cannot use a valid legacy insertion to bypass another original historical source parent',async()=>{
    const fileId=await unbound(); await retainInsertion(fileId);
    await expect(assertAnaUploadAccess(db(),{organizationId:org,userId:45,fileIds:[fileId]})).resolves.toBeUndefined();
    await harness.pg.query(`INSERT INTO cre_evidence_sources(organization_id,client_program_id,source_type,provenance,deleted_at)
      VALUES($1,$2,'client_document',$3,now())`,[org,randomUUID(),JSON.stringify({fileUploadId:fileId})]);
    // The other parent's program is in no organization: the gate's 404
    // PROJECT_NOT_FOUND, which the recorded-parent admission (14362ef00)
    // answers as its undisclosing 403.
    await expect(assertAnaUploadAccess(db(),{organizationId:org,userId:45,fileIds:[fileId]})).rejects.toMatchObject({status:403,code:'ANA_SOURCE_ACCESS_DENIED'});
    expect(h.readFile).not.toHaveBeenCalled();
  });
});
