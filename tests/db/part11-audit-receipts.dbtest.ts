/** Native canonical audit receipts on the deployed schema.
 * The retired Part11 generic-device/RBAC/validation APIs had no production
 * callers. This companion now qualifies their actual canonical audit replacement,
 * including real tenant-position refusals and unknown COMMIT physical eviction.
 * This is a service/job proof, not JWT/UI or signature-path qualification.
 * Every run creates fresh synthetic tenants; all immutable history is retained.
 * No migrations, DDL, grant changes, policy changes or history cleanup occur.
 */
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Request } from 'express';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import { applySessionScope } from '../../server/db/sessionScope';
import { requestConnectable } from '../../server/db/requestDb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { getTenantScope, runWithOrgJobScope } from '../../server/db/tenantStore';
import { shouldUseSsl } from '../../server/db/ssl';

let ORG: number, SECONDARY_ORG: number;
const TAG=`synthetic-part11-receipt-${randomUUID().slice(0,12)}`;
// Preserve supplied synthetic runner keys so retained shared test chains keep
// their signing namespace. Public fallbacks cover isolated unconfigured runs.
const CHAIN_KEY=process.env.AUDIT_HMAC_KEY||'synthetic-part11-device-receipt-chain-fixture-only-20261014';
const TAMPER_KEY=process.env.AUDIT_HMAC_SECRET||'synthetic-part11-device-receipt-tamper-fixture-only-20261014';
type Fault='none'|'mirror'|'both';
let fault:Fault='none';
let owner:Pool, runtime:Pool, shared:Pool;
let realQuery:Pool['query'], realConnect:Pool['connect'];
let recordAuditRow:typeof import('../../server/services/audit/audit-write-outcome').recordAuditRow;
let audit:typeof import('../../server/services/auditService').default;
let userId:number;
let refusedCodes:string[]=[];
let tamperScopeRefusals=0;
let tamperFault:{mockRestore:()=>void}|undefined;
let actorScopes:Array<{tenant:string|undefined;source:string|undefined}>=[];

function parts(args:unknown[]){
  const first=args[0];
  const config=first&&typeof first==='object'&&'text'in first?first as {text:string;values?:unknown[]}:undefined;
  return {text:typeof first==='string'?first:config?.text??'',values:Array.isArray(args[1])?args[1] as unknown[]:config?.values,config};
}
function retarget(args:unknown[],table:'audit_logs'){
  const {text,values,config}=parts(args);
  const match=/^\s*insert\s+into\s+(?:(?:"?audit"?)\.)?"?(device_audit_trail|audit_logs|tamper_proof_log)"?\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(text);
  const expected=table.split('.').at(-1);
  if(!match||match[1].toLowerCase()!==expected||!values)return args;
  const columns=match[2].split(',').map(value=>value.replaceAll('"','').trim());
  const column='tenant_id';
  const placeholder=match[3].split(',')[columns.indexOf(column)]?.trim();
  if(!placeholder||!/^\$\d+$/.test(placeholder))throw new Error('Native fault control could not locate the actual tenant parameter');
  const index=Number(placeholder.slice(1))-1;
  if(values[index]!==ORG)return args;
  const next=[...values];next[index]=SECONDARY_ORG;
  return config&&!Array.isArray(args[1])?[{...config,values:next},...args.slice(1)]:[args[0],next,...args.slice(2)];
}
function controlledArgs(args:unknown[]){
  const {text}=parts(args);
  if(/^\s*INSERT INTO audit_logs/i.test(text)){
    actorScopes.push({tenant:getTenantScope()?.tenantId,source:getTenantScope()?.source});
    if(fault==='mirror'||fault==='both')return retarget(args,'audit_logs');
  }

  return args;
}
async function delegated(target:unknown,fn:(...args:unknown[])=>unknown,args:unknown[]){
  try{return await Reflect.apply(fn,target,controlledArgs(args));}
  catch(error){if((error as {code?:string}).code)refusedCodes.push(String((error as {code?:string}).code));throw error;}
}
function wrapClient(client:PoolClient){
  const query=client.query;
  const release=client.release;
  client.query=((...args:unknown[])=>delegated(client,query as (...args:unknown[])=>unknown,args)) as typeof client.query;
  client.release=((...args:unknown[])=>{
    client.query=query;client.release=release;
    return Reflect.apply(release,client,args);
  }) as typeof client.release;
  return client;
}
const scoped=<T>(org:number,fn:()=>T)=>runWithOrgJobScope(org,'native-canonical-audit-receipts',fn);
const create=(action=`${TAG}-${randomUUID()}`)=>scoped(ORG,()=>recordAuditRow({organizationId:ORG,userId,action,resourceType:'organization',resourceId:ORG,
  details:{syntheticFixture:TAG}}));
