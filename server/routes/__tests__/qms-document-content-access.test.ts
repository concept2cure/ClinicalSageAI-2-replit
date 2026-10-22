/** QMS register visibility does not bypass canonical authored-document permissions. */
import express from 'express';
import request from 'supertest';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const h=vi.hoisted(()=>({query:vi.fn(),decide:vi.fn(),scope:vi.fn(),create:vi.fn()}));
vi.mock('../../db',()=>({pool:{query:(...args:unknown[])=>h.query(...args)}}));
vi.mock('../../services/authoring/authoring-permissions',async original=>({
  ...await original<typeof import('../../services/authoring/authoring-permissions')>(),
  resolveAuthoringDocumentScope:(...args:unknown[])=>h.scope(...args),decideAuthoringPermission:(...args:unknown[])=>h.decide(...args),
}));
// This boundary suite controls object decisions; real membership/private access
// is independently qualified by mdx-qms-request-rls.dbtest.ts.
vi.mock('../../services/authoring/authoring-program-access', async original => ({
  ...await original<typeof import('../../services/authoring/authoring-program-access')>(),
  authorizeAuthoringProgram: async () => ({ principal: { id: '3', email: null, roles: ['MEMBER'] } }),
}));
vi.mock('../../services/qms/controlled-document-service',async original=>({
  ...await original<typeof import('../../services/qms/controlled-document-service')>(),
  createControlledQmsDocument:(...args:unknown[])=>h.create(...args),
}));
import router from '../mdx-qms';
import {QmsContentRefusedError} from '../../services/qms/controlled-document-content';
const docId='00000000-0000-4000-8000-000000000011';
const registered={id:4,organization_id:9,doc_number:'SOP-004',title:'Controlled procedure',doc_type:'sop',version:'1.0',status:'draft',
  effective_date:null,next_review_date:null,author_id:3,approver_id:null,approved_at:null,category:null,artifact_id:null,authoring_document_id:docId,
  metadata:{programId:'program',approval:{by:7},authoringContent:{sections:[{content:'Private procedure text'}]}}};
const app=()=>{const a=express();a.use(express.json());a.use((req,_res,next)=>{(req as any).user={id:3,organizationId:9,role:'member'};(req as any).dbClient={query:(...args:unknown[])=>h.query(...args)};next();});a.use('/api/mdx',router);return a;};
beforeEach(()=>{
  h.query.mockReset().mockImplementation(async(sql:string)=>{
    if(sql.includes('FROM organization_users'))return{rows:[{account_status:'active',organization_status:'active',payment_status:'active',membership_role:'member'}]};
    if(sql.includes('FROM authoring_documents'))return{rows:[{client_program_id:'00000000-0000-4000-8000-000000000012'}]};
    // Periodic review lists in-force and in-review documents; a first draft is not due (in-force-release.ts).
    // Its due date is decided after the read, from the version in force and its last review (periodic-review.ts).
    if(sql.includes("status IN ('effective','in_review','draft')"))return{rows:[{...registered,status:'in_review',next_review_date:'2026-01-05'}]};
    return{rows:[registered]};
  });
  h.scope.mockReset().mockResolvedValue({docId,tenantId:9,documentStatus:'draft',createdBy:'3'});
  h.decide.mockReset().mockResolvedValue({allowed:false});
});
describe('QMS reads preserve canonical object access',()=>{
  it.each(['/qms/documents','/qms/documents/review-due'])('strips saved authored prose from organization register %s',async path=>{
    const res=await request(app()).get(`/api/mdx${path}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Private procedure text');
    const row=Array.isArray(res.body.data)?res.body.data[0]:res.body.data;
    expect(row.metadata).toEqual({programId:'program',approval:{by:7}});
  });
  it('refuses the personal reader before disclosing private authored text',async()=>{
    const res=await request(app()).get('/api/mdx/qms/documents/4');
    expect(res.status).toBe(403);expect(res.body.details.code).toBe('QMS_DOCUMENT_VIEW_DENIED');
    expect(res.body.data).toBeUndefined();expect(JSON.stringify(res.body)).not.toContain('Private procedure text');
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({action:'view',scope:expect.objectContaining({docId})}));
  });
  it('keeps admitted draft metadata readable without claiming a released training snapshot',async()=>{
    h.decide.mockResolvedValue({allowed:true});
    const res=await request(app()).get('/api/mdx/qms/documents/4');
    expect(res.status,JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.metadata).toEqual({programId:'program',approval:{by:7}});
    expect(res.body.meta.training).toMatchObject({eligible:false,canEditControlledText:false,sections:[]});
    expect(JSON.stringify(res.body)).not.toContain('Private procedure text');
  });
  it('refuses opening a private editing copy before returning authoring content',async()=>{
    const res=await request(app()).get('/api/mdx/qms/documents/4/editor');
    expect(res.status).toBe(403);expect(res.body.data).toBeUndefined();
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({action:'view',scope:expect.objectContaining({docId})}));
    expect(h.query).toHaveBeenCalledTimes(1);
  });
  it('refuses an entire retained history when any authored version is unreadable',async()=>{
    h.query.mockResolvedValue({rows:[{version:'1.0',record_kind:'signed',authoring_document_id:docId,sections:[{content:'Private procedure text'}]}]});
    const res=await request(app()).get('/api/mdx/qms/documents/4/versions');
    expect(res.status).toBe(403);expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Private procedure text');
  });
  it('keeps a genuine empty version history distinct from a denied authored history',async()=>{
    h.query.mockImplementation(async(sql:string)=>({rows:sql.includes('SELECT id FROM qms_documents')?[registered]:[]}));
    const res=await request(app()).get('/api/mdx/qms/documents/4/versions');
    expect(res.status).toBe(200);expect(res.body.data).toEqual([]);expect(h.decide).not.toHaveBeenCalled();
  });
  it('returns a retained legacy registry record without inventing an authoring permission target',async()=>{
    h.query.mockResolvedValue({rows:[{version:'3.0',record_kind:'legacy-registry',authoring_document_id:null,sections:[],controlled_document:{doc_number:'SOP-004'}}]});
    const res=await request(app()).get('/api/mdx/qms/documents/4/versions');
    expect(res.status).toBe(200);expect(res.body.data[0].sections).toEqual([]);expect(h.decide).not.toHaveBeenCalled();
  });
  it('does not disclose underlying store text in a typed controlled-content outage',async()=>{
    const internal='relation "private_tenant_records" does not exist; connection at database.internal:5432';
    h.create.mockRejectedValueOnce(new QmsContentRefusedError(503,'QMS_CONTENT_GOVERNANCE_UNAVAILABLE',internal));
    // Exercise the actual mounted middleware/catch/envelope with the admitted
    // fixture principal; current membership is qualified independently.
    const res=await request(app()).post('/api/mdx/qms/documents').send({});
    expect(res.status).toBe(503);
    expect(res.body).toEqual({error:'Controlled document content is temporarily unavailable. Retry after access is restored.',details:{code:'QMS_CONTENT_GOVERNANCE_UNAVAILABLE'}});
    expect(JSON.stringify(res.body)).not.toContain('private_tenant_records');expect(JSON.stringify(res.body)).not.toContain('database.internal');
  });
});
