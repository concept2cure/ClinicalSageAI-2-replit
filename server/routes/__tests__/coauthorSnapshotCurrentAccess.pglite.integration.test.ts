/** Real supplied SQL and writer rollback; not native JWT/FORCE-RLS proof. */
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import express,{type RequestHandler} from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IndPgliteDb } from '../../db/pglite-harness';
import type { AuthoringSnapshotQueryable } from '../../services/ana/authoring-canonical-bridge';
import type { CoauthorAuditClient } from '../../services/coauthor/coauthor-audit';
import { expandRoleClaims } from '../../middleware/auth';
import { createCurrentSnapshotFixture,grantSnapshotDocumentView,installCurrentSnapshotActor,installSnapshotProgramAccess,snapshotRequestClient } from './_coauthor-current-source-fixture';

const state=vi.hoisted(()=>({fixture:null as IndPgliteDb|null,userId:2,requestContext:true,globalQueries:[] as string[],assembled:0,
  afterSnapshot:null as null|((q:AuthoringSnapshotQueryable)=>Promise<void>),afterAudit:null as null|((q:CoauthorAuditClient)=>Promise<void>)}));
vi.mock('../../db',()=>({get db(){return state.fixture?.db;},
  pool:{query:async(sql:string,params?:unknown[])=>{state.globalQueries.push(sql);return state.fixture!.pglite.query(sql,params);}},
  transaction:async(callback:(q:CoauthorAuditClient)=>Promise<unknown>)=>state.fixture!.pglite.transaction(q=>callback(q)),
  getPool:()=>({query:async(sql:string,params?:unknown[])=>{state.globalQueries.push(sql);return state.fixture!.pglite.query(sql,params);}})}));
vi.mock('../../auth',()=>({authMiddleware:((_req,_res,next)=>next()) as RequestHandler}));
vi.mock('../../services/ana/authoring-canonical-bridge.js',async original=>{
  const real=await original<typeof import('../../services/ana/authoring-canonical-bridge')>();
  return {...real,defaultAuthoringBridgeDeps:()=>{
    const deps=real.defaultAuthoringBridgeDeps();return {...deps,loadDocumentSnapshot:async(id:string,org:number,q?:AuthoringSnapshotQueryable)=>{
      const result=await deps.loadDocumentSnapshot(id,org,q);state.assembled++;
      if(state.afterSnapshot&&q)await state.afterSnapshot(q);return result;
    }};
  }};
});
vi.mock('../../services/coauthor/coauthor-audit.js',async original=>{
  const real=await original<typeof import('../../services/coauthor/coauthor-audit')>();
  return {...real,recordCoauthorDocumentEvent:async(q:CoauthorAuditClient,event:Parameters<typeof real.recordCoauthorDocumentEvent>[1])=>{
    await real.recordCoauthorDocumentEvent(q,event);if(state.afterAudit)await state.afterAudit(q);
  }};
});

const ORG=7;const PROGRAM='11111111-1111-4111-8111-111111111111';const PRIVATE='22222222-2222-4222-8222-222222222222';
const SOURCE='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const FIRST='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';const SECOND='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BODY='Visible source scientific procedure, retained from the original saved document.';
const HIDDEN='Confidential sibling source prose must never be assembled for an exact section-only reader.';
let app:express.Express;
const pg=()=>state.fixture!.pglite;
const place=(source:unknown=SOURCE)=>request(app).post('/api/coauthor/documents').send({sourceAuthoringDocId:source,moduleNumber:'2.5',
  title:'Untrusted client title',content:'Untrusted client prose',changeReason:'Taking the exact saved source into the filing'});
async function captureWrites() {
  const rows=await pg().query<{retained:unknown}>(`SELECT json_build_object('copies',(SELECT json_agg(c ORDER BY id) FROM coauthor_documents c),
    'aliases',(SELECT json_agg(a ORDER BY store,native_id) FROM c2c_document_aliases a),
    'versions',(SELECT json_agg(v ORDER BY id) FROM coauthor_document_versions v),
    'audit',(SELECT json_agg(e ORDER BY id) FROM audit_events e)) AS retained`);
  return rows.rows[0].retained;
}
async function assertInitialRefusal(status:number) {
  const before=await captureWrites();const res=await place();expect(res.status).toBe(status);
  expect(state.assembled).toBe(0);expect(await captureWrites()).toEqual(before);
  expect(JSON.stringify(res.body)).not.toMatch(/Visible source|Confidential sibling|Controlled source title|SELECT|doc_permissions/);
  expect(res.body.document).toBeUndefined();return res;
}

