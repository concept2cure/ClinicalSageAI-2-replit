/**
 * GET /api/mdx/gateways/transmittals filters by any region a registered gateway
 * serves (FILING_SPINE F13, docs/design/FILING_SPINE.md §7.2).
 *
 * The Dispatch tab lists a market's transmittals with
 * ?program_id=&region=, the region being the one its gateway serves.
 * transmitSequence routes to every registered gateway (MHRA, NMPA, TGA, …) and
 * records that region on the row, but the list's filter took only the four the
 * package-transmit route takes (fda, ema, pmda, ca), so a UK sequence's
 * transmissions could never be listed: 422 on every read. The gateway registry
 * here is the real one; only the database is stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryFn = vi.hoisted(() => vi.fn());
vi.mock('../server/db', () => ({
  pool: { query: (...args: unknown[]) => queryFn(...args), connect: vi.fn() },
  getPool: () => ({ query: (...args: unknown[]) => queryFn(...args), connect: vi.fn() }),
  db: {},
}));

import gatewayRouter from '../server/routes/mdx-submission-gateway';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: 99, role: 'admin' };
    next();
  });
  app.use('/api/mdx', gatewayRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('the transmittal list filters by the region a registered gateway serves', () => {
  it('lists a UK market’s transmittals for its project', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ id: 9, region: 'uk', gateway: 'mhra_gateway', status: 'submitted' }] });
    const res = await request(makeApp()).get(`/api/mdx/gateways/transmittals?program_id=${PROGRAM}&region=uk`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([expect.objectContaining({ id: 9, region: 'uk' })]);
    const [sql, params] = queryFn.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/t\.organization_id = \$1 AND t\.program_id = \$2 AND t\.region = \$3/);
    expect(params.slice(0, 3)).toEqual([99, PROGRAM, 'uk']);
  });

  it('still refuses a region no registered gateway serves, and reads nothing', async () => {
    const res = await request(makeApp()).get(`/api/mdx/gateways/transmittals?program_id=${PROGRAM}&region=mars`);
    expect(res.status).toBe(422);
    expect(queryFn).not.toHaveBeenCalled();
  });
});
