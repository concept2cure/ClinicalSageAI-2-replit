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
import { isUsableEstarTemplate, listVendoredTemplates } from '../estar-template-registry';

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

/** One filled value per canonical key the 510(k) device map declares a home for. */
const DATA = {
  deviceTradeName: 'AcuSense CGM System',
  applicantCompanyName: 'Concept2Cure, Inc.',
  predicateSubmissionNumber: 'K203456',
  productCodes: 'NBW',
};

/**
 * Point the template drop-point at the real vendored directory for one suite,
 * and put it back afterwards. The file-level `beforeAll` points it at an EMPTY
 * directory so the synthetic-template tests can exercise the fail-closed path,
 * so every suite that needs the real template has to swap it back — three of
 * them did, with the same nine lines each.
 */
function useVendoredTemplateDir(dir: string): void {
  let dirBefore: string | undefined;
  beforeAll(() => {
    dirBefore = process.env.ESTAR_TEMPLATE_DIR;
    process.env.ESTAR_TEMPLATE_DIR = dir;
  });
  afterAll(() => {
    if (dirBefore === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
    else process.env.ESTAR_TEMPLATE_DIR = dirBefore;
  });
}

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
    // Every marketing descriptor now carries a verified map; the PreSTAR2
    // descriptors are the ones that legitimately have none.
    const r = await fillEstarSubmission({
      type: 'q_sub',
      variant: 'prestar',
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
    useVendoredTemplateDir(path.dirname(NIVD_TEMPLATE));

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
      const r = await fillEstarSubmission({ type: 'q_sub', variant: 'prestar', data: DATA });
      expect(r.filled).toBe(false);
      expect(r.blockers.join(' ')).toMatch(/field map for "q_sub-prestar" is not populated/);
    });

    it('De Novo and PMA are ready on this template: vendored AND mapped (the readiness route\'s gate)', async () => {
      for (const type of ['de_novo', 'pma'] as const) {
        // Passed `data: {}` before, which asserted "no blockers" over a fill
        // that wrote nothing — the very state that now fails closed. Real data
        // exercises readiness AND the fill, which is what the gate stands for.
        const r = await fillEstarSubmission({ type, variant: 'device', data: DATA });
        expect(r.descriptorId).toBe(`${type}-device`);
        expect(r.templateAvailable).toBe(true);
        expect(r.fieldMapPopulated).toBe(true);
        expect(r.blockers).toEqual([]);
        expect(r.filled).toBe(true);
      }
    });

    it('a fill that writes nothing is not a filled form: no blank official eSTAR', async () => {
      // POST /official defaults `data` to {}, so this was reachable over HTTP:
      // every mapped key skipped, the untouched template returned, filled:true,
      // no blockers — a blank official FDA form registered as submittable.
      const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: {} });
      expect(r.templateAvailable).toBe(true);
      expect(r.fieldMapPopulated).toBe(true);
      expect(r.filled).toBe(false);
      expect(r.pdfBytes).toBeUndefined();
      expect(r.filledFields).toEqual([]);
      expect(r.blockers.join(' ')).toMatch(/wrote no values/);
    });

    it('one real value is enough to be a filled form', async () => {
      const r = await fillEstarSubmission({
        type: '510k',
        variant: 'device',
        data: { deviceTradeName: 'CardioSense CS-100' },
      });
      expect(r.filled).toBe(true);
      expect(r.filledFields).toEqual(['deviceTradeName']);
      expect(r.pdfBytes).toBeDefined();
      expect(r.blockers).toEqual([]);
    });
  },
);

// ---------------------------------------------------------------------------
// WO-8 Phase 3: De Novo and PMA on the SAME vendored templates
// ---------------------------------------------------------------------------

/** The pathway-neutral administrative values a De Novo or PMA writes. */
const SHARED_ADMINISTRATIVE_DATA = {
  applicantCompanyName: 'Concept2Cure, Inc.',
  applicantContactEmail: 'regulatory@concept2cure.example',
  correspondentCompanyName: 'Concept2Cure Regulatory Services',
  correspondentContactEmail: 'correspondent@concept2cure.example',
  associatedProductCodes: 'NBW, QBJ',
  declarationCompanyName: 'Concept2Cure, Inc.',
  declarationCompanyAddress: '1 Example Way, Boston, MA 02110',
  declarationDeviceTradeName: 'AcuSense CGM System',
  indicationsForUseCitation: 'Attachment 4, page 2',
};

/** 510(k)-only values that a De Novo/PMA must NOT write even when supplied. */
const K510_ONLY_DATA = {
  deviceTradeName: 'AcuSense CGM System',
  predicateSubmissionNumber: 'K203456',
};

const IVD_TEMPLATE = path.resolve(process.cwd(), 'assets/estar-templates', 'eSTAR-510k-ivd.pdf');

