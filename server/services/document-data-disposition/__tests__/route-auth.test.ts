import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../../../db.js', () => ({pool:{}}));
vi.mock('../../auditService.js', () => ({writeChainedAuditRow:vi.fn()}));
import createRoutes, { documentDispositionsEnabled } from '../../../routes/c2c/document-data-dispositions';
import { DispositionError } from '../service';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
function appFor(service: any, actor?: Record<string,unknown>) {
  const app = express(); app.use(express.json());
  app.use((req:any,_res,next) => { if (actor) { req.user=actor; req.userRole=actor.role; } next(); });
  app.use('/api/c2c/projects',createRoutes(service));
  return app;
}
describe('canonical disposition route refuses unproven authority',() => {
  it('does not read source impact without verified actor and tenant',async () => {
    const service={preview:vi.fn(),apply:vi.fn()};
    const res=await request(appFor(service)).get(`/api/c2c/projects/${PROGRAM}/document-dispositions/preview?targetType=captured_source&targetId=1`);
    expect(res.status).toBe(403); expect(service.preview).not.toHaveBeenCalled();
  });
  it('does not accept client body/header scope or let viewers mutate',async () => {
    const service={preview:vi.fn(),apply:vi.fn()};
    const res=await request(appFor(service,{id:7,organizationId:301,role:'viewer'}))
      .post(`/api/c2c/projects/${PROGRAM}/document-dispositions`).set('x-organization-id','999')
      .send({organizationId:999,actorId:1,choice:'remove_data',targetType:'captured_source',targetId:'1',reason:'withdrawal requested'});
    expect(res.status).toBe(403); expect(service.apply).not.toHaveBeenCalled();
  });
  it('uses middleware scope and passes stale preview refusal unchanged',async () => {
    const service={preview:vi.fn(),apply:vi.fn().mockRejectedValue(new DispositionError(409,'STALE_PREVIEW','Review a fresh impact preview.'))};
    const body={organizationId:999,actorId:1,targetType:'captured_source',targetId:'1',choice:'remove_data',reason:'withdrawal requested',previewToken:'expired'};
    const res=await request(appFor(service,{id:7,organizationId:301,role:'manager'}))
      .post(`/api/c2c/projects/${PROGRAM}/document-dispositions`).send(body);
    expect(res.status).toBe(409); expect(res.body.error).toBe('STALE_PREVIEW');
    expect(service.apply).toHaveBeenCalledWith(expect.objectContaining({organizationId:301,actorId:7,programId:PROGRAM,previewToken:'expired'}));
  });
  it('keeps mutation activation closed unless the exact environment gate is enabled',() => {
    expect(documentDispositionsEnabled({})).toBe(false);
    expect(documentDispositionsEnabled({C2C_DOCUMENT_DISPOSITIONS_ENABLED:'true'})).toBe(false);
    expect(documentDispositionsEnabled({C2C_DOCUMENT_DISPOSITIONS_ENABLED:'1'})).toBe(true);
  });
});
