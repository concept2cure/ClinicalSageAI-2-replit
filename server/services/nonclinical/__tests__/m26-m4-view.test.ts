import { describe, it, expect } from 'vitest';
import { assembleNonclinicalSummary, type GovernedStudyRow } from '../m26-m4-view';

function study(over: Partial<GovernedStudyRow> & Pick<GovernedStudyRow, 'studyType'>): GovernedStudyRow {
  return {
    studyNumber: over.studyNumber ?? 'S-1',
    studyType: over.studyType,
    species: over.species ?? 'Rat',
    glpCompliant: over.glpCompliant ?? true,
    noael: over.noael ?? '100 mg/kg/day',
    durationLabel: over.durationLabel ?? '26-week',
    keyFinding: over.keyFinding ?? 'No adverse findings',
    status: over.status ?? 'in_reporting',
    send: over.send ?? null,
  };
}

const PASSING_SEND = {
  // repeat_dose_tox required domains: TS DM EX BW CL LB OM MA MI FW
  domainsPresent: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
  defineXmlPresent: true,
  nsdrcPresent: true,
  validationStatus: 'passed' as const,
  validatorErrorCount: 0,
};

describe('assembleNonclinicalSummary — M2.6 subsection readiness', () => {
  it('marks every data-bearing subsection missing for an empty study set (honest skeleton)', () => {
    const v = assembleNonclinicalSummary([]);
    expect(v.provisioned).toBe(false);
    // 2.6.1 introduction is always renderable boilerplate; 2.6.2–2.6.7 missing.
    expect(v.m26.find((s) => s.n === '2.6.1')?.st).toBe('complete');
    for (const n of ['2.6.2', '2.6.3', '2.6.4', '2.6.5', '2.6.6', '2.6.7']) {
      expect(v.m26.find((s) => s.n === n)?.st).toBe('missing');
    }
    expect(v.completeness).toBe(0);
    expect(v.gaps.length).toBeGreaterThan(0);
  });

  it('renders pharmacology + PK + tox subsections when those buckets are present', () => {
    const v = assembleNonclinicalSummary([
      study({ studyNumber: 'SP-1', studyType: 'safety_pharmacology' }),
      study({ studyNumber: 'PK-1', studyType: 'adme_pk' }),
      study({ studyNumber: 'TX-1', studyType: 'repeat_dose_tox' }),
    ]);
    expect(v.provisioned).toBe(true);
    for (const n of ['2.6.2', '2.6.3', '2.6.4', '2.6.5', '2.6.6', '2.6.7']) {
      expect(v.m26.find((s) => s.n === n)?.st).toBe('complete');
    }
  });

  it('keeps toxicology subsections missing (with a note) when only PK is present', () => {
    const v = assembleNonclinicalSummary([study({ studyType: 'adme_pk' })]);
    expect(v.m26.find((s) => s.n === '2.6.4')?.st).toBe('complete');
    const tox = v.m26.find((s) => s.n === '2.6.6');
    expect(tox?.st).toBe('missing');
    expect(tox?.note).toMatch(/toxicology/i);
  });
});

describe('assembleNonclinicalSummary — Module 4 placement readiness', () => {
  it('computes finalized / total per 4.2.x group', () => {
    const v = assembleNonclinicalSummary([
      study({ studyNumber: 'TX-1', studyType: 'repeat_dose_tox', status: 'finalized' }),
      study({ studyNumber: 'TX-2', studyType: 'carcinogenicity', status: 'in_reporting' }),
      study({ studyNumber: 'PK-1', studyType: 'adme_pk', status: 'finalized' }),
    ]);
    const tox = v.m4.find((m) => m.code === '4.2.3');
    expect(tox?.pct).toBe(50); // 1 of 2 finalized
    const pk = v.m4.find((m) => m.code === '4.2.2');
    expect(pk?.pct).toBe(100); // 1 of 1 finalized
    const pharm = v.m4.find((m) => m.code === '4.2.1');
    expect(pharm?.pct).toBe(0); // no studies placed
    expect(pharm?.note).toMatch(/no studies/i);
  });

  it('places safety pharmacology under 4.2.1', () => {
    const v = assembleNonclinicalSummary([
      study({ studyType: 'safety_pharmacology', status: 'finalized' }),
    ]);
    expect(v.m4.find((m) => m.code === '4.2.1')?.pct).toBe(100);
  });
});

describe('assembleNonclinicalSummary — SEND rollup', () => {
  it('rolls up in-scope studies: worst risk, validated count, union of missing domains', () => {
    const v = assembleNonclinicalSummary([
      study({ studyNumber: 'TX-1', studyType: 'repeat_dose_tox', send: PASSING_SEND }),
      // in-scope, missing domains + not validated → medium/high risk
      study({
        studyNumber: 'CARC-1',
        studyType: 'carcinogenicity',
        send: {
          domainsPresent: ['TS', 'DM'],
          defineXmlPresent: true,
          nsdrcPresent: false,
          validationStatus: 'not_validated',
          validatorErrorCount: 0,
        },
      }),
      // out of scope (genotoxicity) → excluded from the rollup
      study({ studyNumber: 'GT-1', studyType: 'genotoxicity' }),
    ]);
    expect(v.send.inScope).toBe(2); // repeat_dose_tox + carcinogenicity, not genotox
    expect(v.send.validated).toBe(1); // only the passing repeat-dose study
    expect(v.send.missingDomains).toContain('EX'); // carcinogenicity is missing several
    expect(['medium', 'high']).toContain(v.send.risk);
  });

  it('reports risk "none" when no study is in SEND scope', () => {
    const v = assembleNonclinicalSummary([study({ studyType: 'genotoxicity' })]);
    expect(v.send.inScope).toBe(0);
    expect(v.send.risk).toBe('none');
    expect(v.send.validated).toBe(0);
  });

  it('treats a study with no SEND dataset as not-validated (fail safe)', () => {
    const v = assembleNonclinicalSummary([
      study({ studyType: 'repeat_dose_tox', send: null }),
    ]);
    expect(v.send.inScope).toBe(1);
    expect(v.send.validated).toBe(0);
    expect(v.send.risk).not.toBe('low');
  });
});
