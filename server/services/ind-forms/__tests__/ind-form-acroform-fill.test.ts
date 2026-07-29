/**
 * Proves the OFFICIAL AcroForm fill path works against a real fillable PDF.
 *
 * The production blocker is the official FDA AcroForm PDFs (which can't be
 * bundled). This test synthesizes a fillable PDF with AcroForm fields named to
 * match the 1571 builder's field ids, drops it into a temp templates dir, and
 * confirms generateIndForm fills it (usedOfficialTemplate=true). So when the
 * real FDA PDFs + ACROFORM_FIELD_MAP are dropped in, the path is proven.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { FORM_1571 } from '../ind-form-data-builders';

let tmpDir: string;

/** Build a minimal fillable PDF whose AcroForm field names match 1571 field ids. */
async function makeSyntheticForm(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  for (const name of ['sponsor_name', 'drug_name', 'indication']) {
    const tf = form.createTextField(name);
    tf.addToPage(page, { x: 50, y: 700 - 30 * ['sponsor_name', 'drug_name', 'indication'].indexOf(name), width: 300, height: 18 });
  }
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ind-acroforms-'));
  await fs.writeFile(path.join(tmpDir, `${FORM_1571}.pdf`), await makeSyntheticForm());
  process.env.IND_FORM_TEMPLATES_DIR = tmpDir;
});
afterAll(async () => {
  delete process.env.IND_FORM_TEMPLATES_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('official AcroForm fill path', () => {
  it('fills the official template when present (usedOfficialTemplate=true)', async () => {
    const result = await generateIndForm(FORM_1571, {
      sponsorName: 'Acme Therapeutics',
      drugName: 'C2C-001',
      indication: 'NSCLC',
    });
    expect(result.usedOfficialTemplate).toBe(true);
    expect(result.fieldCoverage).toBeGreaterThan(0);
    // Valid PDF bytes.
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Re-loads cleanly (flattened output).
    const reloaded = await PDFDocument.load(result.pdfBytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('falls back to the labeled PDF when no template is present', async () => {
    const prev = process.env.IND_FORM_TEMPLATES_DIR;
    process.env.IND_FORM_TEMPLATES_DIR = path.join(tmpDir, 'does-not-exist');
    const result = await generateIndForm(FORM_1571, { sponsorName: 'Acme', drugName: 'C2C-001' });
    expect(result.usedOfficialTemplate).toBe(false);
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    process.env.IND_FORM_TEMPLATES_DIR = prev;
  });
});
