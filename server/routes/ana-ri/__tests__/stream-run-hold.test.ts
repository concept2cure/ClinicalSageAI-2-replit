/**
 * The stream's pause, through the real route, after its wait moved into the
 * turn's shared hold (services/ana/run-hold.ts; row 74, slice S3).
 *
 * The move must change nothing a person or client can see. So this suite is a
 * PARITY suite: it passes against the stream as it was before the move (the
 * inline while-paused loop) and after it, and each case is the behaviour the
 * old loop had:
 *
 *   - a run that is not paused runs its round with no pause frames;
 *   - a paused run holds the round, says `paused` once and `resumed` once,
 *     each with the round, and then runs it;
 *   - a run cancelled while paused says `cancelled` and runs nothing more;
 *   - a pause nobody answers is resumed as abandoned at MAX_PAUSE_MS, once,
 *     and the round then runs.
 *
 * The run row is scripted at the run-control seam; the loop, the checkpoint
 * and the hold are real. The harness is the live-drive-turn.test.ts pattern
 * (that file is inside another lane's window, so it is not touched here).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  const state = {
    script: [] as Array<Array<{ id: string; name: string; input: Record<string, unknown> }> | string>,
    gatewayCalls: 0,
    /** Status reads, in order; the last repeats. */
    statuses: [] as string[],
    /** Once set, every status read returns this. */
    forced: null as string | null,
    wakes: [] as number[],
    /** Added to Date.now(): each wait "takes" the time it was allowed. */
    clockOffset: 0,
    toolRuns: 0,
    resumeAbandoned: 0,
    stops: 0,
    /** The context each tool call was handed. */
    toolCtx: [] as any[],
    /** What each held governed call asked the run row to record. */
    approvals: [] as any[],
    /** When set, minting the thread fails (persistence down). */
    mintFails: false,
  };
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => {
      throw new Error('no dedicated client in this test');
    },
  };
  const gateway = {
    isDeterministic: () => false,
    getEnabledProviders: () => ['anthropic'],
    getModels: () => [],
    route: async (req: any) => {
      state.gatewayCalls++;
      const step = state.script.shift();
      if (Array.isArray(step)) return { content: '', toolUses: step, model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
      const text = step ?? 'Done.';
      req.onStream?.(text, undefined);
      return { content: text, toolUses: [], model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
    },
  };
  const handlers: Record<string, (input: any, ctx?: any) => Promise<string>> = {
    list_app_screens: async (_input, ctx) => {
      state.toolRuns++;
      state.toolCtx.push(ctx);
      return JSON.stringify({ screens: ['vault'] });
    },
  };
  return { state, pool, gateway, handlers };
});

