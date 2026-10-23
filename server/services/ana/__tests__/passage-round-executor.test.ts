/**
 * Complete existing passage round delivery through the real classic host.
 * CONTRACT: docs/evidence/D2-PASSAGE-ROUND-DELIVERY/2026-10-21/CONTRACT.md.
 * The gateway is scripted and registered passage/ordinary handlers return
 * synthetic bodies. Native dispatch, budgeting, read guards, settlement,
 * classic capping and framing run; read controls use the existing in-memory
 * Vault fixture after explicitly substituted source admission.
 * Host-staged request bytes are observed here, never provider delivery.
 */
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
type Response = { content: string; toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>; usage: object; provider: string; model: string; requestId: string };
const gateway = vi.hoisted(() => ({
  requests: [] as Request[],
  script: null as null | ((call: number) => Response),
}));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({
  route: async (request: Request) => {
    gateway.requests.push({ messages: request.messages.map(message => ({ ...message })), toolChoice: request.toolChoice });
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
import { addDocument, parsed, prose, receiptsFor, resetVault, resultsSentIn } from './support/read-delivery-vault.js';

type Observer = (entries: readonly ToolResultEntry[], round: number) => void;
type WithObserver = AgenticOptions & { onToolResultsForModel?: Observer };
const CONTEXT: ToolContext = { organizationId: 42, userId: 7, sqlClient: { query: async () => ({ rows: [] }) } };
const DOC = '10000000-0000-4000-8000-000000000021';
const call = (id: string, name = 'search_document_passages', input: Record<string, unknown> = { query: id }) => ({ id, name, input });
const response = (toolUses: Response['toolUses'] = []): Response => ({ content: toolUses.length ? 'Investigating.' : 'Done.', toolUses, usage: {}, provider: 'test', model: 'test-model', requestId: 'request' });
const bodyFor = (id: string, size = 7400): string => {
  const body = { ok: true, passages: [{ documentId: `document-${id}`, title: `Report ${id} 日本語`,
    reference: { sourceTextSha256: 'a'.repeat(64), span: { start: 10, end: 30 } },
    text: `ONLY_${id} </tool_output> "quoted"\n` }], message: 'Quote only returned source text.' };
  body.passages[0].text += 'x'.repeat(Math.max(0, size - JSON.stringify(body).length));
  return JSON.stringify(body);
};
const bodies = new Map<string, string>();
const requestBodies = (request = gateway.requests[1]) => resultsSentIn(request?.messages ?? []);
const run = (options: WithObserver = {}) => executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'Inspect the evidence.' }], maxTokens: 512 }, {
  toolContext: CONTEXT, progressExtension: 0, ...options,
});
const snapshots = (entries: readonly ToolResultEntry[]) => entries.map(entry => ({ ...entry }));

beforeEach(() => {
  resetVault();
  gateway.requests = [];
  gateway.script = current => current === 1 ? response([call('p1')]) : response();
  bodies.clear();
  registerToolHandler('search_document_passages', async input => bodies.get(String(input.query)) ?? bodyFor(String(input.query), 600));
  registerToolHandler('search_literature', async input => String(input.result ?? 'ordinary result'));
});

