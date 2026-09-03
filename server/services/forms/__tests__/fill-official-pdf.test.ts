/**
 * Tests for the generic official-PDF AcroForm fill utility.
 *
 * No external PDF files are needed: each test builds a synthetic AcroForm PDF
 * in-memory with pdf-lib (text field, checkbox, dropdown, radio group), then
 * fills it and reads the values back.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

import {
  fillOfficialPdf,
  listAcroFields,
  isDynamicXfaPdf,
  listXfaFields,
  fillXfaDatasets,
  readXfaDatasetsValues,
  type OfficialPdfFieldMap,
} from '../fill-official-pdf';

// ---------------------------------------------------------------------------
// Synthetic template builder
// ---------------------------------------------------------------------------

const SPONSOR_FIELD = 'SponsorName';
const CONSENT_FIELD = 'ConsentCheckbox';
const PHASE_FIELD = 'StudyPhase';
const PHASE_OPTIONS = ['Phase 1', 'Phase 2', 'Phase 3'];
const RADIO_FIELD = 'IndType';
const RADIO_OPTIONS = ['Commercial', 'Research'];

/** Build a fresh synthetic AcroForm PDF with text/checkbox/dropdown/radio fields. */
async function buildSyntheticTemplate(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  const text = form.createTextField(SPONSOR_FIELD);
  text.addToPage(page, { x: 50, y: 700, width: 300, height: 20 });

  const checkbox = form.createCheckBox(CONSENT_FIELD);
  checkbox.addToPage(page, { x: 50, y: 660, width: 16, height: 16 });

  const dropdown = form.createDropdown(PHASE_FIELD);
  dropdown.addOptions(PHASE_OPTIONS);
  dropdown.addToPage(page, { x: 50, y: 620, width: 200, height: 20, font });

  const radio = form.createRadioGroup(RADIO_FIELD);
  radio.addOptionToPage(RADIO_OPTIONS[0], page, { x: 50, y: 580, width: 16, height: 16 });
  radio.addOptionToPage(RADIO_OPTIONS[1], page, { x: 120, y: 580, width: 16, height: 16 });

  return doc.save();
}

/** Read field values back from filled (un-flattened) PDF bytes. */
async function readBack(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  return {
    sponsor: form.getTextField(SPONSOR_FIELD).getText(),
    consent: form.getCheckBox(CONSENT_FIELD).isChecked(),
    phase: form.getDropdown(PHASE_FIELD).getSelected(),
    indType: form.getRadioGroup(RADIO_FIELD).getSelected(),
  };
}

