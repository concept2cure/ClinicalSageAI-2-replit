/**
 * A Live Drive turn through the real stream route — what the person's screen
 * and chip row are told, and what AnA is told back.
 *
 * Each block pins one confirmed break. Every one of them failed GREEN: the
 * route answered, the deploy passed, and the person was told something untrue.
 *
 *   1. The promotion. A driving turn that fetches a demonstration is promoted
 *      to demo mode mid-turn and announces it with a second `drive_state`. It
 *      carried nothing to tell it from the turn-start one, so the client read
 *      it as a fresh enable and re-armed a drive the person had just taken
 *      over or switched off.
 *   2. The screen report. What the APP saw on the person's screen — a move
 *      that did not land — was queued as a steer, so the checkpoint framed it
 *      as the person redirecting AnA and announced it as "You steered AnA:".
 *   3. The over-budget move. Past the turn's drive budget a move is not made
 *      and AnA is told it is "offered as a one-click chip". The chip cap equals
 *      the assist budget, and the applied moves came first, so the cap was
 *      full before the unapplied one arrived: no chip, and a false promise.
 *   4. The control route accepts `screen_report` as its own action.
 *
 * ── The harness ──────────────────────────────────────────────────────────────
 * The route is driven over HTTP with the model, the tool handlers, the run row
 * and post-processing replaced at their module seams, and everything between
 * them real: the agentic loop, the checkpoint, the drive budgets, the
 * directive readers and the chip derivation. Context assembly (memory,
 * orchestration, enrichment) is stubbed to empty — it has no bearing on what
 * is asserted, and each piece would otherwise need a database.
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
  /** The self-drive handlers, answering the way the registered ones do on success. */
  const handlers: Record<string, (input: any) => Promise<string>> = {
    navigate_to: async input =>
      JSON.stringify({
        status: 'navigation_ready',
        directive: {
          actionType: 'navigate',
          targetId: input.target,
          label: `Screen ${input.target}`,
          path: `/s/${input.target}`,
          scope: 'global',
        },
      }),
    act_on_screen: async input =>
      JSON.stringify({
        status: 'action_ready',
        directive: {
          actionType: 'surface_action',
          actionId: input.action,
          surfaceId: 'vault',
          label: `Do ${input.action}`,
        },
      }),
    start_product_demo: async () =>
      JSON.stringify({ status: 'demo_ready', driven: true, script: { id: 'sales', title: 'Sales tour' } }),
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
    ['list_app_screens', 'navigate_to', 'list_screen_actions', 'act_on_screen', 'list_demo_scripts', 'start_product_demo'].map(
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

import {
  mountStreamRoute,
  buildScreenReportTurn,
  buildUnconfirmedMovesTurn,
  MOVE_SETTLE_MAX_MS,
} from '../stream.js';
import { applyControl } from '../../../services/ana/run-control.js';
import {
  MAX_NAVIGATION_ACTIONS,
  toNavigationActions,
  toSurfaceActionChips,
} from '../../../services/ana-ri/navigation-actions.js';
import { buildSteerMessage } from '../../../services/ana/operator-channel.js';

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
  // Live Drive's entitlement gate open, the platform's ship-dark default.
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
  vi.mocked(applyControl).mockClear();
});

type SseEvent = Record<string, any> & { type: string };

