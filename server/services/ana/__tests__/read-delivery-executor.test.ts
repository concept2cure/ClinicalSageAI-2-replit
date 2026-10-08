/**
 * Reads deliver what they record, through executeAgenticLoop (ANA-SUMMARY S1,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5; evidence in
 * docs/evidence/ANA-SUMMARY/2026-10-08/S1-reads/).
 *
 * The defect: read_project_document served a 30,000-character window and wrote
 * a receipt for all of it, while the model is fed at most 8,000 characters of a
 * result (head and tail, middle cut), and less when a round runs over 24,000.
 * Coverage, and catalog_project_document's gate, then passed on text AnA never
 * received, and the next offset skipped the cut middle.
 *
 * Driven through the real loop host (AnaToolExecutor.executeAgenticLoop) with
 * the real read and catalog handlers and the real round budget. Only the model
 * (a scripted gateway) and the database (an in-memory Vault applying the real
 * coverage rules) are stood in for. "What the model received" is read off the
 * gateway's own copy of each request.
 *
 * The four cases the design names as red before the fix, plus a control: a
 * read that does reach the model whole still completes coverage and lets the
 * catalog write through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

type Script = (messages: Array<{ role: string; content: unknown }>, call: number) => any;
const gateway = vi.hoisted(() => ({ requests: [] as Array<Array<{ role: string; content: unknown }>>, script: null as null | Script }));

vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (req: any) => {
      gateway.requests.push([...req.messages]);
      return gateway.script!(req.messages, gateway.requests.length);
    },
  }),
}));

const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));
vi.mock('../../vault/document-catalog.service.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await vaultModule()).serviceMock(),
}));
vi.mock('../document-tools-shared.js', async importOriginal => (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()));
vi.mock('../../../db/tenantStore.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../db/tenantStore.js')>()),
  getTenantScope: () => ({ tenantId: '42', role: 'member', source: 'request' }),
}));

import { executeAgenticLoop } from '../AnaToolExecutor';
import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { addDocument, parsed, plant, prose, receiptsFor, resetVault, resultsSentIn } from './support/read-delivery-vault.js';

const ORG: ToolContext = { organizationId: 42, userId: 7 };
const RESULT_BUDGET = 5000;
const NOT_DELIVERED = (readAgainFrom: number) =>
  JSON.stringify({ delivered: false, reason: 'This round returned more than can be read at once.', readAgainFrom });

/* The catalog write is a governed change a person confirms (class 'confirm'),
   so it is called the way the governed-action route calls it, after the turn —
   the handler itself, with the coverage the turn's reads left behind. */
const raw = new Map<string, (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => raw.set(name, fn));
const catalog = async (documentId: string) =>
  JSON.parse(
    await raw.get('catalog_project_document')!(
      { document_id: documentId, document_kind: 'Stability report', purpose: 'Shelf life.', summary: 'Twelve-month data.' },
      ORG,
    ),
  );

const read = (id: string, input: Record<string, unknown>) => ({ id, name: 'read_project_document', input });
const tools = (toolUses: unknown[]) => ({ content: '', toolUses, usage: {}, provider: 'p', model: 'm', requestId: 'r' });
const answer = () => ({ content: 'Done.', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'r' });

/** Every result the model was sent this turn, by tool-use id. */
function sentThisTurn(): Map<string, string> {
  const all = new Map<string, string>();
  for (const messages of gateway.requests) for (const [id, body] of resultsSentIn(messages)) all.set(id, body);
  return all;
}

/**
 * A model that reads the way the result tells it to: on from where coverage
 * says to continue, again from `readAgainFrom` when a read was not delivered,
 * and stops when the read is complete or it cannot make sense of the result.
 */
function follower(documentId: string, maxReads: number): Script {
  return (messages, call) => {
    if (call === 1) return tools([read('rd1', { document_id: documentId })]);
    if (call > maxReads) return answer();
    const last = parsed(resultsSentIn(messages).get(`rd${call - 1}`));
    if (!last) return answer();
    if (last.delivered === false) return tools([read(`rd${call}`, { document_id: documentId, offset: last.readAgainFrom })]);
    const next = /Continue with offset=(\d+)/.exec(String(last.message ?? ''));
    if (last.ok !== true || last.coverage?.complete || !next) return answer();
    return tools([read(`rd${call}`, { document_id: documentId, offset: Number(next[1]) })]);
  };
}

/** The document as the model received it: each delivered window placed at its offsets. */
function receivedText(documentId: string): Array<string | undefined> {
  const chars: Array<string | undefined> = [];
  for (const body of sentThisTurn().values()) {
    const r = parsed(body);
    if (r?.ok !== true || r.documentId !== documentId) continue;
    [...String(r.window.text)].forEach((c, k) => (chars[r.window.start + k] = c));
  }
  return chars;
}

beforeEach(() => {
  resetVault();
  gateway.requests = [];
  gateway.script = null;
});

