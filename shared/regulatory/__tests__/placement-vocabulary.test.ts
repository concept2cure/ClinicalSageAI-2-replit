/**
 * Placement vocabulary — which section-code alphabet a submission type uses.
 *
 * The behaviour that matters most is the one that is NOT new: an eCTD sequence
 * must be judged exactly as it was before this module existed, because the CTD
 * gate was written for a real defect (a section code becoming a folder name and
 * a package shipping with a top-level `mm/m1-us-1-2/` directory). Most of these
 * tests exist to prove the generalisation did not loosen it.
 */
import { describe, it, expect } from 'vitest';

import {
  IRB_SLOT_CODES,
  PLACEMENT_VOCABULARIES,
  isIrbSlot,
  validateSectionCode,
  vocabularyForApplicationType,
} from '../placement-vocabulary';

describe('vocabularyForApplicationType', () => {
  it('maps the drug and biologic applications to CTD', () => {
    for (const t of ['ind', 'nda', 'bla', 'anda', 'maa']) {
      expect(vocabularyForApplicationType(t)).toBe('ctd');
    }
  });

  it('maps the device applications to eSTAR and the EU trial application to CTIS', () => {
    for (const t of ['510k', 'de_novo', 'pma']) expect(vocabularyForApplicationType(t)).toBe('estar');
    expect(vocabularyForApplicationType('cta')).toBe('ctis');
  });

  it('maps an IRB submission to the IRB slots', () => {
    expect(vocabularyForApplicationType('irb')).toBe('irb');
    expect(vocabularyForApplicationType('iec')).toBe('irb');
  });

  it('is case and whitespace insensitive', () => {
    expect(vocabularyForApplicationType('  510K ')).toBe('estar');
    expect(vocabularyForApplicationType('IND')).toBe('ctd');
  });

  /*
   * This is the compatibility guarantee. Every submission in this product
   * today files on CTD headings, so anything unrecognised must land on the
   * STRICTEST vocabulary. Defaulting the other way would silently widen what
   * can be written into a package the day someone adds a new application type.
   */
  it('defaults an unknown, empty or absent application type to CTD', () => {
    for (const t of ['', '   ', 'something-new', null, undefined]) {
      expect(vocabularyForApplicationType(t as string)).toBe('ctd');
    }
  });
});

describe('validateSectionCode — CTD, unchanged', () => {
  it('accepts the codes the gate always accepted', () => {
    for (const c of ['1.2', '2.7.3', '3.2.S.4.2', 'm1.1.1', '5.3.5.1']) {
      expect(validateSectionCode(c, 'ctd').ok).toBe(true);
    }
  });

  it('still refuses a bare module, because a container is not a place a document can go', () => {
    const v = validateSectionCode('3', 'ctd');
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/container, not a section/);
  });

  it('still refuses a path fragment — the defect the gate was written for', () => {
    expect(validateSectionCode('m1/us/1.2', 'ctd').ok).toBe(false);
  });

  it('refuses an eSTAR code on a CTD submission, and names CTD in the refusal', () => {
    const v = validateSectionCode('device-description', 'ctd');
    expect(v.ok).toBe(false);
    expect(v.vocabulary).toBe('ctd');
    expect(v.message).toMatch(/CTD section code/);
  });
});

describe('validateSectionCode — eSTAR and CTIS, shape only', () => {
  it('accepts a hyphenated device section identifier', () => {
    for (const c of ['device-description', 'clinical-performance-testing', 'estar.clinical-investigations']) {
      expect(validateSectionCode(c, 'estar').ok).toBe(true);
    }
  });

  it('refuses a slash, a space or punctuation, because the value becomes a folder', () => {
    for (const c of ['estar/device-description', 'device description', 'device_description', 'device-description!']) {
      expect(validateSectionCode(c, 'estar').ok).toBe(false);
    }
  });

  /* Capitals are ACCEPTED and canonicalised, which is what the CTD branch does
     too: the code is stored as the caller wrote it and the packager
     canonicalises when it derives the layout. The first version of this module
     said in its refusal message that capitals were refused, while the code
     lower-cased them — the message was wrong, not the behaviour. */
  it('accepts a capitalised identifier and canonicalises it', () => {
    const v = validateSectionCode('Device-Description', 'estar');
    expect(v.ok).toBe(true);
    expect(v.canonical).toBe('device-description');
  });

  /*
   * Deliberate, and the reason is recorded in the module: the eSTAR and CTIS
   * section sets are not vendored in this repository. The CTD gate's own
   * docstring records what happens when a membership check outruns the list
   * behind it — four codes this product writes are absent from FDA's published
   * Module 1 table. A shape rule refuses the defect that actually occurred
   * without claiming a completeness we have not earned, and the refusal says so.
   */
  it('does not pretend to know the published eSTAR section list', () => {
    const invented = validateSectionCode('a-section-nobody-has-heard-of', 'estar');
    expect(invented.ok).toBe(true);

    const refusal = validateSectionCode('Not A Code', 'estar');
    expect(refusal.message).toMatch(/SHAPE, not membership/);
  });

  it('judges CTIS by the same shape rule and says CTIS in the refusal', () => {
    expect(validateSectionCode('part-i.protocol', 'ctis').ok).toBe(true);
    expect(validateSectionCode('Part I/Protocol', 'ctis').message).toMatch(/CTIS/);
  });
});

describe('validateSectionCode — IRB, a closed list', () => {
  it('accepts every declared slot', () => {
    for (const slot of IRB_SLOT_CODES) expect(validateSectionCode(slot, 'irb').ok).toBe(true);
  });

  /*
   * Membership IS checked here, and the asymmetry with eSTAR is the point:
   * this product defines the IRB slots, so a code that is not on the list is a
   * mistake we can name. The alternative is a folder called `irb.conset` in a
   * package that went to a review board.
   */
  it('refuses a misspelled slot and lists the real ones', () => {
    const v = validateSectionCode('irb.conset', 'irb');
    expect(v.ok).toBe(false);
    expect(v.message).toContain('irb.consent');
    expect(v.message).toMatch(/closed/);
  });

  it('refuses a CTD code on an IRB package', () => {
    expect(validateSectionCode('2.7.3', 'irb').ok).toBe(false);
  });

  it('carries the slots the design document names', () => {
    for (const slot of [
      'irb.protocol', 'irb.consent', 'irb.assent', 'irb.hipaa-authorization',
      'irb.recruitment-material', 'irb.investigator-cv', 'irb.form-1572',
      'irb.financial-disclosure', 'irb.safety-monitoring-plan',
    ]) {
      expect(isIrbSlot(slot)).toBe(true);
    }
  });
});

describe('validateSectionCode — shared rules', () => {
  it('refuses an empty code in every vocabulary', () => {
    for (const v of PLACEMENT_VOCABULARIES) {
      expect(validateSectionCode('   ', v).ok).toBe(false);
      expect(validateSectionCode('', v).message).toMatch(/required/);
    }
  });

  it('names the vocabulary that judged the code, in every verdict', () => {
    for (const v of PLACEMENT_VOCABULARIES) {
      expect(validateSectionCode('nonsense value', v).vocabulary).toBe(v);
    }
  });

  it('is deterministic', () => {
    const a = JSON.stringify(validateSectionCode('2.7.3', 'ctd'));
    expect(JSON.stringify(validateSectionCode('2.7.3', 'ctd'))).toBe(a);
  });
});
