import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import { DOC, SECTION, PROGRAM, PRIVATE_PROGRAM, READ_SECRET, createCurrentReadDb,
  currentReadApp, observedReadClient, readToken, type ReadObservation } from './_authoring-current-read-fixture';

const h=vi.hoisted(()=>({db:null as unknown,pool:null as unknown}));
vi.mock('../../db',()=>({get db(){return h.db;},get pool(){return h.pool;},getPool:()=>h.pool}));
process.env.JWT_SECRET=READ_SECRET;process.env.JWT_SECRET_DEV=READ_SECRET;
let jdb:JourneyDb;let app:express.Express;let missingContextApp:express.Express;
let token:string;let partialToken:string;let bystanderToken:string;
const observation:ReadObservation={sql:[]};
const get=(path:string,bearer=token)=>request(app).get(`/api/authoring${path}`).set('Authorization',`Bearer ${bearer}`);
const proseReads=()=>observation.sql.filter(sql=>sql.includes('d.title')||sql.includes('s.content')||/^SELECT provenance FROM/.test(sql));

beforeAll(async()=>{
  jdb=await createCurrentReadDb();h.db=jdb.db;h.pool=observedReadClient(jdb,observation);
  const {default:router}=await import('../authoring.router');
  app=currentReadApp(router,jdb,observation);missingContextApp=currentReadApp(router,jdb,observation,false);
  token=await readToken();partialToken=await readToken(31);bystanderToken=await readToken(41);
},180_000);
beforeEach(async()=>{
  observation.sql=[];observation.fault=undefined;observation.afterRead=undefined;observation.afterIdentity=undefined;
  await jdb.pglite.exec(`UPDATE users SET status='active';UPDATE organizations SET status='active';
    UPDATE organization_users SET role=CASE WHEN user_id=11 THEN 'member' ELSE 'viewer' END;
    UPDATE project_visibility_settings SET visibility=CASE WHEN project_id=101 THEN 'org_public' ELSE 'private' END;
    UPDATE doc_permissions SET revoked_at=NULL,valid_from=NOW()-interval '1 day',valid_until=NULL
      WHERE principal_id IN ('11','21','31');`);
});
afterAll(async()=>{await jdb?.close();});

describe('actual Authoring read admission before metadata or prose',()=>{
  it('omits same-org private project metadata even with a real document grant and stale admin claims',async()=>{
    const res=await get('/docs');expect(res.status).toBe(200);
    expect(res.body.documents.map((d:{id:string})=>d.id)).not.toContain(DOC.private);
  });
  it('refuses private details and sections before reading their metadata or prose',async()=>{
    for(const suffix of ['', '/sections']) {
      observation.sql=[];const res=await get(`/docs/${DOC.private}${suffix}`);
      expect(res.status).toBe(404);expect(proseReads()).toEqual([]);
    }
  });
  it('does not turn a current viewer into a document admin from cached JWT or ALS claims',async()=>{
    const res=await get(`/docs/${DOC.full}`,bystanderToken);
    expect(res.status).toBe(404);expect(proseReads()).toEqual([]);
  });
  it('refuses an inactive actor despite the otherwise valid captured bearer',async()=>{
    await jdb.pool.query(`UPDATE users SET status='inactive' WHERE id=21`);
    const res=await get(`/docs/${DOC.full}`);expect(res.status).toBe(403);expect(proseReads()).toEqual([]);
  });
  it('refuses an expired or revoked grant without reading the content',async()=>{
    await jdb.pool.query(`UPDATE doc_permissions SET revoked_at=NOW() WHERE doc_id=$1 AND principal_id='21'`,[DOC.full]);
    const res=await get(`/docs/${DOC.full}/sections`);expect(res.status).toBe(404);expect(proseReads()).toEqual([]);
  });
  it('reports actual resolver query failure as unavailable rather than content or a fabricated empty list',async()=>{
    observation.fault=sql=>sql.includes('FROM doc_permissions');
    const res=await get('/docs');expect(res.status).toBe(503);expect(proseReads()).toEqual([]);
  });
  it('requires the actual request executor instead of falling back to the shared pool',async()=>{
    const res=await request(missingContextApp).get('/api/authoring/docs').set('Authorization',`Bearer ${token}`);
    expect(res.status).toBe(500);expect(proseReads()).toEqual([]);
  });
  it('rejects explicit malformed or multivalued program IDs without silently broadening the read',async()=>{
    for(const query of ['programId=not-a-uuid',`programId=${PROGRAM}&programId=${PRIVATE_PROGRAM}`]) {
      const res=await get(`/docs?${query}`);expect(res.status).toBe(400);
    }
  });
});