describe('read_project_document through executeAgenticLoop', () => {
  it('1. a default read of a 60,000-character document fits RESULT_BUDGET, and its receipt is the window the model received', async () => {
    const DOC = 'doc-60k';
    addDocument(DOC, prose(60_000));
    let handlerResult = '';
    gateway.script = (_m, call) => (call === 1 ? tools([read('rd1', { document_id: DOC })]) : answer());

    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'read it' }], maxTokens: 512 } as any, {
      toolContext: ORG,
      onToolExecution: (_name, _input, result) => (handlerResult = result),
    });

    const sent = sentThisTurn().get('rd1');
    const window = parsed(sent)?.window;
    expect.soft(handlerResult.length, 'the serialized result').toBeLessThanOrEqual(RESULT_BUDGET);
    expect.soft(sent, 'the model received the result unchanged').toBe(handlerResult);
    expect.soft(window, 'the result the model received carries its window').toBeTruthy();
    expect.soft(receiptsFor(DOC), 'the receipt is exactly that window').toEqual(window ? [{ start: window.start, end: window.end }] : []);
    if (window) expect.soft(window.text.length).toBe(window.end - window.start);
  });

  it('2. a round of six reads over the round budget: no read is cut; each one past the budget is "read again from" with no receipt', async () => {
    const docs = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
    docs.forEach(id => addDocument(id, prose(20_000, id)));
    const offsets = [0, 0, 0, 0, 2000, 3000];
    gateway.script = (_m, call) =>
      call === 1 ? tools(docs.map((id, k) => read(`rd${k + 1}`, { document_id: id, offset: offsets[k] }))) : answer();

    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'read all six' }], maxTokens: 512 } as any, {
      toolContext: ORG,
    });

    const sent = sentThisTurn();
    for (const [k, id] of docs.entries()) {
      const body = sent.get(`rd${k + 1}`) ?? '';
      expect.soft(body, `read ${k + 1} is never head/tail cut`).not.toContain('truncated to fit the model context');
      const r = parsed(body);
      if (k < 4) {
        expect.soft(r?.ok, `read ${k + 1} is delivered whole`).toBe(true);
        expect.soft(receiptsFor(id), `read ${k + 1}'s receipt is its window`).toEqual(r?.window ? [{ start: r.window.start, end: r.window.end }] : ['a delivered window']);
      } else {
        expect.soft(body, `read ${k + 1} is past the budget`).toBe(NOT_DELIVERED(offsets[k]));
        expect.soft(receiptsFor(id), `read ${k + 1} has no receipt`).toEqual([]);
      }
    }
  });

  it('3. catalog_project_document refuses after a read whose text never reached the model whole', async () => {
    const DOC = 'doc-30k';
    addDocument(DOC, prose(30_000));
    gateway.script = (_m, call) => (call === 1 ? tools([read('rd1', { document_id: DOC })]) : answer());

    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'catalog it' }], maxTokens: 512 } as any, {
      toolContext: ORG,
    });

    const out = await catalog(DOC);
    expect(out.ok, JSON.stringify(out).slice(0, 300)).toBe(false);
    expect(out.refused).toBe(true);
    expect(out.reason).toMatch(/only \d+ of 30000 characters/);
  });

  it('3b. control: reads that each continue where the last left off, all delivered whole, let the catalog write through', async () => {
    const DOC = 'doc-12k';
    addDocument(DOC, prose(12_000));
    gateway.script = follower(DOC, 12);

    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'read it all' }], maxTokens: 512 } as any, {
      toolContext: ORG,
      maxRounds: 12,
    });

    const spans = receiptsFor(DOC);
    expect(spans.length, 'several reads, not one').toBeGreaterThan(1);
    spans.slice(1).forEach((s, k) => expect(s.start, 'each read starts where the last ended').toBe(spans[k].end));
    expect(spans[spans.length - 1].end).toBe(12_000);
    expect((await catalog(DOC)).ok).toBe(true);
  });

  it('4. a sentence planted at 6,000–7,000 of a 40,000-character document is in what the model received whenever a receipt covers it', async () => {
    const DOC = 'doc-40k';
    const SENTENCE = '4.7 PHOTOSTABILITY OF BATCH ZX-9917: no degradant above 0.05% after 1.2 million lux hours. '.repeat(11).slice(0, 1000);
    addDocument(DOC, plant(prose(40_000), SENTENCE, 6000));
    gateway.script = follower(DOC, 6);

    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'read it' }], maxTokens: 512 } as any, {
      toolContext: ORG,
      maxRounds: 8,
    });

    const covering = receiptsFor(DOC).filter(s => s.start < 7000 && s.end > 6000);
    expect(covering.length, 'a receipt covers the planted span (else this case proves nothing)').toBeGreaterThan(0);
    const received = receivedText(DOC);
    expect(received.slice(6000, 7000).join(''), 'the planted sentence reached the model').toBe(SENTENCE);
    for (const s of receiptsFor(DOC)) {
      let gaps = 0;
      for (let i = s.start; i < s.end; i++) if (received[i] === undefined) gaps++;
      expect(gaps, `receipt ${s.start}–${s.end} covers only text the model received`).toBe(0);
    }
  });
});
