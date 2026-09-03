import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { PDFDocument } from 'pdf-lib';
import { fillEstarSubmission } from '../estar-fill';
import { ESTAR_FIELD_MAPS } from '../estar-field-map';
import {
  readXfaDatasetsValues,
  type OfficialPdfFieldMap,
} from '../../../forms/fill-official-pdf';

// Build a synthetic AcroForm PDF standing in for the official eSTAR template.
async function makeSyntheticEstar(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const name = form.createTextField('DeviceName');
  name.addToPage(page, { x: 50, y: 700, width: 240, height: 20 });
  const ivd = form.createCheckBox('IsIvd');
  ivd.addToPage(page, { x: 50, y: 660, width: 16, height: 16 });
  return doc.save();
}

const fieldMap: OfficialPdfFieldMap = {
  deviceName: { acroField: 'DeviceName', type: 'text' },
  isIvd: { acroField: 'IsIvd', type: 'checkbox' },
};

let emptyDir: string;
let priorEnv: string | undefined;

beforeAll(async () => {
  emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-empty-'));
  priorEnv = process.env.ESTAR_TEMPLATE_DIR;
  // Point the drop-point at an empty dir so "no template vendored" is deterministic.
  process.env.ESTAR_TEMPLATE_DIR = emptyDir;
});

afterAll(async () => {
  if (priorEnv === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
  else process.env.ESTAR_TEMPLATE_DIR = priorEnv;
  await fs.rm(emptyDir, { recursive: true, force: true });
});

describe('fillEstarSubmission', () => {
  it('fills the official eSTAR AcroForm when template + verified field map are present', async () => {
    const templateBytes = await makeSyntheticEstar();
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceName: 'Acme Monitor', isIvd: true },
      templateBytes,
      fieldMap,
    });

    expect(r.descriptorId).toBe('510k-device');
    expect(r.templateAvailable).toBe(true);
    expect(r.fieldMapPopulated).toBe(true);
    expect(r.filled).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.filledFields).toEqual(expect.arrayContaining(['deviceName', 'isIvd']));
    expect(r.pdfBytes).toBeInstanceOf(Uint8Array);

    // Round-trip: the filled values are actually in the output PDF.
    const out = await PDFDocument.load(r.pdfBytes!);
    expect(out.getForm().getTextField('DeviceName').getText()).toBe('Acme Monitor');
    expect(out.getForm().getCheckBox('IsIvd').isChecked()).toBe(true);
  });

  it('fails closed (no fabricated PDF) when the official template is not vendored', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceName: 'Acme Monitor' },
      fieldMap, // map present, but no template bytes and drop-point is empty
    });
    expect(r.templateAvailable).toBe(false);
    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    expect(r.blockers.join(' ')).toMatch(/official template .* is not vendored/i);
  });

  it('fails closed when the field map is not populated/verified', async () => {
    const templateBytes = await makeSyntheticEstar();
    const r = await fillEstarSubmission({
      type: 'de_novo',
      variant: 'ivd',
      data: { deviceName: 'Acme Assay' },
      templateBytes,
      // no injected fieldMap → falls back to the (empty) registered map
    });
    expect(r.templateAvailable).toBe(true);
    expect(r.fieldMapPopulated).toBe(false);
    expect(r.filled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/field map .* is not populated/i);
  });

  it('skips+warns for canonical keys with no data, still producing the PDF', async () => {
    const templateBytes = await makeSyntheticEstar();
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceName: 'Acme Monitor' }, // isIvd omitted
      templateBytes,
      fieldMap,
    });
    expect(r.filled).toBe(true);
    expect(r.filledFields).toContain('deviceName');
    expect(r.skippedFields).toContain('isIvd');
  });
});

// ---------------------------------------------------------------------------
// The WO-8 Phase 1 gate, against the real vendored template
// ---------------------------------------------------------------------------
//
// Skipped when the official template is absent (the drop-point may be pointed
// out of tree — see assets/estar-templates/README.md), so the suite stays green
// without it rather than failing blind.

const NIVD_TEMPLATE = path.resolve(process.cwd(), 'assets/estar-templates', 'eSTAR-510k-non-ivd.pdf');

describe.skipIf(!fsSync.existsSync(NIVD_TEMPLATE))(
  'fillEstarSubmission against the official nIVD eSTAR v7.0',
  () => {
    const DATA = {
      deviceTradeName: 'AcuSense CGM System',
      applicantCompanyName: 'Concept2Cure, Inc.',
      predicateSubmissionNumber: 'K203456',
      productCodes: 'NBW',
    };

    // The file-level beforeAll points the drop-point at an EMPTY dir so the
    // synthetic-template tests above exercise the fail-closed path. This block
    // needs the real vendored template, so point it back for these tests only.
    const REAL_DIR = path.dirname(NIVD_TEMPLATE);
    let dirBefore: string | undefined;
    beforeAll(() => {
      dirBefore = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = REAL_DIR;
    });
    afterAll(() => {
      if (dirBefore === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = dirBefore;
    });

    it('produces a filled official eSTAR with no blockers, via the XFA layer', async () => {
      const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: DATA });

      expect(r.descriptorId).toBe('510k-device');
      expect(r.templateAvailable).toBe(true);
      expect(r.fieldMapPopulated).toBe(true);
      // The FDA eSTAR is dynamic XFA; filling its AcroForm layer would write nothing.
      expect(r.templateKind).toBe('dynamic-xfa');
      expect(r.blockers).toEqual([]);
      expect(r.filled).toBe(true);
      expect(r.pdfBytes).toBeDefined();
      expect(Buffer.from(r.pdfBytes!.subarray(0, 5)).toString()).toBe('%PDF-');

      // Every supplied key must be reported filled — none silently dropped.
      for (const key of Object.keys(DATA)) expect(r.filledFields).toContain(key);
    });

    it('writes each value at the SOM path it was mapped to', async () => {
      const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: DATA });
      const map = ESTAR_FIELD_MAPS['510k-device'];
      const paths = Object.keys(DATA).map((k) => map[k].xfaSomPath!);
      const back = await readXfaDatasetsValues(r.pdfBytes!, paths);
      for (const [key, value] of Object.entries(DATA)) {
        expect(back[map[key].xfaSomPath!]).toBe(value);
      }
    });

    it('still fails closed when the template is missing', async () => {
      const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-none-'));
      const prev = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = empty;
      try {
        const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: DATA });
        expect(r.filled).toBe(false);
        expect(r.pdfBytes).toBeUndefined();
        expect(r.blockers.join(' ')).toMatch(/eSTAR-510k-non-ivd\.pdf.*not vendored/);
      } finally {
        if (prev === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
        else process.env.ESTAR_TEMPLATE_DIR = prev;
      }
    });

    it('fails closed for a descriptor with no verified field map', async () => {
      const r = await fillEstarSubmission({ type: 'de_novo', variant: 'device', data: DATA });
      expect(r.filled).toBe(false);
      expect(r.blockers.join(' ')).toMatch(/field map for "de_novo-device" is not populated/);
    });
  },
);
