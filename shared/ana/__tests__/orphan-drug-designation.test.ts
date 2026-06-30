/**
 * Unit tests for the shared Orphan Drug Designation (E4) core: the
 * §316.20/§316.21 required-section checklist, the required_strings derivation,
 * the authored-plan/verification pass-fail, and the 21 CFR Part 11 honesty
 * contract (no prevalence claim without a cited source; sample drafts are
 * non-sealable/exportable).
 */
import { describe, it, expect } from 'vitest';
import {
  ODD_REQUIRED_SECTIONS,
  ODD_CITATION_REQUIRED_SECTION_IDS,
  oddRequiredStrings,
  buildOddAuthoringPlan,
  evaluateOddVerification,
  assessOddSealability,
  type OddProductInput,
} from '../orphan-drug-designation';

const SAMPLE_PRODUCT: OddProductInput = {
  name: 'ABC-123',
  genericName: 'abcimab',
  brandName: 'Abcira',
  indication: 'relapsed/refractory AML',
  modality: 'biologic',
  designations: ['orphan'],
  sponsorName: 'Concept2Cure Therapeutics',
  sponsorAddress: '1 Harbor Way, Boston, MA',
  contactName: 'Dr. R. Reviewer',
  fdaDivision: 'DHRR',
};

describe('ODD §316.20/§316.21 checklist completeness', () => {
  it('enumerates the mandatory §316.20(b) + §316.21 elements with stable ids', () => {
    // §316.20(b)(1)-(8) contents + §316.21(b)/(c) basis = 9 mandatory sections.
    expect(ODD_REQUIRED_SECTIONS).toHaveLength(9);
    const ids = ODD_REQUIRED_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // ids unique
    expect(ids).toEqual([
      'sponsor_statement',
      'sponsor_identity',
      'drug_description',
      'disease_description',
      'scientific_rationale',
      'same_drug_summary',
      'population_estimate',
      'cost_recovery_basis',
      'contact_certification',
    ]);
  });

  it('cites 21 CFR Part 316 for every section and flags the prevalence/eligibility sections', () => {
    for (const s of ODD_REQUIRED_SECTIONS) {
      expect(s.citation).toMatch(/^21 CFR 316\.2[01]/);
      expect(s.header.length).toBeGreaterThan(8);
    }
    expect(ODD_CITATION_REQUIRED_SECTION_IDS).toEqual(['population_estimate', 'cost_recovery_basis']);
  });
});

describe('required_strings derivation', () => {
  it('derives required_strings 1:1 from the checklist headers (no drift)', () => {
    const req = oddRequiredStrings();
    expect(req).toEqual(ODD_REQUIRED_SECTIONS.map((s) => s.header));
    expect(req).toHaveLength(9);
  });

  it('a built plan carries exactly the checklist headers as required_strings', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'live' });
    expect(plan.requiredStrings).toEqual(oddRequiredStrings());
  });
});

describe('verify pass/fail against required headers', () => {
  it('passes when every required §316.20/§316.21 header is present', () => {
    const plan = buildOddAuthoringPlan({
      product: SAMPLE_PRODUCT,
      provenance: 'live',
      citations: [
        { sectionId: 'population_estimate', label: 'US AML prevalence', source: 'PMID:12345678' },
        { sectionId: 'cost_recovery_basis', label: 'cost model', source: 'doi:10.1000/x' },
      ],
    });
    const v = evaluateOddVerification(plan.content);
    expect(v.ok).toBe(true);
    expect(v.requiredStringsChecked).toBe(9);
    expect(v.missingRequiredStrings).toEqual([]);
  });

  it('fails and names the missing section when a required header is absent', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'live' });
    const missingHeader = ODD_REQUIRED_SECTIONS[3].header;
    const broken = plan.content.replace(missingHeader, 'X. Tampered Heading');
    const v = evaluateOddVerification(broken);
    expect(v.ok).toBe(false);
    expect(v.missingRequiredStrings).toContain(missingHeader);
  });
});

describe('honesty guard — no prevalence claim without a cited source', () => {
  it('emits an UNRESOLVED marker (no number) and flags the section when no source is supplied', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'live' });
    expect(plan.uncitedClaimSections).toEqual(['population_estimate', 'cost_recovery_basis']);
    expect(plan.content).toContain('[UNRESOLVED — 21 CFR 316.21(b)');
    // The "fewer than 200,000" asserted-claim phrasing must NOT appear without a citation.
    expect(plan.content).not.toContain('affects fewer than 200,000 persons in the United States, supported by');
  });

  it('asserts the claim only once a cited source is provided', () => {
    const plan = buildOddAuthoringPlan({
      product: SAMPLE_PRODUCT,
      provenance: 'live',
      citations: [{ sectionId: 'population_estimate', label: 'US AML prevalence', source: 'PMID:12345678' }],
    });
    expect(plan.uncitedClaimSections).toEqual(['cost_recovery_basis']);
    expect(plan.content).toContain('PMID:12345678');
    expect(plan.content).toContain('affects fewer than 200,000 persons in the United States, supported by');
  });

  it('ignores citations whose source string is blank', () => {
    const plan = buildOddAuthoringPlan({
      product: SAMPLE_PRODUCT,
      provenance: 'live',
      citations: [{ sectionId: 'population_estimate', label: 'empty', source: '   ' }],
    });
    expect(plan.uncitedClaimSections).toContain('population_estimate');
  });
});

describe('21 CFR Part 11 sealability gate', () => {
  const fullyCited = {
    citations: [
      { sectionId: 'population_estimate', label: 'p', source: 'PMID:1' },
      { sectionId: 'cost_recovery_basis', label: 'c', source: 'doi:10.1/x' },
    ],
  } as const;

  it('blocks sealing/export for sample provenance even when verified and cited', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'sample', ...fullyCited });
    const verdict = assessOddSealability({
      provenance: plan.provenance,
      verification: evaluateOddVerification(plan.content),
      uncitedClaimSections: plan.uncitedClaimSections,
    });
    expect(verdict.sealable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/sample/i);
  });

  it('blocks not_assessed provenance', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'not_assessed', ...fullyCited });
    const verdict = assessOddSealability({
      provenance: plan.provenance,
      verification: evaluateOddVerification(plan.content),
      uncitedClaimSections: plan.uncitedClaimSections,
    });
    expect(verdict.sealable).toBe(false);
  });

  it('blocks a live draft that still has an uncited prevalence claim', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'live' });
    const verdict = assessOddSealability({
      provenance: plan.provenance,
      verification: evaluateOddVerification(plan.content),
      uncitedClaimSections: plan.uncitedClaimSections,
    });
    expect(verdict.sealable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/cited source/i);
  });

  it('seals a live, fully-verified, fully-cited draft', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'live', ...fullyCited });
    const verdict = assessOddSealability({
      provenance: plan.provenance,
      verification: evaluateOddVerification(plan.content),
      uncitedClaimSections: plan.uncitedClaimSections,
    });
    expect(verdict.sealable).toBe(true);
    expect(verdict.blockers).toEqual([]);
  });

  it('blockers are factual and emoji-free', () => {
    const plan = buildOddAuthoringPlan({ product: SAMPLE_PRODUCT, provenance: 'sample' });
    const verdict = assessOddSealability({
      provenance: plan.provenance,
      verification: evaluateOddVerification(plan.content),
      uncitedClaimSections: plan.uncitedClaimSections,
    });
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const b of verdict.blockers) expect(emoji.test(b)).toBe(false);
  });
});