const FIELD_MAP: OfficialPdfFieldMap = {
  sponsorName: { acroField: SPONSOR_FIELD, type: 'text' },
  consent: { acroField: CONSENT_FIELD, type: 'checkbox' },
  studyPhase: { acroField: PHASE_FIELD, type: 'dropdown' },
  indType: { acroField: RADIO_FIELD, type: 'radio' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fillOfficialPdf', () => {
  let template: Uint8Array;

  beforeAll(async () => {
    template = await buildSyntheticTemplate();
  });

  it('fills text, checkbox, dropdown and radio fields, readable back (flatten:false)', async () => {
    const result = await fillOfficialPdf(
      template,
      FIELD_MAP,
      {
        sponsorName: 'Acme Therapeutics',
        consent: true,
        studyPhase: 'Phase 2',
        indType: 'Research',
      },
      { flatten: false },
    );

    expect(result.filled.sort()).toEqual(
      ['consent', 'indType', 'sponsorName', 'studyPhase'].sort(),
    );
    expect(result.skipped).toEqual([]);

    const values = await readBack(result.bytes);
    expect(values.sponsor).toBe('Acme Therapeutics');
    expect(values.consent).toBe(true);
    expect(values.phase).toEqual(['Phase 2']);
    expect(values.indType).toBe('Research');
  });

  it('unchecks a checkbox when the value is falsy', async () => {
    const result = await fillOfficialPdf(template, FIELD_MAP, { consent: false });
    expect(result.filled).toContain('consent');
    const values = await readBack(result.bytes);
    expect(values.consent).toBe(false);
  });

  it('coerces string spellings for checkboxes', async () => {
    const result = await fillOfficialPdf(template, FIELD_MAP, { consent: 'yes' });
    const values = await readBack(result.bytes);
    expect(values.consent).toBe(true);
  });

  it('skips and warns for a canonical key with no data supplied', async () => {
    const result = await fillOfficialPdf(template, FIELD_MAP, {
      sponsorName: 'Only Sponsor',
    });

    expect(result.filled).toEqual(['sponsorName']);
    expect(result.skipped.sort()).toEqual(['consent', 'indType', 'studyPhase'].sort());
    expect(result.warnings.some((w) => w.includes('No data supplied for "consent"'))).toBe(true);
  });

  it('skips and warns when a mapped AcroField is absent from the template (policy: skip)', async () => {
    const mapWithGhost: OfficialPdfFieldMap = {
      ...FIELD_MAP,
      ghost: { acroField: 'NonExistentField', type: 'text' },
    };

    const result = await fillOfficialPdf(
      template,
      mapWithGhost,
      { sponsorName: 'S', ghost: 'will not stick' },
      { missingFieldPolicy: 'skip' },
    );

    expect(result.filled).toContain('sponsorName');
    expect(result.skipped).toContain('ghost');
    expect(result.warnings.some((w) => w.includes('NonExistentField'))).toBe(true);
  });

  it('throws when a mapped AcroField is absent and policy is "error"', async () => {
    const mapWithGhost: OfficialPdfFieldMap = {
      ghost: { acroField: 'NonExistentField', type: 'text' },
    };

    await expect(
      fillOfficialPdf(
        template,
        mapWithGhost,
        { ghost: 'value' },
        { missingFieldPolicy: 'error' },
      ),
    ).rejects.toThrow(/NonExistentField/);
  });

  it('skips+warns for an out-of-range dropdown value (never injects an unavailable option)', async () => {
    const result = await fillOfficialPdf(template, FIELD_MAP, {
      studyPhase: 'Phase 4',
    });
    // An official form must not gain an option it does not offer; the value is
    // skipped+warned (not reported as filled), matching the radio-group case.
    expect(result.skipped).toContain('studyPhase');
    expect(result.filled).not.toContain('studyPhase');
    expect(result.warnings.some((w) => w.includes('Phase 4'))).toBe(true);
    const values = await readBack(result.bytes);
    expect(values.phase).not.toContain('Phase 4');
  });

  it('skips+warns for an invalid radio option (not addable on the fly)', async () => {
    const result = await fillOfficialPdf(template, FIELD_MAP, {
      indType: 'NotAnOption',
    });
    expect(result.skipped).toContain('indType');
    expect(result.warnings.some((w) => w.includes('indType'))).toBe(true);
  });

  it('produces a flattened PDF when flatten:true (no interactive fields remain)', async () => {
    const result = await fillOfficialPdf(
      template,
      FIELD_MAP,
      { sponsorName: 'Flat Co', consent: true, studyPhase: 'Phase 1', indType: 'Commercial' },
      { flatten: true },
    );
    expect(result.filled.length).toBe(4);

    const doc = await PDFDocument.load(result.bytes);
    expect(doc.getForm().getFields().length).toBe(0);
  });
});

