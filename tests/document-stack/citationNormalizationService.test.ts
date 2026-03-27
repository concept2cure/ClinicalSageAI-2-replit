import { describe, expect, it } from 'vitest';
import { CitationNormalizationService } from '../../server/services/citations/citationNormalizationService';

describe('CitationNormalizationService', () => {
  it('falls back to raw reference parsing with DOI/PMID extraction', async () => {
    const service = new CitationNormalizationService(
      { extractReferences: async () => [] } as any,
      { enrich: async () => ({ entities: [], abbreviations: [] }) } as any,
      { normalize: async () => ({}) } as any
    );

    const result = await service.normalize({
      sourceDocumentId: 'doc-1',
      rawText: `References\nSmith J. Trial paper. doi:10.1000/xyz123 PMID: 1234567`,
    });

    expect(result.references.length).toBeGreaterThan(0);
    expect(result.references[0].doi).toBe('10.1000/xyz123');
    expect(result.references[0].pmid).toBe('1234567');
  });
});
