/**
 * Native classic-host qualification for D2/W2 raw result-body admission.
 * CONTRACT: docs/evidence/D2-ROUND-BODY-BOUND/2026-10-21/CONTRACT.md.
 * Gateway, actor/source admission and Vault persistence are deterministic
 * fixtures. Actual dispatch, canonical allocation, read guards, settlement,
 * staging and framing run. The two late-growth tests replace only the
 * allocator output with a declared near-limit fixture; they qualify host
 * ordering, not allocator behavior or live database/provider delivery.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticOptions, ToolContext } from '../AnaToolExecutor.js';
import type { ToolResultEntry } from '../agentic-loop.js';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

type Message = { role: string; content: unknown };
type Request = { messages: Message[]; toolChoice?: unknown };
type Call = { id: string; name: string; input: Record<string, unknown> };
type Response = { content: string; toolUses: Call[]; usage: object; provider: string; model: string; requestId: string };
const h = vi.hoisted(() => ({
  requests: [] as Request[],
  script: null as null | ((call: number) => Response),
  lateGrowth: false,
  settlementRefusal: false,
  settlements: 0,
  writerAttempts: [] as string[],
  lastCandidate: [] as ToolResultEntry[],
}));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({
  route: async (request: Request) => {
    h.requests.push({ messages: request.messages.map(message => ({ ...message })), toolChoice: request.toolChoice });
    return h.script!(h.requests.length);
  },
}) }));

vi.mock('../agentic-loop.js', async importOriginal => {
  const real = await importOriginal<typeof import('../agentic-loop.js')>();
  return { ...real, budgetToolResultsForModel: (...args: Parameters<typeof real.budgetToolResultsForModel>) => {
    const result = real.budgetToolResultsForModel(...args);
    // Three <=8k fillers plus two one-character private results total exactly
    // 24k before the real host guard/settlement replaces either tiny result.
    const candidate = h.lateGrowth ? result.map(entry => entry.tool_use_id.startsWith('fill_')
      ? { ...entry, content: 'F'.repeat(entry.tool_use_id === 'fill_c' ? 7998 : 8000) } : entry) : result;
    h.lastCandidate = candidate.map(entry => ({ ...entry }));
    return candidate;
  } };
});
vi.mock('../read-receipts.js', async importOriginal => {
  const real = await importOriginal<typeof import('../read-receipts.js')>();
  return { ...real, settleReadReceipts: (...args: Parameters<typeof real.settleReadReceipts>) => {
    h.settlements++;
    return real.settleReadReceipts(...args);
  } };
});
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
vi.mock('../source-read-receipt.js', async importOriginal => {
  const real = await importOriginal<typeof import('../source-read-receipt.js')>();
  const fixture = (await vaultModule()).receiptHelperMock();
  return { ...real, ...fixture, writeGuardedReadReceipt: async (...args: Parameters<typeof fixture.writeGuardedReadReceipt>) => {
    const receipt = args[0];
    h.writerAttempts.push(receipt.documentId);
    if (h.settlementRefusal && receipt.documentId.endsWith('032')) throw new real.SourceReadSnapshotError();
    return fixture.writeGuardedReadReceipt(...args);
  } };
});
vi.mock('../document-tools-shared.js', async importOriginal =>
  (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../db/tenantStore.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor.js';
import { deferReadReceipt } from '../read-receipts.js';
import { addDocument, parsed, prose, receiptsFor, resetVault, resultsSentIn } from './support/read-delivery-vault.js';

const CONTEXT: ToolContext = { organizationId: 42, userId: 7, sqlClient: { query: async () => ({ rows: [] }) } };
const DOC_A = '10000000-0000-4000-8000-000000000031';
const DOC_B = '10000000-0000-4000-8000-000000000032';
const SOURCE = 'SOURCE_A';
const CODE = 'ANA_TOOL_RESULT_BUDGET_EXCEEDED';
const MESSAGE = 'This tool round could not be passed to the assistant within its result limit. Some actions or source receipts may already exist; inspect the current state before repeating them.';
const call = (id: string, name = 'search_literature', input: Record<string, unknown> = {}): Call => ({ id, name, input });
const response = (toolUses: Call[] = []): Response => ({ content: toolUses.length ? 'Investigating.' : 'Done.', toolUses,
  usage: {}, provider: 'test', model: 'test-model', requestId: 'request' });
const run = (options: AgenticOptions = {}) => executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'Inspect the evidence.' }], maxTokens: 512 }, {
  toolContext: CONTEXT, progressExtension: 0, ...options,
});
const failureOf = async (options: AgenticOptions = {}) => run(options).then(() => null, (error: unknown) => error);
const sent = () => resultsSentIn(h.requests[1]?.messages ?? []);
const sum = (values: Iterable<string>) => [...values].reduce((total, body) => total + body.length, 0);
const lateCalls = () => [call('read_a', 'search_literature', { documentId: DOC_A }),
  call('read_b', 'search_literature', { documentId: DOC_B }), call('fill_a'), call('fill_b'), call('fill_c')];

beforeEach(() => {
  resetVault();
  h.requests = [];
  h.script = current => current === 1 ? response([call('ordinary')]) : response();
  h.lateGrowth = false;
  h.settlementRefusal = false;
  h.settlements = 0;
  h.writerAttempts = [];
  h.lastCandidate = [];
  registerToolHandler('search_document_passages', async () => JSON.stringify({ ok: true, passages: [{ text: 'P'.repeat(7400) }] }));
  // Deliberately tiny private payloads exercise replacement growth. The
  // real reader is used separately below; these are not reader-shape claims.
  registerToolHandler('search_literature', async (input, ctx) => {
    if (!input.documentId) return String(input.result ?? 'ordinary result');
    const documentId = String(input.documentId);
    const contentHash = createHash('sha256').update(SOURCE).digest('hex');
    const result = documentId === DOC_A ? 'A' : 'B';
    const span = { start: 0, end: SOURCE.length };
    if (!deferReadReceipt(ctx, { documentId, contentHash, span, readBy: 7, result,
      sourceSnapshot: { organizationId: 42, userId: 7, programId: '90000000-0000-4000-8000-000000000001',
        documentId, contentHash, extractedTextSha256: contentHash, totalChars: SOURCE.length, span } })) {
      throw new Error('Synthetic private deferral failed');
    }
    return result;
  });
});

describe('strict raw-body admission through the actual classic host', () => {
  it('bounds a floor-overflowing ordinary round while preserving every call, raw callback and exact staged body', async () => {
    const raw = 'PRIVATE_RAW_ONLY_' + 'x'.repeat(9000) + '_TAIL';
    const calls = Array.from({ length: 20 }, (_, i) => call(`ordinary_${i}`, 'search_literature', { result: raw }));
    h.script = current => current === 1 ? response(calls) : response();
    const observed: ToolResultEntry[][] = [];
    const rawResults: string[] = [];
    await run({ onToolExecution: (_name, _input, result) => { rawResults.push(result); },
      onToolResultsForModel: entries => { observed.push(entries.map(entry => ({ ...entry }))); } });

    expect.soft(h.requests).toHaveLength(2);
    expect.soft(rawResults).toEqual(calls.map(() => raw));
    expect.soft([...sent().keys()]).toEqual(calls.map(item => item.id));
    expect.soft(sum(sent().values())).toBeLessThanOrEqual(24000);
    expect.soft(observed).toEqual([calls.map(item => ({ tool_use_id: item.id, name: item.name, content: sent().get(item.id) }))]);
    const withheld = [...sent().values()].filter(body => parsed(body)?.code === 'TOOL_RESULT_WITHHELD');
    expect.soft(withheld.length).toBeGreaterThan(0);
    for (const body of withheld) {
      expect.soft(parsed(body)).toMatchObject({ delivered: false, code: 'TOOL_RESULT_WITHHELD' });
      expect.soft(body).not.toContain('PRIVATE_RAW_ONLY');
      expect.soft(body).toMatch(/inspect/i);
    }
  });

  it('stages accepted large-payload cap bytes exactly, without a second cap after allocation', async () => {
    const raw = 'HEAD_' + 'x'.repeat(10_000_000) + '_TAIL';
    h.script = current => current === 1 ? response([call('ordinary', 'search_literature', { result: raw })]) : response();
    await run();
    expect(h.lastCandidate).toHaveLength(1);
    expect(sent().get('ordinary')).toBe(h.lastCandidate[0].content);
    expect(sum(sent().values())).toBeLessThanOrEqual(24000);
  });

  it('refuses an irreducible passage count before settlement, staging or another gateway call, though tools ran', async () => {
    addDocument(DOC_A, prose(3000));
    const calls = [...Array.from({ length: 160 }, (_, i) => call(`passage_${i}`, 'search_document_passages', { query: i })),
      call('read', 'read_project_document', { document_id: DOC_A })];
    h.script = current => current === 1 ? response(calls) : response();
    const observer = vi.fn();
    const raw = vi.fn();
    const error = await failureOf({ onToolResultsForModel: observer, onToolExecution: raw });
    expect.soft(error).toMatchObject({ code: CODE, message: MESSAGE });
    expect.soft(raw).toHaveBeenCalledTimes(calls.length);
    expect.soft(h.requests).toHaveLength(1);
    expect.soft(observer).not.toHaveBeenCalled();
    expect.soft(h.settlements).toBe(0);
    expect.soft(h.writerAttempts).toEqual([]);
    expect.soft(receiptsFor(DOC_A)).toEqual([]);
  });

  it('rejects late guard growth before staging and retains a prior successful receipt honestly', async () => {
    addDocument(DOC_A, SOURCE);
    addDocument(DOC_B, SOURCE);
    h.lateGrowth = true;
    h.script = current => current === 1 ? response(lateCalls()) : response();
    const observer = vi.fn();
    const error = await failureOf({ onToolResultsForModel: observer,
      onToolExecution: (_name, input) => { if (input.documentId === DOC_B) addDocument(DOC_B, 'CHANGED_'); } });
    expect.soft(sum(h.lastCandidate.map(entry => entry.content))).toBe(24000);
    expect.soft(error).toMatchObject({ code: CODE, message: MESSAGE });
    expect.soft(h.requests).toHaveLength(1);
    expect.soft(observer).not.toHaveBeenCalled();
    expect.soft(h.settlements).toBe(1);
    expect.soft(h.writerAttempts).toEqual([DOC_A]);
    expect.soft(receiptsFor(DOC_A)).toEqual([{ start: 0, end: SOURCE.length }]);
    expect.soft(receiptsFor(DOC_B)).toEqual([]);
  });

  it('rejects settlement-withdrawal growth without claiming rollback of an earlier written receipt', async () => {
    addDocument(DOC_A, SOURCE);
    addDocument(DOC_B, SOURCE);
    h.lateGrowth = true;
    h.settlementRefusal = true;
    h.script = current => current === 1 ? response(lateCalls()) : response();
    const observer = vi.fn();
    const error = await failureOf({ onToolResultsForModel: observer });
    expect.soft(sum(h.lastCandidate.map(entry => entry.content))).toBe(24000);
    expect.soft(error).toMatchObject({ code: CODE, message: MESSAGE });
    expect.soft(h.requests).toHaveLength(1);
    expect.soft(observer).not.toHaveBeenCalled();
    expect.soft(h.settlements).toBe(1);
    expect.soft(h.writerAttempts).toEqual([DOC_A, DOC_B]);
    expect.soft(receiptsFor(DOC_A)).toEqual([{ start: 0, end: SOURCE.length }]);
    expect.soft(receiptsFor(DOC_B)).toEqual([]);
  });

  it('bounds redirected checkpoint rounds at staging even though executeTools and every handler were bypassed', async () => {
    const calls = Array.from({ length: 160 }, (_, i) => call(`redirected_${i}`));
    h.script = current => current === 1 ? response(calls) : response();
    const observer = vi.fn();
    const raw = vi.fn();
    const error = await failureOf({ checkpoint: async () => 'replan', onToolResultsForModel: observer, onToolExecution: raw });
    expect.soft(error).toMatchObject({ code: CODE, message: MESSAGE });
    expect.soft(h.requests).toHaveLength(1);
    expect.soft(observer).not.toHaveBeenCalled();
    expect.soft(raw).not.toHaveBeenCalled();
    expect.soft(h.lastCandidate).toEqual([]);
    expect.soft(h.settlements).toBe(0);
  });

  it('CONTROL: a fitting native read remains exact and writes its existing legacy receipt', async () => {
    addDocument(DOC_A, prose(3000));
    h.script = current => current === 1 ? response([call('read', 'read_project_document', { document_id: DOC_A })]) : response();
    let raw = '';
    await run({ onToolExecution: (_name, _input, result) => { raw = result; } });
    expect(sent().get('read')).toBe(raw);
    expect(parsed(raw)?.window).toMatchObject({ start: 0, end: 3000 });
    expect(receiptsFor(DOC_A)).toEqual([{ start: 0, end: 3000 }]);
    expect(h.writerAttempts).toEqual([DOC_A]);
    expect(h.requests).toHaveLength(2);
  });
});
