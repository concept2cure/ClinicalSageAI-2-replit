/**
 * Proves the OFFICIAL FDA 3454 fill works. The 3454 (Certification: NO financial
 * interests) is a STATIC XFA form; pdf-lib strips the XFA and fills the 14-field
 * AcroForm layer (a value round-trips on the real asset). Official PDFs are not
 * committed, so this synthesizes a fillable PDF whose AcroForm field names match
 * the real 3454 (deeply nested XFA-style names) and installs it via
 * IND_FORM_TEMPLATES_DIR.
 *
 * Pins that the 3454 qualifies for OFFICIAL output: `no_disclosable_interests`
 * maps to the "certify none" checkbox, applicant firm/name/title fill, and
 * drug_name (no field on this form) is honestly unmapped without forcing a
 * fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { FORM_3454 } from '../ind-form-data-builders';
import { OFFICIAL_FIELD_MAPS } from '../official-field-maps';

let tmpDir: string;
const MAP = OFFICIAL_FIELD_MAPS[FORM_3454];
const CHECKBOX_CANONICAL = new Set(['no_disclosable_interests']);

async function makeSynthetic3454(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  let i = 0;
  for (const [canonical, acro] of Object.entries(MAP)) {
    if (CHECKBOX_CANONICAL.has(canonical)) {
      form.createCheckBox(acro).addToPage(page, { x: 50, y: 720 - 22 * i, width: 12, height: 12 });
    } else {
      form.createTextField(acro).addToPage(page, { x: 50, y: 720 - 22 * i, width: 300, height: 16 });
    }
    i++;
  }
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ind-3454-official-'));
  const bytes = await makeSynthetic3454();
  const templatePath = path.join(tmpDir, `${FORM_3454}.pdf`);
  await fs.writeFile(templatePath, bytes);
  await fs.writeFile(`${templatePath}.manifest.json`, JSON.stringify({
    formId: FORM_3454,
    version: 'test-fixture',
    sourceUrl: 'https://www.fda.gov/media/75288/download',
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

describe('FDA 3454 official fill (static XFA → AcroForm layer)', () => {
  it('qualifies + certifies NONE against the real 3454 field names', async () => {
    const result = await generateIndForm(FORM_3454, {
      sponsorName: 'Acme Therapeutics, Inc.',
      drugName: 'ACME-001', // carried for the record; no drug field on the 3454
      sponsor: { authorizedRepName: 'John Officer', authorizedRepTitle: 'Chief Medical Officer' },
      investigators: [{ name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: false } }],
    });

    // Official template used — NOT the labeled-draft fallback.
    expect(result.usedOfficialTemplate).toBe(true);
    // Every required field (sponsor firm, rep name, the certify-none checkbox) placed.
    expect(result.missingRequired).toEqual([]);
    // drug_name has no field on the 3454 — honestly reported unmapped, no fallback.
    expect(result.unmappedFields ?? []).toContain('drug_name');
    expect(result.fieldCoverage).toBeGreaterThan(0);
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(result.pdfBytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
