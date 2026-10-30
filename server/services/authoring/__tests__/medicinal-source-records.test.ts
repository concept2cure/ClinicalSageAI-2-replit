import { describe, expect, it } from 'vitest';
import { getPLRAuthoringSections } from '../../labeling/labeling-intelligence-knowledge';
import { getDocumentTemplate } from '../../market-specs/document-template-library';

describe('USPI authoring reuses copied existing records without assessing a product', () => {
  it('preserves source descriptors and boxed-warning placement in the working outline', () => {
    const source = getPLRAuthoringSections();
    const outline = getDocumentTemplate('us_prescribing_information')!;
    for (const row of [...source.highlightsStructure, ...source.fullPIStructure]) {
      const target = outline.sections.find(section => section.number === row.sectionNumber)!;
      expect(target.heading).toBe(row.sectionTitle);
      expect(target.purpose).toContain(row.contentGuidance);
    }
    const warning = outline.sections.find(row => row.number === 'BW')!;
    expect(warning.purpose).toContain(source.boxedWarningFormat.placement.find(line => line.startsWith('Full Prescribing Information'))!);
    expect(outline.sections.indexOf(warning)).toBeLessThan(outline.sections.findIndex(row => row.number === '1'));
    expect(warning.required).toBe(false);
    expect(warning.purpose).toContain('unconfirmed');
  });

  it('does not share mutable section arrays or boxed-warning placement with callers', () => {
    const original = getPLRAuthoringSections();
    const before = JSON.stringify(original);
    const copy = getPLRAuthoringSections();
    copy.highlightsStructure[0].sectionTitle = 'Changed outside the source';
    copy.fullPIStructure.find(section => section.subsections?.length)!.subsections!.push('Outside source');
    copy.boxedWarningFormat.placement.push('Outside source');
    expect(JSON.stringify(getPLRAuthoringSections())).toBe(before);
  });
});
