/**
 * GET /api/human-factors — HFE/UE file read contract.
 *
 * The v2 HumanFactors surface adopts this read (device + element presence map
 * + hazard-related use scenarios) and computes completeness/risk
 * deterministically from it. Locks: 403 without org, the { data } envelope
 * with the display keys, null data when no file exists, and 42P01
 * fail-closed. The pure compute POSTs are covered elsewhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import hfRouter from '../human-factors';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/human-factors', hfRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/human-factors', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/human-factors');
    expect(res.status).toBe(403);
  });

  it('returns the file + scenarios shaped to the display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'hf-bx204', device: 'BX-204 CGM', framework: 'IEC 62366-1', present: { useSpecification: true } }],
    });
    query.mockResolvedValueOnce({
      rows: [{ task: 'Low-glucose alert response', useError: 'Alert dismissed', potentialHarmSeverity: 'critical', mitigated: true }],
    });
    const res = await request(appWith(7)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data.device).toBe('BX-204 CGM');
    expect(res.body.data.present).toBeTruthy();
    for (const k of ['task', 'useError', 'potentialHarmSeverity', 'mitigated']) {
      expect(res.body.data.scenarios[0]).toHaveProperty(k);
    }
    expect(query.mock.calls[0][1]).toEqual([7]);
  });

  it('returns null data when the org has no file', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('fails closed when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/human-factors');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
