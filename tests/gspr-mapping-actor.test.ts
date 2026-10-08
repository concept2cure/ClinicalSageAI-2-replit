/**
 * A GSPR applicability decision names the session's user as its decider, and
 * the request body cannot write the decision's attribution (ledger L195).
 *
 * `POST /api/gspr/programs/:programId/mappings` spread the whole request body
 * into the row it stored. So the body chose `decidedBy` and `decidedAt`, could
 * set `reviewedBy` / `reviewedAt` (nothing else writes them, so a forged review
 * was the only kind there was) and even the row `id`. With no user on the
 * request, the decider fell back to the string 'system'.
 *
 * The program check reads the pool; the service is mocked at its one write, and
 * what it is handed is what the route chose to store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  upserted: [] as Array<Record<string, unknown>>,
  audited: [] as Array<Record<string, unknown>>,
}));

vi.mock('../server/db', () => {
  const query = (sql: string) =>
    Promise.resolve(/FROM regulatory_programs/.test(sql) ? { rows: [{ id: 'p' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  return { db: {}, pool: { query }, getPool: () => ({ query }) };
});
vi.mock('../server/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../server/services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async (row: Record<string, unknown>) => {
    state.audited.push(row);
    return { persisted: true };
  }),
}));
vi.mock('../server/services/gspr-postmarket/gspr.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    upsertMapping: vi.fn(async (values: Record<string, unknown>) => {
      state.upserted.push(values);
      return { id: 'm1', ...values };
    }),
  };
});

import gsprRouter from '../server/routes/gspr-postmarket';

const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';
const REQUIREMENT = 'bbbbbbbb-0000-4000-8000-000000000002';
const CALLER = 7;

// The session as admitLiveSession attaches it: the subject is a string.
function makeApp(user: Record<string, unknown> | null = { id: String(CALLER), userId: String(CALLER), organizationId: 99 }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) (req as any).user = user;
    next();
  });
  app.use('/api/gspr', gsprRouter);
  return app;
}

const post = (body: Record<string, unknown>, user?: Record<string, unknown> | null) =>
  request(makeApp(user)).post(`/api/gspr/programs/${PROGRAM}/mappings`).send(body);
const DECISION = { requirementId: REQUIREMENT, applicability: 'applies', rationale: 'Annex I 1' };

beforeEach(() => {
  state.upserted = [];
  state.audited = [];
});

describe('a GSPR decision is attributed to the session user (L195)', () => {
  it.each([
    ['decidedBy', { decidedBy: 'someone-else' }],
    ['decidedAt', { decidedAt: '2020-01-01T00:00:00Z' }],
    ['reviewedBy', { reviewedBy: 'qa-lead' }],
    ['reviewedAt', { reviewedAt: '2020-01-01T00:00:00Z' }],
  ])('a body that sets %s is refused, and nothing is stored', async (field, extra) => {
    const res = await post({ ...DECISION, ...extra });
    // Leak assertion first: what would have been stored.
    expect(state.upserted.map((v) => v[field]), `the body must never write ${field}`).not.toContain(
      Object.values(extra)[0],
    );
    expect(res.status).toBe(422);
    expect(state.upserted).toEqual([]);
  });

  it('the stored row carries only decision fields, a server decider and a server time', async () => {
    const res = await post({ ...DECISION, id: 'cccccccc-0000-4000-8000-000000000003', createdAt: '2020-01-01' });
    expect(res.status).toBe(200);
    expect(state.upserted).toHaveLength(1);
    const stored = state.upserted[0];
    expect(stored).not.toHaveProperty('id');
    expect(stored).not.toHaveProperty('createdAt');
    expect(stored).toMatchObject({
      organizationId: 99,
      programId: PROGRAM,
      requirementId: REQUIREMENT,
      applicability: 'applies',
      rationale: 'Annex I 1',
      decidedBy: String(CALLER),
      // A new decision has not been reviewed: a review left from before the fix
      // (when only a request body wrote it) is cleared, not carried over.
      reviewedBy: null,
      reviewedAt: null,
    });
    expect(stored.decidedAt).toBeInstanceOf(Date);
    expect(state.audited[0]).toMatchObject({ userId: String(CALLER), action: 'gspr.mapping.upsert' });
  });

  it("with no user on the request nothing is stored under 'system'", async () => {
    const res = await post(DECISION, { organizationId: 99 });
    expect(state.upserted.map((v) => v.decidedBy)).not.toContain('system');
    expect(res.status).toBe(401);
    expect(state.upserted).toEqual([]);
  });
});
