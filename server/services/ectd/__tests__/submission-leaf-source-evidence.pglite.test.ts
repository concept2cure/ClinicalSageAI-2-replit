import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import type { SubmissionLeaf } from '../../../../shared/types/database';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
const h=vi.hoisted(()=>({bytes:Buffer.from('Verified retained instruction: preserve the original record and document every correction.'),gets:0}));
vi.mock('../../../db',()=>({db:{},pool:{query:()=>{throw new Error('Global DB forbidden');}}}));
vi.mock('../../auditService',()=>({default:{logAction:vi.fn()},writeChainedAuditRow:vi.fn()}));
vi.mock('../../storage',()=>({getStorageProviderFor:()=>({get:async()=>{h.gets++;return {bytes:Buffer.from(h.bytes)};}})}));
import {readSubmissionLeafSourceEvidence,requireSubmissionLeafSourceEvidenceStillCurrent} from '../submission-leaf-source-evidence';
import {assembleAuthoredSections} from '../../ana/authoring-canonical-bridge';

let pg:PGlite;const statements:string[]=[];
const q={query:async(sql:string,params?:unknown[])=>{statements.push(sql);return pg.query<Record<string,unknown>>(sql,params);}};
const P='11111111-1111-4111-8111-111111111111';const S='22222222-2222-4222-8222-222222222222';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const V='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const body='A recorded controlled procedure with substantive retained scientific evidence and exact words.';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
function leaf(overrides:Partial<SubmissionLeaf>={}):SubmissionLeaf{return {id:1,sequenceId:2,sectionCode:'filing-location',title:'Placed device description',documentType:'device_description',lifecycleOp:'new',documentTable:'c2c_document_sections',documentId:101,documentContentSha256:hash(body),organizationId:7,createdBy:5,...overrides};}
const read=(leaves=[leaf()],client=q,userId=5)=>readSubmissionLeafSourceEvidence(client,{organizationId:7,userId,programId:P,projectId:11,submissionId:1,sequenceId:2,leaves});
beforeAll(async()=>{
  pg=new PGlite();await pg.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY,status text,settings jsonb NOT NULL DEFAULT '{}');CREATE TABLE users(id int PRIMARY KEY,status text,email text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,status text,client_workspace_id int,owner_id int,created_by_id int,settings jsonb);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,reviewer_id int,organization_id int,status text);
    CREATE TABLE c2c_documents(id text PRIMARY KEY,org_id int,project_id uuid,status text,title text);
    CREATE TABLE c2c_document_sections(id bigint PRIMARY KEY,document_id text,section_key text,content jsonb,status text);
    CREATE TABLE c2c_document_aliases(organization_id int,canonical_id uuid,store text,native_id text);
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int,client_program_id uuid,status text,created_by text);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,tenant_id int,code text);
    CREATE TABLE doc_permissions(tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
    CREATE TABLE coauthor_documents(id int PRIMARY KEY,organization_id int,content text,status text,metadata jsonb,title text);
    CREATE TABLE frozen_documents(id serial PRIMARY KEY,document_id uuid,tenant_id int,version text,frozen_content text,content_hash text,frozen_at timestamptz DEFAULT now());
    CREATE SCHEMA vault;
    CREATE TABLE IF NOT EXISTS company_legal_registry(organization_id integer NOT NULL,id text NOT NULL,document jsonb NOT NULL,PRIMARY KEY(organization_id,id));CREATE TABLE vault.documents(id uuid PRIMARY KEY,organization_id int,program_id uuid,deleted_at timestamptz,supersedes_id uuid,document_code text,storage_version_id text,storage_provider text,content_hash text,mime_type text,document_title text,file_name text);
    CREATE TABLE document_data_dispositions(id int,organization_id int,program_id uuid,vault_document_id uuid,source_sha256 text,linked_ids jsonb);
    CREATE TABLE canonical_documents(canonical_id uuid,organization_id int,source_refs jsonb,stage text,content_hash text,created_at timestamptz);
    INSERT INTO organizations(id,status) VALUES(7,'active');INSERT INTO users VALUES(5,'active','owner@example.invalid'),(20,'active','reader@example.invalid');
    INSERT INTO regulatory_programs VALUES('${P}',7,NULL),('${S}',7,NULL);
    INSERT INTO projects VALUES(11,7,'${P}','active',NULL,5,5,'{}'),(12,7,'${S}','active',NULL,5,5,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private');
  `);
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
});
beforeEach(async()=>{
  statements.length=0;h.gets=0;h.bytes=Buffer.from('Verified retained instruction: preserve the original record and document every correction.');
  await pg.exec(`TRUNCATE c2c_documents,c2c_document_sections,c2c_document_aliases,authoring_documents,authoring_sections,doc_permissions,coauthor_documents,frozen_documents,vault.documents,canonical_documents,document_data_dispositions;
    UPDATE users SET status='active';TRUNCATE organization_users;INSERT INTO organization_users VALUES(7,5,'member'),(7,20,'member');
    UPDATE organizations SET settings='{}'; DELETE FROM company_legal_registry;
    INSERT INTO c2c_documents VALUES('doc-a',7,'${P}','approved','Actual source title'),('doc-b',7,'${S}','approved','Sibling title');`);
  await pg.query('INSERT INTO c2c_document_sections VALUES(101,$1,$2,$3,$4)',['doc-a','actual-source-key',JSON.stringify({text:body}),'approved']);
});
afterAll(async()=>{await pg?.close();});
describe('actual request-q retained-source evidence and late admission',()=>{
  it('keeps a registered Vault original outside the admitted destination undetermined and refuses an observed scope change after admission',async()=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type) VALUES($1,7,$2,$3,$4,$5,$6)',[V,P,'retained-v1','local',hash(h.bytes),'text/plain']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    const document={id:V,title:'Company authorization',kind:'authorization',programId:P,vaultDocumentId:V,contentHash:hash(h.bytes),version:'1',agencies:['FDA'],countries:['US'],submissionTypes:['IND'],language:'en',effectiveOn:null,expiresOn:null,active:true,registeredAt:'2026-10-01T00:00:00Z',registeredBy:'5'};
    const input={organizationId:7,userId:5,programId:P,projectId:11,submissionId:1,sequenceId:2,sequenceRegion:'fda',applicationType:'IND',
      leaves:[leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)})]};
    const save=(value:typeof document)=>pg.query('INSERT INTO company_legal_registry(organization_id,id,document) VALUES(7,$1,$2::jsonb) ON CONFLICT(organization_id,id) DO UPDATE SET document=excluded.document',[value.id,JSON.stringify(value)]);
    await save(document);
    const matching=await readSubmissionLeafSourceEvidence(q,input);
    expect(matching.leaves[0].contentEvidence).toMatchObject({content:'substantive',lifecycle:'finalized'});
    await save({...document,agencies:['EMA'],countries:['EU']});
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,matching.admission)).rejects.toMatchObject({status:503,code:'SUBMISSION_SOURCE_READ_CHANGED'});
    const blocked=await readSubmissionLeafSourceEvidence(q,input);
    expect(blocked.leaves[0].contentEvidence).toMatchObject({content:'undetermined',lifecycle:'unverified'});
    expect((await pg.query('SELECT stage FROM canonical_documents WHERE canonical_id=$1',[A])).rows[0]).toEqual({stage:'approved'});
  });

  it('verifies the canonical section body pin and carries its actual source key, never the filing code',async()=>{
    const result=await read();expect(result.leaves[0].contentEvidence).toMatchObject({content:'substantive',pin:'match',lifecycle:'finalized'});
    expect(result.leaves[0].sourceRef).toMatchObject({section:{id:'101',code:'actual-source-key'},editor:null});
    await requireSubmissionLeafSourceEvidenceStillCurrent(q,result.admission);
  });
  it.each(['drafted','review'])('a %s source with long pinned words is not finalized content',async status=>{
    await pg.query('UPDATE c2c_document_sections SET status=$1 WHERE id=101',[status]);
    expect((await read()).leaves[0].contentEvidence).toMatchObject({content:'non-substantive',pin:'match',lifecycle:'draft'});
  });
  it('an empty structured outline stays undetermined rather than becoming content from its title',async()=>{
    await pg.exec("UPDATE c2c_document_sections SET content='{}'");expect((await read()).leaves[0].contentEvidence?.content).toBe('undetermined');
  });
  it('a retained placeholder with its own valid pin is known non-substantive',async()=>{
    await pg.query('UPDATE c2c_document_sections SET content=$1',[JSON.stringify({text:'TBD'})]);
    const result=await read([leaf({documentContentSha256:hash('TBD')})]);
    expect(result.leaves[0].contentEvidence?.content).toBe('non-substantive');
    expect(result.sourceDocuments[0].notTransmittable).toBe('The retained source is empty, a placeholder, or still a draft.');
  });
  it('applies each placement pin independently for two leaves naming the same source',async()=>{
    const result=await read([leaf(),leaf({id:2,documentContentSha256:'a'.repeat(64)})]);
    expect(result.leaves.map(l=>l.contentEvidence?.pin)).toEqual(['match','mismatch']);
    expect(result.sourceDocuments[1].status).toBe('content_changed');
  });
  it('an accessible sibling cannot authorize its body for this submission',async()=>{
    await pg.exec("UPDATE c2c_document_sections SET document_id='doc-b'");statements.length=0;
    await expect(read()).rejects.toMatchObject({status:404,code:'SUBMISSION_SOURCE_SCOPE_MISMATCH'});
    expect(statements.some(s=>s.includes('SELECT s.id::text AS id,s.section_key,s.content'))).toBe(false);
  });
  it('an unassigned private actor is refused before source parent or body reads',async()=>{
    statements.length=0;await expect(read([leaf()],q,20)).rejects.toMatchObject({status:403});
    expect(statements.some(s=>s.includes('c2c_document_sections'))).toBe(false);
  });
  it('a failed body query is unavailable, never a success with missing sources',async()=>{
    const failing={query:async(sql:string,params?:unknown[])=>{if(sql.includes('SELECT s.id::text AS id,s.section_key,s.content'))throw new Error('private diagnostic');return q.query(sql,params);}};
    await expect(read([leaf()],failing)).rejects.toMatchObject({status:503,code:'SUBMISSION_SOURCE_VERIFICATION_UNAVAILABLE'});
  });
  it('late body alteration and actor revocation refuse already assembled evidence',async()=>{
    const first=await read();await pg.query('UPDATE c2c_document_sections SET content=$1',[JSON.stringify({text:body+'changed'})]);
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,first.admission)).rejects.toMatchObject({status:503});
    const second=await read();await pg.exec("UPDATE users SET status='inactive' WHERE id=5");
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,second.admission)).rejects.toMatchObject({status:503});
  });
  it.each(['unified_documents','rendered_leaf_files'])('an unbound %s source never causes a body read or a resolved claim',async table=>{
    statements.length=0;const result=await read([leaf({documentTable:table})]);
    expect(result.leaves[0].contentEvidence?.reasonCode).toBe('SOURCE_PARENT_UNVERIFIED');
    expect(result.sourceDocuments[0].status).toBe('undetermined');expect(statements.some(s=>s.includes('FROM '+table))).toBe(false);
  });
  it('a source executor or reconstructed admission cannot substitute for the actual request',async()=>{
    const result=await read();await expect(requireSubmissionLeafSourceEvidenceStillCurrent({query:q.query},result.admission)).rejects.toMatchObject({status:503});
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,{kind:'request-owned-submission-source-admission'})).rejects.toMatchObject({status:503});
  });
});
describe('retained sealed-copy and Vault source boundaries',()=>{
  it('retained copy proof reads its exact historical seal, not a changed current draft',async()=>{
    const sections=[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',code:'actual-code',title:'Actual source',content:body,order_index:0}];
    const frozen=JSON.stringify({document:{title:'Actual source document'},sections});const copy=assembleAuthoredSections(sections);
    await pg.query('INSERT INTO authoring_documents VALUES($1,7,$2,$3,$4)',[A,P,'DRAFT','5']);
    await pg.query('INSERT INTO authoring_sections VALUES($1,$2,7,$3)',[sections[0].id,A,'actual-code']);
    await pg.query('INSERT INTO c2c_document_aliases VALUES(7,$1,$2,$3)',[A,'coauthor_documents','201']);
    await pg.query("INSERT INTO doc_permissions VALUES(7,$1,NULL,'5','owner@example.invalid','VIEWER',NULL,now()-interval '1 day',NULL)",[A]);
    await pg.query('INSERT INTO coauthor_documents VALUES(201,7,$1,$2,$3)',[copy,'approved',JSON.stringify({docId:A,sealVersion:'version-1',sealContentHash:hash(frozen)})]);
    await pg.query('INSERT INTO frozen_documents(document_id,tenant_id,version,frozen_content,content_hash) VALUES($1,7,$2,$3,$4)',[A,'version-1',frozen,hash(frozen)]);
    const result=await read([leaf({documentTable:'coauthor_documents',documentId:201,documentContentSha256:hash(copy)})]);
    expect(result.leaves[0].contentEvidence?.content).toBe('substantive');
    expect(result.leaves[0].sourceRef?.editor).toMatchObject({documentId:A,sectionCode:'actual-code'});
  });
  it('a moved Vault parent refuses before a second provider fetch',async()=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type) VALUES($1,7,$2,$3,$4,$5,$6)',[V,P,'retained-v1','local',hash(h.bytes),'text/plain']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    const result=await read([leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)})]);
    expect(result.leaves[0].contentEvidence?.content).toBe('substantive');expect(h.gets).toBe(1);
    await pg.query('UPDATE vault.documents SET program_id=$1 WHERE id=$2',[S,V]);
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,result.admission)).rejects.toMatchObject({status:503});expect(h.gets).toBe(1);
  });
  it.each([
    {organizationId:null,status:409,code:'VAULT_TENANT_RECONCILIATION_REQUIRED'},
    {organizationId:8,status:404,code:'SUBMISSION_SOURCE_SCOPE_MISMATCH'},
  ])('refuses Vault organization $organizationId before reading labels or retained bytes',async ({organizationId,status,code})=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type,document_title) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [V,organizationId,P,'retained-v1','local',hash(h.bytes),'text/plain','Unverified tenant source label']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    statements.length=0;
    await expect(read([leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)})])).rejects.toMatchObject({status,code});
    expect(h.gets).toBe(0);
    expect(statements.some(sql=>sql.includes('SELECT COALESCE(d.document_title,d.file_name)'))).toBe(false);
  });
  it('a transfer to a different still-accessible unique project anchor refuses before repeated bytes',async()=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type) VALUES($1,7,$2,$3,$4,$5,$6)',[V,P,'retained-v1','local',hash(h.bytes),'text/plain']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    const result=await read([leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)})]);
    expect(result.leaves[0].contentEvidence?.content).toBe('substantive');expect(h.gets).toBe(1);
    await pg.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=11');
    await pg.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=12',[P]);
    try {
      await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,result.admission)).rejects.toMatchObject({status:503,code:'SUBMISSION_SOURCE_READ_CHANGED'});
      expect(h.gets).toBe(1);
      expect((await pg.query('SELECT id FROM projects WHERE regulatory_program_id=$1',[P])).rows).toEqual([{id:12}]);
    }finally {
      await pg.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=12',[S]);
      await pg.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=11',[P]);
    }
  });
  it('duplicate Vault pointers fetch bytes once while each retained placement keeps its own pin verdict',async()=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type) VALUES($1,7,$2,$3,$4,$5,$6)',[V,P,'retained-v1','local',hash(h.bytes),'text/plain']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    const pointer=leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)});
    statements.length=0;
    const result=await read([pointer,{...pointer,id:2,documentContentSha256:'a'.repeat(64)}]);
    expect(result.leaves.map(l=>l.contentEvidence?.pin)).toEqual(['match','mismatch']);
    expect(result.leaves.map(l=>l.sourceRef?.leafId)).toEqual([1,2]);expect(h.gets).toBe(1);
    expect(statements.filter(sql=>sql.includes('SELECT COALESCE(d.document_title,d.file_name)')).length).toBe(1);
    await requireSubmissionLeafSourceEvidenceStillCurrent(q,result.admission);expect(h.gets).toBe(2);
  });
  it('a retained provider mutation during the read refuses its old matching byte proof',async()=>{
    await pg.query('INSERT INTO vault.documents(id,organization_id,program_id,storage_version_id,storage_provider,content_hash,mime_type) VALUES($1,7,$2,$3,$4,$5,$6)',[V,P,'retained-v1','local',hash(h.bytes),'text/plain']);
    await pg.query('INSERT INTO canonical_documents VALUES($1,7,$2,$3,$4,now())',[A,JSON.stringify({vault_documents:{nativeId:V}}),'approved',hash(h.bytes)]);
    const result=await read([leaf({documentTable:'vault_documents',documentId:null,documentUuid:V,documentContentSha256:hash(h.bytes)})]);
    h.bytes=Buffer.from('Changed retained provider bytes after initial admission.');
    await expect(requireSubmissionLeafSourceEvidenceStillCurrent(q,result.admission)).rejects.toMatchObject({status:503,code:'SUBMISSION_SOURCE_READ_CHANGED'});
  });
});
