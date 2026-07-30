import { describe, it, expect } from 'vitest';
import { resolveSectionRequirements } from '../AnaDocumentDraftingService';

/**
 * The generic drafting engine must ground every draft in the section blueprint,
 * not just the framework-level system prompt. resolveSectionRequirements is the
 * pure resolver that injects the governing standard + content type + required
 * flag for (submissionType, sectionType).
 */
describe('resolveSectionRequirements — blueprint grounding', () => {
  it('grounds a drug CMC section in its ICH guidance (matched by code or title)', () => {
    for (const sectionType of ['3.2.S', 'Drug Substance', 'drug substance']) {
      const req = resolveSectionRequirements('US_IND', sectionType);
      expect(req, `US_IND / ${sectionType}`).not.toBeNull();
      expect(req).toContain('Drug Substance');
      expect(req).toContain('Governing standard: ICH M4Q');
      expect(req).toContain('REQUIRED section');
    }
  });

  it('grounds a device section in the device blueprint (not the drug CTD)', () => {
    const req = resolveSectionRequirements('US_510K', 'Substantial Equivalence');
    expect(req).not.toBeNull();
    expect(req).toContain('Substantial Equivalence');
    expect(req).toContain('510(k)');
  });

  it('grounds an IVD performance section for an IVD marketing type', () => {
    const req = resolveSectionRequirements('US_510K_IVD', 'Analytical Performance');
    expect(req).not.toBeNull();
    expect(req).toContain('Analytical Performance');
  });

  it('returns null when the submission type is absent or unresolvable', () => {
    expect(resolveSectionRequirements(undefined, 'Drug Substance')).toBeNull();
    expect(resolveSectionRequirements('NOT_A_REAL_TYPE', 'Drug Substance')).toBeNull();
  });

  it('returns null for a section the blueprint does not contain', () => {
    expect(resolveSectionRequirements('US_IND', 'Totally Fabricated Section 99')).toBeNull();
  });
});
