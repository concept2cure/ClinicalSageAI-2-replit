/**
 * run_agent end to end through the stream (row 74, S5c; brief T11 (m)).
 *
 * The real run_agent handler and runSubAgent, the real child loop, the real
 * model-call refusal scope, and the request inside a tenant scope as the auth
 * boundary opens one. Only the model is scripted, and one gateway serves the
 * parent's calls and the child's.
 *
 * Stubs alone would not prove reachability: a stubbed run_agent leaves the
 * child-call assertions below with nothing to read. That is this file's red
 * (the named mutation "stub run_agent in the end-to-end test").
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';


const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
// The REAL executor — so executeAgenticLoop, the dispatch allowlist, the
// read-only wrapper rule and the model-call refusal scope are all real — with
// only run_agent taken from it; every other tool stays the harness's stub.
vi.mock('../../../services/ana/AnaToolExecutor.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/AnaToolExecutor.js')>();
  const { harness } = await harnessModule();
  return { ...real, getToolHandler: (n: string) => (n === 'run_agent' ? real.getToolHandler(n) : harness.handlers[n]) };
});
// The child's own model calls reach the same scripted gateway the parent's do.
vi.mock('../../../services/ai-gateway/gateway.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const { harness } = await harnessModule();
  return { ...real, getGateway: () => harness.gateway };
});
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
// The real executor records each tool's outcome; only the health read is stubbed.
vi.mock('../../../services/ana/tool-telemetry.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await harnessModule()).mocks.toolTelemetry(),
  recordToolOutcome: () => {},
}));
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type ToolUse } from './support/stream-route-harness.js';


const app = streamApp(mountStreamRoute, { tenantScope: '7' });
const call: ToolUse = {
  id: 'tu_agent',
  name: 'run_agent',
  input: { role: 'research', objective: 'trials', instructions: 'Find the pivotal trial of drug X.' },
};
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
  // Named so the harness's toolset offers it; the executor serves the real one.
  h.handlers.run_agent = async () => {
    throw new Error('the stub must not run here');
  };
  h.state.script = [
    [call],
    'No pivotal trial was found in the sources searched.',
    'The agent found no pivotal trial.',
  ];
});
afterEach(() => vi.restoreAllMocks());

describe('run_agent, real, through the stream', () => {
  it("the child's model call is governed and linked to the parent run, and its finished frame precedes the result", async () => {
    const events = await streamTurn(app, { message: 'research the pivotal trial' });
    const child = h.state.requests.find(r => r.callerModule === 'ana-sub-agent');
    expect(child, 'no child model call was made').toBeDefined();
    expect(child!.parentRunId).toBe('run_test');
    expect(child!.organizationId).toBe(7);
    expect(child!.runId).toMatch(/^agent_[0-9a-f-]{36}$/);
    expect(child!.riskTier).toBe('high');
    // No recursion: a child is never offered the delegation tool.
    expect(child!.tools ?? []).not.toContain('run_agent');

    const result = events.find(e => e.type === 'tool_result' && e.toolUseId === 'tu_agent')!;
    expect(result.status, result.result).toBe('success');
    expect(JSON.parse(result.result)).toMatchObject({ status: 'completed', agent: { role: 'research' } });
    const finished = events.find(e => e.type === 'agent_event' && e.phase === 'finished');
    expect(finished).toMatchObject({ toolUseId: 'tu_agent', status: 'completed' });
    expect(events.indexOf(finished!)).toBeLessThan(events.indexOf(result));
  });
});
