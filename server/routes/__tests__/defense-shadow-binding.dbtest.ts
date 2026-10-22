/** Actual canonical auth + pinned app_service connection on the registered
 * migration schema. Only Shadow responses are controlled; no schema is invented. */
import { randomUUID, createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../../../tests/setup.db';
import { requestPgClient } from '../../db/requestDb';
import { getTenantScope } from '../../db/tenantStore';
import { LazyRequestDbClient } from '../../middleware/lazyRequestDbClient';
import { buildRlsStartupOptions } from '../../db/rlsEnforcement';
import { getSslConfig } from '../../db/ssl';

const ORG = 94710;
const FOREIGN_ORG = 94711;
const prefix = `Synthetic Shadow binding ${randomUUID()}`;
const fetchMock = vi.fn();
let owner: Pool;
let unscoped: Pool;
let app: express.Express;
let userId: number;
let otherId: number;
let token: string;
let projectId: number;
let privateProjectId: number;
let program: string;
let privateProgram: string;
let foreignProgram: string;
let packet: string;
let privatePacket: string;
let foreignPacket: string;
let packetHash: string;
let proof: string;
let foreignProof: string;
let mismatchedProof: string;
let render: string;
let mismatchedRender: string;
let failBindings = false;
let afterAdmission: 'none' | 'viewer' | 'remove-member' = 'none';
const get = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const base = (suffix: string, p = program) => `/api/programs/${p}/predicate-intel/${suffix}`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function makeProgram(organizationId: number, workspaceId: number, actorId: number) {
  const id = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,$3,$4,'ind','small_molecule','FDA','Synthetic product',$5)`, [id, organizationId, prefix, `SYN-SHADOW-${id}`, actorId]);
  const project = Number((await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings,regulatory_program_id)
    VALUES ($1,$2,$3,'regulatory','active',$4,$4,'{"projectSharing":{"visibility":"private","members":[]}}',$5) RETURNING id`,
  [organizationId, workspaceId, prefix, actorId, id])).rows[0].id);
  return { id, project };
}
async function makePacket(p: string) {
  const id = randomUUID();
  const manifest = hash(id);
  await owner.query(`INSERT INTO predicate.defense_packets
    (id,program_id,subject_hash,predicate_k_number,risk_code_map_version,risk_vocab_hash,defense_readiness_score,manifest_hash,created_by_user_id)
    VALUES ($1,$2,$3,'K000000','synthetic-v1',$4,0,$5,$6)`, [id,p,hash(p),hash('synthetic-risk'),manifest,String(userId)]);
  return { id, manifest };
}
async function makeProof(p: string, d: string, manifest: string) {
  const id = randomUUID();
  await owner.query(`INSERT INTO predicate.proof_pack_exports
    (id,program_id,subject_hash,manifest_hash,risk_vocab_hash,risk_code_lock_hash,defense_packet_id,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id,p,hash(p),manifest,hash('risk'),hash('lock'),d,String(userId)]);
  return id;
}
function registerNativePolicyProbe(authMiddleware: express.RequestHandler) {
  app.get('/native-shadow-policy',authMiddleware,async(req,res)=> {
    const q=requestPgClient(req);
    const specifications=[
      {name:'packet',own:packet,foreign:foreignPacket,select:'SELECT id FROM predicate.defense_packets WHERE id=ANY($1::uuid[])',
        update:'UPDATE predicate.defense_packets SET created_at=created_at WHERE id=$1 RETURNING id',
        insert:`INSERT INTO predicate.defense_packets(id,program_id,subject_hash,predicate_k_number,risk_code_map_version,risk_vocab_hash,defense_readiness_score,manifest_hash,created_by_user_id)
          VALUES ($1,$2,$3,'K000000','synthetic-v1',$4,0,$5,$6) RETURNING id`,
        ownValues:[randomUUID(),program,hash(randomUUID()),hash('policy-risk'),hash(randomUUID()),String(userId)],
        foreignValues:[randomUUID(),foreignProgram,hash(randomUUID()),hash('policy-risk'),hash(randomUUID()),String(userId)]},
      {name:'proof',own:proof,foreign:foreignProof,select:'SELECT id FROM predicate.proof_pack_exports WHERE id=ANY($1::uuid[])',
        update:'UPDATE predicate.proof_pack_exports SET created_at=created_at WHERE id=$1 RETURNING id',
        insert:`INSERT INTO predicate.proof_pack_exports(id,program_id,subject_hash,manifest_hash,risk_vocab_hash,risk_code_lock_hash,defense_packet_id,created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        ownValues:[randomUUID(),program,hash(program),hash(randomUUID()),hash('risk'),hash('lock'),packet,String(userId)],
        foreignValues:[randomUUID(),foreignProgram,hash(foreignProgram),hash(randomUUID()),hash('risk'),hash('lock'),foreignPacket,String(userId)]},
      {name:'render',own:render,foreign:mismatchedRender,select:'SELECT id FROM predicate.render_jobs WHERE id=ANY($1::uuid[])',
        update:'UPDATE predicate.render_jobs SET created_at=created_at WHERE id=$1 RETURNING id',
        insert:`INSERT INTO predicate.render_jobs(id,proof_pack_id,artifact_type,status,inputs_hash)
          VALUES ($1,$2,'defense_packet_docx','QUEUED',$3) RETURNING id`,
        ownValues:[randomUUID(),proof,hash(randomUUID())],foreignValues:[randomUUID(),foreignProof,hash(randomUUID())]},
    ];
    const observations=[];
    await q.query('BEGIN');
    try {
      for(const spec of specifications) {
        const selected=await q.query(spec.select,[[spec.own,spec.foreign]]);
        const ownUpdate=await q.query(spec.update,[spec.own]);
        const foreignUpdate=await q.query(spec.update,[spec.foreign]);
        const ownInsert=await q.query(spec.insert,spec.ownValues);
        await q.query('SAVEPOINT foreign_parent');
        let foreignInsertCode: string|undefined;
        try {await q.query(spec.insert,spec.foreignValues);}
        catch(error) {foreignInsertCode=String((error as {code?:string}).code);}
        await q.query('ROLLBACK TO SAVEPOINT foreign_parent');
        await q.query('RELEASE SAVEPOINT foreign_parent');
        observations.push({name:spec.name,selected:selected.rows.map(row=>row.id),ownUpdate:ownUpdate.rows.length,
          foreignUpdate:foreignUpdate.rows.length,ownInsert:ownInsert.rows.length,foreignInsertCode});
      }
      await q.query('ROLLBACK');res.json({observations});
    } catch(error) {await q.query('ROLLBACK');res.status(500).json({code:(error as {code?:string}).code});}
  });
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL required for native app_service proof.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  unscoped = new Pool({ connectionString: process.env.APP_DATABASE_URL,
    ssl: getSslConfig(process.env.APP_DATABASE_URL), options: buildRlsStartupOptions(), max: 1,
  } as ConstructorParameters<typeof Pool>[0]);
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,'Synthetic Shadow binding audit','synthetic-shadow-binding-audit','active'),
    ($2,'Synthetic Shadow binding foreign','synthetic-shadow-binding-foreign','active') ON CONFLICT(id) DO NOTHING`, [ORG, FOREIGN_ORG]);
  const password = await bcrypt.hash('Synthetic-Shadow-Only!',4);
  userId = Number((await owner.query(`INSERT INTO users(email,name,status,password_hash)
    VALUES ('synthetic-shadow-binding@example.invalid','Synthetic Shadow reader','active',$1)
    ON CONFLICT(email) DO UPDATE SET status='active',sessions_ended_at=NULL,password_changed_at=NULL,mfa_enabled=false,mfa_secret=NULL RETURNING id`,[password])).rows[0].id);
  otherId = Number((await owner.query(`INSERT INTO users(email,name,status,password_hash)
    VALUES ('synthetic-shadow-other@example.invalid','Synthetic Shadow owner','active',$1)
    ON CONFLICT(email) DO UPDATE SET status='active' RETURNING id`,[password])).rows[0].id);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role,created_at)
    VALUES ($1,$2,'member',now()-interval '1 day'),($1,$3,'member',now()-interval '1 day'),($4,$3,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at`,[ORG,userId,otherId,FOREIGN_ORG]);
  const workspace = Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug)
    VALUES ($1,'Synthetic Shadow workspace','synthetic-shadow-binding') ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,[ORG])).rows[0].id);
  const foreignWorkspace = Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug)
    VALUES ($1,'Synthetic foreign Shadow workspace','synthetic-shadow-binding-foreign') ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,[FOREIGN_ORG])).rows[0].id);
  const own = await makeProgram(ORG,workspace,userId); program = own.id; projectId = own.project;
  const ownPrivate = await makeProgram(ORG,workspace,otherId); privateProgram = ownPrivate.id; privateProjectId = ownPrivate.project;
  foreignProgram = (await makeProgram(FOREIGN_ORG,foreignWorkspace,otherId)).id;
  const ownPacket = await makePacket(program); packet = ownPacket.id; packetHash = ownPacket.manifest;
  privatePacket = (await makePacket(privateProgram)).id;
  const foreign = await makePacket(foreignProgram); foreignPacket = foreign.id;
  proof = await makeProof(program,packet,packetHash);
  foreignProof = await makeProof(foreignProgram,foreignPacket,foreign.manifest);
  // Legal existing FK shapes whose child programme is inconsistent: no policy,
  // trigger or schema is changed to create the adversarial native fixture.
  mismatchedProof = await makeProof(program,foreignPacket,hash(randomUUID()));
  render = randomUUID(); mismatchedRender = randomUUID();
  await owner.query(`INSERT INTO predicate.render_jobs(id,proof_pack_id,artifact_type,status,inputs_hash)
    VALUES ($1,$2,'defense_packet_docx','COMPLETED',$3),($4,$5,'defense_packet_docx','COMPLETED',$6)`,
  [render,proof,hash('inputs'),mismatchedRender,foreignProof,hash('foreign-inputs')]);
  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  token = jwt.sign({type:'access',userId,organizationId:String(ORG),role:'member'},activeJwtSecret(),{expiresIn:'1h'});
  const { authMiddleware } = await import('../../auth');
  app = express(); app.use(express.json());
  app.get('/native-shadow-scope',authMiddleware,async(req,res)=> {
    const result = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_tenant_id',true) AS tenant_id,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
    res.json({...result.rows[0],alsTenant:getTenantScope()?.tenantId,lazy:req.dbClient instanceof LazyRequestDbClient});
  });
  registerNativePolicyProbe(authMiddleware);
  app.use('/api/programs',authMiddleware,async(req,_res,next)=> {
    if (afterAdmission === 'viewer') await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[ORG,userId]);
    if (afterAdmission === 'remove-member') await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,userId]);
    if (failBindings && req.dbClient) {
      const client = req.dbClient; const original = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : '';
        if (/predicate\.(defense_packets|proof_pack_exports|render_jobs)/.test(sql)) throw new Error('Synthetic native binding failure');
        return Reflect.apply(original,client,args);
      }) as typeof client.query;
    }
    next();
  },(await import('../defense-packet')).default,(await import('../se-matrix')).default);
  app.use('/api/regulatory-graph',authMiddleware,async(req,_res,next)=> {
    if (failBindings && req.dbClient) {
      const client = req.dbClient; const original = client.query.bind(client);
      client.query = ((...args: unknown[]) => {
        const sql = typeof args[0] === 'string' ? args[0] : '';
        if (/FROM predicate\.defense_packets/.test(sql)) throw new Error('Synthetic native freshness read failure');
        return Reflect.apply(original,client,args);
      }) as typeof client.query;
    }
    next();
  },(await import('../regulatory-graph')).default);
  process.env.REVIEW_ADMIN_TOKEN = 'synthetic-shadow-only';
});
beforeEach(()=> { fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock); failBindings=false; afterAdmission='none'; });
afterAll(async()=> { vi.unstubAllGlobals(); await owner?.end(); await unscoped?.end(); const {getPool}=await import('../../db/runtime'); await getPool().end(); });

