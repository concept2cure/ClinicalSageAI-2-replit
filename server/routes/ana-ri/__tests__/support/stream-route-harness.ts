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
import { runWithTenantScope } from '../../../../db/tenantStore.js';
import { bindRequestDbClient } from '../../../../db/requestDbLease.js';
import { RunStopped } from '../../../../services/ana/run-stopped.js';

export type ToolUse = { id: string; name: string; input: Record<string, unknown> };
/**
 * One model call that says something as well as (or instead of) calling tools:
 * `say` streams as text, the way the gateway hands over AnA's words; `think`
 * streams as a summarized thinking block (reasoning); `progress` is a
 * progress-update block, passed through the gateway's real ProgressNotes so
 * only what it accepts becomes text (ai-gateway/progress-updates.ts).
 */
export type ModelSays = { say?: string; think?: string; progress?: string; tools?: ToolUse[] };
export type SseEvent = Record<string, any> & { type: string };
export type QueueEntry = { kind: 'steer' | 'screen_report' | 'move_landed'; text: string; moveId?: string };

/** One model request as the gateway received it. */
export interface GatewayRequestSeen {
  callerModule?: string;
  toolChoice?: unknown;
  /** The thinking config the call asked for (visible reasoning when enabled). */
  thinking?: { enabled?: boolean } | undefined;
  /** The call asked for the notes between tool calls as AnA's words (decision 3, A). */
  notesBetweenTools?: boolean;
  /** The messages, copied at the moment of the call. */
  messages: Array<{ role: string; content: unknown; inlineSystem?: boolean }>;
  /** The names of the tools offered on this call (row 74, S5c). */
  tools?: string[];
  /** The run ids and risk the call carried — a sub-agent's own, and its parent's. */
  runId?: string;
  parentRunId?: string;
  organizationId?: unknown;
  riskTier?: string;
}

