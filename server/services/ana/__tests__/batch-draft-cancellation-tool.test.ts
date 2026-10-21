/** Actual registered batch handler, receipt and loader; drafting and catalog
 * authority are synthetic seams. No provider or database operation runs. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor';

const seam = vi.hoisted(() => ({ batch: vi.fn(), scope: vi.fn(), load: vi.fn() }));
vi.mock('../AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => ({ batchDraft: seam.batch }) }));
vi.mock('../catalog-scope', async () => ({ catalogScope: seam.scope,
  sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: seam.load, revalidateActorSourceScope: async () => {} }));
vi.mock('../../c2c/current-program-access', async original => (
  (await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await original<Record<string, unknown>>())
));
import { getToolHandler } from '../AnaToolExecutor';

interface Slot { requestIndex: number; status: string; error?: string; content?: string; saved: boolean }
interface Receipt { status: string; count: number; failed: number; cancelled: number; requested: number;
  savedCount: number; sections: Slot[]; retryIndices: number[]; cancelledIndices: number[] }
const documentId = '10000000-0000-4000-8000-000000000001';
const programId = '20000000-0000-4000-8000-000000000001';
const sourceText = 'measured response was 12 of 30 subjects.';
const contentHash = 'a'.repeat(64);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const executor = { query: async () => ({ rows: [] }) };
const baseCtx = { organizationId: 7, userId: 3, projectId: 11, projectRef: programId, sqlClient: executor };
const otherDocumentId = '10000000-0000-4000-8000-000000000002';
const section = (sectionType: string, sourced = true, id = documentId) => ({ section_type: sectionType,
  instructions: 'Draft this section from supplied evidence.', ...(sourced ? { source_document_ids: [id] } : {}) });
const generated = (sectionType: string) => ({ content: `Draft of ${sectionType}`, model: 'fixture-only',
  latencyMs: 1, finishReason: 'end_turn', truncated: false });
async function run(sections: unknown[], signal: AbortSignal): Promise<Receipt> {
  const handler = getToolHandler('batch_draft_sections');
  if (!handler) throw new Error('Actual batch handler missing');
  return JSON.parse(await handler({ sections, submission_type: 'US_IND' }, { ...baseCtx, signal } as unknown as ToolContext)) as Receipt;
}
beforeEach(() => {
  vi.resetAllMocks();
  seam.scope.mockResolvedValue({ programId, executor,
    admittedScope: { organizationId: 7, userId: 3, projectId: 11, programId, role: 'member', accessibleProgramIds: [programId], actorFiltered: true },
    accessibleScope: { actor: { userId: 3, role: 'member' }, programIds: [programId] },
  });
  seam.load.mockResolvedValue({ id: documentId, organizationId: 7, programId, contentHash,
    documentTitle: 'Report', fileName: 'report.pdf', extractedText: sourceText,
    extractedTextSha256: digest(sourceText), isCurrent: true, originalFileAvailable: true, disposition: null,
    sourceAccess: { currentUseEligible: true }, catalog: { contentHash, status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } });
  seam.batch.mockImplementation(async ({ requests }: { requests: Array<{ sectionType: string }> }) =>
    requests.map(r => generated(r.sectionType)));
});

describe('batch_draft_sections carries stop into nested work', () => {
  it('reads no further source and dispatches no draft after stop during the first source read', async () => {
    const controller = new AbortController();
    const current = seam.load.getMockImplementation()!;
    seam.load.mockImplementation(async (...args: Parameters<typeof current>) => {
      controller.abort();
      return current(...args);
    });
    const result = await run([section('2.5'), section('2.7', true, otherDocumentId)], controller.signal);
    // The first section's loader was mid-read when stop landed; it finishes and
    // its result is discarded. The second section's source is never read.
    const readIds = seam.load.mock.calls.map(([input]) => (input as { documentId: string }).documentId);
    expect(readIds.length).toBeGreaterThan(0);
    expect(readIds.every(id => id === documentId)).toBe(true);
    expect(seam.batch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'cancelled', count: 0, failed: 0, cancelled: 2, requested: 2, savedCount: 0,
      retryIndices: [], cancelledIndices: [0, 1] });
    result.sections.forEach(s => {
      expect(s).toMatchObject({ status: 'cancelled', error: 'DRAFT_CANCELLED', saved: false });
      expect(s).not.toHaveProperty('content');
    });
  });

  it('passes the trusted signal to the drafting service', async () => {
    const controller = new AbortController();
    await run([section('2.5', false)], controller.signal);
    expect(seam.batch).toHaveBeenCalledTimes(1);
    expect(seam.batch.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it('keeps drafted siblings and lists cancelled slots outside retryIndices', async () => {
    const controller = new AbortController();
    seam.batch.mockImplementation(async ({ requests }: { requests: Array<{ sectionType: string }> }) => [
      generated(requests[0].sectionType),
      { error: 'DRAFT_FAILED', message: 'This section could not be drafted. The problem has been logged.', sectionType: requests[1].sectionType },
      { error: 'DRAFT_CANCELLED', message: 'Stopped before this section was drafted.', sectionType: requests[2].sectionType },
    ]);
    const result = await run([section('2.5', false), section('2.6', false), section('2.7', false)], controller.signal);
    expect(result).toMatchObject({ status: 'cancelled', count: 1, failed: 1, cancelled: 1, requested: 3,
      retryIndices: [1], cancelledIndices: [2] });
    expect(result.sections[0]).toMatchObject({ status: 'drafted', content: 'Draft of 2.5' });
    expect(result.sections[2]).toMatchObject({ status: 'cancelled', error: 'DRAFT_CANCELLED' });
  });

  it('keeps a source refusal as failed when stop lands during that read', async () => {
    const controller = new AbortController();
    seam.load.mockImplementation(async () => { controller.abort(); throw new Error('catalog refused'); });
    const result = await run([section('2.5'), section('2.7', true, otherDocumentId)], controller.signal);
    expect(result).toMatchObject({ status: 'cancelled', failed: 1, cancelled: 1, retryIndices: [0], cancelledIndices: [1] });
    expect(result.sections[0]).toMatchObject({ status: 'failed', error: 'DRAFT_FAILED' });
  });

  it('reports a fault after stop as the stop, keeping recorded source refusals', async () => {
    const controller = new AbortController();
    seam.load.mockRejectedValueOnce(new Error('catalog refused'));
    seam.batch.mockImplementation(async () => { controller.abort(); throw new Error('late fault'); });
    const result = await run([section('2.5'), section('2.6', false)], controller.signal);
    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ status: 'cancelled', failed: 1, cancelled: 1, retryIndices: [0], cancelledIndices: [1] });
  });

  it('dispatches nothing when already stopped', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await run([section('2.5')], controller.signal);
    expect(seam.load).not.toHaveBeenCalled();
    expect(seam.batch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'cancelled', cancelledIndices: [0], retryIndices: [] });
  });
});
