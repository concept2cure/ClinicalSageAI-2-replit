/**
 * The FDA-form exception holds only while a reader sees FDA's own security.
 *
 * 2026-09-22 (W5/D7), from the adversarial review of leaf-pdf-security: the
 * text checks passed every one of these as "an FDA form as issued", and pdf.js
 * demanded a password to open each of them.
 */
import { describe, it, expect } from 'vitest';
import { assessLeafPdfSecurity } from '../leaf-pdf-security';
import { generateIndForm } from '../../ind-forms/ind-form-fill-service';
import { SECURED_PDF, UNSECURED_PDF, estarWithAttachment, tamperKit } from './fixtures/fda-form-tamper';

const kit = tamperKit();
const NEW_ID = '00112233445566778899AABBCCDDEEFF';

describe('FDA form whose encryption was redefined after FDA issued it', () => {
  for (const header of ['047 0 obj', '47 00 obj', '47 0%c\nobj']) {
    it(`is refused when object 47 is redefined as ${JSON.stringify(header)}`, async () => {
      const v = await assessLeafPdfSecurity(kit.redefinedAs(header), 'fda');
      expect(v.verdict).toBe('secured');
    });
  }

  it('is refused when object 47 is redefined inside an object stream', async () => {
    const v = await assessLeafPdfSecurity(kit.redefinedInObjectStream(), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/password/);
  });

  it('is refused when the appended trailer carries a different document ID (the R4 key changes)', async () => {
    const v = await assessLeafPdfSecurity(kit.withTrailerId('00112233445566778899AABBCCDDEEFF'), 'fda');
    expect(v.verdict).toBe('secured');
  });

  it('is refused when the appended trailer drops the document ID', async () => {
    const v = await assessLeafPdfSecurity(kit.withTrailerId(null), 'fda');
    expect(v.verdict).toBe('secured');
  });

  it('still accepts an update that keeps FDA\'s dictionary and document ID', async () => {
    const v = await assessLeafPdfSecurity(kit.withTrailerId(kit.templateId0), 'fda');
    expect(v).toMatchObject({ verdict: 'fda-form-as-issued', formId: 'FDA_1571' });
  });
});

/*
 * 2026-09-23 (W5/D7, round-2 review). pdf.js was the only check of the /ID and
 * /Encrypt a reader uses, and pdf.js recovers from a cross-reference stream it
 * cannot parse by falling back to the template's own trailer. A type-3 entry
 * (ISO 32000-1 Table 18: a reference to the null object) is enough: pdf.js
 * opened these with FDA's /ID, while qpdf and pypdf follow the appended
 * section, as the spec requires, and ask for a password.
 */
