/**
 * The trial-registry placement vocabulary.
 *
 * A registry record (ClinicalTrials.gov under FDAAA 801, the EU CTIS under
 * Regulation (EU) 536/2014) is a filing, so its parts need somewhere to be
 * placed. The slot list is CLOSED for the same reason the IRB slot list is
 * closed: this product defines it, deriving it from the modules
 * `registration-projection.ts` actually emits, so a misspelled slot is a
 * mistake we can name instead of a folder in an assembled package.
 *
 * The drift test that pins the slots to the projection lives with the engine
 * (`server/services/study-design/__tests__/registry-filing.test.ts`), because
 * `shared/` must not import server code.
 */
import { describe, it, expect } from 'vitest';

import {
  REGISTRY_SLOTS,
  REGISTRY_SLOT_CODES,
  REGISTRY_MODULE_SLOTS,
  isRegistrySlot,
  validateSectionCode,
  vocabularyForApplicationType,
  PLACEMENT_VOCABULARIES,
} from '../placement-vocabulary';

describe('the registry slot list', () => {
  it('is namespaced, sorted and closed', () => {
    expect(REGISTRY_SLOT_CODES.length).toBeGreaterThan(0);
    for (const code of REGISTRY_SLOT_CODES) expect(code).toMatch(/^registry\./);
    expect([...REGISTRY_SLOT_CODES]).toEqual([...REGISTRY_SLOT_CODES].slice().sort());
    expect(REGISTRY_SLOT_CODES.length).toBe(Object.keys(REGISTRY_SLOTS).length);
  });

  it('recognises its own slots and nothing else', () => {
    for (const code of REGISTRY_SLOT_CODES) expect(isRegistrySlot(code)).toBe(true);
    expect(isRegistrySlot('registry.identifcation')).toBe(false); // misspelled
    expect(isRegistrySlot('irb.protocol')).toBe(false);
    expect(isRegistrySlot('3.2.S.4.2')).toBe(false);
  });

  it('maps every declared projection module onto a declared slot', () => {
    for (const [moduleName, slot] of Object.entries(REGISTRY_MODULE_SLOTS)) {
      expect(moduleName.length).toBeGreaterThan(0);
      expect(isRegistrySlot(slot)).toBe(true);
    }
  });
});

describe('validateSectionCode — registry', () => {
  it('accepts a declared slot and canonicalises its case', () => {
    const v = validateSectionCode('Registry.Identification', 'registry');
    expect(v.ok).toBe(true);
    expect(v.vocabulary).toBe('registry');
    expect(v.canonical).toBe('registry.identification');
  });

  it('refuses a code that is not a slot, naming the vocabulary and real slots', () => {
    const v = validateSectionCode('registry.identifcation', 'registry');
    expect(v.ok).toBe(false);
    expect(v.vocabulary).toBe('registry');
    expect(v.message).toMatch(/registry/i);
    // The message must list REAL slots, not a shape hint.
    for (const code of REGISTRY_SLOT_CODES) expect(v.message).toContain(code);
    expect(v.message).toMatch(/closed/i);
  });

  it('refuses an IRB slot and a CTD code, because membership is checked', () => {
    expect(validateSectionCode('irb.protocol', 'registry').ok).toBe(false);
    expect(validateSectionCode('2.7.3', 'registry').ok).toBe(false);
  });

  it('is in the vocabulary list', () => {
    expect(PLACEMENT_VOCABULARIES).toContain('registry');
  });
});

describe('vocabularyForApplicationType — registry types', () => {
  it('maps registry-specific application types', () => {
    for (const t of ['registry', 'trial-registry', 'ctgov', 'clinicaltrials.gov', 'ctgov-registration', 'ctis-registration']) {
      expect(vocabularyForApplicationType(t)).toBe('registry');
    }
    expect(vocabularyForApplicationType('  CTGOV ')).toBe('registry');
  });

  it('does not repurpose any existing application type', () => {
    for (const t of ['ind', 'nda', 'bla', 'anda', 'maa', 'aada']) expect(vocabularyForApplicationType(t)).toBe('ctd');
    for (const t of ['510k', '510(k)', 'de_novo', 'de-novo', 'pma']) expect(vocabularyForApplicationType(t)).toBe('estar');
    expect(vocabularyForApplicationType('cta')).toBe('ctis');
    for (const t of ['irb', 'iec', 'irb-submission']) expect(vocabularyForApplicationType(t)).toBe('irb');
    expect(vocabularyForApplicationType('something-unknown')).toBe('ctd');
  });
});
