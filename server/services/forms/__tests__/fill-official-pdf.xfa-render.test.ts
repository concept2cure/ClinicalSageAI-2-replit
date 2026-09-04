/**
 * WO-8 — does an INDEPENDENT XFA ENGINE display what we wrote into the eSTAR?
 *
 * `fillXfaDatasets` writes the FDA eSTAR's `datasets` packet as a PDF incremental
 * update and `readXfaDatasetsValues` reads it back — but both are ours, so
 * together they prove only that we can read our own file. This file hands the
 * OUTPUT BYTES to pdf.js (`pdfjs-dist`, `enableXfa: true`), a second, independent
 * XFA implementation: it decrypts the appended object through the /Prev xref
 * chain, merges the datasets packet into the template with its own binder, lays
 * the form out, and returns the rendered tree. We then read the CONTROL STATE out
 * of that tree.
 *
 * WHAT THIS PROVES (measured on the vendored nIVD eSTAR v7.0, pdfjs-dist 5.4.296):
 *
 *  1. pdf.js parses our incremental update: the filled output loads as a pure-XFA
 *     document with the same page count and the same laid-out controls as the
 *     untouched template.
 *  2. A value written by the production fill path IS bound and IS displayed.
 *     Both proofs run on the pathway selectors of page 1 — the only data-bound
 *     controls the template lays out before its own scripts run:
 *       - `root.ApplicationType.USA.ATRadioButton110` starts EMPTY in FDA's
 *         datasets skeleton. Writing "2" makes pdf.js render ATRadioButton112
 *         (`xfaOn="2"`) checked and its siblings unchecked.
 *       - `root.ApplicationType.ATRadioButton100` starts at FDA's own default
 *         "1" (US FDA), which pdf.js renders as ATRadioButton101 checked.
 *         Writing "2" moves the check to ATRadioButton102 — our write OVERRIDES
 *         a value that was already in the form, which a read-back cannot show.
 *     The blank template and a fill that leaves those paths alone render the
 *     original state, so the assertion is differential, not a coincidence.
 *
 * WHAT THIS DOES NOT PROVE — read this before quoting the file as a green gate:
 *
 *  a. NONE of the 20 `510k-device` administrative values appear in pdf.js's
 *     rendered tree, and test 5 pins that. The cause is not the fill: every one
 *     of the 20 fields sits under a container subform the template declares
 *     `presence="hidden"` (`AdministrativeInformation`, `AdministrativeDocumentation`,
 *     `PMNSummary`, `DoC`, `Classification`, `PredicatesSE`, `Labeling`; plus
 *     `SSTextField180`/`SSTextField200`, hidden fields in their own right). The
 *     form's own JavaScript flips those to visible once the applicant picks a
 *     submission type. pdf.js does not execute XFA script, so it never lays them
 *     out. Scratchpad control (2026-09-04): flipping exactly those 10 `presence`
 *     attributes in the template packet and re-running THIS fill makes pdf.js
 *     render all 20 values, each at its mapped SOM path, and renders none of them
 *     from the same revealed template left unfilled. That is strong evidence the
 *     binding is correct, but it is not this file's assertion, because it needs a
 *     modified template — so for the 20 shipped fields the packet read-back
 *     (test 5) remains the only in-repo evidence.
 *  b. pdf.js runs none of the form's scripts. An `initialize`/`calculate` handler
 *     that overwrites a bound value when Acrobat opens the document would NOT be
 *     caught here.
 *  c. Acrobat's own rendering is still unobserved. Acrobat is not available in
 *     this environment; pdf.js is the only independent XFA engine that is.
 *
 * Skipped, never faked, when the template is not vendored or pdf.js is absent.
 *
 * @module server/services/forms/__tests__/fill-official-pdf.xfa-render.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fillEstarSubmission, type FillEstarResult } from '../../pathway-engines/estar/estar-fill';
import { ESTAR_FIELD_MAPS } from '../../pathway-engines/estar/estar-field-map';
import { readXfaDatasetsValues, type OfficialPdfFieldMap } from '../fill-official-pdf';

const NIVD_TEMPLATE = path.resolve(
  process.env.ESTAR_TEMPLATE_DIR || path.resolve(process.cwd(), 'assets/estar-templates'),
  'eSTAR-510k-non-ivd.pdf',
);
const hasTemplate = fsSync.existsSync(NIVD_TEMPLATE);

const PDFJS_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';
const hasPdfjs = (() => {
  try {
    createRequire(import.meta.url).resolve(PDFJS_ENTRY);
    return true;
  } catch {
    return false;
  }
})();

const K510_DEVICE = ESTAR_FIELD_MAPS['510k-device'];

/** A value unique to this file for each of the 20 mapped canonical keys. */
const VALUES: Record<string, string> = Object.fromEntries(
  Object.keys(K510_DEVICE).map((key, i) => [key, `ZZTOP-${key.toUpperCase()}-${7391 + i}`]),
);
/** One MAPPED key deliberately left unfilled — the per-key negative control. */
const UNFILLED_KEY = 'predicateDeviceTradeName';
const DATA: Record<string, string> = Object.fromEntries(
  Object.entries(VALUES).filter(([key]) => key !== UNFILLED_KEY),
);
/** A string this file never writes into any packet. */
const NEVER_WRITTEN = 'ZZTOP-NEVER-WRITTEN-ANYWHERE-0000';

