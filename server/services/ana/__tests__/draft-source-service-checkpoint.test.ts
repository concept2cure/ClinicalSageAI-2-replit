/** Actual source loader/service; synthetic catalog authority and gateway boundaries.
 * Product admission is explicitly unassessed here and qualified separately by
 * real-PGlite tests; the actual private source issuer/checkpoints remain in use. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRequest } from '../../ai-gateway/types';
import type { DocumentDraftRequest } from '../AnaDocumentDraftingService';

const seam = vi.hoisted(() => ({
  scope: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn(),
  route: vi.fn(async (_request: unknown) => ({ content: 'Generated draft.', model: 'test-model',
    usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1, finishReason: 'end_turn' })),
}));
vi.mock('../catalog-scope', async () => ({ catalogScope: seam.scope,
  sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: seam.load, revalidateActorSourceScope: seam.actor }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: seam.program }));
vi.mock('../draft-product-context', async () => ({ loadRecordedDraftProductContext:
  (await import('./support/unassessed-product-context-fixture.js')).unassessedProductContextFixture }));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: seam.route }),
  GatewayPolicyError: class extends Error {}, GatewayNoProviderError: class extends Error {},
  GatewayAllProvidersFailedError: class extends Error {}, ModelNotApprovedError: class extends Error {},
}));

import { AnaDocumentDraftingService } from '../AnaDocumentDraftingService';
import { loadDraftProjectSources, type DraftSourceContext } from '../draft-project-sources';

const SOURCE = '10000000-0000-4000-8000-000000000001';
const OTHER_SOURCE = '10000000-0000-4000-8000-000000000002';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'Observed result: 12 of 30 participants 💊; investigator review required.';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const executor = { query: vi.fn() };
const identity = { organizationId: 7, userId: 3, projectId: PROGRAM };
const actorContext = { organizationId: 7, userId: 3, projectRef: PROGRAM, sqlClient: executor };
const service = new AnaDocumentDraftingService();

function document(id = SOURCE, text = TEXT) {
  return { id, organizationId: 7, programId: PROGRAM, contentHash: 'a'.repeat(64),
    documentTitle: 'Synthetic CSR', fileName: 'csr.pdf', extractedText: text, extractedTextSha256: sha(text),
    isCurrent: true, originalFileAvailable: true, disposition: null as string | null,
    sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } };
}
let documents: Map<string, ReturnType<typeof document>>;
const selected = (id = SOURCE) => loadDraftProjectSources([id], actorContext, 'Observed result');
const request = (sourceContext?: DraftSourceContext): DocumentDraftRequest => ({
  framework: 'ich_clinical', submissionType: 'US_NDA', sectionType: '2.5', instructions: 'Draft using explicit evidence gaps.',
  ...identity, sourceContext,
});
const response = () => ({ content: 'Generated draft.', model: 'test-model',
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1, finishReason: 'end_turn' });

beforeEach(() => {
  vi.resetAllMocks();
  documents = new Map([[SOURCE, document()], [OTHER_SOURCE, document(OTHER_SOURCE)]]);
  seam.scope.mockResolvedValue({ programId: PROGRAM, executor,
    admittedScope: { organizationId: 7, userId: 3, programId: PROGRAM, role: 'viewer', accessibleProgramIds: [PROGRAM] },
    accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [PROGRAM] } });
  seam.load.mockImplementation(async ({ documentId }: { documentId: string }) => documents.get(documentId) ?? null);
  seam.route.mockImplementation(async raw => {
    await (raw as GatewayRequest).beforeDispatch?.();
    return response();
  });
});

describe('selected-source service authority', () => {
  it.each(['spread', 'json', 'manual'])('refuses a %s loaded-context assertion before gateway handoff', async kind => {
    const context = await selected();
    const forged = kind === 'json' ? JSON.parse(JSON.stringify(context))
      : kind === 'spread' ? { ...context } : { status: 'loaded', sources: [...context.sources] };
    await expect(service.draftDocument(request(forged))).rejects.toThrow();
    expect(seam.route).not.toHaveBeenCalled();
  });

  it.each(['organizationId', 'userId', 'projectId'] as const)('refuses another consumer %s for a genuine context', async key => {
    const req = request(await selected());
    Object.assign(req, { [key]: key === 'projectId' ? SOURCE : 8 });
    await expect(service.draftDocument(req)).rejects.toThrow();
    expect(seam.route).not.toHaveBeenCalled();
  });

  it.each(['onStream', 'enableTools'] as const)('refuses selected-source %s before any release', async mode => {
    const req = request(await selected());
    Object.assign(req, { [mode]: mode === 'onStream' ? vi.fn() : true });
    await expect(service.draftDocument(req)).rejects.toThrow();
    expect(seam.route).not.toHaveBeenCalled();
  });

  it('refuses a same-length extraction correction while the selected context waited', async () => {
    const context = await selected();
    documents.set(SOURCE, document(SOURCE, TEXT.replace('12', '13')));
    await expect(service.draftDocument(request(context))).rejects.toThrow();
    expect(seam.route).not.toHaveBeenCalled();
  });
});

describe('selected-source generation checkpoints', () => {
  it('passes a genuine identity-bearing context through a private dispatch guard and text-free metadata', async () => {
    const context = await selected();
    await expect(service.draftDocument(request(context))).resolves.toMatchObject({ content: 'Generated draft.' });
    const sent = seam.route.mock.calls[0][0] as GatewayRequest;
    expect(sent.beforeDispatch).toEqual(expect.any(Function));
    expect(JSON.stringify(sent.messages)).toContain(TEXT);
    expect(sent.metadata).toMatchObject({ projectSourceStatus: 'loaded', projectSources: [expect.objectContaining({
      version: 2, documentId: SOURCE, extractedTextSha256: sha(TEXT), spanSha256: sha(TEXT),
    })] });
    expect(JSON.stringify(sent.metadata)).not.toContain(TEXT);
    expect(seam.actor.mock.calls.length).toBeGreaterThanOrEqual(4); // loader, service entry, dispatch, response
  });

  it('rechecks a retained context immediately before the stubbed provider boundary', async () => {
    const context = await selected();
    seam.route.mockImplementation(async raw => {
      documents.set(SOURCE, document(SOURCE, TEXT.replace('12', '13')));
      expect((raw as GatewayRequest).beforeDispatch).toEqual(expect.any(Function));
      await (raw as GatewayRequest).beforeDispatch!();
      return response();
    });
    await expect(service.draftDocument(request(context))).rejects.toThrow();
    expect(seam.route).toHaveBeenCalledTimes(1);
  });

  it('suppresses returned content if current source identity changes during the response wait', async () => {
    const context = await selected();
    seam.route.mockImplementation(async raw => {
      await (raw as GatewayRequest).beforeDispatch?.();
      documents.set(SOURCE, document(SOURCE, TEXT.replace('12', '13')));
      return response();
    });
    await expect(service.draftDocument(request(context))).rejects.toThrow();
    expect(seam.route).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful sibling when a later preloaded source is withdrawn while queued', async () => {
    const first = request(await selected());
    const second = request(await selected(OTHER_SOURCE));
    seam.route.mockImplementation(async raw => {
      await (raw as GatewayRequest).beforeDispatch?.();
      documents.set(OTHER_SOURCE, { ...document(OTHER_SOURCE), disposition: 'remove_data' });
      return response();
    });
    const result = await service.batchDraft({ requests: [first, second], concurrency: 1 });
    expect(result[0]).toMatchObject({ content: 'Generated draft.' });
    expect(result[1]).toMatchObject({ error: 'DRAFT_FAILED' });
    expect(result[1]).not.toHaveProperty('content');
    expect(seam.route).toHaveBeenCalledTimes(1);
  });
});

describe('ordinary drafting and immutable request snapshots', () => {
  it.each([undefined, { status: 'unassessed', sources: [] } as DraftSourceContext])('keeps ordinary streaming/tools without a source dispatch guard', async context => {
    const onStream = vi.fn();
    await service.draftDocument({ ...request(context), onStream, enableTools: true });
    const sent = seam.route.mock.calls[0][0] as GatewayRequest;
    expect(sent).not.toHaveProperty('beforeDispatch');
    expect(sent).toMatchObject({ stream: true, onStream, toolChoice: 'auto' });
    expect(seam.load).not.toHaveBeenCalled();
  });

  it('pins request identity, source object and declared project context before the first await', async () => {
    const context = await selected();
    const req = { ...request(context), projectContext: { deviceName: 'Original device', indication: 'Original indication' } };
    let release!: () => void;
    let entered!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    seam.load.mockImplementationOnce(async () => { entered(); await wait; return document(); });
    const pending = service.draftDocument(req);
    await started;
    req.organizationId = 8;
    req.userId = 9;
    req.projectId = SOURCE;
    req.instructions = 'MUTATED instructions';
    req.projectContext.deviceName = 'MUTATED device';
    req.projectContext.indication = 'MUTATED indication';
    req.sourceContext = { ...context };
    release();
    await expect(pending).resolves.toMatchObject({ content: 'Generated draft.' });
    const sent = seam.route.mock.calls[0][0] as GatewayRequest;
    expect(sent).toMatchObject(identity);
    expect(JSON.stringify(sent.messages)).toContain('Original device');
    expect(JSON.stringify(sent.messages)).toContain('Original indication');
    expect(JSON.stringify(sent.messages)).not.toContain('MUTATED');
  });
});