beforeAll(async()=>{
  state.fixture=await createCurrentSnapshotFixture();
  await pg().exec(readFileSync(resolve(__dirname,'../../../migrations/20260814d_document_alias_map.sql'),'utf8'));
  await pg().exec(readFileSync(resolve(__dirname,'../../../db/migrations/20260725_authoring_audit_trail.sql'),'utf8'));
  await installCurrentSnapshotActor(pg(),{organizationId:ORG,userId:1,role:'member',email:'owner@example.invalid'});
  await installCurrentSnapshotActor(pg(),{organizationId:ORG,userId:2,role:'member',email:'reader@example.invalid'});
  await pg().query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_name)
    VALUES($1,$3,'Synthetic public source','SNAP-PUBLIC','IND','Synthetic product'),($2,$3,'Synthetic private source','SNAP-PRIVATE','IND','Synthetic product')`,[PROGRAM,PRIVATE,ORG]);
  await installSnapshotProgramAccess(pg(),{organizationId:ORG,userId:1,programId:PROGRAM,projectId:71,visibility:'org_public'});
  await installSnapshotProgramAccess(pg(),{organizationId:ORG,userId:1,programId:PRIVATE,projectId:72});
  app=express();app.use(express.json());app.use((req,_res,next)=>{
    req.user={id:state.userId,userId:state.userId,organizationId:ORG,role:'admin',roles:expandRoleClaims('admin',undefined)};
    if(state.requestContext)Object.assign(req,{dbClient:snapshotRequestClient(pg())});next();
  });app.use('/api/coauthor',(await import('../coauthor')).default);
},90_000);
beforeEach(async()=>{
  state.userId=2;state.requestContext=true;state.afterSnapshot=null;state.afterAudit=null;state.assembled=0;state.globalQueries.length=0;
  await pg().exec(`TRUNCATE coauthor_document_versions,coauthor_documents,c2c_document_aliases,audit_events,doc_permissions,authoring_sections,authoring_documents,frozen_documents;
    UPDATE users SET status='active',email=CASE WHEN id=2 THEN 'reader@example.invalid' ELSE 'owner@example.invalid' END;
    UPDATE organizations SET status='active';UPDATE organization_users SET role='member';
    UPDATE projects SET regulatory_program_id=NULL WHERE id=72;UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=71;
    UPDATE project_visibility_settings SET visibility='private' WHERE project_id=72;`);
  await pg().query('UPDATE projects SET regulatory_program_id=$1 WHERE id=71',[PROGRAM]);
  await pg().query('UPDATE projects SET regulatory_program_id=$1 WHERE id=72',[PRIVATE]);
  await pg().query('INSERT INTO organization_users(organization_id,user_id,role) SELECT $1,2,$2 WHERE NOT EXISTS(SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=2)',[ORG,'member']);
  await pg().query('INSERT INTO authoring_documents(id,tenant_id,status,title,module,created_by,client_program_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[SOURCE,ORG,'DRAFT','Controlled source title','M2','1',PROGRAM]);
  await pg().query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,content,order_index)
    VALUES($1,$3,$4,'2.5.1','Visible section',$5,1),($2,$3,$4,'2.5.2','Hidden section',$6,2)`,[FIRST,SECOND,SOURCE,ORG,BODY,HIDDEN]);
  await grantSnapshotDocumentView(pg(),{organizationId:ORG,userId:2,documentId:SOURCE});
});
afterAll(async()=>{await state.fixture?.close();});

