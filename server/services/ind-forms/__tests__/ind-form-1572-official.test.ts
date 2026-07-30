/**
 * Proves the OFFICIAL FDA 1572 AcroForm fill works against the REAL field names
 * (db_invest_name, db_loc_name, db_lab_name, db_irb_name, db_sub_inv_names,
 * db_prot_name_code), using the reviewed map in official-field-maps.ts.
 *
 * The real FDA 1572 was decrypted and its fields enumerated; a value round-trips
 * (db_invest_name -> "Dr. Ada Lovelace, MD") when filled directly. Official PDFs
 * are not committed (repo convention), so this test synthesizes a fillable PDF
 * whose AcroForm field names match the real 1572 and installs it via
 * IND_FORM_TEMPLATES_DIR — mirroring ind-form-acroform-fill.test.ts.
 *
 * Regression intent: qualifications (an attachment -> db_cv checkbox) and
 * study_title (no field on the 1572) legitimately have no inline mapping. Before
 * the builder was aligned + the fill gate made required-only, those required
 * fields forced every 1572 to fall back to the labeled draft. This pins that the
 * 1572 now qualifies for OFFICIAL output.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { FORM_1572 } from '../ind-form-data-builders';
import { OFFICIAL_FIELD_MAPS } from '../official-field-maps';

let tmpDir: string;
const REAL_1572_FIELDS = Object.values(OFFICIAL_FIELD_MAPS[FORM_1572]);

async function makeSynthetic1572(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  REAL_1572_FIELDS.forEach((name, i) => {
    const tf = form.createTextField(name);
    tf.addToPage(page, { x: 50, y: 750 - 25 * i, width: 320, height: 16 });
  });
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ind-1572-official-'));
  const bytes = await makeSynthetic1572();
  const templatePath = path.join(tmpDir, `${FORM_1572}.pdf`);
  await fs.writeFile(templatePath, bytes);
  await fs.writeFile(`${templatePath}.manifest.json`, JSON.stringify({
    formId: FORM_1572,
    version: 'test-fixture',
    sourceUrl: 'https://www.fda.gov/media/72981/download',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    reviewedBy: 'automated-test',
    reviewedAt: '2026-07-30T00:00:00.000Z',
    fieldMap: OFFICIAL_FIELD_MAPS[FORM_1572],
  }));
  process.env.IND_FORM_TEMPLATES_DIR = tmpDir;
});
afterAll(async () => {
  delete process.env.IND_FORM_TEMPLATES_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FDA 1572 official AcroForm fill', () => {
  it('qualifies + fills the official 1572 against real db_* field names', async () => {
    const result = await generateIndForm(FORM_1572, {
      studyTitle: 'A Phase 1 Study of C2C-001',
      protocolNumbers: 'C2C-001-101',
      investigators: [
        {
          name: 'Dr. Ada Lovelace, MD',
          facilityNameAddress: 'Acme Cancer Center, Boston, MA',
          clinicalLabNameAddress: 'Acme Labs, Cambridge, MA',
          irbNameAddress: 'Acme IRB, Boston, MA',
          subInvestigators: ['Dr. Lee', 'Dr. Gomez'],
        },
      ],
    });

    // Official template used — NOT the labeled-draft fallback.
    expect(result.usedOfficialTemplate).toBe(true);
    // Every REQUIRED field (name, facility, IRB) was placed.
    expect(result.missingRequired).toEqual([]);
    // The two attachment/no-field builder fields are honestly reported unmapped,
    // and did NOT force a fallback.
    expect(result.unmappedFields).toEqual(
      expect.arrayContaining(['investigator_qualifications', 'study_title']),
    );
    // 6 of the 8 built fields map to real widgets and were written.
    expect(result.fieldCoverage).toBeCloseTo(6 / 8, 5);
    // Valid, reloadable (flattened) PDF.
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(result.pdfBytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