describe('Shadow bindings on actual migration-backed tables',()=> {
  it('reads canonical packet freshness and actual status changes through the mounted graph route',async()=> {
    expect((await owner.query("SELECT to_regclass('public.defense_packets') AS legacy")).rows[0].legacy).toBeNull();
    await owner.query("UPDATE predicate.defense_packets SET status='RENDERED',staleness_reason=NULL,updated_at=now() WHERE id=$1",[packet]);
    const fresh=await get(`/api/regulatory-graph/programs/${program}/freshness`);
    expect(fresh.status,JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.artifacts.filter((row: {artifact:string})=>row.artifact==='defense_packet')).toEqual([
      expect.objectContaining({artifactId:packet,state:'fresh',updatedAt:expect.any(String)}),
    ]);
    expect(fresh.body.counts.defense_packet.fresh).toBe(1);
    await owner.query("UPDATE predicate.defense_packets SET status='STALE',staleness_reason='synthetic actual changed evidence',updated_at=now() WHERE id=$1",[packet]);
    const stale=await get(`/api/regulatory-graph/programs/${program}/freshness`);
    expect(stale.status,JSON.stringify(stale.body)).toBe(200);
    expect(stale.body.artifacts).toContainEqual(expect.objectContaining({artifactId:packet,state:'stale',reason:'synthetic actual changed evidence'}));
    expect(stale.body.counts.defense_packet.stale).toBe(1);
    expect(stale.body.hasStaleArtifacts).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refuses foreign and current private-project freshness before disclosing packet inventory',async()=> {
    for(const denied of [privateProgram,foreignProgram]) {
      const response=await get(`/api/regulatory-graph/programs/${denied}/freshness`);
      expect(response.status,JSON.stringify(response.body)).toBe(403);
      expect(response.body).not.toHaveProperty('counts');
      expect(response.body).not.toHaveProperty('artifacts');
    }
  });
  it('rechecks current membership for a previously usable freshness token',async()=> {
    await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2',[ORG,userId]);
    try {
      const response=await get(`/api/regulatory-graph/programs/${program}/freshness`);
      expect(response.status,JSON.stringify(response.body)).toBe(401);
      expect(response.body).not.toHaveProperty('artifacts');
    } finally {
      await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES ($1,$2,'member',now()-interval '1 day') ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at",[ORG,userId]);
    }
  });
  it('reflects immediate private-project freshness grants and revocations',async()=> {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status,invited_by_id,accepted_at)
      VALUES ($1,$2,$3,'use','active',$4,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET status='active'`,[ORG,privateProjectId,userId,otherId]);
    try {
      const allowed=await get(`/api/regulatory-graph/programs/${privateProgram}/freshness`);
      expect(allowed.status,JSON.stringify(allowed.body)).toBe(200);
      expect(allowed.body.artifacts).toContainEqual(expect.objectContaining({artifactId:privatePacket}));
    } finally {
      await owner.query("UPDATE project_members SET status='removed' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3",[ORG,privateProjectId,userId]);
    }
    const denied=await get(`/api/regulatory-graph/programs/${privateProgram}/freshness`);
    expect(denied.status,JSON.stringify(denied.body)).toBe(403);
    expect(denied.body).not.toHaveProperty('artifacts');
  });
  it('returns empty only after a successful read and refuses a soft-deleted programme',async()=> {
    const workspace=Number((await owner.query('SELECT client_workspace_id FROM public.projects WHERE id=$1 AND organization_id=$2',[projectId,ORG])).rows[0].client_workspace_id);
    const emptyProgram=(await makeProgram(ORG,workspace,userId)).id;
    const empty=await get(`/api/regulatory-graph/programs/${emptyProgram}/freshness`);
    expect(empty.status,JSON.stringify(empty.body)).toBe(200);
    expect(empty.body.artifacts.filter((row:{artifact:string})=>row.artifact==='defense_packet')).toEqual([]);
    expect(empty.body.counts).not.toHaveProperty('defense_packet');
    await owner.query('UPDATE public.regulatory_programs SET deleted_at=now() WHERE id=$1',[emptyProgram]);
    const deleted=await get(`/api/regulatory-graph/programs/${emptyProgram}/freshness`);
    expect(deleted.status,JSON.stringify(deleted.body)).toBe(403);
    expect(deleted.body).not.toHaveProperty('counts');
  });
  it('returns unavailable when the canonical packet read fails and recovers without a false zero inventory',async()=> {
    failBindings=true;
    const failed=await get(`/api/regulatory-graph/programs/${program}/freshness`);
    expect(failed.status,JSON.stringify(failed.body)).toBe(503);
    expect(failed.body.code).toBe('FRESHNESS_SOURCE_UNAVAILABLE');
    expect(JSON.stringify(failed.body)).not.toContain('Synthetic native');
    expect(failed.body).not.toHaveProperty('counts');
    failBindings=false;
    const recovered=await get(`/api/regulatory-graph/programs/${program}/freshness`);
    expect(recovered.status,JSON.stringify(recovered.body)).toBe(200);
    expect(recovered.body.artifacts).toContainEqual(expect.objectContaining({artifactId:packet}));
  });
});
describe('canonical predicate storage FORCE isolation',()=> {
  it('uses genuine authenticated pinned app_service scope, not owner or a mocked database',async()=> {
    const res=await get('/native-shadow-scope'); expect(res.status,JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({role:'app_service',rolsuper:false,rolbypassrls:false,tenant_id:String(ORG),alsTenant:String(ORG),lazy:true});
    const tables=await owner.query(`SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='predicate' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[['defense_packets','proof_pack_exports','render_jobs']]);
    expect(tables.rows).toHaveLength(3); expect(tables.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
    const policies=await owner.query(`SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies
      WHERE schemaname='predicate' AND tablename=ANY($1::text[]) ORDER BY tablename`,[['defense_packets','proof_pack_exports','render_jobs']]);
    expect(policies.rows).toHaveLength(3);
    expect(policies.rows.every(row=>row.cmd==='ALL'&&row.qual&&row.with_check)).toBe(true);
    expect(policies.rows.find(row=>row.tablename==='render_jobs')?.qual).toContain('proof_pack_exports');
    expect(policies.rows.filter(row=>row.tablename!=='render_jobs').every(row=>row.qual.includes('regulatory_programs'))).toBe(true);
  });
  it('enforces tenant isolation for raw reads, updates and inserts without application org predicates',async()=> {
    const res=await get('/native-shadow-policy');expect(res.status,JSON.stringify(res.body)).toBe(200);
    expect(res.body.observations).toEqual([
      {name:'packet',selected:[packet],ownUpdate:1,foreignUpdate:0,ownInsert:1,foreignInsertCode:'42501'},
      {name:'proof',selected:[proof],ownUpdate:1,foreignUpdate:0,ownInsert:1,foreignInsertCode:'42501'},
      {name:'render',selected:[render],ownUpdate:1,foreignUpdate:0,ownInsert:1,foreignInsertCode:'42501'},
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fails closed for an independent non-superuser connection with no tenant scope',async()=> {
    const identity=(await unscoped.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(identity).toMatchObject({role:'app_service',rolsuper:false,rolbypassrls:false});
    for(const sql of ['SELECT id FROM predicate.defense_packets','SELECT id FROM predicate.proof_pack_exports','SELECT id FROM predicate.render_jobs']) {
      expect((await unscoped.query(sql)).rows).toEqual([]);
    }
    expect((await unscoped.query('UPDATE predicate.defense_packets SET created_at=created_at WHERE id=$1 RETURNING id',[foreignPacket])).rows).toEqual([]);
    await expect(unscoped.query(`INSERT INTO predicate.render_jobs(id,proof_pack_id,artifact_type,status,inputs_hash)
      VALUES ($1,$2,'defense_packet_docx','QUEUED',$3)`,[randomUUID(),proof,hash(randomUUID())])).rejects.toMatchObject({code:'42501'});
  });
});
describe('Shadow remote object bindings and fresh admission',()=> {
  it('admits the exact own packet, using the actual schema and programme UUID',async()=> {
    const body={packet:{id:packet,program_id:program,manifest_hash:packetHash,status:'CREATED'}};
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body),{status:200}));
    const res=await get(base(`defense-packet/${packet}`)); expect(res.status,JSON.stringify(res.body)).toBe(200); expect(res.body).toEqual(body); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(projectId).toBeGreaterThan(0);
  });
  it('refuses foreign or another programme packet IDs before outbound shared-token requests',async()=> {
    for(const id of [foreignPacket,privatePacket,randomUUID()]) { const res=await get(base(`defense-packet/${id}`)); expect(res.status,JSON.stringify(res.body)).toBe(404); }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('honors private project membership and immediate grant/revocation',async()=> {
    expect((await get(base(`defense-packet/${privatePacket}`,privateProgram))).status).toBe(403);
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status,invited_by_id,accepted_at)
      VALUES ($1,$2,$3,'use','active',$4,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET status='active'`,[ORG,privateProjectId,userId,otherId]);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({packet:{id:privatePacket,program_id:privateProgram}}),{status:200}));
    expect((await get(base(`defense-packet/${privatePacket}`,privateProgram))).status).toBe(200);
    await owner.query("UPDATE project_members SET status='removed' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3",[ORG,privateProjectId,userId]);
    fetchMock.mockClear(); expect((await get(base(`defense-packet/${privatePacket}`,privateProgram))).status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects foreign programmes before an object lookup can grant access',async()=> {
    expect((await get(base(`defense-packet/${foreignPacket}`,foreignProgram))).status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('binds proof exports to both the requested programme and their actual parent packet',async()=> {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({proof_pack_id:proof,manifest_hash:packetHash}),{status:200}));
    expect((await get(base(`proof-pack/${proof}/verify`))).status).toBe(200); fetchMock.mockClear();
    for(const id of [foreignProof,mismatchedProof,randomUUID()]) expect((await get(base(`proof-pack/${id}/verify`))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('binds rendered binary jobs through both programme identities and the proof packet',async()=> {
    const bytes=Buffer.from('synthetic-docx-bytes');
    fetchMock.mockImplementation(async()=>new Response(bytes,{status:200,headers:{'Content-Type':'application/octet-stream','X-Artifact-Hash':hash('synthetic-docx-bytes')}}));
    const res=await get(base(`render/${render}/download`)); expect(res.status,JSON.stringify(res.body)).toBe(200); expect(res.body).toEqual(bytes); fetchMock.mockClear();
    expect((await get(base(`render/${mismatchedRender}/download`))).status).toBe(404); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps unavailable verification distinct from missing records and recovers',async()=> {
    failBindings=true; const unavailable=await get(base(`defense-packet/${packet}`)); expect(unavailable.status).toBe(503); expect(unavailable.body.code).toBe('SHADOW_BINDING_UNAVAILABLE'); expect(fetchMock).not.toHaveBeenCalled();
    failBindings=false; fetchMock.mockResolvedValue(new Response(JSON.stringify({packet:{id:packet,program_id:program}}),{status:200})); expect((await get(base(`defense-packet/${packet}`))).status).toBe(200);
  });
  it('refuses a newly demoted lead before an external status mutation',async()=> {
    afterAdmission='viewer';
    try {
      const res=await request(app).post(base(`defense-packet/${packet}/staleness-check`)).set('Authorization',`Bearer ${token}`).send({});
      expect(res.status,JSON.stringify(res.body)).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
    } finally { afterAdmission='none'; await owner.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2",[ORG,userId]); }
  });
  it('refreshes membership after genuine auth admission and refuses removal before outbound reads',async()=> {
    afterAdmission='remove-member';
    try {
      const res=await get(base(`defense-packet/${packet}`)); expect(res.status,JSON.stringify(res.body)).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
    } finally { afterAdmission='none'; await owner.query(`INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES ($1,$2,'member',now()-interval '1 day')
      ON CONFLICT(user_id,organization_id) DO UPDATE SET role='member',created_at=EXCLUDED.created_at`,[ORG,userId]); }
  });

});
