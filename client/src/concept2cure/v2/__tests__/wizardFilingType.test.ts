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
import { getSubmissionTypeContext } from '../surfaces/RegistryBridge';

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

  it('the controls still map correctly', () => {
    // If these break, the fix above changed something it should not have.
    expect(programTypeFor(selFor('us_ind'), 'biotech')).toBe('ind');
    expect(programTypeFor(selFor('us_nda'), 'biotech')).toBe('nda');
  });

  /*
   * The four rest-of-world clinical-trial applications STILL map to 'nda', and
   * that is recorded here rather than fixed, because fixing it needs something
   * this change does not have.
   *
   * Giving cta_hc a pathwayKey of 'cta' makes resolveDocumentClass produce
   * (cta, hc). No c2c_rule_packs row satisfies that, so the composite FK sends
   * the scaffold down NO_RULE_PACK and the customer gets no document at all.
   * Declining is arguably more honest than filing a Canadian trial application
   * as a US marketing application — this codebase says so explicitly in
   * document-class.ts — but it is a product decision, and it needs cta packs for
   * hc / nmpa / tga / pmda to exist first.
   *
   * Pinned so the next person finds a failing expectation instead of folklore.
   */
  it.each(['cta_hc', 'cta_nmpa', 'ctn_au', 'ctn_jp'])(
    '%s is still mis-mapped to nda — no cta pack exists for its agency',
    (id) => {
      expect(programTypeFor(selFor(id), 'biotech')).toBe('nda');
    },
  );
});
