/**
 * GET + POST /api/market-access — the converged market-access read + write path.
 *
 * The route is thin: guard the org, delegate to the real market_access_positions
 * service, and project the stored rows to exactly the display keys the MarketAccess
 * surface renders. Locks: 403 without org; GET returns the real-store rows
 * ({ market, payer, mechanism, code, status, decisionDate, note }, meta.source =
 * market_access_positions); GET fail-closed to an honest empty list on a missing
 * store (42P01); POST tracks a position (the real write path, audited) and 400s on
 * invalid input. (The full store round-trip is proven in
 * market-access-service.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { createMarketAccessPosition, listMarketAccessPositions, MarketAccessValidationError, logAction } = vi.hoisted(() => {
  class MarketAccessValidationError extends Error {}
  return {
    createMarketAccessPosition: vi.fn(), listMarketAccessPositions: vi.fn(),
    MarketAccessValidationError, logAction: vi.fn(),
  };
});
vi.mock('../../services/market-access/market-access-service', () => ({
  createMarketAccessPosition, listMarketAccessPositions, MarketAccessValidationError,
}));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import marketAccessRouter from '../market-access.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/market-access', marketAccessRouter);
  return app;
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1', organization_id: 7, program: 'BX-204', market: 'United Kingdom', payer: 'NHS -- NICE',
    mechanism: 'HTA appraisal', code: null, status: 'review', decision_date: '2026-11-01',
    note: 'NICE TA in progress.', created_by: 55, created_at: 'now', updated_at: 'now',
    ...over,
  };
}

beforeEach(() => { createMarketAccessPosition.mockReset(); listMarketAccessPositions.mockReset(); logAction.mockReset(); });

describe('GET /api/market-access', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/market-access');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('returns the real-store positions shaped to the display contract, source = market_access_positions', async () => {
    listMarketAccessPositions.mockResolvedValueOnce([
      dbRow(),
      dbRow({ id: 'p-2', market: 'United States', payer: 'CMS -- Medicare', mechanism: 'NCD / LCD', code: 'HCPCS E2103', status: 'covered', decision_date: null }),
    ]);
    const res = await request(appWith(9)).get('/api/market-access');
    expect(res.status).toBe(200);
    expect(listMarketAccessPositions).toHaveBeenCalledWith(9);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: 'p-1', program: 'BX-204', market: 'United Kingdom', payer: 'NHS -- NICE',
      mechanism: 'HTA appraisal', code: null, status: 'review', decisionDate: '2026-11-01',
      note: 'NICE TA in progress.',
    });
    // decision_date is projected to decisionDate; internal columns never leak.
    expect(res.body.data[1].decisionDate).toBeNull();
    expect(res.body.data[1]).not.toHaveProperty('organization_id');
    expect(res.body.data[1]).not.toHaveProperty('created_by');
    expect(res.body.meta).toEqual({ count: 2, source: 'market_access_positions' });
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    listMarketAccessPositions.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(9)).get('/api/market-access');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/market-access', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/market-access').send({ program: 'BX-204' });
    expect(res.status).toBe(403);
    expect(createMarketAccessPosition).not.toHaveBeenCalled();
  });

  it('tracks a position and returns the created row (audited)', async () => {
    createMarketAccessPosition.mockResolvedValueOnce(dbRow({ id: 'p-9', market: 'Germany', payer: 'G-BA / GKV', mechanism: 'NUB / DiGA', status: 'review', decision_date: null, note: null }));
    const res = await request(appWith(9)).post('/api/market-access').send({
      program: 'BX-204', market: 'Germany', payer: 'G-BA / GKV', mechanism: 'NUB / DiGA', status: 'review',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('p-9');
    expect(res.body.data.market).toBe('Germany');
    expect(res.body.data.status).toBe('review');
    // Service called with parsed body + acting user as createdBy; audited.
    expect(createMarketAccessPosition).toHaveBeenCalledWith(9, expect.objectContaining({
      program: 'BX-204', market: 'Germany', payer: 'G-BA / GKV', mechanism: 'NUB / DiGA', status: 'review', createdBy: 55,
    }));
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 9, userId: 55, action: 'MARKET_ACCESS_POSITION_CREATED',
      resourceType: 'market_access_position', resourceId: 'p-9',
    }));
  });

  it('400 on invalid input', async () => {
    createMarketAccessPosition.mockRejectedValueOnce(new MarketAccessValidationError('status must be one of: ...'));
    const res = await request(appWith(9)).post('/api/market-access').send({ program: 'BX-204', market: 'US', payer: 'CMS', status: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(logAction).not.toHaveBeenCalled();
  });
});
