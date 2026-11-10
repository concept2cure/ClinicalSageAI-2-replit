/**
 * Every input the Module 3 composer can report as missing has words of its own (P-122 defects, item 3, 2026-11-10).
 *
 * CMC printed the composer's payload keys ("missing: formulationCompositionComplete"). The screens and the approve
 * route's refusal now say each through shared/cmc/module3-input-words.ts. This holds the composer to that
 * vocabulary: a rule that requires a new field, or reports a new source type, fails here until the field has words,
 * instead of reaching a screen as the fallback's spaced-out key.
 *
 * Evidence: docs/evidence/DESIGN/P-122/defects/3-cmc-words/.
 */
import { describe, expect, it } from 'vitest';
import { CMC_SOURCE_TYPES, MODULE3_SECTION_RULES, composeModule3FromCanonicalSources } from '../module3Composer';
import { composeAppendices, composeRegional, type RegionCode } from '../module3-extensions';
import {
  hasModule3InputWords, module3InputList, module3InputWords,
} from '../../../shared/cmc/module3-input-words';

const REGIONS: RegionCode[] = ['US', 'EU', 'JP', 'CA'];
const KEY = /[a-z][A-Z]|_/;

/** Every key the composer, its appendices and every region's section can report as missing. */
function reportableKeys(): string[] {
  const keys = new Set<string>();
  const add = (sections: Array<{ missingInputs: string[] }>) => sections.forEach((s) => s.missingInputs.forEach((k) => keys.add(k)));
  add(composeModule3FromCanonicalSources([]));
  add(composeAppendices([]));
  for (const region of REGIONS) {
    add(composeRegional([], region));
    add(composeRegional([], region, { applicationType: 'IND' }));
  }
  for (const rule of MODULE3_SECTION_RULES) {
    rule.requiredFields.forEach((k) => keys.add(k));
    (rule.conditionalFields ?? []).forEach((c) => keys.add(c.field));
  }
  CMC_SOURCE_TYPES.forEach((t) => keys.add(t));
  return [...keys].sort();
}

describe('the Module 3 input vocabulary', () => {
  it('has words for every input the composer can report as missing', () => {
    const keys = reportableKeys();
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((k) => !hasModule3InputWords(k))).toEqual([]);
  });

  it('says none of them as a key', () => {
    expect(reportableKeys().map(module3InputWords).filter((w) => KEY.test(w))).toEqual([]);
  });

  it('says the demo\'s missing inputs as a reader says them', () => {
    expect(module3InputList(['formulationCompositionComplete'])).toBe('a current formulation with its named components');
    expect(module3InputList(['manufacturingProcessDev', 'containerClosureStudies']))
      .toBe('the drug product’s manufacturing process development; the drug product’s container closure studies');
    expect(module3InputList(['biologicalActivity', 'impurity_profile', 'qc_result', 'batch']))
      .toBe('biological activity; an impurity profile record; a QC result record; a batch record');
  });

  it('says a key nobody has worded yet as words, never as the key', () => {
    expect(module3InputWords('someNewRequiredField')).toBe('some new required field');
    expect(module3InputWords('another_source_kind')).toBe('another source kind');
  });
});
