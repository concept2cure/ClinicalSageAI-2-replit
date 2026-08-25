/**
 * body-aware-authoring — the authoring guidance a user reads must describe
 * THEIR submission, not a study we invented to have something to compute with.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * getSectionExpectations() receives only (regulatorBody, submissionType,
 * sectionCode). It called regulatoryCustomizer.customize(), which needs a full
 * StatisticalInput, a ComputationResult and a JudgmentResult — so it made them
 * up: clientTrack 'biotech_pharma', studyType 'superiority', objectiveType
 * 'efficacy', endpointType 'continuous', alpha 0.05, power 0.8, effect size
 * 0.5, attrition 0.1, and a judgment asserting overallRisk 'moderate'. The
 * customizer branches on exactly those fields, so its answer was guidance for
 * that invented study, pushed into `guidelines`, `requirements` and
 * `bodySpecificNotes` and rendered by getBodyAwareContext() with nothing
 * marking it as generic.
 *
 * What that produced for FDA / 510(k) / section 1.1 — a MEDICAL DEVICE
 * submission — recorded verbatim before the fix:
 *
 *   "ICH E9/E9(R1) compliance expected"
 *   "Pre-specified multiplicity adjustment for co-primary endpoints"
 *   "Two-sided significance level of 0.05 unless justified"
 *   "Power ≥80% is standard; ≥90% preferred for confirmatory trials"
 *   "Reference: FDA Guidance: Adaptive Designs for Clinical Trials of Drugs
 *    and Biologics (2019)"
 *
 * ICH E9 is a drug clinical-trial statistics guideline, and the adaptive-design
 * guidance names drugs and biologics in its own title. None of it was addressed
 * to a device submission; all of it was presented as this section's regulatory
 * expectations.
 *
 * ── No test doubles in this file ────────────────────────────────────────────
 * Nothing here is mocked, stubbed or faked. These tests call the real exported
 * functions, which load the real regional CTD templates and the real deficiency
 * taxonomy through their own dynamic imports. There is no database and no
 * network on this path, so there is nothing to stand in for — the assertions
 * are made against what the shipped code actually returns.
 */

import { describe, it, expect } from 'vitest';
import { getSectionExpectations, getBodyAwareContext } from '../body-aware-authoring';

/**
 * Strings the removed block emitted, captured from a real run against the
 * pre-fix code. Their defining property is that NONE of them was derived from
 * the three arguments the function actually receives.
 */
const FABRICATED_FDA = [
  'ICH E9/E9(R1) compliance expected',
  'Pre-specified multiplicity adjustment for co-primary endpoints',
  'Sensitivity analyses for missing data handling',
  'Two-sided significance level of 0.05 unless justified',
  'Power ≥80% is standard; ≥90% preferred for confirmatory trials',
  'Prospective statistical planning required in protocol and separate SAP',
  'Adaptive Designs for Clinical Trials of Drugs and Biologics',
  'FDA Guidance: Multiple Endpoints in Clinical Trials',
];

const FABRICATED_EMA = [
  'EMA expects compliance with ICH E9(R1) estimand framework',
  'Scientific advice from CHMP/SAWP available for novel designs',
  'Points to Consider on multiplicity (CPMP/EWP/908/99)',
  'Reflection Paper on Methodological Issues in Confirmatory Clinical Trials',
];

/** Every string the caller could surface, in one array. */
const allText = (e: {
  requirements: string[];
  guidelines: string[];
  commonDeficiencies: string[];
  bodySpecificNotes: string[];
}) => [...e.requirements, ...e.guidelines, ...e.commonDeficiencies, ...e.bodySpecificNotes];

describe('getSectionExpectations emits nothing derived from invented study parameters', () => {
  it('does not give a 510(k) drug-trial statistical expectations', async () => {
    const exp = await getSectionExpectations('FDA', '510(k)', '1.1');
    const text = allText(exp).join('\n');
    for (const claim of FABRICATED_FDA) {
      expect(text).not.toContain(claim);
    }
  });

  it('does not give an EMA NDA section synthesised estimand-framework guidance', async () => {
    const exp = await getSectionExpectations('EMA', 'NDA', '1.2');
    const text = allText(exp).join('\n');
    for (const claim of FABRICATED_EMA) {
      expect(text).not.toContain(claim);
    }
  });

  it('still returns the real, parameter-free content it can actually source', async () => {
    // The fix must remove fabrication, not the function's usefulness. These
    // three come from the regional CTD template and the deficiency taxonomy,
    // both keyed on the arguments the caller genuinely supplied.
    const exp = await getSectionExpectations('FDA', '510(k)', '1.1');
    expect(exp.requirements.length).toBeGreaterThan(0);
    expect(exp.commonDeficiencies.length).toBeGreaterThan(0);
    expect(exp.bodySpecificNotes.length).toBeGreaterThan(0);
  });

  it('varies its answer by agency, proving it reads its own arguments', async () => {
    // A guard against the opposite failure: returning one canned answer for
    // everyone would also pass the two absence tests above.
    const fda = await getSectionExpectations('FDA', '510(k)', '1.1');
    const ema = await getSectionExpectations('EMA', 'NDA', '1.2');
    expect(allText(fda).join('\n')).not.toEqual(allText(ema).join('\n'));
  });
});

describe('getBodyAwareContext renders only what the expectations hold', () => {
  it('puts no invented drug-trial guidance in front of a 510(k) author', async () => {
    // The rendered string is what a user actually reads, so it gets its own
    // assertion rather than trusting that the caller filters correctly.
    const context = await getBodyAwareContext('FDA', '510(k)', '1.1');
    for (const claim of FABRICATED_FDA) {
      expect(context).not.toContain(claim);
    }
    expect(context.length).toBeGreaterThan(0);
  });
});
