/**
 * Medical-writing QC analyzers — unit tests. Deterministic, no IO.
 */
import { describe, it, expect } from 'vitest';
import {
  assessReadability,
  buildAbbreviationList,
  countSyllables,
} from '../medical-writing-qc';

describe('countSyllables', () => {
  it('estimates syllables for common words', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('table')).toBe(2);
    expect(countSyllables('regulatory')).toBeGreaterThanOrEqual(4);
    expect(countSyllables('')).toBe(0);
  });
});

describe('assessReadability', () => {
  it('rates simple prose as easy and meeting the patient target', () => {
    const simple = 'We did a study. It helped people feel better. The drug was safe. Most people had no side effects.';
    const r = assessReadability(simple, 'patient');
    expect(r.words).toBeGreaterThan(0);
    expect(r.fleschKincaidGrade).toBeLessThanOrEqual(8);
    expect(r.meetsTarget).toBe(true);
    expect(r.verdict).toMatch(/Meets the patient target/);
  });

  it('flags dense regulatory prose as too complex for a patient audience, with suggestions', () => {
    const dense =
      'The pharmacokinetic characterization demonstrated that systemic exposure, as quantified by the ' +
      'area under the concentration–time curve, exhibited dose-proportional escalation commensurate ' +
      'with the administered investigational medicinal product across the evaluated cohorts, ' +
      'notwithstanding substantial interindividual variability attributable to polymorphic metabolism.';
    const r = assessReadability(dense, 'patient');
    expect(r.meetsTarget).toBe(false);
    expect(r.fleschKincaidGrade).toBeGreaterThan(8);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it('returns a no-text verdict for empty input', () => {
    const r = assessReadability('   ', 'general');
    expect(r.words).toBe(0);
    expect(r.meetsTarget).toBe(false);
    expect(r.verdict).toMatch(/No text/);
  });
});

describe('buildAbbreviationList', () => {
  it('detects definitions at first use (both patterns) and counts occurrences', () => {
    const text =
      'The Clinical Study Report (CSR) was finalized. The CSR follows ICH E3. ' +
      'We assessed PFS (progression-free survival) as a key endpoint, and PFS was met.';
    const r = buildAbbreviationList(text);
    const byAbbr = new Map(r.abbreviations.map(a => [a.abbreviation, a]));

    expect(byAbbr.get('CSR')?.definedAtFirstUse).toBe(true); // "Clinical Study Report (CSR)"
    expect(byAbbr.get('CSR')?.count).toBe(2);
    expect(byAbbr.get('PFS')?.definedAtFirstUse).toBe(true); // "PFS (progression-free survival)"
    expect(byAbbr.get('PFS')?.expansion).toContain('progression-free');
  });

  it('flags abbreviations used without a first-use definition', () => {
    const text = 'The ORR and the DoR were both reported, but neither ORR nor DoR was defined.';
    const r = buildAbbreviationList(text);
    expect(r.undefinedAbbreviations).toEqual(expect.arrayContaining(['ORR', 'DoR']));
  });

  it('ignores trivial all-caps stopwords and pure numbers', () => {
    const text = 'THE US AND EU agreed. The value was 95 and 100.';
    const r = buildAbbreviationList(text);
    const names = r.abbreviations.map(a => a.abbreviation);
    expect(names).not.toContain('THE');
    expect(names).not.toContain('AND');
    expect(names).not.toContain('95');
  });
});
