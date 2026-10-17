/** Native PostgreSQL proof: actual FORCE RLS policies and non-bypass role, no mocked pg. */
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { Client, Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { databaseUrl } from '../../../tests/setup.db';
import { instrumentPool } from '../../db/poolInstrumentation';
import { runWithTenantScope } from '../../db/tenantStore';
const h=vi.hoisted(()=>({query:vi.fn(),organizationId:0,userId:0,missing:false}));
vi.mock('../../db',()=>({pool:{query:h.query},getPool:()=>({query:h.query})}));
import notifications from '../mdx-notifications';
import { createNotification, listNotifications } from '../../services/notifications/notification-service';
const fixturePrefix='notification-native-'+randomUUID();
// Reserved for this fixture only. Refuse collisions; never borrow or rewrite
// shared demo identities, subscriptions, or another native test's tenant.
const ORG_A=97181, ORG_B=97182, USER_A=97181, USER_B=97182;
const fixtureOrganizations=[ORG_A,ORG_B], fixtureUsers=[USER_A,USER_B];
const activeProducerCategories=['task_assigned','task_blocked','task_completed','task_update','collaboration',
  'schedule_goal_reset','schedule_milestone_slip','schedule_milestone_at_risk','proactive_digest'] as const;
let admin:Client, scoped:Client, singleton:Client;
let ready=false;
let broadcastId:number, privateId:number, foreignId:number;

async function cleanupNotifications(){
  await admin.query(`DELETE FROM mdx_notification_receipts WHERE organization_id=ANY($1::int[])
    AND notification_id IN(SELECT id FROM mdx_notifications WHERE organization_id=ANY($1::int[]) AND title LIKE $2)`,
    [fixtureOrganizations,fixturePrefix+'%']);
  await admin.query('DELETE FROM mdx_notifications WHERE organization_id=ANY($1::int[]) AND title LIKE $2',
    [fixtureOrganizations,fixturePrefix+'%']);
  await admin.query(`DELETE FROM mdx_notification_subscriptions WHERE organization_id=ANY($1::int[])
    AND user_id=ANY($2::int[])`,[fixtureOrganizations,fixtureUsers]);
}
const app=express();app.use(express.json());
app.use(async(req,_res,next)=>{
  try {
    const organizationId=h.organizationId,userId=h.userId;
    await scoped.query(`SELECT set_config('app.rls_enforce','on',false),set_config('app.current_tenant_id',$1,false),
      set_config('app.current_org_id',$1,false),set_config('app.current_user_role','member',false)`,[String(organizationId)]);
    Object.assign(req,{user:{organizationId,id:userId,email:'fixture@example.test'},
      dbClient:h.missing?undefined:{query:async(sql:string,params?:unknown[])=>({rows:(await scoped.query(sql,params)).rows})}});
    next();
  } catch(error){next(error);}
});
app.use('/api/mdx',notifications);
const get=(path:string)=>request(app).get('/api/mdx/'+path);
const post=(path:string)=>request(app).post('/api/mdx/'+path);
beforeAll(async()=>{
  const adminAddress=new URL(databaseUrl);
  if(adminAddress.pathname!=='/c2c_audit_remedies')throw new Error('This fixture requires the explicitly created c2c_audit_remedies database');
  admin=new Client({connectionString:adminAddress.href});await admin.connect();
  const existingOrganizations=await admin.query('SELECT id FROM organizations WHERE id=ANY($1::int[])',[fixtureOrganizations]);
  const existingUsers=await admin.query('SELECT id FROM users WHERE id=ANY($1::int[])',[fixtureUsers]);
  if(existingOrganizations.rows.length||existingUsers.rows.length)throw new Error('Refuse to alter occupied notification fixture identities');
  await admin.query('BEGIN');
  try{
    await admin.query(`INSERT INTO organizations(id,name,slug,status) VALUES($1,$3,$3,'active'),($2,$4,$4,'active')`,
      [ORG_A,ORG_B,fixturePrefix+'-a',fixturePrefix+'-b']);
    await admin.query(`INSERT INTO users(id,email,name,password_hash,default_organization_id,status)
      VALUES($1,$3,$3,'synthetic-fixture-only',$5,'active'),($2,$4,$4,'synthetic-fixture-only',$6,'active')`,
      [USER_A,USER_B,fixturePrefix+'-a@example.test',fixturePrefix+'-b@example.test',ORG_A,ORG_B]);
    await admin.query(`INSERT INTO organization_users(organization_id,user_id,role)
      VALUES($1,$3,'member'),($1,$4,'viewer'),($2,$4,'member')`,[ORG_A,ORG_B,USER_A,USER_B]);
    await admin.query('COMMIT');ready=true;
  }catch(error){await admin.query('ROLLBACK');throw error;}
  const runtimeAddress=new URL(adminAddress);runtimeAddress.username='app_service';runtimeAddress.password='';
  scoped=new Client({connectionString:runtimeAddress.href});singleton=new Client({connectionString:runtimeAddress.href});
  await scoped.connect();await singleton.connect();
  const role=await scoped.query<{rolsuper:boolean;rolbypassrls:boolean}>(`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`);
  expect(role.rows[0]).toEqual({rolsuper:false,rolbypassrls:false});
  const tables=await admin.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE oid=ANY($1::regclass[])`,[['mdx_notifications','mdx_notification_receipts','mdx_notification_subscriptions']]);
  expect(tables.rows).toHaveLength(3);expect(tables.rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity)).toBe(true);
  await singleton.query(`SELECT set_config('app.rls_enforce','on',false),set_config('app.current_tenant_id','',false),
    set_config('app.current_org_id','',false),set_config('app.current_user_role','member',false)`);
  h.query.mockImplementation((sql:string,params?:unknown[])=>singleton.query(sql,params));
},60_000);
beforeEach(async()=>{
  h.organizationId=ORG_A;h.userId=USER_A;h.missing=false;h.query.mockClear();
  await cleanupNotifications();
  await admin.query(`INSERT INTO mdx_notification_subscriptions(organization_id,user_id,category,in_app_enabled) VALUES($1,$2,'system',true)`,[ORG_B,USER_B]);
  const rows=(await admin.query<{id:number;organization_id:number;recipient_user_id:number|null}>(`INSERT INTO mdx_notifications(organization_id,recipient_user_id,category,severity,title)
    VALUES($1,null,'system','info',$5),($1,$3,'system','info',$6),($2,$4,'system','info',$7) RETURNING id,organization_id,recipient_user_id`,
    [ORG_A,ORG_B,USER_A,USER_B,fixturePrefix+' broadcast',fixturePrefix+' private',fixturePrefix+' foreign'])).rows;
  broadcastId=rows[0].id;privateId=rows[1].id;foreignId=rows[2].id;
});
afterAll(async()=>{
  try{
    if(ready){
      await cleanupNotifications();
      await admin.query('DELETE FROM organization_users WHERE organization_id=ANY($1::int[]) AND user_id=ANY($2::int[])',[fixtureOrganizations,fixtureUsers]);
      await admin.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email=ANY($2::text[])',
        [fixtureUsers,[fixturePrefix+'-a@example.test',fixturePrefix+'-b@example.test']]);
      await admin.query('DELETE FROM organizations WHERE id=ANY($1::int[]) AND slug=ANY($2::text[])',
        [fixtureOrganizations,[fixturePrefix+'-a',fixturePrefix+'-b']]);
    }
  }finally{await Promise.all([scoped?.end(),singleton?.end(),admin?.end()]);}
});

describe('F18/D08 native request-scoped notification operation',()=>{
  it.each(activeProducerCategories)('saves the actual %s producer category and changes only the current recipient inbox',async category=>{
    const notice=(await admin.query<{id:number}>(`INSERT INTO mdx_notifications(organization_id,category,severity,title)
      VALUES($1,$2,'info',$3) RETURNING id`,[ORG_A,category,fixturePrefix+' '+category])).rows[0];
    const initial=await get('notifications?category='+category);expect(initial.body.data[0].id).toBe(notice.id);
    const saved=await request(app).put('/api/mdx/notification-subscriptions/'+category).send({inAppEnabled:false});
    expect(saved.status).toBe(200);expect(saved.body.data.category).toBe(category);expect(saved.body.data.in_app_enabled).toBe(false);
    const preferencesRead=await get('notification-subscriptions');
    expect(preferencesRead.body.data).toEqual(expect.arrayContaining([expect.objectContaining({category,in_app_enabled:false})]));
    expect((await get('notifications?category='+category)).body.data).toEqual([]);
    h.userId=USER_B;expect((await get('notifications?category='+category)).body.data[0].id).toBe(notice.id);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('an unknown category cannot create a preference or invented notice through the HTTP constraints',async()=>{
    const preference=await request(app).put('/api/mdx/notification-subscriptions/not_an_active_notice').send({inAppEnabled:false});
    expect(preference.status).toBe(422);
    const notice=await post('notifications').send({category:'not_an_active_notice',severity:'info',title:fixturePrefix+' unknown'});
    expect(notice.status).toBe(422);
    expect((await admin.query(`SELECT id FROM mdx_notification_subscriptions WHERE organization_id=ANY($1::int[])
      AND category='not_an_active_notice'`,[fixtureOrganizations])).rows).toEqual([]);
    expect((await admin.query('SELECT id FROM mdx_notifications WHERE organization_id=ANY($1::int[]) AND title=$2',
      [fixtureOrganizations,fixturePrefix+' unknown'])).rows).toEqual([]);
  });
  it('the existing runtime instrumented default pool already applies verified ALS scope and refuses a missing scope',async()=>{
    const runtimeAddress=new URL(databaseUrl);runtimeAddress.username='app_service';runtimeAddress.password='';
    const runtimePool=instrumentPool(new Pool({connectionString:runtimeAddress.href,max:1}));
    const prior=h.query.getMockImplementation()!;
    vi.stubEnv('RLS_ENFORCE','on');
    h.query.mockImplementation((sql:string,params?:unknown[])=>runtimePool.query(sql,params));
    try {
      const id=await runWithTenantScope({tenantId:String(ORG_A),role:'member',source:'request',caller:'notification-native-verified-scope'},async()=>{
        await Promise.resolve();
        return createNotification({organizationId:ORG_A,recipientUserId:USER_A,category:'system',severity:'info',title:fixturePrefix+' ALS scoped'});
      });
      const own=await runWithTenantScope({tenantId:String(ORG_A),role:'member',source:'request',caller:'notification-native-verified-scope'},
        ()=>listNotifications(ORG_A,{recipientUserId:USER_A}));
      expect(own.map(row=>row.id)).toContain(id);expect(own.map(row=>row.id)).not.toContain(foreignId);
      await expect(listNotifications(ORG_A,{recipientUserId:USER_A})).rejects.toThrow(/requires an active tenant scope/);
    } finally { h.query.mockImplementation(prior);vi.unstubAllEnvs();await runtimePool.end(); }
  });
  it('negative control: the actual singleton without a tenant sees no notification or preference rows',async()=>{
    expect((await singleton.query('SELECT id FROM mdx_notifications')).rows).toEqual([]);
    expect((await singleton.query('SELECT id FROM mdx_notification_subscriptions')).rows).toEqual([]);
  });
  it('the actual HTTP inbox/count positively reads only its tenant on the pinned non-bypass client',async()=>{
    const list=await get('notifications?category=system');expect(list.status).toBe(200);
    expect(list.body.data.map((row:{id:number})=>row.id).sort()).toEqual([broadcastId,privateId].sort());
    const count=await get('notifications/unread-count');expect(count.body.data.unread).toBe(2);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('read/archive receipts work without rowCount and stay private to each recipient',async()=>{
    expect((await post(`notifications/${broadcastId}/read`)).status).toBe(204);
    expect((await get('notifications/unread-count')).body.data.unread).toBe(1);
    h.userId=USER_B;
    const other=await get('notifications');expect(other.body.data).toHaveLength(1);expect(other.body.data[0].read_at).toBeNull();
    expect((await post(`notifications/${privateId}/read`)).status).toBe(404);
    expect((await post(`notifications/${broadcastId}/archive`)).status).toBe(204);
    expect((await get('notifications')).body.data).toEqual([]);
    h.userId=USER_A;expect((await get('notifications')).body.data.map((row:{id:number})=>row.id)).toContain(broadcastId);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('read-all reports returned write identities once and leaves another recipient unread',async()=>{
    expect((await post('notifications/read-all')).body.data.updated).toBe(2);
    expect((await post('notifications/read-all')).body.data.updated).toBe(0);
    h.userId=USER_B;expect((await get('notifications/unread-count')).body.data.unread).toBe(1);
  });
  it('foreign notification writes remain404 and preserve their receipt state',async()=>{
    expect((await post(`notifications/${foreignId}/read`)).status).toBe(404);
    expect((await post(`notifications/${foreignId}/archive`)).status).toBe(404);
    expect((await admin.query('SELECT * FROM mdx_notification_receipts WHERE notification_id=$1',[foreignId])).rows).toEqual([]);
    h.organizationId=ORG_B;h.userId=USER_B;expect((await get('notifications')).body.data[0].id).toBe(foreignId);
  });
  it('the native HTTP creation writes its authenticated tenant and returns the inserted identity',async()=>{
    const result=await post('notifications').send({organizationId:ORG_B,recipientUserId:USER_A,category:'system',severity:'info',title:fixturePrefix+' new'});
    expect(result.status).toBe(201);expect(result.body.data.id).toBeGreaterThan(0);
    const row=(await admin.query<{organization_id:number}>('SELECT organization_id FROM mdx_notifications WHERE id=$1',[result.body.data.id])).rows[0];
    expect(row.organization_id).toBe(ORG_A);expect(h.query).not.toHaveBeenCalled();
  });
  it('preferences save/read in their request tenant, affect its inbox, and do not change another member or tenant',async()=>{
    const saved=await request(app).put('/api/mdx/notification-subscriptions/system').send({organizationId:ORG_B,userId:USER_B,inAppEnabled:false});
    expect(saved.status).toBe(200);expect(saved.body.data.organization_id).toBe(ORG_A);expect(saved.body.data.user_id).toBe(USER_A);
    const own=await get('notification-subscriptions');expect(own.body.data[0].in_app_enabled).toBe(false);
    expect((await get('notifications')).body.data).toEqual([]);
    h.userId=USER_B;expect((await get('notifications')).body.data).toHaveLength(1);
    h.organizationId=ORG_B;expect((await get('notification-subscriptions')).body.data[0].in_app_enabled).toBe(true);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('missing request context fails explicitly instead of using the empty singleton',async()=>{
    h.missing=true;
    expect((await get('notifications')).status).toBe(500);
    expect((await get('notification-subscriptions')).status).toBe(500);
    expect(h.query).not.toHaveBeenCalled();
  });
});
