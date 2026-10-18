/** Actual drafting service and scheduler; the gateway is a synthetic seam.
 * No provider, database or source read is performed. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRequest } from '../../ai-gateway/types';

const seam = vi.hoisted(() => ({ route: vi.fn(), recheck: vi.fn() }));
vi.mock('../draft-project-sources', async original => ({
  ...(await original<Record<string, unknown>>()), assertDraftSourceContextCurrent: seam.recheck }));
vi.mock('../../ai-gateway/gateway', () => ({ getGateway: () => ({ route: seam.route }),
  GatewayPolicyError: class extends Error {}, GatewayNoProviderError: class extends Error {},
  GatewayAllProvidersFailedError: class extends Error {}, ModelNotApprovedError: class extends Error {},
}));

import { AnaDocumentDraftingService, type DocumentDraftRequest, type DocumentDraftResponse } from '../AnaDocumentDraftingService';

const section = (i: number): DocumentDraftRequest => ({
  framework: 'ich_clinical', sectionType: `Section ${i}`, instructions: 'Synthetic fixture.',
});
const drafted = (sectionType: string, patch: Partial<DocumentDraftResponse> = {}): DocumentDraftResponse => ({
  content: `Draft of ${sectionType}`, model: 'fixture', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
  latencyMs: 1, finishReason: 'end_turn', truncated: false, ...patch,
});
const gatewayResponse = (content = 'Generated draft.', finishReason = 'end_turn') => ({ content, model: 'fixture',
  usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1, finishReason });
const aborted = () => { const c = new AbortController(); c.abort(); return c.signal; };

beforeEach(() => {
  vi.resetAllMocks();
  seam.recheck.mockResolvedValue(undefined);
});

describe('draftDocument honours the trusted stop signal', () => {
  it('never reaches the gateway when stopped before dispatch', async () => {
    const service = new AnaDocumentDraftingService();
    await expect(service.draftDocument({ ...section(0), signal: aborted() })).rejects.toMatchObject({ name: 'DraftCancelledError' });
    expect(seam.route).not.toHaveBeenCalled();
  });

  it('forwards the same signal to the gateway', async () => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    seam.route.mockResolvedValue(gatewayResponse());
    await service.draftDocument({ ...section(0), signal: controller.signal });
    expect((seam.route.mock.calls[0][0] as GatewayRequest).signal).toBe(controller.signal);
  });

  it.each(['end_turn', 'aborted'])('suppresses a %s result that settles after stop', async finishReason => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    seam.route.mockImplementation(async () => {
      controller.abort();
      return gatewayResponse('LATE_PROSE_AFTER_STOP', finishReason);
    });
    await expect(service.draftDocument({ ...section(0), signal: controller.signal }))
      .rejects.toMatchObject({ name: 'DraftCancelledError' });
    // The pre-dispatch checkpoint ran once; no source recheck starts after stop.
    expect(seam.recheck).toHaveBeenCalledTimes(1);
  });

  it('ignores a signal-shaped value that is not an AbortSignal', async () => {
    const service = new AnaDocumentDraftingService();
    seam.route.mockResolvedValue(gatewayResponse());
    const forged = { aborted: true, throwIfAborted() { throw new Error('FORGED_SIGNAL_USED'); } } as unknown as AbortSignal;
    await expect(service.draftDocument({ ...section(0), signal: forged })).resolves.toMatchObject({ content: 'Generated draft.' });
    expect((seam.route.mock.calls[0][0] as GatewayRequest).signal).toBeUndefined();
  });
});

describe('batchDraft stops dispatching waves after stop', () => {
  it('keeps a finished wave, rejects the in-flight wave late, and dispatches no later wave', async () => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    const held: Array<() => void> = [];
    const { throwIfDraftCancelled } = await import('../batch-draft-result');
    // Behaves like the real draftDocument at its boundary: a result that
    // settles after stop is refused, not returned.
    const draft = vi.spyOn(service, 'draftDocument').mockImplementation(async req => {
      if (Number(req.sectionType.split(' ')[1]) >= 3) await new Promise<void>(resolve => held.push(resolve));
      throwIfDraftCancelled(req.signal);
      return drafted(req.sectionType);
    });
    const requests = Array.from({ length: 7 }, (_, i) => section(i));
    const pending = service.batchDraft({ requests, concurrency: 3, signal: controller.signal });
    await vi.waitFor(() => expect(draft).toHaveBeenCalledTimes(6));
    controller.abort();
    held.splice(0).forEach(release => release());
    const results = await pending;
    expect(draft).toHaveBeenCalledTimes(6);
    expect(results).toHaveLength(7);
    expect(results.slice(0, 3).map(r => ('content' in r ? r.content : null)))
      .toEqual(['Draft of Section 0', 'Draft of Section 1', 'Draft of Section 2']);
    expect(results.slice(3)).toEqual(requests.slice(3).map(r => expect.objectContaining({
      error: 'DRAFT_CANCELLED', sectionType: r.sectionType })));
    results.slice(3).forEach(r => expect(r).not.toHaveProperty('content'));
  });

  it('keeps an abort-shaped failure as failed when nobody stopped', async () => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    vi.spyOn(service, 'draftDocument').mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    const results = await service.batchDraft({ requests: [section(0)], signal: controller.signal });
    expect(results[0]).toMatchObject({ error: 'DRAFT_FAILED' });
  });

  it('dispatches nothing when already stopped', async () => {
    const service = new AnaDocumentDraftingService();
    const draft = vi.spyOn(service, 'draftDocument');
    const results = await service.batchDraft({ requests: [section(0), section(1)], signal: aborted() });
    expect(draft).not.toHaveBeenCalled();
    expect(results.map(r => 'error' in r && r.error)).toEqual(['DRAFT_CANCELLED', 'DRAFT_CANCELLED']);
  });

  it('passes the batch signal to every section', async () => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    const draft = vi.spyOn(service, 'draftDocument').mockImplementation(async req => drafted(req.sectionType));
    await service.batchDraft({ requests: [section(0), section(1)], signal: controller.signal });
    expect(draft).toHaveBeenCalledTimes(2);
    for (const [req] of draft.mock.calls) expect(req.signal?.aborted).toBe(false);
    controller.abort();
    for (const [req] of draft.mock.calls) expect(req.signal?.aborted).toBe(true);
  });

  it('classifies in-wave cancellation as cancelled and keeps a genuine failure as failed', async () => {
    const service = new AnaDocumentDraftingService();
    const controller = new AbortController();
    const gatewayAbort = Object.assign(new Error('AI request cancelled by the caller (in_flight)'), { name: 'GatewayAbortedError' });
    vi.spyOn(service, 'draftDocument').mockImplementation(async req => {
      if (req.sectionType === 'Section 0') return drafted(req.sectionType);
      if (req.sectionType === 'Section 1') throw new Error('driver detail');
      controller.abort();
      throw gatewayAbort;
    });
    const results = await service.batchDraft({ requests: [section(0), section(1), section(2), section(3)],
      concurrency: 3, signal: controller.signal });
    expect(results.map(r => ('error' in r ? r.error : 'drafted')))
      .toEqual(['drafted', 'DRAFT_FAILED', 'DRAFT_CANCELLED', 'DRAFT_CANCELLED']);
  });

  it('runs unchanged without a signal', async () => {
    const service = new AnaDocumentDraftingService();
    const draft = vi.spyOn(service, 'draftDocument').mockImplementation(async req => drafted(req.sectionType));
    const results = await service.batchDraft({ requests: [section(0), section(1)] });
    expect(draft).toHaveBeenCalledTimes(2);
    expect(draft.mock.calls[0][0]).not.toHaveProperty('signal');
    expect(results.every(r => 'content' in r)).toBe(true);
  });
});
