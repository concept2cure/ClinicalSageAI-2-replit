import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
const h=vi.hoisted(()=>({query:vi.fn(),connect:vi.fn(),release:vi.fn(),commitFailure:false,role:'admin'}));
vi.mock('../../db.js',()=>({pool:{query:h.query,connect:h.connect}}));
vi.mock('../../db',()=>({pool:{query:h.query,connect:h.connect}}));
vi.mock('../../lib/tamper-proof-audit',async(original)=>({...await original<typeof import('../../lib/tamper-proof-audit')>(),getTamperProofAuditLog:()=>({initialize:async()=>{}})}));
vi.mock('../../auth.js',async(original)=>({...await original<typeof import('../../auth.js')>(),
  authMiddleware:(req:Request,_res:Response,next:NextFunction)=>{req.tenantId=7;req.userId=3;req.userRole=h.role;req.dbClient={query:h.query,discard:async(reason:Error)=>{h.release(reason);}} as never;next();},
}));
import { generateApiKey, revokeApiKey, validateApiKey, listApiKeys } from '../api-key-service';
import apiKeys from '../../routes/api-keys';
const app=express();app.use(express.json());app.use('/api/api-keys',apiKeys);
let database:PGlite;
interface StoredKeyRow { key_hash: string }
interface LifecycleAuditRow { sha256_chain: string; hmac_seal: string | null; new_values: Record<string, unknown> }
const fixtureKey='csai_fixture_EXPIRED_ACCESS_KEY_NEVER_AUDITED';
const fixtureHash=createHash('sha256').update(fixtureKey).digest('hex');
beforeAll(async()=>{
  database=new PGlite();
  await database.exec(AUDIT_LOGS_PGLITE_DDL);
  await database.exec(readFileSync(new URL('../../../migrations/20260921_audit_logs_chain_seq.sql',import.meta.url),'utf8'));
  await database.exec(`CREATE TABLE api_keys (id serial PRIMARY KEY,uuid uuid DEFAULT gen_random_uuid(),organization_id integer,name text,key_hash text,key_prefix text,scopes json,status text,
    expires_at timestamptz,rate_limit integer,metadata json,created_by integer,created_at timestamptz,revoked_at timestamptz,last_used_at timestamptz,request_count integer DEFAULT 0);
    CREATE FUNCTION refuse_key_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('fixture.refuse_key_audit',true)='on' THEN RAISE EXCEPTION 'fixture private audit outage'; END IF; RETURN NEW;
    END $$;
    CREATE TRIGGER refuse_key_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION refuse_key_audit();`);
  h.query.mockImplementation(async(sql:string,values?:unknown[])=>{
    const result=await database.query(sql,values);
    if(sql==='COMMIT' && h.commitFailure)throw new Error('fixture lost commit response');
    return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};
  });
  h.connect.mockImplementation(async()=>({query:h.query,release:h.release}));
},60_000);
afterAll(async()=>{vi.unstubAllEnvs();await database.close();});
beforeEach(async()=>{
  vi.stubEnv('AUDIT_HMAC_KEY','audit-key-lifecycle-fixture-only');h.commitFailure=false;h.role='admin';h.release.mockClear();
  await database.exec(`TRUNCATE api_keys,audit_logs RESTART IDENTITY; SELECT set_config('fixture.refuse_key_audit','off',false);`);
});

