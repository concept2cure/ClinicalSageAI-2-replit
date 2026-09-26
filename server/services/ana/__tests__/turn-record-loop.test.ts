/**
 * The doors that run AnA's agentic loop without the stream route —
 * POST /api/claude/agent and the /ana socket — write the same turn record.
 *
 * Pinned here: the shared helper files the tool calls (an error result as a
 * failed step), the answer, and says what these doors cannot report; each door
 * records answered, stopped and failed turns, and hands the status back.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const h = vi.hoisted(() => ({
  pg: null as any,
  loop: null as null | ((req: any, opts: any) => Promise<any>),
}));
vi.mock('../../../db.js', () => {
  const query = (s: string, p?: unknown[]) => h.pg.query(s, p);
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { getPool: () => pool, pool };
});
// The agent route also writes a model-provenance audit entry through
// logAction, on its own connection in production. This harness has one PGlite
// session, which that unrelated write (into a store not created here) would
// leave in an aborted transaction; it is stubbed so the turn record is what is
// tested. writeChainedAuditRow, which the record uses, stays real.
vi.mock('../../auditService', async (orig) => {
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});
vi.mock('../../auditService.js', async (orig) => {
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});
vi.mock('../AnaToolExecutor', async (orig) => ({
  ...(await orig<object>()),
  executeAgenticLoop: (req: any, opts: any) => h.loop!(req, opts),
}));
vi.mock('../AnaToolExecutor.js', async (orig) => ({
  ...(await orig<object>()),
  executeAgenticLoop: (req: any, opts: any) => h.loop!(req, opts),
}));

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { loopToolCollector, recordLoopTurn } from '../turn-record-loop';
import { loadTurnRecord, verifyStoredTurnRecord } from '../turn-record-verify';
import { runAgenticTurn, AnaRealtimeSession } from '../ana-realtime';
import router from '../../../routes/ana-intelligence';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 7;
const pool = () => ({ connect: async () => ({ query: (s: string, p?: unknown[]) => h.pg.query(s, p), release: () => undefined }) });

beforeAll(async () => {
  h.pg = new PGlite();
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await h.pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await h.pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => h.pg.close());
beforeEach(() => {
  h.loop = null;
  delete process.env.AUDIT_HMAC_KEY;
});

/** A loop that calls two tools — one of which fails — then answers. */
const twoToolLoop = async (_req: any, opts: any) => {
  opts.onToolExecution?.('project_knowledge_search', { query: 'endpoint' }, '{"hits":2}');
  opts.onToolExecution?.('lookup_regulation', { cfr: '312.23' }, '{"error":"not found"}');
  return { content: 'PFS at 12 months.', model: 'm', provider: 'anthropic', thinking: 'short' };
};

describe('recordLoopTurn', () => {
  it('files the tool calls, an error result as a failed step, the answer, and what the door cannot report', async () => {
    const c = loopToolCollector();
    c.onToolExecution('project_knowledge_search', { query: 'x' }, '{"hits":1}');
    c.onToolExecution('lookup_regulation', { cfr: '312' }, '{"error":"not found"}');
    const status = await recordLoopTurn(pool() as any, {
      orgId: ORG, userId: 1, surface: 'test', typed: 'q', messages: [{ role: 'user', content: 'q' }],
      calls: c.calls, response: { content: 'a', model: 'm', provider: 'anthropic' }, outcome: 'answered',
    });
    expect(status.status).toBe('recorded');
    const stored = (await loadTurnRecord(h.pg, ORG, (status as any).id))!;
    const body = JSON.parse(stored.recordText);
    expect(body.steps.map((s: any) => [s.tool, s.status, s.error])).toEqual([
      ['project_knowledge_search', 'success', null],
      ['lookup_regulation', 'error', 'not found'],
    ]);
    expect(body.warnings.join(' ')).toMatch(/does not report|reports its tool calls and final answer but not its rounds/);
    expect(verifyStoredTurnRecord(stored).ok).toBe(true);
  });

  it('a turn with no organization is not recorded, and says why', async () => {
    const status = await recordLoopTurn(pool() as any, {
      orgId: null, userId: 1, surface: 'test', typed: 'q', messages: [], calls: [], outcome: 'answered',
    });
    expect(status).toEqual({ status: 'not_recorded', reason: 'This turn had no organization to file it under.' });
  });
});

