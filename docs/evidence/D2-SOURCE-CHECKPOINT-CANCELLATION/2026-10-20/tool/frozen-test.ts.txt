/** Actual registered tool, loader and receipt; catalog/scope and drafting are
 * synthetic seams. Cooperative operation boundaries, not SQL/socket cancellation. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor';

const seam = vi.hoisted(() => ({ batch: vi.fn(), scope: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn() }));
vi.mock('../AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => ({ batchDraft: seam.batch }) }));
vi.mock('../catalog-scope', async () => ({ catalogScope: seam.scope,
  sourceReadInput: (await import('./support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({
  loadDocumentForActor: seam.load, revalidateActorSourceScope: seam.actor,
}));
vi.mock('../../c2c/current-program-access', async original => ({
  ...(await import('./support/source-read-tool-fixture.js')).syntheticProgramAccessMock(await original<Record<string, unknown>>()),
  requireProgramScopeStillCurrent: seam.program,
}));

import { getToolHandler } from '../AnaToolExecutor';
import { DraftCancelledError } from '../batch-draft-result';

interface Slot { requestIndex: number; status: string; error?: string; content?: string; saved: boolean }
interface Receipt { status: string; count: number; failed: number; cancelled: number; requested: number;
  savedCount: number; sections: Slot[]; retryIndices: number[]; cancelledIndices: number[] }
const IDS = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'];
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'PRIVATE_SELECTED_SOURCE_MUST_NOT_APPEAR. Response was 12 of 30 subjects.';
const HASH = 'a'.repeat(64);
const executor = { query: async () => ({ rows: [] }) };
const baseCtx = { organizationId: 7, userId: 3, projectId: 11, projectRef: PROGRAM, sqlClient: executor };
const sections = [
  { section_type: '2.5', instructions: 'Draft this section from both sources.', source_document_ids: IDS.slice(0, 2) },
  { section_type: '2.7', instructions: 'Draft from the next section source.', source_document_ids: [IDS[2]] },
];
let operations: string[];
let onOperation: ((name: string) => void) | undefined;
function visit(name: string) { operations.push(name); onOperation?.(name); }
function row(documentId: string) {
  return { id: documentId, organizationId: 7, programId: PROGRAM, contentHash: HASH,
    documentTitle: 'Synthetic selected source', fileName: 'report.pdf', extractedText: TEXT,
    extractedTextSha256: createHash('sha256').update(TEXT).digest('hex'), isCurrent: true,
    originalFileAvailable: true, disposition: null, sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: HASH, status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } };
}
async function run(signal?: unknown): Promise<Receipt> {
  const handler = getToolHandler('batch_draft_sections');
  if (!handler) throw new Error('Actual registered batch handler missing');
  const ctx = { ...baseCtx, signal } as unknown as ToolContext;
  return JSON.parse(await handler({ sections, submission_type: 'US_IND' }, ctx)) as Receipt;
}
function expectStopped(receipt: Receipt) {
  expect(receipt).toMatchObject({ status: 'cancelled', count: 0, failed: 0, cancelled: 2,
    requested: 2, savedCount: 0, retryIndices: [], cancelledIndices: [0, 1] });
  receipt.sections.forEach(slot => {
    expect(slot).toMatchObject({ status: 'cancelled', error: 'DRAFT_CANCELLED', saved: false });
    expect(slot).not.toHaveProperty('content');
  });
  expect(JSON.stringify(receipt)).not.toContain(TEXT);
  expect(seam.batch).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.resetAllMocks(); operations = []; onOperation = undefined;
  seam.scope.mockImplementation(async () => {
    visit('scope');
    return { programId: PROGRAM, executor,
      admittedScope: { organizationId: 7, userId: 3, projectId: 11, programId: PROGRAM, role: 'member',
        accessibleProgramIds: [PROGRAM], actorFiltered: true },
      accessibleScope: { actor: { userId: 3, role: 'member' }, programIds: [PROGRAM] } };
  });
  seam.load.mockImplementation(async (input: { documentId: string }) => {
    visit(`read:${seam.load.mock.calls.length}`); return row(input.documentId);
  });
  seam.actor.mockImplementation(async () => { visit('actor'); });
  seam.program.mockImplementation(async () => { visit('program'); });
  seam.batch.mockImplementation(async ({ requests }: { requests: Array<{ sectionType: string }> }) => {
    visit('draft');
    return requests.map(request => ({ content: `Synthetic draft ${request.sectionType}`, model: 'fixture-only',
      latencyMs: 1, finishReason: 'end_turn', truncated: false }));
  });
});

describe('registered batch tool stops between operations inside one multi-source load', () => {
  it.each([
    { label: 'catalog scope', at: 'scope', reads: 0, actor: 0 },
    { label: 'first metadata', at: 'read:1', reads: 1, actor: 0 },
    { label: 'first include-text body', at: 'read:2', reads: 2, actor: 0 },
    { label: 'first final current-body recheck', at: 'read:5', reads: 5, actor: 0 },
    { label: 'final actor scope', at: 'actor', reads: 6, actor: 1 },
  ])('starts no later operation after Stop during $label', async ({ at, reads, actor }) => {
    const controller = new AbortController();
    onOperation = name => { if (name === at) controller.abort(); };
    const receipt = await run(controller.signal);
    expectStopped(receipt);
    expect(seam.scope).toHaveBeenCalledTimes(1);
    expect(seam.load).toHaveBeenCalledTimes(reads);
    expect(seam.actor).toHaveBeenCalledTimes(actor);
    expect(seam.program).not.toHaveBeenCalled();
    expect(operations.at(-1)).toBe(at);
    expect(seam.load.mock.calls.some(([input]) => (input as { documentId: string }).documentId === IDS[2])).toBe(false);
  });

  it('keeps a stop during the final program operation cancelled without drafting', async () => {
    const controller = new AbortController();
    onOperation = name => { if (name === 'program') controller.abort(); };
    expectStopped(await run(controller.signal));
    expect(seam.load).toHaveBeenCalledTimes(6);
    expect(seam.actor).toHaveBeenCalledTimes(1);
    expect(seam.program).toHaveBeenCalledTimes(1);
    expect(operations.at(-1)).toBe('program');
  });

  it.each(['DraftCancelledError', 'AbortError'])('classifies typed %s as cancelled only after real Stop', async name => {
    const controller = new AbortController();
    const error = name === 'DraftCancelledError' ? new DraftCancelledError() : Object.assign(new Error('Synthetic cancelled catalog operation'), { name });
    seam.load.mockImplementationOnce(async () => { controller.abort(); throw error; });
    const receipt = await run(controller.signal);
    expectStopped(receipt);
    expect(seam.load).toHaveBeenCalledTimes(1);
    expect(seam.actor).not.toHaveBeenCalled();
    expect(seam.program).not.toHaveBeenCalled();
  });
});

describe('existing cancellation, failure and trust controls stay distinct', () => {
  it('retains a genuine catalog rejection when Stop coincides with that rejection', async () => {
    const controller = new AbortController();
    seam.load.mockImplementationOnce(async () => { controller.abort(); throw new Error('PRIVATE_CATALOG_REJECTION'); });
    const receipt = await run(controller.signal);
    expect(receipt).toMatchObject({ status: 'cancelled', count: 0, failed: 1, cancelled: 1,
      retryIndices: [0], cancelledIndices: [1] });
    expect(receipt.sections[0]).toMatchObject({ status: 'failed', error: 'DRAFT_FAILED' });
    expect(receipt.sections[1]).toMatchObject({ status: 'cancelled', error: 'DRAFT_CANCELLED' });
    expect(JSON.stringify(receipt)).not.toMatch(/PRIVATE_CATALOG_REJECTION|PRIVATE_SELECTED_SOURCE_MUST_NOT_APPEAR/);
    expect(seam.batch).not.toHaveBeenCalled();
  });

  it('does not relabel an abort-shaped rejection without a real Stop', async () => {
    seam.load.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_UNRELATED_ABORT'), { name: 'AbortError' }));
    const receipt = await run(new AbortController().signal);
    expect(receipt).toMatchObject({ status: 'partial', count: 1, failed: 1, cancelled: 0,
      retryIndices: [0], cancelledIndices: [] });
    expect(receipt.sections[0]).toMatchObject({ status: 'failed', error: 'DRAFT_FAILED' });
    expect(receipt.sections[1]).toMatchObject({ status: 'drafted', content: 'Synthetic draft 2.7' });
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE_UNRELATED_ABORT');
  });

  it('ignores a JSON-shaped signal instead of granting it Stop authority', async () => {
    const receipt = await run({ aborted: true });
    expect(receipt).toMatchObject({ status: 'drafted', count: 2, failed: 0, cancelled: 0,
      retryIndices: [], cancelledIndices: [] });
    expect(seam.load).toHaveBeenCalledTimes(9);
    expect(seam.batch).toHaveBeenCalledTimes(1);
    expect(seam.batch.mock.calls[0][0].signal).toBeUndefined();
  });

  it('preserves ordinary multi-document loading without a signal', async () => {
    const receipt = await run();
    expect(receipt).toMatchObject({ status: 'drafted', count: 2, failed: 0, cancelled: 0 });
    expect(seam.load).toHaveBeenCalledTimes(9);
    expect(seam.actor).toHaveBeenCalledTimes(2);
    expect(seam.program).toHaveBeenCalledTimes(2);
    expect(seam.batch).toHaveBeenCalledTimes(1);
    expect(seam.batch.mock.calls[0][0].requests[0].sourceContext.sources).toHaveLength(2);
  });

  it('starts no operations when the existing real signal is already stopped', async () => {
    const controller = new AbortController(); controller.abort();
    expectStopped(await run(controller.signal));
    expect(operations).toEqual([]);
  });
});
