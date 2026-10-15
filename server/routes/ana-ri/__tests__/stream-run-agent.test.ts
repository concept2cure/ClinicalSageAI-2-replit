/**
 * The stream hosts sub-agents (row 74, S5c; brief T11): the reachability gate
 * for run_agent.
 *
 * run_agent is a stub here that records what it is handed and answers a shaped
 * agent result, so each stream rule is pinned on its own:
 *   (a) a hosting turn asks for run_agent, offers it, and lends the call a host;
 *   (b) no run row: no hosting, not offered, and no host if the model names it;
 *   (c) a tenant that denies it: no host if the model names it;
 *   (d) only run_agent's context carries the host, and none carries a person's
 *       confirmation;
 *   (e) the model and the client read no record-only trace; provenance comes
 *       from the child's own tools;
 *   (f) the answer-grounding corpus gets the child's tool results as the child
 *       read them — never its report, never the checks' echo of the parent's text;
 *   (g) agent frames go out as agent_event under the call's id, before its result;
 *   (h) a child's pause names the PARENT's round;
 *   (i) a run row of another organization does not host;
 *   (j)-(l) 'incomplete' is said plainly, is not a round failure, keeps its
 *       provenance and its telemetry row; a completed verify is a success
 *       whatever its verdict.
 * stream-run-agent-real.test.ts runs the real handler and runner end to end.
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
import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent, type ToolUse } from './support/stream-route-harness.js';

import { budgetToolResultsForModel } from '../../../services/ana/agentic-loop.js';

const app = streamApp(mountStreamRoute);
const turn = (body: Record<string, unknown> = {}): Promise<SseEvent[]> =>
  streamTurn(app, { message: 'research the pivotal trial', ...body });
const call: ToolUse = {
  id: 'tu_agent',
  name: 'run_agent',
  input: { role: 'research', objective: 'trials', instructions: 'Find the pivotal trial of drug X.' },
};

const step = (over: Record<string, unknown> = {}) => ({
  round: 1,
  tool: 'search_literature',
  input: { query: 'drug X pivotal' },
  result: JSON.stringify({
    results: [{ pmid: '11111111', title: 'Pivotal trial of drug X' }],
    provenance: [{ source: 'pubmed', id: '11111111' }],
  }),
  ok: true,
  ...over,
});
const agentResult = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    agent: { runId: 'agent_1', role: 'research', objective: 'trials' },
    status: 'completed',
    stoppedReason: 'no_more_tools',
    report: { text: 'The pivotal trial is PMID 99999999.', advisory: false },
    steps: [],
    stepCount: 1,
    notExecuted: [],
    models: [],
    usage: { inputTokens: 1, outputTokens: 1, modelCalls: 1 },
    note: '',
    trace: { steps: [step()], finalText: 'The pivotal trial is PMID 99999999.' },
    ...over,
  });

let seenCtx: Array<{ tool: string; ctx: any }> = [];
let answer = agentResult();
let onCall: ((ctx: any) => Promise<void>) | null = null;

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
  delete h.handlers.run_agent;
});

beforeEach(() => {
  resetHarness();
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + h.state.clockOffset);
  seenCtx = [];
  answer = agentResult();
  onCall = null;
  h.handlers.run_agent = async (_input: unknown, ctx?: any) => {
    seenCtx.push({ tool: 'run_agent', ctx });
    if (onCall) await onCall(ctx);
    return answer;
  };
  h.handlers.list_app_screens = async (_input: unknown, ctx?: any) => {
    seenCtx.push({ tool: 'list_app_screens', ctx });
    return JSON.stringify({ screens: ['vault'] });
  };
  h.state.script = [[call], 'Here is what the agent found.'];
});
afterEach(() => vi.restoreAllMocks());

const resultFor = (events: SseEvent[], id: string) => events.find(e => e.type === 'tool_result' && e.toolUseId === id);
const agentCtx = () => seenCtx.find(c => c.tool === 'run_agent')?.ctx;

describe('(a) a hosting turn', () => {
  it('asks for run_agent, offers it, and lends the call a host', async () => {
    await turn();
    expect(h.state.governedOpts[0]).toEqual({ hostsSubAgents: true });
    expect(h.state.requests[0].tools).toContain('run_agent');
    const host = agentCtx()?.subAgentHost;
    expect(host).toBeDefined();
    expect(host.parentRunId).toBe('run_test');
    expect(host.organizationId).toBe(7);
    expect(host.governedTools.map((t: { name: string }) => t.name)).toContain('search_literature');
    // A child's model is the governed tier pin, never the parent's.
    expect(host).not.toHaveProperty('provider');
    expect(host).not.toHaveProperty('model');
  });
});

describe('(b) no run row', () => {
  it('does not host: not offered, and no host if the model names it anyway', async () => {
    h.state.beginRunThrows = true;
    await turn();
    expect(h.state.governedOpts[0]).toEqual({ hostsSubAgents: false });
    expect(h.state.requests[0].tools).not.toContain('run_agent');
    expect(agentCtx()?.subAgentHost).toBeUndefined();
  });
});

describe('(c) a tenant that denies run_agent', () => {
  it('lends no host when the model names it', async () => {
    h.state.governedDenies = ['run_agent'];
    await turn();
    expect(agentCtx()).toBeDefined();
    expect(agentCtx().subAgentHost).toBeUndefined();
  });
});

describe('(d) only run_agent is lent a host', () => {
  it('another tool in the same step gets none, and no context carries a confirmation', async () => {
    h.state.script = [[call, { id: 'tu_l', name: 'list_app_screens', input: {} }], 'Done.'];
    await turn();
    const other = seenCtx.find(c => c.tool === 'list_app_screens')?.ctx;
    expect(other).toBeDefined();
    expect(other.subAgentHost).toBeUndefined();
    for (const c of seenCtx) expect(c.ctx.humanConfirmed).toBeUndefined();
  });
});

describe('(e) the view, the record and provenance', () => {
  it('the client and the next model call read no trace; provenance comes from the child', async () => {
    const events = await turn();
    const r = resultFor(events, 'tu_agent')!;
    expect(r.result).not.toContain('"trace"');
    expect(JSON.parse(r.result).status).toBe('completed');
    expect(JSON.stringify(h.state.requests[1].messages)).not.toContain('"trace"');
    expect(h.state.post.collectedProvenance).toEqual([{ source: 'pubmed', id: '11111111' }]);
  });
  it('a failed agent adds no provenance (intended)', async () => {
    answer = JSON.stringify({ error: 'AGENT_FAILED', code: 'ERROR', message: 'x', trace: { steps: [step()] } });
    await turn();
    expect(h.state.post.collectedProvenance).toEqual([]);
  });
});

describe('(f) the answer-grounding corpus (D19)', () => {
  const corpus = () => JSON.stringify(h.state.post.toolEvidenceCorpus);
  it("the child's report is not evidence; its tool results are", async () => {
    await turn();
    expect(corpus()).not.toContain('99999999');
    expect(corpus()).toContain('11111111');
  });
  it("the checks' echo of the parent's own text is not evidence", async () => {
    answer = agentResult({
      checkOutputs: [
        {
          check: 'check_grounding',
          output: JSON.stringify({ ungroundedClaims: [{ sentence: 'PMID 12345678 reported 42% response.' }] }),
        },
      ],
      checks: [{ check: 'check_grounding', outcome: 'fail', statement: 'Citation markers: 1 of 1 …' }],
    });
    await turn();
    expect(corpus()).not.toContain('12345678');
  });
  it('a kept child result is exactly what the child read: budgeted over its whole round', async () => {
    const big = (n: string) => JSON.stringify({ results: [{ pmid: n, abstract: n.repeat(4000) }] });
    const round = [
      step({ result: big('11111111') }),
      step({ result: big('22222222'), ok: false }),
      step({ result: big('33333333'), ok: false }),
      step({ result: big('44444444'), ok: false }),
    ];
    answer = agentResult({ trace: { steps: round, finalText: '' } });
    await turn();
    const seen = budgetToolResultsForModel(
      round.map((s, i) => ({ tool_use_id: String(i), name: s.tool, content: s.result })),
    )[0].content;
    const kept = h.state.post.toolEvidenceCorpus.filter((e: { source: string }) => e.source === 'tool:search_literature');
    expect(kept).toHaveLength(1);
    expect(kept[0].content).toBe(seen);
  });
});

describe('(g) agent frames', () => {
  it("go out as agent_event under the call's id, whatever the frame says, before the call's result", async () => {
    onCall = async ctx => {
      ctx.subAgentHost.emit({ phase: 'started', runId: 'agent_1', role: 'research', objective: 'trials' });
      ctx.subAgentHost.emit({ phase: 'finished', runId: 'agent_1', status: 'completed', type: 'done', toolUseId: 'foreign' });
    };
    const events = await turn();
    const frames = events.filter(e => e.type === 'agent_event');
    expect(frames.map(f => f.phase)).toEqual(['started', 'finished']);
    for (const f of frames) expect(f.toolUseId).toBe('tu_agent');
    expect(events.some(e => e.type === 'done' && e.toolUseId === 'foreign')).toBe(false);
    expect(events.indexOf(frames[1])).toBeLessThan(events.indexOf(resultFor(events, 'tu_agent')!));
  });
});

describe("(h) a child's pause", () => {
  it("names the parent's round", async () => {
    // The agent runs in the second tool round, so the parent's round is not 0.
    h.state.script = [[{ id: 'tu_l', name: 'list_app_screens', input: {} }], [call], 'Done.'];
    let held: string | undefined;
    onCall = async ctx => {
      // Paused only from inside the agent's call: no other reader can see it,
      // so the frame can only have come from the child's own hold.
      h.state.statuses = ['paused', 'running'];
      held = await ctx.subAgentHost.hold({ reason: 'person' }, new AbortController().signal);
    };
    const events = await turn();
    expect(held).toBe('running');
    const paused = events.find(e => e.type === 'paused');
    const result = resultFor(events, 'tu_agent')!;
    expect(paused).toBeDefined();
    expect(events.indexOf(paused!)).toBeLessThan(events.indexOf(result));
    expect(result.round).toBeGreaterThan(0);
    expect(paused!.round).toBe(result.round);
  });
});

describe('(i) a run row of another organization', () => {
  it('does not host', async () => {
    h.state.user = { id: 3, organizationId: 8 };
    await turn();
    expect(h.state.governedOpts[0]).toEqual({ hostsSubAgents: false });
    expect(agentCtx()?.subAgentHost).toBeUndefined();
  });
});

describe("(j)-(l) an agent's own outcome", () => {
  const incomplete = () => agentResult({ status: 'incomplete', stoppedReason: 'max_rounds', budget: 'rounds' });
  it('(j) incomplete is said plainly, and is not a failure for the model to work around', async () => {
    answer = incomplete();
    const events = await turn();
    const r = resultFor(events, 'tu_agent')!;
    expect(r.status).toBe('incomplete');
    expect(r.message).toBe("The agent's result is incomplete: agent: incomplete (round limit).");
    expect(JSON.stringify(h.state.requests[1].messages)).not.toContain('[Adaptation note]');
  });
  it('(k) an incomplete agent keeps its provenance, and the ledger says it was cut short', async () => {
    answer = incomplete();
    await turn();
    expect(h.state.post.collectedProvenance).toEqual([{ source: 'pubmed', id: '11111111' }]);
    // Not rounded to 'success': the ledger and the record the person can open
    // must say the same thing (review 2026-10-11).
    expect(h.state.toolRunLogs.find(l => l.toolName === 'run_agent')?.status).toBe('incomplete');
  });
  it('(l) a completed verify is a success whatever its verdict', async () => {
    answer = agentResult({ agent: { runId: 'a', role: 'verify', objective: 'x' }, verdict: 'inconclusive' });
    const events = await turn();
    expect(resultFor(events, 'tu_agent')!.status).toBe('success');
  });
});
