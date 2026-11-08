/**
 * Unit tests for the M2.4 Nonclinical Overview adapter.
 *
 * Pure module — no DB. Confirms the ingest-enum → builder-category mapping and
 * that the overview is generated and enriched with the adversity profile.
 */

import { describe, it, expect } from 'vitest';

import { mapStudyTypeToM24, buildEnrichedM24, toBuilderStudy } from '../nonclinical-m24-adapter';

describe('mapStudyTypeToM24', () => {
  it('maps the ingest enum onto builder categories', () => {
    expect(mapStudyTypeToM24('single_dose_tox')).toBe('toxicology');
    expect(mapStudyTypeToM24('repeat_dose_tox')).toBe('toxicology');
    expect(mapStudyTypeToM24('local_tolerance')).toBe('toxicology');
    expect(mapStudyTypeToM24('genotox')).toBe('genotoxicity');
    expect(mapStudyTypeToM24('carc')).toBe('carcinogenicity');
    expect(mapStudyTypeToM24('dart')).toBe('reproductive_tox');
    expect(mapStudyTypeToM24('safety_pharm')).toBe('safety_pharmacology');
    expect(mapStudyTypeToM24('tk')).toBe('pharmacokinetics');
    expect(mapStudyTypeToM24('pk')).toBe('pharmacokinetics');
    expect(mapStudyTypeToM24('adme')).toBe('pharmacokinetics');
  });

  it('passes through builder values and retains unknowns as unclassified', () => {
    expect(mapStudyTypeToM24('pharmacology')).toBe('pharmacology');
    expect(mapStudyTypeToM24('reproductive_tox')).toBe('reproductive_tox');
    expect(mapStudyTypeToM24('something_new')).toBe('unclassified');
    expect(mapStudyTypeToM24('other')).toBe('unclassified');
    expect(mapStudyTypeToM24('')).toBe('unclassified');
  });

  it('recognizes the governed ADME/PK and immunotoxicity types', () => {
    expect(mapStudyTypeToM24('adme_pk')).toBe('pharmacokinetics');
    expect(mapStudyTypeToM24('immunotoxicity')).toBe('toxicology');
  });
});

describe('toBuilderStudy preserves recorded facts', () => {
  it.each(['repeat_dose_tox', 'single_dose_tox', 'local_tolerance', 'immunotoxicity', 'adme_pk', 'other', 'something_new'])('retains the original %s type separately from the composition category', (studyType) => {
    expect(toBuilderStudy({ studyId: 'REC-1', studyType }, 0)).toMatchObject({ studyId: 'REC-1', sourceStudyType: studyType });
  });

  it('does not invent a report placement or a report-reference finding', () => {
    const row = toBuilderStudy({ studyId: 'REC-1', studyType: 'repeat_dose_tox' }, 0);
    expect(row.reportSection).toBe('');
    expect(row.primaryFinding).toBe('');
    expect(row.glpStatus).toBeUndefined();
    expect(row.duration).toBeUndefined();
    expect(row.noael).toBeUndefined();
    expect(toBuilderStudy({ studyType: 'repeat_dose_tox', studyTitle: 'An unnumbered study title' }, 4).studyId).toBe('');
  });

  it('preserves explicitly supplied placement, finding, GLP flag and numeric values', () => {
    expect(toBuilderStudy({ studyId: 'REC-1', studyType: 'single_dose_tox', reportSection: '4.2.3.1', primaryFinding: 'Recorded finding', glpCompliant: false, durationWeeks: 0, noael: '0 mg/kg' }, 0)).toMatchObject({
      reportSection: '4.2.3.1', primaryFinding: 'Recorded finding', glpStatus: 'non-GLP', duration: '0 weeks', noael: '0 mg/kg',
    });
  });

  it('retains an explicit repeat-dose subtype when adapting an already-coarse study again', () => {
    const first = toBuilderStudy({ studyId: 'REPEAT-1', studyType: 'repeat_dose_tox' }, 0);
    const second = toBuilderStudy(first, 0);
    expect(second).toMatchObject({ studyType: 'toxicology', sourceStudyType: 'repeat_dose_tox' });
  });

  it('retains an unclassified original type through repeated adaptation', () => {
    const first = toBuilderStudy({ studyId: 'UNKNOWN-1', studyType: 'novel_study_kind' }, 0);
    expect(toBuilderStudy(first, 0)).toMatchObject({ studyType: 'unclassified', sourceStudyType: 'novel_study_kind' });
  });

  it('keeps a specific raw type ahead of conflicting subtype metadata', () => {
    const input = { studyId: 'SINGLE-1', studyType: 'single_dose_tox', sourceStudyType: 'repeat_dose_tox' };
    expect(toBuilderStudy(input, 0)).toMatchObject({ studyType: 'toxicology', sourceStudyType: 'single_dose_tox' });
  });

  it('does not retain metadata that conflicts with an already-coarse category', () => {
    const input = { studyId: 'COARSE-1', studyType: 'toxicology', sourceStudyType: 'adme_pk' };
    expect(toBuilderStudy(input, 0)).toMatchObject({ studyType: 'toxicology', sourceStudyType: 'toxicology' });
  });
});

