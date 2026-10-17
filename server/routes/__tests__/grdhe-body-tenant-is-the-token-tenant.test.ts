/**
 * A GRDHE write names its tenant in the body, and that tenant must be the one
 * the token carries (audit 2026-10-15, GRDHE follow-up 2).
 *
 * What the routes used to do: POST /adverse-events and POST /exports took
 * tenantId from the request body and passed it to the service unchecked, so a
 * user of one tenant could record an adverse event in another tenant's safety
 * database, or open an export job under another tenant's data-residency
 * configuration. POST /data-residency already checked it
 * (assertTenantMatchesAuth, the IDOR shape PRs #496-#499 closed).
 *
 * The router is real; the service is a double that records whether it was called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const OTHER_TENANT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const AE = '22222222-3333-4444-8555-666666666666';

const { svc } = vi.hoisted(() => ({
  svc: {
    createCanonicalAdverseEvent: vi.fn(async () => ({ id: 'ae-1' })),
    createExportJob: vi.fn(async () => ({ id: 'job-1' })),
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

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 42, email: 'qa.lead@sponsor.example', organizationUuid: TENANT };
    next();
  });
  a.use('/api/grdhe', router);
  return a;
}

const adverseEvent = (tenantId: string) => ({
  tenantId, caseNumber: 'CASE-001', caseType: 'spontaneous', reportType: 'initial',
  eventDate: '2026-03-10', receiveDate: '2026-03-15', isSerious: false,
  patient: { sex: 'F' }, reactions: [{ term: 'Headache' }], suspectProducts: [{ name: 'Examplamab' }], reporter: {},
});
const exportJob = (tenantId: string) => ({
  tenantId, sourceEntityType: 'adverse_event', sourceEntityIds: [AE], targetFormat: 'FDA_AE_3500A', targetJurisdiction: 'FDA',
});

const WRITES = [
  ['POST /adverse-events', '/api/grdhe/adverse-events', adverseEvent, svc.createCanonicalAdverseEvent],
  ['POST /exports', '/api/grdhe/exports', exportJob, svc.createExportJob],
] as const;

beforeEach(() => {
  svc.createCanonicalAdverseEvent.mockClear();
  svc.createExportJob.mockClear();
});

describe("a GRDHE write is refused for a tenant other than the token's", () => {
  it.each(WRITES)("%s with another tenant's id answers 403 and writes nothing", async (_name, path, body, write) => {
    const r = await request(app()).post(path).send(body(OTHER_TENANT));
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('TENANT_MISMATCH');
    expect(write, "the service was asked to write into another tenant").not.toHaveBeenCalled();
  });

  it.each(WRITES)('%s with no tenant answers 400 and writes nothing', async (_name, path, body, write) => {
    const r = await request(app()).post(path).send({ ...body(TENANT), tenantId: undefined });
    expect(r.status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(WRITES)("%s for the token's own tenant is written", async (_name, path, body, write) => {
    const r = await request(app()).post(path).send(body(TENANT));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
