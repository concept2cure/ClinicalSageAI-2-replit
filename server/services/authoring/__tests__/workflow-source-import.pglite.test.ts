/** Actual PostgreSQL source composition/access; no mocked workflow or renderer. */
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../db', () => ({pool:{query:async () => ({rows:[]})},getPool:()=>({query:async () => ({rows:[]})}),db:{}}));
vi.mock('../../../lib/unified-ai-client', () => ({ai:null}));
import { materializeWorkflowSource, WorkflowSourceImportError, type WorkflowMaterializationInput } from '../workflow-source-import';
import { getProtocolExport } from '../../protocol-export/protocol-export-service';

const PROGRAM='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const hash=(content:string)=>createHash('sha256').update(content).digest('hex');
let database:PGlite;
const queries:string[]=[];
const q={query:async(text:string,params?:unknown[])=>{queries.push(text);return database.query<Record<string,unknown>>(text,params);}};
const input=(source:WorkflowMaterializationInput['source'],over:Partial<WorkflowMaterializationInput>={}):WorkflowMaterializationInput=>({organizationId:7,userId:5,target:{programId:PROGRAM,projectId:11},source,...over});

beforeAll(async()=>{
  database=new PGlite();
  await database.exec(`
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(user_id int,organization_id int,role text);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,owner_id int,created_by_id int,settings json,regulatory_program_id uuid,client_workspace_id int);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE cdisc_prm_studies(study_id text,tenant_id int,program_id uuid);
    CREATE TABLE protocol_documents(id int PRIMARY KEY,organization_id int,deleted_at timestamptz,study_design_id text,title text,protocol_number text,protocol_kind text,design_type text,phase text,version text,synopsis text,status text);
    CREATE TABLE protocol_sections(id int PRIMARY KEY,organization_id int,protocol_document_id int,deleted_at timestamptz,section_key text,title text,content text,required boolean,status text,order_index int);
    CREATE TABLE protocol_objectives(id int PRIMARY KEY,organization_id int,protocol_document_id int,deleted_at timestamptz,objective_type text,objective text,endpoint text,timepoint text,order_index int);
    CREATE TABLE protocol_eligibility_criteria(id int PRIMARY KEY,organization_id int,protocol_document_id int,deleted_at timestamptz,kind text,criterion text,order_index int);
    CREATE TABLE protocol_schedule_visits(id int PRIMARY KEY,organization_id int,protocol_document_id int,deleted_at timestamptz,visit_name text,timepoint text,procedures text[],order_index int);
    CREATE TABLE protocol_soa_assessments(id int PRIMARY KEY,organization_id int,protocol_document_id int,deleted_at timestamptz,name text,category text,order_index int);
    CREATE TABLE protocol_soa_cells(id int PRIMARY KEY,organization_id int,protocol_document_id int,assessment_id int,visit_id int,required boolean,notes text);
    CREATE TABLE electronic_signatures(id int,organization_id int,signed_target text,signer_name text,signed_at timestamptz,signature_meaning text,signature_purpose text,is_valid boolean,superseded_by int,verification_status text,signature_manifest jsonb,signature_type text);
    CREATE TABLE csr_build_jobs(id int PRIMARY KEY,organization_id int,project_id int,study_id text,status text,sections_to_generate text[],study_info_snapshot jsonb);
    CREATE TABLE csr_section_outputs(id int PRIMARY KEY,organization_id int,project_id int,job_id int,section_number text,content text,content_hash text,ai_generated boolean,model text,lineage jsonb,generated_at timestamptz);
    CREATE TABLE document_span_lineage(organization_id int,document_table text,document_id text,char_start int,char_end int,span_text_sha256 text,provenance_kind text,machine_author_id text,asserted_by text,asserted_at timestamptz,signature_id text,created_by text,deleted_at timestamptz,usage text NOT NULL DEFAULT 'derived',confidence numeric);
  `);
});
afterAll(async()=>{await database?.close();});
beforeEach(async()=>{
  await database.exec(`
    TRUNCATE users,organizations,organization_users,projects,project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments,cdisc_prm_studies,protocol_documents,protocol_sections,protocol_objectives,protocol_eligibility_criteria,protocol_schedule_visits,protocol_soa_assessments,protocol_soa_cells,electronic_signatures,csr_build_jobs,csr_section_outputs,document_span_lineage;
    INSERT INTO users VALUES(5,'active'),(20,'active');
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO organization_users VALUES(5,7,'member'),(20,7,'member');
    INSERT INTO projects VALUES(11,7,5,5,'{}','${PROGRAM}',NULL),(12,7,30,30,'{}','${OTHER}',NULL),(81,8,5,5,'{}',NULL,NULL);
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(81,8,'private');
    INSERT INTO cdisc_prm_studies VALUES('study-1',7,'${PROGRAM}');
    INSERT INTO protocol_documents VALUES(1,7,NULL,'study-1','Recorded phase2 protocol','P-001','clinical','interventional','Phase2','2.1','Actual stored synopsis','finalized'),(2,7,NULL,NULL,'Unbound protocol',NULL,'clinical',NULL,NULL,'0.1',NULL,'draft'),(8,8,NULL,NULL,'Foreign protocol',NULL,'clinical',NULL,NULL,'0.1','Foreign synopsis','draft');
    INSERT INTO protocol_sections VALUES(101,7,1,NULL,'background','Actual background title','Scientific source content',true,'complete',1),(102,7,1,NULL,'statistics','Actual statistics','Planned analysis',true,'draft',2),(801,8,1,NULL,'foreign','Foreign row','Foreign section content',true,'complete',0);
    INSERT INTO protocol_objectives VALUES(201,7,1,NULL,'primary','Assess response','Response endpoint','Week24',0);
    INSERT INTO protocol_eligibility_criteria VALUES(301,7,1,NULL,'inclusion','Age >= 18',0),(302,7,1,NULL,'exclusion','Prior therapy',1);
    INSERT INTO protocol_schedule_visits VALUES(401,7,1,NULL,'Screening','Day-14',ARRAY['Consent'],0),(402,7,1,NULL,'Followup','Week24',ARRAY['Review'],1);
    INSERT INTO protocol_soa_assessments VALUES(501,7,1,NULL,'Blood panel','lab',0),(502,7,1,NULL,'Eligibility check','eligibility',1);
    INSERT INTO protocol_soa_cells VALUES(601,7,1,501,401,true,'Fasting'),(602,7,1,501,402,false,'If clinically indicated'),(603,7,1,502,401,true,NULL);
    INSERT INTO electronic_signatures VALUES(1,7,'protocol-document:1','Source Signer','2026-10-01T12:00:00Z','approval','Original source approval',true,NULL,'valid','{}','protocol_finalization');
    INSERT INTO csr_build_jobs VALUES(1,7,11,'study-1','complete',ARRAY['13'],'{"studyInfo":{"title":"Recorded CSR study"}}'),(2,7,NULL,'legacy-study','failed',ARRAY['13','14'],'{}'),(8,8,81,'foreign-study','complete',ARRAY['13'],'{}');
  `);
  await database.query(`INSERT INTO csr_section_outputs VALUES(701,7,11,1,'13',$1,$2,true,NULL,NULL,'2026-10-01T12:00:00Z'),(702,7,NULL,2,'13',$3,$4,false,NULL,NULL,'2026-10-01T12:00:00Z')`,['Exact saved CSR prose',hash('Exact saved CSR prose'),'Partial [DATA TO BE INSERTED]',hash('Partial [DATA TO BE INSERTED]')]);
  queries.length=0;
});

