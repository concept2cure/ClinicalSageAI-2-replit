import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: async () => ({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' }) }));
vi.mock('../../c2c/document-alias-map', () => ({ recordDocumentAlias: async () => ({ recorded: true }), canonicalIdFor: async () => null, DocumentAliasConflictError: class extends Error {} }));
vi.mock('../../authoring/authoring-permissions', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-permissions')>(), grantAuthoringPermission: async () => undefined,
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'admin' }));
vi.mock('../../authoring/authoring-evidence', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-evidence')>(),
  writeAuthoringAuditTrail: async () => undefined,
  createRevision: async (q: { query: Function }, args: { sectionId: string; content: string; updatedBy: string; tenantId: number }) => {
    await q.query('INSERT INTO doc_revisions (section_id,content,created_by,tenant_id) VALUES ($1,$2,$3,$4)', [args.sectionId,args.content,args.updatedBy,args.tenantId]);
    return 'revision';
  },
}));
vi.mock('../../part11/signature-persistence', async (original) => ({
  ...await original<typeof import('../../part11/signature-persistence')>(),
  persistGovernedActionSignature: async () => ({ id: 51, signedAt: new Date('2026-10-14T12:00:00Z') }),
}));
import { createControlledQmsDocument, reviseControlledQmsDocument, updateControlledQmsDocument } from '../controlled-document-service';
import { approveQmsDocumentSigned, computeQmsDocumentContentDigest } from '../document-approval-signature';
import { qmsAuthoringWriteRefusal, qmsAuthoringGovernanceRefusal } from '../controlled-document-content';
import type { CreateContext } from '../../authoring/authoring-documents';
import { installQmsProgramAccessHarness } from './qms-authoring-harness';

