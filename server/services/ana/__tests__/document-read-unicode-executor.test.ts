/**
 * Real registered reads, executor budgeting/settlement and copied gateway request
 * bodies. The existing in-memory Vault supplies synthetic source admission and
 * legacy receipt storage: this proves host dispatch, not SQL/RLS or live delivery.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgenticOptions, ToolContext } from '../AnaToolExecutor.js';

type Message = { role: string; content: unknown };
type Call = { id: string; name: string; input: Record<string, unknown> };
type Response = { content: string; toolUses: Call[]; usage: object; provider: string; model: string; requestId: string };
type Script = (messages: Message[], call: number) => Response;
const h = vi.hoisted(() => ({ requests: [] as Message[][], script: null as Script | null }));
const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));

vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({
  route: async (request: { messages: Message[] }) => {
    const messages = request.messages.map(message => ({ ...message }));
    h.requests.push(messages);
    if (!h.script) throw new Error('Unicode executor gateway script is missing');
    return h.script(messages, h.requests.length);
  },
}) }));
vi.mock('../catalog-scope.js', async original =>
  (await vaultModule()).catalogScopeMock(await original<Record<string, unknown>>()),
);
vi.mock('../../c2c/current-program-access.js', async original =>
  (await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await original<Record<string, unknown>>()),
);
vi.mock('../../vault/document-catalog.service.js', async original => ({
  ...await original<Record<string, unknown>>(), ...(await vaultModule()).serviceMock(),
}));
vi.mock('../source-read-receipt.js', async original => ({
  ...await original<Record<string, unknown>>(), ...(await vaultModule()).receiptHelperMock(),
}));
vi.mock('../document-tools-shared.js', async original =>
  (await vaultModule()).gatesMock(await original<Record<string, unknown>>()),
);
vi.mock('../../../db/tenantStore.js', async original => ({
  ...await original<typeof import('../../../db/tenantStore.js')>(),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));

import { executeAgenticLoop } from '../AnaToolExecutor';
import { RESULT_BUDGET } from '../agentic-loop.js';
import { addDocument, receiptsFor, resetVault, resultsSentIn } from './support/read-delivery-vault.js';

interface Window { start: number; end: number; text: string }
interface ReadPayload {
  ok?: boolean;
  documentId?: string;
  totalChars?: number;
  window?: Window;
  delivered?: boolean;
  readAgainFrom?: number;
}
const DOC = '10000000-0000-4000-8000-000000000091';
const ORG: ToolContext = { organizationId: 42, userId: 7, sqlClient: { query: async () => ({ rows: [] }) } };
const read = (id: string, documentId: string, input: Record<string, unknown> = {}): Call =>
  ({ id, name: 'read_project_document', input: { document_id: documentId, ...input } });
const response = (toolUses: Call[] = []): Response =>
  ({ content: toolUses.length ? '' : 'Done.', toolUses, usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'unicode-executor' });
const run = (options: AgenticOptions = {}) => executeAgenticLoop({
  taskType: 'chat', messages: [{ role: 'user', content: 'Read the saved source.' }], maxTokens: 512,
}, { toolContext: ORG, ...options });

function sent(): Map<string, string> {
  const all = new Map<string, string>();
  for (const request of h.requests) for (const [id, body] of resultsSentIn(request)) all.set(id, body);
  return all;
}

function delivered(id: string): { body: string; payload: ReadPayload; window: Window } {
  const body = sent().get(id);
  if (body === undefined) throw new Error(`No host-dispatched result for ${id}`);
  const payload = JSON.parse(body) as ReadPayload;
  expect(payload.ok).toBe(true);
  if (!payload.window) throw new Error(`Missing source window for ${id}`);
  return { body, payload, window: payload.window };
}

function expectExact(source: string, window: Window): void {
  expect(window.text).toBe(source.slice(window.start, window.end));
  expect(window.text.length).toBe(window.end - window.start);
  expect(Buffer.from(window.text, 'utf8').toString('utf8')).toBe(window.text);
}

function oneRead(input: Record<string, unknown>): void {
  h.script = (_messages, call) => call === 1 ? response([read('read1', DOC, input)]) : response();
}

beforeEach(() => {
  resetVault();
  h.requests = [];
  h.script = null;
});

describe('executor dispatches intact Unicode windows and exact synthetic receipts', () => {
  it('moves a requested low-surrogate start backward and settles the dispatched actual span', async () => {
    const source = 'A🧬B';
    addDocument(DOC, source);
    oneRead({ offset: 2, max_chars: 1 });
    let raw = '';
    await run({ onToolExecution: (_name, _input, result) => { raw = result; } });
    const { body, payload, window } = delivered('read1');
    expect(body).toBe(raw);
    expect(window).toEqual({ start: 1, end: 3, text: '🧬' });
    expect(payload.totalChars).toBe(4);
    expectExact(source, window);
    expect(receiptsFor(DOC)).toEqual([{ start: 1, end: 3 }]);
  });

  it('takes a complete two-unit character for max_chars1 and records the actual end', async () => {
    const source = 'A𠮷B';
    addDocument(DOC, source);
    oneRead({ offset: 1, max_chars: 1 });
    await run();
    const { window } = delivered('read1');
    expect(window).toEqual({ start: 1, end: 3, text: '𠮷' });
    expectExact(source, window);
    expect(receiptsFor(DOC)).toEqual([{ start: 1, end: 3 }]);
  });

  it('moves a split end inward and settles only the complete prefix', async () => {
    addDocument(DOC, 'A🧬B');
    oneRead({ max_chars: 2 });
    await run();
    expect(delivered('read1').window).toEqual({ start: 0, end: 1, text: 'A' });
    expect(receiptsFor(DOC)).toEqual([{ start: 0, end: 1 }]);
  });

  it('keeps an ordinary budget-shrunk scientific window intact and byte-identical at dispatch', async () => {
    const source = '日本🧬𠮷𝛼\r\n'.repeat(2500);
    addDocument(DOC, source);
    oneRead({ max_chars: 80_000 });
    let raw = '';
    await run({ onToolExecution: (_name, _input, result) => { raw = result; } });
    const { body, window } = delivered('read1');
    expect(body).toBe(raw);
    expect(body.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(window.end).toBeLessThan(source.length);
    expectExact(source, window);
    expect(receiptsFor(DOC)).toEqual([{ start: window.start, end: window.end }]);
  });
});

describe('executor Unicode continuation and unchanged host withholding', () => {
  it('walks by actual ends at max_chars1 without gaps, split characters or code-point offset substitution', async () => {
    const source = '𠮷🧬A𝛼B';
    addDocument(DOC, source);
    h.script = (messages, call) => {
      if (call === 1) return response([read('walk1', DOC, { max_chars: 1 })]);
      const previous = resultsSentIn(messages).get(`walk${call - 1}`);
      if (!previous) return response();
      const payload = JSON.parse(previous) as ReadPayload;
      if (!payload.window || payload.window.end >= source.length) return response();
      return response([read(`walk${call}`, DOC, { offset: payload.window.end, max_chars: 1 })]);
    };
    await run({ maxRounds: 12 });
    const windows = [...sent().keys()].map(id => delivered(id).window);
    let cursor = 0;
    const codeUnits: string[] = [];
    for (const window of windows) {
      expect(window.start).toBe(cursor);
      expect(window.end).toBeGreaterThan(cursor);
      expectExact(source, window);
      codeUnits.push(...window.text.split(''));
      cursor = window.end;
    }
    expect(cursor).toBe(source.length);
    expect(codeUnits.join('')).toBe(source);
    expect(receiptsFor(DOC)).toEqual(windows.map(({ start, end }) => ({ start, end })));
  });

  it('uses the normalized safe start when round allocation withholds later reads', async () => {
    const docs = Array.from({ length: 6 }, (_, index) => `20000000-0000-4000-8000-00000000009${index}`);
    const source = 'A🧬' + 'z'.repeat(20_000);
    docs.forEach(id => addDocument(id, source));
    h.script = (_messages, call) => call === 1
      ? response(docs.map((id, index) => read(`round${index}`, id, { offset: index >= 4 ? 2 : 0 }))) : response();
    await run();
    for (let index = 0; index < 4; index++) {
      const { window } = delivered(`round${index}`);
      expectExact(source, window);
      expect(receiptsFor(docs[index])).toEqual([{ start: window.start, end: window.end }]);
    }
    for (let index = 4; index < 6; index++) {
      expect(JSON.parse(sent().get(`round${index}`)!)).toMatchObject({ delivered: false, readAgainFrom: 1 });
      expect(receiptsFor(docs[index])).toEqual([]);
    }
  });

  it('withholds a minimum envelope above the host ceiling without settling its proposed Unicode span', async () => {
    addDocument(DOC, 'A🧬B', { extractionMethod: 'x'.repeat(9000) });
    oneRead({ offset: 2, max_chars: 1 });
    let raw = '';
    await run({ onToolExecution: (_name, _input, result) => { raw = result; } });
    expect(raw.length).toBeGreaterThan(8000);
    expect((JSON.parse(raw) as ReadPayload).window).toEqual({ start: 1, end: 3, text: '🧬' });
    expect(JSON.parse(sent().get('read1')!)).toMatchObject({ delivered: false, readAgainFrom: 1 });
    expect(receiptsFor(DOC)).toEqual([]);
  });

  it('preserves exact ASCII and BMP windows with no optional observer', async () => {
    for (const source of ['ABCDEFGH', '日本語αβγδε']) {
      resetVault();
      h.requests = [];
      addDocument(DOC, source);
      oneRead({ offset: 1, max_chars: 3 });
      await run();
      const { window } = delivered('read1');
      expect(window).toEqual({ start: 1, end: 4, text: source.slice(1, 4) });
      expect(receiptsFor(DOC)).toEqual([{ start: 1, end: 4 }]);
    }
  });
});
