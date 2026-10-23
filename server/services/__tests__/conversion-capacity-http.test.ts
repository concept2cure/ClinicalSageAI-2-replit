/**
 * A busy converter is answered 503 with Retry-After (MR-03 Stage 2 step 5;
 * acceptance: "a queue timeout returns 503 with Retry-After, never an empty
 * result").
 *
 * withConversionSlot (server/services/conversion-slots.ts) rejects a request
 * that waited past CONVERTER_QUEUE_TIMEOUT_MS with ConversionCapacityError.
 * That error has to reach the caller as what it is: the service is busy, try
 * again. Before this mapping it was a 500 "something went wrong", or a
 * production 500 "Internal server error" with no Retry-After, or (eCTD export)
 * "eCTD package generation failed".
 *
 * Covered here: the two central sinks — `serverError` (server/lib/api-response.ts,
 * used by 272 call sites) and the global error handler mounted last in
 * server/index.ts (server/src/mw/observability.ts) — and the eCTD export routes,
 * which assemble the package (Ghostscript per leaf) and answer errors through
 * their own classifier. The submissions and compile routes have their own files.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const hoisted = vi.hoisted(() => ({
  assembleSubmissionEctd: vi.fn(),
  validateEctdPackage: vi.fn(),
  registerExportGovernanceQuick: vi.fn(),
  auditLogAction: vi.fn(),
  resolveProgramProjectAnchor: vi.fn(),
}));

vi.mock('../ectd/assemble-from-core', () => ({
  assembleSubmissionEctd: (...a: unknown[]) => hoisted.assembleSubmissionEctd(...a),
}));
vi.mock('../submission-gateways/ectd-structural-validator', () => ({
  validateEctdPackage: (...a: unknown[]) => hoisted.validateEctdPackage(...a),
}));
vi.mock('../compute/exportGovernance', () => ({
  registerExportGovernanceQuick: (...a: unknown[]) => hoisted.registerExportGovernanceQuick(...a),
}));
vi.mock('../auditService', () => ({
  default: { logAction: (...a: unknown[]) => hoisted.auditLogAction(...a) },
}));
vi.mock('../c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...a: unknown[]) => hoisted.resolveProgramProjectAnchor(...a),
}));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({}) }));
vi.mock('../../db', () => {
  const db = { execute: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn() };
  return { db, pool: null, getPool: () => null, getDb: () => db };
});

import { ConversionCapacityError } from '../conversion-slots';
import { serverError } from '../../lib/api-response';
import { errorHandler } from '../../src/mw/observability';
import ectdExportRouter from '../../routes/ectd-export';

const busy = () => new ConversionCapacityError('ghostscript', 120_000, 2);
const quietLog = { error: () => {} };

/** What every busy answer must be: 503, Retry-After, and a sentence that says so. */
function expectConverterBusy(res: request.Response) {
  expect(res.status, `answered ${res.status} ${JSON.stringify(res.body)}`).toBe(503);
  expect(res.headers['retry-after']).toBe('30');
  expect(res.body.error).toBe('CONVERTER_BUSY');
  expect(res.body.retryAfterSeconds).toBe(30);
  expect(res.body.message).toMatch(/converter is busy/i);
  expect(res.body.message).toMatch(/try again in about 30 seconds/i);
}

describe('serverError answers a busy converter 503 with Retry-After', () => {
  it('instead of 500 "something went wrong"', async () => {
    const app = express();
    app.post('/compile', (_req, res) => {
      serverError(res, quietLog, 'compiling the eCTD submission', busy());
    });
    expectConverterBusy(await request(app).post('/compile'));
  });

  it('leaves every other error a 500', async () => {
    const app = express();
    app.post('/compile', (_req, res) => {
      serverError(res, quietLog, 'compiling the eCTD submission', new Error('relation "x" does not exist'));
    });
    const res = await request(app).post('/compile');
    expect(res.status).toBe(500);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('the global error handler answers a busy converter 503 with Retry-After', () => {
  it('in production too, where a 5xx message is otherwise replaced by "Internal server error"', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = express();
      app.post('/thrown', async () => {
        throw busy();
      });
      app.post('/forwarded', (_req: Request, _res: Response, next: NextFunction) => next(busy()));
      app.use(errorHandler);
      expectConverterBusy(await request(app).post('/thrown'));
      expectConverterBusy(await request(app).post('/forwarded'));
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});

describe('the eCTD export routes answer a busy converter 503 with Retry-After', () => {
  function makeApp() {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.assign(req, { tenantContext: { organizationId: 100 }, user: { id: 7, organizationId: 100 } });
      next();
    });
    app.use('/api/ectd/export', ectdExportRouter);
    return app;
  }

  beforeEach(() => {
    for (const fn of Object.values(hoisted)) fn.mockReset();
    hoisted.resolveProgramProjectAnchor.mockResolvedValue(77);
    hoisted.assembleSubmissionEctd.mockRejectedValue(busy());
    hoisted.validateEctdPackage.mockResolvedValue({ valid: true, errors: [], warnings: [] });
    hoisted.registerExportGovernanceQuick.mockResolvedValue({ ok: true });
    hoisted.auditLogAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  });

  it('POST /:submissionId (export)', async () => {
    const res = await request(makeApp()).post('/api/ectd/export/42').send({ applicationNumber: '123456' });
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalled();
    expectConverterBusy(res);
  });

  it('GET /:submissionId/preview', async () => {
    const res = await request(makeApp()).get('/api/ectd/export/42/preview');
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalled();
    expectConverterBusy(res);
  });

  it('POST /:submissionId/validate (generate, then validate)', async () => {
    const res = await request(makeApp()).post('/api/ectd/export/42/validate').send({});
    expect(hoisted.assembleSubmissionEctd).toHaveBeenCalled();
    expectConverterBusy(res);
  });
});