function freshState() {
  return {
    /** Each write of a conversation's picked skills to its thread, in order. */
    threadSkills: [] as Array<{ threadId: string; organizationId: number; keys: string[] }>,
    /** One entry per model call: tool calls to make, the answer text, or words with tool calls. */
    script: [] as Array<ToolUse[] | string | ModelSays>,
    /** The gateway request id each call reports, by call number from 1; none when absent. */
    requestIds: [] as string[],
    /** How many model calls were made. */
    gatewayCalls: 0,
    /** Every model call, in order. */
    requests: [] as GatewayRequestSeen[],
    /** Status reads, in order; the last repeats. `null` reads as a row that is gone. */
    statuses: [] as Array<string | null>,
    /** Once set, every status read returns this. */
    forced: null as string | null,
    /** The options each governedToolsetFor call was given (row 74, S5c). */
    governedOpts: [] as Array<Record<string, unknown> | undefined>,
    /** Tool names the tenant denies: absent from the governed set. */
    governedDenies: [] as string[],
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
    /** What beginRun throws instead of opening a run (a RunRefusedError-shaped refusal). */
    beginRunError: null as unknown,
    /** Every input beginRun was called with. */
    beginRunInputs: [] as Array<Record<string, unknown>>,
    /** The run's live mirror, when a test supplies one (AnA detach DT1): handed out as handle.events. */
    mirror: null as null | Record<string, unknown>,
    /** Each stampThread call: the conversation and question written onto the run. */
    stamps: [] as Array<{ threadId: string; userMessageId: number | null }>,
    /** What stampThread answers (false: the run could not be stamped with its conversation). */
    stampThreadResult: true as boolean,
    /** Each handle.heartbeat call. */
    heartbeats: 0,
    /** requestApproval opens the gate (true) or cannot hold the run (false). */
    approvalOpens: false,
    /** What each requestApproval held on the run (the pending_approval row a follower reads). */
    approvalRequests: [] as Array<Record<string, unknown>>,
    /** Whether the governed-action route has claimed the held approval (run-control.ts approvalClaimed). */
    approvalClaimed: false,
    /** Called inside each handle.wake (a wait's tick): lets a test land a stop mid-wait. */
    onWake: null as null | (() => void),
    approvalDecisionsRecorded: 0,
    /** What readApprovalDecision returns once the gate is open: a person's answer, or null (none yet). */
    approvalDecision: null as null | { decided: 'approved' | 'denied'; error?: string; result?: unknown },
    endRuns: [] as Array<{ status: string; stoppedReason: string }>,
    /**
     * What endRun answers (run-control.ts EndRunOutcome): 'already_ended' when
     * another writer stopped the row before its abort reached the turn.
     */
    endRunOutcome: 'ended' as 'ended' | 'already_ended' | 'write_failed',
    /** What readRunEnding answers: the reason the row says it was stopped with, or null. */
    rowEnding: null as string | null,
    /** …and what ended the session, for a session_ended row (ana_runs.stopped_detail). */
    rowEndingDetail: null as null | { cause: string; byUserId?: number | null },
    /** The context post-processing was handed. */
    post: null as any,
    /** Each tool-run telemetry row the route wrote (toolRegistry.logToolRun). */
    toolRunLogs: [] as Array<{ toolName: string; status: string; errorMessage?: string }>,
    /** The signed-in user the route sees. */
    user: { id: 3, organizationId: 7 } as Record<string, unknown>,
    /** Aborts the run's cancel signal (a Stop). */
    cancel: null as null | (() => void),
    /**
     * Aborts the run's cancel signal as the run row's own stop would
     * (run-control.ts RunStopped, AnA detach DT3): a shutdown, the reaper,
     * the session's end, an admin, the unattended limit.
     */
    stop: null as null | ((reason: string, detail?: { cause: string; byUserId?: number | null } | null) => void),
    /** Each internal stop the route asked for, by reason (stopRunInternally). */
    internalStops: [] as string[],
    /** Each detach stamped on the run (markRunDetached), as ISO. */
    detachStamps: [] as string[],
    /** What readLastWatched answers: the asker's last watched stamp (epoch ms), or null. */
    lastWatched: null as number | null,
    /**
     * What the handle's session check answers at each round boundary, in
     * order (the last repeats); empty: the handle has no check, as a test
     * double for a run with no person.
     */
    standing: [] as Array<'session_ended' | null | 'throws' | { reason: 'session_ended'; detail: { cause: string; byUserId?: number | null } }>,
    standingChecks: 0,
    /** The standing check a local-only handle (no run row) is given, as `standing`; empty: none. */
    localStanding: [] as Array<'session_ended' | null | { reason: 'session_ended'; detail: { cause: string } }>,
    /** Each local-only handle's abort, by its reason (RunStopped). */
    localAborts: [] as string[],
    /**
     * Each release of the request's pinned DB client (db/requestDbLease.ts),
     * and each query refused because it came after one — as
     * LazyRequestDbClient refuses a released client.
     */
    requestClientReleases: 0,
    requestClientRefusals: 0,
  };
}

export type HarnessState = ReturnType<typeof freshState>;

const state: HarnessState = freshState();

const pool = {
  // Legitimate public-project fixtures for suites testing model/run behavior.
  // Private access suites replace this pool with actual SQL and live sharing.
  query: async (sql: string, params?: unknown[]) => {
    let rows: Record<string, unknown>[] = [];
    if (/FROM regulatory_programs WHERE id = \$1/.test(sql)) rows = [{ id: params?.[0] }];
    else if (/WHERE regulatory_program_id\s*=\s*\$1/.test(sql)) rows = [{ id: 42, clientWorkspaceId: null }];
    else if (/SELECT id, regulatory_program_id FROM projects/.test(sql)) rows = [{ id: params?.[0], regulatory_program_id: null }];
    else if (/FROM organization_users/.test(sql)) rows = [{ role: 'member', user_id: params?.[0] }];
    else if (/FROM projects p LEFT JOIN project_visibility_settings/.test(sql)) rows = [{ id: params?.[2], owner_id: 3,
      created_by_id: 3, settings: {}, visibility: 'org_public', members: [], review_assigned: false }];
    return { rows, rowCount: rows.length };
  },
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
    state.requests.push({
      callerModule: req.callerModule,
      toolChoice: req.toolChoice,
      thinking: req.thinking,
      notesBetweenTools: req.notesBetweenTools,
      messages: [...req.messages],
      tools: Array.isArray(req.tools) ? req.tools.map((t: { name?: string }) => t.name) : undefined,
      runId: req.runId,
      parentRunId: req.parentRunId,
      organizationId: req.organizationId,
      riskTier: req.riskTier,
    });
    const requestId = state.requestIds[state.gatewayCalls - 1];
    const served = { model: 'm', provider: 'p', usage: {}, latencyMs: 1, ...(requestId ? { requestId } : {}) };
    const step = state.script.shift();
    if (Array.isArray(step)) return { content: '', toolUses: step, ...served };
    if (step && typeof step === 'object') return modelSays(req, step, served);
    const text = step ?? 'Done.';
    req.onStream?.(text, undefined);
    return { content: text, toolUses: [], ...served };
  },
};

