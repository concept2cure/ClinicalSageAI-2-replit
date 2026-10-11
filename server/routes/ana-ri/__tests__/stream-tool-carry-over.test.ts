/**
 * A follow-up keeps the tools its conversation used (TP-RL-3, AnA reasoning
 * round 6, 2026-10-05), pinned through the live route.
 *
 * The stream chose each turn's tools from its own message, so a follow-up
 * ("and for the EU?") lost the tool the turn before had answered from, and
 * every round of the turn reused that set. The tools earlier turns ran
 * successfully — the thread's tool trace — are now carried into the selection.
 * The model, the handlers, the run row and post-processing are replaced at
 * their seams (the stream-followup-reasoning.test.ts harness); the selector,
 * the trace reader and the route are real.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  type ToolUse = { id: string; name: string; input: Record<string, unknown> };
  const state = {
    /** One entry per model call: tool calls to make, words then tool calls, or the answer text. */
    script: [] as Array<ToolUse[] | { say: string; tools: ToolUse[] } | string>,
    /** Each model request: who made it, and the tools it offered. */
    gatewayCalls: [] as Array<{ callerModule?: string; tools: string[]; messages: Array<{ role: string; content: unknown }> }>,
    /** What each checkpoint drain returns, in order; empty after. */
    drains: [] as Array<Array<{ kind: 'steer' | 'screen_report' | 'move_landed'; text: string; moveId?: string }>>,
    /** Called with each wait the checkpoint makes (the run handle's wake). */
    onWake: null as null | ((ms: number) => void),
    /** The context post-processing was handed — where chips come from. */
    post: null as any,
    /** The saved thread: prior turns, then the question this turn saved. */
    history: [] as Array<{ role: string; content: string; metadata?: unknown }>,
    /** What each held governed call asked the run row to record. */
    approvals: [] as any[],
    guardedInputs: [] as string[],
    encapsulateInput: false,
    prefetch: { unavailableSources: [] as string[], contextAvailabilityBlock: '' },
    enrichment: {
      block: '',
      sources: [] as string[],
      enrichmentMeta: { unavailableSources: [] as string[] } as { unavailableSources: string[]; unavailableReasons?: Record<string, 'timeout' | 'error'> },
    },
    prefetchWait: null as Promise<void> | null,
    onPrefetch: null as (() => void) | null,
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
      state.gatewayCalls.push({ callerModule: req.callerModule, tools: (req.tools ?? []).map((t: { name: string }) => t.name), messages: req.messages.slice() });
      const step = state.script.shift();
      if (Array.isArray(step)) {
        return { content: '', toolUses: step, model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
      }
      if (step && typeof step === 'object') {
        req.onStream?.(step.say, undefined);
        return { content: step.say, toolUses: step.tools, model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
      }
      const text = step ?? 'Done.';
      req.onStream?.(text, undefined);
      return { content: text, toolUses: [], model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
    },
  };
  const handlers: Record<string, (input: any) => Promise<string>> = {
    search_literature: async () => JSON.stringify({ studies: [{ nctId: 'NCT01234567', briefTitle: 'A Study' }] }),
  };
  /**
   * A governed toolset over the selection cap: the core, the record tool a
   * previous turn ran, and sixty tools no follow-up's words select.
   *
   * The record tool must be one the selector does NOT always offer, or the
   * carry is invisible. It was get_cmc_requirements until a0b3de231 made that
   * tool always-on, after which "a step the person declined is not carried"
   * failed (the tool was offered anyway) and "the tool the previous turn ran is
   * offered" passed without the carry. list_cmc_registers is a CMC record tool
   * outside ALWAYS_ON_TOOLS; the premise test below pins that.
   */
  const toolset = [
    'list_platform_commands',
    'execute_platform_command',
    'search_literature',
    'list_cmc_registers',
    ...Array.from({ length: 60 }, (_, i) => `filler_${i}`),
  ].map((name) => ({ name, description: name.startsWith('filler_') ? 'unrelated utility' : name, input_schema: { type: 'object', properties: {} } }));
  const prefix = vi.fn(async () => '');
  return { state, pool, gateway, handlers, toolset, prefix, thread: vi.fn(), memory: vi.fn() };
});