describe('De Novo / PMA field maps are the pathway-neutral subset (no template needed)', () => {
  const DEVICE_KEYS = Object.keys(SHARED_ADMINISTRATIVE_DATA).sort();
  const IVD_KEYS = DEVICE_KEYS.filter((k) => k !== 'indicationsForUseCitation');

  it.each([
    { id: 'de_novo-device', family: '510k-device', keys: DEVICE_KEYS },
    { id: 'pma-device', family: '510k-device', keys: DEVICE_KEYS },
    { id: 'de_novo-ivd', family: '510k-ivd', keys: IVD_KEYS },
    { id: 'pma-ivd', family: '510k-ivd', keys: IVD_KEYS },
  ])('$id maps exactly the shared keys, at the same SOM paths the 510(k) map uses', ({ id, family, keys }) => {
    const map = ESTAR_FIELD_MAPS[id];
    expect(Object.keys(map).sort()).toEqual(keys);
    for (const [key, spec] of Object.entries(map)) {
      expect(spec.xfaSomPath).toBe(ESTAR_FIELD_MAPS[family][key].xfaSomPath);
      expect(spec.type).toBe('text');
      expect(spec.caption).toBeTruthy();
    }
  });

  it.each(['de_novo-device', 'pma-device', 'de_novo-ivd', 'pma-ivd'])(
    '%s never addresses the 510(k) Summary page or the predicate fields',
    (id) => {
      const paths = Object.values(ESTAR_FIELD_MAPS[id]).map((s) => s.xfaSomPath ?? '');
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((p) => /PMNSummary|PredicatesSE/.test(p))).toEqual([]);
    },
  );

  it('the IVD maps omit indicationsForUseCitation (the IVD template does not declare LBTextField130)', () => {
    expect(ESTAR_FIELD_MAPS['de_novo-ivd']).not.toHaveProperty('indicationsForUseCitation');
    expect(ESTAR_FIELD_MAPS['pma-ivd']).not.toHaveProperty('indicationsForUseCitation');
    expect(ESTAR_FIELD_MAPS['de_novo-device']).toHaveProperty('indicationsForUseCitation');
  });

  it('each descriptor owns its map object (mutating one cannot change another)', () => {
    expect(ESTAR_FIELD_MAPS['de_novo-device']).not.toBe(ESTAR_FIELD_MAPS['pma-device']);
    expect(ESTAR_FIELD_MAPS['de_novo-ivd']).not.toBe(ESTAR_FIELD_MAPS['pma-ivd']);
  });
});

describe.skipIf(!fsSync.existsSync(NIVD_TEMPLATE))(
  'De Novo and PMA on the official nIVD eSTAR v7.0 (same vendored file as 510(k))',
  () => {
    useVendoredTemplateDir(path.dirname(NIVD_TEMPLATE));

    it.each(['de_novo', 'pma'] as const)(
      '%s-device fills the shared administrative fields and reads them back at their SOM paths',
      async (type) => {
        const r = await fillEstarSubmission({
          type,
          variant: 'device',
          data: { ...SHARED_ADMINISTRATIVE_DATA, ...K510_ONLY_DATA },
        });

        expect(r.descriptorId).toBe(`${type}-device`);
        expect(r.templateAvailable).toBe(true);
        expect(r.fieldMapPopulated).toBe(true);
        expect(r.templateKind).toBe('dynamic-xfa');
        expect(r.blockers).toEqual([]);
        expect(r.filled).toBe(true);
        expect(r.skippedFields).toEqual([]);
        expect(Buffer.from(r.pdfBytes!.subarray(0, 5)).toString()).toBe('%PDF-');
        // Every shared key written; the 510(k)-only keys are not part of this map at all.
        expect(r.filledFields.sort()).toEqual(Object.keys(SHARED_ADMINISTRATIVE_DATA).sort());
        for (const key of Object.keys(K510_ONLY_DATA)) expect(r.filledFields).not.toContain(key);

        const map = ESTAR_FIELD_MAPS[`${type}-device`];
        const k510 = ESTAR_FIELD_MAPS['510k-device'];
        const paths = [
          ...Object.keys(SHARED_ADMINISTRATIVE_DATA).map((k) => map[k].xfaSomPath!),
          ...Object.keys(K510_ONLY_DATA).map((k) => k510[k].xfaSomPath!),
        ];
        const back = await readXfaDatasetsValues(r.pdfBytes!, paths);
        for (const [key, value] of Object.entries(SHARED_ADMINISTRATIVE_DATA)) {
          expect(back[map[key].xfaSomPath!]).toBe(value);
        }
        // The 510(k) Summary trade name and the predicate number stay empty in a De Novo/PMA.
        for (const key of Object.keys(K510_ONLY_DATA)) expect(back[k510[key].xfaSomPath!]).toBe('');
      },
    );
  },
);

