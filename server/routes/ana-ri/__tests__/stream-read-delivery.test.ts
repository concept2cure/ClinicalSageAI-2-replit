/**
 * Reads deliver what they record, through the streaming route (ANA-SUMMARY S1,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §5; evidence in
 * docs/evidence/ANA-SUMMARY/2026-10-08/S1-reads/).
 *
 * The same four cases as services/ana/__tests__/read-delivery-executor.test.ts,
 * driven through the other loop host: the SSE route a person's chat runs on.
 * The route, its agentic loop, its round budget and the real read and catalog
 * handlers run; the model is a scripted gateway that reads the way the results
 * tell it to, and the database is the in-memory Vault of
 * services/ana/__tests__/support/read-delivery-vault.ts, applying the real
 * coverage rules. "What the model received" is the gateway's own copy of each
 * request.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

type Step = Array<{ id: string; name: string; input: Record<string, unknown> }> | string;
type Script = (messages: Array<{ role: string; content: unknown }>, call: number) => Step;
const model = vi.hoisted(() => ({ requests: [] as Array<Array<{ role: string; content: unknown }>>, script: null as null | Script }));

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
const vaultModule = vi.hoisted(() => () => import('../../../services/ana/__tests__/support/read-delivery-vault.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
// The harness's gateway plays a fixed script; this one reads the results it is sent.
vi.mock('../shared.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureGateway: () => ({
    isDeterministic: () => false,
    getEnabledProviders: () => ['anthropic'],
    getModels: () => [],
    route: async (req: any) => {
      model.requests.push([...req.messages]);
      const step = model.script!(req.messages, model.requests.length);
      if (Array.isArray(step)) return { content: '', toolUses: step, model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
      req.onStream?.(step, undefined);
      return { content: step, toolUses: [], model: 'm', provider: 'p', usage: {}, latencyMs: 1 };
    },
  }),
}));
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
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
vi.mock('../../../services/vault/document-catalog.service.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await vaultModule()).serviceMock(),
}));
vi.mock('../../../services/ana/document-tools-shared.js', async importOriginal =>
  (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()),
);

import { mountStreamRoute } from '../stream.js';
import { runWithTenantScope } from '../../../db/tenantStore.js';
import { registerDocumentCatalogHandlers } from '../../../services/ana/document-catalog-tools.js';
import { harness as h, resetHarness, streamApp, turn } from './support/stream-route-harness.js';
import {
  addDocument,
  parsed,
  plant,
  prose,
  receiptsFor,
  resetVault,
  resultsSentIn,
} from '../../../services/ana/__tests__/support/read-delivery-vault.js';

const app = streamApp(mountStreamRoute);
const RESULT_BUDGET = 5000;
const NOT_DELIVERED = (readAgainFrom: number) =>
  JSON.stringify({ delivered: false, reason: 'This round returned more than can be read at once.', readAgainFrom });

const real = new Map<string, (input: Record<string, unknown>, ctx?: any) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => real.set(name, fn));

/** The governed-action route runs the catalog write after the turn, for a member of the organization. */
const catalog = async (documentId: string) =>
  JSON.parse(
    await runWithTenantScope({ tenantId: '7', role: 'member', source: 'test' }, () =>
      real.get('catalog_project_document')!(
        { document_id: documentId, document_kind: 'Stability report', purpose: 'Shelf life.', summary: 'Twelve-month data.' },
        { organizationId: 7, userId: 3, humanConfirmed: true },
      ),
    ),
  );

const read = (id: string, input: Record<string, unknown>) => ({ id, name: 'read_project_document', input });

function sentThisTurn(): Map<string, string> {
  const all = new Map<string, string>();
  for (const messages of model.requests) for (const [id, body] of resultsSentIn(messages)) all.set(id, body);
  return all;
}

/** A model that continues from where each result says, and stops when the read is complete. */
function follower(documentId: string, maxReads: number): Script {
  return (messages, call) => {
    if (call === 1) return [read('rd1', { document_id: documentId })];
    if (call > maxReads) return 'Done.';
    const last = parsed(resultsSentIn(messages).get(`rd${call - 1}`));
    if (!last) return 'Done.';
    if (last.delivered === false) return [read(`rd${call}`, { document_id: documentId, offset: last.readAgainFrom })];
    const next = /Continue with offset=(\d+)/.exec(String(last.message ?? ''));
    if (last.ok !== true || last.coverage?.complete || !next) return 'Done.';
    return [read(`rd${call}`, { document_id: documentId, offset: Number(next[1]) })];
  };
}

const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});

