/**
 * POST /api/ana-ri/governed-action on a run that ended while its person was
 * signing (AnA detach DT3 review, finding 4.3).
 *
 * The route checked `awaiting_approval` once, at the start, then verified the
 * e-signature, wrote the sign-off and executed; the release afterwards matched
 * nothing and its answer was discarded. Since DT3 a held run can end under a
 * person mid-signature — an administrator's stop, the session's end from
 * another device, the 40-minute cap, a shutdown — and the turn then records
 * the step as "did not run" while the ledger says it ran. Now:
 *
 *   - the held approval is claimed atomically (run-control.ts claimApproval)
 *     before the sign-off row and the execution; a run that ended refuses the
 *     claim, nothing is executed, nothing is signed off, and the person is
 *     told; a second request for the same step is refused as in progress;
 *   - a sign-off row that is refused gives the claim back;
 *   - a run that ended DURING the execution (the release matched nothing) is
 *     said in the response (`runEnded: true`), logged at error level, and
 *     written to the ledger beside the execution row.
 *
 * The run-control mock below holds one run's claim, as the SQL does
 * (run-control-detach.pglite.test.ts pins the SQL).
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const ORG = 1;
const ASKER = 42;
const PENDING = { toolUseId: 'tu-1', command: 'update_milestone', params: {} };

const io = vi.hoisted(() => ({
  executed: [] as unknown[],
  audits: [] as Array<{ action: string; details?: Record<string, unknown> }>,
  decisions: [] as string[],
  claim: 'claimed' as 'claimed' | 'already_claimed' | 'not_waiting',
  claims: 0,
  released: 0,
  /** recordApprovalDecision matched the waiting run (false: the run had ended). */
  releaseMatches: true,
  /** The sign-off row persists. */
  signoffPersists: true,
}));

vi.mock('../../../db/requestDb', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: vi.fn() })),
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readPendingApproval: vi.fn(async () => PENDING),
  isRunAwaitingApproval: vi.fn(async () => true),
  claimApproval: vi.fn(async () => {
    io.claims++;
    return io.claim;
  }),
  releaseApprovalClaim: vi.fn(async () => {
    io.released++;
  }),
  recordApprovalDecision: vi.fn(async (_c: unknown, _r: string, _o: number, d: { decided: string }) => {
    io.decisions.push(d.decided);
    return io.releaseMatches;
  }),
}));
vi.mock('../../../services/auditService.js', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string; details?: Record<string, unknown> }) => {
      io.audits.push(entry);
      const persisted = entry.action.startsWith('ana.governed_action.') && entry.action !== 'ana.governed_action.executed' && entry.action !== 'ana.governed_action.run_ended'
        ? io.signoffPersists
        : true;
      return { persisted, chained: persisted };
    }),
  },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async (commands: unknown[]) => {
    io.executed.push(commands);
    return [{ success: true }];
  }),
}));

let app: express.Express;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = ORG;
    (req as any).userId = ASKER;
    next();
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  Object.assign(io, {
    executed: [], audits: [], decisions: [], claim: 'claimed', claims: 0, released: 0, releaseMatches: true, signoffPersists: true,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const REASON = 'Moving the milestone after the QA review';
const approve = () =>
  request(app).post('/api/ana-ri/governed-action').send({ reasonForChange: REASON, runId: 'run-1', toolUseId: 'tu-1' });
const actions = () => io.audits.map(a => a.action);

describe('a governed action on a run that ended while its person signed (DT3 review)', () => {
  it('the run had ended: 409 RUN_ENDED, nothing executed, nothing signed off, no decision written', async () => {
    io.claim = 'not_waiting';
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code ?? res.body.error?.code).toBe('RUN_ENDED');
    expect(JSON.stringify(res.body)).toContain('The run ended before your approval arrived, so the action did not run. Nothing was changed.');
    expect(io.executed).toHaveLength(0);
    expect(actions()).toEqual([]);
    expect(io.decisions).toEqual([]);
  });

  it('a second request for the same step: 409 APPROVAL_IN_PROGRESS, and it does not run twice', async () => {
    io.claim = 'already_claimed';
    const res = await approve();
    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.error?.code).toBe('APPROVAL_IN_PROGRESS');
    expect(io.executed).toHaveLength(0);
    expect(actions()).toEqual([]);
  });

  it('claimed before the sign-off row and the execution', async () => {
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(io.claims).toBe(1);
    expect(io.executed).toHaveLength(1);
    expect(io.decisions).toEqual(['approved']);
    expect(res.body.runEnded).toBeUndefined();
  });

  it('a sign-off row that is refused gives the claim back, so the person can try again', async () => {
    io.signoffPersists = false;
    const res = await approve();
    expect(res.status).toBe(500);
    expect(io.executed).toHaveLength(0);
    expect(io.released).toBe(1);
  });

  it('the run ended DURING the execution: said in the response, and in the ledger beside the execution row', async () => {
    io.releaseMatches = false;
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(io.executed).toHaveLength(1);
    expect(JSON.stringify(res.body)).toContain('"runEnded":true');
    expect(actions()).toEqual(['ana.governed_action.reason', 'ana.governed_action.executed', 'ana.governed_action.run_ended']);
    expect(io.audits.at(-1)?.details).toMatchObject({ runId: 'run-1', toolUseId: 'tu-1', command: 'update_milestone' });
    expect(console.error).toHaveBeenCalled();
  });
});
