import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({ scope: vi.fn(), current: vi.fn(), review: vi.fn() }));
vi.mock('../authoring-read-scope', async original => ({
  ...await original<typeof import('../authoring-read-scope')>(),
  getCurrentAuthoringReadScope: h.scope, requireAuthoringReadScopeStillCurrent: h.current,
}));
vi.mock('../../ana/saved-template-review', () => ({ savedTemplateReview: h.review }));
import { readAuthoringDocumentSections } from '../authoring-document-read';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
const SECTION = 'cccccccc-0000-4000-8000-000000000001';
const TEMPLATE = 'dddddddd-0000-4000-8000-000000000001';
const SELECTED = 'eeeeeeee-0000-4000-8000-000000000001';
const input = { organizationId: 7, userId: 3, documentId: DOC };
const access = { scope: 'verified-accessible-authoring-sections', actor: { userId: 3, role: 'viewer', email: null },
  documentIds: [], sectionDocumentIds: [DOC], sectionIds: [SECTION] };
const header = { template_id: TEMPLATE, provenance: { hidden: 'PRIVATE_PARENT_PROVENANCE' }, client_program_id: PROGRAM };
const rows = [{ id: SECTION, doc_id: DOC, code: '3', title: 'Visible section', content: 'Visible text', order_index: 0 }];
function source(region: 'US' | 'JP', id = TEMPLATE) {
  return { id, entryId: `registry:${region === 'US' ? 'US_IND' : 'JP_CTN'}`, version: 1, sha256: 'a'.repeat(64),
    kind: 'narrative', aiDraftable: true, authoringMode: 'ai_draft', originalFormat: 'docx', limitations: [],
    filingContext: { registryId: region === 'US' ? 'US_IND' : 'JP_CTN', region, agency: region === 'US' ? 'FDA' : 'PMDA' } };
}
function fixture() {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM authoring_sections s')) return { rows };
    if (sql.includes('FROM authoring_documents d')) return { rows: [header] };
    throw new Error('Unexpected query');
  });
  return { query, q: { query } as RequestSqlClient };
}
beforeEach(() => {
  h.scope.mockReset().mockResolvedValue(access); h.current.mockReset().mockResolvedValue(undefined);
  h.review.mockReset().mockResolvedValue({ template: { id: TEMPLATE, sourceState: 'recorded' }, source: source('US'),
    references: [{ sectionId: SECTION, templateId: SELECTED, authority: 'recorded', sourceVerification: 'full-recorded',
      source: source('JP', SELECTED), assembly: { templateId: SELECTED }, fields: {} }], items: [] });
});

describe('current section read carries only the effective saved drafting region', () => {
  it('uses the admitted parent and exact assembled section source without exposing parent provenance', async () => {
    const f = fixture(); const result = await readAuthoringDocumentSections(f.q, input);
    expect(result.sections).toEqual([{ ...rows[0], draftingRegion: 'PMDA', draftingRegionState: 'recorded' }]);
    expect(result.readScope).toBe('sections'); expect(result.structure).toBeNull();
    expect(h.review).toHaveBeenCalledExactlyOnceWith(f.q,
      { tenantId: 7, documentId: DOC, programId: PROGRAM }, header, [{ sectionId: SECTION, code: '3' }]);
    const call = f.query.mock.calls.find(([sql]) => sql.includes('FROM authoring_documents d'));
    expect(call?.[0]).toMatch(/d\.id=\$1.*d\.tenant_id=\$2/s);
    expect(call?.[1]).toEqual([DOC, 7, [DOC]]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PARENT_PROVENANCE');
    expect(h.current).toHaveBeenCalledExactlyOnceWith(f.q, expect.objectContaining(input), access);
    expect(h.current.mock.invocationCallOrder[0]).toBeGreaterThan(h.review.mock.invocationCallOrder[0]);
  });

  it('projects unavailable on a failed reference read instead of borrowing the US parent', async () => {
    h.review.mockRejectedValue(new Error('Reference store unavailable'));
    expect((await readAuthoringDocumentSections(fixture().q, input)).sections)
      .toEqual([{ ...rows[0], draftingRegion: null, draftingRegionState: 'unavailable' }]);
  });

  it('retains a genuinely absent saved template as not-recorded', async () => {
    h.review.mockResolvedValue({ template: { id: null, sourceState: 'not-recorded' }, source: null, references: [], items: [] });
    expect((await readAuthoringDocumentSections(fixture().q, input)).sections[0])
      .toMatchObject({ draftingRegion: null, draftingRegionState: 'not-recorded' });
  });

  it('returns no projection or content after final access withdrawal', async () => {
    h.current.mockRejectedValue(new Error('Current Authoring access changed'));
    await expect(readAuthoringDocumentSections(fixture().q, input)).rejects.toThrow('Current Authoring access changed');
  });

  it('reads neither source nor parent content before admission', async () => {
    const f = fixture(); h.scope.mockRejectedValue(new Error('Not admitted'));
    await expect(readAuthoringDocumentSections(f.q, input)).rejects.toThrow('Not admitted');
    expect(f.query).not.toHaveBeenCalled(); expect(h.review).not.toHaveBeenCalled();
  });
});
