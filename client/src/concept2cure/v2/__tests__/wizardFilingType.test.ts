// @vitest-environment jsdom
//
// jsdom is required, not preferred: RegistryBridge.tsx:409 assigns
// GLOBAL_REGISTRY onto `window` at module scope for legacy callers, so importing
// it under the node environment throws ReferenceError before a single assertion
// runs. Nothing here touches the DOM otherwise.

/**
 * The wizard must create the filing type the customer picked.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Selecting "Clinical Trial Application (CTA)" in the New Project wizard created
 * a US **NDA**. Not an error, not an empty project — a fully scaffolded
 * 71-section US marketing dossier, bound to `nda:fda`, for a customer who asked
 * to start a clinical trial in Europe.
 *
 * The mechanism is three files deep and no single line is wrong:
 *
 *   1. RegistryBridge.tsx's tuple contract is
 *      `[id, name, agency, region, dossierStandard, ctdModule, format, description, pathwayKey?]`
 *      and the `eu_cta` row had only EIGHT elements.
 *   2. Projects.tsx:130 reads `ctx.pathwayKey || 'ctd'` — a missing key silently
 *      becomes the string 'ctd'.
 *   3. programTypeFor() matches `pw === 'ctd'` and returns 'nda'.
 *
 * So the absence of one array element, three files away, is the difference
 * between a CTA and an NDA. Nothing type-checks it: the tuple is
 * `RegistryTuple`, the 9th slot is optional, and an 8-element row is valid
 * TypeScript.
 *
 * ── Why this test and not a render test ───────────────────────────────────────
 * The failure is a pure function of the registry row, and it is invisible in the
 * rendered wizard — the UI shows the right label either way. Only the value
 * POSTed to /api/c2c/projects differs, and that is what this asserts.
 *
 * migrations/20260806 seeds cta:ema with the real CTR 536/2014 Annex I outline,
 * and server-side `cta` has been a legal program type and doc_type since then.
 * All of that was unreachable from the product until the pathwayKey was added.
 */

import { describe, it, expect } from 'vitest';
import { programTypeFor } from '../surfaces/Projects';
import { getSubmissionTypeContext, GLOBAL_REGISTRY } from '../surfaces/RegistryBridge';

/** Exactly what Projects.tsx:130 builds before calling programTypeFor. */
function selFor(id: string) {
  const ctx = getSubmissionTypeContext(id);
  if (!ctx) return null;
  return { ...ctx, label: ctx.displayName, pathway: ctx.pathwayKey || 'ctd' } as never;
}

