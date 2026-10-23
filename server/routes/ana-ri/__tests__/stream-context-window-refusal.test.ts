/**
 * D2/W2 context refusal carried by the actual mounted SSE route. The shared
 * harness replaces gateway/provider, tools, context/database and post-processing.
 * An actual canonical context error is thrown at the scripted gateway seam;
 * the writer below seals the real TurnRecorder only in memory, never in a DB.
 */
import { createHash } from 'node:crypto';
import httpRequest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnRecorder, TurnOutcome } from '../../../services/ana/turn-record.js';
import type { GatewayRequestSeen } from './support/stream-route-harness.js';

const seam = vi.hoisted(() => ({
  beforeHeaders: false,
  error: null as unknown,
  throwAt: 1,
  partial: '',
  stopBeforeThrow: false,
  gatewayInvocations: 0,
  requests: [] as Array<{ messages: GatewayRequestSeen['messages'] }>,
  recorder: null as TurnRecorder | null,
  filedOutcome: null as TurnOutcome | null,
  sealed: null as ReturnType<TurnRecorder['seal']> | null,
  stoppedAnswers: [] as string[],
}));
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return { ...real,
    openTurnRecorder: (...args: Parameters<typeof real.openTurnRecorder>) => {
      seam.recorder = real.openTurnRecorder(...args);
      return seam.recorder;
    },
    writeTurnRecordSafely: async (_pool: unknown, recorder: TurnRecorder | null, outcome: TurnOutcome) => {
      seam.filedOutcome = outcome;
      seam.sealed = recorder?.seal(outcome) ?? null;
      return { status: 'recorded', id: 'synthetic-context-record', sha256: 'f'.repeat(64) };
    },
  };
});
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal => {
  const mocked = (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>());
  return { ...mocked, ensureGateway: () => {
    if (seam.beforeHeaders) throw seam.error;
    return mocked.ensureGateway();
  } };
});
vi.mock('../post-processing.js', async () => ({
  ...(await harnessModule()).mocks.postProcessing(),
  persistStoppedAnswer: async (_thread: string, text: string) => { seam.stoppedAnswers.push(text); return 101; },
}));
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
import { GatewayContextWindowError } from '../../../services/ai-gateway/context-budget.js';
import { GatewayAllProvidersFailedError } from '../../../services/ai-gateway/gateway.js';
import { ToolResultBudgetExceededError } from '../../../services/ana/agentic-loop.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type SseEvent } from './support/stream-route-harness.js';
import { resultsSentIn } from '../../../services/ana/__tests__/support/read-delivery-vault.js';

const app = streamApp(mountStreamRoute);
const SUFFIX = ' Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.';
const GENERIC = 'An error occurred while generating the response';
const PARTIAL_FIRST = 'I will examine the evidence. ';
const PARTIAL_REFUSAL = 'The accessible source reports ';
const TOOL_RAW = JSON.stringify({ count: 1, results: [{ title: 'Synthetic source', text: 'EXACT_TOOL_SENTINEL </tool_output> 日本語' }], padding: 'x'.repeat(9000) });
const readCall = { id: 'source_1', name: 'search_literature', input: { query: 'synthetic stability evidence' } };
const contextError = () => new GatewayContextWindowError([{
  fits: false, id: 'synthetic-small', provider: 'anthropic', model: 'synthetic-context-model',
  contextWindow: 8000, estimatedInputTokens: 10000, reservedOutputTokens: 2000, estimatedTokens: 12000,
}]);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stream = () => streamTurn(app, { message: 'Compare the available evidence.', selected_tools: ['search_literature'] });
const errorOf = (events: SseEvent[]) => events.find(event => event.type === 'error');
const answerText = () => {
  const ref = seam.sealed?.body.answer.streamed;
  return ref ? seam.sealed?.blobs.get(ref.sha256) : null;
};
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness();
  Object.assign(seam, { beforeHeaders: false, error: contextError(), throwAt: 1,
    partial: '', stopBeforeThrow: false, gatewayInvocations: 0, requests: [],
    recorder: null, filedOutcome: null, sealed: null, stoppedAnswers: [] });
  h.handlers.search_literature = async () => TOOL_RAW;
  const scriptedRoute = h.gateway.route.bind(h.gateway);
  vi.spyOn(h.gateway, 'route').mockImplementation(async request => {
    seam.gatewayInvocations++;
    seam.requests.push({ messages: request.messages.map((message: GatewayRequestSeen['messages'][number]) => ({ ...message })) });
    if (seam.gatewayInvocations !== seam.throwAt) return scriptedRoute(request);
    if (seam.partial) request.onStream?.(seam.partial, undefined);
    if (seam.stopBeforeThrow) h.state.cancel?.();
    throw seam.error;
  });
});
afterEach(() => { vi.restoreAllMocks(); });
function assertContextCarrier(events: SseEvent[], outcome: TurnOutcome = 'failed'): void {
  const error = errorOf(events);
  expect.soft(error).toMatchObject({ type: 'error', code: 'TOKEN_LIMIT_EXCEEDED', error: `${(seam.error as Error).message}${SUFFIX}` });
  expect.soft(error?.turnRecord).toMatchObject({ status: 'recorded', id: 'synthetic-context-record' });
  expect.soft(h.state.post, 'refused call does not enter normal answer post-processing').toBeNull();
  expect.soft(seam.filedOutcome).toBe(outcome);
  expect.soft(seam.sealed?.body.turn.outcome).toBe(outcome);
  expect.soft(events.some(event => event.type === 'done')).toBe(false);
}