describe('FDA form whose appended cross-reference section a conformant reader follows and pdf.js does not', () => {
  it('is refused when the update carries a new document ID behind a type-3 entry', async () => {
    const v = await assessLeafPdfSecurity(kit.xrefStreamUpdate({ id: NEW_ID, encrypt: true, type3: true }), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/document ID/);
  });

  it('is refused when the update drops /Encrypt behind a type-3 entry', async () => {
    const v = await assessLeafPdfSecurity(kit.xrefStreamUpdate({ id: kit.templateId0, encrypt: false, type3: true }), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/\/Encrypt/);
  });

  it('is refused when the final startxref does not point at the section the update adds', async () => {
    const v = await assessLeafPdfSecurity(kit.xrefStreamUpdate({ id: kit.templateId0, encrypt: true, startxrefDelta: 3 }), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/startxref/);
    // Pointed back at FDA's own section, the appended one is never read.
    const fdaStartxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(kit.template.toString('latin1'))![1]);
    const back = await assessLeafPdfSecurity(
      kit.xrefStreamUpdate({ id: kit.templateId0, encrypt: true, startxrefDelta: fdaStartxref - (kit.template.length + 1) }),
      'fda',
    );
    expect(back.verdict).toBe('secured');
  });

  it('is refused when the update moves object 47 into an object stream behind a type-3 entry', async () => {
    const v = await assessLeafPdfSecurity(kit.redefinedInObjectStream({ type3: true }), 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/object 47, FDA's encryption dictionary/);
  });

  it("still accepts a well-formed cross-reference stream that keeps FDA's /Encrypt and /ID", async () => {
    const v = await assessLeafPdfSecurity(kit.xrefStreamUpdate({ id: kit.templateId0, encrypt: true }), 'fda');
    expect(v).toMatchObject({ verdict: 'fda-form-as-issued', formId: 'FDA_1571' });
  });

  it('still accepts the platform-filled 1571 and 3674', async () => {
    for (const id of ['FDA_1571', 'FDA_3674']) {
      const filled = Buffer.from((await generateIndForm(id, { sponsorName: 'Sponsor', indNumber: '162045', serialNumber: '0000' } as never)).pdfBytes);
      expect(await assessLeafPdfSecurity(filled, 'fda')).toMatchObject({ verdict: 'fda-form-as-issued', formId: id });
    }
  });

  it("reads the document ID as bytes: FDA's /ID[0] spelled as a literal string is still FDA's", async () => {
    expect(await assessLeafPdfSecurity(kit.withTrailerId(kit.templateId0, { literal: true }), 'fda')).toMatchObject({ verdict: 'fda-form-as-issued' });
    expect((await assessLeafPdfSecurity(kit.withTrailerId(NEW_ID, { literal: true }), 'fda')).verdict).toBe('secured');
  });

  it("still accepts a later save on top of the platform's fill (a /Prev chain of two updates)", async () => {
    const filled = Buffer.from((await generateIndForm('FDA_1571', { sponsorName: 'Sponsor', indNumber: '162045', serialNumber: '0000' } as never)).pdfBytes);
    const v = await assessLeafPdfSecurity(kit.xrefStreamUpdate({ id: kit.templateId0, encrypt: true, base: filled }), 'fda');
    expect(v).toMatchObject({ verdict: 'fda-form-as-issued', formId: 'FDA_1571' });
  });
});

/*
 * 2026-09-23 (W5/D7, round-2 review). A file embedded in a filled eSTAR is
 * enciphered with the eSTAR's own key, so its own /Encrypt is not in the raw
 * bytes, and the eSTAR passed as "an FDA form as issued" with a secured PDF
 * inside it. An attachment is judged by the same rule for FDA: a secured PDF
 * is refused, and an FDA form attached as FDA issued it keeps FDA's settings.
 */
describe('FDA form carrying an embedded file', () => {
  it('is refused when an embedded PDF is itself secured, and names the attachment', async () => {
    const filled = await estarWithAttachment(SECURED_PDF, 'biocompatibility-report.pdf');
    expect(filled, 'a verified vendored eSTAR template').not.toBeNull();
    const v = await assessLeafPdfSecurity(filled!, 'fda');
    expect(v.verdict).toBe('secured');
    if (v.verdict === 'secured') expect(v.reason).toMatch(/biocompatibility-report\.pdf/);
  }, 120_000);

  it('accepts an eSTAR carrying a filled FDA form as FDA issued it — FDA asks for its forms with their own settings', async () => {
    const form = Buffer.from((await generateIndForm('FDA_3674', { sponsorName: 'C2C', indNumber: '162045' } as never)).pdfBytes);
    const filled = await estarWithAttachment(form, 'form-fda-3674.pdf');
    expect(filled, 'a verified vendored eSTAR template').not.toBeNull();
    expect((await assessLeafPdfSecurity(filled!, 'fda')).verdict).toBe('fda-form-as-issued');
  }, 120_000);

  it('still accepts an eSTAR whose embedded PDF has no security settings', async () => {
    const filled = await estarWithAttachment(UNSECURED_PDF, 'cover-letter.pdf');
    expect(filled, 'a verified vendored eSTAR template').not.toBeNull();
    expect((await assessLeafPdfSecurity(filled!, 'fda')).verdict).toBe('fda-form-as-issued');
  }, 120_000);
});
