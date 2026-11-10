/**
 * Unit tests for the M2.6 Nonclinical Written and Tabulated Summaries composer.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { buildM26NonclinicalSummaries } from '../m26-nonclinical-summaries';
import { toBuilderStudy } from '../nonclinical-m24-adapter';

const studies = [
    { studyType: 'pharmacology', studyId: 'PD-1', species: 'rat', keyFindings: 'Target engagement confirmed.' },
    { studyType: 'safety_pharm', studyId: 'SP-1', species: 'dog', keyFindings: 'No CV signal.' },
    { studyType: 'pk', studyId: 'PK-1', species: 'rat' },
    { studyType: 'repeat_dose_tox', studyId: 'TX-1', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '50 mg/kg/day' },
    { studyType: 'genotox', studyId: 'GT-1', keyFindings: 'Negative.' },
];

describe('buildM26NonclinicalSummaries', () => {
  it('composes all 2.6.x subsections and per-discipline tables', () => {
    const r = buildM26NonclinicalSummaries({ studies, drugSubstanceName: 'BX-115' });
    expect(r.sectionKey).toBe('2.6');
    expect(r.narrative).toMatch(/2\.6\.1 INTRODUCTION/);
    expect(r.narrative).toMatch(/2\.6\.6 TOXICOLOGY WRITTEN SUMMARY/);
    expect(r.narrative).toMatch(/BX-115/);
    const titles = r.tables.map(t => t.title);
    expect(titles).toContain('2.6.3 Pharmacology Tabulated Summary');
    expect(titles).toContain('2.6.5 Pharmacokinetics Tabulated Summary');
    expect(titles).toContain('2.6.7 Toxicology Tabulated Summary');
    // Category coverage does not mean that every study field/report is recorded.
    expect(r.gaps).not.toContain('primary pharmacology');
    expect(r.gaps).not.toContain('safety pharmacology (ICH S7A)');
    expect(r.gaps).not.toContain('pharmacokinetics / ADME');
    expect(r.gaps).not.toContain('repeat-dose toxicology');
    expect(r.gaps).not.toContain('genotoxicity battery (ICH S2(R1))');
    expect(r.completeness).toBe(100);
  });

  it('weaves the target-organ adversity profile into 2.6.6 when findings are supplied', () => {
    const r = buildM26NonclinicalSummaries({
      studies,
      findings: [
        { organ: 'liver', finding: 'hepatocellular hypertrophy' },
        { organ: 'kidney', finding: 'tubular necrosis' },
      ],
    });
    expect(r.toxProfile).not.toBeNull();
    expect(r.narrative).toMatch(/Target-organ adversity profile/);
    expect(r.toxProfile!.adverseFindings.map(f => f.finding)).toContain('tubular necrosis');
  });

  it('flags every gap and scores completeness 0 for an empty program', () => {
    const r = buildM26NonclinicalSummaries({ studies: [] });
    expect(r.completeness).toBe(0);
    expect(r.gaps.length).toBeGreaterThanOrEqual(5);
    expect(r.tables).toHaveLength(0);
    expect(r.narrative).not.toMatch(/\[Not applicable\]/i);
  });

});

describe('M26 recorded scope and missing data', () => {
  it.each(['single_dose_tox', 'local_tolerance', 'immunotoxicity', 'toxicology', 'other', 'something_new'])('keeps the repeat-dose gap open for %s', (studyType) => {
    const r = buildM26NonclinicalSummaries({ studies: [{ studyId: 'NON-REPEAT', studyType, keyFindings: 'Recorded non-repeat finding' }], drugSubstanceName: 'BX-115' });
    expect(r.gaps).toContain('repeat-dose toxicology');
    expect(r.completeness).toBe(0);
  });

  it('composes governed adme_pk in the PK section without toxicology placement', () => {
    const r = buildM26NonclinicalSummaries({ studies: [{ studyId: 'ADME-1', studyType: 'adme_pk', keyFindings: 'Recorded elimination finding', reportSection: '4.2.2' }], drugSubstanceName: 'BX-115' });
    expect(r.gaps).not.toContain('pharmacokinetics / ADME');
    expect(r.gaps).toContain('repeat-dose toxicology');
    expect(r.tables.find(t => t.title === '2.6.5 Pharmacokinetics Tabulated Summary')?.rows[0]).toContain('ADME-1');
    expect(r.tables.find(t => t.title === '2.6.7 Toxicology Tabulated Summary')).toBeUndefined();
  });

  it.each(['other', 'something_new'])('retains %s records visibly without assigning a toxicology category', (studyType) => {
    const r = buildM26NonclinicalSummaries({ studies: [{ studyId: 'UNCLASSIFIED-1', studyType, keyFindings: 'Original finding' }], drugSubstanceName: 'BX-115' });
    expect(r.tables.find(t => t.title === '2.6.7 Toxicology Tabulated Summary')).toBeUndefined();
    expect(r.tables.flatMap(t => t.rows).some(row => row.includes('UNCLASSIFIED-1') && row.some(cell => cell.includes(studyType)) && row.includes('Original finding'))).toBe(true);
    expect(r.gaps.some(gap => /UNCLASSIFIED-1/.test(gap) && /unclassified|study type/i.test(gap))).toBe(true);
  });

  it('leaves missing fields missing and lists them without claiming a report exists', () => {
    const r = buildM26NonclinicalSummaries({ studies: [{ studyId: 'TX-MISSING', studyType: 'repeat_dose_tox' }], drugSubstanceName: 'BX-115' });
    const row = r.tables.find(t => t.title === '2.6.7 Toxicology Tabulated Summary')?.rows[0];
    expect(row?.slice(2, 6)).toEqual(['—', '—', '—', '—']);
    expect(JSON.stringify(r)).not.toMatch(/See Module 4 study report|full reports are in Module 4/);
    for (const field of ['species', 'duration', 'GLP', 'NOAEL', 'finding', 'placement']) {
      expect(r.gaps.some(gap => gap.includes('TX-MISSING') && gap.toLowerCase().includes(field.toLowerCase()))).toBe(true);
    }
  });

  it('preserves explicit report placement and does not supply a broad fallback', () => {
    const r = buildM26NonclinicalSummaries({ studies: [
      { studyId: 'PD-RECORDED', studyType: 'pharmacology', reportSection: '4.2.1.1', keyFindings: 'Recorded finding' },
      { studyId: 'PD-MISSING', studyType: 'pharmacology', keyFindings: 'Other finding' },
    ], drugSubstanceName: 'BX-115' });
    const rows = r.tables.find(t => t.title === '2.6.3 Pharmacology Tabulated Summary')!.rows;
    expect(rows[0]).toContain('4.2.1.1');
    expect(rows[1]).not.toContain('4.2');
    expect(r.gaps.some(gap => gap.includes('PD-MISSING') && /placement/i.test(gap))).toBe(true);
  });

  it('qualifies the tables as preparation worksheets and requires report verification', () => {
    const r = buildM26NonclinicalSummaries({ studies, drugSubstanceName: 'BX-115' });
    expect(r.narrative).toMatch(/preparation worksheet/i);
    expect(r.narrative).toMatch(/report.*verif|verif.*report/i);
    expect(r.narrative).not.toMatch(/full reports are in Module 4|No gaps identified against/i);
  });

  it('describes the observed toxicology types without claiming absent disciplines', () => {
    const r = buildM26NonclinicalSummaries({ studies: [{ studyId: 'LOCAL-1', studyType: 'local_tolerance', keyFindings: 'Recorded local finding' }], drugSubstanceName: 'BX-115' });
    const written = r.narrative.split('2.6.6 TOXICOLOGY WRITTEN SUMMARY')[1].split('2.6.7 TOXICOLOGY TABULATED SUMMARY')[0];
    expect(written).toContain('local_tolerance');
    expect(written).not.toMatch(/Single- and repeat-dose toxicity|reproductive\/carcinogenicity studies/);
    expect(r.narrative).toMatch(/phase and duration/);
    expect(r.narrative).toMatch(/sponsor.*judgment/i);
  });

  it('keeps explicit repeat-dose coverage when fed already-adapted records', () => {
    const adapted = toBuilderStudy({ studyId: 'REPEAT-ROUNDTRIP', studyType: 'repeat_dose_tox', noael: '7 mg/kg' }, 0);
    const r = buildM26NonclinicalSummaries({ studies: [adapted], drugSubstanceName: 'BX-115' });
    expect(r.gaps).not.toContain('repeat-dose toxicology');
    expect(r.completeness).toBe(20);
    expect(r.tables.find(t => t.title === '2.6.7 Toxicology Tabulated Summary')?.rows[0]).toContain('repeat_dose_tox');
  });

  it('keeps unclassified source identity when fed already-adapted records', () => {
    const adapted = toBuilderStudy({ studyId: 'UNKNOWN-ROUNDTRIP', studyType: 'novel_study_kind' }, 0);
    const r = buildM26NonclinicalSummaries({ studies: [adapted], drugSubstanceName: 'BX-115' });
    expect(r.tables.find(t => t.title === 'Unclassified Study Preparation Worksheet')?.rows[0]).toContain('novel_study_kind');
    expect(r.gaps).toContain('repeat-dose toxicology');
  });

  it('does not turn raw single-dose or incompatible coarse metadata into repeat-dose coverage', () => {
    const raw = { studyId: 'RAW-SINGLE', studyType: 'single_dose_tox', sourceStudyType: 'repeat_dose_tox' };
    const coarse = { studyId: 'COARSE-TOX', studyType: 'toxicology', sourceStudyType: 'adme_pk' };
    const r = buildM26NonclinicalSummaries({ studies: [raw, coarse], drugSubstanceName: 'BX-115' });
    expect(r.gaps).toContain('repeat-dose toxicology');
    expect(r.gaps).toContain('pharmacokinetics / ADME');
    const rows = r.tables.find(t => t.title === '2.6.7 Toxicology Tabulated Summary')!.rows;
    expect(rows[0]).toContain('single_dose_tox');
    expect(rows[1]).toContain('toxicology');
  });
});
