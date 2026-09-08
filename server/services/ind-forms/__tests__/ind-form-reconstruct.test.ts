/**
 * Proves the FAITHFUL RECONSTRUCTION path for the pure dynamic XFA forms
 * (FDA 1571, 3674). These forms carry no fillable AcroForm layer and no official
 * page to overlay, so with no template installed the service renders a sectioned
 * reconstruction — clearly labeled as NOT the official Adobe-rendered PDF —
 * rather than the bare labeled draft.
 *
 * The pins that matter for 21 CFR Part 11: the output is a valid PDF, the flag
 * `reconstructed` is set (and `usedOfficialTemplate` is false), the field values
 * actually influence the bytes (data is really drawn), rendering is deterministic
 * (identical input → byte-identical output, no fabricated dates/random), and the
 * builder's QC state (missingRequired) is carried through faithfully.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { generateIndForm } from '../ind-form-fill-service';
import { reconstructForm, hasReconstruction } from '../ind-form-reconstruct';
import { buildForm1571, buildForm3674, FORM_1571, FORM_3674 } from '../ind-form-data-builders';
import type { IndProjectMetadata } from '../ind-form-data-builders';

const COMPLETE_1571: IndProjectMetadata = {
  sponsorName: 'Acme Therapeutics, Inc.',
  drugName: 'ACME-001 (acmezumab)',
  indication: 'Moderate-to-severe plaque psoriasis',
  indType: 'Commercial IND',
  studyPhase: 'Phase 1',
  indNumber: '',
  serialNumber: '0000',
  sponsor: {
    address: '1 Innovation Way, Cambridge, MA 02139',
    contactName: 'Dr. Jane Monitor',
    contactPhone: '+1 617 555 0100',
    contactEmail: 'jane.monitor@acmetx.example',
    authorizedRepName: 'John Officer',
    authorizedRepTitle: 'Chief Medical Officer',
  },
};

const COMPLETE_3674: IndProjectMetadata = {
  sponsorName: 'Acme Therapeutics, Inc.',
  drugName: 'ACME-001',
  nctNumber: 'NCT01234567',
  ctgovCertificationBasis: 'requirements_met',
};

function pdfHeader(bytes: Uint8Array): string {
  return Buffer.from(bytes).subarray(0, 5).toString('latin1');
}

describe('FDA form reconstruction (pure dynamic XFA → sectioned reconstruction)', () => {
  it('knows which forms have a reconstruction layout', () => {
    expect(hasReconstruction(FORM_1571)).toBe(true);
    expect(hasReconstruction(FORM_3674)).toBe(true);
    expect(hasReconstruction('FDA_1572')).toBe(false);
    expect(hasReconstruction('FDA_356H')).toBe(false);
  });

  it('renders a valid, labeled 1571 reconstruction from a complete project', async () => {
    const result = await reconstructForm(FORM_1571, buildForm1571(COMPLETE_1571));

    expect(result.reconstructed).toBe(true);
    expect(result.usedOfficialTemplate).toBe(false);
    expect(result.formId).toBe(FORM_1571);
    expect(pdfHeader(result.pdfBytes)).toBe('%PDF-');
    // A complete project leaves no required field missing.
    expect(result.missingRequired).toEqual([]);

    const doc = await PDFDocument.load(result.pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    // Deterministic metadata — no wall-clock creation date.
    expect(doc.getCreationDate()?.getTime()).toBe(0);
    expect(doc.getTitle()).toContain('reconstruction');
  });

  it('carries the builder QC state: an empty 1571 lists its missing required fields', async () => {
    const result = await reconstructForm(FORM_1571, buildForm1571({}));
    expect(result.reconstructed).toBe(true);
    // sponsor_name, sponsor_address, drug_name, indication, ind_type and
    // phase_of_study are all required and blank. authorized_rep_name is NOT
    // among them: the 1571 signature block is a signature, so the builder
    // carries it non-required, as buildForm356h already did for the same id.
    expect(result.missingRequired).toEqual(
      expect.arrayContaining([
        'sponsor_name',
        'sponsor_address',
        'drug_name',
        'indication',
        'ind_type',
        'phase_of_study',
      ]),
    );
    expect(result.missingRequired).not.toContain('authorized_rep_name');
  });

  it('renders the 3674 certification and reflects the selected basis', async () => {
    const met = await reconstructForm(FORM_3674, buildForm3674(COMPLETE_3674));
    expect(met.reconstructed).toBe(true);
    expect(met.usedOfficialTemplate).toBe(false);
    expect(pdfHeader(met.pdfBytes)).toBe('%PDF-');
    // A selected certification basis satisfies the required gate.
    expect(met.missingRequired).toEqual([]);

    // No basis selected → the certification_selected gate is missing.
    const none = await reconstructForm(FORM_3674, buildForm3674({ sponsorName: 'Acme', drugName: 'ACME-001' }));
    expect(none.missingRequired).toContain('certification_selected');
  });

  it('actually draws the data: different field values yield different bytes', async () => {
    const a = await reconstructForm(FORM_1571, buildForm1571(COMPLETE_1571));
    const b = await reconstructForm(
      FORM_1571,
      buildForm1571({ ...COMPLETE_1571, sponsorName: 'Beta Biosciences, LLC' }),
    );
    expect(Buffer.from(a.pdfBytes).equals(Buffer.from(b.pdfBytes))).toBe(false);
  });

  it('is deterministic: identical input yields byte-identical output', async () => {
    const first = await reconstructForm(FORM_1571, buildForm1571(COMPLETE_1571));
    const second = await reconstructForm(FORM_1571, buildForm1571(COMPLETE_1571));
    expect(Buffer.from(first.pdfBytes).equals(Buffer.from(second.pdfBytes))).toBe(true);
  });

  it('reconstruction is the FALLBACK: with no template installed, 1571/3674 still render', async () => {
    // This used to assert the reconstruction was the only possible path for
    // these two forms. It is not — see the XFA suite — so what is pinned here
    // is the fallback: point the service at a directory holding no templates
    // and the reconstruction still produces a labelled, data-carrying PDF.
    const previous = process.env.IND_FORM_TEMPLATES_DIR;
    process.env.IND_FORM_TEMPLATES_DIR = path.join(os.tmpdir(), 'c2c-no-ind-templates');
    try {
      const r1571 = await generateIndForm(FORM_1571, COMPLETE_1571);
      const r3674 = await generateIndForm(FORM_3674, COMPLETE_3674);
      expect(r1571.reconstructed).toBe(true);
      expect(r3674.reconstructed).toBe(true);
      expect(r1571.usedOfficialTemplate).toBe(false);
      expect(r3674.usedOfficialTemplate).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
      else process.env.IND_FORM_TEMPLATES_DIR = previous;
    }
  });
});
