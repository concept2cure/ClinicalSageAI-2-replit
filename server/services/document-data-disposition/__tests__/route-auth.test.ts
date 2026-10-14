/** Mounted router and real current-actor/parent SQL; domain service is the
 * explicit seam. Embedded PGlite does not qualify runtime RLS or concurrency. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
vi.mock('../../../db.js', () => ({pool:{}}));
vi.mock('../../auditService.js', () => ({writeChainedAuditRow:vi.fn()}));
import createRoutes, { documentDispositionsEnabled } from '../../../routes/c2c/document-data-dispositions';
import { DispositionError } from '../service';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE users(id integer PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id integer,user_id integer,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz,lead_user_id integer);
    CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,regulatory_program_id uuid,client_workspace_id integer,
      status text,owner_id integer,created_by_id integer,settings jsonb);
    CREATE TABLE project_visibility_settings(organization_id integer,project_id integer,visibility text);
    CREATE TABLE project_members(organization_id integer,project_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(artifact_id integer,organization_id integer,reviewer_id integer,status text);
    INSERT INTO organizations VALUES(301,'active'); INSERT INTO users VALUES(7,'active');
    INSERT INTO organization_users VALUES(301,7,'manager');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',301,NULL,7);
    INSERT INTO projects VALUES(41,301,'${PROGRAM}',NULL,'active',7,7,'{}');
    INSERT INTO project_visibility_settings VALUES(301,41,'private');`);
}, 90_000);
afterAll(async () => { await pg?.close(); });
const persistedRole = async (role: string) => pg.query('UPDATE organization_users SET role=$1 WHERE organization_id=301 AND user_id=7', [role]);
function appFor(service: any, actor?: Record<string,unknown>) {
  const app = express(); app.use(express.json());
  app.use((req:any,_res,next) => {
    if (actor) { req.user=actor; req.userRole=actor.role; }
    req.dbClient = { query: (sql: string, params?: unknown[]) => pg.query(sql,params) };
    next();
  });
  app.use('/api/c2c/projects',createRoutes(service));
  return app;
}
describe('canonical disposition route refuses unproven authority',() => {
  it('does not read source impact without verified actor and tenant',async () => {
    const service={preview:vi.fn(),apply:vi.fn()};
    const res=await request(appFor(service)).get(`/api/c2c/projects/${PROGRAM}/document-dispositions/preview?targetType=captured_source&targetId=1`);
    expect(res.status).toBe(404); expect(res.body.error).toBe('PROJECT_NOT_FOUND'); expect(service.preview).not.toHaveBeenCalled();
  });
  it('does not accept client body/header scope or let viewers mutate',async () => {
    const service={preview:vi.fn(),apply:vi.fn()};
    await persistedRole('viewer');
    const res=await request(appFor(service,{id:7,organizationId:301,role:'viewer'}))
      .post(`/api/c2c/projects/${PROGRAM}/document-dispositions`).set('x-organization-id','999')
      .send({organizationId:999,actorId:1,choice:'remove_data',targetType:'captured_source',targetId:'1',reason:'withdrawal requested'});
    expect(res.status).toBe(403); expect(service.apply).not.toHaveBeenCalled();
  });
  it('uses middleware scope and passes stale preview refusal unchanged',async () => {
    const service={preview:vi.fn(),apply:vi.fn().mockRejectedValue(new DispositionError(409,'STALE_PREVIEW','Review a fresh impact preview.'))};
    await persistedRole('manager');
    const body={organizationId:999,actorId:1,targetType:'captured_source',targetId:'1',choice:'remove_data',reason:'withdrawal requested',previewToken:'expired'};
    const res=await request(appFor(service,{id:7,organizationId:301,role:'manager'}))
      .post(`/api/c2c/projects/${PROGRAM}/document-dispositions`).send(body);
    expect(res.status).toBe(409); expect(res.body.error).toBe('STALE_PREVIEW');
    expect(service.apply).toHaveBeenCalledWith(expect.objectContaining({organizationId:301,actorId:7,programId:PROGRAM,previewToken:'expired'}));
  });
  it('refuses a cached manager claim when current persisted membership permits only viewing',async () => {
    await persistedRole('viewer');
    const service={preview:vi.fn(),apply:vi.fn()};
    const res=await request(appFor(service,{id:7,organizationId:301,role:'manager'}))
      .post(`/api/c2c/projects/${PROGRAM}/document-dispositions`)
      .send({choice:'remove_data',targetType:'captured_source',targetId:'1',reason:'withdrawal requested'});
    expect(res.status).toBe(403); expect(res.body.error).toBe('PROJECT_WRITE_ACCESS_DENIED'); expect(service.apply).not.toHaveBeenCalled();
  });
  it('keeps mutation activation closed unless the exact environment gate is enabled',() => {
    expect(documentDispositionsEnabled({})).toBe(false);
    expect(documentDispositionsEnabled({C2C_DOCUMENT_DISPOSITIONS_ENABLED:'true'})).toBe(false);
    expect(documentDispositionsEnabled({C2C_DOCUMENT_DISPOSITIONS_ENABLED:'1'})).toBe(true);
  });
});
