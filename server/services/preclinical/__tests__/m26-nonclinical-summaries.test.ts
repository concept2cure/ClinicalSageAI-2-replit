/**
 * Unit tests for the M2.6 Nonclinical Written and Tabulated Summaries composer.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { buildM26NonclinicalSummaries } from '../m26-nonclinical-summaries';

describe('buildM26NonclinicalSummaries', () => {
  const studies = [
    { studyType: 'pharmacology', studyId: 'PD-1', species: 'rat', keyFindings: 'Target engagement confirmed.' },
    { studyType: 'safety_pharm', studyId: 'SP-1', species: 'dog', keyFindings: 'No CV signal.' },
    { studyType: 'pk', studyId: 'PK-1', species: 'rat' },
    { studyType: 'repeat_dose_tox', studyId: 'TX-1', species: 'rat', durationWeeks: 13, glpCompliant: true, noael: '50 mg/kg/day' },
    { studyType: 'genotox', studyId: 'GT-1', keyFindings: 'Negative.' },
  ];

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
    // All five core categories present → no gaps, completeness 100.
    expect(r.gaps).toHaveLength(0);
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
  });
});
