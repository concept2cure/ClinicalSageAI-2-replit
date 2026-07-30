/**
 * Export-contract proof — official-PDF AcroForm fill → reopen (independent
 * engine) → rendered-value qualification.
 *
 * Proof hierarchy tiers 6-7 for the form-fill path (docs/architecture/PROOF_HIERARCHY.md).
 * `server/services/forms/fill-official-pdf.ts` fills official fillable PDFs (FDA
 * eSTAR / 1571 / 1572 / 3674 …) by writing values into AcroForm fields with
 * pdf-lib. Asserting the FillResult ("filled: [...]") only proves the writer
 * THINKS it filled them. This proof takes the REAL fill output and:
 *   - REOPEN (independent of the writer): flattens the filled form (so values are
 *     baked into page content) and re-extracts the page text with `pdf-parse`
 *     (pdf.js) — an engine that never touched pdf-lib's AcroForm API — proving the
 *     value is actually rendered in the emitted document, not merely set in a form
 *     dictionary the writer also owns;
 *   - TAUTOLOGY GUARD: the same token is NOT present when the ORIGINAL, unfilled
 *     template is reopened the same way — so the qualification passes because we
 *     filled the field, not because the token was already in the PDF;
 *   - NON-VACUOUS: a field map that names an AcroField absent from the template
 *     throws under `missingFieldPolicy: 'error'` (the "never invent fields"
 *     contract), and a key with no data is recorded in `skipped`, never invented.
 *
 * HONEST SCOPE: the template here is built in-test with pdf-lib (a real fillable
 * AcroForm, but not a vendored FDA PDF); the independence is in the pdf.js reopen,
 * which is blind to how the bytes were produced.
 *
 * No DB, no mocks: fill-official-pdf.ts depends only on pdf-lib.
 * Output: tests/export-contract/__reports__/acroform-fill.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fillOfficialPdf, listAcroFields } from '../../server/services/forms/fill-official-pdf';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const NAME_TOKEN = 'ACROFILLNAME7X';
const REGION_VALUE = 'EU';

const FIELD_MAP = {
  applicantName: { acroField: 'F_Name', type: 'text' as const },
  agree: { acroField: 'F_Agree', type: 'checkbox' as const },
  region: { acroField: 'F_Region', type: 'dropdown' as const },
};

/** Build a real fillable AcroForm PDF — the stand-in "official template". */
async function buildTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const form = doc.getForm();
  const name = form.createTextField('F_Name');
  name.addToPage(page, { x: 50, y: 320, width: 320, height: 20 });
  const agree = form.createCheckBox('F_Agree');
  agree.addToPage(page, { x: 50, y: 280, width: 16, height: 16 });
  const region = form.createDropdown('F_Region');
  region.setOptions(['US', 'EU', 'JP']);
  region.addToPage(page, { x: 50, y: 240, width: 140, height: 20 });
  return doc.save();
}

/** Reopen PDF bytes and extract page text with pdf-parse (pdf.js) — independent. */
async function reopenText(bytes: Uint8Array): Promise<string> {
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> };
  };
  const parser = new mod.PDFParse({ data: Buffer.from(bytes) });
  const res = await parser.getText();
  return res.text;
}

const R = new JourneyRecorder(
  'Export-contract proof — AcroForm fill → reopen → rendered-value qualification',
  'Fill a real official-style AcroForm PDF with fill-official-pdf.ts, then reopen ' +
    'the flattened output with an independent PDF engine (pdf-parse) and confirm ' +
    'the written value is actually rendered in the document.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('acroform-fill', REPORT_DIR);
});

describe('AcroForm fill → reopen → rendered-value qualification', () => {
  R.limitations.push(
    'The template is constructed in-test with pdf-lib (a real fillable AcroForm, ' +
      'not a vendored FDA PDF). Independence comes from the pdf-parse (pdf.js) reopen, ' +
      'which is blind to how the bytes were written.',
  );

  it('fills the form, reopens with an independent engine, and finds the rendered value', async () => {
    const template = await buildTemplate();

    // ── Template sanity: it really is a fillable AcroForm with our fields ─────
    const fields = await R.step('introspect-template-acrofields', async () => {
      const list = await listAcroFields(template);
      const byName = Object.fromEntries(list.map((f) => [f.name, f.type]));
      expect(byName['F_Name']).toBe('text');
      expect(byName['F_Agree']).toBe('checkbox');
      expect(byName['F_Region']).toBe('dropdown');
      return { fieldCount: list.length, names: list.map((f) => f.name) };
    });
    expect(fields.fieldCount).toBe(3);

    // ── Tautology guard baseline: token is NOT in the unfilled template ──────
    const originalText = await reopenText(template);
    expect(originalText).not.toContain(NAME_TOKEN);

    // ── Fill via the REAL service, flattening so values bake into content ────
    const fill = await R.step('fill-official-pdf', async () => {
      const result = await fillOfficialPdf(
        template,
        FIELD_MAP,
        { applicantName: `Applicant ${NAME_TOKEN}`, agree: true, region: REGION_VALUE },
        { flatten: true, missingFieldPolicy: 'error' },
      );
      expect(result.filled.sort()).toEqual(['agree', 'applicantName', 'region']);
      expect(result.skipped).toEqual([]);
      expect(result.bytes.length).toBeGreaterThan(0);
      // A filled PDF still begins with the %PDF magic.
      expect(Buffer.from(result.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      return { filled: result.filled.length, skipped: result.skipped.length, sizeBytes: result.bytes.length };
    });

    // ── REOPEN independently and qualify the rendered value ──────────────────
    await R.step('reopen-pdfjs-and-find-rendered-value', async () => {
      const result = await fillOfficialPdf(
        template,
        FIELD_MAP,
        { applicantName: `Applicant ${NAME_TOKEN}`, agree: true, region: REGION_VALUE },
        { flatten: true, missingFieldPolicy: 'error' },
      );
      const text = await reopenText(result.bytes);
      // pdf.js re-extracts the flattened field appearance as page text.
      expect(text).toContain(NAME_TOKEN);
      expect(text).toContain(REGION_VALUE);
      return { tokenRendered: text.includes(NAME_TOKEN), regionRendered: text.includes(REGION_VALUE) };
    });

    // ── Non-vacuous #1: an absent mapped field throws under 'error' policy ───
    await R.expectBlocked('missing-acrofield-throws-under-error-policy', async () => {
      let threw = false;
      try {
        await fillOfficialPdf(
          template,
          { phantom: { acroField: 'F_DoesNotExist', type: 'text' } },
          { phantom: 'value' },
          { missingFieldPolicy: 'error' },
        );
      } catch {
        threw = true;
      }
      return { blocked: threw, threw };
    });

    // ── Non-vacuous #2: a key with no data is skipped, never invented ────────
    await R.expectBlocked('no-data-key-is-skipped-not-invented', async () => {
      const result = await fillOfficialPdf(
        template,
        FIELD_MAP,
        { agree: true }, // applicantName + region absent
        { flatten: true },
      );
      const skippedBoth = result.skipped.includes('applicantName') && result.skipped.includes('region');
      // And the missing token is NOT rendered — nothing was invented.
      const text = await reopenText(result.bytes);
      return { blocked: skippedBoth && !text.includes(NAME_TOKEN), skipped: result.skipped, tokenAbsent: !text.includes(NAME_TOKEN) };
    });

    R.observations.push(
      `Filled a ${fields.fieldCount}-field AcroForm (${fill.sizeBytes}-byte output); ` +
        `an independent pdf.js reopen found the rendered value, absent from the unfilled template.`,
    );
  });
});