describe('actual section grant preserves the reachable editor without sibling facts',()=>{
  it('lists the granted section parent and counts only visible saved content',async()=>{
    const res=await get('/docs',partialToken);expect(res.status).toBe(200);
    const row=res.body.documents.find((d:{id:string})=>d.id===DOC.partial);
    expect(row).toBeDefined();expect(Number(row.section_count)).toBe(1);
  });
  it('returns only the exact granted section rather than all sibling prose',async()=>{
    const res=await get(`/docs/${DOC.partial}/sections`,partialToken);expect(res.status).toBe(200);
    expect(res.body.sections.map((s:{id:string})=>s.id)).toEqual([SECTION.visible]);
    expect(JSON.stringify(res.body)).not.toContain('HIDDEN_SIBLING_PROSE');expect(res.body.structure).toBeNull();
  });
  it('withholds full provenance and hidden comment totals on the admitted parent',async()=>{
    const res=await get(`/docs/${DOC.partial}`,partialToken);expect(res.status).toBe(200);
    expect(res.body.document).not.toHaveProperty('provenance');
    expect(Number(res.body.document.comment_count)).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('HIDDEN_SOURCE_REFERENCE');
  });
  it('does not leak a hidden provenance association through source or conversation filtering',async()=>{
    for(const query of ['source=ana','conversationId=hidden-conversation']) {
      const res=await get(`/docs?${query}`,partialToken);expect(res.status).toBe(200);
      expect(res.body.documents.map((d:{id:string})=>d.id)).not.toContain(DOC.partial);
    }
  });
});

describe('existing legitimate read behavior and actual late withdrawal',()=>{
  it('preserves full saved sections and counters for a real full Viewer grant',async()=>{
    const res=await get(`/docs/${DOC.partial}/sections`);expect(res.status).toBe(200);
    expect(res.body.sections.map((s:{id:string})=>s.id)).toEqual([SECTION.visible,SECTION.hidden]);
    expect(res.body.structure.duplicateCodes).toEqual([]);
    expect(res.body.structure.suggestedOrder).toEqual(['2.5.1','2.5.2']);
  });
  it('keeps actual NULL-program organization records while selected-program reads exclude them',async()=>{
    const org=await get('/docs');expect(org.status).toBe(200);
    expect(org.body.documents.map((d:{id:string})=>d.id)).toContain(DOC.historical);
    const scoped=await get(`/docs?programId=${PROGRAM}`);expect(scoped.status).toBe(200);
    expect(scoped.body.documents.map((d:{id:string})=>d.id)).not.toContain(DOC.historical);
  });
  it('retains zero-section full records and case-insensitive frozen status filtering',async()=>{
    const list=await get(`/docs?status=frozen`);expect(list.status).toBe(200);
    expect(list.body.documents.map((d:{id:string})=>d.id)).toEqual([DOC.empty]);
    const res=await get(`/docs/${DOC.empty}/sections`);expect(res.status).toBe(200);expect(res.body.sections).toEqual([]);
  });
  it('does not describe a foreign or missing parent as a legitimate empty document',async()=>{
    const res=await get(`/docs/${DOC.foreign}/sections`);expect(res.status).toBe(404);
  });
  it('refuses an actual grant withdrawal after the real content query settles',async()=>{
    observation.afterRead=async()=>{await jdb.pool.query(`UPDATE doc_permissions SET revoked_at=NOW() WHERE doc_id=$1 AND principal_id='21'`,[DOC.full]);};
    const res=await get(`/docs/${DOC.full}/sections`);expect(observation.afterRead).toBeUndefined();
    expect(res.status).toBe(503);expect(res.body).not.toHaveProperty('sections');
  });
  it('refuses an actual OU role change even when the same actor retains full object IDs',async()=>{
    observation.afterRead=async()=>{await jdb.pool.query(`UPDATE organization_users SET role='member' WHERE user_id=21 AND organization_id=1`);};
    const res=await get(`/docs/${DOC.full}`);expect(observation.afterRead).toBeUndefined();
    expect(res.status).toBe(503);expect(res.body).not.toHaveProperty('document');
  });
  it('refuses current OU withdrawal after a real read without returning an initial-refusal shape',async()=>{
    observation.afterRead=async()=>{await jdb.pool.query(`UPDATE users SET status='inactive' WHERE id=21`);};
    const res=await get(`/docs/${DOC.full}/sections`);expect(observation.afterRead).toBeUndefined();expect(res.status).toBe(503);
  });
});

