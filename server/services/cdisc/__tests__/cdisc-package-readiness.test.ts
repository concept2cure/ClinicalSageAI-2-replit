/**
 * CDISC dataset-package readiness — dispatches SDTM/ADaM datasets to the right
 * checker and rolls up one package verdict.
 */

import { describe, it, expect } from 'vitest';
import { assessPackageReadiness, type PackageDataset } from '../cdisc-package-readiness';

const dm: PackageDataset = {
  name: 'DM',
  standard: 'SDTM',
  domainOrClass: 'DM',
  variables: [
    { name: 'STUDYID', dataType: 'Char' }, { name: 'DOMAIN', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' },
    { name: 'SUBJID', dataType: 'Char' }, { name: 'RFSTDTC', dataType: 'Char' }, { name: 'RFENDTC', dataType: 'Char' },
    { name: 'SITEID', dataType: 'Char' }, { name: 'AGE', dataType: 'Num' }, { name: 'AGEU', dataType: 'Char', controlledTerms: ['YEARS'] },
    { name: 'SEX', dataType: 'Char', controlledTerms: ['M', 'F'] }, { name: 'RACE', dataType: 'Char' }, { name: 'ETHNIC', dataType: 'Char' },
    { name: 'ARM', dataType: 'Char' }, { name: 'ARMCD', dataType: 'Char' }, { name: 'COUNTRY', dataType: 'Char' },
  ],
};

const adsl: PackageDataset = {
  name: 'ADSL',
  standard: 'ADaM',
  domainOrClass: 'ADSL',
  variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'SAFFL', dataType: 'Char', controlledTerms: ['Y', 'N'] }],
};

describe('assessPackageReadiness', () => {
  it('rolls up a mixed SDTM + ADaM package', () => {
    const res = assessPackageReadiness({ studyName: 'C2C-001', datasets: [dm, adsl] });
    expect(res.summary.datasetCount).toBe(2);
    expect(res.datasets.map((d) => d.dataset)).toEqual(['DM', 'ADSL']);
    expect(res.datasets.every((d) => d.recognized)).toBe(true);
  });

  it('is not ready when a dataset has an SDTM conformance error', () => {
    const broken: PackageDataset = { ...dm, variables: dm.variables.filter((v) => v.name !== 'STUDYID') };
    const res = assessPackageReadiness({ datasets: [broken] });
    expect(res.ready).toBe(false);
    expect(res.summary.totalErrors).toBeGreaterThan(0);
    expect(res.datasets[0].findingCodes).toContain('MISSING_REQUIRED');
  });

  it('dispatches ADaM by class (ADSL/BDS/OCCDS)', () => {
    const bds: PackageDataset = { name: 'ADLB', standard: 'ADaM', domainOrClass: 'BDS', variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'PARAMCD', dataType: 'Char' }, { name: 'PARAM', dataType: 'Char' }, { name: 'AVAL', dataType: 'Num' }] };
    const occds: PackageDataset = { name: 'ADAE', standard: 'ADaM', domainOrClass: 'OCCDS', variables: [{ name: 'STUDYID', dataType: 'Char' }, { name: 'USUBJID', dataType: 'Char' }, { name: 'AEDECOD', dataType: 'Char' }, { name: 'TRTA', dataType: 'Char' }] };
    const res = assessPackageReadiness({ datasets: [bds, occds] });
    expect(res.datasets[0].domainOrClass).toBe('BDS');
    expect(res.datasets[1].domainOrClass).toBe('OCCDS');
    expect(res.datasets.every((d) => d.recognized)).toBe(true);
  });

  it('flags an unrecognized dataset (unknown domain/class) as not ready', () => {
    const res = assessPackageReadiness({ datasets: [{ name: 'XX', standard: 'SDTM', domainOrClass: 'ZZZ', variables: [] }] });
    expect(res.datasets[0].recognized).toBe(false);
    expect(res.datasets[0].findingCodes).toContain('UNRECOGNIZED_DATASET');
    expect(res.ready).toBe(false);
    expect(res.summary.unrecognized).toBe(1);
  });

  it('is not ready for an empty package', () => {
    expect(assessPackageReadiness({ datasets: [] }).ready).toBe(false);
  });

  it('is deterministic', () => {
    expect(assessPackageReadiness({ datasets: [dm, adsl] })).toEqual(assessPackageReadiness({ datasets: [dm, adsl] }));
  });
});
