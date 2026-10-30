import { describe, expect, it } from 'vitest';
import { WRITING_AGENCIES, WRITING_REGIONS, writingAgencyOf } from '../writing-regions';
import { listCanonicalRegions, toAgency } from '../../regulatory/region-identity';

describe('authoring writing labels reuse the existing supported region identities', () => {
  it('uses every canonical agency as a writing preference without expanding template or content authority', () => {
    expect(new Set(WRITING_REGIONS)).toEqual(new Set(listCanonicalRegions()));
    expect(WRITING_AGENCIES).toEqual(['FDA', 'Health Canada', 'EMA', 'PMDA', 'MHRA', 'NMPA', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'MFDS', 'HSA']);
    for (const code of WRITING_REGIONS) expect(writingAgencyOf(code)).toBe(String(toAgency(code)).replace(/_/g, ' '));
  });

  it.each(['MHRA', 'NMPA', 'MFDS', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'HSA'])('retains the known regional writing preference %s', value => {
    expect(writingAgencyOf(value)).toBe(value);
  });

  it.each(['Health Canada', 'health_canada', 'HealthCanada', 'Health-Canada', ' CA ', 'ca'])('accepts existing Health Canada vocabulary %s', value => {
    expect(writingAgencyOf(value)).toBe('Health Canada');
  });

  it.each([['hc', 'Health Canada'], ['Canada', 'Health Canada'], ['Japan', 'PMDA'], ['EMEA', 'EMA']] as const)('retains the existing assembly writing alias %s', (value, expected) => {
    expect(writingAgencyOf(value)).toBe(expected);
    expect(writingAgencyOf(` ${value.toUpperCase()} `)).toBe(expected);
  });

  it.each([undefined, null, '', 'GLOBAL', 'ICH', 'invented', 7])('keeps unknown %s unresolved', value => {
    expect(writingAgencyOf(value)).toBeNull();
  });
});
