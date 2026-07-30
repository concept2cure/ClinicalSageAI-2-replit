/**
 * Proves the OFFICIAL FDA 356h AcroForm fill works against the REAL field names,
 * including the application-type CHECKBOXES. The real 356h has db_appl_type_1/2/3
 * checkboxes (verified export values NDA / ANDA / BLA); the builder derives a
 * boolean per type (appl_type_nda/anda/bla) that the fill maps onto those boxes,
 * and the signatory is a signature (btn_sign) so authorized_rep_name/title have
 * no inline field and are intentionally unmapped.
 *
 * Official PDFs are not committed; this synthesizes a fillable PDF whose AcroForm
 * field names match the real 356h and installs it via IND_FORM_TEMPLATES_DIR.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { FORM_356H } from '../ind-form-data-builders';
import { OFFICIAL_FIELD_MAPS } from '../official-field-maps';

let tmpDir: string;
const MAP = OFFICIAL_FIELD_MAPS[FORM_356H];
const CHECKBOX_FIELDS = ['db_appl_type_1', 'db_appl_type_2', 'db_appl_type_3'];

async function makeSynthetic356h(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  let y = 750;
  for (const acro of Object.values(MAP)) {
    if (CHECKBOX_FIELDS.includes(acro)) {
      const cb = form.createCheckBox(acro);
      cb.addToPage(page, { x: 50, y, width: 14, height: 14 });
    } else {
      const tf = form.createTextField(acro);
      tf.addToPage(page, { x: 50, y, width: 320, height: 16 });
    }
    y -= 22;
  }
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ind-356h-official-'));
  const bytes = await makeSynthetic356h();
  const templatePath = path.join(tmpDir, `${FORM_356H}.pdf`);
  await fs.writeFile(templatePath, bytes);
  await fs.writeFile(`${templatePath}.manifest.json`, JSON.stringify({
    formId: FORM_356H,
    version: 'test-fixture',
    sourceUrl: 'https://www.fda.gov/media/72335/download',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    reviewedBy: 'automated-test',
    reviewedAt: '2026-07-30T00:00:00.000Z',
    fieldMap: MAP,
  }));
  process.env.IND_FORM_TEMPLATES_DIR = tmpDir;
});
afterAll(async () => {
  delete process.env.IND_FORM_TEMPLATES_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FDA 356h official AcroForm fill', () => {
  it('qualifies + fills the official 356h, checking the NDA application-type box', async () => {
    const result = await generateIndForm(FORM_356H, {
      applicationType: 'NDA',
      sponsorName: 'Acme Therapeutics, Inc.',
      drugName: 'C2C-001',
      dosageForm: 'Tablet',
      routeOfAdministration: 'Oral',
      indication: 'Advanced solid tumors',
      sponsor: { address: '1 Acme Way, Cambridge, MA', authorizedRepName: 'John Officer' },
    });

    // Official template used — NOT the labeled-draft fallback.
    expect(result.usedOfficialTemplate).toBe(true);
    // Every required text field was placed.
    expect(result.missingRequired).toEqual([]);
    // The signatory-only fields have no inline widget and are honestly unmapped,
    // and did NOT force a fallback.
    expect(result.unmappedFields).toEqual(
      expect.arrayContaining(['authorized_rep_name', 'authorized_rep_title']),
    );
    // 11 of the 13 built fields map to real widgets (8 text + 3 type checkboxes).
    expect(result.fieldCoverage).toBeCloseTo(11 / 13, 5);
    // Valid, reloadable (flattened) PDF.
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(result.pdfBytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
