/**
 * A blocker's resolver is the session's user, never a request field (ledger L195).
 *
 * `PATCH /api/submission-ops/blockers/:blockerId` stored `resolvedById ||
 * getUserId(req)`, so any editor could record a submission blocker as resolved
 * by somebody else: a colleague, or an id from another organisation. That is a
 * Part 11 attribution defect (who did it), and row security cannot see it,
 * because the row is the caller's own.
 *
 * The database is mocked at the one handle the route uses; the UPDATE's SET
 * payload is what the route chose to record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  set: null as Record<string, unknown> | null,
  returning: [] as unknown[],
}));

vi.mock('../server/db', () => {
  const chain: any = {
    update() { return chain; },
    set(values: Record<string, unknown>) { state.set = values; return chain; },
    where() { return chain; },
    returning() { return Promise.resolve(state.returning); },
  };
  return { db: chain, pool: { query: vi.fn(), connect: vi.fn() } };
});
vi.mock('../server/routes/c2c/actions', () => ({ recordGovernedAction: vi.fn() }));
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({ readCanonicalDueSoonAndWorkload: vi.fn() }));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({ packageLeafBytes: vi.fn() }));

import submissionOpsRouter from '../server/routes/submission-ops';

const CALLER = 777;
const SOMEONE_ELSE = 4242;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: CALLER, organizationId: 99, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  app.use('/api/submission-ops', submissionOpsRouter);
  return app;
}

const patch = (body: Record<string, unknown>) =>
  request(makeApp()).patch('/api/submission-ops/blockers/blk_1').send(body);

beforeEach(() => {
  state.set = null;
  state.returning = [{ blockerId: 'blk_1', status: 'resolved' }];
});

describe('a blocker is resolved by the session user (L195)', () => {
  it('a body naming another resolver is refused, and nothing is written', async () => {
    const res = await patch({ status: 'resolved', resolvedById: SOMEONE_ELSE });
    // Leak assertion first: what would have been recorded.
    expect(state.set?.resolvedById, 'the record must never name a resolver the session is not').not.toBe(SOMEONE_ELSE);
    expect(res.status).toBe(422);
    expect(state.set).toBeNull();
  });

  it('resolving with no resolver in the body records the caller', async () => {
    const res = await patch({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(state.set).toMatchObject({ status: 'resolved', resolvedById: CALLER });
  });

  it('a body naming the caller themself is accepted, and records the caller', async () => {
    const res = await patch({ status: 'resolved', resolvedById: CALLER });
    expect(res.status).toBe(200);
    expect(state.set).toMatchObject({ resolvedById: CALLER });
  });

  it('a status change that is not a resolution records no resolver', async () => {
    const res = await patch({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(state.set).not.toHaveProperty('resolvedById');
  });
});
