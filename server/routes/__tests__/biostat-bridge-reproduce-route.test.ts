/**
 * The reproduction check is reachable over HTTP (2026-10-12).
 *
 * `reproduceComputationRun` re-runs a stored sizing on its stored inputs and
 * reports whether it still produces the figure that was filed. It was
 * reachable from nothing — no route, no AnA tool, no client code — while
 * `recordComputationRun` had been writing the rows since 2026-10-08. The
 * records existed and could not be checked, which is the same as not having
 * them when a reviewer asks.
 *
 * This file is about the ROUTE: that it exists, is tenant-gated, validates its
 * id, and distinguishes a run that is not visible from one that failed to
 * reproduce. The arithmetic and the four facts are pinned in
 * `server/services/stats/__tests__/reproduce-computation-run.test.ts`.
 *
 * RED before the route existed: every case 404s on the path itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const reproduceSizingRun = vi.hoisted(() => vi.fn());
vi.mock('../../services/biostatistics-bridge/bridge-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reproduceSizingRun,
}));

const orgState: { orgId: number | null } = { orgId: 1 };
vi.mock('../../types/auth-request', () => ({
  resolveOrgId: () => orgState.orgId,
  resolveUserId: () => 1,
}));

import router from '../biostat-bridge';

const INTACT = {
  found: true,
  runId: 41,
  method: 'ana-biostats:compute',
  inputsIntact: true,
  outputsIntact: true,
  reproduced: true,
  engineVersionMatches: true,
  storedOutputsSha256: 'abc',
  recomputedOutputsSha256: 'abc',
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, _res: Response, next: NextFunction) => next());
  a.use('/api/biostat-bridge', router);
  return a;
}
const get = (path: string) => request(app()).get(`/api/biostat-bridge${path}`);

beforeEach(() => {
  orgState.orgId = 1;
  reproduceSizingRun.mockReset();
  reproduceSizingRun.mockResolvedValue(INTACT);
});

describe('GET /computation-runs/:runId/reproduce', () => {
  it('reports the four facts for a run that reproduces', async () => {
    const res = await get('/computation-runs/41/reproduce');
    expect(res.status, 'the route is not served').toBe(200);
    expect(res.body.data).toMatchObject({
      inputsIntact: true, outputsIntact: true, reproduced: true, engineVersionMatches: true,
    });
    expect(reproduceSizingRun).toHaveBeenCalledWith(1, 41);
  });

  it('reports a run that no longer reproduces WITHOUT failing the request', async () => {
    reproduceSizingRun.mockResolvedValue({ ...INTACT, reproduced: false, recomputedOutputsSha256: 'xyz' });
    const res = await get('/computation-runs/41/reproduce');
    /* A figure that does not reproduce is an ANSWER, not an error. A 500 here
       would tell a sponsor the check broke when what it found is that their
       filed number cannot be reproduced — the opposite of useful. */
    expect(res.status).toBe(200);
    expect(res.body.data.reproduced).toBe(false);
    expect(res.body.data.recomputedOutputsSha256).toBe('xyz');
  });

  it('is 404 for a run the tenant cannot see, not a failed reproduction', async () => {
    reproduceSizingRun.mockResolvedValue({ found: false });
    const res = await get('/computation-runs/41/reproduce');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('passes the caller’s organization, so a cross-tenant run is invisible', async () => {
    orgState.orgId = 9;
    await get('/computation-runs/41/reproduce');
    expect(reproduceSizingRun).toHaveBeenCalledWith(9, 41);
  });

  it('refuses an unauthenticated request', async () => {
    orgState.orgId = null;
    const res = await get('/computation-runs/41/reproduce');
    expect(res.status).toBe(401);
    expect(reproduceSizingRun).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-3', '1.5'])('refuses %s as a run id rather than querying for NaN', async (bad) => {
    const res = await get(`/computation-runs/${bad}/reproduce`);
    expect(res.status).toBe(400);
    expect(reproduceSizingRun).not.toHaveBeenCalled();
  });

  it('reports a genuine fault as a fault', async () => {
    reproduceSizingRun.mockRejectedValue(new Error('connection terminated'));
    const res = await get('/computation-runs/41/reproduce');
    expect(res.status).toBe(500);
    // And not by echoing the driver's text.
    expect(JSON.stringify(res.body)).not.toMatch(/connection terminated/);
  });
});