describe('actual current membership, email and grant windows',()=>{
  it('refuses a removed OU without reading the previously admitted document',async()=>{
    await jdb.pool.query(`DELETE FROM organization_users WHERE user_id=21 AND organization_id=1`);
    try {
      const res=await get(`/docs/${DOC.full}`);expect(res.status).toBe(403);expect(proseReads()).toEqual([]);
    } finally {await jdb.pool.query(`INSERT INTO organization_users VALUES(1,21,'viewer')`);}
  });
  it('uses the current stored email for an email grant and refuses after that email changes',async()=>{
    const grant=await jdb.pglite.query<{id:string}>(`INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,email,role,granted_by)
      VALUES($1,1,'synthetic-email-only','bystander@read.example','VIEWER','11') RETURNING id`,[DOC.full]);
    try {
      const admitted=await get(`/docs/${DOC.full}`,bystanderToken);expect(admitted.status).toBe(200);
      await jdb.pool.query(`UPDATE users SET email='changed@read.example' WHERE id=41`);observation.sql=[];
      const refused=await get(`/docs/${DOC.full}`,bystanderToken);expect(refused.status).toBe(404);expect(proseReads()).toEqual([]);
    } finally {
      await jdb.pool.query(`UPDATE users SET email='bystander@read.example' WHERE id=41`);
      await jdb.pool.query(`UPDATE doc_permissions SET revoked_at=NOW() WHERE id=$1`,[grant.rows[0].id]);
    }
  });
  it('refuses a future valid_from and an actually expired valid_until',async()=>{
    for(const window of [`valid_from=NOW()+interval '1 day',valid_until=NULL`,`valid_from=NOW()-interval '2 days',valid_until=NOW()-interval '1 day'`]) {
      await jdb.pool.query(`UPDATE doc_permissions SET ${window} WHERE doc_id=$1 AND principal_id='21'`,[DOC.full]);
      observation.sql=[];const res=await get(`/docs/${DOC.full}/sections`);expect(res.status).toBe(404);expect(proseReads()).toEqual([]);
    }
  });
  it('does not make an ungranted historical NULL-program document organization-public',async()=>{
    const list=await get('/docs');expect(list.status).toBe(200);
    expect(list.body.documents.map((d:{id:string})=>d.id)).not.toContain(DOC.ungrantedHistorical);
    const res=await get(`/docs/${DOC.ungrantedHistorical}`);expect(res.status).toBe(404);
  });
});

describe('authoritative projection and source store wire facts',()=>{
  it('emits mandatory full versus partial coverage on every relevant response',async()=>{
    const list=await get('/docs',partialToken);expect(list.status).toBe(200);
    expect(list.body.documents).toEqual([expect.objectContaining({id:DOC.partial,readScope:'sections'})]);
    const detail=await get(`/docs/${DOC.partial}`,partialToken);expect(detail.status).toBe(200);
    expect(detail.body.document).toMatchObject({readScope:'sections',sourceMetadataState:'unavailable'});
    expect(detail.body).not.toHaveProperty('provenanceStore');
    const sections=await get(`/docs/${DOC.partial}/sections`,partialToken);expect(sections.body.readScope).toBe('sections');
    const full=await get(`/docs/${DOC.full}`);expect(full.body.document).toMatchObject({readScope:'document',sourceMetadataState:'available',provenance:null});
    const fullSections=await get(`/docs/${DOC.full}/sections`);expect(fullSections.body.readScope).toBe('document');
  });
  it('preserves recorded whole-document provenance for a real full grant',async()=>{
    const res=await get(`/docs/${DOC.partial}`);expect(res.status).toBe(200);
    expect(res.body.document.sourceMetadataState).toBe('available');
    expect(res.body.document.provenance.projectSourceReferences[0].excerpt).toBe('HIDDEN_SOURCE_REFERENCE');
  });
  it('reports an actually absent provenance store as unavailable while preserving the qualification',async()=>{
    await jdb.pool.query('ALTER TABLE authoring_documents RENAME COLUMN provenance TO provenance_qa_retained');
    try {
      const res=await get(`/docs/${DOC.full}`);expect(res.status).toBe(200);
      expect(res.body.document.sourceMetadataState).toBe('unavailable');expect(res.body.provenanceStore).toBe('absent');
    } finally {await jdb.pool.query('ALTER TABLE authoring_documents RENAME COLUMN provenance_qa_retained TO provenance');}
  });
  it('reports a failed provenance-store inspection as unknown rather than an invented source absence',async()=>{
    observation.fault=sql=>sql.includes('FROM information_schema.columns');
    const res=await get(`/docs/${DOC.full}`);expect(res.status).toBe(200);
    expect(res.body.document.sourceMetadataState).toBe('unavailable');expect(res.body.provenanceStore).toBe('unknown');
  });
});