describe('the New Project wizard creates the filing type that was chosen', () => {
  it('an EU CTA is a CTA, not an NDA', () => {
    // The regression. Before the fix this returned 'nda'.
    expect(programTypeFor(selFor('eu_cta'), 'biotech')).toBe('cta');
  });

  it('the eu_cta registry row actually carries a pathwayKey', () => {
    // Asserted separately from the mapping above, because the mapping would also
    // pass on a row whose id merely happens to contain 'cta'. The defect was a
    // missing array element, so the missing array element is what is pinned.
    const ctx = getSubmissionTypeContext('eu_cta');
    expect(ctx, 'eu_cta vanished from the registry').toBeTruthy();
    expect(ctx!.pathwayKey, 'eu_cta lost its pathwayKey — it will create an NDA again').toBe('cta');
  });

  it('the eu_cta row no longer claims to be an eCTD five-module dossier', () => {
    // A CTR 536/2014 CTA is Part I / Part II through CTIS. The row previously
    // said 'eCTD' / 'M1–M5' while its own description said "via CTIS portal",
    // and both strings are shown to the user on the wizard's review step.
    const ctx = getSubmissionTypeContext('eu_cta')!;
    expect(ctx.ctdModule).not.toBe('M1–M5');
    expect(ctx.submissionFormat).toBe('CTIS');
  });

  it('a 505(b)(2) is an NDA, a 351(k) is a BLA, a DMF is a master file — none of them is an IND', () => {
    // Each fell through every branch to the final 'ind' default before this.
    expect(programTypeFor(selFor('us_505b2'), 'biotech')).toBe('nda');
    expect(programTypeFor(selFor('us_351k'), 'biotech')).toBe('bla');
    expect(programTypeFor(selFor('us_dmf'), 'biotech')).toBe('dmf');
    for (const id of ['us_505b2', 'us_351k', 'us_dmf']) {
      expect(getSubmissionTypeContext(id), `${id} vanished from the registry`).toBeTruthy();
      expect(programTypeFor(selFor(id), 'biotech')).not.toBe('ind');
    }
  });

  it('the controls still map correctly', () => {
    // If these break, the fix above changed something it should not have.
    expect(programTypeFor(selFor('us_ind'), 'biotech')).toBe('ind');
    expect(programTypeFor(selFor('us_nda'), 'biotech')).toBe('nda');
  });

  /*
   * The 33 rows that used to be filed as US NDAs.
   *
   * Every one is a device, IVD or non-US clinical-trial application, and every
   * one resolved to 'nda' because its tuple had no 9th element and
   * `pathwayKey || 'ctd'` then matched `pw === 'ctd'`. An EU MDR Class III
   * technical file and a TGA IVD inclusion were both being scaffolded as a
   * 71-section US 505(b)(1) marketing dossier.
   *
   * 'device' and 'ivd' are accepted by the API and deliberately unmapped in
   * PROGRAM_TO_DOC_TYPE, so they now fail closed — the project is created and no
   * document is written. That is only honest because the wizard surfaces
   * meta.scaffoldSkipped; the two changes ship together.
   */
  it.each(['ctn_au', 'cta_hc', 'ctn_jp', 'cta_nmpa'])(
    '%s is a clinical trial application, not a marketing application',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('cta');
    },
  );

  /*
   * EU MDR and IVDR now have REAL packs (migrations/20260810b), so they route to
   * their own doc_types and scaffold Annex II + III rather than failing closed.
   * That is the difference between honest and sellable, and it is why these are
   * asserted apart from the device/ivd rows below.
   */
  it.each(['eu_mdr_i', 'eu_mdr_iia', 'eu_mdr_iib', 'eu_mdr_iii', 'eu_sig_change', 'eu_clin_inv'])(
    '%s routes to the EU MDR technical file',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('mdr');
    },
  );

  it.each(['eu_ivdr_a', 'eu_ivdr_b', 'eu_ivdr_cd', 'cdx_ivdr_d', 'ivdr_perf_study',
           'ivdr_pmpf', 'ivd_pms_plan'])(
    '%s routes to the EU IVDR technical file',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('ivdr');
    },
  );

  /*
   * These still fail closed, and correctly. A Japanese Shonin, a Health Canada
   * device licence and a UKCA registration each name a jurisdiction's device
   * approval, not one enumerated dossier structure — unlike MDR Annex II, there
   * is no single shape to seed. They decline visibly rather than borrowing one.
   */
  it.each(['uk_ukca', 'pmda_shonin', 'nmpa_device', 'tga_device', 'hc_mdl', 'br_device'])(
    '%s is a device filing with no defined pack and fails closed',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('device');
    },
  );

  it.each(['pmda_ivd', 'nmpa_ivd', 'tga_ivd', 'hc_ivd', 'ivd_vigilance'])(
    '%s is an IVD filing with no defined pack and fails closed',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('ivd');
    },
  );

  it('no device or IVD filing resolves to a drug marketing application', () => {
    /*
     * Derived from the registry's OWN `segment` field, not from a list of ids.
     *
     * The first version of this test used a hand-written id regex, and it passed
     * while seven rows were still broken — class_513g, dev_nb_consult, fda_hde,
     * eu_sig_change, dev_fsc, eu_clin_inv, cip_iso — because I built the regex
     * from the rows I had already fixed. A test fitted to its own answer cannot
     * fail, and two of those seven had been named explicitly in the audit that
     * prompted the fix.
     *
     * `segment` is assigned per row by whoever adds it, so a new medical-device
     * filing is in scope the moment it exists, without anyone remembering to
     * extend a pattern here.
     */
    const deviceish = GLOBAL_REGISTRY.filter(
      (e) => e.segment === 'medical_devices' || e.segment === 'diagnostics_ivd',
    );
    expect(deviceish.length, 'the segment filter matched nothing — has the field been renamed?')
      .toBeGreaterThan(40);

    const DRUG_MARKETING = new Set(['nda', 'bla', 'maa', 'anda', 'jnda', 'cta', 'ind']);
    const wrong = deviceish
      .map((e) => [e.id, programTypeFor(selFor(e.id), 'biotech')] as const)
      .filter(([, pt]) => DRUG_MARKETING.has(pt))
      .map(([id, pt]) => `${id} -> ${pt}`);

    expect(
      wrong,
      'a device or IVD filing resolves to a drug marketing application — it will ' +
        'scaffold a CTD dossier for a device',
    ).toEqual([]);
  });
});
