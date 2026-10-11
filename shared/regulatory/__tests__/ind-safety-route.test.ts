import { describe, expect, it } from 'vitest';
import { getApplicationType } from '../global-document-registry';

const FDA_IND_SAFETY = 'https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-ind-safety-reports';

describe('FDA IND safety registry — subtype-dependent delivery', () => {
  it('cannot promise a universal eCTD Module 5 route for IND safety reports', () => {
    const entry = getApplicationType('US_IND_SR')!;
    expect(entry.dossierStandard).toBe('regional');
    expect(entry.submissionFormat).toMatch(/E2B\(R3\).*eCTD/);
    expect(entry.ctdModule).toBeUndefined();
    expect(entry.moduleAuthority).toContain(FDA_IND_SAFETY);
    expect(entry.moduleAuthority).toContain('2026-04-01');
    expect(entry.moduleAuthority).toContain('AEMS');
    expect(entry.moduleAuthority).toContain('(c)(1)(i)');
    expect(entry.moduleAuthority).toContain('(ii)');
    expect(entry.moduleAuthority).toContain('(iii)');
    expect(entry.moduleAuthority).toContain('(iv)');
    expect(entry.moduleAuthority).toMatch(/noncommercial.*exempt/i);
  });
  it('preserves the parent IND and distinguishes reporting clocks by trigger', () => {
    const entry = getApplicationType('US_IND_SR')!;
    expect(entry.parentApplicationType).toBe('US_IND');
    expect(entry.description).toMatch(/15.*determination/);
    expect(entry.description).toMatch(/7.*initial receipt/);
    expect(entry.description).toMatch(/fatal|life-threatening/);
  });
});