describe('actual tenant-child counters and additional late withdrawals',()=>{
  it('does not count a valid-schema comment whose recorded document points at a different private section parent',async()=>{
    await jdb.pool.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id)
      VALUES(gen_random_uuid(),$1,$2,'Synthetic retained mismatched document reference',1)`,[DOC.full,SECTION.private]);
    const res=await get(`/docs/${DOC.full}`);expect(res.status).toBe(200);
    expect(Number(res.body.document.comment_count)).toBe(0);
  });
  it('rejects mismatched tenant parents and excludes legitimate foreign child counters',async()=>{
    await expect(jdb.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
      VALUES(gen_random_uuid(),$1,'9.9','Foreign retained child','FOREIGN_CHILD_CONTENT',2)`,[DOC.partial])).rejects.toMatchObject({code:'23503'});
    await expect(jdb.pool.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id)
      VALUES(gen_random_uuid(),$1,$2,'Foreign comment',2)`,[DOC.partial,SECTION.visible])).rejects.toMatchObject({code:'23503'});
    await expect(jdb.pool.query(`INSERT INTO authoring_citations(id,section_id,citation_text,tenant_id)
      VALUES(gen_random_uuid(),$1,'Foreign citation',2)`,[SECTION.visible])).rejects.toMatchObject({code:'23503'});
    await expect(jdb.pool.query(`INSERT INTO doc_revisions(id,section_id,content,tenant_id)
      VALUES(gen_random_uuid(),$1,'Foreign immutable history',2)`,[SECTION.visible])).rejects.toMatchObject({code:'23503'});
    const foreign=await jdb.pglite.query<{id:string}>(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
      VALUES(gen_random_uuid(),$1,'9.9','Foreign retained section','FOREIGN_CHILD_CONTENT',2) RETURNING id`,[DOC.foreign]);
    await jdb.pool.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id)
      VALUES(gen_random_uuid(),$1,$2,'Foreign comment',2)`,[DOC.foreign,foreign.rows[0].id]);
    await jdb.pool.query(`INSERT INTO authoring_citations(id,section_id,citation_text,tenant_id)
      VALUES(gen_random_uuid(),$1,'Foreign citation',2)`,[foreign.rows[0].id]);
    await jdb.pool.query(`INSERT INTO doc_revisions(id,section_id,content,tenant_id)
      VALUES(gen_random_uuid(),$1,'Foreign immutable history',2)`,[foreign.rows[0].id]);
    const list=await get('/docs');expect(list.status).toBe(200);
    expect(Number(list.body.documents.find((d:{id:string})=>d.id===DOC.partial).section_count)).toBe(2);
    const res=await get(`/docs/${DOC.partial}/sections`,partialToken);expect(res.status).toBe(200);
    expect(['comment_count','revision_count','citation_count'].map(key=>Number(res.body.sections[0][key]))).toEqual([1,0,0]);
    expect(JSON.stringify(res.body)).not.toContain('FOREIGN_CHILD_CONTENT');
  });
  it('refuses actual project sharing withdrawal after real rows settle',async()=>{
    observation.afterRead=async()=>{await jdb.pool.query(`UPDATE project_visibility_settings SET visibility='private' WHERE project_id=101`);};
    const res=await get(`/docs/${DOC.full}/sections`);expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTHORING_READ_ACCESS_CHANGED');expect(res.body).not.toHaveProperty('sections');
  });
  it('refuses the exact section grant withdrawn after the admitted section was actually read',async()=>{
    observation.afterRead=async()=>{await jdb.pool.query(`UPDATE doc_permissions SET revoked_at=NOW() WHERE principal_id='31' AND section_id=$1`,[SECTION.visible]);};
    const res=await get(`/docs/${DOC.partial}/sections`,partialToken);expect(res.status).toBe(503);
    expect(res.body.code).toBe('AUTHORING_READ_ACCESS_CHANGED');expect(res.body).not.toHaveProperty('sections');
  });
  it('binds the captured internal reader identity even if its caller object changes during actual admission',async()=>{
    const identity={organizationId:1,userId:21,documentId:DOC.full};
    observation.afterIdentity=()=>{identity.documentId=DOC.private;identity.organizationId=2;};
    const {readAuthoringDocument}=await import('../../services/authoring/authoring-document-read');
    const result=await readAuthoringDocument(observedReadClient(jdb,observation),identity);
    expect(observation.afterIdentity).toBeUndefined();expect(result.document).toMatchObject({id:DOC.full,readScope:'document'});
  });
});