describe('listAcroFields', () => {
  it('enumerates the synthetic template fields with their types', async () => {
    const template = await buildSyntheticTemplate();
    const fields = await listAcroFields(template);

    const byName = Object.fromEntries(fields.map((f) => [f.name, f.type]));
    expect(byName[SPONSOR_FIELD]).toBe('text');
    expect(byName[CONSENT_FIELD]).toBe('checkbox');
    expect(byName[PHASE_FIELD]).toBe('dropdown');
    expect(byName[RADIO_FIELD]).toBe('radio');
    expect(fields).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Dynamic XFA (the official FDA eSTAR templates)
// ---------------------------------------------------------------------------
//
// These run against the vendored official template. They are skipped when it is
// absent (see assets/estar-templates/README.md — the drop-point may be pointed
// out of tree), so the suite stays green without it rather than failing blind.

const ESTAR_TEMPLATE = path.resolve(
  process.env.ESTAR_TEMPLATE_DIR || path.resolve(process.cwd(), 'assets/estar-templates'),
  'eSTAR-510k-non-ivd.pdf',
);
const hasEstarTemplate = fsSync.existsSync(ESTAR_TEMPLATE);

// A path the nIVD eSTAR v7.0 declares, verified by enumeration (see
// docs/reports/wo8-phase1-estar-unblock-2026-09-03.md).
const TRADE_NAME_SOM = 'root.AdministrativeDocumentation.PMNSummary.SSTextField220';

describe.skipIf(!hasEstarTemplate)('dynamic XFA templates (official FDA eSTAR)', () => {
  let template: Buffer;
  beforeAll(async () => {
    template = await fs.readFile(ESTAR_TEMPLATE);
  });

  it('is detected as dynamic XFA, and its AcroForm layer is empty', async () => {
    expect(isDynamicXfaPdf(template)).toBe(true);
    // The reason an acroField mapping can never work for this template: there is
    // nothing in the AcroForm layer to match against.
    await expect(listAcroFields(template)).resolves.toEqual([]);
  });

  it('enumerates XFA fields with SOM path, type and the template\'s own caption', async () => {
    const fields = await listXfaFields(template);
    expect(fields.length).toBeGreaterThan(1000);
    const tradeName = fields.find((f) => f.somPath === TRADE_NAME_SOM);
    expect(tradeName).toBeDefined();
    expect(tradeName!.type).toBe('text');
    expect(tradeName!.caption).toBe('Device Trade Name');
    // Only datasets-backed paths are fillable; the enumeration must say which.
    expect(tradeName!.inDatasets).toBe(true);
    expect(fields.some((f) => !f.inDatasets)).toBe(true);
  });

  it('fills the datasets packet and reads the value back, preserving the template', async () => {
    const map: OfficialPdfFieldMap = {
      deviceTradeName: { xfaSomPath: TRADE_NAME_SOM, type: 'text' },
    };
    const out = await fillXfaDatasets(template, map, { deviceTradeName: 'AcuSense CGM System' });
    expect(out.filled).toEqual(['deviceTradeName']);
    expect(out.skipped).toEqual([]);

    // Written as an incremental update: original bytes preserved, new revision appended.
    expect(Buffer.from(out.bytes.subarray(0, template.length)).equals(template)).toBe(true);
    expect(out.bytes.length).toBeGreaterThan(template.length);

    const back = await readXfaDatasetsValues(out.bytes, [TRADE_NAME_SOM]);
    expect(back[TRADE_NAME_SOM]).toBe('AcuSense CGM System');

    // The form definition itself must be untouched, or the output is not the FDA form.
    const after = await listXfaFields(out.bytes);
    expect(after.length).toBe((await listXfaFields(template)).length);
  });

  it('skips and warns for a SOM path the template does not declare (never invents a node)', async () => {
    const map: OfficialPdfFieldMap = {
      real: { xfaSomPath: TRADE_NAME_SOM, type: 'text' },
      ghost: { xfaSomPath: 'root.Totally.Made.Up', type: 'text' },
    };
    const out = await fillXfaDatasets(template, map, { real: 'Yes', ghost: 'No' });
    expect(out.filled).toEqual(['real']);
    expect(out.skipped).toEqual(['ghost']);
    expect(out.warnings.join(' ')).toMatch(/root\.Totally\.Made\.Up/);

    const back = await readXfaDatasetsValues(out.bytes, ['root.Totally.Made.Up']);
    expect(back['root.Totally.Made.Up']).toBeNull();
  });

  it('throws for an undeclared path under missingFieldPolicy "error"', async () => {
    const map: OfficialPdfFieldMap = { ghost: { xfaSomPath: 'root.Nope', type: 'text' } };
    await expect(
      fillXfaDatasets(template, map, { ghost: 'x' }, { missingFieldPolicy: 'error' }),
    ).rejects.toThrow(/root\.Nope/);
  });

  it('skips an XFA-only mapping on the AcroForm path rather than filling the wrong widget', async () => {
    const map: OfficialPdfFieldMap = { deviceTradeName: { xfaSomPath: TRADE_NAME_SOM, type: 'text' } };
    const out = await fillOfficialPdf(template, map, { deviceTradeName: 'X' });
    expect(out.filled).toEqual([]);
    expect(out.skipped).toEqual(['deviceTradeName']);
    expect(out.warnings.join(' ')).toMatch(/no acroField/i);
  });
});
