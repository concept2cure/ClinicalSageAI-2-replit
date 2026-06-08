/**
 * Companion-diagnostics API contract. Auth mocked; no DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  const router = (await import('../companion-diagnostics')).default;
  app = express();
  app.use(express.json());
  app.use('/api/companion-diagnostics', router);
});

const post = (body: object) =>
  request(app).post('/api/companion-diagnostics/readiness').send(body);

describe('companion-diagnostics readiness', () => {
  it('reports linkage established for the core four', async () => {
    const res = await post({
      therapeuticProductIdentified: true,
      diagnosticDeviceIdentified: true,
      biomarkerDefined: true,
      intendedUseAlignment: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.result.linkageEstablished).toBe(true);
  });

  it('rejects a non-boolean field with 400', async () => {
    const res = await post({ biomarkerDefined: 'yes' });
    expect(res.status).toBe(400);
  });
});