/** One turn, start to `post_done`'s stand-in; returns every SSE event in order. */
async function turn(body: Record<string, unknown>): Promise<SseEvent[]> {
  const res = await request(app)
    .post('/api/ana-ri/stream')
    .send({ message: 'take me through it', ...body })
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

const nav = (n: number | string) => ({ id: `nav_${n}`, name: 'navigate_to', input: { target: `t${n}` } });
const act = (n: number) => ({ id: `act_${n}`, name: 'act_on_screen', input: { action: `a${n}` } });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The tool result AnA read back for one call, from the follow-up request. */
function resultSeenByModel(toolUseId: string): Record<string, unknown> {
  const followUp = h.state.gatewayCalls[1];
  const turnWithResults = followUp.messages.find(
    (m: any) => m.role === 'user' && String(m.content).includes(`(${toolUseId})]:`),
  );
  const block = String(turnWithResults?.content ?? '')
    .split('\n\n[Tool Result for ')
    .find(b => b.includes(`(${toolUseId})]:`));
  return JSON.parse(String(block).slice(String(block).indexOf(']:\n') + 3));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The promotion to demo mode is marked; a turn start never is
// ─────────────────────────────────────────────────────────────────────────────

describe('drive_state — a mid-turn promotion says so', () => {
  it('a driving turn that starts a demonstration announces the promotion as promoted', async () => {
    h.state.script = [[{ id: 'demo_1', name: 'start_product_demo', input: { demo: 'sales' } }], 'Here is the tour.'];
    const events = await turn({ live_drive: true });
    const states = events.filter(e => e.type === 'drive_state');

    expect(states).toHaveLength(2);
    expect(states[0], 'the turn-start drive_state must never read as a promotion').toEqual({
      type: 'drive_state',
      enabled: true,
      mode: 'assist',
    });
    expect(states[1], 'the client cannot tell this from a fresh enable, and re-arms a drive the person stopped').toEqual({
      type: 'drive_state',
      enabled: true,
      mode: 'demo',
      promoted: true,
    });
  });

  it('a turn that began as a demonstration is not promoted, and its one drive_state is unmarked', async () => {
    h.state.script = [[{ id: 'demo_1', name: 'start_product_demo', input: { demo: 'sales' } }], 'Here is the tour.'];
    const events = await turn({ live_drive: true, drive_mode: 'demo' });
    const states = events.filter(e => e.type === 'drive_state');
    expect(states).toEqual([{ type: 'drive_state', enabled: true, mode: 'demo' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A screen report is the app's observation, never the person's steer
// ─────────────────────────────────────────────────────────────────────────────

describe('the checkpoint — screen reports and steers drained together, told apart', () => {
  const REPORT = '[Screen report] Opening the Vault screen did not happen: no program is open.';

  it('frames the report as an observation and announces only the steer as the person steering', async () => {
    h.state.script = [[nav(1)], 'Done.'];
    h.state.drains = [
      [
        { kind: 'screen_report', text: REPORT },
        { kind: 'steer', text: 'narrow to Class III' },
      ],
    ];
    const events = await turn({ live_drive: true });

    // "You steered AnA:" is rendered from these. The person steered once.
    const announced = events.filter(e => e.type === 'interjected').map(e => e.message);
    expect(announced, 'a screen report was shown to the person as their own steer').toEqual(['narrow to Class III']);

    // What AnA read on the next round: both, as operator-channel turns, in order.
    const operatorTurns = h.state.gatewayCalls[1].messages.filter((m: any) => m.role === 'system' && m.inlineSystem);
    expect(operatorTurns).toHaveLength(2);
    const [report, steer] = operatorTurns;
    expect(report).toEqual(buildScreenReportTurn(REPORT));
    expect(report.origin, 'client-sent text must be scanned, never exempt').toBe('external');
    expect(report.content).toContain('Opening the Vault screen did not happen: no program is open.');
    expect(report.content).toMatch(/not something the person said/);
    expect(report.content, 'framed as the person redirecting her').not.toContain(
      'The person you are working for has redirected you',
    );
    expect(steer.content).toBe(buildSteerMessage('narrow to Class III'));
  });

  it('a report alone announces nothing', async () => {
    h.state.script = [[nav(1)], 'Done.'];
    h.state.drains = [[{ kind: 'screen_report', text: REPORT }]];
    const events = await turn({ live_drive: true });
    expect(events.filter(e => e.type === 'interjected')).toEqual([]);
  });
});

describe('buildScreenReportTurn', () => {
  it('names itself as the app, not the person, if a fallback model folds it into a user turn', () => {
    expect(buildScreenReportTurn('Could not open Vault.')?.foldLabel).toBe('App observation');
  });

  it('opens with the marker the Live Drive prompt names, once', () => {
    const t = buildScreenReportTurn('[Screen report] "Search" on the vault screen did not happen: no handler.');
    expect(t?.content.startsWith('[Screen report] ')).toBe(true);
    expect(t?.content.match(/\[Screen report\]/g)).toHaveLength(1);
    expect(t?.content).toContain('"Search" on the vault screen did not happen: no handler.');
  });

  it('tells her to say what could not be done, not claim it happened', () => {
    const t = buildScreenReportTurn('Opening the CMC screen did not happen: locked.');
    expect(t).toMatchObject({ role: 'system', inlineSystem: true, origin: 'external' });
    expect(t?.content).toMatch(/State plainly what could not be done/);
    expect(t?.content).toMatch(/Do not say or imply that it happened/);
    expect(t?.content).toMatch(/not an instruction/);
  });

  it('an empty report is no turn at all', () => {
    expect(buildScreenReportTurn('   ')).toBeNull();
    expect(buildScreenReportTurn('[Screen report]   ')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. A move the budget stopped is the chip the person can press
// ─────────────────────────────────────────────────────────────────────────────

describe('moves past the drive budget lead the chips', () => {
  it('navigations: the two AnA could not make are chips, ahead of the six she made', async () => {
    h.state.script = [range(1, 8).map(nav), 'Done.'];
    const events = await turn({ live_drive: true });

    const applied = events.filter(e => e.type === 'drive_navigation').map(e => e.directive.targetId);
    expect(applied).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);

    const chips = toNavigationActions(h.state.post.collectedNavigation).map(c => c.targetId);
    expect(chips, 'a move AnA said was "offered as a chip" had no chip').toEqual(['t7', 't8', 't1', 't2', 't3', 't4']);
    expect(chips).toHaveLength(MAX_NAVIGATION_ACTIONS);

    expect(resultSeenByModel('nav_7')).toMatchObject({ applied: false });
    expect(String(resultSeenByModel('nav_7').instruction)).toContain('offered as a one-click chip');
  });

  it('actions: the one past the budget is the first chip', async () => {
    h.state.script = [range(1, 9).map(act), 'Done.'];
    const events = await turn({ live_drive: true });
    expect(events.filter(e => e.type === 'drive_action')).toHaveLength(8);

    const chips = toSurfaceActionChips(h.state.post.collectedSurfaceActions).map(c => c.actionId);
    expect(chips[0], 'the unapplied action fell past the chip cap').toBe('a9');
    expect(chips).toHaveLength(MAX_NAVIGATION_ACTIONS);
  });

  it('a move she made and re-asked for past the budget is offered once, not twice', async () => {
    h.state.script = [[...range(1, 6).map(nav), { ...nav(1), id: 'nav_1_again' }], 'Done.'];
    await turn({ live_drive: true });
    const chips = toNavigationActions(h.state.post.collectedNavigation).map(c => c.targetId);
    expect(chips.filter(t => t === 't1')).toHaveLength(1);
    expect(chips[0]).toBe('t1');
  });

  it('past chip room she is told the move is not offered either — never promised a chip that is dropped', async () => {
    // Six made, then seven more: the first six unapplied fill the chip row.
    h.state.script = [range(1, 13).map(nav), 'Done.'];
    await turn({ live_drive: true });

    const chips = toNavigationActions(h.state.post.collectedNavigation).map(c => c.targetId);
    expect(chips).toEqual(['t7', 't8', 't9', 't10', 't11', 't12']);
    expect(String(resultSeenByModel('nav_12').instruction)).toContain('offered as a one-click chip');
    const dropped = resultSeenByModel('nav_13');
    expect(dropped).toMatchObject({ applied: false });
    expect(String(dropped.instruction)).not.toContain('offered as a one-click chip');
    expect(String(dropped.instruction)).toContain('no room left to offer it as a chip');
  });

  it('a turn that does not drive reaches the same chip derivation, unchanged', async () => {
    h.state.script = [range(1, 8).map(nav), 'Done.'];
    const events = await turn({});
    expect(events.filter(e => e.type === 'drive_navigation')).toEqual([]);
    const chips = toNavigationActions(h.state.post.collectedNavigation).map(c => c.targetId);
    expect(chips).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    // Nothing was stopped by a budget, so nothing is amended.
    expect(resultSeenByModel('nav_7').applied).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The control route
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 5. She answers from what the screen did, not from what she asked for
// ─────────────────────────────────────────────────────────────────────────────

describe('the checkpoint — waits for the screen to settle each move', () => {
  const REPORT = '[Screen report] "Search the vault" on the vault screen did not happen: This vault has no documents yet.';
  const operatorTurns = (call: number) =>
    h.state.gatewayCalls[call].messages.filter((m: any) => m.role === 'system' && m.inlineSystem);

  it('names each move, so the screen can report it back', async () => {
    h.state.script = [[nav(1), act(2)], 'Done.'];
    const events = await turn({ live_drive: true });
    expect(events.find(e => e.type === 'drive_navigation')?.moveId).toBe('nav_1');
    expect(events.find(e => e.type === 'drive_action')?.moveId).toBe('act_2');
  });

  it('holds her next round until the move lands — and a landing puts nothing in front of her', async () => {
    h.state.script = [[nav(1)], 'Done.'];
    h.state.drains = [[], [], [{ kind: 'move_landed', text: '', moveId: 'nav_1' }]];
    await turn({ live_drive: true, drive_acks: true });

    // Three drains while waiting: the round was held until the landing came.
    expect(h.state.drains, 'the next round was written before the screen settled the move').toHaveLength(0);
    expect(h.state.gatewayCalls).toHaveLength(2);
    expect(operatorTurns(1)).toEqual([]);
  });

  it('a move that did not land reaches the round she writes next', async () => {
    // The report arrives a moment after the tool result, as it does in the
    // browser. Without the wait the round had already been written.
    h.state.script = [[act(1)], 'Done.'];
    h.state.drains = [[], [{ kind: 'screen_report', text: REPORT, moveId: 'act_1' }]];
    await turn({ live_drive: true, drive_acks: true });

    expect(operatorTurns(1), 'she answered without hearing the move failed').toEqual([buildScreenReportTurn(REPORT)]);
  });

  it('a move still unsettled at the ceiling is told to her as not confirmed, never as done', async () => {
    let skew = 0;
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
    h.state.onWake = ms => {
      skew += ms;
    };
    try {
      h.state.script = [[nav(1)], 'Done.'];
      await turn({ live_drive: true, drive_acks: true });
    } finally {
      clock.mockRestore();
    }
    // It waited out the ceiling (less the real milliseconds that passed), and
    // no longer.
    expect(skew, 'the wait is bounded by the ceiling').toBeGreaterThan(MOVE_SETTLE_MAX_MS - 1_000);
    expect(skew).toBeLessThanOrEqual(MOVE_SETTLE_MAX_MS);
    const note = buildUnconfirmedMovesTurn(['opening the Screen t1 screen']);
    expect(operatorTurns(1)).toEqual([note]);
    expect(note!.content).toContain('Do not say it happened');
    expect(note!.foldLabel).toBe('App observation');
  });

  it('a client that does not report its moves is not waited on', async () => {
    h.state.script = [[nav(1)], 'Done.'];
    h.state.drains = [[], [{ kind: 'move_landed', text: '', moveId: 'nav_1' }]];
    await turn({ live_drive: true });
    // One drain at the boundary, then straight on.
    expect(h.state.drains).toHaveLength(1);
  });
});

describe('POST /stream/:runId/control — move_landed', () => {
  it('is accepted with the move it settles', async () => {
    const res = await request(app)
      .post('/api/ana-ri/stream/run_test/control')
      .send({ action: 'move_landed', moveId: 'toolu_01ABC' });
    expect(res.status).toBe(200);
    expect(vi.mocked(applyControl)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'move_landed', moveId: 'toolu_01ABC' }),
    );
  });

  it('needs a move id, and refuses one that is not a move id', async () => {
    const none = await request(app).post('/api/ana-ri/stream/run_test/control').send({ action: 'move_landed' });
    expect(none.status).toBe(400);
    expect(none.body.error).toBe('move_landed requires a moveId');
    const bad = await request(app)
      .post('/api/ana-ri/stream/run_test/control')
      .send({ action: 'move_landed', moveId: 'x"; drop table' });
    expect(bad.status).toBe(400);
    expect(vi.mocked(applyControl)).not.toHaveBeenCalled();
  });

  it('a screen report can name the move it is about', async () => {
    const res = await request(app)
      .post('/api/ana-ri/stream/run_test/control')
      .send({ action: 'screen_report', message: 'Opening the Vault screen did not happen.', moveId: 'toolu_9' });
    expect(res.status).toBe(200);
    expect(vi.mocked(applyControl)).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'screen_report', moveId: 'toolu_9' }),
    );
  });
});

describe('POST /stream/:runId/control — screen_report', () => {
  it('is accepted as its own action, not as a steer', async () => {
    const res = await request(app)
      .post('/api/ana-ri/stream/run_test/control')
      .send({ action: 'screen_report', message: 'Opening the Vault screen did not happen.' });
    expect(res.status).toBe(200);
    expect(vi.mocked(applyControl)).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_test',
        organizationId: 7,
        userId: 3,
        action: 'screen_report',
        message: 'Opening the Vault screen did not happen.',
      }),
    );
  });

  it('needs something to report', async () => {
    const res = await request(app)
      .post('/api/ana-ri/stream/run_test/control')
      .send({ action: 'screen_report', message: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('screen_report requires a non-empty message');
    expect(vi.mocked(applyControl)).not.toHaveBeenCalled();
  });

  it('an empty steer is still refused, and an unknown action still is', async () => {
    const steer = await request(app).post('/api/ana-ri/stream/run_test/control').send({ action: 'interject' });
    expect(steer.status).toBe(400);
    expect(steer.body.error).toBe('interject requires a non-empty message');
    const unknown = await request(app).post('/api/ana-ri/stream/run_test/control').send({ action: 'observe' });
    expect(unknown.status).toBe(400);
    expect(vi.mocked(applyControl)).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. The history AnA is given opens on a question
// ─────────────────────────────────────────────────────────────────────────────

describe('history — the window opens on a question after an unanswered turn', () => {
  // q1's turn failed or was stopped, so post-processing saved no answer. The
  // thread ends with this turn's own question, saved before the model runs.
  const turnOf = (n: number) => [{ role: 'user', content: `q${n}` }, { role: 'assistant', content: `a${n}` }];
  const saved = [...turnOf(0), { role: 'user', content: 'q1, never answered' }, ...range(2, 10).flatMap(turnOf)];
  const sent = () =>
    h.state.gatewayCalls[0].messages.filter((m: any) => m.role !== 'system').map((m: any) => `${m.role}:${m.content}`);

  it.each([
    ['saved in the thread', () => ((h.state.history = [...saved, { role: 'user', content: 'go' }]), {})],
    ['sent by the client (no saved thread yet)', () => ({ conversation_history: saved })],
  ])('history %s: the answer at the far edge is dropped, not opened on', async (_source, arrange) => {
    await turn(arrange());
    // Opening on 'assistant:a0' is the conversation the API refuses.
    expect(sent().slice(0, 3)).toEqual(['user:q1, never answered', 'user:q2', 'assistant:a2']);
    expect(sent()).toContain('assistant:a10');
  });

  it('a thread whose pairs are intact is passed through unchanged', async () => {
    const intact = range(0, 11).flatMap(turnOf);
    h.state.history = [...intact, { role: 'user', content: 'go' }];
    await turn({});
    expect(sent().slice(0, 20)).toEqual(intact.slice(-20).map(m => `${m.role}:${m.content}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// What she says at each stop reads as its own paragraph
// ─────────────────────────────────────────────────────────────────────────────

describe('narration — each round starts its own paragraph', () => {
  it('a stop narrated after the last one is not run on from it', async () => {
    const said = ['Stop 1: Projects is the front door.', 'Stop 2: the Vault holds every source.', 'That is the whole demonstration.'];
    h.state.script = [{ say: said[0], tools: [nav(1)] }, { say: said[1], tools: [nav(2)] }, said[2]];
    const events = await turn({ live_drive: true });
    const shown = events.filter(e => e.type === 'text').map(e => e.content).join('');

    expect(shown, 'the person read "…front door.Stop 2: …"').toBe(said.join('\n\n'));
    expect(h.state.post.fullContent, 'the saved message ran on').toBe(shown);
    // She is handed back what she said, as she said it.
    const assistantTurns = h.state.gatewayCalls[2].messages.filter((m: any) => m.role === 'assistant').map((m: any) => m.content);
    expect(assistantTurns.slice(-2)).toEqual(said.slice(0, 2));
  });
});
