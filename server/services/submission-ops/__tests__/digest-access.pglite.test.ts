/** Real SQL and mounted digest handlers on the deployed creator DDL.
 * JWT/RLS/HMAC and physical connection eviction are qualified in the native lane. */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestConnectable } from '../../../db/requestDb';

const audit=vi.hoisted(()=>vi.fn());
const state=vi.hoisted(()=>({ db:undefined as unknown as ReturnType<typeof import('drizzle-orm/pglite').drizzle>,
  sharedQuery:vi.fn(), userId:2, context:true }));
vi.mock('../../../db',()=>({ get db(){return state.db;},pool:{query:state.sharedQuery},getPool:()=>({query:state.sharedQuery}) }));
vi.mock('../../auditService',()=>({ writeChainedAuditRow:(...args:unknown[])=>audit(...args),default:{logAction:vi.fn()} }));

import router from '../../../routes/submission-ops';
import { listRecipientDigests, markRecipientDigestRead } from '../digest-access';

let pg:PGlite;
const statements:string[]=[];
const releases:Array<Error|undefined>=[];
const discards:Error[]=[];
let fault:'none'|'before'|'after'='none';
let afterQuery:((text:string)=>Promise<void>)|undefined;
const PROGRAM='11111111-1111-4111-8111-111111111111';
const PRIVATE='22222222-2222-4222-8222-222222222222';
const FOREIGN='33333333-3333-4333-8333-333333333333';

type QueryInput=string|{text:string;rowMode?:string};
type DriverRows<T> = T extends string ? Record<string,unknown>[] : unknown[];
async function query<T extends QueryInput>(input:T,values?:unknown[]):Promise<{rows:DriverRows<T>}> {
  const text=typeof input==='string' ? input : input.text;
  statements.push(text);
  if (text==='COMMIT' && fault==='before') throw new Error('Synthetic lost commit dispatch');
  const result=await pg.query<Record<string,unknown>>(text,values);
  if (afterQuery) await afterQuery(text);
  if (text==='COMMIT' && fault==='after') throw new Error('Synthetic lost commit reply');
  const rows=typeof input!=='string' && input.rowMode==='array'
    ? result.rows.map(row=>result.fields.map(field=>row[field.name])) : result.rows;
  return { ...result,rows:rows as DriverRows<T> };
}
const persistence:RequestConnectable={query,connect:async()=>({query,release:error=>{releases.push(error);}})};
const actor={organizationId:7,userId:2};

function app() {
  const instance=express();instance.use(express.json());
  instance.use((req,_res,next)=>{
    req.user={id:state.userId,organizationId:7,role:'admin'}; // stale claim, never authority
    req.userId=state.userId;req.tenantContext={organizationId:7};
    if (state.context) req.dbClient={query,discard:async(error:Error)=>{discards.push(error);}} as unknown as NonNullable<typeof req.dbClient>;
    next();
  });
  instance.use('/api/submission-ops',router);return instance;
}

