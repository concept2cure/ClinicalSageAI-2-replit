/**
 * The 2.4 / 2.5 / 2.7 summaries print a regulatory conclusion only from a
 * recorded field that supports it, apply the incidence filter they state, and
 * take completeness over subsections that have recorded inputs.
 *
 * What they used to do (until 2026-10-15), whatever the records said:
 *  - 2.4.1 "The nonclinical program was designed in accordance with ICH M3(R2)
 *    and supports the proposed clinical use", even beside its own gap list;
 *    2.4.5 "...supports the proposed clinical investigational plan. No
 *    nonclinical issues preclude clinical development" once one study of each
 *    category existed, whatever the studies found.
 *  - 2.5.2 "...support the proposed dosage form and raise no issue affecting the
 *    benefit-risk assessment" with no biopharmaceutic input at all, counted as
 *    "always summarized" in completeness.
 *  - 2.5.3 any Phase 1 CSR "characterizes pharmacokinetics, pharmacodynamics,
 *    and exposure-response, supporting the dose rationale".
 *  - 2.5.4 "Efficacy was demonstrated in N pivotal study/ies" whenever a Phase 3
 *    CSR existed, whatever its primary result.
 *  - 2.7.1 "Key findings have been integrated into the proposed dosage form
 *    rationale"; 2.7.4.2 "Most common adverse events (≥5% incidence) across the
 *    integrated safety database" with no 5% filter, decided on csrs[0] alone;
 *    2.7 completeness counted `csrs.length > 0` twice.
 */
import { describe, expect, it } from 'vitest';

import {
  buildM24NonclinicalOverview,
  buildM25ClinicalOverview,
  buildM27ClinicalSummary,
  type CSRSummaryInput,
  type NonclinicalStudy,
} from '../m2-summary-builders';

const phase1: CSRSummaryInput = {
  studyId: 'S1',
  protocolNumber: 'X-101',
  phase: '1',
  studyDesign: 'single ascending dose',
  primaryEndpoint: 'safety and PK',
  primaryResult: 'well tolerated',
  sampleSize: 40,
  saeCount: 0,
  deathCount: 0,
};
const phase3: CSRSummaryInput = {
  studyId: 'S3',
  protocolNumber: 'X-301',
  phase: '3',
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'ORR',
  primaryResult: 'Primary endpoint not met (p=0.41)',
  sampleSize: 300,
  saeCount: 4,
  deathCount: 1,
};
/** The common-adverse-event table, never the SAE/deaths table that sits beside it. */
const aeTable = (r: { tables: Array<{ title: string; rows: string[][] }> }) =>
  r.tables.find((t) => /Adverse Event/.test(t.title) && !t.title.startsWith('Serious'));
const study = (studyType: NonclinicalStudy['studyType'], studyId: string, primaryFinding: string): NonclinicalStudy => ({
  studyId,
  studyType,
  primaryFinding,
  reportSection: '4.2.1.1',
});

