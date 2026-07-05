/**
 * Tests for the batch_draft_sections tool (S2) — AnA drafts many sections in one
 * parallel batch. The drafting service is mocked so this exercises the handler's
 * input validation, request mapping, and result shaping without any model IO.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const batchDraftMock = vi.fn();
vi.mock('../AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({ batchDraft: batchDraftMock }),
}));

import { getToolHandler } from '../AnaToolExecutor';

const ctx = { organizationId: 7, userId: 3, projectId: 11 } as any;

beforeEach(() => {
  batchDraftMock.mockReset();
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
  });

  it('drops sections missing section_type or instructions, keeps the valid ones', async () => {
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
  });

  it('errors when every section is invalid', async () => {
    const out = JSON.parse(await getToolHandler('batch_draft_sections')!({
      sections: [{ section_type: '', instructions: '' }],
    }, ctx));
    expect(out.error).toMatch(/section_type and instructions/);
    expect(batchDraftMock).not.toHaveBeenCalled();
  });
});
