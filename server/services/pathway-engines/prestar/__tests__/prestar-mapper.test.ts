import { describe, it, expect } from 'vitest';
import {
  mapToPreStar,
  Q_SUB_TYPES,
  getQSubTypeInfo,
  type PreStarInputLeaf,
} from '../prestar-mapper';

const leaf = (sectionCode: string, title: string, documentType?: string, substantive = true): PreStarInputLeaf => ({
  sectionCode,
  title,
  documentType,
  substantive,
});

// Admin spine shared by every request. Finalized/substantive content.
const adminLeaves: PreStarInputLeaf[] = [
  leaf('1', 'Cover letter'),
  leaf('2', 'Applicant contact and administrative information'),
  leaf('3', 'Device description and intended use'),
];

describe('Q-Submission sub-type taxonomy', () => {
  it('enumerates all six Q-Sub sub-types including PMA Day 100 and Accessory Classification', () => {
    expect(Q_SUB_TYPES.map((t) => t.value)).toEqual([
      'pre_submission',
      'submission_issue_request',
      'informational_meeting',
      'study_risk_determination',
      'pma_day_100_meeting',
      'accessory_classification_request',
    ]);
  });

  it('marks informational meetings as not requesting feedback', () => {
    expect(getQSubTypeInfo('informational_meeting')?.requestsFeedback).toBe(false);
    expect(getQSubTypeInfo('pre_submission')?.requestsFeedback).toBe(true);
  });
});

describe('mapToPreStar — Q-Submissions', () => {
  it('a Pre-Sub needs questions + background/rationale beyond the admin spine', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: 'q_sub', qSubType: 'pre_submission' });
    expect(r.submissionType).toBe('q_sub');
    expect(r.qSubType).toBe('pre_submission');
    expect(r.summary.ready).toBe(false);
    expect(r.summary.missingRequired).toContain('questions');
    expect(r.summary.missingRequired).toContain('background-rationale');
  });

  it('refuses to assess a Q-Sub without its sub-type rather than scoring it as a Pre-Sub', () => {
    // Defaulted to 'pre_submission' before: a Submission Issue Request with no
    // stated sub-type was scored against the Pre-Sub slots and could report
    // ready while missing its mandatory deficiency reference.
    expect(() => mapToPreStar({ leaves: [], submissionType: 'q_sub' })).toThrow(/cannot be assessed without its sub-type/);
  });

  it('an informational meeting requires materials but NOT questions', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: 'q_sub', qSubType: 'informational_meeting' });
    expect(r.sections.some((s) => s.id === 'questions')).toBe(false);
    expect(r.summary.missingRequired).toContain('information-package');
  });

  it('a SIR requires a reference to the pending submission deficiencies', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: 'q_sub', qSubType: 'submission_issue_request' });
    expect(r.summary.missingRequired).toContain('deficiency-reference');
  });

  it('an accessory classification request requires accessory description + proposed classification', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: 'q_sub', qSubType: 'accessory_classification_request' });
    expect(r.summary.missingRequired).toContain('accessory-description');
    expect(r.summary.missingRequired).toContain('proposed-classification');
  });

  it('a PMA Day 100 meeting requires a reference to the filed PMA', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: 'q_sub', qSubType: 'pma_day_100_meeting' });
    expect(r.summary.missingRequired).toContain('pma-reference');
  });

  it('becomes ready once every required section is present', () => {
    const leaves: PreStarInputLeaf[] = [
      ...adminLeaves,
      leaf('4', 'Specific questions for FDA', 'questions'),
      leaf('5', 'Background and our position', 'background'),
    ];
    const r = mapToPreStar({ leaves, submissionType: 'q_sub', qSubType: 'pre_submission' });
    expect(r.summary.ready).toBe(true);
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.completeness).toBe(100);
  });

  it('honesty fix: a matched-but-non-substantive leaf (draft/placeholder) does NOT mark its required section present, and does NOT make the submission ready', () => {
    // Same titles/documentTypes as the "becomes ready" case — every required
    // section TITLE-matches — but every leaf is a draft/placeholder stub
    // (substantive: false). Before the fix this incorrectly reported
    // ready:true off title matches alone.
    const draftLeaves: PreStarInputLeaf[] = [
      leaf('1', 'Cover letter', undefined, false),
      leaf('2', 'Applicant contact and administrative information', undefined, false),
      leaf('3', 'Device description and intended use', undefined, false),
      leaf('4', 'Specific questions for FDA', 'questions', false),
      leaf('5', 'Background and our position', 'background', false),
    ];
    const r = mapToPreStar({ leaves: draftLeaves, submissionType: 'q_sub', qSubType: 'pre_submission' });
    expect(r.sections.every((s) => !s.present)).toBe(true);
    expect(r.summary.ready).toBe(false);
    expect(r.summary.completeness).toBe(0);
    expect(r.summary.missingRequired.length).toBeGreaterThan(0);
  });
});

describe('mapToPreStar — IDE', () => {
  it('requires the 21 CFR 812 core (investigational plan, prior investigations, protocol, risk, consent)', () => {
    const r = mapToPreStar({ leaves: [], submissionType: 'ide' });
    expect(r.qSubType).toBeUndefined();
    expect(r.summary.missingRequired).toEqual(
      expect.arrayContaining([
        'investigational-plan',
        'report-prior-investigations',
        'clinical-protocol',
        'risk-analysis',
        'manufacturing',
        'informed-consent',
        'labeling',
      ]),
    );
  });

  it('matches by documentType', () => {
    const r = mapToPreStar({
      leaves: [{ sectionCode: 'x', title: 'untitled', documentType: 'investigational_plan', substantive: true }],
      submissionType: 'ide',
    });
    expect(r.sections.find((s) => s.id === 'investigational-plan')?.present).toBe(true);
  });
});

describe('mapToPreStar — 513(g)', () => {
  it('requires classification questions + proposed classification', () => {
    const r = mapToPreStar({ leaves: adminLeaves, submissionType: '513g' });
    expect(r.summary.missingRequired).toContain('classification-questions');
    expect(r.summary.missingRequired).toContain('proposed-classification');
    // User-fee info is optional and must not block.
    expect(r.summary.missingRequired).not.toContain('user-fee');
  });
});

describe('mapToPreStar — honesty', () => {
  it('invents nothing for empty input', () => {
    const r = mapToPreStar({ leaves: [], submissionType: 'q_sub', qSubType: 'pre_submission' });
    expect(r.sections.every((s) => !s.present)).toBe(true);
    expect(r.summary.completeness).toBe(0);
    expect(r.summary.ready).toBe(false);
  });
});
