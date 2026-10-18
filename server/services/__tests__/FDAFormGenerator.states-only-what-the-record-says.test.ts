/**
 * The 510(k) form drafts state only what the record says, and an unsigned
 * certification reads as unsigned.
 *
 * Until 2026-10-15:
 *   - Form 3514 printed "Traditional 510(k)" for every project; the charter
 *     records traditional / special / abbreviated (K510Config.submissionSubtype).
 *   - Form 3654 completeness was computed over four name fields only, so a
 *     certification with every attestation unchecked read 100%, and the route
 *     stored that as the form's complianceScore.
 *   - Form 3654 fell back to the project lead as certifier and printed that
 *     name in the Signature slot of a certification nobody had signed.
 *   - Form 3601 labelled the fee "FY 2025 Fee Amount" whatever year applied.
 */
import { describe, expect, it } from 'vitest';
import FDAFormGenerator from '../FDAFormGenerator';

const gen = new FDAFormGenerator();
const device = {
  organization: { name: 'Acme Devices' },
  fda510kProject: { deviceName: 'Widget', deviceClassification: 'Class II', productCode: 'ABC' },
};

describe('Form 3514: the 510(k) type is the charter\'s', () => {
  it('says the type is not stated when the charter records none, and counts it as missing', async () => {
    const out = await gen.generateForm3514(device);
    expect(out.formData.submissionType).toBeNull();
    expect(out.htmlContent).not.toContain('Traditional 510(k)');
    expect(out.htmlContent).toMatch(/Submission Type:<\/span>\s*<span class="field-value">Not stated/);
    expect(out.completeness).toBeLessThan(100);
  });

  it.each([
    ['traditional', 'Traditional 510(k)'],
    ['special', 'Special 510(k)'],
    ['abbreviated', 'Abbreviated 510(k)'],
  ])('prints the charter\'s %s subtype', async (subtype, label) => {
    const out = await gen.generateForm3514({ ...device, charter: { k510Config: { submissionSubtype: subtype } } });
    expect(out.formData.submissionType).toBe(label);
    expect(out.htmlContent).toContain(label);
    expect(out.completeness).toBe(100);
  });
});

describe('Form 3654: completeness covers the attestations; the signature slot stays blank', () => {
  const named = {
    ...device,
    workflowData: { certification: { certifierName: 'Dana Doe', certifierTitle: 'VP Regulatory' } },
  };

  it('is not 100% complete while every attestation is unchecked', async () => {
    const out = await gen.generateForm3654(named);
    expect(out.completeness).toBeLessThan(100);
  });

  it('is 100% complete once every attestation is made', async () => {
    const out = await gen.generateForm3654({
      ...device,
      workflowData: {
        certification: {
          certifierName: 'Dana Doe', certifierTitle: 'VP Regulatory',
          certificationStatement: true, deviceCompliance: true, truthfulStatement: true,
          clinicalStudiesConducted: true, financialInterests: false,
        },
      },
    });
    expect(out.completeness).toBe(100);
  });

  it('does not name the project lead as certifier', async () => {
    const out = await gen.generateForm3654({ ...device, workflowData: { setup: { projectLead: 'Pat Lead' } } });
    expect(out.formData.certifierName).toBe('');
    expect(out.htmlContent).not.toContain('Pat Lead');
  });

  it('prints the named certifier as the typed name, never in the signature slot', async () => {
    const out = await gen.generateForm3654(named);
    const html: string = out.htmlContent;
    const signature = /<strong>Signature:<\/strong>([\s\S]*?)<\/span>/.exec(html);
    expect(signature).not.toBeNull();
    expect(signature![1].trim()).toBe('');
    expect(/<strong>Typed Name:<\/strong>([\s\S]*?)<\/span>/.exec(html)![1].trim()).toBe('Dana Doe');
  });
});

describe('Form 3601: the fee year is the filer\'s', () => {
  it('does not print a fiscal year nobody stated', async () => {
    const out = await gen.generateForm3601({ ...device, workflowData: { feeInfo: { feeAmount: 21760 } } });
    expect(out.htmlContent).not.toMatch(/FY 20\d\d/);
    expect(out.htmlContent).toContain('Fee Amount (fiscal year not stated):');
  });

  it('labels the fee with the fiscal year the filer stated', async () => {
    const out = await gen.generateForm3601({ ...device, workflowData: { feeInfo: { feeAmount: 21760, fiscalYear: 2027 } } });
    expect(out.htmlContent).toContain('FY 2027 Fee Amount:');
  });
});
