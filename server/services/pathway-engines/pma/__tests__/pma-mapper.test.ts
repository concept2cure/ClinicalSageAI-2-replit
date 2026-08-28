import { describe, it, expect } from 'vitest';
import {
  mapToPma,
  PMA_SUBMISSION_TYPES,
  getPmaSubmissionTypeInfo,
  isPmaSupplement,
  type PmaInputLeaf,
  type PmaSubmissionType,
} from '../pma-mapper';

// Leaves covering every REQUIRED PMA section. All finalized/substantive content.
const completePmaLeaves: PmaInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
  { sectionCode: '2', title: 'Device description and indications for use', substantive: true },
  { sectionCode: '3', title: 'Manufacturing and quality system information', substantive: true },
  { sectionCode: '4', title: 'Nonclinical bench and biocompatibility studies', substantive: true },
  { sectionCode: '5', title: 'Clinical investigation — pivotal study', substantive: true },
  { sectionCode: '6', title: 'Proposed labeling', substantive: true },
  { sectionCode: '7', title: 'Summary of safety and effectiveness data', substantive: true },
  { sectionCode: '8', title: 'Statistical analysis plan and results', substantive: true },
];

describe('mapToPma', () => {
  it('is ready when every required PMA section is present', () => {
    const r = mapToPma({ leaves: completePmaLeaves });
    expect(r.summary.ready).toBe(true);
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.completeness).toBe(100);
    expect(r.submissionType).toBe('original');
  });

  it('reports missing required sections and partial completeness', () => {
    const r = mapToPma({ leaves: [{ sectionCode: '1', title: 'Cover letter and administrative information', substantive: true }] });
    expect(r.summary.ready).toBe(false);
    expect(r.summary.missingRequired).toContain('clinical');
    expect(r.summary.missingRequired).toContain('manufacturing');
    expect(r.summary.completeness).toBeGreaterThan(0);
    expect(r.summary.completeness).toBeLessThan(100);
  });

  it('treats post-approval study and references as optional (not blocking)', () => {
    const r = mapToPma({ leaves: completePmaLeaves });
    const pas = r.sections.find((s) => s.id === 'post-approval-study');
    const refs = r.sections.find((s) => s.id === 'references');
    expect(pas?.required).toBe(false);
    expect(refs?.required).toBe(false);
    // optional + absent must not appear in missingRequired
    expect(r.summary.missingRequired).not.toContain('post-approval-study');
    expect(r.summary.ready).toBe(true);
  });

  it('records source leaves and FDA module numbers per section', () => {
    const r = mapToPma({ leaves: completePmaLeaves });
    const clinical = r.sections.find((s) => s.id === 'clinical');
    expect(clinical?.present).toBe(true);
    expect(clinical?.module).toBe(5);
    expect(clinical?.sources).toContain('5');
    const ssed = r.sections.find((s) => s.id === 'ssed-summary');
    expect(ssed?.module).toBe(7);
  });

  it('matches by documentType as well as title', () => {
    const r = mapToPma({
      leaves: [
        { sectionCode: 'a', title: 'untitled', documentType: 'manufacturing', substantive: true },
        { sectionCode: 'b', title: 'untitled', documentType: 'clinical_study', substantive: true },
      ],
    });
    expect(r.sections.find((s) => s.id === 'manufacturing')?.present).toBe(true);
    expect(r.sections.find((s) => s.id === 'clinical')?.present).toBe(true);
  });

  it('honesty fix: a matched-but-non-substantive leaf (draft/placeholder) does NOT mark a required section present, and does NOT make the submission ready', () => {
    // Same titles as completePmaLeaves — every required module TITLE-matches —
    // but every leaf is a draft/placeholder stub (substantive: false). Before
    // the fix this incorrectly reported ready:true off title matches alone.
    const draftLeaves: PmaInputLeaf[] = completePmaLeaves.map((l) => ({ ...l, substantive: false }));
    const r = mapToPma({ leaves: draftLeaves });
    expect(r.sections.every((s) => !s.present)).toBe(true);
    expect(r.summary.ready).toBe(false);
    expect(r.summary.completeness).toBe(0);
    expect(r.summary.missingRequired.length).toBeGreaterThan(0);
  });

  it('handles empty input honestly (nothing invented)', () => {
    const r = mapToPma({ leaves: [] });
    expect(r.summary.ready).toBe(false);
    expect(r.summary.completeness).toBe(0);
    expect(r.sections.every((s) => !s.present)).toBe(true);
  });

  it('threads the submission type', () => {
    const r = mapToPma({ leaves: completePmaLeaves, submissionType: 'panel_track_supplement' });
    expect(r.submissionType).toBe('panel_track_supplement');
  });

  it('accepts the full PMA supplement taxonomy incl. 30-day notice and 135-day supplement', () => {
    const types: PmaSubmissionType[] = [
      'original',
      'panel_track_supplement',
      '180_day_supplement',
      'real_time_supplement',
      '30_day_notice',
      '135_day_supplement',
    ];
    for (const t of types) {
      expect(mapToPma({ leaves: completePmaLeaves, submissionType: t }).submissionType).toBe(t);
    }
  });
});

