/**
 * D2/W2: native model-call provenance through the mounted classic chat route.
 * The collector, recordLoopTurn, TurnRecorder and author readers are real.
 * Executor, DB/retrieval/context and final durable writer are scripted seams;
 * the final writer seals the real recorder in memory, not in a database.
 */
import express from 'express';
import httpRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SealedTurnRecord, TurnOutcome } from '../../../services/ana/turn-record.js';

const io = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), record: vi.fn(), kernel: vi.fn(),
  sealed: null as SealedTurnRecord | null,
  outcome: null as TurnOutcome | null,
}));
vi.mock('../../../db.js', () => ({ pool: { query: io.query }, getPool: () => ({ query: io.query }), db: {} }));
vi.mock('../../../db/currentTenant.js', () => ({ currentTenantOrgUuid: async () => '77777777-2222-4333-8444-555555555555' }));
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({ executeAgenticLoop: io.execute }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({
  getOrCreateThread: async () => 'fixture-thread', getThreadMessages: async () => [],
  saveChatMessage: async () => 1, ThreadAccessError: class extends Error {},
}));
vi.mock('../../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ searchHybrid: async () => [] }) }));
vi.mock('../shared.js', () => ({ ensureGateway: () => ({ getEnabledProviders: () => ['fixture'], getModels: () => [] }), normalizeBody: () => {} }));
vi.mock('../../../services/lumen-context-builder.js', () => ({ getIntelligencePrefix: async () => '' }));
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: async () => ({ memoryBlock: '', atoms: [], diagnostics: null }) }));
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: async () => '' }));
vi.mock('../../../services/projects/project-instructions.js', () => ({ getProjectInstructionsBlock: async () => '' }));
vi.mock('../../../services/ana/governed-toolset.js', () => ({ governedToolsetFor: async () => [] }));
vi.mock('../../../services/ana-ri/orchestrator.js', () => ({ orchestrate: () => ({
  systemPrompt: 'Fixture context', detectedIntent: { lens: 'general', confidence: 1 },
  detectedSubmissionType: null, orchestrationMeta: { deficiencyContextInjected: false },
}) }));
vi.mock('../../../services/kernel-router.js', () => ({ planKernelExecution: () => ({
  taskType: 'chat', riskTier: 'low', strategy: 'quality_optimized', maxTokens: 128, temperature: 0,
}) }));
vi.mock('../../../services/kernel-adaptive-policy.js', () => ({ getKernelPolicyHint: async () => null, recordKernelPolicyOutcome: async () => {} }));
vi.mock('../../../services/kernel-decision-record.js', () => ({ logKernelDecision: io.kernel }));
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: async () => {} }));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptChatResponse: () => {} }));
vi.mock('../../../services/working-memory.js', () => ({ summarizeAndStoreWorkingMemoryForThread: async () => {} }));
vi.mock('../../../services/ana/turn-record-loop.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record-loop.js')>();
  return { ...real, recordLoopTurn: (...args: Parameters<typeof real.recordLoopTurn>) => {
    io.record(...args);
    return real.recordLoopTurn(...args);
  } };
});
vi.mock('../../../services/ana/turn-record.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/turn-record.js')>();
  return { ...real, writeTurnRecordSafely: async (...args: Parameters<typeof real.writeTurnRecordSafely>) => {
    const [, recorder, outcome] = args;
    io.outcome = outcome;
    io.sealed = recorder?.seal(outcome) ?? null;
    if (!io.sealed) return { status: 'not_recorded', reason: 'No recorder was opened.' };
    const { servedModelsOf } = await import('../../../services/ana/turn-record-models.js');
    const { qualifyServedModels } = await import('../../../services/ai-governance/approved-models.js');
    return { status: 'recorded', id: 'fixture-native-model-record', sha256: 'c'.repeat(64),
      servedBy: qualifyServedModels(servedModelsOf(io.sealed.body.model)) };
  } };
});

import { sendMessageHandler } from '../send-message.js';
import { GatewayContextWindowError } from '../../../services/ai-gateway/context-budget.js';
import { ToolResultBudgetExceededError } from '../../../services/ana/agentic-loop.js';
import { servedModelsOf } from '../../../services/ana/turn-record-models.js';