vi.mock('../../../db.js', () => ({ getPool: () => h.pool, pool: h.pool, db: {} }));
vi.mock('../shared.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared.js')>()),
  ensureGateway: () => h.gateway,
}));
vi.mock('../post-processing.js', () => ({
  runStreamPostProcessing: async (ctx: any) => {
    h.state.post = ctx;
    ctx.res.end();
  },
}));
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({
  getToolHandler: (name: string) => h.handlers[name],
  // As the real one: the turn record reads which model served each call.
  servedModelOf: (r: { provider?: string | null; model?: string | null; requestId?: string | null } | null) => ({
    provider: r?.provider ?? null,
    model: r?.model ?? null,
    requestId: r?.requestId ?? null,
  }),
}));
vi.mock('../../../services/ana/governed-toolset.js', () => ({ governedToolsetFor: async () => h.toolset }));
vi.mock('../../../services/ana/run-control.js', async importOriginal => ({
  // The route validates move ids with the real reader.
  readMoveId: (await importOriginal<typeof import('../../../services/ana/run-control.js')>()).readMoveId,
  beginRun: async () => {
    const controller = new AbortController();
    return {
      runId: 'run_test',
      handle: {
        runId: 'run_test',
        cancelSignal: controller.signal,
        wake: async (ms: number) => {
          h.state.onWake?.(ms);
        },
        heartbeat: async () => {},
      },
    };
  },
  localOnlyRunHandle: () => ({
    runId: '',
    cancelSignal: new AbortController().signal,
    wake: async () => {},
    heartbeat: async () => {},
  }),
  endRun: async () => {},
  readStatus: async () => 'running',
  readRun: async () => null,
  releaseLocalRun: () => {},
  consumeInterjections: async () => h.state.drains.shift() ?? [],
  requestApproval: async (_pool: unknown, _runId: string, pending: unknown) => {
    h.state.approvals.push(pending);
    return true;
  },
  recordApprovalDecision: async () => false,
  // The person declines at once: the turn goes on, and nothing is written.
  readApprovalDecision: async (_pool: unknown, _runId: string, toolUseId: string) => ({
    toolUseId,
    decided: 'denied',
    decidedAt: '2026-10-05T00:00:00.000Z',
    byUserId: 3,
  }),
  stopRunInternally: async () => {},
  resumeAbandonedRun: async () => {},
  reapOrphanedRuns: async () => 0,
  applyControl: vi.fn(async () => ({ ok: true, status: 'running', pendingInterjections: 1 })),
}));
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
  prefetchRouteIntelligenceContext: async () => {
    h.state.onPrefetch?.();
    await h.state.prefetchWait;
    return h.state.prefetch;
  },
}));
vi.mock('../../../services/lumen-context-builder.js', () => ({
  getIntelligencePrefix: h.prefix,
  buildSectionSpecificPrompt: () => '',
}));
vi.mock('../../../services/memory-context-assembler.js', () => ({
  buildMemoryContextForChat: h.memory,
}));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({
  enrichContextForChat: async () => h.state.enrichment,
}));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: h.thread,
  getThreadMessages: async () => h.state.history,
  saveChatMessage: async () => {},
  programIdForThread: () => null,
  ThreadAccessError: class ThreadAccessError extends Error {},
}));
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: async () => '' }));
vi.mock('../../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: async () => null }));
vi.mock('../../../services/ana/ana-input-guard.js', () => ({
  guardUserInput: async (text: string) => {
    h.state.guardedInputs.push(text);
    return { encapsulated: h.state.encapsulateInput, text: h.state.encapsulateInput ? `GUARDED\n${text}` : text };
  },
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
import { ALWAYS_ON_TOOLS } from '../../../services/ana/tool-selection.js';

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

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});

beforeEach(() => {
  h.state.script = [];
  h.state.gatewayCalls = [];
  h.state.drains = [];
  h.state.onWake = null;
  h.state.post = null;
  h.state.history = [];
  h.state.approvals = [];
  h.state.guardedInputs = [];
  h.state.encapsulateInput = false;
  h.state.prefetch = { unavailableSources: [], contextAvailabilityBlock: '' };
  h.state.enrichment = { block: '', sources: [], enrichmentMeta: { unavailableSources: [] } };
  h.state.prefetchWait = null;
  h.state.onPrefetch = null;
  h.prefix.mockReset().mockResolvedValue('');
  h.thread.mockReset().mockResolvedValue('thread-1');
  h.memory.mockReset().mockImplementation(async ({ threadId }) => ({ memoryBlock: threadId === 'secret' ? 'PRIVATE SUMMARY' : '', atoms: [], diagnostics: null }));
});

/** The stream's frames, parsed. */
async function turn(message: string, effort_level = 'thorough', extra: Record<string, unknown> = {}): Promise<Array<Record<string, any>>> {
  const res = await request(app)
    .post('/api/ana-ri/stream')
    .send({ message, effort_level, ...extra })
    .buffer(true)
    .parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => (data += chunk));
      r.on('end', () => cb(null, data));
    });
  return String(res.body)
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .flatMap((l) => {
      try {
        return [JSON.parse(l.slice(6))];
      } catch {
        return [];
      }
    });
}