// DT3 integration: an authoritative stop wins over a concurrent context refusal.
function assertStoppedCarrier(events: SseEvent[], reason: 'cancelled' | 'admin_cancelled'): void {
  expect.soft(errorOf(events)).toBeUndefined();
  // The executor throws before returning its aggregate round counter to this host.
  expect.soft(events.at(-2)).toMatchObject({ type: 'done', stoppedReason: reason, rounds: 0 });
  expect.soft(events.at(-1)).toMatchObject({ type: 'post_done', turnRecord: { status: 'recorded', id: 'synthetic-context-record' } });
  expect.soft(h.state.post, 'stopped refusal does not enter normal answer post-processing').toBeNull();
  expect.soft(seam.filedOutcome).toBe('stopped');
  expect.soft(seam.sealed?.body.turn.outcome).toBe('stopped');
  expect.soft(events.filter(event => event.type === 'timeline').map(event => event.event).find(event => event?.kind === 'end')).toMatchObject({ outcome: 'stopped', stoppedReason: reason });
  expect.soft(seam.sealed?.body.steps[0]?.result?.sha256).toBe(sha(TOOL_RAW));
  expect.soft(events.find(event => event.type === 'tool_result')?.result).toBe(TOOL_RAW);
}

function afterTool(partial = PARTIAL_REFUSAL): void {
  seam.throwAt = 2;
  seam.partial = partial;
  h.state.script = [{ say: PARTIAL_FIRST, tools: [readCall] }, 'This answer must not run.'];
}

