/**
 * Actual mounted streaming route, registered read handler, host budgets and
 * settlement; scripted gateway requests capture host dispatch parameters.
 * Source admission/context and the receipt store are the existing synthetic
 * Vault fixture: this is not SQL/RLS, durable persistence or live-provider proof.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

type Step = Array<{ id: string; name: string; input: Record<string, unknown> }> | string;
type Script = (messages: Array<{ role: string; content: unknown }>, call: number) => Step;
const model = vi.hoisted(() => ({ requests: [] as Array<Array<{ role: string; content: unknown }>>, script: null as null | Script, beforeHandoff: null as null | (() => void | Promise<void>), writes: [] as Array<{ span: { start: number; end: number }; sourceSpan: { start: number; end: number }; result: string }> }));

const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
const vaultModule = vi.hoisted(() => () => import('../../../services/ana/__tests__/support/read-delivery-vault.js'));
// Delivery/receipt cases begin after actor admission; native and current-access
// suites prove that admission. Preserve the real conversation boundary.
vi.mock('../../../services/ana/catalog-scope.js', async importOriginal => ({
  ...(await vaultModule()).catalogScopeMock(await importOriginal<Record<string, unknown>>()),
}));
// This mounted fixture begins after current project admission. Native access
// and PostgreSQL controls verify actual admission; this seam keeps both scope
// checkpoints explicit while exercising the real budget and receipt handoff.
vi.mock('../../../services/c2c/current-program-access.js', async importOriginal =>
  (await import('../../../services/ana/__tests__/support/source-read-tool-fixture.js'))
    .syntheticProgramAccessMock(await importOriginal<Record<string, unknown>>()),
);
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
vi.mock('../../../services/ana/source-read-receipt.js', async importOriginal => {
  const helper = (await vaultModule()).receiptHelperMock({ organizationId: 7, userId: 3 });
  const seen = (receipt: any) => { model.writes.push({ span: { ...receipt.span }, sourceSpan: { ...receipt.sourceSnapshot.span }, result: receipt.result }); };
  return { ...(await importOriginal<Record<string, unknown>>()), ...helper,
    verifyDeferredReadReceipt: async (receipt: any) => { await model.beforeHandoff?.(); await helper.verifyDeferredReadReceipt(receipt); },
    writeGuardedLegacyReadReceipt: async (receipt: any) => { seen(receipt); await helper.writeGuardedLegacyReadReceipt(receipt); },
    writeGuardedReadReceipt: async (receipt: any) => { seen(receipt); await helper.writeGuardedReadReceipt(receipt); },
  };
});
vi.mock('../../../services/ana/document-tools-shared.js', async importOriginal =>
  (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()),
);

import { mountStreamRoute } from '../stream.js';
import { registerDocumentCatalogHandlers } from '../../../services/ana/document-catalog-tools.js';
import { RESULT_BUDGET } from '../../../services/ana/agentic-loop.js';
import { harness as h, resetHarness, streamApp, turn } from './support/stream-route-harness.js';
import { addDocument, parsed, receiptsFor, resetVault, resultsSentIn } from '../../../services/ana/__tests__/support/read-delivery-vault.js';

const app = streamApp(mountStreamRoute);
const DOC = '11111111-1111-4111-8111-000000000021';
const handlers = new Map<string, (input: Record<string, unknown>, ctx?: any) => Promise<string>>();
registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
const read = (id: string, input: Record<string, unknown>) => ({ id, name: 'read_project_document', input });

function sentThisTurn(): Map<string, string> {
  const sent = new Map<string, string>();
  for (const messages of model.requests) for (const [id, body] of resultsSentIn(messages)) sent.set(id, body);
  return sent;
}

function expectExactDelivery(source: string, id: string, expected: { start: number; end: number; text: string }): void {
  const body = sentThisTurn().get(id);
  const result = parsed(body);
  expect(result?.ok).toBe(true);
  expect(result?.window).toEqual(expected);
  expect(result?.totalChars).toBe(source.length);
  expect(expected.text).toBe(source.slice(expected.start, expected.end));
  expect(Buffer.from(expected.text, 'utf8').toString('utf8')).toBe(expected.text);
  expect(model.writes).toContainEqual({ span: { start: expected.start, end: expected.end },
    sourceSpan: { start: expected.start, end: expected.end }, result: body });
  expect(receiptsFor(DOC)).toContainEqual({ start: expected.start, end: expected.end });
}

beforeAll(() => { vi.stubEnv('ENTITLEMENTS_ENFORCE', 'off'); });
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => {
  resetHarness(); resetVault(); model.requests = []; model.script = null;
  model.beforeHandoff = null; model.writes = [];
  h.handlers.read_project_document = handlers.get('read_project_document')!;
});
afterEach(() => { delete h.handlers.read_project_document; vi.restoreAllMocks(); });

describe('streamed Unicode reads retain the exact delivered span', () => {
  it.each([
    [0, 2, { start: 0, end: 1, text: 'A' }],
    [1, 1, { start: 1, end: 3, text: '🧬' }],
    [2, 1, { start: 1, end: 3, text: '🧬' }],
  ] as const)('keeps whole source characters at offset %i / max_chars %i', async (offset, maxChars, expected) => {
    const source = 'A🧬B'; addDocument(DOC, source);
    model.script = (_messages, call) => call === 1 ? [read('unicode', { document_id: DOC, offset, max_chars: maxChars })] : 'Done.';
    const events = await turn(app, { message: 'Read the exact source window.' });
    expect(events.some(event => event.type === 'tool_result' && event.toolUseId === 'unicode')).toBe(true);
    expectExactDelivery(source, 'unicode', expected);
    expect(model.requests).toHaveLength(2);
  });

  it('walks by actual UTF-16 ends without splitting, skipping or duplicating source text', async () => {
    const source = '𠮷🧬A'; addDocument(DOC, source);
    model.script = (messages, call) => {
      const previous = parsed(resultsSentIn(messages).get(`walk${call - 1}`));
      if (previous?.coverage?.complete || call > 6) return 'Done.';
      return [read(`walk${call}`, { document_id: DOC, offset: previous?.window?.end ?? 0, max_chars: 1 })];
    };
    await turn(app, { message: 'Read every whole character.' });
    const windows = [...sentThisTurn().values()].map(body => parsed(body)?.window).filter(Boolean);
    let offset = 0;
    for (const window of windows) {
      expect(window.start).toBe(offset);
      expect(window.end).toBeGreaterThan(window.start);
      expect(window.text).toBe(source.slice(window.start, window.end));
      expect(Buffer.from(window.text, 'utf8').toString('utf8')).toBe(window.text);
      offset = window.end;
    }
    expect(offset).toBe(source.length);
    expect(windows.map(window => window.text).join('')).toBe(source);
    expect(windows.map(window => ({ start: window.start, end: window.end }))).toEqual(receiptsFor(DOC));
    expect(windows).toHaveLength(3);
  });
});

describe('stream Unicode bounds preserve host admission controls', () => {
  it('uses the intact actual start for a round-withheld retry and records no span for it', async () => {
    const docs = Array.from({ length: 6 }, (_, index) => `11111111-1111-4111-8111-${String(index + 30).padStart(12, '0')}`);
    docs.forEach(id => addDocument(id, 'A🧬B' + 'z'.repeat(20_000)));
    model.script = (_messages, call) => call === 1
      ? docs.map((id, index) => read(`many${index}`, { document_id: id, offset: 2 })) : 'Done.';
    await turn(app, { message: 'Read the six source windows.' });
    const target = parsed(sentThisTurn().get('many5'));
    expect(target).toMatchObject({ delivered: false, readAgainFrom: 1 });
    expect(receiptsFor(docs[5])).toEqual([]);
    expect(model.writes.some(write => parsed(write.result)?.documentId === docs[5])).toBe(false);
    expect([...sentThisTurn().values()].some(body => parsed(body)?.ok === true)).toBe(true);
  });

  it('keeps pre-handoff cancellation from dispatching or recording a Unicode window', async () => {
    addDocument(DOC, 'A🧬B');
    model.script = (_messages, call) => call === 1 ? [read('cancelled', { document_id: DOC, offset: 2, max_chars: 1 })] : 'Done.';
    model.beforeHandoff = () => { h.state.cancel?.(); };
    await turn(app, { message: 'Read the source.' });
    expect(model.requests).toHaveLength(1);
    expect(receiptsFor(DOC)).toEqual([]);
    expect(model.writes).toEqual([]);
  });

  it('withholds changed source text at the handoff without a receipt', async () => {
    addDocument(DOC, 'A🧬B');
    model.script = (_messages, call) => call === 1 ? [read('changed', { document_id: DOC, offset: 2, max_chars: 1 })] : 'Done.';
    model.beforeHandoff = () => { addDocument(DOC, 'REPLACED_SOURCE'); };
    await turn(app, { message: 'Read the source.' });
    expect(parsed(sentThisTurn().get('changed'))?.code).toBe('ANA_SOURCE_READ_NOT_ADMITTED');
    expect(receiptsFor(DOC)).toEqual([]);
    expect(model.writes).toEqual([]);
  });

  it('preserves the existing exact ASCII read and response budget', async () => {
    const source = 'Stable assay result.'; addDocument(DOC, source);
    model.script = (_messages, call) => call === 1 ? [read('ascii', { document_id: DOC, offset: 7, max_chars: 5 })] : 'Done.';
    await turn(app, { message: 'Read the source.' });
    expectExactDelivery(source, 'ascii', { start: 7, end: 12, text: 'assay' });
    expect(sentThisTurn().get('ascii')!.length).toBeLessThanOrEqual(RESULT_BUDGET);
  });
});