beforeEach(() => {
  resetHarness();
  resetVault();
  model.requests = [];
  model.script = null;
  h.handlers.read_project_document = real.get('read_project_document')!;
});

afterEach(() => {
  delete h.handlers.read_project_document;
  vi.restoreAllMocks();
});

describe('read_project_document through the stream route', () => {
  it('1. a default read of a 60,000-character document fits RESULT_BUDGET, and its receipt is the window the model received', async () => {
    addDocument('doc-60k', prose(60_000));
    model.script = (_m, call) => (call === 1 ? [read('rd1', { document_id: 'doc-60k' })] : 'Done.');

    const events = await turn(app, { message: 'read the stability report' });

    const sent = sentThisTurn().get('rd1');
    const window = parsed(sent)?.window;
    const streamed = events.find(e => e.type === 'tool_result' && e.toolUseId === 'rd1');
    expect.soft(streamed, 'the read ran').toBeTruthy();
    expect.soft(sent?.length ?? Infinity, 'what the model received fits RESULT_BUDGET').toBeLessThanOrEqual(RESULT_BUDGET);
    expect.soft(window, 'the result the model received carries its window').toBeTruthy();
    expect.soft(receiptsFor('doc-60k'), 'the receipt is exactly that window').toEqual(window ? [{ start: window.start, end: window.end }] : []);
  });

  it('2. six reads over the round budget: none is cut, and each past the budget is "read again from" with no receipt', async () => {
    const docs = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
    docs.forEach(id => addDocument(id, prose(20_000, id)));
    const offsets = [0, 0, 0, 0, 2000, 3000];
    model.script = (_m, call) => (call === 1 ? docs.map((id, k) => read(`rd${k + 1}`, { document_id: id, offset: offsets[k] })) : 'Done.');

    await turn(app, { message: 'read all six' });

    const sent = sentThisTurn();
    for (const [k, id] of docs.entries()) {
      const body = sent.get(`rd${k + 1}`) ?? '';
      expect.soft(body, `read ${k + 1} is never head/tail cut`).not.toContain('truncated to fit the model context');
      if (k < 4) {
        const r = parsed(body);
        expect.soft(r?.ok, `read ${k + 1} is delivered whole`).toBe(true);
        expect.soft(receiptsFor(id), `read ${k + 1}'s receipt is its window`).toEqual(r?.window ? [{ start: r.window.start, end: r.window.end }] : ['a delivered window']);
      } else {
        expect.soft(body, `read ${k + 1} is past the budget`).toBe(NOT_DELIVERED(offsets[k]));
        expect.soft(receiptsFor(id), `read ${k + 1} has no receipt`).toEqual([]);
      }
    }
  });

  it('3. catalog_project_document refuses after a read whose text never reached the model whole', async () => {
    addDocument('doc-30k', prose(30_000));
    model.script = (_m, call) => (call === 1 ? [read('rd1', { document_id: 'doc-30k' })] : 'Done.');

    await turn(app, { message: 'read and catalog it' });

    const out = await catalog('doc-30k');
    expect(out.ok, JSON.stringify(out).slice(0, 300)).toBe(false);
    expect(out.reason).toMatch(/only \d+ of 30000 characters/);
  });

  it('4. a sentence planted at 6,000–7,000 of 40,000 characters is in what the model received whenever a receipt covers it', async () => {
    const SENTENCE = '4.7 PHOTOSTABILITY OF BATCH ZX-9917: no degradant above 0.05% after 1.2 million lux hours. '.repeat(11).slice(0, 1000);
    addDocument('doc-40k', plant(prose(40_000), SENTENCE, 6000));
    model.script = follower('doc-40k', 6);

    await turn(app, { message: 'read it' });

    const received: Array<string | undefined> = [];
    for (const body of sentThisTurn().values()) {
      const r = parsed(body);
      if (r?.ok === true) [...String(r.window.text)].forEach((c, k) => (received[r.window.start + k] = c));
    }
    const covering = receiptsFor('doc-40k').filter(s => s.start < 7000 && s.end > 6000);
    expect(covering.length, 'a receipt covers the planted span (else this case proves nothing)').toBeGreaterThan(0);
    expect(received.slice(6000, 7000).join(''), 'the planted sentence reached the model').toBe(SENTENCE);
    for (const s of receiptsFor('doc-40k')) {
      let gaps = 0;
      for (let i = s.start; i < s.end; i++) if (received[i] === undefined) gaps++;
      expect(gaps, `receipt ${s.start}–${s.end} covers only text the model received`).toBe(0);
    }
  });
});
