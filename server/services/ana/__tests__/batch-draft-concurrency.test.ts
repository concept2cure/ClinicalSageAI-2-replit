import { describe, expect, it, vi } from 'vitest';
import { AnaDocumentDraftingService, type DocumentDraftRequest } from '../AnaDocumentDraftingService';

const invalid = [
  { label: 'negative', value: -1 }, { label: 'negative infinity', value: -Infinity },
  { label: 'infinity', value: Infinity }, { label: 'NaN', value: NaN },
  { label: 'zero', value: 0 }, { label: 'fraction', value: 1.5 },
  { label: 'null', value: null }, { label: 'false', value: false },
  { label: 'true', value: true }, { label: 'numeric string', value: '3' },
  { label: 'empty string', value: '' }, { label: 'array', value: [] }, { label: 'object', value: {} },
];
const section = (i: number): DocumentDraftRequest => ({
  framework: 'ich_clinical', sectionType: `Section ${i}`, instructions: 'Synthetic fixture.',
});

describe('batch scheduler concurrency boundary', () => {
  it.each(invalid)('refuses $label before reading or scheduling requests', async ({ value: concurrency }) => {
    const service = new AnaDocumentDraftingService();
    const draft = vi.spyOn(service, 'draftDocument');
    const read = vi.fn((): DocumentDraftRequest[] => {
      throw new Error('REQUESTS_ACCESSED_BEFORE_CONCURRENCY_REFUSAL');
    });
    // The getter safely catches the pre-fix negative loop without hanging a worker.
    const request = { get requests() { return read(); }, concurrency: concurrency as number };
    await expect(service.batchDraft(request)).rejects.toThrow(RangeError);
    expect(read).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
  });

  it.each([
    { supplied: undefined, expected: 3 }, { supplied: 1, expected: 1 },
    { supplied: 3, expected: 3 }, { supplied: 5, expected: 5 },
    { supplied: 99, expected: 5 },
  ])('bounds active work and keeps order for $supplied', async ({ supplied, expected }) => {
    const service = new AnaDocumentDraftingService();
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const draft = vi.spyOn(service, 'draftDocument').mockImplementation(async req => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active--;
      return { content: req.sectionType, model: 'fixture', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
        latencyMs: 1, finishReason: 'end_turn', truncated: false };
    });
    const requests = Array.from({ length: 7 }, (_, i) => section(i));
    const pending = service.batchDraft({ requests, concurrency: supplied });
    let started = 0;
    while (started < requests.length) {
      const wave = Math.min(expected, requests.length - started);
      await vi.waitFor(() => expect(draft).toHaveBeenCalledTimes(started + wave));
      const waiting = releases.splice(0);
      waiting.reverse().forEach(release => release());
      started += wave;
    }
    expect((await pending).map(result => 'content' in result ? result.content : null))
      .toEqual(requests.map(req => req.sectionType));
    expect(peak).toBe(expected);
    expect(active).toBe(0);
    expect(draft).toHaveBeenCalledTimes(requests.length);
  });
});