describe('O01 actual issuer route never conflates audited commit, rollback and uncertain handover',()=>{
  it('only authenticated tenant/actor mint and audit, and raw plaintext never reaches the list or audit',async()=>{
    const result=await request(app).post('/api/api-keys').send({name:'Owned integration',scopes:['documents:read'],reason:'Approved integration',organizationId:8,userId:999});
    expect(result.status).toBe(201);expect(result.body.apiKey).toMatch(/^csai_/);
    expect(result.body.meta.auditTrail).toEqual({persisted:true,chained:true});
    const key=(await database.query('SELECT organization_id,created_by FROM api_keys')).rows[0];
    expect(key).toMatchObject({organization_id:7,created_by:3});
    const audits=(await database.query('SELECT * FROM audit_logs')).rows;
    expect(audits).toHaveLength(1);expect(JSON.stringify(audits)).not.toContain(result.body.apiKey);
    const list=await request(app).get('/api/api-keys');
    expect(JSON.stringify(list.body)).not.toContain(result.body.apiKey);
  });
  it('audit failure is a sanitized503 with no secret or key row, while commit uncertainty never claims rollback',async()=>{
    await database.exec(`SELECT set_config('fixture.refuse_key_audit','on',false)`);
    const refusal=await request(app).post('/api/api-keys').send({name:'Integration',scopes:['documents:read'],reason:'Approved integration'});
    expect(refusal.status).toBe(503);expect(refusal.body.code).toBe('API_KEY_LIFECYCLE_UNAVAILABLE');
    expect(refusal.body.apiKey).toBeUndefined();expect(JSON.stringify(refusal.body)).not.toMatch(/fixture private|csai_/);
    expect((await database.query('SELECT id FROM api_keys')).rows).toEqual([]);
    await database.exec(`SELECT set_config('fixture.refuse_key_audit','off',false)`);h.commitFailure=true;
    const uncertain=await request(app).post('/api/api-keys').send({name:'Integration',scopes:['documents:read'],reason:'Approved integration'});
    expect(uncertain.status).toBe(503);expect(uncertain.body.code).toBe('API_KEY_COMMIT_UNCONFIRMED');expect(uncertain.body.apiKey).toBeUndefined();
    expect(uncertain.body.error).toMatch(/Check the key list/);expect(uncertain.body.error).not.toMatch(/No change was applied/);
    expect((await database.query('SELECT id FROM api_keys')).rows).toHaveLength(1);
  });
  it('the canonical administrator gate refuses a nonadministrator before key or audit mutation',async()=>{
    h.role='viewer';
    const result=await request(app).post('/api/api-keys').send({name:'Integration',scopes:['documents:read'],reason:'Approved integration',role:'super_admin'});
    expect(result.status).toBe(403);expect((await database.query('SELECT id FROM api_keys')).rows).toEqual([]);
    expect((await database.query('SELECT id FROM audit_logs')).rows).toEqual([]);
  });
});
const issue=()=>generateApiKey({organizationId:7,name:'Integration',scopes:['documents:read'],createdBy:3,rateLimit:60,auditContext:{reason:'Approved integration',ipAddress:'192.0.2.1'}});
async function seededExpired(){await database.query(`INSERT INTO api_keys (organization_id,name,key_hash,key_prefix,scopes,status,expires_at,created_by,created_at)
  VALUES (7,'Expired integration',$1,'csai_fixture','["documents:read"]','active',now()-interval '1 day',3,now())`,[fixtureHash]);}

describe('O01 actual API-key mutation and chained audit share one transaction',()=>{
  it('commits hash-only issuance with the canonical sealed actor/reason/scopes row',async()=>{
    const key=await issue();
    const stored=(await database.query<StoredKeyRow>('SELECT * FROM api_keys')).rows[0];
    const audit=(await database.query<LifecycleAuditRow>('SELECT * FROM audit_logs')).rows[0];
    expect(stored.key_hash).toBe(createHash('sha256').update(key.rawKey).digest('hex'));
    expect(audit).toMatchObject({tenant_id:7,user_id:3,action:'api_key_created',record_id:String(key.keyId),reason:'Approved integration'});
    expect(audit.sha256_chain).toMatch(/^[a-f0-9]{64}$/);expect(audit.hmac_seal).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.new_values).toMatchObject({reason:'Approved integration',scopes:['documents:read'],keyPrefix:key.keyPrefix});
    expect(JSON.stringify(audit)).not.toContain(key.rawKey);
    expect(JSON.stringify(await listApiKeys(7))).not.toContain(key.rawKey);
    expect(JSON.stringify(await listApiKeys(7))).not.toContain(stored.key_hash);
  });
  it('an actual audit INSERT rejection rolls back the minted hash and returns no secret',async()=>{
    await database.exec(`SELECT set_config('fixture.refuse_key_audit','on',false)`);
    await expect(issue()).rejects.toMatchObject({code:'API_KEY_LIFECYCLE_UNAVAILABLE'});
    expect((await database.query('SELECT id FROM api_keys')).rows).toEqual([]);
    expect((await database.query('SELECT id FROM audit_logs')).rows).toEqual([]);
  });
  it('an unavailable canonical chain cannot leave an unaudited key',async()=>{
    await database.exec('ALTER TABLE audit_logs RENAME TO fixture_unavailable_audit_logs');
    try {
      await expect(issue()).rejects.toMatchObject({code:'API_KEY_LIFECYCLE_UNAVAILABLE'});
      expect((await database.query('SELECT id FROM api_keys')).rows).toEqual([]);
    } finally { await database.exec('ALTER TABLE fixture_unavailable_audit_logs RENAME TO audit_logs'); }
  });
  it('a lost commit response stays explicitly uncertain rather than claiming rollback or returning a secret',async()=>{
    h.commitFailure=true;
    await expect(issue()).rejects.toMatchObject({code:'API_KEY_COMMIT_UNCONFIRMED'});
    expect((await database.query('SELECT id FROM api_keys')).rows).toHaveLength(1);
    expect((await database.query('SELECT id FROM audit_logs')).rows).toHaveLength(1);
  });
});

