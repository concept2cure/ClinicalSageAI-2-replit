/**
 * Device classification API contract — SaMD risk + IEC 62304 endpoints return
 * computed classifications and 400 on invalid input. Auth mocked; no DB.
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
  const router = (await import('../device-classification')).default;
  app = express();
  app.use(express.json());
  app.use('/api/device-classification', router);
});

const post = (path: string, body: object) =>
  request(app).post(`/api/device-classification${path}`).send(body);

describe('SaMD risk endpoint', () => {
  it('returns IMDRF category IV for critical × treat-or-diagnose', async () => {
    const res = await post('/samd-risk', {
      healthcareSituation: 'critical',
      significance: 'treat-or-diagnose',
    });
    expect(res.status).toBe(200);
    expect(res.body.result.category).toBe('IV');
    expect(res.body.result.riskLevel).toBe(4);
  });

  it('returns category I for non-serious × inform', async () => {
    const res = await post('/samd-risk', {
      healthcareSituation: 'non-serious',
      significance: 'inform',
    });
    expect(res.status).toBe(200);
    expect(res.body.result.category).toBe('I');
  });

  it('rejects an invalid situation with 400', async () => {
    const res = await post('/samd-risk', { healthcareSituation: 'fatal', significance: 'inform' });
    expect(res.status).toBe(400);
  });
});

describe('IEC 62304 endpoint', () => {
  it('returns Class C for possible death/serious injury', async () => {
    const res = await post('/iec62304-class', {
      canContributeToHazard: true,
      harmSeverityAfterExternalControls: 'serious-or-death',
    });
    expect(res.status).toBe(200);
    expect(res.body.result.softwareSafetyClass).toBe('C');
  });

  it('rejects a missing field with 400', async () => {
    const res = await post('/iec62304-class', { canContributeToHazard: true });
    expect(res.status).toBe(400);
  });
});
