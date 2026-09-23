/**
 * The FDA-form exception holds only while a reader sees FDA's own security.
 *
 * 2026-09-22 (W5/D7), from the adversarial review of leaf-pdf-security: the
 * text checks passed every one of these as "an FDA form as issued", and pdf.js
 * demanded a password to open each of them.
 */
import { describe, it, expect } from 'vitest';
import { assessLeafPdfSecurity } from '../leaf-pdf-security';
import { tamperKit } from './fixtures/fda-form-tamper';

const kit = tamperKit();

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
