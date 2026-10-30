import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblyOperation } from '../useAuthoringAssemblyBuild';
import { initialAssemblyState } from '../assemblyBuildState';
import type { SectionDraftingRegion } from '@shared/authoring/writing-regions';

const h = vi.hoisted(() => ({ inspect: vi.fn(), generate: vi.fn() }));
vi.mock('../assemblyBuildTransport', () => ({ inspectAssemblyDocument: h.inspect,
  normalizedAssemblyCode: (code: string) => code.trim().toUpperCase() }));
vi.mock('../authoringDraftTransport', () => ({ generateAuthoringDraft: h.generate, captureEditorDraftGuard: () => () => true }));
import { runAssemblyDrafts } from '../assemblyDraftQueue';

const section = { id: 'section', doc_id: 'document', code: '3', title: 'Quality', content: '', order_index: 0, updated_at: null };
function operation(region: string | null = 'FDA'): AssemblyOperation {
  const token = {};
  const bucket = { token, stopRequested: false, sourceRevision: 0, state: { ...initialAssemblyState(), phase: 'built',
    slots: [{ section, status: 'not-started', draftRegion: region, referenceContext: '', sourceSelectionKey: 'template-only',
      review: { draft: null, body: '', changeReason: '', refusal: null } }] } };
  return { bucket, token, owner: { alive: true, key: 'owner', contextRevision: 0, bucket },
    options: { docId: 'document', programId: 'program' }, current: () => true,
    update: patch => { Object.assign(bucket.state, patch); } } as AssemblyOperation;
}
beforeEach(() => {
  h.inspect.mockReset().mockResolvedValue([section]);
  h.generate.mockReset().mockResolvedValue({ ok: true, draft: { generated: 'Candidate', draftId: 'candidate' } });
});

describe('assembly queue respects the current exact section writing-region projection', () => {
  it('uses the saved Japanese section region instead of a retained US plan label', async () => {
    h.inspect.mockResolvedValue([{ ...section, draftingRegion: 'PMDA', draftingRegionState: 'recorded' }]);
    const op = operation(); await runAssemblyDrafts(op);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ region: 'PMDA' }), op.current);
    expect(op.bucket.state.slots[0].review.generationInputs?.region).toBe('PMDA');
  });

  it.each(['global', 'unavailable', 'not-recorded'] as const)('holds an explicit %s section instead of borrowing the plan region', async state => {
    const projection: SectionDraftingRegion = { draftingRegion: null, draftingRegionState: state };
    h.inspect.mockResolvedValue([{ ...section, ...projection }]);
    const op = operation(); await runAssemblyDrafts(op);
    expect(h.generate).not.toHaveBeenCalled();
    expect(op.bucket.state.phase).toBe('stopped');
    expect(op.bucket.state.slots[0].review.draft).toBeNull();
    expect(op.bucket.state.slots[0].message).toMatch(/region/i);
  });

  it.each([null, 'GLOBAL', 'unknown-region'])('holds an unresolved %s plan without generating a candidate', async region => {
    const op = operation(region); await runAssemblyDrafts(op);
    expect(h.generate).not.toHaveBeenCalled(); expect(op.bucket.state.phase).toBe('stopped');
  });

  it.each(['MHRA', 'NMPA', 'MFDS', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'HSA'])(
    'retains an explicit %s writing preference without replacing it with FDA', async region => {
      h.inspect.mockResolvedValue([{ ...section, draftingRegion: region, draftingRegionState: 'recorded' }]);
      const op = operation(region); await runAssemblyDrafts(op);
      expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ region }), op.current);
    });
});
