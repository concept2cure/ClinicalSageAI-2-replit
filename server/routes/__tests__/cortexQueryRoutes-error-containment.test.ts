/**
 * A 500 from POST /api/cortex/query/query carries no caught-error text
 * (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The handler's catch answered `{ success: false, error: error.message, … }`,
 * so whatever failed inside the query — the tenant-key read, the RAG search,
 * the gateway — reached the browser verbatim. It now answers through
 * `serverError()` (server/lib/api-response.ts): a static INTERNAL_ERROR envelope
 * with the request id, the detail in the log.
 *
 * The tenant-key read is the double that fails; the route and the helper are
 * real. The 403 for a session with no tenant key is pinned beside it unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL: relation "set_b_secret_table" does not exist';
const REQUEST_ID = 'req-p117-set-b';

const { tenantUuid } = vi.hoisted(() => ({ tenantUuid: vi.fn() }));
vi.mock('../../db/currentTenant.js', () => ({ currentTenantOrgUuid: (...a: unknown[]) => tenantUuid(...a) }));
// The query path's heavy collaborators; this test never reaches them.
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: vi.fn() }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: vi.fn() }));
vi.mock('../../services/ragRouter.js', () => ({ ragRouter: {} }));

import router, { initializeCortexAPI } from '../cortexQueryRoutes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/cortex/query', router);
  return a;
}

beforeEach(() => {
  tenantUuid.mockReset();
  initializeCortexAPI({ query: vi.fn() } as never);
});

describe('POST /api/cortex/query/query: the 500 body is contained', () => {
  it('answers a failure inside the query with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    tenantUuid.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app()).post('/api/cortex/query/query').send({ query: 'stability data for BX-204' });
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-DB-DETAIL');
    expect(body).not.toContain('set_b_secret_table');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });

  it('leaves the no-tenant 403 exactly as it was', async () => {
    tenantUuid.mockResolvedValueOnce(null);
    const r = await request(app()).post('/api/cortex/query/query').send({ query: 'anything' });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Tenant context required' });
  });
});