/**
 * The two data-bound exclusion groups the template lays out before any script
 * runs. Item on-values were read from the template packet's `<items>`.
 * `probe*` keys exist only in this file; they are not registered mappings.
 */
const JURISDICTION = 'root.ApplicationType.ATRadioButton100';
const SUBMISSION_TYPE = 'root.ApplicationType.USA.ATRadioButton110';
/** somPath → { on-value → member field SOM path }. */
const RADIOS: Record<string, Record<string, string>> = {
  [JURISDICTION]: { '1': `${JURISDICTION}.ATRadioButton101`, '2': `${JURISDICTION}.ATRadioButton102` },
  [SUBMISSION_TYPE]: {
    '1': `${SUBMISSION_TYPE}.ATRadioButton111`,
    '2': `${SUBMISSION_TYPE}.ATRadioButton112`,
    '3': `${SUBMISSION_TYPE}.ATRadioButton113`,
  },
};
/** FDA's own default in the shipped datasets skeleton: US FDA on jurisdiction. */
const JURISDICTION_TEMPLATE_DEFAULT = '1';
const PROBE_MAP: OfficialPdfFieldMap = {
  ...K510_DEVICE,
  probeJurisdiction: { xfaSomPath: JURISDICTION, type: 'radio' },
  probeSubmissionType: { xfaSomPath: SUBMISSION_TYPE, type: 'radio' },
};

/** Every container subform of a mapped SOM path that the template hides. */
const SCRIPT_HIDDEN_SECTIONS = [
  'AdministrativeInformation',
  'AdministrativeDocumentation',
  'PMNSummary',
  'DoC',
  'Classification',
  'PredicatesSE',
  'Labeling',
];

/** Caption text the template itself carries on the page pdf.js does lay out. */
const TEMPLATE_CAPTIONS = ['Application/Submission Type', 'Premarket Notification 510(k)'];

// ---------------------------------------------------------------------------
// pdf.js XFA tree walking
// ---------------------------------------------------------------------------

/** A node of the XFA HTML tree `page.getXfa()` returns. */
interface XfaHtmlNode {
  name?: string;
  attributes?: { xfaName?: string; value?: unknown; checked?: unknown; xfaOn?: unknown };
  children?: XfaHtmlNode[];
}

interface RenderedControl {
  /** Full xfaName lineage, e.g. `Page1.root.ApplicationType.…` (page-area first). */
  lineage: string;
  element: string;
  value: unknown;
  checked: unknown;
  xfaOn: unknown;
}

interface Rendered {
  isPureXfa: boolean;
  numPages: number;
  controls: RenderedControl[];
  /** The whole tree, serialised, for "does this text appear anywhere" checks. */
  text: string;
}

