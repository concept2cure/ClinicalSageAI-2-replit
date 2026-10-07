/**
 * Tests for the batch_draft_sections tool (S2) — AnA drafts many sections in one
 * parallel batch. The drafting service is mocked so this exercises the handler's
 * input validation, request mapping, and result shaping without any model IO.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const batchDraftMock = vi.fn();
const sourceMocks = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn() }));
vi.mock('../catalog-scope', () => ({ catalogScope: sourceMocks.scope }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForOrg: sourceMocks.load }));
vi.mock('../AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({ batchDraft: batchDraftMock }),
}));

import { getToolHandler } from '../AnaToolExecutor';

const ctx = { organizationId: 7, userId: 3, projectId: 11 } as any;

beforeEach(() => {
  batchDraftMock.mockReset();
  sourceMocks.scope.mockReset();
  sourceMocks.load.mockReset();
});

describe('batch_draft_sections', () => {
  it('is registered', () => {
    expect(typeof getToolHandler('batch_draft_sections')).toBe('function');
  });

  it('errors on an empty sections array', async () => {
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({ sections: [] }, ctx));
    expect(out.error).toMatch(/non-empty sections/i);
    expect(batchDraftMock).not.toHaveBeenCalled();
  });

  it('errors above the 20-section cap', async () => {
    const sections = Array.from({ length: 21 }, (_, i) => ({ section_type: `s${i}`, instructions: 'x' }));
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({ sections }, ctx));
    expect(out.error).toMatch(/20 sections/);
    expect(batchDraftMock).not.toHaveBeenCalled();
  });

  it('drafts valid sections in parallel and shapes the result', async () => {
    batchDraftMock.mockResolvedValue([
      { content: 'Drafted 2.4', model: 'test-model', latencyMs: 12 },
      { content: 'Drafted 2.5', model: 'test-model', latencyMs: 15 },
    ]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [
        { section_type: '2.4', instructions: 'nonclinical overview' },
        { section_type: '2.5', instructions: 'clinical overview' },
      ],
      framework: 'FDA',
      submission_type: 'US_IND',
    }, ctx));

    expect(batchDraftMock).toHaveBeenCalledTimes(1);
    const arg = batchDraftMock.mock.calls[0][0];
    expect(arg.concurrency).toBe(5);
    expect(arg.requests).toHaveLength(2);
    // Context threaded through to each request.
    expect(arg.requests[0].organizationId).toBe(7);
    expect(arg.requests[0].submissionType).toBe('US_IND');

    expect(out.status).toBe('drafted');
    expect(out.count).toBe(2);
    expect(out.sections.map((s: any) => s.sectionType)).toEqual(['2.4', '2.5']);
    expect(out.sections[0].content).toBe('Drafted 2.4');
    expect(out.savedCount).toBe(0);
    expect(out.sections[0]).toMatchObject({ requestIndex: 0, saved: false, authoringDocId: null });
    expect(out.instruction).toContain('draft_authoring_document');
  });

  it('reports an invalid section in its original slot while keeping the valid draft', async () => {
    batchDraftMock.mockResolvedValue([{ content: 'ok', model: 'm', latencyMs: 1 }]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [
        { section_type: '', instructions: 'no type' },
        { section_type: '2.7', instructions: 'clinical summary' },
      ],
    }, ctx));
    const arg = batchDraftMock.mock.calls[0][0];
    expect(arg.requests).toHaveLength(1);
    expect(arg.requests[0].sectionType).toBe('2.7');
    expect(out.count).toBe(1);
    expect(out.status).toBe('partial');
    expect(out.failed).toBe(1);
    expect(out.sections).toHaveLength(2);
    expect(out.sections[0]).toMatchObject({ requestIndex: 0, error: 'INVALID_SECTION', saved: false });
    expect(out.sections[1]).toMatchObject({ requestIndex: 1, content: 'ok', saved: false });
    expect(out.retryIndices).toEqual([0]);
  });

});

describe('batch draft recovery receipts', () => {
  it('uses actual processed source records and returns version-bound receipts without copying raw text', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const program = '20000000-0000-4000-8000-000000000001';
    sourceMocks.scope.mockResolvedValue({ programId: program });
    sourceMocks.load.mockResolvedValue({ id, programId: program, contentHash: 'a'.repeat(64),
      documentTitle: 'Study CSR', extractedText: 'Actual processed study results',
      catalog: { status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } });
    batchDraftMock.mockResolvedValue([{ content: 'Grounded draft', model: 'm', latencyMs: 1 }]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '2.5', instructions: 'Draft from the project CSR', source_document_ids: [id],
        sourceContext: { status: 'loaded', sources: [{ text: 'fabricated model evidence' }] } }],
    }, { ...ctx, projectRef: program }));
    expect(batchDraftMock.mock.calls[0][0].requests[0].sourceContext.sources[0].text).toBe('Actual processed study results');
    expect(out.sections[0]).toMatchObject({ sourceStatus: 'loaded', sourceQualification: 'unassessed',
      sources: [{ documentId: id, contentHash: 'a'.repeat(64) }] });
    expect(out.sections[0].sources[0]).not.toHaveProperty('text');
    expect(JSON.stringify(out)).not.toContain('fabricated model evidence');
  });

  it('blocks generation for unavailable selected sources while retaining other section drafts', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    sourceMocks.scope.mockResolvedValue({ programId: id });
    sourceMocks.load.mockRejectedValue(new Error('private SQL connection detail'));
    batchDraftMock.mockResolvedValue([{ content: 'Planning draft', model: 'm', latencyMs: 1 }]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({ sections: [
      { section_type: '2.5', instructions: 'Evidence-based draft', source_document_ids: [id] },
      { section_type: 'protocol', instructions: 'Planning only' },
    ] }, ctx));
    expect(batchDraftMock.mock.calls[0][0].requests.map((r: any) => r.requestIndex)).toEqual([1]);
    expect(out).toMatchObject({ status: 'partial', retryIndices: [0], count: 1 });
    expect(out.sections[1]).toMatchObject({ sourceStatus: 'unassessed', sources: [] });
    expect(JSON.stringify(out)).not.toContain('private SQL');
  });

  it('uses the open program UUID before a legacy project ID for drafting context', async () => {
    batchDraftMock.mockResolvedValue([{ content: 'Scoped draft', model: 'm', latencyMs: 1 }]);
    await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '2.4', instructions: 'overview' }],
    }, { ...ctx, projectRef: '10000000-0000-4000-8000-000000000001' });
    expect(batchDraftMock.mock.calls[0][0].requests[0].projectId).toBe('10000000-0000-4000-8000-000000000001');
  });

  it('preserves successful drafts and names only failed original slots for retry', async () => {
    batchDraftMock.mockResolvedValue([
      { content: 'Keep this paid-for draft', model: 'm', latencyMs: 1 },
      { sectionType: '2.5', error: 'DRAFT_FAILED', message: 'Drafting unavailable; retry this section.' },
    ]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '2.4', instructions: 'overview' }, { section_type: '2.5', instructions: 'overview' }],
    }, ctx));
    expect(out.status).toBe('partial');
    expect(out.savedCount).toBe(0);
    expect(out.retryIndices).toEqual([1]);
    expect(out.sections[0].content).toBe('Keep this paid-for draft');
    expect(out.sections[1]).toMatchObject({ requestIndex: 1, error: 'DRAFT_FAILED', saved: false });
  });

  it('does not throw on null or non-object slots or lose their position', async () => {
    batchDraftMock.mockResolvedValue([{ content: 'Valid draft', model: 'm', latencyMs: 1 }]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [null, 'bad', { section_type: '2.4', instructions: 'overview' }],
    }, ctx));
    expect(out.failed).toBe(2);
    expect(out.sections.map((s: any) => s.requestIndex)).toEqual([0, 1, 2]);
    expect(out.sections[2].content).toBe('Valid draft');
  });

  it('errors when every section is invalid', async () => {
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '', instructions: '' }],
    }, ctx));
    expect(out.error).toMatch(/section_type and instructions/);
    expect(out.savedCount).toBe(0);
    expect(out.sections).toHaveLength(1);
    expect(out.retryIndices).toEqual([0]);
    expect(batchDraftMock).not.toHaveBeenCalled();
  });

  it('reports no usable blank draft as a failure rather than success', async () => {
    batchDraftMock.mockResolvedValue([{ content: '   ', model: 'm', latencyMs: 1 }]);
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '2.4', instructions: 'overview' }],
    }, ctx));
    expect(out.status).toBe('failed');
    expect(out.count).toBe(0);
    expect(out.sections[0]).toMatchObject({ error: 'DRAFT_FAILED', saved: false });
  });

  it('a failed batch retains actionable slots without exposing the thrown provider detail', async () => {
    batchDraftMock.mockRejectedValue(new Error('private provider endpoint and payload'));
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '2.4', instructions: 'overview' }],
    }, ctx));
    expect(out.status).toBe('failed');
    expect(out.savedCount).toBe(0);
    expect(out.retryIndices).toEqual([0]);
    expect(JSON.stringify(out)).not.toContain('private provider');
  });
});
