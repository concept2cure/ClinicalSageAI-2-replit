/**
 * POST /api/ana-ri/governed-action — a decision on a held run is written against
 * the same tenant whose run the lookup proved was waiting.
 *
 * `recordApprovalDecision` updated ana_runs by run id and toolUseId with no
 * organization predicate. Every caller runs the org-scoped `readPendingApproval`
 * first, so it was not reachable cross-tenant — but the safety lived in a
 * different statement, and with RLS_ENFORCE off the statement is the only place
 * a boundary can live (ledger L206). The predicate is now in the UPDATE; this
 * file pins the WIRING that feeds it: which org reaches the lookup and the write,
 * and that they are the same org. A refactor of this handler can break that
 * while every SQL-level test in run-control.pglite stays green.
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const ORG_A = 1;
const ORG_B = 2;

const lookups: Array<{ runId: string; orgId: number }> = [];
const writes: Array<{ runId: string; orgId: number; decided: string }> = [];
let pending: unknown = null;

vi.mock('../../../db/requestDb', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock('../../../services/ana/run-control.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async (_c: unknown, runId: string, orgId: number) => {
    lookups.push({ runId, orgId });
    return pending;
  }),
  recordApprovalDecision: vi.fn(async (_c: unknown, runId: string, orgId: number, d: { decided: string }) => {
    writes.push({ runId, orgId, decided: d.decided });
    return true;
  }),
}));

// Past the sign-off gate, so the request reaches the decision write. Reason-only
// tier (no e-signature), a persisted audit row, and a command that succeeds.
vi.mock('../../../services/ana-ri/part11-governance.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requiresPart11Signoff: vi.fn(() => true),
  requiresEsignature: vi.fn(() => false),
}));
vi.mock('../../../services/auditService.js', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async () => [{ success: true }]),
}));

let app: express.Express;
let callerOrgId: number = ORG_A;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  // Stands in for authenticateToken: an authenticated caller of one org.
  app.use((req, _res, next) => {
    (req as any).tenantId = callerOrgId;
    (req as any).userId = 42;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  callerOrgId = ORG_A;
  lookups.length = 0;
  writes.length = 0;
  pending = { toolUseId: 'tu-1', command: 'lock_section', params: {} };
});

const REASON = 'Locking the CMC section before the filing';
const decide = (body: Record<string, unknown>) =>
  request(app).post('/api/ana-ri/governed-action').send({ reasonForChange: REASON, ...body });

describe('a decision on a held run is bound to the tenant that proved it', () => {
  it('writes the decision against the SAME org the lookup used', async () => {
    const res = await decide({ runId: 'run-1', toolUseId: 'tu-1' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(lookups).toEqual([{ runId: 'run-1', orgId: ORG_A }]);
    expect(writes).toEqual([{ runId: 'run-1', orgId: ORG_A, decided: 'approved' }]);
  });

  it('ignores an organization named in the body, for the lookup and the write', async () => {
    await decide({ runId: 'run-1', toolUseId: 'tu-1', organizationId: ORG_B, orgId: ORG_B });
    expect(lookups[0].orgId).toBe(ORG_A);
    expect(writes[0].orgId).toBe(ORG_A);
  });

  it('follows the caller — a caller of another org binds to that org', async () => {
    callerOrgId = ORG_B;
    await decide({ runId: 'run-1', toolUseId: 'tu-1' });
    expect(lookups[0].orgId).toBe(ORG_B);
    expect(writes[0].orgId).toBe(ORG_B);
  });

  it('refuses a run the caller org does not hold, and writes nothing', async () => {
    pending = null; // the org-scoped lookup found nothing for this org
    const res = await decide({ runId: 'someone-elses-run', toolUseId: 'tu-1' });
    expect(res.status).toBe(404);
    expect(writes).toHaveLength(0);
  });
});
