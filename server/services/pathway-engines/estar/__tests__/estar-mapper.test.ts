import { describe, it, expect } from 'vitest';
import { mapToEstar, type EstarInputLeaf } from '../estar-mapper';

// Leaves covering every REQUIRED 510(k) eSTAR section. All finalized/substantive content.
const complete510kLeaves: EstarInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
  { sectionCode: '2', title: 'Indications for use', substantive: true },
  { sectionCode: '3', title: 'Device description', substantive: true },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
  { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
  { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
];

describe('mapToEstar', () => {
  it('is ready when every required 510(k) section is present with substantive content', () => {
    const r = mapToEstar({ leaves: complete510kLeaves, type: '510k' });
    expect(r.summary.ready).toBe(true);
    expect(r.summary.missingRequired).toEqual([]);
  });

  it('handles empty input honestly (nothing invented)', () => {
    const r = mapToEstar({ leaves: [], type: '510k' });
    expect(r.summary.ready).toBe(false);
    expect(r.sections.every((s) => !s.present)).toBe(true);
  });

  it(
    'honesty fix (confirmed HIGH defect): a required section whose only matching leaf is a ' +
      'draft/placeholder stub is NOT marked present, and does NOT flip the 510(k) to ready — ' +
      'this must fail against the pre-fix code, which set present:true off a title-substring ' +
      'match alone, with no check of content, length, or authoring status',
    () => {
      // "Performance Testing" stub containing only "TBD" — title matches the slot,
      // but it carries no real content. Every other required section is genuinely
      // complete, so this single stub is the only thing standing between the
      // submission and a false "ready".
      const leaves: EstarInputLeaf[] = [
        ...complete510kLeaves.filter((l) => l.sectionCode !== '6'),
        { sectionCode: '6', title: 'Performance testing', documentType: 'performance_testing', substantive: false },
      ];
      const r = mapToEstar({ leaves, type: '510k' });
      const perf = r.sections.find((s) => s.id === 'performance-testing');
      expect(perf?.present).toBe(false);
      expect(r.summary.missingRequired).toContain('performance-testing');
      expect(r.summary.ready).toBe(false);
    },
  );

  it('a section still in draft/in-review status (substantive:false) is a gap even when every other title matches', () => {
    const draftLeaves: EstarInputLeaf[] = complete510kLeaves.map((l) => ({ ...l, substantive: false }));
    const r = mapToEstar({ leaves: draftLeaves, type: '510k' });
    expect(r.sections.every((s) => !s.present)).toBe(true);
    expect(r.summary.ready).toBe(false);
    expect(r.summary.missingRequired.length).toBeGreaterThan(0);
  });

  it('De Novo requires a classification request + special controls (not predicate SE)', () => {
    const r = mapToEstar({ leaves: [], type: 'de_novo' });
    expect(r.sections.some((s) => s.id === 'substantial-equivalence')).toBe(false);
    expect(r.summary.missingRequired).toContain('classification-request');
    expect(r.summary.missingRequired).toContain('special-controls');
  });

  it('matches by documentType as well as title, and only when substantive', () => {
    const present = mapToEstar({
      leaves: [{ sectionCode: 'a', title: 'untitled', documentType: 'device_description', substantive: true }],
      type: '510k',
    });
    expect(present.sections.find((s) => s.id === 'device-description')?.present).toBe(true);

    const notPresent = mapToEstar({
      leaves: [{ sectionCode: 'a', title: 'untitled', documentType: 'device_description', substantive: false }],
      type: '510k',
    });
    expect(notPresent.sections.find((s) => s.id === 'device-description')?.present).toBe(false);
  });
});
