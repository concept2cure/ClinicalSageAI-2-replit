/**
 * GET /api/ana/consistency/alerts and GET /api/ana/guidance/alerts carry the
 * same scanHistory note their summaries carry.
 *
 * What the routes used to do (until 2026-10-22): they answered
 * `{ organizationId, total: 0, alerts: [] }` for an organization nothing had
 * scanned. A scan that finds nothing leaves no record, so an empty list is not
 * a clean result, which the summaries already said (scanHistory: { recorded:
 * false, note }) and the lists did not.
 *
 * Runs the real router; the scanner modules are doubles that keep their notes.
 */
import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));
vi.mock('../../services/intelligence/cross-artifact-consistency-scanner', async (original) => ({
  ...(await original<typeof import('../../services/intelligence/cross-artifact-consistency-scanner')>()),
  listConsistencyAlerts: vi.fn(async () => ({ rows: [], total: 0 })),
}));
vi.mock('../../services/intelligence/guidance-impact-scanner', async (original) => ({
  ...(await original<typeof import('../../services/intelligence/guidance-impact-scanner')>()),
  listGuidanceAlerts: vi.fn(async () => ({ rows: [], total: 0 })),
}));

import anaFeaturesRouter from '../ana-features';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _s: Response, n: NextFunction) => {
    (req as any).user = { id: 3, organizationId: 7 };
    (req as any).tenantContext = { organizationId: 7 };
    n();
  });
  a.use('/api/ana', anaFeaturesRouter);
  return a;
}

describe('the alert lists say scan history is not recorded', () => {
  it.each([
    ['/api/ana/consistency/alerts', /consistency scan/],
    ['/api/ana/guidance/alerts', /guidance scan/],
  ])('%s', async (path, scan) => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual([]);
    expect(res.body.scanHistory, 'an empty list was returned with no word that no scan is on record').toMatchObject({
      recorded: false,
    });
    expect(res.body.scanHistory.note).toMatch(scan);
  });
});