describe('POST /api/claude/agent', () => {
  const app = () => {
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).organizationId = ORG;
      (req as any).userId = 1;
      next();
    });
    a.use('/api/claude', router);
    return a;
  };

  it('records the turn and returns its status', async () => {
    h.loop = twoToolLoop;
    const res = await request(app()).post('/api/claude/agent').send({ prompt: 'What is the primary endpoint?' });
    expect(res.status).toBe(200);
    expect(res.body.data.turnRecord.status).toBe('recorded');
    const body = JSON.parse((await loadTurnRecord(h.pg, ORG, res.body.data.turnRecord.id))!.recordText);
    expect(body.turn.surface).toBe('api:claude/agent');
    expect(body.turn.outcome).toBe('answered');
    expect(body.steps).toHaveLength(2);
  });

  it('files the turn under the tenant the auth middleware attaches, not only req.organizationId', async () => {
    // The shape authenticateToken leaves on a real request: no req.organizationId.
    const real = express();
    real.use(express.json());
    real.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).tenantContext = { organizationId: ORG };
      (req as any).user = { id: 1 };
      next();
    });
    real.use('/api/claude', router);
    h.loop = twoToolLoop;
    const res = await request(real).post('/api/claude/agent').send({ prompt: 'tenant from context' });
    expect(res.body.data.turnRecord.status).toBe('recorded');
    const body = JSON.parse((await loadTurnRecord(h.pg, ORG, res.body.data.turnRecord.id))!.recordText);
    expect([body.turn.organizationId, body.turn.actorUserId]).toEqual([ORG, 1]);
  });

  it('records a failed turn', async () => {
    h.loop = async (_r, opts) => {
      opts.onToolExecution?.('project_knowledge_search', { query: 'x' }, '{"hits":0}');
      throw new Error('gateway down');
    };
    const before = (await h.pg.query(`SELECT count(*)::int AS n FROM ana_turn_records WHERE outcome = 'failed'`)).rows[0].n;
    const res = await request(app()).post('/api/claude/agent').send({ prompt: 'fails' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    const after = (await h.pg.query(`SELECT count(*)::int AS n FROM ana_turn_records WHERE outcome = 'failed'`)).rows[0].n;
    expect(after - before).toBe(1);
  });
});

describe('the /ana socket turn', () => {
  const input = { turnId: 't1', message: 'What is the primary endpoint?', organizationId: ORG, userId: 1 };

  it('records an answered turn and emits its status with ana:done', async () => {
    h.loop = twoToolLoop;
    const events: Array<[string, any]> = [];
    const session = new AnaRealtimeSession((e, p) => events.push([e, p]), runAgenticTurn);
    await session.handleMessage(input);
    const done = events.find(([e]) => e === 'ana:done')![1];
    expect(done.turnRecord.status).toBe('recorded');
    const body = JSON.parse((await loadTurnRecord(h.pg, ORG, done.turnRecord.id))!.recordText);
    expect([body.turn.surface, body.turn.outcome, body.steps.length]).toEqual(['socket:ana', 'answered', 2]);
  });

  it('records a stopped turn when the signal was aborted', async () => {
    const ctl = new AbortController();
    h.loop = async (_r, opts) => {
      opts.onToolExecution?.('project_knowledge_search', { query: 'x' }, '{"hits":0}');
      ctl.abort();
      throw new Error('aborted');
    };
    const err = await runAgenticTurn(input, ctl.signal, () => undefined).catch((e) => e);
    expect(err.turnRecord.status).toBe('recorded');
    expect(JSON.parse((await loadTurnRecord(h.pg, ORG, err.turnRecord.id))!.recordText).turn.outcome).toBe('stopped');
  });

  it('records a failed turn and emits its status with ana:error', async () => {
    h.loop = async () => {
      throw new Error('gateway down');
    };
    const events: Array<[string, any]> = [];
    const session = new AnaRealtimeSession((e, p) => events.push([e, p]), runAgenticTurn);
    await session.handleMessage(input);
    const error = events.find(([e]) => e === 'ana:error')![1];
    expect(error.turnRecord.status).toBe('recorded');
    expect(JSON.parse((await loadTurnRecord(h.pg, ORG, error.turnRecord.id))!.recordText).turn.outcome).toBe('failed');
  });
});
