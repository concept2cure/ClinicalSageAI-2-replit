/**
 * No /api/grdhe error body carries database text, and an outage is not
 * reported as "not found" (audit 2026-10-15, GRDHE follow-up 1).
 *
 * What the routes used to do: POST /adverse-events, POST /exports and
 * POST /exports/:jobId/cancel answered 400, and GET /exports/:jobId and the
 * three adverse-event reads answered 404, each with `error.message`. Under
 * drizzle that message is "Failed query: <SQL>\nparams: <values>": the
 * statement, the relation names and the case's own field values. The audit
 * insert that failed every day after 2026-03-31 reached the caller as a 400
 * naming audit_log's partitions, and a lost connection on a read was a 404.
 *
 * The routes, the router's error handler and serverError() are real; the
 * service is the double that fails, with the error drizzle throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const JOB = '11111111-2222-4333-8444-555555555555';
const AE = '22222222-3333-4444-8555-666666666666';
const REQUEST_ID = 'req-grdhe-db-text';

const { svc } = vi.hoisted(() => ({
  svc: {
    createCanonicalAdverseEvent: vi.fn(),
    createExportJob: vi.fn(),
    getExportJob: vi.fn(),
    updateExportJobStatus: vi.fn(),
    getCanonicalAdverseEventById: vi.fn(),
    getCanonicalAdverseEvent: vi.fn(),
    setDataResidencyConfig: vi.fn(),
    addTerminologyMapping: vi.fn(),
  },
}));
vi.mock('../../services/grdhe/grdheService', () => {
  class AuditScopeError extends Error {}
  class ExportJobNotFoundError extends Error {}
  class AdverseEventNotFoundError extends Error {}
  class ExportJobRefusedError extends Error {}
  return { grdheService: svc, AuditScopeError, ExportJobNotFoundError, AdverseEventNotFoundError, ExportJobRefusedError };
});

import router from '../grdheRoutes';
import {
  AdverseEventNotFoundError,
  ExportJobNotFoundError,
  ExportJobRefusedError,
} from '../../services/grdhe/grdheService';

/** What drizzle throws: the statement and its values, the driver's error as the cause. */
function databaseFailure(code = '23514', detail = 'no partition of relation "audit_log" found for row') {
  return Object.assign(
    new Error(
      'Failed query: INSERT INTO regulatory_harmonization.canonical_adverse_events (tenant_id, case_number, patient) VALUES ($1, $2, $3)\n' +
        `params: ${TENANT},CASE-001,{"initials":"AB","date_of_birth":"1980-02-03"}`
    ),
    { cause: Object.assign(new Error(detail), { code, table: 'audit_log', schema: 'regulatory_harmonization' }) }
  );
}

const DATABASE_TEXT = /Failed query|params:|regulatory_harmonization|audit_log|no partition|duplicate key|INSERT INTO|1980-02-03/;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    (req as unknown as { user: unknown }).user = { id: 42, email: 'qa.lead@sponsor.example', organizationUuid: TENANT };
    next();
  });
  a.use('/api/grdhe', router);
  return a;
}

const adverseEvent = {
  tenantId: TENANT, caseNumber: 'CASE-001', caseType: 'spontaneous', reportType: 'initial',
  eventDate: '2026-03-10', receiveDate: '2026-03-15', isSerious: false,
  patient: { sex: 'F' }, reactions: [{ term: 'Headache' }], suspectProducts: [{ name: 'Examplamab' }], reporter: {},
};
const exportJob = {
  tenantId: TENANT, sourceEntityType: 'adverse_event', sourceEntityIds: [AE], targetFormat: 'FDA_AE_3500A', targetJurisdiction: 'FDA',
};

