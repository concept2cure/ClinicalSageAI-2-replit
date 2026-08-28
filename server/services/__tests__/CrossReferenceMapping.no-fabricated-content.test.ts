/**
 * Regression guard: the eSTAR cross-reference mapper must never assert a
 * regulatory fact the filer did not provide.
 *
 * This is the OTHER implementation of the same four 510(k) forms. The sibling
 * FDAFormGenerator was fixed in "fix(fda-forms): stop fabricating device class,
 * clinical-studies certification, and fee posture"; this mapper — the one wired
 * into POST /api/510k/:projectId/generate-documents via
 * DocumentOrchestrationService.generateFDAForms — kept every one of those
 * fabrications and several worse ones.
 *
 * WHY THESE ARE NOT COSMETIC DEFAULTS. assembleDocument's output is persisted to
 * fda510k_documents.content and later sealed by lockDocument(), which stamps a
 * SHA-256 over that content. So an invented value does not stay a placeholder:
 * it becomes part of an immutable 510(k) record that an FDA reviewer reads as
 * the applicant's own statement — and Form 3654 prints the debarment warning
 * ("significant penalties for submitting false information") directly beneath
 * the certifications this file used to tick on the signer's behalf.
 */
import { describe, it, expect } from 'vitest';
import { CrossReferenceMapper } from '../CrossReferenceMapping';

const ORG = 1;

describe('CrossReferenceMapper — no fabricated regulatory content', () => {
  it('does not certify, on the signer\'s behalf, that they reviewed the submission', async () => {
    const m = new CrossReferenceMapper();
    // Nothing supplied: no certification was ever made by anyone.
    const forms = await m.mapDataToFDAForms({}, ORG);
    expect(forms.FDA_3654.certification_statement).toBeUndefined();

    const out = await m.assembleDocument(1, 'FDA_3654', {});
    // The three review/accuracy/completeness boxes were literal ☑ in the
    // template — asserted with no input at all. None may be ticked.
    expect(out.content).not.toContain('☑ I have reviewed the information');
    expect(out.content).not.toContain('☑ The information provided is complete and accurate');
    expect(out.content).not.toContain('☑ All required documentation is included');
    expect(out.content).toContain('☐ I have reviewed the information');
  });

  it('does not stamp an execution date for a signature nobody applied', async () => {
    const m = new CrossReferenceMapper();
    const forms = await m.mapDataToFDAForms({}, ORG);
    expect(forms.FDA_3654.signature_date).toBe('');

    const out = await m.assembleDocument(1, 'FDA_3654', {});
    // The render clock is not a signing event (21 CFR Part 11).
    const today = new Date().toISOString().split('T')[0];
    expect(out.content).not.toContain(`Date: ${today}`);
    expect(out.content).toContain('Date: Not signed');
  });

  it('does not turn unanswered disclosures into affirmative negatives', async () => {
    const m = new CrossReferenceMapper();
    const forms = await m.mapDataToFDAForms({}, ORG);
    expect(forms.FDA_3654.clinical_studies).toBeUndefined();
    expect(forms.FDA_3654.financial_interests).toBeUndefined();

    const out = await m.assembleDocument(1, 'FDA_3654', {});
    // "No financial interests to disclose" is a 21 CFR Part 54 certification,
    // not a blank. Absence of an answer is not that answer.
    expect(out.content).not.toContain('No financial interests to disclose');
    expect(out.content).toContain('Financial Interests Disclosure: Not stated');
    expect(out.content).toContain('Clinical Studies Conducted: Not stated');
  });

  it('records a stated disclosure faithfully — the guard must not swallow real answers', async () => {
    const m = new CrossReferenceMapper();
    const out = await m.assembleDocument(1, 'FDA_3654', {
      certificationInfo: { financialInterests: false, certificationStatement: true },
      clinicalData: { hasStudies: true },
    });
    // An explicit "no financial interests" IS the certification, and prints.
    expect(out.content).toContain('No financial interests to disclose');
    expect(out.content).toContain('Clinical Studies Conducted: Yes');
    expect(out.content).toContain('☑ I have reviewed the information');
  });

  it('does not invent the capacity in which the person certifies', async () => {
    const m = new CrossReferenceMapper();
    const forms = await m.mapDataToFDAForms({}, ORG);
    // The title is the legal capacity of the certifier, not a label.
    expect(forms.FDA_3654.certifier_title).toBe('');
    expect(forms.FDA_3654.certifier_title).not.toBe('Regulatory Affairs Manager');
  });

  it('does not declare the device prescription-use from an unset field', async () => {
    const m = new CrossReferenceMapper();
    const forms = await m.mapDataToFDAForms({}, ORG);
    // This was `prescriptionUse !== false`, so absence became TRUE — the one
    // default here that fabricated in the affirmative, declaring the device's
    // labeling regime on Form 3881.
    expect(forms.FDA_3881.prescription_use).toBeUndefined();
    expect(forms.FDA_3881.over_counter_use).toBeUndefined();

    const out = await m.assembleDocument(1, 'FDA_3881', {});
    expect(out.content).not.toContain('Prescription Use (Part 21 CFR 801 Subpart D): ☑');
  });

  it('does not fabricate the fee posture or the submission pathway', async () => {
    const m = new CrossReferenceMapper();
    const forms = await m.mapDataToFDAForms({}, ORG);
    expect(forms.FDA_3601.fee_category).toBe('Not Specified');
    expect(forms.FDA_3601.payment_method).toBe('Not Specified');
    // false here is an affirmative "not a small business" — a claim about the
    // applicant that misstates the MDUFA fee owed by one that is.
    expect(forms.FDA_3601.small_business).toBeUndefined();
    // Special and Abbreviated 510(k)s carry different requirements and clocks.
    expect(forms.FDA_3514.submission_type).toBe('Not Specified');

    const out = await m.assembleDocument(1, 'FDA_3601', {});
    // Anchored to end-of-line: 'Not stated' begins with 'No', so a bare
    // toContain('…: No') matches the honest output and the assertion passes
    // for the wrong reason.
    expect(out.content).not.toMatch(/Small Business Certification: No$/m);
    expect(out.content).toMatch(/Small Business Certification: Not stated$/m);
  });
});