vi.mock('../../../db.js', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
vi.mock('../shared.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared.js')>()),
  ensureGateway: () => h.gateway,
}));
vi.mock('../post-processing.js', () => ({
  runStreamPostProcessing: async (ctx: any) => {
    ctx.res.end();
  },
}));
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({
  getToolHandler: (name: string) => h.handlers[name],
  servedModelOf: (r: { provider?: string | null; model?: string | null; requestId?: string | null } | null) => ({
    provider: r?.provider ?? null,
    model: r?.model ?? null,
    requestId: r?.requestId ?? null,
  }),
}));
vi.mock('../../../services/ana/governed-toolset.js', () => ({
  governedToolsetFor: async () => [
    { name: 'list_app_screens', description: 'list_app_screens', input_schema: { type: 'object', properties: {} } },
    // Confirm-class (tool-authorization.register.json): it is held, never dispatched.
    { name: 'draft_authoring_document', description: 'draft', input_schema: { type: 'object', properties: {} } },
  ],
}));
vi.mock('../../../services/ana/run-control.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/run-control.js')>();
  return {
    readMoveId: real.readMoveId,
    beginRun: async () => ({
      runId: 'run_test',
      handle: {
        runId: 'run_test',
        cancelSignal: new AbortController().signal,
        wake: async (ms: number) => {
          h.state.wakes.push(ms);
          h.state.clockOffset += ms;
        },
        heartbeat: async () => {},
      },
    }),
    localOnlyRunHandle: () => ({ runId: '', cancelSignal: new AbortController().signal, wake: async () => {}, heartbeat: async () => {} }),
    endRun: async () => {},
    readStatus: async () => {
      if (h.state.forced) return h.state.forced;
      return (h.state.statuses.length > 1 ? h.state.statuses.shift() : h.state.statuses[0]) ?? 'running';
    },
    readRun: async () => null,
    releaseLocalRun: () => {},
    consumeInterjections: async () => [],
    requestApproval: async (_pool: unknown, _runId: string, pending: unknown) => {
      h.state.approvals.push(pending);
      return false;
    },
    recordApprovalDecision: async () => false,
    readApprovalDecision: async () => null,
    stopRunInternally: async () => {
      h.state.stops++;
    },
    resumeAbandonedRun: async () => {
      h.state.resumeAbandoned++;
      h.state.forced = 'running';
    },
    reapOrphanedRuns: async () => 0,
    applyControl: async () => ({ ok: true, status: 'running' }),
  };
});
vi.mock('../../../services/ana-ri/orchestrator.js', () => ({
  orchestrate: () => ({
    systemPrompt: 'You are AnA.',
    detectedIntent: { lens: 'general', confidence: 0.9 },
    detectedSubmissionType: undefined,
    detectedDocumentTemplate: null,
    appliedRole: 'regulatory_affairs',
    activeWorkstream: null,
    workstreamHandoff: null,
    suggestedActions: [],
  }),
}));
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../services/ana-ri/chat-context-builder.js')>()),
  prefetchRouteIntelligenceContext: async () => ({}),
}));
vi.mock('../../../services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: async () => '',
  buildSectionSpecificPrompt: () => '',
}));
vi.mock('../../../services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: async () => ({ memoryBlock: '', atoms: [], diagnostics: null }),
}));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({
  enrichContextForChat: async () => ({ block: '', sources: [] }),
}));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => {
    if (h.state.mintFails) throw new Error('thread store down');
    return 'thread-1';
  },
  getThreadMessages: async () => [],
  saveChatMessage: async () => {},
  programIdForThread: () => null,
  ThreadAccessError: class ThreadAccessError extends Error {},
}));
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: async () => '' }));
vi.mock('../../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: async () => null }));
vi.mock('../../../services/ana/ana-input-guard.js', () => ({
  guardUserInput: async (text: string) => ({ encapsulated: false, text }),
  PromptInjectionError: class PromptInjectionError extends Error {},
}));
vi.mock('../../../services/auditService.js', () => ({ default: { logAction: async () => {} } }));
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: async () => {} }));
vi.mock('../../../services/ana-ri/relational-profile-service.js', () => ({ reflectAfterTurn: async () => {} }));
vi.mock('../../../services/ana/tool-telemetry.js', () => ({ getUnhealthyTools: () => [] }));
vi.mock('../../../services/ana-ri-metrics.js', () => ({ recordAnaTurn: () => {} }));
vi.mock('../../../services/anthropic-files.js', () => ({
  isPdfIntakeEnabled: () => false,
  readLocalUploadBuffer: async () => null,
}));

import { mountStreamRoute } from '../stream.js';
import { MAX_PAUSE_MS } from '../../../services/ana/run-status.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).tenantId = 7;
  (req as any).user = { id: 3, organizationId: 7 };
  next();
});
const router = express.Router();
mountStreamRoute(router);
app.use('/api/ana-ri', router);

type SseEvent = Record<string, any> & { type: string };

async function turn(body: Record<string, unknown> = {}): Promise<SseEvent[]> {
  const res = await request(app)
    .post('/api/ana-ri/stream')
    .send({ message: 'which screens are there?', ...body })
    .buffer(true)
    .parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => (data += chunk));
      r.on('end', () => cb(null, data));
    });
  return String(res.body)
    .split('\n\n')
    .filter(frame => frame.startsWith('data: '))
    .map(frame => JSON.parse(frame.slice('data: '.length)) as SseEvent);
}