describe('stored protocol materialization',()=>{
  it('preserves the full canonical structured protocol and actual matrix cells without source signing prose',async()=>{
    const result=await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q);
    expect(result.origin).toMatchObject({kind:'protocol',id:'1',version:'2.1',conversion:'protocol-structure',sourceScope:{level:'program',programId:PROGRAM,projectId:11},association:{mode:'recorded',reason:null}});
    const all=result.sections.map(s=>s.content).join('\n');
    for(const text of ['Actual stored synopsis','Assess response','Response endpoint','Week24','Age >= 18','Prior therapy','Screening','Blood panel','Required: Fasting','Optional: If clinically indicated','Not scheduled','Scientific source content','Planned analysis']) expect(all).toContain(text);
    expect(result.sections.find(s=>s.code==='background')).toEqual({code:'background',title:'Actual background title',content:'Scientific source content'});
    expect(all).not.toMatch(/Source Signer|Original source approval|Electronic signature|Foreign section/);
    expect(queries.some(text=>text.includes('electronic_signatures'))).toBe(false);
    expect(result.origin.sectionOrigins.every(s=>s.originalAuthorship==='unknown'&&s.model===null)).toBe(true);
    expect(result.origin.sectionOrigins.find(s=>s.code==='background')).toMatchObject({sourceRowId:'protocol_sections:101',contentSha256:hash('Scientific source content')});
  });
  it('holds an unverified controlled export while caller-executor content-only export excludes signature authority',async()=>{
    await expect(getProtocolExport(7,1,{executor:q})).rejects.toMatchObject({code:'SIGNATURE_UNREADABLE'});
    const copy=await getProtocolExport(7,1,{executor:q,contentOnly:true});
    expect(copy.markdown).toContain('Optional: If clinically indicated');
    expect(copy.markdown).not.toContain('Electronic signature');
    expect(copy.markdown).not.toContain('Source Signer');
  });
  it('discloses missing actual source data and explicit unbound association without inventing authorship',async()=>{
    const preview=await materializeWorkflowSource(input({kind:'protocol',documentId:2}),q);
    const create=await materializeWorkflowSource(input({kind:'protocol',documentId:2},{associationReason:'Recorded clinical programme decision'}),q);
    expect(preview.association).toMatchObject({mode:'explicit',required:true,reasonRequired:true});
    expect(preview.origin.sourceScope).toEqual({level:'organization',programId:null,projectId:null});
    expect(preview.gaps).toContain('The saved protocol has no synopsis.');
    expect(create.fingerprint).toBe(preview.fingerprint);
    expect(create.origin.association.reason).toBe('Recorded clinical programme decision');
    expect(create.origin.sectionOrigins.every(s=>s.originalAuthorship==='unknown')).toBe(true);
  });
  it('changes the fingerprint when composed SoA source facts or original scope change',async()=>{
    const before=await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q);
    await database.exec("UPDATE protocol_soa_cells SET required=true,notes='Changed actual cell' WHERE id=602");
    const after=await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await database.exec('UPDATE protocol_documents SET study_design_id=NULL WHERE id=1');
    expect((await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q)).fingerprint).not.toBe(after.fingerprint);
  });
  it('denies an unassigned private-source actor before any source prose read, and permits a current project member',async()=>{
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1},{userId:20}),q)).rejects.toMatchObject({status:403,code:'WORKFLOW_SOURCE_ACCESS_DENIED'});
    expect(queries.some(text=>/SELECT id, title|SELECT id, section_key/.test(text))).toBe(false);
    await database.exec("INSERT INTO project_members VALUES(11,7,20,'use','active')");
    expect((await materializeWorkflowSource(input({kind:'protocol',documentId:1},{userId:20}),q)).sections.length).toBeGreaterThan(0);
    await database.exec("UPDATE project_members SET status='revoked'");
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1},{userId:20}),q)).rejects.toBeInstanceOf(WorkflowSourceImportError);
  });
  it('refuses foreign tenant sources, mismatched recorded programs and missing recorded design relationships',async()=>{
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:8}),q)).rejects.toMatchObject({status:404});
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1},{target:{programId:OTHER,projectId:12}}),q)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_SCOPE_MISMATCH'});
    await database.exec("DELETE FROM cdisc_prm_studies WHERE study_id='study-1'");
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1}),q)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_SCOPE_UNAVAILABLE'});
  });
  it('refuses a cross-protocol assessment cell rather than silently dropping it from composition',async()=>{
    await database.exec('UPDATE protocol_soa_cells SET assessment_id=999 WHERE id=602');
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1}),q)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_INVALID'});
  });
  it('retains positive current protocol machine-span proof, including accepted drafts, without inventing model qualification',async()=>{
    await database.query(`INSERT INTO document_span_lineage VALUES(7,'protocol_sections','101',0,$1,$2,'accepted_machine_draft','ana','5','2026-10-02T00:00:00Z',NULL,'5',NULL)`,['Scientific source content'.length,hash('Scientific source content')]);
    await database.query(`INSERT INTO document_span_lineage VALUES(7,'protocol_documents','1',0,$1,$2,'machine_draft','ana',NULL,NULL,NULL,'5',NULL)`,['Actual stored synopsis'.length,hash('Actual stored synopsis')]);
    const result=await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q);
    expect(result.origin.sectionOrigins.find(s=>s.code==='background')).toMatchObject({originalAuthorship:'machine',model:null,modelEvidence:'unrecorded'});
    expect(result.origin.sectionOrigins.find(s=>s.code==='protocol.synopsis')?.originalAuthorship).toBe('machine');
    expect(result.origin.sectionOrigins.find(s=>s.code==='protocol.header')?.originalAuthorship).toBe('unknown');
    await database.exec("UPDATE protocol_sections SET content='Changed content with stale machine proof' WHERE id=101");
    await expect(materializeWorkflowSource(input({kind:'protocol',documentId:1}),q)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_LINEAGE_UNVERIFIED'});
  });
  it('does not mistake deterministic copy lineage for proof of original AI generation',async()=>{
    await database.query(`INSERT INTO document_span_lineage VALUES(7,'protocol_sections','101',0,$1,$2,'machine_draft','workflow_import',NULL,NULL,NULL,'5',NULL)`,['Scientific source content'.length,hash('Scientific source content')]);
    const result=await materializeWorkflowSource(input({kind:'protocol',documentId:1}),q);
    expect(result.origin.sectionOrigins.find(s=>s.code==='background')).toMatchObject({originalAuthorship:'unknown',model:null});
  });
});

