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
  it('encodes exactly one current version per family, listed last', () => {
    for (const family of listFamilies()) {
      const versions = versionsForFamily(family);
      expect(versions.filter((v) => v.status === 'current')).toHaveLength(1);
      expect(versions[versions.length - 1].status).toBe('current');
      // 6.2/2.2 (retirement date passed) and 7.0/3.0 (superseded, date unread).
      expect(versions.filter((v) => v.status === 'retiring')).toHaveLength(2);
    }
  });

  it('pins the current versions to FDA\'s eSTAR Program page (nIVD/IVD 7.1, PreSTAR 3.1)', () => {
    expect(currentVersionFor('nivd')?.version).toBe('7.1');
    expect(currentVersionFor('ivd')?.version).toBe('7.1');
    expect(currentVersionFor('prestar')?.version).toBe('3.1');
    // The most recent superseded version is the retiring one a sponsor holds.
    expect(retiringVersionFor('nivd')?.version).toBe('7.0');
    expect(retiringVersionFor('ivd')?.version).toBe('7.0');
    expect(retiringVersionFor('prestar')?.version).toBe('3.0');
  });

  it('carries the correct OMB numbers per family', () => {
    expect(currentVersionFor('nivd')?.ombNumbers).toEqual(['0910-0120', '0910-0844', '0910-0231']);
    expect(currentVersionFor('prestar')?.ombNumbers).toEqual(['0910-0756', '0910-0078', '0910-0511']);
  });

  it('maps the supported submission types per family', () => {
    expect(currentVersionFor('nivd')?.supportedSubmissionTypes).toEqual(['510k', 'de_novo', 'pma']);
    expect(currentVersionFor('prestar')?.supportedSubmissionTypes).toEqual(['q_sub', 'ide', '513g']);
  });

  it('dates only the retirements that were recorded; superseded 7.0/3.0 carry no invented date', () => {
    for (const v of ESTAR_VERSIONS) {
      if (v.status === 'current') expect(v.retirementDate).toBeNull();
      else if (['6.2', '2.2'].includes(v.version)) expect(v.retirementDate).toBe(ESTAR_RETIREMENT_DATE);
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
    const retiring = getVersionRecord('nivd', '6.2')!;
    const current = currentVersionFor('nivd')!;
    // Current never retires.
    expect(versionLifecycleAsOf(current, '2030-01-01')).toBe('current');
    // Before the retirement date: retiring-soon.
    expect(versionLifecycleAsOf(retiring, '2026-08-02')).toBe('retiring-soon');
    // On/after the retirement date: retired.
    expect(versionLifecycleAsOf(retiring, ESTAR_RETIREMENT_DATE)).toBe('retired');
    expect(versionLifecycleAsOf(retiring, '2026-09-01')).toBe('retired');
    // Superseded with no read retirement date: neither current nor guessed retired.
    expect(versionLifecycleAsOf(retiringVersionFor('nivd')!, '2026-10-05')).toBe('retiring-date-unverified');
  });

  it('recommends only the current version', () => {
    expect(isRecommendedVersion(currentVersionFor('nivd')!)).toBe(true);
    expect(isRecommendedVersion(retiringVersionFor('nivd')!)).toBe(false);
  });

  it('looks up a specific record by family + version', () => {
    expect(getVersionRecord('prestar', '3.1')?.status).toBe('current');
    expect(getVersionRecord('prestar', '3.0')?.status).toBe('retiring');
    expect(getVersionRecord('prestar', '9.9')).toBeUndefined();
  });
});
