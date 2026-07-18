import { describe, it, expect } from 'vitest';
import { assembleNonclinicalSummary, composeM26WrittenSummary, renderM26Html, type GovernedStudyRow } from '../m26-m4-view';

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

describe('composeM26WrittenSummary + renderM26Html (persistable M2.6 document)', () => {
  it('composes a real narrative from governed studies', () => {
    const result = composeM26WrittenSummary([
      study({ studyType: 'repeat_dose_tox', studyNumber: 'TX-701' }),
      study({ studyType: 'safety_pharmacology', studyNumber: 'SP-1' }),
    ]);
    expect(result.title).toMatch(/2\.6|nonclinical/i);
    expect(typeof result.narrative).toBe('string');
    expect(result.narrative.length).toBeGreaterThan(0);
    expect(typeof result.completeness).toBe('number');
  });

  it('renders faithful, escaped HTML over the composer output', () => {
    const result = composeM26WrittenSummary([
      study({ studyType: 'repeat_dose_tox', studyNumber: 'TX-701', keyFinding: 'Mild <b>hepatic</b> effect & recovery' }),
    ]);
    const html = renderM26Html(result);
    expect(html).toContain('<h2>');
    // Narrative rendered as paragraphs.
    expect(html).toMatch(/<p>/);
    // Interpolated study text is HTML-escaped — no raw injected markup survives.
    expect(html).not.toContain('<b>hepatic</b>');
    // Tables from the composer are rendered when present.
    if (result.tables.length > 0) expect(html).toContain('<table>');
  });

  it('surfaces the composer gaps in the rendered document', () => {
    // A PK-only set leaves tox/pharm gaps that the composer reports.
    const result = composeM26WrittenSummary([study({ studyType: 'adme_pk', studyNumber: 'PK-1' })]);
    const html = renderM26Html(result);
    if (result.gaps.length > 0) {
      expect(html).toContain('Outstanding data gaps');
      expect(html).toContain('<ul>');
    }
  });
});
