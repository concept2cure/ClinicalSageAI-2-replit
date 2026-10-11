/**
 * POST /api/ana-ri/governed-action — only the person who asked may approve or
 * decline what AnA is holding.
 *
 * The route checked the org, that the run was waiting, and that the toolUseId
 * matched. Nothing tied the decision to ana_runs.user_id, so any member of the
 * org who knew a run's id and toolUseId could approve — executing a governed
 * write under their own signature on a step someone else asked for — or decline
 * it. `applyControl` already refused a non-owner; this was the one gap.
 *
 * The run-control mock below emulates the row and the SQL: the owner filter is
 * applied when — and only when — the caller hands the statement a user id. That
 * is exactly the difference between the old statement and the fixed one, so the
 * colleague case reproduces the defect against the old route and fails closed
 * against the new one. The SQL itself is pinned in run-control.pglite.
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const ORG = 1;
const OTHER_ORG = 2;
const ASKER = 42;
const COLLEAGUE = 43;

const executed: unknown[] = [];
const audits: string[] = [];
const writes: Array<{ runId: string; orgId: number; byUserId: number | null; decided: string }> = [];

/** The one held run: asked by ASKER in ORG. */
let row: { id: string; orgId: number; userId: number | null; held: boolean };
const PENDING = { toolUseId: 'tu-1', command: 'update_milestone', params: {} };

vi.mock('../../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async (_c: unknown, runId: string, orgId: number, userId?: number) => {
    if (row.id !== runId || row.orgId !== orgId || !row.held) return null;
    if (userId !== undefined && row.userId !== userId) return null;
    return PENDING;
  }),
  isRunAwaitingApproval: vi.fn(async (_c: unknown, runId: string, orgId: number) =>
    row.id === runId && row.orgId === orgId && row.held,
  ),
  recordApprovalDecision: vi.fn(
    async (_c: unknown, runId: string, orgId: number, d: { decided: string; byUserId: number | null }) => {
      writes.push({ runId, orgId, byUserId: d.byUserId, decided: d.decided });
      return true;
    },
  ),
}));
vi.mock('../../../services/auditService.js', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string }) => {
      audits.push(entry.action);
      return { persisted: true, chained: true };
    }),
  },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async (commands: unknown[]) => {
    executed.push(commands);
    return [{ success: true }];
  }),
}));

let app: express.Express;
let caller = { orgId: ORG, userId: ASKER };

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = caller.orgId;
    (req as any).userId = caller.userId;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  caller = { orgId: ORG, userId: ASKER };
  row = { id: 'run-1', orgId: ORG, userId: ASKER, held: true };
  executed.length = 0;
  audits.length = 0;
  writes.length = 0;
});

const REASON = 'Moving the milestone after the QA review';
const decide = (body: Record<string, unknown>) =>
  request(app).post('/api/ana-ri/governed-action').send({ reasonForChange: REASON, runId: 'run-1', toolUseId: 'tu-1', ...body });

describe('only the asker decides a held AnA step', () => {
  it('A COLLEAGUE IN THE SAME ORG WITH THE RIGHT runId AND toolUseId CANNOT APPROVE', async () => {
    caller = { orgId: ORG, userId: COLLEAGUE };
    const res = await decide({});
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code ?? res.body.error?.code).toBe('NOT_RUN_OWNER');
    expect(executed, 'nothing executes').toHaveLength(0);
    expect(writes, 'no decision is written against the run').toHaveLength(0);
    expect(audits, 'no sign-off is recorded for a refused caller').toHaveLength(0);
  });

  it('a colleague cannot decline it either', async () => {
    caller = { orgId: ORG, userId: COLLEAGUE };
    const res = await decide({ decision: 'decline' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code ?? res.body.error?.code).toBe('NOT_RUN_OWNER');
    expect(writes).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('a run with no owner is decided by no person', async () => {
    row.userId = null;
    const res = await decide({});
    expect(res.status).toBe(403);
    expect(executed).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it('another org still gets the 404 every other refusal gives it', async () => {
    caller = { orgId: OTHER_ORG, userId: COLLEAGUE };
    const res = await decide({});
    expect(res.status).toBe(404);
    expect(res.body.code ?? res.body.error?.code).toBe('NO_PENDING_APPROVAL');
    expect(writes).toHaveLength(0);
  });

  it('the asker still approves, and the decision is written as theirs', async () => {
    const res = await decide({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed).toHaveLength(1);
    expect(writes).toEqual([{ runId: 'run-1', orgId: ORG, byUserId: ASKER, decided: 'approved' }]);
  });

  it('the asker still declines', async () => {
    const res = await decide({ decision: 'decline' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(executed).toHaveLength(0);
    expect(writes).toEqual([{ runId: 'run-1', orgId: ORG, byUserId: ASKER, decided: 'denied' }]);
  });
});