describe.skipIf(!fsSync.existsSync(IVD_TEMPLATE))(
  'De Novo and PMA on the official IVD eSTAR v7.0 (same vendored file as 510(k))',
  () => {
    useVendoredTemplateDir(path.dirname(IVD_TEMPLATE));

    it.each(['de_novo', 'pma'] as const)(
      '%s-ivd is ready and fills the shared fields (minus the IFU citation the IVD template lacks)',
      async (type) => {
        const r = await fillEstarSubmission({ type, variant: 'ivd', data: SHARED_ADMINISTRATIVE_DATA });
        expect(r.descriptorId).toBe(`${type}-ivd`);
        expect(r.templateAvailable).toBe(true);
        expect(r.fieldMapPopulated).toBe(true);
        expect(r.blockers).toEqual([]);
        expect(r.filled).toBe(true);
        const map = ESTAR_FIELD_MAPS[`${type}-ivd`];
        expect(r.filledFields.sort()).toEqual(Object.keys(map).sort());
        expect(r.filledFields).not.toContain('indicationsForUseCitation');
        const back = await readXfaDatasetsValues(r.pdfBytes!, Object.values(map).map((s) => s.xfaSomPath!));
        for (const [key, spec] of Object.entries(map)) {
          expect(back[spec.xfaSomPath!]).toBe((SHARED_ADMINISTRATIVE_DATA as Record<string, string>)[key]);
        }
      },
    );
  },
);

/**
 * TEMPLATE INTEGRITY. Availability used to be a filename match and nothing else,
 * so any PDF called `eSTAR-510k-non-ivd.pdf` — a retired v6.2 form, an edited
 * copy — made `templateAvailable` true and the field map wrote our values
 * wherever THAT file's SOM paths pointed. These are about the BYTES, not about
 * filling, so they sit apart from the fill suite.
 */
describe.skipIf(!fsSync.existsSync(NIVD_TEMPLATE))(
  'the vendored eSTAR templates are the files they are pinned to be',
  () => {
    useVendoredTemplateDir(path.dirname(NIVD_TEMPLATE));

    it('refuses a file with the right NAME whose bytes do not match its pin', async () => {
      // Availability was a filename match and nothing else, so any PDF called
      // eSTAR-510k-non-ivd.pdf — a retired v6.2 form, an edited copy — made
      // templateAvailable and officialEstarPdf true, and the field map wrote
      // our values wherever THAT file's SOM paths pointed. checksums.txt has
      // pinned these bytes all along; nothing read it.
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-swapped-'));
      const impostor = await PDFDocument.create();
      impostor.addPage();
      await fs.writeFile(
        path.join(dir, 'eSTAR-510k-non-ivd.pdf'),
        Buffer.from(await impostor.save()),
      );
      await fs.writeFile(
        path.join(dir, 'checksums.txt'),
        `${'0'.repeat(64)}  eSTAR-510k-non-ivd.pdf\n`,
      );
      const prev = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = dir;
      try {
        const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: DATA });
        expect(r.templateAvailable).toBe(false);
        expect(r.filled).toBe(false);
        expect(r.pdfBytes).toBeUndefined();
        expect(r.blockers.join(' ')).toMatch(/does not match the SHA-256 pinned/);
      } finally {
        if (prev === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
        else process.env.ESTAR_TEMPLATE_DIR = prev;
      }
    });

    /*
     * The same pin, asked as a question every OTHER caller can ask. `estar-fill`
     * refused a swapped template from the start; `/assemble` and
     * `/scaffold-field-map` were deciding availability from the FILE NAME, so
     * the route reported "official eSTAR producible · 0 blockers" for bytes the
     * fill behind the button would refuse — and a scaffolder would have
     * enumerated the wrong file's SOM paths into a new field map.
     */
    it('isUsableEstarTemplate refuses a mismatch and allows verified or unpinned', () => {
      expect(isUsableEstarTemplate({ integrity: 'mismatch' })).toBe(false);
      expect(isUsableEstarTemplate({ integrity: 'verified' })).toBe(true);
      // Unpinned is a WARNING in estar-fill, not a refusal — an unpinned file is
      // unverified, not known-wrong, and refusing it would break a drop-point
      // that has not been pinned yet.
      expect(isUsableEstarTemplate({ integrity: 'unpinned' })).toBe(true);
    });

    it('a swapped template is excluded from the list a caller judges availability from', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'estar-swapped-list-'));
      const impostor = await PDFDocument.create();
      impostor.addPage();
      await fs.writeFile(path.join(dir, 'eSTAR-510k-non-ivd.pdf'), Buffer.from(await impostor.save()));
      await fs.writeFile(
        path.join(dir, 'checksums.txt'),
        `${'0'.repeat(64)}  eSTAR-510k-non-ivd.pdf\n`,
      );
      const prev = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = dir;
      try {
        const vendored = await listVendoredTemplates();
        // The file IS on disk under the expected name — that is the whole trap.
        expect(vendored.map((t) => t.fileName)).toContain('eSTAR-510k-non-ivd.pdf');
        expect(vendored.find((t) => t.fileName === 'eSTAR-510k-non-ivd.pdf')!.integrity).toBe('mismatch');
        // And it is absent from what a caller may treat as present.
        expect(vendored.filter(isUsableEstarTemplate).map((t) => t.fileName)).toEqual([]);
      } finally {
        if (prev === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
        else process.env.ESTAR_TEMPLATE_DIR = prev;
      }
    });

    it('the committed templates match the checksums pinned for them', async () => {
      const vendored = await listVendoredTemplates();
      expect(vendored.length).toBeGreaterThan(0);
      for (const t of vendored) {
        expect(t.integrity, `${t.fileName} integrity`).toBe('verified');
      }
    });
  },
);
