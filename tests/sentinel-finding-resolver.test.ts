/**
 * A Sentinel finding is resolved by the session's user, never by a request
 * field (ledger L195).
 *
 * `PATCH /api/sentinel/findings/:findingId` passed the body's `resolvedById`
 * straight to the UPDATE, and recorded no resolver at all when the body left it
 * out. So a finding could be closed in somebody else's name, or in nobody's.
 *
 * The scheduler is mocked at the one call the route makes; its arguments are
 * what the route chose to record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('../server/db', () => ({ getPool: () => ({ query: vi.fn() }), pool: { query: vi.fn() } }));
vi.mock('../server/services/sentinel/scheduler', () => ({
  getSentinelScheduler: () => ({
    getSentinel: () => ({
      updateFindingStatus: vi.fn(async (...args: unknown[]) => {
        state.calls.push(args);
        return { finding_id: args[0], status: args[2] };
      }),
    }),
  }),
}));

import sentinelRouter from '../server/routes/sentinel-routes';

const CALLER = 31;
const SOMEONE_ELSE = 4242;

function makeApp(user: Record<string, unknown> = { id: CALLER, organizationId: 99 }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = user;
    next();
  });
  app.use('/api/sentinel', sentinelRouter);
  return app;
}

const patch = (body: Record<string, unknown>, user?: Record<string, unknown>) =>
  request(makeApp(user)).patch('/api/sentinel/findings/f-1').send(body);

beforeEach(() => {
  state.calls = [];
});

describe('a Sentinel finding is resolved by the session user (L195)', () => {
  it('a body naming another resolver is refused, and nothing is written', async () => {
    const res = await patch({ status: 'resolved', resolvedById: SOMEONE_ELSE });
    // Leak assertion first: what would have been recorded.
    expect(state.calls.map((c) => c[3]), 'the record must never name a resolver the session is not').not.toContain(
      SOMEONE_ELSE,
    );
    expect(res.status).toBe(422);
    expect(state.calls).toEqual([]);
  });

  it('resolving with no resolver in the body records the caller, not nobody', async () => {
    const res = await patch({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([['f-1', 99, 'resolved', CALLER]]);
  });

  it('resolving with no user id on the session is refused, not recorded as nobody', async () => {
    const res = await patch({ status: 'resolved' }, { organizationId: 99 });
    expect(state.calls).toEqual([]);
    expect(res.status).toBe(401);
  });

  it('acknowledging is unchanged and needs no resolver', async () => {
    const res = await patch({ status: 'acknowledged' });
    expect(res.status).toBe(200);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].slice(0, 3)).toEqual(['f-1', 99, 'acknowledged']);
  });
});
