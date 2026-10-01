/**
 * A 500 from /api/grdhe carries no caught-error text (security audit
 * 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * Two paths answered a 500 with the thrown text:
 *
 *  - POST /exports/:jobId/execute's catch sent
 *    `{ success: false, error: { code: 'EXPORT_FAILED', message: error.message } }`
 *    (the baselined site);
 *  - the router's own error handler — which every `asyncHandler` route without
 *    a catch of its own falls through to — sent `err.message` under
 *    `res.status(err.status || 500)`, with the stack added in development. The
 *    leak gate cannot see that one (its status is not a literal), so it was
 *    never on the baseline.
 *
 * Both now answer a 500 through `serverError()` (server/lib/api-response.ts): a
 * static INTERNAL_ERROR envelope with the request id, the detail in the log. An
 * error that carries a 4xx status is the route's deliberate refusal and keeps
 * its body; that is pinned beside them.
 *
 * The service is the double that fails; the routes, the error handler and the
 * helper are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL: relation "grdhe_set_b_secret" does not exist';
const REQUEST_ID = 'req-p117-set-b';
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';

const { svc } = vi.hoisted(() => ({
  svc: {
    getExportJob: vi.fn(),
    updateExportJobStatus: vi.fn(async () => undefined),
    listExportJobs: vi.fn(),
  },
}));
vi.mock('../../services/grdhe/grdheService', () => ({
  grdheService: svc,
  AuditScopeError: class AuditScopeError extends Error {},
  ExportJobNotFoundError: class ExportJobNotFoundError extends Error {},
}));

import router from '../grdheRoutes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7, organizationUuid: TENANT };
    next();
  });
  a.use('/api/grdhe', router);
  return a;
}

beforeEach(() => {
  svc.getExportJob.mockReset();
  svc.listExportJobs.mockReset();
  svc.updateExportJobStatus.mockClear();
});

function expectContained(r: request.Response) {
  expect(r.status).toBe(500);
  const body = JSON.stringify(r.body);
  expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
  expect(body).not.toContain('grdhe_set_b_secret');
  expect(body).not.toMatch(/\bat \S+ \(/); // no stack frame
  expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
}

describe('/api/grdhe: the 500 body is contained', () => {
  it('POST /exports/:jobId/execute answers an export failure with INTERNAL_ERROR, never the thrown text', async () => {
    svc.getExportJob.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).post('/api/grdhe/exports/job-1/execute').send({});
    expectContained(r);
    // The job is still marked failed, best-effort, as before.
    expect(svc.updateExportJobStatus).toHaveBeenCalledWith('job-1', 'failed', expect.any(Object));
  });

  it('the router error handler answers an uncaught failure with INTERNAL_ERROR, never the thrown text', async () => {
    svc.listExportJobs.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).get(`/api/grdhe/exports/tenant/${TENANT}`);
    expectContained(r);
  });

  it('the router error handler leaves an error that carries a 4xx status exactly as it was', async () => {
    svc.listExportJobs.mockRejectedValueOnce(
      Object.assign(new Error('The status filter is not one this store knows.'), { status: 400, code: 'BAD_FILTER' }),
    );
    const r = await request(app()).get(`/api/grdhe/exports/tenant/${TENANT}`);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      success: false,
      error: { code: 'BAD_FILTER', message: 'The status filter is not one this store knows.' },
    });
  });
});
