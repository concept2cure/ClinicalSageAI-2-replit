import { describe, it, expect } from 'vitest';
import { matchExpeditedPrograms } from '../expedited-programs';

const ids = (r: { eligible: { id: string }[] }) => r.eligible.map(e => e.id);

/**
 * QA-storm wave 6: the PMDA Sakigake predicate previously checked only 2 of its
 * 4 catalog criteria (substantialImprovementOverExisting + intendedForEarly...),
 * wrongly screening non-innovative / non-serious products as eligible.
 */
describe('matchExpeditedPrograms — PMDA Sakigake eligibility', () => {
  it('is NOT eligible when only the two old criteria are met', () => {
    const r = matchExpeditedPrograms({
      region: 'PMDA',
      substantialImprovementOverExisting: true,
      intendedForEarlyJapanDevelopment: true,
    });
    expect(ids(r)).not.toContain('pmda-sakigake');
  });

  it('is NOT eligible when the novel-mechanism criterion is missing', () => {
    const r = matchExpeditedPrograms({
      region: 'PMDA',
      seriousOrLifeThreatening: true,
      substantialImprovementOverExisting: true,
      intendedForEarlyJapanDevelopment: true,
    });
    expect(ids(r)).not.toContain('pmda-sakigake');
  });

  it('is eligible only when all four catalog criteria are met', () => {
    const r = matchExpeditedPrograms({
      region: 'PMDA',
      innovativeNovelMechanism: true,
      seriousOrLifeThreatening: true,
      substantialImprovementOverExisting: true,
      intendedForEarlyJapanDevelopment: true,
    });
    expect(ids(r)).toContain('pmda-sakigake');
  });
});