describe('2.4 draws no ICH M3(R2) or safety conclusion the records do not hold', () => {
  it('does not claim the program was designed per ICH M3(R2) and supports clinical use', () => {
    const r = buildM24NonclinicalOverview({ nonclinicalStudies: [study('toxicology', 'TX-1', 'Hepatotoxicity at all doses')] });
    expect(r.narrative).not.toMatch(/designed in accordance with ICH M3\(R2\)/);
    expect(r.narrative).not.toMatch(/supports the proposed clinical use/);
    expect(r.narrative).toMatch(/Gaps in the program: primary pharmacology studies;/);
  });

  it('leaves the safety conclusion open when every category is present, whatever the studies found', () => {
    const all = [
      study('pharmacology', 'PH-1', 'Target engagement in vitro'),
      study('safety_pharmacology', 'SP-1', 'hERG IC50 3 µM'),
      study('pharmacokinetics', 'PK-1', 'Oral bioavailability 20%'),
      study('toxicology', 'TX-1', 'Mortality at all dose levels; NOAEL not established'),
      study('genotoxicity', 'GT-1', 'Ames positive'),
    ];
    const r = buildM24NonclinicalOverview({ nonclinicalStudies: all, drugSubstanceName: 'BX-115' });
    expect(r.narrative).not.toMatch(/No nonclinical issues preclude clinical development/);
    expect(r.narrative).not.toMatch(/All ICH M3\(R2\) recommended studies have been completed/);
    expect(r.narrative).toMatch(/is the sponsor's toxicology judgment and is not drawn automatically/);
    expect(r.gaps).toEqual(['nonclinical safety conclusion (sponsor toxicology judgment; not drawn automatically)']);
    expect(r.completeness).toBe(100); // every category it checks has a study
    // Safety pharmacology and genotoxicity say what was recorded, not which endpoints or battery.
    expect(r.narrative).not.toMatch(/cardiovascular, respiratory, and CNS endpoints assessed/);
    expect(r.narrative).toContain('SP-1: hERG IC50 3 µM');
    expect(r.narrative).not.toMatch(/assay\(s\) completed/);
    expect(r.narrative).toContain('GT-1: Ames positive');
  });
});

describe('2.5 states efficacy only from a recorded primary-endpoint outcome', () => {
  it('a Phase 3 CSR with no recorded outcome is not "efficacy demonstrated"', () => {
    const r = buildM25ClinicalOverview({ csrs: [phase1, phase3], indication: 'NSCLC', investigationalProduct: 'X' });
    expect(r.narrative).not.toMatch(/Efficacy was demonstrated/);
    expect(r.narrative).toMatch(/X-301 \(Phase 3, n=300\): ORR — Primary endpoint not met \(p=0\.41\)\. Primary endpoint outcome: not recorded\./);
    expect(r.gaps).toContain('primary endpoint outcome not recorded for 1 of 1 pivotal study/ies');
    expect(r.narrative).toMatch(/Efficacy is not established from the record/);
    expect(r.gaps).not.toContain('benefit-risk conclusion (sponsor medical/regulatory judgment; not drawn automatically)');
  });

  it('a recorded "met" outcome supports "efficacy was demonstrated"; a recorded "not met" does not', () => {
    const met = buildM25ClinicalOverview({ csrs: [{ ...phase3, primaryEndpointMet: true }], indication: 'NSCLC', investigationalProduct: 'X' });
    expect(met.narrative).toMatch(/Efficacy was demonstrated in 1 of 1 pivotal \(Phase 3\) study\/ies/);
    expect(met.narrative).toMatch(/Primary endpoint outcome: met\./);

    const notMet = buildM25ClinicalOverview({ csrs: [{ ...phase3, primaryEndpointMet: false }], indication: 'NSCLC', investigationalProduct: 'X' });
    expect(notMet.narrative).not.toMatch(/Efficacy was demonstrated/);
    expect(notMet.narrative).toMatch(/Primary endpoint outcome: not met\./);
    expect(notMet.narrative).toMatch(/benefit-risk balance cannot be concluded/);
  });

  it('2.5.2 and 2.5.3 say what is recorded instead of asserting conclusions', () => {
    const r = buildM25ClinicalOverview({ csrs: [phase1, { ...phase3, primaryEndpointMet: true }], indication: 'NSCLC', investigationalProduct: 'X' });
    expect(r.narrative).not.toMatch(/raise no issue affecting the benefit-risk assessment/);
    expect(r.narrative).not.toMatch(/characterizes pharmacokinetics, pharmacodynamics, and exposure-response/);
    expect(r.narrative).toMatch(/No biopharmaceutic data \(bioavailability, bioequivalence, dissolution\) are recorded/);
    expect(r.narrative).toContain('X-101 (single ascending dose): safety and PK — well tolerated');
    expect(r.narrative).not.toMatch(/subjects exposed to/);
  });

  it('completeness does not count 2.5.2 biopharmaceutics as always summarized', () => {
    const r = buildM25ClinicalOverview({
      csrs: [phase1, { ...phase3, primaryEndpointMet: true }],
      indication: 'NSCLC',
      investigationalProduct: 'X',
      developmentRationale: 'Unmet need.',
    });
    expect(r.completeness).toBe(67); // 4 of 6: 2.5.2 has no recorded input, and 2.5.1 is caller text (3b Slice 1)
    expect(r.gaps).toContain('biopharmaceutics (2.5.2): no biopharmaceutic data recorded');
  });
});

describe('2.7 applies its stated filters to the data it integrates', () => {
  it('tabulates only rates of ≥5%, over every study with recorded rates, and names those studies', () => {
    const r = buildM27ClinicalSummary({
      csrs: [
        { ...phase3, topAEs: [{ pt: 'Nausea', rate: '3%' }] },
        { ...phase1, topAEs: [{ pt: 'Headache', rate: '12%' }, { pt: 'Rash', rate: '4.9%' }] },
        { ...phase1, studyId: 'S2', protocolNumber: 'X-201', phase: '2' },
      ],
      indication: 'NSCLC',
      investigationalProduct: 'X',
    });
    const table = aeTable(r);
    expect(table?.title).toBe('Adverse Events with Recorded Incidence ≥5% (X-301, X-101)');
    expect(table?.rows).toEqual([['Headache', '1', 'X-101: 12%']]);
    expect(r.narrative).not.toMatch(/across the integrated safety database/);
    expect(r.narrative).toContain('from the 2 study/ies whose adverse-event rates are recorded (X-301, X-101)');
    expect(r.narrative).toContain('No adverse-event rates are recorded for X-201; it is not included.');
    expect(r.gaps).toContain('adverse-event rates not recorded for 1 of 3 study/ies');
  });

  it('reads the AE data of every study, not only the first', () => {
    const r = buildM27ClinicalSummary({
      csrs: [phase3, { ...phase1, topAEs: [{ pt: 'Headache', rate: '24 (12.0%)' }] }],
      indication: 'NSCLC',
      investigationalProduct: 'X',
    });
    expect(r.narrative).not.toMatch(/AE data not yet integrated/);
    expect(aeTable(r)?.rows).toEqual([['Headache', '1', 'X-101: 24 (12.0%)']]);
  });

  it('does not compare a rate that is not one readable percentage, and says so', () => {
    const r = buildM27ClinicalSummary({
      csrs: [{ ...phase3, topAEs: [{ pt: 'Fatigue', rate: '0.12' }] }],
      indication: 'NSCLC',
      investigationalProduct: 'X',
    });
    expect(aeTable(r)).toBeUndefined();
    expect(r.narrative).toContain('were not compared with the 5% threshold: Fatigue (X-301: "0.12")');
    expect(r.gaps).toContain('1 adverse-event rate(s) not readable as a single percentage');
  });

  it('prints no boilerplate conclusions or cross-references no record holds', () => {
    const r = buildM27ClinicalSummary({ csrs: [phase1, phase3], indication: 'NSCLC', investigationalProduct: 'X' });
    expect(r.narrative).not.toMatch(/Key findings have been integrated into the proposed dosage form rationale/);
    expect(r.narrative).not.toMatch(/addresses pharmacokinetics, pharmacodynamics, and exposure-response relationships/);
    expect(r.narrative).not.toMatch(/Exposure-response analysis is provided in Module 5\.3\.5/);
    expect(r.narrative).not.toMatch(/narratives provided in Module 5\.3\.5/);
    expect(r.narrative).not.toMatch(/Causality assessments and impact on benefit-risk are discussed in Module 2\.5/);
    expect(r.narrative).not.toMatch(/subjects received X|subjects exposed/);
    expect(r.narrative).toMatch(/Primary endpoint \(ORR\): Primary endpoint not met \(p=0\.41\)\. Primary endpoint outcome: not recorded\./);
    expect(r.gaps).toContain('biopharmaceutic studies (2.7.1): no biopharmaceutic data recorded');
  });

  it('completeness counts each subsection once, from its own recorded inputs', () => {
    const r = buildM27ClinicalSummary({
      csrs: [{ ...phase3, primaryEndpointMet: true, topAEs: [{ pt: 'Nausea', rate: '8%' }] }],
      indication: 'NSCLC',
      investigationalProduct: 'X',
    });
    // 2.7.1 (no biopharmaceutic input) and 2.7.2 (no Phase 1 study) are open; 2.7.3 and 2.7.4 are recorded.
    expect(r.completeness).toBe(50);
  });
});
