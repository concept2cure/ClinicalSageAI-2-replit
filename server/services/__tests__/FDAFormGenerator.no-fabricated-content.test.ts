/**
 * Regression guard: the SMART-forms generator must never assert a regulatory
 * fact the filer did not provide. A 510(k) cover sheet that fabricates a device
 * class, an affirmative clinical-studies certification, or a fee posture is a
 * legal misstatement to FDA. Pins the fix in "fix(fda-forms): stop fabricating
 * device class, clinical-studies certification, and fee posture".
 */
import { describe, it, expect } from 'vitest';
import FDAFormGenerator from '../FDAFormGenerator';

describe('FDAFormGenerator — no fabricated regulatory content', () => {
  it('Form 3514 does not fabricate a device classification of "Class II"', async () => {
    const gen = new FDAFormGenerator();
    // No fda510kProject, no formData → classification was never established.
    const out = await gen.generateForm3514({});
    expect(out.formData.deviceClass).toBe('Not Specified');
    expect(out.formData.deviceClass).not.toBe('Class II');
    // The fabricated value must not be counted as a completed required field.
    // (required: applicantName, deviceName, deviceClass, productCode — all unset)
    expect(out.completeness).toBe(0);
  });

  it('Form 3654 does not auto-certify "clinical studies WERE NOT conducted"', async () => {
    const gen = new FDAFormGenerator();
    // No explicit certification input → the attestation was never made.
    const out = await gen.generateForm3654({});
    expect(out.formData.clinicalStudies).toBeUndefined();
    // Neither the "WERE conducted" nor the "WERE NOT conducted" box is pre-checked.
    const html: string = out.htmlContent;
    const notConductedIdx = html.indexOf('WERE NOT conducted');
    const notConductedInput = html.lastIndexOf('<input', notConductedIdx);
    expect(html.slice(notConductedInput, notConductedIdx)).not.toContain('checked');
    const conductedIdx = html.indexOf('WERE conducted');
    const conductedInput = html.lastIndexOf('<input', conductedIdx);
    expect(html.slice(conductedInput, conductedIdx)).not.toContain('checked');
  });

  it('Form 3654 does not fabricate the certifier\'s title (Part 11 capacity)', async () => {
    const gen = new FDAFormGenerator();
    // No certifierTitle input → the signer's capacity was never stated.
    const out = await gen.generateForm3654({});
    expect(out.formData.certifierTitle).toBe('');
    // The old 'Regulatory Affairs Manager' default put an invented capacity into
    // the "in my capacity as <title>" certification and the signature block.
    expect(out.htmlContent).not.toContain('Regulatory Affairs Manager');
    // An unstated title must not count toward completeness.
    expect(out.completeness).toBeLessThan(100);
    // A stated title still renders and counts.
    const filled = await gen.generateForm3654({
      workflowData: { certification: { certifierName: 'Dana Doe', certifierTitle: 'VP Regulatory' } },
      organization: { name: 'Acme' },
      fda510kProject: { deviceName: 'Widget' },
    });
    expect(filled.formData.certifierTitle).toBe('VP Regulatory');
    expect(filled.htmlContent).toContain('VP Regulatory');
  });

  it('Form 3654 does not auto-check "No financial interests to disclose" when none is stated', async () => {
    const gen = new FDAFormGenerator();
    // The financial-disclosure section renders only when clinical studies were
    // conducted; that is the exact scenario where the old `|| false` default
    // pre-checked the affirmative "none to disclose".
    const out = await gen.generateForm3654({
      workflowData: { certification: { clinicalStudiesConducted: true } },
    });
    expect(out.formData.financialInterests).toBeUndefined();
    const html: string = out.htmlContent;
    const noIdx = html.indexOf('No financial interests to disclose');
    expect(noIdx).toBeGreaterThan(-1);
    const noInput = html.lastIndexOf('<input', noIdx);
    // Undefined → the "none to disclose" affirmation is NOT pre-checked.
    expect(html.slice(noInput, noIdx)).not.toContain('checked');
    // Nor is its opposite: an unanswered form asserts neither Part 54 posture.
    const yesIdx = html.indexOf('Financial interests disclosed');
    expect(yesIdx).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf('<input', yesIdx), yesIdx)).not.toContain('checked');
    // An explicit "no interests" declaration DOES check the affirmation.
    const declared = await gen.generateForm3654({
      workflowData: { certification: { clinicalStudiesConducted: true, financialInterests: false } },
    });
    const dHtml: string = declared.htmlContent;
    const dNoIdx = dHtml.indexOf('No financial interests to disclose');
    const dNoInput = dHtml.lastIndexOf('<input', dNoIdx);
    expect(dHtml.slice(dNoInput, dNoIdx)).toContain('checked');
  });

  it('Form 3601 does not fabricate the fee amount, category, or small-business status', async () => {
    const gen = new FDAFormGenerator();
    // No feeInfo → the fee posture was never provided.
    const out = await gen.generateForm3601({});
    expect(out.formData.feeAmount).toBeNull();
    expect(out.formData.feeCategory).toBe('Not Specified');
    expect(out.formData.smallBusiness).toBeUndefined();
    // The full standard fee must not appear as a fabricated default.
    expect(out.htmlContent).not.toContain('19,870');
    expect(out.completeness).toBe(0);
  });

  it('Form 3881 does not default a device to Prescription Use', async () => {
    const gen = new FDAFormGenerator();
    // No device_information at all → the 21 CFR 801 Subpart D / OTC split was
    // never answered, so neither classification may be asserted.
    const out = await gen.generateForm3881({});
    expect(out.formData.prescriptionUse).toBe(false);
    expect(out.formData.overCounterUse).toBe(false);
    const html: string = out.htmlContent;
    for (const label of ['<strong>Prescription Use</strong>', '<strong>Over-The-Counter Use</strong>']) {
      const labelIdx = html.indexOf(label);
      expect(labelIdx).toBeGreaterThan(-1);
      const inputIdx = html.lastIndexOf('<input', labelIdx);
      expect(html.slice(inputIdx, labelIdx)).not.toContain('checked');
    }
  });
});
