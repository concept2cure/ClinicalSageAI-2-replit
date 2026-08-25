/**
 * BP-W1-3 — the nine regulatory metadata corrections, pinned.
 *
 * ── Why these are asserted and not merely fixed ──────────────────────────────
 * Every row below was WRONG in a way that nothing in the product could detect.
 * A module assignment is not display metadata: it decides where a document lands
 * in the eCTD backbone and therefore whether the sequence validates. An
 * Investigator's Brochure filed into M5 and an ANDA with no module for its own
 * bioequivalence evidence are both silent failures — the catalog reads
 * plausibly, the submission does not assemble.
 *
 * They were also wrong in a way that reverts easily. These values live in long
 * single-line object literals among 159 siblings; a merge, a bulk edit or a
 * re-port from the kit puts 'M5' back without anyone noticing. That is what this
 * file is for.
 *
 * ── SME SIGN-OFF REQUIRED BEFORE MERGE ──────────────────────────────────────
 * The work order marks BP-W1-3 as DOMAIN and states it must not merge without
 * SME sign-off. These assertions record what was changed and on what authority;
 * they do not substitute for that review. One row in particular — ICH_ICF — was
 * a CHOICE the work order left open ("assign a format and module, or remove from
 * the catalog") and is flagged in its own `moduleAuthority` string.
 */
import { describe, it, expect } from 'vitest';
import { GLOBAL_REGISTRY } from '../global-document-registry';

const byId = (id: string) => {
  const row = GLOBAL_REGISTRY.find((e) => e.id === id);
  if (!row) throw new Error(`registry row ${id} not found`);
  return row;
};

describe('BP-W1-3 — filing catalog metadata corrections', () => {
  it("Investigator's Brochure is Module 1 for a US IND, not Module 5", () => {
    const ib = byId('ICH_IB');
    expect(ib.ctdModule).toContain('M1');
    expect(ib.ctdModule).toContain('m1.14.4.1');
    // The specific regression: M5 is where the clinical study reports live.
    expect(ib.ctdModule).not.toBe('M5');
    expect(ib.moduleAuthority).toBeTruthy();
  });

  it('ANDA carries Module 5 — its bioequivalence evidence has to go somewhere', () => {
    const anda = byId('US_ANDA');
    expect(anda.ctdModule).toContain('M5');
    expect(anda.ctdModule).toContain('5.3.1');
    expect(anda.ctdModule).not.toBe('M1–M3');
  });

  it('ANDS (Health Canada) carries Module 5 for the same reason', () => {
    const ands = byId('CA_ANDS');
    expect(ands.ctdModule).toContain('M5');
    expect(ands.ctdModule).not.toBe('M1–M3');
  });

  it('PSP and PIP are separate submissions and no longer alias each other', () => {
    const psp = byId('US_PSP');
    const pip = byId('EU_PIP');

    // The conflation was in the synonym lists: searching "PIP" surfaced the FDA
    // record and vice versa, so a user could open the wrong obligation with the
    // wrong deadline and the wrong agency.
    expect(psp.synonyms.map((s) => s.toLowerCase())).not.toContain('pip');
    expect(pip.synonyms.map((s) => s.toLowerCase())).not.toContain('psp');

    // Different agencies.
    expect(psp.agency).toBe('FDA');
    expect(pip.agency).toBe('EMA');

    // Different legal bases, both now recorded rather than implied.
    expect(psp.description + (psp.moduleAuthority ?? '')).toContain('314.55');
    expect(pip.description + (pip.moduleAuthority ?? '')).toContain('1901/2006');

    // And they no longer share the single description that made them look like
    // one filing type with two names.
    expect(psp.description).not.toBe(pip.description);
  });

  it('MedWatch/FAERS is gone as a filing type; the two real obligations replace it', () => {
    // FAERS is a database and MedWatch is a form family. Neither is something a
    // sponsor plans, schedules or assembles.
    expect(GLOBAL_REGISTRY.find((e) => e.id === 'US_MEDWATCH')).toBeUndefined();

    const icsr = byId('US_ICSR_15DAY');
    expect(icsr.submissionFormat).toBe('E2B(R3)');
    expect(icsr.dossierStandard).toBe('none');
    expect(icsr.moduleAuthority).toContain('314.80(c)(1)');

    const pader = byId('US_PADER');
    expect(pader.moduleAuthority).toContain('314.80(c)(2)');

    // Searching the old names still finds the real obligation rather than nothing.
    const synonyms = icsr.synonyms.map((s) => s.toLowerCase());
    expect(synonyms).toContain('medwatch');
    expect(synonyms).toContain('faers');
  });

  it('the ICF is filable — it had no format and no module at all', () => {
    const icf = byId('ICH_ICF');
    expect(icf.submissionFormat).not.toBe('none');
    expect(icf.ctdModule).toBeTruthy();
    // Flagged as an SME decision, since the work order offered assign-or-remove.
    expect(icf.moduleAuthority).toContain('SME DECISION REQUIRED');
  });

  it('every corrected module assignment names the specification that decides it', () => {
    // BP-W1-4's requirement, applied to the rows BP-W1-3 touched: an assignment
    // nobody can trace can only be re-guessed, which is how four errors got in.
    for (const id of ['ICH_IB', 'US_ANDA', 'CA_ANDS', 'US_PSP', 'EU_PIP', 'ICH_ICF']) {
      expect(byId(id).moduleAuthority, `${id} has no recorded authority`).toBeTruthy();
    }
  });
});
