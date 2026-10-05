/**
 * The stream route, driven over HTTP with its seams replaced — shared by the
 * route suites that need a real turn (row 74).
 *
 * What is replaced: the model (a scripted gateway), the tool handlers, the run
 * row (run-control), post-processing (which captures its context), and the
 * context assembly that would otherwise need a database (memory,
 * orchestration, enrichment). What is real: the agentic loop, the checkpoint,
 * the turn's shared hold (run-hold.ts), the approval gate and its classifier,
 * the drive budgets and the turn recorder.
 *
 * vi.mock calls cannot live here: they are hoisted per test file. Each suite
 * keeps its own `vi.mock(path, …)` lines and hands them these factories via a
 * dynamic import, so the mocked module and this file share one `state`.
 *
 * Moved out of stream-run-hold.test.ts, which now uses it. live-drive-turn.test.ts
 * still carries its own copy of the same block: it is another lane's file and
 * was inside that lane's window when this was written (handed on, row 74).
 */
import express from 'express';
import request from 'supertest';

export type ToolUse = { id: string; name: string; input: Record<string, unknown> };
export type SseEvent = Record<string, any> & { type: string };
export type QueueEntry = { kind: 'steer' | 'screen_report' | 'move_landed'; text: string; moveId?: string };

/** One model request as the gateway received it. */
export interface GatewayRequestSeen {
  callerModule?: string;
  toolChoice?: unknown;
  /** The messages, copied at the moment of the call. */
  messages: Array<{ role: string; content: unknown; inlineSystem?: boolean }>;
}

function freshState() {
  return {
    /** One entry per model call: tool calls to make, or the answer text. */
    script: [] as Array<ToolUse[] | string>,
    /** How many model calls were made. */
    gatewayCalls: 0,
    /** Every model call, in order. */
    requests: [] as GatewayRequestSeen[],
    /** Status reads, in order; the last repeats. `null` reads as a row that is gone. */
    statuses: [] as Array<string | null>,
    /** Once set, every status read returns this. */
    forced: null as string | null,
    /** What the row does after holdForPerson moves it to paused (then the statuses above). */
    afterManualHold: null as Array<string | null> | null,
    holdForPersonCalls: 0,
    /** What holdForPerson answers (false: the run was no longer running). */
    holdForPersonResult: true as boolean,
    /** holdForPerson throws (the hold could not be written). */
    holdForPersonThrows: false,
    endHeldCalls: 0,
    /** What endHeldRun answers (false: a Continue won the race). */
    endHeldResult: true as boolean,
    wakes: [] as number[],
    /** Added to Date.now(): each wait "takes" the time it was allowed. */
    clockOffset: 0,
    toolRuns: 0,
    /** Added to the clock by every tool run: how long each step "takes". */
    toolMs: 0,
    /** Handler calls by tool name. */
    handlerCalls: {} as Record<string, number>,
    resumeAbandoned: 0,
    stops: 0,
    /** What each queue drain returns, in order; empty after. */
    drains: [] as QueueEntry[][],
    /** beginRun throws (run control unavailable). */
    beginRunThrows: false,
    /** requestApproval opens the gate (true) or cannot hold the run (false). */
    approvalOpens: false,
    approvalDecisionsRecorded: 0,
    endRuns: [] as Array<{ status: string; stoppedReason: string }>,
    /** The context post-processing was handed. */
    post: null as any,
    /** The signed-in user the route sees. */
    user: { id: 3, organizationId: 7 } as Record<string, unknown>,
    /** Aborts the run's cancel signal (a Stop). */
    cancel: null as null | (() => void),
  };
}

export type HarnessState = ReturnType<typeof freshState>;

const state: HarnessState = freshState();

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
    state.requests.push({ callerModule: req.callerModule, toolChoice: req.toolChoice, messages: [...req.messages] });
    const step = state.script.shift();
    if (Array.isArray(step)) return { content: '', toolUses: step, model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
    const text = step ?? 'Done.';
    req.onStream?.(text, undefined);
    return { content: text, toolUses: [], model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
  },
};

/** A handler that counts its runs and answers like a read tool. */
function reader(name: string, result: Record<string, unknown>) {
  return async () => {
    state.toolRuns++;
    state.clockOffset += state.toolMs;
    state.handlerCalls[name] = (state.handlerCalls[name] ?? 0) + 1;
    return JSON.stringify(result);
  };
}

/** The tool handlers the scripted model may call. Tests may add their own. */
const handlers: Record<string, (input: any) => Promise<string>> = {
  list_app_screens: reader('list_app_screens', { screens: ['vault'] }),
  search_literature: reader('search_literature', { totalMatches: 2, results: [] }),
  // A write the gate puts to a person: if it ever runs here, the gate was bypassed.
  save_document_to_vault: reader('save_document_to_vault', { saved: true }),
};

/** Set every piece of state back to its default, and the clock to real time plus the offset. */
export function resetHarness(): void {
  Object.assign(state, freshState());
}

const servedModelOf = (r: { provider?: string | null; model?: string | null; requestId?: string | null } | null) => ({
  provider: r?.provider ?? null,
  model: r?.model ?? null,
  requestId: r?.requestId ?? null,
});

function runHandle() {
  const controller = new AbortController();
  state.cancel = () => controller.abort();
  return {
    runId: 'run_test',
    cancelSignal: controller.signal,
    wake: async (ms: number) => {
      state.wakes.push(ms);
      state.clockOffset += ms;
    },
    heartbeat: async () => {},
  };
}

