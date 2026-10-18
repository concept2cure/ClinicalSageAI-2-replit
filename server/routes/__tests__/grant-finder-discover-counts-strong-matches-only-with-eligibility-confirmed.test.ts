/**
 * GET /api/grant-finder/discover adds to the strong-match counter only the
 * matches the service reports as strong: fit >= 70 WITH eligibility confirmed.
 *
 * Until 2026-10-15 the route recounted strong matches itself as
 * `fitScore >= 70`, after the service had begun requiring confirmed
 * eligibility (`isStrongMatch`, returned as `result.strongMatches`). An
 * opportunity whose eligibility nobody checked — or that was checked and not
 * met — was still added to grant_finder_strong_matches_total, so the metric
 * disagreed with the discovery result it was counted from.
 *
 * The service is a double; the route and the metrics module are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock('../../services/grants/grant-finder-service', () => ({
  discoverOpportunities: (...a: unknown[]) => discover(...a),
}));
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));

import router from '../grant-finder';
import { resetGrantFinderMetrics, snapshotGrantFinderMetrics } from '../../services/grant-finder-metrics';

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
  discover.mockReset();
  resetGrantFinderMetrics();
});

describe('GET /api/grant-finder/discover — the strong-match counter', () => {
  it('counts the strong matches the service reports, not every fit score >= 70', async () => {
    discover.mockResolvedValueOnce({
      scored: 3,
      // Only the third is strong: the first was never checked, the second was checked and not met.
      strongMatches: 1,
      eligibilityNotChecked: 1,
      hydrationAttempted: 3,
      hydrationFailures: 0,
      profileUsed: { keywords: ['oncology'], agencies: [], mechanisms: [], institutionType: null, minAward: null, maxAward: null },
      matches: [
        { externalId: 'a', fitScore: 92, eligible: null },
        { externalId: 'b', fitScore: 88, eligible: false },
        { externalId: 'c', fitScore: 75, eligible: true },
      ],
    });

    const r = await request(app()).get('/api/grant-finder/discover?query=oncology');

    expect(r.status).toBe(200);
    expect(snapshotGrantFinderMetrics()).toMatchObject({ discoveriesRun: 1, opportunitiesScored: 3, strongMatches: 1 });
  });
});