const mirrorRows=(action:string)=>owner.query('SELECT * FROM audit_logs WHERE tenant_id=$1 AND action=$2',[ORG,action]).then(result=>result.rows);
const tamperRows=(action:string)=>owner.query('SELECT * FROM audit.tamper_proof_log WHERE organization_id=$1 AND action=$2',[ORG,action]).then(result=>result.rows);

beforeAll(async()=>{
  if(!process.env.APP_DATABASE_URL)throw new Error('APP_DATABASE_URL must identify the least-privileged deployed runtime.');
  vi.stubEnv('AUDIT_HMAC_KEY',CHAIN_KEY);vi.stubEnv('AUDIT_HMAC_SECRET',TAMPER_KEY);
  owner=new Pool({connectionString:databaseUrl,max:3});runtime=new Pool({connectionString:process.env.APP_DATABASE_URL,max:2,options:'-c app.rls_enforce=on'});
  const identity=(await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  expect(identity).toEqual({role:'app_service',rolsuper:false,rolbypassrls:false});
  // Plaintext local CI is a distinct posture; production and TLS URLs stay strict.
  expect((await runtime.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  expect((await runtime.query("SELECT current_setting('app.rls_enforce',true) AS enforcement")).rows[0].enforcement).toBe('on');
  ORG=Number((await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$2,'active') RETURNING id",[TAG,`${TAG}-primary`])).rows[0].id);
  SECONDARY_ORG=Number((await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$2,'active') RETURNING id",[`${TAG} secondary`,`${TAG}-secondary`])).rows[0].id);
  userId=Number((await owner.query(`INSERT INTO users(email,name,password_hash,status,default_organization_id)
    VALUES($1,'Synthetic current audit member','unused-synthetic-hash','active',$2) RETURNING id`,[`${TAG}-member@example.invalid`,ORG])).rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$3,'member'),($2,$3,'manager')",[ORG,SECONDARY_ORG,userId]);
  recordAuditRow=(await import('../../server/services/audit/audit-write-outcome')).recordAuditRow;
  audit=(await import('../../server/services/auditService')).default;
  shared=(await import('../../server/db/runtime')).getPool();realQuery=shared.query;realConnect=shared.connect;
  const {getTamperProofAuditLog}=await import('../../server/lib/tamper-proof-audit');
  const tamper=getTamperProofAuditLog(shared);const realTamper=tamper.log.bind(tamper);
  tamperFault=vi.spyOn(tamper,'log').mockImplementation(async(event,action,details,context)=>{
    try{return await realTamper(event,action,details,fault==='both'?{...context,organizationId:SECONDARY_ORG}:context);}
    catch(error){if((error as Error).name==='TenantScopeMismatchError')tamperScopeRefusals++;throw error;}
  });
  shared.query=((...args:unknown[])=>delegated(shared,realQuery as (...args:unknown[])=>unknown,args)) as typeof shared.query;
  shared.connect=((...args:unknown[])=>{
    // pg.Pool.query uses callback connect; leave that primary query path to
    // the explicit query seam above. Canonical mirror writers await connect.
    if(args.length)return Reflect.apply(realConnect,shared,args);
    return (Reflect.apply(realConnect,shared,args) as Promise<PoolClient>).then(wrapClient);
  }) as typeof shared.connect;
});
beforeEach(()=>{fault='none';refusedCodes=[];tamperScopeRefusals=0;actorScopes=[];});
afterAll(async()=>{
  fault='none';tamperFault?.mockRestore();if(shared){shared.query=realQuery;shared.connect=realConnect;await shared.end();}
  await runtime?.end();await owner?.end();vi.unstubAllEnvs();
  // Retain all synthetic immutable audit/HMAC evidence. No trigger,
  // signed row, audit chain, grant or policy is altered for cleanup.
});

function registerCanonicalAuditReceiptsCases() {
  it('uses the configured transport, enforced native RLS and ordinary job ALS without role elevation',async()=>{
    const tables=(await owner.query(`SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.oid IN ('audit_logs'::regclass,'audit.tamper_proof_log'::regclass,'organization_users'::regclass,'users'::regclass)`)).rows;
    expect(tables).toHaveLength(4);expect(tables.filter(row=>row.nspname==='public').every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
    expect(tables.find(row=>row.nspname==='audit')).toMatchObject({relrowsecurity:false,relforcerowsecurity:false});
    expect((await runtime.query("SELECT has_table_privilege(current_user,'audit.tamper_proof_log','SELECT,INSERT') AS append,has_table_privilege(current_user,'audit.tamper_proof_log','UPDATE') AS update,has_table_privilege(current_user,'audit.tamper_proof_log','DELETE') AS delete")).rows[0]).toEqual({append:true,update:false,delete:false});
    const scope=await scoped(ORG,async()=>{
      const row=(await shared.query("SELECT current_user AS role,current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_user_role',true) AS policy_role")).rows[0];
      return {...row,als:getTenantScope()?.tenantId,source:getTenantScope()?.source};
    });
    expect(scope).toMatchObject({role:'app_service',tenant:String(ORG),als:String(ORG),source:'job'});expect(['','null',null]).toContain(scope.policy_role);
  });
  it('writes both correctly attributed HMAC audit stores and returns their actual receipt',async()=>{
    const action=`${TAG}-healthy`;const result=await create(action);
    expect(result).toEqual({persisted:true,chained:true});
    const mirror=await mirrorRows(action);expect(mirror).toHaveLength(1);
    expect(mirror[0]).toMatchObject({tenant_id:ORG,user_id:userId,table_name:'organization',record_id:String(ORG)});
    expect(mirror[0].new_values).toMatchObject({syntheticFixture:TAG});expect(mirror[0].hmac_seal).toMatch(/^[a-f0-9]{64}$/);
    const tamper=await tamperRows(action);expect(tamper).toHaveLength(1);expect(tamper[0]).toMatchObject({organization_id:ORG,user_id:String(userId),resource_type:'organization',resource_id:String(ORG)});expect(tamper[0].signature).toMatch(/^[a-f0-9]{64}$/);
    const {verifyAuditChain,verifyAuditChainSeals}=await import('../../server/services/audit/chain');const client=await owner.connect();
    try{expect(await verifyAuditChain(client,{tenantId:ORG})).toMatchObject({ok:true});expect(await verifyAuditChainSeals(client,{tenantId:ORG})).toMatchObject({valid:true});}finally{client.release();}
    const {verifyTamperProofLogRows}=await import('../../server/lib/tamper-proof-audit');
    expect(verifyTamperProofLogRows(tamper,{hmacSecret:TAMPER_KEY,expectedPreviousHash:tamper[0].previous_hash})).toMatchObject({valid:true,signedEntries:1});
    expect(actorScopes).toEqual([{tenant:String(ORG),source:'job'}]);
  });
  it('a real chained-store tenant-position refusal is exposed as tamper-only persistence',async()=>{
    fault='mirror';const action=`${TAG}-mirror-refused`;const result=await create(action);
    expect(result).toEqual({persisted:true,chained:false});expect(refusedCodes).toContain('23000');
    expect(await mirrorRows(action)).toEqual([]);expect(await tamperRows(action)).toHaveLength(1);
  });
  it('real database and software tenant guards refusing both stores return bounded loss and allow a new independent write',async()=>{
    fault='both';const action=`${TAG}-both-refused`;const result=await create(action);
    expect(result).toMatchObject({persisted:false,code:'AUDIT_ROW_NOT_PERSISTED'});expect(refusedCodes).toContain('23000');expect(tamperScopeRefusals).toBe(1);
    expect(await mirrorRows(action)).toEqual([]);expect(await tamperRows(action)).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/row-level security|new row violates|42501/);
    fault='none';expect(await create(`${TAG}-recovered`)).toEqual({persisted:true,chained:true});
  });
  it('a thrown canonical writer returns a safe loss receipt without inventing a row',async()=>{
    const seam=vi.spyOn(audit,'logAction').mockRejectedValueOnce(new Error('Private native injected mirror failure'));
    const action=`${TAG}-throw`;
    try{const result=await create(action);expect(result).toMatchObject({persisted:false});expect(await mirrorRows(action)).toEqual([]);expect(await tamperRows(action)).toEqual([]);expect(JSON.stringify(result)).not.toContain('Private native');}
    finally{seam.mockRestore();}
    expect(await create(`${TAG}-throw-recovery`)).toEqual({persisted:true,chained:true});
  });
}

function registerUnknownCommitCase() {
  it('an actual post-commit audit acknowledgement loss stays unconfirmed and evicts the physical borrowed request client',async()=>{
    const {readCsrProjectActor}=await import('../../server/services/csr/project-scope');
    const actor=await scoped(ORG,()=>readCsrProjectActor(shared,ORG,userId));
    const orgUuid=String((await owner.query('SELECT uuid::text FROM organizations WHERE id=$1',[ORG])).rows[0].uuid);
    const lazy=new LazyRequestDbClient(shared,client=>applySessionScope(client,{tenantId:String(ORG),role:actor.role,orgUuid}));
    const original=lazy.query.bind(lazy);const statements:string[]=[];let pid:number|undefined;
    Object.defineProperty(lazy,'query',{configurable:true,value:async(...args:unknown[])=>{
      const {text}=parts(args);statements.push(text);const result=await Reflect.apply(original,lazy,args);
      if(text==='BEGIN')pid=Number((await original('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      if(text==='COMMIT')throw new Error('Synthetic acknowledgement loss after actual native audit COMMIT');
      return result;
    }});
    const {recordAuditRow}=await import('../../server/services/audit/audit-write-outcome');
    const action=`${TAG}-unconfirmed-postcommit`;
    const result=await scoped(ORG,()=>recordAuditRow({organizationId:ORG,userId,action,resourceType:'organization',resourceId:ORG,details:{syntheticFixture:TAG}},
      requestConnectable({dbClient:lazy} as unknown as Request)));
    expect(result).toMatchObject({persisted:false,code:'AUDIT_ROW_NOT_PERSISTED',unconfirmed:true});
    expect(statements).toContain('COMMIT');expect(statements).not.toContain('ROLLBACK');
    expect(await mirrorRows(action)).toHaveLength(1);expect(pid).toBeGreaterThan(0);
    await expect(lazy.query('SELECT 1')).rejects.toThrow(/Cannot query a (released|discarded) request DB client/);
    await vi.waitFor(async()=>expect((await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1',[pid])).rows).toEqual([]));
  });

}

describe('native canonical Part11 audit receipts',()=> {
  registerCanonicalAuditReceiptsCases();
  registerUnknownCommitCase();
});
