import { describe, expect, it } from 'vitest';
import { buildSectionSpecificPrompt } from '../sections';

// Existing runtime export accepts this extra scope argument before the fix;
// RED demonstrates wrong output rather than a missing symbol/import.
const sectionGuide = buildSectionSpecificPrompt as (code: string, registryId?: string | null) => string | null;

describe('legacy CTD section playbooks require exact US IND document scope', () => {
  it.each([
    ['ICH_PROTOCOL', '3'], ['ICH_CSR', '4'], ['ICH_IB', '2'], ['ISO_CIP', '3'],
    ['US_510K', '3'], ['EU_MDR', '3'], ['CA_CTA', '1'], ['JP_CTN', '1'],
    ['EU_CTA', '3'], ['US_NDA', '2.7'], ['US_BLA', '3.2.S'],
    ['GLOBAL', '3'], ['unknown', '3'], ['us_ind', '3'], [' US_IND ', '3'],
    [null, '3'], [undefined, '3'],
  ])('does not reinterpret %s heading %s as a US IND section', (registryId, code) => {
    expect(sectionGuide(code!, registryId)).toBeNull();
  });

  it('fails closed for the one-argument legacy call without document scope', () => {
    expect(buildSectionSpecificPrompt('3')).toBeNull();
  });

  it.each(['1.1', '2.7', '3.2.S', '5.3.5.1'])('preserves the existing %s playbook for exact canonical US_IND', code => {
    expect(sectionGuide(code, 'US_IND')).toBeTruthy();
  });
});
