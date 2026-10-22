/**
 * GET /api/ana/projects/:projectId/authoring-plans/active answers a missing
 * plan store as unavailable (503), not as "no plan".
 *
 * Until 2026-10-15 getActiveAuthoringPlanForSection (authoring-plan-generator)
 * caught 42P01 and returned null, so with the authoring_plans table absent this
 * route answered 404 "No active plan for that section" — a statement about the
 * section, made without reading anything. The error now propagates and the
 * route answers 503 with a fixed sentence (the relation text stays in the log).
 * A store that was read and holds no plan is still 404; any other failure is
 * still a 500 with fixed text.
 *
 * Runs the real router and the real generator; the failure is injected at the
 * process-wide `pg` stub, as in docx-ledger-unread-ai-use-is-unavailable.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

const pass = vi.hoisted(() => (_q: unknown, _s: unknown, n: () => void) => n());
vi.mock('../../middleware/auth', () => ({ authenticateToken: pass }));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: pass, requireTenantContext: pass }));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => pass }));

import anaFeaturesRouter from '../ana-features';

const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });

function serve(plans: () => Promise<unknown>) {
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) => {
    const text = typeof sql === 'string' ? sql : String((sql as { text?: string })?.text ?? '');
    if (/FROM authoring_plans/i.test(text)) return plans();
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _s: Response, n: NextFunction) => {
    Object.assign(req, { user: { id: 3, organizationId: 7 }, tenantContext: { organizationId: 7 } });
    n();
  });
  a.use('/api/ana', anaFeaturesRouter);
  return a;
}

const get = () => request(app()).get('/api/ana/projects/5/authoring-plans/active?ctdSection=2.5');

const originalQuery = mockPool.query;
afterAll(() => {
  (mockPool as { query: unknown }).query = originalQuery;
});
beforeEach(() => serve(async () => ({ rows: [], rowCount: 0 })));

describe('GET active authoring plan: a missing store is unavailable, not "no plan"', () => {
  it('answers 503 with a fixed sentence when authoring_plans does not exist', async () => {
    serve(() => Promise.reject(pgError('42P01', 'relation "authoring_plans" does not exist')));
    const res = await get();
    expect(res.status, 'a missing plan store was reported as a section with no plan').toBe(503);
    expect(res.body.code).toBe('AUTHORING_PLAN_STORE_UNAVAILABLE');
    expect(res.body.error).toMatch(/could not be read/);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|authoring_plans|42P01/);
  });

  it('a store that was read and holds no plan for the section is 404', async () => {
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('any other failure is a 500 that carries none of the error text', async () => {
    serve(() => Promise.reject(pgError('42501', 'permission denied for table authoring_plans')));
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUTHORING_PLAN_ACTIVE_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/permission denied|authoring_plans/);
  });
});
