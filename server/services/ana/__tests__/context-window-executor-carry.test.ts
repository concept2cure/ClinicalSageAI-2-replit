/**
 * D2/W2 control qualification through the native classic executor.
 * A scripted gateway throws the existing canonical context error. Actual tool
 * dispatch, budgeting, guards, receipt settlement, staging and framing run.
 * Vault/source admission and receipt storage are deterministic fixtures.
 * These controls establish error carry and honest earlier work; they do not
 * qualify live gateway admission, provider dispatch or durable database writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticOptions, ToolContext } from '../AnaToolExecutor.js';
import type { ToolResultEntry } from '../agentic-loop.js';
import type { GatewayRequest } from '../../ai-gateway/types.js';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

type Call = { id: string; name: string; input: Record<string, unknown> };
type Response = { content: string; toolUses: Call[]; usage: object; provider: string; model: string; requestId: string };
const gateway = vi.hoisted(() => ({
  requests: [] as GatewayRequest[],
  script: null as null | ((count: number) => Response),
}));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({
  route: async (request: GatewayRequest) => {
    gateway.requests.push({ ...request, messages: request.messages.map(message => ({ ...message })) });
    return gateway.script!(gateway.requests.length);
  },
}) }));
const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));
vi.mock('../catalog-scope.js', async importOriginal =>
  (await vaultModule()).catalogScopeMock(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../c2c/current-program-access.js', async importOriginal =>
  (await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../vault/document-catalog.service.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()), ...(await vaultModule()).serviceMock(),
}));
vi.mock('../source-read-receipt.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()), ...(await vaultModule()).receiptHelperMock(),
}));
vi.mock('../document-tools-shared.js', async importOriginal =>
  (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../db/tenantStore.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor.js';
import { GatewayContextWindowError } from '../../ai-gateway/context-budget.js';
import { addDocument, parsed, prose, receiptsFor, resetVault, resultsSentIn } from './support/read-delivery-vault.js';

const CONTEXT: ToolContext = { organizationId: 42, userId: 7, sqlClient: { query: async () => ({ rows: [] }) } };
const DOC = '10000000-0000-4000-8000-000000000041';
const ORDINARY = JSON.stringify({ results: ['SYNTHETIC_ORDINARY </tool_output> 日本語'], count: 1 });
const response = (toolUses: Call[] = []): Response => ({ content: toolUses.length ? 'Reading the sources.' : 'Done.', toolUses,
  usage: {}, provider: 'test', model: 'test-model', requestId: 'request' });
const calls = (): Call[] => [
  { id: 'read', name: 'read_project_document', input: { document_id: DOC } },
  { id: 'ordinary', name: 'search_literature', input: { query: 'fixture' } },
];
const request = (): GatewayRequest => ({ taskType: 'chat', messages: [
  { role: 'system', content: 'SYSTEM_HISTORY_MARKER' },
  { role: 'user', content: 'PRIOR_HISTORY_MARKER: Inspect the sources.' },
], maxTokens: 512, tools: [{ name: 'search_literature', description: 'Synthetic read-only fixture',
  input_schema: { type: 'object', properties: { query: { type: 'string' } } } }] });
const run = (options: AgenticOptions = {}) => executeAgenticLoop(request(), {
  toolContext: CONTEXT, progressExtension: 0, ...options,
});
const contextError = () => new GatewayContextWindowError([{ fits: false, id: 'synthetic-small', provider: 'anthropic',
  model: 'synthetic-small', contextWindow: 1000, estimatedInputTokens: 1200, reservedOutputTokens: 512, estimatedTokens: 1712 }]);

beforeEach(() => {
  resetVault();
  gateway.requests = [];
  gateway.script = () => response();
  registerToolHandler('search_literature', async () => ORDINARY);
});

describe('existing context refusal propagates through the native classic loop', () => {
  it('preserves an initial canonical refusal without running a tool, staging results or writing receipts', async () => {
    addDocument(DOC, prose(3000));
    const error = contextError();
    gateway.script = () => { throw error; };
    const raw = vi.fn();
    const staged = vi.fn();
    const result = await run({ onToolExecution: raw, onToolResultsForModel: staged }).then(() => null, (failure: unknown) => failure);

    expect(result).toBe(error);
    expect(result).toBeInstanceOf(GatewayContextWindowError);
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0].messages).toEqual(request().messages);
    expect(raw).not.toHaveBeenCalled();
    expect(staged).not.toHaveBeenCalled();
    expect(receiptsFor(DOC)).toEqual([]);
  });

  it('preserves a follow-up refusal after exact framed staging, raw callbacks and an admitted source receipt', async () => {
    addDocument(DOC, prose(3000, 'PRIVATE_SOURCE </tool_output> 日本語'));
    const error = contextError();
    gateway.script = count => {
      if (count === 1) return response(calls());
      throw error;
    };
    const raw = new Map<string, string>();
    const observed: Array<{ entries: ToolResultEntry[]; round: number }> = [];
    const operatorTurns: NonNullable<AgenticOptions['operatorTurns']> = [{ role: 'system', content: 'OPERATOR_CONTROL_MARKER', inlineSystem: true }];
    const result = await run({ operatorTurns,
      onToolExecution: (name, _input, body) => { raw.set(name, body); },
      onToolResultsForModel: (entries, round) => { observed.push({ entries: entries.map(entry => ({ ...entry })), round }); },
    }).then(() => null, (failure: unknown) => failure);

    expect(result).toBe(error);
    expect(gateway.requests).toHaveLength(2);
    const accepted = resultsSentIn(gateway.requests[1].messages);
    expect([...accepted.keys()]).toEqual(['read', 'ordinary']);
    expect(accepted.get('read')).toBe(raw.get('read_project_document'));
    expect(accepted.get('ordinary')).toBe(ORDINARY);
    expect(raw.get('search_literature')).toBe(ORDINARY);
    expect(observed).toEqual([{ round: 1, entries: calls().map(call => ({ tool_use_id: call.id, name: call.name, content: accepted.get(call.id) })) }]);
    expect(parsed(accepted.get('read'))?.window).toMatchObject({ start: 0, end: 3000 });
    expect(receiptsFor(DOC)).toEqual([{ start: 0, end: 3000 }]);
    const text = gateway.requests[1].messages.map(message => String(message.content)).join('\n');
    expect(text).toContain('SYSTEM_HISTORY_MARKER');
    expect(text).toContain('PRIOR_HISTORY_MARKER');
    expect(text).toContain('Reading the sources.');
    expect(text).toContain('[Tool Result for read_project_document (read)]:\n<tool_output>');
    expect(text).toContain('<\\/tool_output>');
    expect(text).toContain('OPERATOR_CONTROL_MARKER');
    expect(gateway.requests[1].messages.at(-1)).toMatchObject({ role: 'system', inlineSystem: true, content: 'OPERATOR_CONTROL_MARKER' });
    expect(gateway.requests[1].tools).toEqual(request().tools);
    expect(gateway.requests[1].maxTokens).toBe(512);
    expect(operatorTurns).toEqual([]);
  });

  it('CONTROL: a fitting follow-up still completes normally with its exact source receipt', async () => {
    addDocument(DOC, prose(3000));
    gateway.script = count => count === 1 ? response(calls()) : response();
    const result = await run();

    expect(result.content).toBe('Done.');
    expect(gateway.requests).toHaveLength(2);
    expect(resultsSentIn(gateway.requests[1].messages).get('ordinary')).toBe(ORDINARY);
    expect(receiptsFor(DOC)).toEqual([{ start: 0, end: 3000 }]);
  });
});