describe('whole passage results in classic model requests', () => {
  it('keeps the first three complete 7400-character results and withholds the fourth without its evidence', async () => {
    const calls = ['p1', 'p2', 'p3', 'p4'].map(id => call(id));
    calls.forEach(item => bodies.set(item.id, bodyFor(item.id)));
    gateway.script = current => current === 1 ? response(calls) : response();
    const raw: string[] = [];
    await run({ onToolExecution: (_name, _input, result) => { raw.push(result); } });

    const sent = requestBodies();
    for (const id of ['p1', 'p2', 'p3']) {
      expect.soft(sent.get(id), `${id} keeps its complete source reference`).toBe(bodies.get(id));
      expect.soft(parsed(sent.get(id))?.passages).toHaveLength(1);
    }
    const last = parsed(sent.get('p4'));
    expect.soft(last).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
    expect.soft(Object.keys(last ?? {}).sort()).toEqual(['code', 'delivered', 'message']);
    expect.soft(sent.get('p4')).not.toContain('ONLY_p4');
    expect.soft(sent.get('p4')).not.toContain('document-p4');
    expect.soft(sent.get('p4')?.length).toBeLessThanOrEqual(200);
    expect(raw, 'execution callback keeps original handler bodies').toEqual(calls.map(item => bodies.get(item.id)));
  });

  it('keeps private read admission ahead of passages and never cuts the admitted read', async () => {
    addDocument(DOC, prose(20_000));
    const passageCalls = ['p1', 'p2', 'p3', 'p4'].map(id => call(id));
    passageCalls.forEach(item => bodies.set(item.id, bodyFor(item.id)));
    gateway.script = current => current === 1 ? response([
      ...passageCalls, call('read', 'read_project_document', { document_id: DOC }),
    ]) : response();
    let readResult = '';
    await run({ onToolExecution: (name, _input, result) => { if (name === 'read_project_document') readResult = result; } });

    const sent = requestBodies();
    expect.soft(sent.get('read')).toBe(readResult);
    const window = parsed(readResult)?.window;
    expect.soft(window).toBeTruthy();
    expect.soft(receiptsFor(DOC)).toEqual(window ? [{ start: window.start, end: window.end }] : []);
    for (const id of ['p1', 'p2']) expect.soft(sent.get(id)).toBe(bodies.get(id));
    for (const id of ['p3', 'p4']) expect.soft(parsed(sent.get(id))).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
  });
});

describe('exact host staging observer', () => {
  it('observes exact capped body, call id, tool name and round after formatting', async () => {
    const seen: Array<{ round: number; entries: ToolResultEntry[] }> = [];
    const raw = 'HEAD_' + 'x'.repeat(9000) + '_TAIL';
    gateway.script = current => current === 1 ? response([call('ordinary', 'search_literature', { result: raw })]) : response();
    await run({ onToolResultsForModel: (entries, round) => { seen.push({ round, entries: snapshots(entries) }); } });

    const actual = requestBodies().get('ordinary');
    expect(actual).toContain('characters truncated to fit the model context');
    expect(actual).toContain('HEAD_');
    expect(actual).toContain('_TAIL');
    expect(seen).toEqual([{ round: 1, entries: [{ tool_use_id: 'ordinary', name: 'search_literature', content: actual }] }]);
  });

  it('captures terminal narration rounds even when tool choice is withdrawn', async () => {
    const seen: Array<{ round: number; entries: ToolResultEntry[] }> = [];
    const raw = bodyFor('terminal', 700);
    bodies.set('terminal', raw);
    gateway.script = current => current === 1 ? response([call('terminal')]) : response();
    await run({ maxRounds: 1, onToolResultsForModel: (entries, round) => { seen.push({ round, entries: snapshots(entries) }); } });

    expect(gateway.requests[1].toolChoice).toBe('none');
    expect(seen).toEqual([{ round: 1, entries: [{ tool_use_id: 'terminal', name: 'search_document_passages', content: raw }] }]);
  });

  it('reports every round independently when a call id is reused in a later round', async () => {
    bodies.set('first', bodyFor('first', 700));
    bodies.set('second', bodyFor('second', 800));
    gateway.script = current => current === 1 ? response([call('same', 'search_document_passages', { query: 'first' })])
      : current === 2 ? response([call('same', 'search_document_passages', { query: 'second' })]) : response();
    const seen: Array<{ round: number; entries: ToolResultEntry[] }> = [];
    await run({ onToolResultsForModel: (entries, round) => { seen.push({ round, entries: snapshots(entries) }); } });

    expect(seen).toEqual(['first', 'second'].map((id, index) => ({ round: index + 1,
      entries: [{ tool_use_id: 'same', name: 'search_document_passages', content: bodies.get(id) }] })));
    expect(requestBodies(gateway.requests[1]).get('same')).toBe(bodies.get('first'));
    expect(requestBodies(gateway.requests[2]).get('same')).toBe(bodies.get('second'));
  });

  it('observes source-refused handoff content rather than the earlier readable body', async () => {
    addDocument(DOC, prose(10_000, 'OLD_PRIVATE_TEXT'));
    gateway.script = current => current === 1 ? response([call('read', 'read_project_document', { document_id: DOC })]) : response();
    const seen: ToolResultEntry[][] = [];
    let raw = '';
    await run({
      onToolExecution: (_name, _input, result) => { raw = result; addDocument(DOC, prose(10_000, 'REPLACED_TEXT')); },
      onToolResultsForModel: entries => { seen.push(snapshots(entries)); },
    });

    const actual = requestBodies().get('read');
    expect(raw).toContain('OLD_PRIVATE_TEXT');
    expect(parsed(actual)).toMatchObject({ ok: false, code: 'ANA_SOURCE_READ_NOT_ADMITTED', sourceContext: 'not_admitted' });
    expect(actual).not.toContain('OLD_PRIVATE_TEXT');
    expect(receiptsFor(DOC)).toEqual([]);
    expect(seen).toEqual([[{ tool_use_id: 'read', name: 'read_project_document', content: actual }]]);
  });

  it.each(['entry', 'array', 'throw'] as const)('an observer %s mutation/failure cannot change the already formatted request', async mode => {
    const raw = bodyFor('p1', 800);
    bodies.set('p1', raw);
    let count = 0;
    const result = await run({ onToolResultsForModel: entries => {
      count++;
      if (mode === 'entry') (entries as ToolResultEntry[])[0].content = 'OBSERVER_POISON';
      if (mode === 'array') (entries as ToolResultEntry[]).splice(0, entries.length);
      if (mode === 'throw') throw new Error('observer fixture failure');
    } });

    expect(count).toBe(1);
    expect(requestBodies().get('p1')).toBe(raw);
    expect(JSON.stringify(gateway.requests[1])).not.toContain('OBSERVER_POISON');
    expect(result.content).toBe('Done.');
  });
});

