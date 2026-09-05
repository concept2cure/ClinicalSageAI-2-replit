/**
 * GET /api/pharmacovigilance/board — fail-CLOSED contract.
 *
 * This board feeds the v2 Pharmacovigilance surface's AnA context. The surface
 * publisher is faithful: it reports the board UNREADABLE when the read errors.
 * The danger was upstream — the route used Promise.allSettled and coerced a
 * REJECTED read to [], still returning HTTP 200 {success:true, signals:[]}. On a
 * real DB failure the assistant was then told "no disproportionality signal" —
 * a manufactured safety clearance from a read that failed. A safety-surveillance
 * board must fail closed, and half a board (one read down) is still unreadable.
 *
 * The service already maps the legitimately-unprovisioned 42P01 case to [], so a
 * rejection here is always a real fault, never "no data yet".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const getAdverseEvents = vi.fn();
const getUpcomingReports = vi.fn();
vi.mock('../../services/compliance/pharmacovigilanceService', () => ({
  getAdverseEvents: (...a: unknown[]) => getAdverseEvents(...a),
  getUpcomingReports: (...a: unknown[]) => getUpcomingReports(...a),
}));

import createPharmacovigilanceBoardRoutes from '../pharmacovigilance-board.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { tenantId: number }).tenantId = org;
    next();
  });
  app.use('/api/pharmacovigilance/board', createPharmacovigilanceBoardRoutes());
  return app;
}

beforeEach(() => {
  getAdverseEvents.mockReset();
  getUpcomingReports.mockReset();
});

describe('GET /api/pharmacovigilance/board — a failed read is never a masked empty board', () => {
  it('a rejected adverse-events read → 500, NOT 200 with signals:[]', async () => {
    getAdverseEvents.mockRejectedValueOnce(new Error('ECONNRESET reading adverse_events'));
    getUpcomingReports.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/pharmacovigilance/board');
    expect(res.status).toBe(500);
    // The manufactured all-clear must not appear.
    expect(res.body?.success).not.toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('"signals":[]');
  });

  it('a rejected reports read is equally fatal — half a board is still unreadable', async () => {
    getAdverseEvents.mockResolvedValueOnce([]);
    getUpcomingReports.mockRejectedValueOnce(new Error('ETIMEDOUT reading periodic_safety_reports'));
    const res = await request(appWith(7)).get('/api/pharmacovigilance/board');
    expect(res.status).toBe(500);
  });

  it('a genuinely empty (both reads resolve []) board still returns 200 — legit unprovisioned', async () => {
    getAdverseEvents.mockResolvedValueOnce([]);
    getUpcomingReports.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/pharmacovigilance/board');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.signals).toEqual([]);
  });
});