describe('stored CSR materialization',()=>{
  it('uses exact persisted ICH code/content/hash and retains null model as unknown qualification',async()=>{
    const result=await materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['13']}),q);
    expect(result.sections).toEqual([{code:'13',title:'Discussion and Overall Conclusions',content:'Exact saved CSR prose'}]);
    expect(result.origin.sectionOrigins).toEqual([{code:'13',sourceRowId:'csr_section_outputs:701',contentSha256:hash('Exact saved CSR prose'),originalAuthorship:'machine',model:null,modelEvidence:'unrecorded'}]);
    expect(result.origin.selection).toEqual({kind:'csr',jobId:1,sectionNumbers:['13']});
    expect(result.origin.sourceScope).toEqual({level:'project',programId:null,projectId:11});
    expect(result.origin.version).toBeNull();
  });
  it('preserves partial gaps and organization source scope with explicit association, rather than completing missing output',async()=>{
    const result=await materializeWorkflowSource(input({kind:'csr',jobId:2}),q);
    expect(result.origin.sourceScope.level).toBe('organization');
    expect(result.association.required).toBe(true);
    expect(result.gaps).toContain('The saved CSR job is failed; available output is a partial draft.');
    expect(result.gaps).toContain('CSR section 14 has no saved output in this selection.');
    expect(result.gaps.some(g=>g.includes('placeholder'))).toBe(true);
    expect(result.origin.sectionOrigins[0].originalAuthorship).toBe('unknown');
  });
  it('expands a selected actual parent only into available persisted descendant codes, retaining missing gaps',async()=>{
    await database.query("INSERT INTO csr_section_outputs VALUES(703,7,11,1,'11.1',$1,$2,true,NULL,NULL,'2026-10-02T00:00:00Z')",['Saved descendant',hash('Saved descendant')]);
    const result=await materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['11']}),q);
    expect(result.sections.map(s=>s.code)).toEqual(['11.1']);
    expect(result.gaps).toContain('CSR section 11 has no saved output in this selection.');
    expect(result.origin.selection).toEqual({kind:'csr',jobId:1,sectionNumbers:['11']});
  });
  it('refuses missing selected output and a changed or forged recorded hash',async()=>{
    await expect(materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['14']}),q)).rejects.toMatchObject({code:'WORKFLOW_CSR_OUTPUT_MISSING'});
    await database.exec("UPDATE csr_section_outputs SET content='Changed without matching retained hash' WHERE id=701");
    await expect(materializeWorkflowSource(input({kind:'csr',jobId:1}),q)).rejects.toMatchObject({code:'WORKFLOW_CSR_HASH_MISMATCH'});
  });
  it('changes selected fingerprints on truthful content/provenance changes while unrelated output leaves a selected copy stable',async()=>{
    const before=await materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['13']}),q);
    await database.query("INSERT INTO csr_section_outputs VALUES(704,7,11,1,'14',$1,$2,false,NULL,NULL,'2026-10-02T00:00:00Z')",['Unselected output',hash('Unselected output')]);
    expect((await materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['13']}),q)).fingerprint).toBe(before.fingerprint);
    await database.query('UPDATE csr_section_outputs SET content=$1,content_hash=$2,model=$3 WHERE id=701',['New actual content',hash('New actual content'),'Recorded model name']);
    const changed=await materializeWorkflowSource(input({kind:'csr',jobId:1,sectionNumbers:['13']}),q);
    expect(changed.fingerprint).not.toBe(before.fingerprint);
    expect(changed.origin.sectionOrigins[0]).toMatchObject({model:'Recorded model name',modelEvidence:'recorded-name-only'});
  });
  it('enforces fresh actor access and source-job/output project identity before reading CSR prose',async()=>{
    await expect(materializeWorkflowSource(input({kind:'csr',jobId:1},{userId:20}),q)).rejects.toMatchObject({status:403});
    expect(queries.some(text=>/SELECT id, section_number, content/.test(text))).toBe(false);
    await database.exec('UPDATE csr_section_outputs SET project_id=12 WHERE id=701');
    queries.length=0;
    await expect(materializeWorkflowSource(input({kind:'csr',jobId:1}),q)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_SCOPE_MISMATCH'});
    expect(queries.some(text=>/SELECT id, section_number, content/.test(text))).toBe(false);
  });
  it('does not mutate any original source during materialization and rejects inactive actors',async()=>{
    await materializeWorkflowSource(input({kind:'csr',jobId:1}),q);
    expect(queries.some(text=>/^\s*(INSERT|UPDATE|DELETE|LOCK)/i.test(text))).toBe(false);
    await database.exec("UPDATE users SET status='disabled' WHERE id=5");
    await expect(materializeWorkflowSource(input({kind:'csr',jobId:1}),q)).rejects.toMatchObject({status:403});
  });
});
