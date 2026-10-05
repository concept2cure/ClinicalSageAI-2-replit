/**
 * The turn record says what each model call was sent, and why the turn was
 * routed as it was (MC-RL-8, AnA reasoning round 9, 2026-10-05), pinned
 * through the live route: the record's account of each call is held to what
 * the gateway actually received. The stream-followup-reasoning.test.ts
 * harness; the recorder, the kernel and the route are real.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  type ToolUse = { id: string; name: string; input: Record<string, unknown> };
  const state = {
    /** One entry per model call: tool calls to make, words then tool calls, or the answer text. */
    script: [] as Array<ToolUse[] | { say: string; tools: ToolUse[] } | string>,
    /** Each model request: who made it, and how hard it asked the model to reason. */
    gatewayCalls: [] as Array<{ thinking?: { enabled?: boolean; budgetTokens?: number }; apiEffort?: string; tools: string[]; toolChoice?: string }>,
    /** The intent lens the orchestrator reports: 'risk' makes the turn high-stakes. */
    lens: 'general',
    /** What each checkpoint drain returns, in order; empty after. */
    drains: [] as Array<Array<{ kind: 'steer' | 'screen_report' | 'move_landed'; text: string; moveId?: string }>>,
    /** Called with each wait the checkpoint makes (the run handle's wake). */
    onWake: null as null | ((ms: number) => void),
    /** The context post-processing was handed — where chips come from. */
    post: null as any,
    /** The saved thread: prior turns, then the question this turn saved. */
    history: [] as Array<{ role: string; content: string }>,
    /** What each held governed call asked the run row to record. */
    approvals: [] as any[],
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
      state.gatewayCalls.push({
        thinking: req.thinking,
        apiEffort: req.apiEffort,
        tools: (req.tools ?? []).map((t: { name: string }) => t.name),
        toolChoice: req.toolChoice,
      });
      const requestId = `req_${state.gatewayCalls.length}`;
      const step = state.script.shift();
      if (Array.isArray(step)) {
        return { content: '', toolUses: step, model: 'm', provider: 'p', requestId, usage: {}, latencyMs: 1 };
      }
      const text = typeof step === 'string' ? step : 'Done.';
      req.onStream?.(text, undefined);
      return { content: text, toolUses: [], model: 'm', provider: 'p', requestId, usage: {}, latencyMs: 1 };
    },
  };
  /** A search the draft is written from; the drafting tool is held, never dispatched. */
  const handlers: Record<string, (input: any) => Promise<string>> = {
    search_literature: async () =>
      JSON.stringify({ studies: [{ nctId: 'NCT01234567', briefTitle: 'A Phase 3 Study of Drug X', orr: '47%', enrolled: 212 }] }),
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
vi.mock('../../../services/ana/governed-toolset.js', () => ({
  governedToolsetFor: async () =>
    ['search_literature', 'draft_authoring_document'].map(
      name => ({ name, description: name, input_schema: { type: 'object', properties: {} } }),
    ),
}));
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
    detectedIntent: { lens: h.state.lens, confidence: 0.9 },
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
  getOrCreateThread: async () => 'thread-1',
  getThreadMessages: async () => h.state.history,
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
  h.state.lens = 'general';
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

describe('the record says what each call was sent (MC-RL-8)', () => {
  it("each call's request, effort, thinking and tools are what the gateway received; the closing call's tool choice too", async () => {
    h.state.script = [[{ id: 'tu_1', name: 'search_literature', input: { query: 'drug X' } }], 'The ORR was 47%.'];
    await turn('What did the pivotal study of drug X show?', 'balanced');
    const { body } = h.state.post.turnRecorder.seal('answered');
    expect(body.model.calls).toHaveLength(h.state.gatewayCalls.length);
    body.model.calls.forEach((call: any, i: number) => {
      const sent = h.state.gatewayCalls[i];
      expect(call.requestId).toBe(`req_${i + 1}`);
      expect(call.sent).toEqual({
        effort: sent.apiEffort ?? null,
        thinking: sent.thinking ? { enabled: sent.thinking.enabled === true, budgetTokens: sent.thinking.budgetTokens ?? null } : null,
        tools: sent.tools,
        toolChoice: sent.toolChoice ?? null,
      });
    });
  });

  it("a closing call told to call no tool is recorded as told so", async () => {
    // The same search three times (past the loop's duplicate limit of two):
    // the loop ends on a call that may not call a tool.
    const search = { id: 'tu_1', name: 'search_literature', input: { query: 'drug X' } };
    h.state.script = [[search], [{ ...search, id: 'tu_2' }], [{ ...search, id: 'tu_3' }], 'Done.'];
    await turn('What did the pivotal study of drug X show?', 'balanced');
    const { body } = h.state.post.turnRecorder.seal('answered');
    const closing = h.state.gatewayCalls.findIndex((c) => c.toolChoice === 'none');
    expect(closing).toBeGreaterThan(0);
    expect(body.model.calls[closing].sent.toolChoice).toBe('none');
    expect(body.model.calls[0].sent.toolChoice).toBeNull();
  });

  it('and how the turn was routed, and why', async () => {
    h.state.lens = 'risk';
    await turn('What are the regulatory risks in our plan?', 'balanced');
    const { body } = h.state.post.turnRecorder.seal('answered');
    expect(body.routing).toMatchObject({ riskTier: 'high', taskType: 'regulatory_review' });
    expect(body.routing.rationale).toMatch(/Regulatory context detected/);
  });
});
