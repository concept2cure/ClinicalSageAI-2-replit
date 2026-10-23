/** Critical retained history on the actual registered schema. Real auth, ALS,
 * app_service, domain writers and HMAC chain; controlled query faults only. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import { verifyAuditChain, verifyAuditChainSeals } from '../../server/services/audit/chain';
import { LITERATURE_SOURCE_NAME } from '../../server/services/literature-recording.service';

const ORG = 94720;
const FOREIGN_ORG = 94721;
const prefix = `Synthetic critical history ${randomUUID()}`;
let owner: Pool;
let app: express.Express;
let runtimePool: Pool;
let userId: number;
let otherId: number;
let viewerId: number;
let token: string;
let viewerToken: string;
let projectId: number;
let privateProjectId: number;
let program: string;
let privateProgram: string;
let foreignProgram: string;
let ownCase: string;
let privateCase: string;
let foreignCase: string;
let caseByProgram: string;
let ownEntry: string;
let ownPmid: string;
let foreignPmid: string;
type Fault = 'none' | 'audit' | 'commit-before' | 'commit-after' | 'readback' | 'hold-screen';
let fault: Fault = 'none';
let faultDomain: 'case' | 'screen' = 'case';
let faultUsed = false;
let committed = false;
let postAdmission: 'none' | 'remove-member' = 'none';
const txSql: string[] = [];
let entered: (() => void) | undefined;
let releaseHold: (() => void) | undefined;
let holdGate: Promise<void> = Promise.resolve();
const url = (id = ownCase) => `/api/safety-narratives/cases/${encodeURIComponent(id)}`;
const read = (path: string, as = token) => request(app).get(path).set('Authorization', `Bearer ${as}`);
const patch = (narrative: string, as = token, id = ownCase) => request(app).patch(url(id)).set('Authorization', `Bearer ${as}`)
  .send({ reasonForChange: 'Synthetic native history verification', fields: { narrative, seriousnessCriteria: ['hospitalization', 'life_threatening'] } });
const screen = (pmid: string, decision: 'included' | 'excluded' | 'pending', as = token, p: string | null = program) =>
  request(app).post('/api/cerv2/literature/screen').set('Authorization', `Bearer ${as}`).send({ pmid, stage: 'title_abstract', decision,
    ...(decision === 'excluded' ? { exclusionReason: 'Synthetic study is outside the protocol scope' } : {}), ...(p ? { programId: p } : {}) });
const trail = (pmid = ownPmid, p = program) => `/api/cerv2/literature/screening?programId=${p}&pmids=${pmid}`;
const sqlText = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'text' in value ? String(value.text) : '';

function instrumentFaultClient(client: PoolClient): PoolClient {
  const original = client.query.bind(client);
  const release = client.release.bind(client);
  let domain: 'case' | 'screen' | undefined;
  async function beforeQuery(sql: string) {
    if (postAdmission === 'remove-member' && /^BEGIN$/i.test(sql.trim())) {
      postAdmission = 'none';
      await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG,userId]);
    }
    if (/UPDATE adverse_events/i.test(sql)) domain = 'case';
    if (/INSERT INTO literature_screening_decisions/i.test(sql)) domain = 'screen';
    if (domain) txSql.push(sql.trim());
    if (!faultUsed && domain === faultDomain && fault === 'audit' && /INSERT INTO audit_logs/i.test(sql)) {
      faultUsed = true; throw new Error('Synthetic audit INSERT failure');
    }
    if (!faultUsed && domain === faultDomain && fault === 'commit-before' && /^COMMIT$/i.test(sql.trim())) {
      faultUsed = true; throw new Error('Synthetic COMMIT outcome lost before delivery');
    }
  }
  async function afterQuery(sql: string) {
    if (domain === faultDomain && /^COMMIT$/i.test(sql.trim())) {
      committed = true;
      if (!faultUsed && fault === 'commit-after') { faultUsed = true; throw new Error('Synthetic COMMIT acknowledgement lost after durability'); }
    }
    if (!faultUsed && fault === 'hold-screen' && /FROM literature_entries/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      faultUsed = true; entered?.(); await holdGate;
    }
  }
  const query = async (...args: unknown[]) => {
    const sql = sqlText(args[0]);
    await beforeQuery(sql);
    const result = await Reflect.apply(original, client, args);
    await afterQuery(sql);
    return result;
  };
  client.query = query as typeof client.query;
  client.release = (error?: Error | boolean) => { client.query = original as typeof client.query; client.release = release; release(error); };
  return client;
}
async function createAccount(email: string, name: string, passwordHash: string) {
  return Number((await owner.query(`INSERT INTO users(email,name,status,password_hash)
    VALUES ($1,$2,'active',$3) ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`,[email,name,passwordHash])).rows[0].id);
}
async function makeProject(org: number, workspace: number, actor: number) {
  const id = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,$3,$4,'ind','small_molecule','FDA','Synthetic product',$5)`,[id,org,prefix,`SYN-HISTORY-${id}`,actor]);
  const project = Number((await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings,regulatory_program_id)
    VALUES ($1,$2,$3,'regulatory','active',$4,$4,'{"projectSharing":{"visibility":"private","members":[]}}',$5) RETURNING id`,[org,workspace,prefix,actor,id])).rows[0].id);
  return { id, project };
}
async function makeCase(org = ORG, project: string = String(projectId)) {
  const id = `SYN-HISTORY-${randomUUID()}`;
  await owner.query(`INSERT INTO adverse_events(id,organization_id,project_id,event_type,event_description,seriousness_criteria,narrative,report_date,causality,expectedness,outcome)
    VALUES ($1,$2,$3,'serious','Synthetic native event','["hospitalization"]','Synthetic original narrative','2026-10-01T00:00:00Z','possible','unexpected','recovered')`,[id,org,project]);
  return id;
}
async function makeArticle(org = ORG) {
  const id = randomUUID();
  const pmid = String(1000000000 + Math.floor(Math.random() * 8000000000));
  await owner.query(`INSERT INTO literature_entries(id,organization_id,title,source_name,source_id) VALUES ($1,$2,$3,$4,$5)`,[id,org,`${prefix} article`,LITERATURE_SOURCE_NAME,pmid]);
  return { id, pmid };
}
async function auditRows(type: string, id: string) {
  return (await owner.query(`SELECT id,action,record_id,new_values,reason,xmin::text AS xmin,sha256_chain,hmac_seal,chain_seq::text
    FROM audit_logs WHERE tenant_id=$1 AND table_name=$2 AND record_id=$3 ORDER BY chain_seq,id`,[ORG,type,id])).rows;
}
async function caseRow(id = ownCase) {
  return (await owner.query('SELECT narrative,seriousness_criteria,xmin::text AS xmin FROM adverse_events WHERE id=$1',[id])).rows[0];
}
async function screeningRow(entry = ownEntry) {
  return (await owner.query('SELECT id,decision,xmin::text AS xmin FROM literature_screening_decisions WHERE organization_id=$1 AND literature_entry_id=$2 AND program_id=$3',[ORG,entry,program])).rows[0];
}

const priorAuditHmacKey = process.env.AUDIT_HMAC_KEY;
const priorAuditHmacSecret = process.env.AUDIT_HMAC_SECRET;
function restoreAuditKeys(): void {
  if (priorAuditHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY; else process.env.AUDIT_HMAC_KEY = priorAuditHmacKey;
  if (priorAuditHmacSecret === undefined) delete process.env.AUDIT_HMAC_SECRET; else process.env.AUDIT_HMAC_SECRET = priorAuditHmacSecret;
}

beforeAll(async()=> {
  if (!process.env.APP_DATABASE_URL) throw new Error('Native runtime URL is required.');
  process.env.AUDIT_HMAC_KEY ??= 'synthetic-wave3-critical-history-audit-hmac-key-no-production-use';
  process.env.AUDIT_HMAC_SECRET ??= 'synthetic-wave3-critical-history-tamper-proof-key-no-production-use';
  owner = new Pool({connectionString:databaseUrl,max:3});
  await owner.query(`INSERT INTO organizations(id,name,slug,status) VALUES ($1,'Synthetic critical history audit','synthetic-critical-history-audit','active'),
    ($2,'Synthetic critical history foreign','synthetic-critical-history-foreign','active') ON CONFLICT(id) DO NOTHING`,[ORG,FOREIGN_ORG]);
  const password=await bcrypt.hash('Synthetic-Critical-History-Only!',4);
  userId=await createAccount('synthetic-critical-history@example.invalid','Synthetic critical editor',password);
  otherId=await createAccount('synthetic-critical-history-other@example.invalid','Synthetic private owner',password);
  viewerId=await createAccount('synthetic-critical-history-viewer@example.invalid','Synthetic history viewer',password);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES
    ($1,$2,'member',now()-interval '1 day'),($1,$3,'member',now()-interval '1 day'),($1,$4,'viewer',now()-interval '1 day'),($5,$3,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,created_at=EXCLUDED.created_at`,[ORG,userId,otherId,viewerId,FOREIGN_ORG]);
  const workspace=Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug) VALUES ($1,'Synthetic history workspace','synthetic-critical-history')
    ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,[ORG])).rows[0].id);
  const foreignWorkspace=Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug) VALUES ($1,'Synthetic foreign history','synthetic-critical-history-foreign')
    ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,[FOREIGN_ORG])).rows[0].id);
  const own=await makeProject(ORG,workspace,userId); program=own.id; projectId=own.project;
  const priv=await makeProject(ORG,workspace,otherId); privateProgram=priv.id; privateProjectId=priv.project;
  const foreign=await makeProject(FOREIGN_ORG,foreignWorkspace,otherId); foreignProgram=foreign.id;
  ownCase=await makeCase(); privateCase=await makeCase(ORG,String(privateProjectId)); foreignCase=await makeCase(FOREIGN_ORG,String(foreign.project)); caseByProgram=await makeCase(ORG,program);
  const article=await makeArticle(); ownEntry=article.id; ownPmid=article.pmid; foreignPmid=(await makeArticle(FOREIGN_ORG)).pmid;
  const {activeJwtSecret}=await import('../../server/utils/jwtVerify');
  const mint=(id:number,role:string)=>jwt.sign({type:'access',userId:id,organizationId:String(ORG),role},activeJwtSecret(),{expiresIn:'1h'});
  token=mint(userId,'member'); viewerToken=mint(viewerId,'viewer');
  const {authMiddleware}=await import('../../server/auth');
  runtimePool=(await import('../../server/db')).pool;
  const originalConnect=runtimePool.connect.bind(runtimePool);
  vi.spyOn(runtimePool,'connect').mockImplementation((async (...args:unknown[])=>instrumentFaultClient(await Reflect.apply(originalConnect,runtimePool,args))) as typeof runtimePool.connect);
  const originalQuery=runtimePool.query.bind(runtimePool);
  vi.spyOn(runtimePool,'query').mockImplementation(((...args:unknown[])=> {
    if(fault==='readback'&&committed&&/FROM adverse_events/i.test(sqlText(args[0]))) { faultUsed=true; return Promise.reject(new Error('Synthetic post-commit display failure')); }
    return Reflect.apply(originalQuery,runtimePool,args);
  }) as typeof runtimePool.query);
  app=express(); app.use(express.json());
  app.get('/native-critical-scope',authMiddleware,async(req,res)=> {
    const value=(await requestPgClient(req).query(`SELECT current_user AS role,current_setting('app.current_tenant_id',true) AS tenant,
      rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`)).rows[0];
    res.json({...value,alsTenant:getTenantScope()?.tenantId,lazy:req.dbClient instanceof LazyRequestDbClient});
  });
  app.use('/api/safety-narratives',authMiddleware,(await import('../../server/routes/safety-narrative')).default);
  app.use('/api/cerv2',authMiddleware,(await import('../../server/routes/cerv2-document-routes')).default);
});
beforeEach(()=> {fault='none';faultUsed=false;committed=false;postAdmission='none';txSql.length=0;entered=undefined;releaseHold=undefined;holdGate=Promise.resolve();});
afterAll(async()=> {releaseHold?.();vi.restoreAllMocks();restoreAuditKeys();await owner?.end();await runtimePool?.end();});

describe('native critical case history',()=> {
  it('uses actual authenticated ALS/pinned app_service and real deployed column types',async()=> {
    const res=await read('/native-critical-scope'); expect(res.status,JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({role:'app_service',rolsuper:false,rolbypassrls:false,tenant:String(ORG),alsTenant:String(ORG),lazy:true});
    const columns=(await owner.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='adverse_events'
      AND column_name IN ('id','organization_id','project_id','seriousness_criteria','narrative')`)).rows;
    expect(columns).toContainEqual({column_name:'organization_id',data_type:'integer'}); expect(columns).toContainEqual({column_name:'seriousness_criteria',data_type:'text'});
  });
  it('persists exact narrative and JSON seriousness, returns them on reload, and chains history in the same transaction',async()=> {
    const before=await caseRow(); const res=await patch('Synthetic reviewed narrative version one');
    expect(res.status,JSON.stringify(res.body)).toBe(200); expect(res.body).toMatchObject({saved:true,data:{id:ownCase,narrative:'Synthetic reviewed narrative version one'},meta:{auditTrail:{persisted:true,chained:true}}});
    expect((await read(url())).body.data.narrative).toBe('Synthetic reviewed narrative version one');
    const after=await caseRow(); expect(after.seriousness_criteria).toBe('["hospitalization","life_threatening"]');
    const history=await auditRows('adverse_event',ownCase); expect(history).toHaveLength(1); expect(history[0].xmin).toBe(after.xmin);
    expect(history[0].new_values.changed.narrative).toEqual({from:before.narrative,to:'Synthetic reviewed narrative version one'}); expect(history[0].hmac_seal).toBeTruthy();
  });
  it('keeps the old case and audit chain when its retained-history INSERT fails',async()=> {
    const before=await caseRow(); const history=await auditRows('adverse_event',ownCase); fault='audit';faultDomain='case';
    const res=await patch('Synthetic change that must roll back'); expect(res.status,JSON.stringify(res.body)).toBe(503); expect(res.body).toMatchObject({saved:false,error:{code:'SAE_CASE_HISTORY_UNAVAILABLE'}}); expect(faultUsed).toBe(true);
    expect(await caseRow()).toEqual(before); expect(await auditRows('adverse_event',ownCase)).toEqual(history);
  });
  it('preserves an actual NULL seriousness assessment when only the narrative is changed', async()=> {
    const id=await makeCase();
    await owner.query('UPDATE adverse_events SET seriousness_criteria=NULL WHERE id=$1',[id]);
    const res=await request(app).patch(url(id)).set('Authorization',`Bearer ${token}`)
      .send({reasonForChange:'Synthetic narrative-only clarification',fields:{narrative:'Synthetic narrative without an invented seriousness assessment'}});
    expect(res.status,JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.seriousnessAssessed).toBe(false);
    expect((await caseRow(id)).seriousness_criteria).toBeNull();
    expect((await read(url(id))).body.data.seriousnessAssessed).toBe(false);
    const history=await auditRows('adverse_event',id);
    expect(history).toHaveLength(1);expect(history[0].new_values.changed).not.toHaveProperty('seriousnessCriteria');
  });
  it('reports a durable save truthfully when display refresh fails after COMMIT',async()=> {
    fault='readback';faultDomain='case'; const res=await patch('Synthetic durable content with unavailable display');
    expect(res.status,JSON.stringify(res.body)).toBe(200); expect(res.body).toMatchObject({saved:true,data:null,meta:{readback:{available:false}}}); expect(faultUsed).toBe(true);
    fault='none'; expect((await read(res.body.recoveryUrl)).body.data.narrative).toBe('Synthetic durable content with unavailable display');
  });
  it.each(['commit-before','commit-after'] as const)('reports %s uncertainty without false rollback and recovers by exact read',async(mode)=> {
    const id=await makeCase(); const before=await caseRow(id); fault=mode;faultDomain='case';
    const res=await patch(`Synthetic ${mode} content`,token,id); expect(res.status,JSON.stringify(res.body)).toBe(503); expect(res.body).toMatchObject({saved:null,error:{code:'SAE_CASE_COMMIT_UNCONFIRMED'}}); expect(faultUsed).toBe(true); expect(txSql.filter(s=>/^ROLLBACK$/i.test(s))).toHaveLength(0);
    fault='none'; const fresh=await read(res.body.recoveryUrl); expect(fresh.status).toBe(200); const rows=await auditRows('adverse_event',id);
    if(mode==='commit-after') {expect(fresh.body.data.narrative).toBe(`Synthetic ${mode} content`);expect(rows).toHaveLength(1);} else {expect(fresh.body.data.narrative).toBe(before.narrative);expect(rows).toHaveLength(0);}
  });
  it('filters private/foreign cases, refuses writes and resolves the genuine UUID programme bridge',async()=> {
    expect((await read(url(privateCase))).status).toBe(404); expect((await read(url(foreignCase))).status).toBe(404);
    const list=await read('/api/safety-narratives/cases'); expect(list.status).toBe(200); expect(list.body.data.map((row:{id:string})=>row.id)).not.toContain(privateCase);
    expect((await patch('Synthetic forbidden private change',token,privateCase)).status).toBe(404); expect((await patch('Synthetic forbidden foreign change',token,foreignCase)).status).toBe(404);
    expect((await patch('Synthetic viewer must not change',viewerToken)).status).toBe(403);
    const bridged=await patch('Synthetic actual programme anchored case',token,caseByProgram);expect(bridged.status,JSON.stringify(bridged.body)).toBe(200);expect(bridged.body.data.studyId).toBe(program);
  });
});

describe('native critical literature history',()=> {
  it('creates and supersedes a real corpus decision with same-transaction HMAC history and reload',async()=> {
    const first=await screen(ownPmid,'included');expect(first.status,JSON.stringify(first.body)).toBe(200);expect(first.body).toMatchObject({screened:true,outcome:'created',meta:{auditTrail:{persisted:true,chained:true}}});
    const row1=await screeningRow();const h1=await auditRows('literature_screening_decision',row1.id);expect(h1).toHaveLength(1);expect(h1[0].xmin).toBe(row1.xmin);expect(h1[0].new_values.supersededDecision).toBeNull();
    const second=await screen(ownPmid,'excluded');expect(second.status,JSON.stringify(second.body)).toBe(200);expect(second.body.outcome).toBe('updated');
    const row2=await screeningRow();const h2=await auditRows('literature_screening_decision',row2.id);expect(h2).toHaveLength(2);expect(h2[1].xmin).toBe(row2.xmin);expect(h2[1].new_values).toMatchObject({supersededDecision:'included',decision:'excluded'});
    const saved=await read(trail());expect(saved.status).toBe(200);expect(saved.body.available).toBe(true);expect(JSON.stringify(saved.body.decisions)).toContain('excluded');
  });
  it('rolls back a screening revision when its canonical history INSERT fails',async()=> {
    const before=await screeningRow();const history=await auditRows('literature_screening_decision',before.id);fault='audit';faultDomain='screen';
    const res=await screen(ownPmid,'pending');expect(res.status,JSON.stringify(res.body)).toBe(500);expect(faultUsed).toBe(true);expect(await screeningRow()).toEqual(before);expect(await auditRows('literature_screening_decision',before.id)).toEqual(history);
  });
  it.each(['commit-before','commit-after'] as const)('keeps screening %s uncertainty and exact readback distinct',async(mode)=> {
    const article=await makeArticle();fault=mode;faultDomain='screen';
    const res=await screen(article.pmid,'included');expect(res.status,JSON.stringify(res.body)).toBe(503);expect(res.body).toMatchObject({screened:false,outcome:'unconfirmed',code:'SCREENING_COMMIT_UNCONFIRMED'});expect(faultUsed).toBe(true);expect(txSql.filter(s=>/^ROLLBACK$/i.test(s))).toHaveLength(0);
    fault='none';const fresh=await read(res.body.recoveryUrl);expect(fresh.status).toBe(200);const row=await screeningRow(article.id);
    if(mode==='commit-after') {expect(row.decision).toBe('included');expect(await auditRows('literature_screening_decision',row.id)).toHaveLength(1);} else expect(row).toBeUndefined();
  });
  it('refuses foreign corpus/programmes, private programme access and viewers before a decision is written',async()=> {
    expect((await screen(foreignPmid,'included')).status).toBe(422);expect((await screen(ownPmid,'included',token,foreignProgram)).status).toBe(404);
    expect((await screen(ownPmid,'included',token,privateProgram)).status).toBe(403);expect((await read(trail(ownPmid,privateProgram))).status).toBe(403);expect((await screen(ownPmid,'included',viewerToken)).status).toBe(403);
  });
  it('refuses newly removed membership for both critical writers after auth admission',async()=> {
    for (const domain of ['case','screen']) {
      postAdmission='remove-member';
      try {
        const res = domain === 'case' ? await patch('Synthetic removed membership cannot change') : await screen(ownPmid,'included');
        expect(res.status,JSON.stringify(res.body)).toBe(403);expect(postAdmission).toBe('none');
      } finally {postAdmission='none';await owner.query(`INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES ($1,$2,'member',now()-interval '1 day')
        ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at`,[ORG,userId]);}
    }
  });
  it.each([false,true])('serializes concurrent screening preimages, revised=%s',async(revised)=> {
    const article=await makeArticle();if(revised) expect((await screen(article.pmid,'excluded')).status).toBe(200);
    fault='hold-screen';faultDomain='screen';const held=new Promise<void>(resolve=>{entered=resolve;});holdGate=new Promise<void>(resolve=>{releaseHold=resolve;});
    const first=screen(article.pmid,'pending').then(res=>res);await held;
    const second=screen(article.pmid,'included').then(res=>res);
    try {
      let blocked=false;const deadline=Date.now()+5000;
      while(Date.now()<deadline&&!blocked) { const state=await owner.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='app_service'
        AND wait_event_type='Lock' AND query LIKE '%FROM literature_entries%'`);blocked=state.rows[0].n>0;if(!blocked)await new Promise(resolve=>setTimeout(resolve,20)); }
      expect(blocked).toBe(true);
    } finally {releaseHold?.();}
    const a=await first;const b=await second;expect(a.status,JSON.stringify(a.body)).toBe(200);expect(b.status,JSON.stringify(b.body)).toBe(200);
    const row=await screeningRow(article.id);expect(row.decision).toBe('included');const history=await auditRows('literature_screening_decision',row.id);expect(history).toHaveLength(revised?3:2);
    const last=history.slice(-2);expect(last[0].new_values.supersededDecision).toBe(revised?'excluded':null);expect(last[0].new_values.decision).toBe('pending');expect(last[1].new_values.supersededDecision).toBe('pending');expect(last[1].new_values.decision).toBe('included');
  });
  it('verifies the retained tenant hash chain and every HMAC seal without rewriting history',async()=> {
    expect(await verifyAuditChain(owner,{tenantId:ORG})).toMatchObject({ok:true});const seals=await verifyAuditChainSeals(owner,{tenantId:ORG});expect(seals).toEqual({valid:true,brokenAt:null,verified:expect.any(Number),unsealed:0,unsealedAfterSealed:0,firstUnsealedAfterSealed:null});expect(seals.verified).toBeGreaterThan(0);
    expect((await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id=$1 AND hmac_seal IS NULL',[ORG])).rows[0].n).toBe(0);
  });
});
