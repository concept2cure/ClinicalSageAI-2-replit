/**
 * D2/W2: carry the existing gateway context refusal through mounted chat.
 * The executor throws at its existing seam; DB, retrieval, prompt context and
 * the record writer are deterministic substitutes. This suite qualifies the
 * route response and failed-turn arguments, not allocation, source admission,
 * provider service or durable recording.
 */
import express from 'express';
import httpRequest from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), record: vi.fn(), kernel: vi.fn(),
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
vi.mock('../../../services/ana/turn-record-loop.js', () => ({
  loopToolCollector: () => {
    const calls: Array<{ tool: string; input: unknown; result: string }> = [];
    return { calls, onToolExecution: (tool: string, input: unknown, result: string) => { calls.push({ tool, input, result }); } };
  },
  recordLoopTurn: io.record,
}));

import { sendMessageHandler } from '../send-message.js';
import { ToolResultBudgetExceededError } from '../../../services/ana/agentic-loop.js';
import { GatewayContextWindowError, describeContextWindowRefusal, type ContextWindowFit } from '../../../services/ai-gateway/context-budget.js';
import { GatewayAllProvidersFailedError } from '../../../services/ai-gateway/gateway.js';
import { classifyGatewayError } from '../../../services/ai-gateway/gateway-error-map.js';

const CODE = 'TOKEN_LIMIT_EXCEEDED';
const SUFFIX = ' Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.';
const FAILED_RECORD = { status: 'not_recorded', reason: 'The fixture writer does not persist records.' };
const RAW_RESULT = JSON.stringify({ matches: ['raw execution evidence'], actionAlreadyCompleted: true });
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { tenantId: 7, user: { id: 3, organizationId: 7 }, dbClient: { query: io.query } });
  next();
});
app.post('/api/chat/send-message', sendMessageHandler);

beforeEach(() => {
  io.query.mockReset().mockResolvedValue({ rows: [{ id: 'fixture-retrieval' }] });
  io.record.mockReset().mockResolvedValue(FAILED_RECORD);
  io.kernel.mockReset().mockResolvedValue(undefined);
  io.execute.mockReset();
});

const REFUSALS: ContextWindowFit[] = [
  { fits: false, id: 'small', provider: 'openai', model: 'fixture-small', contextWindow: 8_000,
    estimatedInputTokens: 24_000, reservedOutputTokens: 2_000, estimatedTokens: 26_000 },
  { fits: false, id: 'large', provider: 'anthropic', model: 'fixture-large', contextWindow: 16_000,
    estimatedInputTokens: 24_000, reservedOutputTokens: 2_000, estimatedTokens: 26_000 },
];

describe('classic chat carries canonical context admission refusal', () => {
  it.each([
    { label: 'the recorded reference', record: { status: 'recorded', id: 'fixture-context-record', sha256: 'b'.repeat(64) } },
    { label: 'the explicit not-recorded outcome', record: FAILED_RECORD },
  ])('returns measured 413 guidance with $label and retained raw execution', async ({ record }) => {
    const refusalInputs = REFUSALS.map(value => ({ ...value }));
    const before = globalThis.structuredClone(refusalInputs);
    const error = new GatewayContextWindowError(refusalInputs);
    const canonicalMessage = describeContextWindowRefusal(refusalInputs);
    io.record.mockResolvedValue(record);
    io.execute.mockImplementation(async (_request, options) => {
      options.onToolExecution('search_literature', { query: 'fixture' }, RAW_RESULT);
      throw error;
    });
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect.soft(io.execute).toHaveBeenCalledOnce();
    expect.soft(result.status).toBe(413);
    expect.soft(result.body).toEqual({ error: canonicalMessage + SUFFIX, code: CODE, turnRecord: record });
    expect.soft(result.body.error).toContain('26,000 tokens');
    expect.soft(result.body.error).toContain('16,000 tokens (anthropic/fixture-large)');
    expect.soft(result.body.error).toContain('10,000 tokens (≈50,000 characters)');
    expect.soft(result.body.error).not.toMatch(/provider call failed|retry|try again|rolled back/i);
    expect.soft(io.record).toHaveBeenCalledOnce();
    expect.soft(io.record.mock.calls[0]?.[1]).toMatchObject({
      outcome: 'failed', error, threadId: 'fixture-thread',
      calls: [{ tool: 'search_literature', input: { query: 'fixture' }, result: RAW_RESULT }],
    });
    expect.soft(refusalInputs).toEqual(before);
    expect.soft(error.message).toBe(canonicalMessage);
  });

  it('keeps canonical context guidance without an output reserve and without reported tools', async () => {
    const error = new GatewayContextWindowError([{
      fits: false, id: 'single', provider: 'openai', model: 'fixture-zero-reserve', contextWindow: 12_000,
      estimatedInputTokens: 13_000, reservedOutputTokens: 0, estimatedTokens: 13_000,
    }]);
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect a large input' });

    expect.soft(result.status).toBe(413);
    expect.soft(result.body).toEqual({ error: error.message + SUFFIX, code: CODE, turnRecord: FAILED_RECORD });
    expect.soft(result.body.error).not.toContain('reserved for the answer');
    expect.soft(io.record.mock.calls[0]?.[1]).toMatchObject({ outcome: 'failed', error, calls: [] });
  });

  it('preserves the existing raw-body refusal 422 carrier byte for byte', async () => {
    const error = new ToolResultBudgetExceededError();
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(422);
    expect(result.body).toEqual({ error: error.message, code: error.code, turnRecord: FAILED_RECORD });
    expect(result.body.error).not.toContain('from earlier steps');
    expect(io.record.mock.calls[0]?.[1]).toMatchObject({ outcome: 'failed', error });
  });

  it('keeps an ordinary provider error on its existing 503 path', async () => {
    const error = new Error('PRIVATE_PROVIDER_DETAIL');
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'AI provider call failed', code: 'AI_PROVIDER_UNAVAILABLE', turnRecord: FAILED_RECORD });
    expect(result.text).not.toContain('PRIVATE_PROVIDER_DETAIL');
  });

  it('does not admit a copied context name, code and message as canonical class identity', async () => {
    const error = Object.assign(new Error(new GatewayContextWindowError(REFUSALS).message), {
      name: 'GatewayContextWindowError', code: CODE, refusals: REFUSALS,
    });
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'AI provider call failed', code: 'AI_PROVIDER_UNAVAILABLE', turnRecord: FAILED_RECORD });
  });

  it('keeps provider-wrapped token failures on the generic path even when the shared classifier returns the token code', async () => {
    const error = new GatewayAllProvidersFailedError('PRIVATE_PROVIDER_CONTEXT: token context length exceeded');
    expect(classifyGatewayError(error).code).toBe(CODE);
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'AI provider call failed', code: 'AI_PROVIDER_UNAVAILABLE', turnRecord: FAILED_RECORD });
    expect(result.text).not.toContain('PRIVATE_PROVIDER_CONTEXT');
  });
});

