/**
 * Regression — CER essential-requirements conformity must be evidence-derived,
 * never fabricated.
 *
 * `generateGeneralRequirements` / `generateDesignRequirements` /
 * `generateInformationRequirements` / `generateClinicalRequirements` previously
 * returned hard-coded `conformity: 'Conforms'` for ER 1/2/3/13/14 regardless of
 * evidence — every generated CER asserted essential-requirement conformity
 * backed by nothing. Asserting conformity without evidence in a CER is
 * fabrication (MDR 2017/745 Annex I GSPR / MEDDEV 2.7/1 rev 4 require it to be
 * demonstrated by data).
 *
 * Contract under test (fail closed):
 * - No linked evidence => every requirement is "Not assessed — no linked
 *   evidence" and 'Conforms' appears nowhere; each gap is surfaced.
 * - A linked cer_clinical_evidence row upgrades ONLY ER 14 (clinical
 *   evaluation — the one requirement the schema actually links evidence to)
 *   to a supported status, and even then never to an outright 'Conforms'.
 * - buildCerStructure starts clinical-evidence / literature sections in honest
 *   "none recorded" empty states instead of implying a completed review.
 */

import { describe, it, expect } from 'vitest';
import cerGen, {
  CONFORMITY_NOT_ASSESSED,
  CONFORMITY_EVIDENCE_LINKED,
} from '../../cerGenerationService';

interface Assessment {
  requirement: string;
  description: string;
  conformity: string;
  expectedEvidence: string;
  linkedEvidence: string[];
}

interface ErContent {
  assessmentBasis: string;
  generalRequirements: Assessment[];
  designRequirements: Assessment[];
  informationRequirements: Assessment[];
  clinicalRequirements: Assessment[];
  gaps: string[];
}

// The builders are private; exercise them directly via the singleton (same
// pattern as benefit-risk-ratio.test.ts).
const svc = cerGen as unknown as {
  buildEssentialRequirementsContent: (evidence: Array<{ title?: string | null }>) => ErContent;
  buildCerStructure: (device: unknown, template: unknown, options: unknown) => Promise<any>;
};

const allAssessments = (c: ErContent): Assessment[] => [
  ...c.generalRequirements,
  ...c.designRequirements,
  ...c.informationRequirements,
  ...c.clinicalRequirements,
];

describe('essential requirements — evidence-derived, never fabricated', () => {
  it('with no linked evidence, no requirement claims conformity ("Conforms" appears nowhere)', () => {
    const content = svc.buildEssentialRequirementsContent([]);
    expect(JSON.stringify(content)).not.toMatch(/conforms/i);
    for (const a of allAssessments(content)) {
      expect(a.conformity).toBe(CONFORMITY_NOT_ASSESSED);
      expect(a.linkedEvidence).toEqual([]);
    }
  });

  it('surfaces every unassessed requirement in the gaps list', () => {
    const content = svc.buildEssentialRequirementsContent([]);
    const ids = allAssessments(content).map(a => a.requirement);
    expect(ids).toEqual(['ER 1', 'ER 2', 'ER 3', 'ER 13', 'ER 14']);
    for (const id of ids) {
      expect(content.gaps.some(g => g.startsWith(`${id} `))).toBe(true);
    }
    expect(content.gaps).toHaveLength(5);
  });

  it('a linked evidence row upgrades ONLY ER 14 (clinical evaluation) to a supported status', () => {
    const content = svc.buildEssentialRequirementsContent([
      { title: 'Prospective multicentre study of Acme Infusion Pump' },
    ]);

    const er14 = content.clinicalRequirements.find(a => a.requirement === 'ER 14')!;
    expect(er14.conformity).toBe(CONFORMITY_EVIDENCE_LINKED);
    expect(er14.linkedEvidence).toEqual(['Prospective multicentre study of Acme Infusion Pump']);

    // A supported status is still not a conformity verdict.
    expect(JSON.stringify(content)).not.toMatch(/conforms/i);

    // Requirements with no evidence-linkage model in the schema stay
    // "Not assessed" (no invented linkage) and remain in the gaps list.
    for (const a of allAssessments(content).filter(a => a.requirement !== 'ER 14')) {
      expect(a.conformity).toBe(CONFORMITY_NOT_ASSESSED);
    }
    expect(content.gaps.some(g => g.startsWith('ER 14 '))).toBe(false);
    expect(content.gaps).toHaveLength(4);
  });

  it('blank or titleless evidence rows do not count as evidence (fail closed)', () => {
    const content = svc.buildEssentialRequirementsContent([{ title: '   ' }, {}, { title: null }]);
    const er14 = content.clinicalRequirements[0];
    expect(er14.conformity).toBe(CONFORMITY_NOT_ASSESSED);
    expect(er14.linkedEvidence).toEqual([]);
    expect(content.gaps).toHaveLength(5);
  });
});

describe('buildCerStructure — honest empty states at generation time', () => {
  const device = {
    deviceName: 'Acme Infusion Pump',
    classification: 'IIb',
    intendedUse: 'controlled infusion of fluids',
  };
  const options = {
    deviceId: 1,
    organizationId: 1,
    userId: 1,
    regulatoryFramework: 'MDR_2017_745',
  };

  it('a freshly generated structure never asserts conformity or a completed review', async () => {
    const structure = await svc.buildCerStructure(device, {}, options);

    // No evidence can be linked before the report exists — conformity is
    // therefore never asserted at generation time.
    expect(JSON.stringify(structure.essentialRequirements)).not.toMatch(/conforms/i);
    expect(structure.essentialRequirements.content.gaps).toHaveLength(5);

    // Clinical evidence / literature start honestly empty: "none recorded",
    // not an implied completed systematic review.
    expect(structure.clinicalEvidence.content.sources).toEqual([]);
    expect(structure.clinicalEvidence.content.overview).toMatch(
      /no clinical evidence has been recorded/i,
    );
    expect(structure.literatureReview.content.results).toEqual([]);
    expect(structure.literatureReview.content.databases).toEqual([]);
    expect(structure.literatureReview.content.searchStrategy).toMatch(
      /no literature search has been recorded/i,
    );

    // Conclusions no longer claim the device "meets all applicable
    // requirements" or that the benefit-risk analysis is favorable.
    const conclusions = JSON.stringify(structure.conclusions);
    expect(conclusions).not.toMatch(/meets all applicable requirements/i);
    expect(conclusions).not.toMatch(/analysis is favorable/i);

    // Executive summary does not pre-assert an acceptable benefit-risk profile.
    expect(JSON.stringify(structure.executiveSummary)).not.toMatch(
      /demonstrates an acceptable benefit-risk/i,
    );
  });

  it('the risk-benefit conclusion never claims benefits outweigh risks for an empty analysis', async () => {
    const structure = await svc.buildCerStructure(device, {}, options);
    // Raw device profiles carry no benefits/risks arrays — the ratio is
    // indeterminate and the conclusion must not assert the opposite.
    expect(structure.riskBenefitAnalysis.content.benefitRiskRatio).toBe('Needs review');
    expect(structure.riskBenefitAnalysis.content.conclusion).not.toMatch(
      /benefits outweigh the residual risks/i,
    );
  });
});