const PID = '00000000-0000-4000-8000-000000000012';
let db: PGlite;
let ctx: CreateContext;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id int PRIMARY KEY); INSERT INTO organizations VALUES (9),(10);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz); INSERT INTO regulatory_programs VALUES ('${PID}',9,NULL);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY,title text,module text,product_code text,locale text,status text,created_by text,created_at timestamptz,updated_at timestamptz,
      tenant_id int,template_id uuid,client_program_id uuid,approved_at timestamptz,frozen_at timestamptz,locked_at timestamptz,locked_by text);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY,doc_id uuid REFERENCES authoring_documents(id),code text,title text,content text,order_index int,created_at timestamptz,updated_at timestamptz,tenant_id int);
    CREATE TABLE doc_revisions (id serial,section_id uuid,content text,created_by text,tenant_id int);
    CREATE TABLE doc_permissions (tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,
      revoked_at timestamptz,valid_from timestamptz DEFAULT NOW(),valid_until timestamptz);
    CREATE TABLE qms_documents (id serial PRIMARY KEY,organization_id int,doc_number text,title text,doc_type text,category text,version text,status text,
      author_id int,approver_id int,approved_at timestamptz,effective_date date,next_review_date date,artifact_id int,metadata jsonb DEFAULT '{}',updated_at timestamptz,deleted_at timestamptz);
    CREATE UNIQUE INDEX qms_numbers ON qms_documents(organization_id,doc_number);`);
  await installQmsProgramAccessHarness(db,9,3,PID);
  await db.exec(`INSERT INTO users VALUES (7,'active'),(8,'active'); INSERT INTO organization_users VALUES (9,7,'admin'),(9,8,'reviewer');
    INSERT INTO project_members VALUES (9,9,8,'use','active');`);
  await db.exec(await readFile('db/migrations/20261014_qms_controlled_authoring_content.sql','utf8'));
  const pool = { query: (sql: string, args?: unknown[]) => db.query(sql,args), connect: async () => ({ query: (sql: string, args?: unknown[]) => db.query(sql,args), release: () => undefined }) };
  ctx = { pool: pool as unknown as CreateContext['pool'], tenantId: 9, actor: { id: '3', email: null },
    audit: { pool, tenantId: 9, actorId: '3', actorEmail: 'unknown', actorRole: 'author', ipAddress: 'unknown', userAgent: 'test' } };
});
afterAll(async () => { await db?.close(); });

describe('real canonical QMS content and immutable signed revisions', () => {
  it('creates a numbered QMS entry and canonical editable template sections on one transaction', async () => {
    const row = await createControlledQmsDocument(ctx, { title: 'Control documents', docType: 'sop', programId: PID, templateKey: 'sop', reason: 'Create controlled procedure' });
    expect(row.doc_number).toBe('SOP-001');
    const sections = await db.query<{code:string}>('SELECT * FROM authoring_sections WHERE doc_id=$1 ORDER BY order_index',[row.authoring_document_id]);
    expect(sections.rows).toHaveLength(9); expect(sections.rows[0].code).toBe('qms-purpose');
    expect((await db.query('SELECT * FROM doc_revisions')).rows).toHaveLength(9);
    expect(await qmsAuthoringWriteRefusal(ctx.pool,9,row.authoring_document_id)).toBeNull();
    expect(await qmsAuthoringGovernanceRefusal(ctx.pool,9,row.authoring_document_id)).toMatchObject({ code: 'QMS_SIGN_IN_QUALITY' });
    await expect(updateControlledQmsDocument(ctx,row.id,{status:'in_review',reason:'Send for independent review'})).rejects.toMatchObject({code:'QMS_CONTENT_REQUIRED'});
  });

  it('refuses a foreign project and never creates a register entry or editing copy', async () => {
    const before = (await db.query('SELECT * FROM qms_documents')).rows.length;
    await expect(createControlledQmsDocument({...ctx,tenantId:10},{title:'Foreign',docType:'sop',programId:PID,reason:'Attempt cross tenant create'})).rejects.toMatchObject({status:404});
    expect((await db.query('SELECT * FROM qms_documents')).rows).toHaveLength(before);
  });

  it('refuses a same-organization private project to an unshared member, regardless of a claimed admin role', async () => {
    await db.exec(`INSERT INTO users VALUES (4,'active'); INSERT INTO organization_users VALUES (9,4,'member');
      INSERT INTO project_visibility_settings VALUES (9,9,'private');`);
    const before = (await db.query('SELECT * FROM qms_documents')).rows.length;
    await expect(createControlledQmsDocument({...ctx,actor:{id:'4',email:null},audit:{...ctx.audit,actorId:'4',actorRole:'admin'}},
      {title:'Private procedure',docType:'sop',programId:PID,reason:'Create controlled private procedure'})).rejects.toMatchObject({status:403,code:'PROJECT_PERMISSION_DENIED'});
    expect((await db.query('SELECT * FROM qms_documents')).rows).toHaveLength(before);
  });

  it('recovers a legacy registry-only effective document through an explicit authored revision and preserves honest prior history', async () => {
    const previous = (await db.query<any>(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
      VALUES (9,'SOP-LEGACY','Legacy procedure','sop','3.0','effective',22,'{"source":"historic-register"}') RETURNING *`)).rows[0];
    await expect(reviseControlledQmsDocument(ctx,previous.id,'Start a properly authored revision')).rejects.toMatchObject({code:'QMS_LEGACY_REVISION_PROJECT_REQUIRED'});
    const revised = await reviseControlledQmsDocument(ctx,previous.id,'Start a properly authored revision',{programId:PID,templateKey:'sop'});
    expect(revised).toMatchObject({version:'4.0',status:'draft',approved_at:null,approver_id:null});
    const history = (await db.query<any>('SELECT * FROM qms_document_versions WHERE document_id=$1',[previous.id])).rows[0];
    expect(history).toMatchObject({version:'3.0',record_kind:'legacy-registry',authoring_document_id:null,signature_id:null,approved_at:null,sections:[]});
    expect(history.controlled_document).toEqual(previous);
    expect((await db.query<any>('SELECT content FROM authoring_sections WHERE doc_id=$1',[revised.authoring_document_id])).rows).toHaveLength(9);
    expect((await db.query<any>('SELECT content FROM authoring_sections WHERE doc_id=$1',[revised.authoring_document_id])).rows.every(r=>r.content==='')).toBe(true);
    await expect(updateControlledQmsDocument(ctx,revised.id,{status:'in_review',reason:'Refuse the new blank scaffold'})).rejects.toMatchObject({code:'QMS_CONTENT_REQUIRED'});
    await expect(db.query(`UPDATE qms_document_versions SET sections='[]' WHERE id=$1`,[history.id])).rejects.toThrow(/immutable/);
  });

  it('replays the additive migration and leaves unrelated document mutation and deletion functional', async () => {
    await db.exec(await readFile('db/migrations/20261014_qms_controlled_authoring_content.sql','utf8'));
    const unrelated = (await db.query<any>(`INSERT INTO authoring_documents (id,title,tenant_id) VALUES (gen_random_uuid(),'Unrelated',9) RETURNING id`)).rows[0].id;
    await db.query(`UPDATE authoring_documents SET title='Unrelated update' WHERE id=$1`,[unrelated]);
    await db.query('DELETE FROM authoring_documents WHERE id=$1',[unrelated]);
    expect((await db.query('SELECT id FROM authoring_documents WHERE id=$1',[unrelated])).rows).toHaveLength(0);
  });

  it('review locks content; approval binds actual text; revision preserves signed content and creates a new editable copy', async () => {
    const row = (await db.query<any>('SELECT * FROM qms_documents ORDER BY id LIMIT 1')).rows[0];
    await db.query(`UPDATE authoring_sections SET content = '<p>Use verified document numbers.</p>' WHERE doc_id=$1 AND code='qms-purpose'`,[row.authoring_document_id]);
    await updateControlledQmsDocument(ctx,row.id,{status:'in_review',reason:'Saved text ready for review'});
    await expect(db.query(`UPDATE authoring_sections SET content = 'tampered' WHERE doc_id=$1`,[row.authoring_document_id])).rejects.toThrow(/QMS_DOCUMENT_CONTROLLED/);
    await db.exec('BEGIN');
    await expect(approveQmsDocumentSigned({query:(sql,args)=>db.query(sql,args)},
      {orgId:9,userId:8,documentId:row.id,reason:'Project use does not grant document approval',meaning:'APPROVED',effectiveDate:null,authenticationMethod:'password',secondFactorVerified:false,ipAddress:null}))
      .rejects.toMatchObject({status:403,code:'QMS_DOCUMENT_PERMISSION_DENIED'});
    await db.exec('ROLLBACK');
    await db.exec('BEGIN');
    const signed = await approveQmsDocumentSigned({ query: (sql,args) => db.query(sql,args) },{orgId:9,userId:7,documentId:row.id,reason:'Independently reviewed saved text',meaning:'APPROVED',effectiveDate:null,authenticationMethod:'password',secondFactorVerified:false,ipAddress:null});
    await db.exec('COMMIT');
    const saved = (await db.query<any>('SELECT * FROM qms_document_versions WHERE document_id=$1',[row.id])).rows[0];
    expect(saved.sections[0].content).toBe('<p>Use verified document numbers.</p>');
    expect(saved.content_digest).toBe(computeQmsDocumentContentDigest(saved.controlled_document));
    expect(signed.signature.boundPayloadDigest).toBe(saved.content_digest);
    await expect(db.query(`UPDATE qms_document_versions SET sections='[]' WHERE id=$1`,[saved.id])).rejects.toThrow(/immutable/);
    await expect(db.query('DELETE FROM qms_document_versions WHERE id=$1',[saved.id])).rejects.toThrow(/immutable/);
    const revised = await reviseControlledQmsDocument(ctx,row.id,'Update annual review procedure');
    expect(revised.version).toBe('2.0'); expect(revised.authoring_document_id).not.toBe(row.authoring_document_id);
    expect(await qmsAuthoringWriteRefusal(ctx.pool,9,revised.authoring_document_id)).toBeNull();
    await db.query(`UPDATE authoring_sections SET content='New version text' WHERE doc_id=$1 AND code='qms-purpose'`,[revised.authoring_document_id]);
    await expect(db.query(`UPDATE authoring_sections SET content='changed old' WHERE doc_id=$1`,[row.authoring_document_id])).rejects.toThrow(/QMS_DOCUMENT_CONTROLLED/);
    expect((await db.query<any>('SELECT * FROM qms_document_versions WHERE id=$1',[saved.id])).rows[0].sections[0].content).toBe('<p>Use verified document numbers.</p>');
  });
});
