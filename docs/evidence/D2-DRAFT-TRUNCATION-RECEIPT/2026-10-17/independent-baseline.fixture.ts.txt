/** Actual registered batch handler/receipt/loader; drafting and authority seams
 * are synthetic. No provider or database operation is performed. */
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

interface Slot {
  requestIndex: number; sectionType: string; status: string; error?: string; content?: string;
  finishReason?: string | null; truncated?: boolean; saved: boolean; authoringDocId: string | null;
  sourceStatus?: string; sourceQualification?: string; sources?: Array<Record<string, unknown>>;
}
interface Receipt { status: string; count: number; failed: number; requested: number; savedCount: number;
  sections: Slot[]; retryIndices: number[]; instruction: string }
const documentId = '10000000-0000-4000-8000-000000000001';
const programId = '20000000-0000-4000-8000-000000000001';
const sourceText = '診断試験 🧬 measured response was 12 of 30 subjects.';
const contentHash = 'a'.repeat(64);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const executor = { query: async () => ({ rows: [] }) };
const ctx = { organizationId: 7, userId: 3, projectId: 11, projectRef: programId, sqlClient: executor } as unknown as ToolContext;
const section = (sectionType = '2.5', sourced = false) => ({ section_type: sectionType,
  instructions: 'Draft this section from supplied evidence.', ...(sourced ? { source_document_ids: [documentId] } : {}) });
const generated = (patch: Record<string, unknown> = {}) => ({ content: 'Complete generated paragraph.', model: 'fixture-only',
  latencyMs: 1, finishReason: 'end_turn', truncated: false, ...patch });
async function run(sections: unknown[] = [section()]): Promise<Receipt> {
  const handler = getToolHandler('batch_draft_sections');
  if (!handler) throw new Error('Actual batch handler missing');
  return JSON.parse(await handler({ sections, submission_type: 'US_IND' }, ctx)) as Receipt;
}
beforeEach(() => {
  vi.resetAllMocks();
  seam.scope.mockResolvedValue({ programId, executor,
    admittedScope: { organizationId: 7, userId: 3, projectId: 11, programId, role: 'member', accessibleProgramIds: [programId], actorFiltered: true },
    accessibleScope: { actor: { userId: 3, role: 'member' }, programIds: [programId] },
  });
  seam.load.mockResolvedValue({ id: documentId, organizationId: 7, programId, contentHash,
    documentTitle: 'Diagnostic report', fileName: 'report.pdf', extractedText: sourceText,
    extractedTextSha256: digest(sourceText), isCurrent: true, originalFileAvailable: true, disposition: null,
    sourceAccess: { currentUseEligible: true }, catalog: { contentHash, status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } });
});

describe('independent real batch-tool cutoff boundary', () => {
  it.each(['max_tokens', 'length', 'chunk_timeout'])('does not offer incomplete prose for %s', async finishReason => {
    seam.batch.mockResolvedValue([generated({ content: 'CUT_OFF_SECRET_PROSE', finishReason, truncated: true })]);
    const result = await run();
    expect(result).toMatchObject({ status: 'failed', count: 0, failed: 1, requested: 1, savedCount: 0, retryIndices: [0] });
    expect(result.sections[0]).toMatchObject({ requestIndex: 0, sectionType: '2.5', status: 'failed', error: 'DRAFT_TRUNCATED',
      finishReason, truncated: true, saved: false, authoringDocId: null });
    expect(result.sections[0]).not.toHaveProperty('content');
    expect(JSON.stringify(result)).not.toContain('CUT_OFF_SECRET_PROSE');
  });
  it.each(['max_tokens', 'length', 'chunk_timeout'])('honors the canonical %s reason despite a false flag', async finishReason => {
    seam.batch.mockResolvedValue([generated({ finishReason, truncated: false })]);
    const result = await run();
    expect(result.sections[0]).toMatchObject({ status: 'failed', error: 'DRAFT_TRUNCATED', truncated: true, finishReason });
    expect(result.sections[0]).not.toHaveProperty('content');
  });
  it('honors a canonical cutoff reason when the flag is absent', async () => {
    const value = generated({ finishReason: 'length' });
    Reflect.deleteProperty(value, 'truncated');
    seam.batch.mockResolvedValue([value]);
    expect((await run()).sections[0]).toMatchObject({ error: 'DRAFT_TRUNCATED', finishReason: 'length', truncated: true });
  });
  it.each(['unknown', undefined])('honors an explicit true flag with finish reason %s', async finishReason => {
    seam.batch.mockResolvedValue([generated({ finishReason, truncated: true })]);
    const result = await run();
    expect(result.sections[0]).toMatchObject({ error: 'DRAFT_TRUNCATED', finishReason: finishReason ?? null, truncated: true });
    expect(result.count).toBe(0);
  });
});