/** The thread so far: a question, AnA's answer and the steps it ran, then this turn's question. */
function thread(steps: Array<{ tool: string; status: string }>, question: string): void {
  h.state.history = [
    { role: 'user', content: 'What CMC quality information does FDA require in an IND for a phase 1 study?' },
    {
      role: 'assistant',
      content: 'FDA expects…',
      metadata: { toolTrace: steps.map((s) => ({ ...s, label: s.tool, resultSummary: '' })) },
    },
    { role: 'user', content: question },
  ];
}

describe('stream intelligence recall overlaps optional route prefetch', () => {
  it.each([false, true])('handles early recall with rejection=%s', async rejected => {
    if (rejected) h.prefix.mockRejectedValue(new Error('recall unavailable'));
    else h.prefix.mockResolvedValue('Early client intelligence');
    let release!: () => void;
    let started!: () => void;
    h.state.prefetchWait = new Promise<void>(resolve => { release = resolve; });
    const prefetchStarted = new Promise<void>(resolve => { started = resolve; });
    h.state.onPrefetch = started;
    const pending = turn('Review the project', 'thorough', { project_id: 42 });
    await prefetchStarted;
    try { expect(h.prefix).toHaveBeenCalledWith(7, 42); }
    finally { release(); await pending; }
    expect(h.prefix).toHaveBeenCalledTimes(1);
    expect(h.state.gatewayCalls).toHaveLength(1);
    if (!rejected) expect(h.state.gatewayCalls[0].messages.some(m => typeof m.content === 'string' && m.content.includes('Early client intelligence'))).toBe(true);
  });
});