describe('buildEnrichedM24', () => {
  const studies = [
    { studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '50 mg/kg/day', keyFindings: 'Hepatocellular hypertrophy at high dose.' },
    { studyType: 'safety_pharm', species: 'dog', keyFindings: 'No CV effects.' },
    { studyType: 'pk', species: 'rat' },
    { studyType: 'genotox', studyTitle: 'Ames test', keyFindings: 'Negative.' },
  ];

  it('produces the M2.4 overview from ingest-shaped studies', () => {
    const { summary } = buildEnrichedM24({ studies, drugSubstanceName: 'BX-115', indication: 'oncology' });
    expect(summary.sectionKey).toBe('2.4');
    expect(summary.narrative).toMatch(/NONCLINICAL OVERVIEW/);
    expect(summary.narrative).toMatch(/BX-115/);
    // Pharmacology is the only missing required category here.
    expect(summary.gaps).toContain('primary pharmacology studies');
    expect(summary.gaps).not.toContain('repeat-dose toxicology');
    // The tables the narrative refers to. Moved here from the AnA handler's
    // test (Rule 2 audit S2, 2026-10-26), which no longer composes from studies
    // supplied in the call.
    expect(Array.isArray(summary.tables)).toBe(true);
    expect(summary.tables.length).toBeGreaterThan(0);
  });

  it('adds the target-organ adversity profile when findings are supplied', () => {
    const { summary, toxProfile } = buildEnrichedM24({
      studies,
      findings: [
        { organ: 'liver', finding: 'hepatocellular hypertrophy' },
        { organ: 'kidney', finding: 'tubular necrosis' },
      ],
    });
    expect(toxProfile).not.toBeNull();
    expect(toxProfile!.adverseFindings.map(f => f.finding)).toContain('tubular necrosis');
    expect(toxProfile!.adaptiveFindings.map(f => f.finding)).toContain('hepatocellular hypertrophy');
    // Inside 2.4.4, unnumbered; never the invented "2.4.4.1" after the conclusions (D2 cleanup C4c).
    expect(summary.narrative).toMatch(/^Target-organ adversity profile: /m);
    expect(summary.narrative).not.toMatch(/2\.4\.4\.1/);
  });

  it('returns no tox profile when no findings are supplied', () => {
    const { toxProfile } = buildEnrichedM24({ studies });
    expect(toxProfile).toBeNull();
  });

  it.each(['single_dose_tox', 'local_tolerance', 'immunotoxicity', 'toxicology', 'other', 'something_new'])('does not claim repeat-dose coverage from %s', (studyType) => {
    const { summary } = buildEnrichedM24({ studies: [{ studyId: 'NON-REPEAT', studyType, keyFindings: 'Recorded non-repeat finding' }], drugSubstanceName: 'BX-115' });
    expect(summary.gaps).toContain('repeat-dose toxicology');
    expect(summary.narrative).not.toContain('Repeat-dose toxicology: 1 study/ies');
    expect(summary.tables.find(t => t.title === 'Repeat-Dose Toxicology Summary')).toBeUndefined();
    expect(summary.tables.flatMap(t => t.rows).some(row => row.includes('NON-REPEAT') && row.some(cell => cell.includes(studyType)))).toBe(true);
  });
});