function walk(node: XfaHtmlNode, ancestors: string[], out: RenderedControl[]): void {
  const xfaName = node.attributes?.xfaName;
  const lineage = xfaName ? [...ancestors, xfaName] : ancestors;
  if (node.name === 'input' || node.name === 'textarea' || node.name === 'select') {
    out.push({
      lineage: lineage.join('.'),
      element: node.name!,
      value: node.attributes?.value,
      checked: node.attributes?.checked,
      xfaOn: node.attributes?.xfaOn,
    });
  }
  for (const child of node.children ?? []) walk(child, lineage, out);
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/** Load with pdf.js's XFA engine on. pdf.js transfers the buffer, so copy it. */
async function render(pdfjs: PdfjsModule, bytes: Uint8Array): Promise<Rendered> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    enableXfa: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    const controls: RenderedControl[] = [];
    const chunks: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const xfa = (await page.getXfa()) as XfaHtmlNode | null;
      if (!xfa) continue;
      walk(xfa, [], controls);
      chunks.push(JSON.stringify(xfa));
    }
    return { isPureXfa: doc.isPureXfa, numPages: doc.numPages, controls, text: chunks.join('\n') };
  } finally {
    await doc.destroy();
  }
}

/**
 * The single laid-out control at a SOM path. pdf.js prefixes the lineage with
 * the page-area name (`Page1.root.…`), so match on the tail — and require
 * exactly one hit so a rename can never silently match nothing or everything.
 */
function controlAt(rendered: Rendered, somPath: string): RenderedControl {
  const hits = rendered.controls.filter((c) => c.lineage === somPath || c.lineage.endsWith(`.${somPath}`));
  expect(hits, `controls laid out at ${somPath}`).toHaveLength(1);
  return hits[0];
}

const somPathsOf = (map: OfficialPdfFieldMap): string[] =>
  Object.values(map)
    .map((spec) => spec.xfaSomPath!)
    .filter(Boolean);

/**
 * The production fill path, asserted to have actually produced a dynamic-XFA
 * fill of every supplied key — so a later "the value is not rendered" result can
 * only mean the renderer, never a fill that quietly did nothing.
 */
async function fillOfficialEstar(
  fieldMap: OfficialPdfFieldMap | undefined,
  data: Record<string, string>,
): Promise<FillEstarResult> {
  const r = await fillEstarSubmission({ type: '510k', variant: 'device', fieldMap, data });
  expect(r.filled, r.blockers.join(' ')).toBe(true);
  expect(r.templateKind).toBe('dynamic-xfa');
  expect(r.blockers).toEqual([]);
  expect(r.filledFields.sort()).toEqual(Object.keys(data).sort());
  return r;
}

// ---------------------------------------------------------------------------

