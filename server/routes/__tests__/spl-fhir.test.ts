/**
 * SPL/FHIR API contract. Auth mocked; no DB.
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
  const router = (await import('../spl-fhir')).default;
  app = express();
  app.use(express.json());
  app.use('/api/spl-fhir', router);
});

const post = (path: string, body: object) =>
  request(app).post(`/api/spl-fhir${path}`).send(body);

describe('LOINC endpoint', () => {
  it('validates a correct LOINC code', async () => {
    const res = await post('/loinc/validate', { code: '8867-4' });
    expect(res.status).toBe(200);
    expect(res.body.result.valid).toBe(true);
  });

  it('reports a bad check digit', async () => {
    const res = await post('/loinc/validate', { code: '8867-9' });
    expect(res.body.result.valid).toBe(false);
    expect(res.body.result.expectedCheckDigit).toBe(4);
  });
});

describe('SPL + FHIR endpoints', () => {
  it('SPL completeness returns gaps', async () => {
    const res = await post('/spl/completeness', { indicationsAndUsage: true });
    expect(res.status).toBe(200);
    expect(res.body.result.complete).toBe(false);
  });

  it('FHIR validate flags a missing required field', async () => {
    const res = await post('/fhir/validate', { resource: { resourceType: 'Observation', status: 'final' } });
    expect(res.status).toBe(200);
    expect(res.body.result.valid).toBe(false);
  });

  it('rejects a missing resource with 400', async () => {
    const res = await post('/fhir/validate', {});
    expect(res.status).toBe(400);
  });
});
