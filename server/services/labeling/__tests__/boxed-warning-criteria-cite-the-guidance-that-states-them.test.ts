/**
 * assessBoxedWarning (AnA tool assess_boxed_warning) cites its three criteria to
 * the document that states them (2026-10-15).
 *
 * Each criterion was labelled "21 CFR 201.57(c)(1)(i)", "(ii)" or "(iii)", the
 * (c)(1) citation was titled "Boxed Warning — Criteria for Inclusion", and the
 * tool told AnA the criteria were "per 21 CFR 201.57(c)(1)". Paragraph (c)(1) has
 * no subparagraphs (i)-(iii); it covers the boxed warning itself. The criteria
 * are FDA guidance: "Warnings and Precautions, Contraindications, and Boxed
 * Warning Sections of Labeling for Human Prescription Drug and Biological
 * Products — Content and Format" (2011). Nothing in this repository records that
 * guidance (no regulatory-basis entry, URL or evidence file), so it is cited by
 * its title only, and the citation says so.
 */
import { describe, expect, it } from 'vitest';
import { assessBoxedWarning, type AssessBoxedWarningInput } from '../labeling-intelligence-knowledge';
import { ASSESS_BOXED_WARNING } from '../../ana/labelingIntelligenceTools';

const GUIDANCE_TITLE =
  'Warnings and Precautions, Contraindications, and Boxed Warning Sections of Labeling for Human Prescription Drug and Biological Products — Content and Format';

const r = assessBoxedWarning({
  safetySignalType: 'hepatotoxicity',
  severity: 'serious',
  riskMitigationAvailable: true,
  approvedWithRestrictions: false,
} as AssessBoxedWarningInput);

describe('assessBoxedWarning criteria', () => {
  it('are not attributed to subparagraphs of 21 CFR 201.57(c)(1)', () => {
    for (const c of r.criteriaAssessment) {
      expect(c.description, `criterion ${c.criterionNumber} description`).not.toMatch(/201\.57\(c\)\(1\)\(i+\)/);
      expect(c.description).toMatch(/FDA guidance \(2011\)/);
    }
    expect(JSON.stringify(r.citations), 'the 201.57(c)(1) citation').not.toMatch(/Criteria for Inclusion/);
  });

  it('cite the guidance by its title only, and say so', () => {
    const g = r.citations.find((c) => c.title === GUIDANCE_TITLE);
    expect(g, 'a citation of the boxed-warning guidance').toBeDefined();
    expect(g?.year).toBe(2011);
    expect(g?.url).toBeUndefined();
    expect(g?.note).toMatch(/title only/);
  });

  it('are described to AnA as the guidance criteria, not 21 CFR 201.57(c)(1)', () => {
    const tool = JSON.stringify(ASSESS_BOXED_WARNING);
    expect(tool).not.toMatch(/per 21 CFR 201\.57\(c\)\(1\)/);
    expect(ASSESS_BOXED_WARNING.description).toMatch(/Boxed Warning Sections of Labeling/);
    // The criterion (iii) instruction stays within the 1024 characters OpenAI keeps.
    expect(ASSESS_BOXED_WARNING.description.slice(0, 1024)).toMatch(/approvedWithRestrictions, never inferred from the signal/);
  });
});