function readStatus(): string | null {
  if (state.forced) return state.forced;
  if (state.statuses.length === 0) return 'running';
  return state.statuses.length > 1 ? (state.statuses.shift() as string | null) : state.statuses[0];
}

/** The run row, scripted. `real` supplies the pure readers the route uses as they are. */
function runControl(real: { readMoveId: unknown }) {
  return {
    readMoveId: real.readMoveId,
    beginRun: async () => {
      if (state.beginRunThrows) throw new Error('ana_runs is unavailable');
      return { runId: 'run_test', handle: runHandle() };
    },
    localOnlyRunHandle: () => ({ runId: '', cancelSignal: new AbortController().signal, wake: async () => {}, heartbeat: async () => {} }),
    endRun: async (_pool: unknown, _runId: string, status: string, stoppedReason: string) => {
      state.endRuns.push({ status, stoppedReason });
    },
    readStatus: async () => readStatus(),
    readRun: async () => null,
    releaseLocalRun: () => {},
    consumeInterjections: async () => state.drains.shift() ?? [],
    requestApproval: async () => state.approvalOpens,
    recordApprovalDecision: async () => {
      state.approvalDecisionsRecorded++;
      return true;
    },
    readApprovalDecision: async () => null,
    stopRunInternally: async () => {
      state.stops++;
    },
    resumeAbandonedRun: async () => {
      state.resumeAbandoned++;
      state.forced = 'running';
    },
    holdForPerson: async () => {
      state.holdForPersonCalls++;
      if (state.holdForPersonThrows) throw new Error('ana_runs write failed');
      if (!state.holdForPersonResult) return false;
      if (state.afterManualHold) {
        state.forced = null;
        state.statuses = [...state.afterManualHold];
      }
      return true;
    },
    endHeldRun: async () => {
      state.endHeldCalls++;
      if (state.endHeldResult) state.forced = 'finished';
      return state.endHeldResult;
    },
    reapOrphanedRuns: async () => 0,
    applyControl: async () => ({ ok: true, status: 'running' }),
  };
}

const orchestrated = {
  systemPrompt: 'You are AnA.',
  detectedIntent: { lens: 'general', confidence: 0.9 },
  detectedSubmissionType: undefined,
  detectedDocumentTemplate: null,
  appliedRole: 'regulatory_affairs',
  activeWorkstream: null,
  workstreamHandoff: null,
  suggestedActions: [],
};

/**
 * The module replacements, one factory per mocked path. The tool set offered to
 * the model is every handler above; `governedTools` narrows it.
 */
export const mocks = {
  db: () => ({ getPool: () => pool, pool, db: {} }),
  shared: (real: Record<string, unknown>) => ({ ...real, ensureGateway: () => gateway }),
  postProcessing: () => ({
    runStreamPostProcessing: async (ctx: any) => {
      state.post = ctx;
      ctx.res.end();
    },
  }),
  toolExecutor: () => ({ getToolHandler: (name: string) => handlers[name], servedModelOf }),
  governedToolset: () => ({
    governedToolsetFor: async () =>
      Object.keys(handlers).map(name => ({ name, description: name, input_schema: { type: 'object', properties: {} } })),
  }),
  runControl,
  orchestrator: () => ({ orchestrate: () => orchestrated }),
  chatContextBuilder: (real: Record<string, unknown>) => ({ ...real, prefetchRouteIntelligenceContext: async () => ({}) }),
  lumen: () => ({ getIntelligencePrefix: async () => '', buildSectionSpecificPrompt: () => '' }),
  memory: () => ({ buildMemoryContextForChat: async () => ({ memoryBlock: '', atoms: [], diagnostics: null }) }),
  enrichment: () => ({ enrichContextForChat: async () => ({ block: '', sources: [] }) }),
  chatThreads: () => ({
    getOrCreateThread: async () => 'thread-1',
    getThreadMessages: async () => [],
    saveChatMessage: async () => {},
    programIdForThread: () => null,
    ThreadAccessError: class ThreadAccessError extends Error {},
  }),
  sessionBootstrap: () => ({ sessionBootstrapBlockFor: async () => '' }),
  kernelPolicy: () => ({ getKernelPolicyHint: async () => null }),
  inputGuard: () => ({
    guardUserInput: async (text: string) => ({ encapsulated: false, text }),
    PromptInjectionError: class PromptInjectionError extends Error {},
  }),
  audit: () => ({ default: { logAction: async () => {} } }),
  toolRegistry: () => ({ logToolRun: async () => {} }),
  relationalProfile: () => ({ reflectAfterTurn: async () => {} }),
  toolTelemetry: () => ({ getUnhealthyTools: () => [] }),
  metrics: () => ({ recordAnaTurn: () => {} }),
  anthropicFiles: () => ({ isPdfIntakeEnabled: () => false, readLocalUploadBuffer: async () => null }),
};

export const harness = { state, handlers };

/** An app with the stream route mounted, signed in as `state.user` in org 7. */
export function streamApp(mount: (router: express.Router) => void): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = 7;
    (req as any).user = { ...state.user };
    next();
  });
  const router = express.Router();
  mount(router);
  app.use('/api/ana-ri', router);
  return app;
}

/** One turn, start to post-processing's stand-in; every SSE event in order. */
export async function turn(app: express.Express, body: Record<string, unknown>): Promise<SseEvent[]> {
  const res = await request(app)
    .post('/api/ana-ri/stream')
    .send(body)
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