interface ModelCall {
  round: number;
  provider: string | null;
  model: string | null;
  requestId: string | null;
}
const FIRST = { provider: 'anthropic', model: 'claude-sonnet-5', requestId: 'gateway-first' };
const FINAL = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'gateway-final' };
const RAW_TOOL = JSON.stringify({ source: 'synthetic-stability-source', text: 'Exact raw evidence 日本語', actionAlreadyCompleted: true });
const LEGACY_WARNING = "This turn ran through a door that reports its tool calls and final answer but not its rounds or what each later model call was sent; the record holds the first call's input, every tool call and the answer.";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { tenantId: 7, user: { id: 3, organizationId: 7 }, dbClient: { query: io.query } });
  next();
});
app.post('/api/chat/send-message', sendMessageHandler);
const send = () => httpRequest(app).post('/api/chat/send-message').send({ message: 'Compare the recorded stability evidence.' });
const response = (who = FINAL) => ({
  ...who, content: 'The source reports stability evidence.', thinking: 'Synthetic reasoning',
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, latencyMs: 1,
});
const contextError = () => new GatewayContextWindowError([{
  fits: false, id: 'small', provider: 'anthropic', model: 'synthetic-small', contextWindow: 8000,
  estimatedInputTokens: 10000, reservedOutputTokens: 2000, estimatedTokens: 12000,
}]);
function written(): SealedTurnRecord {
  expect(io.sealed, 'the mounted route reaches the real collector and recorder').not.toBeNull();
  return io.sealed!;
}
function assertCalls(expected: ModelCall[]): void {
  expect.soft(written().body.model.calls).toEqual(expected.map((who, index) => ({ call: index + 1, ...who, sent: null })));
}
function assertRawTool(): void {
  const sealed = written();
  expect.soft(sealed.body.steps).toHaveLength(1);
  const ref = sealed.body.steps[0]?.result;
  expect.soft(ref ? sealed.blobs.get(ref.sha256) : null).toBe(RAW_TOOL);
}
beforeEach(() => {
  io.query.mockReset().mockResolvedValue({ rows: [{ id: 'fixture-retrieval' }] });
  io.record.mockReset();
  io.kernel.mockReset().mockResolvedValue(undefined);
  io.execute.mockReset();
  io.sealed = null;
  io.outcome = null;
});

