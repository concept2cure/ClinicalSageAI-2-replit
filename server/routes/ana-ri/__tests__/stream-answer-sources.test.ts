/**
 * What the live route hands the answer check (2026-10-04, AnA reasoning).
 *
 * The check compares an answer with what AnA had this turn
 * (answer-grounding.ts). The route is where that is decided, so it is pinned
 * here through the real stream, with the model, the handlers, the run row and
 * post-processing replaced at their seams (the live-drive-turn.test.ts
 * harness):
 *   - each tool result is an entry named by its tool, with the call's input;
 *   - what a model wrote inside a tool call is carried with that entry, so
 *     the check does not credit it;
 *   - a failed step is not an entry;
 *   - the person's own message and the project data the platform read for
 *     her are entries; her memory of earlier turns is not.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => {
  type ToolUse = { id: string; name: string; input: Record<string, unknown> };
  const state = {
    /** One entry per model call: tool calls to make, words then tool calls, or the answer text. */
    script: [] as Array<ToolUse[] | { say: string; tools: ToolUse[] } | string>,
    /** Each model request, with its messages copied at the moment of the call. */
    gatewayCalls: [] as Array<{ callerModule?: string; messages: any[] }>,
    /** What each checkpoint drain returns, in order; empty after. */
    drains: [] as Array<Array<{ kind: 'steer' | 'screen_report' | 'move_landed'; text: string; moveId?: string }>>,
    /** Called with each wait the checkpoint makes (the run handle's wake). */
    onWake: null as null | ((ms: number) => void),
    /** The context post-processing was handed — where chips come from. */
    post: null as any,
    /** The saved thread: prior turns, then the question this turn saved. */
    history: [] as Array<{ role: string; content: string }>,
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
      state.gatewayCalls.push({ callerModule: req.callerModule, messages: [...req.messages] });
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
  /** Tools as the stream sees them: an engine, one whose handler asks a model, one that fails. */
  const handlers: Record<string, (input: any) => Promise<string>> = {
    search_literature: async () => JSON.stringify({ nctId: 'NCT01234567', orr: '47%', enrolled: 212 }),
    batch_draft_sections: async () => {
      // As the real gateway does for every generation it serves inside a
      // tool call (gateway.route → noteGeneration).
      const { noteGeneration } = await import('../../../services/ai-gateway/generation-capture.js');
      noteGeneration({ content: 'Section 2.7.3: ORR was 31% in 98 patients.' });
      return JSON.stringify({ sections: [{ code: '2.7.3', text: 'Section 2.7.3: ORR was 31% in 98 patients.' }] });
    },
    estimate_shelf_life: async () => {
      throw new Error('stability data unavailable');
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
    ['search_literature', 'batch_draft_sections', 'estimate_shelf_life'].map(
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
  requestApproval: async () => false,
  recordApprovalDecision: async () => false,
  readApprovalDecision: async () => null,
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
  // Project data the platform read: a source.
  prefetchRouteIntelligenceContext: async () => ({ rimContext: 'RIM: the shelf life on file is 24 months.', decisionContext: [] }),
}));
vi.mock('../../../services/lumen-context-builder.js', () => ({
  // Custom instructions and promoted summaries: not a source.
  getIntelligencePrefix: async () => 'Custom instructions: always cite 21 CFR 314.110.',
  buildSectionSpecificPrompt: () => '',
}));
vi.mock('../../../services/memory-context-assembler.js', () => ({
  // AnA's memory of earlier turns: her own statements, never a source.
  buildMemoryContextForChat: async () => ({ memoryBlock: 'Working memory: ORR was 52%.', atoms: [], diagnostics: null }),
}));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({
  // An instruction overlay, as the claim-grounding block is: its example figures are not a source.
  enrichContextForChat: async () => ({ block: 'Claim grounding: an IND waits 30 days; a 510(k) has a 90-day clock.', sources: ['claim-grounding'] }),
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
});

async function turn(message: string): Promise<void> {
  await request(app)
    .post('/api/ana-ri/stream')
    .send({ message })
    .buffer(true)
    .parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => (data += chunk));
      r.on('end', () => cb(null, data));
    });
}

describe('the sources the route hands the answer check', () => {
  it('names each tool result, carries what a model wrote inside it, and drops a failed step', async () => {
    h.state.script = [
      [
        { id: 'tu_1', name: 'search_literature', input: { query: 'pivotal study' } },
        { id: 'tu_2', name: 'batch_draft_sections', input: { sections: ['2.7.3'] } },
        { id: 'tu_3', name: 'estimate_shelf_life', input: { months: 36 } },
      ],
      'ORR was 47% in 212 patients.',
    ];
    await turn('Our pivotal study enrolled 212 patients. Summarise it.');
    const corpus = h.state.post.toolEvidenceCorpus as Array<Record<string, any>>;

    const trial = corpus.find(e => e.source === 'tool:search_literature');
    expect(trial?.content).toContain('"orr":"47%"');
    expect(trial?.generated).toBeUndefined();

    const drafted = corpus.find(e => e.source === 'tool:batch_draft_sections');
    expect(drafted?.generated).toEqual(['Section 2.7.3: ORR was 31% in 98 patients.']);

    expect(corpus.some(e => e.source === 'tool:estimate_shelf_life')).toBe(false);
  });

  it('project data is a source; the instructions, the intelligence prefix and AnA\'s memory are not', async () => {
    h.state.script = ['The shelf life on file is 24 months.'];
    await turn('What shelf life do we have on file?');
    const corpus = h.state.post.toolEvidenceCorpus as Array<Record<string, any>>;

    // The person's words are carried, to be read as theirs (never as a source).
    expect(corpus.find(e => e.source === 'person')?.content).toBe('What shelf life do we have on file?');
    expect(corpus.find(e => e.source === 'context')?.content).toContain('shelf life on file is 24 months');
    for (const notASource of ['ORR was 52%', '90-day clock', '21 CFR 314.110']) {
      expect(corpus.some(e => String(e.content).includes(notASource)), notASource).toBe(false);
    }
  });
});
