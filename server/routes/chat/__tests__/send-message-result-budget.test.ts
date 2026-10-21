/**
 * D2/W2: exercise the mounted classic chat handler's failure carrier.
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
import * as loop from '../../../services/ana/agentic-loop.js';

const CODE = 'ANA_TOOL_RESULT_BUDGET_EXCEEDED';
const MESSAGE = 'This tool round could not be passed to the assistant within its result limit. Some actions or source receipts may already exist; inspect the current state before repeating them.';
const FAILED_RECORD = { status: 'not_recorded', reason: 'The fixture writer does not persist records.' };
const RAW_RESULT = JSON.stringify({ matches: ['raw execution evidence'], actionAlreadyCompleted: true });
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { tenantId: 7, user: { id: 3, organizationId: 7 }, dbClient: { query: io.query } });
  next();
});
app.post('/api/chat/send-message', sendMessageHandler);

/** The baseline has no new export. Its real catch must still fail on status/code,
 * rather than import failure; the implemented run uses the actual typed error. */
function budgetError(): Error {
  const ctor = (loop as unknown as Record<string, unknown>).ToolResultBudgetExceededError;
  if (typeof ctor === 'function') return new (ctor as new () => Error)();
  return Object.assign(new Error(MESSAGE), { name: 'ToolResultBudgetExceededError', code: CODE });
}

beforeEach(() => {
  io.query.mockReset().mockResolvedValue({ rows: [{ id: 'fixture-retrieval' }] });
  io.record.mockReset().mockResolvedValue(FAILED_RECORD);
  io.kernel.mockReset().mockResolvedValue(undefined);
  io.execute.mockReset();
});

describe('classic chat result-bound refusal keeps operation uncertainty', () => {
  it('returns the typed handoff refusal instead of presenting a provider outage', async () => {
    const error = budgetError();
    io.execute.mockImplementation(async (_request, options) => {
      options.onToolExecution('search_literature', { query: 'fixture' }, RAW_RESULT);
      throw error;
    });
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect.soft(io.execute).toHaveBeenCalledOnce();
    expect.soft(result.status).toBe(422);
    expect.soft(result.body).toEqual({ error: MESSAGE, code: CODE, turnRecord: FAILED_RECORD });
    expect.soft(io.record).toHaveBeenCalledOnce();
    expect.soft(io.record.mock.calls[0]?.[1]).toMatchObject({
      outcome: 'failed', error, threadId: 'fixture-thread',
      calls: [{ tool: 'search_literature', input: { query: 'fixture' }, result: RAW_RESULT }],
    });
    expect.soft(result.body.error).not.toMatch(/provider|retry|try again|rolled back/i);
  });

  it('preserves a recorded failed-turn reference in the typed refusal', async () => {
    const record = { status: 'recorded', id: 'fixture-record', sha256: 'a'.repeat(64) };
    io.record.mockResolvedValue(record);
    io.execute.mockRejectedValue(budgetError());
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect.soft(result.status).toBe(422);
    expect.soft(result.body.code).toBe(CODE);
    expect.soft(result.body.turnRecord).toEqual(record);
    expect.soft(io.record.mock.calls[0]?.[1]?.outcome).toBe('failed');
  });

  it('keeps an ordinary provider failure on its existing response path', async () => {
    const error = new Error('Synthetic provider failure');
    io.execute.mockRejectedValue(error);
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'AI provider call failed', code: 'AI_PROVIDER_UNAVAILABLE', turnRecord: FAILED_RECORD });
    expect(io.record.mock.calls[0]?.[1]).toMatchObject({ outcome: 'failed', error });
  });

  it('does not accept a plain error with a copied budget name and code as a typed refusal', async () => {
    io.execute.mockRejectedValue(Object.assign(new Error('Untrusted copied code'), { name: 'ToolResultBudgetExceededError', code: CODE }));
    const result = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Inspect the current evidence' });

    expect(result.status).toBe(503);
    expect(result.body.code).toBe('AI_PROVIDER_UNAVAILABLE');
    expect(io.record.mock.calls[0]?.[1]?.outcome).toBe('failed');
  });
});
