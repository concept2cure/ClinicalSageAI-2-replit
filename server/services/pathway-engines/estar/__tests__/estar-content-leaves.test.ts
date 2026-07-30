import { describe, it, expect } from 'vitest';
import { sectionsToLeaves, type DeviceSectionInput } from '../estar-content-leaves';

describe('sectionsToLeaves (authored content → readiness leaves)', () => {
  it('turns only content-bearing sections into leaves (a gap is never invented)', () => {
    const sections: DeviceSectionInput[] = [
      { sectionNumber: '1', sectionTitle: 'Device Description', category: 'device-description', content: 'The device is…' },
      { sectionNumber: '2', sectionTitle: 'Labeling', category: 'labeling', content: '   ' }, // whitespace only → not authored
      { sectionNumber: '3', sectionTitle: 'Biocompatibility', category: 'biocompatibility', status: 'approved', content: null }, // status but no content → not a leaf
    ];
    const leaves = sectionsToLeaves(sections);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ sectionCode: '1', title: 'Device Description', documentType: 'device_description' });
  });

  it('normalizes category/key into a canonical documentType token', () => {
    const leaves = sectionsToLeaves([
      { sectionNumber: '5', sectionTitle: 'Perf', category: 'Performance Testing', content: 'x' },
      { sectionNumber: '6', sectionTitle: 'SE', category: 'substantial-equivalence', content: 'y' },
    ]);
    expect(leaves[0].documentType).toBe('performance_testing');
    expect(leaves[1].documentType).toBe('substantial_equivalence');
  });

  it('falls back to sectionKey for code/title/type when fields are missing', () => {
    const leaves = sectionsToLeaves([{ sectionKey: 'cover_letter', content: 'Dear FDA' }]);
    expect(leaves[0]).toMatchObject({ sectionCode: 'cover_letter', title: 'cover_letter', documentType: 'cover_letter' });
  });

  it('the produced leaves drive the eSTAR mapper (real content → readiness)', async () => {
    // A realistic authored 510(k) section set → leaves → the 510(k) mapper sees them.
    const { mapToEstar } = await import('../estar-mapper');
    const leaves = sectionsToLeaves([
      { sectionNumber: '1', sectionTitle: 'Cover letter', category: 'cover_letter', content: 'x' },
      { sectionNumber: '2', sectionTitle: 'Indications for use', category: 'indications_for_use', content: 'x' },
      { sectionNumber: '3', sectionTitle: 'Device description', category: 'device_description', content: 'x' },
    ]);
    const r = mapToEstar({ leaves, type: '510k' });
    expect(r.sections.find((s) => s.id === 'device-description')?.present).toBe(true);
    expect(r.sections.find((s) => s.id === 'cover-letter')?.present).toBe(true);
  });

  it('handles empty / non-array input safely', () => {
    expect(sectionsToLeaves([])).toEqual([]);
    expect(sectionsToLeaves(undefined as unknown as DeviceSectionInput[])).toEqual([]);
  });
});
