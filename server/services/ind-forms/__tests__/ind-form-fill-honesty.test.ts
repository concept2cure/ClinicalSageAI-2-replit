/**
 * Honesty invariants for the IND form fill service, pinned against the real
 * vendored FDA templates (not a fixture).
 *
 * ── 1. ONE fact, ONE name: which REQUIRED boxes are blank on the output ──────
 * `requiredFieldsLeftBlank` answers exactly one question, identically on every
 * render path: **which required boxes carry no value in the document this call
 * produced.** A box is blank for either reason and the sponsor cannot tell them
 * apart by looking at the form:
 *   - the project supplied no data for it (`missingRequired` says so too), or
 *   - the platform has no reviewed mapping that writes it onto this template
 *     (`unmappedFields` / `unfilledFields` say so too).
 *
 * The first cut of this field meant a DIFFERENT thing on each path. The XFA side
 * listed every required field whose value did not reach the form; the AcroForm
 * side listed only fields it could not PLACE — and a required field with no data
 * is placed there as `setText('')`, so it counted as filled and was excluded.
 * FDA 356h therefore returned `[]` — "assessed, none" — for a form whose
 * applicant_address, application_type, dosage_form, route_of_administration and
 * indication boxes were all blank. That is the fabricated clean result this file
 * now forbids, on both paths, with the same definition.
 *
 * The OTHER fact — "no reviewed mapping places this box, whatever the data" —
 * already has its own names and keeps them: `unmappedFields`/`unfilledFields` on
 * a render, and `describeRenderPlan().sponsorCompletes` before one.
 *
 * ── 2. Why the XFA path may leave a required box blank at all ────────────────
 * `fillOfficialXfaTemplate` deliberately does NOT fail closed on an unplaceable
 * required field, where the AcroForm path does. XFA output is never flattened:
 * it stays the live official form the sponsor completes in Acrobat, so an
 * unfilled box is a box the sponsor fills. FDA 1571's `ind_type` and
 * `phase_of_study` are exactly that — their accepted tokens are set by the
 * form's own XFA script, so writing one unverified would tick the wrong box.
 * The decision is sound; recording it only in a code comment was not.
 *
 * ── 3. templatesDir() resolved relative to process.cwd() ────────────────────
 * It returned the RELATIVE 'templates/forms/acroforms', which `fs.readFile`
 * resolves against the current working directory. Launched from anywhere but
 * the repository root, every read missed, `readTemplate`/`readXfaTemplate`
 * returned null from their `catch`, and all five vendored forms silently
 * downgraded — 1571/3674 to a drawn reconstruction, 1572/3454/356h to a labeled
 * draft — with no error anywhere. Reproduced below by chdir alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildFormById,
  generateAllIndForms,
  generateIndForm,
  requiredBoxesLeftToSponsor,
  templatePathFor,
} from '../ind-form-fill-service';
import type { BuiltForm, FieldValue } from '../ind-form-data-builders';

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
  drugName: 'C2C-1042 capsules',
  indication: 'Moderate to severe plaque psoriasis',
  // Both of these ARE supplied, which is the point: the builder finds nothing
  // missing, so `missingRequired` is empty while the boxes stay blank.
  indType: 'Commercial IND',
  studyPhase: 'Phase 1',
  nctNumber: 'NCT05551234',
  protocolNumbers: 'C2C-1042-101',
  irbNameAddress: 'WCG IRB, 212 Carnegie Center, Princeton NJ 08540',
  irbChairName: 'Dr. Alex Lee',
  ctgovCertificationBasis: 'requirements_met' as const,
  investigators: [
    {
      name: 'Dr. Pat Smith',
      siteName: 'Kendall Clinical Research Unit',
      siteAddress: '9 Broad Canal Way, Cambridge, MA 02142',
      irbName: 'WCG IRB',
      irbAddress: '212 Carnegie Center, Princeton NJ 08540',
      financial: { hasDisclosableInterest: true, significantEquity: true },
    },
  ],
};

/**
 * A real, ordinary early-intake project: a sponsor name and a drug name and
 * nothing else yet. Every OTHER required box on every form is blank on the
 * output — which is the case no test exercised, and the case where an empty
 * `requiredFieldsLeftBlank` would be a lie.
 */
const SPARSE_META = {
  sponsorName: 'Concept2Cure Biopharma, Inc.',
  drugName: 'C2C-1042 capsules',
  investigators: [{ name: 'Dr. Pat Smith' }],
};

/** The builder's own present-ness rule, restated here so the test does not
 *  borrow the implementation it is checking. */
