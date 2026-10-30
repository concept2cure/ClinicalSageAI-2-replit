/**
 * P-73 slice 1: a trial program outside the US and the EU resolves to its own region's trial application.
 *
 * Without a wizard choice on the program, only `cta + EMA` resolved, so a Health Canada, MHRA, PMDA, NMPA,
 * MFDS or Swissmedic trial program was drafted UNASSESSED (draft-submission-context.ts), although its
 * registry entry exists. An agency with more than one trial application (TGA's CTN and CTA, ANVISA's DDCM
 * and DEEC, CDSCO's forms) still resolves to nothing: the record cannot say which, so nothing is guessed.
 * docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md, slice 1.
 */
import { describe, expect, it } from 'vitest';
import { registryContextForProgram } from '../program-registry-context';

const resolve = (programType: string, primaryAgency: string) =>
  registryContextForProgram({ submissionTypeId: null, programType, primaryAgency })?.registryId ?? null;

describe('a trial program resolves to its region’s trial application', () => {
  it.each([
    ['cta', 'HEALTH_CANADA', 'CA_CTA'],
    ['cta', 'Health Canada', 'CA_CTA'],
    ['cta', 'MHRA', 'UK_CTA'],
    ['cta', 'PMDA', 'JP_CTN'],
    ['ind', 'NMPA', 'CN_CTA'],
    ['cta', 'NMPA', 'CN_CTA'],
    ['ind', 'MFDS', 'KR_IND'],
    ['cta', 'SWISSMEDIC', 'CH_CTA'],
  ])('%s filed with %s is %s', (type, agency, registryId) => {
    expect(resolve(type, agency)).toBe(registryId);
  });

  it('what already resolved is unchanged', () => {
    expect(resolve('ind', 'FDA')).toBe('US_IND');
    expect(resolve('cta', 'EMA')).toBe('EU_CTA');
    expect(resolve('jnda', 'PMDA')).toBe('JP_MKT_APPROVAL');
  });

  it('an agency with more than one trial application resolves to nothing, rather than a guess', () => {
    for (const agency of ['TGA', 'ANVISA', 'CDSCO']) {
      expect(resolve('cta', agency), agency).toBeNull();
      expect(resolve('ind', agency), agency).toBeNull();
    }
  });

  it('a marketing filing is not read as a trial application', () => {
    expect(resolve('maa', 'MHRA')).toBeNull();
    expect(resolve('nda', 'MFDS')).toBeNull();
  });

  it('a wizard choice still wins over the record', () => {
    expect(registryContextForProgram({ submissionTypeId: 'eu_cta', programType: 'cta', primaryAgency: 'MHRA' }))
      .toMatchObject({ submissionType: 'eu_cta' });
  });
});
