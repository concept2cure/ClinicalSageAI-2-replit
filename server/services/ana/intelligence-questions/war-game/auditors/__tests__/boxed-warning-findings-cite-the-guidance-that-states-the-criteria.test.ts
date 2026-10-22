/**
 * The war-game labeling and NDA auditors attribute the boxed-warning criterion to
 * FDA's 2011 guidance, not to 21 CFR 201.57(c)(1) (2026-10-15).
 *
 * What the code used to do: both findings said a boxed warning "is required per 21
 * CFR 201.57(c)(1) when there is an adverse reaction so serious relative to the
 * drug's benefit…". That criterion is stated by FDA's guidance (2011) on the
 * Warnings and Precautions, Contraindications and Boxed Warning sections; (c)(1)
 * governs the box's content and format. The labeling engine was corrected the same
 * day (boxed-warning-criteria-cite-the-guidance-that-states-them.test.ts); the NDA
 * finding also cited the guidance under a wrong title ("Warnings and Precautions in
 * Labeling").
 */
import { describe, it, expect } from 'vitest';
import { createLabelingAuditor } from '../labeling-auditor';
import { createNdaAuditor } from '../nda-auditor';

const GUIDANCE_TITLE =
  'Warnings and Precautions, Contraindications, and Boxed Warning Sections of Labeling for Human Prescription Drug and Biological Products — Content and Format';

describe('boxed-warning findings', () => {
  it('labeling auditor: the criterion is the guidance\'s, cited by title', () => {
    const rule = createLabelingAuditor().rules.find((r) => r.id === 'lbl_no_boxed_warning')!;
    const f = rule.check({ serious_risks: 'yes' })!;
    expect(f.requirement, 'the criterion was attributed to 21 CFR 201.57(c)(1)').not.toMatch(/required per 21 CFR 201\.57\(c\)\(1\)/);
    expect(f.requirement).toMatch(/^Per FDA guidance \(2011\) on the Warnings and Precautions, Contraindications and Boxed Warning sections \(cited by title\), a boxed warning is warranted when/);
    expect(f.reference).toBe(
      '21 CFR 201.57(c)(1); 21 CFR 201.80(e); FDA guidance (2011), Warnings and Precautions, Contraindications, and Boxed Warning Sections of Labeling (title only)',
    );
  });

  it('NDA auditor: the criterion is the guidance\'s, and the guidance has its title', () => {
    const rule = createNdaAuditor().rules.find((r) => r.id === 'nda_boxed_warning_not_proposed')!;
    const f = rule.check({ serious_safety_risks: 'fatal hepatotoxicity' })!;
    expect(f.requirement, 'the criterion was attributed to 21 CFR 201.57(c)(1)').not.toMatch(/per 21 CFR 201\.57\(c\)\(1\)\.$/);
    expect(f.requirement).toMatch(/, per FDA guidance \(2011\) on the Warnings and Precautions, Contraindications and Boxed Warning sections\.$/);
    expect(f.reference).not.toMatch(/Warnings and Precautions in Labeling/);
    expect(f.reference).toContain(GUIDANCE_TITLE);
  });
});