describe.skipIf(!hasTemplate || !hasPdfjs)(
  'pdf.js (an independent XFA engine) renders the filled official nIVD eSTAR v7.0',
  () => {
    let pdfjs: PdfjsModule;
    let filledBytes: Uint8Array;
    let dirBefore: string | undefined;
    // blank = the untouched vendored template; filled = the production fill of 19
    // of the 20 mapped keys; probed = that same fill plus the two page-1 selectors.
    let blank: Rendered;
    let filled: Rendered;
    let probed: Rendered;
    beforeAll(async () => {
      dirBefore = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = path.dirname(NIVD_TEMPLATE);

      pdfjs = await import(PDFJS_ENTRY);
      const blankBytes = new Uint8Array(await fs.readFile(NIVD_TEMPLATE));

      const production = await fillOfficialEstar(undefined, DATA);
      expect(production.skippedFields).toEqual([UNFILLED_KEY]);
      filledBytes = production.pdfBytes!;

      const withProbes = await fillOfficialEstar(PROBE_MAP, {
        ...DATA,
        probeJurisdiction: '2',
        probeSubmissionType: '2',
      });

      [blank, filled, probed] = await Promise.all([
        render(pdfjs, blankBytes),
        render(pdfjs, filledBytes),
        render(pdfjs, withProbes.pdfBytes!),
      ]);
    }, 180_000);

    afterAll(() => {
      if (dirBefore === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = dirBefore;
    });

    it('1. parses the incremental update and lays out a non-trivial form (a skip or empty tree fails here)', () => {
      for (const [label, tree] of [['blank', blank], ['filled', filled], ['probed', probed]] as const) {
        expect(tree.isPureXfa, label).toBe(true);
        expect(tree.numPages, label).toBeGreaterThan(0);
        // ~77 KB of XFA HTML on this template: an empty or stub tree cannot pass.
        expect(tree.text.length, `${label} rendered tree length`).toBeGreaterThan(20_000);
        expect(tree.controls.length, `${label} laid-out controls`).toBeGreaterThan(5);
        for (const c of TEMPLATE_CAPTIONS) expect(tree.text, `${label} caption`).toContain(c);
      }
      // The appended revision changes the data, never the layout.
      expect([filled.numPages, probed.numPages]).toEqual([blank.numPages, blank.numPages]);
      expect(filled.controls.map((c) => c.lineage).sort()).toEqual(
        blank.controls.map((c) => c.lineage).sort(),
      );
    });

    it('2. displays a value written into an EMPTY datasets node (submission-type selector)', () => {
      // FDA ships <ATRadioButton110/> empty, so the blank form has nothing checked
      // and no bound group value. That is the control for this assertion.
      for (const som of Object.values(RADIOS[SUBMISSION_TYPE])) {
        const before = controlAt(blank, som);
        expect(before.element).toBe('input');
        expect(before.checked, `${som} checked in the blank template`).not.toBe(true);
        expect(before.value, `${som} bound value in the blank template`).toBeUndefined();
      }
      // We wrote "2" (De Novo). pdf.js checks exactly the member with xfaOn="2".
      for (const [on, som] of Object.entries(RADIOS[SUBMISSION_TYPE])) {
        const after = controlAt(probed, som);
        expect(after.xfaOn, `${som} on-value`).toBe(on);
        expect(after.value, `${som} bound group value`).toBe('2');
        expect(after.checked === true, `${som} checked`).toBe(on === '2');
      }
    });

    it('3. OVERRIDES a value the template already carried (jurisdiction selector)', () => {
      // FDA ships <ATRadioButton100>1</ATRadioButton100>; pdf.js renders 101 checked.
      for (const [on, som] of Object.entries(RADIOS[JURISDICTION])) {
        const before = controlAt(blank, som);
        expect(before.value, `${som} in the blank template`).toBe(JURISDICTION_TEMPLATE_DEFAULT);
        expect(before.checked === true, `${som} checked in the blank template`).toBe(
          on === JURISDICTION_TEMPLATE_DEFAULT,
        );
      }
      // We wrote "2": the check MOVES. A read-back cannot distinguish this from
      // a value the template already had; a rendering engine can.
      for (const [on, som] of Object.entries(RADIOS[JURISDICTION])) {
        const after = controlAt(probed, som);
        expect(after.value, `${som} bound group value after the fill`).toBe('2');
        expect(after.checked === true, `${som} checked after the fill`).toBe(on === '2');
      }
    });

    it('4. shows nothing that was not written (negative controls)', () => {
      // The production fill writes neither selector, so both keep their original
      // rendered state — the differential that makes tests 2 and 3 meaningful.
      for (const som of Object.values(RADIOS[SUBMISSION_TYPE])) {
        expect(controlAt(filled, som).checked, som).not.toBe(true);
      }
      for (const [on, som] of Object.entries(RADIOS[JURISDICTION])) {
        expect(controlAt(filled, som).checked === true, som).toBe(on === JURISDICTION_TEMPLATE_DEFAULT);
      }
      // A string never written appears nowhere; the blank template carries none
      // of this file's values, so anything found in `filled` came from the fill.
      for (const tree of [blank, filled, probed]) {
        for (const v of [NEVER_WRITTEN, VALUES[UNFILLED_KEY]]) expect(tree.text).not.toContain(v);
      }
      expect(blank.text).not.toContain('ZZTOP');
    });

    it('5. does NOT render the 20 administrative values — they sit under script-hidden subforms', async () => {
      // Pinned, not papered over. If pdf.js (or a new FDA revision) ever lays
      // these out, this fails and the positive assertions must be extended.
      for (const section of SCRIPT_HIDDEN_SECTIONS) {
        const laidOut = filled.controls
          .map((c) => c.lineage)
          .filter((l) => l.includes(`.${section}.`));
        expect(laidOut, `${section} controls laid out by pdf.js`).toEqual([]);
      }
      for (const [key, value] of Object.entries(DATA)) {
        expect(filled.text.includes(value), `${key} rendered by pdf.js`).toBe(false);
      }

      // The packet pdf.js parsed and bound does hold every written value, and
      // holds nothing for the one mapped key we left unfilled.
      const back = await readXfaDatasetsValues(filledBytes, somPathsOf(K510_DEVICE));
      for (const [key, value] of Object.entries(DATA)) {
        expect(back[K510_DEVICE[key].xfaSomPath!], key).toBe(value);
      }
      expect(back[K510_DEVICE[UNFILLED_KEY].xfaSomPath!], UNFILLED_KEY).toBe('');
    });
  },
);