describe('independent complete and unconfirmed positive controls', () => {
  it('keeps a complete generated draft usable and unsaved', async () => {
    seam.batch.mockResolvedValue([generated()]);
    const result = await run();
    expect(result).toMatchObject({ status: 'drafted', count: 1, failed: 0, savedCount: 0, retryIndices: [] });
    expect(result.sections[0]).toMatchObject({ status: 'drafted', content: 'Complete generated paragraph.', saved: false, authoringDocId: null });
  });
  it.each(['unknown', 'unrecognized_vendor_reason', undefined])('does not invent truncation for %s', async finishReason => {
    seam.batch.mockResolvedValue([generated({ finishReason, truncated: false })]);
    const result = await run();
    expect(result.count).toBe(1); expect(result.failed).toBe(0);
    expect(result.sections[0]).toMatchObject({ status: 'drafted', content: 'Complete generated paragraph.' });
    expect(result.sections[0]).not.toHaveProperty('error');
  });
  it.each(['end_turn', 'unknown', undefined])('retains known or unconfirmed termination metadata for %s', async finishReason => {
    seam.batch.mockResolvedValue([generated({ finishReason, truncated: false })]);
    expect((await run()).sections[0]).toMatchObject({ status: 'drafted', finishReason: finishReason ?? null, truncated: false });
  });
});

describe('independent original-slot recovery and source receipts', () => {
  it('keeps successful source identity and original slots while omitting cutoff prose in a mixed result', async () => {
    seam.batch.mockResolvedValue([generated(), generated({ content: 'CUT_OFF_MIXED_PROSE', finishReason: 'max_tokens', truncated: true }),
      { sectionType: 'provider-failure', error: 'DRAFT_FAILED', message: 'Retry this section.' }, generated({ content: '   ' })]);
    const result = await run([null, section('complete', true), section('cutoff', true), section('provider-failure'), section('blank')]);
    expect(seam.batch.mock.calls[0][0].requests.map((request: { requestIndex: number }) => request.requestIndex)).toEqual([1, 2, 3, 4]);
    expect(result).toMatchObject({ status: 'partial', count: 1, failed: 4, requested: 5, savedCount: 0, retryIndices: [0, 2, 3, 4] });
    expect(result.sections.map(slot => slot.requestIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(result.sections[0].error).toBe('INVALID_SECTION');
    expect(result.sections[1]).toMatchObject({ status: 'drafted', content: 'Complete generated paragraph.', sourceStatus: 'loaded',
      sourceQualification: 'unassessed', sources: [{ version: 2, documentId, contentHash,
        extractedTextSha256: digest(sourceText), spanSha256: digest(sourceText), span: { start: 0, end: sourceText.length, totalChars: sourceText.length } }] });
    expect(result.sections[1].sources?.[0]).not.toHaveProperty('text');
    expect(result.sections[2]).toMatchObject({ error: 'DRAFT_TRUNCATED', status: 'failed' });
    expect(result.sections[3].error).toBe('DRAFT_FAILED');
    expect(result.sections[4].error).toBe('DRAFT_FAILED');
    expect(JSON.stringify(result)).not.toContain('CUT_OFF_MIXED_PROSE');
    expect(JSON.stringify(result)).not.toContain(sourceText);
  });
  it('explicitly instructs saving only drafted slots and repairing cutoff slots', async () => {
    seam.batch.mockResolvedValue([generated(), generated({ finishReason: 'max_tokens', truncated: true })]);
    const result = await run([section('complete'), section('cutoff')]);
    expect(result.instruction).toMatch(/only[^.]*drafted/i);
    expect(result.instruction).toMatch(/status[^.]*drafted/i);
    expect(result.instruction).toMatch(/cut.off|truncat/i);
    expect(result.instruction).toContain('retryIndices');
  });
  it('retains blank-response refusal as an ordinary failure', async () => {
    seam.batch.mockResolvedValue([generated({ content: '  ' })]);
    expect(await run()).toMatchObject({ status: 'failed', count: 0, failed: 1, retryIndices: [0], sections: [{ error: 'DRAFT_FAILED' }] });
  });
  it('retains source-unavailable refusal and its successful sibling without leaking details', async () => {
    seam.load.mockRejectedValue(new Error('PRIVATE_SOURCE_QUERY_DETAIL'));
    seam.batch.mockResolvedValue([generated()]);
    const result = await run([section('unavailable', true), section('ordinary')]);
    expect(seam.batch.mock.calls[0][0].requests.map((request: { requestIndex: number }) => request.requestIndex)).toEqual([1]);
    expect(result).toMatchObject({ status: 'partial', count: 1, failed: 1, retryIndices: [0] });
    expect(result.sections[1]).toMatchObject({ status: 'drafted', sourceStatus: 'unassessed', sources: [] });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SOURCE_QUERY_DETAIL');
  });
});