describe('mounted classic chat records every returned model call', () => {
  it('records the no-tools first call with raw model identity while retaining the composite display model', async () => {
    io.execute.mockImplementation(async (_request, options) => {
      const answer = response();
      options.onModelResponse?.(answer, 0);
      return answer;
    });
    const result = await send();
    expect.soft(result.status).toBe(200);
    assertCalls([{ round: 0, ...FINAL }]);
    expect.soft(result.body.model).toBe('anthropic/claude-opus-5-5');
    expect.soft(written().body.model.model).toBe('anthropic/claude-opus-5-5');
    expect.soft(servedModelsOf(written().body.model)).toEqual([{ provider: FINAL.provider, model: FINAL.model }]);
    expect.soft(result.body.turnRecord.servedBy).toContainEqual(expect.objectContaining({ model: FINAL.model, approvedForHighRisk: true }));
    expect.soft(written().body.turn).toMatchObject({ organizationId: 7, actorUserId: 3, threadId: 'fixture-thread', outcome: 'answered' });
    expect.soft(io.execute).toHaveBeenCalledOnce();
  });

  it('retains repeated-model requests in chronological order and exposes each distinct author to qualification', async () => {
    io.execute.mockImplementation(async (_request, options) => {
      options.onModelResponse?.(response(FIRST), 0);
      options.onToolExecution('search_literature', { query: 'stability' }, RAW_TOOL);
      options.onModelResponse?.(response({ ...FINAL, requestId: 'gateway-middle' }), 1);
      const answer = response();
      options.onModelResponse?.(answer, 2);
      return answer;
    });
    const result = await send();
    expect.soft(result.status).toBe(200);
    assertCalls([{ round: 0, ...FIRST }, { round: 1, ...FINAL, requestId: 'gateway-middle' }, { round: 2, ...FINAL }]);
    expect.soft(servedModelsOf(written().body.model)).toEqual([
      { provider: FIRST.provider, model: FIRST.model }, { provider: FINAL.provider, model: FINAL.model },
    ]);
    expect.soft(result.body.turnRecord.servedBy).toEqual([
      expect.objectContaining({ model: FIRST.model, qualified: false, approvedForHighRisk: false }),
      expect.objectContaining({ model: FINAL.model, approvedForHighRisk: true }),
    ]);
    assertRawTool();
    expect.soft(io.execute).toHaveBeenCalledOnce();
  });

  it('keeps an unknown early author instead of replacing it with the later known author', async () => {
    io.execute.mockImplementation(async (_request, options) => {
      options.onModelResponse?.({ provider: 'anthropic', requestId: 'gateway-unknown', content: 'First note.' }, 0);
      const answer = response();
      options.onModelResponse?.(answer, 1);
      return answer;
    });
    const result = await send();
    expect.soft(result.status).toBe(200);
    assertCalls([{ round: 0, provider: 'anthropic', model: null, requestId: 'gateway-unknown' }, { round: 1, ...FINAL }]);
    expect.soft(result.body.turnRecord.servedBy).toEqual([
      expect.objectContaining({ provider: 'anthropic', model: null, qualified: false }),
      expect.objectContaining({ model: FINAL.model, approvedForHighRisk: true }),
    ]);
  });

  it('copies reported metadata before a response object is subsequently changed', async () => {
    io.execute.mockImplementation(async (_request, options) => {
      const early = response(FIRST);
      options.onModelResponse?.(early, 0);
      early.provider = 'changed-provider';
      early.model = 'changed-model';
      early.requestId = 'changed-request';
      const answer = response();
      options.onModelResponse?.(answer, 1);
      return answer;
    });
    const result = await send();
    expect.soft(result.status).toBe(200);
    assertCalls([{ round: 0, ...FIRST }, { round: 1, ...FINAL }]);
    expect.soft(JSON.stringify(written().body.model.calls)).not.toContain('changed-');
  });

  it.each([
    ['context', contextError, 413, 'TOKEN_LIMIT_EXCEEDED'],
    ['raw body', () => new ToolResultBudgetExceededError(), 422, 'ANA_TOOL_RESULT_BUDGET_EXCEEDED'],
    ['provider', () => new Error('PRIVATE_LATE_PROVIDER_DIAGNOSTIC'), 503, 'AI_PROVIDER_UNAVAILABLE'],
  ] as const)('retains earlier calls and exact tool bytes through a late %s failure without inventing a served failed call', async (_kind, makeError, status, code) => {
    const error = makeError();
    io.execute.mockImplementation(async (_request, options) => {
      options.onModelResponse?.(response(FIRST), 0);
      options.onToolExecution('search_literature', { query: 'stability' }, RAW_TOOL);
      options.onModelResponse?.(response(), 1);
      throw error;
    });
    const result = await send();
    expect.soft(result.status).toBe(status);
    expect.soft(result.body.code).toBe(code);
    assertCalls([{ round: 0, ...FIRST }, { round: 1, ...FINAL }]);
    expect.soft(io.record.mock.calls[0]?.[1]?.error).toBe(error);
    expect.soft(io.record.mock.calls[0]?.[1]?.response).toBeUndefined();
    expect.soft(io.outcome).toBe('failed');
    expect.soft(written().body.turn.outcome).toBe('failed');
    expect.soft(written().body.model.model).toBeNull();
    expect.soft(result.body.turnRecord.servedBy).toHaveLength(2);
    expect.soft(result.text).not.toContain('PRIVATE_LATE_PROVIDER_DIAGNOSTIC');
    assertRawTool();
    expect.soft(io.execute).toHaveBeenCalledOnce();
  });
});

describe('existing classic carrier and legacy observation controls', () => {
  it('CONTROL: a first-call context failure records no guessed requested model', async () => {
    const error = contextError();
    io.execute.mockRejectedValue(error);
    const result = await send();
    expect(result.status).toBe(413);
    expect(result.body.code).toBe('TOKEN_LIMIT_EXCEEDED');
    expect(written().body.model.calls).toEqual([]);
    expect(written().body.model.model).toBeNull();
    expect(result.body.turnRecord.servedBy).toEqual([]);
    expect(io.record.mock.calls[0]?.[1]?.error).toBe(error);
  });

  it('CONTROL: an executor that reports no model observations retains the existing fallback and limitation', async () => {
    io.execute.mockResolvedValue(response());
    const result = await send();
    expect(result.status).toBe(200);
    expect(written().body.model.calls).toEqual([]);
    expect(servedModelsOf(written().body.model)).toEqual([{ provider: 'anthropic', model: 'anthropic/claude-opus-5-5' }]);
    expect(written().body.warnings).toContain(LEGACY_WARNING);
    expect(written().body.turn.outcome).toBe('answered');
  });

  it('CONTROL: an invalid message opens neither an executor nor a turn record', async () => {
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: '' });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_MESSAGE');
    expect(io.execute).not.toHaveBeenCalled();
    expect(io.record).not.toHaveBeenCalled();
    expect(io.sealed).toBeNull();
  });
});