type Call = [name: string, fail: (e: Error) => void, send: () => request.Test];
const CALLS: Call[] = [
  ['POST /adverse-events', e => svc.createCanonicalAdverseEvent.mockRejectedValueOnce(e),
    () => request(app()).post('/api/grdhe/adverse-events').send(adverseEvent)],
  ['POST /exports', e => svc.createExportJob.mockRejectedValueOnce(e),
    () => request(app()).post('/api/grdhe/exports').send(exportJob)],
  ['GET /exports/:jobId', e => svc.getExportJob.mockRejectedValueOnce(e),
    () => request(app()).get(`/api/grdhe/exports/${JOB}`)],
  ['POST /exports/:jobId/cancel', e => svc.updateExportJobStatus.mockRejectedValueOnce(e),
    () => request(app()).post(`/api/grdhe/exports/${JOB}/cancel`).send({ reason: 'duplicate' })],
  ['GET /adverse-events/:eventId', e => svc.getCanonicalAdverseEventById.mockRejectedValueOnce(e),
    () => request(app()).get(`/api/grdhe/adverse-events/${AE}`)],
  ['GET /adverse-events/tenant/:tenantId/case/:caseNumber', e => svc.getCanonicalAdverseEvent.mockRejectedValueOnce(e),
    () => request(app()).get(`/api/grdhe/adverse-events/tenant/${TENANT}/case/CASE-001`)],
  ['POST /adverse-events/:eventId/validate', e => svc.getCanonicalAdverseEventById.mockRejectedValueOnce(e),
    () => request(app()).post(`/api/grdhe/adverse-events/${AE}/validate`).send({ targetFormat: 'FDA_AE_3500A' })],
  ['POST /data-residency', e => svc.setDataResidencyConfig.mockRejectedValueOnce(e),
    () => request(app()).post('/api/grdhe/data-residency').send({ tenantId: TENANT, primaryRegion: 'US_EAST' })],
  ['POST /terminology/mappings', e => svc.addTerminologyMapping.mockRejectedValueOnce(e),
    () => request(app()).post('/api/grdhe/terminology/mappings').send({
      sourceSystem: 'MEDDRA', sourceCode: '1', targetSystem: 'MEDDRA', targetCode: '2', mappingType: 'equivalent',
    })],
];

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
});

describe('/api/grdhe: a database failure is a 500 that names nothing of the database', () => {
  it.each(CALLS)('%s', async (_name, fail, send) => {
    fail(databaseFailure());
    const r = await send();
    expect(JSON.stringify(r.body), 'database text reached the client').not.toMatch(DATABASE_TEXT);
    expect(r.status, 'a database failure is the server\'s, not a refusal or "not found"').toBe(500);
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });
});

describe('/api/grdhe: a deliberate refusal keeps its answer, in its own words', () => {
  it('an export job that is not this tenant\'s answers 404', async () => {
    svc.getExportJob.mockRejectedValueOnce(new ExportJobNotFoundError(`Export job ${JOB} not found`));
    const r = await request(app()).get(`/api/grdhe/exports/${JOB}`);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('JOB_NOT_FOUND');
  });

  it('an adverse event that is not this tenant\'s answers 404', async () => {
    svc.getCanonicalAdverseEventById.mockRejectedValueOnce(new AdverseEventNotFoundError(`Adverse event ${AE} not found`));
    const r = await request(app()).get(`/api/grdhe/adverse-events/${AE}`);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('EVENT_NOT_FOUND');
  });

  it("an export job the tenant's data residency forbids answers 400 with the service's reason", async () => {
    svc.createExportJob.mockRejectedValueOnce(
      new ExportJobRefusedError('Data residency violation: tenant not authorized for FDA processing')
    );
    const r = await request(app()).post('/api/grdhe/exports').send(exportJob);
    expect(r.status).toBe(400);
    expect(r.body.error).toEqual({
      code: 'EXPORT_JOB_CREATION_FAILED',
      message: 'Data residency violation: tenant not authorized for FDA processing',
    });
  });

  it.each([
    ['eventDate', { eventDate: undefined }],
    ['eventDate', { eventDate: '2026-02-30' }],
    ['receiveDate', { receiveDate: '15/03/2026' }],
  ])('a case whose %s is not a date is refused before the database, naming the field', async (field, change) => {
    const r = await request(app()).post('/api/grdhe/adverse-events').send({ ...adverseEvent, ...change });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain(field);
    expect(svc.createCanonicalAdverseEvent).not.toHaveBeenCalled();
  });

  it('an export job whose source ids are not case ids is refused before the database', async () => {
    const r = await request(app()).post('/api/grdhe/exports').send({ ...exportJob, sourceEntityIds: [AE, 'CASE-001'] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('sourceEntityIds');
    expect(svc.createExportJob).not.toHaveBeenCalled();
  });

  it('a case number already recorded answers 409, naming no constraint', async () => {
    svc.createCanonicalAdverseEvent.mockRejectedValueOnce(
      databaseFailure('23505', 'duplicate key value violates unique constraint "canonical_adverse_events_tenant_id_case_number_case_version_key"')
    );
    const r = await request(app()).post('/api/grdhe/adverse-events').send(adverseEvent);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CASE_EXISTS');
    expect(JSON.stringify(r.body)).not.toMatch(DATABASE_TEXT);
  });
});
