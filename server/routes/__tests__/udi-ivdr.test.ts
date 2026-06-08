/**
 * UDI/IVDR API contract — UDI DI validation, GUDID + IVDR PER completeness.
 * Auth mocked; no DB.
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
  const router = (await import('../udi-ivdr')).default;
  app = express();
  app.use(express.json());
  app.use('/api/udi-ivdr', router);
});

const post = (path: string, body: object) =>
  request(app).post(`/api/udi-ivdr${path}`).send(body);

describe('UDI DI validation', () => {
  it('accepts a valid GTIN-14', async () => {
    const res = await post('/udi/validate-di', { deviceIdentifier: '00012345678905' });
    expect(res.status).toBe(200);
    expect(res.body.result.valid).toBe(true);
  });

  it('reports an invalid check digit', async () => {
    const res = await post('/udi/validate-di', { deviceIdentifier: '00012345678900' });
    expect(res.status).toBe(200);
    expect(res.body.result.valid).toBe(false);
    expect(res.body.result.expectedCheckDigit).toBe(5);
  });

  it('rejects an empty DI with 400', async () => {
    const res = await post('/udi/validate-di', { deviceIdentifier: '' });
    expect(res.status).toBe(400);
  });
});

describe('GUDID + IVDR completeness', () => {
  it('GUDID completeness lists gaps', async () => {
    const res = await post('/udi/gudid-completeness', { primaryDi: true });
    expect(res.status).toBe(200);
    expect(res.body.result.complete).toBe(false);
  });

  it('IVDR PER reports pillar status', async () => {
    const res = await post('/ivdr/performance-evaluation', { scientificValidityReport: true });
    expect(res.status).toBe(200);
    expect(res.body.result.pillars.length).toBe(3);
  });
});
