/**
 * Unit tests for the M2.4 Nonclinical Overview adapter.
 *
 * Pure module — no DB. Confirms the ingest-enum → builder-category mapping and
 * that the overview is generated and enriched with the adversity profile.
 */

import { describe, it, expect } from 'vitest';

import { mapStudyTypeToM24, buildEnrichedM24 } from '../nonclinical-m24-adapter';

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

  it('passes through builder values and defaults unknowns to toxicology', () => {
    expect(mapStudyTypeToM24('pharmacology')).toBe('pharmacology');
    expect(mapStudyTypeToM24('reproductive_tox')).toBe('reproductive_tox');
    expect(mapStudyTypeToM24('something_new')).toBe('toxicology');
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
  });

  it('appends the target-organ adversity profile when findings are supplied', () => {
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
    expect(summary.narrative).toMatch(/TARGET-ORGAN ADVERSITY PROFILE/);
  });

  it('returns no tox profile when no findings are supplied', () => {
    const { toxProfile } = buildEnrichedM24({ studies });
    expect(toxProfile).toBeNull();
  });
});
