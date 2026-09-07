/**
 * The official dynamic-XFA fill for FDA Form 1571 (IND application) and FDA Form
 * 3674 (ClinicalTrials.gov certification).
 *
 * These two forms were recorded for a long time as impossible to fill: their
 * AcroForm `/Fields` array is empty, `pdf-lib getFields()` returns nothing, and
 * the manifests still carry the conclusion that "it cannot be reliably
 * field-filled". Every generated 1571 was therefore a drawn reconstruction
 * stamped NOT the official form — which a sponsor cannot file.
 *
 * The conclusion was drawn from the wrong layer. The fields are in the XFA
 * packets, and they are numerous and real. What follows pins the corrected
 * behaviour against the vendored FDA templates themselves, not a fixture:
 * generateIndForm returns the genuine FDA bytes with our values inside them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { generateIndForm, templatePathFor } from '../ind-form-fill-service';
import { OFFICIAL_XFA_FIELD_MAPS, getOfficialXfaFieldMap } from '../official-field-maps';
import {
  listXfaFields,
  readXfaDatasetsValues,
  resolveDataSomPath,
  isDynamicXfaPdf,
} from '../../forms/fill-official-pdf';

const FORM_1571 = 'FDA_1571';
const FORM_3674 = 'FDA_3674';

const META = {
  sponsorName: 'Concept2Cure Biopharma, Inc.',
  sponsor: {
    name: 'Concept2Cure Biopharma, Inc.',
    address: '400 Kendall Square, Cambridge, MA 02142',
    contactPhone: '+1 617 555 0142',
    authorizedRepName: 'Dana Reyes',
    authorizedRepTitle: 'VP, Regulatory Affairs',
  },
  indNumber: '162045',
  serialNumber: '0000',
  drugName: 'C2C-1042 (obeticholamine) capsules',
  indication: 'Moderate to severe plaque psoriasis',
  indType: 'commercial',
  studyPhase: 'Phase 1',
  nctNumber: 'NCT05551234',
  ctgovCertificationBasis: 'requirements_met' as const,
};

const templateBytes = (formId: string) => new Uint8Array(fs.readFileSync(templatePathFor(formId)));

describe('FDA 1571 / 3674 — the fields are in the XFA layer, not the AcroForm layer', () => {
  it('both vendored templates are dynamic XFA and declare hundreds of fillable fields', async () => {
    for (const formId of [FORM_1571, FORM_3674]) {
      const bytes = templateBytes(formId);
      expect(isDynamicXfaPdf(bytes)).toBe(true);
      const fields = await listXfaFields(bytes);
      const fillable = fields.filter((f) => f.inDatasets);
      // The old reading of these forms was "0 fillable fields".
      expect(fields.length).toBeGreaterThan(150);
      expect(fillable.length).toBeGreaterThan(150);
    }
  });

  it('resolves a template SOM path onto the flatter path the data DOM actually uses', async () => {
    const fields = await listXfaFields(templateBytes(FORM_1571));
    const sponsor = fields.find((f) => f.somPath === 'topmostSubform.Page1.db_sponsor_name');
    expect(sponsor).toBeDefined();
    // The subform `Page1` binds no data group, so it is absent from the data
    // path. Comparing the two strings directly is what reported every field of
    // this form as missing.
    expect(sponsor!.dataSomPath).toBe('topmostSubform.db_sponsor_name');
    expect(sponsor!.inDatasets).toBe(true);
  });

  it('never guesses: an undeclared path and an ambiguous one both resolve to null', () => {
    const paths = new Set(['topmostSubform.db_sponsor_name']);
    expect(resolveDataSomPath('topmostSubform.Page1.db_sponsor_name', paths)).toBe(
      'topmostSubform.db_sponsor_name',
    );
    expect(resolveDataSomPath('topmostSubform.Page1.db_not_a_field', paths)).toBeNull();
    const ambiguous = new Set(['topmostSubform.A.value', 'topmostSubform.B.value']);
    expect(resolveDataSomPath('topmostSubform.Page1.value', ambiguous)).toBeNull();
  });
});

describe('generateIndForm produces the genuine official FDA PDF', () => {
  it('1571 fills the official template and the values read back out of it', async () => {
    const result = await generateIndForm(FORM_1571, META);
    expect(result.usedOfficialTemplate).toBe(true);
    expect(result.reconstructed).toBeUndefined();

    const back = await readXfaDatasetsValues(result.pdfBytes, [
      'topmostSubform.db_sponsor_name',
      'topmostSubform.db_drug_names',
      'topmostSubform.db_ind_id',
      'topmostSubform.db_indication',
      'topmostSubform.db_serial_no',
      'topmostSubform.db_aplcnt_address_1',
      'topmostSubform.db_sponsor_title',
    ]);
    expect(back['topmostSubform.db_sponsor_name']).toBe('Concept2Cure Biopharma, Inc.');
    expect(back['topmostSubform.db_drug_names']).toBe('C2C-1042 (obeticholamine) capsules');
    expect(back['topmostSubform.db_ind_id']).toBe('162045');
    expect(back['topmostSubform.db_indication']).toBe('Moderate to severe plaque psoriasis');
    expect(back['topmostSubform.db_serial_no']).toBe('0000');
    expect(back['topmostSubform.db_aplcnt_address_1']).toBe('400 Kendall Square, Cambridge, MA 02142');
    expect(back['topmostSubform.db_sponsor_title']).toBe('VP, Regulatory Affairs');
  });

  it('3674 fills the sponsor, product and NCT number on the official template', async () => {
    const result = await generateIndForm(FORM_3674, META);
    expect(result.usedOfficialTemplate).toBe(true);
    const back = await readXfaDatasetsValues(result.pdfBytes, [
      'topmostSubform.db_sponsor_name',
      'topmostSubform.db_prdct_name_1',
      'topmostSubform.db_NCT_nmbrs_1',
    ]);
    expect(back['topmostSubform.db_sponsor_name']).toBe('Concept2Cure Biopharma, Inc.');
    expect(back['topmostSubform.db_prdct_name_1']).toBe('C2C-1042 (obeticholamine) capsules');
    expect(back['topmostSubform.db_NCT_nmbrs_1']).toBe('NCT05551234');
  });

  it('keeps the original FDA bytes: the fill is an incremental update, not a re-render', async () => {
    const original = Buffer.from(templateBytes(FORM_1571));
    const result = await generateIndForm(FORM_1571, META);
    const filled = Buffer.from(result.pdfBytes);
    expect(filled.length).toBeGreaterThan(original.length);
    expect(filled.subarray(0, original.length).equals(original)).toBe(true);
  });

  it('reports the boxes it did not write rather than implying a complete form', async () => {
    const result = await generateIndForm(FORM_1571, META);
    // ind_type and phase_of_study are carried by widgets whose accepted tokens
    // are set by the form's own XFA script, so the platform leaves them for the
    // sponsor — and says so.
    expect(result.unmappedFields).toContain('ind_type');
    expect(result.unmappedFields).toContain('phase_of_study');
    expect(result.fieldCoverage).toBeGreaterThan(0);
    expect(result.fieldCoverage).toBeLessThan(1);
  });

  it('with no data to place, falls back rather than shipping the blank form as "official"', async () => {
    const result = await generateIndForm(FORM_1571, {});
    expect(result.usedOfficialTemplate).toBe(false);
    expect(result.reconstructed).toBe(true);
  });

  it('falls back when the vendored template is not installed', async () => {
    const previous = process.env.IND_FORM_TEMPLATES_DIR;
    process.env.IND_FORM_TEMPLATES_DIR = path.join(os.tmpdir(), 'c2c-absent-ind-templates');
    try {
      const result = await generateIndForm(FORM_1571, META);
      expect(result.usedOfficialTemplate).toBe(false);
      expect(result.reconstructed).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
      else process.env.IND_FORM_TEMPLATES_DIR = previous;
    }
  });
});

describe('the reviewed XFA maps match the vendored templates', () => {
  it('every mapped path is declared by its template and resolves to a data node', async () => {
    for (const formId of [FORM_1571, FORM_3674]) {
      const map = getOfficialXfaFieldMap(formId)!;
      expect(Object.keys(map).length).toBeGreaterThan(0);
      const declared = new Map(
        (await listXfaFields(templateBytes(formId))).map((f) => [f.somPath, f]),
      );
      for (const [canonicalKey, spec] of Object.entries(map)) {
        const field = declared.get(spec.xfaSomPath!);
        expect(field, `${formId}.${canonicalKey} → ${spec.xfaSomPath}`).toBeDefined();
        expect(field!.inDatasets, `${formId}.${canonicalKey} is fillable`).toBe(true);
        expect(field!.type).toBe(spec.type);
      }
    }
  });

  it('maps only the two dynamic-XFA forms', () => {
    expect(Object.keys(OFFICIAL_XFA_FIELD_MAPS).sort()).toEqual([FORM_1571, FORM_3674]);
  });
});
