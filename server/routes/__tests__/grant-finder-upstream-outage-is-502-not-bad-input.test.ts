/**
 * A Grants.gov outage is an upstream failure (502), not the caller's bad input.
 *
 * discoverOpportunities caught a failed Grants.gov search and threw
 * GrantFinderError('BAD_INPUT', `Grants.gov search failed: ${upstream text}`),
 * so GET /api/grant-finder/discover answered an outage with 400 — "your request
 * is wrong" — carrying the upstream error's own text. An outage is now a 502
 * with a fixed sentence and the upstream text in the log; only a caller error
 * (no profile and no query) is a 400.
 *
 * The route and the service are real; the database, the Grants.gov connector
 * and the logger are doubles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { search, logged } = vi.hoisted(() => ({ search: vi.fn(), logged: [] as unknown[] }));

vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../../services/connectors/grants-gov', () => ({
  GrantsGovConnector: class {
    search(...a: unknown[]) { return search(...a); }
    fetchOpportunityDetail() { return Promise.reject(new Error('not used')); }
  },
}));
vi.mock('../../services/grants/grants-service', () => ({ createOpportunityTx: vi.fn() }));
vi.mock('../../services/grant-finder-metrics', () => ({ recordFundingProfileUpserted: vi.fn(), recordOpportunityDiscovery: vi.fn() }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../../utils/logger', () => {
  const sink = (...a: unknown[]) => { logged.push(a); };
  return { createScopedLogger: () => ({ info: sink, warn: sink, error: sink, debug: sink }) };
});

import router from '../grant-finder';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/grant-finder', router);
  return a;
}

beforeEach(() => {
  search.mockReset();
  logged.length = 0;
});

describe('GET /api/grant-finder/discover — an upstream outage is not bad input', () => {
  it('answers a failed Grants.gov search with 502 and a fixed sentence; the upstream text goes to the log', async () => {
    search.mockRejectedValue(new Error('Grants.gov API error: 503 via upstream-lb-7.internal'));
    const r = await request(app()).get('/api/grant-finder/discover?query=oncology');
    expect(r.status, 'a Grants.gov outage was answered as the caller’s bad input').toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('upstream-lb-7');
    expect(r.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(logged)).toContain('upstream-lb-7');
  });

  it('control: with no profile and no query, the caller error is still 400', async () => {
    const r = await request(app()).get('/api/grant-finder/discover');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_INPUT');
    expect(search).not.toHaveBeenCalled();
  });
});