describe('O01 revocation and expiration remain tenant-bound audited transitions',()=>{
  it('refuses a foreign revocation without mutating either tenant, then audits the authorized revocation',async()=>{
    const key=await issue();
    expect(await revokeApiKey(key.keyId,8,{userId:4})).toBe(false);
    expect((await database.query<{ status: string }>('SELECT status FROM api_keys')).rows[0].status).toBe('active');
    expect(await revokeApiKey(key.keyId,7,{userId:3,reason:'Integration retired'})).toBe(true);
    expect((await database.query<{ action: string }>('SELECT action FROM audit_logs ORDER BY chain_seq')).rows.map(row=>row.action)).toEqual(['api_key_created','api_key_revoked']);
    expect((await database.query<{ status: string }>('SELECT status FROM api_keys')).rows[0].status).toBe('revoked');
  });
  it('an audit outage leaves revocation unapplied and recovery records it once',async()=>{
    const key=await issue();await database.exec(`SELECT set_config('fixture.refuse_key_audit','on',false)`);
    await expect(revokeApiKey(key.keyId,7,{userId:3})).rejects.toMatchObject({code:'API_KEY_LIFECYCLE_UNAVAILABLE'});
    expect((await database.query<{ status: string }>('SELECT status FROM api_keys')).rows[0].status).toBe('active');
    await database.exec(`SELECT set_config('fixture.refuse_key_audit','off',false)`);
    expect(await revokeApiKey(key.keyId,7,{userId:3})).toBe(true);
    expect((await database.query(`SELECT id FROM audit_logs WHERE action='api_key_revoked'`)).rows).toHaveLength(1);
  });
  it('expired access refuses on an audit outage, then records the expiration exactly once on recovery',async()=>{
    await seededExpired();await database.exec(`SELECT set_config('fixture.refuse_key_audit','on',false)`);
    await expect(validateApiKey(fixtureKey)).rejects.toMatchObject({code:'API_KEY_LIFECYCLE_UNAVAILABLE'});
    expect((await database.query<{ status: string }>('SELECT status FROM api_keys')).rows[0].status).toBe('active');
    await database.exec(`SELECT set_config('fixture.refuse_key_audit','off',false)`);
    expect(await validateApiKey(fixtureKey)).toMatchObject({valid:false,reason:'API key has expired'});
    expect(await validateApiKey(fixtureKey)).toMatchObject({valid:false,reason:'API key has expired'});
    const audits=(await database.query(`SELECT * FROM audit_logs WHERE action='api_key_expired'`)).rows;
    expect(audits).toHaveLength(1);expect(JSON.stringify(audits)).not.toContain(fixtureKey);
    expect((await database.query<{ status: string }>('SELECT status FROM api_keys')).rows[0].status).toBe('expired');
  });
});
