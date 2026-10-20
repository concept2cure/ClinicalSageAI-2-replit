/** Actual loader, private source authority, drafting service and batch scheduler.
 * Catalog/scope operations and gateway/provider are synthetic boundaries. The
 * gateway seam invokes the real beforeDispatch closure; it is not gateway.ts
 * and proves no native semaphore, transport, retry or provider cancellation. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRequest } from '../../ai-gateway/types';

const seam = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn(), gateway: vi.fn(), provider: vi.fn() }));
vi.mock('../catalog-scope', async () => ({ catalogScope: seam.scope,
  sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: seam.load, revalidateActorSourceScope: seam.actor }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: seam.program }));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: seam.gateway }),
  GatewayPolicyError: class extends Error {}, GatewayNoProviderError: class extends Error {},
  GatewayAllProvidersFailedError: class extends Error {}, ModelNotApprovedError: class extends Error {},
}));

import { AnaDocumentDraftingService, type DocumentDraftRequest } from '../AnaDocumentDraftingService';
import { loadDraftProjectSources, type DraftSourceContext } from '../draft-project-sources';
import { batchDraftReceipt, throwIfDraftCancelled } from '../batch-draft-result';

const SOURCE = '10000000-0000-4000-8000-000000000001';
const OTHER_SOURCE = '10000000-0000-4000-8000-000000000002';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = '診断試験 🧬 response was 12 of 30 subjects; investigator verification required.';
const OTHER_TEXT = 'Device stability study: 8 of 10 batches met the prespecified criterion.';
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const executor = { query: vi.fn() };
const identity = { organizationId: 7, userId: 3, projectId: PROGRAM };
const actorContext = { organizationId: 7, userId: 3, projectRef: PROGRAM, sqlClient: executor };
const service = new AnaDocumentDraftingService();
type Phase = 'loader' | 'entry' | 'dispatch' | 'response';
let phase: Phase;
let events: string[];
let held: { phase: Phase; entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; used: boolean; failure?: Error } | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function document(id: string) {
  const text = id === SOURCE ? TEXT : OTHER_TEXT;
  return { id, organizationId: 7, programId: PROGRAM, contentHash: 'a'.repeat(64),
    documentTitle: 'Synthetic source', fileName: 'source.pdf', extractedText: text, extractedTextSha256: hash(text),
    isCurrent: true, originalFileAvailable: true, disposition: null,
    sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } };
}
const request = (sourceContext?: DraftSourceContext, sectionType = 'selected', signal?: AbortSignal): DocumentDraftRequest => ({
  framework: 'general_regulatory', sectionType, instructions: 'Draft using only supported evidence and explicit gaps.',
  ...identity, sourceContext, ...(signal ? { signal } : {}),
});
async function loaded(signal?: AbortSignal) {
  const context = await loadDraftProjectSources([SOURCE, OTHER_SOURCE], { ...actorContext, ...(signal ? { signal } : {}) });
  expect(context.sources.map(source => source.documentId)).toEqual([SOURCE, OTHER_SOURCE]);
  events = []; phase = 'entry';
  seam.load.mockClear(); seam.actor.mockClear(); seam.program.mockClear();
  return context;
}
function holdFirstRead(at: Phase, failure?: Error) {
  held = { phase: at, entered: deferred(), release: deferred(), used: false, failure };
  return held;
}
function targetEvents(at: Phase) { return events.filter(event => event.startsWith(`${at}:`)); }
function fullCheckpoint(at: Phase) { return [`${at}:read:${SOURCE}`, `${at}:read:${OTHER_SOURCE}`, `${at}:actor`, `${at}:program`]; }
function receiptFor(requests: DocumentDraftRequest[], results: Awaited<ReturnType<typeof service.batchDraft>>) {
  return batchDraftReceipt(requests.map(req => ({ section_type: req.sectionType })),
    requests.map((req, requestIndex) => ({ requestIndex, sectionType: req.sectionType, sourceContext: req.sourceContext })), results);
}

beforeEach(() => {
  vi.resetAllMocks(); phase = 'loader'; events = []; held = undefined;
  seam.scope.mockResolvedValue({ programId: PROGRAM, executor,
    admittedScope: { organizationId: 7, userId: 3, programId: PROGRAM, role: 'viewer', accessibleProgramIds: [PROGRAM] },
    accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [PROGRAM] } });
  seam.load.mockImplementation(async ({ documentId }: { documentId: string }) => {
    events.push(`${phase}:read:${documentId}`);
    if (held && !held.used && held.phase === phase && documentId === SOURCE) {
      held.used = true; held.entered.resolve(); await held.release.promise;
      if (held.failure) throw held.failure;
    }
    return document(documentId);
  });
  seam.actor.mockImplementation(async () => { events.push(`${phase}:actor`); });
  seam.program.mockImplementation(async () => { events.push(`${phase}:program`); });
  seam.provider.mockImplementation(async (req: GatewayRequest) => ({ content: `Draft ${req.metadata?.sectionType}`, model: 'fixture-only',
    usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1, finishReason: 'end_turn' }));
  seam.gateway.mockImplementation(async (req: GatewayRequest) => {
    phase = 'dispatch';
    await req.beforeDispatch?.();
    // Explicit seam guard: existing native gateway behavior has separate proof.
    // This lets operation-count reds isolate source revalidation, rather than
    // inventing a missing gateway cancellation check or dispatch after Stop.
    throwIfDraftCancelled(req.signal);
    const response = await seam.provider(req);
    phase = req.beforeDispatch ? 'response' : 'entry';
    return response;
  });
});

describe('Stop inside genuine selected-source service checkpoints', () => {
  it.each(['entry', 'dispatch', 'response'] as const)('starts no later source/scope operation after the first %s read settles after Stop', async at => {
    const context = await loaded();
    const controller = new AbortController();
    const read = holdFirstRead(at);
    const pending = service.draftDocument(request(context, 'selected', controller.signal));
    await read.entered.promise;
    controller.abort(); read.release.resolve();
    await expect(pending).rejects.toMatchObject({ name: 'DraftCancelledError' });
    expect(seam.provider).toHaveBeenCalledTimes(at === 'response' ? 1 : 0);
    expect(seam.gateway).toHaveBeenCalledTimes(at === 'entry' ? 0 : 1);
    // The held operation may finish; none of these later operations may start.
    expect(targetEvents(at)).toEqual([`${at}:read:${SOURCE}`]);
  });

  it('keeps a completed sibling, cancels the held section and later wave, and offers no automatic retry', async () => {
    const context = await loaded();
    const controller = new AbortController();
    const read = holdFirstRead('entry');
    const requests = [request(undefined, 'before-stop'), request(context, 'selected'), request(context, 'after-stop')];
    const pending = service.batchDraft({ requests, concurrency: 1, signal: controller.signal });
    await read.entered.promise;
    // A provider result finished and was accepted before this later read began.
    expect(seam.provider.mock.calls.map(call => call[0].metadata.sectionType)).toEqual(['before-stop']);
    controller.abort(); read.release.resolve();
    const results = await pending;
    expect(results[0]).toMatchObject({ content: 'Draft before-stop' });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ error: 'DRAFT_CANCELLED', sectionType: 'selected' }),
      expect.objectContaining({ error: 'DRAFT_CANCELLED', sectionType: 'after-stop' }),
    ]);
    for (const result of results.slice(1)) expect(result).not.toHaveProperty('content');
    const receipt = receiptFor(requests, results);
    expect(receipt).toMatchObject({ status: 'cancelled', count: 1, failed: 0, cancelled: 2, savedCount: 0,
      retryIndices: [], cancelledIndices: [1, 2] });
    expect(seam.provider).toHaveBeenCalledTimes(1);
    expect(targetEvents('entry')).toEqual([`entry:read:${SOURCE}`]);
  });
});

describe('unchanged source authority and cancellation controls', () => {
  it.each(['no-signal', 'not-stopped'] as const)('keeps a genuine two-source draft unchanged with %s', async mode => {
    const signal = mode === 'not-stopped' ? new AbortController().signal : undefined;
    const context = await loaded(signal);
    await expect(service.draftDocument(request(context, 'selected', signal))).resolves.toMatchObject({ content: 'Draft selected' });
    for (const at of ['entry', 'dispatch', 'response'] as const) expect(targetEvents(at)).toEqual(fullCheckpoint(at));
    expect(seam.provider).toHaveBeenCalledTimes(1);
    const sent = seam.gateway.mock.calls[0][0] as GatewayRequest;
    expect(sent.signal).toBe(signal);
    expect(sent.beforeDispatch).toEqual(expect.any(Function));
    expect(JSON.stringify(sent.messages)).toContain(TEXT);
    expect(JSON.stringify(sent.messages)).toContain(OTHER_TEXT);
    expect(sent.metadata).toMatchObject({ projectSourceStatus: 'loaded', projectSources: [
      expect.objectContaining({ documentId: SOURCE, extractedTextSha256: hash(TEXT) }),
      expect.objectContaining({ documentId: OTHER_SOURCE, extractedTextSha256: hash(OTHER_TEXT) }),
    ] });
    expect(JSON.stringify(sent.metadata)).not.toContain(TEXT);
  });

  it('uses a fresh consumer signal independently of the loader signal stopped after issuance', async () => {
    const loader = new AbortController();
    const context = await loaded(loader.signal);
    loader.abort();
    const consumer = new AbortController();
    await expect(service.draftDocument(request(context, 'fresh-consumer', consumer.signal)))
      .resolves.toMatchObject({ content: 'Draft fresh-consumer' });
    expect((seam.gateway.mock.calls[0][0] as GatewayRequest).signal).toBe(consumer.signal);
    expect(consumer.signal.aborted).toBe(false);
    for (const at of ['entry', 'dispatch', 'response'] as const) expect(targetEvents(at)).toEqual(fullCheckpoint(at));
  });

  it('keeps a genuinely rejected source read failed when Stop coincides, with only the later wave cancelled', async () => {
    const context = await loaded();
    const controller = new AbortController();
    const read = holdFirstRead('entry', new Error('SOURCE_READ_REJECTION_PRIVATE_DETAIL'));
    const requests = [request(undefined, 'before-stop'), request(context, 'selected'), request(undefined, 'after-stop')];
    const pending = service.batchDraft({ requests, concurrency: 1, signal: controller.signal });
    await read.entered.promise;
    controller.abort(); read.release.resolve();
    const results = await pending;
    expect(results[0]).toMatchObject({ content: 'Draft before-stop' });
    expect(results[1]).toMatchObject({ error: 'DRAFT_FAILED', sectionType: 'selected' });
    expect(results[2]).toMatchObject({ error: 'DRAFT_CANCELLED', sectionType: 'after-stop' });
    for (const result of results.slice(1)) expect(result).not.toHaveProperty('content');
    expect(JSON.stringify(results)).not.toContain('PRIVATE_DETAIL');
    expect(receiptFor(requests, results)).toMatchObject({ count: 1, failed: 1, cancelled: 1, retryIndices: [1], cancelledIndices: [2] });
    expect(targetEvents('entry')).toEqual([`entry:read:${SOURCE}`]);
    expect(seam.provider).toHaveBeenCalledTimes(1);
  });
});