describe('current whole-source authority before a filing copy',()=>{
  it('retains a genuine source-derived full-document positive and unchanged retake',async()=>{
    const first=await place();expect(first.status).toBe(201);expect(first.body.document).toMatchObject({title:'Controlled source title',status:'draft'});
    expect(first.body.document.content).toContain(BODY);expect(first.body.document.content).toContain(HIDDEN);
    expect(first.body.document.content).not.toContain('Untrusted client');
    const again=await place();expect(again.status).toBe(200);expect(again.body.document.id).toBe(first.body.document.id);expect(again.body.written).toBe(false);
  });
  it('normalizes valid source UUID case without guessing a source identity',async()=>{
    const res=await place(SOURCE.toUpperCase());expect(res.status).toBe(201);expect(res.body.document.metadata.docId).toBe(SOURCE);
  });
  it.each([['malformed','not-a-document-uuid'],['array',[SOURCE]],['blank','']])('refuses a %s supplied source UUID before writes',async(_label,source)=>{
    const before=await captureWrites();const res=await place(source);expect(res.status).toBe(400);expect(state.assembled).toBe(0);expect(await captureWrites()).toEqual(before);
  });
  it('a foreign source is a404 without source metadata or prose',async()=>{
    await pg().exec('UPDATE authoring_documents SET tenant_id=8');await assertInitialRefusal(404);
  });
  it('document VIEW does not bypass current private project sharing',async()=>{
    await pg().query('UPDATE authoring_documents SET client_program_id=$1 WHERE id=$2',[PRIVATE,SOURCE]);await assertInitialRefusal(403);
  });
  it('public project sharing does not supply a missing whole-document ACL',async()=>{
    await pg().exec('TRUNCATE doc_permissions');await assertInitialRefusal(404);
  });
  it('an exact section VIEW grant cannot assemble its confidential sibling',async()=>{
    await pg().query('UPDATE doc_permissions SET section_id=$1 WHERE doc_id=$2',[FIRST,SOURCE]);await assertInitialRefusal(403);
  });
  it('a current OU viewer with full VIEW and stale admin claims cannot write a filing copy',async()=>{
    await pg().exec("UPDATE organization_users SET role='viewer' WHERE user_id=2");await assertInitialRefusal(403);
  });
  it.each(['removed-membership','inactive-user','inactive-organization'])('refuses %s before source assembly',async condition=>{
    const sql=condition==='removed-membership'?'DELETE FROM organization_users WHERE user_id=2':condition==='inactive-user'?"UPDATE users SET status='inactive' WHERE id=2":"UPDATE organizations SET status='inactive' WHERE id=7";
    await pg().exec(sql);await assertInitialRefusal(403);
  });
  it.each(['revoked','expired','changed-email'])('refuses a %s source grant before source assembly',async condition=>{
    if(condition==='changed-email') {
      await pg().exec("UPDATE doc_permissions SET principal_id='email-only';UPDATE users SET email='changed@example.invalid' WHERE id=2");
    }else await pg().exec(condition==='revoked'?'UPDATE doc_permissions SET revoked_at=now()':"UPDATE doc_permissions SET valid_until=now()-interval '1 hour'");
    await assertInitialRefusal(404);
  });
  it('allows a legitimate NULL-program historical source only with its full current ACL',async()=>{
    await pg().exec('UPDATE authoring_documents SET client_program_id=NULL');const positive=await place();expect(positive.status).toBe(201);
    await pg().exec('TRUNCATE doc_permissions');state.assembled=0;await assertInitialRefusal(404);
  });
  it('does not fall back to the global source pool when request context is absent',async()=>{
    state.requestContext=false;await assertInitialRefusal(500);expect(state.globalQueries).toHaveLength(0);
  });
  it('a failed actual policy query is503 rather than a successful source copy',async()=>{
    await pg().exec('ALTER TABLE doc_permissions RENAME TO unavailable_doc_permissions');
    try {await assertInitialRefusal(503);}finally {await pg().exec('ALTER TABLE unavailable_doc_permissions RENAME TO doc_permissions');}
  });
});

describe('late observed source authority must roll back the entire writer',()=>{
  it('a full grant withdrawn after the real assembler read withholds a new copy',async()=>{
    let changed=false;state.afterSnapshot=async q=>{await q.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1',[SOURCE]);changed=true;};
    const before=await captureWrites();const res=await place();expect(changed).toBe(true);expect(res.status).toBe(503);
    expect(res.body.document).toBeUndefined();expect(await captureWrites()).toEqual(before);
  });
  it('a different still-readable unique integer anchor cannot inherit the captured project identity',async()=>{
    let changed=false;state.afterSnapshot=async q=>{
      await q.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=71');
      await q.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=72',[PROGRAM]);
      await q.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=72");changed=true;
    };
    const before=await captureWrites();const res=await place();expect(changed).toBe(true);expect(res.status).toBe(503);expect(await captureWrites()).toEqual(before);
  });
  it('withdrawal after actual retake version and audit writes rolls back every side effect',async()=>{
    expect((await place()).status).toBe(201);await pg().query('UPDATE authoring_sections SET content=$1 WHERE id=$2',[BODY+' A recorded source correction.',FIRST]);
    const before=await captureWrites();let changed=false;state.afterAudit=async q=>{await q.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1',[SOURCE]);changed=true;};
    const res=await place();expect(changed).toBe(true);expect(res.status).toBe(503);expect(res.body.document).toBeUndefined();expect(await captureWrites()).toEqual(before);
  });
  it('an actual audit persistence refusal still rolls back the retaken copy and replaced version',async()=>{
    expect((await place()).status).toBe(201);await pg().query('UPDATE authoring_sections SET content=$1 WHERE id=$2',[BODY+' Another source correction.',FIRST]);
    const before=await captureWrites();await pg().exec("ALTER TABLE audit_events ADD CONSTRAINT fixture_retaken_audit_refusal CHECK(event_type <> 'coauthor_document.retaken')");
    try {const res=await place();expect(res.status).toBe(500);expect(await captureWrites()).toEqual(before);}
    finally {await pg().exec('ALTER TABLE audit_events DROP CONSTRAINT fixture_retaken_audit_refusal');}
  });
});
