/** Mounted /official with real current access/lifecycle/disposition SQL.
 * Producer, verified-byte reader and persistence are explicit seams; template
 * inventory/slot parsing use the actual vendored FDA files. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../services/document-data-disposition/__tests__/disposition-fixture';
import type { EstarAttachmentRequest, EstarAttachmentResolver } from '../../services/pathway-engines/estar/estar-attachment-plan';

const h=vi.hoisted(()=>({pool:null as unknown,org:0,program:'',project:0,actor:42 as number|null,
  fill:vi.fn(),retain:vi.fn(),consequence:vi.fn(),read:vi.fn(),templates:vi.fn(),
  afterResolve:null as null|(()=>Promise<void>),afterRetain:null as null|(()=>Promise<void>)}));
vi.mock('../../db',()=>({db:{},get pool(){return h.pool;}}));
vi.mock('../../db/requestDb',async original=>({...await original<object>(),requestDb:()=>({
  select:()=>({from:()=>({where:()=>({limit:async()=>[{id:h.program,name:'Attachment fixture'}]})})}),
})}));
vi.mock('../../services/c2c/program-project-anchor',async original=>({...await original<object>(),resolveProgramProjectAnchor:async()=>h.project}));
vi.mock('../../auth',()=>({authMiddleware:(req:express.Request,_res:express.Response,next:express.NextFunction)=>{
  Object.assign(req,{user:{id:h.actor,organizationId:h.org,role:'manager'},dbClient:h.pool});next();
}}));
vi.mock('../../export/renderers',()=>({renderPdfBuffersFor510k:vi.fn()}));
vi.mock('../c2c/project-vault',()=>({readVerifiedVaultBytes:h.read}));
vi.mock('../../services/pathway-engines/estar/estar-fill',()=>({fillEstarSubmission:h.fill}));
vi.mock('../../services/pathway-engines/estar/estar-template-registry',async original=>({...await original<object>(),listVendoredTemplates:h.templates}));
vi.mock('../../services/pathway-engines/estar/estar-artifact-retention',()=>({
  EstarRetentionError:class extends Error{},retainOfficialEstar:h.retain,listRetainedEstarArtifacts:vi.fn(),
}));
vi.mock('../../services/export/governedExportConsequence',()=>({
  createGovernedExportConsequence:h.consequence,createAuditedUnplacedExport:h.consequence,getMaxGovernedExportBytes:()=>20_000_000,
}));

const BYTES=Buffer.from('%PDF-1.7\nExact approved original used by the route fixture');
const SHA=createHash('sha256').update(BYTES).digest('hex');
const SLOT='root.CoverLetter.CLAddAttachment110';
let harness:DispositionHarness;
let f:DispositionFixture;
let app:express.Express;
let inventory:Awaited<ReturnType<typeof import('../../services/pathway-engines/estar/estar-template-registry').listVendoredTemplates>>;
beforeAll(async()=>{
  harness=await createDispositionHarness();h.pool=harness.db;
  await harness.pg.exec(`ALTER TABLE vault.documents ADD COLUMN file_name text, ADD COLUMN mime_type text,
    ADD COLUMN s3_key text, ADD COLUMN storage_version_id text, ADD COLUMN storage_provider text, ADD COLUMN version text;
    ALTER TABLE canonical_documents ADD COLUMN content_hash text,ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE TABLE company_legal_registry(id text,organization_id integer,document jsonb);`);
  const registry=await vi.importActual<typeof import('../../services/pathway-engines/estar/estar-template-registry')>('../../services/pathway-engines/estar/estar-template-registry');
  inventory=await registry.listVendoredTemplates();
  app=express();app.use(express.json());app.use('/api/510k/estar',(await import('../510k-estar-routes')).default);
},120_000);
afterAll(async()=>{await harness?.close();});
beforeEach(async()=>{
  f=await harness.seed();h.org=f.org;h.program=f.program;h.actor=42;
  h.project=(await f.pg.query<{id:number}>('SELECT id FROM projects WHERE organization_id=$1',[f.org])).rows[0].id;
  await f.pg.query(`UPDATE vault.documents SET content_hash=$2,document_code='route-evidence',version='1.0',
    file_name='evidence.pdf',mime_type='application/pdf',storage_version_id='source-version',storage_provider='local' WHERE id=$1`,[f.vault,SHA]);
  await f.pg.query(`INSERT INTO canonical_documents(canonical_id,organization_id,source_refs,stage,content_hash)
    VALUES($1,$2,$3,'approved',$4)`,[randomUUID(),f.org,JSON.stringify({vault_documents:{nativeId:f.vault}}),SHA]);
  h.afterResolve=null;h.afterRetain=null;
  h.templates.mockReset();h.templates.mockResolvedValue(inventory);
  h.read.mockReset();h.read.mockResolvedValue({ok:true,bytes:BYTES});
  h.consequence.mockReset();h.consequence.mockResolvedValue({artifactId:11});
  h.retain.mockReset();h.retain.mockImplementation(async()=>{
    await h.afterRetain?.();return{retained:true,documentId:randomUUID(),contentHash:SHA};
  });
  h.fill.mockReset();h.fill.mockImplementation(async(input:{attachments?:EstarAttachmentRequest[];attachmentResolver?:EstarAttachmentResolver})=>{
    const attached=[];
    for(const assignment of input.attachments??[]){
      const resolved=await input.attachmentResolver!(assignment.source);
      if(!resolved.ok)return{filled:false,templateAvailable:true,fieldMapPopulated:true,blockers:[resolved.reason]};
      attached.push({slot:assignment.slot,chapter:'/CHAPTER 1/CH1.01/',fileName:resolved.fileName,
        dataObjectName:'2026-10-23_1',description:'Cover letter',sha256:createHash('sha256').update(resolved.bytes).digest('hex'),
        byteLength:resolved.bytes.length,token:'<<evidence.pdf|/CHAPTER 1/CH1.01/>>',source:assignment.source});
    }
    await h.afterResolve?.();
    return{filled:true,pdfBytes:BYTES,descriptorId:'510k-device',templateAvailable:true,fieldMapPopulated:true,
      filledFields:[],skippedFields:[],erasedFields:[],blockers:[],warnings:[],
      ...(input.attachments?.length?{attachmentReport:{requested:input.attachments.length,attached,refused:[],manifest:'***Start***<<evidence.pdf|/CHAPTER 1/CH1.01/>>'}}:{})};
  });
});
const post=()=>request(app).post('/api/510k/estar/official').send({meta:{id:'Fixture',ident:h.program},type:'510k',variant:'device',
  data:{},attachments:[{slot:SLOT,source:{kind:'vault_document',documentId:f.vault}}]});

describe('official export revalidates selected sources before retention and delivery',()=>{
  it('returns the truthful official flag and exact attachment receipt on the actual router response',async()=>{
    const response=await post();expect(response.status,JSON.stringify(response.body)).toBe(200);
    expect(response.body.officialEstarPdf).toBe(true);
    expect(response.body.attachmentReport.attached[0]).toMatchObject({slot:SLOT,source:{kind:'vault_document',documentId:f.vault},sha256:SHA});
    expect(h.retain).toHaveBeenCalledOnce();expect(h.consequence).toHaveBeenCalledOnce();
  });
  it('refuses an actor with no identity before production or retention',async()=>{
    h.actor=null;const response=await post();expect(response.status).toBe(403);
    expect(h.fill).not.toHaveBeenCalled();expect(h.retain).not.toHaveBeenCalled();
  });
  it('refuses a source withdrawn during fill before retaining the output',async()=>{
    h.afterResolve=async()=>{await f.pg.query("UPDATE canonical_documents SET stage='withdrawn' WHERE organization_id=$1",[f.org]);};
    const response=await post();expect(response.status).toBe(409);expect(response.body.error).toBe('ESTAR_ATTACHMENT_NOT_APPROVED');
    expect(h.retain).not.toHaveBeenCalled();expect(h.consequence).not.toHaveBeenCalled();
  });
  it('withholds delivery and holds the outcome after write authority changes during retention',async()=>{
    h.afterRetain=async()=>{await f.pg.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=42",[f.org]);};
    const response=await post();expect(response.status).toBe(503);expect(response.body.error).toBe('OUTCOME_UNKNOWN');
    expect(response.body.officialEstarPdf).toBe(false);expect(h.consequence).not.toHaveBeenCalled();
  });
  it('refuses an unpinned template on POST after a valid catalog read',async()=>{
    expect((await request(app).get('/api/510k/estar/attachment-slots?type=510k&variant=device')).status).toBe(200);
    h.templates.mockResolvedValue(inventory.map(t=>({...t,integrity:'unpinned'})));h.fill.mockClear();
    const response=await post();expect(response.status).toBe(422);expect(response.body.error).toBe('ESTAR_ATTACHMENT_CATALOG_UNAVAILABLE');
    expect(h.fill).not.toHaveBeenCalled();expect(h.retain).not.toHaveBeenCalled();
  });
});