beforeAll(async()=>{
  pg=new PGlite();state.db=drizzle(pg);
  await pg.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,
      status text,client_workspace_id int,owner_id int,created_by_id int,settings jsonb DEFAULT '{}');
    CREATE TABLE project_visibility_settings(id serial,project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(id serial,project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(id serial,artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,organization_id int,project_id int);
    CREATE TABLE c2c_submission_packages(id int PRIMARY KEY);
    CREATE TABLE synthetic_digest_audits(id serial,action text,digest_id text,actor_id int);
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(1,'active'),(2,'active'),(3,'active');
  `);
  const creator=readFileSync('migrations/0002_phase15_submission_ops.sql','utf8')
    .match(/CREATE TABLE IF NOT EXISTS c2c_digests \([\s\S]*?\n\);/)?.[0];
  if (!creator) throw new Error('Actual digest creator DDL missing');
  await pg.exec(creator);
  await pg.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,7),($2,7),($3,8)',[PROGRAM,PRIVATE,FOREIGN]);
  await pg.query(`INSERT INTO projects(id,organization_id,regulatory_program_id,status,client_workspace_id,owner_id,created_by_id)
    VALUES(71,7,$1,'active',1,1,1),(72,7,$2,'active',1,1,1),(73,7,NULL,'active',1,1,1),(81,8,$3,'active',2,3,3)`,[PROGRAM,PRIVATE,FOREIGN]);
  await pg.exec("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(71,7,'private'),(72,7,'private'),(73,7,'private'),(81,8,'private')");
});
beforeEach(async()=>{
  // In-process fixture transport has no physical socket. Reset its interrupted
  // synthetic transaction directly; service statements remain separately observed.
  await pg.exec('ROLLBACK');
  await pg.exec(`DELETE FROM c2c_digests;DELETE FROM synthetic_digest_audits;DELETE FROM organization_users;DELETE FROM project_members;
    UPDATE users SET status='active';UPDATE organizations SET status='active';UPDATE regulatory_programs SET deleted_at=NULL;
    INSERT INTO organization_users VALUES(7,1,'member'),(7,2,'viewer'),(7,3,'member');
    INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(71,7,2,'use','active');
    INSERT INTO c2c_digests(digest_id,org_id,project_id,digest_type,recipient_user_id,title,sections) VALUES
      ('own',7,71,'daily_review',2,'Own retained digest','["Own retained context"]'),
      ('other-recipient',7,71,'daily_review',1,'Other recipient secret','["Other recipient private context"]'),
      ('private-parent',7,72,'daily_review',2,'Unassigned project secret','["Unassigned private context"]'),
      ('foreign',8,81,'daily_review',2,'Foreign tenant secret','["Foreign retained context"]');`);
  state.userId=2;state.context=true;state.sharedQuery.mockReset().mockRejectedValue(new Error('Shared pool must not serve digest requests'));
  statements.length=0;releases.length=0;discards.length=0;fault='none';afterQuery=undefined;
  audit.mockReset().mockImplementation(async(q:RequestConnectable,entry:{action:string;resourceId:string;userId:number})=>{
    await q.query('INSERT INTO synthetic_digest_audits(action,digest_id,actor_id) VALUES($1,$2,$3)',[entry.action,entry.resourceId,entry.userId]);
  });
});
afterAll(async()=>{await pg?.close();});

describe('retained digest HTTP admission',()=>{
  it('lists only the actual recipient’s currently accessible canonical project, with truthful generation availability',async()=>{
    const result=await request(app()).get('/api/submission-ops/digests');
    expect(result.status).toBe(200);expect(result.body.data.map((d:{digestId:string})=>d.digestId)).toEqual(['own']);
    expect(result.body.meta.digestGeneration).toMatchObject({status:'unavailable',code:'DIGEST_GENERATION_UNAVAILABLE'});
    expect(JSON.stringify(result.body)).not.toMatch(/Other recipient|Unassigned|Foreign/);
    expect(state.sharedQuery).not.toHaveBeenCalled();
  });
  it('lets a current viewer record their own read receipt and awaits the enlisted audit',async()=>{
    const result=await request(app()).post('/api/submission-ops/digests/own/read');
    expect(result.status).toBe(200);expect(result.body.data).toMatchObject({digestId:'own',status:'read'});
    expect(result.body.meta).toMatchObject({readReceipt:'marked_read',auditTrail:{persisted:true,chained:true}});
    expect((await pg.query('SELECT actor_id FROM synthetic_digest_audits')).rows).toEqual([{actor_id:2}]);
  });
  it.each(['other-recipient','private-parent','foreign','missing'])('refuses %s read marking before returning private content',async id=>{
    const result=await request(app()).post(`/api/submission-ops/digests/${id}/read`);
    expect(result.status).toBe(404);expect(result.body.data).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toMatch(/context|secret|sections|projectId|recipientUserId/);
    expect(audit).not.toHaveBeenCalled();
    expect((await pg.query("SELECT 1 FROM c2c_digests WHERE status='read'")).rows).toHaveLength(0);
  });
  it('refuses revoked membership despite a stale administrator claim',async()=>{
    await pg.exec('DELETE FROM organization_users WHERE user_id=2');
    const result=await request(app()).get('/api/submission-ops/digests');
    expect(result.status).toBe(404);expect(result.body.data).toBeUndefined();
    expect(statements.some(text=>text.includes('from "c2c_digests"'))).toBe(false);
  });
  it('fails without the request SQL context and never borrows the shared pool',async()=>{
    state.context=false;
    const result=await request(app()).get('/api/submission-ops/digests');
    expect(result.status).toBeGreaterThanOrEqual(500);expect(result.body.data).toBeUndefined();
    expect(statements).toHaveLength(0);expect(state.sharedQuery).not.toHaveBeenCalled();
  });
  it('refuses a missing authenticated actor before any digest SQL',async()=>{
    state.userId=0;
    const result=await request(app()).get('/api/submission-ops/digests');
    expect(result.status).toBe(403);expect(result.body.code).toBe('DIGEST_ACTOR_REQUIRED');
    expect(statements).toHaveLength(0);expect(state.sharedQuery).not.toHaveBeenCalled();
  });
  it('reports an unconfirmed HTTP marker without success and supports exact qualified readback',async()=>{
    fault='after';
    const result=await request(app()).post('/api/submission-ops/digests/own/read');
    expect(result.status).toBe(503);expect(result.body.code).toBe('DIGEST_READ_COMMIT_UNCONFIRMED');
    expect(result.body.data).toBeUndefined();expect(result.body.meta).toBeUndefined();
    expect(result.body.recovery.url).toBe('/api/submission-ops/digests?digestId=own');
    expect(discards).toHaveLength(1);expect(statements).not.toContain('ROLLBACK');
    fault='none';
    const readback=await request(app()).get(result.body.recovery.url);
    expect(readback.status).toBe(200);expect(readback.body.data[0]).toMatchObject({digestId:'own',status:'read'});
  });
  it('offers exact scoped readback without manufacturing records or counts',async()=>{
    const own=await request(app()).get('/api/submission-ops/digests?digestId=own&projectId=71');
    expect(own.status).toBe(200);expect(own.body.data).toHaveLength(1);
    const hidden=await request(app()).get('/api/submission-ops/digests?digestId=other-recipient');
    expect(hidden.status).toBe(200);expect(hidden.body.data).toEqual([]);
    expect(hidden.body.meta.digestGeneration.status).toBe('unavailable');
  });
  it('conceals an inaccessible unanchored private parent while preserving its owner’s repair refusal',async()=>{
    const hidden=await request(app()).get('/api/submission-ops/digests?projectId=73');
    expect(hidden.status).toBe(404);expect(hidden.body.code).toBe('DIGEST_NOT_FOUND');
    state.userId=1;
    const owner=await request(app()).get('/api/submission-ops/digests?projectId=73');
    expect(owner.status).toBe(409);expect(owner.body.code).toBe('DIGEST_PROJECT_UNANCHORED');
  });
});

describe('actual SQL readback and transaction completion',()=>{
  it('uses the actual creator without selecting a declaration-only updated_at column',async()=>{
    const rows=await listRecipientDigests(persistence,actor);
    expect(rows.map(row=>row.digestId)).toEqual(['own']);
    expect(statements.join('\n')).not.toContain('updated_at');
  });
  it('fails a changed current actor before returning an earlier selected payload',async()=>{
    afterQuery=async text=>{
      if (text.includes('from "c2c_digests"')) {afterQuery=undefined;await pg.exec('DELETE FROM organization_users WHERE user_id=2');}
    };
    await expect(listRecipientDigests(persistence,actor)).rejects.toMatchObject({status:503});
  });
  it('rejects malformed identities and filters before any SQL',async()=>{
    await expect(listRecipientDigests(persistence,{organizationId:7,userId:NaN})).rejects.toMatchObject({code:'DIGEST_ACTOR_REQUIRED'});
    await expect(listRecipientDigests(persistence,actor,{projectId:['71']})).rejects.toMatchObject({status:400});
    expect(statements).toHaveLength(0);
  });
  it('does not reissue an audit or change the first read timestamp on an already-read marker',async()=>{
    const first=await markRecipientDigestRead(persistence,actor,'own');
    const repeated=await markRecipientDigestRead(persistence,actor,'own');
    expect(repeated.outcome).toBe('already_read');expect(repeated.auditTrail).toBeUndefined();
    expect(repeated.digest.readAt).toEqual(first.digest.readAt);expect(audit).toHaveBeenCalledTimes(1);
  });
  it('rolls back the marker when the enlisted critical audit fails',async()=>{
    audit.mockRejectedValue(new Error('Synthetic private audit target failure'));
    await expect(markRecipientDigestRead(persistence,actor,'own')).rejects.toMatchObject({status:503,code:'DIGEST_ACCESS_UNAVAILABLE'});
    expect((await pg.query("SELECT status FROM c2c_digests WHERE digest_id='own'")).rows).toEqual([{status:'generated'}]);
    expect(statements).toContain('ROLLBACK');expect(statements).not.toContain('COMMIT');
  });
  it.each(['before','after'] as const)('keeps %s COMMIT acknowledgement loss unconfirmed, with exact recovery and discard',async mode=>{
    fault=mode;
    await expect(markRecipientDigestRead(persistence,actor,'own')).rejects.toMatchObject({
      status:503,code:'DIGEST_READ_COMMIT_UNCONFIRMED',
      recovery:{method:'GET',url:'/api/submission-ops/digests?digestId=own',digestId:'own'},
    });
    expect(statements).toContain('COMMIT');expect(statements).not.toContain('ROLLBACK');
    expect(releases).toHaveLength(1);expect(releases[0]).toBeInstanceOf(Error);
    await pg.exec('ROLLBACK');
    const [{status}]=(await pg.query<{status:string}>("SELECT status FROM c2c_digests WHERE digest_id='own'")).rows;
    expect(status).toBe(mode==='after' ? 'read' : 'generated');
    expect((await pg.query('SELECT 1 FROM synthetic_digest_audits')).rows).toHaveLength(mode==='after' ? 1 : 0);
  });
});
