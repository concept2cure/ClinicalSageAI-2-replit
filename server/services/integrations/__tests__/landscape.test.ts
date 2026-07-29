/**
 * Regulatory landscape synthesis — unit tests (all source clients injected).
 * Verifies per-domain source selection, parallel aggregation, and that a single
 * source failure becomes a per-source error (allSettled) without sinking the rest.
 */
import { describe, it, expect, vi } from 'vitest';
import { assessRegulatoryLandscape, type LandscapeDeps } from '../landscape';

function makeDeps(over: Partial<LandscapeDeps> = {}): LandscapeDeps {
  return {
    searchTrials: vi.fn().mockResolvedValue({ totalCount: 3, trials: [{ nctId: 'NCT1', title: 'T', phase: 'PHASE3', status: 'RECRUITING', url: 'u' }] }),
    searchPubmed: vi.fn().mockResolvedValue({ totalCount: 9, articles: [{ pmid: 'P1', title: 'A', journal: 'J', url: 'u' }] }),
    searchMedicareCoverage: vi.fn().mockResolvedValue({ matched: 1, documents: [{ documentId: '20.1', title: 'C', type: 'NCD', url: 'u' }] }),
    searchDeviceRecalls: vi.fn().mockResolvedValue({ summary: { total: 2, classICount: 1 }, recalls: [{ recallNumber: 'Z-1' }] }),
    searchDrugLabels: vi.fn().mockResolvedValue({ total: 1, labels: [{ brandName: 'B', genericName: 'g', indications: 'i' }] }),
    searchDrugApprovals: vi.fn().mockResolvedValue({ total: 1, approvals: [{ applicationNumber: 'NDA1' }] }),
    ...over,
  } as LandscapeDeps;
}

describe('assessRegulatoryLandscape', () => {
  it('device domain queries trials + literature + coverage + device recalls only', async () => {
    const deps = makeDeps();
    const res = await assessRegulatoryLandscape({ topic: 'stent', domain: 'device' }, deps);

    expect(Object.keys(res.sections).sort()).toEqual(['coverage', 'deviceRecalls', 'literature', 'trials']);
    expect(deps.searchDrugLabels).not.toHaveBeenCalled();
    expect(deps.searchDrugApprovals).not.toHaveBeenCalled();
    expect((res.sections.deviceRecalls as any).summary.classICount).toBe(1);
    expect(res.errors).toEqual([]);
  });

  it('drug domain queries trials + literature + coverage + drug labels + approvals only', async () => {
    const deps = makeDeps();
    const res = await assessRegulatoryLandscape({ topic: 'pembrolizumab', domain: 'drug' }, deps);

    expect(Object.keys(res.sections).sort()).toEqual(['coverage', 'drugApprovals', 'drugLabels', 'literature', 'trials']);
    expect(deps.searchDeviceRecalls).not.toHaveBeenCalled();
    expect((res.sections.trials as any).total).toBe(3);
  });

  it('auto domain includes both device and drug sources', async () => {
    const deps = makeDeps();
    const res = await assessRegulatoryLandscape({ topic: 'x' }, deps);
    expect(Object.keys(res.sections).sort()).toEqual([
      'coverage', 'deviceRecalls', 'drugApprovals', 'drugLabels', 'literature', 'trials',
    ]);
  });

  it('isolates a failing source as an error without dropping the others', async () => {
    const deps = makeDeps({
      searchPubmed: vi.fn().mockRejectedValue(new Error('PubMed 429')),
    });
    const res = await assessRegulatoryLandscape({ topic: 'x', domain: 'device' }, deps);

    expect(res.sections.trials).toBeDefined();
    expect(res.sections.literature).toBeUndefined();
    expect(res.errors).toEqual([{ source: 'literature', error: 'PubMed 429' }]);
  });

  it('clamps max_per_source and passes it to each source', async () => {
    const deps = makeDeps();
    await assessRegulatoryLandscape({ topic: 'x', domain: 'drug', limitPerSource: 999 }, deps);
    expect(deps.searchTrials).toHaveBeenCalledWith({ query: 'x', pageSize: 15 });
    expect(deps.searchPubmed).toHaveBeenCalledWith({ query: 'x', maxResults: 15 });
  });
});
