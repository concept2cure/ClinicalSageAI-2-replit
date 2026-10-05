/**
 * The open section decides how a turn is served (MC-RL-3, AnA reasoning round
 * 7, 2026-10-05), pinned through the live route.
 *
 * The tier came from the message's words alone, so a plainly worded question
 * with the Summary of Clinical Safety open was served as an ordinary turn: the
 * standard model, no extended thinking, medium effort. The route now hands the
 * kernel the open section. The kernel, the reasoning and effort resolvers and
 * the route are real; the model, the handlers, the run row and
 * post-processing are replaced at their seams (the
 * stream-followup-reasoning.test.ts harness). That a turn the gateway is told
 * is high-stakes is served only by a model approved for high-risk work is the
 * gateway's own rule, pinned by high-risk-model-approval.test.ts.
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
    gatewayCalls: [] as Array<{ callerModule?: string; thinking?: { enabled?: boolean; budgetTokens?: number }; apiEffort?: string; riskTier?: string }>,
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
      state.gatewayCalls.push({ callerModule: req.callerModule, thinking: req.thinking, apiEffort: req.apiEffort, riskTier: req.riskTier });
      // A model asked to think says so, as the gateway streams it.
      if (req.thinking?.enabled) {
        req.onStream?.('', { type: 'thinking', thinkingContent: `Reasoning in call ${state.gatewayCalls.length}. ` });
      }
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

const SAE = 'What SAE rate does this section report for the 10 mg arm?';
const open = (sectionCode: string) => ({ authoring_context: { projectId: 'p1', sectionCode, sectionTitle: 'x' } });

describe('the open section decides how a turn is served (MC-RL-3)', () => {
  it('a plain question in the Summary of Clinical Safety is served as high-stakes on every call', async () => {
    h.state.script = [[{ id: 'tu_1', name: 'search_literature', input: { query: 'SAE rate' } }], 'The SAE rate was 4.1%.'];
    await turn(SAE, 'balanced', open('2.7.4'));
    expect(h.state.gatewayCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of h.state.gatewayCalls) {
      expect(call.riskTier).toBe('high');
      expect(call.apiEffort).toBe('high');
      expect(call.thinking?.enabled).toBe(true);
    }
  });

  it('Fast stays fast there: no thinking and low effort, though the gateway is told the turn is high-stakes', async () => {
    await turn(SAE, 'fast', open('2.7.4'));
    const [first] = h.state.gatewayCalls;
    expect(first.riskTier).toBe('high');
    expect(first.apiEffort).toBe('low');
    expect(first.thinking?.enabled ?? false).toBe(false);
  });

  it('the same question in a Module 3 manufacturing section is served as it was', async () => {
    await turn(SAE, 'balanced', open('3.2.P.3'));
    const [first] = h.state.gatewayCalls;
    expect(first.riskTier).toBe('medium');
    expect(first.apiEffort).toBe('medium');
  });
});
