/**
 * The Module 1 placement copies, held to the one FDA contract.
 *
 * `ctd-registry-consistency.test.ts` registers the copies that agree with the record and says, in
 * its own header, that "a copy that does NOT agree today gets its own file,
 * tests/regulatory/ctd-registry/<registry>.consistency.test.ts, written failing first by the step
 * that fixes it, so parallel lanes never share a test file." This is that file for the Module 1
 * placement step; one file rather than five, because one step fixes all five copies and the reason
 * for the convention is lane isolation, which one file gives just as well.
 *
 * WHAT THESE COPIES SAID, and why it is not a numbering quibble. A sponsor at a 40-person biotech
 * does not own a copy of FDA's regional Module 1 controlled vocabulary. They accept the number the
 * platform gives them. Before this step:
 *
 *   - "investigator's brochure" routed to 1.3.3. US 1.3.3 is DEBARMENT CERTIFICATION
 *     (21 USC 335a), and it applies to marketing applications only — it is not a node an IND has.
 *     The IB's own node, 1.14.4.1, was already in the record with its citation (21 CFR 312.23(a)(5)).
 *   - "risk management | rmp" routed to 1.5.1. US 1.5 is APPLICATION STATUS — "withdrawal,
 *     inactivation, reactivation and reinstatement requests" — and it has no child sections at all.
 *     So the platform proposed filing a sponsor's risk-management document under the heading whose
 *     controlled meaning is that they are withdrawing the IND.
 *   - "form 1572" routed to 1.3.1, which is Contact/Sponsor/Applicant Information. Every FDA
 *     transmittal form belongs under 1.1 Forms.
 *   - "cover letter" routed to 1.1 and "table of contents" to 1.2. They were swapped and then some:
 *     1.1 is Forms, 1.2 is the Cover Letter, and the table of contents is not a Module 1 heading at
 *     all — the XML backbone is the table of contents.
 *   - an uploaded IB was filed into module-5 / 5.3, the Mission Control IND scaffold created it as
 *     a module-5 artifact, and the IND pyramid bound its task to 5.3.5.4 — all three Module 5,
 *     where the CLINICAL STUDY REPORTS live. `shared/regulatory/global-document-registry.ts:271`
 *     already condemns exactly this: "an M5 assignment puts it in the wrong backbone node and the
 *     sequence does not validate."
 *
 * Every row above failed here before the step, and each failure named the row. All five copies are
 * now registered in `ctd-registry-consistency.test.ts`, which holds their whole trees — Module 1
 * and Modules 2–5 — to the contract from here on. What stays in this file is what the contract
 * alone cannot see: that a null is an answer rather than a gap, that the backbone is the table of
 * contents, and that the two copies stating a module rather than a code state the right one.
 */
import { describe, expect, it } from 'vitest';