/** The flagship's own declaration: it returns the notes between tool calls as thinking blocks. */
const NOTES_IN_THINKING = { thinkingMode: 'adaptive', progressUpdatesInThinking: true } as const;

/**
 * A call that speaks: reasoning as thinking, notes through ProgressNotes, words
 * as text. ProgressNotes is active exactly when the gateway would ask for
 * notes on this request (wantsProgressUpdates); otherwise a progress block is
 * reasoning and its note is lost, as on the flagship.
 */
async function modelSays(req: any, step: ModelSays, served: Record<string, unknown>) {
  const { ProgressNotes, wantsProgressUpdates } = await import('../../../../services/ai-gateway/progress-updates.js');
  let content = '';
  if (step.think) req.onStream?.('', { type: 'thinking', thinkingContent: step.think });
  if (step.progress) {
    const shown = new ProgressNotes(wantsProgressUpdates(NOTES_IN_THINKING, req)).note(step.progress, content);
    if (shown) {
      content += shown;
      req.onStream?.(shown, undefined);
    }
  }
  if (step.say) {
    content += step.say;
    req.onStream?.(step.say, undefined);
  }
  return { content, toolUses: step.tools ?? [], ...served };
}

/** A handler that counts its runs and answers like a read tool. */
function reader(name: string, result: Record<string, unknown>) {
  return async () => {
    state.toolRuns++;
    state.clockOffset += state.toolMs;
    state.handlerCalls[name] = (state.handlerCalls[name] ?? 0) + 1;
    return JSON.stringify(result);
  };
}