describe('a follow-up keeps the tools its conversation used (TP-RL-3)', () => {
  it('warns when requested enrichment is unavailable and retains its model availability notice', async () => {
    h.state.enrichment = {
      block: '\nEnrichment context unavailable: claims. Do not infer that missing context or unresolved findings do not exist.',
      sources: [],
      enrichmentMeta: { unavailableSources: ['claims'], unavailableReasons: { claims: 'timeout' } },
    };
    const frames = await turn('Review the claims');
    // Names the source and why (ana-14), not "Some project context could not be loaded".
    const warning = 'The claims and evidence records took too long to read for this reply. The answer does not draw on them.';
    expect(frames).toContainEqual({ type: 'warning', message: warning });
    expect(h.state.gatewayCalls[0].messages.some(m => m.role === 'system' && typeof m.content === 'string' && m.content.includes('Enrichment context unavailable'))).toBe(true);
    const { body } = h.state.post.turnRecorder.seal('answered');
    expect(body.warnings).toContain(warning);
  });

  it('reports unavailable optional context to the person and includes it in the model input', async () => {
    h.state.prefetch = {
      unavailableSources: ['external intelligence'],
      contextAvailabilityBlock: '\nOptional external intelligence unavailable; do not infer missing records do not exist.',
    };
    const frames = await turn('Review the project');
    expect(frames).toContainEqual({ type: 'warning', message: 'Optional context unavailable: external intelligence.' });
    expect(h.state.gatewayCalls[0].messages.some(m => m.role === 'system' && typeof m.content === 'string' && m.content.includes('do not infer missing records do not exist'))).toBe(true);
  });

  it('Continue receives the visible partial draft even when stored history lacks it', async () => {
    const message = 'Continue from where you stopped.';
    h.state.history = [
      { role: 'user', content: 'Compare the endpoints' },
      { role: 'user', content: message },
    ];
    await turn(message, 'thorough', { continuation_context: { question: 'Compare the endpoints', partialResponse: 'The primary endpoint is' } });
    const first = h.state.gatewayCalls[0].messages;
    const handoff = first.find(m => typeof m.content === 'string' && m.content.includes('client-reported unfinished draft'));
    expect(handoff?.role).toBe('user');
    expect(handoff?.content).toContain('The primary endpoint is');
    expect(handoff?.content).toContain('not evidence that a tool ran');
    expect(first.at(-1)).toMatchObject({ role: 'user', content: message });
    expect(h.state.guardedInputs).toHaveLength(1);
    expect(h.state.guardedInputs[0]).toContain('The primary endpoint is');
  });

  it('encapsulates the handoff with the request and never sends an unguarded duplicate', async () => {
    h.state.encapsulateInput = true;
    await turn('Continue from where you stopped.', 'thorough', {
      continuation_context: { question: 'Compare the endpoints', partialResponse: 'The primary endpoint is' },
    });
    const matching = h.state.gatewayCalls[0].messages.filter(m => typeof m.content === 'string' && m.content.includes('client-reported unfinished draft'));
    expect(matching).toHaveLength(1);
    expect(matching[0].role).toBe('user');
    expect(matching[0].content).toMatch(/^GUARDED\n/);
  });

  it('does not attach a continuation draft to an unrelated request', async () => {
    await turn('Start another topic', 'thorough', { continuation_context: { question: 'Old topic', partialResponse: 'Old draft' } });
    expect(h.state.gatewayCalls[0].messages.some(m => typeof m.content === 'string' && m.content.includes('client-reported unfinished draft'))).toBe(false);
  });

  it('premise: the record tool is not always offered, so only the carry can offer it', () => {
    expect(ALWAYS_ON_TOOLS.has('list_cmc_registers')).toBe(false);
  });

  it('the tool the previous turn ran is offered on the first call and on every round after it', async () => {
    thread([{ tool: 'list_cmc_registers', status: 'success' }], 'and for the EU?');
    h.state.script = [[{ id: 'tu_1', name: 'search_literature', input: { query: 'EU CMC' } }], 'Done.'];
    await turn('and for the EU?');
    expect(h.state.gatewayCalls.length).toBeGreaterThanOrEqual(2);
    const [first, ...rounds] = h.state.gatewayCalls;
    expect(first.tools).toContain('list_cmc_registers');
    for (const round of rounds) expect(round.tools).toEqual(first.tools);
  });

  it('a step the person declined is not carried, and a first turn is offered what it was', async () => {
    thread([{ tool: 'list_cmc_registers', status: 'error' }], 'and for the EU?');
    await turn('and for the EU?');
    expect(h.state.gatewayCalls[0].tools).not.toContain('list_cmc_registers');

    h.state.gatewayCalls = [];
    h.state.history = [{ role: 'user', content: 'and for the EU?' }];
    await turn('and for the EU?');
    expect(h.state.gatewayCalls[0].tools).toEqual(['list_platform_commands', 'execute_platform_command', 'search_literature']);
  });
});


describe('stream conversation memory access', () => {
  it('reads memory only with the resolved thread ID', async () => {
    await turn('Review this', 'thorough', { thread_id: 'secret' });
    expect(h.memory).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1' }));
  });
  it('does not read caller thread memory after persistence fails', async () => {
    h.thread.mockRejectedValue(new Error('database unavailable'));
    await turn('Review this', 'thorough', { thread_id: 'secret' });
    expect(h.memory).not.toHaveBeenCalled();
    expect(h.state.gatewayCalls).toHaveLength(0);
    expect(JSON.stringify(h.state.gatewayCalls)).not.toContain('PRIVATE SUMMARY');
  });
  it('refuses foreign-thread access before memory or the model runs', async () => {
    const { ThreadAccessError } = await import('../../../services/chat-thread-helpers.js');
    h.thread.mockRejectedValue(new ThreadAccessError('THREAD_FORBIDDEN', 'secret'));
    const frames = await turn('Review this', 'thorough', { thread_id: 'secret' });
    expect(frames.some(frame => frame.type === 'error')).toBe(true);
    expect(h.memory).not.toHaveBeenCalled();
    expect(h.state.gatewayCalls).toHaveLength(0);
  });
});
