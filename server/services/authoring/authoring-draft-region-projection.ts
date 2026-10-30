/** Display projection only. The caller admits every section before this read;
 * generation re-reads source, manual-preparation and jurisdiction authority. */
import type { RequestSqlClient } from '../../db/requestDb';
import { savedTemplateReview } from '../ana/saved-template-review';
import { savedSectionTemplateReference } from './authoring-draft-template';
import { writingAgencyOf, type SectionDraftingRegion } from '../../../shared/authoring/writing-regions';

export async function projectSectionDraftingRegions(
  q: RequestSqlClient,
  scope: { tenantId: number; documentId: string; programId: string | null },
  header: Record<string, unknown>,
  sections: Array<{ sectionId: string; code: string | null }>,
): Promise<Map<string, SectionDraftingRegion>> {
  const unavailable = (): Map<string, SectionDraftingRegion> => new Map(sections.map(section => [section.sectionId,
    { draftingRegion: null, draftingRegionState: 'unavailable' }]));
  try {
    const review = await savedTemplateReview(q, scope, header, sections);
    return new Map(sections.map(section => {
      const { source, reference } = savedSectionTemplateReference(review, { ...scope, ...section });
      const filing = source?.filingContext;
      const context = filing && typeof filing === 'object' && !Array.isArray(filing)
        ? filing as Record<string, unknown> : null;
      let projection: SectionDraftingRegion;
      if (!source) projection = { draftingRegion: null, draftingRegionState: 'not-recorded' };
      else if (reference.sourceVerification !== 'full-recorded') projection = { draftingRegion: null, draftingRegionState: 'unavailable' };
      else if (context?.region === 'GLOBAL') projection = { draftingRegion: null, draftingRegionState: 'global' };
      else {
        const agency = writingAgencyOf(context?.region);
        projection = { draftingRegion: agency, draftingRegionState: agency ? 'recorded' : 'unavailable' };
      }
      return [section.sectionId, projection];
    }));
  } catch {
    // A failed read or invalid assembled source must never select its parent.
    return unavailable();
  }
}