/** The tool handlers the scripted model may call (input, then the tool context). Tests may add their own. */
const handlers: Record<string, (input: any, ctx?: any) => Promise<string>> = {
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
  state.stop = (reason: string, detail?: { cause: string; byUserId?: number | null } | null) =>
    controller.abort(new RunStopped(reason as never, (detail ?? null) as never));
  const standing = state.standing.length > 0
    ? {
        standing: async () => {
          state.standingChecks++;
          const next = state.standing.length > 1 ? (state.standing.shift() ?? null) : state.standing[0];
          if (next === 'throws') throw new Error('the standing could not be read');
          // As runStanding answers (DT3 review, DP-83): the reason and what the check found.
          return next === 'session_ended' ? { reason: 'session_ended', detail: { cause: 'credential_ended' } } : next;
        },
      }
    : {};
  return {
    ...standing,
    runId: 'run_test',
    cancelSignal: controller.signal,
    wake: async (ms: number) => {
      state.wakes.push(ms);
      state.clockOffset += ms;
      state.onWake?.();
    },
    heartbeat: async () => {
      state.heartbeats++;
    },
    stampThread: async (threadId: string, userMessageId: number | null) => {
      state.stamps.push({ threadId, userMessageId });
      return state.stampThreadResult;
    },
    ...(state.mirror ? { events: state.mirror } : {}),
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
    beginRun: async (input: Record<string, unknown>) => {
      state.beginRunInputs.push(input);
      if (state.beginRunError) throw state.beginRunError;
      if (state.beginRunThrows) throw new Error('ana_runs is unavailable');
      // As beginRun does: the conversation the client named, verified (or null for a new one).
      return { runId: 'run_test', handle: runHandle(), threadId: typeof input.threadId === 'string' ? input.threadId : null };
    },
    localOnlyRunHandle: (subject?: unknown) => {
      const controller = new AbortController();
      return {
        runId: '',
        cancelSignal: controller.signal,
        wake: async () => {},
        heartbeat: async () => {},
        abortLocally: (reason?: unknown) => {
          state.localAborts.push(String((reason as { stoppedReason?: string } | undefined)?.stoppedReason ?? 'none'));
          controller.abort(reason);
        },
        // As the real one: a person identified gets the round-boundary check (DT3 review, IAM-35).
        ...(subject && state.localStanding.length > 0
          ? {
              standing: async () => {
                state.standingChecks++;
                const next = state.localStanding.length > 1 ? (state.localStanding.shift() ?? null) : state.localStanding[0];
                return next === 'session_ended' ? { reason: 'session_ended', detail: { cause: 'credential_ended' } } : next;
              },
            }
          : {}),
      };
    },
    endRun: async (_pool: unknown, _runId: string, status: string, stoppedReason: string) => {
      state.endRuns.push({ status, stoppedReason });
      return state.endRunOutcome;
    },
    readRunEnding: async () => (state.rowEnding ? { stoppedReason: state.rowEnding, detail: state.rowEndingDetail } : null),
    readStatus: async () => readStatus(),
    readRun: async () => null,
    releaseLocalRun: () => {},
    consumeInterjections: async () => state.drains.shift() ?? [],
    requestApproval: async (_pool: unknown, _runId: string, held: Record<string, unknown>) => {
      state.approvalRequests.push(held);
      return state.approvalOpens;
    },
    recordApprovalDecision: async () => {
      state.approvalDecisionsRecorded++;
      return true;
    },
    readApprovalDecision: async () => state.approvalDecision,
    approvalClaimed: async () => state.approvalClaimed,
    stopRunInternally: async (_pool: unknown, _runId: string, reason: string, _org?: number, detail?: { cause: string } | null) => {
      state.stops++;
      state.internalStops.push(reason);
      // As the real one does: the row's stop aborts the owner with its reason (and what ended the session).
      state.stop?.(reason, detail ?? null);
    },
    markRunDetached: async (_pool: unknown, _runId: string, at: Date) => {
      state.detachStamps.push(at.toISOString());
    },
    readLastWatched: async () => state.lastWatched,
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
  /* As the real one does: run_agent is offered only when the caller asks to
     host agents, and a tenant's deny takes any tool out of the set. */
  governedToolset: () => ({
    governedToolsetFor: async (_pool: unknown, _org: unknown, opts?: Record<string, unknown>) => {
      state.governedOpts.push(opts);
      return Object.keys(handlers)
        .filter(name => name !== 'run_agent' || opts?.hostsSubAgents === true)
        .filter(name => !state.governedDenies.includes(name))
        .map(name => ({ name, description: name, input_schema: { type: 'object', properties: {} } }));
    },
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
    recordThreadSkills: async (threadId: string, organizationId: number, keys: string[]) => {
      state.threadSkills.push({ threadId, organizationId, keys });
    },
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
  toolRegistry: () => ({
    logToolRun: async (row: { toolName: string; status: string; errorMessage?: string }) => {
      state.toolRunLogs.push({ toolName: row.toolName, status: row.status, errorMessage: row.errorMessage });
    },
  }),
  relationalProfile: () => ({ reflectAfterTurn: async () => {} }),
  toolTelemetry: () => ({ getUnhealthyTools: () => [] }),
  metrics: () => ({ recordAnaTurn: () => {} }),
  anthropicFiles: () => ({ isPdfIntakeEnabled: () => false, readLocalUploadBuffer: async () => null }),
};

export const harness = { state, handlers, gateway };

/**
 * An app with the stream route mounted, signed in as `state.user` in org 7.
 * `tenantScope` opts the request into a tenant scope, as the auth boundary
 * opens one; without it nothing changes for the suites that came before.
 */
export function streamApp(
  mount: (router: express.Router) => void,
  options: { tenantScope?: string } = {},
): express.Express {
  const app = express();
  app.use(express.json());
  if (options.tenantScope) {
    const tenantId = options.tenantScope;
    app.use((_req, _res, next) => runWithTenantScope({ tenantId, source: 'test', caller: 'stream-harness' }, () => next()));
  }
  app.use((req, res, next) => {
    (req as any).tenantId = 7;
    (req as any).user = { ...state.user };
    // The actual host now passes the request executor to source tools. Keep
    // that per-request contract in this scripted, post-admission harness too —
    // bound and released as the auth boundary binds it (db/requestDbLease.ts):
    // it answers until its last holder lets go, then refuses, as
    // LazyRequestDbClient does (AnA detach DT3).
    let released = false;
    bindRequestDbClient(req, res, {
      query: ((sql: string, params?: unknown[]) => {
        if (!released) return mocks.db().pool.query(sql, params);
        state.requestClientRefusals++;
        return Promise.reject(new Error('Cannot query a released request DB client'));
      }) as never,
      release: async () => {
        released = true;
        state.requestClientReleases++;
      },
    });
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