describe('the rows that are wrong in a way the contract alone cannot see', () => {
  it("a risk-management document is not proposed for the heading that means 'withdrawing the IND'", async () => {
    const { detectCTDSection } = await import('../../../server/services/ctd-ingestion-service');
    const r = detectCTDSection('Risk Management Plan.pdf') as { module: number | null; section: string | null } | null;
    // US 1.5 is Application Status — withdrawal, inactivation, reactivation, reinstatement — and it
    // has no children. There is no US node for an "RMP": FDA has REMS (1.16) and risk management
    // that is not a REMS. The record's answer is "no node", and the caller must ask.
    expect(r?.section).not.toBe('1.5.1');
    expect(r?.section ?? null).toBeNull();
    // And a null section is not a null answer: the module is still named, so the caller knows the
    // document is a Module 1 document whose heading it must choose.
    expect(r?.module).toBe(1);
  });

  it('the table of contents is not given a Module 1 heading, because the backbone is the table of contents', async () => {
    const { detectDocumentType } = await import('../../../server/services/ana-ri/document-routing');
    const r = detectDocumentType('draft the table of contents') as { sectionCode?: string } | null;
    expect(r?.sectionCode).not.toBe('1.2');
  });

  it("an uploaded investigator's brochure is not filed where the clinical study reports live", async () => {
    const { TEXT_RULES } = await import('../../../server/services/vault/vault-filing.service');
    const ib = TEXT_RULES.find((r) => r.label === "investigator's brochure body");
    expect(ib, 'the IB filing rule was not found in vault-filing.service.ts').toBeTruthy();
    expect(ib?.folder).not.toBe('module-5');
    expect(ib?.folder).toBe('module-1');
    expect(ib?.ctdSection).toBe('1.14.4.1');
  });

  it("a body phrase does not file a document as settled: it is medium confidence, so it asks", async () => {
    // The IB rule is reached by a sentence in the document's text when the filename classified
    // nothing. It returned needsReview:false, so a medium-confidence guess read as a determination.
    const src = (await import('node:fs')).readFileSync(
      new URL('../../../server/services/vault/vault-filing.service.ts', import.meta.url),
      'utf8',
    );
    const textRuleReturn = src.slice(src.indexOf('for (const rule of TEXT_RULES)'));
    expect(textRuleReturn.slice(0, 1400)).toContain("confidence: 'medium'");
    expect(textRuleReturn.slice(0, 1400)).toContain('needsReview: true');
  });
});

describe('the two copies that state a module rather than a Module 1 heading', () => {
  it('the Mission Control IND scaffold does not create the IB as a Module 5 artifact', async () => {
    const { IND_IB_SCAFFOLD_ROWS } = await import('../../../server/routes/mission-control');
    expect(IND_IB_SCAFFOLD_ROWS).toHaveLength(1);
    const row = IND_IB_SCAFFOLD_ROWS[0];
    expect(row.module).not.toBe('module-5');
    expect(row.module).toBe('module-1');
    expect(row.section).toBe('1.14.4.1');
    // And the template a scaffold request walks is the one holding this row.
    const src = (await import('node:fs')).readFileSync(
      new URL('../../../server/routes/mission-control.ts', import.meta.url),
      'utf8',
    );
    const ind = src.slice(src.indexOf('      IND: ['), src.indexOf("      '510K': ["));
    expect(ind).toContain('...IND_IB_SCAFFOLD_ROWS');
    expect(ind).not.toMatch(/Investigator'?s? Brochure/);
  });

  it("the IND pyramid binds the IB task to the IB's own heading, not to the study reports", async () => {
    // `buildPhase` prefixes each task id with its phase, so the id is "phaseN.investigator_brochure".
    const { buildIndPyramid } = await import('../../../services/regulatory/pyramids/ind-pyramid');
    const ib = buildIndPyramid().phases.flatMap((p) => p.tasks).find((t) => t.id.endsWith('.investigator_brochure'));
    expect(ib, 'the investigator_brochure task was not found in the IND pyramid').toBeTruthy();
    const binding = ib?.documentBindings?.[0];
    expect(binding?.ctdSection).not.toBe('5.3.5.4');
    expect(binding?.ctdSection).toBe('1.14.4.1');
  });

  it('the IND pyramid cites the IB guideline that is in force, not the one it superseded', async () => {
    // Trunk already carries E6(R3) as the record (`shared/regulatory/ich-e6r3.ts`); E6(R2) Section 7
    // is the superseded numbering for the same content, now Appendix A (`E6R2_TO_R3['7']`).
    const { buildIndPyramid } = await import('../../../services/regulatory/pyramids/ind-pyramid');
    const ib = buildIndPyramid().phases.flatMap((p) => p.tasks).find((t) => t.id.endsWith('.investigator_brochure'));
    expect(ib, 'the investigator_brochure task was not found in the IND pyramid').toBeTruthy();
    expect(JSON.stringify(ib)).not.toContain('E6(R2)');
    expect(JSON.stringify(ib)).toContain('E6(R3) Appendix A');
  });
});
