import { describe, it, expect } from 'vitest';
import {
  ESTAR_VERSIONS,
  ESTAR_RETIREMENT_DATE,
  versionsForFamily,
  currentVersionFor,
  retiringVersionFor,
  getVersionRecord,
  familiesForSubmissionType,
  listFamilies,
  versionLifecycleAsOf,
  isRecommendedVersion,
} from '../estar-versions';

describe('eSTAR version registry', () => {
  it('encodes exactly one current and one retiring version per family', () => {
    for (const family of listFamilies()) {
      const versions = versionsForFamily(family);
      expect(versions.filter((v) => v.status === 'current')).toHaveLength(1);
      expect(versions.filter((v) => v.status === 'retiring')).toHaveLength(1);
    }
  });

  it('pins the current versions to the FDA table (nIVD/IVD 7.0, PreSTAR 3.0)', () => {
    expect(currentVersionFor('nivd')?.version).toBe('7.0');
    expect(currentVersionFor('ivd')?.version).toBe('7.0');
    expect(currentVersionFor('prestar')?.version).toBe('3.0');
    expect(retiringVersionFor('nivd')?.version).toBe('6.2');
    expect(retiringVersionFor('ivd')?.version).toBe('6.2');
    expect(retiringVersionFor('prestar')?.version).toBe('2.2');
  });

  it('carries the correct OMB numbers per family', () => {
    expect(currentVersionFor('nivd')?.ombNumbers).toEqual(['0910-0120', '0910-0844', '0910-0231']);
    expect(currentVersionFor('prestar')?.ombNumbers).toEqual(['0910-0756', '0910-0078', '0910-0511']);
  });

  it('maps the supported submission types per family', () => {
    expect(currentVersionFor('nivd')?.supportedSubmissionTypes).toEqual(['510k', 'de_novo', 'pma']);
    expect(currentVersionFor('prestar')?.supportedSubmissionTypes).toEqual(['q_sub', 'ide', '513g']);
  });

  it('gives every retiring version the shared retirement date; current versions never retire', () => {
    for (const v of ESTAR_VERSIONS) {
      if (v.status === 'retiring') expect(v.retirementDate).toBe(ESTAR_RETIREMENT_DATE);
      else expect(v.retirementDate).toBeNull();
    }
  });

  it('resolves the families able to carry a submission type', () => {
    expect(familiesForSubmissionType('510k').sort()).toEqual(['ivd', 'nivd']);
    expect(familiesForSubmissionType('pma').sort()).toEqual(['ivd', 'nivd']);
    expect(familiesForSubmissionType('q_sub')).toEqual(['prestar']);
    expect(familiesForSubmissionType('ide')).toEqual(['prestar']);
    expect(familiesForSubmissionType('513g')).toEqual(['prestar']);
  });

  it('classifies version lifecycle relative to an as-of date', () => {
    const retiring = retiringVersionFor('nivd')!;
    const current = currentVersionFor('nivd')!;
    // Current never retires.
    expect(versionLifecycleAsOf(current, '2030-01-01')).toBe('current');
    // Before the retirement date: retiring-soon.
    expect(versionLifecycleAsOf(retiring, '2026-08-02')).toBe('retiring-soon');
    // On/after the retirement date: retired.
    expect(versionLifecycleAsOf(retiring, ESTAR_RETIREMENT_DATE)).toBe('retired');
    expect(versionLifecycleAsOf(retiring, '2026-09-01')).toBe('retired');
  });

  it('recommends only the current version', () => {
    expect(isRecommendedVersion(currentVersionFor('nivd')!)).toBe(true);
    expect(isRecommendedVersion(retiringVersionFor('nivd')!)).toBe(false);
  });

  it('looks up a specific record by family + version', () => {
    expect(getVersionRecord('prestar', '3.0')?.status).toBe('current');
    expect(getVersionRecord('prestar', '9.9')).toBeUndefined();
  });
});
