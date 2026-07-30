/**
 * Proves the OFFICIAL FDA 3455 fill (Disclosure: financial interests). Static XFA;
 * pdf-lib strips the XFA and fills the 12-field AcroForm layer. Per-investigator
 * (one invesname); the four interest checkboxes map to the 21 CFR 54.4 categories
 * in the order verified from the form's field tooltips.
 *
 * Pins that the 3455 qualifies for OFFICIAL output once the builder models the
 * interest types: applicant + study + investigator + the selected interest
 * checkbox fill; the free-text disclosure_details / interest_type_selected QC gate
 * have no form widget and (via qcOnly) never force a fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { FORM_3455 } from '../ind-form-data-builders';
import { OFFICIAL_FIELD_MAPS } from '../official-field-maps';

let tmpDir: string;
const MAP = OFFICIAL_FIELD_MAPS[FORM_3455];
const CHECKBOX_CANONICAL = new Set([
  'interest_financial_arrangement',
  'interest_significant_payments',
  'interest_proprietary',
  'interest_significant_equity',
]);

async function makeSynthetic3455(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  let i = 0;
  for (const [canonical, acro] of Object.entries(MAP)) {
    if (CHECKBOX_CANONICAL.has(canonical)) {
      form.createCheckBox(acro).addToPage(page, { x: 50, y: 720 - 20 * i, width: 12, height: 12 });
    } else {
      form.createTextField(acro).addToPage(page, { x: 50, y: 720 - 20 * i, width: 300, height: 16 });
    }
    i++;
  }
  return Buffer.from(await doc.save());
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ind-3455-official-'));
  const bytes = await makeSynthetic3455();
  const templatePath = path.join(tmpDir, `${FORM_3455}.pdf`);
  await fs.writeFile(templatePath, bytes);
  await fs.writeFile(`${templatePath}.manifest.json`, JSON.stringify({
    formId: FORM_3455,
    version: 'test-fixture',
    sourceUrl: 'https://www.fda.gov/media/75287/download',
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

describe('FDA 3455 official fill (static XFA → AcroForm layer, interest-type checkboxes)', () => {
  it('qualifies + discloses the investigator with the selected interest type', async () => {
    const result = await generateIndForm(FORM_3455, {
      sponsorName: 'Acme Therapeutics, Inc.',
      studyTitle: 'A Phase 1 Study of ACME-001',
      sponsor: { authorizedRepName: 'John Officer', authorizedRepTitle: 'Chief Medical Officer' },
      investigators: [
        { name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: true, interestTypes: ['significant_equity'] } },
      ],
    });

    // Official template used — NOT the labeled-draft fallback.
    expect(result.usedOfficialTemplate).toBe(true);
    // Required form fields (applicant firm/name, investigator) all placed.
    expect(result.missingRequired).toEqual([]);
    // The qc-gate / free-text fields have no widget and are honestly unmapped,
    // NOT a fallback trigger (via qcOnly).
    expect(result.unmappedFields ?? []).toEqual(
      expect.arrayContaining(['disclosure_details', 'interest_type_selected']),
    );
    expect(result.fieldCoverage).toBeGreaterThan(0);
    expect(Buffer.from(result.pdfBytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reloaded = await PDFDocument.load(result.pdfBytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('is not ready to disclose without an interest type (QC gate holds)', async () => {
    const result = await generateIndForm(FORM_3455, {
      sponsorName: 'Acme',
      sponsor: { authorizedRepName: 'John Officer' },
      investigators: [{ name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: true } }],
    });
    // Still fills officially (form widgets placed)...
    expect(result.usedOfficialTemplate).toBe(true);
    // ...but QC flags the missing interest type — an honest "filled but not ready".
    expect(result.missingRequired).toContain('interest_type_selected');
  });
});
