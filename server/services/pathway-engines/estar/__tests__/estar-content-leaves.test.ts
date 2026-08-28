import { describe, it, expect } from 'vitest';
import { sectionsToLeaves, type DeviceSectionInput } from '../estar-content-leaves';

const REAL_CONTENT =
  'The device is a Class II electrosurgical generator intended for cutting and coagulation of soft tissue during general surgical procedures, validated against IEC 60601 series standards.';

describe('sectionsToLeaves (authored content → readiness leaves)', () => {
  it('turns only content-bearing sections into leaves (a gap is never invented)', () => {
    const sections: DeviceSectionInput[] = [
      { sectionNumber: '1', sectionTitle: 'Device Description', category: 'device-description', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '2', sectionTitle: 'Labeling', category: 'labeling', content: '   ' }, // whitespace only → not authored
      { sectionNumber: '3', sectionTitle: 'Biocompatibility', category: 'biocompatibility', status: 'approved', content: null }, // status but no content → not a leaf
    ];
    const leaves = sectionsToLeaves(sections);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ sectionCode: '1', title: 'Device Description', documentType: 'device_description', substantive: true });
  });

  it('honesty fix: a section still in draft/in-review status is built with substantive:false, no matter how long its body is', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '4', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'draft', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(false);
  });

  it('honesty fix: a bare placeholder body ("TBD") is built with substantive:false even when status is approved', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '5', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'approved', content: 'TBD' },
    ]);
    // Still a leaf (content is non-empty) — but honestly marked as not substantive.
    expect(leaf).toBeDefined();
    expect(leaf.substantive).toBe(false);
  });

  it('honesty fix: a short stub with no status signal is not substantive (content-length fallback)', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '6', sectionTitle: 'Performance Testing', category: 'performance_testing', content: 'short stub' },
    ]);
    expect(leaf.substantive).toBe(false);
  });

  it('a finalized status with a real, non-trivial body is substantive', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '7', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'final', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(true);
  });

  it('with no status signal at all, a long real body is still substantive (content-length fallback)', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '8', sectionTitle: 'Performance Testing', category: 'performance_testing', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(true);
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

  it('the produced leaves drive the eSTAR mapper (real, finalized content → readiness)', async () => {
    // A realistic authored 510(k) section set (finalized, non-placeholder
    // content) → leaves → the 510(k) mapper sees them as present.
    const { mapToEstar } = await import('../estar-mapper');
    const leaves = sectionsToLeaves([
      { sectionNumber: '1', sectionTitle: 'Cover letter', category: 'cover_letter', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '2', sectionTitle: 'Indications for use', category: 'indications_for_use', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '3', sectionTitle: 'Device description', category: 'device_description', status: 'approved', content: REAL_CONTENT },
    ]);
    const r = mapToEstar({ leaves, type: '510k' });
    expect(r.sections.find((s) => s.id === 'device-description')?.present).toBe(true);
    expect(r.sections.find((s) => s.id === 'cover-letter')?.present).toBe(true);
  });

  it('honesty fix: a draft-status 510(k) section does NOT drive the eSTAR mapper to present, even though its title matches', async () => {
    const { mapToEstar } = await import('../estar-mapper');
    const leaves = sectionsToLeaves([
      { sectionNumber: '1', sectionTitle: 'Device description', category: 'device_description', status: 'draft', content: REAL_CONTENT },
    ]);
    const r = mapToEstar({ leaves, type: '510k' });
    expect(r.sections.find((s) => s.id === 'device-description')?.present).toBe(false);
  });

  it('handles empty / non-array input safely', () => {
    expect(sectionsToLeaves([])).toEqual([]);
    expect(sectionsToLeaves(undefined as unknown as DeviceSectionInput[])).toEqual([]);
  });
});
