import { describe, expect, it } from 'vitest';
import {
  autoDraftModule3,
  buildCanonicalSourcesFromExtractedDocuments,
  inferSourceTypeFromCtdSection,
  type ExtractedCmcDocument,
} from '../auto-draft-composer';

describe('auto-draft-composer', () => {
  describe('inferSourceTypeFromCtdSection', () => {
    it('maps known CTD section codes to source types', () => {
      expect(inferSourceTypeFromCtdSection('3.2.S.4')).toBe('specification');
      expect(inferSourceTypeFromCtdSection('3.2.S.7')).toBe('stability');
      expect(inferSourceTypeFromCtdSection('3.2.P.1')).toBe('drug_product');
      expect(inferSourceTypeFromCtdSection('3.2.P.4')).toBe('excipient');
    });

    it('tolerates whitespace and casing', () => {
      expect(inferSourceTypeFromCtdSection(' 3.2.s.2 ')).toBe('manufacturing_process');
    });

    it('falls back to the longest known prefix for deeper codes', () => {
      expect(inferSourceTypeFromCtdSection('3.2.S.4.1')).toBe('specification');
    });

    it('returns null for unknown or empty codes', () => {
      expect(inferSourceTypeFromCtdSection('9.9.9')).toBeNull();
      expect(inferSourceTypeFromCtdSection(null)).toBeNull();
      expect(inferSourceTypeFromCtdSection(undefined)).toBeNull();
    });
  });

  describe('buildCanonicalSourcesFromExtractedDocuments', () => {
    it('maps explicit source types directly', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: 'a', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
      ];
      const { sources, unmapped } = buildCanonicalSourcesFromExtractedDocuments(docs);
      expect(unmapped).toHaveLength(0);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ id: 'a', sourceType: 'drug_substance' });
      expect(sources[0].sourcePayload.name).toBe('API-1');
    });

    it('infers source type from ctdSection when sourceType is absent', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: 'b', ctdSection: '3.2.S.7', payload: { timePoints: [0, 3, 6], storageCondition: '25C/60RH' } },
      ];
      const { sources } = buildCanonicalSourcesFromExtractedDocuments(docs);
      expect(sources[0].sourceType).toBe('stability');
      // ctdSection is preserved into the payload for lineage
      expect(sources[0].sourcePayload.ctdSection).toBe('3.2.S.7');
    });

    it('reports documents that cannot be mapped rather than dropping them', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: 'c', payload: { foo: 'bar' } },
        { id: 'd', ctdSection: 'not-a-section' },
      ];
      const { sources, unmapped } = buildCanonicalSourcesFromExtractedDocuments(docs);
      expect(sources).toHaveLength(0);
      expect(unmapped.map((u) => u.id)).toEqual(['c', 'd']);
    });

    it('passes through a precomputed sourceHash when provided', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: 'e', sourceType: 'specification', sourceHash: 'h-123', payload: {} },
      ];
      const { sources } = buildCanonicalSourcesFromExtractedDocuments(docs);
      expect(sources[0].sourceHash).toBe('h-123');
    });

    it('does not overwrite an explicit payload ctdSection', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: 'f', sourceType: 'specification', ctdSection: '3.2.S.4', payload: { ctdSection: 'explicit' } },
      ];
      const { sources } = buildCanonicalSourcesFromExtractedDocuments(docs);
      expect(sources[0].sourcePayload.ctdSection).toBe('explicit');
    });
  });

  describe('autoDraftModule3', () => {
    it('composes a full Module 3 and reports coverage deterministically', () => {
      const docs: ExtractedCmcDocument[] = [
        { id: '1', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
        { id: '2', ctdSection: '3.2.S.7', payload: { timePoints: [0, 3, 6], storageCondition: '25C/60RH' } },
      ];

      const result = autoDraftModule3(docs);

      // Composer produces all 17 Module 3 subsection rules.
      expect(result.sections.length).toBeGreaterThanOrEqual(15);

      // 3.2.S.1 should be complete (name + manufacturer present).
      const s1 = result.sections.find((s) => s.sectionKey === '3.2.S.1');
      expect(s1?.completeness).toBe(100);
      expect(result.coverage.completeSections).toContain('3.2.S.1');

      // Coverage reflects the two mapped sources.
      expect(result.coverage.mappedSourceCount).toBe(2);
      expect(result.coverage.unmappedDocuments).toHaveLength(0);
      expect(result.coverage.resolvedSourceTypes).toEqual(
        expect.arrayContaining(['drug_substance', 'stability']),
      );
      expect(result.coverage.overallCompleteness).toBeGreaterThan(0);
      expect(result.coverage.overallCompleteness).toBeLessThanOrEqual(100);

      // Determinism: same input → identical narrative.
      const again = autoDraftModule3(docs);
      expect(again.sections.find((s) => s.sectionKey === '3.2.S.1')?.narrativeDraft).toBe(
        s1?.narrativeDraft,
      );
    });

    it('surfaces empty sections when no relevant source data exists', () => {
      const result = autoDraftModule3([
        { id: '1', sourceType: 'drug_substance', payload: { name: 'API-1', manufacturer: 'Acme' } },
      ]);
      // Sections requiring only drug_product/excipient etc. have no source data.
      expect(result.coverage.emptySections).toContain('3.2.P.4');
    });

    it('carries unmapped documents into coverage', () => {
      const result = autoDraftModule3([
        { id: 'bad', payload: { foo: 'bar' } },
      ]);
      expect(result.coverage.mappedSourceCount).toBe(0);
      expect(result.coverage.unmappedDocuments).toEqual([
        expect.objectContaining({ id: 'bad' }),
      ]);
    });
  });
});
