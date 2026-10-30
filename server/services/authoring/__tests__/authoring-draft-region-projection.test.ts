/** The canonical validator is supplied as a typed result; real effective-reference
 * selection stays in savedSectionTemplateReference, shared with generation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { SavedTemplateReview } from '../../ana/saved-template-review';
import type { RecordedTemplateSource } from '../../../../shared/authoring/recorded-template-source';

const h = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock('../../ana/saved-template-review', () => ({ savedTemplateReview: h.review }));
import { projectSectionDraftingRegions } from '../authoring-draft-region-projection';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
const ONE = 'cccccccc-0000-4000-8000-000000000001';
const TWO = 'cccccccc-0000-4000-8000-000000000002';
const PARENT = 'dddddddd-0000-4000-8000-000000000001';
const SELECTED = 'eeeeeeee-0000-4000-8000-000000000001';
const scope = { tenantId: 7, documentId: DOC, programId: PROGRAM };
const sections = [{ sectionId: ONE, code: '3' }, { sectionId: TWO, code: '4' }];
const header = { template_id: PARENT, provenance: {} };
const q: RequestSqlClient = { query: async () => { throw new Error('No independent SQL/resolver is permitted.'); } };
function source(region: 'US' | 'JP' | 'GLOBAL', id = PARENT): RecordedTemplateSource {
  const registryId = { US: 'US_IND', JP: 'JP_CTN', GLOBAL: 'ICH_IB' }[region];
  return { id, entryId: `registry:${registryId}`, version: 1, sha256: 'a'.repeat(64), kind: 'narrative', aiDraftable: true,
    authoringMode: 'ai_draft', originalFormat: 'docx', limitations: ['Confirm source applicability.'],
    filingContext: { registryId, region, agency: { US: 'FDA', JP: 'PMDA', GLOBAL: 'ICH' }[region] } };
}
function reviewed(parent: RecordedTemplateSource | null = source('US')): SavedTemplateReview {
  return { template: { id: parent?.id ?? null, sourceState: parent ? 'recorded' : 'not-recorded' }, source: parent, references: [], items: [] };
}
const read = () => projectSectionDraftingRegions(q, scope, header, sections);
beforeEach(() => { h.review.mockReset().mockResolvedValue(reviewed()); });

describe('existing section reads project the same effective saved source as generation', () => {
  it('validates the complete admitted batch once and returns only section agency/state', async () => {
    const result = await read();
    expect(h.review).toHaveBeenCalledExactlyOnceWith(q, scope, header, sections);
    expect([...result]).toEqual([[ONE, { draftingRegion: 'FDA', draftingRegionState: 'recorded' }],
      [TWO, { draftingRegion: 'FDA', draftingRegionState: 'recorded' }]]);
  });

  it('honors a Japanese assembled section over its US parent and does not affect another section', async () => {
    const input = reviewed();
    input.references = [{ sectionId: ONE, templateId: SELECTED, authority: 'recorded', sourceVerification: 'full-recorded',
      source: { ...source('JP', SELECTED) }, assembly: { templateId: SELECTED }, fields: {} }];
    h.review.mockResolvedValue(input);
    const before = JSON.stringify(input);
    const result = await read();
    expect(result.get(ONE)).toEqual({ draftingRegion: 'PMDA', draftingRegionState: 'recorded' });
    expect(result.get(TWO)).toEqual({ draftingRegion: 'FDA', draftingRegionState: 'recorded' });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('preserves GLOBAL assembled scope instead of inheriting the parent', async () => {
    const input = reviewed();
    input.references = [{ sectionId: ONE, templateId: SELECTED, authority: 'recorded', sourceVerification: 'full-recorded',
      source: { ...source('GLOBAL', SELECTED) }, assembly: { templateId: SELECTED }, fields: {} }];
    h.review.mockResolvedValue(input);
    expect((await read()).get(ONE)).toEqual({ draftingRegion: null, draftingRegionState: 'global' });
  });

  it('keeps a truly unrecorded template distinct from a failed source read', async () => {
    h.review.mockResolvedValue(reviewed(null));
    expect((await read()).get(ONE)).toEqual({ draftingRegion: null, draftingRegionState: 'not-recorded' });
    h.review.mockRejectedValue(new Error('Malformed assembly source or unread reference store.'));
    expect([...await read()].map(([, value]) => value)).toEqual([
      { draftingRegion: null, draftingRegionState: 'unavailable' }, { draftingRegion: null, draftingRegionState: 'unavailable' }]);
  });

  it('does not promote identity-only source fields into a recorded receiving region', async () => {
    const input = reviewed(null);
    input.references = [{ sectionId: ONE, templateId: PARENT, authority: 'recorded', sourceVerification: 'identity-only',
      source: { id: PARENT }, fields: {} }];
    h.review.mockResolvedValue(input);
    expect((await read()).get(ONE)).toEqual({ draftingRegion: null, draftingRegionState: 'unavailable' });
  });
});
