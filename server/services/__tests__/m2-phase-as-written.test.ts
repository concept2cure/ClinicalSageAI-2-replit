/**
 * The Module 2 summaries read a study's phase as it is written (2026-10-29).
 *
 * buildM25ClinicalOverview and buildM27ClinicalSummary tested c.phase with
 * startsWith('3') and /^[2-3]/, which holds only for a bare digit. A study
 * recorded as "Phase 3" or "III" was never pivotal, "Phase 1" was never
 * clinical pharmacology, and the text printed "Phase Phase 3". The phase is
 * now read by shared/clinical-phase.ts, the parser the CMC program stage
 * already used. "2/3" reads Phase 2 first.
 *
 * 2026-10-29: the phase no longer decides "pivotal". That is the sponsor's
 * declaration (m2-pivotal-declared.test.ts); the phase decides what it still
 * should: clinical pharmacology, the Phase 2–3 count and the labels.
 */
import { describe, expect, it } from 'vitest';
import { buildM25ClinicalOverview, buildM27ClinicalSummary, type CSRSummaryInput } from '../m2-summary-builders';
import { phaseLabel, phaseNumber, phaseNumbers } from '../../../shared/clinical-phase';

const study = (phase: string, protocolNumber: string, pivotal?: boolean): CSRSummaryInput => ({
  studyId: protocolNumber, protocolNumber, phase, ...(pivotal === undefined ? {} : { pivotal }),
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'global cure at week 8', primaryResult: 'recorded in §11.4',
  primaryEndpointMet: true, sampleSize: 120, saeCount: 2, deathCount: 0,
});
const overview = (csrs: CSRSummaryInput[]) =>
  buildM25ClinicalOverview({ csrs, indication: 'recurrent C. difficile infection', investigationalProduct: 'Drug X' });

describe('shared/clinical-phase', () => {
  it('names each phase in the order written', () => {
    expect(phaseNumbers('Phase 2/3')).toEqual([2, 3]);
    expect(phaseNumbers('IIIb')).toEqual([3]);
    expect(phaseNumbers('phase_1')).toEqual([1]);
    expect(phaseNumbers('Phase 4')).toEqual([]);
    expect(phaseNumber('Phase 2/3')).toBe(3);
    expect(phaseLabel('3')).toBe('Phase 3');
    expect(phaseLabel(' Phase 2/3 ')).toBe('Phase 2/3');
  });
});

describe('Module 2 reads the phase as written', () => {
  it.each(['3', 'Phase 3', 'III', 'Phase IIIb', 'Phase 2/3'])('a study recorded as %j is a Phase 2–3 study', (phase) => {
    const r = buildM27ClinicalSummary({ csrs: [study('1', 'X-101'), study(phase, 'X-301')],
      indication: 'recurrent C. difficile infection', investigationalProduct: 'Drug X' });
    expect(r.narrative).toMatch(/1 Phase 2–3 study\/ies are recorded/);
  });

  it('the phase never makes a study pivotal: an undeclared Phase 3 study is named as undeclared', () => {
    const r = overview([study('1', 'X-101'), study('Phase 3', 'X-301')]);
    expect(r.gaps).toContain('pivotal efficacy evidence (no study is declared pivotal)');
    expect(r.gaps).toContain('pivotal status not declared for X-101, X-301');
  });

  it('a study recorded as "Phase 1" is clinical pharmacology, and no label reads "Phase Phase"', () => {
    const r = buildM27ClinicalSummary({ csrs: [study('Phase 1', 'X-101', false), study('Phase 3', 'X-301', true)],
      indication: 'recurrent C. difficile infection', investigationalProduct: 'Drug X' });
    expect(r.gaps).not.toContain('no Phase 1 (clinical pharmacology) studies');
    expect(r.gaps).not.toContain('no pivotal efficacy study declared');
    expect(r.narrative).not.toMatch(/Phase Phase/);
    expect(r.narrative).toMatch(/X-301 \(Phase 3\)/);
  });
});