const CONTROL = new Set(['paused', 'resumed', 'cancelled']);
const controlFrames = (events: SseEvent[]) => events.filter(e => CONTROL.has(e.type));
const ONE_ROUND = () => [[{ id: 'tu_1', name: 'list_app_screens', input: {} }], 'Here they are.'];

beforeEach(() => {
  Object.assign(h.state, {
    script: ONE_ROUND(),
    gatewayCalls: 0,
    statuses: [],
    forced: null,
    wakes: [],
    clockOffset: 0,
    toolRuns: 0,
    resumeAbandoned: 0,
    stops: 0,
    toolCtx: [],
    approvals: [],
    mintFails: false,
  });
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the tool context names the conversation, the turn and the model (PF-10 S5, LX-06)', () => {
  it('a dispatched tool receives the resolved thread, the run as its turn, and the served model', async () => {
    h.state.statuses = ['running'];
    await turn();
    // A document a tool creates records these as its provenance (authoring-draft-tool.ts).
    expect(h.state.toolCtx).toHaveLength(1);
    expect(h.state.toolCtx[0]).toMatchObject({ threadId: 'thread-1', turnId: 'run_test', model: 'm' });
  });

  it('a held governed call records the same: the only path a confirm-class draft takes in production', async () => {
    h.state.statuses = ['running'];
    h.state.script = [[{ id: 'draft_1', name: 'draft_authoring_document', input: { title: 'Clinical overview' } }], 'Done.'];
    await turn();
    expect(h.state.approvals).toHaveLength(1);
    expect(h.state.approvals[0].toolContext).toMatchObject({
      threadId: 'thread-1',
      turnId: 'run_test',
      servingModel: { model: 'm' },
    });
  });

  it("when the thread could not be opened, no model call or governed approval proceeds", async () => {
    h.state.statuses = ['running'];
    h.state.mintFails = true;
    h.state.script = [[{ id: 'draft_2', name: 'draft_authoring_document', input: { title: 'Clinical overview' } }], 'Done.'];
    const events = await turn({ thread_id: 'ana-ri_supplied_by_the_client' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'THREAD_UNAVAILABLE' }));
    expect(h.state.approvals).toHaveLength(0);
    expect(h.state.gatewayCalls).toBe(0);
  });
});

describe('the stream pause, unchanged by the move', () => {
  it('a run that is not paused runs its round with no pause frames', async () => {
    h.state.statuses = ['running'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([]);
    expect(h.state.toolRuns).toBe(1);
    expect(h.state.wakes).toEqual([]);
  });

  it('a paused run holds the round, says paused once and resumed once, then runs it', async () => {
    h.state.statuses = ['paused', 'paused', 'paused', 'running'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'resumed', round: 1 },
    ]);
    expect(h.state.wakes).toEqual([5_000, 5_000, 5_000]);
    expect(h.state.toolRuns).toBe(1);
    expect(h.state.gatewayCalls).toBe(2);
    expect(h.state.resumeAbandoned).toBe(0);
  });

  it('a run cancelled while paused says cancelled and runs nothing more', async () => {
    h.state.statuses = ['paused', 'cancelled'];
    const events = await turn();
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'cancelled', round: 1 },
    ]);
    expect(h.state.toolRuns, 'the held step ran after a cancel').toBe(0);
    expect(h.state.gatewayCalls, 'a model call followed a cancel').toBe(1);
  });

  it('a pause nobody answers is resumed as abandoned once, at MAX_PAUSE_MS, and the round runs', async () => {
    h.state.statuses = ['paused'];
    const events = await turn();
    expect(h.state.resumeAbandoned).toBe(1);
    expect(controlFrames(events)).toEqual([
      { type: 'paused', round: 1 },
      { type: 'resumed', round: 1 },
    ]);
    // Every wait is the 5 s ceiling, and the hold gave up only once the ceiling passed.
    expect(h.state.wakes.every(ms => ms === 5_000)).toBe(true);
    expect(h.state.clockOffset).toBeGreaterThanOrEqual(MAX_PAUSE_MS);
    expect(h.state.clockOffset).toBeLessThanOrEqual(MAX_PAUSE_MS + 5_000);
    expect(h.state.toolRuns).toBe(1);
  });
});