function present(v: FieldValue | undefined): boolean {
  if (typeof v === 'boolean') return v;
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * The invariant every path must satisfy: every id named is genuinely REQUIRED,
 * and genuinely blank on the output — either no data, or not written by the
 * fill. And no required box that WAS written is named.
 */
function assertNamesExactlyTheBlankRequiredBoxes(
  built: BuiltForm,
  named: readonly string[],
  wroteAll: boolean,
  notWritten: readonly string[],
): void {
  const required = new Set(built.requiredFields);
  const namedSet = new Set(named);
  for (const id of named) {
    expect(required.has(id), `${id} is named but is not a required field`).toBe(true);
    const blank = !present(built.fields[id]) || (!wroteAll && notWritten.includes(id));
    expect(blank, `${id} is named but carries a value on the form`).toBe(true);
  }
  for (const id of built.requiredFields) {
    const blank = !present(built.fields[id]) || (!wroteAll && notWritten.includes(id));
    expect(namedSet.has(id) === blank, `${id}: blank=${blank} but named=${namedSet.has(id)}`).toBe(true);
  }
}

// Sibling suites install synthetic templates by pointing this at a temp dir.
// These tests read the REAL vendored assets, so the override must be off.
const savedTemplatesDir = process.env.IND_FORM_TEMPLATES_DIR;
beforeAll(() => { delete process.env.IND_FORM_TEMPLATES_DIR; });
afterAll(() => {
  if (savedTemplatesDir === undefined) delete process.env.IND_FORM_TEMPLATES_DIR;
  else process.env.IND_FORM_TEMPLATES_DIR = savedTemplatesDir;
});

describe('requiredFieldsLeftBlank means the same thing on every path', () => {
  it('FDA 356h (official AcroForm) names the required boxes left blank — it does not report none', async () => {
    const result = await generateIndForm('FDA_356H', SPARSE_META);
    const built = buildFormById('FDA_356H', SPARSE_META);

    // The output IS the official FDA file: this is the fill path, not a draft.
    expect(result.usedOfficialTemplate).toBe(true);
    // Five required boxes are blank on the PDF the sponsor receives. Before the
    // repair this list was `[]` — an assessment claiming a clean form.
    expect(result.requiredFieldsLeftBlank).toEqual(
      expect.arrayContaining([
        'applicant_address',
        'application_type',
        'dosage_form',
        'route_of_administration',
        'indication',
      ]),
    );
    // ...and the two boxes that WERE written are not swept in.
    expect(result.requiredFieldsLeftBlank).not.toContain('applicant_name');
    expect(result.requiredFieldsLeftBlank).not.toContain('proprietary_established_name');

    assertNamesExactlyTheBlankRequiredBoxes(
      built,
      result.requiredFieldsLeftBlank,
      false,
      [...(result.unmappedFields ?? []), ...(result.unfilledFields ?? [])],
    );
  }, 60_000);

  it('FDA 1572 (official AcroForm): a successful fill still names the blank required boxes', async () => {
    // The 1572 assertion used to be `toEqual([])` on fully-populated metadata.
    // That path THROWS when a required field cannot be placed, so on that input
    // the expectation could not fail for any value the function could return —
    // it asserted a compile-time constant. Sparse data is the input that makes
    // it a real assertion: the fill succeeds (nothing is unplaceable) and three
    // required boxes are nonetheless blank.
    const result = await generateIndForm('FDA_1572', SPARSE_META);
    const built = buildFormById('FDA_1572', SPARSE_META);
    expect(result.usedOfficialTemplate).toBe(true);
    expect(result.requiredFieldsLeftBlank.sort()).toEqual(['facility_name', 'irb_name']);
    // The one required box the sparse project DOES supply is not named.
    expect(result.requiredFieldsLeftBlank).not.toContain('investigator_name');
    assertNamesExactlyTheBlankRequiredBoxes(
      built,
      result.requiredFieldsLeftBlank,
      false,
      [...(result.unmappedFields ?? []), ...(result.unfilledFields ?? [])],
    );
  }, 60_000);

  it('FDA 3454 (official AcroForm): an unticked required certification counts as blank, not as filled', async () => {
    // `cb.uncheck()` succeeds, so the AcroForm fill "placed" this box. An
    // unticked certification is not a completed certification.
    const result = await generateIndForm('FDA_3454', SPARSE_META);
    expect(result.usedOfficialTemplate).toBe(true);
    expect(result.requiredFieldsLeftBlank).toEqual(
      expect.arrayContaining(['no_disclosable_interests', 'authorized_rep_name']),
    );
  }, 60_000);

  it('FDA 1571 (official XFA): names the required boxes left blank for the same two reasons', async () => {
    const result = await generateIndForm('FDA_1571', SPARSE_META);
    const built = buildFormById('FDA_1571', SPARSE_META);
    expect(result.usedOfficialTemplate).toBe(true);
    // sponsor_address / indication: no data. ind_type / phase_of_study: no
    // reviewed mapping. Both are blank boxes on the file the sponsor opens, and
    // the field does not distinguish them because the form does not either.
    expect(result.requiredFieldsLeftBlank.sort()).toEqual(
      ['ind_type', 'indication', 'phase_of_study', 'sponsor_address'],
    );
    assertNamesExactlyTheBlankRequiredBoxes(
      built,
      result.requiredFieldsLeftBlank,
      false,
      result.unmappedFields ?? [],
    );
  }, 60_000);

  it('FDA 1574 (labeled draft): reports the same fact rather than staying silent', async () => {
    // The draft renders every built field, so nothing is unplaceable — but a
    // required field with no data is still a blank box on the page. Reporting
    // `undefined` here made "not assessed" and "assessed, none" the same value
    // to any caller doing `(r.requiredFieldsLeftBlank ?? []).length === 0`.
    const result = await generateIndForm('FDA_1574', SPARSE_META);
    const built = buildFormById('FDA_1574', SPARSE_META);
    expect(result.usedOfficialTemplate).toBe(false);
    expect(result.requiredFieldsLeftBlank).toEqual(
      expect.arrayContaining(['protocol_number', 'irb_name_address', 'irb_chair_name', 'authorized_rep_name']),
    );
    expect(result.requiredFieldsLeftBlank).not.toContain('sponsor_name');
    assertNamesExactlyTheBlankRequiredBoxes(built, result.requiredFieldsLeftBlank, true, []);
  }, 60_000);

  it('every render of every form reports an array — never undefined, on any path', async () => {
    // "Absent" must not be a value a consumer has to interpret. Two of these
    // seven render as drafts and one (1571) as an official XFA fill; all of
    // them state the assessment.
    for (const result of await generateAllIndForms(SPARSE_META)) {
      expect(Array.isArray(result.requiredFieldsLeftBlank), `${result.formId}`).toBe(true);
    }
  }, 120_000);
});

describe('the required-box report on a fully populated project', () => {
  it('FDA 1571: names ind_type and phase_of_study while missingRequired is legitimately empty', async () => {
    const result = await generateIndForm('FDA_1571', META);
    expect(result.usedOfficialTemplate).toBe(true);
    // Nothing is missing from the PROJECT DATA...
    expect(result.missingRequired).toEqual([]);
    // ...yet these two required boxes are blank on the file the sponsor opens.
    expect(result.requiredFieldsLeftBlank.sort()).toEqual(['ind_type', 'phase_of_study']);
    // ...and it must not sweep in the OPTIONAL boxes that are also unplaced.
    expect(result.unmappedFields).toContain('us_agent_name');
    expect(result.requiredFieldsLeftBlank).not.toContain('us_agent_name');
  }, 60_000);

  it('FDA 3674: states it assessed the required boxes and found none blank', async () => {
    const result = await generateIndForm('FDA_3674', META);
    expect(result.usedOfficialTemplate).toBe(true);
    // Both of 3674's required builder fields (sponsor_name, drug_name) are
    // supplied and mapped, so the honest answer is an ASSESSED EMPTY list.
    expect(result.requiredFieldsLeftBlank).toEqual([]);
    // The derived QC gate is NOT a box on the form and must never be named as
    // one, even though it sits in missingRequired.
    expect(buildFormById('FDA_3674', META).qcOnlyFields).toContain('certification_selected');
    expect(result.requiredFieldsLeftBlank).not.toContain('certification_selected');
  }, 60_000);
});

describe('requiredBoxesLeftToSponsor — the data-independent half, for callers that do not render', () => {
  it('names the required boxes the official 1571 render leaves blank whatever the data', async () => {
    // The governed artifact routes store a field map, not a PDF, so they cannot
    // read `requiredFieldsLeftBlank` off a render. This is the same statement
    // with the data axis removed, taken from describeRenderPlan so it cannot
    // drift from what the renderer actually does.
    expect((await requiredBoxesLeftToSponsor('FDA_1571')).sort()).toEqual(['ind_type', 'phase_of_study']);
  }, 60_000);

  it('is empty for a form whose every required box the platform writes', async () => {
    expect(await requiredBoxesLeftToSponsor('FDA_3674')).toEqual([]);
  }, 60_000);

  it('is empty for a form rendered as a draft — the draft draws every field it was given', async () => {
    expect(await requiredBoxesLeftToSponsor('FDA_1574')).toEqual([]);
  }, 60_000);

  it('THROWS for a form it cannot plan rather than answering "none left for you"', async () => {
    // The fail-closed branch. `[]` here would tell a sponsor that a form nobody
    // can produce leaves them nothing to complete.
    await expect(requiredBoxesLeftToSponsor('FDA_9999')).rejects.toThrow(/FDA_9999/);
  }, 60_000);
});

describe('the vendored templates resolve independently of the working directory', () => {
  it('templatePathFor returns an absolute path', () => {
    expect(path.isAbsolute(templatePathFor('FDA_1571'))).toBe(true);
  });

  it('an operator override is honoured, and a blank one is ignored rather than resolved to the CWD', () => {
    // `path.resolve('')` is the current working directory, so treating a blank
    // override as a path would quietly reinstate the cwd-relative lookup the
    // resolver exists to end — and it would do it only on the machines whose
    // deploy script exports an empty variable.
    try {
      process.env.IND_FORM_TEMPLATES_DIR = path.join(path.sep, 'srv', 'fda-forms');
      expect(templatePathFor('FDA_1571')).toBe(path.join(path.sep, 'srv', 'fda-forms', 'FDA_1571.pdf'));
      for (const blank of ['', '   ']) {
        process.env.IND_FORM_TEMPLATES_DIR = blank;
        const resolved = templatePathFor('FDA_1571');
        expect(path.isAbsolute(resolved)).toBe(true);
        expect(resolved.startsWith(path.resolve(process.cwd(), blank || '.') + path.sep + 'FDA')).toBe(false);
        expect(resolved.endsWith(path.join('templates', 'forms', 'acroforms', 'FDA_1571.pdf'))).toBe(true);
      }
    } finally {
      delete process.env.IND_FORM_TEMPLATES_DIR;
    }
  });

  it('fills the official FDA 1571 when the process is launched from another directory', async () => {
    const original = process.cwd();
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-cwd-'));
    try {
      process.chdir(elsewhere);
      const result = await generateIndForm('FDA_1571', META);
      // Before the fix this was `false` + `reconstructed: true`: a drawn
      // reconstruction served in place of the FDA file, with no error raised.
      expect(result.usedOfficialTemplate).toBe(true);
      expect(result.reconstructed).toBeUndefined();
    } finally {
      process.chdir(original);
    }
  }, 60_000);

  it('fills the official FDA 1572 and 356h from another directory too', async () => {
    const original = process.cwd();
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-cwd-'));
    try {
      process.chdir(elsewhere);
      for (const formId of ['FDA_1572', 'FDA_356H']) {
        const result = await generateIndForm(formId, META);
        expect(result.usedOfficialTemplate).toBe(true);
      }
    } finally {
      process.chdir(original);
    }
  }, 60_000);
});

/**
 * POSITIVE CONTROLS — true before the repair and after it.
 *
 * The second one also records why the third reported defect in this cluster was
 * REJECTED: `generateAllIndForms` was said to give a caller no way to tell the
 * two labeled drafts from the five genuine FDA files. It always did.
 * `usedOfficialTemplate` is false on exactly those two and true on the other
 * five, and `reconstructed` separates a drawn reconstruction from a bare draft.
 */
describe('positive controls', () => {
  it('the official FDA 1571 fill still writes real values into the real FDA bytes', async () => {
    const result = await generateIndForm('FDA_1571', META);
    expect(result.usedOfficialTemplate).toBe(true);
    expect(result.fieldCoverage).toBeGreaterThan(0);
    expect(result.pdfBytes.length).toBeGreaterThan(1_000_000);
    expect(result.unmappedFields).toEqual(expect.arrayContaining(['ind_type', 'phase_of_study']));
  }, 60_000);

  it('generateAllIndForms already distinguishes the labeled drafts from the official forms', async () => {
    const all = await generateAllIndForms(META);
    const official = all.filter((r) => r.usedOfficialTemplate).map((r) => r.formId);
    const drafts = all.filter((r) => !r.usedOfficialTemplate).map((r) => r.formId);
    expect(official.sort()).toEqual(['FDA_1571', 'FDA_1572', 'FDA_3454', 'FDA_356H', 'FDA_3674']);
    // FDA_3455 and FDA_1574 have no vendored asset, so they render as drafts —
    // and say so, per form, in the returned value.
    expect(drafts.sort()).toEqual(['FDA_1574', 'FDA_3455']);
    for (const r of all.filter((x) => !x.usedOfficialTemplate)) {
      expect(r.reconstructed).toBeUndefined();
    }
  }, 120_000);
});
