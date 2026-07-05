/**
 * Numeric fact extraction — device/IVD vocabulary.
 * The extractor is the single upstream that feeds both the dossier consistency
 * check and the citation scanner, so its device/IVD coverage is what unblocks
 * inconsistency-intelligence for device programs. These tests lock the new
 * labels and guard against the bare-number false positives the anchors prevent.
 */

import { describe, it, expect } from 'vitest';

import { extractNumericalFacts } from '../cross-artifact-consistency';

function labelsIn(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of extractNumericalFacts(text)) if (!m.has(f.label)) m.set(f.label, f.value);
  return m;
}

describe('extractNumericalFacts — device / IVD performance claims', () => {
  it('captures clinical sensitivity and specificity with a connector', () => {
    const m = labelsIn(
      'The assay demonstrated a clinical sensitivity of 95.2% and specificity of 98.7% in the pivotal study.'
    );
    expect(m.get('sensitivity')).toBe('95.2');
    expect(m.get('specificity')).toBe('98.7');
  });

  it('captures PPA / NPA agreement measures', () => {
    const m = labelsIn('Positive percent agreement (PPA) was 92% and NPA = 99%.');
    expect(m.get('ppa')).toBe('92');
    expect(m.get('npa')).toBe('99');
  });

  it('captures analytical performance: LoD, LoB, LoQ, precision CV', () => {
    const m = labelsIn(
      'The limit of detection was 50 copies/mL; LoB of 0; LoQ: 100. Repeatability CV of 4.2% was observed.'
    );
    expect(m.get('lod')).toBe('50');
    expect(m.get('lob')).toBe('0');
    expect(m.get('loq')).toBe('100');
    expect(m.get('precision_cv')).toBe('4.2');
  });

  it('captures submission identifiers (510(k), De Novo, PMA)', () => {
    const m = labelsIn('The predicate device K123456 was cleared; see also DEN180042 and P210007.');
    expect(m.get('predicate_knumber')).toBe('K123456');
    expect(m.get('de_novo_number')).toBe('DEN180042');
    expect(m.get('pma_number')).toBe('P210007');
  });

  it('captures the risk priority number', () => {
    expect(labelsIn('The residual RPN of 12 was deemed acceptable.').get('rpn')).toBe('12');
  });
});

describe('extractNumericalFacts — false-positive guards', () => {
  it('does not capture a bare percentage with no label anchor', () => {
    const m = labelsIn('Roughly 95% of respondents were satisfied with the packaging.');
    expect(m.has('sensitivity')).toBe(false);
    expect(m.has('specificity')).toBe(false);
    expect(m.has('precision_cv')).toBe(false);
  });

  it('does not mistake ordinary K/P tokens without the identifier shape', () => {
    // K7 / P3 are too short for the K######/P###### submission-id patterns.
    const m = labelsIn('Vitamin K7 and phase P3 were noted in the report body text here.');
    expect(m.has('predicate_knumber')).toBe(false);
    expect(m.has('pma_number')).toBe(false);
  });

  it('still extracts the pharma vocabulary unchanged', () => {
    const m = labelsIn('A total of N=186 subjects were randomized; NOAEL of 50 mg/kg/day.');
    expect(m.get('sample_size')).toBe('186');
    expect(m.get('noael')).toBe('50');
  });
});
