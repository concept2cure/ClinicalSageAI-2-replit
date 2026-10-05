/**
 * runSubAgent: one bounded, read-only child loop (row 74, S5b; ADR-0015 §2,
 * §5, §7; brief T2).
 *
 * The child loop here is REAL: executeAgenticLoop, the dispatch allowlist, the
 * wrapper's rule 0 and the refusal scope all run as they will under run_agent.
 * Only the gateway is scripted, and it refuses inside a refusal scope the way
 * the real one does (model-call-scope.test.ts pins the real one).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const gw = vi.hoisted(() => ({
  calls: [] as any[],
  script: [] as Array<any | ((req: any) => any)>,
  fallback: null as null | ((req: any) => any),
  models: null as null | any[],
}));

vi.mock('../../ai-gateway/gateway', async () => {
  const { modelCallRefusal } = await import('../../ai-gateway/model-call-scope');
  return {
    getGateway: () => ({
      ...(gw.models ? { getModels: () => gw.models } : {}),
      route: async (req: any) => {
        const refusal = modelCallRefusal();
        if (refusal) throw Object.assign(new Error(`refused for ${refusal.tool}`), { name: 'GatewayPolicyError' });
        gw.calls.push(req);
        const next = gw.script.length > 0 ? gw.script.shift() : gw.fallback;
        const out = typeof next === 'function' ? await next(req) : next;
        return out ?? { content: 'Report: nothing further.', toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' };
      },
    }),
  };
});

import { runWithTenantScope } from '../../../db/tenantStore';
import { registerToolHandler } from '../AnaToolExecutor';
import { modelCallRefusal } from '../../ai-gateway/model-call-scope';
import { runSubAgent, createActiveTimer, type SubAgentHost, type AgentEventFrame } from '../sub-agent';
import { liveAgentCounts, newAgentTurnCounters } from '../sub-agent-limits';
import { runAgentViewForModel } from '../sub-agent-shape';
import { CHILD_ACTIVE_MS, CHILD_TOKEN_BUDGET } from '@shared/ana/run-control-limits';

const TOOL = (name: string) => ({ name, description: name, input_schema: { type: 'object' as const, properties: {} } });
const GOVERNED = ['search_literature', 'save_document_to_vault', 'check_grounding', 'check_numerical_integrity', 'check_dossier_consistency', 'run_agent'].map(TOOL);

function host(over: Partial<SubAgentHost> = {}): SubAgentHost & { frames: AgentEventFrame[] } {
  const frames: AgentEventFrame[] = [];
  return {
    organizationId: 7,
    parentRunId: 'run_p',
    round: 1,
    governedTools: GOVERNED,
    agents: newAgentTurnCounters(),
    hold: async () => 'running',
    expiredSignal: new AbortController().signal,
    heldMs: () => 0,
    emit: f => frames.push(f),
    frames,
    ...over,
  } as SubAgentHost & { frames: AgentEventFrame[] };
}
const CTX = { organizationId: 7, userId: 3, projectId: null, projectRef: 'prog-uuid', humanConfirmed: true } as any;
const RESEARCH = { role: 'research', objective: 'Find the pivotal trial', instructions: 'Search PubMed for the pivotal trial of drug X.' };
const inTenant = <T>(fn: () => Promise<T>, tenantId = '7') =>
  runWithTenantScope({ tenantId, source: 'test', caller: 'sub-agent-test' } as any, fn);
const run = (input: object, h = host(), ctx = CTX) => inTenant(() => runSubAgent(input as any, ctx, h)).then(s => JSON.parse(s));
const toolCall = (name: string, input: object = {}, id = `c${Math.random()}`) => ({
  content: 'working',
  toolUses: [{ id, name, input }],
  usage: { inputTokens: 10, outputTokens: 10 },
  provider: 'anthropic',
  model: 'm',
  requestId: 'r',
});

const seen: any[] = [];
beforeEach(() => {
  gw.calls = [];
  gw.script = [];
  gw.fallback = null;
  gw.models = null;
  seen.length = 0;
  registerToolHandler('search_literature', async (input, ctx) => {
    seen.push({ input, ctx, refusal: modelCallRefusal() });
    return JSON.stringify({ results: [{ pmid: '11111111', title: 'Pivotal trial' }] });
  });
});
afterEach(() => {
  expect(liveAgentCounts().total).toBe(0);
  delete process.env.ANA_ENABLE_SUB_AGENTS;
});

describe('refusals start nothing', () => {
  it('a child cannot start an agent (depth)', async () => {
    const r = await run(RESEARCH, host(), { ...CTX, agentDepth: 1 });
    expect(r.error).toBe('AGENT_CANNOT_DELEGATE');
    expect(gw.calls).toHaveLength(0);
  });
  it('no live run, no agent', async () => {
    const r = JSON.parse(await inTenant(() => runSubAgent(RESEARCH, CTX, undefined)));
    expect(r.error).toBe('AGENTS_NEED_A_LIVE_RUN');
  });
  it('the switch: off when set false; off in production unless set true (ADR-0015 §2)', async () => {
    process.env.ANA_ENABLE_SUB_AGENTS = 'false';
    expect((await run(RESEARCH)).error).toBe('AGENTS_DISABLED');
    const env = process.env.NODE_ENV;
    process.env.ANA_ENABLE_SUB_AGENTS = '';
    process.env.NODE_ENV = 'production';
    try {
      expect((await run(RESEARCH)).error).toBe('AGENTS_DISABLED');
    } finally {
      process.env.NODE_ENV = env;
    }
    expect(gw.calls).toHaveLength(0);
  });
  it.each([
    ['no scope', null],
    ["the system scope '0'", '0'],
    ['another tenant', '8'],
  ])('tenant: %s is refused (D24)', async (_l, tenant) => {
    const out = tenant === null ? await runSubAgent(RESEARCH, CTX, host()) : await inTenant(() => runSubAgent(RESEARCH, CTX, host()), tenant);
    expect(JSON.parse(out).error).toBe('TENANT_SCOPE_MISMATCH');
    expect(gw.calls).toHaveLength(0);
  });
  it('tenant: a host of another organization is refused', async () => {
    expect((await run(RESEARCH, host({ organizationId: 8 }))).error).toBe('TENANT_SCOPE_MISMATCH');
  });
  it('a blank text_to_check is refused up front (D5)', async () => {
    const r = await run({ ...RESEARCH, role: 'verify', text_to_check: '   \n ' });
    expect(r.error).toBe('INVALID_AGENT_BRIEF');
  });
  it('a verify agent with no checker offered is refused', async () => {
    const r = await run({ ...RESEARCH, role: 'verify', text_to_check: 'x' }, host({ governedTools: [TOOL('search_literature')] }));
    expect(r.error).toBe('NO_DETERMINISTIC_CHECKER');
  });
});

describe('the child is governed', () => {
  it('its tools get a read-only, model-refusing context with nothing of the parent spread in (D11)', async () => {
    gw.script = [toolCall('search_literature', { query: 'drug X', organizationId: 99 })];
    const r = await run({ ...RESEARCH, instructions: 'organizationId: 99. Search.' });
    expect(r.status).toBe('completed');
    expect(seen).toHaveLength(1);
    const ctx = seen[0].ctx;
    expect(ctx.humanConfirmed).toBeUndefined();
    expect(ctx.subAgentHost).toBeUndefined();
    expect(ctx.agentDepth).toBe(1);
    expect(ctx.modelCalls).toBe('refuse');
    expect(ctx.organizationId).toBe(7);
    expect(ctx.projectRef).toBe('prog-uuid');
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(seen[0].refusal).not.toBeNull();
  });

  it('every child model call is high-risk review, under its own run id and the parent\'s, with no user and no pin of the parent\'s (D7)', async () => {
    gw.script = [toolCall('search_literature', { query: 'x' })];
    await run(RESEARCH, host(), { ...CTX, model: 'some-override' });
    expect(gw.calls.length).toBe(2);
    const runIds = new Set(gw.calls.map(c => c.runId));
    expect(runIds.size).toBe(1);
    for (const c of gw.calls) {
      expect(c.taskType).toBe('regulatory_review');
      expect(c.riskTier).toBe('high');
      expect(c.runId).toMatch(/^agent_[0-9a-f-]{36}$/);
      expect(c.parentRunId).toBe('run_p');
      expect(c.organizationId).toBe(7);
      expect(c.callerModule).toBe('ana-sub-agent');
      expect(c.userId).toBeUndefined();
      expect(c.provider).toBeUndefined();
      expect(c.model).toBeUndefined();
    }
  });

  it('it is offered research tools the parent has, and nothing else: a write and run_agent are answered, not run', async () => {
    const saved = vi.fn(async () => 'saved');
    registerToolHandler('save_document_to_vault', saved);
    gw.script = [
      (req: any) => {
        expect(req.tools.map((t: any) => t.name)).toEqual(['search_literature']);
        return toolCall('save_document_to_vault', { title: 't' });
      },
      toolCall('run_agent', RESEARCH),
    ];
    const r = await run(RESEARCH);
    expect(saved).not.toHaveBeenCalled();
    expect(r.notExecuted.map((n: any) => [n.tool, n.code])).toEqual([
      ['save_document_to_vault', 'TOOL_NOT_OFFERED'],
      ['run_agent', 'TOOL_NOT_OFFERED'],
    ]);
    expect(r.note).toMatch(/Tried 2 steps it may not take: .*\. Nothing was changed\./);
    expect(JSON.stringify(r)).not.toMatch(/Proposed/);
  });
});

describe('a verify agent: the verdict comes from the checks only', () => {
  it('runs the checks on the text as given, read-only and model-refusing, before the child model', async () => {
    const probe: any[] = [];
    registerToolHandler('check_numerical_integrity', async (input, ctx) => {
      probe.push({ input, ctx, refusal: modelCallRefusal(), modelCallsBefore: gw.calls.length });
      return JSON.stringify({ verdict: 'clean', factsExtracted: 2, labelsCompared: 1 });
    });
    const text = 'Response was 42% in 120 patients.';
    gw.script = [{ content: 'All citations verified.', toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' }];
    const r = await run({ ...RESEARCH, role: 'verify', text_to_check: text });
    expect(probe[0].input).toEqual({ content: text });
    expect(probe[0].ctx.agentDepth).toBe(1);
    expect(probe[0].refusal).not.toBeNull();
    expect(probe[0].modelCallsBefore).toBe(0);
    // The real check_grounding: an unmarked figure fails, whatever the report says.
    expect(r.checks.find((c: any) => c.check === 'check_grounding').outcome).toBe('fail');
    expect(r.checks.find((c: any) => c.check === 'check_dossier_consistency').statement).toMatch(/no numeric project id/);
    expect(r.verdict).toBe('issues_found');
    expect(r.report.advisory).toBe(true);
    expect(r.notChecked.length).toBeGreaterThan(0);
    const harnessWords = JSON.stringify({ checks: r.checks, note: r.note, notChecked: r.notChecked, verdict: r.verdict });
    expect(harnessWords).not.toMatch(/verified/i);
  });
});

describe('failures are a result, never a throw (D8, D9)', () => {
  it.each([
    [{ name: 'GatewayPolicyError', code: 'MODEL_NOT_APPROVED_FOR_HIGH_RISK' }, 'MODEL_NOT_APPROVED', /could not start/],
    [{ name: 'GatewayModelDeclinedError' }, 'MODEL_DECLINED', /declined/],
    [{ name: 'GatewayPolicyError' }, 'RATE_OR_POLICY_LIMIT', /rate or policy/],
    [{ name: 'Error' }, 'ERROR', /could not start/],
  ])('%o gives AGENT_FAILED %s', async (shape, code, words) => {
    gw.fallback = () => {
      throw Object.assign(new Error('boom'), shape);
    };
    const h = host();
    const r = await run(RESEARCH, h);
    expect(r.error).toBe('AGENT_FAILED');
    expect(r.code).toBe(code);
    expect(r.message).toMatch(words);
    expect(h.frames.at(-1)).toMatchObject({ phase: 'finished', status: 'failed' });
  });
  it('a failure after a call says it could not finish', async () => {
    gw.script = [toolCall('search_literature', { query: 'x' })];
    gw.fallback = () => {
      throw new Error('late');
    };
    expect((await run(RESEARCH)).message).toMatch(/could not finish/);
  });
});

describe('caps', () => {
  it('the seventh agent of a turn is refused, and a refusal changes no count', async () => {
    const h = host();
    for (let round = 1; round <= 6; round++) expect((await run(RESEARCH, { ...h, round })).status).toBe('completed');
    expect((await run(RESEARCH, { ...h, round: 7 })).error).toBe('AGENT_LIMIT_REACHED');
    expect(h.agents.started).toBe(6);
  });
  it('the fifth in one round is refused; a later round may start', async () => {
    const h = host();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    gw.fallback = async () => {
      await gate;
      return { content: 'done', toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' };
    };
    const four = [1, 2, 3, 4].map(() => run(RESEARCH, h));
    const fifth = await run(RESEARCH, h);
    expect(fifth.error).toBe('AGENT_ROUND_LIMIT');
    release();
    await Promise.all(four);
    expect((await run(RESEARCH, { ...h, round: 2 })).status).toBe('completed');
  });
  it('an organization has at most 8 live agents per process; the next is busy', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    gw.fallback = async () => {
      await gate;
      return { content: 'done', toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' };
    };
    const live = Array.from({ length: 8 }, () => run(RESEARCH, host()));
    await vi.waitFor(() => expect(liveAgentCounts().byOrg.get(7)).toBe(8));
    const busyTurn = host();
    expect((await run(RESEARCH, busyTurn)).error).toBe('AGENTS_BUSY');
    expect(busyTurn.agents.started).toBe(0);
    release();
    await Promise.all(live);
  });
  it('the process has at most 10 live agents across organizations (ADR-0015 §5)', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    gw.fallback = async () => {
      await gate;
      return { content: 'done', toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' };
    };
    const org = (id: number) => ({ ...CTX, organizationId: id });
    const runAs = (id: number) =>
      runWithTenantScope({ tenantId: String(id), source: 'test' } as any, () => runSubAgent(RESEARCH, org(id), host({ organizationId: id })));
    const live = [...Array.from({ length: 6 }, () => runAs(7)), ...Array.from({ length: 4 }, () => runAs(8))];
    await vi.waitFor(() => expect(liveAgentCounts().total).toBe(10));
    expect(JSON.parse(await runAs(9)).error).toBe('AGENTS_BUSY');
    release();
    await Promise.all(live);
  });
});

describe('budgets and the person\'s controls', () => {
  it('the token budget stops the child, at most two calls past it (D23)', async () => {
    gw.fallback = () => ({ ...toolCall('search_literature', { query: `q${Math.random()}` }), usage: { inputTokens: 100_000, outputTokens: 20_000 } });
    const r = await run(RESEARCH);
    expect(r.status).toBe('incomplete');
    expect(r.stoppedReason).toBe('budget_exhausted');
    expect(r.budget).toBe('tokens');
    expect(r.usage.inputTokens + r.usage.outputTokens).toBeLessThanOrEqual(CHILD_TOKEN_BUDGET + 2 * 120_000);
    expect(r.note).toMatch(/token budget.*do not start the same brief again/);
  });
  it('the round limit stops the child as incomplete', async () => {
    gw.fallback = () => toolCall('search_literature', { query: `q${Math.random()}` });
    const r = await run(RESEARCH);
    expect(r).toMatchObject({ status: 'incomplete', stoppedReason: 'max_rounds', budget: 'rounds' });
  });
  it('a pause before the start delays the first call; a run that will not resume starts nothing', async () => {
    let resume!: (o: 'running') => void;
    const held = host({ hold: () => new Promise(r => (resume = r)) });
    const pending = run(RESEARCH, held);
    await new Promise(r => setTimeout(r, 20));
    expect(gw.calls).toHaveLength(0);
    resume('running');
    expect((await pending).status).toBe('completed');

    const stopped = await run(RESEARCH, host({ hold: async () => 'cancelled' }));
    expect(stopped.status).toBe('cancelled');
    expect(gw.calls).toHaveLength(1);
  });
  it('a run cancelled while the child waits between rounds is cancelled, not a time budget', async () => {
    let holds = 0;
    gw.fallback = () => toolCall('search_literature', { query: `q${Math.random()}` });
    const r = await run(RESEARCH, host({ hold: async () => (++holds === 1 ? 'running' : 'cancelled') }));
    expect(r.status).toBe('cancelled');
    expect(r.budget).toBeUndefined();
    expect(gw.calls).toHaveLength(1);
  });
  it('a hold that expires between rounds is cancelled, and says the run stayed paused', async () => {
    let holds = 0;
    gw.fallback = () => toolCall('search_literature', { query: `q${Math.random()}` });
    const r = await run(RESEARCH, host({ hold: async () => (++holds === 1 ? 'running' : 'expired') }));
    expect(r.status).toBe('cancelled');
    expect(r.note).toMatch(/paused past its limit/);
  });
  it('a Stop mid-call is cancelled, not a failure', async () => {
    const stop = new AbortController();
    gw.fallback = async (req: any) => {
      stop.abort();
      if (req.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'GatewayAbortedError' });
      return toolCall('search_literature', {});
    };
    const r = await run(RESEARCH, host(), { ...CTX, signal: stop.signal });
    expect(r.status).toBe('cancelled');
    expect(r.error).toBeUndefined();
  });
  it('an expired hold stops the child, and says so', async () => {
    const expired = new AbortController();
    expired.abort();
    const r = await run(RESEARCH, host({ expiredSignal: expired.signal }));
    expect(r.status).toBe('cancelled');
    expect(r.note).toMatch(/paused past its limit/);
    expect(gw.calls).toHaveLength(0);
  });
  it('a call still running at the active-time limit is aborted: incomplete, time budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      gw.fallback = (req: any) =>
        new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'GatewayAbortedError' })));
        });
      const pending = run(RESEARCH);
      // vi.waitFor polls on a timer, which is faked here.
      for (let i = 0; i < 200 && gw.calls.length === 0; i++) await vi.advanceTimersByTimeAsync(1);
      expect(gw.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(CHILD_ACTIVE_MS);
      const r = await pending;
      expect(r).toMatchObject({ status: 'incomplete', budget: 'time' });
      expect(gw.calls[0].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('the active-time timer excludes time held for a person', () => {
    let now = 0;
    let held = 0;
    vi.useFakeTimers();
    try {
      const t = createActiveTimer(() => held, 1_000, () => now);
      now = 900;
      held = 500;
      vi.advanceTimersByTime(1_000);
      now = 1_000;
      expect(t.activeMs()).toBe(500);
      expect(t.signal.aborted).toBe(false);
      now = 1_600;
      vi.advanceTimersByTime(600);
      expect(t.signal.aborted).toBe(true);
      t.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the record and the view', () => {
  it('the full result keeps every step whole; the view drops the trace and keeps the outcome', async () => {
    const big = 'x'.repeat(30_000);
    registerToolHandler('search_literature', async () => JSON.stringify({ big }));
    gw.script = Array.from({ length: 3 }, (_, i) => toolCall('search_literature', { query: `q${i}` }));
    gw.fallback = () => ({ content: 'R'.repeat(4_000), toolUses: [], usage: {}, provider: 'anthropic', model: 'm', requestId: 'r' });
    const full = await inTenant(() => runSubAgent(RESEARCH, CTX, host()));
    const parsed = JSON.parse(full);
    expect(parsed.trace.steps).toHaveLength(3);
    expect(parsed.trace.steps[0].result).toContain(big);
    expect(parsed.trace.finalText.length).toBe(4_000);
    expect(parsed.report.text.length).toBe(2_500);
    const view = JSON.parse(runAgentViewForModel(full));
    expect(view.trace).toBeUndefined();
    expect(view).toMatchObject({ status: 'completed', stoppedReason: 'no_more_tools' });
  });
  it('frames: started, then steps, then finished', async () => {
    gw.script = [toolCall('search_literature', { query: 'x' })];
    const h = host();
    await run(RESEARCH, h);
    expect(h.frames.map(f => f.phase)).toEqual(['started', 'step', 'step', 'finished']);
    expect(h.frames.at(-1)).toMatchObject({ status: 'completed' });
  });
});