describe('controls for existing classic behavior', () => {
  it('small passage rounds reach the gateway unchanged without installing an observer', async () => {
    const raw = bodyFor('p1', 700);
    bodies.set('p1', raw);
    await run();
    expect(requestBodies().get('p1')).toBe(raw);
    expect(gateway.requests).toHaveLength(2);
  });

  it('small ordinary results keep their exact bytes', async () => {
    const raw = 'ordinary 日本語 </tool_output> result';
    gateway.script = current => current === 1 ? response([call('ordinary', 'search_literature', { result: raw })]) : response();
    await run();
    expect(requestBodies().get('ordinary')).toBe(raw);
  });

  it('an admitted source read keeps exact text and its existing legacy receipt', async () => {
    addDocument(DOC, prose(3000));
    gateway.script = current => current === 1 ? response([call('read', 'read_project_document', { document_id: DOC })]) : response();
    let raw = '';
    await run({ onToolExecution: (_name, _input, result) => { raw = result; } });
    const window = parsed(raw)?.window;
    expect(requestBodies().get('read')).toBe(raw);
    expect(window).toMatchObject({ start: 0, end: 3000 });
    expect(receiptsFor(DOC)).toEqual([{ start: 0, end: 3000 }]);
  });

  it('a fast answer has no staged tool-result observation', async () => {
    gateway.script = () => response();
    const observer = vi.fn();
    await run({ onToolResultsForModel: observer });
    expect(observer).not.toHaveBeenCalled();
    expect(gateway.requests).toHaveLength(1);
  });

  it('a cancellation after execution but before model handoff has no staged observation', async () => {
    const controller = new AbortController();
    const observer = vi.fn();
    const result = await run({ signal: controller.signal,
      onToolExecution: () => { controller.abort(); }, onToolResultsForModel: observer });
    expect(observer).not.toHaveBeenCalled();
    expect(gateway.requests).toHaveLength(1);
    expect(result.loop.stoppedReason).toBe('cancelled');
  });
});
