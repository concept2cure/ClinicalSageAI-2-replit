import { describe, expect, it } from 'vitest';
import { csrWritingGuidance } from '../medical-writing-csr';
import { getE3Section } from '../../ind/ctd/csr-e3-guidance';

describe('record-dependent conduct and statistical timing', () => {
  it.each(['1', '5.1', '5.2', '5.3', '9.7'])('§%s requires records rather than supplying an unconditional assurance', number => {
    const writing = getE3Section(number)!.writing!.join(' ');
    expect(writing).toMatch(/source|record|documented/i);
    expect(writing).toMatch(/missing|unavailable|not.*establish|only.*support/i);
  });

  it('names late SAP finalization and consent waivers as facts to describe honestly', () => {
    expect(getE3Section('9.7')!.writing!.join(' ')).toMatch(/late|after unblinding/i);
    expect(getE3Section('5.3')!.writing!.join(' ')).toMatch(/waiv/i);
  });
});

describe('hypothesis-specific result sentences', () => {
  const patterns = csrWritingGuidance('11.4.1').sentencePatterns;
  it.each(['non-inferiority', 'equivalence', 'bayesian-decision'])('has a source-bound %s sentence', id => {
    const pattern = patterns.find(p => p.id === id);
    expect(pattern).toBeDefined();
    expect(pattern!.pattern).toContain('{');
    expect(pattern!.pattern).toMatch(/margin|posterior|credible/i);
  });

  it('restricts a non-significant superiority sentence to that design', () => {
    expect(patterns.find(p => p.id === 'non-significant')!.use).toMatch(/superiority/i);
    const rules = csrWritingGuidance(undefined).rules.map(r => r.rule).join(' ');
    expect(rules).toMatch(/non.inferiority.*equivalence.*Bayesian/i);
    expect(rules).toMatch(/pre.specified.*criterion|prespecified.*criterion/i);
  });
});
