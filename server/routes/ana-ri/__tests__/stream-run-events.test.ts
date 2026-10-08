/**
 * The stream's half of AnA detach DT1 (docs/design/ANA_DETACH_2026-10-08.md
 * §2.3, §2.8, §3.4, §8 DT1; evidence docs/evidence/ANA-SUMMARY/2026-10-08/DT1-run-events/).
 *
 * The route, its loop and the timeline emitter run for real; the run row is
 * the harness's. Pinned:
 *   - the mirror receives exactly the events the browser receives (one
 *     producer, a third sink);
 *   - the record is written only after the mirror is flushed, and the mirror is
 *     released after it (flush, then seal, then release — test 3's wiring);
 *   - the SSE keepalive no longer beats the run (the process heartbeat does);
 *   - run_policy reaches the insert; the client's thread id is handed to
 *     beginRun to verify, and the resolved conversation is stamped on the run;
 *   - RUN_IN_PROGRESS and RUN_LIMIT are frames before the question is saved.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
vi.mock('../../../services/ana/catalog-scope.js', () => ({
  catalogScope: async () => ({ programId: null }),
  documentScopeRefusal: async () => null,
}));

import { mountStreamRoute } from '../stream.js';
import { handleUpdatePlan } from '../../../services/ana/turn-plan.js';
import type { TimelineEvent } from '@shared/ana/turn-timeline';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const turn = (body: Record<string, unknown> = {}): Promise<SseEvent[]> =>
  streamTurn(app, { message: 'find the stability reports and list the shelf-life claims', ...body });
const timelineOf = (events: SseEvent[]): TimelineEvent[] => events.filter(e => e.type === 'timeline').map(e => e.event);

const search: ToolUse = { id: 'tu_s', name: 'search_project_documents', input: { query: 'shelf life' } };
const plan: ToolUse = {
  id: 'tu_p',
  name: 'update_plan',
  input: { steps: [{ title: 'Find the reports', status: 'in_progress' }] },
};

/** A stand-in mirror that records what reached it and in which order. */
function fakeMirror(order: string[]) {
  const enqueued: TimelineEvent[] = [];
  return {
    enqueued,
    mirror: {
      runId: 'run_test',
      enqueue: (e: TimelineEvent) => {
        enqueued.push(e);
      },
      close: async () => {
        order.push('mirror.close');
        return { emitted: enqueued.length, written: enqueued.length, dropped: 0 };
      },
      release: async (recorded: boolean) => {
        order.push(`mirror.release(${recorded})`);
      },
    },
  };
}

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  h.handlers.search_project_documents = async () => JSON.stringify({ ok: true, totalMatches: 3, results: [{}, {}, {}] });
  h.handlers.update_plan = handleUpdatePlan;
});
afterEach(() => {
  delete h.handlers.search_project_documents;
  delete h.handlers.update_plan;
  vi.restoreAllMocks();
});

describe('the mirror is the third sink of the one producer', () => {
  it('receives exactly the timeline the browser receives, in order', async () => {
    const order: string[] = [];
    const { mirror, enqueued } = fakeMirror(order);
    h.state.mirror = mirror;
    h.state.script = [{ say: 'Looking in the Vault.', tools: [search, plan] }, 'The shelf life is 24 months.'];
    const live = timelineOf(await turn());
    expect(live.length).toBeGreaterThan(3);
    expect(enqueued).toEqual(live);
  });
});

describe('flush, then seal, then release', () => {
  it('the record is written after the mirror closes, and the mirror is released after it', async () => {
    const order: string[] = [];
    const { mirror } = fakeMirror(order);
    h.state.mirror = mirror;
    h.state.script = ['The shelf life is 24 months.'];
    await turn();
    // The stand-in post-processing hands back the stream's own fileTurnRecord.
    const status = await h.state.post.fileTurnRecord('answered');
    // The harness pool has no dedicated client, so the write fails: the
    // mirror is still closed first and released after, as not recorded.
    expect(status.status).toBe('not_recorded');
    expect(order).toEqual(['mirror.close', 'mirror.release(false)']);
  });
});

describe('the SSE keepalive no longer beats the run', () => {
  it('a keepalive tick mid-turn calls no heartbeat; the process heartbeat owns it (run-control beatOwnedRuns)', async () => {
    const realSetInterval = global.setInterval;
    let keepalive: (() => void) | null = null;
    vi.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 15_000 && !keepalive) keepalive = fn;
      return realSetInterval(fn, ms, ...(rest as []));
    }) as typeof setInterval);
    let delta = -1;
    h.handlers.search_project_documents = async () => {
      const before = h.state.heartbeats;
      keepalive?.();
      delta = h.state.heartbeats - before;
      return JSON.stringify({ ok: true, totalMatches: 1, results: [{}] });
    };
    h.state.script = [[search], 'Done.'];
    await turn();
    expect(keepalive).not.toBeNull();
    expect(delta).toBe(0);
  });
});

describe('the run row: policy at insert, the verified conversation, the refusals', () => {
  it('hands beginRun the run policy and the thread id to verify, and stamps the resolved conversation', async () => {
    h.state.script = ['Done.'];
    await turn({ run_policy: 'manual', thread_id: 'client-sent-id' });
    expect(h.state.beginRunInputs[0]).toMatchObject({ runPolicy: 'manual', threadId: 'client-sent-id' });
    // getOrCreateThread (harness) resolved the conversation to 'thread-1'.
    expect(h.state.stamps).toEqual([{ threadId: 'thread-1', userMessageId: null }]);
  });

  for (const [code, words, runId] of [
    ['RUN_IN_PROGRESS', 'AnA is still working on the last message in this conversation.', 'run_live'],
    ['RUN_LIMIT', 'You have three turns running. Stop one, or wait for one to finish.', undefined],
  ] as const) {
    it(`${code} is a frame before the question is saved, and nothing runs`, async () => {
      h.state.beginRunError = Object.assign(new Error(code), { name: 'RunRefusedError', code, runId });
      h.state.script = ['should never be asked'];
      const events = await turn({ thread_id: 'thread-1' });
      expect(events.filter(e => e.type === 'error')).toEqual([
        { type: 'error', code, error: words, ...(runId ? { runId } : {}) },
      ]);
      expect(events.some(e => e.type === 'run_started')).toBe(false);
      expect(h.state.gatewayCalls).toBe(0);
      expect(h.state.stamps).toEqual([]);
      expect(h.state.endRuns).toEqual([]);
    });
  }

  it("a colleague's conversation opens no run (getOrCreateThread then refuses the turn, as it always has)", async () => {
    h.state.beginRunError = Object.assign(new Error('THREAD_FORBIDDEN'), { name: 'RunRefusedError', code: 'THREAD_FORBIDDEN' });
    h.state.script = ['Done.'];
    const events = await turn({ thread_id: 'colleagues' });
    expect(events.some(e => e.type === 'run_started')).toBe(false);
    expect(events.some(e => e.type === 'error' && (e as any).code === 'THREAD_FORBIDDEN')).toBe(false);
  });
});
