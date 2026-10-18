/**
 * The Regulatory Correspondence routes act as the signed-in user or answer
 * 401; and the learning memory the outbound path writes states no confidence.
 *
 * What the code used to do (until 2026-10-15):
 *   - requireActorContext resolved a request with no user as user 0, so the
 *     submission-state gate event was recorded as decided by 'system'
 *     (`String(actor.userId || 'system')`) and an issue review was written to
 *     the governed-action ledger by user 0. Neither names anyone.
 *   - persistCorrespondenceLearning wrote `confidenceScore ?? 0.78`, and its one
 *     caller (persistOutboundCorrespondenceRecord) passed a literal 0.82 —
 *     confidences nothing computed, which the memory readers rank and print.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  statements: [] as string[],
  memoryInserts: [] as Array<Record<string, unknown>>,
  transition: vi.fn(async (..._a: unknown[]) => ({ persisted: true })),
  governedAction: vi.fn(async (..._a: unknown[]) => ({ actionId: 'act-1', sha256Chain: 'c'.repeat(64) })),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    if (h.user) req.user = { ...h.user };
    next();
  },
}));
vi.mock('../../db', () => {
  const query = async (sql: string) => {
    h.statements.push(sql.replace(/\s+/g, ' ').trim());
    if (/to_regclass/.test(sql)) return { rows: [{ tbl: 'c2c_submissions' }] };
    if (/UPDATE c2c_submissions/.test(sql)) return { rows: [{ id: 'sub-1', project_id: 7, lifecycle_state: 'information_request_open' }] };
    if (/UPDATE c2c_correspondence_issues/.test(sql)) return { rows: [{ id: 'iss-1' }] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return {
    pool,
    getPool: () => pool,
    getDb: () => ({}),
    db: {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          h.memoryInserts.push(v);
        },
      }),
    },
    transaction: async (cb: (client: typeof pool) => unknown) => cb(pool),
  };
});
vi.mock('../c2c/actions', () => ({ recordGovernedAction: (...a: unknown[]) => h.governedAction(...a) }));
vi.mock('../../services/governed-decision-repository.js', () => ({
  hasUnresolvedGovernedDecisions: async () => ({ hasUnresolved: true, unresolvedCount: 2, escalatedCount: 0 }),
  recordTransitionEvent: (...a: unknown[]) => h.transition(...a),
}));
vi.mock('../../services/governance-observability.js', () => ({
  governanceMetrics: { recordTransitionExecuted: () => undefined },
}));
vi.mock('../../services/intelligence/project-intelligence-service', () => ({ getOrCreateProfile: async () => 3 }));

import routes, { persistOutboundCorrespondenceRecord } from '../regulatory-correspondence';

const app = express();
app.use(express.json());
app.use('/api/regulatory-correspondence', routes);

const SIGNED_IN = { id: 11, organizationId: 2 };
const NO_USER = { organizationId: 2 };

beforeEach(() => {
  h.user = SIGNED_IN;
  h.statements.length = 0;
  h.memoryInserts.length = 0;
  h.transition.mockClear();
  h.governedAction.mockClear();
});

const changeState = () =>
  request(app)
    .patch('/api/regulatory-correspondence/submissions/sub-1/state')
    .send({ lifecycleState: 'information_request_open' });

describe('PATCH /submissions/:id/state — who the lifecycle gate event names', () => {
  it('names the signed-in user', async () => {
    const res = await changeState();
    expect(res.status).toBe(200);
    expect(h.transition).toHaveBeenCalledTimes(1);
    expect(h.transition.mock.calls[0][0]).toMatchObject({ actorId: '11' });
  });

  it('answers 401 with no user, and changes and records nothing (it recorded "system")', async () => {
    h.user = NO_USER;
    const res = await changeState();
    expect(res.status).toBe(401);
    expect(h.transition).not.toHaveBeenCalled();
    expect(h.statements.filter((s) => /UPDATE c2c_submissions/.test(s))).toEqual([]);
  });
});

describe('PATCH /issues/:id/review — the governed resolve', () => {
  it('answers 401 with no user, and writes no governed action (it wrote one by user 0)', async () => {
    h.user = NO_USER;
    const res = await request(app)
      .patch('/api/regulatory-correspondence/issues/iss-1/review')
      .send({ reason: 'Confirmed against the letter', humanReviewStatus: 'confirmed' });
    expect(res.status).toBe(401);
    expect(h.governedAction).not.toHaveBeenCalled();
  });
});

describe('persistOutboundCorrespondenceRecord — the learning memory entry', () => {
  it('states no confidence (null), not an invented 0.82', async () => {
    await persistOutboundCorrespondenceRecord({
      orgId: 2,
      projectId: 7,
      subject: 'Readiness digest',
      recipients: ['agency-contact'],
    });
    expect(h.memoryInserts).toHaveLength(1);
    expect(h.memoryInserts[0].confidenceScore).toBeNull();
  });
});