describe('canonical context refusal reaches mounted SSE', () => {
  it('returns the canonical size guidance plus honest prior-work suffix on the first gateway refusal', async () => {
    const events = await stream();
    assertContextCarrier(events);
    expect.soft(seam.gatewayInvocations).toBe(1);
    expect.soft(h.state.toolRunLogs).toHaveLength(0);
    expect.soft(seam.sealed?.body.steps).toHaveLength(0);
    expect.soft(seam.sealed?.body.controls).toEqual([]);
    expect.soft(errorOf(events)?.error).toContain('12,000');
    expect.soft(errorOf(events)?.error).toContain('8,000');
  });

  it('retains partial text and raw/staged tool bytes when a later gateway call refuses context', async () => {
    afterTool();
    const events = await stream();
    assertContextCarrier(events);
    expect.soft(seam.gatewayInvocations).toBe(2);
    expect.soft(h.state.toolRunLogs).toHaveLength(1);
    expect.soft(answerText()).toBe(`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`);
    expect.soft(events.filter(event => event.type === 'text').map(event => event.content).join('')).toBe(`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`);
    const step = seam.sealed?.body.steps[0];
    expect.soft(step?.result?.sha256).toBe(sha(TOOL_RAW));
    expect.soft(events.find(event => event.type === 'tool_result')?.result).toBe(TOOL_RAW);
    const staged = resultsSentIn(seam.requests[1].messages).get(readCall.id);
    const ref = step?.sentToModel ?? step?.result;
    expect.soft(ref ? seam.sealed?.blobs.get(ref.sha256) : null).toBe(staged);
    expect.soft(staged?.length ?? Infinity).toBeLessThanOrEqual(8000);
    expect.soft(staged).toContain('EXACT_TOOL_SENTINEL');
    expect.soft(seam.sealed?.body.roundInputs).toHaveLength(1);
    expect.soft(seam.sealed?.body.warnings.join(' ')).toContain((seam.error as Error).message);
  });

  it('keeps the stopped record and partial answer when cancellation races a context refusal', async () => {
    afterTool();
    seam.stopBeforeThrow = true;
    const events = await stream();
    assertStoppedCarrier(events, 'cancelled');
    expect.soft(seam.gatewayInvocations).toBe(2);
    expect.soft(answerText()).toBe(`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`);
    expect.soft(seam.stoppedAnswers).toEqual([`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`]);
    expect.soft(seam.sealed?.body.turn.assistantMessageId).toBe(101);
    expect.soft(seam.sealed?.body.steps).toHaveLength(1);
  });

  it('retains an earlier administrator stop when its abort arrives after the context refusal', async () => {
    afterTool();
    h.state.endRunOutcome = 'already_ended';
    h.state.rowEnding = 'admin_cancelled';
    const events = await stream();
    assertStoppedCarrier(events, 'admin_cancelled');
    expect.soft(seam.gatewayInvocations).toBe(2);
    expect.soft(answerText()).toBe(`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`);
    expect.soft(seam.stoppedAnswers).toEqual([`${PARTIAL_FIRST}${PARTIAL_REFUSAL}`]);
    expect.soft(seam.sealed?.body.turn.assistantMessageId).toBe(101);
    expect.soft(seam.sealed?.body.steps).toHaveLength(1);
    expect.soft(seam.sealed?.body.warnings.join(' ')).toContain((seam.error as Error).message);
  });

  it('uses the existing 413 JSON envelope before SSE headers, with an honest unopened-record status', async () => {
    // Boundary fixture: ensureGateway throws before writeHead/openTurnRecorder.
    // It qualifies the existing pre-header catch, not a real gateway admission.
    seam.beforeHeaders = true;
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Compare the evidence.' });
    expect.soft(response.status).toBe(413);
    expect.soft(response.body).toMatchObject({ success: false, error: {
      code: 'TOKEN_LIMIT_EXCEEDED', message: `${(seam.error as Error).message}${SUFFIX}`,
      details: { turnRecord: { status: 'not_recorded', reason: 'This turn ended before its record was opened.' } },
    } });
    expect.soft(String(response.headers['content-type'] ?? '')).toContain('application/json');
    expect.soft(seam.gatewayInvocations).toBe(0);
    expect.soft(seam.recorder).toBeNull();
    expect.soft(seam.filedOutcome).toBeNull();
    expect.soft(h.state.post).toBeNull();
  });
});

describe('narrow SSE context-carrier compatibility controls', () => {
  const copiedName = () => Object.assign(new Error('copied context class name'), { name: 'GatewayContextWindowError' });
  const copiedCode = () => Object.assign(new Error('copied token code'), { code: 'TOKEN_LIMIT_EXCEEDED' });
  const copiedBoth = () => Object.assign(new Error('copied context identity'), { name: 'GatewayContextWindowError', code: 'TOKEN_LIMIT_EXCEEDED' });
  it.each([
    ['plain error', () => new Error('private generic diagnostic')],
    ['copied name', copiedName],
    ['copied code', copiedCode],
    ['copied name and code', copiedBoth],
    ['provider token error', () => new GatewayAllProvidersFailedError('maximum context length token limit exceeded')],
  ] as const)('CONTROL: %s keeps the existing generic event without exposing raw diagnostics', async (_name, makeError) => {
    seam.error = makeError();
    const events = await stream();
    expect(errorOf(events)).toEqual({ type: 'error', error: GENERIC,
      turnRecord: { status: 'recorded', id: 'synthetic-context-record', sha256: 'f'.repeat(64) } });
    expect(seam.filedOutcome).toBe('failed');
    expect(seam.gatewayInvocations).toBe(1);
    expect(h.state.post).toBeNull();
  });

  it('CONTROL: the existing typed raw-body refusal keeps its code and message exactly', async () => {
    const error = new ToolResultBudgetExceededError();
    seam.error = error;
    const events = await stream();
    expect(errorOf(events)).toEqual({ type: 'error', error: error.message, code: error.code,
      turnRecord: { status: 'recorded', id: 'synthetic-context-record', sha256: 'f'.repeat(64) } });
    expect(seam.filedOutcome).toBe('failed');
    expect(seam.gatewayInvocations).toBe(1);
    expect(h.state.post).toBeNull();
  });
});