describe('PMA submission-type metadata', () => {
  it('enumerates all six application/supplement types in lifecycle order', () => {
    expect(PMA_SUBMISSION_TYPES.map((t) => t.value)).toEqual([
      'original',
      'panel_track_supplement',
      '180_day_supplement',
      'real_time_supplement',
      '30_day_notice',
      '135_day_supplement',
    ]);
  });

  it('carries review clocks where FDA publishes one', () => {
    expect(getPmaSubmissionTypeInfo('original')?.reviewGoalDays).toBe(180);
    expect(getPmaSubmissionTypeInfo('30_day_notice')?.reviewGoalDays).toBe(30);
    expect(getPmaSubmissionTypeInfo('135_day_supplement')?.reviewGoalDays).toBe(135);
    // Real-time supplements are meeting-based — no fixed statutory clock.
    expect(getPmaSubmissionTypeInfo('real_time_supplement')?.reviewGoalDays).toBeUndefined();
  });

  it('distinguishes originals from supplements', () => {
    expect(isPmaSupplement('original')).toBe(false);
    expect(isPmaSupplement('panel_track_supplement')).toBe(true);
    expect(isPmaSupplement('30_day_notice')).toBe(true);
  });

  describe('per-submission-type required sections (21 CFR 814.39)', () => {
    it('a 30-day notice requires only admin + manufacturing (not clinical)', () => {
      const r = mapToPma({
        leaves: [
          { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
          { sectionCode: '3', title: 'Manufacturing process change description', substantive: true },
        ],
        submissionType: '30_day_notice',
      });
      expect(r.summary.ready).toBe(true); // admin + manufacturing present ⇒ complete
      expect(r.sections.find((s) => s.id === 'clinical')?.required).toBe(false);
      expect(r.summary.missingRequired).not.toContain('clinical');
    });

    it('the same content is NOT complete as an original PMA (clinical becomes required)', () => {
      const leaves: PmaInputLeaf[] = [
        { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
        { sectionCode: '3', title: 'Manufacturing and quality system information', substantive: true },
      ];
      const original = mapToPma({ leaves, submissionType: 'original' });
      expect(original.summary.ready).toBe(false);
      expect(original.summary.missingRequired).toContain('clinical');
    });

    it('a real-time supplement requires admin, device description, and labeling only', () => {
      const r = mapToPma({
        leaves: [
          { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
          { sectionCode: '2', title: 'Device description and indications for use', substantive: true },
          { sectionCode: '6', title: 'Proposed labeling', substantive: true },
        ],
        submissionType: 'real_time_supplement',
      });
      expect(r.summary.ready).toBe(true);
      expect(r.sections.find((s) => s.id === 'clinical')?.required).toBe(false);
      expect(r.sections.find((s) => s.id === 'manufacturing')?.required).toBe(false);
    });

    it('a panel-track supplement still requires new clinical data + SSED + stats', () => {
      const r = mapToPma({
        leaves: [
          { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
          { sectionCode: '2', title: 'Device description and indications for use', substantive: true },
          { sectionCode: '6', title: 'Proposed labeling', substantive: true },
        ],
        submissionType: 'panel_track_supplement',
      });
      expect(r.summary.ready).toBe(false);
      expect(r.summary.missingRequired).toContain('clinical');
      expect(r.summary.missingRequired).toContain('ssed-summary');
      expect(r.summary.missingRequired).toContain('statistical-analysis');
    });
  });
});
